# Entorno local

## Requisitos

- Node.js 22 o superior.
- Una base PostgreSQL 16: la de Azure (con tu IP habilitada en el firewall) o
  una local con Docker.

## Puesta en marcha

```bash
npm install
# crear .env.local con las variables de la tabla de abajo
npm run db:migrate           # aplica el esquema (db/migrations + db/shims)
DEMO_PASSWORD=<clave-local> npm run seed:demo
npm run dev                  # http://localhost:3000
```

## Variables de `.env.local`

| Variable                          | Para qué                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                    | Conexión a PostgreSQL. En Azure lleva `?sslmode=require`.        |
| `AUTH_SECRET`                     | Firma la cookie de sesión de Auth.js (`npx auth secret`).        |
| `NEXT_PUBLIC_SITE_URL`            | Origen del sitio. Opcional: por defecto `http://localhost:3000`. |
| `STORAGE_DRIVER`                  | `local` (por defecto, guarda en `./.storage`) o `azure`.         |
| `AZURE_STORAGE_CONNECTION_STRING` | Solo con `STORAGE_DRIVER=azure`.                                 |

`.env.local` no se commitea: los valores se comparten por fuera del repositorio.

### Base local con Docker (opcional)

```bash
docker run -d --name petcloud-pg16 -e POSTGRES_PASSWORD=<SUPER> -p 55432:5432 postgres:16
docker exec petcloud-pg16 psql -U postgres \
  -c "CREATE ROLE petcloudadmin LOGIN PASSWORD '<PASSWORD>' CREATEROLE CREATEDB;" \
  -c "CREATE DATABASE petcloud OWNER petcloudadmin;"
# DATABASE_URL=postgresql://petcloudadmin:<PASSWORD>@localhost:55432/petcloud
```

## Datos de demo

`npm run seed:demo` crea las cuentas de demo. Todas usan la contraseña que
pases en `DEMO_PASSWORD`, que **es solo para tu base local**: no la uses en una
base compartida. Es idempotente; `npm run unseed:demo` borra todo lo que crea.

| Cuenta                         | Qué tiene                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `dueno@petcloud.local`         | Dueña con dos mascotas (Luna y Michi), pacientes de la veterinaria de demo               |
| `vet@petcloud.local`           | Veterinaria validada: consultas y vacunas firmadas, Premium, stock y una venta en el ERP |
| `vet.pendiente@petcloud.local` | Veterinario con matrícula pendiente (aparece en la cola del admin)                       |
| `admin@petcloud.local`         | Administrador: valida matrículas en `/admin/validaciones`                                |

El código QR público de cada mascota se ve en su ficha (`/mascotas/<id>/qr`)
y abre `/p/<código>` sin sesión.

## Firewall de Azure

Azure Database for PostgreSQL rechaza las IP que no estén habilitadas. El
síntoma es un timeout al conectar. Para agregar tu IP actual (fish):

```fish
set -l ip (curl -s https://api.ipify.org); az postgres flexible-server firewall-rule create -g rg-petcloud -s petcloud-db-grupo2 -n dev-(date +%s) --start-ip-address $ip --end-ip-address $ip
```

## Verificaciones

```bash
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm test
npm run build
```
