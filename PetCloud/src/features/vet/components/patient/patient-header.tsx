"use client";

import {
  FileCheck2,
  Mail,
  MapPin,
  Phone,
  Pill,
  Stethoscope,
  Syringe,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import { CertificateModal } from "@/features/vet/components/patient/certificate-modal";
import { TreatmentModal } from "@/features/vet/components/patient/treatment-modal";
import { capitalize, formatAge } from "@/lib/format";
import type { Condition } from "@/types/pet";
import type { Patient, PatientOwner } from "@/types/vet";

export function PatientHeader({
  patient,
  owner,
  alerts,
}: {
  patient: Patient;
  owner?: PatientOwner;
  alerts: Condition[];
}) {
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);

  const base = `${VET_BASE}/pacientes/${patient.id}`;

  const chips = [
    capitalize(patient.especie),
    patient.raza,
    capitalize(patient.sexo),
    formatAge(patient.fechaNacimiento),
    `${patient.pesoKg} kg`,
    patient.castrado ? "Castrado" : "Sin castrar",
    // La edad sale vacía cuando no hay fecha de nacimiento, y un chip vacío se
    // renderiza igual: queda un badge sin texto al lado de los que sí tienen.
  ].filter(Boolean);

  return (
    <>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={patient.nombre} src={patient.fotoUrl} size="xl" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-foreground text-2xl font-bold tracking-tight">
                {patient.nombre}
              </h1>
              <HealthStatusChip status={patient.estadoSanitario} />
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {patient.qrCode}
              {patient.microchip ? ` · microchip ${patient.microchip}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge key={chip} variant="neutral">
                  {chip}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/*
          En mobile las cinco acciones no entran en una fila sin superponerse:
          en vez de partirlas en más filas (que empuja el resto de la ficha
          hacia abajo), se hace scroll horizontal. `shrink-0` evita que los
          botones se compriman, y la scrollbar se oculta porque acá cumple una
          función de swipe, no de navegación que el usuario necesite ver.
        */}
        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 xl:mx-0 xl:flex-wrap xl:overflow-x-visible xl:px-0 xl:pb-0">
          <ButtonLink
            href={`${base}/consulta`}
            size="sm"
            className="shrink-0 whitespace-nowrap"
          >
            <Stethoscope className="size-4" />
            Nueva consulta
          </ButtonLink>
          <ButtonLink
            href={`${base}/vacunacion`}
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
          >
            <Syringe className="size-4" />
            Cargar vacuna
          </ButtonLink>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setTreatmentOpen(true)}
          >
            <Pill className="size-4" />
            Cargar tratamiento
          </Button>
          <ButtonLink
            href={`${VET_BASE}/sala-de-espera?paciente=${patient.id}`}
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
          >
            <UserPlus className="size-4" />
            Registrar llegada
          </ButtonLink>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setCertificateOpen(true)}
          >
            <FileCheck2 className="size-4" />
            Generar certificado
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase">
            Dueño
          </h2>
          <p className="text-foreground mt-2 font-medium">
            {owner?.nombre ?? "Sin datos"}
          </p>
          {/*
            Cada dato se muestra solo si existe: un renglón "DNI" vacío o un
            enlace mailto: sin dirección hacen creer que el dato está y no se
            puede leer, que es peor que no mostrarlo.
          */}
          {owner ? (
            <div className="text-muted-foreground mt-2 space-y-1.5 text-sm">
              {owner.dni ? <p>DNI {owner.dni}</p> : null}
              {owner.telefono ? (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0" />
                  <a href={`tel:${owner.telefono}`} className="hover:underline">
                    {owner.telefono}
                  </a>
                </p>
              ) : null}
              {owner.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0" />
                  <a
                    href={`mailto:${owner.email}`}
                    className="truncate hover:underline"
                  >
                    {owner.email}
                  </a>
                </p>
              ) : null}
              {owner.direccion ? (
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" />
                  <span>{owner.direccion}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        {/*
          Las alertas van arriba de todo y en rojo: es la información que no se
          puede pasar por alto antes de medicar (alergias, crónicas).
        */}
        <Card className="border-danger/25 bg-danger-soft p-4">
          <h2 className="text-danger flex items-center gap-2 text-xs font-semibold uppercase">
            <TriangleAlert className="size-4" />
            Alertas
          </h2>

          {alerts.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              Sin alergias ni enfermedades crónicas registradas.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <p className="text-danger text-sm font-semibold">
                    {alert.nombre}
                    <span className="ml-2 font-normal opacity-80">
                      {alert.tipo === "alergia" ? "Alergia" : "Crónica"}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {alert.descripcion}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <TreatmentModal
        open={treatmentOpen}
        onClose={() => setTreatmentOpen(false)}
        patientName={patient.nombre}
      />
      <CertificateModal
        open={certificateOpen}
        onClose={() => setCertificateOpen(false)}
        patient={patient}
        ownerName={owner?.nombre}
      />
    </>
  );
}
