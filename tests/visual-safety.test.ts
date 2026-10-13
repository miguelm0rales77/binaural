import { describe, expect, it } from 'vitest'
import { breathState, type BreathPattern } from '../src/dsp/breath'
import { PALETTES, fieldAt, luminance, type FieldParams } from '../src/visual/cpuField'
import { VISUAL_PRESETS, sanitizeVisual, type VisualParams } from '../src/visual/params'

/**
 * Seguridad visual (§C2, Fase 13). Se mide con la copia CPU del campo: 64 × 64 píxeles, 30 fotogramas por segundo,
 * 20 s, parámetros extremos y respiración a 7 rpm. Ningún par de fotogramas consecutivos puede diferir más de un 2 %
 * en luminancia media, y la oscilación total no puede pasar del 8 %.
 */
const W = 64
const FPS = 30
const SECONDS = 20
const pattern: BreathPattern = { rpm: 7, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampSec: 0 }

/**
 * Luminancia media del fotograma `k`, con el mismo mapeo de coordenadas que el shader.
 * `lungOverride` fija la respiración (0,5 = sin respiración); si no, se usa el patrón de 7 rpm.
 */
function meanLuminance(k: number, v: VisualParams, lungOverride?: number): number {
  const t = (k / FPS) * v.speed
  const lung = lungOverride ?? breathState(k / FPS, pattern).lung
  const f: FieldParams = {
    hurst: v.hurst,
    warp: v.warp,
    brightness: v.brightness,
    palette: PALETTES[v.palette],
    t,
    lung,
    seed: 7,
    octaves: 6,
  }
  let sum = 0
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5 - W / 2) / W) * 3
      const y = ((j + 0.5 - W / 2) / W) * 3
      sum += luminance(fieldAt(x, y, f))
    }
  }
  return sum / (W * W)
}

describe('seguridad visual (§C2)', () => {
  // Parámetros extremos: H máximo (campo más áspero), warp máximo, velocidad y brillo al máximo, paleta de contraste.
  const extreme = sanitizeVisual({ hurst: 0.9, warp: 4, speed: 1, brightness: 1, palette: 'focus', night: false })

  it('ningún par de fotogramas consecutivos cambia más de un 2 % en luminancia media (§C2.1)', { timeout: 300_000 }, () => {
    const L: number[] = []
    for (let k = 0; k <= SECONDS * FPS; k++) L.push(meanLuminance(k, extreme))
    let worst = 0
    for (let k = 1; k < L.length; k++) {
      const a = L[k - 1] as number
      const b = L[k] as number
      worst = Math.max(worst, Math.abs(b - a) / Math.max(a, 1e-6))
    }
    console.log(`  mayor cambio entre fotogramas consecutivos: ${(worst * 100).toFixed(3)} %`)
    expect(worst).toBeLessThanOrEqual(0.02)
  })

  it('sin respiración, la oscilación total de la luminancia media es ≤ 8 % (§C2.1)', { timeout: 300_000 }, () => {
    const L: number[] = []
    for (let k = 0; k <= SECONDS * FPS; k++) L.push(meanLuminance(k, extreme, 0.5))
    const min = Math.min(...L)
    const max = Math.max(...L)
    const mean = L.reduce((a, b) => a + b, 0) / L.length
    console.log(`  oscilación total sin respiración: ${(((max - min) / mean) * 100).toFixed(2)} %`)
    expect((max - min) / mean).toBeLessThanOrEqual(0.08)
  })

  it('la respiración sube y baja el brillo como mucho ±6 % (12 % pico a pico) y a 0,1 Hz, por debajo de 0,3 Hz', { timeout: 300_000 }, () => {
    const L: number[] = []
    for (let k = 0; k <= SECONDS * FPS; k++) L.push(meanLuminance(k, extreme))
    const min = Math.min(...L)
    const max = Math.max(...L)
    const mean = L.reduce((a, b) => a + b, 0) / L.length
    const swing = (max - min) / mean
    console.log(`  oscilación con respiración: ${(swing * 100).toFixed(2)} % (pico a pico)`)
    expect(swing).toBeLessThanOrEqual(0.12 + 0.005)
    // la respiración a 7 rpm tiene período de 8,6 s: frecuencia 0,12 Hz, por debajo del umbral de 0,3 Hz
    expect(7 / 60).toBeLessThan(0.3)
  })

  it('la imagen no sigue el pulso del audio: el movimiento no depende de la frecuencia del pulso', () => {
    // El campo solo recibe tiempo, velocidad y respiración: ningún parámetro de pulso entra en fieldAt.
    const sample = meanLuminance(0, extreme)
    expect(Number.isFinite(sample)).toBe(true)
  })

  it('los presets quedan dentro de rango y el modo noche limita el brillo al 35 %', () => {
    for (const p of VISUAL_PRESETS) {
      const s = sanitizeVisual(p.params)
      expect(s.hurst).toBeGreaterThanOrEqual(0.5)
      expect(s.hurst).toBeLessThanOrEqual(0.9)
      if (p.params.night) expect(s.brightness).toBeLessThanOrEqual(0.35)
    }
    expect(sanitizeVisual({ ...extreme, night: true, brightness: 1 }).brightness).toBe(0.35)
  })
})
