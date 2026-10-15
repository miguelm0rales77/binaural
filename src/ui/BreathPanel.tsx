import { useEffect, useRef, useState } from 'react'
import {
  CUSTOM_LIMITS,
  customPattern,
  describeBreath,
  safetyLimits,
  withinSafetyLimits,
  type BreathPreset,
} from '../breathPresets'
import { breathStateInto, type BreathPattern, type BreathState } from '../dsp/breath'
import type { BreathCues, BreathSettings, ParamsPatch } from '../dsp/types'
import { BREATH_ACCEPTED_KEY, readFlag, writeFlag } from '../storage'
import { BREATH_TEXT } from '../texts'
import { AlertIcon } from './icons'
import { Slider } from './Slider'

/** Sesión de respiración que acaba de terminar (para el resumen). */
export interface BreathSummary {
  elapsedSec: number
  pattern: BreathPattern
}

interface Props {
  presets: readonly BreathPreset[]
  breath: BreathSettings
  timerMin: number | null
  /** Reloj del motor: `now` es el tiempo actual del contexto (null sin contexto); `startedAt` cuándo se pidió el arranque. */
  clock: () => { now: number | null; startedAt: number }
  onChange: (patch: ParamsPatch) => void
  onPreset: (p: BreathPreset) => void
  onTimer: (min: number | null) => void
  summary: BreathSummary | null
  onCloseSummary: () => void
}

type PresetChoice = BreathPreset['id'] | 'custom'

const DURATIONS_MIN = [1, 3, 5, 10, 15, 20] as const
const RPM_RANGE = { min: 4, max: 7 }
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',')
const pctOf = (v: number) => `${Math.round(v * 100)} %`
/** Duración en m:ss (igual que el resto de la app); se trunca a segundos enteros. */
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const PHASE_TEXT = { in: 'Inspira', holdIn: 'Mantén', out: 'Espira', holdOut: 'Mantén' } as const

/**
 * Sección «Respirar»: círculo que sigue a la respiración del motor, presets y controles.
 * El círculo no parpadea: crece y decrece con el llenado pulmonar, a 0,1 Hz.
 */
