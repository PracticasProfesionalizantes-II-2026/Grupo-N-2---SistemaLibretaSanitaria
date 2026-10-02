import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  healthStatus,
  relativeTime,
  toDbRepeat,
  toDbSex,
  toDbSpecies,
  toReminder,
  toVaccination,
  vaccineStatus,
} from "@/features/owner/lib/mappers";
import { argentinaAUtcIso } from "@/lib/argentina-time";

/**
 * Los estados de vacuna se calculan contra "hoy", así que el reloj se congela:
 * sin eso el mismo test pasa hoy y falla dentro de treinta días.
 */
const HOY = new Date("2026-08-11T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("vaccineStatus", () => {
  it("sin próxima dosis queda como aplicada, no como vencida", () => {
    // Hay vacunas que no llevan refuerzo: marcarlas vencidas sería alarmar por
    // algo que no hay que hacer.
    expect(vaccineStatus(null)).toBe("aplicada");
  });

  it("una fecha pasada está vencida", () => {
    expect(vaccineStatus("2026-08-10")).toBe("vencida");
  });

  it("hoy mismo todavía no está vencida: está próxima", () => {
    expect(vaccineStatus("2026-08-11")).toBe("proxima");
  });

  it("dentro de la ventana de aviso está próxima", () => {
    expect(vaccineStatus("2026-08-25")).toBe("proxima");
  });

  it("el día 30 es el último que cuenta como próxima", () => {
    expect(vaccineStatus("2026-09-10")).toBe("proxima");
  });

  it("el día 31 ya vuelve a estar aplicada", () => {
    expect(vaccineStatus("2026-09-11")).toBe("aplicada");
  });

  it("una fecha lejana está aplicada", () => {
    expect(vaccineStatus("2027-08-11")).toBe("aplicada");
  });
});

describe("healthStatus", () => {
  /**
   * Este test decía "sin vacunas cargadas queda al día" y esperaba `"al-dia"`.
   * No describía una decisión: describía el `return` final al que caía una
   * lista vacía, y al escribirlo lo dejó blindado.
   *
   * Lo que blindaba se veía en la ficha pública del collar: una mascota sin una
   * sola dosis cargada le mostraba "Al día" en verde a cualquiera que escaneara
   * la chapita. Esa pantalla existe, entre otras cosas, para decidir qué hacer
   * después de una mordedura.
   *
   * Queda al revés y con el porqué a la vista, para que la próxima persona que
   * lo vea en rojo sepa que ponerlo en `"al-dia"` no es arreglar el test.
   */
  it("sin vacunas cargadas NO es 'al día': es 'sin datos'", () => {
    expect(healthStatus([])).toBe("sin-datos");
  });

  it("con vacunas pero ninguna con refuerzo pendiente sí está al día", () => {
    // La contracara, para que "sin-datos" no se coma este caso: acá SÍ hay
    // evidencia de vacunación. Hay vacunas que no llevan próxima dosis.
    expect(healthStatus([{ next_dose_at: null }])).toBe("al-dia");
  });

  it("todas lejanas: al día", () => {
    expect(
      healthStatus([{ next_dose_at: "2027-01-01" }, { next_dose_at: null }]),
    ).toBe("al-dia");
  });

  it("una próxima manda sobre las que están al día", () => {
    expect(
      healthStatus([
        { next_dose_at: "2027-01-01" },
        { next_dose_at: "2026-08-20" },
      ]),
    ).toBe("por-vencer");
  });

  it("una vencida manda sobre todo lo demás", () => {
    // Es lo que mira el municipio y lo que puede impedir entrar a una guardería.
    expect(
      healthStatus([
        { next_dose_at: "2027-01-01" },
        { next_dose_at: "2026-08-20" },
        { next_dose_at: "2026-01-01" },
      ]),
    ).toBe("vencida");
  });
});

