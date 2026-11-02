import { describe, expect, it } from 'vitest'
import {
  BILATERAL_PREFIX,
  CONFIG_KEY,
  DEFAULT_CONFIG,
  LOG_KEY,
  MAX_LOG_ENTRIES,
  MAX_NOTE_LENGTH,
  clearBilateralData,
  loadConfig,
  loadLog,
  saveConfig,
  saveLog,
  sanitizeConfig,
  sanitizeLog,
  type BilateralStorage,
  type LogEntry,
} from '../src/bilateral/storage'
import { buzz, canVibrate } from '../src/bilateral/haptics'

/** Almacenamiento en memoria con la misma forma que localStorage. */
function memory(initial: Record<string, string> = {}): BilateralStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'a1',
  date: '2026-11-01',
  durationSec: 900,
  endReason: 'duracion',
  mode: 'pulses',
  blind: true,
  lfoHz: 0.5,
  calma: 6,
  atencion: 5,
  activacion: 4,
  malestar: 2,
  nota: 'tranquilo al principio',
  ...over,
})

describe('configuración', () => {
  it('sin datos guardados se usan los valores por defecto', () => {
    const s = memory()
    expect(loadConfig(s)).toEqual(DEFAULT_CONFIG)
  })

  it('lo guardado vuelve tal cual y los valores fuera de rango se recortan', () => {
    const s = memory()
    saveConfig({ ...DEFAULT_CONFIG, lfoHz: 0.8, blind: true, plannedMin: 25 }, s)
    expect(loadConfig(s)).toMatchObject({ lfoHz: 0.8, blind: true, plannedMin: 25 })
    expect(sanitizeConfig({ lfoHz: 40, plannedMin: 90, mode: 'x', bed: 'nube' })).toMatchObject({
      lfoHz: 2,
      plannedMin: 30,
      mode: DEFAULT_CONFIG.mode,
      bed: DEFAULT_CONFIG.bed,
    })
  })

  it('un JSON roto no rompe la carga', () => {
    const s = memory({ [CONFIG_KEY]: '{no es json' })
    expect(loadConfig(s)).toEqual(DEFAULT_CONFIG)
  })
})

describe('registro', () => {
  it('guarda y lee las entradas', () => {
    const s = memory()
    saveLog([entry()], s)
    expect(loadLog(s)).toEqual([entry()])
  })

  it('descarta entradas sin id o sin fecha válida y escalas fuera de 0–10', () => {
    const clean = sanitizeLog([
      entry(),
      { id: 'b', date: 'ayer', durationSec: 10 },
      { date: '2026-11-01', durationSec: 10 },
      'otra cosa',
      { ...entry({ id: 'c' }), calma: 12, atencion: 2.5 },
    ])
    expect(clean.map((e) => e.id)).toEqual(['a1', 'c'])
    expect(clean[1]).toMatchObject({ calma: null, atencion: null })
  })

  it('recorta la nota y limita el número de entradas', () => {
    expect(sanitizeLog([entry({ nota: 'x'.repeat(MAX_NOTE_LENGTH + 50) })])[0]?.nota.length).toBe(MAX_NOTE_LENGTH)
    const many = Array.from({ length: MAX_LOG_ENTRIES + 10 }, (_, i) => entry({ id: `e${i}` }))
    expect(sanitizeLog(many).length).toBe(MAX_LOG_ENTRIES)
  })
})

describe('borrado total', () => {
  it('borra la configuración y el registro, y deja intacto el resto de la aplicación', () => {
    const s = memory({
      [CONFIG_KEY]: '{}',
      [LOG_KEY]: '[]',
      [`${BILATERAL_PREFIX}-otra:v1`]: '1',
      'binaural:state:v1': '{"params":{}}',
      'binaural:practice:v1': '[]',
    })
    const removed = clearBilateralData(s)
    expect(removed).toBe(3)
    expect([...s.data.keys()].sort()).toEqual(['binaural:practice:v1', 'binaural:state:v1'])
  })

  it('después de borrar, cargar devuelve los valores por defecto y un registro vacío', () => {
    const s = memory()
    saveConfig({ ...DEFAULT_CONFIG, blind: true }, s)
    saveLog([entry()], s)
    clearBilateralData(s)
    expect(loadConfig(s)).toEqual(DEFAULT_CONFIG)
    expect(loadLog(s)).toEqual([])
  })

  it('sin almacenamiento disponible no lanza', () => {
    expect(clearBilateralData(null)).toBe(0)
    expect(loadLog(null)).toEqual([])
    expect(() => saveLog([entry()], null)).not.toThrow()
  })
})

describe('háptica', () => {
  it('sin navigator.vibrate (iOS Safari) la función queda desactivada sin errores', () => {
    expect(canVibrate({})).toBe(false)
    expect(canVibrate(undefined)).toBe(false)
    expect(() => buzz(true, {})).not.toThrow()
  })

  it('con soporte, vibra una vez solo si la opción está activada', () => {
    const calls: number[] = []
    const nav = { vibrate: (ms: number) => (calls.push(ms), true) }
    expect(canVibrate(nav)).toBe(true)
    buzz(false, nav)
    expect(calls).toEqual([])
    buzz(true, nav)
    expect(calls).toEqual([20])
  })

  it('si el navegador bloquea la vibración, no se propaga el error', () => {
    const nav = {
      vibrate: () => {
        throw new Error('NotAllowedError')
      },
    }
    expect(() => buzz(true, nav)).not.toThrow()
  })
})
