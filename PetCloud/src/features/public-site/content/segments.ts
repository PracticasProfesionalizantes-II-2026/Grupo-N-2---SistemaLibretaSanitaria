import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  Clock,
  History,
  PenTool,
  ShieldCheck,
  Siren,
} from "lucide-react";

export type Benefit = {
  icon: LucideIcon;
  titulo: string;
  texto: string;
};

/* ---------- Veterinarias ---------- */

export const vetBenefits: Benefit[] = [
  {
    icon: History,
    titulo: "Dejás de trabajar a ciegas",
    texto:
      "Escaneás el QR y ves el historial completo del paciente, incluso lo que cargó otro colega en otra veterinaria.",
  },
  {
    icon: Clock,
    titulo: "Menos tiempo cargando datos",
    texto:
      "La ficha del paciente ya viene con sus datos. Vos cargás solo la consulta, y en un formulario pensado para el ritmo del consultorio.",
  },
  {
    icon: PenTool,
    titulo: "Firma digital con tu matrícula",
    texto:
      "Cada consulta y vacunación queda firmada y validada a tu nombre. Es tu respaldo profesional.",
  },
  {
    icon: CalendarCheck,
    titulo: "Sala de espera digital",
    texto:
      "Registrás la llegada y la mascota entra a la cola por orden de llegada, con las urgencias marcadas. Sin agendas que nadie cumple.",
  },
  {
    icon: Siren,
    titulo: "Menos ausentismo a los controles",
    texto:
      "Cuando cargás una vacuna o un antiparasitario con próxima dosis, al dueño le llega el aviso antes del vencimiento, en la app y por correo si lo tiene activado.",
  },
  {
    icon: ShieldCheck,
    titulo: "El panel base es gratis",
    texto:
      "Todo lo clínico —pacientes, consultas, vacunas, firma y sala de espera— no tiene costo. Premium es opcional y suma turnos y administración.",
  },
];

export const vetFeatures = [
  "Escaneo de QR desde cualquier pantalla del panel",
  "Ficha del paciente con historial, vacunas y alergias",
  "Carga de consultas con diagnóstico y observaciones",
  "Registro de vacunaciones y tratamientos",
  "Firma digital con número de matrícula",
  "Sala de espera por orden de llegada, con urgencias marcadas",
  "Modo campaña: elegís la vacuna una vez y escaneás QR en cadena",
  "Listado de pacientes con búsqueda",
  "Generación de certificados",
  "Gestión del equipo de profesionales de la institución",
  "Exportación del listado de vacunaciones",
];

/**
 * Lo que habilita Premium: exactamente las entradas que `config/vet-nav.ts`
 * marca con `sinPremium` (Turnos y Administración) y los módulos que lista
 * `premium-erp-benefits.tsx`. Sin precio a propósito: el vigente vive en
 * `premium_prices` y se muestra dentro del panel, no escrito a mano acá.
 */
export const vetPremiumFeatures = [
  "Turnos",
  "Stock de productos con alertas",
  "Ventas en mostrador con código de barras",
  "Caja",
  "Clientes y cuentas corrientes",
  "Compras y proveedores",
];

export const vetSteps = [
  {
    numero: "1",
    titulo: "Solicitás la demo",
    texto: "Nos escribís y coordinamos una recorrida por el panel.",
  },
  {
    numero: "2",
    titulo: "Validamos tu matrícula",
    texto:
      "Nuestro equipo verifica los datos profesionales. Suele tomar menos de 48 horas.",
  },
  {
    numero: "3",
    titulo: "Configurás tu institución",
    texto:
      "Cargás los datos de la veterinaria, los horarios y sumás a tu equipo.",
  },
  {
    numero: "4",
    titulo: "Empezás a atender",
    texto: "Escaneás el primer QR y cargás tu primera consulta.",
  },
];
