import * as T from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { beamReaches, BEAM_ACTIVE, FIRE, FROST, GOLD, LIGHT, LIMIT, NATURE, type Duel } from './sim'
import { MAGES } from './mages'
import { beamMaterial, Particles, Ribbon, softDot } from './fx'

/** Mage light colours by element, brighter than 1 so bloom picks them up:
 *  Red Fire, Yellow Gold Threads, Blue Frost, White Light, Green Nature. */
const tints = [new T.Color(2.4,.62,.12),new T.Color(2.3,1.45,.4),new T.Color(.5,1.55,2.5),new T.Color(1.35,1.3,1.15),new T.Color(.5,2.1,.55)]
const SPARK = new T.Color(2.6,2.1,1.5)
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
  /** Smoothed ground direction the camera faces outside a clash. */
  const camDir = { x:0, z:-1 }
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
  scene.add(new T.HemisphereLight(0x6d84c4,0x150f1c,1.05))
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
    group.add(body,hood,hand,ring)

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
    return {group,hand,ring,outer,core,threads,aura,shield,shardMat,edgeMat,light,star,cloth,color,flash:0,cast:0,quick:0}
  })

  // Clash flare where the beams meet.
  const flare = new T.Sprite(new T.SpriteMaterial({map:dot,color:0xffffff,blending:T.AdditiveBlending,
    depthWrite:false,transparent:true,toneMapped:false}))
  const clashLight = new T.PointLight(0xffffff,0,16,1.3)
  scene.add(flare,clashLight)

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

  function draw(s: Duel, dt: number) {
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
      // Over the shoulder: behind the player, facing the rival, turning smoothly.
      const k = 1-Math.exp(-dt*4)
      camDir.x += (fx/distance-camDir.x)*k
      camDir.z += (fz/distance-camDir.z)*k
      const n = Math.hypot(camDir.x,camDir.z) || 1
      camDir.x /= n
      camDir.z /= n
      const rx = -camDir.z
      const rz = camDir.x
      eye.set(a.p.x-camDir.x*6.2-rx*.85,4.9,a.p.z-camDir.z*6.2-rz*.85)
      target.set(a.p.x+camDir.x*3.5,1.05,a.p.z+camDir.z*3.5)
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
      group.position.set(m.p.x,0,m.p.z)
      group.rotation.y = Math.atan2(m.aim.x,m.aim.z)

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
      cloth.emissive.setRGB(actor.flash,actor.flash*.8,actor.flash*.6)
      group.scale.setScalar(m.dash ? .2 : 1) // blink
      if (m.dash && Math.random() < .8) particles.burst(m.p.x,1,m.p.z,4,2.5,tints[2],.45,0)

      const charging = m.charge > 0
      const power = Math.min(1,m.charge/1.6)
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
        r.set(pts,(.015+power*.03)*(k%3 ? .7 : 1.2),tint,camera.position,Math.min(1,m.charge*3)*(.5+.5*Math.sin(time*5+k)))
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
  camera.position.set(0,4.9,11)
  return {
    draw,
    /** Camera's ground-plane forward direction, for camera-relative movement. */
    forward: () => ({ x:camDir.x, z:camDir.z }),
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
