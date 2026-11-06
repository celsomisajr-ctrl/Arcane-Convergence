import './style.css'
import { decide } from './ai'
import { input } from './input'
import { beats, ELEMENT_COUNT, pulsePhase, round, STEP, step, ULT_MAX, type Mage } from './sim'
import { MAGES, PLACEHOLDER_SKILLS } from './mages'
import { view } from './view'

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = document.querySelector('canvas')!
const overlay = get('overlay')
const message = get('message')
const start = get<HTMLButtonElement>('start')
// Phones play in landscape. Android can lock it (in fullscreen); iPhone can't, so in
// portrait we show a rotate prompt and pause the duel until the phone is turned.
const touch = matchMedia('(pointer: coarse)').matches
const portrait = matchMedia('(orientation: portrait)')
const rotate = get('rotate')
const blockedByPortrait = () => touch && portrait.matches
async function preferLandscape() {
  if (!touch) return
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({navigationUI:'hide'})
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await orientation.lock?.('landscape')
  } catch {
    // Not supported here (e.g. iPhone Safari): the rotate prompt covers it.
  }
}
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

// Mage select: one mage per player for the whole match. The pick is remembered on this device.
const PICK_KEY = 'arcane-convergence.mage'
let pick = 0
try { pick = Math.min(ELEMENT_COUNT-1,Math.max(0,Number(localStorage.getItem(PICK_KEY)) || 0)) } catch { /* storage blocked */ }
const roster = get('mages')
const names = (list: number[]) => list.map(e => MAGES[e].element).join(', ')
MAGES.forEach((info,e) => {
  const others = MAGES.map((_,o) => o).filter(o => o !== e)
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'mage'
  card.setAttribute('role','radio')
  card.style.setProperty('--mage',info.css)
  card.innerHTML = `<b>${info.name}</b><span class="el">${info.element}</span><span class="ult">Ultimate: ${info.ultName}</span><span class="ult">${info.beam}</span>`
    +`<span class="wheel">Beats ${names(others.filter(o => beats(e,o)))}<br>Weak to ${names(others.filter(o => beats(o,e)))}</span>`
  card.addEventListener('click',() => {
    pick = e
    try { localStorage.setItem(PICK_KEY,String(e)) } catch { /* storage blocked */ }
    showPick()
  })
  roster.appendChild(card)
})
function showPick() {
  roster.querySelectorAll('.mage').forEach((card,e) => card.setAttribute('aria-checked',String(e === pick)))
}
showPick()
/** The AI rival gets a random mage each round, never the player's colour. */
function rivalMage() {
  const r = Math.floor(Math.random()*(ELEMENT_COUNT-1))
  return r >= pick ? r+1 : r
}
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
  // Skill cluster: names, the Ultimate's refill ring and cooldown sweeps.
  const skillsEl = get('skills')
  const slot = (action: string) => skillsEl.querySelector<HTMLElement>(`[data-action="${action}"]`)!
  ;(['skill1','skill2','skill3'] as const).forEach((a,k) => { slot(a).querySelector('.name')!.textContent = PLACEHOLDER_SKILLS[k] })
  function updateSkills(m: Mage) {
    const info = MAGES[m.element]
    skillsEl.style.setProperty('--mage',info.css)
    const ult = slot('ult')
    ult.style.setProperty('--fill',String(m.ult/ULT_MAX))
    ult.classList.toggle('ready',m.ult >= ULT_MAX && !m.ulting)
    ult.classList.toggle('active',m.ulting)
    ult.querySelector('.name')!.textContent = info.ultName
    slot('basic').style.setProperty('--cd',String(m.quick/.55))
    slot('skill2').style.setProperty('--cd',String(m.cooldown/1.25))
    slot('skill1').classList.toggle('active',m.charge > 0)
  }
  start.addEventListener('click',() => {
    void preferLandscape()
    if (matchEnded) {
      wins = losses = 0
      difficulty = get<HTMLSelectElement>('difficulty').selectedIndex
    }
    duel = round([pick,rivalMage()])
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
    // Show the rotate prompt only during a match, so the menu stays usable in portrait.
    rotate.hidden = !(playing && blockedByPortrait())
    if (playing && !debug?.paused && rotate.hidden) {
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
          roster.hidden = !matchEnded
          overlay.hidden = false
          break
        }
      }
    }
    arena.draw(duel,dt)
    duel.mages.forEach((m,i) => {
      hp[i].value = m.hp
      mp[i].value = m.mana
      elements[i].textContent = MAGES[m.element].name+' · '+MAGES[m.element].element
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
      : player.stun ? 'STAGGERED' : clash ? '' : player.ulting ? MAGES[player.element].ultName.toUpperCase() : player.root ? 'ROOTED'
      : controls.locked ? 'LOCK-ON' : 'FREE AIM'
    skillsEl.hidden = !playing
    updateSkills(duel.mages[0])
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
