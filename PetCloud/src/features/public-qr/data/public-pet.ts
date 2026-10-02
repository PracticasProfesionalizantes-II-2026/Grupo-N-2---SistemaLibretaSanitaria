import "server-only";

import { sql } from "drizzle-orm";

import { healthStatus } from "@/features/owner/lib/mappers";
import {
  parseEstadoAntirrabica,
  type EstadoAntirrabica,
} from "@/features/public-qr/lib/rabies-status";
import { parseQrPublicConfig } from "@/features/public-qr/lib/qr-public-config";
import {
  proyectarMascotaPublica,
  type PublicPet,
  type PublicPetRow,
} from "@/features/public-qr/lib/public-pet-projection";
import { getDb, query, rpc, withServiceRole } from "@/lib/db";
import { isQrCode } from "@/lib/qr-code";

/**
 * La ficha del collar: lo único que PetCloud le muestra a un desconocido.
 *
 * Datos básicos de la mascota (filtrados por la privacidad que eligió el
 * dueño en `qr_public_config`) y el estado de la antirrábica. Nunca la
 * historia clínica ni datos de contacto del dueño.
 */

export type { PublicPet };

export type PublicPetResult =
  | { estado: "ok"; petId: string; mascota: PublicPet }
  | { estado: "revocado" }
  | { estado: "no-encontrada" }
  | { estado: "qr-invalido" };

type Fila = PublicPetRow & { id: string; qr_public_config: unknown };

export async function getPublicPetByQr(
  qrCode: string,
): Promise<PublicPetResult> {
  const codigo = qrCode.trim().toUpperCase();
  if (!isQrCode(codigo)) return { estado: "qr-invalido" };

  const db = getDb();
  const [mascota] = await query<Fila>(
    db,
    sql`select id, name, species, breed, sex, date_of_birth::text, color,
               neutered, photo_url, qr_code, municipal_registry_number,
               microchip_number, qr_public_config
          from pets where qr_code = ${codigo} limit 1`,
  );

  if (!mascota) {
    // Puede ser una chapita vieja: decirlo es mejor que un "no existe".
    const [historico] = await query<{ revoked_at: string | null }>(
      db,
      sql`select revoked_at from pet_qr_codes where code = ${codigo} limit 1`,
    );
    return historico?.revoked_at
      ? { estado: "revocado" }
      : { estado: "no-encontrada" };
  }

  const config = parseQrPublicConfig(mascota.qr_public_config);

  let salud: Parameters<typeof proyectarMascotaPublica>[2] = null;
  if (config.show_vaccination) {
    const [vacunas, estadoAntirrabica] = await Promise.all([
      query<{ next_dose_at: string | null }>(
        db,
        sql`select next_dose_at::text from vaccinations where pet_id = ${mascota.id}`,
      ),
      estadoAntirrabicaPublico(mascota.id),
    ]);
    salud = { estadoSanitario: healthStatus(vacunas), estadoAntirrabica };
  }

  return {
    estado: "ok",
    petId: mascota.id,
    mascota: proyectarMascotaPublica(mascota, config, salud),
  };
}

/**
 * El estado antirrábico que muestra la ficha pública. `public_rabies_status`
 * solo se le concede a `service_role`: quien llama tiene que haber comprobado
 * antes que la persona puede ver esa mascota.
 */
export async function estadoAntirrabicaPublico(
  petId: string,
): Promise<EstadoAntirrabica> {
  const [fila] = await withServiceRole((tx) =>
    rpc<{ public_rabies_status: string | null }>(tx, "public_rabies_status", {
      p_pet_id: petId,
    }),
  );
  return parseEstadoAntirrabica(fila?.public_rabies_status);
}
