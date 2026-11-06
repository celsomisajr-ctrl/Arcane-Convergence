export const STEP = 1 / 60
export const LIMIT = 9
export type Point = { x: number; z: number }
export type Command = { move: Point; aim: Point; hold: boolean; bolt?: boolean; dash?: boolean; pulse?: boolean; element?: number }
export type Mage = { p: Point; aim: Point; hp: number; mana: number; charge: number; stun: number; dash: number; cooldown: number; element: number; slow: number; quick: number; velocity: Point }
type Bolt = { p: Point; v: Point; owner: number; element: number; power: number; life: number }
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
export const delta = (a: Point, b: Point) => ({ x: b.x - a.x, z: b.z - a.z })
export const length = (v: Point) => Math.hypot(v.x, v.z)
export function unit(v: Point): Point {
  const n = length(v)
  return n ? { x: v.x / n, z: v.z / n } : { x: 0, z: 0 }
}
const dot = (a: Point, b: Point) => a.x * b.x + a.z * b.z
function mage(z: number): Mage {
  return { p: {x:0,z}, aim: {x:0,z:-Math.sign(z)}, hp:100, mana:100, charge:0, stun:0, dash:0, cooldown:0, element:0, slow:0, quick:0, velocity:{x:0,z:0} }
}
export function round() {
  return { mages: [mage(5), mage(-5)], bolts: [] as Bolt[], clash: null as null | { position: number; age: number; attempts: number[] }, time:0, impact:0 }
}
export type Duel = ReturnType<typeof round>
export const pulsePhase = (age: number) => age % .85 / .85
function shift(m: Mage, v: Point, distance: number) {
  m.p.x = clamp(m.p.x + v.x * distance, -LIMIT, LIMIT)
  m.p.z = clamp(m.p.z + v.z * distance, -LIMIT, LIMIT)
}
function fire(s: Duel, i: number, power: number) {
  const m = s.mages[i]
  s.bolts.push({ p:{...m.p}, v:{...m.aim}, owner:i, element:m.element, power, life:1 })
}
export function step(s: Duel, commands: readonly Command[]) {
  if (s.mages.some(m => m.hp <= 0)) return
  s.time += STEP
  s.impact = Math.max(0, s.impact - STEP)
  for (const [i,m] of s.mages.entries()) {
    const c = commands[i]
    m.stun = Math.max(0,m.stun-STEP)
    m.dash = Math.max(0,m.dash-STEP)
    m.cooldown = Math.max(0,m.cooldown-STEP)
    m.slow = Math.max(0,m.slow-STEP)
    m.quick = Math.max(0,m.quick-STEP)
    if (length(c.aim) > 0 && !s.clash) m.aim = unit(c.aim)
    if (c.element !== undefined && c.element >= 0 && c.element < 3 && !m.charge) m.element = c.element
    if (m.stun) continue
    const movement = length(c.move) > 1 ? unit(c.move) : c.move
    if (c.dash && !m.cooldown) {
      m.dash = .18
      m.cooldown = 1.25
      m.velocity = length(movement) > .1 ? unit(movement) : m.aim
      m.charge = 0
    }
    if (m.dash) {
      shift(m,m.velocity,15*STEP)
      continue
    }
    if (!s.clash) shift(m,movement,STEP*(c.hold ? 1.2 : 5)*(m.slow ? .42 : 1))
    if (c.bolt && !m.quick && m.mana >= 10 && !s.clash) {
      m.charge = 0
      m.mana -= 10
      m.quick = .55
      fire(s,i,9)
    } else if (c.hold && !m.quick) {
      m.charge = Math.min(1.6,m.charge+STEP)
      m.mana = Math.max(0,m.mana-STEP*[23,17,15][m.element])
      if (!m.mana) {
        m.charge = 0
        m.stun = .9
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
  const aligned = [dot(a.aim,axis) > .985, dot(b.aim,axis) < -.985]
  const engaged = s.mages.map((m,i) => m.charge > .28 && distance < 18 && aligned[i])
  if (engaged.every(Boolean)) {
    const clash = s.clash ??= {position:.5,age:0,attempts:[-1,-1]}
    clash.age += STEP
    const advantage = (a.element-b.element+3)%3
    const force = (a.charge-b.charge)*.16 + (advantage === 2 ? .105 : advantage === 1 ? -.105 : 0)
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
    if (clash.position >= 1 || clash.position <= 0) {
      const loser = clash.position >= 1 ? b : a
      loser.hp = Math.max(0,loser.hp-34)
      loser.stun = .7
      shift(loser,axis,loser === b ? 2.5 : -2.5)
      a.charge = b.charge = 0
      a.quick = b.quick = .35
      s.clash = null
      s.impact = .45
    }
  } else {
    s.clash = null
    s.mages.forEach((m,i) => {
      const target = s.mages[1-i]
      if (!engaged[i] || target.dash || m.element === 2) return
      target.hp = Math.max(0,target.hp-STEP*(m.element === 0 ? 10 : 4)*(1+m.charge)*(target.charge && target.element === 2 ? .25 : 1))
      if (m.element === 1) {
        target.slow = .18
        target.mana = Math.max(0,target.mana-9*STEP)
      }
    })
  }
  s.bolts = s.bolts.filter(bolt => {
    const target = s.mages[1-bolt.owner]
    const offset = delta(bolt.p,target.p)
    const travel = 24*STEP
    const along = clamp(dot(offset,bolt.v),0,travel)
    if (!target.dash && Math.hypot(offset.x-bolt.v.x*along,offset.z-bolt.v.z*along) < .65) {
      if (target.charge > .28 && target.element === 2 && dot(target.aim,bolt.v) < -.65 && bolt.life < 1) {
        bolt.owner = 1-bolt.owner
        bolt.v = {...target.aim}
        bolt.p = {...target.p}
        bolt.life = 1
        return true
      }
      target.hp = Math.max(0,target.hp-bolt.power)
      target.charge = 0
      target.stun = .24
      if (bolt.element === 1) target.slow = .75
      s.impact = .16
      s.clash = null
      return false
    }
    bolt.p.x += bolt.v.x*travel
    bolt.p.z += bolt.v.z*travel
    bolt.life -= STEP
    return bolt.life > 0 && Math.abs(bolt.p.x) < LIMIT+1 && Math.abs(bolt.p.z) < LIMIT+1
  })
}
