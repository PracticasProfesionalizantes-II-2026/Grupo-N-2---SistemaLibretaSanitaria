import { z } from "zod";

import { MOVEMENT_REASONS } from "@/features/erp/lib/movement-reason";

const requerido = "Este campo es obligatorio";

/**
 * Schemas del módulo de stock.
 *
 * Cada rango repite el CHECK de su columna en la migración 101 a propósito: el
 * error tiene que llegar debajo del campo mientras la persona escribe, no como
 * un mensaje de PostgreSQL después de mandar el formulario entero. La base
 * sigue siendo la que manda — esto es lo que evita que llegue hasta ella.
 */

export const PRODUCT_UNITS = [
  "unidad",
  "caja",
  "ml",
  "l",
  "g",
  "kg",
  "dosis",
] as const;

/**
 * Pesos con hasta dos decimales. Se valida en pesos porque es lo que la
 * persona escribe; la conversión a centavos la hace la acción, en un solo
 * lugar, justo antes de escribir.
 */
const pesos = (mensaje: string) =>
  z
    .number({ message: mensaje })
    .min(0, "No puede ser negativo")
    .max(99_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    );

/**
 * Cantidades con hasta tres decimales, igual que `NUMERIC(12,3)` en la base.
 * Tres y no dos porque hay insumos que se miden en mililitros o gramos y
 * redondear ahí es perder producto en el papel.
 */
const cantidad = (mensaje: string) =>
  z
    .number({ message: mensaje })
    .max(9_999_999, "Esa cantidad es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 1000)),
      "Como mucho tres decimales",
    );

export const productSchema = z.object({
  nombre: z.string().trim().min(1, requerido).max(120, "Máximo 120 caracteres"),
  // El SKU es opcional: una veterinaria chica no numera su inventario, y
  // obligarla a inventar códigos es la forma más rápida de que abandone el
  // módulo en la segunda carga.
  sku: z.string().trim().max(40, "Máximo 40 caracteres").optional(),
  categoria: z.string().trim().max(60, "Máximo 60 caracteres").optional(),
  unidad: z.enum(PRODUCT_UNITS, { message: "Elegí la unidad" }),
  costo: pesos("Ingresá el costo"),
  precio: pesos("Ingresá el precio"),
  stockMinimo: cantidad("Ingresá el stock mínimo").min(
    0,
    "No puede ser negativo",
  ),
  // Los cuatro siguientes solo se usan en alta (`erp-catalogo-compartido`,
  // fase 4): el código habilita el autocompletado desde el catálogo
  // compartido y, si no está en el catálogo, `catalogoTipo`/`catalogoEspecie`
  // son lo que la institución aporta para que quede disponible para las
  // demás. Van acá y no en un schema aparte porque viajan en el mismo
  // formulario y `productSchema` ya es la única fuente de validación del
  // modal (mismo criterio del comentario de arriba).
  codigoBarras: z.string().trim().max(64, "Máximo 64 caracteres").optional(),
  presentacion: z.string().trim().max(120, "Máximo 120 caracteres").optional(),
  laboratorio: z.string().trim().max(120, "Máximo 120 caracteres").optional(),
  // Requerido solo cuando el modal detectó que el código no está en el
  // catálogo compartido; esa condición depende de una búsqueda async que
  // el schema no puede ver, así que el modal la exige a mano antes de
  // enviar (mismo patrón que ya usa con el SKU duplicado del servidor).
  catalogoTipo: z.string().trim().optional(),
  catalogoEspecie: z.string().trim().optional(),
});

/**
 * Vender por debajo del costo NO se valida acá: es una decisión válida
 * (liquidar un vencimiento cercano, una promoción), así que el schema la deja
 * pasar y el modal pide una confirmación explícita antes de guardar. Antes era
 * un `refine` que bloqueaba, y eso dejaba sin salida al caso legítimo.
 */
export function precioDebajoDelCosto(valores: {
  costo: number;
  precio: number;
}): boolean {
  return valores.precio < valores.costo;
}

export type ProductValues = z.infer<typeof productSchema>;

/**
 * Un movimiento de stock cargado a mano.
 *
 * El formulario pregunta el MOTIVO, no el tipo técnico: "vencimiento" es algo
 * que la persona sabe, `kind = 'loss'` es algo que tiene que traducir. El
 * `kind` y el signo salen del motivo en `lib/movement-reason.ts`, del lado del
 * servidor, y por eso acá no hay campo `tipo`.
 *
 * Compra y venta no son motivos posibles: tienen sus propios módulos, que
 * además emiten el documento comercial. Permitir cargarlas desde acá hacía que
 * una compra tipeada a mano quedara indistinguible de una real.
 *
 * `cantidad` se valida siempre POSITIVA. Pedirle a la persona que escriba "-3"
 * es pedirle que traduzca, y traducir es donde se equivoca cualquiera.
 */
export const stockMovementSchema = z
  .object({
    productoId: z.string().min(1, "Elegí el producto"),
    motivo: z.enum(MOVEMENT_REASONS, {
      message: "Elegí por qué se mueve el stock",
    }),
    cantidad: cantidad("Ingresá la cantidad").positive(
      "La cantidad tiene que ser mayor que cero",
    ),
    /**
     * Solo se usa cuando el motivo no fija el signo, que es únicamente el
     * ajuste de inventario. `signoDelMotivo()` lo ignora en el resto.
     */
    ajusteResta: z.boolean().optional(),
    costoUnitario: pesos("Ingresá el costo unitario").optional(),
    nota: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
  })
  .refine(
    // Un ajuste sin explicación es exactamente el agujero que este módulo
    // existe para tapar: el número cambió y nadie sabe por qué. El resto de
    // los motivos ya dicen por qué en su propio nombre.
    (valores) =>
      valores.motivo !== "ajuste_inventario" || Boolean(valores.nota),
    {
      path: ["nota"],
      message: "Un ajuste de inventario necesita una explicación",
    },
  );

export type StockMovementValues = z.infer<typeof stockMovementSchema>;
