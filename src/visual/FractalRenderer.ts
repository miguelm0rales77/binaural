import fragSrc from './shaders/fractal.frag.glsl?raw'
import { PALETTES, type Palette } from './cpuField'
import { QualityGovernor, baseResolution } from './quality'
import { approach, paletteOf, type VisualParams } from './params'

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const UNIFORMS = [
  'u_t',
  'u_res',
  'u_gain',
  'u_warp',
  'u_brightness',
  'u_lung',
  'u_pa',
  'u_pb',
  'u_pc',
  'u_pd',
  'u_seed',
  'u_octaves',
] as const

/** Estado interpolado hacia el objetivo: se mueve con τ = 1 s, así que a los 3 s está al 95 %. */
interface Live {
  hurst: number
  warp: number
  speed: number
  brightness: number
  pal: number[] // a, b, c, d en 12 números
}

const flatten = (p: Palette): number[] => [...p.a, ...p.b, ...p.c, ...p.d]

/**
 * Renderizador WebGL2 de la vista fractal: un triángulo que cubre la pantalla y el shader de `shaders/`.
 * Pausa con la pestaña oculta, degrada la calidad si hace falta y sigue los parámetros con suavidad.
 */
export class FractalRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly lungSource: () => number
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly loc: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
  private readonly quality = new QualityGovernor()
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly seed = 7
  private target: VisualParams
  private live: Live
  private t = 0
  private last = 0
  private raf = 0
  private readonly onVisibility = () => (document.hidden ? this.stop() : this.start())

  /** `lungSource` devuelve el llenado pulmonar 0–1 en cada fotograma (0,5 si no hay respiración). */
  constructor(canvas: HTMLCanvasElement, lungSource: () => number, initial: VisualParams) {
    this.canvas = canvas
    this.lungSource = lungSource
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) throw new Error('webgl2-unavailable')
    this.gl = gl
    this.program = this.build(VERT, fragSrc)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const a = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    const loc = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
    for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(this.program, name)
    this.loc = loc
    this.target = initial
    const p = PALETTES[initial.palette]
    this.live = {
      hurst: initial.hurst,
      warp: initial.warp,
      speed: initial.speed,
      brightness: initial.brightness,
      pal: flatten(p),
    }
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** ¿Hay WebGL2 en este navegador? */
  static supported(): boolean {
    try {
      const c = document.createElement('canvas')
      return !!c.getContext('webgl2')
    } catch {
      return false
    }
  }

  /** Cambia el objetivo: los parámetros se interpolan durante unos 3 s. */
  setTarget(p: VisualParams): void {
    this.target = p
  }

  start(): void {
    if (this.raf || document.hidden) return
    this.last = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  dispose(): void {
    this.stop()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.gl.deleteProgram(this.program)
  }

  private build(vs: string, fs: string): WebGLProgram {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) throw new Error('shader')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile')
      return s
    }
    const p = gl.createProgram()
    if (!p) throw new Error('program')
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
    return p
  }

  private resize(scale: number): void {
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(this.canvas.clientWidth * baseResolution(dpr) * scale))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * baseResolution(dpr) * scale))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = this.last === 0 ? 0 : Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    const q = this.quality.onFrame(now)
    this.resize(q.scale)

    const motion = this.reduced.matches ? 0.1 : 1 // movimiento reducido: velocidad × 0,1 (§C2.3)
    const tg = this.target
    const L = this.live
    L.hurst = approach(L.hurst, tg.hurst, dt)
    L.warp = approach(L.warp, tg.warp, dt)
    L.speed = approach(L.speed, tg.speed, dt)
    L.brightness = approach(L.brightness, tg.brightness, dt)
    const goal = flatten(paletteOf(tg.palette))
    for (let i = 0; i < 12; i++) L.pal[i] = approach(L.pal[i] as number, goal[i] as number, dt)
    this.t += dt * L.speed * motion

    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    const u = this.loc
    gl.uniform1f(u.u_t, this.t)
    gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height)
    gl.uniform1f(u.u_gain, Math.pow(2, -L.hurst))
    gl.uniform1f(u.u_warp, L.warp)
    gl.uniform1f(u.u_brightness, L.brightness)
    gl.uniform1f(u.u_lung, this.lungSource())
    gl.uniform3f(u.u_pa, L.pal[0] as number, L.pal[1] as number, L.pal[2] as number)
    gl.uniform3f(u.u_pb, L.pal[3] as number, L.pal[4] as number, L.pal[5] as number)
    gl.uniform3f(u.u_pc, L.pal[6] as number, L.pal[7] as number, L.pal[8] as number)
    gl.uniform3f(u.u_pd, L.pal[9] as number, L.pal[10] as number, L.pal[11] as number)
    gl.uniform1i(u.u_seed, this.seed)
    // Octavas del preset; si se ha degradado, una menos (sin bajar de 1).
    gl.uniform1i(u.u_octaves, q.degraded ? Math.max(1, tg.octaves - 1) : tg.octaves)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
