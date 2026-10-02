import { z } from "zod";

/**
 * Invitar a alguien al equipo (`vet_team_invites`, migración 058).
 *
 * El rol nunca incluye `"owner"`: una institución tiene un titular, el que la
 * fundó, y esa regla ya vive en el CHECK de la tabla y en la política de
 * INSERT — este schema solo la adelanta al formulario para no dejar elegir
 * una opción que el servidor va a rechazar igual.
 */
export const teamInviteSchema = z.object({
  email: z.email("Ingresá un email válido"),
  rol: z.enum(["professional", "assistant"], {
    message: "Elegí un rol",
  }),
});

export type TeamInviteValues = z.infer<typeof teamInviteSchema>;

/**
 * La matrícula la escribe quien acepta, nunca quien invita: es su propio dato, y la 019 existe justamente para que nadie
 * más pueda forjarla. Acá se pide solo si el rol de la invitación es
 * `"professional"` — para `"assistant"` ni se muestra el campo, y
 * `accept_team_invite()` fuerza `NULL` sin confiar en lo que llegue de acá.
 */
export function acceptTeamInviteSchema(rol: "professional" | "assistant") {
  return z.object({
    matricula:
      rol === "assistant"
        ? z.string().optional()
        : z
            .string()
            .trim()
            .min(
              1,
              "Necesitamos tu número de matrícula para sumarte como veterinario.",
            ),
  });
}
