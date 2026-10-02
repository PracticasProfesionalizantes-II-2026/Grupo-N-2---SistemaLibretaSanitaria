"use client";

import { ClipboardList, Download, FileText, Syringe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { VET_BASE } from "@/config/vet-nav";
import { VaccineCatalogManager } from "@/features/vet/components/vaccine-catalog/vaccine-catalog-manager";

import { downloadCsv } from "@/lib/export";
import { formatDate } from "@/lib/format";
import type { VaccinationRow } from "@/features/vet/actions/vaccination-actions";
import type { Professional, VaccinePreset } from "@/types/vet";

export function VaccinationsView({
  aplicaciones,
  vacunas,
  presets,
  equipo,
}: {
  aplicaciones: VaccinationRow[];
  /** El catálogo de la institución: con lo que se puede filtrar de verdad. */
  vacunas: string[];
  /**
   * Los mismos presets que `vacunas`, sin aplanar: el catálogo necesita el
   * objeto entero (laboratorio, vía, especies) para poder editarlo.
   */
  presets: VaccinePreset[];
  equipo: Professional[];
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [vaccine, setVaccine] = useState("todas");
  const [professionalId, setProfessionalId] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const applications = aplicaciones.filter((application) => {
    const matchesVaccine =
      vaccine === "todas" || application.vacuna === vaccine;
    const matchesProfessional =
      professionalId === "todos" ||
      application.profesionalId === professionalId;
    const matchesFrom = !from || application.fechaAplicacion >= from;
    const matchesTo = !to || application.fechaAplicacion <= to;

    return matchesVaccine && matchesProfessional && matchesFrom && matchesTo;
  });

  function exportCsv() {
    downloadCsv("vacunaciones-petcloud.csv", [
      [
        "Fecha",
        "Paciente",
        "Vacuna",
        "Dosis",
        "Laboratorio",
        "Lote",
        "Vía",
        "Próxima dosis",
        "Lugar",
        "Profesional",
      ],
      ...applications.map((application) => [
        application.fechaAplicacion,
        application.mascota,
        application.vacuna,
        application.dosis,
        application.laboratorio,
        application.lote,
        application.via,
        application.proximaDosis ?? "",
        application.lugar,
        application.profesional,
      ]),
    ]);

    toast.success(`Se exportaron ${applications.length} aplicaciones.`);
  }

  return (
    <div>
      <PageHeader
        title="Vacunaciones"
        description="Libro de vacunas aplicadas por la institución. Es la base del reporte que se presenta al municipio."
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Vacunaciones" },
        ]}
        actions={
          <>
            {/* El catálogo se despliega acá abajo en vez de abrirse en un modal:
                adentro ya vive `VaccinePresetModal` y el `ConfirmDialog` de
                borrado, y el `Modal` de la casa no soporta apilarse (cada
                instancia registra su propio listener de Escape y, al cerrarse,
                devuelve `body.overflow` a "" aunque el de afuera siga abierto). */}
            <Button
              variant="outline"
              onClick={() => setCatalogOpen((open) => !open)}
              aria-expanded={catalogOpen}
              aria-controls="catalogo-vacunas"
            >
              <ClipboardList className="size-4" />
              Catálogo de vacunas
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Exportar CSV
            </Button>
            <Button
              onClick={() =>
                toast.success(
                  "Reporte municipal generado. Te llega por email en PDF.",
                )
              }
            >
              <FileText className="size-4" />
              Reporte municipal
            </Button>
          </>
        }
      />

      {catalogOpen ? (
        <Card id="catalogo-vacunas" className="mb-6 p-5">
          <VaccineCatalogManager presets={presets} />
        </Card>
      ) : null}

      <Card className="mb-6 grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Vacuna" htmlFor="filtro-vacuna">
          <Select
            id="filtro-vacuna"
            value={vaccine}
            onChange={(event) => setVaccine(event.target.value)}
          >
            <option value="todas">Todas</option>
            {vacunas.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Profesional" htmlFor="filtro-profesional-vacuna">
          <Select
            id="filtro-profesional-vacuna"
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
          >
            <option value="todos">Todos</option>
            {equipo.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.nombre}
              </option>
            ))}
          </Select>
        </Field>

        {/* Cada punta del rango con su etiqueta visible: la "a" suelta entre
            dos fechas no se leía. */}
        <fieldset className="min-w-0">
          <legend className="text-foreground mb-1.5 text-sm font-medium">
            Fecha de aplicación
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {/* `min-w-0`: los input date traen un ancho intrínseco que, sin esto,
                desborda la columna del grid en vez de encogerse. */}
            <div className="min-w-0">
              <label
                htmlFor="filtro-vacuna-desde"
                className="text-muted-foreground mb-1 block text-xs"
              >
                Desde
              </label>
              <Input
                id="filtro-vacuna-desde"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="min-w-0"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="filtro-vacuna-hasta"
                className="text-muted-foreground mb-1 block text-xs"
              >
                Hasta
              </label>
              <Input
                id="filtro-vacuna-hasta"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="min-w-0"
              />
            </div>
          </div>
        </fieldset>
      </Card>

      {applications.length === 0 ? (
        <EmptyState
          icon={Syringe}
          title="Sin aplicaciones para estos filtros"
          description="Probá ampliando el rango de fechas o quitando algún filtro."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Fecha</TH>
              <TH>Paciente</TH>
              <TH>Vacuna</TH>
              <TH>Laboratorio / lote</TH>
              <TH>Próxima</TH>
              <TH>Profesional</TH>
            </tr>
          </THead>
          <TBody>
            {applications.map((application) => (
              <TR key={application.id}>
                <TD className="font-medium">
                  {formatDate(application.fechaAplicacion)}
                </TD>
                <TD>
                  <Link
                    href={`${VET_BASE}/pacientes/${application.petId}/vacunas`}
                    className="text-brand-700 font-medium hover:underline"
                  >
                    {application.mascota}
                  </Link>
                </TD>
                <TD>
                  <span className="block">{application.vacuna}</span>
                  <span className="text-muted-foreground block text-xs">
                    {application.dosis} · {application.via}
                  </span>
                </TD>
                <TD>
                  <span className="block">{application.laboratorio}</span>
                  <span className="text-muted-foreground block font-mono text-xs">
                    {application.lote}
                  </span>
                </TD>
                <TD>
                  {application.proximaDosis
                    ? formatDate(application.proximaDosis)
                    : "—"}
                </TD>
                <TD className="text-muted-foreground">
                  {application.profesional}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <p className="text-muted-foreground mt-4 text-sm">
        {applications.length} aplicación
        {applications.length === 1 ? "" : "es"} en el período seleccionado.
      </p>
    </div>
  );
}
