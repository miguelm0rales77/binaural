import type { FromExportWorker } from './exportMessages'
import ExportWorker from './export.worker.ts?worker'
import type { ExportJob } from './render'

export interface ExportHandle {
  promise: Promise<Blob>
  cancel: () => void
}

/** Cada ~32 MB de trozos se agrupan en un Blob para que el navegador pueda sacarlos de la memoria. */
const GROUP_BYTES = 32 * 1024 * 1024

/**
 * Renderiza el trabajo en un Web Worker y devuelve el WAV como Blob. `onProgress` recibe 0–1.
 * `cancel()` termina el worker y rechaza la promesa con `Error('cancelled')`.
 */
export function exportWav(job: ExportJob, onProgress: (fraction: number) => void = () => {}): ExportHandle {
  const worker = new ExportWorker()
  let rejectFn: (e: Error) => void = () => {}
  const promise = new Promise<Blob>((resolve, reject) => {
    rejectFn = reject
    const groups: Blob[] = []
    let pending: ArrayBuffer[] = []
    let pendingBytes = 0
    const flush = () => {
      if (pending.length === 0) return
      groups.push(new Blob(pending))
      pending = []
      pendingBytes = 0
    }
    worker.onmessage = (e: MessageEvent<FromExportWorker>) => {
      const m = e.data
      if (m.type === 'chunk') {
        pending.push(m.buffer)
        pendingBytes += m.buffer.byteLength
        if (pendingBytes >= GROUP_BYTES) flush()
      } else if (m.type === 'progress') {
        onProgress(m.fraction)
      } else if (m.type === 'done') {
        flush()
        // [cabecera][head del bucle, si hay][cuerpo]
        const parts: BlobPart[] = [m.header as BlobPart, ...(m.head ? [m.head] : []), ...groups]
        worker.terminate()
        resolve(new Blob(parts, { type: 'audio/wav' }))
      } else {
        worker.terminate()
        reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Error en el worker de exportación'))
    }
    worker.postMessage({ type: 'start', job })
  })
  return {
    promise,
    cancel: () => {
      worker.terminate()
      rejectFn(new Error('cancelled'))
    },
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
