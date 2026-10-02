"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  createCustomer,
  updateCustomer,
} from "@/features/erp/actions/customer-actions";
import { getCustomerPrefillAction } from "@/features/erp/actions/customer-prefill-action";
import {
  customerSchema,
  type CustomerValues,
} from "@/features/erp/schemas/customer-schemas";
import {
  CUSTOMER_DOCUMENT_TYPE_LABELS,
  CUSTOMER_TAX_CONDITION_LABELS,
  type Customer,
} from "@/types/erp";

/**
 * Alta y edición de un cliente.
 *
 * El botón "Traer datos de PetCloud" es el prefill de la propuesta: lee
 * `public.profiles` de solo lectura (nunca escribe ahí) y solo funciona si
 * ya se cargó un `profileId` — no hay buscador de perfiles en este slice,
 * la persona lo pega a mano (el flujo real de "vincular" llega con Ventas).
 */
export function CustomerModal({
  open,
  onClose,
  cliente,
}: {
  open: boolean;
  onClose: () => void;
  cliente?: Customer;
}) {
  const [cargandoPrefill, setCargandoPrefill] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: cliente
      ? {
          razonSocial: cliente.razonSocial,
          tipoDocumento: cliente.tipoDocumento,
          numeroDocumento: cliente.numeroDocumento ?? "",
          condicionIva: cliente.condicionIva,
          domicilio: cliente.domicilio ?? "",
          email: cliente.email ?? "",
          phone: cliente.phone ?? "",
          limiteCredito: cliente.limiteCreditoPesos,
          profileId: cliente.profileId ?? "",
        }
      : undefined,
  });

  const profileId = useWatch({ control, name: "profileId" });

  async function traerDePetCloud() {
    if (!profileId) {
      toast.error("Pegá un ID de perfil de PetCloud primero");
      return;
    }

    setCargandoPrefill(true);
    const prefill = await getCustomerPrefillAction(profileId);
    setCargandoPrefill(false);

    if (!prefill) {
      toast.error("No encontramos ese perfil, o no es visible desde acá");
      return;
    }

    if (prefill.nombre) setValue("razonSocial", prefill.nombre);
    if (prefill.domicilio) setValue("domicilio", prefill.domicilio);
    if (prefill.telefono) setValue("phone", prefill.telefono);
    toast.success("Datos traídos de PetCloud");
  }

  async function onSubmit(valores: CustomerValues) {
    const resultado = cliente
      ? await updateCustomer({ ...valores, id: cliente.id })
      : await createCustomer(valores);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success(cliente ? "Cliente actualizado" : "Cliente creado");
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cliente ? "Editar cliente" : "Nuevo cliente"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="form-cliente" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        id="form-cliente"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Field
          label="ID de perfil de PetCloud"
          htmlFor="profileId"
          error={errors.profileId?.message}
          hint="Opcional. Pegalo y traé nombre, domicilio y teléfono."
        >
          <div className="flex gap-2">
            <Input id="profileId" {...register("profileId")} />
            <Button
              type="button"
              variant="outline"
              onClick={traerDePetCloud}
              disabled={cargandoPrefill}
            >
              {cargandoPrefill ? "Buscando…" : "Traer datos de PetCloud"}
            </Button>
          </div>
        </Field>

        <Field
          label="Razón social / nombre"
          htmlFor="razonSocial"
          required
          error={errors.razonSocial?.message}
        >
          <Input id="razonSocial" {...register("razonSocial")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tipo de documento"
            htmlFor="tipoDocumento"
            required
            error={errors.tipoDocumento?.message}
          >
            <Select id="tipoDocumento" {...register("tipoDocumento")}>
              <option value="">Elegí un tipo</option>
              {Object.entries(CUSTOMER_DOCUMENT_TYPE_LABELS).map(
                ([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ),
              )}
            </Select>
          </Field>

          <Field
            label="Número de documento"
            htmlFor="numeroDocumento"
            error={errors.numeroDocumento?.message}
            hint="Opcional"
          >
            <Input id="numeroDocumento" {...register("numeroDocumento")} />
          </Field>
        </div>

        <Field
          label="Condición frente al IVA"
          htmlFor="condicionIva"
          required
          error={errors.condicionIva?.message}
        >
          <Select id="condicionIva" {...register("condicionIva")}>
            <option value="">Elegí una condición</option>
            {Object.entries(CUSTOMER_TAX_CONDITION_LABELS).map(
              ([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ),
            )}
          </Select>
        </Field>

        <Field
          label="Domicilio"
          htmlFor="domicilio"
          error={errors.domicilio?.message}
          hint="Opcional"
        >
          <Input id="domicilio" {...register("domicilio")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor="email"
            error={errors.email?.message}
            hint="Opcional"
          >
            <Input id="email" type="email" {...register("email")} />
          </Field>

          <Field
            label="Teléfono"
            htmlFor="phone"
            error={errors.phone?.message}
            hint="Opcional"
          >
            <Input id="phone" {...register("phone")} />
          </Field>
        </div>

        <Field
          label="Límite de crédito"
          htmlFor="limiteCredito"
          error={errors.limiteCredito?.message}
          hint="Opcional, en pesos. Si lo dejás vacío, no tiene límite. Si se pasa, te avisamos, pero la venta se puede hacer igual."
        >
          <Input
            id="limiteCredito"
            type="number"
            step="0.01"
            {...register("limiteCredito", { valueAsNumber: true })}
          />
        </Field>
      </form>
    </Modal>
  );
}
