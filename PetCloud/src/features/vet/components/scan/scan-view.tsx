"use client";

import { Search, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { QrCameraScanner } from "@/components/ui/qr-camera-scanner";
import { PatientResultCard } from "@/features/vet/components/scan/patient-result-card";
import {
  UNVALIDATED_INSTITUTION_MESSAGE,
  UnvalidatedInstitutionNotice,
  useInstitutionValidated,
} from "@/features/vet/components/shared/unvalidated-institution-notice";
import {
  findPetByQr,
  searchPatients,
  type PatientSearchResult,
} from "@/features/vet/actions/scan-actions";
import { extractQrCode } from "@/lib/qr-code";
import type { Patient, PatientOwner } from "@/types/vet";

/** Formato del número de registro impreso en la credencial. */
type ScanError = "invalido" | "no-encontrado" | "revocado" | "sin-validar";

const ERROR_COPY: Record<ScanError, { titulo: string; detalle: string }> = {
  invalido: {
    titulo: "QR inválido",
    detalle:
      "El código no tiene el formato de una credencial PetCloud (PC-XXXX-XXXX). Revisá que no esté dañado o buscá al paciente a mano.",
  },
  "no-encontrado": {
    titulo: "Mascota no encontrada",
    detalle:
      "El código es válido pero no corresponde a ninguna mascota registrada. Puede ser una credencial dada de baja.",
  },
  // El collar viejo sigue dando vueltas colgado del animal: decirle "no
  // encontrada" a quien lo tiene adelante sería esconder que la mascota sí está.
  revocado: {
    titulo: "Credencial dada de baja",
    detalle:
      "Ese código lo dio de baja el dueño y ya no está vigente. La mascota sigue registrada con una credencial nueva: buscala a mano por su nombre.",
  },
  // 080: la base no le devuelve la mascota a una clínica sin validar si no es
  // paciente suya. No se sabe si existe, y "no encontrada" sería mentir.
  "sin-validar": {
    titulo: "Todavía no podés buscar pacientes nuevos",
    detalle: UNVALIDATED_INSTITUTION_MESSAGE,
  },
};

export function ScanView() {
  const searchParams = useSearchParams();
  // El acceso rápido "Nueva consulta" entra por acá: cambia a dónde lleva el resultado.
  const goToConsultation = searchParams.get("accion") === "consulta";

  const [manualCode, setManualCode] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{
    patient: Patient;
    owner: PatientOwner | null;
  } | null>(null);
  const [error, setError] = useState<ScanError | null>(null);
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  // 080: sin validar, el escaneo y la búsqueda solo traen pacientes propios.
  const institucionValidada = useInstitutionValidated();

  // La búsqueda consulta la base, con una pausa para no disparar una consulta
  // por tecla.
  useEffect(() => {
    let vigente = true;

    const timer = setTimeout(async () => {
      const encontrados =
        query.trim().length < 2 ? [] : await searchPatients(query);

      if (vigente) setResults(encontrados);
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [query]);

  async function resolveCode(rawCode: string) {
    setFound(null);

    const resultado = await findPetByQr(rawCode);

    if (resultado.estado === "ok") {
      setError(null);
      setFound({ patient: resultado.paciente, owner: resultado.owner });
      return;
    }

    setError(
      resultado.estado === "qr-invalido"
        ? "invalido"
        : resultado.estado === "revocado"
          ? "revocado"
          : institucionValidada
            ? "no-encontrado"
            : "sin-validar",
    );
  }

  function handleScan(texto: string) {
    resolveCode(extractQrCode(texto) ?? texto);
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Escanear QR"
        description="Identificá al paciente con su credencial o buscalo a mano si no la trajo."
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Escanear QR" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Cámara</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Apuntá al QR de la credencial o del collar.
          </p>

          <QrCameraScanner onDecode={handleScan} className="mt-5" />

          <div className="border-border mt-5 border-t pt-5">
            <Field
              label="O ingresá el número de registro"
              htmlFor="codigo-qr"
              hint="Está impreso debajo del QR, con el formato PC-XXXX-XXXX."
            >
              <div className="flex gap-2">
                <Input
                  id="codigo-qr"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="PC-8F3A-2K9D"
                  className="uppercase"
                />
                <Button
                  variant="outline"
                  onClick={() => resolveCode(manualCode)}
                  disabled={!manualCode.trim()}
                >
                  Buscar
                </Button>
              </div>
            </Field>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-foreground font-semibold">Búsqueda manual</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Por nombre de la mascota, del dueño, DNI o nº de registro.
            </p>

            <div className="relative mt-4">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Firulais, Sofía Ramírez, 35.482.109…"
                className="pl-9"
                aria-label="Buscar paciente"
              />
            </div>

            {query.trim().length >= 2 ? (
              results.length === 0 ? (
                institucionValidada ? (
                  <Alert variant="warning" className="mt-4">
                    No encontramos ningún paciente que coincida con “{query}”.
                    Verificá el dato o dalo de alta como paciente nuevo.
                  </Alert>
                ) : (
                  <UnvalidatedInstitutionNotice className="mt-4" />
                )
              ) : (
                <ul className="mt-4 space-y-3">
                  {results.map(({ patient, owner }) => (
                    <li key={patient.id}>
                      <PatientResultCard
                        patient={patient}
                        owner={owner}
                        goToConsultation={goToConsultation}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </Card>

          {error ? (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="bg-danger-soft text-danger flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <ShieldAlert className="size-5" />
                </span>
                <div>
                  <h2 className="text-foreground font-semibold">
                    {ERROR_COPY[error].titulo}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {ERROR_COPY[error].detalle}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setError(null)}
                  >
                    Reintentar
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {found ? (
            <div>
              <h2 className="text-foreground mb-3 font-semibold">
                Paciente identificado
              </h2>
              <PatientResultCard
                patient={found.patient}
                owner={found.owner}
                goToConsultation={goToConsultation}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
