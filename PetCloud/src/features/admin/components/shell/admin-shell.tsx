"use client";

import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_BASE, adminNav } from "@/config/admin-nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      nav={adminNav}
      homeHref={`${ADMIN_BASE}/validaciones`}
      context={{ label: "Backoffice", value: "PetCloud" }}
      user={{ nombre: "Equipo PetCloud", detalle: "Administrador" }}
      settingsHref={`${ADMIN_BASE}/validaciones`}
      footerLabel="PetCloud v0.1.0 · Backoffice"
    >
      {children}
    </AppShell>
  );
}
