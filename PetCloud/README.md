# PetCloud

Libreta sanitaria digital para mascotas (proyecto universitario, Grupo N°2).
Reemplaza la libreta de papel por un registro único que comparten el dueño y la
veterinaria, con un collar QR que identifica a la mascota.

## Roles

- **Dueño**: mascotas, vacunas, historial de visitas, documentos,
  recordatorios y collar QR.
- **Veterinario**: pacientes, sala de espera, consultas y vacunas firmadas.
  Con Premium (simulado en la demo): turnos y ERP (stock, ventas, caja,
  clientes, compras).
- **Administrador**: valida las matrículas de los veterinarios.
- **Público**: la ficha del collar (`/p/<código>`) muestra datos básicos de la
  mascota y el estado de la antirrábica, sin historial clínico.

## Stack

- Next.js (App Router) + TypeScript, Tailwind CSS
- Azure Database for PostgreSQL + Drizzle ORM
- Auth.js (email y contraseña)

## Cómo correrlo

Ver [docs/desarrollo/entorno-local.md](docs/desarrollo/entorno-local.md)
(instalación, variables de `.env.local`, migraciones y datos de demo).

## Cuentas de demo

Creadas con `npm run seed:demo`. La contraseña se define al correr el seed (ver
entorno local).

| Cuenta                         | Rol                                 |
| ------------------------------ | ----------------------------------- |
| `dueno@petcloud.local`         | Dueña con dos mascotas              |
| `vet@petcloud.local`           | Veterinaria validada, con Premium   |
| `vet.pendiente@petcloud.local` | Veterinario con matrícula pendiente |
| `admin@petcloud.local`         | Administrador                       |

Más documentación en [docs/](docs/README.md).
