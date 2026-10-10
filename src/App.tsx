import { useEffect, useRef, useState } from 'react'
import { AudioController, type StateInfo } from './audio/AudioController'
import { BackgroundPlayer, type BackgroundState } from './audio/BackgroundPlayer'
import { bandFor } from './bands'
import type { EngineParams, NoiseType, Preset, Program } from './dsp/types'
import { MASTER_CEILING, NATURE_TYPES, RANGES, isNature, sanitizeParams } from './dsp/params'
import { NOISE_LABELS, PRESETS } from './presets'
import {
  ACCEPTED_KEY,
  ISO_WARNING_KEY,
  TIMER_OPTIONS_MIN,
  cleanPresetName,
  loadState,
  loadUserPresets,
  readFlag,
  saveState,
  saveUserPresets,
  writeFlag,
} from './storage'
import { ISO_FAST_WARNING } from './texts'
import { About } from './ui/About'
import { BackgroundPanel } from './ui/BackgroundPanel'
import { ExportPanel } from './ui/ExportPanel'
import { FirstUse } from './ui/FirstUse'
import { ModeSelector } from './ui/ModeSelector'
import { PresetPicker } from './ui/PresetPicker'
import { Slider } from './ui/Slider'
import { isoFastWarning, warningsFor } from './warnings'

type Status = 'stopped' | 'starting' | 'playing' | 'stopping'

