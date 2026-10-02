import { z } from "zod";

const required = "Este campo es obligatorio";

/**
 * Reglas de alta de cuenta.
 *
 * La cuenta de PetCloud queda pegada a un registro sanitario que después firma
 * un profesional y consulta un municipio: el nombre que se carga acá es el que
 * va a figurar como responsable de la mascota. Por eso el alta valida forma, no
 * solo presencia — un "asd" en el nombre o un "12345678" de contraseña
 * ensucian un padrón que después nadie limpia.
 *
 * Lo que **no** se valida acá es la identidad real de la persona: eso lo
 * resuelve la verificación del email y, en el caso del veterinario, la
 * validación de la matrícula contra el colegio profesional.
 */

/** Letras (con acentos y ñ), espacios, apóstrofos y guiones. Arranca con letra. */
const NOMBRE_RE = /^\p{L}[\p{L}\p{M}'’ -]*$/u;

const nombrePropio = (label: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    .min(2, `El ${label} tiene que tener al menos 2 letras`)
    .max(40, `El ${label} no puede superar los 40 caracteres`)
    .regex(NOMBRE_RE, `Ingresá un ${label} válido, solo letras`);

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, required)
  .max(254, "El email es demasiado largo")
  .pipe(z.email("Ingresá un email válido"));

/**
 * Contraseñas descartadas de entrada. No pretende ser un diccionario: son las
 * que la gente escribe cuando quiere sacarse el formulario de encima y cumplen
 * igual el mínimo de 8 caracteres.
 */
const CONTRASENAS_OBVIAS = [
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "contrasena",
  "contraseña",
  "qwertyui",
  "qwerty123",
  "asdasdasd",
  "11111111",
  "petcloud",
  "petcloud1",
  "mascota1",
];

const passwordField = z
  .string()
  .min(1, required)
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres")
  .regex(/\p{L}/u, "Tiene que incluir al menos una letra")
  .regex(/\d/, "Tiene que incluir al menos un número")
  .refine(
    (value) => !CONTRASENAS_OBVIAS.includes(value.toLowerCase()),
    "Esa contraseña es demasiado común, elegí otra",
  );

export const accountSchema = z
  .object({
    nombre: nombrePropio("nombre"),
    apellido: nombrePropio("apellido"),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, required),
    aceptaTerminos: z.literal(true, {
      message: "Tenés que aceptar los términos y la política de privacidad",
    }),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Las contraseñas no coinciden",
        path: ["confirmPassword"],
      });
    }

    // Una contraseña que es el nombre o la parte local del email se adivina sin
    // intentar nada: ya está escrita más arriba en el mismo formulario.
    const password = data.password.toLowerCase();
    const evidentes = [data.nombre, data.apellido, data.email.split("@")[0]]
      .map((value) => value.toLowerCase())
      .filter((value) => value.length >= 3);

    if (evidentes.some((value) => password.includes(value))) {
      ctx.addIssue({
        code: "custom",
        message: "No uses tu nombre ni tu email dentro de la contraseña",
        path: ["password"],
      });
    }
  });

export type AccountFormValues = z.infer<typeof accountSchema>;

export const roleSchema = z.object({
  role: z.enum(["dueno", "veterinario"], {
    message: "Elegí un tipo de perfil",
  }),
});

export type RoleFormValues = z.infer<typeof roleSchema>;

/**
 * Matrícula profesional: una a cuatro letras del colegio y el número.
 * Se aceptan `MP 4821`, `MP-4821` y `MP4821` porque cada provincia la escribe
 * distinto; lo que se rechaza es que no haya número.
 */
const MATRICULA_RE = /^[A-Za-z]{1,4}[\s-]?\d{3,6}$/;

/** Teléfono argentino, con o sin +54, separadores y característica. */
const TELEFONO_RE = /^[+\d][\d\s()-]{7,19}$/;

export const vetInfoSchema = z.object({
  nombreVeterinaria: z
    .string()
    .trim()
    .min(1, required)
    .min(3, "El nombre tiene que tener al menos 3 caracteres")
    .max(80, "El nombre no puede superar los 80 caracteres"),
  direccion: z
    .string()
    .trim()
    .min(1, required)
    .min(6, "Ingresá la calle y la altura")
    // Sin altura no se puede ubicar la veterinaria en el mapa del vecino.
    .regex(/\d/, "Falta la altura de la calle"),
  matricula: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, required)
    .regex(MATRICULA_RE, "Formato esperado: MP 4821"),
  telefono: z
    .string()
    .trim()
    .min(1, required)
    .regex(
      TELEFONO_RE,
      "Ingresá un teléfono válido, por ejemplo +54 11 4791-5520",
    )
    .refine((value) => {
      const digitos = value.replace(/\D/g, "").length;
      return digitos >= 8 && digitos <= 15;
    }, "El teléfono tiene que tener entre 8 y 15 dígitos"),
  sitioWeb: z
    .union([
      z.literal(""),
      // Se acepta escrito como lo dicta el cartel de la veterinaria
      // (`vetsanroque.com.ar`); el `https://` lo agrega la aplicación al
      // enlazarlo.
      z
        .string()
        .trim()
        .regex(
          /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i,
          "Ingresá una dirección web válida",
        ),
    ])
    .optional(),
});

export type VetInfoFormValues = z.infer<typeof vetInfoSchema>;

export const loginSchema = z.object({
  // En el ingreso solo se valida la forma. Las reglas de fortaleza son del
  // alta: aplicarlas acá dejaría afuera a cuentas viejas y, peor, le contaría a
  // quien prueba contraseñas cómo son las nuestras.
  email: emailField,
  password: z.string().min(1, required),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, required),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
