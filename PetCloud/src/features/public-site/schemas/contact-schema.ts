import { z } from "zod";

const required = "Este campo es obligatorio";

/**
 * Los topes son los mismos que los CHECK de la migración 054, y tienen que
 * seguir siéndolo: si acá fueran más generosos, el formulario aceptaría un
 * texto que después la base rechaza con un error 23514 que nadie tradujo, y la
 * persona vería "algo salió mal" sin saber qué acortar. El schema existe para
 * que el rechazo llegue en castellano y señalando el campo.
 *
 * El largo del email es 254 porque ese es el máximo real de una dirección
 * (RFC 5321), no un número redondo.
 */
export const LIMITES = {
  nombre: 120,
  email: 254,
  telefono: 40,
  organizacion: 160,
  ciudad: 120,
  mensaje: 4000,
} as const;

const demasiadoLargo = (max: number) =>
  `No puede superar los ${max} caracteres`;

/**
 * Un campo opcional del formulario llega como `""` cuando la persona no lo
 * completa, no como `undefined`. Sin este transform, la cadena vacía viajaría
 * hasta la base y quedaría una columna con un string vacío que no significa lo
 * mismo que NULL: "lo dejó en blanco" y "no había campo" se vuelven
 * indistinguibles en el panel.
 */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, demasiadoLargo(max))
    .optional()
    .transform((valor) => (valor ? valor : undefined));

export const contactSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, required)
    .max(LIMITES.nombre, demasiadoLargo(LIMITES.nombre)),
  email: z
    .string()
    .trim()
    .min(1, required)
    .max(LIMITES.email, demasiadoLargo(LIMITES.email))
    .email("Ingresá un email válido"),
  telefono: z
    .string()
    .trim()
    .min(1, required)
    .max(LIMITES.telefono, demasiadoLargo(LIMITES.telefono)),
  organizacion: opcional(LIMITES.organizacion),
  ciudad: opcional(LIMITES.ciudad),
  tipo: z.enum(["dueno", "veterinaria", "municipio"], {
    message: "Elegí una opción",
  }),
  mensaje: z
    .string()
    .trim()
    .min(1, required)
    .max(LIMITES.mensaje, demasiadoLargo(LIMITES.mensaje)),
  aceptaPrivacidad: z.literal(true, {
    message: "Tenés que aceptar la política de privacidad",
  }),
});

export type ContactFormValues = z.input<typeof contactSchema>;
export type ContactFormData = z.output<typeof contactSchema>;
