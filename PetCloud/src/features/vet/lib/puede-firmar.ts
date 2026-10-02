/**
 * Por qué alguien no puede firmar, si es que no puede.
 *
 * Firmar un acto clínico pide dos cosas a la vez, y hasta la migración `065`
 * solo se pedía una: la matrícula validada, y una firma cargada en Ajustes. La
 * segunda entró con el portón de la `065`, que rechaza en la base cualquier
 * consulta, vacunación o certificado firmado sin firma vigente.
 *
 * Esto no protege nada —la frontera son los triggers— y existe por una razón
 * concreta: sin esto, la persona escribe la atención entera, aprieta "Firmar y
 * guardar" y recibe un error de PostgreSQL en vez de una explicación. Peor
 * todavía en la consulta, donde el INSERT entero se rechaza y lo escrito se
 * pierde; con el motivo a la vista, la acción guarda el borrador y avisa.
 *
 * Devuelve un motivo discriminado en vez de un booleano porque los dos estados
 * se arreglan distinto: uno se espera, el otro se resuelve en dos minutos
 * entrando a Ajustes. Un `false` pelado los vuelve el mismo callejón.
 *
 * Puro y sin DOM a propósito: lo consumen los dos formularios, el modal de
 * certificados y las Server Actions, que corren en sitios distintos.
 */

/** `null` significa que puede firmar. */
export type MotivoSinFirma = "sin-matricula" | "sin-firma" | null;

/**
 * Lo mínimo de la sesión del profesional que decide esto.
 *
 * `firmaId` es la fila vigente de `vet_signatures` que resuelve
 * `vet-session.ts`, no la columna `vet_professionals.signature_url`, que la
 * `063` deprecó y que siempre estuvo en NULL.
 */
export type EstadoDeFirma = {
  licenciaValidada: boolean;
  firmaId: string | null;
};

/**
 * El primer motivo que aplica, en el orden en que se resuelven.
 *
 * La matrícula va primero porque es la que no depende de la persona: cargar una
 * firma sin matrícula validada no habilita nada, así que mandar a alguien a
 * Ajustes antes de que la matrícula esté sería mandarlo al lugar equivocado.
 *
 * Sin sesión de profesional tampoco se firma, y el motivo es el de matrícula:
 * quien no tiene ficha no tiene matrícula que validar.
 */
export function motivoSinFirma(
  estado: EstadoDeFirma | null | undefined,
): MotivoSinFirma {
  if (!estado?.licenciaValidada) return "sin-matricula";
  if (!estado.firmaId) return "sin-firma";

  return null;
}

/** Atajo para los `disabled` de los botones: no hay motivo, entonces se firma. */
export function puedeFirmar(estado: EstadoDeFirma | null | undefined): boolean {
  return motivoSinFirma(estado) === null;
}
