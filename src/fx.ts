// Reusable spell-effect building blocks for the view: particles, camera-facing light
// ribbons and the flowing beam shader. Nothing here reads or writes simulation state.
import * as T from 'three'

/** Soft round sprite used by particles and flares. */
export function softDot(): T.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32,32,0,32,32,32)
  grad.addColorStop(0,'rgba(255,255,255,1)')
  grad.addColorStop(.25,'rgba(255,255,255,.55)')
  grad.addColorStop(1,'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0,0,64,64)
  return new T.CanvasTexture(c)
}

/** Pooled additive point particles (embers, sparks, glitter, dust). One draw call. */
export class Particles {
  readonly points: T.Points
  private pos: Float32Array
  private col: Float32Array
  private vel: Float32Array
  private base: Float32Array
  private life: Float32Array
  private max: Float32Array
  private lift: Float32Array
  private next = 0

  constructor(private count: number, size: number, dot: T.Texture) {
    this.pos = new Float32Array(count*3).fill(9999)
    this.col = new Float32Array(count*3)
    this.vel = new Float32Array(count*3)
    this.base = new Float32Array(count*3)
    this.life = new Float32Array(count)
    this.max = new Float32Array(count)
    this.lift = new Float32Array(count)
    const g = new T.BufferGeometry()
    g.setAttribute('position',new T.BufferAttribute(this.pos,3))
    g.setAttribute('color',new T.BufferAttribute(this.col,3))
    this.points = new T.Points(g,new T.PointsMaterial({
      size, map:dot, vertexColors:true, transparent:true, depthWrite:false,
      blending:T.AdditiveBlending, toneMapped:false,
    }))
    this.points.frustumCulled = false
  }

  /** `lift` is upward acceleration: positive for rising embers, negative for falling sparks. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: T.Color, life: number, lift = 1) {
    const i = this.next
    this.next = (i+1) % this.count
    this.pos.set([x,y,z],i*3)
    this.vel.set([vx,vy,vz],i*3)
    this.base.set([color.r,color.g,color.b],i*3)
    this.life[i] = this.max[i] = life
    this.lift[i] = lift
  }

  burst(x: number, y: number, z: number, n: number, speed: number, color: T.Color, life = .6, lift = -3) {
    for (let k = 0; k < n; k++) {
      const a = Math.random()*Math.PI*2
      const u = Math.random()*2-1
      const s = speed*(.35+Math.random()*.65)
      const r = Math.sqrt(1-u*u)*s
      this.emit(x,y,z,Math.cos(a)*r,u*s*.7+s*.35,Math.sin(a)*r,color,life*(.5+Math.random()*.5),lift)
    }
  }

  update(dt: number) {
    const drag = Math.exp(-dt*1.8)
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      const j = i*3
      if (this.life[i] <= 0) {
        this.pos[j+1] = 9999
        continue
      }
      this.vel[j+1] += this.lift[i]*dt
      for (let k = 0; k < 3; k++) {
        this.vel[j+k] *= drag
        this.pos[j+k] += this.vel[j+k]*dt
      }
      const t = this.life[i]/this.max[i]
      // Fade hot-to-dim: blue and green fall off faster, so sparks cool toward red.
      this.col[j] = this.base[j]*t
      this.col[j+1] = this.base[j+1]*t*(.4+.6*t)
      this.col[j+2] = this.base[j+2]*t*t
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }
}

const tangent = new T.Vector3()
const toEye = new T.Vector3()
const side = new T.Vector3()

/** A thin strip of light through a list of points, turned to face the camera every frame. */
export class Ribbon {
  readonly mesh: T.Mesh
  private pos: Float32Array
  private col: Float32Array

  constructor(readonly segments: number) {
    const n = segments+1
    this.pos = new Float32Array(n*2*3)
    this.col = new Float32Array(n*2*3)
    const index: number[] = []
    for (let i = 0; i < segments; i++) {
      const a = i*2
      index.push(a,a+1,a+2,a+1,a+3,a+2)
    }
    const g = new T.BufferGeometry()
    g.setAttribute('position',new T.BufferAttribute(this.pos,3))
    g.setAttribute('color',new T.BufferAttribute(this.col,3))
    g.setIndex(index)
    this.mesh = new T.Mesh(g,new T.MeshBasicMaterial({
      vertexColors:true, transparent:true, depthWrite:false, side:T.DoubleSide,
      blending:T.AdditiveBlending, toneMapped:false,
    }))
    this.mesh.frustumCulled = false
  }

  /** `points` must hold segments+1 entries. Width and brightness taper to zero at both ends. */
  set(points: T.Vector3[], width: number, color: T.Color, eye: T.Vector3, alpha = 1) {
    const n = this.segments+1
    for (let i = 0; i < n; i++) {
      const p = points[i]
      tangent.subVectors(points[Math.min(n-1,i+1)],points[Math.max(0,i-1)])
      toEye.subVectors(eye,p)
      side.crossVectors(tangent,toEye).normalize()
      const u = i/(n-1)
      const taper = Math.sin(Math.PI*u)
      const w = width*(.25+.75*taper)
      const k = alpha*taper
      const j = i*6
      this.pos[j] = p.x+side.x*w
      this.pos[j+1] = p.y+side.y*w
      this.pos[j+2] = p.z+side.z*w
      this.pos[j+3] = p.x-side.x*w
      this.pos[j+4] = p.y-side.y*w
      this.pos[j+5] = p.z-side.z*w
      for (const o of [0,3]) {
        this.col[j+o] = color.r*k
        this.col[j+o+1] = color.g*k
        this.col[j+o+2] = color.b*k
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.color.needsUpdate = true
  }
}

/** Flowing, flickering beam surface for a unit cylinder stretched from caster to target. */
export function beamMaterial() {
  return new T.ShaderMaterial({
    uniforms: { time:{value:0}, color:{value:new T.Color()}, power:{value:1}, speed:{value:9} },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix*vec4(position,1.);
        vec3 n = normalize(normalMatrix*normal);
        // Brightest along the beam's centre line as seen on screen. Measuring against the
        // view direction with the beam axis removed keeps it bright even when the camera
        // looks almost straight down the beam (the over-the-shoulder view).
        vec3 axis = normalize((modelViewMatrix*vec4(0.,1.,0.,0.)).xyz);
        vec3 v = normalize(-mv.xyz);
        vec3 across = v-axis*dot(v,axis);
        vFacing = length(across) < 1e-3 ? 1. : abs(dot(n,normalize(across)));
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform vec3 color;
      uniform float power;
      uniform float speed;
      varying vec2 vUv;
      varying float vFacing;
      float h(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        float flow = noise(vec2(vUv.x*7.,vUv.y*12.+time*speed))*.6
                   + noise(vec2(vUv.x*15.,vUv.y*28.+time*speed*1.9))*.4;
        float core = pow(vFacing,1.6);
        float a = core*(.3+flow*.95)*(.55+.45*power);
        gl_FragColor = vec4(color*(1.+core*.9)*a,a);
      }`,
    transparent:true, depthWrite:false, side:T.DoubleSide, blending:T.AdditiveBlending,
  })
}
