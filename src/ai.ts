import { delta, length, pulsePhase, unit, type Command, type Duel } from './sim'

export function decide(s: Duel, difficulty: number): Command {
  const [player, ai] = s.mages
  const aim = unit(delta(ai.p,player.p))
  const distance = length(delta(ai.p,player.p))
  const cycle = s.time % (5.2 - difficulty*.5)
  const hold = ai.mana > 16 && (s.clash !== null || cycle > 1.25 || player.charge > .55 - difficulty*.17)
  const side = Math.sin(s.time*1.3) > 0 ? 1 : -1
  const stride = ai.mana < 26 || distance < 4 ? -.8 : distance > 10 ? .8 : 0
  const phase = s.clash ? pulsePhase(s.clash.age) : 0
  const pulseAt = difficulty === 0 && s.clash && Math.floor(s.clash.age/.85)%2 ? .73 : .6-difficulty*.06
  return {
    aim, hold, move:{x:aim.x*stride+aim.z*side*.65,z:aim.z*stride-aim.x*side*.65},
    pulse:phase >= pulseAt && phase < pulseAt+.035,
    bolt:!hold && cycle > .8 && cycle < .84,
    dash:difficulty > 0 && s.bolts.some(b => b.owner === 0 && length(delta(b.p,ai.p)) < 2.1),
    element: Math.floor(s.time/8)%3,
  }
}
