import type { BilateralParams } from '../dsp/bilateral'
import workletUrl from './bilateral.worklet.ts?worker&url'
import { BILATERAL_PROCESSOR_NAME, type BilateralFromWorklet, type BilateralToWorklet } from './bilateralMessages'

export type BilateralStateInfo = Extract<BilateralFromWorklet, { type: 'state' }>

/**
 * Contexto y cadena de salida de la meditación bilateral: worklet → ganancia → limitador → destino.
 * Es independiente del reproductor principal. Cada sesión crea su propio nodo: así no arrastra la alternancia
 * ni la cama de la sesión anterior. El contexto se crea dentro de `play()`, desde un gesto del usuario.
 */
export class BilateralController {
  onState: ((s: BilateralStateInfo) => void) | null = null
  onSide: ((side: -1 | 1) => void) | null = null
  onStopped: (() => void) | null = null

  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private moduleLoaded = false

  /** La salida admite dos canales. No se puede saber si hay auriculares: eso lo dice la interfaz. */
  stereoOutput = true

  private send(msg: BilateralToWorklet): void {
    this.node?.port.postMessage(msg)
  }

  async play(params: Partial<BilateralParams>): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'playback' })
    const ctx = this.ctx
    const resumed = ctx.resume()

    if (!this.moduleLoaded) {
      await ctx.audioWorklet.addModule(workletUrl)
      this.moduleLoaded = true
    }
    await resumed

    if (this.node) {
      this.node.port.onmessage = null // el nodo anterior ya no puede avisar de nada
      this.node.disconnect()
    }
    const node = new AudioWorkletNode(ctx, BILATERAL_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { params },
    })
    const master = ctx.createGain()
    master.gain.value = 0.8 // techo de volumen general, como en el reproductor principal
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    node.connect(master).connect(limiter).connect(ctx.destination)
    node.port.onmessage = (e: MessageEvent<BilateralFromWorklet>) => {
      const m = e.data
      if (m.type === 'state') this.onState?.(m)
      else if (m.type === 'side') this.onSide?.(m.side)
      else this.onStopped?.()
    }
    this.node = node
    this.stereoOutput = ctx.destination.maxChannelCount >= 2

    this.send({ type: 'start' })
  }

  setParams(params: Partial<BilateralParams>): void {
    this.send({ type: 'params', params })
  }

  setAlternation(calm: boolean, fast = false): void {
    this.send({ type: 'alternation', calm, fast })
  }

  /** Fundido de salida de 2,5 s; `onStopped` avisa al terminar. */
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
