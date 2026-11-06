import { BEAM_ACTIVE, CHANNEL_MIN_MANA, ULT_MAX, ULT_RANGE, WEAVE_RADIUS, delta, length, pulsePhase, unit, type Command, type Duel } from './sim'

// Per-difficulty tuning: [Apprentice, Adept, Archmage].
/** Chance per beat that the rival pulses inside the bright band. */
export const PULSE_ACCURACY = [.45,.7,.88]
/** Share of each attack cycle the rival spends wanting to channel. */
export const CHANNEL_SHARE = [.22,.45,.75]
/** Seconds after the player's beam goes live before the rival bolts to interrupt it. */
export const REACTION = [.7,.45,.25]

/** Deterministic 0..1 hash, so AI "choices" are reproducible without Math.random. */
function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9,0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x,0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0)/4294967296
}


export function decide(s: Duel, difficulty: number): Command {
  const d = difficulty in REACTION ? difficulty : 1
  const [player, ai] = s.mages
  const aim = unit(delta(ai.p,player.p))
  const distance = length(delta(ai.p,player.p))
  const period = 5.2 - d*.5
  const cycle = s.time % period
  const ready = !ai.quick && !ai.stun && !s.clash

  // Punish a live player beam with a basic attack after a human-ish reaction delay.
  const interrupt = ready && player.charge > BEAM_ACTIVE+REACTION[d]

  const wantsToChannel = cycle > period*(1-CHANNEL_SHARE[d])
  // Hysteresis: start only with a healthy pool, keep going until nearly dry, never abandon a clash.
  const hold = !interrupt && (s.clash !== null ? true
    : ai.charge > 0 ? ai.mana > CHANNEL_MIN_MANA && wantsToChannel
    : ai.mana > 45 && wantsToChannel)
  // An occasional poke while idle with mana to spare.
  const poke = ready && !hold && ai.mana > 60 && cycle > .8 && cycle < .84

  const side = Math.sin(s.time*1.3) > 0 ? 1 : -1
  const stride = ai.mana < 26 || distance < 4 ? -.8 : distance > 10 ? .8 : 0
  const phase = s.clash ? pulsePhase(s.clash.age) : 0
  const beatIndex = s.clash ? Math.floor(s.clash.age/.85) : 0
  const onBeat = hash(beatIndex*31+d) < PULSE_ACCURACY[d]
  const pulseAt = onBeat ? .6-d*.06 : .73
  // Ultimate: cast the Weave on the player when the ring is full and they're in range, then
  // steer the circle after them during the channel.
  const ult = !ai.weave && ai.ult >= ULT_MAX && distance < ULT_RANGE+1 && !s.clash && !player.dash
  let move = {x:aim.x*stride+aim.z*side*.65,z:aim.z*stride-aim.x*side*.65}
  if (ai.weave?.phase === 'channel') move = unit(delta(ai.weave.target,player.p))
  // Step out of the player's Weave circle (Apprentice is slow to notice).
  const threat = player.weave
  if (threat && threat.phase !== 'release' && length(delta(threat.target,ai.p)) < WEAVE_RADIUS+.6 && (d > 0 || threat.t > .5)) {
    move = unit(delta(threat.target,ai.p))
  }
  return {
    aim, skill1:hold && !ult && !ai.weave, ult, ultTarget:player.p, move,
    pulse:phase >= pulseAt && phase < pulseAt+.035,
    // Try to interrupt a gathering Weave after the usual reaction delay. Only a quick rival's
    // bolt lands before the gather completes.
    basic:interrupt || poke || (ready && d > 0 && player.weave?.phase === 'gather' && player.weave.t > REACTION[d] && distance < 12),
    blink:d > 0 && (s.bolts.some(b => b.owner === 0 && length(delta(b.p,ai.p)) < 2.1)
      || (threat?.phase === 'gather' && length(delta(threat.target,ai.p)) < WEAVE_RADIUS)),
  }
}
