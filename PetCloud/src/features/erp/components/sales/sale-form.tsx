"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Banknote,
  CreditCard,
  Landmark,
  type LucideIcon,
  Plus,
  Repeat,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { registerSale } from "@/features/erp/actions/sale-actions";
import { PaymentSimulationModal } from "@/features/erp/components/sales/payment-simulation-modal";
import { ScanInput } from "@/features/erp/components/sales/scan-input";
import { calcularVuelto, textoDeVuelto } from "@/features/erp/lib/cash-change";
import {
  buildProductIndex,
  type Barcode,
} from "@/features/erp/lib/product-index";
import { calcularTotalPesos } from "@/features/erp/lib/sale-mappers";
import {
  buscarProducto,
  precioDeProducto,
  textoDeStock,
} from "@/features/erp/lib/sale-pricing";
import {
  faltantesDeStock,
  textoDeFalta,
} from "@/features/erp/lib/stock-availability";
import {
  saleSchema,
  type SaleValues,
} from "@/features/erp/schemas/sale-schemas";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  type Customer,
  type PaymentMethod,
  type PaymentMethodCode,
  type Product,
} from "@/types/erp";

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

/**
 * Los valores con los que arranca el formulario y a los que vuelve después de
 * cada venta. Están acá arriba y no repetidos en dos lugares porque el reseteo
 * tiene que devolver exactamente el estado inicial: si los dos objetos se
 * desalinean, la segunda venta del día arranca distinta de la primera y nadie
 * se entera hasta que algo sale mal.
 */
const VALORES_INICIALES: SaleValues = {
  clienteId: "",
  metodoPago: "efectivo",
  // Vacío y no una fila en blanco: una pantalla escáner-primero no abre con
  // un renglón a medio llenar. `saleSchema.min(1)` más el submit deshabilitado
  // son el respaldo que ya existía.
  lineas: [],
};

/**
 * Un ícono por método de pago, para que la fila se lea de un vistazo sin
 * detenerse a leer las cuatro etiquetas. `Wallet` es el respaldo: si mañana la
 * base trae un método que no está en este mapa, el botón se dibuja igual en vez
 * de romper la pantalla.
 */
const ICONO_METODO: Record<PaymentMethodCode, LucideIcon> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: Repeat,
  cuenta_corriente: Landmark,
};

/**
 * Los dos métodos que abren el paso de cobro simulado antes de registrar.
 *
 * `efectivo` y `cuenta_corriente` no están acá y no es un olvido: el efectivo
 * ya está sobre el mostrador y la cuenta corriente es justamente la promesa de
 * cobrar después. Meterles un modal sería agregar dos clics a la venta más
 * común del día para confirmar algo que nadie dudaba.
 */
const METODOS_CON_COBRO_SIMULADO = ["tarjeta", "transferencia"] as const;

type MetodoConCobroSimulado = (typeof METODOS_CON_COBRO_SIMULADO)[number];

const requiereCobroSimulado = (
  metodo: PaymentMethodCode,
): metodo is MetodoConCobroSimulado =>
  (METODOS_CON_COBRO_SIMULADO as readonly PaymentMethodCode[]).includes(metodo);

/**
 * Registrar una venta: método de pago + cliente opcional + N líneas de
 * producto/cantidad/precio.
 *
 * Cada línea, el descuento de stock y el cobro pasan por
 * `erp.register_sale()` (108) como parte de una sola transacción — el
 * formulario junta todo antes de mandar un único `registerSale()`, mismo
 * criterio que `PurchaseModal` con `erp.register_purchase()`.
 *
 * **Vive en la pantalla, no en un modal, y eso es el punto.** Antes era un
 * `SaleModal` que había que abrir: con el cliente esperando del otro lado del
 * mostrador, ese clic de apertura y el de cierre se pagan en cada venta del
 * día. Ahora el formulario está siempre armado y el historial queda al lado.
 *
 * El selector de cliente usa `useWatch({ control, name })` y no `watch()`:
 * `watch()` dispara `react-hooks/incompatible-library` con el React Compiler
 * del proyecto — regla repetida en todos los formularios de PetCloud.
 */
