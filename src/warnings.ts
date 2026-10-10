import type { EngineParams } from './dsp/types'

/** Avisos en línea (solo modo binaural). */
export function warningsFor(p: Pick<EngineParams, 'mode' | 'carrierHz' | 'beatHz'>): string[] {
  if (p.mode !== 'binaural') return []
  const out: string[] = []
  if (p.carrierHz > 500) {
    out.push('El efecto binaural se debilita por encima de unos 500–1000 Hz de portadora.')
  }
  if (p.beatHz > 30) {
    out.push(
      'Por encima de unos 30 Hz de pulso suele percibirse como dos tonos separados; considera el modo isocrónico.',
    )
  }
  return out
}
