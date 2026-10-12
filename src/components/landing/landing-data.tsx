"use client";

import * as React from "react";
import type { LandingSnapshot } from "@/app/actions/landing";

type Ctx = { data: LandingSnapshot | null; loading: boolean };
const LandingContext = React.createContext<Ctx>({ data: null, loading: true });

const REFRESH_MS = 60_000;

/** Carga los datos públicos de la portada una vez y los refresca cada minuto. */
export function LandingDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<Ctx>({ data: null, loading: true });

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { getLandingSnapshot } = await import("@/app/actions/landing");
        const data = await getLandingSnapshot();
        if (alive) setState({ data, loading: false });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return <LandingContext.Provider value={state}>{children}</LandingContext.Provider>;
}

export const useLanding = () => React.useContext(LandingContext);

/** ¿Hay sesión? Los botones de la portada llevan al registro si no la hay, y al panel si la hay. */
export function useSignedIn() {
  const [signedIn, setSignedIn] = React.useState(false);
  React.useEffect(() => {
    let unsub = () => {};
    import("@/lib/firebase").then(({ auth }) => {
      unsub = auth.onAuthStateChanged((u) => setSignedIn(!!u));
    });
    return () => unsub();
  }, []);
  return signedIn;
}

export const REGISTER_URL = "/auth?modo=registro";

export const fmtBs = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Número que sube animado al entrar en pantalla. */
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      started.current = true;
      const start = performance.now();
      const dur = 1400;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        setShown(value * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (started.current) {
      setShown(value);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        run();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
