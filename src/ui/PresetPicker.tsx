import { useState } from 'react'
import type { Preset } from '../dsp/types'
import { describePreset } from '../presets'
import { MAX_NAME_LENGTH } from '../storage'

interface Props {
  builtIn: readonly Preset[]
  user: readonly Preset[]
  activeId: string | null
  onLoad: (p: Preset) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

function PresetButton({ p, active, onLoad }: { p: Preset; active: boolean; onLoad: (p: Preset) => void }) {
  return (
    <button type="button" className={active ? 'preset active' : 'preset'} aria-pressed={active} onClick={() => onLoad(p)}>
      <strong>{p.name}</strong>
      <span>{describePreset(p)}</span>
    </button>
  )
}

export function PresetPicker({ builtIn, user, activeId, onLoad, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const canSave = name.trim().length > 0

  return (
    <section className="presets" aria-labelledby="presets-title">
      <h2 id="presets-title">Presets</h2>
      <div className="preset-list">
        {builtIn.map((p) => (
          <PresetButton key={p.id} p={p} active={p.id === activeId} onLoad={onLoad} />
        ))}
      </div>

      {user.length > 0 && (
        <>
          <h3>Mis presets</h3>
          <div className="preset-list">
            {user.map((p) => (
              <div key={p.id} className="preset-row">
                <PresetButton p={p} active={p.id === activeId} onLoad={onLoad} />
                <button
                  type="button"
                  className="delete"
                  aria-label={`Borrar el preset ${p.name}`}
                  onClick={() => onDelete(p.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <form
        className="save-preset"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          onSave(name)
          setName('')
        }}
      >
        <label htmlFor="preset-name">Guardar la configuración actual</label>
        <div className="save-row">
          <input
            id="preset-name"
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Nombre del preset"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={!canSave}>
            Guardar
          </button>
        </div>
      </form>
    </section>
  )
}
