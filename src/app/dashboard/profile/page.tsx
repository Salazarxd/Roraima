"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, BadgeCheck, ShieldAlert, Clock, CheckCircle2, AlertCircle, X, AlertTriangle } from "lucide-react";

type Profile = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  document: string | null;
  phone: string | null;
  address: string | null;
  kycStatus: string;
  identityLocked: boolean;
  locks: { firstName: boolean; lastName: boolean; document: boolean };
  missing: string[];
  createdAt: string;
};

const KYC_BANNER: Record<string, { icon: typeof BadgeCheck; cls: string; title: string; desc: string }> = {
  VERIFIED: { icon: BadgeCheck, cls: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40", title: "Identidad verificada", desc: "Tus datos de identidad están bloqueados por seguridad. Para corregirlos contacta a soporte." },
  PENDING: { icon: Clock, cls: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/40", title: "Verificación en revisión", desc: "Nuestro equipo está revisando tus documentos. Te avisaremos al terminar." },
  REJECTED: { icon: ShieldAlert, cls: "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/40", title: "Verificación rechazada", desc: "Revisa tus datos y vuelve a enviar tus documentos." },
  UNVERIFIED: { icon: ShieldAlert, cls: "bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800", title: "Identidad sin verificar", desc: "Completa tus datos y verifica tu identidad para operar en P2P, depositar y retirar." },
};

const inputBase = "w-full rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-50 border outline-none transition-colors";
const inputEditable = `${inputBase} bg-transparent border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20`;
const inputMissing = `${inputBase} bg-amber-50/40 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700/60 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20`;
const inputLocked = `${inputBase} bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 opacity-70`;

type FormKey = "firstName" | "lastName" | "document" | "phone" | "address";

/** Separa un nombre completo en nombres / apellidos (2+2 o 1+resto). */
function splitName(full: string | null): { first: string; last: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  if (parts.length >= 4) return { first: parts.slice(0, 2).join(" "), last: parts.slice(2).join(" ") };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ProfilePage() {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [form, setForm] = React.useState<Record<FormKey, string>>({ firstName: "", lastName: "", document: "", phone: "", address: "" });
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getMyProfile } = await import("@/app/actions/account");
      const res = await getMyProfile(await getIdToken());
      if (!res.success) { setToast({ ok: false, msg: res.error }); return; }
      const p = res.profile;
      setProfile(p);
      const guess = splitName(p.name);
      setForm({
        firstName: p.firstName || guess.first,
        lastName: p.lastName || guess.last,
        document: p.document ?? "",
        phone: p.phone ?? "",
        address: p.address ?? "",
      });
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : "No se pudo cargar tu perfil" });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    const empty = (Object.keys(form) as FormKey[]).filter((k) => !form[k].trim());
    if (empty.length) { setToast({ ok: false, msg: "Todos los campos marcados con * son obligatorios." }); return; }
    setSaving(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { updateProfile } = await import("@/app/actions/account");
      const res = await updateProfile(await getIdToken(), form);
      if (res.success) {
        setToast({ ok: true, msg: "Datos guardados correctamente." });
        window.dispatchEvent(new Event("profile-updated"));
        load();
      } else setToast({ ok: false, msg: res.error });
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const banner = profile ? KYC_BANNER[profile.kycStatus] ?? KYC_BANNER.UNVERIFIED : null;
  const set = (k: FormKey) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isLocked = (k: FormKey) => (k === "firstName" || k === "lastName" || k === "document" ? profile?.locks[k] ?? true : false);
  const cls = (k: FormKey) => (isLocked(k) ? inputLocked : !form[k].trim() ? inputMissing : inputEditable);

  const Label = ({ k, children }: { k: FormKey; children: React.ReactNode }) => (
    <label htmlFor={`profile-${k}`} className="text-sm font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
      {children}
      {isLocked(k) ? <Lock className="w-3 h-3" /> : <span className="text-rose-500">*</span>}
    </label>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Información Personal</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestiona tus datos y límites operativos</p>
      </div>

      {profile && profile.missing.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] p-5 border flex items-start gap-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/40"
        >
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold">Completa tu información personal</div>
            <p className="text-sm opacity-90 mt-0.5">
              Es obligatoria para operar en P2P, publicar anuncios, retirar, transferir y verificar tu identidad. Falta: <b>{profile.missing.join(", ")}</b>.
            </p>
            {profile.identityLocked && (
              <p className="text-xs opacity-80 mt-1.5">Los datos de identidad solo se pueden registrar una vez; revisa que coincidan exactamente con tu documento.</p>
            )}
          </div>
        </motion.div>
      )}

      {banner && profile && (
        <div className={`rounded-[2rem] p-5 border flex items-start gap-4 ${banner.cls}`}>
          <banner.icon className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold">{banner.title}</div>
            <p className="text-sm opacity-80 mt-0.5">{banner.desc}</p>
          </div>
          {(profile.kycStatus === "UNVERIFIED" || profile.kycStatus === "REJECTED") && (
            <Link id="profile-start-kyc" href="/kyc" className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors">
              Verificar
            </Link>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 border border-zinc-100 dark:border-zinc-800/60 shadow-sm">
        {!profile ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}
          </div>
        ) : (
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <Label k="firstName">Nombres</Label>
              <input id="profile-firstName" type="text" required disabled={isLocked("firstName")} value={form.firstName} onChange={set("firstName")} placeholder="Como aparece en tu documento" maxLength={60} autoComplete="given-name" className={cls("firstName")} />
            </div>
            <div className="space-y-1">
              <Label k="lastName">Apellidos</Label>
              <input id="profile-lastName" type="text" required disabled={isLocked("lastName")} value={form.lastName} onChange={set("lastName")} placeholder="Como aparece en tu documento" maxLength={60} autoComplete="family-name" className={cls("lastName")} />
            </div>
            <div className="space-y-1">
              <Label k="document">Documento de Identidad</Label>
              <input id="profile-document" type="text" required disabled={isLocked("document")} value={form.document} onChange={set("document")} placeholder="V-12345678" maxLength={20} className={cls("document")} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">Correo Electrónico <Lock className="w-3 h-3" /></label>
              <input type="email" disabled value={profile.email} className={inputLocked} />
            </div>
            <div className="space-y-1">
              <Label k="phone">Teléfono</Label>
              <input id="profile-phone" type="tel" required value={form.phone} onChange={set("phone")} placeholder="+58 414-0000000" maxLength={30} autoComplete="tel" className={cls("phone")} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Miembro desde</label>
              <input type="text" disabled value={new Date(profile.createdAt).toLocaleDateString("es-VE", { dateStyle: "long" })} className={inputLocked} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label k="address">Dirección</Label>
              <input id="profile-address" type="text" required value={form.address} onChange={set("address")} placeholder="Ciudad, estado" maxLength={300} autoComplete="street-address" className={cls("address")} />
            </div>
          </div>
          <p className="text-xs text-zinc-400"><span className="text-rose-500">*</span> Campos obligatorios</p>
          <button
            id="profile-save"
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors"
          >
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </form>
        )}
      </div>

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
