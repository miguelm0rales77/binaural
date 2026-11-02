import { useEffect, useReducer, useRef, useState } from 'react'
import { BilateralController, type BilateralStateInfo } from '../audio/BilateralController'
import { RESONANCE_PATTERN } from '../breathPresets'
import { breathStateInto, type BreathState } from '../dsp/breath'
import {
  BED_TYPES,
  BILATERAL_MODES,
  BILATERAL_RANGES,
  lfoUnits,
  type BedType,
  type BilateralMode,
  type BilateralParams,
  type TestEar,
} from '../dsp/bilateral'
import { localDate } from '../practice'
import { BILATERAL_TEXT } from '../texts'
import { buzz, canVibrate } from '../bilateral/haptics'
import {
  DEFAULT_CONFIG,
  clearBilateralData,
  loadConfig,
  loadLog,
  saveConfig,
  saveLog,
  type BilateralConfig,
  type LogEntry,
} from '../bilateral/storage'
import {
  INITIAL_SESSION,
  PLANNED_MIN,
  guideAt,
  pickMode,
  reduce,
  visibleMode,
  type SessionState,
} from '../bilateral/session'
import { AlertIcon } from './icons'
import { Slider } from './Slider'

const T = BILATERAL_TEXT
/** Estado reutilizable del reloj respiratorio de la pausa (no se reserva memoria por fotograma). */
const scratch: BreathState = { phase: 'in', phaseProgress: 0, phaseSec: 0, lung: 0, cycleIndex: 0 }
const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const hzText = (hz: number) => {
  const u = lfoUnits(hz)
  return `${hz.toFixed(2)} Hz · ${Math.round(u.bpm)} ciclos/min · ${Math.round(u.sweepsPerMin)} barridos/min`
}

/** Parámetros del motor para una fase: la configuración más el modo, y la calibración si la hay. */
function engineParams(c: BilateralConfig, mode: BilateralMode, test: TestEar): Partial<BilateralParams> {
  return {
    mode,
    lfoHz: c.lfoHz,
    bgBinaural: c.bgBinaural,
    bgBeatHz: c.bgBeatHz,
    bed: c.bed,
    test,
  }
}

/** Sección de la página principal: solo la entrada a la meditación. */
export function BilateralSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="bilateral-entry" aria-labelledby="bilateral-title">
      <p className="eyebrow">Meditación · Paneo</p>
      <h2 id="bilateral-title">{T.title}</h2>
      <p className="muted">{T.intro}</p>
      <p className="hint">{T.headphones}</p>
      <button type="button" className="secondary" onClick={onOpen}>
        Abrir la meditación bilateral
      </button>
    </section>
  )
}

interface Props {
  onClose: () => void
}

/**
 * Vista de la sesión a pantalla completa. La reproducción de otros sonidos se para al abrirla. Las fases son:
 * preparación, calibración, meditación, pausa («Calma»), cierre y registro.
 */
