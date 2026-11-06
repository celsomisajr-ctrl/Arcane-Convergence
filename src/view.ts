import * as T from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { beamReaches, BEAM_ACTIVE, FIRE, FROST, GOLD, LIGHT, LIMIT, NATURE, ULT_RANGE, WEAVE_RADIUS, type Duel, type Mage } from './sim'
import type { Aiming } from './input'
import { MAGES } from './mages'
import { beamMaterial, Particles, Ribbon, softDot } from './fx'

/** Mage light colours by element, brighter than 1 so bloom picks them up:
 *  Red Fire, Yellow Gold Threads, Blue Frost, White Light, Green Nature. */
const tints = [new T.Color(2.4,.62,.12),new T.Color(2.3,1.45,.4),new T.Color(.5,1.55,2.5),new T.Color(1.35,1.3,1.15),new T.Color(.5,2.1,.55)]
const SPARK = new T.Color(2.6,2.1,1.5)
const SILVER = new T.Color(1.6,1.7,1.9)
const DUST = new T.Color(.16,.2,.32)
const HAND_Y = 1.18

export function view(canvas: HTMLCanvasElement) {
  const mobile = matchMedia('(pointer: coarse)').matches
  // ?lowfx=1 skips bloom and trims effects (for slow phones).
  const lowfx = new URLSearchParams(location.search).has('lowfx')
  const budget = mobile || lowfx ? .45 : 1
  const RIBBON_SEGMENTS = mobile || lowfx ? 18 : 30

  const renderer = new T.WebGLRenderer({canvas,antialias:!mobile})
  const scene = new T.Scene()
  scene.background = new T.Color(0x070a12)
  scene.fog = new T.FogExp2(0x070a12,.042)
  const camera = new T.PerspectiveCamera(56,1,.1,75)
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene,camera))
  const bloom = new UnrealBloomPass(new T.Vector2(),.75,.5,.62)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  /** Smoothed ground point the fixed camera follows. */
  const camFocus = { x:0, z:2 }
  function resize() {
    const width = canvas.clientWidth
    const height = Math.max(1,canvas.clientHeight)
    const ratio = Math.min(devicePixelRatio,mobile ? 1 : 1.5)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width,height,false)
    composer.setPixelRatio(ratio)
    composer.setSize(width,height)
    camera.aspect = width/height
    camera.updateProjectionMatrix()
  }
  addEventListener('resize',resize)
  resize()

  // --- Room: cold blue-grey stone, lit mostly by the spells ---
  const axisYUp = new T.Vector3(0,1,0)
  const hemi = new T.HemisphereLight(0x6d84c4,0x150f1c,1.4)
  scene.add(hemi)
  const moon = new T.DirectionalLight(0xa9c1ff,1.1)
  moon.position.set(-4,8,-5)
  scene.add(moon)
  const stone = new T.MeshStandardMaterial({color:0x2a3042,roughness:.95})
  const trim = new T.MeshStandardMaterial({color:0x444c63,roughness:.85})
  function box(w:number,h:number,d:number,x:number,y:number,z:number,material=stone) {
    const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),material)
    mesh.position.set(x,y,z)
    scene.add(mesh)
    return mesh
  }
  const floor = box(20,.5,20,0,-.25,0,new T.MeshStandardMaterial({map:flagstones(),roughness:.9,metalness:.05}))
  floor.receiveShadow = false
  for (const x of [-10,10]) {
    box(.25,.45,20,x,.22,0,trim)
    for (const z of [-9,-3,3,9]) {
      box(.9,6,.9,x,3,z)
      box(1.3,.4,1.3,x,.2,z,trim)
      box(1.3,.4,1.3,x,5.8,z,trim)
    }
  }
  box(20,.45,.25,0,.22,10,trim)
  box(20,7,.4,0,3.5,-11)
  for (let i=0;i<3;i++) box(5-i, .25,3-i*.5,0,.125+i*.25,-9.8)
  box(1.5,.8,.9,0,1.15,-10,trim)
  box(1.5,2,.28,0,1.9,-10.4,trim)
  // Tall latticed windows on the back wall, throwing cold shafts of light into the hall.
  const windowTex = latticeWindow()
  const shaftTex = shaftGradient()
  for (const x of [-5.5,5.5]) {
    const pane = new T.Mesh(new T.PlaneGeometry(2.2,4),new T.MeshBasicMaterial({map:windowTex,color:new T.Color(.55,.72,1.15),toneMapped:false}))
    pane.position.set(x,3.6,-10.78)
    scene.add(pane)
    box(2.6,.25,.5,x,1.5,-10.7,trim)
    box(2.6,.25,.5,x,5.7,-10.7,trim)
    // Two crossed additive planes read as a volume from any angle.
    const top = new T.Vector3(x,3.6,-10.6)
    const floorHit = new T.Vector3(x*.55,0,-4.2)
    const mid = top.clone().add(floorHit).multiplyScalar(.5)
    const len = top.distanceTo(floorHit)
    for (const turn of [0,Math.PI/2]) {
      const shaft = new T.Mesh(new T.PlaneGeometry(2,len),new T.MeshBasicMaterial({map:shaftTex,color:new T.Color(.22,.3,.5),
        transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false}))
      shaft.position.copy(mid)
      shaft.quaternion.setFromUnitVectors(axisYUp,floorHit.clone().sub(top).normalize().negate())
      shaft.rotateY(turn)
      scene.add(shaft)
    }
    const spot = new T.SpotLight(0x8fb0ff,18,18,.5,.6,1.2)
    spot.position.copy(top)
    spot.target.position.copy(floorHit)
    scene.add(spot,spot.target)
  }
  // A cold glow behind the throne to silhouette it.
  const backGlow = new T.PointLight(0x4a6cff,7,14,1.6)
  backGlow.position.set(0,3.2,-10.2)
  scene.add(backGlow)

  // --- Shared effects ---
  const dot = softDot()
  const particles = new Particles(Math.round(2600*budget),.16,dot)
  scene.add(particles.points)
  // Big soft flame sprites for the fire vortex and explosions.
  const flames = new Particles(Math.round(900*budget),.85,dot)
  scene.add(flames.points)
  // Stone chunks thrown by big impacts.
  const rubbleMat = new T.MeshStandardMaterial({color:0x3a4052,roughness:1,flatShading:true})
  const rubbleGeo = new T.DodecahedronGeometry(1,0)
  const rubble = Array.from({length:mobile || lowfx ? 12 : 28},() => {
    const mesh = new T.Mesh(rubbleGeo,rubbleMat)
    mesh.visible = false
    scene.add(mesh)
    return {mesh,v:new T.Vector3(),spin:new T.Vector3(),life:0,r:.1}
  })
  let nextRubble = 0
  function debris(at: T.Vector3, n: number, force: number) {
    for (let k = 0; k < n; k++) {
      const d = rubble[nextRubble]
      nextRubble = (nextRubble+1) % rubble.length
      d.r = .06+Math.random()*.16
      d.mesh.scale.setScalar(d.r)
      d.mesh.position.copy(at)
      const a = Math.random()*Math.PI*2
      const s = force*(.4+Math.random()*.6)
      d.v.set(Math.cos(a)*s,2+Math.random()*force*.8,Math.sin(a)*s)
      d.spin.set(Math.random()*8,Math.random()*8,Math.random()*8)
      d.life = 2.5+Math.random()
      d.mesh.visible = true
    }
  }
  /** Nature's Huge Rocks: boulders fall from above into the circle. */
  function dropRocks(cx: number, cz: number) {
    for (let k = 0; k < (mobile || lowfx ? 5 : 9); k++) {
      const d = rubble[nextRubble]
      nextRubble = (nextRubble+1) % rubble.length
      d.r = .3+Math.random()*.35
      d.mesh.scale.setScalar(d.r)
      const a = Math.random()*Math.PI*2
      const rr = WEAVE_RADIUS*.7*Math.sqrt(Math.random())
      d.mesh.position.set(cx+Math.cos(a)*rr,7+Math.random()*4,cz+Math.sin(a)*rr)
      d.v.set(0,-14-Math.random()*6,0)
      d.spin.set(Math.random()*5,Math.random()*5,Math.random()*5)
      d.life = 2.6+Math.random()
      d.mesh.visible = true
    }
  }
  function updateDebris(dt: number) {
    for (const d of rubble) {
      if (!d.mesh.visible) continue
      d.life -= dt
      d.v.y -= 14*dt
      d.mesh.position.addScaledVector(d.v,dt)
      if (d.mesh.position.y < d.r) {
        d.mesh.position.y = d.r
        d.v.y *= -.32
        d.v.x *= .6
        d.v.z *= .6
        d.spin.multiplyScalar(.6)
      }
      d.mesh.rotation.x += d.spin.x*dt
      d.mesh.rotation.y += d.spin.y*dt
      d.mesh.rotation.z += d.spin.z*dt
      if (d.life < .5) d.mesh.scale.setScalar(d.r*Math.max(0,d.life/.5))
      if (d.life <= 0) d.mesh.visible = false
    }
  }
  // Full-screen white-out for the biggest moments.
  const flashEl = document.createElement('div')
  flashEl.id = 'flash'
  document.body.appendChild(flashEl)
  let flash = 0
  const flashTo = (v: number) => { flash = Math.max(flash,v) }
  const orb = new T.IcosahedronGeometry(1,1)
  const axisY = new T.Vector3(0,1,0)
  const unitCylinder = new T.CylinderGeometry(1,1,1,14,1,true)

  const actors = [0x637d99,0x8d5968].map(color => {
    const group = new T.Group()
    const cloth = new T.MeshStandardMaterial({color,roughness:.8})
    const body = new T.Mesh(new T.CapsuleGeometry(.39,.85,4,10),cloth)
    body.position.y = .86
    const hood = new T.Mesh(orb,cloth)
    hood.scale.set(.32,.34,.32)
    hood.position.y = 1.62
    const hand = new T.Mesh(orb,new T.MeshBasicMaterial({color:0xffffff,toneMapped:false}))
    hand.position.set(0,HAND_Y,.51)
    const ring = new T.Mesh(new T.RingGeometry(.56,.62,40),
      new T.MeshBasicMaterial({color:0xffffff,transparent:true,toneMapped:false,depthWrite:false}))
    ring.rotation.x = -Math.PI/2
    ring.position.y = .03
    // Arms flung wide while weaving the Ultimate: glowing hands out to the sides.
    const arms = [-1,1].map(side => {
      const h = new T.Mesh(orb,new T.MeshBasicMaterial({color:0xffffff,toneMapped:false}))
      h.position.set(side*.78,1.5,.12)
      h.scale.setScalar(.11)
      h.visible = false
      return h
    })
    group.add(body,hood,hand,ring,...arms)

    const outerMat = beamMaterial()
    const coreMat = beamMaterial()
    const outer = new T.Mesh(unitCylinder,outerMat)
    const core = new T.Mesh(unitCylinder,coreMat)
    const threads = Array.from({length:5},() => new Ribbon(RIBBON_SEGMENTS))
    const aura = Array.from({length:mobile || lowfx ? 4 : 9},() => new Ribbon(RIBBON_SEGMENTS))
    const shield = new T.Group()
    const shardMat = new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.35,
      blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,side:T.DoubleSide})
    const edgeMat = new T.LineBasicMaterial({color:0xffffff,transparent:true,blending:T.AdditiveBlending,toneMapped:false})
    for (let k = 0; k < 7; k++) {
      const g = new T.OctahedronGeometry(1,0)
      const shard = new T.Mesh(g,shardMat)
      shard.add(new T.LineSegments(new T.EdgesGeometry(g),edgeMat))
      const a = k/7*Math.PI*2
      const r = k === 0 ? 0 : .42
      shard.position.set(Math.cos(a)*r,Math.sin(a)*r,0)
      shard.scale.set(.17,k === 0 ? .42 : .3,.06)
      shard.rotation.z = a
      shield.add(shard)
    }
    const light = new T.PointLight(0xffffff,0,14,1.4)
    const star = new T.Sprite(new T.SpriteMaterial({map:dot,color:0xffffff,blending:T.AdditiveBlending,
      depthWrite:false,transparent:true,toneMapped:false}))
    star.visible = false
    scene.add(group,outer,core,shield,light,star,...threads.map(t => t.mesh),...aura.map(t => t.mesh))
    return {group,hand,arms,body,ring,outer,core,threads,aura,shield,shardMat,edgeMat,light,star,cloth,color,flash:0,cast:0,quick:0,waves:0,phase:'' as string}
  })

  // Clash flare where the beams meet.
  const flare = new T.Sprite(new T.SpriteMaterial({map:dot,color:0xffffff,blending:T.AdditiveBlending,
    depthWrite:false,transparent:true,toneMapped:false}))
  const clashLight = new T.PointLight(0xffffff,0,16,1.3)
  scene.add(flare,clashLight)

  // --- Ground decals: aim indicators and Weave circles ---
  const discTex = discTexture()
  const decal = (geo: T.BufferGeometry, map: T.Texture) => {
    const mesh = new T.Mesh(geo,new T.MeshBasicMaterial({map,color:0xffffff,transparent:true,blending:T.AdditiveBlending,
      depthWrite:false,toneMapped:false,side:T.DoubleSide}))
    mesh.rotation.x = -Math.PI/2
    mesh.visible = false
    mesh.renderOrder = 2
    scene.add(mesh)
    return mesh
  }
  const lineGeo = new T.PlaneGeometry(1,1)
  lineGeo.translate(0,.5,0)
  const lineInd = decal(lineGeo,lineTexture())
  const rangeRing = decal(new T.RingGeometry(ULT_RANGE-.09,ULT_RANGE,120),ringTexture())
  const aimDisc = decal(new T.CircleGeometry(WEAVE_RADIUS,72),discTex)
  const weaveDiscs = [0,1].map(() => decal(new T.CircleGeometry(WEAVE_RADIUS,72),discTex))
  const weaveFill = [0,1].map(() => decal(new T.CircleGeometry(WEAVE_RADIUS,72),dot))
  const setDecal = (mesh: T.Mesh, color: T.Color, k: number) => (mesh.material as T.MeshBasicMaterial).color.copy(color).multiplyScalar(k)

  // --- The Weave: threads that gather into the caster, lash into the circle, converge on release ---
  type Strand = { inner: Ribbon; outer: Ribbon; a: T.Vector3; c: T.Vector3; b: T.Vector3; age: number; dur: number; tail: number; owner: number; hit: boolean; live: boolean }
  const STRAND_SEGMENTS = 14
  const strands: Strand[] = Array.from({length:mobile || lowfx ? 40 : 80},() => {
    const s: Strand = { inner:new Ribbon(STRAND_SEGMENTS), outer:new Ribbon(STRAND_SEGMENTS), a:new T.Vector3(), c:new T.Vector3(), b:new T.Vector3(),
      age:0, dur:1, tail:.4, owner:0, hit:false, live:false }
    s.inner.mesh.visible = s.outer.mesh.visible = false
    scene.add(s.outer.mesh,s.inner.mesh)
    return s
  })
  let nextStrand = 0
  const strandPts = Array.from({length:STRAND_SEGMENTS+1},() => new T.Vector3())
  function strand(owner: number, a: T.Vector3, c: T.Vector3, b: T.Vector3, dur: number, tail: number, hit: boolean) {
    const s = strands[nextStrand]
    nextStrand = (nextStrand+1) % strands.length
    s.a.copy(a); s.c.copy(c); s.b.copy(b)
    s.age = 0; s.dur = dur; s.tail = tail; s.owner = owner; s.hit = hit; s.live = true
  }
  const bez = (s: Strand, t: number, out: T.Vector3) => {
    const u = 1-t
    return out.set(u*u*s.a.x+2*u*t*s.c.x+t*t*s.b.x,u*u*s.a.y+2*u*t*s.c.y+t*t*s.b.y,u*u*s.a.z+2*u*t*s.c.z+t*t*s.b.z)
  }
  // Gold's Giant Sword: a huge blade of braided light slams into the circle on release.
  const swordMat = new T.MeshBasicMaterial({color:new T.Color(2.2,1.6,.5),transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false})
  const sword = new T.Group()
  for (const [w,h,d,y] of [[.55,5.2,.1,2.6],[1.9,.22,.2,.15],[.2,1.1,.2,-.5],[.06,4.8,.14,2.5]] as const) {
    const part = new T.Mesh(new T.BoxGeometry(w,h,d),swordMat)
    part.position.y = y
    sword.add(part)
  }
  sword.visible = false
  scene.add(sword)
  let swordT = -1
  const swordAt = new T.Vector3()
  // Light's Soul Drain: a pillar of light over the circle.
  const pillar = new T.Mesh(new T.CylinderGeometry(1,1,1,32,1,true),beamMaterial())
  pillar.visible = false
  scene.add(pillar)
  let dim = 0

  const bolts = new T.Group()
  scene.add(bolts)
  const boltMaterials = tints.map(c => new T.MeshBasicMaterial({color:c.clone().multiplyScalar(1.4),toneMapped:false}))
  const pool: T.Mesh[] = []

  // Damage numbers live in a DOM layer over the canvas.
  const floaters = document.createElement('div')
  floaters.id = 'floaters'
  document.body.appendChild(floaters)

  const raycaster = new T.Raycaster()
  const plane = new T.Plane(axisY,-HAND_Y)
  const hit = new T.Vector3()
  const target = new T.Vector3()
  const eye = new T.Vector3()
  const direction = new T.Vector3()
  const start = new T.Vector3()
  const end = new T.Vector3()
  const perpA = new T.Vector3()
  const perpB = new T.Vector3()
  const pts = Array.from({length:RIBBON_SEGMENTS+1},() => new T.Vector3())
  const blend = new T.Color()
  let prevHp = [100,100]
  let pendingDamage = [0,0]
  let pendingTimer = [0,0]
  let wasClash = false
  let lastTime = -1
  let clock = 0

  function floater(x: number, z: number, text: string, kind: string) {
    const v = new T.Vector3(x+(Math.random()-.5)*.6,2.3,z).project(camera)
    if (v.z > 1) return
    const el = document.createElement('div')
    el.className = 'floater '+kind
    el.textContent = text
    const r = canvas.getBoundingClientRect()
    el.style.left = (v.x*.5+.5)*r.width+'px'
    el.style.top = (-v.y*.5+.5)*r.height+'px'
    floaters.appendChild(el)
    setTimeout(() => el.remove(),850)
  }

  function draw(s: Duel, dt: number, aiming: Aiming = null) {
    clock += dt
    const time = clock
    const [a,b] = s.mages
    const clash = s.clash
    // A new round resets hp; don't treat that as healing or damage.
    if (s.time < lastTime) prevHp = [100,100]
    lastTime = s.time
    const centerX = (a.p.x+b.p.x)/2
    const centerZ = (a.p.z+b.p.z)/2
    const fx = b.p.x-a.p.x
    const fz = b.p.z-a.p.z
    const distance = Math.hypot(fx,fz) || 1
    if (clash) {
      eye.set(centerX-fz/distance*(camera.aspect < 1 ? 19 : 11),5,centerZ+fx/distance*(camera.aspect < 1 ? 19 : 11))
      target.set(centerX,1.25,centerZ)
    } else {
      // Mobile Legends–style fixed 3/4 view: follows the player from above and behind (+z),
      // nudged toward the rival so both stay on screen. It pulls up and back while weaving.
      const lead = Math.min(5.5,distance*.46)
      const lift = a.weave && a.weave.phase !== 'release' ? 1.2 : 1
      const tall = camera.aspect < 1 ? 1.7 : 1
      camFocus.x += (T.MathUtils.clamp(a.p.x+fx/distance*lead,-6,6)-camFocus.x)*(1-Math.exp(-dt*5))
      camFocus.z += (T.MathUtils.clamp(a.p.z+fz/distance*lead,-7,6)-camFocus.z)*(1-Math.exp(-dt*5))
      eye.set(camFocus.x,11.8*lift*tall,camFocus.z+8.4*lift*tall)
      target.set(camFocus.x,.6,camFocus.z-.4)
    }
    const shake = (s.impact*.65 + (clash ? .028+clash.age*.006 : 0))*Math.sin(performance.now()*.066)
    eye.x += shake
    eye.y += shake*.5
    camera.position.lerp(eye,1-Math.exp(-dt*9))
    camera.lookAt(target)
    camera.updateMatrixWorld()

    // --- Clash flare, sparks and resolution burst ---
    const clashPoint = new T.Vector3()
    if (clash) {
      clashPoint.set(a.p.x+fx*clash.position,HAND_Y,a.p.z+fz*clash.position)
      blend.copy(tints[a.element]).lerp(tints[b.element],.5)
      flare.visible = true
      flare.position.copy(clashPoint)
      flare.material.color.copy(blend).multiplyScalar(.55)
      flare.scale.setScalar((.8+.3*Math.sin(time*31)+.15*Math.sin(time*13))*(1+Math.min(.6,clash.age*.1)))
      clashLight.position.copy(clashPoint)
      clashLight.color.copy(blend).multiplyScalar(.35)
      clashLight.intensity = 9+4*Math.sin(time*41)
      const n = Math.ceil(dt*140*budget)
      for (let k = 0; k < n; k++) {
        const c = Math.random() < .5 ? tints[a.element] : Math.random() < .5 ? tints[b.element] : SPARK
        particles.emit(clashPoint.x,clashPoint.y,clashPoint.z,(Math.random()-.5)*9,Math.random()*5,(Math.random()-.5)*9,c,.55,-6)
      }
    } else {
      flare.visible = false
      clashLight.intensity = 0
    }
    if (wasClash && !clash && s.impact >= .4) {
      // Resolution: a big burst at the loser.
      const loser = a.hp < prevHp[0] ? a : b
      particles.burst(loser.p.x,HAND_Y,loser.p.z,Math.round(160*budget),11,SPARK,.9)
      particles.burst(loser.p.x,HAND_Y,loser.p.z,Math.round(90*budget),7,tints[(loser === a ? b : a).element],1)
      flames.burst(loser.p.x,HAND_Y,loser.p.z,Math.round(130*budget),6,tints[(loser === a ? b : a).element].clone().multiplyScalar(.8),1.1,1.5)
      debris(new T.Vector3(loser.p.x,.4,loser.p.z),Math.round(14*(mobile || lowfx ? .5 : 1)),5)
      flashTo(.85)
    }
    wasClash = clash !== null

    // --- Mages, auras and beams ---
    for (const [i,m] of s.mages.entries()) {
      const actor = actors[i]
      const {group, hand, ring, outer, core, threads, aura, shield, light, cloth, color} = actor
      const tint = tints[m.element]
      const other = s.mages[1-i]
      const w = m.weave
      const levitate = w ? (w.phase === 'release' ? .25 : .42)+.05*Math.sin(time*3) : 0
      group.position.set(m.p.x,group.position.y+(levitate-group.position.y)*Math.min(1,dt*8),m.p.z)
      group.rotation.y = w ? Math.atan2(w.target.x-m.p.x,w.target.z-m.p.z) : Math.atan2(m.aim.x,m.aim.z)
      actor.body.rotation.x = w && w.phase !== 'release' ? -.18 : 0
      for (const arm of actor.arms) {
        arm.visible = w !== null
        if (w) {
          ;(arm.material as T.MeshBasicMaterial).color.copy(tint).lerp(SILVER,.5).multiplyScalar(1.4+.4*Math.sin(time*30))
          arm.scale.setScalar(.1+(w.phase === 'gather' ? w.t*.12 : .09))
        }
      }
      hand.visible = !w
      ring.position.y = .03-group.position.y

      // Hits: flash, sparks and damage numbers.
      const lost = prevHp[i]-m.hp
      if (lost > 0) {
        actor.flash = Math.min(1,actor.flash+(lost >= 5 ? 1 : lost*.25))
        pendingDamage[i] += lost
        if (m.hp <= 0) {
          flashTo(1)
          debris(new T.Vector3(m.p.x,.5,m.p.z),Math.round(18*(mobile || lowfx ? .5 : 1)),6)
          flames.burst(m.p.x,HAND_Y,m.p.z,Math.round(150*budget),7,tints[other.element].clone().multiplyScalar(.85),1.3,1.5)
        } else if (lost >= 20) flashTo(.45)
        if (lost >= 5) {
          floater(m.p.x,m.p.z,String(Math.round(lost)),lost >= 20 ? 'big' : '')
          pendingDamage[i] -= lost
          particles.burst(m.p.x,HAND_Y,m.p.z,Math.round(40*budget),6,SPARK,.6)
        } else if (Math.random() < .5) {
          particles.burst(m.p.x,HAND_Y,m.p.z,2,4,tints[other.element],.4)
        }
      }
      prevHp[i] = m.hp
      pendingTimer[i] -= dt
      if (pendingTimer[i] <= 0 && pendingDamage[i] >= 1) {
        floater(m.p.x,m.p.z,String(Math.round(pendingDamage[i])),'')
        pendingDamage[i] = 0
        pendingTimer[i] = .3
      }
      actor.flash = Math.max(0,actor.flash-dt*5)
      cloth.color.setHex(m.stun ? 0xc48b83 : MAGES[m.element]?.robe ?? color)
      cloth.emissive.copy(tint).multiplyScalar(.07).add(blend.setRGB(actor.flash,actor.flash*.8,actor.flash*.6))
      group.scale.setScalar(m.dash ? .2 : 1) // blink
      if (m.dash && Math.random() < .8) particles.burst(m.p.x,1,m.p.z,4,2.5,tints[2],.45,0)

      // Casting the Ultimate counts as full power. Placeholder for the cinematic: dense silver
      // threads whirl around the caster, shading toward the mage's colour.
      const charging = m.charge > 0 || m.ulting
      const power = m.ulting ? 1 : Math.min(1,m.charge/1.6)
      const threadTint = m.ulting ? blend.copy(SILVER).lerp(tint,.35) : tint
      hand.material.color.copy(tint).multiplyScalar(charging ? 1+power : .45)
      hand.scale.setScalar(.095+m.charge*.07+(charging ? .02*Math.sin(time*40) : 0))
      ring.material.color.copy(tint)
      ring.material.opacity = charging ? .45+.4*Math.sin(time*11) : .35
      ring.scale.setScalar(1+(charging ? power*.7 : 0))
      const handWorld = hand.getWorldPosition(new T.Vector3())
      light.position.copy(handWorld)
      light.color.copy(tint).multiplyScalar(.45)
      light.intensity += ((charging ? 6+power*26 : 0)*(.85+.15*Math.sin(time*37+i))-light.intensity)*Math.min(1,dt*12)

      // Channel aura: streams of light spiralling up around the caster.
      for (const [k,r] of aura.entries()) {
        r.mesh.visible = charging
        if (!charging) continue
        const phase = k/aura.length*Math.PI*2
        for (let p = 0; p < pts.length; p++) {
          const u = p/(pts.length-1)
          const ang = phase+time*(3+(k%4)*.5)*(k%2 ? 1 : -1)+u*(4.5+(k%3))
          const rad = (.3+u*.75)*(.55+power*.7)*(.65+(k%3)*.25)
          pts[p].set(m.p.x+Math.cos(ang)*rad,.25+u*2.1+Math.sin(time*2+k)*.08,m.p.z+Math.sin(ang)*rad)
        }
        r.set(pts,(.015+power*.03)*(k%3 ? .7 : 1.2),threadTint,camera.position,(m.ulting ? 1 : Math.min(1,m.charge*3))*(.5+.5*Math.sin(time*5+k)))
      }
      // Fire vortex: big flames whirl around a fire caster as the charge builds.
      if (charging && m.element === FIRE && power > .3) {
        const n = Math.ceil(dt*70*budget*power)
        for (let k = 0; k < n; k++) {
          const ang = Math.random()*Math.PI*2
          const rad = .75+Math.random()*.45
          const swirl = 2.5+power*3
          flames.emit(m.p.x+Math.cos(ang)*rad,.15+Math.random()*1.7,m.p.z+Math.sin(ang)*rad,
            -Math.sin(ang)*swirl,.6+Math.random(),Math.cos(ang)*swirl,tint.clone().multiplyScalar(.28+power*.12),.55,2)
        }
      }
      // Cast star: a bright flare at the hand when a bolt leaves it.
      if (m.quick > actor.quick+.3) actor.cast = 1
      actor.quick = m.quick
      actor.cast = Math.max(0,actor.cast-dt*5)
      actor.star.visible = actor.cast > 0
      if (actor.cast > 0) {
        actor.star.position.copy(handWorld)
        actor.star.material.color.copy(tint).multiplyScalar(actor.cast)
        actor.star.scale.setScalar(.4+(1-actor.cast)*1.6)
      }
      if (charging && Math.random() < dt*30*budget) {
        particles.emit(handWorld.x,handWorld.y,handWorld.z,(Math.random()-.5)*1.5,Math.random()*1.4,(Math.random()-.5)*1.5,tint,.7,.8)
      }

      // Beam geometry, shared by every element.
      const live = m.charge > BEAM_ACTIVE
      start.set(m.p.x+m.aim.x*.51,HAND_Y,m.p.z+m.aim.z*.51)
      const gap = Math.hypot(other.p.x-m.p.x,other.p.z-m.p.z)
      const range = beamReaches(m,other) ? Math.max(.1,gap-.8) : LIMIT*2
      if (clash) end.copy(clashPoint)
      else end.set(T.MathUtils.clamp(m.p.x+m.aim.x*range,-10,10),HAND_Y,T.MathUtils.clamp(m.p.z+m.aim.z*range,-10,10))
      direction.subVectors(end,start)
      const length = Math.max(.01,direction.length())
      direction.normalize()
      perpA.crossVectors(direction,axisY).normalize()
      perpB.crossVectors(perpA,direction).normalize()

      // Every mage casts by weaving threads in their colour; the skill's own effect layers on
      // top: Fire's torrent, Light's piercing core, Frost's shield, Nature's leaves.
      const shieldUp = live && m.element === FROST && !clash
      const threadOnly = m.element === GOLD || m.element === NATURE
      const torrent = live && !shieldUp && (!threadOnly || clash !== null)
      const weave = live && !shieldUp

      outer.visible = core.visible = torrent
      if (torrent) {
        const width = (threadOnly ? .07 : m.element === LIGHT ? .09 : .12)+m.charge*.07
        for (const [mesh,scale,speed] of [[outer,2.6,7],[core,.9,13]] as const) {
          mesh.position.copy(start).addScaledVector(direction,length/2)
          mesh.quaternion.setFromUnitVectors(axisY,direction)
          const flicker = 1+.12*Math.sin(time*53+scale)
          mesh.scale.set(width*scale*flicker,length,width*scale*flicker)
          const u = (mesh.material as T.ShaderMaterial).uniforms
          u.time.value = time
          u.power.value = power
          u.speed.value = -speed
          u.color.value.copy(tint).multiplyScalar(scale > 1 ? .22 : .6)
        }
        if (m.element === FIRE) {
          const n = Math.ceil(dt*90*budget*(.5+power))
          for (let k = 0; k < n; k++) {
            const t = Math.random()
            const spread = .15+power*.25
            particles.emit(start.x+direction.x*length*t+(Math.random()-.5)*spread,start.y+(Math.random()-.5)*spread,
              start.z+direction.z*length*t+(Math.random()-.5)*spread,
              direction.x*4+(Math.random()-.5)*2,Math.random()*2.2,direction.z*4+(Math.random()-.5)*2,
              Math.random() < .25 ? SPARK : tint,.5,1.5)
          }
        }
      }

      // Threads: twisting ribbons flowing toward the target. Gold and Nature weave thicker.
      for (const [k,r] of threads.entries()) {
        r.mesh.visible = weave
        if (!weave) continue
        const phase = k/threads.length*Math.PI*2
        for (let p = 0; p < pts.length; p++) {
          const u = p/(pts.length-1)
          const ang = phase+u*length*2.2-time*9
          const rad = (.06+.16*Math.sin(Math.PI*u))*(.7+power*.6)
          pts[p].copy(start).addScaledVector(direction,u*length)
            .addScaledVector(perpA,Math.cos(ang)*rad).addScaledVector(perpB,Math.sin(ang)*rad)
        }
        r.set(pts,(threadOnly ? .018+power*.014 : .011+power*.008),tint,camera.position,threadOnly ? .9 : .65)
      }
      if (weave && Math.random() < dt*45*budget) {
        // Glitter for Gold and Light, drifting leaves for Nature.
        const t = Math.random()
        const leaf = m.element === NATURE
        particles.emit(start.x+direction.x*length*t,start.y+(Math.random()-.5)*.3,start.z+direction.z*length*t,
          (Math.random()-.5)*.6,leaf ? -.4 : Math.random()*.5,(Math.random()-.5)*.6,leaf ? tint : SPARK,leaf ? 1 : .6,leaf ? -.6 : .3)
      }
      // Nature's after-effects on this mage: poison bubbles and a root of vines at the feet.
      if (m.poison > 0 && Math.random() < dt*14*budget) {
        particles.emit(m.p.x+(Math.random()-.5)*.6,.4+Math.random()*1.2,m.p.z+(Math.random()-.5)*.6,0,.6,0,tints[NATURE],.8,.5)
      }
      if (m.root > 0) {
        ring.material.color.copy(tints[NATURE])
        ring.material.opacity = .9
        if (Math.random() < dt*40*budget) {
          const a = Math.random()*Math.PI*2
          particles.emit(m.p.x+Math.cos(a)*.55,.05,m.p.z+Math.sin(a)*.55,0,1.2,0,tints[NATURE],.5,-1)
        }
      }

      // Frost: a crystalline shard shield in front of the caster.
      shield.visible = shieldUp
      if (shieldUp) {
        shield.position.copy(start).addScaledVector(direction,.25)
        shield.lookAt(shield.position.clone().add(direction))
        shield.rotateZ(time*.6)
        shield.scale.setScalar(.8+power*.5)
        actor.shardMat.color.copy(tint).multiplyScalar(.12+.05*Math.sin(time*7))
        actor.edgeMat.color.copy(tint).multiplyScalar(.7)
        if (Math.random() < dt*20*budget) {
          particles.emit(shield.position.x+(Math.random()-.5)*.8,shield.position.y+(Math.random()-.5)*.8,
            shield.position.z+(Math.random()-.5)*.8,0,-.2,0,tint,.8,-.5)
        }
      }
    }

    // --- The Weave ---
    const tmp = new T.Vector3()
    const tmp2 = new T.Vector3()
    const weaveTint = new T.Color()
    let anyWeave = false
    for (const [i,m] of s.mages.entries()) {
      const actor = actors[i]
      const w = m.weave
      const disc = weaveDiscs[i]
      const fill = weaveFill[i]
      disc.visible = fill.visible = w !== null
      const tint = tints[m.element]
      weaveTint.copy(SILVER).lerp(tint,.45)
      if (!w) {
        actor.phase = ''
        actor.waves = 0
        continue
      }
      anyWeave = anyWeave || w.phase !== 'release'
      const cx = w.target.x
      const cz = w.target.z
      // The circle on the ground: an enemy's reads as a warning, and fills as the gather completes.
      const enemy = i === 1
      const pulse = .75+.25*Math.sin(time*(w.phase === 'gather' ? 18 : 9))
      disc.position.set(cx,.05,cz)
      disc.rotation.z = time*.4*(enemy ? -1 : 1)
      setDecal(disc,enemy ? blend.setRGB(2,.35,.25).lerp(tint,.35) : tint,(.55+.35*pulse)*(w.phase === 'release' ? Math.max(0,1-w.t*2.5) : 1))
      fill.position.set(cx,.04,cz)
      const grow = w.phase === 'gather' ? Math.min(1,w.t/.7) : 1
      fill.scale.setScalar(Math.max(.01,grow)*1.9)
      setDecal(fill,tint,(w.phase === 'gather' ? .18 : .1)*pulse)
      const leftHand = actor.arms[0].getWorldPosition(tmp)
      const hands = [leftHand.clone(),actor.arms[1].getWorldPosition(tmp2).clone()]
      // Gather: threads stream in from all around the hall into the outstretched hands.
      if (w.phase === 'gather') {
        const n = Math.ceil(dt*(mobile || lowfx ? 28 : 60))
        for (let k = 0; k < n; k++) {
          const ang = Math.random()*Math.PI*2
          const r = 6+Math.random()*4
          const from = new T.Vector3(m.p.x+Math.cos(ang)*r,.3+Math.random()*5,m.p.z+Math.sin(ang)*r)
          const to = hands[k%2]
          const mid = from.clone().lerp(to,.5)
          mid.y += 1+Math.random()*2.5
          mid.x += (Math.random()-.5)*4
          mid.z += (Math.random()-.5)*4
          strand(i,from,mid,to,.38+Math.random()*.25,.55,false)
        }
      }
      // Channel: each wave lashes a handful of threads from the hands up and down into the circle.
      if (w.phase === 'channel' && w.waves > actor.waves) {
        const n = mobile || lowfx ? 4 : 7
        for (let k = 0; k < n; k++) {
          const ang = Math.random()*Math.PI*2
          const rr = WEAVE_RADIUS*Math.sqrt(Math.random())*.9
          const to = new T.Vector3(cx+Math.cos(ang)*rr,.05,cz+Math.sin(ang)*rr)
          const from = hands[k%2]
          const mid = from.clone().lerp(to,.45)
          mid.y += 3.5+Math.random()*3
          mid.x += (Math.random()-.5)*3
          mid.z += (Math.random()-.5)*3
          strand(i,from,mid,to,.22+Math.random()*.08,.6,true)
        }
      }
      actor.waves = w.waves
      // Between waves, a steady stream of threads pours from the hands into the circle.
      if (w.phase === 'channel') {
        const n = Math.floor(dt*(mobile || lowfx ? 14 : 30)+Math.random())
        for (let k = 0; k < n; k++) {
          const ang = Math.random()*Math.PI*2
          const rr = WEAVE_RADIUS*Math.sqrt(Math.random())*.8
          const to = new T.Vector3(cx+Math.cos(ang)*rr,.1,cz+Math.sin(ang)*rr)
          const from = hands[Math.random() < .5 ? 0 : 1]
          const mid = from.clone().lerp(to,.5)
          mid.y += 2+Math.random()*2.5
          mid.x += (Math.random()-.5)*2.5
          mid.z += (Math.random()-.5)*2.5
          strand(i,from,mid,to,.35+Math.random()*.15,.45,false)
        }
      }
      // Lingering threads coil around the circle's rim while it channels.
      if (w.phase === 'channel' && Math.random() < dt*(mobile || lowfx ? 10 : 22)) {
        const ang = Math.random()*Math.PI*2
        const from = new T.Vector3(cx+Math.cos(ang)*WEAVE_RADIUS,.1,cz+Math.sin(ang)*WEAVE_RADIUS)
        const to = new T.Vector3(cx+Math.cos(ang+2)*WEAVE_RADIUS,.1,cz+Math.sin(ang+2)*WEAVE_RADIUS)
        const mid = new T.Vector3(cx,1.5+Math.random()*1.5,cz)
        strand(i,from,mid,to,.5,.5,false)
      }
      // Element payload inside the circle while it channels.
      if (w.phase === 'channel') {
        const rate = dt*(mobile || lowfx ? 30 : 70)
        for (let k = 0; k < Math.ceil(rate); k++) {
          const ang = Math.random()*Math.PI*2
          const rr = WEAVE_RADIUS*Math.sqrt(Math.random())
          const x = cx+Math.cos(ang)*rr
          const z = cz+Math.sin(ang)*rr
          if (m.element === FIRE) flames.emit(x,.1,z,0,1.5+Math.random()*2,0,tint.clone().multiplyScalar(.3),.6,1.5)
          else if (m.element === FROST) particles.emit(x,4+Math.random()*3,z,0,-9,0,tint,.5,-6)
          else if (m.element === NATURE) particles.emit(x,.05,z,0,1+Math.random(),0,tint,.7,-.5)
          else if (m.element === GOLD) particles.emit(x,.1+Math.random()*2,z,0,.4,0,SPARK,.6,.2)
          else particles.emit(x,.1,z,0,3+Math.random()*3,0,tint,.6,1)
        }
      }
      // Light's pillar stands over the circle for the whole channel.
      if (m.element === LIGHT) {
        pillar.visible = w.phase !== 'gather'
        const u = (pillar.material as T.ShaderMaterial).uniforms
        u.time.value = time
        u.power.value = 1
        u.speed.value = 6
        u.color.value.copy(tint).multiplyScalar(w.phase === 'release' ? .6*Math.max(0,1-w.t*2) : .16)
        pillar.position.set(cx,4,cz)
        pillar.scale.set(WEAVE_RADIUS*.8,8,WEAVE_RADIUS*.8)
      }
      // Release: threads converge on the centre, then the burst.
      if (w.phase === 'release' && actor.phase !== 'release') {
        const center = new T.Vector3(cx,.2,cz)
        for (let k = 0; k < (mobile || lowfx ? 10 : 18); k++) {
          const ang = k/18*Math.PI*2
          const from = new T.Vector3(cx+Math.cos(ang)*WEAVE_RADIUS,.1,cz+Math.sin(ang)*WEAVE_RADIUS)
          strand(i,from,new T.Vector3(cx+Math.cos(ang)*1.2,4+Math.random()*2,cz+Math.sin(ang)*1.2),center,.2,.7,false)
        }
        particles.burst(cx,.6,cz,Math.round(220*budget),13,SPARK,1)
        particles.burst(cx,.6,cz,Math.round(160*budget),9,weaveTint,1.1)
        flames.burst(cx,.5,cz,Math.round(160*budget),7,tint.clone().multiplyScalar(.75),1.2,1.2)
        debris(center,Math.round(16*(mobile || lowfx ? .5 : 1)),7)
        flashTo(.7)
        if (m.element === GOLD) { swordT = 0; swordAt.set(cx,0,cz) }
        if (m.element === NATURE) dropRocks(cx,cz)
        if (m.element === FROST) {
          for (let k = 0; k < Math.round(120*budget); k++) {
            const ang = Math.random()*Math.PI*2
            particles.emit(cx,.3,cz,Math.cos(ang)*12,Math.random()*3,Math.sin(ang)*12,tint,.7,-2)
          }
        }
      }
      actor.phase = w.phase
    }
    if (!s.mages.some(m => m.weave && m.element === LIGHT)) pillar.visible = false
    // The hall darkens while anyone weaves, so the threads light it.
    dim += ((anyWeave ? 1 : 0)-dim)*Math.min(1,dt*4)
    hemi.intensity = 1.4*(1-.55*dim)
    moon.intensity = 1.1*(1-.6*dim)
    backGlow.intensity = 7*(1-.5*dim)

    // Strands: a bright head races along its curve, trailing a tapering tail.
    for (const st of strands) {
      if (!st.live) continue
      st.age += dt
      const head = st.age/st.dur
      const end = Math.min(1,head)
      const begin = Math.max(0,head-st.tail)
      if (begin >= 1) {
        st.live = false
        st.inner.mesh.visible = st.outer.mesh.visible = false
        continue
      }
      for (let p = 0; p <= STRAND_SEGMENTS; p++) bez(st,begin+(end-begin)*p/STRAND_SEGMENTS,strandPts[p])
      const owner = s.mages[st.owner]
      weaveTint.copy(SILVER).lerp(tints[owner.element],.5)
      const fade = Math.min(1,(1-begin)*2)
      st.outer.set(strandPts,.11,weaveTint.clone().multiplyScalar(.35),camera.position,fade)
      st.inner.set(strandPts,.028,blend.setRGB(2.2,2.2,2.3),camera.position,fade)
      st.inner.mesh.visible = st.outer.mesh.visible = true
      if (st.hit && head >= 1) {
        st.hit = false
        particles.burst(st.b.x,.15,st.b.z,Math.round(16*budget),5,SPARK,.45)
        particles.burst(st.b.x,.15,st.b.z,Math.round(10*budget),3,tints[owner.element],.5)
        if (owner.element === FIRE) flames.burst(st.b.x,.2,st.b.z,Math.round(10*budget),2,tints[FIRE].clone().multiplyScalar(.35),.7,1.5)
      }
    }
    // Gold's sword drops from the sky, hangs, then fades.
    if (swordT >= 0) {
      swordT += dt
      sword.visible = true
      const fall = Math.min(1,swordT/.14)
      sword.position.set(swordAt.x,1.2+9*(1-fall)*(1-fall),swordAt.z)
      sword.rotation.set(0,time*.2,Math.PI)
      sword.scale.setScalar(1.7)
      swordMat.opacity = swordT < .5 ? 1 : Math.max(0,1-(swordT-.5)*2)
      if (swordT > 1) { swordT = -1; sword.visible = false }
    }

    // Aim indicators for the local player.
    const me = s.mages[0]
    lineInd.visible = aiming?.kind === 'line'
    if (aiming?.kind === 'line') {
      lineInd.position.set(me.p.x,.06,me.p.z)
      lineInd.rotation.set(-Math.PI/2,0,Math.atan2(-aiming.dir.x,-aiming.dir.z))
      lineInd.scale.set(1.3,10,1)
      setDecal(lineInd,tints[me.element],.55)
    }
    const circle = aiming?.kind === 'circle'
    rangeRing.visible = aimDisc.visible = circle
    if (aiming?.kind === 'circle') {
      rangeRing.position.set(me.p.x,.05,me.p.z)
      setDecal(rangeRing,tints[me.element],.45)
      const off = { x:aiming.target.x-me.p.x, z:aiming.target.z-me.p.z }
      const d = Math.hypot(off.x,off.z)
      const k = d > ULT_RANGE ? ULT_RANGE/d : 1
      aimDisc.position.set(T.MathUtils.clamp(me.p.x+off.x*k,-LIMIT,LIMIT),.06,T.MathUtils.clamp(me.p.z+off.z*k,-LIMIT,LIMIT))
      aimDisc.rotation.z = time*.6
      setDecal(aimDisc,aiming.cancel ? blend.setRGB(1.6,.2,.2) : tints[me.element],.75+.15*Math.sin(time*10))
    }

    // --- Bolts with trails ---
    s.bolts.forEach((bolt,i) => {
      const mesh = pool[i] ?? new T.Mesh(orb,boltMaterials[bolt.element])
      if (!pool[i]) {
        pool.push(mesh)
        bolts.add(mesh)
      }
      mesh.visible = true
      mesh.material = boltMaterials[bolt.element]
      mesh.position.set(bolt.p.x,HAND_Y,bolt.p.z)
      mesh.scale.setScalar(.12+bolt.power*.006+.02*Math.sin(time*50+i))
      const n = Math.ceil(dt*120*budget)
      for (let k = 0; k < n; k++) {
        particles.emit(bolt.p.x+(Math.random()-.5)*.15,HAND_Y+(Math.random()-.5)*.15,bolt.p.z+(Math.random()-.5)*.15,
          -bolt.v.x*2+(Math.random()-.5),(Math.random()-.5),-bolt.v.z*2+(Math.random()-.5),tints[bolt.element],.35,0)
      }
    })
    for (let i=s.bolts.length;i<pool.length;i++) pool[i].visible = false

    // Dust drifting through the cold air.
    if (Math.random() < dt*12*budget) {
      particles.emit((Math.random()-.5)*18,Math.random()*4,(Math.random()-.5)*18,
        (Math.random()-.5)*.2,.05,(Math.random()-.5)*.2,DUST,5,0)
    }

    particles.update(dt)
    flames.update(dt)
    updateDebris(dt)
    flash = Math.max(0,flash-dt*1.3)
    flashEl.style.opacity = String(flash)
    bloom.strength = .65+(clash ? .1 : 0)+.2*Math.max(a.charge,b.charge)/1.6
    if (lowfx) renderer.render(scene,camera)
    else composer.render()
  }
  camera.position.set(0,10.5,10)
  const projected = new T.Vector3()
  return {
    draw,
    /** CSS-pixel screen position of a world point, or undefined when it's behind the camera. */
    screen(x: number, y: number, z: number) {
      projected.set(x,y,z).project(camera)
      if (projected.z > 1) return undefined
      const r = canvas.getBoundingClientRect()
      return { x:(projected.x*.5+.5)*r.width+r.left, y:(-projected.y*.5+.5)*r.height+r.top }
    },
    aim(x:number,y:number) {
      const r = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera)
      return raycaster.ray.intersectPlane(plane,hit) ? {x:hit.x,z:hit.z} : undefined
    },
  }
}

