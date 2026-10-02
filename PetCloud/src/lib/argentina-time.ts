/**
 * Fechas y horas en America/Argentina/Buenos_Aires, sin depender de la zona
 * horaria del proceso (en producción suele ser UTC) ni del navegador.
 *
 * Los `timestamptz` viajan en UTC: `iso.slice(11, 16)` o
 * `toISOString().slice(0, 10)` dan la hora/el día de Greenwich, que a partir
 * de las 21:00 en Argentina ya es "mañana". Todo lo que se muestra o se usa
 * como "hoy" pasa por acá.
 *
 * Las columnas DATE ("2026-09-26", sin hora) NO son instantes: son días
 * calendario y no se convierten de zona. `new Date("2026-09-26")` es la
 * medianoche UTC, que en Argentina se ve como 25/09. `fechaArgentina` detecta
 * ese formato y lo formatea tal cual.
 */

export const ZONA = "America/Argentina/Buenos_Aires";

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Instante = string | Date;

const aDate = (valor: Instante) =>
  valor instanceof Date ? valor : new Date(valor);

function partes(
  valor: Date,
  opciones: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat("en-US", {
    ...opciones,
    timeZone: ZONA,
  }).formatToParts(valor)) {
    resultado[parte.type] = parte.value;
  }
  return resultado;
}

/** Día calendario en Argentina como "YYYY-MM-DD". */
export function hoyArgentina(ahora: Instante = new Date()): string {
  const p = partes(aDate(ahora), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora en Argentina como "HH:MM", 24 h. */
export function horaArgentina(valor: Instante): string {
  const p = partes(aDate(valor), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${p.hour}:${p.minute}`;
}

/**
 * Fecha para mostrar (es-AR, dd/mm/aaaa por defecto). Acepta un instante o un
 * DATE "YYYY-MM-DD"; este último se formatea como día calendario, sin
 * corrimiento de zona.
 */
export function fechaArgentina(
  valor: Instante,
  opciones: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
): string {
  if (typeof valor === "string" && SOLO_FECHA.test(valor)) {
    return new Intl.DateTimeFormat("es-AR", {
      ...opciones,
      timeZone: "UTC",
    }).format(new Date(`${valor}T00:00:00Z`));
  }
  return new Intl.DateTimeFormat("es-AR", {
    ...opciones,
    timeZone: ZONA,
  }).format(aDate(valor));
}

/** Fecha y hora para mostrar: "26/09/2026 23:30". */
export function fechaHoraArgentina(valor: Instante): string {
  return `${fechaArgentina(valor)} ${horaArgentina(valor)}`;
}

/** Día de la semana en Argentina, en inglés y minúsculas ("monday"…). */
export function diaSemanaArgentina(ahora: Instante = new Date()): string {
  return partes(aDate(ahora), { weekday: "long" }).weekday.toLowerCase();
}

/** Desfase de Argentina respecto de UTC en ese instante, en minutos (hoy -180). */
function desfaseMinutos(instante: Date): number {
  const p = partes(instante, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round(
    (comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60000,
  );
}

/**
 * Fecha + hora locales de Argentina (de un `<input type="date">` y
 * `<input type="time">`) a instante UTC ISO.
 */
export function argentinaAUtcIso(fecha: string, hora = "00:00"): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const ingenuo = Date.UTC(y, m - 1, d, hh, mm);
  const desfase = desfaseMinutos(new Date(ingenuo));
  return new Date(ingenuo - desfase * 60000).toISOString();
}

/**
 * Límites [inicio, fin) de un día calendario argentino como instantes UTC,
 * para filtrar columnas `timestamptz` ("visitas de hoy").
 */
export function limitesDiaArgentina(fecha: string = hoyArgentina()): {
  inicio: string;
  fin: string;
} {
  return {
    inicio: argentinaAUtcIso(fecha),
    fin: argentinaAUtcIso(sumarDias(fecha, 1)),
  };
}

/** Suma días a un día calendario "YYYY-MM-DD", sin pasar por ninguna zona. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
