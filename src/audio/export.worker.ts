/// Web Worker: renderiza la exportación fuera del hilo de la interfaz, por trozos de 10 s.
import type { FromExportWorker, ToExportWorker } from './exportMessages'
import { renderJob } from './render'

const ctx = self as unknown as {
  postMessage(message: FromExportWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToExportWorker>) => void) | null
}

ctx.onmessage = (e) => {
  if (e.data.type !== 'start') return
  try {
    const out = renderJob(
      e.data.job,
      (chunk) => ctx.postMessage({ type: 'chunk', buffer: chunk.buffer as ArrayBuffer }, [chunk.buffer]),
      (fraction) => ctx.postMessage({ type: 'progress', fraction }),
    )
    const head = out.head ? (out.head.buffer as ArrayBuffer) : null
    ctx.postMessage(
      { type: 'done', header: out.header, head, frames: out.frames, sampleRate: out.sampleRate },
      head ? [head] : [],
    )
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
