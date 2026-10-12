"use client";

import * as React from "react";
import { Bell, BellOff, BellRing, Volume2, VolumeX } from "lucide-react";
import {
  desktopPermission, playTone, requestDesktopPermission, setNotifPrefs, useNotifPrefs, type PermissionState,
} from "@/lib/notify";

/** Controles de avisos en la barra lateral: sonido on/off y notificaciones del sistema. */
export function NotificationToggle({ collapsed = false }: { collapsed?: boolean }) {
  const prefs = useNotifPrefs();
  const [perm, setPerm] = React.useState<PermissionState>("default");

  React.useEffect(() => {
    setPerm(desktopPermission());
  }, []);

  const toggleSound = () => {
    const next = !prefs.sound;
    setNotifPrefs({ sound: next });
    if (next) playTone("blip"); // muestra cómo suena
  };

  const toggleDesktop = async () => {
    if (perm === "unsupported") return;
    if (perm === "default") {
      const p = await requestDesktopPermission();
      setPerm(p);
      if (p === "granted") setNotifPrefs({ desktop: true });
      return;
    }
    if (perm === "denied") return;
    setNotifPrefs({ desktop: !prefs.desktop });
  };

  const desktopOn = perm === "granted" && prefs.desktop;
  const DesktopIcon = desktopOn ? BellRing : perm === "default" ? Bell : BellOff;
  const desktopTitle =
    perm === "unsupported"
      ? "Tu navegador no admite notificaciones del sistema (requiere HTTPS o localhost)"
      : perm === "denied"
        ? "Bloqueaste las notificaciones. Actívalas desde el candado de la barra de direcciones."
        : perm === "default"
          ? "Activar notificaciones del sistema"
          : desktopOn
            ? "Notificaciones del sistema activadas"
            : "Notificaciones del sistema desactivadas";

  const btn = (on: boolean) =>
    `p-2 rounded-xl border transition-all hover:scale-105 active:scale-95 ${
      on
        ? "bg-amber-400/15 border-amber-400/40 text-amber-600 dark:text-amber-400"
        : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400"
    }`;

  const soundBtn = (
    <button id="notif-sound-toggle" onClick={toggleSound} title={prefs.sound ? "Silenciar sonido de avisos" : "Activar sonido de avisos"} aria-pressed={prefs.sound} className={btn(prefs.sound)}>
      {prefs.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );

  if (collapsed) return <div className="flex justify-center">{soundBtn}</div>;

  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">Avisos</span>
        <div className="flex items-center gap-2">
          {soundBtn}
          <button
            id="notif-desktop-toggle"
            onClick={toggleDesktop}
            title={desktopTitle}
            aria-pressed={desktopOn}
            disabled={perm === "unsupported" || perm === "denied"}
            className={`${btn(desktopOn)} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
          >
            <DesktopIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {perm === "default" && (
        <button
          id="notif-enable-cta"
          onClick={toggleDesktop}
          className="text-[11px] font-semibold text-left text-amber-600 dark:text-amber-400 hover:underline"
        >
          Activa las notificaciones para no perder órdenes →
        </button>
      )}
    </div>
  );
}
