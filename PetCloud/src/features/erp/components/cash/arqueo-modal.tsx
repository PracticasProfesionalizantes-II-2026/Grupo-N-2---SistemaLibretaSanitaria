"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { recordArqueo } from "@/features/erp/actions/cash-actions";
import {
  arqueoSchema,
  type ArqueoValues,
} from "@/features/erp/schemas/cash-schemas";

/**
 * Arqueo: contado vs. sistema.
 *
 * No hay "abrir turno" ni "cerrar turno" acá — decisión 1 del diseño: un
 * arqueo es una entrada más del libro, no un candado. Se puede registrar
 * cuantas veces se quiera y una venta después nunca queda bloqueada por esto.
 */
export function ArqueoModal({
  open,
  onClose,
  saldoSistemaPesos,
}: {
  open: boolean;
  onClose: () => void;
  saldoSistemaPesos: number;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ArqueoValues>({
    resolver: zodResolver(arqueoSchema),
  });

  async function onSubmit(valores: ArqueoValues) {
    const resultado = await recordArqueo(valores);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Arqueo registrado");
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar arqueo"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-arqueo" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-arqueo"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <p className="text-muted-foreground text-sm">
          Según lo registrado, debería haber{" "}
          {saldoSistemaPesos.toLocaleString("es-AR")} pesos. Contá el cajón y
          cargá lo que encontraste.
        </p>

        <Field
          label="Contado"
          htmlFor="contado"
          required
          error={errors.contado?.message}
          hint="En pesos, lo que realmente hay en el cajón"
        >
          <Input
            id="contado"
            type="number"
            step="0.01"
            {...register("contado", { valueAsNumber: true })}
          />
        </Field>

        <Field
          label="Motivo de la diferencia"
          htmlFor="motivo"
          error={errors.motivo?.message}
          hint="Obligatorio solo si lo que contaste no coincide con lo registrado"
        >
          <Input id="motivo" {...register("motivo")} />
        </Field>
      </form>
    </Modal>
  );
}
