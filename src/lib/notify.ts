"use client";

import * as React from "react";
import type { RealtimeUpdate } from "@/lib/use-realtime";

/**
 * Preferencias y utilidades de notificación (solo navegador):
 *  - Sonido generado con WebAudio (sin archivos de audio).
 *  - Notificaciones del sistema (Notification API / Service Worker en Android-PWA).
 *  - Preferencias en localStorage, sincronizadas entre componentes y pestañas.
 */

const PREFS_KEY = "roraima:notif-prefs";
const PREFS_EVENT = "roraima:notif-prefs-change";

export type NotifPrefs = { sound: boolean; desktop: boolean };
const DEFAULT_PREFS: NotifPrefs = { sound: true, desktop: true };

let cachedRaw: string | null = null;
let cachedPrefs: NotifPrefs = DEFAULT_PREFS;

export function getNotifPrefs(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  const raw = window.localStorage.getItem(PREFS_KEY);
  if (raw === cachedRaw) return cachedPrefs; // misma referencia → useSyncExternalStore estable
  cachedRaw = raw;
  try {
    cachedPrefs = { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<NotifPrefs>) : {}) };
  } catch {
    cachedPrefs = DEFAULT_PREFS;
  }
  return cachedPrefs;
}

export function setNotifPrefs(patch: Partial<NotifPrefs>) {
  const next = { ...getNotifPrefs(), ...patch };
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function subscribePrefs(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === PREFS_KEY && cb();
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNotifPrefs() {
  return React.useSyncExternalStore(subscribePrefs, getNotifPrefs, () => DEFAULT_PREFS);
}

// ----------------------------------------------------------------------------
//  Permiso de notificaciones del sistema
// ----------------------------------------------------------------------------

export type PermissionState = NotificationPermission | "unsupported";

export function desktopPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window) || !window.isSecureContext) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopPermission(): Promise<PermissionState> {
  if (desktopPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return desktopPermission();
  }
}

// ----------------------------------------------------------------------------
//  Sonido (WebAudio)
// ----------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  audioCtx ??= new AC();
  return audioCtx;
}

/** Los navegadores exigen un gesto del usuario para habilitar audio: lo "desbloqueamos" en el primer clic. */
export function unlockAudioOnFirstGesture() {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    const c = ctx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return unlock;
}

export type Tone = "chime" | "success" | "blip" | "alert";

const TONES: Record<Tone, { f: number; t: number; d: number }[]> = {
  // Nueva orden / pago: dos notas ascendentes
  chime: [{ f: 880, t: 0, d: 0.18 }, { f: 1318.5, t: 0.12, d: 0.32 }],
  // Liberación / veredicto: arpegio mayor
  success: [{ f: 659.3, t: 0, d: 0.16 }, { f: 830.6, t: 0.1, d: 0.16 }, { f: 987.8, t: 0.2, d: 0.4 }],
  // Mensaje: toque suave y corto
  blip: [{ f: 1046.5, t: 0, d: 0.12 }],
  // Disputa / cancelación: dos notas descendentes
  alert: [{ f: 740, t: 0, d: 0.2 }, { f: 523.3, t: 0.16, d: 0.34 }],
};

export function playTone(tone: Tone) {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const start = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = tone === "blip" ? 0.12 : 0.18;
  master.connect(c.destination);
  for (const n of TONES[tone]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = n.f;
    g.gain.setValueAtTime(0.0001, start + n.t);
    g.gain.exponentialRampToValueAtTime(1, start + n.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + n.t + n.d);
    osc.connect(g).connect(master);
    osc.start(start + n.t);
    osc.stop(start + n.t + n.d + 0.05);
  }
}

// ----------------------------------------------------------------------------
//  Textos por evento (el bus excluye al autor, así que el destinatario es siempre la contraparte)
// ----------------------------------------------------------------------------

export type NotifContent = { title: string; body: string; tone: Tone; accent: "emerald" | "sky" | "amber" | "rose" | "indigo" | "zinc" };

export function describeEvent(e: RealtimeUpdate): NotifContent | null {
  const ref = e.tradeId ? ` #${e.tradeId.slice(-8).toUpperCase()}` : "";
  switch (e.kind) {
    case "TRADE_CREATED":
      return { title: "Nueva orden P2P", body: `Un usuario abrió la orden${ref} con tu anuncio. Atiéndela a tiempo.`, tone: "chime", accent: "amber" };
    case "MESSAGE":
      return { title: "Nuevo mensaje", body: `Tienes un mensaje nuevo en la orden${ref}.`, tone: "blip", accent: "sky" };
    case "PAID":
      return { title: "Pago notificado", body: `El comprador marcó la orden${ref} como pagada. Verifica en tu app bancaria antes de liberar.`, tone: "chime", accent: "emerald" };
    case "RELEASED":
      return { title: "USDT liberados", body: `El vendedor liberó los fondos de la orden${ref}. Ya están en tu billetera.`, tone: "success", accent: "emerald" };
    case "CANCELLED":
      return { title: "Orden cancelada", body: `La orden${ref} fue cancelada.`, tone: "alert", accent: "zinc" };
    case "DISPUTED":
      return { title: "Apelación abierta", body: `Se abrió una apelación en la orden${ref}. Sube tus comprobantes en el chat.`, tone: "alert", accent: "rose" };
    case "RESOLVED":
      return { title: "Disputa resuelta", body: `Un mediador emitió el veredicto de la orden${ref}.`, tone: "success", accent: "indigo" };
    default:
      return null;
  }
}

export const tradeUrl = (tradeId?: string) => (tradeId ? `/dashboard/p2p/trade/${tradeId}` : "/dashboard/p2p/orders");

/** Notificación del sistema. Escritorio: `new Notification`; Android/PWA: vía Service Worker. */
export async function showSystemNotification(content: NotifContent, url: string, tag: string, onClick: () => void) {
  if (desktopPermission() !== "granted") return;
  const options: NotificationOptions = { body: content.body, icon: "/icon-192x192.png", badge: "/icon-192x192.png", tag, data: { url } };
  try {
    const n = new Notification(content.title, options);
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    // Chrome Android no permite el constructor: usar el Service Worker
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.showNotification(content.title, options);
    } catch {
      /* sin soporte */
    }
  }
}

/**
 * Evita que varias pestañas abiertas suenen a la vez por el mismo evento.
 * La pestaña visible tiene prioridad (las ocultas esperan un poco antes de reclamar).
 */
export async function claimEvent(key: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks) return true;
  if (document.visibilityState !== "visible") await new Promise((r) => setTimeout(r, 250));
  return new Promise<boolean>((resolve) => {
    navigator.locks
      .request(`roraima-notif:${key}`, { ifAvailable: true }, async (lock) => {
        resolve(!!lock);
        // Retener el candado unos segundos para que las demás pestañas lo encuentren ocupado
        if (lock) await new Promise((r) => setTimeout(r, 4000));
      })
      .catch(() => resolve(true));
  });
}
