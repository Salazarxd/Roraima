/**
 * Utilidades de Feedback Háptico (Vibración) para dispositivos móviles.
 * Utiliza navigator.vibrate de forma segura y tolerante a fallos.
 */

export function triggerHaptic(pattern: number | number[] = 15) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silencioso en navegadores o políticas de permisos que bloqueen vibración
  }
}

/** Vibración sutil para toques de botón o copias rápidas (15ms) */
export function hapticTap() {
  triggerHaptic(15);
}

/** Vibración suave de confirmación / éxito (35ms) */
export function hapticSuccess() {
  triggerHaptic([25, 30, 35]);
}

/** Vibración de alerta o error */
export function hapticError() {
  triggerHaptic([50, 40, 50]);
}

/** Vibración rítmica para notificación entrante de chat */
export function hapticMessage() {
  triggerHaptic([35, 30, 45]);
}
