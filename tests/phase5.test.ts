import { describe, expect, it } from 'vitest'
import { DspEngine } from '../src/dsp/engine'
import { MASTER_CEILING, defaultParams, sanitizeParams } from '../src/dsp/params'
import { mulberry32 } from '../src/dsp/noise'
import { PRESETS } from '../src/presets'
import {
  ACCEPTED_KEY,
  ISO_WARNING_KEY,
  loadState,
  readFlag,
  saveState,
  writeFlag,
  type StorageLike,
} from '../src/storage'
import { ABOUT, FIRST_USE, ISO_FAST_WARNING, REFERENCE } from '../src/texts'
import { isoFastWarning } from '../src/warnings'

const peakOf = (...chs: Float32Array[]) => {
  let m = 0
  for (const ch of chs) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i] as number))
  return m
}

const fake = (): StorageLike & { data: Record<string, string> } => ({
  data: {},
  getItem(k: string) {
    return this.data[k] ?? null
  },
  setItem(k: string, v: string) {
    this.data[k] = v
  },
})

describe('techo de volumen', () => {
  it('el techo por defecto es 0,8', () => expect(MASTER_CEILING).toBe(0.8))

  it('sanitizeParams no deja pasar masterGain del techo', () => {
    expect(sanitizeParams(defaultParams(), { masterGain: 1 }).masterGain).toBe(0.8)
    expect(sanitizeParams(defaultParams(), { masterGain: 99 }).masterGain).toBe(0.8)
    expect(sanitizeParams(defaultParams(), { masterGain: 0.5 }).masterGain).toBe(0.5)
    expect(sanitizeParams(defaultParams(), { masterGain: -1 }).masterGain).toBe(0)
  })

  it('un estado guardado con volumen por encima del techo se recorta al cargar', () => {
    const s = fake()
    s.data['binaural:state:v1'] = JSON.stringify({ params: { masterGain: 1 }, timerMin: null })
    expect(loadState(s).params.masterGain).toBe(0.8)
    saveState({ params: { ...defaultParams(), masterGain: 0.8 }, timerMin: null }, s)
    expect(loadState(s).params.masterGain).toBe(0.8)
  })

  it('el motor aplica el techo (inicial y por setParams) y el peor caso sigue ≤ 1', () => {
    const e = new DspEngine(
      48000,
      { mode: 'binaural', carrierHz: 100, toneGain: 1, noiseGain: 1, masterGain: 1, noiseType: 'brown' },
      { fadeSec: 0, rand: mulberry32(5) },
    )
    e.setParams({ masterGain: 5 })
    e.start()
    const n = 48000 * 3
    const L = new Float32Array(n)
    const R = new Float32Array(n)
    e.renderBlock(L, R, n)
    const peak = peakOf(L, R)
    // con master = 1 el pico sería mayor: se comprueba que con 0,8 queda por debajo
    const e1 = new DspEngine(
      48000,
      { mode: 'binaural', carrierHz: 100, toneGain: 1, noiseGain: 1, masterGain: 1, noiseType: 'brown' },
      { fadeSec: 0, rand: mulberry32(5), masterCeiling: 1 },
    )
    e1.start()
    const L1 = new Float32Array(n)
    const R1 = new Float32Array(n)
    e1.renderBlock(L1, R1, n)
    const peak1 = peakOf(L1, R1)
    console.log(`  pico con techo 0,8: ${peak.toFixed(4)} · con master=1: ${peak1.toFixed(4)}`)
    expect(peak).toBeLessThan(peak1)
    expect(peak).toBeLessThanOrEqual(1)
  })

  it('los presets no pueden saltarse el techo', () => {
    for (const p of PRESETS) expect(sanitizeParams(defaultParams(), p.params).masterGain).toBeLessThanOrEqual(0.8)
  })
})

describe('compensación de sonoridad', () => {
  it('está activada por defecto', () => expect(defaultParams().loudnessComp).toBe(true))
})

describe('banderas de primer uso', () => {
  it('la pantalla aparece solo la primera vez', () => {
    const s = fake()
    expect(readFlag(ACCEPTED_KEY, s)).toBe(false)
    writeFlag(ACCEPTED_KEY, s)
    expect(readFlag(ACCEPTED_KEY, s)).toBe(true)
    expect(readFlag(ISO_WARNING_KEY, s)).toBe(false)
  })
  it('un almacenamiento roto no lanza excepciones', () => {
    const boom: StorageLike = {
      getItem() {
        throw new Error('x')
      },
      setItem() {
        throw new Error('x')
      },
    }
    expect(readFlag(ACCEPTED_KEY, boom)).toBe(false)
    expect(() => writeFlag(ACCEPTED_KEY, boom)).not.toThrow()
    expect(readFlag(ACCEPTED_KEY, null)).toBe(false)
  })
})

describe('aviso isocrónico 13–40 Hz', () => {
  it.each([
    ['isochronic', 12.9, false],
    ['isochronic', 13, true],
    ['isochronic', 40, true],
    ['binaural', 20, false],
    ['monaural', 20, false],
  ] as const)('%s a %f Hz → %s', (mode, beatHz, expected) => {
    expect(isoFastWarning({ mode, beatHz })).toBe(expected)
  })
})

describe('textos', () => {
  const all = [
    FIRST_USE.title,
    FIRST_USE.intro,
    ...FIRST_USE.items,
    ISO_FAST_WARNING.text,
    ABOUT.title,
    ...ABOUT.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
  ].join('\n')

  it('no contienen promesas terapéuticas', () => {
    const promises =
      /\b(cura|curar|curativ\w*|sana|sanar|sanacion|garantiz\w*|elimina\w*|te ayuda\w*|ayuda a (dormir|relajar\w*|concentrar\w*)|mejora(ra)? tu|reduce tu|trata(r)? (la |el )?(ansiedad|insomnio|depresion|tdah|dolor)|comprobado|demostrado que)\b/i
    const normalized = all.normalize('NFD').replace(/[̀-ͯ]/g, '')
    expect(normalized).not.toMatch(promises)
    expect(normalized).not.toMatch(/alzheimer|genus|schumann|432|subliminal|tdah/i)
  })

  it('la pantalla de primer uso contiene los cuatro avisos exigidos', () => {
    const t = FIRST_USE.items.join(' ').toLowerCase()
    expect(t).toContain('epilepsia')
    expect(t).toContain('conduces')
    expect(t).toContain('volumen bajo')
    expect(t).toContain('no es un producto sanitario')
    expect(t).toContain('sustituye')
    expect(FIRST_USE.button).toBe('Entendido')
  })

  it('«Acerca de» cita el metaanálisis con prudencia (heterogeneidad y EEG no concluyente)', () => {
    const t = ABOUT.sections.flatMap((s) => s.paragraphs).join(' ')
    expect(t).toContain('Garcia-Argibay')
    expect(t).toMatch(/heterog/)
    expect(t).toMatch(/EEG/)
    expect(t).toMatch(/no está demostrado de forma concluyente/)
    expect(REFERENCE.doi).toBe('https://doi.org/10.1007/s00426-018-1066-8')
  })
})
