"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Copy,
  Check,
  Download,
  Upload,
  Send,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Unlock,
  History,
  AlertTriangle,
  Users,
  Bookmark,
  FileText,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { DigitalReceiptModal, type ReceiptData } from "@/components/digital-receipt-modal";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { playSuccessSound, playCopySound } from "@/lib/audio-alerts";

export type FundsMode = "deposit" | "withdraw" | "transfer";

type FundsConfig = {
  depositsEnabled: boolean;
  depositAddress: string | null;
  network: string;
  withdrawFee: number;
  minWithdraw: number;
  minDeposit: number;
  maxWithdraw24h: number;
};

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 2) });

// ============================================================================
//  Etiquetas del libro mayor (compartidas con el historial de actividad)
// ============================================================================

export const LEDGER_LABELS: Record<string, string> = {
  DEPOSIT: "Depósito USDT (TRC20)",
  WITHDRAWAL: "Retiro USDT (TRC20)",
  WITHDRAWAL_REFUND: "Reembolso de retiro",
  TRANSFER_IN: "Transferencia recibida",
  TRANSFER_OUT: "Transferencia enviada",
  P2P_ESCROW: "USDT bloqueados en escrow P2P",
  P2P_REFUND: "Devolución de escrow P2P",
  P2P_RECEIVE: "Compra P2P recibida",
  AD_FREEZE: "Fondos congelados en anuncio",
  AD_UNFREEZE: "Fondos devueltos de anuncio",
  FEE: "Comisión",
  ADJUSTMENT: "Ajuste de saldo",
};

export type LedgerRow = { id: string; type: string; amount: number; note: string | null; createdAt: string; refId?: string | null };

