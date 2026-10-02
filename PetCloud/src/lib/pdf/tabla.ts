import {
  BORDE,
  GRIS,
  MARGEN,
  NEGRO,
  VERDE,
  type DocumentoPdf,
} from "@/lib/pdf/documento";

/**
 * Una tabla en el PDF, sin dependencias extra.
 *
 * jsPDF no trae tablas y el proyecto no suma un plugin por esto: los reportes
 * de PetCloud son listados de ancho conocido, no grillas arbitrarias. El
 * encabezado se repite en cada página —un listado de cuarenta pacientes no
 * entra en una hoja y una tabla sin títulos a partir de la segunda es ilegible—
 * y ninguna fila se parte por la mitad.
 */

export type ColumnaTabla = {
  titulo: string;
  /** Proporción del ancho útil. Se normaliza contra la suma de todas. */
  peso: number;
  alineacion?: "left" | "right";
};

const ALTO_FILA = 6;
const PADDING = 1.5;

export function tabla(
  pdf: DocumentoPdf,
  columnas: ColumnaTabla[],
  filas: string[][],
): void {
  const total = columnas.reduce((suma, columna) => suma + columna.peso, 0);
  const anchos = columnas.map((columna) => (columna.peso / total) * pdf.util);

  // La x donde arranca cada columna, acumulando los anchos anteriores.
  const inicios = anchos.map((_, indice) =>
    anchos.slice(0, indice).reduce((suma, ancho) => suma + ancho, MARGEN),
  );

  function encabezado() {
    pdf.doc.setFont("helvetica", "bold");
    pdf.doc.setFontSize(8.5);
    pdf.doc.setTextColor(...VERDE);

    columnas.forEach((columna, indice) => {
      const derecha = columna.alineacion === "right";
      pdf.doc.text(
        columna.titulo,
        derecha ? inicios[indice] + anchos[indice] - PADDING : inicios[indice],
        pdf.y,
        derecha ? { align: "right" } : undefined,
      );
    });

    pdf.y += 2;
    pdf.doc.setDrawColor(...VERDE);
    pdf.doc.line(MARGEN, pdf.y, pdf.ancho - MARGEN, pdf.y);
    pdf.y += 4;
  }

  pdf.espacio(ALTO_FILA * 3);
  encabezado();

  for (const fila of filas) {
    // Cada celda puede necesitar más de un renglón; la fila mide lo que mida la
    // celda más alta y entra entera o pasa a la página siguiente.
    const celdas = fila.map((valor, indice) =>
      pdf.doc.splitTextToSize(
        String(valor ?? ""),
        anchos[indice] - PADDING * 2,
      ),
    );

    const renglones = Math.max(...celdas.map((celda) => celda.length), 1);
    const altoFila = renglones * 4 + 2.5;

    if (pdf.y + altoFila > pdf.alto - MARGEN) {
      pdf.doc.addPage();
      pdf.y = MARGEN;
      encabezado();
    }

    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(8.5);
    pdf.doc.setTextColor(...NEGRO);

    celdas.forEach((celda, indice) => {
      const derecha = columnas[indice].alineacion === "right";
      pdf.doc.text(
        celda,
        derecha ? inicios[indice] + anchos[indice] - PADDING : inicios[indice],
        pdf.y,
        derecha ? { align: "right" } : undefined,
      );
    });

    pdf.y += altoFila;
    pdf.doc.setDrawColor(...BORDE);
    pdf.doc.line(MARGEN, pdf.y - 2.5, pdf.ancho - MARGEN, pdf.y - 2.5);
  }

  if (filas.length === 0) {
    pdf.doc.setFont("helvetica", "italic");
    pdf.doc.setFontSize(9);
    pdf.doc.setTextColor(...GRIS);
    pdf.doc.text("Sin filas para los filtros aplicados.", MARGEN, pdf.y);
    pdf.y += 6;
  }
}
