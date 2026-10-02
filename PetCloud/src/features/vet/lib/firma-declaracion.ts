/**
 * El texto de la declaración jurada que acompaña a cada firma.
 *
 * Vive en una constante y se guarda **entero** en `vet_signatures.sworn_statement`
 * junto con su fecha, en vez de un booleano: si mañana se cambia la redacción,
 * la firma registrada hoy tiene que seguir diciendo lo que la persona aceptó
 * hoy. Un booleano `acepto = true` no puede responder qué fue lo que aceptó.
 *
 * No hay precedente en el repositorio: `aceptaTerminos`
 * (`auth-schemas.ts`) se valida al vuelo y no se guarda en ningún lado. Una
 * declaración que incide en la validez de un documento clínico no es aceptar
 * términos de servicio.
 *
 * Al cambiar este texto NO se toca ninguna fila existente: la versión nueva
 * empieza a regir para las firmas que se registren a partir de ahí.
 */
export const DECLARACION_JURADA =
  "Declaro bajo juramento que la firma y la aclaración que registro son mías, " +
  "que la matrícula declarada me pertenece y está vigente, y que asumo la " +
  "responsabilidad profesional por todo documento clínico que se emita con " +
  "ellas. Entiendo que esta firma queda estampada de forma permanente en cada " +
  "registro que firme y que reemplazarla no modifica lo ya firmado.";
