/**
 * Háptica opcional con `navigator.vibrate`. Donde no existe (iOS Safari, por ejemplo) la función queda desactivada
 * sin lanzar errores. Es opcional y viene apagada por defecto.
 */

export interface VibrateNavigator {
  vibrate?: (pattern: number) => boolean
}

/** Vibración corta, de 20 ms: un aviso discreto, no un golpe. */
export const BUZZ_MS = 20

export function canVibrate(nav: VibrateNavigator | undefined = browserNavigator()): boolean {
  return typeof nav?.vibrate === 'function'
}

/** Vibra una vez si está activada y el dispositivo lo admite. Nunca lanza. */
export function buzz(enabled: boolean, nav: VibrateNavigator | undefined = browserNavigator()): void {
  if (!enabled || !canVibrate(nav)) return
  try {
    nav?.vibrate?.(BUZZ_MS)
  } catch {
    // algunos navegadores bloquean la vibración fuera de un gesto del usuario: se ignora
  }
}

function browserNavigator(): VibrateNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}
