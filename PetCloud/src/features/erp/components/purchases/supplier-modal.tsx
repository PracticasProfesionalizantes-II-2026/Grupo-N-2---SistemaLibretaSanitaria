"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createSupplier } from "@/features/erp/actions/purchase-actions";
import {
  supplierSchema,
  type SupplierValues,
} from "@/features/erp/schemas/purchase-schemas";

/**
 * Alta de un proveedor.
 *
 * Sin edición en este slice a propósito: lo único que hoy se puede corregir
 * de un proveedor es reactivarlo o desactivarlo (`setSupplierActive`), y esa
 * acción vive directo en la lista, no en este modal.
 */
export function SupplierModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
  });

  async function onSubmit(valores: SupplierValues) {
    const resultado = await createSupplier(valores);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Proveedor creado");
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo proveedor"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-proveedor" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-proveedor"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Field
          label="Nombre"
          htmlFor="nombre"
          required
          error={errors.nombre?.message}
        >
          <Input id="nombre" {...register("nombre")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="CUIT"
            htmlFor="cuit"
            error={errors.cuit?.message}
            hint="Opcional"
          >
            <Input id="cuit" {...register("cuit")} />
          </Field>

          <Field
            label="Teléfono"
            htmlFor="telefono"
            error={errors.telefono?.message}
            hint="Opcional"
          >
            <Input id="telefono" {...register("telefono")} />
          </Field>
        </div>

        <Field
          label="Email"
          htmlFor="email"
          error={errors.email?.message}
          hint="Opcional"
        >
          <Input id="email" type="email" {...register("email")} />
        </Field>
      </form>
    </Modal>
  );
}
