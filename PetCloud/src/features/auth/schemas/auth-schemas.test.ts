import { describe, expect, it } from "vitest";

import {
  accountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  roleSchema,
  vetInfoSchema,
} from "@/features/auth/schemas/auth-schemas";

type Resultado = {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
};

/** Los errores por campo, para afirmar sobre el motivo y no solo sobre el fallo. */
function errores(resultado: Resultado) {
  return (resultado.error?.issues ?? []).map((i) => ({
    campo: String(i.path[0] ?? ""),
    mensaje: i.message,
  }));
}

const CUENTA_VALIDA = {
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@ejemplo.com",
  password: "Mascota2026x",
  confirmPassword: "Mascota2026x",
  aceptaTerminos: true as const,
};

describe("accountSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(accountSchema.safeParse(CUENTA_VALIDA).success).toBe(true);
  });

  it("normaliza el email a minúsculas y sin espacios", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      email: "  ANA@Ejemplo.COM  ",
    });

    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ana@ejemplo.com");
  });

  it("acepta nombres con acentos, ñ, apóstrofo y guión", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      nombre: "José Ñandú",
      apellido: "O’Higgins-Muñoz",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un nombre con números", () => {
    const r = accountSchema.safeParse({ ...CUENTA_VALIDA, nombre: "Ana2" });
    expect(r.success).toBe(false);
    expect(errores(r).some((e) => e.campo === "nombre")).toBe(true);
  });

  it("rechaza un nombre de una sola letra", () => {
    const r = accountSchema.safeParse({ ...CUENTA_VALIDA, nombre: "A" });
    expect(r.success).toBe(false);
  });

  it("rechaza un email sin arroba", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      email: "ana.ejemplo.com",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      password: "Abc123",
      confirmPassword: "Abc123",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una contraseña sin números", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      password: "solotextolargo",
      confirmPassword: "solotextolargo",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una contraseña sin letras", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      password: "12345678901",
      confirmPassword: "12345678901",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza las contraseñas de la lista de obvias", () => {
    for (const obvia of ["password1", "petcloud1", "mascota1"]) {
      const r = accountSchema.safeParse({
        ...CUENTA_VALIDA,
        password: obvia,
        confirmPassword: obvia,
      });
      expect(r.success, obvia).toBe(false);
    }
  });

  it("rechaza las obvias sin importar las mayúsculas", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      password: "PassWord1",
      confirmPassword: "PassWord1",
    });
    expect(r.success).toBe(false);
  });

  it("señala el desajuste en confirmPassword, no en password", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      confirmPassword: "Mascota2026y",
    });

    expect(r.success).toBe(false);
    expect(errores(r)).toContainEqual({
      campo: "confirmPassword",
      mensaje: "Las contraseñas no coinciden",
    });
  });

  it("rechaza la contraseña que contiene el nombre", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      password: "Anaanaana1",
      confirmPassword: "Anaanaana1",
    });

    expect(r.success).toBe(false);
    expect(errores(r).some((e) => e.campo === "password")).toBe(true);
  });

  it("rechaza la contraseña que contiene la parte local del email", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      email: "rodriguez@ejemplo.com",
      password: "rodriguez2026",
      confirmPassword: "rodriguez2026",
    });
    expect(r.success).toBe(false);
  });

  it("exige aceptar los términos: false no alcanza", () => {
    const r = accountSchema.safeParse({
      ...CUENTA_VALIDA,
      aceptaTerminos: false,
    });
    expect(r.success).toBe(false);
  });
});

describe("roleSchema", () => {
  it("acepta los dos roles que ofrece el registro", () => {
    for (const role of ["dueno", "veterinario"]) {
      expect(roleSchema.safeParse({ role }).success, role).toBe(true);
    }
  });

  it("rechaza admin: no es un rol que el registro deje elegir", () => {
    expect(roleSchema.safeParse({ role: "admin" }).success).toBe(false);
  });

  it("rechaza un rol vacío", () => {
    expect(roleSchema.safeParse({ role: "" }).success).toBe(false);
  });
});

