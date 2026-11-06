import './style.css'
import { decide } from './ai'
import { input } from './input'
import { beats, ELEMENT_COUNT, pulsePhase, round, STEP, step, ULT_MAX, type Mage } from './sim'
import { MAGES } from './mages'
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
const plates = [get('plate0'),get('plate1')]
const heads = [...document.querySelectorAll<HTMLElement>('#heads .head')]
const elements = [get('elem0'),get('elem1')]
const announceEl = get('announce')
const banner = get('banner')
function announce(text: string) {
  announceEl.textContent = text
  announceEl.classList.remove('show')
  void announceEl.offsetWidth // restart the animation
  announceEl.classList.add('show')
}
let bannerTimer = 0
function castBanner(i: number, m: Mage) {
  const info = MAGES[m.element]
  banner.hidden = false
  banner.className = i ? 'rival' : ''
  banner.style.setProperty('--mage',info.css)
  banner.querySelector('use')!.setAttribute('href','#i-ult'+m.element)
  banner.querySelector('small')!.textContent = (i ? 'RIVAL · ' : '')+info.name.toUpperCase()+' MAGE'
  banner.querySelector('b')!.textContent = info.ultName.toUpperCase()
  banner.style.animation = 'none'
  void banner.offsetWidth
  banner.style.animation = ''
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => { banner.hidden = true },1000)
}
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
  const controls = input(canvas,arena.aim)
  // Skill cluster: icons, the Ultimate's refill ring, cooldown sweeps and numbers.
  const skillsEl = get('skills')
  const slot = (action: string) => skillsEl.querySelector<HTMLElement>(`[data-action="${action}"]`)!
  const wasReady: Record<string,boolean> = {}
  function readyFlash(action: string, ready: boolean) {
    if (ready && wasReady[action] === false) {
      const b = slot(action)
      b.classList.remove('flash')
      void b.offsetWidth
      b.classList.add('flash')
    }
    wasReady[action] = ready
  }
  const seconds = (t: number) => t <= 0 ? '' : t < 1 ? t.toFixed(1) : String(Math.ceil(t))
  function updateSkills(m: Mage) {
    const info = MAGES[m.element]
    skillsEl.style.setProperty('--mage',info.css)
    const ult = slot('ult')
    const full = m.ult >= ULT_MAX
    ult.style.setProperty('--fill',String(m.weave ? 1 : m.ult/ULT_MAX))
    ult.classList.toggle('ready',full && !m.ulting)
    ult.classList.toggle('active',m.ulting)
    ult.querySelector('use')!.setAttribute('href','#i-ult'+m.element)
    ult.setAttribute('aria-label','Ultimate: '+info.ultName)
    ult.querySelector('.cd')!.textContent = m.ulting || full ? '' : Math.floor(m.ult)+'%'
    readyFlash('ult',full)
    const basic = slot('basic')
    basic.style.setProperty('--cd',String(m.quick/.55))
    const blink = slot('blink')
    blink.style.setProperty('--cd',String(m.cooldown/1.25))
    blink.querySelector('.cd')!.textContent = seconds(m.cooldown)
    readyFlash('blink',!m.cooldown)
  }
  function updatePlates() {
    duel.mages.forEach((m,i) => {
      const info = MAGES[m.element]
      plates[i].style.setProperty('--mage',info.css)
      plates[i].querySelector('use')!.setAttribute('href','#i-ult'+m.element)
      const [hpBar,mpBar] = plates[i].querySelectorAll<HTMLElement>('.hp,.mp')
      hpBar.style.setProperty('--v',String(m.hp/100))
      hpBar.style.setProperty('--t',String(m.hp/100))
      mpBar.style.setProperty('--v',String(m.mana/100))
      elements[i].textContent = info.name+' · '+info.element
      const head = heads[i]
      const at = arena.screen(m.p.x,2.25,m.p.z)
      head.hidden = !playing || !at || m.dash > 0
      if (at) {
        head.style.left = at.x+'px'
        head.style.top = at.y+'px'
      }
      head.querySelector('b')!.textContent = i ? 'Rival' : 'You'
      head.querySelector<HTMLElement>('.hp i')!.style.setProperty('--v',String(m.hp/100))
      head.querySelector<HTMLElement>('.mp i')!.style.setProperty('--v',String(m.mana/100))
    })
  }
  let weaving = [false,false]
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
    weaving = [false,false]
    announce('ROUND '+(wins+losses+1))
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
          announce('CLASH!')
        }
        duel.mages.forEach((m,i) => {
          if (m.weave && !weaving[i]) castBanner(i,m)
          weaving[i] = m.weave !== null
        })
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
          announce(player.hp ? 'VICTORY' : rival.hp ? 'DEFEAT' : 'DRAW')
          message.textContent = (matchEnded ? (wins === 2 ? 'Match won.' : 'Match lost.') : result)+' Score '+wins+'–'+losses+'.'
          start.textContent = matchEnded ? 'Rematch' : 'Next round'
          get('difficulty-label').hidden = !matchEnded
          roster.hidden = !matchEnded
          overlay.hidden = false
          break
        }
      }
    }
    arena.draw(duel,dt,playing ? controls.aiming(duel) : null)
    updatePlates()
    if (playing) {
      get('round').textContent = 'ROUND '+(wins+losses+1)
      const t = Math.floor(duel.time)
      get('timer').textContent = Math.floor(t/60)+':'+String(t%60).padStart(2,'0')
    }
    get('wins').textContent = '●'.repeat(wins)+'○'.repeat(2-wins)
    get('losses').textContent = '●'.repeat(losses)+'○'.repeat(2-losses)
    const clash = duel.clash
    get('clash').hidden = !playing || !clash
    if (clash) {
      get('tug').style.setProperty('--pos',clash.position*100+'%')
      get('beat').style.setProperty('--pos',pulsePhase(clash.age)*100+'%')
    }
    const player = duel.mages[0]
    get('status').textContent = !playing ? '' : player.stun && player.mana === 0 ? 'EXHAUSTED'
      : player.stun ? 'STAGGERED' : clash ? '' : player.weave?.phase === 'channel' ? (controls.touch ? 'STICK STEERS · TAP ULTIMATE TO RELEASE' : 'WASD STEERS · R TO RELEASE')
      : player.root ? 'ROOTED' : ''
    skillsEl.hidden = !playing
    updateSkills(duel.mages[0])
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
