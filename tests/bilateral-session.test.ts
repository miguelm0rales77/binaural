import { describe, expect, it } from 'vitest'
import type { BilateralMode } from '../src/dsp/bilateral'
import { BILATERAL_TEXT } from '../src/texts'
import {
  ALERT_LEVEL,
  HARD_LIMIT_SEC,
  INITIAL_SESSION,
  guideAt,
  pickMode,
  reduce,
  visibleMode,
  type SessionEvent,
  type SessionState,
} from '../src/bilateral/session'
import { mulberry32 } from '../src/dsp/noise'

const begin = (s: SessionState, over: Partial<Extract<SessionEvent, { type: 'begin' }>> = {}) =>
  reduce(s, { type: 'begin', mode: 'pulses', blind: false, plannedMin: 15, ...over })

/** Lleva la sesión hasta meditación: el oído izquierdo y el derecho confirmados. */
function toMeditation(s: SessionState = INITIAL_SESSION, at = 0): SessionState {
  let x = begin({ ...s, elapsedSec: at })
  x = reduce(x, { type: 'ear', side: 'left', heard: true })
  x = reduce(x, { type: 'ear', side: 'right', heard: true })
  return x
}

const tick = (s: SessionState, t: number) => reduce(s, { type: 'tick', elapsedSec: t })

describe('transiciones: preparación y calibración', () => {
  it('preparación → calibración → meditación solo con los dos oídos confirmados', () => {
    let s = begin(INITIAL_SESSION)
    expect(s.phase).toBe('calibracion')
    s = reduce(s, { type: 'ear', side: 'left', heard: true })
    expect(s.phase).toBe('calibracion')
    s = reduce(s, { type: 'ear', side: 'right', heard: true })
    expect(s.phase).toBe('meditacion')
  })

  it('si un oído no se oye, no se pasa a meditación; «repetir» vuelve a pendiente', () => {
    let s = begin(INITIAL_SESSION)
    s = reduce(s, { type: 'ear', side: 'left', heard: false })
    s = reduce(s, { type: 'ear', side: 'right', heard: true })
    expect(s.phase).toBe('calibracion')
    expect(s.ears.left).toBe('no-oida')
    s = reduce(s, { type: 'retry' })
    expect(s.ears).toEqual({ left: 'pendiente', right: 'pendiente' })
  })

  it('no se puede empezar dos veces sin terminar la sesión', () => {
    const s = begin(INITIAL_SESSION)
    expect(begin(s)).toBe(s)
  })

  it('la duración planeada se acota entre 5 y 30 min', () => {
    expect(begin(INITIAL_SESSION, { plannedMin: 99 }).plannedSec).toBe(30 * 60)
    expect(begin(INITIAL_SESSION, { plannedMin: 1 }).plannedSec).toBe(5 * 60)
  })
})

describe('transiciones: calma, malestar y reanudación', () => {
  it('meditación ⇄ pausa con «Calma» y «Volver», sin malestar alto', () => {
    let s = toMeditation()
    s = reduce(s, { type: 'calma' })
    expect(s.phase).toBe('pausa')
    s = reduce(s, { type: 'resume' })
    expect(s.phase).toBe('meditacion')
  })

  it(`un malestar de ${ALERT_LEVEL} o más pasa a pausa de inmediato, con la alerta`, () => {
    const s = reduce(toMeditation(), { type: 'rate', value: ALERT_LEVEL })
    expect(s.phase).toBe('pausa')
    expect(s.alert).toBe(true)
    expect(s.discomfort).toBe(ALERT_LEVEL)
  })

  it('con malestar alto no se reanuda la alternancia: «resume» no hace nada', () => {
    let s = reduce(toMeditation(), { type: 'rate', value: 9 })
    s = reduce(s, { type: 'resume' })
    expect(s.phase).toBe('pausa')
    expect(s.alert).toBe(true)
  })

  it('bajar la marca por debajo de 8 quita la alerta y permite volver', () => {
    let s = reduce(toMeditation(), { type: 'rate', value: 9 })
    s = reduce(s, { type: 'rate', value: 7 })
    expect(s.alert).toBe(false)
    s = reduce(s, { type: 'resume' })
    expect(s.phase).toBe('meditacion')
  })

  it('un malestar bajo no cambia de fase', () => {
    const s = reduce(toMeditation(), { type: 'rate', value: 3 })
    expect(s.phase).toBe('meditacion')
    expect(s.alert).toBe(false)
  })

  it('la marca se acota entre 0 y 10', () => {
    expect(reduce(toMeditation(), { type: 'rate', value: 42 }).discomfort).toBe(10)
    expect(reduce(toMeditation(), { type: 'rate', value: -3 }).discomfort).toBe(0)
  })
})