export function BilateralMode({ onClose }: Props) {
  const [config, setConfig] = useState<BilateralConfig>(loadConfig)
  const [s, dispatch] = useReducer(reduce, INITIAL_SESSION)
  const [error, setError] = useState<string | null>(null)
  const [stereo, setStereo] = useState(true)
  const [log, setLog] = useState<LogEntry[]>(loadLog)
  const [note, setNote] = useState('')
  const [scales, setScales] = useState({ calma: '', atencion: '', activacion: '', malestar: '' })
  const [deleted, setDeleted] = useState(false)
  const controller = useRef<BilateralController | null>(null)
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Creación del controlador. La salida estéreo se comprueba al empezar (es cuando existe el contexto de audio).
  useEffect(() => {
    const c = new BilateralController()
    c.onState = (m: BilateralStateInfo) => dispatch({ type: 'tick', elapsedSec: m.elapsedSec })
    c.onSide = () => buzz(configRef.current.haptics)
    controller.current = c
    return () => {
      // Si la sesión sigue, se hace el fundido antes de cerrar el contexto.
      c.stop()
      setTimeout(() => void c.dispose(), 2600)
      controller.current = null
    }
  }, [])

  // Con «Salir» (Esc) en una fase activa se detiene la sesión; si no, se cierra la vista.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (s.phase === 'calibracion' || s.phase === 'meditacion' || s.phase === 'pausa') dispatch({ type: 'salir' })
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.phase, onClose])

  // Efectos de audio según la fase.
  useEffect(() => {
    const c = controller.current
    if (!c) return
    if (s.phase === 'calibracion') {
      // Primero el oído izquierdo y después el derecho, cada uno solo en su oído.
      c.setParams({ test: s.ears.left === 'oida' ? 'right' : 'left' })
    } else if (s.phase === 'meditacion') {
      c.setAlternation(false)
      c.setParams(engineParams(configRef.current, s.mode, null))
    } else if (s.phase === 'pausa') {
      c.setAlternation(true, s.alert)
    } else if (s.phase === 'cierre') {
      c.stop()
    }
  }, [s.phase, s.ears.left, s.ears.right, s.mode, s.alert])

  const updateConfig = (patch: Partial<BilateralConfig>) => {
    setConfig((c) => {
      const next = { ...c, ...patch }
      saveConfig(next)
      return next
    })
  }

  const begin = async () => {
    const c = controller.current
    if (!c) return
    setError(null)
    setDeleted(false)
    const cfg = configRef.current
    const mode = cfg.blind ? pickMode(Math.random, BILATERAL_MODES) : cfg.mode
    dispatch({ type: 'begin', mode, blind: cfg.blind, plannedMin: cfg.plannedMin })
    try {
      await c.play(engineParams(cfg, mode, 'left'))
      setStereo(c.stereoOutput)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      dispatch({ type: 'abort' })
    }
  }

  const answerEar = (side: 'left' | 'right', heard: boolean) => dispatch({ type: 'ear', side, heard })

  const saveEntry = () => {
    const entry: LogEntry = {
      id: newEntryId(),
      date: localDate(),
      durationSec: Math.round(Math.max(0, s.elapsedSec - s.medStartSec)),
      endReason: s.endReason ?? 'usuario',
      mode: s.mode,
      blind: s.blind,
      lfoHz: configRef.current.lfoHz,
      calma: toScale(scales.calma),
      atencion: toScale(scales.atencion),
      activacion: toScale(scales.activacion),
      malestar: toScale(scales.malestar),
      nota: note.slice(0, 500),
    }
    const next = [...log, entry]
    saveLog(next)
    setLog(next)
    finishRecord()
  }

  const finishRecord = () => {
    setNote('')
    setScales({ calma: '', atencion: '', activacion: '', malestar: '' })
    dispatch({ type: 'finish' })
  }

  const deleteAll = () => {
    if (!window.confirm(T.data.confirm)) return
    clearBilateralData()
    setConfig(DEFAULT_CONFIG)
    setLog([])
    setDeleted(true)
  }

  const meditationSec = s.elapsedSec - s.medStartSec
  const remaining = s.plannedSec - meditationSec
  const sessionSec = s.elapsedSec - s.startSec
  const modeShown = visibleMode(s)
  const guideStep = guideAt(meditationSec, T.guide)
  const inSession = s.phase === 'calibracion' || s.phase === 'meditacion' || s.phase === 'pausa'

  return (
    <div className="bilateral" role="dialog" aria-modal="true" aria-label={T.title} data-testid="bilateral-mode">
      <div className="bilateral-inner">
        <header className="bilateral-head">
          <div>
            <p className="eyebrow">{phaseLabel(s.phase)}</p>
            <h2>{T.title}</h2>
          </div>
          {inSession ? (
            <button type="button" className="play" onClick={() => dispatch({ type: 'salir' })} data-testid="bilateral-exit">
              {T.meditation.exit}
            </button>
          ) : (
            <button type="button" className="secondary" onClick={onClose}>
              Cerrar
            </button>
          )}
        </header>

        <p className="bilateral-banner" role="note" data-testid="bilateral-banner">
          {T.banner}
        </p>

        {!stereo && (
          <p className="warning" role="alert">
            <AlertIcon />
            <span>{T.stereoMissing}</span>
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            <AlertIcon />
            <span>No se pudo iniciar el audio: {error}</span>
          </p>
        )}

        {s.phase === 'preparacion' && (
          <Preparation
            config={config}
            onChange={updateConfig}
            onBegin={begin}
            onDelete={deleteAll}
            deleted={deleted}
          />
        )}

        {s.phase === 'calibracion' && (
          <section className="bilateral-section" aria-labelledby="cal-title">
            <h3 id="cal-title">{T.calibration.title}</h3>
            <p className="muted">{T.calibration.intro}</p>
            {s.ears.left !== 'oida' ? (
              <EarQuestion
                text={T.calibration.left}
                onYes={() => answerEar('left', true)}
                onNo={() => answerEar('left', false)}
              />
            ) : (
              <EarQuestion
                text={T.calibration.right}
                onYes={() => answerEar('right', true)}
                onNo={() => answerEar('right', false)}
              />
            )}
            {(s.ears.left === 'no-oida' || s.ears.right === 'no-oida') && (
              <>
                <p className="warning" role="status">
                  <AlertIcon />
                  <span>{T.calibration.stuck}</span>
                </p>
                <button type="button" className="secondary" onClick={() => dispatch({ type: 'retry' })}>
                  {T.calibration.retry}
                </button>
              </>
            )}
          </section>
        )}

        {s.phase === 'meditacion' && (
          <Meditation
            guide={T.guide[guideStep.index]?.text ?? ''}
            remainingSec={remaining}
            discomfort={s.discomfort}
            onDiscomfort={(value) => dispatch({ type: 'rate', value })}
            onCalma={() => dispatch({ type: 'calma' })}
          />
        )}

        {s.phase === 'pausa' && (
          <Pause
            alert={s.alert}
            discomfort={s.discomfort}
            onDiscomfort={(value) => dispatch({ type: 'rate', value })}
            onResume={() => dispatch({ type: 'resume' })}
            onExit={() => dispatch({ type: 'salir' })}
          />
        )}

        {s.phase === 'cierre' && (
          <section className="bilateral-section" aria-labelledby="close-title">
            <h3 id="close-title">{T.closing.title}</h3>
            <p className="muted">{s.endReason ? T.endReasons[s.endReason] : ''}</p>
            <ol className="bilateral-closing">
              {T.closing.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="muted">
              {T.meditation.remaining}: {mmss(Math.max(0, remaining))} · {mmss(sessionSec)}
            </p>
            <button type="button" className="play" onClick={() => dispatch({ type: 'continue' })}>
              {T.closing.button}
            </button>
          </section>
        )}

        {s.phase === 'registro' && (
          <Record
            blind={s.blind}
            mode={modeShown}
            scales={scales}
            onScales={setScales}
            note={note}
            onNote={setNote}
            onSave={saveEntry}
            onSkip={finishRecord}
          />
        )}

        {log.length > 0 && s.phase === 'preparacion' && (
          <p className="muted bilateral-count">
            {log.length === 1 ? 'Hay 1 sesión registrada en este dispositivo.' : `Hay ${log.length} sesiones registradas en este dispositivo.`}
          </p>
        )}
      </div>
    </div>
  )
}

