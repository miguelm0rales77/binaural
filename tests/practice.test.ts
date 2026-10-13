import { describe, expect, it } from 'vitest'
import { presetLabel as presetLabelFn, presetsFor } from '../src/breathPresets'
import {
  DEFAULT_GOAL_MIN,
  MAX_ENTRIES,
  PRACTICE_KEY,
  lastDays,
  loadGoal,
  loadPractice,
  loadResonance,
  minutesOn,
  sanitizeEntries,
  savePractice,
  saveResonance,
  streak,
  toCsv,
  type PracticeEntry,
} from '../src/practice'
import {
  RESONANCE_STEPS,
  REST_SEC,
  STEP_SEC,
  TEST_TOTAL_SEC,
  afterRest,
  recommend,
  stepAt,
  stepDone,
  type StepScore,
} from '../src/resonance'
import type { StorageLike } from '../src/storage'

const fakeStorage = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
  data: initial,
  getItem(k: string) {
    return this.data[k] ?? null
  },
  setItem(k: string, v: string) {
    this.data[k] = v
  },
})

const e = (date: string, minutes: number, rpm = 6, preset = 'Resonancia 6'): PracticeEntry => ({
  date,
  seconds: minutes * 60,
  rpm,
  preset,
})

describe('registro: guardado y validación', () => {
  it('sobrevive a una recarga (se lee lo que se guardó)', () => {
    const storage = fakeStorage()
    const list = [e('2026-10-12', 20), e('2026-10-13', 10, 5.5, 'Microdosis 3 min')]
    savePractice(list, storage)
    expect(loadPractice(storage)).toEqual(list)
  })

  it('descarta entradas corruptas y no lanza errores', () => {
    const storage = fakeStorage({
      [PRACTICE_KEY]: JSON.stringify([
        { date: '2026-10-13', seconds: 60, rpm: 6, preset: 'ok' },
        { date: 'ayer', seconds: 60, rpm: 6, preset: 'fecha mala' },
        { date: '2026-10-13', seconds: -5, rpm: 6, preset: 'negativo' },
        { date: '2026-10-13', seconds: 60, rpm: 99, preset: 'ritmo fuera' },
        null,
      ]),
    })
    expect(loadPractice(storage)).toEqual([{ date: '2026-10-13', seconds: 60, rpm: 6, preset: 'ok' }])
    expect(loadPractice(fakeStorage({ [PRACTICE_KEY]: '{no es json' }))).toEqual([])
  })

  it('limita el tamaño del registro', () => {
    const many = Array.from({ length: MAX_ENTRIES + 10 }, () => e('2026-10-13', 1))
    expect(sanitizeEntries(many)).toHaveLength(MAX_ENTRIES)
  })

  it('sin almacenamiento disponible no lanza y devuelve el valor por defecto', () => {
    expect(loadPractice(null)).toEqual([])
    expect(loadGoal(null)).toBe(DEFAULT_GOAL_MIN)
    expect(loadResonance(null)).toBeNull()
  })

  it('el objetivo por defecto son 40 min (2 × 20 min) y se puede cambiar', () => {
    expect(loadGoal(fakeStorage())).toBe(40)
    expect(loadGoal(fakeStorage({ 'binaural:practice-goal:v1': '25' }))).toBe(25)
    expect(loadGoal(fakeStorage({ 'binaural:practice-goal:v1': '9999' }))).toBe(DEFAULT_GOAL_MIN)
  })
})

describe('registro: agregados', () => {
  const today = '2026-10-13'

  it('minutos por día', () => {
    const list = [e(today, 20), e(today, 15), e('2026-10-12', 5)]
    expect(minutesOn(list, today)).toBeCloseTo(35, 10)
    expect(minutesOn(list, '2026-10-01')).toBe(0)
  })

  it('la semana son los 7 días que terminan hoy, del más antiguo al más reciente', () => {
    expect(lastDays(today)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ])
  })

  it('racha: días seguidos con sesión, contando desde hoy', () => {
    const list = [e('2026-10-11', 5), e('2026-10-12', 5), e(today, 5)]
    expect(streak(list, today)).toBe(3)
  })

  it('racha: si hoy aún no hay sesión, cuenta desde ayer; un hueco la corta', () => {
    const list = [e('2026-10-09', 5), e('2026-10-10', 5), e('2026-10-12', 5)]
    expect(streak(list, today)).toBe(1)
    expect(streak([], today)).toBe(0)
  })

  it('CSV con cabecera, minutos con dos decimales y comas escapadas', () => {
    const csv = toCsv([e(today, 20, 6, 'Relajación, con coma')])
    expect(csv.split('\n')[0]).toBe('fecha,segundos,minutos,rpm,preset')
    expect(csv.split('\n')[1]).toBe('2026-10-13,1200,20.00,6.0,"Relajación, con coma"')
  })
})

