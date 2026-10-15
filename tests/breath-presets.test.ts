import { describe, expect, it } from 'vitest'
import { BREATH_PRESETS, RESONANCE_PATTERN, customPattern, describeBreath, withinSafetyLimits } from '../src/breathPresets'
import { mergeParams } from '../src/dsp/params'
import { DEFAULT_PARAMS } from '../src/dsp/types'

describe('presets de respiración', () => {
  it('coinciden con el plan: resonancia 6, microdosis 3 min y pre-sueño con ruido marrón', () => {
    expect(BREATH_PRESETS.map((p) => p.name)).toEqual(['Resonancia 6', 'Microdosis 3 min', 'Pre-sueño'])
    const micro = BREATH_PRESETS.find((p) => p.id === 'micro')
    expect([micro?.pattern.rpm, micro?.pattern.rampSec, micro?.suggestedMinutes]).toEqual([6, 0, 3])
    const sleep = BREATH_PRESETS.find((p) => p.id === 'pre-sleep')
    expect([sleep?.pattern.rpm, sleep?.pattern.inhaleRatio, sleep?.noise?.noiseType]).toEqual([5.5, 0.35, 'brown'])
  })

  it('la resonancia tiene rampa de 8 a 6 rpm en 120 s', () => {
    expect(RESONANCE_PATTERN).toMatchObject({ rpm: 6, inhaleRatio: 0.4, rampFromRpm: 8, rampSec: 120 })
  })

  it('describeBreath resume el patrón', () => {
    expect(describeBreath(RESONANCE_PATTERN)).toBe('6,0 rpm · inspiración 4,0 s · espiración 6,0 s · rampa desde 8,0 rpm')
  })
})

describe('patrón personalizado', () => {
  it('cuadrada 4-4-4-4: 3,75 rpm, proporción 0,5 y retenciones de 4 s', () => {
    const r = customPattern({ inhaleSec: 4, holdInSec: 4, exhaleSec: 4, holdOutSec: 4 })
    expect('pattern' in r).toBe(true)
    if (!('pattern' in r)) return
    expect(r.pattern.rpm).toBeCloseTo(3.75, 10)
    expect(r.pattern.inhaleRatio).toBeCloseTo(0.5, 10)
    expect([r.pattern.holdInSec, r.pattern.holdOutSec]).toEqual([4, 4])
  })

  it('4 s dentro y 6 s fuera (sin retenciones) equivale a la resonancia de 6 rpm', () => {
    const r = customPattern({ inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 })
    if (!('pattern' in r)) throw new Error(r.error)
    expect(r.pattern.rpm).toBeCloseTo(6, 10)
    expect(r.pattern.inhaleRatio).toBeCloseTo(0.4, 10)
  })

  it.each([
    [{ inhaleSec: 1, holdInSec: 0, exhaleSec: 10, holdOutSec: 0 }, '1:4'],
    [{ inhaleSec: 30, holdInSec: 0, exhaleSec: 31, holdOutSec: 0 }, 'ciclo'],
    [{ inhaleSec: 4, holdInSec: 0, exhaleSec: 0.5, holdOutSec: 0 }, 'espiración'],
    [{ inhaleSec: 4, holdInSec: 11, exhaleSec: 4, holdOutSec: 0 }, 'retención'],
    [{ inhaleSec: 0, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 }, 'inspiración'],
  ])('rechaza %j', (timing, word) => {
    const r = customPattern(timing)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.toLowerCase()).toContain(word)
  })
})

describe('mezcla de parámetros', () => {
  it('un parche parcial de respiración conserva cues y patrón', () => {
    const m = mergeParams(DEFAULT_PARAMS, { breath: { enabled: true, cues: { ...DEFAULT_PARAMS.breath.cues, chime: true } } })
    expect(m.breath.enabled).toBe(true)
    expect(m.breath.cues).toEqual({ swell: true, guideTone: false, chime: true })
    expect(m.breath.pattern).toEqual(DEFAULT_PARAMS.breath.pattern)
  })

  it('un cues parcial no borra los demás cues', () => {
    const m = mergeParams(DEFAULT_PARAMS, { breath: { cues: { guideTone: true } as never } })
    expect(m.breath.cues).toEqual({ swell: true, guideTone: true, chime: false })
  })
})

describe('precisión fina', () => {
  it('acepta tiempos con décimas de segundo (p. ej. 4,3 s dentro y 5,7 s fuera)', () => {
    const r = customPattern({ inhaleSec: 4.3, holdInSec: 0.5, exhaleSec: 5.7, holdOutSec: 0 })
    if (!('pattern' in r)) throw new Error(r.error)
    expect(r.pattern.rpm).toBeCloseTo(60 / 10.5, 10)
    expect(r.pattern.inhaleRatio).toBeCloseTo(4.3 / 10, 10)
    expect(r.pattern.holdInSec).toBe(0.5)
  })
})

describe('límites del editor', () => {
  it('sin el límite de 20 s: una espiración de 30 s y un ciclo de 40 s son válidos (1,5 rpm)', () => {
    const r = customPattern({ inhaleSec: 10, holdInSec: 0, exhaleSec: 30, holdOutSec: 0 })
    if (!('pattern' in r)) throw new Error(r.error)
    expect(r.pattern.rpm).toBeCloseTo(60 / 40, 10)
    expect(r.pattern.inhaleRatio).toBeCloseTo(0.25, 10)
  })
})

describe('limitaciones de seguridad', () => {
  it('activas: un ciclo de 3 s o una retención de 11 s se rechazan', () => {
    expect('error' in customPattern({ inhaleSec: 1, holdInSec: 0, exhaleSec: 2, holdOutSec: 0 }, true)).toBe(true)
    expect('error' in customPattern({ inhaleSec: 4, holdInSec: 11, exhaleSec: 4, holdOutSec: 0 }, true)).toBe(true)
  })

  it('quitadas: un ciclo de 3 s y una retención de 30 s son válidos', () => {
    const fast = customPattern({ inhaleSec: 1, holdInSec: 0, exhaleSec: 2, holdOutSec: 0 }, false)
    expect('pattern' in fast && fast.pattern.rpm).toBeCloseTo(20, 10)
    const hold = customPattern({ inhaleSec: 4, holdInSec: 30, exhaleSec: 4, holdOutSec: 0 }, false)
    expect('pattern' in hold).toBe(true)
  })

  it('quitadas, el ciclo mínimo técnico es de 2 s', () => {
    expect('error' in customPattern({ inhaleSec: 1, holdInSec: 0, exhaleSec: 0.5, holdOutSec: 0 }, false)).toBe(true)
  })

  it('al volver a activarlas, el patrón se ajusta (ritmo ≤ 12 rpm, retenciones ≤ 10 s)', () => {
    const p = withinSafetyLimits({ rpm: 20, inhaleRatio: 0.4, holdInSec: 30, holdOutSec: 4 })
    expect(p.rpm).toBeCloseTo(12, 10)
    expect([p.holdInSec, p.holdOutSec]).toEqual([10, 4])
  })
})