const hz = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} Hz`
const pct = (v: number) => `${Math.round(v * 100)} %`

function mmss(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const readView = () => (window.location.hash === '#acerca' ? 'about' : 'main')

export default function App() {
  const [accepted, setAccepted] = useState(() => readFlag(ACCEPTED_KEY))
  const [isoSeen, setIsoSeen] = useState(() => readFlag(ISO_WARNING_KEY))
  const [view, setView] = useState<'main' | 'about'>(readView)
  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const accept = () => {
    writeFlag(ACCEPTED_KEY)
    setAccepted(true)
  }
  const dismissIso = () => {
    writeFlag(ISO_WARNING_KEY)
    setIsoSeen(true)
  }

  return (
    <>
      {view === 'about' ? <About /> : <Player accepted={accepted} isoSeen={isoSeen} onDismissIso={dismissIso} />}
      {!accepted && <FirstUse onAccept={accept} />}
    </>
  )
}

interface PlayerProps {
  accepted: boolean
  isoSeen: boolean
  onDismissIso: () => void
}

function Player({ accepted, isoSeen, onDismissIso }: PlayerProps) {
  const controller = useRef<AudioController | null>(null)
  const [initial] = useState(loadState)
  const [params, setParams] = useState<EngineParams>(initial.params)
  const [timerMin, setTimerMin] = useState<number | null>(initial.timerMin)
  const [userPresets, setUserPresets] = useState<Preset[]>(loadUserPresets)
  const [program, setProgram] = useState<Program | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('stopped')
  const bg = useRef<BackgroundPlayer | null>(null)
  const [bgState, setBgState] = useState<BackgroundState>('idle')
  const [bgProgress, setBgProgress] = useState(0)
  const [bgError, setBgError] = useState<string | null>(null)
  const [bgStale, setBgStale] = useState(false)
  const [info, setInfo] = useState<StateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const c = new AudioController()
    c.onState = setInfo
    c.onStopped = () => {
      setStatus('stopped')
      setInfo(null)
    }
    controller.current = c
    const b = new BackgroundPlayer()
    b.onState = setBgState
    b.onProgress = setBgProgress
    bg.current = b
    return () => {
      b.stop()
      void c.dispose()
    }
  }, [])

  // Guarda el último estado (con un pequeño retardo para no escribir en cada tick del slider).
  useEffect(() => {
    const id = setTimeout(() => saveState({ params, timerMin }), 250)
    return () => clearTimeout(id)
  }, [params, timerMin])

  useEffect(() => {
    saveUserPresets(userPresets)
  }, [userPresets])

  const update = (patch: Partial<EngineParams>) => {
    setBgStale(true)
    setParams((p) => ({ ...p, ...patch }))
    controller.current?.setParams(patch)
    // Tocar el pulso o la portadora a mano cancela el programa (igual que hace el motor).
    if (patch.beatHz !== undefined || patch.carrierHz !== undefined) setProgram(null)
    setActiveId(null)
  }

  const loadPreset = (p: Preset) => {
    if (status === 'starting' || status === 'stopping') return
    const next = sanitizeParams(params, p.params)
    setBgStale(true)
    setParams(next)
    setProgram(p.program ?? null)
    setActiveId(p.id)
    setTimerMin(p.suggestedMinutes)
    const c = controller.current
    if (c && status === 'playing') {
      // Todo se aplica con los suavizados del motor. Primero los parámetros (cancelan el programa
      // anterior) y después el programa nuevo, que empieza desde su principio.
      c.setParams(next)
      c.setProgram(p.program ?? null, 0)
      c.setTimer(p.suggestedMinutes === null ? null : p.suggestedMinutes * 60)
    }
  }

  const savePreset = (rawName: string) => {
    const name = cleanPresetName(rawName)
    if (!name) return
    const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    setUserPresets((list) => [...list, { id, name, params, ...(program ? { program } : {}), suggestedMinutes: timerMin }])
    setActiveId(id)
  }

  const deletePreset = (id: string) => {
    setUserPresets((list) => list.filter((p) => p.id !== id))
    setActiveId((a) => (a === id ? null : a))
  }

  const changeTimer = (min: number | null) => {
    setTimerMin(min)
    controller.current?.setTimer(min === null ? null : min * 60)
  }

  const toggle = async () => {
    const c = controller.current
    if (!c || !accepted) return
    if (status === 'playing') {
      setStatus('stopping')
      c.stop()
      return
    }
    if (status !== 'stopped') return
    bg.current?.stop() // el audio normal y el de segundo plano no suenan a la vez
    setStatus('starting')
    setError(null)
    try {
      await c.play(params, program, timerMin === null ? null : timerMin * 60)
      setStatus('playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('stopped')
    }
  }

  const startBackground = () => {
    if (!accepted) return
    if (status === 'playing') {
      setStatus('stopping')
      controller.current?.stop()
    }
    setBgError(null)
    setBgStale(false)
    bg.current
      ?.start(params, program?.name ?? 'Binaural')
      .catch((e) => setBgError(e instanceof Error ? e.message : String(e)))
  }

  const busy = status === 'starting' || status === 'stopping'
  const label = status === 'playing' ? 'Detener' : status === 'stopping' ? 'Deteniendo…' : 'Reproducir'
  const live = status === 'playing' && info !== null
  // Con un programa en marcha los sliders muestran el valor real (que va cambiando solo).
  const shown = program && live ? { ...params, beatHz: info.beatHz, carrierHz: info.carrierHz } : params
  const shownBeat = live ? info.beatHz : params.beatHz
  const band = bandFor(shownBeat)
  const warnings = warningsFor(params)
  const remaining = live ? info.remainingSec : null
  const timerChoices = [...new Set([...TIMER_OPTIONS_MIN, ...(timerMin === null ? [] : [timerMin])])].sort((a, b) => a - b)

  return (
    <main className="app">
      <h1>Binaural</h1>
      <p className="hint">Usa auriculares en modo binaural y mantén el volumen bajo.</p>

      <button className="play" onClick={toggle} disabled={busy} aria-live="polite">
        {label}
      </button>
      {error && (
        <p className="error" role="alert">
          No se pudo iniciar el audio: {error}
        </p>
      )}
      <p className="status" data-testid="status">
        {status === 'playing' && info
          ? remaining !== null && remaining <= 0
            ? 'Terminando la sesión…'
            : `Sonando · ${mmss(info.elapsedSec)}${remaining !== null ? ` · quedan ${mmss(remaining)}` : ''}`
          : status === 'stopping'
            ? 'Fundido de salida…'
            : 'Parado'}
      </p>

      {program && (
        <p className="program" data-testid="program">
          Programa: <strong>{program.name}</strong>
          {live && (
            <>
              {' '}
              · pulso actual <strong>{info.beatHz.toFixed(1)} Hz</strong>
              {remaining !== null && <> · quedan {mmss(remaining)}</>}
            </>
          )}
        </p>
      )}

      <PresetPicker
        builtIn={PRESETS}
        user={userPresets}
        activeId={activeId}
        onLoad={loadPreset}
        onSave={savePreset}
        onDelete={deletePreset}
      />

      <ModeSelector mode={params.mode} onChange={(mode) => update({ mode })} />

      <Slider
        label="Portadora"
        ariaLabel="Frecuencia portadora en hercios"
        scale="log"
        min={RANGES.carrierHz.min}
        max={RANGES.carrierHz.max}
        value={shown.carrierHz}
        format={hz}
        onChange={(carrierHz) => update({ carrierHz })}
      />
      <Slider
        label="Pulso"
        ariaLabel="Frecuencia del pulso en hercios"
        scale="log"
        min={RANGES.beatHz.min}
        max={RANGES.beatHz.max}
        value={shown.beatHz}
        format={hz}
        onChange={(beatHz) => update({ beatHz })}
      />

      <p className="band" data-band={band.id} data-testid="band">
        Banda: <strong>{band.name}</strong> <span>({band.range})</span>
      </p>
      {isoFastWarning(params) && !isoSeen && (
        <div className="warning" role="alert">
          <p>⚠ {ISO_FAST_WARNING.text}</p>
          <button type="button" onClick={onDismissIso}>
            {ISO_FAST_WARNING.button}
          </button>
        </div>
      )}
      {warnings.map((w) => (
        <p key={w} className="warning" role="status">
          ⚠ {w}
        </p>
      ))}

      {params.mode === 'isochronic' && (
        <Slider
          label="Profundidad isocrónica"
          ariaLabel="Profundidad de la modulación isocrónica"
          min={RANGES.isoDepth.min}
          max={RANGES.isoDepth.max}
          value={params.isoDepth}
          format={pct}
          onChange={(isoDepth) => update({ isoDepth })}
        />
      )}

      <Slider
        label="Volumen del tono"
        ariaLabel="Volumen del tono"
        min={0}
        max={1}
        value={params.toneGain}
        format={pct}
        onChange={(toneGain) => update({ toneGain })}
      />

      <div className="field">
        <label htmlFor="noise-type">Fondo</label>
        <select
          id="noise-type"
          value={params.noiseType}
          onChange={(e) => update({ noiseType: e.target.value as NoiseType })}
        >
          <option value="none">{NOISE_LABELS.none}</option>
          <optgroup label="Ruidos">
            {(['white', 'pink', 'brown'] as const).map((t) => (
              <option key={t} value={t}>
                {NOISE_LABELS[t]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Sonidos de la naturaleza">
            {NATURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOISE_LABELS[t]}
              </option>
            ))}
          </optgroup>
        </select>
        {isNature(params.noiseType) && (
          <small>
            Sonido generado por síntesis (no es una grabación) y siempre suave, sin picos repentinos.
            {params.noiseType === 'storm' && ' Incluye truenos lejanos y espaciados.'}
          </small>
        )}
      </div>
      <Slider
        label="Volumen del fondo"
        ariaLabel="Volumen del fondo"
        min={0}
        max={1}
        value={params.noiseGain}
        disabled={params.noiseType === 'none'}
        format={pct}
        onChange={(noiseGain) => update({ noiseGain })}
      />

      <Slider
        label="Volumen general"
        ariaLabel="Volumen general"
        min={0}
        max={MASTER_CEILING}
        value={params.masterGain}
        format={(v) => pct(v / MASTER_CEILING)}
        onChange={(masterGain) => update({ masterGain })}
      />

      <label className="check">
        <input
          type="checkbox"
          checked={params.loudnessComp}
          onChange={(e) => update({ loudnessComp: e.target.checked })}
        />
        <span>
          Compensación de sonoridad
          <small>Mantiene parecido el volumen percibido al cambiar la portadora.</small>
        </span>
      </label>

      <div className="field">
        <label htmlFor="timer">Temporizador</label>
        <select
          id="timer"
          value={timerMin ?? ''}
          onChange={(e) => changeTimer(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Sin límite</option>
          {timerChoices.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <small>Cuenta desde que lo eliges. Al terminar, el sonido se apaga con un fundido de 8 s.</small>
      </div>

      <ExportPanel params={params} program={program} timerMin={timerMin} disabled={!accepted} />

      <BackgroundPanel
        state={bgState}
        progress={bgProgress}
        hasProgram={program !== null}
        stale={bgStale}
        disabled={!accepted}
        error={bgError}
        onStart={startBackground}
        onStop={() => bg.current?.stop()}
      />

      <footer className="footer">
        <a href="#acerca">Acerca de / Ciencia</a>
      </footer>
    </main>
  )
}