describe('Mi frecuencia: escalones y recomendación', () => {
  it('cinco escalones de 6,5 a 4,5 rpm, 2 min cada uno y 1 min de descanso entre medios: unos 14 min', () => {
    expect([...RESONANCE_STEPS]).toEqual([6.5, 6.0, 5.5, 5.0, 4.5])
    expect(STEP_SEC).toBe(120)
    expect(REST_SEC).toBe(60)
    expect(TEST_TOTAL_SEC).toBe(14 * 60)
  })

  it('stepAt ubica el escalón y el descanso en cada instante', () => {
    expect(stepAt(0)).toMatchObject({ index: 0, rpm: 6.5, inStep: true })
    expect(stepAt(125)).toMatchObject({ index: 0, rpm: 6.5, inStep: false })
    expect(stepAt(185)).toMatchObject({ index: 1, rpm: 6.0, inStep: true })
    expect(stepAt(TEST_TOTAL_SEC)).toBeNull()
  })

  it('recomienda el ritmo más cómodo entre los que no dejaron falta de aire', () => {
    const scores: StepScore[] = [
      { rpm: 6.5, comfort: 3, shortOfBreath: false },
      { rpm: 6.0, comfort: 4, shortOfBreath: false },
      { rpm: 5.5, comfort: 5, shortOfBreath: false },
      { rpm: 5.0, comfort: 5, shortOfBreath: true },
      { rpm: 4.5, comfort: 2, shortOfBreath: false },
    ]
    expect(recommend(scores)).toBe(5.5)
  })

  it('en empate de comodidad gana el ritmo más alto; si todos dejan falta de aire, se elige entre todos', () => {
    const tie: StepScore[] = [
      { rpm: 5.5, comfort: 4, shortOfBreath: false },
      { rpm: 5.0, comfort: 4, shortOfBreath: false },
    ]
    expect(recommend(tie)).toBe(5.5)
    const breathless: StepScore[] = [
      { rpm: 6.5, comfort: 2, shortOfBreath: true },
      { rpm: 4.5, comfort: 4, shortOfBreath: true },
    ]
    expect(recommend(breathless)).toBe(4.5)
    expect(recommend([])).toBeNull()
  })

  it('la frecuencia elegida se guarda y los presets de respiración la usan', () => {
    const storage = fakeStorage()
    saveResonance(5.5, storage)
    expect(loadResonance(storage)).toBe(5.5)
    const preset = presetsFor(5.5).find((p) => p.id === 'resonance')
    expect(preset?.name).toBe('Resonancia 5.5')
    expect(preset?.pattern.rpm).toBe(5.5)
    // sin prueba hecha, el preset sigue siendo 6 rpm con su nombre de siempre
    expect(presetsFor(null).find((p) => p.id === 'resonance')?.name).toBe('Resonancia 6')
  })
})

describe('nombre del preset en el registro', () => {
  it('una sesión con el ritmo de un preset se registra con su nombre; si no, «Personalizado»', () => {
    const presets = presetsFor(null)
    expect(presetLabelFn({ rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampSec: 120 }, presets)).toBe('Resonancia 6')
    expect(presetLabelFn({ rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampSec: 0 }, presets)).toBe('Microdosis 3 min')
    expect(presetLabelFn({ rpm: 4.5, inhaleRatio: 0.45, holdInSec: 0, holdOutSec: 0, rampSec: 0 }, presets)).toBe('Personalizado')
  })
})

describe('Mi frecuencia: transiciones de la prueba', () => {
  it('el escalón acaba a los 2 min exactos', () => {
    expect(stepDone(119.9)).toBe(false)
    expect(stepDone(120)).toBe(true)
  })

  it('en el descanso: primero hay que puntuar; luego, un escalón intermedio espera el minuto completo', () => {
    expect(afterRest(0, 90, false)).toBe('wait')
    expect(afterRest(0, 30, true)).toBe('wait')
    expect(afterRest(0, 60, true)).toBe('next')
    expect(afterRest(3, 60, true)).toBe('next')
  })

  it('tras el último escalón no hay descanso: al puntuarlo se termina', () => {
    expect(afterRest(4, 0, false)).toBe('wait')
    expect(afterRest(4, 0, true)).toBe('finish')
  })
})
