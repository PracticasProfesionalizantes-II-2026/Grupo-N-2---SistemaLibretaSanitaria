import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Building2,
  ClipboardList,
  FileDown,
  PenTool,
  QrCode,
  Stethoscope,
  UserPlus,
} from "lucide-react";

export type Stage = {
  numero: string;
  actor: "Dueño" | "Veterinario" | "Municipio";
  titulo: string;
  descripcion: string;
  icon: LucideIcon;
};

/** Las etapas del recorrido del dato: dueño → veterinario → municipio. */
export const stages: Stage[] = [
  {
    numero: "01",
    actor: "Dueño",
    titulo: "Registrás a tu mascota",
    descripcion:
      "Cargás sus datos básicos —nombre, especie, raza, fecha de nacimiento— y el sistema genera automáticamente su perfil digital y su código QR único.",
    icon: UserPlus,
  },
  {
    numero: "02",
    actor: "Dueño",
    titulo: "Imprimís el QR para su collar",
    descripcion:
      "Descargás el QR en formato chapita. Quien la encuentre lo escanea y puede dejarte un aviso; tu teléfono solo aparece si la marcaste como perdida.",
    icon: QrCode,
  },
  {
    numero: "03",
    actor: "Veterinario",
    titulo: "El veterinario escanea y ve todo el historial",
    descripcion:
      "En la consulta, el profesional escanea el QR y accede al instante al historial completo: vacunas, tratamientos previos, alergias y peso. Deja de trabajar a ciegas sobre lo que hizo otro colega.",
    icon: Stethoscope,
  },
  {
    numero: "04",
    actor: "Veterinario",
    titulo: "Carga la consulta con su firma digital",
    descripcion:
      "Registra el diagnóstico, la vacuna aplicada o el tratamiento indicado, y lo firma digitalmente con su matrícula. Ese registro queda validado y visible para vos al instante.",
    icon: PenTool,
  },
  {
    numero: "05",
    actor: "Dueño",
    titulo: "Recibís recordatorios automáticos",
    descripcion:
      "Cuando se carga una vacuna o un antiparasitario con próxima dosis, el sistema te avisa 7 días antes del vencimiento: en la app y, si lo activaste, por correo. Sin que tengas que anotar nada.",
    icon: BellRing,
  },
  {
    numero: "06",
    actor: "Municipio",
    titulo: "El municipio ve el padrón consolidado",
    descripcion:
      "Con lo que cargan las veterinarias adheridas, el municipio arma su padrón y sus estadísticas de cobertura por barrio. Obtiene trazabilidad sanitaria sin montar un operativo de censo.",
    icon: Building2,
  },
];

export const dataAccessRules = [
  {
    actor: "Vos, dueño",
    acceso: "Todo el historial de tus mascotas",
    detalle:
      "Ves y descargás la libreta completa, y decidís con quién compartir el acceso.",
  },
  {
    actor: "Tu veterinario",
    acceso: "Historial clínico completo",
    detalle:
      "Accede al escanear el QR o desde su listado de pacientes, para poder atender con la información completa.",
  },
  {
    actor: "El municipio",
    acceso: "Solo el estado de vacunación",
    detalle:
      "Ve datos del padrón y si la vacunación está al día. Nunca accede al detalle clínico, y cada apertura de ficha queda registrada en un log de auditoría.",
  },
  {
    actor: "Alguien que escanea el QR",
    acceso: "Ficha reducida",
    detalle:
      "Vos elegís qué datos se ven en la ficha pública; el nombre siempre está. Tu teléfono solo aparece si marcaste a la mascota como perdida.",
  },
];

export const ownerBenefits = [
  {
    icon: ClipboardList,
    titulo: "Nunca más perdés la libreta",
    texto:
      "El historial vive en la nube y se accede desde cualquier dispositivo.",
  },
  {
    icon: BellRing,
    titulo: "No se te pasa una vacuna",
    texto:
      "Avisos automáticos antes de que venza una vacuna o un antiparasitario.",
  },
  {
    icon: FileDown,
    titulo: "Certificado en un clic",
    texto: "Generás la libreta en PDF para viajes, guarderías o trámites.",
  },
];
