"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  addBarcode,
  listProductBarcodesAction,
  removeBarcode,
} from "@/features/erp/actions/barcode-actions";
import { lookupCatalogAction } from "@/features/erp/actions/catalog-actions";
import {
  createProduct,
  updateProduct,
} from "@/features/erp/actions/stock-actions";
import type { ProductBarcodeRow } from "@/features/erp/data/barcodes";
import {
  CATALOG_PRODUCT_TYPES,
  CATALOG_PRODUCT_TYPE_LABELS,
  CATALOG_SPECIES,
  CATALOG_SPECIES_LABELS,
  type CatalogProductType,
} from "@/features/erp/lib/catalog-categories";
import { normalizeGtin } from "@/features/erp/lib/gtin";
import {
  ESTADO_INICIAL,
  feedKey,
  type ScanBufferState,
} from "@/features/erp/lib/scan-buffer";
import {
  PRODUCT_UNITS,
  precioDebajoDelCosto,
  productSchema,
  type ProductValues,
} from "@/features/erp/schemas/stock-schemas";
import { PRODUCT_UNIT_LABELS, type Product } from "@/types/erp";

/**
 * Estado de la búsqueda en el catálogo compartido del campo "Código de
 * barras" (migración 116, `erp-catalogo-compartido` fase 4).
 *
 * `idle`: todavía no se escribió/escaneó nada, o se borró el campo.
 * `no-gtin`: el código no normaliza a GTIN — no hay lookup posible, se guarda
 * como código local nomás.
 * `hit` / `miss`: sí normaliza y la consulta ya volvió.
 */
type EstadoCatalogo = "idle" | "no-gtin" | "hit" | "miss";

/**
 * Alta y edición de un producto, en el mismo formulario.
 *
 * Son el mismo conjunto de campos y las mismas validaciones: separarlos en dos
 * componentes obligaría a mantener sincronizadas dos copias del formulario, y
 * el día que se agregue un campo alguien se va a olvidar de una.
 *
 * `producto` presente ⇒ edición. Ausente ⇒ alta.
 */
