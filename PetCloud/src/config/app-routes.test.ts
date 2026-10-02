import { describe, expect, it } from "vitest";

import { POST_LOGIN_ROUTE, type UserRole } from "@/config/roles";
import {
  INCOMPLETE_ACCOUNT_ROUTE,
  isAllowedForRole,
  isAuthRoute,
  isPublicRoute,
} from "./app-routes";

describe("/cuenta-incompleta", () => {
  // Si algún rol no pudiera entrar, el paso 4 del proxy lo mandaría a su
  // panel, y el guard del panel otra vez acá: el bucle que esta ruta corta.
  it.each(Object.keys(POST_LOGIN_ROUTE) as UserRole[])(
    "la puede abrir el rol %s",
    (role) => {
      expect(isAllowedForRole(INCOMPLETE_ACCOUNT_ROUTE, role)).toBe(true);
    },
  );

  // Como pantalla de acceso, el paso 2 del proxy la expulsaría con sesión.
  it("no es pantalla de acceso ni pública", () => {
    expect(isAuthRoute(INCOMPLETE_ACCOUNT_ROUTE)).toBe(false);
    expect(isPublicRoute(INCOMPLETE_ACCOUNT_ROUTE)).toBe(false);
  });
});
