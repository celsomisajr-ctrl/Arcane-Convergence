export const STEP = 1 / 60
export const LIMIT = 9
export type Point = { x: number; z: number }
/** One player's input for one tick. Slots follow the on-screen buttons. Skill slots 1–3 are
 *  placeholders until the PO assigns each mage's real skills: 1 = element beam (held),
 *  2 and 3 = locked. Blink is the battle-spell slot. */
export type Command = {
  move: Point
  aim: Point
  /** Skill 1 held: the element beam. */
  skill1: boolean
  /** Basic attack pressed (replaces the old bolt). */
  basic?: boolean
  /** Battle spell pressed: Blink. */
  blink?: boolean
  /** Skill 2 pressed: locked (placeholder, no effect). */
  skill2?: boolean
  /** Skill 3 pressed: locked (placeholder, no effect). */
  skill3?: boolean
  /** Ultimate pressed this tick. With a full ring it starts the Weave at `ultTarget`;
   *  pressed again during the channel it releases early. */
  ult?: boolean
  /** Ground point the Ultimate is aimed at (clamped to ULT_RANGE). Defaults to the enemy. */
  ultTarget?: Point
  /** Clash pulse on the bright bar. */
  pulse?: boolean
}
/** The Ultimate in progress: gather (interruptible windup), channel (waves into the target
 *  circle, steerable with the move stick) and release (the final burst). `t` counts seconds
 *  in the current phase. */
export type Weave = { phase: 'gather' | 'channel' | 'release'; t: number; target: Point; waves: number }
export type Mage = { p: Point; aim: Point; hp: number; mana: number; charge: number; stun: number; dash: number; cooldown: number; element: number; slow: number; quick: number; velocity: Point; spent: boolean; poison: number; burn: number; root: number; rootCd: number; ult: number; ulting: boolean; weave: Weave | null }
type Bolt = { p: Point; v: Point; owner: number; element: number; power: number; life: number; kind: 'basic' }
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
export const delta = (a: Point, b: Point) => ({ x: b.x - a.x, z: b.z - a.z })
export const length = (v: Point) => Math.hypot(v.x, v.z)
export function unit(v: Point): Point {
  const n = length(v)
  return n ? { x: v.x / n, z: v.z / n } : { x: 0, z: 0 }
}
const dot = (a: Point, b: Point) => a.x * b.x + a.z * b.z
// Each mage's colour fixes its element for the whole match.
/** Red mage. */
export const FIRE = 0
/** Yellow mage. */
export const GOLD = 1
/** Blue mage. */
export const FROST = 2
/** White mage. */
export const LIGHT = 3
/** Green mage. */
export const NATURE = 4
export const ELEMENT_COUNT = 5
/** Five-way wheel: each element beats two and loses to two.
 *  Fire > Gold, Light · Gold > Frost, Nature · Frost > Light, Fire · Light > Nature, Gold · Nature > Fire, Frost */
