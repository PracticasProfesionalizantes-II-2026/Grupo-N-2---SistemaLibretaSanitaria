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
import { Textarea } from "@/components/ui/textarea";
import {
  addCondition,
  updateCondition,
} from "@/features/owner/actions/health-records-actions";
import type { Condition } from "@/types/pet";

export function RecordConditionModal({
  open,
  onClose,
  petId,
  petName,
  condition,
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  condition?: Condition;
}) {
  const isEdit = Boolean(condition);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const [nombre, setNombre] = useState(condition?.nombre ?? "");
  /**
   * Enfermedad o alergia, y nada más, aunque `addCondition` acepte además
   * `cronica` y el enum de la base tenga `chronic`.
   *
   * El dominio colapsa lo crónico a propósito: `toCondition()` lee cualquier
   * fila que no sea `allergy` como "enfermedad", con el criterio de que una
   * condición crónica es una enfermedad que no se va — así la lee el
   * veterinario. Ofrecer "Crónica" en el alta sería dejar elegir algo que el
   * listado después muestra como otra cosa: se guarda `chronic`, se ve
   * "Enfermedad". Mismo motivo por el que el alta de antiparasitarios no
   * ofrece "ambos".
   */
  const [tipo, setTipo] = useState<"" | "enfermedad" | "alergia">(
    condition?.tipo ?? "",
  );
  /**
   * Una fila guardada como `chronic` se prellena acá como "Enfermedad", porque
   * eso es lo que el dominio muestra. Devolver ese valor sin que nadie lo
   * eligiera degradaría la condición crónica a enfermedad común, solo por
   * haberle corregido el nombre. Mismo patrón que `fotoTouched` en
   * `PetFormModal`.
   */
  const [tipoTouched, setTipoTouched] = useState(false);
  const [descripcion, setDescripcion] = useState(condition?.descripcion ?? "");
  const [fechaDiagnostico, setFechaDiagnostico] = useState(
    condition?.fechaDiagnostico ?? "",
  );

  async function handleSave() {
    // En la edición ya hay un tipo guardado, así que no hace falta volver a
    // pedirlo.
    if (!nombre.trim() || (!isEdit && !tipo)) {
      setError("Completá al menos el nombre y el tipo de condición.");
      return;
    }

    setSaving(true);
    setError(undefined);

    const result = condition
      ? await updateCondition(condition.id, petId, {
          nombre,
          tipo: tipoTouched && tipo ? tipo : undefined,
          descripcion,
          fechaDiagnostico: fechaDiagnostico || undefined,
        })
      : await addCondition(petId, {
          nombre,
          // La guarda de arriba ya descartó el vacío en el alta.
          tipo: tipo as "enfermedad" | "alergia",
          descripcion,
          fechaDiagnostico: fechaDiagnostico || undefined,
        });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit
        ? "Se actualizó la condición."
        : `Condición registrada para ${petName}.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar condición" : "Registrar enfermedad o condición"}
      size="lg"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/*
            El id NO es "nombre" y el autocompletado va apagado a propósito.
            Chrome en Android clasifica los campos por heurística: un input de
            texto llamado "nombre" lo toma por el nombre de una persona y le
            ofrece encima la lista de contactos del teléfono. Se reportó como
            "el selector muestra nombres de dueños"; no era un selector ni salía
            de la base, era el autofill del navegador tapando el campo.

            `autoComplete="off"` solo no alcanza: Chrome lo ignora justamente en
            los campos que su heurística cree reconocer. Lo que lo desactiva de
            verdad es que el campo deje de parecer un nombre de persona.
          */}
          <Field label="Nombre" htmlFor="nombre-condicion" required>
            <Input
              id="nombre-condicion"
              name="nombre-condicion"
              autoComplete="off"
              autoCapitalize="sentences"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Dermatitis alérgica, displasia de cadera..."
            />
          </Field>
          <Field label="Tipo" htmlFor="tipo" required>
            <Select
              id="tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as "" | "enfermedad" | "alergia");
                setTipoTouched(true);
              }}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="enfermedad">Enfermedad</option>
              <option value="alergia">Alergia</option>
            </Select>
          </Field>
        </div>

        <Field label="Fecha de diagnóstico" htmlFor="fechaDiagnostico">
          <Input
            id="fechaDiagnostico"
            type="date"
            value={fechaDiagnostico}
            onChange={(e) => setFechaDiagnostico(e.target.value)}
          />
        </Field>

        <Field label="Descripción" htmlFor="descripcion">
          <Textarea
            id="descripcion"
            name="descripcion-condicion"
            autoComplete="off"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Síntomas, tratamiento indicado, qué hay que evitar..."
          />
        </Field>
      </div>
    </Modal>
  );
}
