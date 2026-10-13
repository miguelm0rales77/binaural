/**
 * Copia exacta en TypeScript del shader `fractal.frag.glsl`: hash entero, ruido de gradiente, fBm y
 * domain warping. Sirve para medir (tests de destellos y de dimensión fractal) sin GPU. Mismas fórmulas,
 * distinta precisión (doble frente a float de la GPU): las comparaciones usan tolerancias.
 */
import { gainFromHurst, type VisualSettings } from './fractalParams'

const M = 1664525
const C = 1013904223
const ROT_C = 0.7986
const ROT_S = 0.6018

/** Hash entero de dos componentes sin signo (idéntico al de GLSL, con aritmética de 32 bits). */
export function hash(x0: number, y0: number): number {
  let x = (Math.imul(x0 >>> 0, M) + C) >>> 0
  let y = (Math.imul(y0 >>> 0, M) + C) >>> 0
  x = (x + Math.imul(y, M)) >>> 0
  y = (y + Math.imul(x, M)) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  y = (y ^ (y >>> 16)) >>> 0
  x = (x + Math.imul(y, M)) >>> 0
  y = (y + Math.imul(x, M)) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  y = (y ^ (y >>> 16)) >>> 0
  return (x ^ y) >>> 0
}

/** Gradiente de una esquina: una de 8 direcciones. */
function grad(cx: number, cy: number): [number, number] {
  const a = (hash(cx, cy) & 7) * 0.78539816
  return [Math.cos(a), Math.sin(a)]
}

/** Ruido de gradiente 2D con interpolación quíntica. `seed` se suma a las coordenadas de celda. */
export function noise(px: number, py: number, seed: number): number {
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  const fx = px - ix
  const fy = py - iy
  const cx = (ix + seed) >>> 0
  const cy = (iy + seed) >>> 0
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const g00 = grad(cx, cy)
  const g10 = grad((cx + 1) >>> 0, cy)
  const g01 = grad(cx, (cy + 1) >>> 0)
  const g11 = grad((cx + 1) >>> 0, (cy + 1) >>> 0)
  const a = g00[0] * fx + g00[1] * fy
  const b = g10[0] * (fx - 1) + g10[1] * fy
  const c = g01[0] * fx + g01[1] * (fy - 1)
  const d = g11[0] * (fx - 1) + g11[1] * (fy - 1)
  const x1 = a + (b - a) * ux
  const x2 = c + (d - c) * ux
  return x1 + (x2 - x1) * uy
}

/** fBm con rotación fija de ~37° y frecuencia doble por octava. */
export function fbm(px: number, py: number, gain: number, octaves: number, seed: number): number {
  let a = 1
  let s = 0
  let n = 0
  let x = px
  let y = py
  for (let i = 0; i < octaves; i++) {
    s += a * noise(x, y, seed)
    n += a
    const rx = ROT_C * x - ROT_S * y
    const ry = ROT_S * x + ROT_C * y
    x = rx * 2
    y = ry * 2
    a *= gain
  }
  return s / n
}

export interface CpuFrame {
  /** Tiempo del campo (ya con la velocidad aplicada). */
  t: number
  /** Pulmón 0–1 (0,5 = neutro). */
  lung: number
}

/** Color RGB (0–1) del píxel `(x, y)` de una imagen de `w × h`, como en `main()` del shader. */
export function pixelColor(x: number, y: number, w: number, h: number, s: VisualSettings, f: CpuFrame, octaves: number): [number, number, number] {
  const gain = gainFromHurst(s.hurst)
  const seed = s.seed
  const breath = f.lung - 0.5
  const scale = 3 / h
  let px = (x + 0.5 - 0.5 * w) * scale
  let py = (y + 0.5 - 0.5 * h) * scale
  px *= 1 + 0.06 * breath
  py *= 1 + 0.06 * breath
  const warp = s.warp * (1 + 0.2 * breath)

  // Como en el shader: la primera deriva suma a ambas coordenadas (u_t·0,010), la segunda resta (u_t·0,008)
  const qx = fbm(px + f.t * 0.01, py + f.t * 0.01, gain, octaves, seed)
  const qy = fbm(px + 5.2 - f.t * 0.008, py + 1.3 - f.t * 0.008, gain, octaves, seed)
  const rx = fbm(px + warp * qx + 1.7, py + warp * qy + 9.2, gain, octaves, seed)
  const ry = fbm(px + warp * qx + 8.3, py + warp * qy + 2.8, gain, octaves, seed)
  const v = fbm(px + warp * rx, py + warp * ry, gain, octaves, seed)

  const tp = 0.5 + 0.9 * v + 0.25 * (Math.hypot(qx, qy) - 0.5) + 0.15 * rx
  const bright = s.brightness * (1 + 0.06 * breath)
  const pal = s.palette
  const ch = (k: 0 | 1 | 2) => {
    const c = pal.a[k] + pal.b[k] * Math.cos(2 * Math.PI * (pal.c[k] * tp + pal.d[k]))
    return Math.max(0, Math.min(1, c * bright))
  }
  return [ch(0), ch(1), ch(2)]
}

/** Luminancia relativa (Rec. 709) de un píxel. */
export const luminance = (c: readonly [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** Luminancia media de una imagen completa (`w × h`). */
export function meanLuminance(w: number, h: number, s: VisualSettings, f: CpuFrame, octaves: number): number {
  let sum = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sum += luminance(pixelColor(x, y, w, h, s, f, octaves))
  return sum / (w * h)
}
