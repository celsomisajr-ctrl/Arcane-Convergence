import { delta, unit, type Command, type Duel, type Point } from './sim'

export function input(canvas: HTMLCanvasElement, project: (x:number,y:number)=>Point|undefined, forward: () => Point) {
  const keys = new Set<string>()
  let locked = true
  let mouse: {x:number;y:number}|undefined
  let mouseHeld = false
  let touchHeld = false
  let touchMode = matchMedia('(pointer: coarse)').matches
  let stick = {x:0,z:0}
  let taps: Partial<Command> = {}
  let cycle = false
  /** A fresh Channel press since the last tick; during a clash it counts as a pulse. */
  let channelTap = false
  function reset() {
    keys.clear()
    mouseHeld = touchHeld = cycle = channelTap = false
    stick = {x:0,z:0}
    taps = {}
    document.querySelector<HTMLElement>('#stick i')!.style.transform = ''
  }
  addEventListener('blur',reset)
  document.addEventListener('visibilitychange',reset)
  addEventListener('keydown',e => {
    if (/^(Key[WASDEQ]|Digit[123]|Space)$/.test(e.code) && !e.repeat && document.querySelector<HTMLElement>('#overlay')!.hidden) {
      e.preventDefault()
      keys.add(e.code)
      if (e.code === 'KeyQ') locked = !locked
      if (e.code === 'KeyE') taps.pulse = true
      if (e.code === 'Space') taps.dash = true
      if (e.code.startsWith('Digit')) taps.element = Number(e.code.at(-1))-1
    }
  })
  addEventListener('keyup',e => keys.delete(e.code))
  canvas.addEventListener('contextmenu',e => e.preventDefault())
  canvas.addEventListener('pointermove',e => {
    if (e.pointerType === 'mouse') mouse = {x:e.clientX,y:e.clientY}
  })
  canvas.addEventListener('pointerdown',e => {
    if (e.pointerType !== 'mouse') return
    touchMode = false
    if (e.button === 0) {
      mouseHeld = true
      channelTap = true
    }
    if (e.button === 2) taps.bolt = true
  })
  addEventListener('pointerup',e => {
    if (e.pointerType === 'mouse' && e.button === 0) mouseHeld = false
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
  document.querySelectorAll<HTMLButtonElement>('#touch button').forEach(button => {
    const action = button.dataset.action
    button.addEventListener('pointerdown',e => {
      e.preventDefault()
      touchMode = true
      if (action === 'hold') {
        button.setPointerCapture(e.pointerId)
        touchHeld = true
        channelTap = true
      }
      if (action === 'element') cycle = true
      if (action === 'dash' || action === 'bolt' || action === 'pulse') taps[action] = true
    })
    button.addEventListener('lostpointercapture',() => {
      if (action === 'hold') touchHeld = false
    })
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
      // In a clash the channel stays held on its own, and each fresh Channel press is a pulse,
      // so a phone player taps one button instead of holding Channel while tapping Pulse.
      // Blink is the deliberate way out of a clash.
      const clashing = s.clash !== null
      const command = {move,aim,hold:clashing || mouseHeld || touchHeld,...taps}
      if (clashing && channelTap) command.pulse = true
      channelTap = false
      if (cycle) command.element = (player.element+1)%3
      taps = {}
      cycle = false
      return command
    },
  }
}
