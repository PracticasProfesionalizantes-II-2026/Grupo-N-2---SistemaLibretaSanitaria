# Arquitectura

## Stack

- **Next.js 16** (App Router) con **TypeScript** y Tailwind CSS.
- **Azure Database for PostgreSQL** (Flexible Server, PostgreSQL 16).
- **Drizzle ORM** sobre `pg` para el acceso a datos (`src/lib/db`).
- **Auth.js v5** con email y contraseña (bcrypt) y sesión JWT (`src/auth.ts`).
- Archivos en disco local o Azure Blob Storage (`src/lib/storage`).

## Organización del código

`src/app/` contiene solo rutas: cada `page.tsx` importa una vista de
`src/features/<dominio>/`. Cada dominio agrupa sus capas:

- `actions/`: Server Actions (escrituras), validadas con Zod.
- `data/`: lecturas del lado del servidor (`server-only`).
- `components/`: componentes React del dominio.
- `schemas/`: schemas de Zod de los formularios.
- `lib/`: helpers sin acceso a la base.

| Módulo                      | Rutas                                  | Código                                   |
| --------------------------- | -------------------------------------- | ---------------------------------------- |
| Dueño de mascota            | `/inicio`, `/mis-mascotas`…            | `features/owner/`                        |
| Veterinaria                 | `/veterinaria/*`                       | `features/vet/`                          |
| ERP veterinario (Premium)   | `/veterinaria/erp/*`                   | `features/erp/`                          |
| Validación de matrículas    | `/admin/*`                             | `features/admin/`                        |
| Ficha pública del collar QR | `/p/<código>`                          | `features/public-qr/`                    |
| Acceso y onboarding         | `/login`, `/registro`, `/onboarding/*` | `features/auth/`, `features/onboarding/` |
| Sitio institucional         | `/`, `/como-funciona`…                 | `features/public-site/`                  |

`src/config/app-routes.ts` es la única lista de qué rutas son públicas y a cuáles
entra cada rol. La usan `src/proxy.ts` (filtro por rol a partir de la sesión) y
`robots.ts`. La autorización real la hacen los guards del servidor
(`requireUser()`, `requireVet()`, `requireAdmin()`), que leen la base.

## Capa de datos

- El esquema lo definen las migraciones SQL de `db/migrations/` (nombre
  heredado de la primera versión del proyecto). `npm run db:migrate` las aplica
  en orden junto con `db/shims/`, que recrea lo mínimo que esas migraciones
  esperan (`auth.users`, `auth.uid()`, roles).
- Numeración: `0xx` para PetCloud, `1xx` para el ERP (schema `erp`).
- `withUser(userId, fn)` abre una transacción donde `auth.uid()` devuelve ese
  usuario, para las funciones SQL y triggers que lo leen.
  `withServiceRole(fn)` ejecuta como `service_role`, que los triggers de
  protección eximen.
- La aplicación se conecta como dueña de las tablas, así que las políticas RLS
  de las migraciones no filtran: los permisos se resuelven en los guards del
  servidor y con filtros explícitos en cada consulta.
- `src/lib/db/schema/` se genera desde la base (`npm run db:introspect`).
  `src/types/database.ts` tipa las filas en snake_case y se ajusta a mano.
