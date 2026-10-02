import type { Metadata } from "next";

import { SignatureSection } from "@/features/vet/components/settings/signature-section";
import { VetSettingsView } from "@/features/vet/components/settings/vet-settings-view";
import { getMyLatestLicenseReview } from "@/features/vet/data/license-review";
import { listMySignatures } from "@/features/vet/data/signatures";
import { requireVet } from "@/features/vet/lib/vet-session";

export const metadata: Metadata = { title: "Configuración" };

/**
 * La sección de firma se arma acá y baja como slot: leer `vet_signatures` y
 * firmar las URL del bucket privado es trabajo de servidor. Mismo patrón que
 * `accesoModulos` en `/veterinaria/institucion`.
 */
export default async function VetSettingsPage() {
  const vet = await requireVet();
  const [firmas, revision] = await Promise.all([
    listMySignatures(),
    vet.licenciaValidada
      ? Promise.resolve(null)
      : getMyLatestLicenseReview(vet.profesionalId),
  ]);

  const nombre = [vet.usuario.nombre, vet.usuario.apellido]
    .filter(Boolean)
    .join(" ");

  return (
    <VetSettingsView
      firma={
        <SignatureSection
          firmas={firmas}
          rolEnInstitucion={vet.rolEnInstitucion}
          licenciaValidada={vet.licenciaValidada}
          rechazo={revision && !revision.validada ? revision : null}
          matricula={vet.matricula}
          nombre={nombre}
        />
      }
    />
  );
}