const VET_VALIDA = {
  nombreVeterinaria: "Vet San Roque",
  direccion: "Av. Mitre 2450",
  matricula: "MP 4821",
  telefono: "+54 11 4791-5520",
};

describe("vetInfoSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(vetInfoSchema.safeParse(VET_VALIDA).success).toBe(true);
  });

  it("acepta el caso completo con sitio web", () => {
    const r = vetInfoSchema.safeParse({
      ...VET_VALIDA,
      sitioWeb: "vetsanroque.com.ar",
    });
    expect(r.success).toBe(true);
  });

  it("acepta la matrícula escrita de las tres formas y la normaliza", () => {
    for (const matricula of ["MP 4821", "MP-4821", "mp4821"]) {
      const r = vetInfoSchema.safeParse({ ...VET_VALIDA, matricula });
      expect(r.success, matricula).toBe(true);
      if (r.success) expect(r.data.matricula).toBe(matricula.toUpperCase());
    }
  });

  it("rechaza una matrícula sin número", () => {
    const r = vetInfoSchema.safeParse({ ...VET_VALIDA, matricula: "MP" });
    expect(r.success).toBe(false);
  });

  it("rechaza una dirección sin altura", () => {
    const r = vetInfoSchema.safeParse({
      ...VET_VALIDA,
      direccion: "Avenida Mitre",
    });

    expect(r.success).toBe(false);
    expect(
      errores(r).some((e) => e.mensaje === "Falta la altura de la calle"),
    ).toBe(true);
  });

  it("rechaza un teléfono con muy pocos dígitos", () => {
    const r = vetInfoSchema.safeParse({ ...VET_VALIDA, telefono: "1234567" });
    expect(r.success).toBe(false);
  });

  it("acepta el sitio web vacío, que es como llega del formulario", () => {
    expect(
      vetInfoSchema.safeParse({ ...VET_VALIDA, sitioWeb: "" }).success,
    ).toBe(true);
  });

  it("rechaza un sitio web que no parece un dominio", () => {
    const r = vetInfoSchema.safeParse({
      ...VET_VALIDA,
      sitioWeb: "no es una url",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("acepta email y contraseña cualquiera", () => {
    const r = loginSchema.safeParse({
      email: "ana@ejemplo.com",
      password: "x",
    });
    expect(r.success).toBe(true);
  });

  it("no aplica las reglas de fortaleza del alta", () => {
    // A propósito: exigirlas acá dejaría afuera cuentas viejas y le contaría a
    // quien prueba contraseñas cómo son las nuestras.
    const r = loginSchema.safeParse({
      email: "ana@ejemplo.com",
      password: "12345678",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza la contraseña vacía", () => {
    const r = loginSchema.safeParse({ email: "ana@ejemplo.com", password: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza un email inválido", () => {
    const r = loginSchema.safeParse({ email: "ana", password: "x" });
    expect(r.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("acepta un email válido", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "ana@ejemplo.com" }).success,
    ).toBe(true);
  });

  it("normaliza a minúsculas", () => {
    const r = forgotPasswordSchema.safeParse({ email: "ANA@EJEMPLO.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ana@ejemplo.com");
  });

  it("rechaza el email vacío", () => {
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("acepta dos contraseñas fuertes iguales", () => {
    const r = resetPasswordSchema.safeParse({
      password: "Mascota2026x",
      confirmPassword: "Mascota2026x",
    });
    expect(r.success).toBe(true);
  });

  it("señala el desajuste en confirmPassword", () => {
    const r = resetPasswordSchema.safeParse({
      password: "Mascota2026x",
      confirmPassword: "Mascota2026y",
    });

    expect(r.success).toBe(false);
    expect(errores(r)).toContainEqual({
      campo: "confirmPassword",
      mensaje: "Las contraseñas no coinciden",
    });
  });

  it("sigue aplicando las reglas de fortaleza, a diferencia del ingreso", () => {
    const r = resetPasswordSchema.safeParse({
      password: "password1",
      confirmPassword: "password1",
    });
    expect(r.success).toBe(false);
  });
});
