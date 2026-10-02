"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VET_BASE } from "@/config/vet-nav";
import { SignatureStatus } from "@/features/vet/components/shared/signature-status";
import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import {
  createConsultation,
  type ConsultationInput,
} from "@/features/vet/actions/consultation-actions";
import { closeVisit } from "@/features/vet/actions/waiting-room-actions";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import {
  CONSULTATION_TYPES,
  type ConsultationValues,
  TREATMENT_FREQUENCIES,
  TREATMENT_TYPES,
  consultationSchema,
} from "@/features/vet/schemas/vet-schemas";
import { tipoDesdeMotivo } from "@/features/vet/lib/motivo-llegada";
import type { Patient } from "@/types/vet";

export function NewConsultationForm({
  patient,
  visitId,
  defaultDate,
  defaultTime,
  visitReason,
}: {
  patient: Patient;
  /** Si se entra desde la sala de espera, al firmar se cierra esa visita. */
  visitId?: string;
  defaultDate: string;
  defaultTime: string;
  /** Si se entra desde la sala de espera, el motivo viene precargado. */
  visitReason?: string;
}) {
  const router = useRouter();
  const vet = useVetSession();
  const [savingDraft, setSavingDraft] = useState(false);
  const tipoInicial = tipoDesdeMotivo(visitReason);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConsultationValues>({
    resolver: zodResolver(consultationSchema),
    defaultValues: {
      fecha: defaultDate,
      hora: defaultTime,
      motivo: visitReason ?? "",
      ...(tipoInicial ? { tipo: tipoInicial } : {}),
      pesoKg: patient.pesoKg,
    },
  });

  // Firmar exige matrícula validada **y** firma cargada, desde el portón de la
  // `065`. Se sabe desde acá para poder explicarlo antes de que la persona
  // escriba la consulta entera; la regla la hace cumplir la base.
  const motivo = motivoSinFirma(vet);
  const canSign = motivo === null;

  const base = `${VET_BASE}/pacientes/${patient.id}`;

  function toInput(values: ConsultationValues): ConsultationInput {
    return {
      petId: patient.id,
      tipo: values.tipo,
      motivo: values.motivo,
      diagnostico: values.diagnostico,
      observaciones: values.observaciones,
      pesoKg: values.pesoKg,
      proximaVisita: values.proximoControl,
    };
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await createConsultation(toInput(values), {
      asDraft: false,
    });

    if (!result.success) {
      // Sin matrícula validada —o sin firma cargada, desde la `065`— la
      // consulta igual se guardó, como borrador: lo que falla es la firma, no
      // el registro. Perder lo escrito sería el peor final posible para alguien
      // que acaba de cargar una atención entera.
      toast.error(result.error);
      if (result.code === "sin-matricula" || result.code === "sin-firma")
        router.push(base);
      return;
    }

    // Si se entró desde la sala de espera, la atención queda cerrada y atada a
    // su registro: sin eso la visita diría que la mascota estuvo, no qué le
    // hicieron.
    if (visitId)
      await closeVisit(visitId, { medicalRecordId: result.recordId });

    // Una consulta de vacunación no carga la vacuna: esa va por
    // `recordVaccination`, con su propia firma y los guardas de la `065`/`076`.
    // Meter las dos en un mismo envío dejaría medias cargas si una falla; se
    // lleva directo al formulario de vacunación para cargarla al toque.
    if (values.tipo === "vacunacion") {
      toast.success(
        `Consulta de ${patient.nombre} firmada. Ahora cargá la vacuna aplicada.`,
      );
      router.push(`${base}/vacunacion`);
      router.refresh();
      return;
    }

    toast.success(
      `Consulta de ${patient.nombre} firmada y guardada. El dueño ya la ve en su libreta.`,
    );
    router.push(base);
    router.refresh();
  });

  const saveDraft = handleSubmit(async (values) => {
    setSavingDraft(true);
    const result = await createConsultation(toInput(values), { asDraft: true });
    setSavingDraft(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Borrador guardado. No se publicó en la libreta del dueño.");
    router.push(base);
    router.refresh();
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nueva consulta"
        description={`${patient.nombre} · ${patient.raza}`}
        breadcrumbs={[
          { label: "Pacientes", href: `${VET_BASE}/pacientes` },
          { label: patient.nombre, href: base },
          { label: "Nueva consulta" },
        ]}
      />

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-5 p-5">
          <h2 className="text-foreground font-semibold">
            Datos de la atención
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Fecha"
              htmlFor="fecha"
              error={errors.fecha?.message}
              required
            >
              <Input id="fecha" type="date" {...register("fecha")} />
            </Field>

            <Field
              label="Hora"
              htmlFor="hora"
              error={errors.hora?.message}
              required
            >
              <Input id="hora" type="time" {...register("hora")} />
            </Field>

            <Field
              label="Peso registrado (kg)"
              htmlFor="pesoKg"
              error={errors.pesoKg?.message}
              required
            >
              <Input
                id="pesoKg"
                type="number"
                step="0.1"
                min="0"
                {...register("pesoKg", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <Field
            label="Tipo de consulta"
            htmlFor="tipo"
            error={errors.tipo?.message}
            required
          >
            <Select
              id="tipo"
              defaultValue={tipoInicial ?? ""}
              {...register("tipo")}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              {CONSULTATION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Motivo"
            htmlFor="motivo"
            error={errors.motivo?.message}
            required
          >
            <Input
              id="motivo"
              placeholder="Por qué vino el paciente"
              {...register("motivo")}
            />
          </Field>

          <Field
            label="Diagnóstico"
            htmlFor="diagnostico"
            error={errors.diagnostico?.message}
            required
          >
            <Textarea id="diagnostico" {...register("diagnostico")} />
          </Field>

          <Field
            label="Observaciones"
            htmlFor="observaciones"
            hint="Opcional. Las lee el dueño en su libreta."
          >
            <Textarea id="observaciones" {...register("observaciones")} />
          </Field>
        </Card>

        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-foreground font-semibold">
              Tratamiento indicado
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Opcional. Si cargás un medicamento hay que completar dosis,
              frecuencia y duración.
            </p>
          </div>

          <Field
            label="Medicamento"
            htmlFor="medicamento"
            error={errors.medicamento?.message}
          >
            <Input
              id="medicamento"
              placeholder="Amoxicilina 250 mg, meloxicam..."
              {...register("medicamento")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Cantidad / dosis"
              htmlFor="cantidad"
              error={errors.cantidad?.message}
            >
              <Input
                id="cantidad"
                placeholder="1 comprimido, 2 ml..."
                {...register("cantidad")}
              />
            </Field>

            <Field label="Tipo" htmlFor="tipoMedicamento">
              <Select
                id="tipoMedicamento"
                defaultValue=""
                {...register("tipoMedicamento")}
              >
                <option value="">Sin especificar</option>
                {TREATMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Frecuencia de administración"
              htmlFor="frecuencia"
              error={errors.frecuencia?.message}
            >
              <Select
                id="frecuencia"
                defaultValue=""
                {...register("frecuencia")}
              >
                <option value="">Sin especificar</option>
                {TREATMENT_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Duración"
              htmlFor="duracion"
              error={errors.duracion?.message}
            >
              <Input
                id="duracion"
                placeholder="7 días, 3 semanas..."
                {...register("duracion")}
              />
            </Field>
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <h2 className="text-foreground font-semibold">Cierre</h2>

          <Field
            label="Adjuntar estudios"
            htmlFor="estudios"
            hint="Opcional. PDF o imágenes, hasta 10 MB cada uno."
          >
            <div className="border-border hover:border-brand-400 flex items-center gap-3 rounded-lg border border-dashed p-4 transition-colors">
              <Paperclip className="text-muted-foreground size-5 shrink-0" />
              <input
                id="estudios"
                type="file"
                multiple
                className="text-muted-foreground w-full text-sm"
              />
            </div>
          </Field>

          <Field
            label="Próximo control"
            htmlFor="proximoControl"
            hint="Opcional. Genera automáticamente un recordatorio para el dueño."
          >
            <Input
              id="proximoControl"
              type="date"
              {...register("proximoControl")}
            />
          </Field>

          {/* Quien firma es quien tiene la sesión abierta. Un selector acá
              permitiría firmar a nombre de otro colega sin que se entere, y la
              matrícula que queda en el registro es la que le da valor sanitario
              al documento. */}
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold uppercase">
              Profesional que firma
            </p>
            <p className="text-foreground text-sm font-medium">
              {[vet?.usuario.nombre, vet?.usuario.apellido]
                .filter(Boolean)
                .join(" ")}
            </p>
            <p className="text-muted-foreground text-xs">{vet?.matricula}</p>
          </div>

          <SignatureStatus motivo={motivo} />
        </Card>

        <Alert variant="info">
          Una consulta firmada queda inmutable en el historial y se publica en
          la libreta del dueño. El borrador solo lo ve la institución.
        </Alert>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={saveDraft}
            disabled={savingDraft || isSubmitting}
            className="sm:flex-1"
          >
            {savingDraft ? "Guardando..." : "Guardar borrador"}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !canSign}
            className="sm:flex-1"
          >
            {isSubmitting ? "Firmando..." : "Firmar y guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
