import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * El alias tiene que coincidir con el de `tsconfig.json`. Si no, cualquier
 * import `@/...` de un test falla al resolver y el error que se ve no dice
 * nada útil sobre la causa.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Ver el comentario de tests/stubs/server-only.ts.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // next-auth imports `next/server` without extension; inlining lets Vite
    // resolve it (plain Node ESM resolution fails).
    server: { deps: { inline: ["next-auth"] } },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
