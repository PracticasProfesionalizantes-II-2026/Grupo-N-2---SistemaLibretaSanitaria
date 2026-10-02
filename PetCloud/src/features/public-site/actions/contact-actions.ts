"use server";

import "server-only";

import { contactSchema } from "@/features/public-site/schemas/contact-schema";
import { getDb, insertInto } from "@/lib/db";

/**
 * El formulario público de contacto, ahora con destino.
 *
 * Antes esta acción no existía: `contact-form.tsx` esperaba 700 ms y decía que
 * había recibido el mensaje. Todo lo que se escribió desde que el sitio está
 * publicado se perdió.
 *
 * **Por qué se revalida acá con el mismo schema que ya corrió en el cliente.**
 * Porque un Server Action es un endpoint HTTP: cualquiera puede postearle el
 * cuerpo que quiera sin pasar por React. La validación del navegador sirve para
 * que la persona vea el error al lado del campo; no es una barrera. Las
 * barreras reales son tres y están apiladas a propósito: este `safeParse`, la
 * política de RLS de la 054, y los CHECK de la tabla.
 */

export type ContactResult =
  { success: true } | { success: false; error: string };

const GENERIC_ERROR =
  "No pudimos enviar tu mensaje. Probá de nuevo en unos minutos.";

const INVALID_ERROR =
  "Revisá los datos del formulario: alguno no es válido o es demasiado largo.";

/**
 * Enchufe de Cloudflare Turnstile (capa 4 del diseño).
 *
 * Cuando exista la key, la verificación va **acá**, antes del insert: se postea
 * el token a `https://challenges.cloudflare.com/turnstile/v0/siteverify` junto
 * con `TURNSTILE_SECRET_KEY`, y el resultado se resuelve a un veredicto corto
 * ('success' o el `error-codes[0]` que devuelva Cloudflare). Ese veredicto —y
 * nunca el token, que es de un solo uso— es lo que va a la columna
 * `turnstile_verdict`.
 *
 * Mientras no haya key, devuelve `null` y la fila queda con NULL, que es
 * exactamente lo que la política `contact_messages_insert` exige hoy: el
 * veredicto lo pone el servidor, no quien está siendo verificado. Habilitar la
 * verificación implica entonces tocar también esa política en una migración
 * nueva, no solo este archivo.
 */
async function verificarTurnstile(): Promise<string | null> {
  return null;
}

export async function submitContactMessage(
  valores: unknown,
): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(valores);
  if (!parsed.success) return { success: false, error: INVALID_ERROR };

  const datos = parsed.data;

  const turnstileVerdict = await verificarTurnstile();
  if (turnstileVerdict !== null)
    return { success: false, error: GENERIC_ERROR };

  // El formulario es público: se inserta sin requerir sesión.
  try {
    await getDb().execute(
      insertInto("contact_messages", {
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        organizacion: datos.organizacion ?? null,
        ciudad: datos.ciudad ?? null,
        tipo: datos.tipo,
        mensaje: datos.mensaje,
        turnstile_verdict: null,
      }),
    );
  } catch (error) {
    console.error("[submitContactMessage] insert falló:", error);
    return { success: false, error: GENERIC_ERROR };
  }

  return { success: true };
}
