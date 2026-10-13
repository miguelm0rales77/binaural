import { useState } from 'react'
import type { BreathPattern } from '../dsp/breath'
import type { BreathConfig, BreathCues } from '../dsp/types'
import {
  BREATH_DURATIONS_MIN,
  BREATH_PRESETS,
  RATIO_MAX,
  RATIO_MIN,
  RPM_MAX,
  RPM_MIN,
  RPM_STEP,
  describePattern,
  patternFromSeconds,
  secondsFromPattern,
  snapRpm,
  type BreathSeconds,
} from '../breathing'
import { BREATH_TEXTS } from '../texts'
import { BreathCircle } from './BreathCircle'
import { Slider } from './Slider'

export interface BreathSummaryData {
  minutes: number
  rpm: number
  description: string
}

interface Props {
  breath: BreathConfig
  /** Cambios parciales del metrónomo (la aplicación los fusiona con el estado). */
  onChange: (patch: Partial<BreathConfig>) => void
  onPattern: (pattern: BreathPattern) => void
  /** Presets de respiración: fijan el patrón, las señales, la duración y, si lo tienen, el ruido. */
  onPreset: (id: string) => void
  timerMin: number | null
  onTimer: (min: number | null) => void
  playing: boolean
  getTime: () => number | null
  safetySeen: boolean
  onSafetySeen: () => void
  summary: BreathSummaryData | null
  onCloseSummary: () => void
}

const f1 = (x: number) => x.toFixed(1).replace('.', ',')

export function BreathPanel(p: Props) {
  const { breath } = p
  const pattern = breath.pattern
  const [lips, setLips] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [secs, setSecs] = useState<BreathSeconds>(() => secondsFromPattern(pattern))
  const enterCustom = () => {
    setSecs(secondsFromPattern(pattern)) // partir del patrón actual, no de un valor anterior
    setIsCustom(true)
  }

  const setCues = (patch: Partial<BreathCues>) => p.onChange({ cues: { ...breath.cues, ...patch } })
  const applySeconds = (next: BreathSeconds) => {
    setSecs(next)
    p.onPattern(patternFromSeconds(next))
  }

  return (
    <section className="breath" aria-labelledby="breath-title">
      <h2 id="breath-title">Respirar</h2>
      <p className="breath-intro">{BREATH_TEXTS.intro}</p>

      {!p.safetySeen && (
        <div className="breath-safety" role="region" aria-label={BREATH_TEXTS.safetyTitle}>
          <h3>{BREATH_TEXTS.safetyTitle}</h3>
          <ul>
            {BREATH_TEXTS.safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <button type="button" onClick={p.onSafetySeen}>
            {BREATH_TEXTS.safetyButton}
          </button>
        </div>
      )}

      <BreathCircle active={p.playing && breath.enabled} pattern={pattern} lips={lips} getTime={p.getTime} />

      <div className="breath-presets" role="group" aria-label="Presets de respiración">
        {BREATH_PRESETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setIsCustom(false)
              p.onPreset(b.id)
            }}
          >
            {b.name}
          </button>
        ))}
        <button type="button" aria-pressed={isCustom} onClick={enterCustom}>
          Personalizado
        </button>
      </div>

      <label className="check">
        <input type="checkbox" checked={breath.enabled} onChange={(e) => p.onChange({ enabled: e.target.checked })} />
        <span>
          Guía de respiración activa
          <small>{describePattern(pattern)}</small>
        </span>
      </label>

      {!isCustom ? (
        <>
          <Slider
            label="Ritmo"
            ariaLabel="Respiraciones por minuto"
            min={RPM_MIN}
            max={RPM_MAX}
            step={RPM_STEP}
            value={pattern.rpm}
            format={(v) => `${f1(v)} rpm`}
            onChange={(v) => p.onPattern({ ...pattern, rpm: snapRpm(v) })}
          />
          <Slider
            label="Proporción"
            ariaLabel="Parte del ciclo dedicada a inspirar"
            min={RATIO_MIN}
            max={RATIO_MAX}
            step={0.01}
            value={pattern.inhaleRatio}
            format={(v) => `inspiras ${Math.round(v * 100)} % · espiras ${Math.round((1 - v) * 100)} %`}
            onChange={(v) => p.onPattern({ ...pattern, inhaleRatio: v })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={pattern.rampFromRpm !== undefined}
              onChange={(e) =>
                p.onPattern({
                  ...pattern,
                  rampFromRpm: e.target.checked ? 8 : undefined,
                  rampSec: e.target.checked ? 120 : undefined,
                })
              }
            />
            <span>
              Rampa de entrada
              <small>Empieza a 8 rpm y baja al ritmo elegido en 2 minutos, para no forzar el cambio.</small>
            </span>
          </label>
        </>
      ) : (
        <fieldset className="breath-custom">
          <legend>Tiempos (segundos)</legend>
          {(
            [
              ['inhale', 'Inspirar', 1, 12],
              ['holdIn', 'Retener tras inspirar', 0, 10],
              ['exhale', 'Espirar', 1, 12],
              ['holdOut', 'Retener tras espirar', 0, 10],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key} className="field">
              <span>
                {label} <output>{f1(secs[key])} s</output>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.5}
                value={secs[key]}
                aria-label={`${label}, segundos`}
                onChange={(e) => applySeconds({ ...secs, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <small>
            Ciclo de {f1(secs.inhale + secs.exhale + secs.holdIn + secs.holdOut)} s:{' '}
            {describePattern(patternFromSeconds(secs))}. Solo los ritmos entre 3 y 12 rpm se respetan.
          </small>
        </fieldset>
      )}

      <fieldset className="breath-cues">
        <legend>Señales</legend>
        <label className="check">
          <input type="checkbox" checked={breath.cues.swell} onChange={(e) => setCues({ swell: e.target.checked })} />
          <span>
            Oleaje del fondo
            <small>El ruido de fondo sube y baja con la respiración.</small>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={breath.cues.guideTone}
            onChange={(e) => setCues({ guideTone: e.target.checked })}
          />
          <span>
            Tono guía
            <small>Sube al inspirar y baja al espirar. Va con el volumen del tono.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={breath.cues.chime} onChange={(e) => setCues({ chime: e.target.checked })} />
          <span>
            Campanilla
            <small>Suena al empezar cada fase.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={lips} onChange={(e) => setLips(e.target.checked)} />
          <span>
            Recordar labios fruncidos al espirar
            <small>Solo es un texto durante la espiración.</small>
          </span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="breath-duration">Duración de la sesión</label>
        <select
          id="breath-duration"
          value={p.timerMin ?? ''}
          onChange={(e) => p.onTimer(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Sin límite</option>
          {(
            [...new Set([...BREATH_DURATIONS_MIN, ...(p.timerMin === null ? [] : [p.timerMin])])].sort((a, b) => a - b)
          ).map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <small>Al terminar, el sonido y las señales se apagan con un fundido de 8 s.</small>
      </div>

      {p.summary && (
        <div className="breath-summary" role="status">
          <p>
            <strong>Sesión terminada.</strong> {f1(p.summary.minutes)} min a {f1(p.summary.rpm)} rpm.
          </p>
          <small>{p.summary.description}</small>
          <button type="button" onClick={p.onCloseSummary}>
            Cerrar
          </button>
        </div>
      )}
    </section>
  )
}
