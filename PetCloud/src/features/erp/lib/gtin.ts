/**
 * Identidad de un código de barras: GTIN-14.
 *
 * Mirror exacto de `erp.normalize_gtin(text)` (migración 116) — mismas
 * reglas, mismo resultado para el mismo insumo, verificado por la prueba de
 * paridad SQL/TS en `tests/rls/erp-catalogo.test.ts`. Un lector puede leer el
 * mismo código UPC-A como 12 o 13 dígitos según el escáner; normalizar a
 * GTIN-14 hace que las dos lecturas resuelvan a la misma entrada del
 * catálogo.
 *
 * A propósito, este archivo no importa nada: el generador de la semilla
 * (fase 3, `scripts/catalogo-a-migracion.mjs`) lo carga con
 * `node --experimental-strip-types` fuera de Next.js, y cualquier import
 * rompería esa carga suelta.
 */

/**
 * Normaliza un código a GTIN-14, o `null` si no es un GTIN válido.
 *
 * Reglas, en orden: recorta espacios; solo dígitos; largo 8, 12, 13 o 14;
 * relleno con ceros a la izquierda hasta 14; dígito verificador GS1 (mod-10,
 * pesos 3,1,3,1… desde la derecha, sin contar el propio verificador)
 * correcto. Cualquier falla devuelve `null` — el llamador decide qué hacer
 * con un código que no es un GTIN.
 */
export function normalizeGtin(raw: string): string | null {
  const trimmed = raw.trim();

  if (!/^[0-9]+$/.test(trimmed)) return null;
  if (![8, 12, 13, 14].includes(trimmed.length)) return null;

  const padded = trimmed.padStart(14, "0");
  const digits = padded.split("").map(Number);
  const checkDigit = digits[13];

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    // Posiciones 1..13 (1-indexado desde la izquierda): impares pesan 3,
    // pares pesan 1 — igual que `erp.normalize_gtin`.
    const weight = (i + 1) % 2 === 1 ? 3 : 1;
    sum += digits[i] * weight;
  }

  const expected = (10 - (sum % 10)) % 10;

  return expected === checkDigit ? padded : null;
}

/**
 * La clave de búsqueda de un código: su GTIN-14 si normaliza, o el propio
 * código recortado si no. Un código no-GTIN (letras, largo no estándar)
 * sigue comparando exacto como siempre — nunca entra al catálogo compartido,
 * pero sigue sirviendo como código local de la institución.
 */
export function gtinKey(raw: string): string {
  return normalizeGtin(raw) ?? raw.trim();
}
