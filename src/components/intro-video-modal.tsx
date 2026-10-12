"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, SkipForward, Play, AlertCircle } from "lucide-react";
import { useSystemSettings } from "@/components/settings-provider";

export function IntroVideoModal() {
  const settings = useSystemSettings();
  const [isVisible, setIsVisible] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [hasError, setHasError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Determinar si corresponde mostrar el video hoy
  useEffect(() => {
    // Función para comprobar si se debe ejecutar el video
    const checkShouldPlay = () => {
      if (!settings?.introVideoEnabled) {
        return false;
      }

      try {
        const todayStr = new Date().toLocaleDateString("sv-SE"); // 'YYYY-MM-DD' en hora local
        const lastSeen = localStorage.getItem("roraima_intro_last_viewed_date");
        if (lastSeen === todayStr) {
          return false; // Ya se vio hoy en este equipo
        }
      } catch {
        // En caso de que localStorage no esté disponible
      }

      return true;
    };

    // Selección de video según tamaño de pantalla (Desktop vs Móvil)
    const chooseVideo = () => {
      const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || /Mobi|Android|iPhone/i.test(navigator.userAgent));
      let chosen = "";

      if (isMobile && settings?.introVideoMobileUrl && settings.introVideoMobileUrl.trim() !== "") {
        chosen = settings.introVideoMobileUrl.trim();
      } else if (settings?.introVideoDesktopUrl && settings.introVideoDesktopUrl.trim() !== "") {
        chosen = settings.introVideoDesktopUrl.trim();
      } else {
        chosen = "/videos/presentacion.mp4";
      }

      return chosen;
    };

    const chosen = chooseVideo();
    setVideoSrc(chosen);

    if (checkShouldPlay() && chosen) {
      setIsVisible(true);
      setIsLoadingVideo(true);
      setProgress(0);
    }

    // Listener para permitir al Super Admin probar el video desde el Panel Admin
    const handleAdminPreview = (e: Event) => {
      const customEvent = e as CustomEvent<{ targetUrl?: string }>;
      const overrideUrl = customEvent.detail?.targetUrl;
      setVideoSrc(overrideUrl || chooseVideo());
      setIsPreview(true);
      setIsVisible(true);
      setIsLoadingVideo(true);
      setProgress(0);
    };

    window.addEventListener("roraima-play-intro", handleAdminPreview);
    return () => {
      window.removeEventListener("roraima-play-intro", handleAdminPreview);
    };
  }, [settings]);

  // Manejar cierre y registrar fecha en localStorage
  const handleDismiss = () => {
    try {
      if (!isPreview) {
        const todayStr = new Date().toLocaleDateString("sv-SE");
        localStorage.setItem("roraima_intro_last_viewed_date", todayStr);
      }
    } catch {
      // Ignorar errores de storage
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsVisible(false);
    setIsPreview(false);
  };

  // Cierre con la tecla Escape
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isVisible, isPreview]);

  // Manejo de eventos del elemento <video>
  const handleCanPlay = () => {
    setIsLoadingVideo(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // En algunos navegadores el autoplay con sonido se bloquea, pero iniciamos en mute para garantizarlo
      });
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.duration) {
      const current = videoRef.current.currentTime;
      const duration = videoRef.current.duration;
      setProgress((current / duration) * 100);
    }
  };

  const handleVideoEnded = () => {
    handleDismiss();
  };

  const toggleSound = () => {
    if (videoRef.current) {
      const nextMute = !isMuted;
      videoRef.current.muted = nextMute;
      setIsMuted(nextMute);
    }
  };

  if (!isVisible || !videoSrc) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="roraima-intro-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.01 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="fixed inset-0 z-[99999] bg-[#020508] text-white flex flex-col items-center justify-center overflow-hidden select-none"
      >
        {/* Glow de fondo ambiental esmeralda */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-600/10 rounded-full blur-[160px] pointer-events-none" />
        </div>

        {/* =========================================================================
            FASE 1: PRELOADER CON ÍCONO DE RORAIMA MIENTRAS CARGA EL VIDEO
            ========================================================================= */}
        <AnimatePresence>
          {isLoadingVideo && (
            <motion.div
              key="roraima-loader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-[#020508]/95 backdrop-blur-2xl"
            >
              {/* Emblema con anillos orbitales y pulso de luz */}
              <div className="relative flex items-center justify-center w-36 h-36 mb-8">
                {/* Anillo de pulso resplandeciente */}
                <motion.div
                  animate={{
                    scale: [1, 1.25, 1],
                    opacity: [0.35, 0.7, 0.35],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
                />

                {/* Anillo orbital rotatorio */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 border-r-emerald-500/40"
                />

                {/* Segundo anillo orbital inverso */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{
                    duration: 4.5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-2 rounded-full border border-dashed border-emerald-400/30"
                />

                {/* Logo / Emblema central de Roraima */}
                <motion.div
                  animate={{
                    scale: [0.97, 1.03, 0.97],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="relative z-10 w-24 h-24 rounded-3xl bg-zinc-950/80 p-3 shadow-2xl border border-emerald-500/30 flex items-center justify-center backdrop-blur-md"
                >
                  <Image
                    src="/emblem.webp"
                    alt="Roraima Exchange"
                    width={80}
                    height={80}
                    priority
                    className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                  />
                </motion.div>
              </div>

              {/* Título y estado de carga */}
              <div className="text-center space-y-2 max-w-sm">
                <span className="inline-block text-[11px] font-black uppercase tracking-[0.3em] text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  Roraima Exchange
                </span>
                <h3 className="text-lg sm:text-xl font-extrabold text-zinc-100 tracking-tight">
                  Preparando experiencia interactiva
                </h3>
                <p className="text-xs text-zinc-400 font-medium">
                  Cargando video de presentación en alta definición...
                </p>
              </div>

              {/* Indicador de progreso / animación de puntos */}
              <div className="flex items-center gap-1.5 mt-6">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [0.8, 1.4, 0.8],
                      opacity: [0.3, 1, 0.3],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut",
                    }}
                    className="w-2 h-2 rounded-full bg-emerald-400"
                  />
                ))}
              </div>

              {/* Botón de saltar temprano en conexiones lentas */}
              <button
                type="button"
                onClick={handleDismiss}
                className="mt-8 text-xs font-semibold text-zinc-400 hover:text-white px-4 py-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 transition-all flex items-center gap-1.5"
              >
                <span>Entrar a la web directamente</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* =========================================================================
            FASE 2: REPRODUCTOR DE VIDEO A PANTALLA COMPLETA
            ========================================================================= */}
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={videoRef}
            src={videoSrc}
            preload="auto"
            playsInline
            muted={isMuted}
            onCanPlay={handleCanPlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
            onError={() => {
              setHasError(true);
              setIsLoadingVideo(false);
            }}
            className={`w-full h-full max-w-full max-h-full object-contain transition-opacity duration-700 ${
              isLoadingVideo ? "opacity-0" : "opacity-100"
            }`}
          />

          {/* Manejo de error de carga de video */}
          {hasError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-zinc-950/90 text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-rose-500" />
              <p className="text-sm font-semibold text-zinc-300">
                No se pudo reproducir el video de presentación.
              </p>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs uppercase tracking-wider text-white shadow-lg"
              >
                Continuar a Roraima
              </button>
            </div>
          )}

          {/* =========================================================================
              CONTROLES Y SUPERPOSICIONES FLOTANTES (ESTILO PREMIUM DARK GLASS)
              ========================================================================= */}
          {!isLoadingVideo && !hasError && (
            <>
              {/* Barra Superior con botón Saltar Intro */}
              <div className="absolute top-0 inset-x-0 p-4 sm:p-6 flex items-center justify-between z-30 pointer-events-none bg-gradient-to-b from-black/80 via-black/30 to-transparent">
                {/* Branding sutil */}
                <div className="flex items-center gap-2.5 pointer-events-auto">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900/80 border border-emerald-500/30 p-1 backdrop-blur-md flex items-center justify-center">
                    <Image
                      src="/emblem.webp"
                      alt="Roraima"
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  </div>
                  <span className="text-xs font-black tracking-wider uppercase text-zinc-200 hidden sm:inline-block drop-shadow">
                    Roraima Exchange
                  </span>
                </div>

                {/* Botón Saltar Intro */}
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="pointer-events-auto group px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-black/60 hover:bg-emerald-600 text-zinc-200 hover:text-white backdrop-blur-xl border border-white/10 hover:border-emerald-400 text-xs sm:text-sm font-extrabold shadow-2xl transition-all duration-300 flex items-center gap-2 hover:scale-105 active:scale-95"
                >
                  <span>Saltar intro</span>
                  <SkipForward className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* Botón Inferior de Sonido / Audio */}
              <div className="absolute bottom-5 left-5 sm:bottom-8 sm:left-8 z-30 flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSound}
                  className="group px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full bg-black/70 hover:bg-zinc-900/90 text-zinc-200 hover:text-white backdrop-blur-xl border border-white/15 hover:border-emerald-500/50 text-xs font-bold shadow-2xl transition-all flex items-center gap-2"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      <span>Activar sonido</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span>Silenciar</span>
                    </>
                  )}
                </button>

                {/* Botón Reanudar si se pausó */}
                {videoRef.current?.paused && (
                  <button
                    type="button"
                    onClick={() => videoRef.current?.play()}
                    className="p-2 sm:p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-transform hover:scale-110"
                    title="Reproducir"
                  >
                    <Play className="w-4 h-4 fill-white" />
                  </button>
                )}
              </div>

              {/* Barra de Progreso Discreta en el Borde Inferior */}
              <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-30">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-200 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
