"use client";

import React, { createContext, useContext } from "react";
import type { SystemSettings } from "@/lib/settings";

const SettingsContext = createContext<SystemSettings | null>(null);

export function SettingsProvider({
  settings,
  children,
}: {
  settings: SystemSettings;
  children: React.ReactNode;
}) {
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSystemSettings debe usarse dentro de un SettingsProvider");
  }
  return ctx;
}
