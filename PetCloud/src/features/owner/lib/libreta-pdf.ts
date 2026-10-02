import type { LibretaData } from "@/features/owner/actions/pdf-actions";
import {
  capitalize,
  formatAge,
  formatDate,
  formatLongDate,
} from "@/lib/format";
import { GRIS, MARGEN, NEGRO, crearDocumento } from "@/lib/pdf/documento";
import { insertarFirma } from "@/lib/pdf/firma";

/**
 * La libreta sanitaria, en PDF.
 *
 * Se arma en el navegador con jsPDF: no hay servidor de renderizado ni hace
 * falta, porque el documento es texto y una imagen chica por consulta firmada.
 *
 * La mecánica del documento —márgenes, saltos de página, la firma incrustada—
 * vive en `@/lib/pdf`, compartida con el reporte de pacientes y el certificado.
 * Acá queda solo lo que es propio de una libreta: qué secciones hay y qué va
 * adentro de cada una.
 */

export type SeccionLibreta = "datos" | "vacunas" | "tratamientos" | "historial";

export async function generarLibretaPdf(
  datos: LibretaData,
  secciones: SeccionLibreta[],
): Promise<Blob> {
  const pdf = crearDocumento();
  const { doc } = pdf;

  pdf.encabezado(
    `Libreta sanitaria de ${datos.mascota.nombre}`,
    `Generada el ${formatLongDate(datos.generadaEl.slice(0, 10))} · Nº de collar ${datos.mascota.qrCode}`,
  );

  // ── datos
  if (secciones.includes("datos")) {
    pdf.titulo("Datos de la mascota");
    pdf.linea("Nombre", datos.mascota.nombre);
    pdf.linea("Especie", capitalize(datos.mascota.especie));
    pdf.linea("Raza", datos.mascota.raza);
    pdf.linea("Sexo", capitalize(datos.mascota.sexo));
    if (datos.mascota.fechaNacimiento) {
      pdf.linea(
        "Nacimiento",
        `${formatDate(datos.mascota.fechaNacimiento)} (${formatAge(datos.mascota.fechaNacimiento)})`,
      );
    }
    pdf.linea("Color y señas", datos.mascota.color);
    pdf.linea("Castrado", datos.mascota.castrado ? "Sí" : "No");
    pdf.linea("Peso", datos.mascota.pesoKg ? `${datos.mascota.pesoKg} kg` : "");
    pdf.linea("Microchip", datos.mascota.microchip ?? "");
    pdf.y += 4;

    pdf.titulo("Responsable");
    pdf.linea("Nombre", datos.dueno.nombre);
    pdf.linea("Teléfono", datos.dueno.telefono);
    pdf.linea("Email", datos.dueno.email);
    pdf.y += 4;
  }

  // ── vacunas y antiparasitarios
  if (secciones.includes("vacunas")) {
    pdf.titulo("Vacunas");

    if (datos.vacunas.length === 0) {
      pdf.vacio("Sin vacunas registradas.");
    } else {
      for (const v of datos.vacunas) {
        pdf.espacio(11);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...NEGRO);
        doc.text(v.vacuna, MARGEN, pdf.y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(formatDate(v.fechaAplicacion), pdf.ancho - MARGEN, pdf.y, {
          align: "right",
        });
        pdf.y += 4.5;

        const detalle = [
          v.dosis,
          v.lugar,
          v.proximaDosis ? `próxima: ${formatDate(v.proximaDosis)}` : "",
          v.origen === "veterinario"
            ? "aplicada por profesional"
            : "cargada por el dueño",
        ]
          .filter(Boolean)
          .join(" · ");

        doc.text(doc.splitTextToSize(detalle, pdf.util), MARGEN, pdf.y);
        pdf.y += 7;
      }
    }

    pdf.y += 2;
    pdf.titulo("Antiparasitarios");

    if (datos.antiparasitarios.length === 0) {
      pdf.vacio("Sin antiparasitarios registrados.");
    } else {
      for (const a of datos.antiparasitarios) {
        pdf.espacio(9);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...NEGRO);
        doc.text(a.producto, MARGEN, pdf.y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(formatDate(a.fecha), pdf.ancho - MARGEN, pdf.y, {
          align: "right",
        });
        pdf.y += 4.5;

        doc.text(
          `${capitalize(a.tipo)}${a.proximaAplicacion ? ` · próxima: ${formatDate(a.proximaAplicacion)}` : ""}`,
          MARGEN,
          pdf.y,
        );
        pdf.y += 7;
      }
    }
    pdf.y += 2;
  }

  // ── tratamientos
  if (secciones.includes("tratamientos")) {
    pdf.titulo("Medicamentos y tratamientos");

    if (datos.medicacion.length === 0) {
      pdf.vacio("Sin tratamientos registrados.");
    } else {
      for (const m of datos.medicacion) {
        pdf.espacio(12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...NEGRO);
        doc.text(m.medicamento, MARGEN, pdf.y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(
          m.hasta
            ? `${formatDate(m.desde)} a ${formatDate(m.hasta)}`
            : `desde ${formatDate(m.desde)}`,
          pdf.ancho - MARGEN,
          pdf.y,
          { align: "right" },
        );
        pdf.y += 4.5;

        doc.text(
          doc.splitTextToSize(
            [m.dosis, m.frecuencia, m.indicaciones].filter(Boolean).join(" · "),
            pdf.util,
          ),
          MARGEN,
          pdf.y,
        );
        pdf.y += 8;
      }
    }
    pdf.y += 2;
  }

  // ── historial firmado
  if (secciones.includes("historial")) {
    pdf.titulo("Historial clínico");

    if (datos.consultas.length === 0) {
      pdf.vacio("Sin consultas firmadas por un profesional.");
    } else {
      for (const c of datos.consultas) {
        // Una consulta entra entera o pasa a la página siguiente. Partirla entre
        // el diagnóstico y la firma que lo respalda sería romper el documento.
        pdf.espacio(46);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...NEGRO);
        doc.text(`${c.tipo} · ${formatLongDate(c.fecha)}`, MARGEN, pdf.y);
        pdf.y += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(
          [c.veterinario, c.matricula, c.veterinaria]
            .filter(Boolean)
            .join(" · "),
          MARGEN,
          pdf.y,
        );
        pdf.y += 5.5;

        if (c.motivo) pdf.linea("Motivo", c.motivo);
        if (c.diagnostico) pdf.linea("Diagnóstico", c.diagnostico);
        if (c.observaciones) pdf.linea("Observaciones", c.observaciones);

        if (c.firmaUrl) {
          // El epígrafe lleva la aclaración congelada en la firma (064): es el
          // nombre con el que se firmó ese acto, que puede no ser el nombre
          // legal de la cuenta y que no cambia si después se registra otra
          // firma.
          await insertarFirma(
            pdf,
            c.firmaUrl,
            c.aclaracion ?? "Firma digital del profesional",
            "Consulta firmada digitalmente",
          );
        }

        pdf.separador();
      }
    }
  }

  pdf.pie(
    `${datos.mascota.nombre} · ${datos.mascota.qrCode}`,
    "Documento generado por PetCloud. El historial completo vive en PetCloud",
  );

  return pdf.blob();
}
