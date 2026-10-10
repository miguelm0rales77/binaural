import { describe, expect, it } from 'vitest'
import { bandFor } from '../src/bands'
import { sanitizeParams } from '../src/dsp/params'
import { DEFAULT_PARAMS } from '../src/dsp/types'
import { STORAGE_KEY, defaultState, loadState, saveState, type StorageLike } from '../src/storage'
import { warningsFor } from '../src/warnings'

const fakeStorage = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
  data: initial,
  getItem(k: string) {
    return this.data[k] ?? null
  },
  setItem(k: string, v: string) {
    this.data[k] = v
  },
})

describe('bandas', () => {
  it.each([
    [0.5, 'delta'],
    [3.9, 'delta'],
    [4, 'theta'],
    [7.99, 'theta'],
    [10, 'alpha'],
    [13, 'beta'],
    [29.9, 'beta'],
    [30, 'gamma'],
    [40, 'gamma'],
  ])('%f Hz → %s', (hz, id) => {
    expect(bandFor(hz).id).toBe(id)
  })
})

describe('avisos', () => {
  const base = { mode: 'binaural', carrierHz: 250, beatHz: 10 } as const
  it('sin avisos con valores normales', () => expect(warningsFor(base)).toEqual([]))
  it('portadora > 500 en binaural', () => {
    expect(warningsFor({ ...base, carrierHz: 500 })).toHaveLength(0)
    expect(warningsFor({ ...base, carrierHz: 501 })).toHaveLength(1)
  })
  it('pulso > 30 en binaural', () => {
    expect(warningsFor({ ...base, beatHz: 30 })).toHaveLength(0)
    expect(warningsFor({ ...base, beatHz: 31 })[0]).toMatch(/isocrónico/)
  })
  it('ambos a la vez', () => expect(warningsFor({ ...base, carrierHz: 800, beatHz: 35 })).toHaveLength(2))
  it('no avisa en monaural ni isocrónico', () => {
    for (const mode of ['monaural', 'isochronic'] as const) {
      expect(warningsFor({ mode, carrierHz: 900, beatHz: 38 })).toEqual([])
    }
  })
})

describe('sanitizeParams', () => {
  it('recorta rangos y descarta valores inválidos', () => {
    const p = sanitizeParams(DEFAULT_PARAMS, {
      carrierHz: 5000,
      beatHz: Number.NaN,
      toneGain: -3,
      mode: 'otro',
      noiseType: 7,
      loudnessComp: 'sí',
    })
    expect(p.carrierHz).toBe(1000)
    expect(p.beatHz).toBe(DEFAULT_PARAMS.beatHz)
    expect(p.toneGain).toBe(0)
    expect(p.mode).toBe(DEFAULT_PARAMS.mode)
    expect(p.noiseType).toBe(DEFAULT_PARAMS.noiseType)
    expect(p.loudnessComp).toBe(DEFAULT_PARAMS.loudnessComp)
  })
})

describe('localStorage', () => {
  it('guarda y recupera el último estado', () => {
    const s = fakeStorage()
    const state = {
      params: { ...DEFAULT_PARAMS, mode: 'isochronic' as const, carrierHz: 432, beatHz: 6.5, noiseType: 'brown' as const },
      timerMin: 45,
    }
    saveState(state, s)
    expect(loadState(s)).toEqual(state)
  })
  it('sin datos devuelve el estado por defecto', () => expect(loadState(fakeStorage())).toEqual(defaultState()))
  it('JSON corrupto o con basura no rompe', () => {
    expect(loadState(fakeStorage({ [STORAGE_KEY]: '{no json' }))).toEqual(defaultState())
    expect(loadState(fakeStorage({ [STORAGE_KEY]: '42' }))).toEqual(defaultState())
    const bad = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ params: { carrierHz: 99999 }, timerMin: 7 }) }))
    expect(bad.params.carrierHz).toBe(1000)
    expect(bad.timerMin).toBeNull()
  })
  it('un almacenamiento que lanza excepciones no rompe', () => {
    const boom: StorageLike = {
      getItem() {
        throw new Error('bloqueado')
      },
      setItem() {
        throw new Error('cuota')
      },
    }
    expect(loadState(boom)).toEqual(defaultState())
    expect(() => saveState(defaultState(), boom)).not.toThrow()
    expect(loadState(null)).toEqual(defaultState())
  })
})
