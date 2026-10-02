"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { recordCashMovement } from "@/features/erp/actions/cash-actions";
import {
  cashMovementSchema,
  type CashMovementValues,
} from "@/features/erp/schemas/cash-schemas";
import { CASH_MOVEMENT_KIND_LABELS } from "@/types/erp";

const TIPOS_CARGABLES = ["caja_chica", "retiro", "pago_proveedor"] as const;

/**
 * Caja chica, retiro del titular o pago a proveedor.
 *
 * No incluye `sale` ni `arqueo`: la venta la va a emitir `register_sale()`
 * cuando exista Ventas (108), y el arqueo tiene su propio modal
 * (`ArqueoModal`) porque su forma es distinta (contado vs. sistema, no un
 * monto que el usuario elige de una).
 */
export function MovementModal({
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
  } = useForm<CashMovementValues>({
    resolver: zodResolver(cashMovementSchema),
  });

  async function onSubmit(valores: CashMovementValues) {
    const resultado = await recordCashMovement(valores);

    if (!resultado.ok) {
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
      title="Nuevo movimiento de caja"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-movimiento-caja"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-movimiento-caja"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Field
          label="Tipo"
          htmlFor="tipo"
          required
          error={errors.tipo?.message}
        >
          <Select id="tipo" {...register("tipo")}>
            <option value="">Elegí un tipo</option>
            {TIPOS_CARGABLES.map((tipo) => (
              <option key={tipo} value={tipo}>
                {CASH_MOVEMENT_KIND_LABELS[tipo]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Monto"
          htmlFor="monto"
          required
          error={errors.monto?.message}
          hint="En pesos. Siempre sale del cajón."
        >
          <Input
            id="monto"
            type="number"
            step="0.01"
            {...register("monto", { valueAsNumber: true })}
          />
        </Field>

        <Field
          label="Nota"
          htmlFor="nota"
          error={errors.nota?.message}
          hint="Opcional"
        >
          <Input id="nota" {...register("nota")} />
        </Field>
      </form>
    </Modal>
  );
}
