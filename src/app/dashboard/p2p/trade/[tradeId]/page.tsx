import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import TradeRoom from "./trade-room";

export const metadata: Metadata = {
  title: "Sala de Orden P2P | Roraima Exchange",
  description: "Sala segura de intercambio P2P con Escrow, chat y mediación.",
};

// Cache Components: `useParams()` en el cliente depende del parámetro dinámico,
// así que debe ir dentro de <Suspense> para no bloquear el prerender del shell.
export default function TradeRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          Cargando Sala de Orden...
        </div>
      }
    >
      <TradeRoom />
    </Suspense>
  );
}
