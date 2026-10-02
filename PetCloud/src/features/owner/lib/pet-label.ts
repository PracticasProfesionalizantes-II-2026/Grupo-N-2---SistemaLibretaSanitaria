import { capitalize, formatAge } from "@/lib/format";

/**
 * Especie y edad en una línea ("Perro · 3 años"). Es lo que distingue a dos
 * mascotas con el mismo nombre en los selectores: el nombre solo no alcanza.
 */
export function detalleMascota(pet: {
  especie: string;
  fechaNacimiento?: string;
}): string {
  const edad = pet.fechaNacimiento ? formatAge(pet.fechaNacimiento) : "";
  return [capitalize(pet.especie), edad].filter(Boolean).join(" · ");
}

/** Para `<option>`, que no admite foto: "Firulais · Perro · 3 años". */
export function etiquetaMascota(pet: {
  nombre: string;
  especie: string;
  fechaNacimiento?: string;
}): string {
  return `${pet.nombre} · ${detalleMascota(pet)}`;
}
