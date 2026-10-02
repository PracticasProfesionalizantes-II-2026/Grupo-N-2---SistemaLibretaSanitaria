import { z } from "zod";

/**
 * Resolución de una solicitud de matrícula (`/admin/validaciones`).
 *
 * La nota es obligatoria al rechazar y opcional al validar, y esa asimetría es
 * la regla de producto entera: rechazar sin motivo deja al profesional viendo
 * "cuenta en revisión" sin saber qué corregir — la misma deuda que las columnas
 * de revisión de la 060 existen para cerrar. Va como `superRefine` y no como un
 * `if` en la Server Action para que la regla viva donde vive el resto de la
 * validación, y no en dos lugares.
 *
 * El tope de 500 caracteres no es estético: la nota la lee el profesional en su
 * pantalla de cuenta en revisión, y un campo libre sin techo termina siendo
 * donde alguien pega media conversación.
 */
export const licenseReviewSchema = z
  .object({
    professionalId: z.uuid("Solicitud inválida"),
    validated: z.boolean(),
    nota: z
      .string()
      .trim()
      .max(500, "La nota admite hasta 500 caracteres")
      .optional(),
  })
  .superRefine((valores, ctx) => {
    if (!valores.validated && !valores.nota) {
      ctx.addIssue({
        code: "custom",
        path: ["nota"],
        message: "Contá el motivo del rechazo: el profesional lo va a leer",
      });
    }
  });
