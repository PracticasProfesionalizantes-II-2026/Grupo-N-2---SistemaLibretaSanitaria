import type { SharedAccess } from "@/features/owner/data/owner-queries";

/** Un mismo humano, con todas las mascotas que comparte contigo agrupadas. */
export type PersonSharedAccess = {
  /**
   * Clave estable para el `key` de React y para el `id` del panel del
   * acordeón (`aria-controls`). Nunca se muestra — es `userId` cuando lo hay,
   * y si no, cae al email o al id de la fila (ver `groupSharedAccessByPerson`).
   */
  key: string;
  userId?: string;
  nombre: string;
  email: string;
  accesses: SharedAccess[];
};

/**
 * Agrupa `listMySharedAccess()` por persona invitada, no por par
 * (persona, mascota): compartir tres mascotas con la misma persona hoy
 * produce tres tarjetas idénticas salvo por el nombre de la mascota.
 *
 * La clave de agrupación es `userId` cuando existe — un acceso ya otorgado
 * (`kind: "grant"`) siempre lo tiene, porque ya hay una cuenta del otro lado.
 * Una invitación pendiente (`kind: "invite"`) todavía no tiene cuenta, así
 * que no hay id que agrupar: cae al email, que es el dato con el que se
 * invitó. Si ninguno de los dos está (no debería pasar con los datos reales,
 * pero una función pura no asume eso de su input) cada fila queda en su
 * propio grupo por `id`, en vez de fusionarse con cualquier otra fila sin
 * email.
 *
 * El orden de salida es el de la primera aparición de cada persona en
 * `accesses` — que ya viene ordenado por `created_at` ascendente desde la
 * consulta — para no barajar la lista cada vez que se agrega una mascota
 * compartida más.
 */
export function groupSharedAccessByPerson(
  accesses: SharedAccess[],
): PersonSharedAccess[] {
  const grupos = new Map<string, PersonSharedAccess>();

  for (const access of accesses) {
    const key = groupingKey(access);
    const existente = grupos.get(key);

    if (existente) {
      existente.accesses.push(access);
      continue;
    }

    grupos.set(key, {
      key,
      userId: access.userId,
      nombre: access.nombre,
      email: access.email,
      accesses: [access],
    });
  }

  return [...grupos.values()];
}

function groupingKey(access: SharedAccess): string {
  if (access.userId) return `user:${access.userId}`;
  if (access.email) return `email:${access.email.toLowerCase()}`;
  return `id:${access.id}`;
}

/** "1 mascota" / "2 mascotas" — la cuenta va siempre pegada al singular/plural. */
export function petCountLabel(count: number): string {
  return count === 1 ? "1 mascota" : `${count} mascotas`;
}
