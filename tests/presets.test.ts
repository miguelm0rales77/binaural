import { describe, expect, it } from 'vitest'
import { DspEngine } from '../src/dsp/engine'
import { defaultParams, sanitizeParams } from '../src/dsp/params'
import { evalProgram } from '../src/dsp/program'
import type { Preset } from '../src/dsp/types'
import { PRESETS, PRE_SLEEP_PROGRAM, describePreset } from '../src/presets'
import {
  PRESETS_KEY,
  cleanPresetName,
  loadUserPresets,
  saveUserPresets,
  sanitizeUserPresets,
  type StorageLike,
} from '../src/storage'

const FS = 8000 // frecuencia baja: acelera los tests largos sin cambiar la lógica
const MIN = 60
const render = (e: DspEngine, sec: number) => {
  const n = Math.round(sec * FS)
  e.renderBlock(new Float32Array(n), new Float32Array(n), n)
}

describe('presets integrados', () => {
  const byId = (id: string) => PRESETS.find((p) => p.id === id) as Preset

  it('coinciden con la tabla del plan', () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      'Relajación (alfa)',
      'Concentración (beta)',
      'Meditación (theta)',
      'Pre-sueño (programa)',
      'Gamma 40 Hz',
    ])
    const r = byId('relax-alpha')
    expect([r.params.mode, r.params.carrierHz, r.params.beatHz, r.params.noiseType, r.suggestedMinutes]).toEqual(['binaural', 250, 10, 'pink', 20])
    const c = byId('focus-beta')
    expect([c.params.carrierHz, c.params.beatHz, c.params.noiseType]).toEqual([400, 16, 'pink'])
    const m = byId('meditation-theta')
    expect([m.params.carrierHz, m.params.beatHz, m.params.noiseType, m.suggestedMinutes]).toEqual([200, 6, 'none', 20])
    const g = byId('gamma-40')
    expect([g.params.mode, g.params.isoDepth, g.params.carrierHz, g.params.beatHz, g.suggestedMinutes]).toEqual(['isochronic', 0.8, 400, 40, 15])
    const s = byId('pre-sleep')
    expect([s.params.mode, s.params.carrierHz, s.params.noiseType, s.suggestedMinutes]).toEqual(['binaural', 200, 'brown', 30])
  })

  it('todos tienen valores dentro de rango y no tocan los volúmenes', () => {
    for (const p of PRESETS) {
      const clean = sanitizeParams(defaultParams(), p.params)
      for (const [k, v] of Object.entries(p.params)) expect(clean[k as keyof typeof clean], `${p.id}.${k}`).toBe(v)
      expect(p.params).not.toHaveProperty('toneGain')
      expect(p.params).not.toHaveProperty('masterGain')
    }
  })

  it('nombres y descripciones no prometen efectos terapéuticos', () => {
    const banned = /cura|trata|terap|ansiedad|insomnio|tdah|alzheimer|dolor|sana|medic|depres|432|schumann/i
    for (const p of PRESETS) {
      expect(`${p.name} ${describePreset(p)}`).not.toMatch(banned)
    }
  })

  it('describePreset resume el preset', () => {
    expect(describePreset(byId('relax-alpha'))).toBe('Binaural · 250 Hz · 10 Hz (Alfa) · ruido rosa · 20 min')
    expect(describePreset(byId('pre-sleep'))).toBe('Binaural · 200 Hz · 10→6→3 Hz · ruido marrón · 30 min')
  })
})

