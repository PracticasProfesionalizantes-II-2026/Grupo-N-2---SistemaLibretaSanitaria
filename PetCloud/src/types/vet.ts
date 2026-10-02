import type { Pet } from "@/types/pet";

/**
 * Tipos del panel de la veterinaria.
 *
 * La mascota es la misma entidad que ve el dueño (`Pet`): el valor del producto
 * es que los tres actores miran el mismo registro. Acá solo se agrega el
 * contexto que existe únicamente del lado de la institución (dueño de contacto,
 * lote de vacuna, profesional que firma, notas internas).
 */

export type PatientOwner = {
  id: string;
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  direccion: string;
};

/** Un paciente es una mascota vista desde la veterinaria que la atiende. */
export type Patient = Pet & { ownerId: string };

export type ProfessionalRole = "titular" | "profesional" | "asistente";

/**
 * `matricula-pendiente` es el estado en el que queda un profesional recién
 * invitado hasta que el backoffice de PetCloud valida su matrícula: puede
 * entrar, pero no firmar.
 */
export type ProfessionalStatus =
  "activo" | "matricula-pendiente" | "invitado" | "inactivo";

export type ProfessionalPermission =
  "consultas" | "vacunas" | "agenda" | "pacientes" | "institucion" | "reportes";

export type Professional = {
  id: string;
  nombre: string;
  /**
   * `null` para quien no ejerce: un recepcionista no tiene matrícula, y desde
   * la 058 la base lo dice en vez de obligar a inventar un número. Quien firma
   * siempre la tiene — lo garantiza el CHECK por rol, no este tipo.
   */
  matricula: string | null;
  especialidad: string;
  email: string;
  rol: ProfessionalRole;
  estado: ProfessionalStatus;
  permisos: ProfessionalPermission[];
  firmaCargada: boolean;
};

/**
 * Registro institucional de una vacuna aplicada. Es más detallado que la
 * `Vaccination` que ve el dueño porque acá viven los datos que el municipio
 * exige en los reportes: laboratorio, lote y profesional responsable.
 */
export type VaccineApplication = {
  id: string;
  petId: string;
  vacuna: string;
  laboratorio: string;
  lote: string;
  dosis: string;
  via: string;
  fechaAplicacion: string;
  proximaDosis?: string;
  lugar: string;
  profesionalId: string;
};

/**
 * Preset de vacuna: los valores que el veterinario repetiría a mano en cada
 * dosis.
 */
export type VaccinePreset = {
  id: string;
  vacuna: string;
  laboratorio: string;
  via: string;
  dosisPorDefecto: string;
  /** Meses hasta la próxima dosis. Calcula el recordatorio del dueño. */
  intervaloMeses: number;
  especies: ("perro" | "gato" | "otro")[];
  /** Las obligatorias aparecen primero y preseleccionadas. */
  obligatoria: boolean;
};

export type VetNoticeType = "vencimiento" | "sistema";

export type VetNotice = {
  id: string;
  tipo: VetNoticeType;
  titulo: string;
  detalle: string;
  href: string;
};
