/**
 * Campo fractal en TypeScript puro (Bloque C, §C3 del plan). Es la copia exacta del shader de
 * `shaders/fractal.frag.glsl`: sirve para las pruebas de seguridad visual (Fase 13) y de dimensión
 * fractal (Fase 14). Si cambias el shader, cambia también esto.
 */

export type Vec3 = readonly [number, number, number]

/** Paleta coseno: col = a + b·cos(2π·(c·t + d)), por canal. */
export interface Palette {
  a: Vec3
  b: Vec3
  c: Vec3
  d: Vec3
}

export interface FieldParams {
  /** Exponente de Hurst H ∈ [0,5, 0,9]. gain = 2^(−H). */
  hurst: number
  /** Intensidad del domain warping, 0–4. */
  warp: number
  /** Brillo 0–1 (en modo noche, máximo 0,35). */
  brightness: number
  palette: Palette
  /** Tiempo de la escena (s), ya multiplicado por la velocidad. */
  t: number
  /** Respiración 0–1 (llenado pulmonar); 0,5 si no hay respiración. */
  lung: number
  seed: number
  octaves: number
}

const ROT_C = Math.cos((37 * Math.PI) / 180)
const ROT_S = Math.sin((37 * Math.PI) / 180)
const TWO_PI = 6.28318

/** Hash entero de 32 bits (idéntico al del shader, con wraparound). Devuelve un uint32. */
export function hash(x: number, y: number): number {
  let a = x >>> 0
  let b = y >>> 0
  a = (Math.imul(a, 1664525) + 1013904223) >>> 0
  b = (Math.imul(b, 1664525) + 1013904223) >>> 0
  a = (a + Math.imul(b, 1664525)) >>> 0
  b = (b + Math.imul(a, 1664525)) >>> 0
  a = (a ^ (a >>> 16)) >>> 0
  b = (b ^ (b >>> 16)) >>> 0
  a = (a + Math.imul(b, 1664525)) >>> 0
  b = (b + Math.imul(a, 1664525)) >>> 0
  a = (a ^ (a >>> 16)) >>> 0
  b = (b ^ (b >>> 16)) >>> 0
  return (a ^ b) >>> 0
}

/** Ocho direcciones unitarias para el ruido de gradiente. */
const DIRS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, k) => [
  Math.cos((k * Math.PI) / 4),
  Math.sin((k * Math.PI) / 4),
])

function gradDot(ix: number, iy: number, seed: number, dx: number, dy: number): number {
  const g = DIRS[hash(ix + seed, iy + seed) & 7] as readonly [number, number]
  return g[0] * dx + g[1] * dy
}

const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Ruido de gradiente 2D con interpolación quíntica. Rango aproximado ±0,7. */
export function noise2(px: number, py: number, seed: number): number {
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  const fx = px - ix
  const fy = py - iy
  const d00 = gradDot(ix, iy, seed, fx, fy)
  const d10 = gradDot(ix + 1, iy, seed, fx - 1, fy)
  const d01 = gradDot(ix, iy + 1, seed, fx, fy - 1)
  const d11 = gradDot(ix + 1, iy + 1, seed, fx - 1, fy - 1)
  const u = quintic(fx)
  const v = quintic(fy)
  const x0 = d00 + u * (d10 - d00)
  const x1 = d01 + u * (d11 - d01)
  return x0 + v * (x1 - x0)
}

/** fBm: suma de octavas con rotación fija de 37° y lacunaridad 2; devuelve la media ponderada. */
export function fbm(px: number, py: number, gain: number, octaves: number, seed: number): number {
  let a = 1
  let s = 0
  let n = 0
  let x = px
  let y = py
  for (let i = 0; i < octaves; i++) {
    s += a * noise2(x, y, seed)
    n += a
    const rx = (ROT_C * x - ROT_S * y) * 2
    const ry = (ROT_S * x + ROT_C * y) * 2
    x = rx
    y = ry
    a *= gain
  }
  return s / n
}

