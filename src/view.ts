import * as T from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { beamReaches, LIMIT, type Duel } from './sim'

export const colors = [0xff632d,0xffca57,0x72dfff]
export function view(canvas: HTMLCanvasElement) {
  const renderer = new T.WebGLRenderer({canvas,antialias:true})
  const scene = new T.Scene()
  scene.background = new T.Color(0x101321)
  scene.fog = new T.FogExp2(0x101321,.033)
  const camera = new T.PerspectiveCamera(56,1,.1,75)
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene,camera))
  composer.addPass(new UnrealBloomPass(new T.Vector2(),.68,.45,.55))
  composer.addPass(new OutputPass())
  const mobile = matchMedia('(pointer: coarse)').matches
  // ?lowfx=1 skips bloom (for slow phones).
  const lowfx = new URLSearchParams(location.search).has('lowfx')
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
  scene.add(new T.HemisphereLight(0x98baff,0x30243d,2))
  const moon = new T.DirectionalLight(0xc9dbff,2)
  moon.position.set(-4,8,-5)
  scene.add(moon)
  const stone = new T.MeshStandardMaterial({color:0x303548,roughness:.95})
  const trim = new T.MeshStandardMaterial({color:0x545b72})
  function box(w:number,h:number,d:number,x:number,y:number,z:number,material=stone) {
    const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),material)
    mesh.position.set(x,y,z)
    scene.add(mesh)
    return mesh
  }
  box(20,.5,20,0,-.25,0)
  const grid = new T.GridHelper(20,20,0x51586d,0x3e4458)
  grid.position.y = .01
  scene.add(grid)
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
  const orb = new T.IcosahedronGeometry(1,1)
  const axisY = new T.Vector3(0,1,0)
  function glow() {
    return new T.MeshBasicMaterial({color:0xffffff})
  }
  const actors = [0x637d99,0x8d5968].map(color => {
    const group = new T.Group()
    const cloth = new T.MeshStandardMaterial({color})
    const body = new T.Mesh(new T.CapsuleGeometry(.39,.85,4,10),cloth)
    body.position.y = .86
    const hood = new T.Mesh(orb,cloth)
    hood.scale.set(.32,.34,.32)
    hood.position.y = 1.62
    const hand = new T.Mesh(orb,glow())
    hand.position.set(0,1.18,.51)
    const ring = new T.Mesh(new T.RingGeometry(.56,.61,32),glow())
    ring.rotation.x = -Math.PI/2
    ring.position.y = .03
    group.add(body,hood,hand,ring)
    const beam = new T.Mesh(new T.CylinderGeometry(1,1,1,10),glow())
    const light = new T.PointLight(0xffffff,0,8)
    scene.add(group,beam,light)
    return {group,hand,ring,beam,light,cloth,color}
  })
  const spark = new T.Mesh(orb,glow())
  scene.add(spark)
  const bolts = new T.Group()
  scene.add(bolts)
  const boltMaterials = colors.map(color => new T.MeshBasicMaterial({color}))
  const pool: T.Mesh[] = []
  const raycaster = new T.Raycaster()
  const plane = new T.Plane(axisY,-1.18)
  const hit = new T.Vector3()
  const target = new T.Vector3()
  const eye = new T.Vector3()
  const direction = new T.Vector3()
  function draw(s: Duel, dt: number) {
    const [a,b] = s.mages
    const clash = s.clash
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
    const shake = (s.impact*.65 + (clash ? .028 : 0))*Math.sin(performance.now()*.066)
    eye.x += shake
    camera.position.lerp(eye,1-Math.exp(-dt*9))
    camera.lookAt(target)
    camera.updateMatrixWorld()
    spark.visible = Boolean(clash)
    if (clash) {
      spark.position.set(a.p.x+fx*clash.position,1.18,a.p.z+fz*clash.position)
      spark.scale.setScalar(.27+.1*Math.sin(s.time*48))
      spark.rotation.y += dt*6
    }
    for (const [i,m] of s.mages.entries()) {
      const {group, hand, ring, beam, light, cloth,color} = actors[i]
      const tint = colors[m.element]
      group.position.set(m.p.x,0,m.p.z)
      group.rotation.y = Math.atan2(m.aim.x,m.aim.z)
      cloth.color.setHex(m.stun ? 0xc48b83 : color)
      hand.material.color.setHex(tint).multiplyScalar(m.charge ? 2 : .8)
      hand.scale.setScalar(.095+m.charge*.06)
      ring.material.color.setHex(tint)
      light.position.set(m.p.x,1.18,m.p.z)
      light.color.setHex(tint)
      light.intensity = m.charge*11
      beam.visible = m.charge > .28
      if (!beam.visible) continue
      const start = new T.Vector3(m.p.x+m.aim.x*.51,1.18,m.p.z+m.aim.z*.51)
      const other = s.mages[1-i]
      const dx = other.p.x-m.p.x
      const dz = other.p.z-m.p.z
      const gap = Math.hypot(dx,dz)
      const reaches = beamReaches(m,other)
      const range = reaches ? Math.max(.1,gap-.8) : LIMIT*2
      const end = clash ? spark.position : target.set(
        T.MathUtils.clamp(m.p.x+m.aim.x*range,-10,10),1.18,
        T.MathUtils.clamp(m.p.z+m.aim.z*range,-10,10),
      )
      if (m.element === 2 && !clash) end.copy(start).addScaledVector(direction.set(m.aim.x,0,m.aim.z),.24)
      direction.subVectors(end,start)
      beam.position.copy(start).addScaledVector(direction,.5)
      const width = m.element === 2 && !clash ? .65 : (m.element === 1 ? .065 : .1)+m.charge*.06
      beam.scale.set(width,Math.max(.01,direction.length()),width)
      beam.quaternion.setFromUnitVectors(axisY,direction.normalize())
      beam.material.color.setHex(tint).multiplyScalar(2)
    }
    s.bolts.forEach((bolt,i) => {
      const mesh = pool[i] ?? new T.Mesh(orb,boltMaterials[bolt.element])
      if (!pool[i]) {
        pool.push(mesh)
        bolts.add(mesh)
      }
      mesh.visible = true
      mesh.material = boltMaterials[bolt.element]
      mesh.position.set(bolt.p.x,1.18,bolt.p.z)
      mesh.scale.setScalar(.12+bolt.power*.006)
    })
    for (let i=s.bolts.length;i<pool.length;i++) pool[i].visible = false
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
