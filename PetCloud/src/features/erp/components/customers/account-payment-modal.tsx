"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { registerAccountPayment } from "@/features/erp/actions/customer-actions";
import {
  accountPaymentSchema,
  type AccountPaymentValues,
} from "@/features/erp/schemas/customer-schemas";

/**
 * Pago sobre cuenta corriente: cancela deuda y entra al cajón en una sola
 * transacción (`erp.register_account_payment()`, 107). Siempre en efectivo
 * en este slice — no hay ruteo de métodos de pago todavía, eso llega con
 * `erp.payment_methods` en la 108.
 */
export function AccountPaymentModal({
  open,
  onClose,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountPaymentValues>({
    resolver: zodResolver(accountPaymentSchema),
    defaultValues: { customerId },
  });

  async function onSubmit(valores: AccountPaymentValues) {
    const resultado = await registerAccountPayment({ ...valores, customerId });

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Pago registrado");
    reset({ customerId });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pago"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-pago-cuenta" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-pago-cuenta"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <input type="hidden" {...register("customerId")} value={customerId} />

        <Field
          label="Monto"
          htmlFor="monto"
          required
          error={errors.monto?.message}
          hint="En efectivo. Reduce la deuda y entra al cajón en un solo paso."
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
