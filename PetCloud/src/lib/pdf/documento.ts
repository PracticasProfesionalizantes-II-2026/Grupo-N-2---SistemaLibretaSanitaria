import { jsPDF } from "jspdf";

/**
 * El andamiaje común de los PDF de PetCloud.
 *
 * Los tres documentos que emite la aplicación —la libreta sanitaria, el reporte
 * de pacientes y el certificado— comparten la misma maquetación a mano: márgenes
 * fijos, una columna, salto de página cuando se acaba el alto. Lo que cambia es
 * el contenido, no la mecánica, así que la mecánica vive acá.
 *
 * Prioridad explícita del proyecto: que los datos estén completos y sean los
 * reales, no que la tipografía sea linda. Lo que no puede pasar es que un bloque
 * que se lee como una unidad —una consulta y su firma, una fila de la tabla— se
 * corte a la mitad.
 */

export const MARGEN = 16;

export const VERDE: [number, number, number] = [15, 118, 110];
export const GRIS: [number, number, number] = [107, 114, 128];
export const NEGRO: [number, number, number] = [31, 41, 55];
export const BORDE: [number, number, number] = [229, 231, 235];

export type Orientacion = "portrait" | "landscape";

export type DocumentoPdf = {
  /** El jsPDF de abajo, para lo que no cubra este envoltorio. */
  doc: jsPDF;
  ancho: number;
  alto: number;
  /** Ancho útil: el de la hoja menos los dos márgenes. */
  util: number;
  /** Posición vertical del cursor, en milímetros desde el borde de arriba. */
  y: number;
  /** Reserva alto; si no entra, abre página nueva y reubica el cursor. */
  espacio: (alto: number) => void;
  /** Título de sección, con la línea verde abajo. */
  titulo: (texto: string) => void;
  /** Par etiqueta/valor en dos columnas. Un valor vacío no imprime nada. */
  linea: (etiqueta: string, valor: string, anchoEtiqueta?: number) => void;
  /** Texto corrido, respetando el ancho útil. */
  parrafo: (texto: string, tamano?: number) => void;
  /** La nota en itálica de cuando una sección no tiene nada que mostrar. */
  vacio: (texto: string) => void;
  /** Línea horizontal separadora. */
  separador: () => void;
  /** Encabezado de la primera página: marca, título y aclaración. */
  encabezado: (titulo: string, aclaracion?: string) => void;
  /** Pie repetido en todas las páginas, con la numeración. Va al final. */
  pie: (izquierda: string, derecha?: string) => void;
  blob: () => Blob;
};

export function crearDocumento(
  orientacion: Orientacion = "portrait",
): DocumentoPdf {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: orientacion });
  const ancho = orientacion === "landscape" ? 297 : 210;
  const alto = orientacion === "landscape" ? 210 : 297;
  const util = ancho - MARGEN * 2;

  const pdf: DocumentoPdf = {
    doc,
    ancho,
    alto,
    util,
    y: MARGEN,

    espacio(altoBloque: number) {
      if (pdf.y + altoBloque > alto - MARGEN) {
        doc.addPage();
        pdf.y = MARGEN;
      }
    },

    titulo(texto: string) {
      pdf.espacio(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...VERDE);
      doc.text(texto, MARGEN, pdf.y);
      pdf.y += 2;
      doc.setDrawColor(...VERDE);
      doc.line(MARGEN, pdf.y, ancho - MARGEN, pdf.y);
      pdf.y += 6;
    },

    linea(etiqueta: string, valor: string, anchoEtiqueta = 32) {
      if (!valor) return;
      pdf.espacio(6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRIS);
      doc.text(`${etiqueta}:`, MARGEN, pdf.y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...NEGRO);
      const partido = doc.splitTextToSize(valor, util - anchoEtiqueta - 2);
      doc.text(partido, MARGEN + anchoEtiqueta, pdf.y);
      pdf.y += 5 * partido.length;
    },

    parrafo(texto: string, tamano = 9.5) {
      if (!texto) return;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(tamano);
      doc.setTextColor(...NEGRO);
      const partido = doc.splitTextToSize(texto, util);

      // Cada renglón se mide por separado: un párrafo largo puede no entrar
      // entero y no hay razón para empujarlo todo a la página siguiente.
      for (const renglon of partido) {
        pdf.espacio(6);
        doc.text(renglon, MARGEN, pdf.y);
        pdf.y += 5;
      }
    },

    vacio(texto: string) {
      pdf.espacio(6);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRIS);
      doc.text(texto, MARGEN, pdf.y);
      pdf.y += 7;
    },

    separador() {
      pdf.espacio(4);
      doc.setDrawColor(...BORDE);
      doc.line(MARGEN, pdf.y, ancho - MARGEN, pdf.y);
      pdf.y += 6;
    },

    encabezado(titulo: string, aclaracion?: string) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(...VERDE);
      doc.text("PetCloud", MARGEN, pdf.y);
      pdf.y += 7;

      doc.setFontSize(15);
      doc.setTextColor(...NEGRO);
      const partido = doc.splitTextToSize(titulo, util);
      doc.text(partido, MARGEN, pdf.y);
      pdf.y += 6 * partido.length;

      if (aclaracion) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(aclaracion, MARGEN, pdf.y);
        pdf.y += 4;
      }

      pdf.y += 6;
    },

    pie(izquierda: string, derecha = "Documento generado por PetCloud.") {
      const paginas = doc.getNumberOfPages();

      for (let i = 1; i <= paginas; i += 1) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        doc.text(`${izquierda} · página ${i} de ${paginas}`, MARGEN, alto - 8);
        doc.text(derecha, ancho - MARGEN, alto - 8, { align: "right" });
      }
    },

    blob() {
      return doc.output("blob");
    },
  };

  return pdf;
}
