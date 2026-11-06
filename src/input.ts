import { delta, length, ULT_RANGE, unit, type Command, type Duel, type Point } from './sim'

// Mobile Legends–style controls.
// Touch: a floating joystick (touch anywhere on the left side) moves. Skill buttons work
// three ways: tap to auto-target the rival, press and drag to aim with a ground indicator,
// or (Ultimate) drag onto Cancel to call it off. During the Weave's channel the joystick
// steers the circle, and tapping the Ultimate again releases it early.
// Desktop: WASD moves (or steers the Weave), the mouse aims, left click = Basic attack,
// right-click hold or 1 = Skill 1 (beam), 2/3 = Skills 2/3, Space or F = Blink,
// hold R to aim the Ultimate at the cursor and let go to cast (Esc cancels), E = clash pulse.

type Tap = 'basic' | 'blink' | 'skill2' | 'skill3' | 'pulse'
/** What the player is aiming right now, for the ground indicators. */
export type Aiming = { kind: 'line'; dir: Point } | { kind: 'circle'; target: Point; cancel: boolean } | null

/** Drag distance (px) that maps to the full Ultimate range. */
const ULT_DRAG = 80
/** Drag (px) before a press counts as aiming rather than a tap. */
const DEADZONE = 12

export function input(canvas: HTMLCanvasElement, project: (x:number,y:number)=>Point|undefined) {
  const keys = new Set<string>()
  let mouse: {x:number;y:number}|undefined
  let touchMode = matchMedia('(pointer: coarse)').matches
  let stick = {x:0,z:0}
  const held = { skill1:new Set<string>() }
  let taps: Partial<Record<Tap,boolean>> = {}
  let skill1Press = false
  /** Skill 1 aimed by dragging its button: a ground direction. */
  let beamDrag: Point | null = null
  /** Ultimate aiming: drag offset in world units from the caster, or the cursor on desktop. */
  let ultAim: { drag: Point | null; cursor: boolean; cancel: boolean } | null = null
  let ultPress = false
  let ultTarget: Point | undefined
  let player: Point = {x:0,z:0}
  let rival: Point = {x:0,z:0}
  let ulting = false

  const cancelEl = document.getElementById('cancel')!
  const overCancel = (x: number, y: number) => {
    const r = cancelEl.getBoundingClientRect()
    return Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2)) < r.width*.75
  }
  const ultTargetNow = (): Point => {
    if (!ultAim) return rival
    if (ultAim.cursor && mouse) return project(mouse.x,mouse.y) ?? rival
    if (ultAim.drag) return { x:player.x+ultAim.drag.x, z:player.z+ultAim.drag.z }
    return rival
  }
  function castUlt() {
    if (ultAim && !ultAim.cancel) {
      ultPress = true
      ultTarget = ultTargetNow()
    }
    ultAim = null
    cancelEl.hidden = true
  }

  function reset() {
    keys.clear()
    held.skill1.clear()
    taps = {}
    skill1Press = ultPress = false
    beamDrag = null
    ultAim = null
    cancelEl.hidden = true
    stick = {x:0,z:0}
    hideStick()
  }
  addEventListener('blur',reset)
  document.addEventListener('visibilitychange',reset)

  const playing = () => document.querySelector<HTMLElement>('#overlay')!.hidden
  addEventListener('keydown',e => {
    if (!/^(Key[WASDEFR]|Digit[123]|Space|Escape)$/.test(e.code) || e.repeat || !playing()) return
    e.preventDefault()
    keys.add(e.code)
    if (e.code === 'KeyE') taps.pulse = true
    if (e.code === 'Digit1') { if (!held.skill1.size) skill1Press = true; held.skill1.add('key') }
    if (e.code === 'Digit2') taps.skill2 = true
    if (e.code === 'Digit3') taps.skill3 = true
    if (e.code === 'Space' || e.code === 'KeyF') taps.blink = true
    if (e.code === 'KeyR') {
      touchMode = false
      if (ulting) ultPress = true
      else ultAim = { drag:null, cursor:true, cancel:false }
    }
    if (e.code === 'Escape' && ultAim) { ultAim = null; cancelEl.hidden = true }
  })
  addEventListener('keyup',e => {
    keys.delete(e.code)
    if (e.code === 'Digit1') held.skill1.delete('key')
    if (e.code === 'KeyR' && ultAim?.cursor) castUlt()
  })

  canvas.addEventListener('contextmenu',e => e.preventDefault())
  addEventListener('pointermove',e => {
    if (e.pointerType === 'mouse') mouse = {x:e.clientX,y:e.clientY}
  })
  canvas.addEventListener('pointerdown',e => {
    if (e.pointerType !== 'mouse') return
    touchMode = false
    if (e.button === 0) taps.basic = true
    if (e.button === 2) { if (!held.skill1.size) skill1Press = true; held.skill1.add('mouse') }
  })
  addEventListener('pointerup',e => {
    if (e.pointerType === 'mouse' && e.button === 2) held.skill1.delete('mouse')
  })

  // Floating joystick: the base appears where the thumb lands in the left zone.
  const zone = document.getElementById('stickzone')!
  const base = document.getElementById('stick')!
  const knob = base.querySelector('i')!
  let stickPointer: number | null = null
  let origin = {x:0,y:0}
  const RADIUS = 46
  function hideStick() {
    base.classList.remove('live')
    base.style.left = base.style.top = ''
    knob.style.transform = ''
  }
  function moveStick(e: PointerEvent) {
    if (e.pointerId !== stickPointer) return
    const dx = e.clientX-origin.x
    const dy = e.clientY-origin.y
    const d = Math.hypot(dx,dy)
    const k = d > RADIUS ? RADIUS/d : 1
    knob.style.transform = `translate(${dx*k}px,${dy*k}px)`
    // Screen-relative: up on the stick is up the screen (away from the camera).
    stick = d < 6 ? {x:0,z:0} : {x:dx*k/RADIUS,z:dy*k/RADIUS}
  }
  zone.addEventListener('pointerdown',e => {
    if (stickPointer !== null) return
    touchMode = true
    stickPointer = e.pointerId
    zone.setPointerCapture(e.pointerId)
    const r = zone.getBoundingClientRect()
    origin = {x:e.clientX,y:e.clientY}
    base.style.left = e.clientX-r.left+'px'
    base.style.top = e.clientY-r.top+'px'
    base.classList.add('live')
    moveStick(e)
  })
  zone.addEventListener('pointermove',moveStick)
  const endStick = () => {
    stickPointer = null
    stick = {x:0,z:0}
    hideStick()
  }
  zone.addEventListener('lostpointercapture',endStick)
  zone.addEventListener('pointercancel',endStick)

  // Skill buttons: tap, or press and drag to aim.
  document.querySelectorAll<HTMLButtonElement>('#skills button').forEach(button => {
    const action = button.dataset.action
    let down: {x:number;y:number;id:number} | null = null
    button.addEventListener('pointerdown',e => {
      e.preventDefault()
      if (e.pointerType !== 'mouse') touchMode = true
      try { button.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      const r = button.getBoundingClientRect()
      down = {x:r.left+r.width/2,y:r.top+r.height/2,id:e.pointerId}
      if (action === 'skill1') {
        if (!held.skill1.size) skill1Press = true
        held.skill1.add('button')
        beamDrag = null
      }
      if (action === 'ult') {
        if (ulting) { ultPress = true; down = null }
        else {
          ultAim = { drag:null, cursor:false, cancel:false }
          cancelEl.hidden = false
        }
      }
      if (action === 'basic' || action === 'blink' || action === 'skill2' || action === 'skill3') taps[action] = true
    })
    button.addEventListener('pointermove',e => {
      if (!down || e.pointerId !== down.id) return
      const dx = e.clientX-down.x
      const dy = e.clientY-down.y
      const d = Math.hypot(dx,dy)
      if (action === 'skill1' && held.skill1.has('button')) beamDrag = d > DEADZONE ? {x:dx/d,z:dy/d} : null
      if (action === 'ult' && ultAim) {
        ultAim.cancel = overCancel(e.clientX,e.clientY)
        if (d > DEADZONE) {
          const k = Math.min(1,d/ULT_DRAG)*ULT_RANGE/d
          ultAim.drag = {x:dx*k,z:dy*k}
        }
      }
    })
    const up = () => {
      if (!down) return
      down = null
      if (action === 'skill1') { held.skill1.delete('button'); beamDrag = null }
      if (action === 'ult' && ultAim && !ultAim.cursor) castUlt()
    }
    button.addEventListener('pointerup',up)
    button.addEventListener('lostpointercapture',up)
    button.addEventListener('pointercancel',up)
  })

  return {
    reset,
    get touch() { return touchMode },
    /** The ground indicator to draw this frame. */
    aiming(s: Duel): Aiming {
      const [m,r] = s.mages
      player = m.p
      rival = r.p
      if (ultAim) return { kind:'circle', target:ultTargetNow(), cancel:ultAim.cancel }
      if (held.skill1.size && !m.weave && !s.clash) return { kind:'line', dir:m.aim }
      return null
    },
    sample(s: Duel): Command {
      const [m,r] = s.mages
      player = m.p
      rival = r.p
      ulting = m.weave !== null
      const cursor = !touchMode && mouse ? project(mouse.x,mouse.y) : undefined
      const aimAt = beamDrag ? {x:m.p.x+beamDrag.x,z:m.p.z+beamDrag.z} : cursor && length(delta(m.p,cursor)) > .3 ? cursor : r.p
      // Screen-relative movement for the fixed camera: up = -z, right = +x.
      const ahead = Number(keys.has('KeyW'))-Number(keys.has('KeyS'))-stick.z
      const right = Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+stick.x
      const clashing = s.clash !== null
      const command: Command = {
        move:{x:right,z:-ahead}, aim:delta(m.p,aimAt),
        skill1:clashing || held.skill1.size > 0,
        basic:taps.basic, blink:taps.blink, skill2:taps.skill2, skill3:taps.skill3,
        ult:ultPress, ultTarget,
        pulse:taps.pulse || (clashing && skill1Press),
      }
      taps = {}
      skill1Press = ultPress = false
      ultTarget = undefined
      if (length(command.move) > 1) command.move = unit(command.move)
      return command
    },
  }
}
