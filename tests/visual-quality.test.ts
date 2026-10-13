import { describe, expect, it } from 'vitest'
import { hash, noise2 } from '../src/visual/cpuField'
import { approach } from '../src/visual/params'
import { QualityGovernor, baseResolution } from '../src/visual/quality'

/** Simula `seconds` de fotogramas a `fps` y devuelve la calidad al final. */
function run(gov: QualityGovernor, fps: number, seconds: number, start = 0) {
  let t = start
  let q = gov.quality()
  const frames = Math.round(fps * seconds)
  for (let k = 0; k < frames; k++) {
    t += 1000 / fps
    q = gov.onFrame(t)
  }
  return { q, t }
}

describe('calidad adaptativa (§C3)', () => {
  it('a 60 fps se mantiene la calidad completa', () => {
    const { q } = run(new QualityGovernor(false), 60, 4)
    expect(q).toEqual({ scale: 1, octaves: 6, degraded: false })
  })

  it('por debajo de 50 fps (media de 2 s) baja a 0,45 y quita una octava', () => {
    const { q } = run(new QualityGovernor(false), 40, 4)
    expect(q).toEqual({ scale: 0.45, octaves: 5, degraded: true })
  })

  it('en móvil parte de 5 octavas y, si degrada, usa 4', () => {
    expect(new QualityGovernor(true).quality().octaves).toBe(5)
    const { q } = run(new QualityGovernor(true), 30, 4)
    expect(q.octaves).toBe(4)
  })

  it('una vez degradada no vuelve a subir (no alterna calidades mientras se mira)', () => {
    const gov = new QualityGovernor(false)
    const { t } = run(gov, 40, 3)
    const { q } = run(gov, 60, 4, t)
    expect(q.degraded).toBe(true)
  })

  it('la resolución base es min(dpr, 1,5) × 0,6', () => {
    expect(baseResolution(1)).toBeCloseTo(0.6, 10)
    expect(baseResolution(2)).toBeCloseTo(0.9, 10)
  })
})

describe('interpolación de parámetros (§C4)', () => {
  it('a los 3 s el valor está al 95 % del cambio (τ = 1 s)', () => {
    let v = 0
    for (let k = 0; k < 3 * 60; k++) v = approach(v, 1, 1 / 60)
    expect(v).toBeGreaterThan(0.94)
    expect(v).toBeLessThan(0.96)
  })
})

describe('hash y ruido (copia CPU del shader)', () => {
  it('el hash es determinista y de 32 bits', () => {
    expect(hash(3, 7)).toBe(hash(3, 7))
    expect(hash(3, 7)).toBeGreaterThanOrEqual(0)
    expect(hash(3, 7)).toBeLessThan(2 ** 32)
    expect(hash(3, 7)).not.toBe(hash(7, 3))
  })

  it('el ruido de gradiente vale 0 en los nodos de la rejilla', () => {
    expect(noise2(3, 4, 7)).toBeCloseTo(0, 12)
    expect(noise2(-2, 5, 7)).toBeCloseTo(0, 12)
  })
})
