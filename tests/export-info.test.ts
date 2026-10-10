import { describe, expect, it } from 'vitest'
import { LARGE_EXPORT_BYTES, MAX_EXPORT_MINUTES, estimateBytes, exportFileName, formatMB } from '../src/audio/exportInfo'
import { PRE_SLEEP_PROGRAM } from '../src/presets'

describe('tamaño estimado', () => {
  it('60 min ≈ 635 MB (máximo) y 1 min ≈ 11 MB', () => {
    expect(MAX_EXPORT_MINUTES).toBe(60)
    expect(formatMB(estimateBytes({ loop: false, minutes: 60 }))).toBe('635 MB')
    expect(formatMB(estimateBytes({ loop: false, minutes: 1 }))).toBe('11 MB')
  })
  it('el bucle de 5 min pesa 53 MB sin importar los minutos', () => {
    expect(formatMB(estimateBytes({ loop: true, minutes: 60 }))).toBe('53 MB')
    expect(estimateBytes({ loop: true, minutes: 1 })).toBeLessThan(LARGE_EXPORT_BYTES)
  })
  it('se avisa a partir de ~300 MB (≈ 28 min)', () => {
    expect(estimateBytes({ loop: false, minutes: 28 })).toBeLessThan(LARGE_EXPORT_BYTES)
    expect(estimateBytes({ loop: false, minutes: 29 })).toBeGreaterThanOrEqual(LARGE_EXPORT_BYTES)
  })
})

describe('nombre de archivo', () => {
  const p = { mode: 'binaural' as const, carrierHz: 250.4, beatHz: 10 }
  it('describe modo, portadora, pulso y duración', () => {
    expect(exportFileName(p, { loop: false, minutes: 20, program: null })).toBe('binaural_250Hz_10Hz_20min.wav')
    expect(exportFileName({ ...p, mode: 'isochronic', beatHz: 7.55 }, { loop: false, minutes: 5, program: null })).toBe('isocronico_250Hz_7.5Hz_5min.wav')
  })
  it('bucle y programa', () => {
    expect(exportFileName(p, { loop: true, minutes: 20, program: null })).toBe('binaural_250Hz_10Hz_bucle5min.wav')
    expect(exportFileName(p, { loop: false, minutes: 30, program: PRE_SLEEP_PROGRAM })).toBe('pre-sueno_30min.wav')
  })
  it('solo caracteres seguros', () => {
    const n = exportFileName(p, { loop: false, minutes: 3, program: { ...PRE_SLEEP_PROGRAM, name: '¡Ñandú / raro: "x"!' } })
    expect(n).toMatch(/^[a-z0-9_.-]+$/)
  })
})
