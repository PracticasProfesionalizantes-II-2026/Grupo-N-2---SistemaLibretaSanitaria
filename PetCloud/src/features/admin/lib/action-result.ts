/**
 * Resultado uniforme para toda Server Action del backoffice.
 *
 * Mismo shape que ya usaban `pricing-actions.ts` y `owner/actions/pets-actions.ts`,
 * cada uno con su propia copia: en éxito, cualquier dato extra se agrega
 * directo al objeto (no anidado bajo `data`), así `result.municipioId` queda
 * al mismo nivel que `success`. Se saca a un archivo propio para que
 * `team-actions.ts` y las acciones de `Usuarios`/`Organizaciones` lo
 * importen en vez de redeclararlo cada una.
 */
export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };
