import { describe, expect, it } from 'vitest'
import { breathState, type BreathPattern } from '../src/dsp/breath'
import { motionScale, sanitizeVisual, NIGHT_MAX_BRIGHTNESS, type VisualSettings } from '../src/visual/fractalParams'
import { meanLuminance, type CpuFrame } from '../src/visual/cpuField'

const W = 64
const FPS = 30
const SECONDS = 20
const OCTAVES = 6

const base: VisualSettings = {
  hurst: 0.4, // el más áspero: más detalle y más cambio por píxel
  warp: 4,
  speed: 2,
  brightness: 1,
  palette: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] }, // contraste alto
  night: false,
  seed: 11,
}

const pattern: BreathPattern = { rpm: 7, inhaleRatio: 0.5, holdInSec: 0, holdOutSec: 0 } // extremo: el ritmo más rápido permitido

/** Luminancia media fotograma a fotograma durante 20 s (64×64, 30 fps, respiración a 7 rpm). */
function series(s: VisualSettings): number[] {
  const out: number[] = []
  for (let i = 0; i < FPS * SECONDS; i++) {
    const tSec = i / FPS
    const f: CpuFrame = { t: tSec * s.speed, lung: breathState(tSec, pattern).lung }
    out.push(meanLuminance(W, W, s, f, OCTAVES))
  }
  return out
}

describe('seguridad visual (WCAG 2.3.1)', () => {
  const s = sanitizeVisual(base)
  const lum = series(s)
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length

  it('dos fotogramas seguidos no difieren más de un 2 % en luminancia media', () => {
    let worst = 0
    for (let i = 1; i < lum.length; i++) worst = Math.max(worst, Math.abs((lum[i] as number) - (lum[i - 1] as number)) / mean)
    expect(worst).toBeLessThan(0.02)
  })

  it('la oscilación total de la luminancia media es de como mucho un 8 %', () => {
    const range = Math.max(...lum) - Math.min(...lum)
    expect(range / mean).toBeLessThanOrEqual(0.08)
  })

  it('no hay más de 3 cambios bruscos por segundo (saltos de más de un 2 %)', () => {
    for (let sec = 0; sec < SECONDS; sec++) {
      let jumps = 0
      for (let i = sec * FPS + 1; i < (sec + 1) * FPS; i++) {
        if (Math.abs((lum[i] as number) - (lum[i - 1] as number)) / mean > 0.02) jumps++
      }
      expect(jumps).toBeLessThanOrEqual(3)
    }
  })
})

describe('modo noche y movimiento reducido', () => {
  it('el modo noche limita el brillo al 35 %', () => {
    const night = sanitizeVisual({ ...base, night: true, brightness: 1 })
    expect(night.brightness).toBeLessThanOrEqual(NIGHT_MAX_BRIGHTNESS)
    expect(night.brightness).toBeCloseTo(NIGHT_MAX_BRIGHTNESS, 9)
  })

  it('con «reducir movimiento» el fractal se mueve a una décima parte', () => {
    expect(motionScale(false)).toBe(1)
    expect(motionScale(true)).toBeCloseTo(0.1, 9)
  })
})
