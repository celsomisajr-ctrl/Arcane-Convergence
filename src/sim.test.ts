import { describe, expect, it } from 'vitest'
import { beats, delta, ELEMENT_COUNT, FIRE, FROST, GOLD, LIGHT, NATURE, POISON_DPS, pulsePhase, round, step, STEP, unit, type Command, type Duel } from './sim'
import { decide } from './ai'

const still = (aim = { x:0, z:0 }): Command => ({ move:{x:0,z:0}, aim, skill1:false })
const at = (s: Duel, i: number) => unit(delta(s.mages[i].p,s.mages[1-i].p))
const seconds = (n: number) => Math.round(n/STEP)

describe('exhaustion', () => {
  it('stuns once, not repeatedly, when channel is held at empty mana', () => {
    const s = round()
    s.mages[1].p = { x:8, z:-5 } // out of the beam
    let stuns = 0
    let prev = 0
    for (let i = 0; i < seconds(10); i++) {
      step(s,[{ ...still({x:1,z:0}), skill1:true }, still()])
      if (s.mages[0].stun > prev+.5) stuns++
      prev = s.mages[0].stun
    }
    expect(stuns).toBe(1) // was 7 before the fix
  })
})

describe('rival AI', () => {
  it('does not flicker its channel at low mana', () => {
    const s = round()
    let toggles = 0
    let last = false
    for (let i = 0; i < seconds(20); i++) {
      const c = decide(s,1)
      if (c.skill1 !== last) toggles++
      last = c.skill1
      step(s,[still(),c])
      s.mages[0].hp = 100
    }
    expect(toggles).toBeLessThan(30) // was 422
  })
})

function clash(difficulty: number, pulsing = true) {
  const s = round()
  s.mages[1].element = 0
  for (let i = 0; i < seconds(30); i++) {
    const ai = { ...decide(s,difficulty), skill1:true }
    const pulse = pulsing && s.clash !== null && pulsePhase(s.clash.age) > .5 && pulsePhase(s.clash.age) < .52
    const hp = [s.mages[0].hp,s.mages[1].hp]
    step(s,[{ ...still(at(s,0)), skill1:true, pulse }, ai])
    if (s.mages[1].hp <= hp[1]-30) return 'player'
    if (s.mages[0].hp <= hp[0]-30) return 'ai'
  }
  return 'none'
}

describe('beam clash', () => {
  it('a perfect-pulse player can win an even clash on Adept', () => {
    expect(clash(1)).toBe('player')
  })
  it('a player who never pulses loses to Adept', () => {
    expect(clash(1,false)).toBe('ai')
  })
  it('running out of mana mid-clash loses it', () => {
    const s = round()
    s.mages[0].mana = 20 // the player will run dry first
    let resolved = ''
    for (let i = 0; i < seconds(10) && !resolved; i++) {
      const hp = s.mages[0].hp
      step(s,[{ ...still(at(s,0)), skill1:true }, { ...still(at(s,1)), skill1:true }])
      if (s.mages[0].hp <= hp-30) resolved = 'player lost'
    }
    expect(resolved).toBe('player lost')
  })
})

describe('channel commitment', () => {
  it('a strafing target can slip out of a locked-on beam', () => {
    const s = round()
    for (let i = 0; i < seconds(2); i++) {
      step(s,[{ move:{x:1,z:0}, aim:{x:0,z:-1}, skill1:false }, { ...still(at(s,1)), skill1:true }])
    }
    expect(s.mages[0].hp).toBeGreaterThan(80) // was 63.7
  })
})

describe('determinism', () => {
  it('same commands give the same state', () => {
    const run = () => {
      const s = round()
      for (let i = 0; i < seconds(20); i++) {
        const t = i*STEP
        step(s,[{ move:{x:Math.cos(t),z:Math.sin(t*.7)}, aim:at(s,0), skill1:i%150 < 90, pulse:i%51 === 0, basic:i%97 === 0 }, decide(s,2)])
      }
      return JSON.stringify(s)
    }
    expect(run()).toBe(run())
  })
})