describe('programa Pre-sueño', () => {
  const at = (min: number) => evalProgram(PRE_SLEEP_PROGRAM, min * MIN).beatHz
  it('10 Hz hasta el minuto 5, 6 Hz en el 15, 3 Hz en el 25 y se mantiene', () => {
    expect(at(0)).toBe(10)
    expect(at(5)).toBe(10)
    expect(at(10)).toBeCloseTo(8, 10)
    expect(at(15)).toBe(6)
    expect(at(20)).toBeCloseTo(4.5, 10)
    expect(at(25)).toBe(3)
    expect(at(30)).toBe(3)
    expect(PRE_SLEEP_PROGRAM.durationSec).toBe(30 * MIN)
  })

  it('el motor lo recorre entero y termina con fundido y `stopped`', () => {
    const e = new DspEngine(FS, { ...PRESETS[3]?.params, toneGain: 1, masterGain: 1 }, { fadeSec: 1 })
    let stopped = 0
    e.onStopped = () => stopped++
    e.setProgram(PRE_SLEEP_PROGRAM, 0)
    e.start()
    const beats: Record<string, number> = {}
    let t = 0
    for (const m of [4, 10, 15, 20, 25]) {
      render(e, (m - t) * MIN)
      t = m
      beats[`min ${m}`] = +e.getState().beatHz.toFixed(3)
    }
    console.log('  pulso del motor:', JSON.stringify(beats), '· restante a min 25:', e.getState().remainingSec)
    expect(beats['min 4']).toBeCloseTo(10, 2)
    expect(beats['min 10']).toBeCloseTo(8, 1)
    expect(beats['min 15']).toBeCloseTo(6, 1)
    expect(beats['min 20']).toBeCloseTo(4.5, 1)
    expect(beats['min 25']).toBeCloseTo(3, 1)
    expect(e.getState().remainingSec).toBeCloseTo(5 * MIN, 0)
    expect(stopped).toBe(0)
    render(e, 5 * MIN - 1)
    expect(stopped).toBe(0)
    render(e, 3)
    expect(stopped).toBe(1)
    expect(e.getState().playing).toBe(false)
  })

  it('cargado a mitad de sesión empieza por su principio, no por el minuto actual', () => {
    const e = new DspEngine(FS, { beatHz: 5 }, { fadeSec: 0 })
    e.start()
    render(e, 100)
    e.setProgram({ name: 'p', durationSec: 600, steps: [{ atSec: 0, beatHz: 10 }, { atSec: 60, beatHz: 2 }] }, 0)
    render(e, 30)
    // a 30 s del inicio del programa: 10 → 2 en 60 s, ≈ 6 Hz (con un pequeño retraso del suavizado)
    expect(e.getState().beatHz).toBeGreaterThan(5.5)
    expect(e.getState().beatHz).toBeLessThan(7)
  })

  it('un cambio manual de pulso cancela el programa', () => {
    const e = new DspEngine(FS, {}, { fadeSec: 0 })
    e.setProgram(PRE_SLEEP_PROGRAM, 0)
    e.start()
    render(e, 20 * MIN)
    e.setParams({ beatHz: 12 })
    render(e, 20)
    expect(e.getState().beatHz).toBeGreaterThan(11.5)
    expect(e.getState().remainingSec).toBeNull()
  })
})

describe('temporizador relativo a cuando se fija', () => {
  it('fijarlo a mitad de sesión cuenta desde ese momento', () => {
    const e = new DspEngine(FS, {}, { fadeSec: 1 })
    let stopped = 0
    e.onStopped = () => stopped++
    e.start()
    render(e, 100)
    e.setSessionTimer(10)
    expect(e.getState().remainingSec).toBeCloseTo(10, 1)
    render(e, 9)
    expect(stopped).toBe(0)
    render(e, 3)
    expect(stopped).toBe(1)
  })
  it('sin temporizador ni programa no hay tiempo restante', () => {
    const e = new DspEngine(FS, {}, { fadeSec: 0 })
    e.start()
    render(e, 1)
    expect(e.getState().remainingSec).toBeNull()
  })
})

describe('presets del usuario', () => {
  const fake = (): StorageLike & { data: Record<string, string> } => ({
    data: {},
    getItem(k: string) {
      return this.data[k] ?? null
    },
    setItem(k: string, v: string) {
      this.data[k] = v
    },
  })
  const mine: Preset = {
    id: 'u-1',
    name: 'Mi preset',
    params: { ...defaultParams(), mode: 'monaural', carrierHz: 321, beatHz: 7.5 },
    program: PRE_SLEEP_PROGRAM,
    suggestedMinutes: 20,
  }

  it('guarda y recupera (con programa)', () => {
    const s = fake()
    saveUserPresets([mine], s)
    expect(loadUserPresets(s)).toEqual([mine])
  })
  it('sin datos → lista vacía; datos corruptos no rompen', () => {
    expect(loadUserPresets(fake())).toEqual([])
    const s = fake()
    s.data[PRESETS_KEY] = '[{'
    expect(loadUserPresets(s)).toEqual([])
    expect(loadUserPresets(null)).toEqual([])
  })
  it('descarta entradas inválidas, duplicados y recorta rangos', () => {
    const list = sanitizeUserPresets([
      null,
      42,
      { id: '', name: 'x', params: {} },
      { id: 'a', name: '   ', params: {} },
      { id: 'a', name: 'Bueno', params: { carrierHz: 99999, beatHz: 'x' }, suggestedMinutes: 9999 },
      { id: 'a', name: 'Duplicado', params: {} },
      { id: 'b', name: 'Con programa roto', params: {}, program: { durationSec: -5, steps: [] } },
      { id: 'c', name: 'Prog', params: {}, program: { name: 'p', durationSec: 10, steps: [{ atSec: 5, beatHz: 99 }, { atSec: 1, beatHz: 0.1 }, { atSec: 'x', beatHz: 3 }] } },
    ])
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(list[0]?.params.carrierHz).toBe(1000)
    expect(list[0]?.suggestedMinutes).toBeNull()
    expect(list[1]?.program).toBeUndefined()
    expect(list[2]?.program?.steps).toEqual([{ atSec: 1, beatHz: 0.5 }, { atSec: 5, beatHz: 40 }])
  })
  it('limpia el nombre', () => {
    expect(cleanPresetName('  Mi   preset \n')).toBe('Mi preset')
    expect(cleanPresetName('x'.repeat(100))).toHaveLength(40)
  })
})