/** Paletas de §C4. La noche es ámbar oscuro; ningún azul saturado. */
export const PALETTES: Record<'calm' | 'focus' | 'depth' | 'night' | 'neutral' | 'teal', Palette> = {
  calm: { a: [0.28, 0.5, 0.52], b: [0.12, 0.2, 0.2], c: [1, 1, 1], d: [0.5, 0.6, 0.7] },
  focus: { a: [0.5, 0.5, 0.5], b: [0.12, 0.12, 0.12], c: [1, 1, 1], d: [0, 0.1, 0.2] },
  depth: { a: [0.3, 0.25, 0.45], b: [0.2, 0.15, 0.3], c: [1, 1, 1], d: [0.55, 0.6, 0.85] },
  night: { a: [0.35, 0.2, 0.08], b: [0.2, 0.12, 0.06], c: [1, 0.7, 0.4], d: [0, 0.1, 0.2] },
  neutral: { a: [0.5, 0.5, 0.5], b: [0.2, 0.2, 0.2], c: [1, 1, 1], d: [0.3, 0.2, 0.2] },
  teal: { a: [0.35, 0.5, 0.5], b: [0.2, 0.2, 0.2], c: [1, 1, 1], d: [0.4, 0.6, 0.7] },
}

export function palette(p: Palette, t: number): [number, number, number] {
  const ch = (k: 0 | 1 | 2) =>
    (p.a[k] as number) + (p.b[k] as number) * Math.cos(TWO_PI * ((p.c[k] as number) * t + (p.d[k] as number)))
  return [ch(0), ch(1), ch(2)]
}

/** Valor escalar del campo en un punto (fBm del último nivel de warping), antes de colorear. */
export interface Warped {
  v: number
  lenQ: number
  r0: number
  breath: number
}

/**
 * Cálculo del campo: domain warping de tres niveles. La respiración modula el warp (±10 %), la escala (±3 %) y,
 * más tarde, el brillo (±6 %). Es el mismo cálculo que el shader.
 */
export function warpedAt(x: number, y: number, f: FieldParams): Warped {
  const gain = Math.pow(2, -f.hurst)
  const breath = 2 * f.lung - 1
  const warp = f.warp * (1 + 0.1 * breath)
  // escala: pequeña expansión con la respiración
  const px = x * (1 - 0.03 * breath)
  const py = y * (1 - 0.03 * breath)
  const t = f.t
  const q0 = fbm(px + t * 0.01, py + t * 0.01, gain, f.octaves, f.seed)
  const q1 = fbm(px + 5.2 - t * 0.008, py + 1.3 - t * 0.008, gain, f.octaves, f.seed)
  const r0 = fbm(px + warp * q0 + 1.7, py + warp * q1 + 9.2, gain, f.octaves, f.seed)
  const r1 = fbm(px + warp * q0 + 8.3, py + warp * q1 + 2.8, gain, f.octaves, f.seed)
  const v = fbm(px + warp * r0, py + warp * r1, gain, f.octaves, f.seed)
  return { v, lenQ: Math.hypot(q0, q1), r0, breath }
}

/** Escalar del campo en un punto (lo usa la medida de dimensión). */
export function fieldScalar(x: number, y: number, f: FieldParams): number {
  return warpedAt(x, y, f).v
}

/**
 * Color de un punto del plano. Mezcla la paleta del valor con la de |q| y modula el brillo con r.x
 * (el mismo cálculo que el shader).
 */
export function fieldAt(x: number, y: number, f: FieldParams): [number, number, number] {
  const w = warpedAt(x, y, f)
  const base = palette(f.palette, w.v)
  const second = palette(f.palette, w.lenQ * 0.5)
  const m = Math.min(1, Math.max(0, 0.5 + 0.5 * w.r0))
  const bright = f.brightness * (1 + 0.06 * w.breath) * (0.8 + 0.4 * m)
  return [
    clamp01(mix(base[0], second[0], 0.35) * bright),
    clamp01(mix(base[1], second[1], 0.35) * bright),
    clamp01(mix(base[2], second[2], 0.35) * bright),
  ]
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Luminancia relativa (Rec. 709) de un color RGB en 0–1. */
export const luminance = (c: readonly [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
