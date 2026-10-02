import { GRIS, MARGEN, type DocumentoPdf } from "@/lib/pdf/documento";

/**
 * La firma del profesional, incrustada en el documento.
 *
 * La firma es parte del documento: un certificado o una consulta con el nombre
 * de un profesional y ningún rastro suyo no prueba nada. Pero tampoco puede
 * tumbar el PDF entero — si el enlace venció o el formato no se entiende, se
 * deja constancia por escrito de que está firmado y se sigue.
 */

const ANCHO_FIRMA = 40;
const ALTO_FIRMA = 15;

export async function insertarFirma(
  pdf: DocumentoPdf,
  url: string | null,
  epigrafe = "Firma digital del profesional",
  respaldo = "Firmado digitalmente",
): Promise<void> {
  const imagen = url ? await comoDataUrl(url) : null;

  pdf.espacio(ALTO_FIRMA + 10);

  if (imagen) {
    try {
      pdf.doc.addImage(imagen, "PNG", MARGEN, pdf.y, ANCHO_FIRMA, ALTO_FIRMA);
      pdf.y += ALTO_FIRMA + 1;
      pdf.doc.setFont("helvetica", "normal");
      pdf.doc.setFontSize(8);
      pdf.doc.setTextColor(...GRIS);
      pdf.doc.text(epigrafe, MARGEN, pdf.y);
      pdf.y += 5;
      return;
    } catch {
      // Un formato que jsPDF no entiende no puede tumbar el documento entero.
    }
  }

  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(...GRIS);
  pdf.doc.text(respaldo, MARGEN, pdf.y);
  pdf.y += 5;
}

/**
 * La imagen, como data URL.
 *
 * jsPDF necesita los bytes; la URL firmada de Storage es un enlace temporal. Si
 * la descarga falla —el enlace venció, no hay red— se devuelve null y quien
 * llama decide qué hacer, en lugar de que se caiga el documento.
 */
async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