export function ActivityList({ rows, emptyText }: { rows: LedgerRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-3">
          <History className="w-6 h-6 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Aún no tienes actividad reciente</p>
        <p className="text-xs text-zinc-500 mt-1">{emptyText ?? "Tus futuros depósitos y transacciones P2P aparecerán aquí."}</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((r) => {
        const positive = r.amount > 0;
        const neutral = r.amount === 0;
        const Icon = r.type === "AD_FREEZE" || r.type === "P2P_ESCROW" ? Lock : r.type === "AD_UNFREEZE" || r.type === "P2P_REFUND" ? Unlock : positive ? ArrowDownLeft : ArrowUpRight;
        return (
          <div key={r.id} className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${neutral ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" : positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">{LEDGER_LABELS[r.type] ?? r.type}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {new Date(r.createdAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold whitespace-nowrap flex-shrink-0 ${neutral ? "text-zinc-500" : positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {neutral ? "—" : `${positive ? "+" : "−"}${fmt(Math.abs(r.amount), 2)} USDT`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  Modal de fondos: Depositar / Retirar / Transferir
// ============================================================================

export function FundsModal({
  mode,
  onClose,
  available,
  onChanged,
  initialCurrency = "USDT",
}: {
  mode: FundsMode | null;
  onClose: () => void;
  available: number;
  onChanged?: () => void;
  initialCurrency?: "USDT" | "USDC";
}) {
  const [config, setConfig] = React.useState<FundsConfig | null>(null);

  React.useEffect(() => {
    if (!mode || config) return;
    import("@/app/actions/funds").then(({ getFundsConfig }) => getFundsConfig().then(setConfig));
  }, [mode, config]);

  const titles: Record<FundsMode, { title: string; icon: typeof Download }> = {
    deposit: { title: "Depositar Cripto", icon: Download },
    withdraw: { title: "Retirar Cripto", icon: Upload },
    transfer: { title: "Transferir a usuario Roraima", icon: Send },
  };

  return (
    <AnimatePresence>
      {mode && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 100 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-0 left-0 md:relative w-full md:max-w-lg bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-zinc-200/70 dark:border-emerald-500/20 rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl shadow-emerald-950/20 p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-6 md:hidden" />
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
            <div className="flex justify-between items-start mb-6 relative">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  {React.createElement(titles[mode].icon, { className: "w-5 h-5" })}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{titles[mode].title}</h2>
                  <p className="text-xs text-zinc-500">Disponible: {fmt(available)} USDT</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative">
              {!config ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
              ) : mode === "deposit" ? (
                <DepositPanel config={config} onChanged={onChanged} initialCurrency={initialCurrency} />
              ) : mode === "withdraw" ? (
                <WithdrawPanel config={config} available={available} onChanged={onChanged} />
              ) : (
                <TransferPanel available={available} onChanged={onChanged} onDone={onClose} />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  return { copied, copy };
}

function Notice({ tone, children }: { tone: "error" | "success" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300",
    info: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  }[tone];
  return <div className={`p-3 rounded-2xl border text-sm ${styles}`}>{children}</div>;
}

const inputCls =
  "w-full bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-50 outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-colors";
const primaryBtn =
  "w-full py-4 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-zinc-950 font-bold rounded-2xl shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2";

// ---------------------------------------------------------------------------
//  Depósito
// ---------------------------------------------------------------------------

type Deposit = { id: string; requestedAmount: number; expectedAmount: number; status: string; txid: string | null; createdAt: string; expiresAt: string; creditedAt: string | null };

function DepositPanel({
  config,
  onChanged,
  initialCurrency = "USDT",
}: {
  config: FundsConfig;
  onChanged?: () => void;
  initialCurrency?: "USDT" | "USDC";
}) {
  const [currency, setCurrency] = React.useState<"USDT" | "USDC">(initialCurrency);
  const [address, setAddress] = React.useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [history, setHistory] = React.useState<Deposit[]>([]);
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { copied, copy } = useCopy();

  const loadAddress = React.useCallback(async (curr: "USDT" | "USDC") => {
    setLoadingAddress(true);
    setError(null);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getMyDepositAddress } = await import("@/app/actions/funds");
      const res = await getMyDepositAddress(await getIdToken(), curr, "TRC20");
      if (res.success && res.address) {
        setAddress(res.address);
      } else {
        setError(res.error || "No se pudo generar la dirección");
      }
    } catch {
      setError("Error de conexión al obtener tu billetera");
    } finally {
      setLoadingAddress(false);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { listDeposits } = await import("@/app/actions/funds");
      const res = await listDeposits(await getIdToken());
      if (res.success) {
        setHistory(res.deposits);
      }
    } catch (e) {
      console.error("loadHistory error", e);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      loadAddress(currency);
      loadHistory();
    }, 0);
    return () => clearTimeout(timer);
  }, [currency, loadAddress, loadHistory]);

  const verifyNow = React.useCallback(
    async (silent = false) => {
      if (!silent) {
        setChecking(true);
        setError(null);
        setInfo(null);
      }
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const { checkUserDeposits } = await import("@/app/actions/funds");
        const res = await checkUserDeposits(await getIdToken(), currency, "TRC20");
        if (!res.success) {
          if (!silent) setError(res.error);
          return;
        }
        if (res.newlyCreditedCount && res.newlyCreditedCount > 0) {
          const creditedMsg = `¡Depósito confirmado! +${fmt(res.totalCreditedAmount, 2)} ${currency}`;
          setInfo(creditedMsg);
          toast.success(creditedMsg, {
            description: "Tus fondos ya están acreditados en tu balance de Roraima.",
            duration: 6000,
          });
          onChanged?.();
        } else if (!silent) {
          setInfo("Tu dirección está al día. No hay depósitos nuevos pendientes por acreditar.");
        }
        if (res.deposits) {
          setHistory(res.deposits);
        }
      } catch {
        if (!silent) setError("No se pudo verificar con TronGrid en este momento.");
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [currency, onChanged]
  );

  React.useEffect(() => {
    const timer = setInterval(() => verifyNow(true), 20000);
    return () => clearInterval(timer);
  }, [verifyNow]);

  return (
    <div className="space-y-5">
      {/* Selector de Criptoactivo */}
      <div>
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2 pl-1">
          Selecciona la criptomoneda
        </label>
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl">
          <button
            type="button"
            onClick={() => setCurrency("USDT")}
            className={`py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2.5 ${
              currency === "USDT"
                ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
              ₮
            </span>
            <span>USDT (Tether)</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrency("USDC")}
            className={`py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2.5 ${
              currency === "USDC"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-black shadow-sm">
              Ⓢ
            </span>
            <span>USDC (USD Coin)</span>
          </button>
        </div>
      </div>

      {/* Red de depósito */}
      <div className="flex justify-between items-center px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-100 dark:border-zinc-800 text-xs">
        <span className="text-zinc-500">Red soportada:</span>
        <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          TRON (TRC20)
        </span>
      </div>

      {/* Alerta de Seguridad Estilo iOS */}
      <div className="relative overflow-hidden rounded-2xl bg-amber-500/10 dark:bg-amber-500/[0.08] backdrop-blur-md border border-amber-500/30 dark:border-amber-400/25 p-3.5 sm:p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 text-left">
            <div className="text-xs font-bold text-amber-900 dark:text-amber-200 tracking-tight flex items-center gap-2">
              <span>Aviso Importante</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                Red TRC-20
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-amber-800/90 dark:text-amber-300/90 font-medium">
              Envía solo <b>{currency} (TRC-20)</b> a esta dirección. Otras redes causarán la pérdida de los fondos.
            </p>
          </div>
        </div>
      </div>

      {/* QR Code Container con qrcode.react */}
      <div className="flex flex-col items-center justify-center p-6 bg-zinc-50/80 dark:bg-zinc-950/70 rounded-3xl border border-zinc-100 dark:border-emerald-500/20 shadow-inner">
        {loadingAddress ? (
          <div className="w-44 h-44 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs text-zinc-400">Generando dirección HD...</span>
          </div>
        ) : address ? (
          <div className="p-3.5 bg-white rounded-2xl shadow-lg border border-zinc-200/80 dark:border-emerald-500/30">
            <QRCodeSVG
              value={address}
              size={168}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        ) : (
          <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400 text-center">
            Código QR no disponible
          </div>
        )}
        <span className="text-[11px] text-zinc-400 mt-3 font-medium">
          Escanea desde tu wallet o exchange (Binance, Bybit, Trust)
        </span>
      </div>

      {/* Tarjeta de Dirección de Depósito Grande + Botón Copiar al portapapeles */}
      <div className="bg-zinc-50 dark:bg-zinc-950/80 rounded-2xl p-4 sm:p-5 border border-zinc-200/70 dark:border-emerald-500/20 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Tu dirección pública de depósito</span>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Única & Permanente
          </span>
        </div>

        {/* Texto Grande en Formato Monospace */}
        <div className="p-3 bg-white dark:bg-zinc-900/90 rounded-xl border border-zinc-200/60 dark:border-zinc-800 shadow-inner">
          <p className="font-mono text-sm sm:text-base font-bold tracking-wide text-zinc-900 dark:text-zinc-50 break-all select-all text-center">
            {address ?? "Cargando..."}
          </p>
        </div>

        {/* Botón de Copiar al portapapeles con texto ¡Copiado! */}
        <button
          type="button"
          id="copy-deposit-address-btn"
          onClick={() => {
            if (!address) return;
            copy(address, "addr");
            toast.success("¡Dirección copiada al portapapeles!");
          }}
          disabled={!address}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-sm ${
            copied === "addr"
              ? "bg-emerald-500 text-white shadow-emerald-500/20 scale-[1.01]"
              : "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-zinc-950 hover:shadow-md"
          }`}
        >
          {copied === "addr" ? (
            <>
              <Check className="w-4 h-4 animate-in zoom-in-75" />
              <span>¡Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar al portapapeles</span>
            </>
          )}
        </button>
      </div>

      {/* Notificaciones y Avisos */}
      {error && <Notice tone="error">{error}</Notice>}
      {info && (
        <Notice tone="success">
          <div className="flex gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{info}</span>
          </div>
        </Notice>
      )}

      <Notice tone="info">
        Envía únicamente <b>{currency}</b> por la red <b>TRON (TRC20)</b>. Cualquier monto (mínimo {config.minDeposit} {currency}) se acreditará automáticamente una vez confirmado en la blockchain.
      </Notice>

      {/* Botón de verificación manual */}
      <button
        type="button"
        onClick={() => verifyNow(false)}
        disabled={checking || loadingAddress}
        className={primaryBtn}
      >
        {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
        {checking ? "Escaneando blockchain TRON..." : "Ya envié, verificar depósitos"}
      </button>

      {/* Historial de depósitos */}
      {history.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Depósitos acreditados recientes
          </h4>
          <div className="space-y-2">
            {history.slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex justify-between items-center text-xs p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/60"
              >
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                    +{d.expectedAmount.toFixed(2)} USDT
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {new Date(d.createdAt).toLocaleDateString("es-VE")}
                    {d.txid ? ` · ${d.txid.slice(0, 8)}...` : ""}
                  </div>
                </div>
                <StatusPill status={d.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    PENDING: { t: "Pendiente", c: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    CREDITED: { t: "Acreditado", c: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    COMPLETED: { t: "Enviado", c: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    EXPIRED: { t: "Expirado", c: "bg-zinc-500/10 text-zinc-500" },
    CANCELLED: { t: "Cancelado", c: "bg-zinc-500/10 text-zinc-500" },
    REJECTED: { t: "Rechazado", c: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  };
  const s = map[status] ?? { t: status, c: "bg-zinc-500/10 text-zinc-500" };
  return <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${s.c}`}>{s.t}</span>;
}

// ---------------------------------------------------------------------------
//  Retiro
// ---------------------------------------------------------------------------

type Withdrawal = { id: string; amount: number; fee: number; netAmount: number; address: string; status: string; txid: string | null; note: string | null; createdAt: string };

function WithdrawPanel({ config, available, onChanged }: { config: FundsConfig; available: number; onChanged?: () => void }) {
  const [address, setAddress] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [list, setList] = React.useState<Withdrawal[]>([]);

  const load = React.useCallback(async () => {
    const { getIdToken } = await import("@/lib/client-auth");
    const { listWithdrawals } = await import("@/app/actions/funds");
    const res = await listWithdrawals(await getIdToken());
    if (res.success) setList(res.withdrawals);
  }, []);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const amt = parseFloat(amount);
  const net = !isNaN(amt) ? Math.max(0, amt - config.withdrawFee) : 0;
  const addrLooksValid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { requestWithdrawal } = await import("@/app/actions/funds");
      const res = await requestWithdrawal(await getIdToken(), { amount: amt, address: address.trim(), twoFactorCode: twoFactorCode.trim() || undefined });
      if (!res.success) setError(res.error);
      else {
        setOk(`Solicitud registrada. Recibirás ${fmt(res.withdrawal.netAmount, 2)} USDT en tu dirección una vez procesada por el equipo de tesorería.`);
        setAmount("");
        setAddress("");
        setTwoFactorCode("");
        onChanged?.();
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    const { getIdToken } = await import("@/lib/client-auth");
    const { cancelWithdrawal } = await import("@/app/actions/funds");
    const res = await cancelWithdrawal(await getIdToken(), id);
    if (!res.success) setError(res.error);
    else {
      onChanged?.();
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 block">Dirección de destino (TRON · TRC20)</label>
        <input id="withdraw-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="T..." className={`${inputCls} font-mono text-sm ${address && !addrLooksValid ? "border-rose-400" : ""}`} />
        {address && !addrLooksValid && <p className="text-xs text-rose-500 mt-1 pl-1">Debe ser una dirección TRON (empieza con T, 34 caracteres).</p>}
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 flex justify-between">
          <span>Monto</span>
          <button type="button" onClick={() => setAmount(String(Math.floor(available * 1e6) / 1e6))} className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">Máx.</button>
        </label>
        <div className="relative flex items-center">
          <input id="withdraw-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Mínimo ${config.minWithdraw}`} className={inputCls} />
          <span className="absolute right-4 font-semibold text-zinc-500">USDT</span>
        </div>
      </div>
      <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-zinc-500">Comisión de red</span><span className="font-medium text-zinc-900 dark:text-zinc-50">{fmt(config.withdrawFee)} USDT</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">Límite 24 h</span><span className="font-medium text-zinc-900 dark:text-zinc-50">{fmt(config.maxWithdraw24h, 0)} USDT</span></div>
        <div className="h-px bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex justify-between"><span className="font-bold text-zinc-900 dark:text-zinc-50">Recibirás</span><span className="font-black text-emerald-600 dark:text-emerald-400">{fmt(net)} USDT</span></div>
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 block">Código 2FA Authenticator (si está activo en tu cuenta)</label>
        <input id="withdraw-2fa" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Código de 6 dígitos" maxLength={6} className={`${inputCls} font-mono tracking-widest text-center`} />
      </div>
      <Notice tone="info">
        <div className="flex gap-2"><ShieldCheck className="w-5 h-5 flex-shrink-0" /><span>Verifica la dirección y la red. Las transacciones en blockchain son irreversibles. Puedes cancelar mientras el retiro esté pendiente.</span></div>
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
      <button onClick={submit} disabled={busy || !addrLooksValid || !(amt >= config.minWithdraw) || amt > available} className={primaryBtn}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />} Solicitar retiro
      </button>
      {list.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mb-2">Retiros recientes</h4>
          <div className="space-y-2">
            {list.slice(0, 6).map((w) => (
              <div key={w.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">{fmt(w.netAmount)} USDT → {w.address.slice(0, 6)}…{w.address.slice(-4)}</span>
                  <StatusPill status={w.status} />
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-500">
                  <span>{new Date(w.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}</span>
                  {w.status === "PENDING" && <button onClick={() => cancel(w.id)} className="text-rose-500 font-bold">Cancelar</button>}
                  {w.txid && <a href={`https://tronscan.org/#/transaction/${w.txid}`} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold">Ver TXID</a>}
                </div>
                {w.note && w.status === "REJECTED" && <p className="text-xs text-rose-500">Motivo: {w.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Transferencia interna
// ---------------------------------------------------------------------------

function TransferPanel({ available, onChanged, onDone }: { available: number; onChanged?: () => void; onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [alias, setAlias] = React.useState("");
  const [saveAsContact, setSaveAsContact] = React.useState(false);
  const [contacts, setContacts] = React.useState<{ id: string; alias: string; email: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [receiptData, setReceiptData] = React.useState<ReceiptData | null>(null);

  // Cargar contactos frecuentes
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingContacts(true);
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const { listUserContacts } = await import("@/app/actions/contacts");
        const res = await listUserContacts(await getIdToken());
        if (active && res.success) {
          setContacts(res.contacts);
        }
      } catch {
        // Silencioso
      } finally {
        if (active) setLoadingContacts(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const selectContact = (c: { alias: string; email: string }) => {
    hapticTap();
    setEmail(c.email);
    setAlias(c.alias);
    setConfirming(false);
    toast.info(`Contacto seleccionado: ${c.alias}`);
  };

  const amt = parseFloat(amount);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && amt >= 0.1 && amt <= available;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const token = await getIdToken();
      const { transferInternal } = await import("@/app/actions/funds");
      const res = await transferInternal(token, { email: email.trim(), amount: amt, twoFactorCode: twoFactorCode.trim() || undefined });
      if (!res.success) {
        setError(res.error);
        setConfirming(false);
      } else {
        hapticSuccess();
        playSuccessSound();

        // Si marcó guardar contacto
        if (saveAsContact && alias.trim()) {
          try {
            const { saveUserContact } = await import("@/app/actions/contacts");
            await saveUserContact(token, { alias: alias.trim(), email: email.trim() });
          } catch {
            // Silencioso
          }
        }

        const recipient = res.recipientName || email.trim();
        setOk(`Enviaste con éxito ${fmt(amt)} USDT a ${recipient}.`);
        onChanged?.();

        // Configurar comprobante digital oficial
        setReceiptData({
          folio: `RRX-TRF-${Date.now().toString(36).toUpperCase()}`,
          type: "INTERNAL_TRANSFER",
          cryptoAmount: amt,
          cryptoCurrency: "USDT",
          counterpartyName: recipient,
          counterpartyDetail: email.trim(),
          date: new Date(),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Libreta de Contactos Frecuentes */}
      {contacts.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            <span>Contactos Frecuentes</span>
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
            {contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectContact(c)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold shrink-0 transition-all active:scale-95 flex items-center gap-1.5 ${
                  email === c.email
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/50"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center justify-center font-black">
                  {c.alias.charAt(0).toUpperCase()}
                </span>
                <span>{c.alias}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 block">
          Correo del destinatario en Roraima
        </label>
        <input
          id="transfer-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setConfirming(false);
          }}
          placeholder="usuario@correo.com"
          className={inputCls}
        />
      </div>

      {/* Opción de guardar contacto */}
      {!contacts.some((c) => c.email.toLowerCase() === email.trim().toLowerCase()) && email.includes("@") && (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={saveAsContact}
              onChange={(e) => setSaveAsContact(e.target.checked)}
              className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span>Guardar en mi lista de contactos frecuentes</span>
          </label>
          {saveAsContact && (
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Alias o apodo (ej: Mamá, Proveedor, Hermano)"
              maxLength={40}
              className={`${inputCls} text-xs py-2`}
            />
          )}
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 flex justify-between">
          <span>Monto</span>
          <button
            type="button"
            onClick={() => setAmount(String(Math.floor(available * 1e6) / 1e6))}
            className="text-emerald-600 dark:text-emerald-400 text-xs font-bold"
          >
            Máx.
          </button>
        </label>
        <div className="relative flex items-center">
          <input
            id="transfer-amount"
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirming(false);
            }}
            placeholder="Mínimo 0.1"
            className={inputCls}
          />
          <span className="absolute right-4 font-semibold text-zinc-500">USDT</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 block">
          Código 2FA Authenticator (si está activo en tu cuenta)
        </label>
        <input
          id="transfer-2fa"
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Código de 6 dígitos"
          maxLength={6}
          className={`${inputCls} font-mono tracking-widest text-center`}
        />
      </div>

      <Notice tone="info">
        Las transferencias entre usuarios de Roraima son instantáneas y <b>0% comisión</b>. Son irreversibles: confirma bien el correo antes de enviar.
      </Notice>

      {error && <Notice tone="error">{error}</Notice>}
      {ok && (
        <div className="space-y-3">
          <Notice tone="success">{ok}</Notice>
          {receiptData && (
            <button
              type="button"
              onClick={() => {
                hapticTap();
                // El modal emergente de comprobante se muestra al hacer clic
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-950/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              <FileText className="w-4 h-4" />
              <span>Ver y Compartir Comprobante Digital (WhatsApp)</span>
            </button>
          )}
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => {
            hapticTap();
            setConfirming(true);
          }}
          disabled={!valid || !!ok}
          className={primaryBtn}
        >
          <Send className="w-5 h-5" /> Continuar
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={busy || !!ok}
          className={`${primaryBtn} !bg-zinc-900 dark:!bg-zinc-100 dark:!text-zinc-950`}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          Confirmar envío de {fmt(amt || 0)} USDT a {email.trim()}
        </button>
      )}

      {/* Modal de Comprobante Oficial Digital */}
      <DigitalReceiptModal
        isOpen={!!receiptData}
        onClose={() => {
          setReceiptData(null);
          onDone();
        }}
        data={receiptData}
      />
    </div>
  );
}

