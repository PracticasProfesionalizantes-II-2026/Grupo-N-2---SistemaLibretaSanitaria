import {
  capitalize,
  formatAge,
  formatDate,
  formatLongDate,
} from "@/lib/format";
import { GRIS, MARGEN, NEGRO, crearDocumento } from "@/lib/pdf/documento";
import { insertarFirma } from "@/lib/pdf/firma";
import type { Pet } from "@/types/pet";

/**
 * El certificado sanitario, en PDF.
 *
 * Un certificado vale por la matrícula que lo firma, así que el documento se
 * arma alrededor de eso: quién lo emite, sobre qué animal, a nombre de quién y
 * con qué firma. Los datos identificatorios de la mascota van completos —
 * microchip y nº de collar incluidos— porque un certificado de tránsito sin
 * forma de identificar al animal no sirve para nada en un control.
 *
 * La mecánica del documento y la firma incrustada salen de `@/lib/pdf`, las
 * mismas que usa la libreta sanitaria del dueño.
 */

export type CertificadoData = {
  /** El texto del tipo, ya legible: "Certificado de salud". */
  tipo: string;
  emitidoEl: string;
  observaciones: string;
  mascota: Pet;
  dueno: { nombre: string; dni: string; telefono: string; direccion: string };
  profesional: { nombre: string; matricula: string; firmaUrl: string | null };
  institucion: { nombre: string; direccion: string; telefono: string };
};

export async function generarCertificadoPdf(
  datos: CertificadoData,
): Promise<Blob> {
  const pdf = crearDocumento();
  const { doc } = pdf;

  pdf.encabezado(
    datos.tipo,
    [
      datos.institucion.nombre,
      datos.institucion.direccion,
      datos.institucion.telefono,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(
    `Emitido el ${formatLongDate(datos.emitidoEl)}`,
    pdf.ancho - MARGEN,
    MARGEN,
    { align: "right" },
  );

  pdf.titulo("Animal");
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
  pdf.linea("Nº de collar", datos.mascota.qrCode);
  pdf.y += 4;

  pdf.titulo("Responsable");
  pdf.linea("Nombre", datos.dueno.nombre);
  pdf.linea("DNI", datos.dueno.dni);
  pdf.linea("Teléfono", datos.dueno.telefono);
  pdf.linea("Domicilio", datos.dueno.direccion);
  pdf.y += 4;

  if (datos.observaciones.trim()) {
    pdf.titulo("Observaciones");
    pdf.parrafo(datos.observaciones.trim());
    pdf.y += 4;
  }

  // El bloque de la firma entra entero: el nombre del profesional, su matrícula
  // y la firma que los respalda son una sola cosa y partirlos entre dos páginas
  // dejaría una hoja con una firma sin dueño.
  pdf.espacio(50);
  pdf.titulo("Profesional interviniente");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...NEGRO);
  doc.text(datos.profesional.nombre, MARGEN, pdf.y);
  pdf.y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(
    [datos.profesional.matricula, datos.institucion.nombre]
      .filter(Boolean)
      .join(" · "),
    MARGEN,
    pdf.y,
  );
  pdf.y += 7;

  await insertarFirma(
    pdf,
    datos.profesional.firmaUrl,
    "Firma digital del profesional",
    "Certificado firmado digitalmente",
  );

  pdf.pie(
    `${datos.tipo} · ${datos.mascota.nombre} · ${datos.mascota.qrCode}`,
    "Documento generado por PetCloud.",
  );

  return pdf.blob();
}
