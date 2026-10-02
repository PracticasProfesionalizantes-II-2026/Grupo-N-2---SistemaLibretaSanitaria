import { z } from "zod";

/**
 * Registrar una firma (`vet_signatures`, migración 063; dibujo opcional desde
 * la 067).
 *
 * La aclaración, la matrícula y la declaración jurada viajan siempre juntas y
 * se guardan en una fila inmutable. El dibujo NO entra acá: es un `File`
 * opcional que la acción sube por separado antes de llamar al RPC, y su
 * ausencia no es un error de validación — es una firma sin imagen, tan válida
 * como una con ella.
 *
 * La declaración jurada se modela como `z.literal(true)` y no como booleano
 * opcional: sin aceptarla no hay firma, y el mensaje de error es el que se
 * muestra al lado de la casilla.
 */
export const signatureSchema = z.object({
  aclaracion: z
    .string()
    .trim()
    .min(1, "Escribí la aclaración, como va debajo de tu firma.")
    .max(120, "La aclaración no puede tener más de 120 caracteres."),
  matricula: z
    .string()
    .trim()
    .min(1, "Escribí tu número de matrícula.")
    .max(60, "La matrícula no puede tener más de 60 caracteres."),
  declaracion: z.literal(true, {
    message: "Tenés que aceptar la declaración jurada para registrar tu firma.",
  }),
});

/**
 * Lo único que acepta el bucket, cuando SÍ hay dibujo: PNG, hasta 1 MB.
 *
 * PNG no es negociable — `src/lib/pdf/firma.ts` declara `addImage(..., "PNG",
 * ...)` y la transparencia es lo que permite que el sello se apoye sobre el
 * texto del documento en vez de taparlo con un recuadro blanco.
 *
 * El tope de tamaño es holgado a propósito: un lienzo de 640 × 240 con un
 * trazo fino pesa unos pocos kilobytes, así que 1 MB no le aprieta a nadie y
 * corta cualquier intento de usar el bucket de firmas como almacenamiento.
 */
export const FIRMA_TIPO_MIME = "image/png";
export const FIRMA_MAX_BYTES = 1024 * 1024;
