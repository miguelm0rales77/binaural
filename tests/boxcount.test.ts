import { describe, expect, it } from 'vitest'
import { fieldValue } from '../src/visual/cpuField'
import { contourMask, fractalDimension } from '../src/visual/boxCount'
import { VISUAL_PRESETS, sanitizeVisual, type VisualSettings } from '../src/visual/fractalParams'

const N = 1024
const OCTAVES = 3

/** Dimensión de un campo 1024×1024 (fotograma fijo, sin respiración). Cacheada: cada campo cuesta unos segundos. */
const cache = new Map<string, number>()
function dimension(key: string, s: VisualSettings): number {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const v = new Float64Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) v[y * N + x] = fieldValue(x, y, N, N, s, { t: 0, lung: 0.5 }, OCTAVES)
  const d = fractalDimension(contourMask(v, N, N), N, N)
  cache.set(key, d)
  return d
}

const base = (over: Partial<VisualSettings>): VisualSettings =>
  sanitizeVisual({
    hurst: 0.65,
    warp: 2.5,
    speed: 1,
    brightness: 1,
    palette: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] },
    night: false,
    seed: 7,
    ...over,
  })

describe('dimensión fractal del campo (box-counting)', () => {
  it('cada preset de la tabla C4 da 1,25 ≤ D ≤ 1,55 (3 octavas)', { timeout: 900_000 }, () => {
    for (const p of VISUAL_PRESETS) {
      const d = dimension(p.id, base({ hurst: p.hurst, warp: p.warp, speed: p.speed }))
      expect(d, `D de «${p.name}» (H ${p.hurst}, deformación ${p.warp})`).toBeGreaterThanOrEqual(1.25)
      expect(d, `D de «${p.name}» (H ${p.hurst}, deformación ${p.warp})`).toBeLessThanOrEqual(1.55)
    }
  })

  it('la dimensión baja al subir H: D(0,40) > D(0,65) > D(0,90)', { timeout: 900_000 }, () => {
    const d40 = dimension('H0.40', base({ hurst: 0.4 }))
    const d65 = dimension('H0.65', base({ hurst: 0.65 }))
    const d90 = dimension('H0.90', base({ hurst: 0.9 }))
    expect(d40).toBeGreaterThan(d65)
    expect(d65).toBeGreaterThan(d90)
  })
})
