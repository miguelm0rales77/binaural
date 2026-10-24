import { DspEngine } from '../dsp/engine'
import type { ParamsPatch } from '../dsp/types'
import { PROCESSOR_NAME, type FromWorklet, type ToWorklet } from './messages'

/** Como mucho 4 mensajes de estado por segundo. */
const STATE_EVERY_SEC = 0.25

class BinauralProcessor extends AudioWorkletProcessor {
  private readonly engine: DspEngine
  private samplesSinceState = 0

  constructor(options: AudioWorkletNodeOptions) {
    super(options)
    const initial = (options.processorOptions?.params ?? {}) as ParamsPatch
    this.engine = new DspEngine(sampleRate, initial)
    this.engine.onStopped = () => this.post({ type: 'stopped' })
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.onMessage(e.data)
  }

  private post(msg: FromWorklet): void {
    this.port.postMessage(msg)
  }

  private onMessage(msg: ToWorklet): void {
    switch (msg.type) {
      case 'params':
        this.engine.setParams(msg.params)
        break
      case 'start':
        this.engine.start()
        break
      case 'stop':
        this.engine.stop()
        break
      case 'program':
        this.engine.setProgram(msg.program, msg.startAtSec)
        break
      case 'timer':
        this.engine.setSessionTimer(msg.sec)
        break
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    const left = out?.[0]
    const right = out?.[1] ?? left
    if (!left || !right) return true
    this.engine.renderBlock(left, right, left.length)

    this.samplesSinceState += left.length
    if (this.samplesSinceState >= STATE_EVERY_SEC * sampleRate) {
      this.samplesSinceState = 0
      const s = this.engine.getState()
      this.post({ type: 'state', ...s })
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME, BinauralProcessor)
