import { describe, expect, it } from 'vitest'
import { SWEEP_HZ, SWEEP_PERIOD_MS, envelopeAt, sweepPosition } from '../src/viz'

/** Cuenta los mínimos locales (lóbulos) de la envolvente en una ventana de 1 s. */
function lobes(mode: 'binaural' | 'isochronic', beatHz: number, depth = 0.9): number {
  const n = 4000
  const v = Array.from({ length: n + 1 }, (_, i) => envelopeAt(mode, beatHz, depth, i / n))
  let minima = 0
  for (let i = 1; i < n; i++) if ((v[i] as number) < (v[i - 1] as number) && (v[i] as number) <= (v[i + 1] as number)) minima++
  return minima
}

describe('visualización del pulso', () => {
  it('binaural/monaural: |cos(πΔf·t)| — 1 al empezar, 0 a medio ciclo, siempre en [0, 1]', () => {
    expect(envelopeAt('binaural', 10, 0.8, 0)).toBeCloseTo(1, 10)
    expect(envelopeAt('binaural', 10, 0.8, 0.05)).toBeCloseTo(0, 10) // 1/(2·10) s
    expect(envelopeAt('monaural', 10, 0.8, 0.1)).toBeCloseTo(1, 10)
    for (let i = 0; i <= 100; i++) {
      const v = envelopeAt('binaural', 7.3, 0.8, i / 100)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('isocrónico: mínimo 1−D, máximo 1, igual que la envolvente del audio', () => {
    expect(envelopeAt('isochronic', 4, 0.9, 0)).toBeCloseTo(0.1, 10)
    expect(envelopeAt('isochronic', 4, 0.9, 0.125)).toBeCloseTo(1, 10) // medio periodo de 4 Hz
  })

  it.each([0.5, 2, 6, 10, 16, 40])('el patrón de %f Hz tiene ese número de lóbulos por segundo', (hz) => {
    // (±1: en los extremos de la ventana un lóbulo puede quedar cortado)
    expect(Math.abs(lobes('binaural', hz) - hz)).toBeLessThanOrEqual(1)
  })

  it('el punto recorre el patrón una vez por segundo: nada cambia de posición a más de 3 Hz', () => {
    expect(SWEEP_PERIOD_MS).toBe(1000)
    expect(SWEEP_HZ).toBeLessThanOrEqual(3)
    expect(sweepPosition(0)).toBe(0)
    expect(sweepPosition(250)).toBeCloseTo(0.25, 10)
    expect(sweepPosition(1000)).toBe(0)
    expect(sweepPosition(1999)).toBeCloseTo(0.999, 10)
  })

  it('el brillo del patrón no depende del instante: la forma solo depende de modo, pulso y profundidad', () => {
    // la única cosa que se mueve es el punto (sweepPosition); envelopeAt no recibe el tiempo absoluto
    expect(envelopeAt('binaural', 12, 0.8, 0.37)).toBe(envelopeAt('binaural', 12, 0.8, 0.37))
    expect(envelopeAt.length).toBe(4)
  })
})
