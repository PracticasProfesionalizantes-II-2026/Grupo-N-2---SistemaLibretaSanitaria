import { describe, expect, it } from "vitest";

import {
  appointmentRescheduleSchema,
  appointmentSchema,
  clinicSchema,
  consultationSchema,
  newPatientSchema,
  treatmentSchema,
  vaccinationSchema,
  vaccinePresetSchema,
} from "@/features/vet/schemas/vet-schemas";

const TRATAMIENTO_VALIDO = {
  medicamento: "Amoxicilina",
  cantidad: "250 mg",
  tipo: "antibiotico",
  frecuencia: "cada-12h",
  duracion: "7 días",
};

describe("treatmentSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(treatmentSchema.safeParse(TRATAMIENTO_VALIDO).success).toBe(true);
  });

  it("acepta el caso completo con indicaciones", () => {
    const r = treatmentSchema.safeParse({
      ...TRATAMIENTO_VALIDO,
      indicaciones: "Administrar con comida",
    });
    expect(r.success).toBe(true);
  });

  it("exige todos los campos menos las indicaciones", () => {
    for (const campo of [
      "medicamento",
      "cantidad",
      "tipo",
      "frecuencia",
      "duracion",
    ]) {
      const r = treatmentSchema.safeParse({
        ...TRATAMIENTO_VALIDO,
        [campo]: "",
      });
      expect(r.success, campo).toBe(false);
    }
  });
});

const CONSULTA_VALIDA = {
  fecha: "2026-08-11",
  hora: "10:30",
  tipo: "control" as const,
  motivo: "Control anual",
  diagnostico: "Sano",
  pesoKg: 12.5,
};

describe("consultationSchema", () => {
  it("acepta el caso mínimo válido, sin bloque de tratamiento", () => {
    expect(consultationSchema.safeParse(CONSULTA_VALIDA).success).toBe(true);
  });

  it("acepta el caso completo con tratamiento coherente", () => {
    const r = consultationSchema.safeParse({
      ...CONSULTA_VALIDA,
      observaciones: "Sin novedades",
      proximoControl: "2027-08-11",
      medicamento: "Amoxicilina",
      cantidad: "250 mg",
      tipoMedicamento: "antibiotico",
      frecuencia: "cada-12h",
      duracion: "7 días",
    });
    expect(r.success).toBe(true);
  });

  it("acepta los cinco tipos de consulta", () => {
    for (const tipo of [
      "control",
      "urgencia",
      "cirugia",
      "vacunacion",
      "otro",
    ]) {
      const r = consultationSchema.safeParse({ ...CONSULTA_VALIDA, tipo });
      expect(r.success, tipo).toBe(true);
    }
  });

  it("rechaza NaN en el peso, que es como llega un campo vacío", () => {
    const r = consultationSchema.safeParse({ ...CONSULTA_VALIDA, pesoKg: NaN });
    expect(r.success).toBe(false);
  });

  it("rechaza un peso de cero", () => {
    const r = consultationSchema.safeParse({ ...CONSULTA_VALIDA, pesoKg: 0 });
    expect(r.success).toBe(false);
  });

  it("si se carga el medicamento, exige cantidad, frecuencia y duración", () => {
    const r = consultationSchema.safeParse({
      ...CONSULTA_VALIDA,
      medicamento: "Amoxicilina",
    });

    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.issues.map((i) => String(i.path[0]));
      expect(campos).toContain("cantidad");
      expect(campos).toContain("frecuencia");
      expect(campos).toContain("duracion");
    }
  });

  it("un medicamento en blanco no dispara la exigencia del bloque", () => {
    const r = consultationSchema.safeParse({
      ...CONSULTA_VALIDA,
      medicamento: "   ",
    });
    expect(r.success).toBe(true);
  });
});

const VACUNACION_VALIDA = {
  vacuna: "Antirrábica",
  laboratorio: "Biogénesis",
  lote: "RB-2026-0823",
  dosis: "1 ml",
  via: "subcutanea",
  fechaAplicacion: "2026-08-11",
  proximaDosis: "2027-08-11",
  lugar: "Vet San Roque",
};

describe("vaccinationSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(vaccinationSchema.safeParse(VACUNACION_VALIDA).success).toBe(true);
  });

  it("exige el lote: sin eso el reporte municipal no cierra", () => {
    const r = vaccinationSchema.safeParse({ ...VACUNACION_VALIDA, lote: "" });

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("reporte municipal");
    }
  });

  it("exige el resto de los datos de la dosis", () => {
    for (const campo of ["vacuna", "laboratorio", "dosis", "via", "lugar"]) {
      const r = vaccinationSchema.safeParse({
        ...VACUNACION_VALIDA,
        [campo]: "",
      });
      expect(r.success, campo).toBe(false);
    }
  });

  it("exige la próxima dosis: es lo que arma el recordatorio del dueño", () => {
    const r = vaccinationSchema.safeParse({
      ...VACUNACION_VALIDA,
      proximaDosis: "",
    });
    expect(r.success).toBe(false);
  });
});

