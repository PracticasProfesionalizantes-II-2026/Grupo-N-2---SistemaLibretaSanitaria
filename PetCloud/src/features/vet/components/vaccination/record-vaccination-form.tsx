"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { VET_BASE } from "@/config/vet-nav";
import { recordVaccination } from "@/features/vet/actions/vaccination-actions";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { SignatureStatus } from "@/features/vet/components/shared/signature-status";
import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import { VACCINE_DOSES, VACCINE_LABS } from "@/config/vet-catalogs";
import {
  type VaccinationValues,
  vaccinationSchema,
} from "@/features/vet/schemas/vet-schemas";
import { parseDate } from "@/lib/format";
import type { Patient, VaccinePreset } from "@/types/vet";
import { hoyArgentina } from "@/lib/argentina-time";

/**
 * Las vías que el sistema sabe guardar.
 *
 * La lista vieja distinguía subcutánea de intramuscular; la columna
 * `application_route` no, y escribir una distinción que la base no conserva es
 * prometer un dato que después no está. Se usa el vocabulario que efectivamente
 * viaja, el mismo que muestran los presets y el libro de vacunaciones.
 */
export const VIAS = ["Inyectable", "Oral", "Nasal", "Tópica", "Otra"] as const;

/**
 * Intervalo hasta la próxima dosis según el tipo de dosis.
 * Las series iniciales van cada 21 días; los refuerzos, al año.
 */
