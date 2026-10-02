import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  BookX,
  CalendarClock,
  FileDown,
  Heart,
  PenTool,
  QrCode,
  Shuffle,
  Stethoscope,
  Syringe,
  UserPlus,
} from "lucide-react";

export type IconCardItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export const problems: IconCardItem[] = [
  {
    icon: BookX,
    title: "Libretas que se pierden",
    description:
      "La libreta de papel se moja, se rompe o queda olvidada justo el día de la consulta.",
  },
  {
    icon: CalendarClock,
    title: "Vacunas fuera de término",
    description:
      "Sin recordatorios, es fácil perder de vista cuándo vence la próxima antirrábica.",
  },
  {
    icon: Shuffle,
    title: "Información dispersa",
    description:
      "Cada veterinaria arranca de cero porque no tiene el historial que cargó otro colega.",
  },
];

export const steps: IconCardItem[] = [
  {
    icon: UserPlus,
    title: "Registrás a tu mascota",
    description:
      "Cargás sus datos básicos y en segundos tiene su perfil digital y su QR.",
  },
  {
    icon: Stethoscope,
    title: "El veterinario carga vacunas y tratamientos",
    description:
      "Cada consulta, vacuna o tratamiento queda firmado digitalmente en el historial.",
  },
  {
    icon: QrCode,
    title: "El QR del collar la trae de vuelta",
    description:
      "Quien escanea el collar ve una ficha reducida para devolver a tu mascota. El historial clínico solo lo ven vos y tu veterinaria.",
  },
];

export const features: IconCardItem[] = [
  {
    icon: FileDown,
    title: "Historial médico centralizado",
    description: "Consultas, diagnósticos y tratamientos en un solo lugar.",
  },
  {
    icon: Syringe,
    title: "Vacunas y antiparasitarios",
    description: "Registro completo con fechas y próximos vencimientos.",
  },
  {
    icon: BellRing,
    title: "Recordatorios automáticos",
    description:
      "Aviso en la app, y por correo si querés, 7 días antes de que venza una vacuna o un antiparasitario.",
  },
  {
    icon: QrCode,
    title: "QR por mascota",
    description:
      "Un código único: tu veterinaria abre la ficha al escanearlo y quien la encuentre puede avisarte.",
  },
  {
    icon: FileDown,
    title: "Certificado de vacunación en PDF",
    description: "Descargable en un clic para trámites y viajes.",
  },
  {
    icon: PenTool,
    title: "Firma digital del veterinario",
    description: "Cada registro queda validado por un profesional matriculado.",
  },
];

export const actors = [
  {
    icon: Heart,
    title: "Dueños de mascotas",
    description:
      "Tu mascota, su historial y sus recordatorios, siempre en tu bolsillo.",
    href: "/como-funciona",
  },
  {
    icon: Stethoscope,
    title: "Veterinarias",
    description:
      "Escaneás el QR desde el panel y accedés al historial completo del paciente al instante.",
    href: "/para-veterinarias",
  },
];

export const faqs = [
  {
    question: "¿PetCloud tiene algún costo?",
    answer:
      "Para dueños de mascotas y municipios es gratis. Las veterinarias usan gratis todo el panel clínico; Premium es un plan opcional que suma turnos y administración (stock, ventas, caja, clientes y compras).",
  },
  {
    question: "¿Qué pasa si mi veterinaria no usa PetCloud todavía?",
    answer:
      "Podés registrar a tu mascota y cargar sus datos básicos igual. El historial clínico con firma digital se completa cuando la atiende una veterinaria adherida.",
  },
  {
    question: "¿Quién puede ver el historial médico de mi mascota?",
    answer:
      "Vos y los veterinarios que la atienden. El municipio solo accede al estado de vacunación, nunca al detalle clínico completo.",
  },
  {
    question: "¿Cómo funciona el código QR?",
    answer:
      "Cada mascota tiene un QR único. Quien lo escanea con la cámara ve una ficha reducida con los datos que vos elegiste mostrar —el nombre siempre está— para poder avisarte; nunca el historial clínico. Tu veterinaria lo escanea desde su panel y ahí sí abre la ficha completa.",
  },
  {
    question: "¿El municipio puede obligarme a cargar los datos de mi mascota?",
    answer:
      "El registro es voluntario para el dueño. El municipio arma su padrón a partir de lo que las veterinarias adheridas van cargando.",
  },
  {
    question: "¿PetCloud reemplaza a mi veterinario?",
    answer:
      "No. PetCloud es una herramienta de registro y trazabilidad; el diagnóstico y el tratamiento siguen siendo responsabilidad exclusiva del veterinario.",
  },
];
