import { describe, expect, it } from 'vitest'
import { fieldScalar, PALETTES, type FieldParams } from '../src/visual/cpuField'
import { VISUAL_PRESETS } from '../src/visual/params'

/**
 * Dimensión fractal por box-counting (§C5, Fase 14). Campo de 1024 × 1024 píxeles con la misma escala que el
 * shader (3 unidades de campo en la altura), umbral en la mediana, borde con vecindad 4, cajas de 2 a 256 px y
 * cuatro desplazamientos de rejilla (se toma el recuento mínimo por tamaño). D es la pendiente de log N(ε)
 * frente a log(1/ε).
 */
const N = 1024
const SCALE = 3
const SIZES = [2, 4, 8, 16, 32, 64, 128, 256]

function fieldGrid(f: Pick<FieldParams, 'hurst' | 'warp' | 'octaves' | 'seed'>): Uint8Array {
  const vals = new Float64Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5 - N / 2) / N) * SCALE
      const y = ((j + 0.5 - N / 2) / N) * SCALE
      vals[j * N + i] = fieldScalar(x, y, {
        ...f,
        t: 0,
        lung: 0.5,
        brightness: 1,
        palette: PALETTES.neutral,
      })
    }
  }
  // umbral en la mediana: cada píxel queda dentro (1) o fuera (0) del conjunto
  const sorted = Float64Array.from(vals).sort()
  const median = sorted[(N * N) >> 1] as number
  const cls = new Uint8Array(N * N)
  for (let k = 0; k < N * N; k++) cls[k] = (vals[k] as number) > median ? 1 : 0
  return cls
}

/** Píxeles de borde: los que tienen un vecino con la otra clase (vecindad 4). */
function boundary(cls: Uint8Array): Uint8Array {
  const b = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      const c = cls[k]
      const differs =
        (i > 0 && cls[k - 1] !== c) ||
        (i < N - 1 && cls[k + 1] !== c) ||
        (j > 0 && cls[k - N] !== c) ||
        (j < N - 1 && cls[k + N] !== c)
      if (differs) b[k] = 1
    }
  }
  return b
}

/** Número de cajas de tamaño `s` (con desplazamiento ox, oy) que contienen algún píxel de borde. */
function countBoxes(b: Uint8Array, s: number, ox: number, oy: number): number {
  const nx = Math.ceil((N + ox) / s)
  const ny = Math.ceil((N + oy) / s)
  const hit = new Uint8Array(nx * ny)
  for (let j = 0; j < N; j++) {
    const by = Math.floor((j + oy) / s)
    for (let i = 0; i < N; i++) {
      if (b[j * N + i]) hit[by * nx + Math.floor((i + ox) / s)] = 1
    }
  }
  let c = 0
  for (let k = 0; k < hit.length; k++) c += hit[k] as number
  return c
}

/** N(s) mínimo sobre cuatro desplazamientos de rejilla. */
function boxCount(b: Uint8Array, s: number): number {
  const h = s / 2
  const offsets: Array<[number, number]> = [
    [0, 0],
    [h, 0],
    [0, h],
    [h, h],
  ]
  return Math.min(...offsets.map(([ox, oy]) => countBoxes(b, s, ox, oy)))
}

/** Dimensión: −pendiente de log N(s) frente a log s (equivale a la pendiente frente a log(1/s)). */
export function boxDimension(cls: Uint8Array): number {
  const b = boundary(cls)
  const xs: number[] = []
  const ys: number[] = []
  for (const s of SIZES) {
    xs.push(Math.log(1 / s))
    ys.push(Math.log(boxCount(b, s)))
  }
  const mx = xs.reduce((a, c) => a + c, 0) / xs.length
  const my = ys.reduce((a, c) => a + c, 0) / ys.length
  let num = 0
  let den = 0
  for (let k = 0; k < xs.length; k++) {
    num += ((xs[k] as number) - mx) * ((ys[k] as number) - my)
    den += ((xs[k] as number) - mx) ** 2
  }
  return num / den
}

describe('dimensión fractal (box-counting)', () => {
  // Campo de 1024 × 1024 con fBm de 6 octavas: unos segundos por campo en Node.
  const cache = new Map<string, number>()
  const dimOf = (name: string, hurst: number, warp: number, octaves: number, seed: number) => {
    const key = `${name}|${hurst}|${warp}|${octaves}|${seed}`
    if (!cache.has(key)) cache.set(key, boxDimension(fieldGrid({ hurst, warp, octaves, seed })))
    return cache.get(key) as number
  }

  it('cada preset da 1,25 ≤ D ≤ 1,55 con sus octavas (ver DECISIONES.md, Fase 14)', { timeout: 300_000 }, () => {
    for (const p of VISUAL_PRESETS) {
      const d = dimOf(p.id, p.params.hurst, p.params.warp, p.params.octaves, p.params.seed)
      console.log(`  ${p.name}: H=${p.params.hurst} warp=${p.params.warp} octavas=${p.params.octaves} → D = ${d.toFixed(3)}`)
      expect(d).toBeGreaterThanOrEqual(1.25)
      expect(d).toBeLessThanOrEqual(1.55)
    }
  })

  it('D(H = 0,4) > D(H = 0,65) > D(H = 0,9) (mismo warp y 2 octavas)', { timeout: 300_000 }, () => {
    const d04 = dimOf('h', 0.4, 2.5, 2, 7)
    const d065 = dimOf('h', 0.65, 2.5, 2, 7)
    const d09 = dimOf('h', 0.9, 2.5, 2, 7)
    console.log(`  D(0,4) = ${d04.toFixed(3)}, D(0,65) = ${d065.toFixed(3)}, D(0,9) = ${d09.toFixed(3)}`)
    expect(d04).toBeGreaterThan(d065)
    expect(d065).toBeGreaterThan(d09)
  })
})
