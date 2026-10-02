import type { ProfessionalPermission } from "@/types/vet";

/**
 * Qué puede hacer cada permiso, dicho como lo entiende quien arma el equipo.
 *
 * Vivía en los datos de demostración y se fue con ellos: no es un dato de
 * prueba, es el vocabulario de la aplicación.
 */
export const PROFESSIONAL_PERMISSION_LABELS: Record<
  ProfessionalPermission,
  string
> = {
  consultas: "Cargar consultas",
  vacunas: "Cargar vacunaciones",
  agenda: "Gestionar la sala de espera",
  pacientes: "Ver pacientes",
  institucion: "Editar la institución",
  reportes: "Exportar reportes",
};
