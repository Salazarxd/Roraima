"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowUpDown, Calculator, Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import { hapticTap } from "@/lib/haptics";

type RatesData = {
  binance: number | null;
  bcv: number | null;
  parallel: number | null;
  roraima: number | null;
};

interface CryptoCalculatorProps {
  initialRates?: RatesData | null;
  className?: string;
  showLinkToP2P?: boolean;
}

export function CryptoCalculatorWidget({
  initialRates,
  className = "",
  showLinkToP2P = true,
}: CryptoCalculatorProps) {
  const [rates, setRates] = useState<RatesData | null>(initialRates || null);
  const [rateSource, setRateSource] = useState<"roraima" | "bcv">("roraima");
  const [usdtAmount, setUsdtAmount] = useState<string>("25");
  const [vesAmount, setVesAmount] = useState<string>("");
  const [activeInput, setActiveInput] = useState<"USDT" | "VES">("USDT");

  // Si no llegaron tasas por props, cargarlas en cliente
  useEffect(() => {
    if (!rates) {
      import("@/app/actions/exchange-rate")
        .then((mod) => mod.getReferenceRates())
        .then((res) => {
          if (res) setRates(res);
        })
        .catch(() => {});
    }
  }, [rates]);

  // Obtener la tasa activa según la selección
  const activeRate = useMemo(() => {
    if (!rates) return 0;
    if (rateSource === "roraima") {
      return rates.roraima || rates.binance || rates.bcv || 0;
    }
    return rates.bcv || rates.roraima || 0;
  }, [rates, rateSource]);

  // Recalcular montos bidireccionalmente
  useEffect(() => {
    if (!activeRate || activeRate <= 0) return;
    if (activeInput === "USDT") {
      const num = parseFloat(usdtAmount.replace(/,/g, ""));
      if (!isNaN(num) && num > 0) {
        setVesAmount((num * activeRate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else {
        setVesAmount("");
      }
    } else {
      const num = parseFloat(vesAmount.replace(/\./g, "").replace(",", "."));
      if (!isNaN(num) && num > 0) {
        setUsdtAmount((num / activeRate).toFixed(2));
      } else {
        setUsdtAmount("");
      }
    }
  }, [activeRate, usdtAmount, vesAmount, activeInput]);

  const handleUsdtChange = (val: string) => {
    setActiveInput("USDT");
    setUsdtAmount(val);
  };

  const handleVesChange = (val: string) => {
    setActiveInput("VES");
    setVesAmount(val);
  };

  const applyPresetUsdt = (amt: number) => {
    hapticTap();
    setActiveInput("USDT");
    setUsdtAmount(amt.toString());
  };

  const applyPresetVes = (amt: number) => {
    hapticTap();
    setActiveInput("VES");
    setVesAmount(amt.toLocaleString("es-VE"));
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-zinc-200/80 dark:border-emerald-500/20 shadow-xl shadow-emerald-950/5 p-5 sm:p-6 space-y-4 ${className}`}
    >
      {/* Header del Widget */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight">
              Calculadora Rápida
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Conversor en tiempo real Cripto ⇄ Bolívares
            </p>
          </div>
        </div>

        {activeRate > 0 && (
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
              Tasa activa
            </span>
            <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
              1 USDT = {activeRate.toFixed(2)} Bs
            </span>
          </div>
        )}
      </div>

      {/* Selector de Tasas (P2P Roraima / Dólar BCV) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setRateSource("roraima");
          }}
          className={`py-2 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
            rateSource === "roraima"
              ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-extrabold"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>P2P Roraima</span>
          <span className="font-mono text-[10px] opacity-80">
            {rates?.roraima?.toFixed(2) ?? rates?.binance?.toFixed(2) ?? "—"} Bs
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticTap();
            setRateSource("bcv");
          }}
          className={`py-2 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
            rateSource === "bcv"
              ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm font-extrabold"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>Dólar BCV</span>
          <span className="font-mono text-[10px] opacity-80">
            {rates?.bcv?.toFixed(2) ?? "—"} Bs
          </span>
        </button>
      </div>


      {/* Inputs de Conversión */}
      <div className="space-y-3">
        {/* Entrada USDT */}
        <div className="relative rounded-2xl bg-zinc-50 dark:bg-zinc-950 p-3.5 border border-zinc-200/80 dark:border-zinc-800 focus-within:border-emerald-500 transition-colors">
          <label className="text-[11px] font-bold text-zinc-500 block mb-1">
            Monto en Dólares Cripto
          </label>
          <div className="flex items-center justify-between gap-3">
            <input
              type="number"
              step="any"
              value={usdtAmount}
              onChange={(e) => handleUsdtChange(e.target.value)}
              placeholder="0.00"
              className="bg-transparent font-mono text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 outline-none w-full"
            />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs shrink-0 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              USDT
            </div>
          </div>
        </div>

        {/* Botón visual de intercambio */}
        <div className="flex justify-center -my-1 relative z-10">
          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-zinc-500 shadow-sm">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Entrada VES (Bolívares) */}
        <div className="relative rounded-2xl bg-zinc-50 dark:bg-zinc-950 p-3.5 border border-zinc-200/80 dark:border-zinc-800 focus-within:border-emerald-500 transition-colors">
          <label className="text-[11px] font-bold text-zinc-500 block mb-1">
            Equivalente en Bolívares
          </label>
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={vesAmount}
              onChange={(e) => handleVesChange(e.target.value)}
              placeholder="0,00"
              className="bg-transparent font-mono text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 outline-none w-full"
            />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-xs shrink-0 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              VES (Bs)
            </div>
          </div>
        </div>
      </div>

      {/* Botones de Montos Rápidos (Chips) */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block pl-1">
          Montos frecuentes:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[10, 25, 50, 100].map((amt) => (
            <button
              key={`usdt-${amt}`}
              type="button"
              onClick={() => applyPresetUsdt(amt)}
              className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 text-zinc-600 dark:text-zinc-300 text-xs font-bold transition-all active:scale-95"
            >
              ${amt}
            </button>
          ))}
          {[500, 1000, 2500].map((amt) => (
            <button
              key={`ves-${amt}`}
              type="button"
              onClick={() => applyPresetVes(amt)}
              className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 text-zinc-600 dark:text-zinc-300 text-xs font-bold transition-all active:scale-95"
            >
              {amt >= 1000 ? `${amt / 1000}k` : amt} Bs
            </button>
          ))}
        </div>
      </div>

      {/* CTA Directo a Mercado P2P */}
      {showLinkToP2P && (
        <Link
          href={`/dashboard/p2p?type=BUY&fiat=VES`}
          onClick={() => hapticTap()}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] mt-2 group"
        >
          <Sparkles className="w-4 h-4 text-emerald-200 group-hover:rotate-12 transition-transform" />
          <span>Comprar USDT en P2P a esta tasa</span>
          <ChevronRight className="w-4 h-4 text-emerald-200 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}