export function BreathPanel({ presets, breath, timerMin, clock, onChange, onPreset, onTimer, summary, onCloseSummary }: Props) {
  const [presetChoice, setPresetChoice] = useState<PresetChoice>('resonance')
  const [accepted, setAccepted] = useState(() => readFlag(BREATH_ACCEPTED_KEY))
  const [asking, setAsking] = useState(false)
  // Acción que espera al aviso de seguridad (activar la respiración por cualquier vía pasa por aquí).
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [lips, setLips] = useState(false)
  const [timing, setTiming] = useState({ inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 })
  const [timingError, setTimingError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)

  // Círculo y textos se actualizan en el bucle de dibujo, sin volver a pintar React en cada fotograma.
  const circle = useRef<HTMLDivElement>(null)
  const phaseEl = useRef<HTMLParagraphElement>(null)
  const countEl = useRef<HTMLSpanElement>(null)
  const lipsEl = useRef<HTMLParagraphElement>(null)
  const latest = useRef({ breath, clock })
  useEffect(() => {
    latest.current = { breath, clock }
  })

  useEffect(() => {
    let raf = 0
    let lastPhase = ''
    let lastCount = ''
    let lastScale = ''
    let lastLips = ''
    const scratch: BreathState = { phase: 'in', phaseProgress: 0, phaseSec: 0, lung: 0, cycleIndex: 0 }
    const frame = () => {
      const { breath: b, clock: c } = latest.current
      const { now, startedAt } = c()
      let lung = 0
      let phase = ''
      let count = ''
      let showLips = false
      if (b.enabled && now !== null && startedAt > 0 && now >= startedAt) {
        breathStateInto(scratch, now - startedAt, b.pattern)
        lung = scratch.lung
        phase = PHASE_TEXT[scratch.phase]
        count = String(Math.max(1, Math.ceil((1 - scratch.phaseProgress) * scratch.phaseSec)))
        showLips = scratch.phase === 'out'
      }
      const scale = (0.55 + 0.45 * lung).toFixed(3)
      if (scale !== lastScale && circle.current) {
        circle.current.style.transform = `scale(${scale})`
        lastScale = scale
      }
      if (phase !== lastPhase && phaseEl.current) {
        phaseEl.current.textContent = phase || (b.enabled ? 'Pulsa Reproducir' : 'Respiración apagada')
        // Háptica al empezar cada fase: solo donde el navegador la permite (Android); iOS no vibra desde la web.
        if (phase) navigator.vibrate?.(30)
        lastPhase = phase
      }
      if (count !== lastCount && countEl.current) {
        countEl.current.textContent = count
        lastCount = count
      }
      const lipsOn = showLips && b.enabled
      if (lipsOn !== (lastLips === 'on') && lipsEl.current) {
        lipsEl.current.hidden = !lipsOn
        lastLips = lipsOn ? 'on' : 'off'
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const { enabled, pattern, cues, stopAtSec } = breath
  const cycleSec = 60 / pattern.rpm
  const breathing = cycleSec - pattern.holdInSec - pattern.holdOutSec
  const ramp = (pattern.rampSec ?? 0) > 0
  const durationChoices = [...new Set([...DURATIONS_MIN, ...(timerMin === null ? [] : [timerMin])])].sort((a, b) => a - b)

  /** Ejecuta `action` si ya se aceptó el aviso; si no, lo deja pendiente hasta que se acepte. */
  const guard = (action: () => void) => {
    if (accepted) action()
    else {
      setPending(() => action)
      setAsking(true)
    }
  }

  const setEnabled = (on: boolean) => {
    if (on) guard(() => onChange({ breath: { enabled: true } }))
    else onChange({ breath: { enabled: false } })
  }

  const acceptSafety = () => {
    writeFlag(BREATH_ACCEPTED_KEY)
    setAccepted(true)
    setAsking(false)
    const action = pending
    setPending(null)
    action?.()
  }

  const choosePreset = (p: BreathPreset) => {
    setTimingError(null)
    guard(() => {
      setPresetChoice(p.id)
      onPreset(p)
    })
  }

  const setRpm = (rpm: number) => onChange({ breath: { pattern: { ...pattern, rpm, rampSec: ramp ? pattern.rampSec : 0 } } })
  const setRatio = (inhaleRatio: number) => onChange({ breath: { pattern: { ...pattern, inhaleRatio } } })
  const setRamp = (on: boolean) => onChange({ breath: { pattern: { ...pattern, rampFromRpm: 8, rampSec: on ? 120 : 0 } } })
  const setCue = (k: keyof BreathCues, v: boolean) => onChange({ breath: { cues: { ...cues, [k]: v } } })

  const safety = breath.safetyLimits
  const limits = safetyLimits(safety)

  /** Activar las limitaciones ajusta el patrón actual a ellas; quitarlas pide confirmación. */
  const toggleSafety = (on: boolean) => {
    if (on) onChange({ breath: { safetyLimits: true, pattern: withinSafetyLimits(pattern) } })
    else setConfirmOff(true)
  }

  const applyTiming = () => {
    const r = customPattern(timing, safety)
    if ('error' in r) {
      setTimingError(r.error)
      return
    }
    setTimingError(null)
    guard(() => {
      setPresetChoice('custom')
      onChange({ breath: { enabled: true, pattern: r.pattern, stopAtSec: null } })
    })
  }

  const numField = (key: keyof typeof timing, label: string, min: number, max: number) => (
    <label className="breath-num">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={0.1}
        value={timing[key]}
        onChange={(e) => setTiming((t) => ({ ...t, [key]: Number(e.target.value) }))}
      />
      <small>s</small>
    </label>
  )

  return (
    <section className="breath" aria-labelledby="breath-title">
      <p className="eyebrow">Respiración · Ritmo · Sin sensor</p>
      <h2 id="breath-title">Respirar</h2>

      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          Respiración guiada
          <small>Marca el ritmo con un círculo, con el oleaje del fondo y, si lo activas, con sonidos.</small>
        </span>
      </label>

      <div className="breath-stage" aria-hidden={!enabled}>
        <div className="breath-circle-wrap">
          <div ref={circle} className="breath-circle" data-testid="breath-circle" />
        </div>
        <p ref={phaseEl} className="breath-phase" aria-live="off" data-testid="breath-phase">
          {enabled ? 'Pulsa Reproducir' : 'Respiración apagada'}
        </p>
        <p className="breath-count">
          <span ref={countEl} data-testid="breath-count" />
          <span className="visually-hidden"> segundos</span>
        </p>
        <p ref={lipsEl} className="breath-lips" hidden>
          {BREATH_TEXT.lips}
        </p>
      </div>

      <fieldset className="breath-presets">
        <legend>Preset de respiración</legend>
        <div className="breath-preset-row">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="secondary"
              aria-pressed={presetChoice === p.id}
              onClick={() => choosePreset(p)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className="secondary"
            aria-pressed={presetChoice === 'custom'}
            onClick={() => setPresetChoice('custom')}
          >
            Personalizado
          </button>
        </div>
        <p className="muted">{describeBreath(pattern)}</p>
      </fieldset>

      {presetChoice !== 'custom' && (
        <>
          <Slider
            label="Ritmo"
            ariaLabel="Respiraciones por minuto"
            min={RPM_RANGE.min}
            max={RPM_RANGE.max}
            step={0.1}
            value={pattern.rpm}
            format={(v) => `${fmt1(v)} rpm`}
            onChange={(v) => setRpm(Math.round(v * 10) / 10)}
          />
          <Slider
            label="Inspiración"
            ariaLabel="Parte del ciclo dedicada a inspirar"
            min={0.3}
            max={0.5}
            value={pattern.inhaleRatio}
            format={(v) => `${pctOf(v)} · ${fmt1(breathing * v)} s`}
            onChange={setRatio}
          />
          <label className="check">
            <input type="checkbox" checked={ramp} onChange={(e) => setRamp(e.target.checked)} />
            <span>
              Rampa de entrada
              <small>Empieza a 8 rpm y baja hasta el ritmo elegido en 2 minutos, para no forzar el cambio.</small>
            </span>
          </label>
        </>
      )}

      {presetChoice === 'custom' && (
        <div className="breath-editor">
          <label className="check">
            <input type="checkbox" checked={safety} onChange={(e) => toggleSafety(e.target.checked)} />
            <span>
              Limitaciones de seguridad
              <small>
                Ciclo de al menos {limits.minCycleSec} s y retenciones de hasta {limits.maxHoldSec} s.
              </small>
            </span>
          </label>
          {!safety && (
            <p className="warning" role="status">
              <AlertIcon />
              <span>{BREATH_TEXT.advanced}</span>
            </p>
          )}
          <p className="muted">
            Tiempos de un ciclo en segundos, con décimas. Ciclo entre {limits.minCycleSec} y {CUSTOM_LIMITS.cycleSec.max} s.
          </p>
          <div className="breath-num-row">
            {numField('inhaleSec', 'Inspira', CUSTOM_LIMITS.breathSec.min, CUSTOM_LIMITS.breathSec.max)}
            {numField('holdInSec', 'Mantén tras inspirar', 0, limits.maxHoldSec)}
            {numField('exhaleSec', 'Espira', CUSTOM_LIMITS.breathSec.min, CUSTOM_LIMITS.breathSec.max)}
            {numField('holdOutSec', 'Mantén tras espirar', 0, limits.maxHoldSec)}
          </div>
          <button type="button" className="secondary" onClick={applyTiming}>
            Aplicar estos tiempos
          </button>
          {timingError && (
            <p className="error" role="alert">
              <AlertIcon />
              <span>{timingError}</span>
            </p>
          )}
        </div>
      )}

      <fieldset className="breath-cues">
        <legend>Señales</legend>
        <label className="check">
          <input type="checkbox" checked={cues.swell} onChange={(e) => setCue('swell', e.target.checked)} />
          <span>
            Oleaje del fondo
            <small>El ruido de fondo sube y baja con la respiración.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={cues.guideTone} onChange={(e) => setCue('guideTone', e.target.checked)} />
          <span>
            Tono guía
            <small>Sube al inspirar y baja al espirar. Suena por debajo del tono.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={cues.chime} onChange={(e) => setCue('chime', e.target.checked)} />
          <span>
            Campanilla
            <small>Una nota breve al empezar cada fase. Sintetizada, no grabada.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={lips} onChange={(e) => setLips(e.target.checked)} />
          <span>
            Recordatorio al espirar
            <small>Muestra el texto «{BREATH_TEXT.lips.replace('.', '')}» durante la espiración.</small>
          </span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="breath-duration">Duración de la sesión</label>
        <select
          id="breath-duration"
          value={timerMin ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            onTimer(v)
          }}
        >
          <option value="">Sin límite</option>
          {durationChoices.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <small>Es el mismo temporizador de la sesión: al terminar, la respiración y el sonido se apagan con fundido.</small>
      </div>

      {stopAtSec !== null && enabled && (
        <p className="muted">La respiración se apagará a los {Math.round(stopAtSec / 60)} min con un fundido de 30 s.</p>
      )}
      <p className="muted">{BREATH_TEXT.notSensor}</p>
      <p className="muted">{BREATH_TEXT.activities}</p>

      {summary && (
        <div className="breath-summary" role="status" data-testid="breath-summary">
          <p>
            <strong>Sesión terminada</strong>: {mmss(summary.elapsedSec)} de respiración a{' '}
            {fmt1(summary.pattern.rpm)} rpm
            {(summary.pattern.rampSec ?? 0) > 0 ? ' (con rampa de entrada)' : ''}.
          </p>
          <button type="button" className="secondary" onClick={onCloseSummary}>
            Cerrar
          </button>
        </div>
      )}

      {confirmOff && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="breath-advanced-title">
            <h2 id="breath-advanced-title">Quitar las limitaciones de seguridad</h2>
            <p>{BREATH_TEXT.advanced}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setConfirmOff(false)
                onChange({ breath: { safetyLimits: false } })
              }}
            >
              Quitar, asumo el riesgo
            </button>{' '}
            <button type="button" className="play" onClick={() => setConfirmOff(false)}>
              Mantener las limitaciones
            </button>
          </div>
        </div>
      )}

      {asking && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="breath-safety-title">
            <h2 id="breath-safety-title">{BREATH_TEXT.safety.title}</h2>
            <p>{BREATH_TEXT.safety.intro}</p>
            <ul>
              {BREATH_TEXT.safety.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button type="button" className="play" onClick={acceptSafety}>
              {BREATH_TEXT.safety.button}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
