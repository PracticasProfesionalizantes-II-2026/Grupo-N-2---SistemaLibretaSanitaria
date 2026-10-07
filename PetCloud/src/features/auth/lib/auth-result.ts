/**
 * Acciones de autenticación.
 *
 * Todas devuelven `{ success }` en vez de redirigir desde el servidor, para que
 * los formularios sigan haciendo lo que ya hacían: mostrar el error en el campo
 * que corresponde, o el toast y el `router.push`. `field` le dice al formulario
 * dónde pintar el mensaje; sin eso, un email repetido aparecería como un error
 * suelto arriba en vez de debajo del campo del email.
 */
export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | {
      success: false;
      error: string;
      /** Campo del formulario al que pertenece el error, si es de uno solo. */
      field?: "email" | "password" | "matricula";
      /** Estados que la UI muestra distinto de un error común. */
      code?:
        | "sin-verificar"
        | "en-revision"
        | "sin-configurar"
        | "proveedor-no-habilitado";
    };

export const GENERIC_ERROR =
  "No pudimos completar la operación. Intentá de nuevo en unos minutos.";

export function notConfigured() {
  return {
    success: false as const,
    error:
      "Falta configurar la base de datos: creá .env.local con DATABASE_URL y AUTH_SECRET (ver README del repositorio).",
    code: "sin-configurar" as const,
  };
}
