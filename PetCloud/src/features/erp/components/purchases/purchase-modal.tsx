"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { registerPurchase } from "@/features/erp/actions/purchase-actions";
import {
  purchaseSchema,
  type PurchaseValues,
} from "@/features/erp/schemas/purchase-schemas";
import type { Product, Supplier } from "@/types/erp";

/**
 * Registrar una compra: proveedor + N líneas de producto/cantidad/costo.
 *
 * Cada línea pasa por `erp.register_purchase()` (105) como parte de una sola
 * transacción — el formulario junta todas las líneas antes de mandar un único
 * `registerPurchase()`, en vez de una llamada por línea, exactamente para no
 * dejar la puerta abierta a que una falla de red deje media compra cargada.
 */
export function PurchaseModal({
  open,
  onClose,
  proveedores,
  productos,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: Supplier[];
  productos: Product[];
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      lineas: [{ productoId: "", cantidad: 1, costoUnitario: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lineas",
  });

  async function onSubmit(valores: PurchaseValues) {
    const resultado = await registerPurchase(valores);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Compra registrada. El stock ya se actualizó.");
    reset({ lineas: [{ productoId: "", cantidad: 1, costoUnitario: 0 }] });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva compra"
      description="Cada línea genera un movimiento de stock y actualiza el costo del producto."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-compra" disabled={isSubmitting}>
            {isSubmitting ? "Registrando…" : "Registrar compra"}
          </Button>
        </>
      }
    >
      <form
        id="form-compra"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Field
          label="Proveedor"
          htmlFor="proveedorId"
          required
          error={errors.proveedorId?.message}
        >
          <Select id="proveedorId" {...register("proveedorId")}>
            <option value="">Elegí un proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Nota"
          htmlFor="nota"
          error={errors.nota?.message}
          hint="Opcional"
        >
          <Input id="nota" {...register("nota")} />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Líneas</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ productoId: "", cantidad: 1, costoUnitario: 0 })
              }
            >
              <Plus className="size-4" />
              Agregar línea
            </Button>
          </div>

          {errors.lineas?.message ? (
            <p className="text-danger text-sm">{errors.lineas.message}</p>
          ) : null}

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <Field
                label="Producto"
                htmlFor={`lineas.${index}.productoId`}
                error={errors.lineas?.[index]?.productoId?.message}
              >
                <Select
                  id={`lineas.${index}.productoId`}
                  {...register(`lineas.${index}.productoId` as const)}
                >
                  <option value="">Elegí un producto</option>
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
                  {...register(`lineas.${index}.cantidad` as const, {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <Field
                label="Costo unitario"
                htmlFor={`lineas.${index}.costoUnitario`}
                error={errors.lineas?.[index]?.costoUnitario?.message}
              >
                <Input
                  id={`lineas.${index}.costoUnitario`}
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`lineas.${index}.costoUnitario` as const, {
                    valueAsNumber: true,
                  })}
                />
              </Field>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                  aria-label="Quitar línea"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
