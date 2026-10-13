import { describe, expect, it } from 'vitest'
import { phaseLengthSec, RESONANCE_PATTERN, rpmAt, type BreathPattern } from '../src/dsp/breath'
import {
  BREATH_PRESETS,
  DEFAULT_BREATH_PATTERN,
  describePattern,
  makePattern,
  patternFromSeconds,
  secondsFromPattern,
  snapRpm,
} from '../src/breathing'
import { PRESETS } from '../src/presets'

describe('ritmo y segundos', () => {
  it('el ritmo se ajusta a pasos de 0,5 dentro de 4,0–7,0', () => {
    expect(snapRpm(5.3)).toBe(5.5)
    expect(snapRpm(5.2)).toBe(5)
    expect(snapRpm(6.74)).toBe(6.5)
    expect(snapRpm(1)).toBe(4)
    expect(snapRpm(9)).toBe(7)
  })

  it('el modo personalizado convierte segundos en patrón y vuelve a los mismos segundos', () => {
    const p = patternFromSeconds({ inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 })
    expect(p.rpm).toBeCloseTo(6, 9)
    expect(p.inhaleRatio).toBeCloseTo(0.4, 9)
    const back = secondsFromPattern(patternFromSeconds({ inhale: 4, holdIn: 2, exhale: 6, holdOut: 2 }))
    expect(back.inhale).toBeCloseTo(4, 9)
    expect(back.holdIn).toBe(2)
    expect(back.exhale).toBeCloseTo(6, 9)
    expect(back.holdOut).toBe(2)
  })

  it('la cuadrada 4-4-4-4 se monta en el modo personalizado (sin ser preset)', () => {
    const p = patternFromSeconds({ inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 })
    expect(p.rpm).toBeCloseTo(60 / 16, 9)
    expect(p.holdInSec).toBe(4)
    expect(p.holdOutSec).toBe(4)
    expect(BREATH_PRESETS.some((b) => b.pattern.holdInSec > 0)).toBe(false)
  })

  it('la descripción dice cuántos segundos dura cada parte', () => {
    expect(describePattern(makePattern(6, 0.4))).toBe('6,0 rpm · inspiras 4,0 s y espiras 6,0 s')
  })
})

describe('duración de fase (cuenta atrás)', () => {
  it('las cuatro fases suman exactamente un ciclo', () => {
    const p: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 2, holdOutSec: 1 }
    const sum = (['in', 'holdIn', 'out', 'holdOut'] as const).reduce((s, ph) => s + phaseLengthSec(ph, 0, p), 0)
    expect(sum).toBeCloseTo(10, 9)
    expect(phaseLengthSec('in', 0, p)).toBeCloseTo(0.4 * 7, 9)
    expect(phaseLengthSec('holdIn', 0, p)).toBeCloseTo(2, 9)
  })

  it('con rampa, la duración de la fase sigue al ritmo del instante', () => {
    const p = makePattern(6, 0.4, { ramp: true })
    expect(rpmAt(0, p)).toBeCloseTo(8, 9)
    expect(phaseLengthSec('in', 0, p)).toBeCloseTo(0.4 * (60 / 8), 9)
    expect(phaseLengthSec('in', 200, p)).toBeCloseTo(4, 9)
  })
})

describe('presets de respiración', () => {
  it('hay tres presets con id único y el predeterminado es resonancia 6 con rampa', () => {
    expect(BREATH_PRESETS.map((b) => b.name)).toEqual(['Resonancia 6', 'Microdosis 3 min', 'Pre-sueño 5,5 rpm'])
    expect(new Set(BREATH_PRESETS.map((b) => b.id)).size).toBe(BREATH_PRESETS.length)
    expect(DEFAULT_BREATH_PATTERN.rpm).toBe(6)
    expect(DEFAULT_BREATH_PATTERN.rampFromRpm).toBe(8)
    expect(DEFAULT_BREATH_PATTERN.rampSec).toBe(120)
    expect(RESONANCE_PATTERN.rampFromRpm).toBeUndefined()
  })

  it('la microdosis dura 3 min, sin rampa; el pre-sueño usa ruido marrón', () => {
    const micro = BREATH_PRESETS.find((b) => b.id === 'breath-micro-3')
    expect(micro?.minutes).toBe(3)
    expect(micro?.pattern.rampFromRpm).toBeUndefined()
    const sleep = BREATH_PRESETS.find((b) => b.id === 'breath-sleep-5-5')
    expect(sleep?.pattern.rpm).toBe(5.5)
    expect(sleep?.pattern.inhaleRatio).toBe(0.35)
    expect(sleep?.noise).toBe('brown')
  })

  it('en los presets de audio: relajación y pre-sueño llevan la respiración; el resto la apaga', () => {
    const byId = (id: string) => PRESETS.find((p) => p.id === id)
    expect(byId('relax-alpha')?.params.breath?.enabled).toBe(true)
    expect(byId('relax-alpha')?.params.breath?.pattern?.rampFromRpm).toBe(8)
    const sleep = byId('pre-sleep')?.params.breath
    expect(sleep?.enabled).toBe(true)
    expect(sleep?.maxSec).toBe(600)
    for (const id of ['focus-beta', 'meditation-theta', 'gamma-40']) {
      expect(byId(id)?.params.breath?.enabled, id).toBe(false)
      expect(byId(id)?.params.breath?.maxSec, id).toBeNull()
    }
  })
})

describe('fusión del patrón en el estado', () => {
  it('un parche sin rampa conserva la rampa actual; uno con rampa undefined la quita', async () => {
    const { sanitizeParams, defaultParams } = await import('../src/dsp/params')
    const base = defaultParams() // resonancia 6 con rampa
    expect(base.breath.pattern.rampFromRpm).toBe(8)
    const keep = sanitizeParams(base, { breath: { enabled: true, pattern: { rpm: 5.5 } as BreathPattern } } as never)
    expect(keep.breath.pattern.rpm).toBe(5.5)
    expect(keep.breath.pattern.rampFromRpm).toBe(8)
    const off = sanitizeParams(base, { breath: { pattern: { ...base.breath.pattern, rampFromRpm: undefined, rampSec: undefined } } } as never)
    expect(off.breath.pattern.rampFromRpm).toBeUndefined()
  })
})
