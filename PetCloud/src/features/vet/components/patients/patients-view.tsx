"use client";

import {
  Download,
  FileText,
  PawPrint,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { VET_BASE } from "@/config/vet-nav";
import { RecordCard } from "@/features/owner/components/pet-profile/record-card";
import { NewPatientModal } from "@/features/vet/components/patients/new-patient-modal";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import {
  generarReportePacientesPdf,
  type FiltroAplicado,
} from "@/features/vet/lib/patients-report-pdf";
import { downloadBlob, downloadCsv } from "@/lib/export";
import { capitalize, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PatientRow } from "@/features/vet/actions/patient-actions";
import type { HealthStatus } from "@/types/pet";
import type { Professional } from "@/types/vet";

const HEALTH_OPTIONS: { value: HealthStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos los estados" },
  { value: "al-dia", label: "Al día" },
  { value: "por-vencer", label: "Próxima a vencer" },
  { value: "vencida", label: "Vencida" },
  // Sin esta opción, los pacientes sin ninguna vacuna cargada quedaban fuera de
  // todo filtro que no fuera "Todos": antes caían dentro de "Al día" porque el
  // estado mentía, y al dejar de mentir se volvían invisibles. Para un
  // veterinario es justo el grupo que más conviene poder listar.
  { value: "sin-datos", label: "Sin datos" },
];

export function PatientsView({
  pacientes,
  equipo,
}: {
  pacientes: PatientRow[];
  equipo: Professional[];
}) {
  const searchParams = useSearchParams();
  const vet = useVetSession();

  const [query, setQuery] = useState("");
  const [species, setSpecies] = useState("todas");
  const [health, setHealth] = useState(searchParams.get("estado") ?? "todos");
  const [professionalId, setProfessionalId] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState(searchParams.get("alta") === "1");
  // Solo gobierna el celular: desde md los filtros se ven siempre. Abiertos de
  // entrada ocupaban toda la primera pantalla y la lista quedaba abajo.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const patients = pacientes.filter((patient) => {
    const lastVisit = patient.ultimaVisita;

    // Sin DNI: no existe en `profiles`, y buscar por un campo que siempre está
    // vacío es prometer una búsqueda que nunca encuentra.
    const matchesQuery =
      query.trim().length < 2 ||
      [patient.nombre, patient.raza, patient.duenoNombre, patient.qrCode]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query.trim().toLowerCase()),
        );

    const matchesSpecies = species === "todas" || patient.especie === species;
    const matchesHealth =
      health === "todos" || patient.estadoSanitario === health;

    // El profesional se deduce de quién firmó los registros del paciente.
    const nombreProfesional = equipo.find(
      (item) => item.id === professionalId,
    )?.nombre;

    const matchesProfessional =
      professionalId === "todos" ||
      (!!nombreProfesional &&
        patient.profesionales.includes(nombreProfesional));

    const matchesFrom = !from || (lastVisit ?? "") >= from;
    const matchesTo = !to || (lastVisit ?? "") <= to;

    return (
      matchesQuery &&
      matchesSpecies &&
      matchesHealth &&
      matchesProfessional &&
      matchesFrom &&
      matchesTo
    );
  });

  function exportCsv() {
    downloadCsv("pacientes-petcloud.csv", [
      [
        "Nombre",
        "Especie",
        "Raza",
        "Dueño",
        "Teléfono",
        "Última visita",
        "Estado sanitario",
        "Nº de registro",
      ],
      ...patients.map((patient) => [
        patient.nombre,
        capitalize(patient.especie),
        patient.raza,
        patient.duenoNombre,
        patient.duenoTelefono,
        patient.ultimaVisita ? formatDate(patient.ultimaVisita) : "Sin visitas",
        patient.estadoSanitario,
        patient.qrCode,
      ]),
    ]);

    toast.success(`Se exportaron ${patients.length} pacientes.`);
  }

  /**
   * Los filtros con los que se armó el listado, para dejarlos impresos.
   *
   * Se listan solo los que están puestos: un reporte que enumera seis filtros
   * en "todos" esconde el único que sí recortó el listado.
   */
  function filtrosAplicados(): FiltroAplicado[] {
    const filtros: FiltroAplicado[] = [];

    if (query.trim().length >= 2) {
      filtros.push({ etiqueta: "Búsqueda", valor: query.trim() });
    }

    if (species !== "todas") {
      filtros.push({ etiqueta: "Especie", valor: capitalize(species) });
    }

    if (health !== "todos") {
      filtros.push({
        etiqueta: "Estado de vacunación",
        valor:
          HEALTH_OPTIONS.find((option) => option.value === health)?.label ??
          health,
      });
    }

    if (professionalId !== "todos") {
      filtros.push({
        etiqueta: "Profesional",
        valor:
          equipo.find((item) => item.id === professionalId)?.nombre ??
          "Desconocido",
      });
    }

    if (from || to) {
      filtros.push({
        etiqueta: "Última visita",
        valor: [
          from ? `desde ${formatDate(from)}` : "",
          to ? `hasta ${formatDate(to)}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    return filtros;
  }

  function exportPdf() {
    downloadBlob(
      "pacientes-petcloud.pdf",
      generarReportePacientesPdf(
        patients,
        filtrosAplicados(),
        vet?.institucion.nombre ?? "",
      ),
    );

    toast.success(`Reporte de ${patients.length} pacientes descargado.`);
  }

  const filtrosActivos = [
    species !== "todas",
    health !== "todos",
    professionalId !== "todos",
    from !== "",
    to !== "",
  ].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Todas las mascotas atendidas por la institución."
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Pacientes" },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="size-4" />
              PDF
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Nuevo paciente
            </Button>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por mascota, dueño o nº de registro..."
            className="pl-9"
            aria-label="Buscar pacientes"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-4 md:hidden"
          onClick={() => setFiltrosAbiertos((v) => !v)}
          aria-expanded={filtrosAbiertos}
          aria-controls="filtros-pacientes"
        >
          <SlidersHorizontal className="size-4" />
          Filtros{filtrosActivos ? ` (${filtrosActivos})` : ""}
        </Button>

        <div
          id="filtros-pacientes"
          className={cn(
            "mt-4 grid-cols-1 gap-4 sm:grid-cols-2 md:grid xl:grid-cols-4",
            filtrosAbiertos ? "grid" : "hidden",
          )}
        >
          <Field label="Especie" htmlFor="filtro-especie">
            <Select
              id="filtro-especie"
              value={species}
              onChange={(event) => setSpecies(event.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="perro">Perros</option>
              <option value="gato">Gatos</option>
              <option value="otro">Otros</option>
            </Select>
          </Field>

          <Field label="Estado de vacunación" htmlFor="filtro-estado">
            <Select
              id="filtro-estado"
              value={health}
              onChange={(event) => setHealth(event.target.value)}
            >
              {HEALTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Profesional" htmlFor="filtro-profesional">
            <Select
              id="filtro-profesional"
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

          {/* Un rango ocupa el lugar de un solo filtro, pero cada punta lleva
              su etiqueta visible: la "a" suelta entre dos fechas no se leía. */}
          <fieldset className="min-w-0">
            <legend className="text-foreground mb-1.5 text-sm font-medium">
              Última visita
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {/* `min-w-0`: los input date traen un ancho intrínseco que, sin esto,
                  desborda la columna del grid en vez de encogerse. */}
              <div className="min-w-0">
                <label
                  htmlFor="filtro-desde"
                  className="text-muted-foreground mb-1 block text-xs"
                >
                  Desde
                </label>
                <Input
                  id="filtro-desde"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="filtro-hasta"
                  className="text-muted-foreground mb-1 block text-xs"
                >
                  Hasta
                </label>
                <Input
                  id="filtro-hasta"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="min-w-0"
                />
              </div>
            </div>
          </fieldset>
        </div>
      </Card>

      {patients.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="Ningún paciente coincide con los filtros"
          description="Probá con otros criterios o dá de alta un paciente nuevo."
          action={
            <Button onClick={() => setCreating(true)}>Nuevo paciente</Button>
          }
        />
      ) : (
        <>
          {/* En el celular, una tarjeta por paciente: la tabla de seis columnas
            obligaba a scrollear de costado para llegar a las acciones. */}
          <div className="flex flex-col gap-3 md:hidden">
            {patients.map((patient) => {
              const base = `${VET_BASE}/pacientes/${patient.id}`;

              return (
                <RecordCard
                  key={patient.id}
                  title={
                    <Link href={base} className="flex items-center gap-3">
                      <Avatar name={patient.nombre} size="sm" />
                      {patient.nombre}
                    </Link>
                  }
                  status={<HealthStatusChip status={patient.estadoSanitario} />}
                  dates={[
                    {
                      label: "Especie / raza",
                      value: [capitalize(patient.especie), patient.raza]
                        .filter(Boolean)
                        .join(" · "),
                    },
                    {
                      label: "Última visita",
                      value: patient.ultimaVisita
                        ? formatDate(patient.ultimaVisita)
                        : "Sin visitas",
                    },
                  ]}
                  secondary={
                    <p>
                      {patient.duenoNombre}
                      {patient.duenoTelefono
                        ? ` · ${patient.duenoTelefono}`
                        : ""}
                    </p>
                  }
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`${VET_BASE}/sala-de-espera?paciente=${patient.id}`}
                        className="bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-2 text-sm font-medium text-white"
                      >
                        Registrar llegada
                      </Link>
                      <Link
                        href={base}
                        className="text-brand-700 hover:bg-muted rounded-lg px-3 py-2 text-sm font-medium"
                      >
                        Ver ficha
                      </Link>
                      <Link
                        href={`${base}/historial`}
                        className="text-foreground hover:bg-muted rounded-lg px-3 py-2 text-sm font-medium"
                      >
                        Historial
                      </Link>
                    </div>
                  }
                />
              );
            })}
          </div>

          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Paciente</TH>
                  <TH>Especie / raza</TH>
                  <TH>Dueño</TH>
                  <TH>Última visita</TH>
                  <TH>Estado sanitario</TH>
                  <TH className="text-right">Acciones</TH>
                </tr>
              </THead>
              <TBody>
                {patients.map((patient) => {
                  const lastVisit = patient.ultimaVisita;
                  const base = `${VET_BASE}/pacientes/${patient.id}`;

                  return (
                    <TR key={patient.id}>
                      <TD>
                        <Link
                          href={base}
                          className="flex items-center gap-3 font-medium"
                        >
                          <Avatar name={patient.nombre} size="sm" />
                          {patient.nombre}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">
                        {[capitalize(patient.especie), patient.raza]
                          .filter(Boolean)
                          .join(" · ")}
                      </TD>
                      <TD>
                        <span className="block">{patient.duenoNombre}</span>
                        <span className="text-muted-foreground block text-xs">
                          {patient.duenoTelefono}
                        </span>
                      </TD>
                      <TD>
                        {lastVisit ? (
                          formatDate(lastVisit)
                        ) : (
                          <span className="text-muted-foreground">
                            Sin visitas
                          </span>
                        )}
                      </TD>
                      <TD>
                        <HealthStatusChip status={patient.estadoSanitario} />
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Link
                            href={base}
                            className="text-brand-700 hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium"
                          >
                            Ver ficha
                          </Link>
                          <Link
                            href={`${VET_BASE}/sala-de-espera?paciente=${patient.id}`}
                            className="text-foreground hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium"
                          >
                            Registrar llegada
                          </Link>
                          <Link
                            href={`${base}/historial`}
                            className="text-foreground hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium"
                          >
                            Historial
                          </Link>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-muted-foreground mt-4 text-sm">
        {patients.length} paciente{patients.length === 1 ? "" : "s"}.
      </p>

      <NewPatientModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
