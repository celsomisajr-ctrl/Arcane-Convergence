import { describe, expect, it } from 'vitest'
import { delta, pulsePhase, round, step, STEP, unit, type Command, type Duel } from './sim'
import { decide } from './ai'

const still = (aim = { x:0, z:0 }): Command => ({ move:{x:0,z:0}, aim, hold:false })
const at = (s: Duel, i: number) => unit(delta(s.mages[i].p,s.mages[1-i].p))
const seconds = (n: number) => Math.round(n/STEP)

describe('exhaustion', () => {
  it('stuns once, not repeatedly, when channel is held at empty mana', () => {
    const s = round()
    s.mages[1].p = { x:8, z:-5 } // out of the beam
    let stuns = 0
    let prev = 0
    for (let i = 0; i < seconds(10); i++) {
      step(s,[{ ...still({x:1,z:0}), hold:true }, still()])
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
      if (c.hold !== last) toggles++
      last = c.hold
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
    const ai = { ...decide(s,difficulty), hold:true, element:0 }
    const pulse = pulsing && s.clash !== null && pulsePhase(s.clash.age) > .5 && pulsePhase(s.clash.age) < .52
    const hp = [s.mages[0].hp,s.mages[1].hp]
    step(s,[{ ...still(at(s,0)), hold:true, pulse }, ai])
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
      step(s,[{ ...still(at(s,0)), hold:true }, { ...still(at(s,1)), hold:true }])
      if (s.mages[0].hp <= hp-30) resolved = 'player lost'
    }
    expect(resolved).toBe('player lost')
  })
})

describe('channel commitment', () => {
  it('a strafing target can slip out of a locked-on beam', () => {
    const s = round()
    for (let i = 0; i < seconds(2); i++) {
      step(s,[{ move:{x:1,z:0}, aim:{x:0,z:-1}, hold:false }, { ...still(at(s,1)), hold:true }])
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
        step(s,[{ move:{x:Math.cos(t),z:Math.sin(t*.7)}, aim:at(s,0), hold:i%150 < 90, pulse:i%51 === 0, bolt:i%97 === 0 }, decide(s,2)])
      }
      return JSON.stringify(s)
    }
    expect(run()).toBe(run())
  })
})
