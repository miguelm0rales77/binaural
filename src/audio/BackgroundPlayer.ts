import type { EngineParams } from '../dsp/types'
import { exportWav, type ExportHandle } from './wavExport'
import { wavHeader } from './wav'

export type BackgroundState = 'idle' | 'preparing' | 'playing' | 'paused'

/** Un WAV silencioso muy corto, para «desbloquear» el elemento <audio> dentro del gesto del usuario. */
function silentWavUrl(): string {
  const frames = 4000
  const bytes = new Uint8Array(44 + frames * 4)
  bytes.set(wavHeader(frames, 8000))
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

/**
 * Reproducción en segundo plano (iOS: el Web Audio se corta al bloquear la pantalla).
 * Genera un WAV de 5 min sin costuras y lo reproduce en bucle con un elemento <audio>,
 * que sigue sonando con la pantalla bloqueada y no depende del interruptor de silencio.
 * Integra los controles del sistema con `navigator.mediaSession`.
 */
export class BackgroundPlayer {
  onState: ((s: BackgroundState) => void) | null = null
  onProgress: ((fraction: number) => void) | null = null

  private audio: HTMLAudioElement | null = null
  private handle: ExportHandle | null = null
  private urls: string[] = []
  private state: BackgroundState = 'idle'
  private token = 0

  private set(s: BackgroundState): void {
    this.state = s
    this.onState?.(s)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'none'
    }
  }

  get current(): BackgroundState {
    return this.state
  }

  /** Debe llamarse desde un gesto del usuario (clic): el audio se desbloquea de forma síncrona. */
  async start(params: EngineParams, title: string): Promise<void> {
    this.stop()
    const my = ++this.token
    this.set('preparing')
    this.onProgress?.(0)

    const audio = new Audio()
    audio.loop = true
    audio.preload = 'auto'
    const silent = silentWavUrl()
    this.urls.push(silent)
    audio.src = silent
    this.audio = audio
    void audio.play().catch(() => {}) // desbloqueo; si falla, el play() final lo intentará de nuevo

    this.handle = exportWav({ kind: 'loop', params }, (f) => this.onProgress?.(f))
    let blob: Blob
    try {
      blob = await this.handle.promise
    } catch (e) {
      if (my === this.token) this.stop()
      if (e instanceof Error && e.message === 'cancelled') return
      throw e
    }
    if (my !== this.token) return // se paró o se relanzó mientras se generaba

    const url = URL.createObjectURL(blob)
    this.urls.push(url)
    audio.src = url
    audio.loop = true
    audio.onpause = () => {
      if (this.audio === audio && this.state === 'playing') this.set('paused')
    }
    audio.onplay = () => {
      if (this.audio === audio) this.set('playing')
    }
    this.setupMediaSession(title)
    await audio.play()
    if (my === this.token) this.set('playing')
  }

  private setupMediaSession(title: string): void {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Binaural',
      artwork: [
        { src: `${import.meta.env.BASE_URL}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    })
    navigator.mediaSession.setActionHandler('play', () => void this.audio?.play())
    navigator.mediaSession.setActionHandler('pause', () => this.audio?.pause())
    navigator.mediaSession.setActionHandler('stop', () => this.stop())
  }

  stop(): void {
    this.token++
    this.handle?.cancel()
    this.handle = null
    if (this.audio) {
      this.audio.onpause = null
      this.audio.onplay = null
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
      this.audio = null
    }
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls = []
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      for (const a of ['play', 'pause', 'stop'] as const) navigator.mediaSession.setActionHandler(a, null)
    }
    if (this.state !== 'idle') this.set('idle')
  }
}
