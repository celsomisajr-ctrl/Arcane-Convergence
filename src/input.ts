import { delta, unit, type Command, type Duel, type Point } from './sim'

// Controls follow the on-screen buttons: Basic attack, Skill 1–3 and the Ultimate.
// Desktop: left click = Basic, right-click hold or 1 = Skill 1, Space or 2 = Skill 2,
// 3 = Skill 3, R hold = Ultimate, E = clash pulse, Q = lock-on.
// Touch: the stick moves; the right-hand cluster mirrors the same slots.

type Held = 'skill1' | 'ult'
type Tap = 'basic' | 'skill2' | 'skill3' | 'pulse'

export function input(canvas: HTMLCanvasElement, project: (x:number,y:number)=>Point|undefined, forward: () => Point) {
  const keys = new Set<string>()
  let locked = true
  let mouse: {x:number;y:number}|undefined
  let touchMode = matchMedia('(pointer: coarse)').matches
  let stick = {x:0,z:0}
  /** Held slots, by source, so a key release doesn't cancel a still-held button. */
  const held = { skill1:new Set<string>(), ult:new Set<string>() }
  let taps: Partial<Record<Tap,boolean>> = {}
  /** A fresh Skill 1 press since the last tick; in a clash it is a pulse. */
  let skill1Press = false

  const press = (slot: Held, source: string) => {
    if (slot === 'skill1' && !held.skill1.size) skill1Press = true
    held[slot].add(source)
  }
  const release = (slot: Held, source: string) => held[slot].delete(source)

  function reset() {
    keys.clear()
    held.skill1.clear()
    held.ult.clear()
    taps = {}
    skill1Press = false
    stick = {x:0,z:0}
    document.querySelector<HTMLElement>('#stick i')!.style.transform = ''
  }
  addEventListener('blur',reset)
  document.addEventListener('visibilitychange',reset)

  const playing = () => document.querySelector<HTMLElement>('#overlay')!.hidden
  addEventListener('keydown',e => {
    if (!/^(Key[WASDEQR]|Digit[123]|Space)$/.test(e.code) || e.repeat || !playing()) return
    e.preventDefault()
    keys.add(e.code)
    if (e.code === 'KeyQ') locked = !locked
    if (e.code === 'KeyE') taps.pulse = true
    if (e.code === 'Digit1') press('skill1','key')
    if (e.code === 'Digit2' || e.code === 'Space') taps.skill2 = true
    if (e.code === 'Digit3') taps.skill3 = true
    if (e.code === 'KeyR') press('ult','key')
  })
  addEventListener('keyup',e => {
    keys.delete(e.code)
    if (e.code === 'Digit1') release('skill1','key')
    if (e.code === 'KeyR') release('ult','key')
  })

  canvas.addEventListener('contextmenu',e => e.preventDefault())
  canvas.addEventListener('pointermove',e => {
    if (e.pointerType === 'mouse') mouse = {x:e.clientX,y:e.clientY}
  })
  canvas.addEventListener('pointerdown',e => {
    if (e.pointerType !== 'mouse') return
    touchMode = false
    if (e.button === 0) taps.basic = true
    if (e.button === 2) press('skill1','mouse')
  })
  addEventListener('pointerup',e => {
    if (e.pointerType === 'mouse' && e.button === 2) release('skill1','mouse')
  })

  const pad = document.querySelector<HTMLElement>('#stick')!
  let stickPointer: number | null = null
  function moveStick(e: PointerEvent) {
    if (e.pointerId !== stickPointer) return
    const r = pad.getBoundingClientRect()
    const x = (e.clientX-r.left-r.width/2)/34
    const z = (e.clientY-r.top-r.height/2)/34
    stick = Math.hypot(x,z)>1 ? unit({x,z}) : {x,z}
    pad.querySelector('i')!.style.transform = 'translate('+stick.x*31+'px,'+stick.z*31+'px)'
  }
  pad.addEventListener('pointerdown',e => {
    if (stickPointer !== null) return
    touchMode = true
    stickPointer = e.pointerId
    pad.setPointerCapture(e.pointerId)
    moveStick(e)
  })
  pad.addEventListener('pointermove',moveStick)
  pad.addEventListener('lostpointercapture',() => {
    stickPointer = null
    stick = {x:0,z:0}
    pad.querySelector('i')!.style.transform = ''
  })

  // The skill cluster works with touch and with the mouse.
  document.querySelectorAll<HTMLButtonElement>('#skills button').forEach(button => {
    const action = button.dataset.action
    const source = 'button'
    button.addEventListener('pointerdown',e => {
      e.preventDefault()
      if (e.pointerType !== 'mouse') touchMode = true
      if (action === 'skill1' || action === 'ult') {
        try { button.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
        press(action,source)
      }
      if (action === 'basic' || action === 'skill2' || action === 'skill3') taps[action] = true
    })
    const up = () => { if (action === 'skill1' || action === 'ult') release(action,source) }
    button.addEventListener('pointerup',up)
    button.addEventListener('lostpointercapture',up)
    button.addEventListener('pointercancel',up)
  })

  return {
    reset,
    get locked() { return locked || touchMode },
    sample(s: Duel): Command {
      const [player,rival] = s.mages
      const point = !this.locked && mouse ? project(mouse.x,mouse.y) : undefined
      const aim = delta(player.p,point ?? rival.p)
      // Camera-relative: W/stick-up moves away from the camera, D/stick-right to screen right.
      const f = forward()
      const ahead = Number(keys.has('KeyW'))-Number(keys.has('KeyS'))-stick.z
      const right = Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+stick.x
      const move = { x:f.x*ahead-f.z*right, z:f.z*ahead+f.x*right }
      // In a clash the beam holds itself and each Skill 1 press is a pulse on the bright bar.
      const clashing = s.clash !== null
      const command: Command = {
        move, aim,
        skill1:clashing || held.skill1.size > 0,
        basic:taps.basic, skill2:taps.skill2, skill3:taps.skill3,
        ult:held.ult.size > 0,
        pulse:taps.pulse || (clashing && skill1Press),
      }
      taps = {}
      skill1Press = false
      return command
    },
  }
}
