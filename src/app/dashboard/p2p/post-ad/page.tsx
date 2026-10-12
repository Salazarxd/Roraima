"use client";

import * as React from "react";
import { ArrowLeft, ShieldAlert, CheckCircle2, Lock, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

const BANK_OPTIONS = [
  "Pago Movil", "Banesco", "Banco de Venezuela", "Mercantil", "Transferencia Bancaria", "Provincial",
  "Bancamiga", "BNC Banco Nacional de Crédito", "Bancaribe", "Banco del Tesoro", "Banco Venezolano de Crédito",
  "Banplus", "Banco Plaza", "BFC Banco Fondo Común", "Banco Activo", "R4 Banco Microfinanciero",
];

type SavedMethod = { id: string; type: string; details: string };

const parseDetails = (raw: string): Record<string, string> => {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export default function PostAdPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState({
    type: "SELL",
    asset: "USDT",
    fiat: "VES",
    price: "",
    totalAmount: "",
    minLimit: "",
    maxLimit: "",
    adCategory: "REGULAR",
    requiresVerification: false,
    autoReply: ""
  });

  const [savedMethods, setSavedMethods] = React.useState<SavedMethod[]>([]);
  const [selectedSaved, setSelectedSaved] = React.useState<string[]>([]);
  const [selectedBanks, setSelectedBanks] = React.useState<string[]>([]);
  const [available, setAvailable] = React.useState<number | null>(null);
  const [kycStatus, setKycStatus] = React.useState<string | null>(null);
  const [ref, setRef] = React.useState<{ binance: number | null; bcv: number | null; roraima: number | null } | null>(null);

  React.useEffect(() => {
    const loadData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();
      const [{ getPaymentMethods }, { getWalletOverview }, { getKycStatus }] = await Promise.all([
        import("@/app/actions/p2p"),
        import("@/app/actions/funds"),
        import("@/app/actions/kyc"),
      ]);
      const [methods, overview, kyc] = await Promise.all([getPaymentMethods(token), getWalletOverview(token), getKycStatus(token)]);
      setSavedMethods(methods);
      if (methods.length > 0) setSelectedSaved([methods[0].id]);
      if (overview.success) setAvailable(overview.available);
      if (kyc.success) setKycStatus(kyc.status);
    };
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) loadData();
    });
    import("@/app/actions/exchange-rate").then(({ getReferenceRates }) => getReferenceRates().then(setRef));
    return () => unsubscribe();
  }, []);

  const isSell = formData.type === "SELL";
  const total = parseFloat(formData.totalAmount);
  const price = parseFloat(formData.price);
  const totalVes = !isNaN(total) && !isNaN(price) ? total * price : null;

  const methodLabels = isSell
    ? savedMethods
        .filter((m) => selectedSaved.includes(m.id))
        .map((m) => {
          const d = parseDetails(m.details);
          return m.type === "Pago Movil" || m.type === "Pago Móvil" ? "Pago Movil" : d.bank || m.type;
        })
    : selectedBanks;

  const toggle = (list: string[], value: string, max = 5) =>
    list.includes(value) ? list.filter((v) => v !== value) : list.length >= max ? list : [...list, value];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Debes iniciar sesión");

      if (!formData.price || !formData.totalAmount || !formData.minLimit || !formData.maxLimit) {
        throw new Error("Completa todos los campos obligatorios");
      }
      const uniqueMethods = [...new Set(methodLabels)];
      if (uniqueMethods.length === 0) throw new Error("Selecciona al menos un método de pago");
      if (isSell && available != null && total > available) throw new Error(`Saldo insuficiente. Disponible: ${available.toFixed(2)} USDT`);

      const { createP2POrder } = await import("@/app/actions/p2p");
      const result = await createP2POrder(await currentUser.getIdToken(), {
        type: `${formData.type}_${formData.adCategory}`, // Ex: "SELL_REGULAR" or "BUY_PREMIUM"
        amount: total,
        price,
        minAmount: parseFloat(formData.minLimit),
        maxAmount: parseFloat(formData.maxLimit),
        methods: uniqueMethods.join(","),
        requiresVerification: formData.requiresVerification,
        autoReply: formData.autoReply.trim() || undefined
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push('/dashboard/p2p/my-ads'), 2000);
      } else {
        setError(result.error || "Error al crear el anuncio");
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error al crear el anuncio");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">¡Anuncio Publicado!</h1>
        <p className="text-zinc-500 mb-8">Tu anuncio P2P ya está visible en el mercado.</p>
        <button onClick={() => router.push('/dashboard/p2p/my-ads')} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors">
          Ir a Mis Anuncios
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Publicar Anuncio P2P</h1>
          <p className="text-zinc-500 text-sm mt-1">Configura las condiciones de tu oferta</p>
        </div>
      </div>

      {kycStatus && kycStatus !== "VERIFIED" && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 text-amber-800 dark:text-amber-200 text-sm flex gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <div>
            Para publicar anuncios necesitas tener tu verificación de identidad aprobada (estado actual: <b>{kycStatus === "PENDING" ? "en revisión" : kycStatus === "REJECTED" ? "rechazada" : "sin verificar"}</b>).
            {kycStatus !== "PENDING" && <button type="button" onClick={() => router.push('/kyc')} className="block mt-2 font-bold underline">Verificar mi identidad</button>}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800">
        
        {/* Tipo y Activo */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">1. Tipo y Criptomoneda</h2>
          <div className="flex gap-4 mb-4">
            <button 
              type="button"
              onClick={() => setFormData({...formData, type: "BUY"})}
              className={`flex-1 py-3 rounded-xl font-bold transition-colors ${formData.type === "BUY" ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"}`}
            >
              Quiero Comprar USDT
            </button>
            <button 
              type="button"
              onClick={() => setFormData({...formData, type: "SELL"})}
              className={`flex-1 py-3 rounded-xl font-bold transition-colors ${formData.type === "SELL" ? "bg-rose-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"}`}
            >
              Quiero Vender USDT
            </button>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setFormData({...formData, adCategory: "REGULAR"})}
              className={`flex-1 py-2 text-sm rounded-lg font-semibold transition-all ${
                formData.adCategory === "REGULAR"
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-500"
                : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Anuncio Regular
            </button>
            <button
              type="button"
              onClick={() => setFormData({...formData, adCategory: "PREMIUM"})}
              className={`flex-1 py-2 text-sm rounded-lg font-semibold transition-all flex items-center justify-center gap-1 ${
                formData.adCategory === "PREMIUM"
                ? "bg-amber-400 text-amber-950 border border-amber-500 shadow-md"
                : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              ⭐ Anuncio Prémium (destacado)
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-3 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Comisión del anunciante: 0.1% del monto de cada orden completada. El tomador no paga comisión.</p>
        </div>

        {/* Precio */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">2. Configuración de Precio</h2>
          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Precio Fijo (VES por USDT)</label>
            <div className="relative">
              <input 
                id="post-ad-price"
                type="number" 
                step="0.001"
                required
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-amber-500 text-lg font-medium"
                placeholder={ref?.binance ? `Ej. ${ref.binance.toFixed(2)}` : "Precio en VES"}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">VES</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-zinc-500">
              <span>Binance P2P: <b className="text-zinc-700 dark:text-zinc-300">{ref?.binance ? ref.binance.toFixed(2) : "—"}</b></span>
              <span>Mejor precio Roraima: <b className="text-zinc-700 dark:text-zinc-300">{ref?.roraima ? ref.roraima.toFixed(2) : "—"}</b></span>
              <span>BCV: <b className="text-zinc-700 dark:text-zinc-300">{ref?.bcv ? ref.bcv.toFixed(2) : "—"}</b></span>
            </div>
          </div>
        </div>

        {/* Límites */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">3. Monto y Límites de Orden</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="flex justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                <span>Monto Total a Negociar</span>
                {isSell && available != null && (
                  <button type="button" onClick={() => setFormData({ ...formData, totalAmount: String(Math.floor(available * 100) / 100) })} className="text-amber-500 text-xs font-bold">
                    Disp.: {available.toFixed(2)} · Máx.
                  </button>
                )}
              </label>
              <div className="relative">
                <input 
                  id="post-ad-amount"
                  type="number" 
                  required
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({...formData, totalAmount: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-amber-500"
                  placeholder="Ej. 100"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">USDT</span>
              </div>
              {totalVes != null && <p className="text-xs text-zinc-500 mt-1">≈ {totalVes.toLocaleString("es-VE", { maximumFractionDigits: 2 })} VES en total</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Límite Mín.</label>
                <input 
                  id="post-ad-min"
                  type="number" 
                  required
                  value={formData.minLimit}
                  onChange={(e) => setFormData({...formData, minLimit: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-amber-500"
                  placeholder="VES"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Límite Máx.</label>
                <input 
                  id="post-ad-max"
                  type="number" 
                  required
                  value={formData.maxLimit}
                  onChange={(e) => setFormData({...formData, maxLimit: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-amber-500"
                  placeholder="VES"
                />
              </div>
            </div>
          </div>
          {isSell && (
            <div className="mt-4 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300 flex gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Al publicar, {!isNaN(total) && total > 0 ? <b>{total.toFixed(2)} USDT</b> : "el monto total"} se congelarán de tu billetera para garantizar las órdenes. Puedes cerrar el anuncio en cualquier momento y recuperar lo no vendido.</span>
            </div>
          )}
        </div>

        {/* Métodos de Pago */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1">4. Métodos de Pago Aceptados</h2>
          <p className="text-xs text-zinc-500 mb-4">{isSell ? "Elige las cuentas donde recibirás los bolívares (máx. 5)." : "Elige cómo pagarás al vendedor (máx. 5)."}</p>
          {isSell ? (
            savedMethods.length === 0 ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 text-amber-800 dark:text-amber-200 text-sm flex gap-3">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <div>
                  No tienes métodos de pago guardados. Debes guardar una cuenta bancaria antes de publicar un anuncio de venta.
                  <button type="button" onClick={() => router.push('/dashboard/p2p/payment-methods')} className="block mt-2 font-bold underline">Ir a guardar método de pago</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {savedMethods.map(method => {
                  const details = parseDetails(method.details);
                  return (
                    <label key={method.id} className={`flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 border rounded-xl cursor-pointer hover:border-amber-500 transition-colors ${selectedSaved.includes(method.id) ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}>
                      <input 
                        type="checkbox" 
                        checked={selectedSaved.includes(method.id)}
                        onChange={() => setSelectedSaved(toggle(selectedSaved, method.id))}
                        className="w-4 h-4 text-amber-500" 
                      />
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-50">{method.type} - {details.bank || "Otro"}</div>
                        <div className="text-xs text-zinc-500">{details.owner} • {details.account || details.phone}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              {BANK_OPTIONS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBanks(toggle(selectedBanks, b))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${selectedBanks.includes(b) ? "bg-amber-400 text-amber-950 border-amber-500" : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-amber-500"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Condiciones Adicionales */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">5. Condiciones Adicionales</h2>
          <label className="flex items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer hover:border-amber-500 transition-colors">
            <input 
              type="checkbox" 
              checked={formData.requiresVerification}
              onChange={(e) => setFormData({...formData, requiresVerification: e.target.checked})}
              className="mt-1 w-4 h-4 text-amber-500 rounded border-zinc-300 focus:ring-amber-500" 
            />
            <div>
              <div className="font-bold text-zinc-900 dark:text-zinc-50">Verificación requerida</div>
              <div className="text-sm text-zinc-500 mt-1">
                Los takers deberán proporcionar al maker los documentos adicionales de verificación después de crear las órdenes.
              </div>
            </div>
          </label>
        </div>

        {/* Mensaje de Auto-Respuesta / Bienvenida */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">6. Mensaje de Auto-Respuesta (Chat P2P)</h2>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Automatización</span>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Este mensaje se enviará automáticamente en la sala de chat en cuanto un usuario abra una orden contigo.
          </p>
          <textarea
            value={formData.autoReply}
            onChange={(e) => setFormData({ ...formData, autoReply: e.target.value })}
            placeholder="Ej: ¡Hola! Estoy activo. Transfiero de inmediato por Banesco o Pago Móvil. Solo cuentas a nombre del titular registrado en Roraima."
            rows={3}
            maxLength={1000}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 text-sm outline-none focus:border-amber-500 text-zinc-900 dark:text-zinc-50 resize-none"
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl text-sm border border-rose-200 dark:border-rose-900/50">
            {error}
          </div>
        )}

        <button 
          id="post-ad-submit"
          type="submit" 
          disabled={loading || (isSell && savedMethods.length === 0) || methodLabels.length === 0 || (kycStatus !== null && kycStatus !== "VERIFIED")}
          className="w-full py-4 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold rounded-2xl shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Publicando..." : isSell ? "Congelar fondos y publicar" : "Publicar Anuncio"}
        </button>
      </form>
    </div>
  );
}
