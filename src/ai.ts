import { CHANNEL_MIN_MANA, delta, length, pulsePhase, unit, type Command, type Duel } from './sim'

/** Chance per beat that the rival pulses inside the bright band: Apprentice, Adept, Archmage. */
export const PULSE_ACCURACY = [.45,.7,.88]

/** Deterministic 0..1 hash, so AI "misses" are reproducible without Math.random. */
function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9,0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x,0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0)/4294967296
}

export function decide(s: Duel, difficulty: number): Command {
  const [player, ai] = s.mages
  const aim = unit(delta(ai.p,player.p))
  const distance = length(delta(ai.p,player.p))
  const cycle = s.time % (5.2 - difficulty*.5)
  const wantsToChannel = cycle > 1.25 || player.charge > .55 - difficulty*.17
  // Hysteresis: start only with a healthy pool, keep going until nearly dry, never abandon a clash.
  const hold = s.clash !== null ? true
    : ai.charge > 0 ? ai.mana > CHANNEL_MIN_MANA && wantsToChannel
    : ai.mana > 45 && wantsToChannel
  const side = Math.sin(s.time*1.3) > 0 ? 1 : -1
  const stride = ai.mana < 26 || distance < 4 ? -.8 : distance > 10 ? .8 : 0
  const phase = s.clash ? pulsePhase(s.clash.age) : 0
  const beatIndex = s.clash ? Math.floor(s.clash.age/.85) : 0
  const onBeat = hash(beatIndex*31+difficulty) < (PULSE_ACCURACY[difficulty] ?? PULSE_ACCURACY[1])
  const pulseAt = onBeat ? .6-difficulty*.06 : .73
  return {
    aim, hold, move:{x:aim.x*stride+aim.z*side*.65,z:aim.z*stride-aim.x*side*.65},
    pulse:phase >= pulseAt && phase < pulseAt+.035,
    bolt:!hold && cycle > .8 && cycle < .84,
    dash:difficulty > 0 && s.bolts.some(b => b.owner === 0 && length(delta(b.p,ai.p)) < 2.1),
    element: Math.floor(s.time/8)%3,
  }
}
