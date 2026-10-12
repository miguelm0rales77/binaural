import { BAND_LEGENDS } from './texts'

export type BandId = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma'

export interface Band {
  id: BandId
  name: string
  range: string
  /** Qué se mide en el EEG en esta banda (no un efecto de la aplicación). */
  legend: string
}

/** Banda según el pulso (límite superior exclusivo): Delta 0,5–4, Theta 4–8, Alfa 8–13, Beta 13–30, Gamma 30–40. */
export function bandFor(beatHz: number): Band {
  if (beatHz < 4) return { id: 'delta', name: 'Delta', range: '0,5–4 Hz', legend: BAND_LEGENDS.delta }
  if (beatHz < 8) return { id: 'theta', name: 'Theta', range: '4–8 Hz', legend: BAND_LEGENDS.theta }
  if (beatHz < 13) return { id: 'alpha', name: 'Alfa', range: '8–13 Hz', legend: BAND_LEGENDS.alpha }
  if (beatHz < 30) return { id: 'beta', name: 'Beta', range: '13–30 Hz', legend: BAND_LEGENDS.beta }
  return { id: 'gamma', name: 'Gamma', range: '30–40 Hz', legend: BAND_LEGENDS.gamma }
}
