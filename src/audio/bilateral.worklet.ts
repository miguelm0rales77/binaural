import { BilateralEngine, type BilateralParams } from '../dsp/bilateral'
import { BILATERAL_PROCESSOR_NAME, type BilateralFromWorklet, type BilateralToWorklet } from './bilateralMessages'

/** Como mucho 4 mensajes de estado por segundo. */
const STATE_EVERY_SEC = 0.25

class BilateralProcessor extends AudioWorkletProcessor {
  private readonly engine: BilateralEngine
  private samplesSinceState = 0

  constructor(options: AudioWorkletNodeOptions) {
    super(options)
    const initial = (options.processorOptions?.params ?? {}) as Partial<BilateralParams>
    this.engine = new BilateralEngine(sampleRate, initial, Math.random)
    this.engine.onStopped = () => this.post({ type: 'stopped' })
    this.engine.onSide = (side) => this.post({ type: 'side', side })
    this.port.onmessage = (e: MessageEvent<BilateralToWorklet>) => this.onMessage(e.data)
  }

  private post(msg: BilateralFromWorklet): void {
    this.port.postMessage(msg)
  }

  private onMessage(msg: BilateralToWorklet): void {
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
      case 'alternation':
        this.engine.setAlternation(msg.calm, msg.fast)
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
      this.post({ type: 'state', ...this.engine.getState() })
    }
    return true
  }
}

registerProcessor(BILATERAL_PROCESSOR_NAME, BilateralProcessor)
