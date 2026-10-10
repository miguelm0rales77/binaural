import type { BeatMode } from '../dsp/types'

const MODES: { id: BeatMode; name: string; text: string; speakers: boolean }[] = [
  {
    id: 'binaural',
    name: 'Binaural',
    text: 'Cada oído recibe un tono ligeramente distinto y el pulso se percibe por la diferencia. Requiere auriculares.',
    speakers: false,
  },
  {
    id: 'monaural',
    name: 'Monaural',
    text: 'Los dos tonos se mezclan antes de llegar al oído, así que el pulso está en el propio sonido.',
    speakers: true,
  },
  {
    id: 'isochronic',
    name: 'Isocrónico',
    text: 'Un solo tono que sube y baja de volumen a un ritmo regular.',
    speakers: true,
  },
]

export function ModeSelector({ mode, onChange }: { mode: BeatMode; onChange: (m: BeatMode) => void }) {
  const current = MODES.find((m) => m.id === mode) ?? (MODES[0] as (typeof MODES)[number])
  return (
    <fieldset className="modes">
      <legend>Modo</legend>
      <div className="segmented">
        {MODES.map((m) => (
          <label key={m.id} className={m.id === mode ? 'seg selected' : 'seg'}>
            <input type="radio" name="mode" value={m.id} checked={m.id === mode} onChange={() => onChange(m.id)} />
            {m.name}
          </label>
        ))}
      </div>
      <p className="mode-text">
        {current.text}
        {current.speakers && <strong className="badge"> Funciona también con altavoces.</strong>}
      </p>
    </fieldset>
  )
}