/** Identificador local de una entrada del registro (no es un dato externo). */
function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function phaseLabel(phase: SessionState['phase']): string {
  switch (phase) {
    case 'preparacion':
      return 'Preparación'
    case 'calibracion':
      return 'Calibración'
    case 'meditacion':
      return 'Meditación'
    case 'pausa':
      return 'Calma'
    case 'cierre':
      return 'Cierre'
    case 'registro':
      return 'Registro'
  }
}

const toScale = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null
}

interface PreparationProps {
  config: BilateralConfig
  onChange: (patch: Partial<BilateralConfig>) => void
  onBegin: () => void
  onDelete: () => void
  deleted: boolean
}

function Preparation({ config, onChange, onBegin, onDelete, deleted }: PreparationProps) {
  const hapticsOk = canVibrate()
  return (
    <div className="bilateral-section">
      <p className="muted">{T.intro}</p>
      <p className="warning" role="note" data-testid="bilateral-headphones">
        <AlertIcon />
        <span>
          {T.headphones} {T.headphonesUnknown}
        </span>
      </p>
      <p className="muted">{T.limits}</p>
      <p className="muted">{T.defaults}</p>

      <Slider
        label={T.speed.label}
        ariaLabel={T.speed.label}
        min={BILATERAL_RANGES.lfoHz.min}
        max={BILATERAL_RANGES.lfoHz.max}
        step={0.05}
        value={config.lfoHz}
        format={hzText}
        onChange={(lfoHz) => onChange({ lfoHz })}
      />
      <p className="muted">{T.speed.hint}</p>

      <label className="check">
        <input type="checkbox" checked={config.blind} onChange={(e) => onChange({ blind: e.target.checked })} />
        <span>
          Modo ciego
          <small>{config.blind ? T.blindOn : T.blindOff}</small>
        </span>
      </label>

      {!config.blind && (
        <fieldset className="bilateral-fieldset">
          <legend>{T.modeLabel}</legend>
          {BILATERAL_MODES.map((m) => (
            <label key={m} className="check">
              <input
                type="radio"
                name="bilateral-mode"
                value={m}
                checked={config.mode === m}
                onChange={() => onChange({ mode: m })}
              />
              <span>{T.modes[m]}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="bilateral-duration">Duración planeada</label>
        <select
          id="bilateral-duration"
          value={config.plannedMin}
          onChange={(e) => onChange({ plannedMin: Number(e.target.value) })}
        >
          {[5, 10, 15, 20, 25, 30]
            .filter((m) => m >= PLANNED_MIN.min && m <= PLANNED_MIN.max)
            .map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
        </select>
        <small>Por defecto, {PLANNED_MIN.default} min. Límite duro de 30 min desde el inicio de la calibración.</small>
      </div>

      <label className="check">
        <input type="checkbox" checked={config.bgBinaural} onChange={(e) => onChange({ bgBinaural: e.target.checked })} />
        <span>
          Fondo binaural
          <small>{T.bgBinaural}</small>
        </span>
      </label>
      {config.bgBinaural && (
        <Slider
          label={T.bgBeat}
          ariaLabel={T.bgBeat}
          min={BILATERAL_RANGES.bgBeatHz.min}
          max={BILATERAL_RANGES.bgBeatHz.max}
          step={0.5}
          value={config.bgBeatHz}
          format={(v) => `${v.toFixed(1)} Hz`}
          onChange={(bgBeatHz) => onChange({ bgBeatHz })}
        />
      )}

      <div className="field">
        <label htmlFor="bilateral-bed">{T.bedLabel}</label>
        <select
          id="bilateral-bed"
          value={config.bed}
          onChange={(e) => onChange({ bed: e.target.value as BedType })}
        >
          {BED_TYPES.map((b) => (
            <option key={b} value={b}>
              {T.bedNames[b]}
            </option>
          ))}
        </select>
        <small>Sonido generado por síntesis, no es una grabación. Solo suena en «Calma».</small>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={config.haptics && hapticsOk}
          disabled={!hapticsOk}
          onChange={(e) => onChange({ haptics: e.target.checked })}
        />
        <span>
          {T.haptics}
          {!hapticsOk && <small>{T.hapticsUnavailable}</small>}
        </span>
      </label>

      <button type="button" className="play" onClick={onBegin}>
        {T.start}
      </button>

      <div className="bilateral-data">
        <button type="button" className="secondary" onClick={onDelete}>
          {T.data.delete}
        </button>
        {deleted && (
          <p className="muted" role="status">
            {T.data.deleted}
          </p>
        )}
      </div>
    </div>
  )
}

function EarQuestion({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="bilateral-ear">
      <p>{text}</p>
      <div className="bilateral-actions">
        <button type="button" className="play" onClick={onYes}>
          {T.calibration.yes}
        </button>
        <button type="button" className="secondary" onClick={onNo}>
          {T.calibration.no}
        </button>
      </div>
    </div>
  )
}

function Discomfort({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {T.meditation.discomfort} <output>{value === null ? 'sin marcar' : value}</output>
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value ?? 0}
        aria-label={T.meditation.discomfort}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Meditation(props: {
  guide: string
  remainingSec: number
  discomfort: number | null
  onDiscomfort: (v: number) => void
  onCalma: () => void
}) {
  return (
    <section className="bilateral-section bilateral-meditation" aria-labelledby="med-title">
      <h3 id="med-title">{T.meditation.title}</h3>
      <p className="bilateral-guide" aria-live="polite" data-testid="bilateral-guide">
        {props.guide}
      </p>
      <p className="muted">
        {T.meditation.remaining}: {mmss(props.remainingSec)} · {T.meditation.limit}
      </p>
      <Discomfort value={props.discomfort} onChange={props.onDiscomfort} />
      <div className="bilateral-actions">
        <button type="button" className="secondary" onClick={props.onCalma}>
          {T.meditation.calma}
        </button>
      </div>
    </section>
  )
}

function Pause(props: {
  alert: boolean
  discomfort: number | null
  onDiscomfort: (v: number) => void
  onResume: () => void
  onExit: () => void
}) {
  const circle = useRef<HTMLDivElement>(null)
  const origin = useRef(0)

  useEffect(() => {
    let raf = 0
    origin.current = performance.now()
    const frame = () => {
      const el = circle.current
      if (el) {
        const lung = breathStateInto(scratch, (performance.now() - origin.current) / 1000, RESONANCE_PATTERN).lung
        el.style.transform = `scale(${(0.6 + 0.4 * lung).toFixed(3)})`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section className="bilateral-section bilateral-pause" aria-labelledby="pause-title">
      <h3 id="pause-title">{T.pause.title}</h3>
      <div className="bilateral-circle-wrap" aria-hidden="true">
        <div className="bilateral-circle" ref={circle} />
      </div>
      <p className="muted">{T.pause.text}</p>
      {props.alert && (
        <p className="error" role="alert" data-testid="bilateral-alert">
          <AlertIcon />
          <span>{T.pause.alert}</span>
        </p>
      )}
      <Discomfort value={props.discomfort} onChange={props.onDiscomfort} />
      {props.alert && <p className="muted">{T.pause.resumeBlocked}</p>}
      <div className="bilateral-actions">
        <button type="button" className={props.alert ? 'secondary' : 'play'} onClick={props.onResume} disabled={props.alert}>
          {T.pause.resume}
        </button>
        <button type="button" className={props.alert ? 'play' : 'secondary'} onClick={props.onExit}>
          {T.meditation.exit}
        </button>
      </div>
    </section>
  )
}

function Record(props: {
  blind: boolean
  mode: BilateralMode | null
  scales: { calma: string; atencion: string; activacion: string; malestar: string }
  onScales: (s: { calma: string; atencion: string; activacion: string; malestar: string }) => void
  note: string
  onNote: (v: string) => void
  onSave: () => void
  onSkip: () => void
}) {
  const keys = ['calma', 'atencion', 'activacion', 'malestar'] as const
  return (
    <section className="bilateral-section" aria-labelledby="record-title">
      <h3 id="record-title">{T.record.title}</h3>
      <p className="muted">{T.record.intro}</p>
      <p className="muted">
        {T.record.modeTitle}:{' '}
        <strong data-testid="bilateral-revealed-mode">
          {props.mode ? T.modes[props.mode] : '—'}
        </strong>
        {props.blind && <small> {T.record.modeHidden}</small>}
      </p>
      {keys.map((k) => (
        <label className="field" key={k}>
          <span>{T.record.scales[k]}</span>
          <input
            type="number"
            min={0}
            max={10}
            step={1}
            inputMode="numeric"
            value={props.scales[k]}
            aria-describedby={`scale-hint-${k}`}
            onChange={(e) => props.onScales({ ...props.scales, [k]: e.target.value })}
          />
          <small id={`scale-hint-${k}`}>{T.record.scaleHint}</small>
        </label>
      ))}
      <div className="field">
        <label htmlFor="bilateral-note">{T.record.note}</label>
        <textarea
          id="bilateral-note"
          rows={3}
          maxLength={500}
          value={props.note}
          onChange={(e) => props.onNote(e.target.value)}
        />
      </div>
      <div className="bilateral-actions">
        <button type="button" className="play" onClick={props.onSave}>
          {T.record.save}
        </button>
        <button type="button" className="secondary" onClick={props.onSkip}>
          {T.record.skip}
        </button>
      </div>
    </section>
  )
}
