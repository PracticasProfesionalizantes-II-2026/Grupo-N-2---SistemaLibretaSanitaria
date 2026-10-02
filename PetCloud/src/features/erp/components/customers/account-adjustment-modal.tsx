"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { registerAccountAdjustment } from "@/features/erp/actions/customer-actions";
import {
  accountAdjustmentSchema,
  type AccountAdjustmentValues,
} from "@/features/erp/schemas/customer-schemas";

/**
 * Ajuste manual de cuenta corriente: saldo inicial de un cliente que ya
 * tenía cuenta en papel, o una corrección. Es la única forma de generar
 * deuda en este slice — `kind = 'sale'` lo emite `register_sale()` recién en
 * la 108, así que sin este modal la pantalla de Clientes no tendría nada que
 * hacer hasta que exista Ventas (el mismo agujero que la 106 destapó con
 * `aporte`).
 */
export function AccountAdjustmentModal({
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
  } = useForm<AccountAdjustmentValues>({
    resolver: zodResolver(accountAdjustmentSchema),
    defaultValues: { customerId },
  });

  async function onSubmit(valores: AccountAdjustmentValues) {
    const resultado = await registerAccountAdjustment({
      ...valores,
      customerId,
    });

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Ajuste registrado");
    reset({ customerId });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajuste de cuenta corriente"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-ajuste-cuenta"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-ajuste-cuenta"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <input type="hidden" {...register("customerId")} value={customerId} />

        <Field
          label="Sentido"
          htmlFor="sentido"
          required
          error={errors.sentido?.message}
          hint="«Debe» suma deuda del cliente. «Haber» la reduce (o deja un saldo a favor)."
        >
          <Select id="sentido" {...register("sentido")}>
            <option value="">Elegí el sentido</option>
            <option value="debe">Debe (suma deuda)</option>
            <option value="haber">Haber (reduce deuda)</option>
          </Select>
        </Field>

        <Field
          label="Monto"
          htmlFor="monto"
          required
          error={errors.monto?.message}
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