describe('transiciones: salida, duración y límite duro', () => {
  it('«Salir» pasa a cierre desde calibración, meditación y pausa', () => {
    const cal = begin(INITIAL_SESSION)
    expect(reduce(cal, { type: 'salir' }).phase).toBe('cierre')
    expect(reduce(toMeditation(), { type: 'salir' }).endReason).toBe('usuario')
    expect(reduce(reduce(toMeditation(), { type: 'calma' }), { type: 'salir' }).phase).toBe('cierre')
  })

  it('al llegar a la duración planeada (contada desde la meditación) se cierra', () => {
    const s = toMeditation(INITIAL_SESSION, 100)
    const before = tick(s, 100 + 15 * 60 - 1)
    expect(before.phase).toBe('meditacion')
    const after = tick(s, 100 + 15 * 60)
    expect(after.phase).toBe('cierre')
    expect(after.endReason).toBe('duracion')
  })

  it('el límite duro de 30 min corta la sesión aunque la duración planeada sea mayor', () => {
    let s = begin(INITIAL_SESSION, { plannedMin: 30 })
    s = reduce(s, { type: 'ear', side: 'left', heard: true })
    s = reduce(s, { type: 'ear', side: 'right', heard: true })
    const end = tick(s, HARD_LIMIT_SEC)
    expect(end.phase).toBe('cierre')
    expect(end.endReason).toBe('limite')
  })

  it('el límite duro cuenta desde el inicio de la calibración, no desde la meditación', () => {
    // Calibración de 4 min y luego meditación de 15 min: 19 min en total, no llega al límite.
    let s = begin(INITIAL_SESSION, { plannedMin: 15 })
    s = tick(s, 240)
    s = reduce(s, { type: 'ear', side: 'left', heard: true })
    s = reduce(s, { type: 'ear', side: 'right', heard: true })
    expect(s.medStartSec).toBe(240)
    expect(tick(s, 240 + 15 * 60 - 1).phase).toBe('meditacion')
    expect(tick(s, 240 + 15 * 60).endReason).toBe('duracion')
  })

  it('el tiempo solo cuenta en fases activas: en cierre el tick no cambia nada más', () => {
    const closed = reduce(toMeditation(), { type: 'salir' })
    expect(tick(closed, 99999).endReason).toBe('usuario')
  })
})

describe('transiciones: cierre y registro', () => {
  it('cierre → registro → preparación, y el registro no vuelve a empezar', () => {
    let s = reduce(toMeditation(), { type: 'salir' })
    s = reduce(s, { type: 'continue' })
    expect(s.phase).toBe('registro')
    s = reduce(s, { type: 'finish' })
    expect(s.phase).toBe('preparacion')
    expect(s.endReason).toBeNull()
  })

  it('no se puede pasar a registro sin pasar por cierre', () => {
    const s = toMeditation()
    expect(reduce(s, { type: 'continue' })).toBe(s)
  })
})

describe('abortar', () => {
  it('si el audio no arranca, vuelve a preparación sin pasar por el registro', () => {
    const s = begin(INITIAL_SESSION)
    const back = reduce(s, { type: 'abort' })
    expect(back.phase).toBe('preparacion')
    expect(back.endReason).toBeNull()
    expect(reduce(INITIAL_SESSION, { type: 'abort' })).toBe(INITIAL_SESSION)
  })
})

describe('modo ciego', () => {
  it('con el modo ciego activo, el modo no se muestra en ninguna fase de la sesión', () => {
    const modes: BilateralMode[] = ['pulses', 'continuous', 'none']
    for (const mode of modes) {
      const cal = begin(INITIAL_SESSION, { mode, blind: true })
      const med = toMeditation(cal)
      const pausa = reduce(med, { type: 'calma' })
      const cierre = reduce(pausa, { type: 'salir' })
      for (const s of [cal, med, pausa, cierre]) expect(visibleMode(s)).toBeNull()
    }
  })

  it('el modo se muestra solo en el registro, al terminar la sesión', () => {
    let s = toMeditation(begin(INITIAL_SESSION, { mode: 'none', blind: true }))
    s = reduce(s, { type: 'salir' })
    expect(visibleMode(s)).toBeNull()
    s = reduce(s, { type: 'continue' })
    expect(visibleMode(s)).toBe('none')
  })

  it('sin modo ciego, el modo se ve durante toda la sesión', () => {
    const s = toMeditation(begin(INITIAL_SESSION, { mode: 'pulses', blind: false }))
    expect(visibleMode(s)).toBe('pulses')
  })

  it('el modo asignado al azar cubre los tres modos y es uniforme', () => {
    const modes: BilateralMode[] = ['pulses', 'continuous', 'none']
    const rand = mulberry32(42)
    const count = new Map<BilateralMode, number>()
    for (let i = 0; i < 3000; i++) {
      const m = pickMode(rand, modes)
      count.set(m, (count.get(m) ?? 0) + 1)
    }
    for (const m of modes) {
      expect(count.get(m) ?? 0).toBeGreaterThan(900)
      expect(count.get(m) ?? 0).toBeLessThan(1100)
    }
  })

  it('pickMode no sale de la lista aunque el generador devuelva casi 1', () => {
    expect(pickMode(() => 0.999999, ['pulses', 'continuous', 'none'])).toBe('none')
    expect(pickMode(() => 0, ['pulses', 'continuous', 'none'])).toBe('pulses')
  })
})

describe('guía de meditación', () => {
  const steps = BILATERAL_TEXT.guide

  it('devuelve el primer paso al empezar y avanza con el tiempo', () => {
    expect(guideAt(0, steps).index).toBe(0)
    expect(guideAt((steps[0]?.sec ?? 0) - 0.1, steps).index).toBe(0)
    expect(guideAt(steps[0]?.sec ?? 0, steps).index).toBe(1)
  })

  it('repite la guía en bucle sin cortarla', () => {
    const total = steps.reduce((a, s) => a + s.sec, 0)
    expect(guideAt(total, steps).index).toBe(0)
    expect(guideAt(total + 1, steps).index).toBe(0)
    expect(guideAt(total * 3 + 45, steps).index).toBe(1)
  })

  it('los pasos de pausa existen y ocupan tiempo: no hay texto sin pausas', () => {
    expect(steps.some((s) => s.text.startsWith('Pausa'))).toBe(true)
    expect(steps.every((s) => s.sec > 0)).toBe(true)
  })
})
