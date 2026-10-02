import type { PatientRow } from "@/features/vet/actions/patient-actions";
import { HEALTH_LABELS } from "@/components/ui/status-chip";
import { capitalize, formatDate, formatLongDate } from "@/lib/format";
import { GRIS, MARGEN, crearDocumento } from "@/lib/pdf/documento";
import { tabla } from "@/lib/pdf/tabla";
import { hoyArgentina } from "@/lib/argentina-time";

/**
 * El listado de pacientes, en PDF.
 *
 * Es el equivalente impreso del CSV que ya existe, para lo mismo que el CSV: el
 * reporte que la veterinaria le presenta al municipio. Por eso lleva impresos
 * los filtros con los que se armó — un listado de 40 pacientes sobre 300 sin
 * decir cuáles quedaron afuera no es un reporte, es un recorte sin explicación.
 *
 * Apaisado porque son ocho columnas: en A4 vertical el nombre del dueño y el
 * teléfono se parten en tres renglones cada uno.
 */

export type FiltroAplicado = { etiqueta: string; valor: string };

export function generarReportePacientesPdf(
  pacientes: PatientRow[],
  filtros: FiltroAplicado[],
  institucion: string,
): Blob {
  const pdf = crearDocumento("landscape");
  const hoy = hoyArgentina();

  pdf.encabezado(
    "Listado de pacientes",
    `${institucion ? `${institucion} · ` : ""}Generado el ${formatLongDate(hoy)}`,
  );

  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.setFontSize(9);
  pdf.doc.setTextColor(...GRIS);

  const resumen =
    filtros.length > 0
      ? `Filtros aplicados: ${filtros.map((f) => `${f.etiqueta}: ${f.valor}`).join(" · ")}`
      : "Sin filtros: el listado completo de la institución.";

  const partido = pdf.doc.splitTextToSize(resumen, pdf.util);
  pdf.doc.text(partido, MARGEN, pdf.y);
  pdf.y += 4.5 * partido.length + 4;

  tabla(
    pdf,
    [
      { titulo: "Paciente", peso: 1.1 },
      { titulo: "Especie / raza", peso: 1.3 },
      { titulo: "Dueño", peso: 1.4 },
      { titulo: "Teléfono", peso: 1 },
      { titulo: "Última visita", peso: 0.9 },
      { titulo: "Estado sanitario", peso: 1.1 },
      { titulo: "Nº de registro", peso: 1 },
    ],
    pacientes.map((paciente) => [
      paciente.nombre,
      `${capitalize(paciente.especie)} · ${paciente.raza}`,
      paciente.duenoNombre,
      paciente.duenoTelefono,
      paciente.ultimaVisita ? formatDate(paciente.ultimaVisita) : "Sin visitas",
      HEALTH_LABELS[paciente.estadoSanitario].label,
      paciente.qrCode,
    ]),
  );

  pdf.y += 2;
  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.setFontSize(9);
  pdf.doc.setTextColor(...GRIS);
  pdf.espacio(8);
  pdf.doc.text(
    `${pacientes.length} paciente${pacientes.length === 1 ? "" : "s"} en el listado.`,
    MARGEN,
    pdf.y,
  );

  pdf.pie(
    `Listado de pacientes · ${formatDate(hoy)}`,
    "Documento generado por PetCloud.",
  );

  return pdf.blob();
}
