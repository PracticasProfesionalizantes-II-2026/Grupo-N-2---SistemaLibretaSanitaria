import { ShieldCheck } from "lucide-react";

/** Sidebar del área de administración: solo la validación de matrículas. */
export const ADMIN_BASE = "/admin";

export const adminNav = [
  {
    label: "Validaciones",
    href: `${ADMIN_BASE}/validaciones`,
    icon: ShieldCheck,
  },
] as const;
