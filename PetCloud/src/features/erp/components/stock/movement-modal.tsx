"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { registerMovement } from "@/features/erp/actions/stock-actions";
import {
  MOVEMENT_REASONS,
  MOVEMENT_REASON_META,
  pideDireccion,
} from "@/features/erp/lib/movement-reason";
import {
  stockMovementSchema,
  type StockMovementValues,
} from "@/features/erp/schemas/stock-schemas";
import type { Product } from "@/types/erp";

/**
 * Registrar un movimiento de stock a mano.
 *
 * Una sola pregunta: **por qué se mueve**. El tipo técnico (`kind`) y el signo
 * los deriva el servidor del motivo, con el catálogo de
 * `lib/movement-reason.ts`. Preguntar "qué pasó" con los seis tipos de la base
 * dejaba el motivo real —vencimiento, rotura, muestra regalada— como prosa en
 * la nota, y sobre prosa no se reporta.
 *
 * Compra y venta no están en la lista: tienen sus propios módulos. Cargarlas
 * desde acá producía un movimiento indistinguible de una compra real.
 *
 * El ajuste de inventario es la única excepción al signo derivado y por eso
 * muestra su propio selector: es el único motivo que puede ir para los dos
 * lados.
 */
export function MovementModal({
  open,
  onClose,
  productos,
  productoId,
}: {
  open: boolean;
  onClose: () => void;
  productos: Product[];
  /** Preseleccionado cuando se entra desde la fila de un producto. */
  productoId?: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StockMovementValues>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      productoId: productoId ?? "",
      motivo: "ajuste_inventario",
      ajusteResta: false,
    },
  });

  const motivo = useWatch({ control, name: "motivo" });
  const esAjuste = pideDireccion(motivo);

  async function onSubmit(valores: StockMovementValues) {
    const resultado = await registerMovement(valores);

    if (!resultado.ok) {
      // Stock insuficiente vuelve con `campo: "cantidad"`. Va debajo del
      // input que hay que corregir, no en un toast que se va solo antes de
      // que la persona termine de leer cuánto había disponible.
      if (resultado.campo === "cantidad") {
        setError("cantidad", { message: resultado.error });
        return;
      }

      toast.error(resultado.error);
      return;
    }

    toast.success("Movimiento registrado");
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar movimiento"
      description="Queda registrado con tu nombre y la fecha. No se puede editar: si te equivocás, lo anulás y el stock vuelve a como estaba."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-movimiento" disabled={isSubmitting}>
            {isSubmitting ? "Registrando…" : "Registrar"}
          </Button>
        </>
      }
    >
      <form
        id="form-movimiento"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Field
          label="Producto"
          htmlFor="productoId"
          required
          error={errors.productoId?.message}
        >
          <Select id="productoId" {...register("productoId")}>
            <option value="">Elegí el producto</option>
            {productos
              .filter((producto) => producto.activo)
              .map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.nombre} · {producto.stock} {producto.unidad}
                </option>
              ))}
          </Select>
        </Field>

        <Field
          label="Por qué se mueve el stock"
          htmlFor="motivo"
          required
          error={errors.motivo?.message}
          hint="Las compras y las ventas se cargan en sus propios módulos."
        >
          <Select id="motivo" {...register("motivo")}>
            {MOVEMENT_REASONS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {MOVEMENT_REASON_META[opcion].label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Cantidad"
            htmlFor="cantidad"
            required
            error={errors.cantidad?.message}
          >
            <Input
              id="cantidad"
              type="number"
              step="0.001"
              min="0"
              {...register("cantidad", { valueAsNumber: true })}
            />
          </Field>

          {esAjuste ? (
            <Field label="Dirección del ajuste" htmlFor="ajusteResta">
              {/* Un `<select>` siempre devuelve string. Sin `setValueAs`, Zod
                  recibiría "false" —que es un string con valor de verdad— y
                  todo ajuste sumaría, incluso el que resta. */}
              <Select
                id="ajusteResta"
                {...register("ajusteResta", {
                  setValueAs: (valor) => valor === "true" || valor === true,
                })}
              >
                <option value="false">Sumar al stock</option>
                <option value="true">Restar del stock</option>
              </Select>
            </Field>
          ) : (
            <Field
              label="Costo unitario"
              htmlFor="costoUnitario"
              error={errors.costoUnitario?.message}
              hint="Opcional. Queda guardado con este movimiento, aunque después cambie el costo del producto."
            >
              {/* `valueAsNumber` convierte el input vacío en NaN, y un campo
                  opcional con NaN falla la validación en vez de omitirse. */}
              <Input
                id="costoUnitario"
                type="number"
                step="0.01"
                min="0"
                {...register("costoUnitario", {
                  setValueAs: (valor) =>
                    valor === "" || valor === null || valor === undefined
                      ? undefined
                      : Number(valor),
                })}
              />
            </Field>
          )}
        </div>

        <Field
          label={esAjuste ? "Por qué se ajusta" : "Nota"}
          htmlFor="nota"
          required={esAjuste}
          error={errors.nota?.message}
          hint={
            esAjuste
              ? "Un ajuste sin explicación es un número que nadie va a poder justificar después."
              : "Opcional"
          }
        >
          <Textarea id="nota" rows={3} {...register("nota")} />
        </Field>
      </form>
    </Modal>
  );
}