export function SaleForm({
  metodosPago,
  clientes,
  productos,
  codigosBarra,
}: {
  metodosPago: PaymentMethod[];
  clientes: Customer[];
  productos: Product[];
  codigosBarra: Barcode[];
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: VALORES_INICIALES,
  });

  const { fields, append, update, remove } = useFieldArray({
    control,
    name: "lineas",
  });

  const metodoPago = useWatch({ control, name: "metodoPago" });
  const lineas = useWatch({ control, name: "lineas" });

  /**
   * `setFocus("metodoPago")` (react-hook-form) no sirve más para volver al
   * escáner: la entrada de escaneo no es un campo registrado del form, es un
   * `<input>` aparte.
   *
   * El foco NO se pide leyendo `scanInputRef.current` desde `onSubmit` /
   * `confirmarVenta`: esas funciones llegan a `handleSubmit(onSubmit)`, que
   * el compilador de React evalúa en el render, y leer un ref ahí dispara
   * `react-hooks/refs` ("Passing a ref to a function may read its value
   * during render") — es justo lo que el comentario original de `setFocus`
   * ya anticipaba. La señal (`señalFoco`) desacopla "pedir foco" de "leer el
   * ref": el `useEffect` de abajo es el único lugar que toca
   * `scanInputRef.current`, y un efecto nunca corre durante el render.
   */
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [señalFoco, setSeñalFoco] = useState(0);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [señalFoco]);

  function enfocarEscaner() {
    setSeñalFoco((n) => n + 1);
  }

  const indiceProductos = useMemo(
    () => buildProductIndex(productos, codigosBarra),
    [productos, codigosBarra],
  );

  /**
   * Un código resuelto —por escaneo o por el fallback tipeado— entra al
   * carrito por el mismo camino que "Agregar línea": si el producto ya tiene
   * una fila, se incrementa; si no, se agrega una nueva con el precio de
   * lista (erp-sales spec, "un código escaneado agrega o incrementa una
   * línea del carrito").
   */
  function agregarPorCodigo(productId: string) {
    const indiceExistente = (lineas ?? []).findIndex(
      (linea) => linea.productoId === productId,
    );

    if (indiceExistente >= 0) {
      const actual = lineas?.[indiceExistente];
      update(indiceExistente, {
        productoId: productId,
        cantidad: (actual?.cantidad ?? 0) + 1,
        precioUnitario: actual?.precioUnitario ?? 0,
      });
    } else {
      append({
        productoId: productId,
        cantidad: 1,
        precioUnitario: precioDeProducto(productos, productId) ?? 0,
      });
    }

    enfocarEscaner();
  }

  /**
   * Un scan que llega mientras el cursor está en cantidad o precio no
   * intenta enviar el formulario: el botón de "Registrar venta" queda como
   * el único camino a `onSubmit`. El peor caso es
   * una cantidad visiblemente mal que se retipea, nunca una venta registrada
   * por accidente.
   */
  function evitarEnviarConEnter(evento: KeyboardEvent) {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    enfocarEscaner();
  }

  const metodoSeleccionado = metodosPago.find((m) => m.code === metodoPago);
  const requiereCliente = metodoSeleccionado?.requiresCustomer ?? false;

  const totalPesos = calcularTotalPesos(lineas ?? []);

  /**
   * Las líneas que piden más stock del que hay, para frenarlas acá y no en la
   * transacción.
   *
   * El trigger `erp_movements_check_stock` (102) sigue siendo la defensa real
   * y no se toca — pero corre adentro de `erp.register_sale()`, así que su
   * RAISE no rechaza la línea culpable sino la venta entera. Marcarlas antes
   * del submit es la diferencia entre corregir una cantidad y volver a armar
   * seis líneas con el cliente enfrente.
   *
   * Suma por producto y no por línea: ver `faltantesDeStock()`.
   */
  const faltantes = faltantesDeStock(lineas ?? [], productos);
  const hayFaltantes = faltantes.size > 0;

  /**
   * Con cuánto paga el cliente, para calcular el vuelto mientras se tipea.
   *
   * **Vive en `useState` y no en el formulario, y eso es la garantía de que no
   * se guarda.** No está registrado en react-hook-form ni en `saleSchema`, así
   * que no puede viajar en el payload de `registerSale()` ni sumar un error
   * que deshabilite el envío: la venta se registra igual con el campo vacío o
   * con menos plata de la que sale. Es una calculadora de mostrador.
   *
   * Se guarda como texto —lo que devuelve el input— y no como número: `""` y
   * "todavía no escribió nada" son el mismo estado, y con `valueAsNumber`
   * serían `NaN` y habría que distinguirlos a mano.
   *
   * Se limpia al cambiar de método de pago y después de cada venta. Si no,
   * vuelve a aparecer con la plata del cliente anterior la próxima vez que
   * alguien elija efectivo.
   */
  const [montoRecibido, setMontoRecibido] = useState("");

  const vuelto = calcularVuelto(totalPesos, montoRecibido);
  const textoVuelto = textoDeVuelto(vuelto);

  /**
   * La venta que quedó esperando a que termine el cobro simulado.
   *
   * Guardar los valores acá, y no volver a leerlos del formulario cuando el
   * modal confirma, es lo que hace que el cobro registre exactamente lo que se
   * vio al enviar: entre medio pasan un par de segundos en los que alguien
   * puede tocar una cantidad. `null` significa que no hay ningún cobro en
   * curso, y por lo tanto que el modal no está en pantalla.
   */
  const [ventaPendiente, setVentaPendiente] = useState<SaleValues | null>(null);

  const sinProductos = productos.length === 0;

  /**
   * Autocompletar el precio de lista al elegir el producto.
   *
   * **Completa el campo; no lo bloquea.** El precio queda editable a propósito:
   * un descuento, una promoción o un precio arreglado a mano con el cliente
   * son parte del mostrador, y una veterinaria que no puede cobrar distinto de
   * la lista termina registrando la venta mal para poder cobrarla bien. Stock
   * es la fuente del precio sugerido, no una autoridad sobre lo que se cobra.
   *
   * `shouldValidate` para que el error de formato —si el producto trae un
   * precio imposible— aparezca al instante y no recién al enviar;
   * `shouldDirty` para que el total del pie se recalcule en el mismo momento,
   * que es lo que la persona está mirando cuando elige el producto.
   */
  function autocompletarPrecio(indice: number, productoId: string) {
    const precio = precioDeProducto(productos, productoId);

    // `null` es "no escribas nada": producto que no está en la lista, o
    // catálogo vacío. Lo que había en el campo queda como estaba.
    if (precio === null) return;

    setValue(`lineas.${indice}.precioUnitario`, precio, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  /**
   * Registrar la venta de verdad, el único lugar del formulario que lo hace.
   *
   * Devuelve si quedó guardada, porque el modal de cobro simulado necesita
   * saberlo para no cerrarse anunciando un éxito que no ocurrió.
   */
  async function confirmarVenta(valores: SaleValues): Promise<boolean> {
    const resultado = await registerSale(valores);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return false;
    }

    toast.success("Venta registrada. El stock y el cobro ya se actualizaron.");

    // Cerrar el cobro simulado, si lo hubo, antes de resetear: mientras
    // `ventaPendiente` no sea `null` el modal sigue en pantalla.
    setVentaPendiente(null);

    // Volver a cero y quedar listo para la siguiente es toda la razón de haber
    // sacado el modal: sin esto, la segunda venta obliga a limpiar a mano lo
    // que quedó de la primera y el mostrador se frena igual que antes.
    reset(VALORES_INICIALES);
    setMontoRecibido("");

    // Y el foco vuelve a la entrada de escaneo para que la próxima venta
    // arranque con el próximo scan, sin ir a buscar el mouse — mismo lugar al
    // que ya vuelve cada alta de línea (`agregarPorCodigo()`).
    enfocarEscaner();

    return true;
  }

  /**
   * Enviar no siempre es registrar.
   *
   * Con tarjeta o transferencia, el envío abre el cobro simulado y **no
   * escribe nada**: `registerSale()` lo dispara el modal recién cuando el
   * cobro se da por hecho. Si quien vende lo cierra antes, no quedó ninguna
   * venta a medio registrar — y el formulario conserva lo cargado, así que
   * cancelar cuesta un clic, no volver a armar la venta.
   */
  async function onSubmit(valores: SaleValues) {
    if (requiereCobroSimulado(valores.metodoPago)) {
      setVentaPendiente(valores);
      return;
    }

    await confirmarVenta(valores);
  }

  return (
    <>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <h2 className="text-foreground text-lg font-semibold">
              Nueva venta
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Cada línea descuenta stock. El método de pago decide si cobra al
              cajón o a la cuenta corriente del cliente — nunca a los dos.
            </p>
          </div>

          {/*
            Carrito a la izquierda, pago a la derecha. Es UN solo `<form>` con una sola grilla adentro y no dos
            columnas armadas desde `SalesView`: partir esto en dos componentes
            —uno por columna— obligaría a compartir el estado de
            react-hook-form entre ellos (`FormProvider`) para ganar nada, y
            `requiresCustomer`/el ruteo de pago siguen viviendo exactamente
            donde estaban, sin duplicarse ni moverse. Reventar a una columna en pantallas chicas es el
            mismo `lg:` que ya usaba `sales-view.tsx` para el historial.
          */}
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-3">
              {/*
                La entrada de escaneo va arriba del listado de líneas —el
                mostrador escanea primero y recién después mira el carrito—
                y no dentro del flujo de envío: su Enter resuelve un
                producto, nunca envía la venta.
              */}
              <ScanInput
                ref={scanInputRef}
                index={indiceProductos}
                productos={productos}
                onResolve={agregarPorCodigo}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Líneas</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => {
                      append({
                        productoId: "",
                        cantidad: 1,
                        precioUnitario: 0,
                      });
                      enfocarEscaner();
                    }}
                  >
                    <Plus className="size-4" />
                    Agregar línea
                  </Button>
                </div>

                {errors.lineas?.message ? (
                  <p className="text-danger text-sm">{errors.lineas.message}</p>
                ) : null}

                {fields.map((field, index) => {
                  // El campo se registra en una variable para poder envolver
                  // su `onChange`: react-hook-form tiene que enterarse del
                  // cambio igual que siempre —por eso se lo llama primero— y
                  // recién después se autocompleta el precio. Invertir el
                  // orden escribiría el precio sobre un `productoId` que la
                  // librería todavía no registró.
                  const campoProducto = register(
                    `lineas.${index}.productoId` as const,
                  );

                  const productoId = lineas?.[index]?.productoId ?? "";
                  const productoElegido = buscarProducto(productos, productoId);

                  const falta = faltantes.get(productoId);

                  return (
                    <div
                      key={field.id}
                      className={cn(
                        "grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]",
                        // El aviso de stock es gris y el que impide vender es
                        // rojo, y además pinta la línea entera: con seis
                        // líneas cargadas hay que poder encontrar la culpable
                        // sin leerlas una por una.
                        falta && "border-danger/40 bg-danger-soft",
                      )}
                    >
                      <Field
                        label="Producto"
                        htmlFor={`lineas.${index}.productoId`}
                        // El faltante viaja por `error` y no por `hint`, que
                        // es lo que lo separa del aviso informativo: `Field`
                        // pinta el error en rojo y además tapa el hint, así
                        // que "Stock bajo: quedan 5" no queda discutiendo con
                        // "pedís 8 y quedan 5" debajo del mismo campo.
                        //
                        // El error de zod gana igual: si no hay producto
                        // elegido no hay faltante posible, y "Elegí el
                        // producto" es lo primero que hay que hacer.
                        error={
                          errors.lineas?.[index]?.productoId?.message ??
                          (falta ? textoDeFalta(falta) : undefined)
                        }
                        // El stock del producto elegido, a la vista antes de
                        // comprometer la línea. Con el catálogo vacío el
                        // aviso explica por qué el selector no ofrece nada,
                        // en vez de dejar un desplegable mudo.
                        hint={
                          sinProductos
                            ? "No hay productos en el catálogo. Cargá uno en Stock para poder vender."
                            : (textoDeStock(productoElegido) ?? undefined)
                        }
                      >
                        <Select
                          id={`lineas.${index}.productoId`}
                          {...campoProducto}
                          disabled={sinProductos}
                          onChange={(evento) => {
                            void campoProducto.onChange(evento);
                            autocompletarPrecio(index, evento.target.value);
                          }}
                        >
                          <option value="">
                            {sinProductos
                              ? "No hay productos cargados"
                              : "Elegí un producto"}
                          </option>
                          {productos.map((producto) => (
                            <option key={producto.id} value={producto.id}>
                              {producto.nombre}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field
                        label="Cantidad"
                        htmlFor={`lineas.${index}.cantidad`}
                        error={errors.lineas?.[index]?.cantidad?.message}
                      >
                        <Input
                          id={`lineas.${index}.cantidad`}
                          type="number"
                          step="0.001"
                          min="0"
                          onKeyDown={evitarEnviarConEnter}
                          {...register(`lineas.${index}.cantidad` as const, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>

                      {/* Se autocompleta desde Stock al elegir el producto, y
                        queda editable: el precio de lista es una sugerencia,
                        no una regla — ver `autocompletarPrecio()`. */}
                      <Field
                        label="Precio unitario"
                        htmlFor={`lineas.${index}.precioUnitario`}
                        error={errors.lineas?.[index]?.precioUnitario?.message}
                      >
                        <Input
                          id={`lineas.${index}.precioUnitario`}
                          type="number"
                          step="0.01"
                          min="0"
                          onKeyDown={evitarEnviarConEnter}
                          {...register(
                            `lineas.${index}.precioUnitario` as const,
                            { valueAsNumber: true },
                          )}
                        />
                      </Field>

                      <div className="flex items-end">
                        {/* Borrar la línea se lleva puesto el botón que tenía
                          el foco, que si no queda en el `<body>`: el scan
                          siguiente no lo escribiría nadie. */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            remove(index);
                            enfocarEscaner();
                          }}
                          aria-label="Quitar línea"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="border-t pt-3 text-sm font-medium">
                Total: {pesos.format(totalPesos)}
              </p>
            </div>

            <div className="space-y-4">
              {/*
              El método de pago se elige con los cuatro botones a la vista, no
              con un `<select>`: un desplegable son dos clics —abrir y
              elegir— para una decisión que se toma en cada venta.

              Son **radios, no casillas**, y la diferencia no es de estilo.
              Una venta de `erp.sales` guarda un único `payment_method`
              (migración 108); el pago partido entre dos métodos no existe en
              el esquema. Unas casillas invitarían a marcar dos y prometerían
              algo que la base no puede guardar, así que la semántica del
              control tiene que decir la verdad del modelo.

              Los `<input type="radio">` nativos —escondidos a la vista, con
              la etiqueta haciendo de superficie— traen gratis la navegación
              con flechas, el anuncio del grupo en lectores de pantalla y el
              funcionamiento con `register("metodoPago")` sin ningún
              adaptador.

              El estado elegido copia el lenguaje visual de `SelectableCard`
              pero en compacto, y no reusa ese componente a propósito:
              `SelectableCard` está hecho para una decisión grande, con
              descripción, y usa `aria-pressed`, que es semántica de
              interruptor y acá sería mentira.

              La columna de pago es más angosta que antes (`3fr_2fr` en vez
              del ancho completo): dos columnas de método de pago en vez de
              cuatro evita que la etiqueta se recorte.
            */}
              <fieldset>
                <legend className="text-foreground mb-2 text-sm font-medium">
                  Método de pago
                  <span className="text-danger"> *</span>
                </legend>

                <div className="grid grid-cols-2 gap-2">
                  {metodosPago.map((metodo) => {
                    const Icono = ICONO_METODO[metodo.code] ?? Wallet;
                    const elegido = metodoPago === metodo.code;

                    // Envolver el `onChange` —mismo patrón que el selector de
                    // producto— en vez de sincronizar con un `useEffect`:
                    // cambiar de método es el único momento en que la plata
                    // del mostrador deja de tener sentido.
                    const campoMetodo = register("metodoPago");

                    return (
                      <label
                        key={metodo.code}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                          // El anillo de foco se dibuja acá porque el input
                          // real está oculto: sin esto, quien navega con el
                          // teclado no ve dónde está parado.
                          "has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2",
                          elegido
                            ? "border-brand-600 bg-brand-50 text-brand-700 ring-brand-500/20 ring-2"
                            : "border-border bg-card text-foreground hover:border-brand-300",
                        )}
                      >
                        <input
                          type="radio"
                          value={metodo.code}
                          className="sr-only"
                          {...campoMetodo}
                          onChange={(evento) => {
                            void campoMetodo.onChange(evento);
                            setMontoRecibido("");
                          }}
                        />
                        <Icono className="size-4 shrink-0" />
                        {/* Sin `truncate`: recortar "Efectivo" a "E" no es
                          degradar sino romper. Un método de pago mal leído
                          es una venta mal cobrada, así que el texto envuelve
                          y la fila crece. */}
                        <span className="leading-tight text-balance">
                          {PAYMENT_METHOD_LABELS[metodo.code] ?? metodo.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {errors.metodoPago?.message ? (
                  <p className="text-danger mt-1.5 text-sm">
                    {errors.metodoPago.message}
                  </p>
                ) : null}
              </fieldset>

              {/*
                El vuelto va pegado al método de pago porque nace de él: la
                pregunta aparece en el mismo lugar donde acaban de tocar
                "Efectivo". Se monta y se desmonta con el método —no se
                esconde con una clase— así que el campo no existe para
                tarjeta, transferencia ni cuenta corriente.

                Nada de esto bloquea el envío: el input no está registrado en
                react-hook-form, el aviso es un `Alert` y no un error de
                campo, y "Registrar venta" solo mira `isSubmitting`.
              */}
              {metodoPago === "efectivo" ? (
                <div className="space-y-2">
                  <Field
                    label="¿Con cuánto paga?"
                    htmlFor="montoRecibido"
                    hint="Solo para calcular el vuelto: no se guarda con la venta."
                  >
                    <Input
                      id="montoRecibido"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={montoRecibido}
                      onChange={(evento) =>
                        setMontoRecibido(evento.target.value)
                      }
                      onKeyDown={evitarEnviarConEnter}
                    />
                  </Field>

                  {textoVuelto ? (
                    <Alert
                      variant={
                        vuelto.estado === "falta" ? "warning" : "success"
                      }
                      aria-live="polite"
                    >
                      {textoVuelto}
                    </Alert>
                  ) : null}
                </div>
              ) : null}

              <Field
                label="Cliente"
                htmlFor="clienteId"
                required={requiereCliente}
                error={errors.clienteId?.message}
                hint={
                  requiereCliente
                    ? "La cuenta corriente necesita un cliente identificado."
                    : "Opcional. Sin elegir uno queda como consumidor final."
                }
              >
                <Select id="clienteId" {...register("clienteId")}>
                  <option value="">Consumidor final</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.razonSocial}
                    </option>
                  ))}
                </Select>
              </Field>

              {/*
                Un botón apagado sin explicación al lado es un callejón sin
                salida, y acá el motivo vive en la OTRA columna: la línea
                marcada está a la izquierda y el botón a la derecha. Este
                aviso es el puente — dice por qué no se puede y hacia dónde
                mirar.

                Es lo contrario del aviso de vuelto, que por decisión
                explícita nunca bloquea: aquel es `warning` e informativo,
                este es `danger` y describe un envío que no va a ocurrir.
              */}
              {hayFaltantes ? (
                <Alert variant="danger" aria-live="polite">
                  Hay líneas que piden más stock del que hay. Están marcadas en
                  rojo: corregilas para poder registrar la venta.
                </Alert>
              ) : null}

              {/* `hayFaltantes` se suma a `isSubmitting`, no lo reemplaza: son
                dos motivos distintos para no volver a enviar. */}
              <Button
                type="submit"
                disabled={isSubmitting || hayFaltantes}
                className="w-full"
              >
                {isSubmitting ? "Registrando…" : "Registrar venta"}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/*
        El cobro simulado se monta con el intento y se desmonta al cerrarlo,
        en vez de quedar montado con `open={false}`: así cada venta empieza su
        simulación de cero, sin arrastrar el "aprobado" de la anterior.

        Va fuera del `<form>` a propósito. `Modal` dibuja en un portal, así que
        el botón de confirmar no queda asociado al formulario y no puede
        enviarlo por accidente; tenerlo escrito acá afuera lo deja claro al
        leer, sin depender de conocer el portal.

        `Modal` no soporta apilarse —cada instancia registra su propio
        `keydown` y al limpiar borra `body.style.overflow` sin condición—, y
        este formulario no abre ningún otro: es el único modal de la pantalla
        mientras haya un cobro en curso.
      */}
      {ventaPendiente && requiereCobroSimulado(ventaPendiente.metodoPago) ? (
        <PaymentSimulationModal
          metodo={ventaPendiente.metodoPago}
          totalPesos={calcularTotalPesos(ventaPendiente.lineas)}
          onCancelar={() => setVentaPendiente(null)}
          onConfirmar={() => confirmarVenta(ventaPendiente)}
        />
      ) : null}
    </>
  );
}
