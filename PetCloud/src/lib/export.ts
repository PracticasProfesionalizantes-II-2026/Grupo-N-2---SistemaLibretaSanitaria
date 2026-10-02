/**
 * Descargas desde el navegador.
 *
 * Son reales, no simuladas: los reportes que la veterinaria le presenta al
 * municipio son el caso de uso más concreto del panel, así que conviene que el
 * archivo se descargue de verdad ya en esta etapa.
 */

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  // Separador `;` y BOM para que Excel en español abra el archivo bien.
  const csv = rows.map((row) => row.map(escape).join(";")).join("\r\n");

  downloadBlob(
    filename,
    new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }),
  );
}
