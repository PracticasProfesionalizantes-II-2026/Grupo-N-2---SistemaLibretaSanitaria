/**
 * Nombre para mostrar de una cuenta en el backoffice.
 *
 * Una cuenta sin nombre cargado (alta con Google a medio completar, un perfil
 * viejo) dejaba un hueco en las tablas y un avatar vacío. Se cae al email,
 * que siempre identifica a la persona, y recién después a "Sin nombre".
 */
export function nombreVisible(
  nombre: string | null | undefined,
  email?: string | null,
): string {
  const limpio = (nombre ?? "").replace(/\s+/g, " ").trim();
  if (limpio) return limpio;
  const correo = (email ?? "").trim();
  if (correo && correo !== "—") return correo;
  return "Sin nombre";
}

/** Une nombre y apellido tolerando `null` o vacíos. */
export function nombreCompleto(
  nombre: string | null | undefined,
  apellido: string | null | undefined,
): string {
  return [nombre, apellido]
    .map((parte) => (parte ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