describe("toVaccination", () => {
  /**
   * La fila base cubre todas las columnas que `Row<"vaccinations">` exige
   * hoy, incluidas las que agregó la 043 (`review_status` y las de
   * declaración por campaña); cada test solo pisa lo que le importa.
   */
  const FILA_BASE: Parameters<typeof toVaccination>[0] = {
    id: "vac-1",
    pet_id: "pet-1",
    application_route: null,
    applied_at: "2026-08-01",
    applied_by_id: null,
    campaign_id: null,
    created_at: "2026-08-01T00:00:00Z",
    created_by_id: null,
    declaration_session_id: null,
    declared_distance_m: null,
    dose_number: "1",
    location: "Plaza Belgrano",
    lot_number: null,
    manufacturer: null,
    medical_record_id: null,
    next_dose_at: null,
    rejection_reason: null,
    review_status: "not_applicable",
    reviewed_at: null,
    reviewed_by_id: null,
    // 063: la vacunación puede llevar el puntero a la firma congelada. Nace en
    // NULL y ningún trigger lo llena todavía.
    signature_id: null,
    updated_at: "2026-08-01T00:00:00Z",
    vaccine_name: "Antirrábica",
    verified: false,
  };

  it("sin review_status (carga manual del dueño, fuera de campaña) no tiene revision", () => {
    const vacunacion = toVaccination(FILA_BASE);
    expect(vacunacion.origen).toBe("dueno");
    expect(vacunacion.revision).toBeUndefined();
  });

  it("review_status 'not_applicable' tampoco tiene revision", () => {
    const vacunacion = toVaccination({
      ...FILA_BASE,
      review_status: "not_applicable",
    });
    expect(vacunacion.revision).toBeUndefined();
  });

  it("review_status 'pending' mapea a revision 'pendiente'", () => {
    const vacunacion = toVaccination({
      ...FILA_BASE,
      campaign_id: "camp-1",
      review_status: "pending",
    });
    expect(vacunacion.origen).toBe("dueno");
    expect(vacunacion.revision).toBe("pendiente");
  });

  it("review_status 'rejected' mapea a revision 'rechazada'", () => {
    const vacunacion = toVaccination({
      ...FILA_BASE,
      campaign_id: "camp-1",
      review_status: "rejected",
    });
    expect(vacunacion.origen).toBe("dueno");
    expect(vacunacion.revision).toBe("rechazada");
  });

  it("review_status 'verified' no tiene revision propia: ya lo distingue origen", () => {
    // Verificada por el veterinario: indistinguible de una dosis que el
    // veterinario cargó directamente, tal como pide la tarea 7.2 (`RecordSource`
    // se mantiene igual).
    const vacunacion = toVaccination({
      ...FILA_BASE,
      campaign_id: "camp-1",
      verified: true,
      review_status: "verified",
    });
    expect(vacunacion.origen).toBe("veterinario");
    expect(vacunacion.revision).toBeUndefined();
  });
});

describe("traducciones a la base", () => {
  it("mapea las tres especies", () => {
    expect(toDbSpecies("perro")).toBe("dog");
    expect(toDbSpecies("gato")).toBe("cat");
    expect(toDbSpecies("otro")).toBe("other");
  });

  it("mapea los dos sexos", () => {
    expect(toDbSex("macho")).toBe("male");
    expect(toDbSex("hembra")).toBe("female");
  });

  it("mapea las repeticiones de recordatorio", () => {
    expect(toDbRepeat("diaria")).toBe("daily");
    expect(toDbRepeat("semanal")).toBe("weekly");
    expect(toDbRepeat("mensual")).toBe("monthly");
    expect(toDbRepeat("anual")).toBe("yearly");
  });
});

describe("relativeTime", () => {
  const haceMinutos = (n: number) =>
    new Date(HOY.getTime() - n * 60_000).toISOString();

  it("dice «recién» debajo del minuto", () => {
    expect(relativeTime(haceMinutos(0))).toBe("recién");
  });

  it("cuenta minutos debajo de la hora", () => {
    expect(relativeTime(haceMinutos(5))).toBe("hace 5 min");
    expect(relativeTime(haceMinutos(59))).toBe("hace 59 min");
  });

  it("pasa a horas desde los 60 minutos", () => {
    expect(relativeTime(haceMinutos(60))).toBe("hace 1 h");
    expect(relativeTime(haceMinutos(60 * 5))).toBe("hace 5 h");
  });

  it("dice «ayer» a las 24 horas", () => {
    expect(relativeTime(haceMinutos(60 * 24))).toBe("ayer");
  });

  it("cuenta días entre dos y veintinueve", () => {
    expect(relativeTime(haceMinutos(60 * 24 * 3))).toBe("hace 3 días");
  });

  it("pasado el mes muestra la fecha, no un relativo eterno", () => {
    const resultado = relativeTime(haceMinutos(60 * 24 * 40));
    expect(resultado).not.toContain("hace");
    expect(resultado).toMatch(/\d/);
  });
});

describe("zona horaria argentina", () => {
  it("después de las 21:00 sigue siendo hoy en Argentina, no mañana (UTC)", () => {
    // 23:30 del 11/08 en Argentina = 02:30 UTC del 12/08.
    vi.setSystemTime(new Date("2026-08-12T02:30:00Z"));
    // Vence el 11/08: en Argentina es hoy, así que todavía no está vencida.
    expect(vaccineStatus("2026-08-11")).toBe("proxima");
  });

  it("toReminder muestra la hora argentina que se cargó, no la de UTC", () => {
    const scheduled_at = argentinaAUtcIso("2026-09-26", "22:15");
    const reminder = toReminder({
      id: "r1",
      pet_id: "p1",
      owner_id: "o1",
      title: "Pastilla",
      description: null,
      scheduled_at,
      repeat: "once",
      channel: "push",
      status: "pending",
      source: "manual",
      source_id: null,
      sent_at: null,
      created_at: scheduled_at,
      updated_at: scheduled_at,
    } as Parameters<typeof toReminder>[0]);

    expect(scheduled_at).toBe("2026-09-27T01:15:00.000Z");
    expect(reminder.fecha).toBe("2026-09-26");
    expect(reminder.hora).toBe("22:15");
  });
});