function idleKo(difficulty: number) {
  const s = round()
  let t = 0
  while (s.mages[0].hp > 0 && t < 60) {
    step(s,[still(at(s,0)), decide(s,difficulty)])
    t += STEP
  }
  return t
}

describe('difficulty scaling', () => {
  it('an idle player survives longer on easier difficulties', () => {
    const [app, adept, arch] = [0,1,2].map(idleKo)
    expect(app).toBeGreaterThanOrEqual(12)
    expect(adept).toBeGreaterThan(7)
    expect(adept).toBeLessThan(10)
    expect(arch).toBeLessThanOrEqual(6.5)
  })
})

describe('rival interrupts', () => {
  it.each([[0,.7],[1,.45],[2,.25]])('difficulty %i bolts a live beam within its reaction delay', (d, delay) => {
    const s = round()
    s.time = 1 // a quiet part of the rival's attack cycle
    s.mages[1].mana = 30 // enough to bolt, too little to start its own channel
    let liveAt = -1
    let boltAt = -1
    for (let i = 0; i < seconds(3) && boltAt < 0; i++) {
      step(s,[{ ...still(at(s,0)), skill1:true }, decide(s,d)])
      if (liveAt < 0 && s.mages[0].charge > .28) liveAt = i*STEP
      if (s.bolts.some(b => b.owner === 1)) boltAt = i*STEP
    }
    expect(liveAt).toBeGreaterThan(0)
    expect(boltAt-liveAt).toBeGreaterThanOrEqual(delay-STEP*2)
    expect(boltAt-liveAt).toBeLessThanOrEqual(delay+.2)
  })
})

describe('five mages', () => {
  it('each element beats exactly two and loses to exactly two', () => {
    for (let a = 0; a < ELEMENT_COUNT; a++) {
      let wins = 0
      let losses = 0
      for (let b = 0; b < ELEMENT_COUNT; b++) {
        if (beats(a,b)) wins++
        if (beats(b,a)) losses++
        expect(beats(a,b) && beats(b,a)).toBe(false)
      }
      expect([wins,losses]).toEqual([2,2])
    }
  })
  it('keeps the original triangle: Fire > Gold > Frost > Fire', () => {
    expect(beats(FIRE,GOLD)).toBe(true)
    expect(beats(GOLD,FROST)).toBe(true)
    expect(beats(FROST,FIRE)).toBe(true)
  })
  it('the element advantage pushes a clash toward the weaker element', () => {
    const s = round([NATURE,FIRE]) // Nature beats Fire
    for (let i = 0; i < seconds(2); i++) step(s,[{ ...still(at(s,0)), skill1:true }, { ...still(at(s,1)), skill1:true }])
    expect(s.clash).not.toBeNull()
    expect(s.clash!.position).toBeGreaterThan(.5) // pushed toward the Fire mage
  })
  it("a mage's element is fixed for the round", () => {
    const s = round([LIGHT,NATURE])
    for (let i = 0; i < 30; i++) step(s,[{ ...still(), element:FIRE } as Command, still()])
    expect(s.mages.map(m => m.element)).toEqual([LIGHT,NATURE])
  })
  it('round() falls back to Fire for an invalid element', () => {
    expect(round([7,-1]).mages.map(m => m.element)).toEqual([FIRE,FIRE])
  })
})

function beamFor(elements: [number,number], ticks: number, targetShield = false) {
  const s = round(elements)
  s.mages[0].p.x = 3 // the target stays out of the way of its own shield clash
  for (let i = 0; i < ticks; i++) {
    const shielding = targetShield ? { ...still({x:-1,z:0}), skill1:true } : still()
    step(s,[shielding, { ...still(at(s,1)), skill1:true }])
    s.mages[0].mana = 100
  }
  return s
}

