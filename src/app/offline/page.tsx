"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-zinc-200 dark:bg-zinc-800 rounded-[2rem] flex items-center justify-center mb-6">
        <WifiOff className="w-10 h-10 text-zinc-500" />
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Sin Conexión</h1>
      <p className="text-zinc-500 max-w-sm mb-8">
        Parece que has perdido la conexión a internet. Revisa tu red para seguir usando Salazar P2P.
      </p>
      <button 
        className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
        onClick={() => typeof window !== 'undefined' && window.location.reload()}
      >
        Reintentar
      </button>
    </div>
  );
}
