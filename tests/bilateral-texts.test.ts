import { describe, expect, it } from 'vitest'
import { BILATERAL_TEXT } from '../src/texts'

/** Todas las cadenas de los textos de la meditación bilateral, aplanadas. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings)
  return []
}

const ALL = strings(BILATERAL_TEXT)

describe('textos de la meditación bilateral', () => {
  it('el aviso visible del modo es exactamente el acordado', () => {
    expect(BILATERAL_TEXT.banner).toBe(
      'Uso personal de prueba. No sustituye a un tratamiento. Si el malestar es intenso, para la sesión y busca apoyo.',
    )
  })

  it('no hay promesas terapéuticas ni de relajación garantizada', () => {
    const forbidden =
      /\b(cura|curar|curación|sana|sanar|garantiz\w*|elimina\w*|alivia\w*|reduc\w*|mejora\w*|EMDR|trauma\w*|reprocesa\w*|terap\w*|ansiedad|depresi\w*|relaj\w*|efecto\w*)\b/i
    const hits = ALL.filter((t) => forbidden.test(t))
    expect(hits).toEqual([])
  })

  it('no hay vocabulario de exposición ni de reprocesamiento', () => {
    const banned = /exposici|reprocesamiento|desensibiliz|recuerdo traum|evento traum/i
    expect(ALL.filter((t) => banned.test(t))).toEqual([])
  })

  it('los valores por defecto se describen como ajustables y no validados', () => {
    expect(BILATERAL_TEXT.defaults).toContain('ajustables y no validados')
  })

  it('la guía tiene pausas y no tiene pasos vacíos', () => {
    expect(BILATERAL_TEXT.guide.length).toBeGreaterThanOrEqual(5)
    for (const step of BILATERAL_TEXT.guide) {
      expect(step.text.trim().length).toBeGreaterThan(0)
      expect(step.sec).toBeGreaterThan(0)
    }
    expect(BILATERAL_TEXT.guide.some((s) => /^Pausa/.test(s.text))).toBe(true)
  })

  it('la alerta de malestar alto remite a apoyo y no promete nada', () => {
    expect(BILATERAL_TEXT.pause.alert).toContain('busca apoyo')
    expect(BILATERAL_TEXT.pause.alert).toContain('8')
  })

  it('el cierre vuelve a la respiración, al cuerpo y al presente', () => {
    const [breath, body, now] = BILATERAL_TEXT.closing.steps
    expect(breath).toMatch(/respiraci/i)
    expect(body).toMatch(/cuerpo/i)
    expect(now).toMatch(/aquí y ahora/i)
  })

  it('el texto de auriculares y el de estéreo no afirman que la app detecte los auriculares', () => {
    expect(BILATERAL_TEXT.headphonesUnknown).toMatch(/no puede comprobar/i)
  })

  it('el texto de háptica dice que iOS Safari no la admite', () => {
    expect(BILATERAL_TEXT.hapticsUnavailable).toMatch(/iOS Safari/)
  })
})
