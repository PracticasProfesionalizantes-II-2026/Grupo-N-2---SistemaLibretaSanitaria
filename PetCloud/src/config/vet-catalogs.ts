/**
 * Listas de opciones del panel veterinario.
 *
 * No son datos: son el vocabulario con el que la pantalla pregunta. Vivían en
 * los datos de demostración y se quedaron sin casa cuando esos se borraron, pero
 * borrarlas también habría sido un error — una veterinaria escribiendo a mano
 * "Refuerzo anual" en cada dosis es exactamente lo que este panel evita.
 *
 * El catálogo de vacunas **no** está acá: cada institución tiene el suyo en
 * `vaccine_presets`, con laboratorio, vía e intervalo propios.
 */

/** Laboratorios frecuentes. "Otro" deja escribir cualquiera. */
export const VACCINE_LABS = [
  "Biogénesis Bagó",
  "Zoetis",
  "MSD Salud Animal",
  "Boehringer Ingelheim",
  "Elanco",
  "Otro",
];

/** Dónde va la dosis dentro del plan sanitario del animal. */
export const VACCINE_DOSES = [
  "1ª dosis",
  "2ª dosis",
  "3ª dosis",
  "Refuerzo anual",
  "Dosis única",
];

/**
 * Motivos de llegada al mostrador.
 *
 * Salieron de lo que la veterinaria escribía una y otra vez. La lista no es
 * cerrada: el detalle libre va aparte, porque "cojea" nunca alcanza.
 */
export const COMMON_REASONS = [
  "Consulta general",
  "Control de rutina",
  "Vacunación",
  "Urgencia",
  "Herida o lesión",
  "Vómitos o diarrea",
  "Control post operatorio",
  "Desparasitación",
  "Otro",
];
