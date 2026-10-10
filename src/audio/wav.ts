/** WAV PCM de 16 bits. Todo en little-endian. */

export const BYTES_PER_FRAME = 4 // 2 canales × 16 bits

/** Cabecera RIFF/WAVE de 44 bytes para `frames` fotogramas estéreo de 16 bits. */
export function wavHeader(frames: number, sampleRate: number): Uint8Array {
  const dataBytes = frames * BYTES_PER_FRAME
  const buf = new ArrayBuffer(44)
  const v = new DataView(buf)
  const text = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true) // tamaño del bloque fmt
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 2, true) // canales
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * BYTES_PER_FRAME, true) // byte rate
  v.setUint16(32, BYTES_PER_FRAME, true) // block align
  v.setUint16(34, 16, true) // bits por muestra
  text(36, 'data')
  v.setUint32(40, dataBytes, true)
  return new Uint8Array(buf)
}

/** Float [-1, 1] → entero de 16 bits (redondeo y recorte). */
export function toInt16(x: number): number {
  const v = Math.round(x * 32767)
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v
}

/** Tamaño en bytes de un WAV estéreo de 16 bits. */
export function wavSizeBytes(frames: number): number {
  return 44 + frames * BYTES_PER_FRAME
}
