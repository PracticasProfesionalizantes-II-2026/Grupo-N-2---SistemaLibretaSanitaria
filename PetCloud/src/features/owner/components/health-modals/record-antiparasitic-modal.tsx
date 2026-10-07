"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  addDeworming,
  updateDeworming,
} from "@/features/owner/actions/health-records-actions";
import type { Antiparasitic } from "@/types/pet";
import { hoyArgentina } from "@/lib/argentina-time";

export function RecordAntiparasiticModal({
  open,
  onClose,
  petId,
  petName,
  antiparasitic,
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  antiparasitic?: Antiparasitic;
}) {
  const isEdit = Boolean(antiparasitic);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const [producto, setProducto] = useState(antiparasitic?.producto ?? "");
  const [tipo, setTipo] = useState<"" | "interno" | "externo">(
    antiparasitic?.tipo ?? "",
  );
  /**
   * Un producto guardado como `both` se prellena acá como "Externo", porque eso
   * es lo que el dominio muestra. Devolver ese valor sin que nadie lo eligiera
   * convertiría en externo algo que también era interno, solo por haberle
   * corregido el nombre. Mismo patrón que `fotoTouched` en `PetFormModal`.
   */
  const [tipoTouched, setTipoTouched] = useState(false);
  const [fecha, setFecha] = useState(
    () => antiparasitic?.fecha ?? hoyArgentina(),
  );
  const [proxima, setProxima] = useState(
    antiparasitic?.proximaAplicacion ?? "",
  );

  async function handleSave() {
    // El tipo entra en la guarda aunque no sea parte del mínimo pedido: sin
    // elegirlo habría que inventarle uno, y un antiparasitario interno anotado
    // como externo es peor que un registro que no se guardó. En la edición ya
    // hay uno guardado, así que no hace falta volver a pedirlo.
    if (!producto.trim() || !fecha || (!isEdit && !tipo)) {
      setError("Completá el producto, el tipo y la fecha de aplicación.");
      return;
    }

    setSaving(true);
    setError(undefined);

    const result = antiparasitic
      ? await updateDeworming(antiparasitic.id, petId, {
          producto,
          tipo: tipoTouched && tipo ? tipo : undefined,
          fecha,
          proximaAplicacion: proxima || undefined,
        })
      : await addDeworming(petId, {
          producto,
          // La guarda de arriba ya descartó el vacío en el alta.
          tipo: tipo as "interno" | "externo",
          fecha,
          proximaAplicacion: proxima || undefined,
        });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit
        ? "Se actualizó el antiparasitario."
        : `Antiparasitario registrado para ${petName}.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar antiparasitario" : "Registrar antiparasitario"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isEdit ? null : (
          <Alert variant="warning">
            Este registro queda marcado como <strong>no verificado</strong>{" "}
            hasta que lo valide un veterinario.
          </Alert>
        )}

        {error ? <Alert variant="danger">{error}</Alert> : null}

        <Field label="Producto" htmlFor="producto" required>
          <Input
            id="producto"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Endogard, pipeta Frontline..."
          />
        </Field>

        <Field label="Tipo" htmlFor="tipo" required>
          <Select
            id="tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as "" | "interno" | "externo");
              setTipoTouched(true);
            }}
          >
            <option value="" disabled>
              Elegí una opción
            </option>
            <option value="interno">Interno (desparasitación)</option>
            <option value="externo">Externo (pulgas y garrapatas)</option>
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha de aplicación" htmlFor="fecha" required>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field label="Próxima aplicación" htmlFor="proxima">
            <Input
              id="proxima"
              type="date"
              value={proxima}
              onChange={(e) => setProxima(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
