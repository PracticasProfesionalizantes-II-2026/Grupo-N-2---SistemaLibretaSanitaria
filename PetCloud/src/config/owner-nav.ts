import {
  Bell,
  FileText,
  HeartPulse,
  Home,
  MapPin,
  PawPrint,
  ScanLine,
  Stethoscope,
  User,
} from "lucide-react";

/**
 * Sidebar del dueño. "Salud" no tiene URL fija: apunta al perfil de la mascota
 * activa, por eso se resuelve en tiempo de render (ver owner-sidebar).
 *
 * No hay "Turnos": las veterinarias atienden por orden de llegada. Lo que el
 * dueño ve es "Visitas", el registro de lo que le hicieron a su mascota.
 */
export const ownerNav = [
  { label: "Inicio", href: "/inicio", icon: Home },
  { label: "Mis mascotas", href: "/mis-mascotas", icon: PawPrint },
  { label: "Leer QR", href: "/leer-qr", icon: ScanLine },
  { label: "Salud", href: "salud", icon: HeartPulse, dynamic: true },
  { label: "Visitas", href: "/visitas", icon: Stethoscope },
  { label: "Veterinarias", href: "/veterinarias", icon: MapPin },
  { label: "Recordatorios", href: "/recordatorios", icon: Bell },
  { label: "Documentos", href: "/documentos", icon: FileText },
  { label: "Perfil", href: "/perfil", icon: User },
] as const;
