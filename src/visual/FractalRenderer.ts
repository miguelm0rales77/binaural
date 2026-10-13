/**
 * Renderizador WebGL2 del fractal. Un único shader a pantalla completa (un triángulo que cubre el viewport).
 * Sin librerías. Si no hay WebGL2, `FractalRenderer.supported()` da false y la interfaz usa un degradado CSS.
 */
import fragSrc from './shaders/fractal.frag.glsl?raw'
import type { VisualSettings } from './fractalParams'

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export interface FrameState {
  /** Tiempo del campo en segundos (ya multiplicado por la velocidad). */
  t: number
  /** Pulmón 0–1 (0,5 = neutro, sin respiración). */
  lung: number
  settings: VisualSettings
}

/** Resolución interna: min(devicePixelRatio, 1,5) × 0,6 (alta calidad) o × 0,45 (calidad reducida). */
export const RENDER_SCALE = 0.6
export const LOW_RENDER_SCALE = 0.45
export const OCTAVES_DESKTOP = 6
export const OCTAVES_MOBILE = 5

export class FractalRenderer {
  private readonly gl: WebGL2RenderingContext
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private loc: Record<string, WebGLUniformLocation | null> = {}
  private octaves: number
  private quality: 'high' | 'low' = 'high'
  private cssW = 1
  private cssH = 1
  private dpr = 1

  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, octaves: number = OCTAVES_DESKTOP) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false })
    if (!gl) throw new Error('WebGL2 no disponible')
    this.gl = gl
    this.octaves = octaves
    this.build()
  }

  static supported(): boolean {
    try {
      const c = document.createElement('canvas')
      return !!c.getContext('webgl2')
    } catch {
      return false
    }
  }

  private shader(type: number, src: string): WebGLShader {
    const gl = this.gl
    const s = gl.createShader(type)
    if (!s) throw new Error('No se pudo crear el shader')
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) ?? 'error desconocido'
      gl.deleteShader(s)
      throw new Error(`Shader: ${log}`)
    }
    return s
  }

  /** Compila el programa con el número de octavas actual. */
  private build(): void {
    const gl = this.gl
    const vs = this.shader(gl.VERTEX_SHADER, VERT)
    const fs = this.shader(gl.FRAGMENT_SHADER, `#version 300 es\n#define OCTAVES ${this.octaves}\n` + fragSrc.replace(/^#version 300 es\n/, ''))
    const prog = gl.createProgram()
    if (!prog) throw new Error('No se pudo crear el programa')
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'a_pos')
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Programa: ${gl.getProgramInfoLog(prog) ?? ''}`)
    if (this.program) gl.deleteProgram(this.program)
    this.program = prog
    gl.useProgram(prog)
    for (const name of ['u_res', 'u_t', 'u_gain', 'u_warp', 'u_brightness', 'u_lung', 'u_pal', 'u_seed']) {
      this.loc[name] = gl.getUniformLocation(prog, name)
    }
    if (!this.vao) {
      this.vao = gl.createVertexArray()
      gl.bindVertexArray(this.vao)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    }
  }

  /** Calidad reducida (móviles o fotogramas lentos): escala menor y una octava menos. */
  setQuality(q: 'high' | 'low'): void {
    if (q === this.quality) return
    this.quality = q
    this.octaves = q === 'low' ? Math.max(3, OCTAVES_MOBILE - 1) : this.octaves
    this.build()
    this.resize(this.cssW, this.cssH, this.dpr)
  }

  /** Tamaño en píxeles CSS y densidad de píxeles del dispositivo. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW)
    this.cssH = Math.max(1, cssH)
    this.dpr = dpr
    const scale = (this.quality === 'low' ? LOW_RENDER_SCALE : RENDER_SCALE) * Math.min(dpr, 1.5)
    this.canvas.width = Math.max(1, Math.round(this.cssW * scale))
    this.canvas.height = Math.max(1, Math.round(this.cssH * scale))
  }

  render(f: FrameState): void {
    const gl = this.gl
    const s = f.settings
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.uniform2f(this.loc.u_res ?? null, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.loc.u_t ?? null, f.t)
    gl.uniform1f(this.loc.u_gain ?? null, Math.pow(2, -s.hurst))
    gl.uniform1f(this.loc.u_warp ?? null, s.warp)
    gl.uniform1f(this.loc.u_brightness ?? null, s.brightness)
    gl.uniform1f(this.loc.u_lung ?? null, f.lung)
    gl.uniform1ui(this.loc.u_seed ?? null, s.seed)
    const pal = new Float32Array([...s.palette.a, ...s.palette.b, ...s.palette.c, ...s.palette.d])
    gl.uniform3fv(this.loc.u_pal ?? null, pal)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    const gl = this.gl
    if (this.program) gl.deleteProgram(this.program)
    if (this.vao) gl.deleteVertexArray(this.vao)
    this.program = null
    this.vao = null
    this.loseContext()
  }

  private loseContext(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