export function beats(a: number, b: number) {
  const d = ((b-a)%ELEMENT_COUNT+ELEMENT_COUNT)%ELEMENT_COUNT
  return d === 1 || d === 3
}
/** Ultimate mana drain per second, by element. */
const CHANNEL_COST = [23,17,15,20,16]
/** Live-beam damage per second before the charge bonus, by element. Frost's Ultimate is a shield. */
const BEAM_DPS = [10,4,0,7,3]
export const POISON_TIME = 2.5
export const POISON_DPS = 3
export const ROOT_TIME = .6
export const ROOT_COOLDOWN = 3
// Ultimate ("the Weave"): its own ring, full before it can start. Aim a circle, gather the
// threads (interruptible), then channel waves of threads into the circle and release a burst.
export const ULT_MAX = 100
/** Ring refill per second on its own (a full ring in 30 s). */
export const ULT_REGEN = ULT_MAX/30
/** Extra ring per point of damage dealt and taken, so fighting earns the Ultimate sooner. */
export const ULT_FROM_DEALT = .5
export const ULT_FROM_TAKEN = .3
/** How far from the caster the Weave's circle can be placed. */
export const ULT_RANGE = 9
/** Radius of the Weave's target circle. */
export const WEAVE_RADIUS = 3
/** Windup while the threads gather. A hit in this phase interrupts and refunds half the ring. */
export const GATHER_TIME = .7
/** Longest channel; the ring drains over this time. */
export const WEAVE_TIME = 3
export const WAVE_EVERY = .25
/** Damage per wave to a mage inside the circle, by element (Fire, Gold, Frost, Light, Nature). */
export const WAVE_DAMAGE = [2.8,2.2,2.2,2.4,2.2]
/** The release burst inside the circle, by element. */
export const RELEASE_DAMAGE = [22,20,16,18,18]
/** Stun from the release (a knock-up); Frost's freeze lasts longer. */
export const RELEASE_STUN = [.45,.45,.85,.45,.45]
/** How long the release burst plays before the caster is free. */
export const RELEASE_TIME = .45
/** How fast the move stick steers the circle during the channel (m/s). */
export const STEER_SPEED = 3.4
export const BURN_TIME = 2
export const BURN_DPS = 3.5
export const insideWeave = (w: Weave, p: Point) => length(delta(w.target,p)) <= WEAVE_RADIUS
function placeWeave(m: Mage, want: Point): Point {
  const off = delta(m.p,want)
  const d = length(off)
  const k = d > ULT_RANGE ? ULT_RANGE/d : 1
  return { x:clamp(m.p.x+off.x*k,-LIMIT,LIMIT), z:clamp(m.p.z+off.z*k,-LIMIT,LIMIT) }
}
/** One wave of threads lashing into the circle. Element payloads ride on top. */
function wave(s: Duel, i: number) {
  const m = s.mages[i]
  const target = s.mages[1-i]
  m.weave!.waves++
  if (target.dash || !insideWeave(m.weave!,target.p)) return
  target.hp = Math.max(0,target.hp-WAVE_DAMAGE[m.element])
  s.impact = Math.max(s.impact,.05)
  if (m.element === FIRE) target.burn = BURN_TIME
  if (m.element === GOLD) { target.slow = .4; target.mana = Math.max(0,target.mana-4) }
  if (m.element === FROST) target.slow = .3
  if (m.element === LIGHT) m.hp = Math.min(100,m.hp+1.2) // Soul Drain
  if (m.element === NATURE) target.root = Math.max(target.root,.3)
}
/** The final converging burst. */
function release(s: Duel, i: number) {
  const m = s.mages[i]
  const target = s.mages[1-i]
  s.impact = Math.max(s.impact,.45)
  if (target.dash || !insideWeave(m.weave!,target.p)) return
  target.hp = Math.max(0,target.hp-RELEASE_DAMAGE[m.element])
  target.stun = Math.max(target.stun,RELEASE_STUN[m.element])
  target.charge = 0
  if (target.weave?.phase === 'gather') endWeave(target,true)
  if (m.element === FIRE) target.burn = BURN_TIME
  if (m.element === NATURE) target.root = Math.max(target.root,1)
}
function endWeave(m: Mage, interrupted = false) {
  if (interrupted && m.weave?.phase === 'gather') m.ult = ULT_MAX*.5
  else if (m.weave) m.ult = 0
  m.weave = null
  m.ulting = false
}
const validElement = (e: number) => Number.isInteger(e) && e >= 0 && e < ELEMENT_COUNT ? e : FIRE
function mage(z: number, element: number): Mage {
  return { p: {x:0,z}, aim: {x:0,z:-Math.sign(z)}, hp:100, mana:100, charge:0, stun:0, dash:0, cooldown:0, element:validElement(element), slow:0, quick:0, velocity:{x:0,z:0}, spent:false, poison:0, burn:0, root:0, rootCd:0, ult:0, ulting:false, weave:null }
}
/** A fresh round. `elements` are the two players' mage elements (player 0 starts at z = 5). */
export function round(elements: readonly [number, number] = [FIRE, FIRE]) {
  return { mages: [mage(5,elements[0]), mage(-5,elements[1])], bolts: [] as Bolt[], clash: null as null | { position: number; age: number; attempts: number[] }, time:0, impact:0 }
}
export type Duel = ReturnType<typeof round>
export const pulsePhase = (age: number) => age % .85 / .85
function shift(m: Mage, v: Point, distance: number) {
  m.p.x = clamp(m.p.x + v.x * distance, -LIMIT, LIMIT)
  m.p.z = clamp(m.p.z + v.z * distance, -LIMIT, LIMIT)
}
function fire(s: Duel, i: number, power: number) {
  const m = s.mages[i]
  s.bolts.push({ p:{...m.p}, v:{...m.aim}, owner:i, element:m.element, power, life:1, kind:'basic' })
}
/** Mana needed to begin a channel. A channel already running drains until empty. */
export const CHANNEL_MIN_MANA = 12
/** Charge at which the beam is live (visible, damaging, able to clash). */
export const BEAM_ACTIVE = .28
/** Max aim turn speed while the beam is live (rad/s), so a strafing target can slip out. */
export const CHANNEL_TURN_RATE = .3
/** Mana drain multiplier during a clash, so the tug-of-war decides more clashes than mana does. */
export const CLASH_DRAIN = .5
/** Half-width of the strip a beam hits: beam radius plus a mage's body. */
export const BEAM_REACH = .75
/** True when mage `m`'s aim line passes through `other` (within beam width, in front, in range). */
export function beamReaches(m: Mage, other: Mage) {
  const off = delta(m.p,other.p)
  const ahead = dot(off,m.aim)
  return ahead > 0 && ahead < 18 && Math.abs(m.aim.x*off.z-m.aim.z*off.x) < BEAM_REACH
}
function turnToward(from: Point, to: Point, maxAngle: number): Point {
  const a = Math.atan2(from.x,from.z)
  let d = Math.atan2(to.x,to.z)-a
  d = Math.atan2(Math.sin(d),Math.cos(d))
  const r = a+clamp(d,-maxAngle,maxAngle)
  return { x:Math.sin(r), z:Math.cos(r) }
}
function loseClash(s: Duel, loserIndex: number) {
  const [a,b] = s.mages
  const loser = s.mages[loserIndex]
  loser.hp = Math.max(0,loser.hp-34)
  loser.stun = .7
  shift(loser,unit(delta(a.p,b.p)),loserIndex === 1 ? 2.5 : -2.5)
  a.charge = b.charge = 0
  a.quick = b.quick = .35
  s.clash = null
  s.impact = .45
}
export function step(s: Duel, commands: readonly Command[]) {
  if (s.mages.some(m => m.hp <= 0)) return
  s.time += STEP
  s.impact = Math.max(0, s.impact - STEP)
  const hpBefore = s.mages.map(m => m.hp)
  for (const [i,m] of s.mages.entries()) {
    const c = commands[i]
    m.stun = Math.max(0,m.stun-STEP)
    m.dash = Math.max(0,m.dash-STEP)
    m.cooldown = Math.max(0,m.cooldown-STEP)
    m.slow = Math.max(0,m.slow-STEP)
    m.quick = Math.max(0,m.quick-STEP)
    m.root = Math.max(0,m.root-STEP)
    m.rootCd = Math.max(0,m.rootCd-STEP)
    if (m.poison > 0) {
      m.poison = Math.max(0,m.poison-STEP)
      m.hp = Math.max(0,m.hp-POISON_DPS*STEP)
    }
    if (m.burn > 0) {
      m.burn = Math.max(0,m.burn-STEP)
      m.hp = Math.max(0,m.hp-BURN_DPS*STEP)
    }
    if (length(c.aim) > 0 && !s.clash) {
      m.aim = m.charge > BEAM_ACTIVE ? turnToward(m.aim,unit(c.aim),CHANNEL_TURN_RATE*STEP) : unit(c.aim)
    }
    if (!c.skill1) m.spent = false
    if (!m.ulting) m.ult = Math.min(ULT_MAX,m.ult+ULT_REGEN*STEP)
    if (m.stun) {
      if (m.weave) endWeave(m,true)
      continue
    }
    const movement = length(c.move) > 1 ? unit(c.move) : c.move
    if (c.blink && !m.cooldown && !m.ulting) {
      m.dash = .18
      m.cooldown = 1.25
      m.velocity = length(movement) > .1 ? unit(movement) : m.aim
      m.charge = 0
    }
    if (m.dash) {
      shift(m,m.velocity,15*STEP)
      continue
    }
    // Ultimate: a full ring starts the Weave at the aimed point; the caster is rooted until it ends.
    if (!m.weave && c.ult && m.ult >= ULT_MAX && !s.clash) {
      m.weave = { phase:'gather', t:0, target:placeWeave(m,c.ultTarget ?? s.mages[1-i].p), waves:0 }
      m.ulting = true
      m.charge = 0
    }
    if (m.weave) {
      const w = m.weave
      w.t += STEP
      if (w.phase === 'gather' && w.t >= GATHER_TIME) {
        w.phase = 'channel'
        w.t = 0
      } else if (w.phase === 'channel') {
        m.ult = Math.max(0,m.ult-ULT_MAX/WEAVE_TIME*STEP)
        w.target = placeWeave(m,{ x:w.target.x+movement.x*STEER_SPEED*STEP, z:w.target.z+movement.z*STEER_SPEED*STEP })
        if (w.t >= WAVE_EVERY*(w.waves+1)) wave(s,i)
        if (!m.ult || (c.ult && w.t > .2)) {
          w.phase = 'release'
          w.t = 0
          release(s,i)
        }
      } else if (w.phase === 'release' && w.t >= RELEASE_TIME) endWeave(m)
      continue // rooted and committed while casting
    }
    if (!s.clash && !m.root) shift(m,movement,STEP*(c.skill1 ? 1.2 : 5)*(m.slow ? .42 : 1))
    if (c.basic && !m.quick && !s.clash) {
      // Basic attack: no mana cost, short cooldown, still breaks a channel it hits.
      m.charge = 0
      m.quick = .55
      fire(s,i,9)
    } else if (c.skill1 && !m.quick && (m.charge > 0 || (m.mana >= CHANNEL_MIN_MANA && !m.spent))) {
      m.charge = Math.min(1.6,m.charge+STEP)
      m.mana = Math.max(0,m.mana-STEP*CHANNEL_COST[m.element]*(s.clash ? CLASH_DRAIN : 1))
      if (!m.mana) {
        // Running dry mid-clash loses it; the exhaustion stun below still applies.
        if (s.clash) loseClash(s,i)
        m.charge = 0
        m.stun = .9
        m.spent = true // must release the button before channeling again
      }
    } else {
      if (m.charge > .12 && !s.clash) fire(s,i,4+8*m.charge)
      m.charge = 0
      m.mana = Math.min(100,m.mana+18*STEP)
    }
  }
  const [a,b] = s.mages
  const axis = unit(delta(a.p,b.p))
  const distance = length(delta(a.p,b.p))
  if (distance < 1 && distance > 0) {
    shift(a,axis,-(1-distance)/2)
    shift(b,axis,(1-distance)/2)
  }
  const engaged = s.mages.map((m,i) => m.charge > BEAM_ACTIVE && beamReaches(m,s.mages[1-i]))
  if (engaged.every(Boolean)) {
    const clash = s.clash ??= {position:.5,age:0,attempts:[-1,-1]}
    clash.age += STEP
    const edge = beats(a.element,b.element) ? 1 : beats(b.element,a.element) ? -1 : 0
    const force = (a.charge-b.charge)*.16 + edge*.105
    const phase = pulsePhase(clash.age)
    const beat = phase > .42 && phase < .67
    // Each side can score once per beat. Repeated input is ignored after the first attempt.
    const beatIndex = Math.floor(clash.age/.85)
    const attempts = clash.attempts
    clash.position += force*STEP
    commands.forEach((c,i) => {
      if (!c.pulse || attempts[i] === beatIndex) return
      attempts[i] = beatIndex
      clash.position += (beat ? .19 : -.035)*(i === 0 ? 1 : -1)
    })
    if (clash.position >= 1 || clash.position <= 0) loseClash(s,clash.position >= 1 ? 1 : 0)
  } else {
    s.clash = null
    s.mages.forEach((m,i) => {
      const target = s.mages[1-i]
      if (!engaged[i] || target.dash || m.element === FROST) return
      // A charging Frost mage's shield cuts beam damage, except Light, which pierces it.
      const shield = target.charge && target.element === FROST && m.element !== LIGHT ? .25 : 1
      target.hp = Math.max(0,target.hp-STEP*BEAM_DPS[m.element]*(1+m.charge)*shield)
      if (m.element === GOLD) {
        target.slow = .18
        target.mana = Math.max(0,target.mana-9*STEP)
      }
      if (m.element === NATURE) {
        target.poison = POISON_TIME
        if (!target.rootCd) {
          target.root = ROOT_TIME
          target.rootCd = ROOT_COOLDOWN
        }
      }
    })
  }
  s.bolts = s.bolts.filter(bolt => {
    const target = s.mages[1-bolt.owner]
    const offset = delta(bolt.p,target.p)
    const travel = 24*STEP
    const along = clamp(dot(offset,bolt.v),0,travel)
    if (!target.dash && Math.hypot(offset.x-bolt.v.x*along,offset.z-bolt.v.z*along) < .65) {
      if (target.charge > .28 && target.element === FROST && dot(target.aim,bolt.v) < -.65 && bolt.life < 1) {
        bolt.owner = 1-bolt.owner
        bolt.v = {...target.aim}
        bolt.p = {...target.p}
        bolt.life = 1
        return true
      }
      target.hp = Math.max(0,target.hp-bolt.power)
      target.charge = 0
      // A hit interrupts a gathering Weave; once the channel runs, the caster is committed.
      if (!target.weave || target.weave.phase === 'gather') target.stun = .24
      if (bolt.element === GOLD) target.slow = .75
      if (bolt.element === NATURE) target.poison = POISON_TIME
      s.impact = .16
      s.clash = null
      return false
    }
    bolt.p.x += bolt.v.x*travel
    bolt.p.z += bolt.v.z*travel
    bolt.life -= STEP
    return bolt.life > 0 && Math.abs(bolt.p.x) < LIMIT+1 && Math.abs(bolt.p.z) < LIMIT+1
  })
  // Damage this tick feeds both Ultimate rings (not while a ring is being spent).
  s.mages.forEach((m,i) => {
    const taken = hpBefore[i]-m.hp
    if (taken <= 0) return
    const other = s.mages[1-i]
    if (!m.ulting) m.ult = Math.min(ULT_MAX,m.ult+taken*ULT_FROM_TAKEN)
    if (!other.ulting) other.ult = Math.min(ULT_MAX,other.ult+taken*ULT_FROM_DEALT)
  })
}