/** Pale window with a dark carved lattice, drawn procedurally. */
function latticeWindow(): T.Texture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 232
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0,0,0,232)
  grad.addColorStop(0,'#dfe9ff')
  grad.addColorStop(1,'#7f95c4')
  g.fillStyle = grad
  g.fillRect(0,0,128,232)
  g.strokeStyle = '#1a1f2e'
  g.lineWidth = 5
  for (let i = -232; i < 360; i += 22) {
    g.beginPath(); g.moveTo(i,0); g.lineTo(i+232,232); g.stroke()
    g.beginPath(); g.moveTo(i+232,0); g.lineTo(i,232); g.stroke()
  }
  g.lineWidth = 12
  g.strokeRect(0,0,128,232)
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/** Soft vertical fade for light shafts: bright near the window, gone at the floor and edges. */
function shaftGradient(): T.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')!
  for (let y = 0; y < 128; y++) {
    const along = Math.pow(1-y/127,1.5) // canvas top = window end of the shaft
    for (let x = 0; x < 64; x++) {
      const across = Math.sin(Math.PI*x/63)
      const v = Math.round(255*along*across*across)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x,y,1,1)
    }
  }
  return new T.CanvasTexture(c)
}

/** Procedural cold flagstone floor, so the room needs no texture files. */
function flagstones(): T.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#151924'
  g.fillRect(0,0,512,512)
  let seed = 7
  const rand = () => (seed = (seed*16807) % 2147483647)/2147483647
  for (let y = 0; y < 8; y++) {
    const offset = y%2 ? 32 : 0
    for (let x = -1; x < 8; x++) {
      const v = 38+Math.floor(rand()*16)
      g.fillStyle = `rgb(${v-4},${v},${v+12})`
      g.fillRect(x*64+offset+2,y*64+2,60,60)
      g.fillStyle = 'rgba(0,0,0,.18)'
      g.fillRect(x*64+offset+2+rand()*40,y*64+2+rand()*40,6+rand()*14,2)
    }
  }
  const tex = new T.CanvasTexture(c)
  tex.wrapS = tex.wrapT = T.RepeatWrapping
  tex.repeat.set(2.5,2.5)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/** Weave circle: a faint fill, a bright rim and a ring of rune ticks. */
