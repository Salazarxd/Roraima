"use client";

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2,
  Download,
  Copy,
  Check,
  X,
  ShieldCheck,
  ExternalLink,
  MessageCircle,
  FileText,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { playCopySound, playSuccessSound } from "@/lib/audio-alerts";

export type ReceiptData = {
  folio: string;
  type: "P2P_BUY" | "P2P_SELL" | "INTERNAL_TRANSFER" | "DEPOSIT" | "WITHDRAWAL";
  title?: string;
  cryptoAmount: number;
  cryptoCurrency?: string;
  fiatAmount?: number | null;
  fiatCurrency?: string;
  exchangeRate?: number | null;
  paymentMethod?: string | null;
  counterpartyName?: string | null;
  counterpartyDetail?: string | null; // Cédula, email o wallet
  date?: string | Date;
  txHash?: string | null;
};

interface DigitalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReceiptData | null;
}

const TYPE_CONFIG = {
  P2P_BUY: { label: "Compra P2P", badge: "Compra Completada", tone: "emerald" },
  P2P_SELL: { label: "Venta P2P", badge: "Venta Completada", tone: "blue" },
  INTERNAL_TRANSFER: { label: "Transferencia Interna", badge: "Envío Inmediato", tone: "indigo" },
  DEPOSIT: { label: "Depósito Cripto", badge: "Acreditado", tone: "emerald" },
  WITHDRAWAL: { label: "Retiro Cripto", badge: "Retiro Despachado", tone: "amber" },
};

