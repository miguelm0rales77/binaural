import type { EngineParams, ParamsPatch, Program } from '../dsp/types'
import workletUrl from './engine.worklet.ts?worker&url'
import { PROCESSOR_NAME, type FromWorklet, type ToWorklet } from './messages'

export type StateInfo = Extract<FromWorklet, { type: 'state' }>

/**
 * Contexto de audio y cadena master: worklet → gain → limitador → destino.
 * El contexto se crea/reanuda solo dentro de `play()`, que debe llamarse desde un gesto del usuario.
 */
export class AudioController {
  onState: ((s: StateInfo) => void) | null = null
  onStopped: (() => void) | null = null

  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private moduleLoaded = false
  /** Tiempo del contexto en el que el motor empezó (reloj 0 de la sesión). */
  private startCtx = 0
  /** Instante del reloj de la sesión en el que la respiración vale fase 0 (lo informa el motor). */
  private breathOriginSec = 0

  get isRunning(): boolean {
    return this.node !== null
  }

  private send(msg: ToWorklet): void {
    this.node?.port.postMessage(msg)
  }

  async play(params: EngineParams, program: Program | null = null, timerSec: number | null = null) {
    // Crear y reanudar el contexto de forma síncrona, dentro del gesto del usuario.
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'playback' })
    const ctx = this.ctx
    const resumed = ctx.resume()

    if (!this.moduleLoaded) {
      await ctx.audioWorklet.addModule(workletUrl)
      this.moduleLoaded = true
    }
    await resumed

    if (!this.node) {
      const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { params },
      })
      const master = ctx.createGain()
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -6
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.003
      limiter.release.value = 0.25
      node.connect(master).connect(limiter).connect(ctx.destination)
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
        if (e.data.type === 'state') {
          this.breathOriginSec = e.data.breathOriginSec
          this.onState?.(e.data)
        } else this.onStopped?.()
      }
      this.node = node
    }

    this.send({ type: 'params', params })
    this.send({ type: 'program', program, startAtSec: 0 })
    this.send({ type: 'timer', sec: timerSec })
    this.startCtx = ctx.currentTime
    this.send({ type: 'start' })
  }

  /**
   * Segundos desde la fase 0 de la respiración, según el reloj del contexto de audio. Lo usa la
   * interfaz para dibujar el círculo. null si no hay contexto.
   */
  breathTimeSec(): number | null {
    if (!this.ctx) return null
    return this.ctx.currentTime - this.startCtx - this.breathOriginSec
  }

  setParams(params: ParamsPatch): void {
    this.send({ type: 'params', params })
  }

  setProgram(program: Program | null, startAtSec = 0): void {
    this.send({ type: 'program', program, startAtSec })
  }

  setTimer(sec: number | null): void {
    this.send({ type: 'timer', sec })
  }

  /** Inicia el fundido de salida; el worklet avisa con `stopped` al terminar. */
  stop(): void {
    this.send({ type: 'stop' })
  }

  async dispose(): Promise<void> {
    this.node?.disconnect()
    this.node = null
    await this.ctx?.close()
    this.ctx = null
    this.moduleLoaded = false
  }
}
