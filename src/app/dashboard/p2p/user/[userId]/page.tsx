import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import ProfileView from "./profile-view";

export const metadata: Metadata = {
  title: "Perfil del Comerciante P2P | Roraima Exchange",
  description: "Perfil público del comerciante P2P con estadísticas, rango y anuncios activos.",
};

// `useParams()` en el cliente depende del parámetro dinámico,
// así que debe ir dentro de <Suspense> para no bloquear el prerender del shell.
export default function PublicProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          Cargando perfil del comerciante...
        </div>
      }
    >
      <ProfileView />
    </Suspense>
  );
}