function suggestNextDose(fecha: string, dosis: string) {
  if (!fecha) return "";

  const date = parseDate(fecha);
  if (Number.isNaN(date.getTime())) return "";

  if (dosis === "1ª dosis" || dosis === "2ª dosis" || dosis === "3ª dosis") {
    date.setDate(date.getDate() + 21);
  } else {
    date.setFullYear(date.getFullYear() + 1);
  }

  // `parseDate` arma medianoche local: `toISOString()` la pasaría a UTC y en
  // un navegador al este de Greenwich devolvería el día anterior.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function RecordVaccinationForm({
  paciente: patient,
  presets,
}: {
  paciente: Patient;
  /** El catálogo de la institución: trae laboratorio, vía y dosis ya cargados. */
  presets: VaccinePreset[];
}) {
  const router = useRouter();
  const vet = useVetSession();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VaccinationValues>({
    resolver: zodResolver(vaccinationSchema),
    defaultValues: {
      fechaAplicacion: hoyArgentina(),
      lugar: vet?.institucion.nombre ?? "",
      via: "Inyectable",
    },
  });

  const [fechaAplicacion, dosis, vacuna] = useWatch({
    control,
    name: ["fechaAplicacion", "dosis", "vacuna"],
  });

  // La próxima dosis se sugiere sola, pero queda editable por si el plan difiere.
  useEffect(() => {
    if (!fechaAplicacion || !dosis) return;
    setValue("proximaDosis", suggestNextDose(fechaAplicacion, dosis));
  }, [fechaAplicacion, dosis, setValue]);

  // El preset existe para no recargar laboratorio, vía y dosis en cada mascota.
  useEffect(() => {
    const preset = presets.find((item) => item.vacuna === vacuna);
    if (!preset) return;

    if (preset.laboratorio) setValue("laboratorio", preset.laboratorio);
    if (preset.via) setValue("via", preset.via);
    if (preset.dosisPorDefecto) setValue("dosis", preset.dosisPorDefecto);
  }, [vacuna, presets, setValue]);

  // Una vacunación aplicada por la institución entra verificada, y verificada
  // es firmada: desde el portón de la `065` también pide firma cargada. Este
  // formulario no tiene "Guardar borrador" —no existe una vacunación en
  // borrador—, así que el motivo a la vista es todo lo que separa a la persona
  // de un botón apagado sin explicación.
  const motivo = motivoSinFirma(vet);
  const canSign = motivo === null;
  const base = `${VET_BASE}/pacientes/${patient.id}`;

  const onSubmit = handleSubmit(async (values) => {
    const result = await recordVaccination({
      petId: patient.id,
      vacuna: values.vacuna,
      laboratorio: values.laboratorio,
      lote: values.lote,
      dosis: values.dosis,
      via: values.via as (typeof VIAS)[number],
      fechaAplicacion: values.fechaAplicacion,
      proximaDosis: values.proximaDosis,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `${values.vacuna} registrada para ${patient.nombre}. Ya figura en su libreta.`,
    );
    router.push(`${base}/vacunas`);
    router.refresh();
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Cargar vacunación"
        description={`${patient.nombre} · ${patient.raza}`}
        breadcrumbs={[
          { label: "Pacientes", href: `${VET_BASE}/pacientes` },
          { label: patient.nombre, href: base },
          { label: "Cargar vacunación" },
        ]}
      />

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-5 p-5">
          <h2 className="text-foreground font-semibold">Producto aplicado</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Vacuna"
              htmlFor="vacuna"
              error={errors.vacuna?.message}
              required
            >
              <Select id="vacuna" defaultValue="" {...register("vacuna")}>
                <option value="" disabled>
                  Elegí una opción
                </option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.vacuna}>
                    {preset.vacuna}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Laboratorio / marca"
              htmlFor="laboratorio"
              error={errors.laboratorio?.message}
              required
            >
              <Select
                id="laboratorio"
                defaultValue=""
                {...register("laboratorio")}
              >
                <option value="" disabled>
                  Elegí una opción
                </option>
                {VACCINE_LABS.map((lab) => (
                  <option key={lab} value={lab}>
                    {lab}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Nº de lote"
              htmlFor="lote"
              error={errors.lote?.message}
              required
            >
              <Input
                id="lote"
                placeholder="RB-2026-0418"
                {...register("lote")}
              />
            </Field>

            <Field
              label="Dosis"
              htmlFor="dosis"
              error={errors.dosis?.message}
              required
            >
              <Select id="dosis" defaultValue="" {...register("dosis")}>
                <option value="" disabled>
                  Elegí una opción
                </option>
                {VACCINE_DOSES.map((dose) => (
                  <option key={dose} value={dose}>
                    {dose}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Vía de aplicación"
              htmlFor="via"
              error={errors.via?.message}
              required
            >
              <Select id="via" {...register("via")}>
                {VIAS.map((route) => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <h2 className="text-foreground font-semibold">Aplicación</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Fecha de aplicación"
              htmlFor="fechaAplicacion"
              error={errors.fechaAplicacion?.message}
              required
            >
              <Input
                id="fechaAplicacion"
                type="date"
                {...register("fechaAplicacion")}
              />
            </Field>

            <Field
              label="Próxima dosis"
              htmlFor="proximaDosis"
              error={errors.proximaDosis?.message}
              hint="Se calcula según la dosis elegida. Podés editarla."
              required
            >
              <Input
                id="proximaDosis"
                type="date"
                {...register("proximaDosis")}
              />
            </Field>
          </div>

          <Field
            label="Lugar de vacunación"
            htmlFor="lugar"
            error={errors.lugar?.message}
            required
          >
            <Input id="lugar" {...register("lugar")} />
          </Field>

          <div>
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Profesional que aplica
            </p>
            <p className="text-foreground mt-1 font-medium">
              {[vet?.usuario.nombre, vet?.usuario.apellido]
                .filter(Boolean)
                .join(" ")}
            </p>
            <p className="text-muted-foreground text-sm">{vet?.matricula}</p>
          </div>

          <SignatureStatus motivo={motivo} />
        </Card>

        <Alert variant="info">
          Al guardar, la dosis entra al libro de vacunaciones de la institución
          y al carnet del dueño, y se crea el recordatorio de la próxima
          aplicación.
        </Alert>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`${base}/vacunas`)}
            className="sm:flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !canSign}
            className="sm:flex-1"
          >
            {isSubmitting ? "Guardando..." : "Firmar y guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