const PRESET_VALIDO = {
  vacuna: "Antirrábica",
  laboratorio: "Biogénesis Bagó",
  via: "Inyectable",
  dosisPorDefecto: "Dosis única",
  intervaloMeses: 12,
  especies: ["perro", "gato"] as const,
  obligatoria: true,
};

describe("vaccinePresetSchema", () => {
  it("acepta el caso válido completo", () => {
    expect(vaccinePresetSchema.safeParse(PRESET_VALIDO).success).toBe(true);
  });

  it("exige los datos de texto del preset", () => {
    for (const campo of ["vacuna", "laboratorio", "via", "dosisPorDefecto"]) {
      const r = vaccinePresetSchema.safeParse({
        ...PRESET_VALIDO,
        [campo]: "",
      });
      expect(r.success, campo).toBe(false);
    }
  });

  it("exige al menos una especie", () => {
    const r = vaccinePresetSchema.safeParse({
      ...PRESET_VALIDO,
      especies: [],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una especie fuera de la lista", () => {
    const r = vaccinePresetSchema.safeParse({
      ...PRESET_VALIDO,
      especies: ["caballo"],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un intervalo de cero o negativo", () => {
    for (const intervaloMeses of [0, -1]) {
      const r = vaccinePresetSchema.safeParse({
        ...PRESET_VALIDO,
        intervaloMeses,
      });
      expect(r.success, String(intervaloMeses)).toBe(false);
    }
  });

  it("rechaza un intervalo que no sea un número entero de meses", () => {
    const r = vaccinePresetSchema.safeParse({
      ...PRESET_VALIDO,
      intervaloMeses: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("acepta una vacuna no obligatoria", () => {
    const r = vaccinePresetSchema.safeParse({
      ...PRESET_VALIDO,
      obligatoria: false,
    });
    expect(r.success).toBe(true);
  });
});

const TURNO_VALIDO = {
  petId: "firulais",
  startsAt: "2026-08-12T10:30:00.000Z",
  duracionMin: 30,
  profesionalId: "vet-1",
  motivo: "Control",
};

describe("appointmentSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(appointmentSchema.safeParse(TURNO_VALIDO).success).toBe(true);
  });

  it("acepta el caso completo con notas internas", () => {
    const r = appointmentSchema.safeParse({
      ...TURNO_VALIDO,
      notasInternas: "Llega con la libreta de papel",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza la duración como texto", () => {
    const r = appointmentSchema.safeParse({
      ...TURNO_VALIDO,
      duracionMin: "30",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una duración que no sea un número entero de minutos", () => {
    const r = appointmentSchema.safeParse({
      ...TURNO_VALIDO,
      duracionMin: 30.5,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una duración fuera del rango de la base (5 a 480 minutos)", () => {
    for (const duracionMin of [0, 4, 481, -10]) {
      const r = appointmentSchema.safeParse({ ...TURNO_VALIDO, duracionMin });
      expect(r.success, String(duracionMin)).toBe(false);
    }
  });

  it("acepta los extremos del rango válido", () => {
    for (const duracionMin of [5, 480]) {
      const r = appointmentSchema.safeParse({ ...TURNO_VALIDO, duracionMin });
      expect(r.success, String(duracionMin)).toBe(true);
    }
  });

  it("exige el paciente y el profesional", () => {
    for (const campo of ["petId", "profesionalId"]) {
      const r = appointmentSchema.safeParse({ ...TURNO_VALIDO, [campo]: "" });
      expect(r.success, campo).toBe(false);
    }
  });

  it("exige el motivo", () => {
    const r = appointmentSchema.safeParse({ ...TURNO_VALIDO, motivo: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza startsAt vacío", () => {
    const r = appointmentSchema.safeParse({ ...TURNO_VALIDO, startsAt: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza un startsAt que no es una fecha y hora válidas", () => {
    const r = appointmentSchema.safeParse({
      ...TURNO_VALIDO,
      startsAt: "no-es-una-fecha",
    });
    expect(r.success).toBe(false);
  });
});

const REPROGRAMACION_VALIDA = {
  startsAt: "2026-08-15T14:00:00.000Z",
};

describe("appointmentRescheduleSchema", () => {
  it("acepta solo la nueva fecha y horario, sin tocar la duración", () => {
    const r = appointmentRescheduleSchema.safeParse(REPROGRAMACION_VALIDA);
    expect(r.success).toBe(true);
  });

  it("acepta además una nueva duración", () => {
    const r = appointmentRescheduleSchema.safeParse({
      ...REPROGRAMACION_VALIDA,
      duracionMin: 45,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza una fecha y horario inválidos", () => {
    const r = appointmentRescheduleSchema.safeParse({
      startsAt: "no-es-una-fecha",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una duración fuera de rango cuando se manda", () => {
    const r = appointmentRescheduleSchema.safeParse({
      ...REPROGRAMACION_VALIDA,
      duracionMin: 481,
    });
    expect(r.success).toBe(false);
  });
});

const PACIENTE_VALIDO = {
  nombre: "Firulais",
  especie: "perro" as const,
  raza: "Mestizo",
  sexo: "macho" as const,
  fechaNacimiento: "2023-05-10",
  pesoKg: 12.5,
  duenoNombre: "Ana Pérez",
  duenoDni: "30111222",
  duenoTelefono: "11 5555-5555",
  duenoEmail: "ana@ejemplo.com",
};

describe("newPatientSchema", () => {
  it("acepta el caso válido completo", () => {
    expect(newPatientSchema.safeParse(PACIENTE_VALIDO).success).toBe(true);
  });

  it("exige el email del dueño, a diferencia del padrón municipal", () => {
    // Acá el correo es el que después activa la cuenta del dueño.
    const r = newPatientSchema.safeParse({
      ...PACIENTE_VALIDO,
      duenoEmail: "",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un peso de cero", () => {
    const r = newPatientSchema.safeParse({ ...PACIENTE_VALIDO, pesoKg: 0 });
    expect(r.success).toBe(false);
  });

  it("rechaza una especie fuera de la lista", () => {
    const r = newPatientSchema.safeParse({
      ...PACIENTE_VALIDO,
      especie: "caballo",
    });
    expect(r.success).toBe(false);
  });
});

describe("clinicSchema", () => {
  it("acepta el caso mínimo válido", () => {
    const r = clinicSchema.safeParse({
      nombre: "Vet San Roque",
      direccion: "Av. Mitre 2450",
      telefono: "11 4791-5520",
    });
    expect(r.success).toBe(true);
  });

  it("acepta el caso completo con web", () => {
    const r = clinicSchema.safeParse({
      nombre: "Vet San Roque",
      direccion: "Av. Mitre 2450",
      telefono: "11 4791-5520",
      web: "vetsanroque.com.ar",
    });
    expect(r.success).toBe(true);
  });

  it("no acepta ciudad ni email: vet_institutions no los guarda", () => {
    // Un campo que se completa y no se guarda es peor que uno que no está.
    const r = clinicSchema.safeParse({
      nombre: "Vet San Roque",
      direccion: "Av. Mitre 2450",
      telefono: "11 4791-5520",
      ciudad: "Vicente López",
      email: "contacto@vetsanroque.com.ar",
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("ciudad");
      expect(r.data).not.toHaveProperty("email");
    }
  });

  it("exige nombre, dirección y teléfono", () => {
    for (const campo of ["nombre", "direccion", "telefono"]) {
      const r = clinicSchema.safeParse({
        nombre: "Vet San Roque",
        direccion: "Av. Mitre 2450",
        telefono: "11 4791-5520",
        [campo]: "",
      });
      expect(r.success, campo).toBe(false);
    }
  });

  const BASE = {
    nombre: "Vet San Roque",
    direccion: "Av. Mitre 2450",
    telefono: "11 4791-5520",
  };

  it("acepta coordenadas válidas, las dos juntas", () => {
    const r = clinicSchema.safeParse({
      ...BASE,
      latitud: -34.526,
      longitud: -58.526,
    });
    expect(r.success).toBe(true);
  });

  it("sin coordenadas, sigue siendo válido (ambas opcionales)", () => {
    const r = clinicSchema.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it("string vacío en ambas coordenadas se coerciona a ausente, no a error", () => {
    const r = clinicSchema.safeParse({ ...BASE, latitud: "", longitud: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.latitud).toBeUndefined();
      expect(r.data.longitud).toBeUndefined();
    }
  });

  it("rechaza una coordenada sin la otra — latitud sola", () => {
    const r = clinicSchema.safeParse({ ...BASE, latitud: -34.526 });
    expect(r.success).toBe(false);
  });

  it("rechaza una coordenada sin la otra — longitud sola", () => {
    const r = clinicSchema.safeParse({ ...BASE, longitud: -58.526 });
    expect(r.success).toBe(false);
  });

  it("rechaza latitud fuera de -90..90", () => {
    const r = clinicSchema.safeParse({ ...BASE, latitud: 91, longitud: 0 });
    expect(r.success).toBe(false);
  });

  it("rechaza longitud fuera de -180..180", () => {
    const r = clinicSchema.safeParse({ ...BASE, latitud: 0, longitud: 181 });
    expect(r.success).toBe(false);
  });

  it("acepta los límites exactos del rango", () => {
    const r = clinicSchema.safeParse({ ...BASE, latitud: -90, longitud: 180 });
    expect(r.success).toBe(true);
  });
});