export function DigitalReceiptModal({ isOpen, onClose, data }: DigitalReceiptModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const receiptCardRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !data) return null;

  const cfg = TYPE_CONFIG[data.type] ?? {
    label: "Operación Digital",
    badge: "Exitosa",
    tone: "emerald",
  };
  const cryptoSymbol = data.cryptoCurrency || "USDT";
  const fiatSymbol = data.fiatCurrency || "VES";
  const opDate = data.date ? new Date(data.date) : new Date();
  const dateFormatted = opDate.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Generar texto para compartir por WhatsApp
  const generateShareText = () => {
    let text = `🧾 *COMPROBANTE DE OPERACIÓN - RORAIMA EXCHANGE*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📌 *Estado:* Operación Exitosa ✅\n`;
    text += `🔖 *Folio:* ${data.folio}\n`;
    text += `📅 *Fecha:* ${dateFormatted}\n`;
    text += `⚡ *Tipo:* ${cfg.label}\n`;
    text += `💰 *Monto:* ${data.cryptoAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cryptoSymbol}\n`;

    if (data.fiatAmount) {
      text += `🇻🇪 *Total Bs:* ${data.fiatAmount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatSymbol}\n`;
    }
    if (data.exchangeRate) {
      text += `📊 *Tasa:* 1 ${cryptoSymbol} = ${data.exchangeRate.toFixed(2)} Bs\n`;
    }
    if (data.paymentMethod) {
      text += `🏦 *Método:* ${data.paymentMethod}\n`;
    }
    if (data.counterpartyName) {
      text += `👤 *Contraparte:* ${data.counterpartyName}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🔒 *Validado electrónicamente por Roraima Exchange*\n`;
    text += `🌐 roraima.exchange`;
    return text;
  };

  const handleShare = async () => {
    hapticTap();
    const shareText = generateShareText();

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Comprobante Roraima - ${data.folio}`,
          text: shareText,
        });
        playSuccessSound();
        return;
      } catch {
        // Fallback a WhatsApp
      }
    }

    // Fallback: Abrir WhatsApp Web / App
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, "_blank");
    playSuccessSound();
  };

  const handleCopyText = () => {
    hapticTap();
    playCopySound();
    navigator.clipboard?.writeText(generateShareText());
    setCopied(true);
    toast.success("Comprobante copiado al portapapeles");
    setTimeout(() => setCopied(false), 2500);
  };

  // Descarga del comprobante mediante HTML5 Canvas en alta resolución
  const handleDownloadImage = async () => {
    hapticTap();
    setDownloading(true);
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      // Dimensiones de alta resolución (tipo tarjeta bancaria 1200x1600 para pantalla retina)
      canvas.width = 800;
      canvas.height = 1100;

      // Fondo Gradiente Neobank Premium
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, "#09090b");
      bgGrad.addColorStop(0.5, "#0f172a");
      bgGrad.addColorStop(1, "#042f2e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Marco con borde dorado/esmeralda
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

      // Encabezado Roraima
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RORAIMA EXCHANGE", canvas.width / 2, 95);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px sans-serif";
      ctx.fillText("COMPROBANTE ELECTRÓNICO OFICIAL", canvas.width / 2, 125);

      // Línea divisoria
      ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(70, 155);
      ctx.lineTo(canvas.width - 70, 155);
      ctx.stroke();

      // Badge Estado Exitoso
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 140, 180, 280, 42, [20]);
      ctx.fill();
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("✓  OPERACIÓN EXITOSA", canvas.width / 2, 207);

      // Monto Principal en USDT
      ctx.fillStyle = "#f8fafc";
      ctx.font = "900 64px sans-serif";
      const cryptoTxt = `${data.cryptoAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cryptoSymbol}`;
      ctx.fillText(cryptoTxt, canvas.width / 2, 310);

      if (data.fiatAmount) {
        ctx.fillStyle = "#34d399";
        ctx.font = "bold 26px sans-serif";
        ctx.fillText(
          `≈ ${data.fiatAmount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatSymbol}`,
          canvas.width / 2,
          355
        );
      }

      // Caja de Detalles
      const boxY = 410;
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.roundRect(70, boxY, canvas.width - 140, 470, [24]);
      ctx.fill();
      ctx.strokeStyle = "rgba(51, 65, 85, 0.7)";
      ctx.stroke();

      // Campos de la Operación
      const rows = [
        { label: "Folio de Transacción", val: data.folio },
        { label: "Fecha y Hora", val: dateFormatted },
        { label: "Tipo de Operación", val: cfg.label },
        ...(data.exchangeRate ? [{ label: "Tasa de Cambio", val: `1 ${cryptoSymbol} = ${data.exchangeRate.toFixed(2)} Bs` }] : []),
        ...(data.paymentMethod ? [{ label: "Método de Pago", val: data.paymentMethod }] : []),
        ...(data.counterpartyName ? [{ label: "Contraparte", val: data.counterpartyName }] : []),
        ...(data.counterpartyDetail ? [{ label: "Destino / Ref.", val: data.counterpartyDetail }] : []),
      ];

      let rowY = boxY + 45;
      rows.forEach((r) => {
        ctx.textAlign = "left";
        ctx.fillStyle = "#94a3b8";
        ctx.font = "17px sans-serif";
        ctx.fillText(r.label, 105, rowY);

        ctx.textAlign = "right";
        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 17px monospace";
        ctx.fillText(r.val, canvas.width - 105, rowY);

        rowY += 48;
      });

      // Pie de Página
      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.fillText("Validado por el Libro Mayor Inmutable de Roraima Exchange", canvas.width / 2, 950);
      ctx.fillText("Comprobante con validez comercial en red P2P · roraima.exchange", canvas.width / 2, 980);

      // Descargar enlace
      const link = document.createElement("a");
      link.download = `Comprobante-Roraima-${data.folio}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      hapticSuccess();
      playSuccessSound();
      toast.success("¡Comprobante descargado en alta calidad!");
    } catch {
      toast.error("No se pudo generar la imagen del comprobante");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 25, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-zinc-950 text-white rounded-[2.5rem] border border-emerald-500/30 shadow-2xl overflow-hidden my-auto relative"
        >
          {/* Botón Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors z-20"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Tarjeta del Recibo */}
          <div ref={receiptCardRef} className="p-6 sm:p-8 space-y-6 text-center relative">
            {/* Cabecera de Marca */}
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-1 border border-emerald-400/40">
                <span className="text-white font-black text-xl tracking-tighter">R</span>
              </div>
              <h2 className="text-lg font-black tracking-wider text-emerald-400 uppercase">
                Roraima Exchange
              </h2>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                Comprobante Digital Oficial
              </span>
            </div>

            {/* Sello de Éxito */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold shadow-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>Operación Exitosa</span>
            </div>

            {/* Monto Principal */}
            <div className="space-y-1">
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {data.cryptoAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                <span className="text-emerald-400 text-2xl">{cryptoSymbol}</span>
              </div>
              {data.fiatAmount && (
                <div className="text-sm sm:text-base font-bold text-zinc-400">
                  ≈ {data.fiatAmount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {fiatSymbol}
                </div>
              )}
            </div>

            {/* Desglose de Operación */}
            <div className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800/80 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Folio:</span>
                <span className="font-mono font-bold text-zinc-200 select-all">{data.folio}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Fecha:</span>
                <span className="text-zinc-300 font-medium">{dateFormatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Tipo:</span>
                <span className="font-bold text-emerald-400">{cfg.label}</span>
              </div>

              {data.exchangeRate && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Tasa aplicada:</span>
                  <span className="font-mono font-bold text-zinc-300">
                    1 {cryptoSymbol} = {data.exchangeRate.toFixed(2)} Bs
                  </span>
                </div>
              )}

              {data.paymentMethod && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Método de pago:</span>
                  <span className="text-zinc-300 font-medium">{data.paymentMethod}</span>
                </div>
              )}

              {data.counterpartyName && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Contraparte:</span>
                  <span className="text-zinc-200 font-bold">{data.counterpartyName}</span>
                </div>
              )}

              {data.counterpartyDetail && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Destino / Ref:</span>
                  <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[180px]">
                    {data.counterpartyDetail}
                  </span>
                </div>
              )}
            </div>

            {/* QR Mini y Sello Holográfico */}
            <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-2xl border border-zinc-800/60">
              <div className="flex items-center gap-3 text-left">
                <div className="p-1.5 bg-white rounded-xl shrink-0">
                  <QRCodeSVG value={`https://roraima.exchange/verify?folio=${data.folio}`} size={46} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">
                    Sello de Integridad
                  </span>
                  <span className="text-[11px] text-zinc-400 block">
                    Escanea para verificar autenticidad en el libro mayor
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción (Compartir por WhatsApp, Descargar Imagen, Copiar) */}
          <div className="p-4 sm:p-6 bg-zinc-900/90 border-t border-zinc-800/80 space-y-2.5">
            <button
              type="button"
              onClick={handleShare}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-950/40 flex items-center justify-center gap-2.5 transition-all"
            >
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>Compartir Comprobante por WhatsApp</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={downloading}
                className="py-3 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-zinc-700/60"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloading ? "Generando..." : "Guardar Imagen"}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                className="py-3 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-zinc-700/60"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "¡Copiado!" : "Copiar Texto"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