function discTexture(): T.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128,128,0,128,128,128)
  grad.addColorStop(0,'rgba(255,255,255,.05)')
  grad.addColorStop(.8,'rgba(255,255,255,.16)')
  grad.addColorStop(.93,'rgba(255,255,255,.55)')
  grad.addColorStop(.97,'rgba(255,255,255,1)')
  grad.addColorStop(1,'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0,0,256,256)
  g.strokeStyle = 'rgba(255,255,255,.7)'
  g.lineWidth = 3
  for (let k = 0; k < 24; k++) {
    const a = k/24*Math.PI*2
    g.beginPath()
    g.moveTo(128+Math.cos(a)*100,128+Math.sin(a)*100)
    g.lineTo(128+Math.cos(a)*(k%2 ? 108 : 112),128+Math.sin(a)*(k%2 ? 108 : 112))
    g.stroke()
  }
  g.lineWidth = 1.5
  g.beginPath(); g.arc(128,128,92,0,Math.PI*2); g.stroke()
  return new T.CanvasTexture(c)
}

/** Skill-shot indicator: bright edges, faint fill, fading toward the far end, arrow chevrons. */
function lineTexture(): T.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')!
  for (let y = 0; y < 256; y++) {
    const along = .35+.65*(1-y/255)
    for (let x = 0; x < 64; x++) {
      const edge = x < 4 || x > 59 ? 1 : .18
      const v = Math.round(255*edge*along)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x,y,1,1)
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.8)'
  g.lineWidth = 4
  for (const y of [40,80,120]) {
    g.beginPath(); g.moveTo(14,y); g.lineTo(32,y+14); g.lineTo(50,y); g.stroke()
  }
  // Canvas top = the caster's end: bright there, chevrons pointing away.
  const tex = new T.CanvasTexture(c)
  tex.flipY = false
  return tex
}

/** Plain white texture for thin rings (UVs on a ring would sample the soft dot's edge). */
function ringTexture(): T.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 4
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0,0,4,4)
  return new T.CanvasTexture(c)
}
