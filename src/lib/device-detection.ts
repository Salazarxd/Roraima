/**
 * Detección ligera del cliente para reconocimiento de dispositivos de confianza
 */

export function detectClientDevice() {
  if (typeof window === "undefined" || !navigator) {
    return {
      browser: "Navegador Web",
      os: "Desconocido",
      deviceName: "Dispositivo Web",
    };
  }

  const ua = navigator.userAgent;

  // 1. Detectar Sistema Operativo
  let os = "Otro";
  if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone/i.test(ua)) os = "iPhone (iOS)";
  else if (/iPad/i.test(ua)) os = "iPad (iPadOS)";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  // 2. Detectar Navegador
  let browser = "Navegador";
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium|Edg|OPR/i.test(ua)) browser = "Google Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome|Chromium/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const deviceName = `${browser} en ${os}${isMobile ? " (Móvil)" : ""}`;

  return { browser, os, deviceName };
}
