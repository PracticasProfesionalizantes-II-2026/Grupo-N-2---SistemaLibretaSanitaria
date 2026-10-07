/**
 * Modelos de vista del ERP: lo que ven las pantallas, no lo que guarda la base.
 *
 * Mismo criterio que `types/vet.ts` y `types/pet.ts` — identificadores de
 * dominio en español, plata ya convertida a pesos, y el estado de reposición
 * resuelto acá y no en cada componente que lo necesite.
 *
 * Las uniones de dominio (`ProductUnit`, `MovementKind`, `CashMovementKind`,
 * `CustomerDocumentType`, `CustomerTaxCondition`, `AccountMovementKind`,
 * `PaymentMethodCode`, `SaleStatus`, `ErpModule`) se definen ACÁ y no salen de
 * `types/database.ts`, aunque el schema `erp` ya esté generado: el schema las
 * restringe con `CHECK`, no con `ENUM`, y un CHECK no deja rastro en el tipo
 * generado — el generador de tipos escribe `string` a secas. Las columnas de
 * `public` sí conservan la unión porque ahí son enumerados de verdad.
 *
 * La dirección es siempre `types/erp.ts` → consumidores, nunca al revés: este
 * archivo lo importan componentes de cliente, así que no puede depender de
 * nada con `server-only`. El estrechamiento de `string` a la unión se hace en
 * los mappers de `features/erp/lib/`, en el único punto por donde una fila
 * cruza a modelo de vista.
 *
 * Si un CHECK de la base cambia, este archivo NO se entera solo: hay que
 * actualizarlo a mano con la migración, porque el tipo generado seguirá
 * diciendo `string` pase lo que pase.
 */

/** Espejo del CHECK de `erp.products.unit` (migración 101). */
export type ProductUnit = "unidad" | "caja" | "ml" | "l" | "g" | "kg" | "dosis";

/** Espejo del CHECK de `erp.stock_movements.kind` (migración 101). */
export type MovementKind =
  "purchase" | "sale" | "use" | "adjustment" | "loss" | "return";

/**
 * Espejo del CHECK `stock_movements_reason_kind_coherentes` (migración 114):
 * el por qué se movió el stock, que es lo que la pantalla manual pregunta.
 *
 * Acá vive solo la unión, igual que `MovementKind` y `ProductUnit`. Las
 * etiquetas y el mapeo a `kind` y a signo viven en un único lugar,
 * `features/erp/lib/movement-reason.ts`, que los prueba: partirlos en dos
 * archivos sería tener dos listas que se pueden desincronizar.
 */
export type MovementReason =
  | "ajuste_inventario"
  | "merma"
  | "vencimiento"
  | "consumo_interno"
  | "muestra_gratis"
  | "devolucion_cliente";

/**
 * Semáforo de reposición.
 *
 * `negativo` no es un error de carga: la política de INSERT de
 * `stock_movements` permite salidas sin entrada previa a propósito (una dosis
 * aplicada antes de registrar la compra). Es una señal de que falta cargar
 * algo, y la pantalla la muestra distinto de `sin-stock` justamente porque
 * significan cosas distintas.
 */
export type StockStatus = "ok" | "bajo" | "sin-stock" | "negativo";

export type Product = {
  id: string;
  sku: string | null;
  nombre: string;
  categoria: string | null;
  unidad: ProductUnit;
  /** En pesos, ya convertido desde los centavos que guarda la base. */
  costo: number;
  precio: number;
  stock: number;
  stockMinimo: number;
  estado: StockStatus;
  activo: boolean;
  /**
   * Migración 116 (`erp-catalogo-compartido`, fase 4): lo autocompleta el
   * catálogo compartido en el alta, pero es propio de esta institución desde
   * ese momento — se edita como cualquier otro campo del producto.
   */
  presentacion?: string | null;
  laboratorio?: string | null;
};

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  unidad: "Unidad",
  caja: "Caja",
  ml: "Mililitro",
  l: "Litro",
  g: "Gramo",
  kg: "Kilogramo",
  dosis: "Dosis",
};

