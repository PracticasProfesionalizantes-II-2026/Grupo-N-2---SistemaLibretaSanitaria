export type Species = "perro" | "gato" | "otro";
export type Sex = "macho" | "hembra";

/**
 * Estado sanitario derivado de las vacunas: define el chip de color en toda la
 * app.
 *
 * `"sin-datos"` no es un matiz de `"al-dia"`, es su opuesto. Sin él, una
 * mascota de la que no sabemos NADA se mostraba en verde y con la palabra "Al
 * día" — y eso llegaba hasta la ficha pública del collar, que es lo que lee un
 * desconocido después de una mordedura. Afirmar que está al día sobre cero
 * evidencia es la peor forma de equivocarse que tiene este sistema.
 *
 * El padrón municipal ya había necesitado este cuarto estado y lo venía
 * parchando por fuera, con dos componentes envoltorio que lo interceptaban
 * antes de llegar al chip compartido (`CensusRabiesStatus`). Ahora vive acá,
 * que es donde se produce.
 */
export type HealthStatus = "al-dia" | "por-vencer" | "vencida" | "sin-datos";

export type Pet = {
  id: string;
  nombre: string;
  especie: Species;
  raza: string;
  sexo: Sex;
  fechaNacimiento: string;
  pesoKg: number;
  color: string;
  castrado: boolean;
  microchip?: string;
  tipoSangre?: string;
  veterinariaCabecera?: string;
  estadoSanitario: HealthStatus;
  qrCode: string;
  fotoUrl?: string;
};

/** Un registro cargado por el dueño queda "no verificado" hasta que lo valide un veterinario. */
export type RecordSource = "veterinario" | "dueno";

export type Consultation = {
  id: string;
  petId: string;
  fecha: string;
  tipo: string;
  veterinario: string;
  veterinaria: string;
  diagnostico: string;
  observaciones: string;
  firmaDigital: boolean;
};

export type VaccineStatus = "aplicada" | "proxima" | "vencida";

export type Vaccination = {
  id: string;
  petId: string;
  vacuna: string;
  dosis: string;
  fechaAplicacion: string;
  proximaDosis?: string;
  lugar: string;
  veterinario?: string;
  estado: VaccineStatus;
  origen: RecordSource;
  /**
   * Solo presente en una dosis autodeclarada contra el QR de una campaña:
   * `"pendiente"` mientras espera revisión, `"rechazada"` si el veterinario
   * la rechazó. `undefined` en cualquier otro caso, incluida una carga manual
   * del dueño fuera de una campaña (esa sigue distinguiéndose solo por
   * `origen`, sin pasar por revisión).
   */
  revision?: "pendiente" | "rechazada";
};

export type Antiparasitic = {
  id: string;
  petId: string;
  producto: string;
  tipo: "interno" | "externo";
  fecha: string;
  proximaAplicacion?: string;
  origen: RecordSource;
};

export type Medication = {
  id: string;
  petId: string;
  medicamento: string;
  dosis: string;
  frecuencia: string;
  desde: string;
  hasta?: string;
  indicaciones: string;
  notasDueno?: string;
  origen: RecordSource;
};

export type Condition = {
  id: string;
  petId: string;
  nombre: string;
  tipo: "enfermedad" | "alergia";
  descripcion: string;
  fechaDiagnostico: string;
  origen: RecordSource;
};

export type WeightEntry = {
  id: string;
  petId: string;
  fecha: string;
  pesoKg: number;
  nota?: string;
  origen: RecordSource;
};

export type PetDocument = {
  id: string;
  petId: string;
  titulo: string;
  tipo: "estudio" | "receta" | "certificado" | "otro";
  fecha: string;
  archivo: string;
  tamano: string;
};

export type PetNote = {
  id: string;
  petId: string;
  fecha: string;
  contenido: string;
};
