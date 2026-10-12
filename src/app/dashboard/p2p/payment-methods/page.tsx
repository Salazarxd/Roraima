"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, CreditCard, Landmark, Phone, Trash2, ArrowLeft, AlertCircle, CheckCircle2, X, ShieldCheck, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";

type Method = { id: string; type: string; details: string; kycMatch?: boolean };
type Identity = { verified: boolean; kycStatus: string; owner: string; cedula: string };

function parseDetails(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = React.useState<Method[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState<{ ok: boolean; msg: string } | null>(null);
  const [toDelete, setToDelete] = React.useState<Method | null>(null);
  const [busy, setBusy] = React.useState(false);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4500);
  };
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newMethodType, setNewMethodType] = React.useState("Pago Movil");
  const [newMethodDetails, setNewMethodDetails] = React.useState({
    owner: "",
    cedula: "",
    bank: "",
    account: "",
    phone: ""
  });
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  
  // Real Server Actions
  const loadMethods = async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    if (currentUser) {
      const { getPaymentMethods, getPaymentIdentity } = await import("@/app/actions/p2p");
      const token = await currentUser.getIdToken();
      const [data, id] = await Promise.all([getPaymentMethods(token), getPaymentIdentity(token)]);
      setMethods(data);
      if (id.success) setIdentity({ verified: id.verified, kycStatus: id.kycStatus, owner: id.owner, cedula: id.cedula });
    }
    setLoading(false);
  };

  React.useEffect(() => {
    // Escuchar el estado de autenticación para cargar al iniciar
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) loadMethods();
      else setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast(false, "Debes iniciar sesión.");
      return;
    }
    const isPM = newMethodType === "Pago Movil";
    if (!newMethodDetails.bank || (isPM ? !newMethodDetails.phone : !newMethodDetails.account)) {
      showToast(false, "Por favor completa los campos obligatorios.");
      return;
    }

    setBusy(true);
    const { addPaymentMethod } = await import("@/app/actions/p2p");
    const result = await addPaymentMethod(await currentUser.getIdToken(), {
      type: newMethodType,
      // Titular y cédula los asigna el servidor desde el KYC
      details: JSON.stringify({ bank: newMethodDetails.bank, ...(isPM ? { phone: newMethodDetails.phone } : { account: newMethodDetails.account }) })
    });
    setBusy(false);

    if (result.success) {
      setShowAddModal(false);
      setNewMethodDetails({ owner: "", cedula: "", bank: "", account: "", phone: "" });
      showToast(true, "Método de pago agregado.");
      loadMethods(); // Recargar la lista
    } else {
      showToast(false, result.error);
    }
  };

  const handleDelete = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !toDelete) return;
    setBusy(true);
    const { deletePaymentMethod } = await import("@/app/actions/p2p");
    const result = await deletePaymentMethod(await currentUser.getIdToken(), toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (result.success) {
      showToast(true, "Método de pago eliminado.");
      loadMethods();
    } else {
      showToast(false, result.error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Métodos de pago en P2P</h1>
          <p className="text-zinc-500 text-sm mt-1">Agrega o elimina métodos de pago para usar en el P2P</p>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 text-amber-800 dark:text-amber-200 text-sm">
        <strong>Importante:</strong> solo puedes registrar cuentas a tu nombre. El titular y la cédula se toman de tu verificación KYC
        {identity?.cedula ? <> (<b>{identity.owner}</b> · <b>{identity.cedula}</b>)</> : null}. Recibirás los pagos en estas cuentas; verifica siempre en tu banco que el dinero llegó antes de liberar.
      </div>

      {identity && !identity.verified && (
        <div className="rounded-2xl p-4 border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 shrink-0" />
            {identity.kycStatus === "PENDING" ? "Tu KYC está en revisión. Podrás agregar cuentas cuando sea aprobado." : "Necesitas verificar tu identidad (KYC) antes de agregar cuentas bancarias."}
          </span>
          {identity.kycStatus !== "PENDING" && (
            <Link href="/kyc" className="shrink-0 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-center transition-colors">Verificar ahora</Link>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Mis métodos guardados</h2>
        <button 
          id="pm-add-btn"
          onClick={() => setShowAddModal(true)}
          disabled={!identity?.verified}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar un método de pago
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Cargando métodos...</div>
      ) : methods.length === 0 ? (
        <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <CreditCard className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <p className="text-zinc-500 font-medium">No tienes métodos de pago guardados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {methods.map(method => {
            const details = parseDetails(method.details);
            return (
              <div key={method.id} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800 flex flex-col relative group">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                  <span className="font-bold text-zinc-900 dark:text-zinc-50">{method.type}</span>
                  {method.kycMatch ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> KYC</span>
                  ) : (
                    <span title="La cédula de esta cuenta no coincide con tu KYC. Elimínala y vuelve a registrarla." className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-md flex items-center gap-1"><AlertCircle className="w-3 h-3" /> No coincide con KYC</span>
                  )}
                  <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-md ml-auto">VES</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs">Banco</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{details.bank || "No especificado"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs">Nombre completo</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{details.owner}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs">Cédula de identidad</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{details.cedula}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-xs">Número de cuenta / Teléfono</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{details.account || details.phone}</span>
                  </div>
                </div>

                <button
                  id={`pm-delete-${method.id.slice(0, 8)}`}
                  onClick={() => setToDelete(method)}
                  aria-label="Eliminar método de pago"
                  className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-rose-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all bg-white dark:bg-zinc-900 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Method Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl z-50 border border-zinc-100 dark:border-zinc-800 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Agregar Método de Pago</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tipo de Método</label>
                  <select 
                    value={newMethodType}
                    onChange={(e) => setNewMethodType(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="Pago Movil">Pago Móvil</option>
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Banco</label>
                  <select 
                    value={newMethodDetails.bank}
                    onChange={(e) => setNewMethodDetails({...newMethodDetails, bank: e.target.value})}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">Seleccione un banco...</option>
                    {[
                      "0102 - Banco de Venezuela",
                      "0104 - Banco Venezolano de Crédito",
                      "0105 - Mercantil",
                      "0108 - Provincial",
                      "0114 - Bancaribe",
                      "0115 - Banco Exterior",
                      "0128 - Banco Caroní",
                      "0134 - Banesco",
                      "0137 - Banco Sofitasa",
                      "0138 - Banco Plaza",
                      "0151 - BFC Banco Fondo Común",
                      "0156 - 100% Banco",
                      "0157 - Banco del Sur",
                      "0163 - Banco del Tesoro",
                      "0168 - Bancrecer",
                      "0169 - Mi Banco",
                      "0171 - Banco Activo",
                      "0172 - Bancamiga",
                      "0174 - Banplus",
                      "0175 - Banco Digital de los Trabajadores",
                      "0191 - BNC Banco Nacional de Crédito",
                      "N58 Banco Digital",
                      "R4 Banco Microfinanciero"
                    ].map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">Titular <Lock className="w-3 h-3 text-zinc-400" /></label>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 truncate">{identity?.owner || "—"}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">Cédula <Lock className="w-3 h-3 text-zinc-400" /></label>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{identity?.cedula || "—"}</div>
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-zinc-500 -mt-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> Tomados de tu KYC. La cuenta debe estar registrada con esta cédula en tu banco.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {newMethodType === "Pago Movil" ? "Teléfono Afiliado" : "Número de Cuenta Bancaria"}
                  </label>
                  <input 
                    type="text" 
                    value={newMethodType === "Pago Movil" ? newMethodDetails.phone : newMethodDetails.account}
                    onChange={(e) => newMethodType === "Pago Movil" 
                      ? setNewMethodDetails({...newMethodDetails, phone: e.target.value})
                      : setNewMethodDetails({...newMethodDetails, account: e.target.value})}
                    placeholder={newMethodType === "Pago Movil" ? "0414-0000000" : "0102 0000 0000 0000 0000"}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  id="pm-save"
                  onClick={handleAdd}
                  disabled={busy}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-lg transition-transform hover:scale-[1.02]"
                >
                  {busy ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {toDelete && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => !busy && setToDelete(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-sm bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl z-50 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4"><Trash2 className="w-6 h-6" /></div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1">¿Eliminar este método?</h3>
              <p className="text-sm text-zinc-500 mb-6">
                {toDelete.type} · {parseDetails(toDelete.details).bank || "—"}. Los anuncios que lo usan dejarán de mostrarlo.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setToDelete(null)} disabled={busy} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl transition-colors">Cancelar</button>
                <button id="pm-delete-confirm" onClick={handleDelete} disabled={busy} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors">{busy ? "Eliminando..." : "Eliminar"}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md"
          >
            <div className={`p-4 rounded-2xl shadow-xl shadow-black/10 border backdrop-blur-md flex items-start gap-3 text-white ${toast.ok ? "bg-emerald-500/90 border-emerald-400" : "bg-rose-500/90 border-rose-400"}`}>
              {toast.ok ? <CheckCircle2 className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
              <div className="flex-1 text-sm font-medium">{toast.msg}</div>
              <button onClick={() => setToast(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
