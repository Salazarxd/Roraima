"use client";

import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

/** Espera a que Firebase resuelva la sesión (evita `currentUser === null` al recargar). */
export function waitForUser(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}

/** Devuelve el Firebase ID Token del usuario actual para enviarlo a las Server Actions. */
export async function getIdToken(): Promise<string> {
  const user = await waitForUser();
  if (!user) throw new Error("Debes iniciar sesión para continuar.");
  return user.getIdToken();
}