export function ProductModal({
  open,
  onClose,
  producto,
}: {
  open: boolean;
  onClose: () => void;
  producto?: Product;
}) {
  const esEdicion = Boolean(producto);
  // Ids únicos por instancia: con ids fijos ("costo", "precio") cualquier
  // otro elemento de la página con el mismo id rompía la asociación del
  // <label> y el lector de pantalla anunciaba el placeholder.
  const uid = useId();

  const [estadoCatalogo, setEstadoCatalogo] = useState<EstadoCatalogo>("idle");
  const bufferRef = useRef<ScanBufferState>(ESTADO_INICIAL);
  // Valores que esperan la confirmación de "precio menor que el costo".
  const [pendiente, setPendiente] = useState<ProductValues | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: producto
      ? {
          nombre: producto.nombre,
          sku: producto.sku ?? undefined,
          categoria: producto.categoria ?? undefined,
          unidad: producto.unidad,
          costo: producto.costo,
          precio: producto.precio,
          stockMinimo: producto.stockMinimo,
          presentacion: producto.presentacion ?? undefined,
          laboratorio: producto.laboratorio ?? undefined,
        }
      : // Costo y precio arrancan vacíos a propósito: un 0 precargado se
        // guardaba sin que nadie lo hubiera escrito. Vacío, `valueAsNumber`
        // da NaN y el schema lo rechaza con "Ingresá el costo".
        { unidad: "unidad", stockMinimo: 0 },
  });

  /**
   * Busca el código en el catálogo compartido y, si hay una entrada,
   * precompleta nombre/categoría/presentación/laboratorio — solo en los
   * campos que la persona todavía no tocó (`dirtyFields`), para no pisar lo
   * que ya escribió (spec `erp-catalog-autofill`, "Prefilled fields remain
   * freely editable").
   *
   * Un código que no normaliza a GTIN corta acá mismo, sin consultar nada: no
   * es una identidad del catálogo compartido.
   */
  async function buscarEnCatalogo(codigoCrudo: string) {
    const codigo = codigoCrudo.trim();
    if (!codigo) {
      setEstadoCatalogo("idle");
      return;
    }

    if (!normalizeGtin(codigo)) {
      setEstadoCatalogo("no-gtin");
      return;
    }

    const entrada = await lookupCatalogAction(codigo);

    if (!entrada) {
      setEstadoCatalogo("miss");
      return;
    }

    setEstadoCatalogo("hit");

    if (!dirtyFields.nombre) setValue("nombre", entrada.name);
    if (!dirtyFields.categoria) {
      setValue(
        "categoria",
        CATALOG_PRODUCT_TYPE_LABELS[
          entrada.productType as CatalogProductType
        ] ?? entrada.productType,
      );
    }
    if (!dirtyFields.presentacion && entrada.presentation) {
      setValue("presentacion", entrada.presentation);
    }
    if (!dirtyFields.laboratorio && entrada.laboratory) {
      setValue("laboratorio", entrada.laboratory);
    }
  }

  function manejarKeyDownCodigo(evento: KeyboardEvent<HTMLInputElement>) {
    const { state, scan } = feedKey(bufferRef.current, {
      key: evento.key,
      at: evento.timeStamp,
    });
    bufferRef.current = state;

    // Igual que `scan-input.tsx`: el Enter de una ráfaga de lector no tiene
    // que enviar el formulario, solo cerrar el escaneo y disparar la
    // búsqueda.
    if (evento.key === "Enter") {
      evento.preventDefault();
      if (scan) {
        setValue("codigoBarras", scan);
        void buscarEnCatalogo(scan);
      }
    }
  }

  async function onSubmit(valores: ProductValues) {
    // El tipo de producto es obligatorio solo cuando el código no está en el
    // catálogo compartido (spec: "An unknown GTIN is added to the catalogue
    // when the product is saved"). El schema no puede expresar esa condición
    // porque depende de la búsqueda async — se exige acá, mismo criterio que
    // el SKU duplicado que informa el servidor.
    if (!esEdicion && estadoCatalogo === "miss" && !valores.catalogoTipo) {
      setError("catalogoTipo", { message: "Elegí un tipo de producto" });
      return;
    }

    // Vender por debajo del costo es válido (liquidación, promoción), pero
    // casi siempre es un error de tipeo: se pide confirmación en vez de
    // bloquear.
    if (precioDebajoDelCosto(valores)) {
      setPendiente(valores);
      return;
    }

    await guardar(valores);
  }

  async function confirmarPrecioBajo() {
    if (!pendiente) return;

    setConfirmando(true);
    await guardar(pendiente);
    setConfirmando(false);
    setPendiente(null);
  }

  async function guardar(valores: ProductValues) {
    if (producto) {
      const resultado = await updateProduct(producto.id, valores);

      if (!resultado.ok) {
        if (resultado.campo === "sku") {
          setError("sku", { message: resultado.error });
          return;
        }

        toast.error(resultado.error);
        return;
      }

      toast.success("Producto actualizado");
      reset();
      onClose();
      return;
    }

    const resultado = await createProduct(valores);

    if (!resultado.ok) {
      // El SKU duplicado vuelve con `campo`: se muestra debajo del input que
      // la persona escribió, no como un toast que no dice dónde está el
      // problema.
      if (resultado.campo === "sku") {
        setError("sku", { message: resultado.error });
        return;
      }

      toast.error(resultado.error);
      return;
    }

    if (resultado.catalogo === "failed") {
      // No bloqueante: el producto ya se guardó. Design.md D8 — una falla en
      // el aporte al catálogo compartido nunca frena el alta.
      toast.warning(
        "El producto se creó, pero no pudimos sumarlo al catálogo compartido.",
      );
    }

    toast.success("Producto creado");
    reset();
    onClose();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={esEdicion ? "Editar producto" : "Nuevo producto"}
        description={
          esEdicion
            ? undefined
            : "El stock arranca en cero: se carga con un movimiento de compra o de ajuste."
        }
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-producto" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <form
          id="form-producto"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          {/* Solo en alta: en edición el producto ya existe y sus códigos se
            administran en `BarcodesSection`, más abajo. Escanear o tipear
            acá dispara la búsqueda en el catálogo compartido
            (`erp-catalogo-compartido` fase 4). */}
          {!producto ? (
            <Field
              label="Código de barras"
              htmlFor={`${uid}-codigoBarras`}
              error={errors.codigoBarras?.message}
              hint="Escaneá o tipeá el código. Si está en el catálogo compartido, completamos el resto."
            >
              <Input
                id={`${uid}-codigoBarras`}
                autoComplete="off"
                {...register("codigoBarras", {
                  onBlur: (evento) => {
                    void buscarEnCatalogo(evento.target.value);
                  },
                })}
                onKeyDown={manejarKeyDownCodigo}
              />
              {estadoCatalogo === "hit" ? (
                <Alert variant="success" className="mt-2">
                  Encontrado en el catálogo compartido.
                </Alert>
              ) : null}
              {estadoCatalogo === "miss" ? (
                <Alert variant="info" className="mt-2">
                  No está en el catálogo: al guardar se agrega para todas las
                  veterinarias.
                </Alert>
              ) : null}
            </Field>
          ) : null}

          <Field
            label="Nombre"
            htmlFor={`${uid}-nombre`}
            required
            error={errors.nombre?.message}
          >
            <Input id={`${uid}-nombre`} {...register("nombre")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Código interno"
              htmlFor={`${uid}-sku`}
              error={errors.sku?.message}
              hint="Opcional"
            >
              <Input id={`${uid}-sku`} {...register("sku")} />
            </Field>

            <Field
              label="Categoría"
              htmlFor={`${uid}-categoria`}
              error={errors.categoria?.message}
              hint="Opcional"
            >
              <Input id={`${uid}-categoria`} {...register("categoria")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Presentación"
              htmlFor={`${uid}-presentacion`}
              error={errors.presentacion?.message}
              hint="Opcional"
            >
              <Input id={`${uid}-presentacion`} {...register("presentacion")} />
            </Field>

            <Field
              label="Laboratorio"
              htmlFor={`${uid}-laboratorio`}
              error={errors.laboratorio?.message}
              hint="Opcional"
            >
              <Input id={`${uid}-laboratorio`} {...register("laboratorio")} />
            </Field>
          </div>

          {/* Solo en alta con un código que no está en el catálogo compartido:
            el aporte necesita al menos el tipo de producto (spec:
            "An unknown GTIN is added to the catalogue when the product is
            saved"). */}
          {!producto && estadoCatalogo === "miss" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tipo de producto"
                htmlFor={`${uid}-catalogoTipo`}
                required
                error={errors.catalogoTipo?.message}
                hint="Para sumar este código al catálogo compartido"
              >
                <Select
                  id={`${uid}-catalogoTipo`}
                  {...register("catalogoTipo")}
                >
                  <option value="">Elegí un tipo</option>
                  {CATALOG_PRODUCT_TYPES.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {CATALOG_PRODUCT_TYPE_LABELS[tipo]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Especie"
                htmlFor={`${uid}-catalogoEspecie`}
                error={errors.catalogoEspecie?.message}
                hint="Opcional"
              >
                <Select
                  id={`${uid}-catalogoEspecie`}
                  {...register("catalogoEspecie")}
                >
                  <option value="">Todas / no aplica</option>
                  {CATALOG_SPECIES.map((especie) => (
                    <option key={especie} value={especie}>
                      {CATALOG_SPECIES_LABELS[especie]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Unidad"
              htmlFor={`${uid}-unidad`}
              required
              error={errors.unidad?.message}
            >
              <Select id={`${uid}-unidad`} {...register("unidad")}>
                {PRODUCT_UNITS.map((unidad) => (
                  <option key={unidad} value={unidad}>
                    {PRODUCT_UNIT_LABELS[unidad]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Stock mínimo"
              htmlFor={`${uid}-stockMinimo`}
              error={errors.stockMinimo?.message}
              hint="Debajo de este número avisamos que hay que reponer"
            >
              <Input
                id={`${uid}-stockMinimo`}
                type="number"
                step="0.001"
                min="0"
                {...register("stockMinimo", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Costo"
              htmlFor={`${uid}-costo`}
              required
              error={errors.costo?.message}
            >
              <Input
                id={`${uid}-costo`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...register("costo", { valueAsNumber: true })}
              />
            </Field>

            <Field
              label="Precio de venta"
              htmlFor={`${uid}-precio`}
              required
              error={errors.precio?.message}
            >
              <Input
                id={`${uid}-precio`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...register("precio", { valueAsNumber: true })}
              />
            </Field>
          </div>

          {/* Solo en edición: un código de barras necesita un producto ya
            existente al que referenciar (FK compuesta, migración 113). En
            alta se guarda primero el producto y se agregan códigos después,
            volviendo a abrir esta misma modal. */}
          {producto ? <BarcodesSection productId={producto.id} /> : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={pendiente !== null}
        onClose={() => setPendiente(null)}
        onConfirm={confirmarPrecioBajo}
        title="Precio menor que el costo"
        description="El precio de venta es menor que el costo. ¿Guardar igual?"
        confirmLabel="Guardar igual"
        loading={confirmando}
        loadingLabel="Guardando…"
        variant="primary"
      />
    </>
  );
}

/**
 * Alta y baja de códigos de barra de un producto (migración 113).
 *
 * No hay edición: un código se reemplaza por baja + alta: la tabla ni siquiera tiene política de `UPDATE`. Carga sus propios datos
 * en vez de recibirlos por prop: es la única parte de esta modal que
 * necesita una lectura server-side, y traerla desde `StockView` para un
 * producto que todavía no se sabe cuál es (alta) sería un viaje al pedo.
 */
function BarcodesSection({ productId }: { productId: string }) {
  const [codigos, setCodigos] = useState<ProductBarcodeRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;

    // Sin `setCargando(true)` acá: el estado inicial ya es `true`, y
    // `ProductModal` remonta con `key={producto.id}` en `StockView` — este
    // efecto corre una sola vez por producto, nunca con uno ya cargado.
    listProductBarcodesAction(productId).then((filas) => {
      if (vigente) {
        setCodigos(filas);
        setCargando(false);
      }
    });

    return () => {
      vigente = false;
    };
  }, [productId]);

  async function agregar() {
    const codigo = nuevoCodigo.trim();
    if (!codigo) return;

    setGuardando(true);
    setError(null);
    const resultado = await addBarcode({ productoId: productId, codigo });
    setGuardando(false);

    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }

    setNuevoCodigo("");
    setCodigos(await listProductBarcodesAction(productId));
  }

  async function quitar(id: string) {
    const resultado = await removeBarcode({ id });

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    setCodigos((actual) => actual.filter((fila) => fila.id !== id));
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <span className="text-sm font-medium">Códigos de barras</span>

      {cargando ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : codigos.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no tiene ningún código registrado.
        </p>
      ) : (
        <ul className="space-y-1">
          {codigos.map((fila) => (
            <li
              key={fila.id}
              className="flex items-center justify-between rounded border px-2 py-1 text-sm"
            >
              <span>{fila.code}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quitar(fila.id)}
                aria-label={`Quitar código ${fila.code}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={nuevoCodigo}
          onChange={(evento) => {
            setNuevoCodigo(evento.target.value);
            setError(null);
          }}
          placeholder="Nuevo código"
          aria-invalid={Boolean(error)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={guardando || !nuevoCodigo.trim()}
          onClick={agregar}
        >
          Agregar
        </Button>
      </div>
      {/* Error inline y no un toast: el duplicado se explica junto al campo
          que se acaba de escribir (task 2.4.1). */}
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