// Acá vivía `MOVEMENT_KIND_SIGN`. Se borró con la migración 114: el signo de
// un movimiento manual lo fija el MOTIVO, en
// `features/erp/lib/movement-reason.ts`. Dos tablas de signos —una por tipo y
// otra por motivo— son una que tarde o temprano queda desactualizada y da
// vuelta una cantidad.
//
// El signo de compras y ventas no está en ningún lado del cliente: lo ponen
// `erp.register_purchase()` (105) y `erp.register_sale()` (108) al escribir.

/**
 * Modelos de vista de Compras (migración 105).
 *
 * `Purchase` no repite las líneas embebidas por defecto: la lista de compras
 * solo necesita el total y el proveedor, y traer las líneas de las cien
 * últimas compras para no usarlas sería el mismo desperdicio de egress que
 * `data/stock.ts` explica en `COLUMNAS_PRODUCTO`.
 */
export type Supplier = {
  id: string;
  nombre: string;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
};

export type Purchase = {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  nota: string | null;
  /** Suma de `cantidad * costoUnitario` de todas las líneas, en pesos. */
  totalPesos: number;
  responsable: string;
  fecha: string;
};

/**
 * Modelos de vista de Caja (migración 106).
 *
 * `sale` existe en el CHECK de la base desde ya (queda listo para la 108),
 * pero este slice no lo emite: no hay pantalla que registre una venta
 * todavía. `cobro_cta_cte` se agrega en la 107 — el pago sobre cuenta
 * corriente entra al cajón (`erp.register_account_payment()`).
 */
export type CashMovementKind =
  | "aporte"
  | "sale"
  | "caja_chica"
  | "retiro"
  | "pago_proveedor"
  | "arqueo"
  | "cobro_cta_cte";

export const CASH_MOVEMENT_KIND_LABELS: Record<CashMovementKind, string> = {
  sale: "Venta",
  aporte: "Aporte al cajón",
  caja_chica: "Caja chica",
  retiro: "Retiro del titular",
  pago_proveedor: "Pago a proveedor",
  arqueo: "Arqueo",
  cobro_cta_cte: "Cobro de cuenta corriente",
};

export type CashAccount = {
  id: string;
  /** En pesos, ya convertido desde los centavos que guarda la base. */
  saldoPesos: number;
};

export type CashMovement = {
  id: string;
  tipo: CashMovementKind;
  /** Con signo, en pesos: positivo entra al cajón, negativo sale. */
  montoPesos: number;
  /**
   * Solo en `kind = 'arqueo'`: contado − sistema, en pesos. `null` en
   * cualquier otro tipo.
   */
  diferenciaPesos: number | null;
  nota: string | null;
  anulado: boolean;
  /** `true` si este movimiento ES la anulación de otro. */
  esContrasiento: boolean;
  responsable: string;
  fecha: string;
};

/**
 * Modelos de vista de Clientes + cuenta corriente (migración 107).
 */
export type CustomerDocumentType =
  "dni" | "cuit" | "cuil" | "pasaporte" | "sin_documento";

export const CUSTOMER_DOCUMENT_TYPE_LABELS: Record<
  CustomerDocumentType,
  string
> = {
  dni: "DNI",
  cuit: "CUIT",
  cuil: "CUIL",
  pasaporte: "Pasaporte",
  sin_documento: "Sin documento",
};

export type CustomerTaxCondition =
  | "consumidor_final"
  | "responsable_inscripto"
  | "monotributista"
  | "exento"
  | "no_alcanzado";

export const CUSTOMER_TAX_CONDITION_LABELS: Record<
  CustomerTaxCondition,
  string
> = {
  consumidor_final: "Consumidor final",
  responsable_inscripto: "Responsable inscripto",
  monotributista: "Monotributista",
  exento: "Exento",
  no_alcanzado: "No alcanzado",
};

