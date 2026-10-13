import { describe, expect, it } from 'vitest'
import { RESONANCE_STEPS, TEST_TOTAL_SEC, recommend, stepAt } from '../src/resonance'
import {
  DEFAULT_GOAL,
  addDays,
  goalMinutes,
  lastWeek,
  loadPractice,
  minutesByDay,
  sanitizeGoal,
  sanitizePractice,
  sanitizeResonance,
  savePractice,
  streak,
  toCsv,
  type PracticeEntry,
} from '../src/practice'

const e = (date: string, minutes = 20, rpm = 6, preset = 'Libre'): PracticeEntry => ({ date, minutes, rpm, preset })

class MemStore {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

describe('registro de práctica', () => {
  it('suma minutos por día y calcula la racha terminando hoy', () => {
    const today = '2026-10-13'
    const log = [e('2026-10-11'), e('2026-10-12', 20), e('2026-10-12', 20), e('2026-10-13', 5), e('2026-10-09')]
    expect(minutesByDay(log).get('2026-10-12')).toBe(40)
    expect(streak(log, today)).toBe(3) // 11, 12 y 13
  })

  it('si hoy no hay práctica, la racha cuenta desde ayer', () => {
    const log = [e('2026-10-11'), e('2026-10-12')]
    expect(streak(log, '2026-10-13')).toBe(2)
    expect(streak([e('2026-10-10')], '2026-10-13')).toBe(0)
  })

  it('la semana muestra siete días terminando hoy, cruzando meses', () => {
    expect(lastWeek('2026-03-02')).toEqual([
      '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02',
    ])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('el objetivo por defecto es 2 × 20 min al día', () => {
    expect(DEFAULT_GOAL).toEqual({ sessionsPerDay: 2, minutesPerSession: 20 })
    expect(goalMinutes(DEFAULT_GOAL)).toBe(40)
    expect(sanitizeGoal({ sessionsPerDay: 99, minutesPerSession: -3 })).toEqual({ sessionsPerDay: 10, minutesPerSession: 1 })
  })

  it('el CSV tiene cabecera y escapa las comillas del nombre de preset', () => {
    const csv = toCsv([e('2026-10-13', 20, 5.5, 'Mi "preset"')])
    expect(csv).toBe('fecha,minutos,rpm,preset\n2026-10-13,20,5.5,"Mi ""preset"""\n')
  })

  it('descarta entradas inválidas al leer y sobrevive a una recarga', () => {
    const raw = [
      { date: '2026-10-13', minutes: 20, rpm: 6, preset: 'x' },
      { date: 'ayer', minutes: 20, rpm: 6 },
      { date: '2026-10-13', minutes: 'mucho', rpm: 6 },
      { date: '2026-10-13', minutes: 10, rpm: 99 },
    ]
    // Como en los parámetros, los números fuera de rango se recortan (99 rpm → 7) en vez de descartarse
    expect(sanitizePractice(raw)).toEqual([
      { date: '2026-10-13', minutes: 20, rpm: 6, preset: 'x' },
      { date: '2026-10-13', minutes: 10, rpm: 7, preset: 'Libre' },
    ])
    const store = new MemStore()
    savePractice([e('2026-10-13', 20, 6)], store)
    expect(loadPractice(store)).toEqual([e('2026-10-13', 20, 6)])
    expect(sanitizePractice('basura')).toEqual([])
  })

  it('la frecuencia guardada se ajusta a pasos de 0,5 dentro de 4–7', () => {
    expect(sanitizeResonance(5.3)).toBe(5.5)
    expect(sanitizeResonance(9)).toBe(7)
    expect(sanitizeResonance('x')).toBeNull()
  })
})

describe('prueba escalonada «Mi frecuencia»', () => {
  it('son cinco escalones de 2 min con 1 min de descanso: 14 min en total', () => {
    expect(RESONANCE_STEPS).toEqual([6.5, 6.0, 5.5, 5.0, 4.5])
    expect(TEST_TOTAL_SEC).toBe(14 * 60)
    expect(stepAt(0)).toEqual({ kind: 'breath', index: 0 })
    expect(stepAt(119)).toEqual({ kind: 'breath', index: 0 })
    expect(stepAt(121)).toEqual({ kind: 'rest', index: 0 })
    expect(stepAt(181)).toEqual({ kind: 'breath', index: 1 })
    expect(stepAt(TEST_TOTAL_SEC - 1)).toEqual({ kind: 'breath', index: 4 })
    expect(stepAt(TEST_TOTAL_SEC)).toEqual({ kind: 'done' })
  })

  it('recomienda el escalón más cómodo; en empate, sin falta de aire y luego el ritmo más alto', () => {
    expect(recommend([])).toBeNull()
    expect(
      recommend([
        { rpm: 6.5, comfort: 3, airHunger: false },
        { rpm: 5.5, comfort: 5, airHunger: false },
        { rpm: 5.0, comfort: 5, airHunger: true },
      ]),
    ).toBe(5.5)
    expect(
      recommend([
        { rpm: 6.0, comfort: 4, airHunger: true },
        { rpm: 5.5, comfort: 4, airHunger: false },
      ]),
    ).toBe(5.5)
    expect(
      recommend([
        { rpm: 6.0, comfort: 4, airHunger: false },
        { rpm: 5.5, comfort: 4, airHunger: false },
      ]),
    ).toBe(6)
  })
})
