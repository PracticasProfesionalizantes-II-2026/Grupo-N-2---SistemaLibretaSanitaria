import { z } from "zod";

import {
  fechaNacimientoSchema,
  nombreMascotaSchema,
} from "@/features/owner/schemas/pet-schema";

const required = "Este campo es obligatorio";

// Nombre y fecha con los mismos validadores que el formulario de mascota y que
// `createPet`: si no, el onboarding dejaba pasar lo que el servidor rechaza.
export const petBasicsSchema = z.object({
  nombre: nombreMascotaSchema,
  especie: z.enum(["perro", "gato", "otro"], { message: "Elegí una especie" }),
  raza: z.string().optional(),
  sexo: z.enum(["macho", "hembra"], { message: "Elegí el sexo" }),
  fechaNacimiento: fechaNacimientoSchema,
});

export type PetBasicsFormValues = z.infer<typeof petBasicsSchema>;

export const institutionSchema = z.object({
  nombre: z.string().min(1, required),
  direccion: z.string().min(1, required),
  telefono: z.string().min(1, required),
  email: z.string().min(1, required).email("Ingresá un email válido"),
});

export type InstitutionFormValues = z.infer<typeof institutionSchema>;