export type Customer = {
  id: string;
  profileId: string | null;
  razonSocial: string;
  tipoDocumento: CustomerDocumentType;
  numeroDocumento: string | null;
  condicionIva: CustomerTaxCondition;
  domicilio: string | null;
  email: string | null;
  phone: string | null;
  /** En pesos. `null` significa sin límite (decisión 5). */
  limiteCreditoPesos: number | null;
  /** Con signo, en pesos: positivo es deuda del cliente, negativo es saldo a favor. */
  saldoPesos: number;
  activo: boolean;
  /**
   * `true` cuando hay límite y el saldo lo supera. Se calcula acá — nunca en
   * la base, que solo SURFACEA el límite y no lo aplica (`erp-customer-accounts`
   * spec, requerimiento "exceeding the credit limit warns but MUST NOT block").
   */
  sobreLimite: boolean;
};

export type AccountMovementKind = "sale" | "payment" | "ajuste";

export const ACCOUNT_MOVEMENT_KIND_LABELS: Record<AccountMovementKind, string> =
  {
    sale: "Venta en cuenta corriente",
    payment: "Pago",
    ajuste: "Ajuste manual",
  };

export type AccountMovement = {
  id: string;
  customerId: string;
  tipo: AccountMovementKind;
  /** Con signo, en pesos: positivo suma deuda, negativo la reduce. */
  montoPesos: number;
  nota: string | null;
  anulado: boolean;
  /** `true` si este movimiento ES la anulación de otro. */
  esContrasiento: boolean;
  responsable: string;
  fecha: string;
};

/**
 * Prefill de solo lectura desde `public.profiles` — nunca se escribe ahí.
 * `null` en cualquier campo que el perfil no tenga cargado.
 */
export type CustomerPrefill = {
  nombre: string | null;
  domicilio: string | null;
  telefono: string | null;
};

/**
 * Modelos de vista de Ventas (migración 108).
 */
export type PaymentMethodCode =
  "efectivo" | "tarjeta" | "transferencia" | "cuenta_corriente";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodCode, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cuenta_corriente: "Cuenta corriente",
};

export type PaymentMethod = {
  code: PaymentMethodCode;
  label: string;
  postsCash: boolean;
  postsAccount: boolean;
  requiresCustomer: boolean;
  activo: boolean;
};

export type SaleStatus = "registered" | "voided";

export type Sale = {
  id: string;
  clienteId: string | null;
  clienteNombre: string | null;
  metodoPago: PaymentMethodCode;
  status: SaleStatus;
  /** En pesos. */
  totalPesos: number;
  responsable: string;
  fecha: string;
};

export type SaleItem = {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  /** En pesos. */
  precioUnitario: number;
};

export type SaleDetail = Sale & {
  lineas: SaleItem[];
};

/**
 * Espejo del CHECK de `erp.module_grants.module` (migración 104) — el tipo
 * generado dice `string`, por el motivo que explica el comentario de arriba.
 *
 * `stock` y `ventas` no aparecen en `DELEGABLE_MODULES` de abajo: por
 * decisión 5 (`erp-team` spec) los tiene todo miembro Premium desde
 * siempre y no se "otorgan" — no hay nada que la pantalla de Equipo pueda
 * alternar para ellos.
 */
export type ErpModule =
  "stock" | "ventas" | "caja" | "compras" | "reportes" | "equipo";

export const DELEGABLE_MODULES = [
  "caja",
  "compras",
  "reportes",
  "equipo",
] as const satisfies readonly ErpModule[];

export type DelegableModule = (typeof DELEGABLE_MODULES)[number];

export const ERP_MODULE_LABELS: Record<ErpModule, string> = {
  stock: "Stock",
  ventas: "Ventas",
  caja: "Caja",
  compras: "Compras",
  reportes: "Reportes",
  equipo: "Equipo",
};

/**
 * Una fila del roster de Equipo: el profesional viene de
 * `public.vet_professionals` (nunca duplicado, `erp-team` spec, requirement
 * 1) y `modulosOtorgados` es lo que hoy tiene vigente en
 * `erp.module_grants` (`revoked_at IS NULL`).
 */
export type TeamMember = {
  profesionalId: string;
  nombre: string;
  rolEnInstitucion: string;
  esTitular: boolean;
  modulosOtorgados: DelegableModule[];
};