describe('Light and Nature', () => {
  it('Light pierces a Frost shield; Fire does not', () => {
    const light = beamFor([FROST,LIGHT],seconds(1.5),true)
    const fire = beamFor([FROST,FIRE],seconds(1.5),true)
    // Light's beam is weaker than Fire's, yet it does more damage through the shield.
    expect(100-light.mages[0].hp).toBeGreaterThan(100-fire.mages[0].hp)
  })
  it('Nature poison keeps hurting after the beam stops', () => {
    const s = beamFor([FIRE,NATURE],seconds(1))
    expect(s.mages[0].poison).toBeGreaterThan(0)
    // Letting go fires the release burst; wait for it to land before measuring poison alone.
    for (let i = 0; i < seconds(.6); i++) step(s,[still(), still()])
    expect(s.bolts.length).toBe(0)
    const hp = s.mages[0].hp
    for (let i = 0; i < seconds(1); i++) step(s,[still(), still()])
    expect(hp-s.mages[0].hp).toBeCloseTo(POISON_DPS,0)
  })
  it('Nature roots once, then not again until the cooldown ends', () => {
    const s = round([FIRE,NATURE])
    let roots = 0
    let wasRooted = false
    for (let i = 0; i < seconds(2.5); i++) {
      step(s,[still(), { ...still(at(s,1)), skill1:true }])
      s.mages[1].mana = 100
      if (s.mages[0].root > 0 && !wasRooted) roots++
      wasRooted = s.mages[0].root > 0
    }
    expect(roots).toBe(1)
  })
})

describe('Basic attack and Ultimate ring', () => {
  it('basic attack costs no mana', () => {
    const s = round()
    s.mages[0].mana = 0
    step(s,[{ ...still(at(s,0)), basic:true }, still()])
    expect(s.bolts.filter(b => b.owner === 0 && b.kind === 'basic').length).toBe(1)
  })
  it('the Ultimate cannot start until the ring is full', () => {
    const s = round()
    s.mages[0].ult = 99
    step(s,[{ ...still(at(s,0)), ult:true }, still()])
    expect(s.mages[0].ulting).toBe(false)
  })
  it('the ring fills on its own in about 30 s', () => {
    const s = round()
    for (let i = 0; i < seconds(29.5); i++) step(s,[still(), still()])
    expect(s.mages[0].ult).toBeLessThan(100)
    for (let i = 0; i < seconds(1); i++) step(s,[still(), still()])
    expect(s.mages[0].ult).toBe(100)
  })
  it('holding a full Ultimate drains the ring and rains shots that hurt without stunning', () => {
    const s = round()
    s.mages[0].ult = 100
    s.mages[1].ult = 0
    let shots = 0
    let stunned = false
    for (let i = 0; i < seconds(3); i++) {
      step(s,[{ ...still(at(s,0)), ult:true }, still()])
      shots = Math.max(shots,s.bolts.filter(b => b.kind === 'volley').length)
      if (s.mages[1].stun > 0) stunned = true
    }
    expect(s.mages[0].ulting).toBe(false) // spent after ~2.5 s
    expect(s.mages[0].ult).toBeLessThan(10)
    expect(s.mages[1].hp).toBeLessThan(80)
    expect(stunned).toBe(false)
    expect(shots).toBeGreaterThan(0)
  })
  it('releasing early stops the Ultimate, and it needs a full ring again', () => {
    const s = round()
    s.mages[0].ult = 100
    for (let i = 0; i < seconds(.5); i++) step(s,[{ ...still(at(s,0)), ult:true }, still()])
    step(s,[still(), still()])
    expect(s.mages[0].ulting).toBe(false)
    const left = s.mages[0].ult
    expect(left).toBeGreaterThan(0)
    step(s,[{ ...still(at(s,0)), ult:true }, still()])
    expect(s.mages[0].ulting).toBe(false)
  })
  it('dealing and taking damage fills both rings faster', () => {
    const s = round()
    s.mages[0].ult = s.mages[1].ult = 0
    step(s,[{ ...still(at(s,0)), basic:true }, still()])
    for (let i = 0; i < seconds(1); i++) step(s,[still(), still()])
    const byTime = 100/30
    expect(s.mages[0].ult).toBeGreaterThan(byTime+2) // dealt 9: +4.5
    expect(s.mages[1].ult).toBeGreaterThan(byTime+2) // took 9: +2.7
  })
})
