import './style.css'
import { decide } from './ai'
import { input } from './input'
import { pulsePhase, round, STEP, step } from './sim'
import { view } from './view'

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = document.querySelector('canvas')!
const overlay = get('overlay')
const message = get('message')
const start = get<HTMLButtonElement>('start')
const labels = ['Fire','Gold Threads','Frost']
const hp = [get<HTMLMeterElement>('hp0'),get<HTMLMeterElement>('hp1')]
const mp = [get<HTMLMeterElement>('mp0'),get<HTMLMeterElement>('mp1')]
const elements = [get('elem0'),get('elem1')]
let duel = round()
let wins = 0
let losses = 0
let playing = false
let difficulty = 1
let accumulator = 0
let last = 0
let lockFreeze = 0
let impactFreeze = 0
let matchEnded = true
let arena: ReturnType<typeof view> | undefined
// Dev-only hook for inspecting effects: window.__ac.paused freezes the simulation while
// drawing continues, and window.__ac.duel exposes the live state. Stripped from builds.
const debug = import.meta.env.DEV ? { paused:false, get duel() { return duel } } : undefined
if (debug) Object.assign(window,{__ac:debug})
try {
  arena = view(canvas)
} catch {
  message.textContent = 'The arena needs a browser with WebGL 2 enabled.'
  start.disabled = true
}
if (arena) run(arena)
function run(arena: ReturnType<typeof view>) {
  const controls = input(canvas,arena.aim,arena.forward)
  start.addEventListener('click',() => {
    const previousElement = duel.mages[0].element
    if (matchEnded) {
      wins = losses = 0
      difficulty = get<HTMLSelectElement>('difficulty').selectedIndex
    }
    duel = round()
    duel.mages[0].element = previousElement
    accumulator = lockFreeze = impactFreeze = 0
    overlay.hidden = true
    playing = true
    matchEnded = false
    controls.reset()
    start.blur()
  })
  function frame(now: number) {
    const dt = last ? Math.min(.1,(now-last)/1000) : 0
    last = now
    if (playing && !debug?.paused) {
      lockFreeze = Math.max(0,lockFreeze-dt)
      impactFreeze = Math.max(0,impactFreeze-dt)
      accumulator += impactFreeze ? 0 : dt*(lockFreeze ? .22 : 1)
      while (accumulator >= STEP) {
        accumulator -= STEP
        const wasClashing = duel.clash !== null
        const previousImpact = duel.impact
        step(duel,[controls.sample(duel),decide(duel,difficulty)])
        if (!wasClashing && duel.clash) {
          lockFreeze = .24
          accumulator = 0
        }
        if (duel.impact > previousImpact && duel.impact >= .4) {
          impactFreeze = .09
          accumulator = 0
        }
        const [player,rival] = duel.mages
        if (!player.hp || !rival.hp) {
          playing = false
          if (player.hp) wins++
          else if (rival.hp) losses++
          matchEnded = wins === 2 || losses === 2
          const result = player.hp ? 'Round won.' : rival.hp ? 'Round lost.' : 'Round drawn.'
          message.textContent = (matchEnded ? (wins === 2 ? 'Match won.' : 'Match lost.') : result)+' Score '+wins+'–'+losses+'.'
          start.textContent = matchEnded ? 'Rematch' : 'Next round'
          get('difficulty-label').hidden = !matchEnded
          overlay.hidden = false
          break
        }
      }
    }
    arena.draw(duel,dt)
    duel.mages.forEach((m,i) => {
      hp[i].value = m.hp
      mp[i].value = m.mana
      elements[i].textContent = labels[m.element]
    })
    if (playing) get('round').textContent = 'ROUND '+(wins+losses+1)
    get('wins').textContent = '◆'.repeat(wins)
    get('losses').textContent = '◆'.repeat(losses)
    const clash = duel.clash
    get('clash').hidden = !playing || !clash
    if (clash) {
      get('tug').style.setProperty('--pos',clash.position*100+'%')
      get('beat').style.setProperty('--pos',pulsePhase(clash.age)*100+'%')
    }
    const player = duel.mages[0]
    get('status').textContent = !playing ? '' : player.stun && player.mana === 0 ? 'EXHAUSTED'
      : player.stun ? 'STAGGERED' : clash ? '' : controls.locked ? 'LOCK-ON' : 'FREE AIM'
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
