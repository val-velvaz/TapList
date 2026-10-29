# TapList · API

Sistema de asistencia escolar con credenciales NFC. Proyecto de Ingeniería de Software del equipo **SoftProduct** (CUCEI, Universidad de Guadalajara).

Esta primera entrega incluye:

- El **esquema completo de la base de datos**, construido a partir del modelo entidad-relación.
- La **autenticación**: inicio y cierre de sesión, consulta del usuario actual y middleware de sesión y de rol.

Los módulos de registro NFC, estudiantes, asistencias, estadísticas y exportación se agregarán sobre esta misma estructura.

## Contenido

1. [Requisitos previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Configuración (`.env`)](#configuración-env)
4. [Base de datos](#base-de-datos)
5. [Levantar el servidor](#levantar-el-servidor)
6. [Pruebas](#pruebas)
7. [API de autenticación](#api-de-autenticación)
8. [Decisiones técnicas](#decisiones-técnicas)
9. [Estructura del proyecto](#estructura-del-proyecto)
10. [Pendientes](#pendientes)

## Requisitos previos

| Herramienta | Versión |
|---|---|
| Node.js | **24 LTS** (fijada en `.nvmrc` y en `engines` de `package.json`) |
| npm | 10 o superior |
| PostgreSQL | 14 o superior (probado con 18) |

Con `nvm` (o `nvm-windows`) puedes activar la versión correcta con:

```bash
nvm use
```

## Instalación

```bash
git clone <url-del-repositorio> TapList
cd TapList
npm install
```

`argon2` se instala con binarios precompilados para Windows, Linux y macOS, así que no hace falta un compilador de C++.

## Configuración (`.env`)

Copia la plantilla y llena los valores:

```bash
cp .env.example .env
```

| Variable | Para qué sirve |
|---|---|
| `NODE_ENV` | `development`, `test` o `production`. La cookie solo lleva la bandera `secure` en `production`. |
| `PORT` | Puerto HTTP de la API (por defecto, 3000). |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | Conexión a PostgreSQL. `PGPASSWORD` puede quedar vacía si usas `pgpass.conf`. |
| `PGDATABASE` | Base de desarrollo (`taplist`). |
| `PGDATABASE_TEST` | Base aislada para las pruebas (`taplist_test`). **Se borra y se recrea en cada corrida.** |
| `JWT_SECRET` | Secreto para firmar las sesiones; mínimo 32 caracteres. |
| `JWT_EXPIRACION_HORAS` | Vigencia de la sesión (por defecto, 8). |
| `LOGIN_MAX_INTENTOS` | Intentos fallidos permitidos **por correo** dentro de la ventana (por defecto, 5). |
| `LOGIN_MAX_INTENTOS_IP` | Intentos fallidos permitidos **por IP** dentro de la ventana (por defecto, 20). |
| `LOGIN_VENTANA_MINUTOS` | Duración de la ventana del límite de intentos (por defecto, 15). |

Para generar un `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Si falta una variable o tiene un valor inválido, el servidor no arranca y muestra cuál es. El archivo `.env` está en `.gitignore`: **ningún secreto va en el código ni en el repositorio.**

## Base de datos

```bash
npm run db:setup            # crea "taplist", corre las migraciones y carga la semilla
npm run db:setup -- --reset # borra "taplist" y la crea de nuevo
npm run db:setup:test       # recrea la base de pruebas (las pruebas ya lo hacen solas)
```

`db:setup` se niega a sobrescribir una base que ya existe, salvo que le pases `--reset`.

### Archivos

- `db/migrations/001_esquema_inicial.sql`: las 8 tablas del modelo entidad-relación (`usuario`, `grupo`, `clase`, `estudiante`, `credencial_nfc`, `dispositivo`, `asistencia` y `bitacora`).
- `db/seeds/001_datos_prueba.sql`: 1 Administrador, 2 Docentes, 2 grupos, 3 clases, 5 estudiantes con credencial NFC y 1 dispositivo. Los datos son ficticios.

### Reglas del esquema

- **Llaves foráneas con `ON DELETE RESTRICT`:** nada se borra en cascada, para conservar el historial. Las bajas de estudiantes y usuarios son lógicas (`activo = false`).
- **`UNIQUE`** en `usuario.correo`, `estudiante.matricula`, `credencial_nfc.uid` y `credencial_nfc.id_estudiante` (relación 1:1), y en `asistencia (id_estudiante, id_clase, fecha)`: una asistencia por clase al día.
- **`CHECK`** en `usuario.rol`, `asistencia.estado`, `dispositivo.estado` (`Activo`, `Inactivo` o `Mantenimiento`), `clase.dia_semana` (1 = lunes … 7 = domingo, como en ISO 8601) y `clase.tolerancia_min >= 0`. El correo del usuario se guarda en minúsculas, y el UID de la credencial, en hexadecimal en mayúsculas.
- **Índices** en las llaves foráneas y en `asistencia (id_clase, fecha)`, que es la consulta principal de reportes y estadísticas.
- **Triggers:**
  - Mantienen `updated_at` al día.
  - Garantizan que `clase.id_docente` sea un Docente y que `bitacora.id_usuario` sea un Administrador. Un `CHECK` no puede consultar otra tabla.
  - Impiden cambiar el rol de un usuario si eso rompe las reglas anteriores.
  - Hacen la bitácora **de solo inserción** (RNF-03): rechazan `UPDATE` y `DELETE`.

### Credenciales de prueba

> ⚠️ **SOLO PARA DESARROLLO.** Estas cuentas existen únicamente en la semilla. Nunca cargues la semilla en producción.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin.taplist@academicos.udg.mx` | `Admin#TapList2026` |
| Docente | `roberto.gomez@academicos.udg.mx` | `Docente#TapList2026` |
| Docente | `patricia.hernandez@academicos.udg.mx` | `Docente#TapList2026` |

La semilla guarda solo los hashes `argon2id`. Las contraseñas en texto plano aparecen únicamente aquí y en `tests/datos.ts`.

## Levantar el servidor

```bash
npm run dev     # desarrollo, con recarga automática
npm run build   # compila a dist/
npm start       # ejecuta la versión compilada
```

## Pruebas

```bash
npm test
```

Las pruebas usan Vitest y Supertest contra `PGDATABASE_TEST`. Antes de correr, `tests/globalSetup.ts`:

1. Recrea la base de pruebas.
2. Aplica la migración y la semilla.
3. Agrega una cuenta inactiva.

El `JWT_SECRET` de las pruebas se genera al azar en cada corrida.

Casos cubiertos (19 pruebas):

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Administrador con credenciales correctas | `200`, `redirigirA = "/estudiantes"`; cookie `HttpOnly` y `SameSite=Strict` |
| 2 | Docente con credenciales correctas | `200`, `redirigirA = "/asistencias"` |
| 3 | Contraseña incorrecta | `401`, mensaje genérico, sin cookie |
| 4 | Correo inexistente | `401`, **el mismo** mensaje |
| 5 | Cuenta inactiva | `401`, el mismo mensaje |
| 6 | Campos vacíos o ausentes, correo con formato inválido, JSON mal formado | `400`, indicando qué falta |
| 7 | `GET /api/auth/me` sin sesión o con un token alterado | `401` |
| 8 | Docente en una ruta con `requiereRol('Administrador')` | `403` (el Administrador recibe `200`) |
| 9 | Más de N intentos fallidos con el mismo correo, o desde la misma IP | `429` |

Además se prueban el flujo completo `login → me → logout → me (401)`, que un login exitoso reinicia el contador por correo y que el correo se acepta con mayúsculas y espacios.

## API de autenticación

Todas las respuestas son JSON y llevan `Cache-Control: no-store`.

### `POST /api/auth/login`

Body: `{ "correo": string, "contrasena": string }`

| Código | Cuerpo |
|---|---|
| `200` | `{ "usuario": { "id", "nombre", "apellidos", "rol" }, "redirigirA": "/estudiantes" \| "/asistencias" }`, más la cookie `taplist_sesion` |
| `400` | `{ "error": "Datos de inicio de sesión inválidos", "detalles": { "correo": "...", "contrasena": "..." } }` |
| `401` | `{ "error": "Correo o contraseña incorrectos" }`, siempre igual |
| `429` | `{ "error": "Demasiados intentos. Intenta de nuevo más tarde." }`, más el encabezado `Retry-After` |

### `POST /api/auth/logout`

Responde `204` y borra la cookie. Es idempotente: responde igual haya o no sesión.

### `GET /api/auth/me`

Responde `200` con `{ "usuario": { ... } }` o `401` si no hay sesión válida.

### Ejemplos con `curl`

Para Git Bash, macOS o Linux. En PowerShell usa `curl.exe` y escapa las comillas del JSON.

```bash
# Iniciar sesión y guardar la cookie en cookies.txt
curl -i -c cookies.txt -H "Content-Type: application/json" \
  -d '{"correo":"admin.taplist@academicos.udg.mx","contrasena":"Admin#TapList2026"}' \
  http://localhost:3000/api/auth/login

# Consultar el usuario de la sesión
curl -b cookies.txt http://localhost:3000/api/auth/me

# Cerrar sesión (borra la cookie del archivo)
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
```

### Middleware para los módulos futuros (RF-09)

```ts
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { requiereRol } from '../../middleware/requiereRol.js';

router.post('/', requiereSesion, requiereRol('Administrador'), crearEstudiante);
router.get('/', requiereSesion, requiereRol('Docente', 'Administrador'), listarAsistencias);
```

- `requiereSesion` responde `401` si no hay sesión válida, y si la hay, deja al usuario en `req.usuario`.
- `requiereRol(...roles)` responde `403` si el rol del usuario no está en la lista.

## Decisiones técnicas

- **Node 24 LTS, Express 5 y TypeScript.** Express 5 propaga solo los errores de los handlers `async`, así que no hacen falta envoltorios. Las capas están separadas en `routes`, `controller`, `service` y `schemas` por módulo.
- **PostgreSQL con SQL directo (`pg`), sin ORM.** La migración es SQL legible que coincide uno a uno con el modelo entidad-relación entregado. Además, PostgreSQL permite `CHECK` con expresiones regulares, triggers en PL/pgSQL y `DROP DATABASE ... WITH (FORCE)` para las pruebas.
- **argon2id para las contraseñas** (19 MiB, 2 iteraciones, el mínimo que recomienda OWASP). Ganó el *Password Hashing Competition* y resiste ataques con GPU mejor que bcrypt.
- **JWT en una cookie `httpOnly` y `SameSite=Strict`, en lugar de sesiones del lado del servidor.** El token no se puede leer desde JavaScript (protege contra XSS) y no viaja en peticiones de otros sitios (protege contra CSRF). Además, no hace falta una tabla de sesiones fuera del modelo entidad-relación. La bandera `secure` depende de `NODE_ENV` y solo se activa en producción, porque en desarrollo y en pruebas el servidor corre en HTTP.
- **El rol nunca se toma del token.** El JWT solo lleva el id del usuario. En cada solicitud, `requiereSesion` vuelve a leer el usuario en la base y exige `activo = true`. Así, una cuenta desactivada o un cambio de rol aplican de inmediato (RF-09).
- **Error genérico con tiempo similar.** Si el correo no existe, la contraseña se verifica contra un hash ficticio. De esta forma, «correo inexistente», «contraseña incorrecta» y «cuenta inactiva» cuestan lo mismo: una verificación argon2 completa. En una medición local, las medianas fueron de 47.5 ms y 44.9 ms.
- **Validación con `zod`.** Repite en la API la validación de forma del frontend (paso 2 de AD-01). El correo se normaliza con `trim` y minúsculas, y la contraseña tiene un máximo de 256 caracteres para que no se pueda gastar CPU con hashes enormes. Las variables de entorno también se validan con `zod` al arrancar.
- **`helmet`** agrega los encabezados de seguridad, y `express.json` acepta como máximo 10 KB.

### Límite de intentos

Hay dos limitadores. Los dos cuentan solo intentos fallidos:

| Limitador | Cuenta | Se reinicia | Límite por defecto |
|---|---|---|---|
| Por **correo** | Solo los `401` (credenciales incorrectas) | **Con un login exitoso** de ese correo, o al terminar la ventana | 5 intentos cada 15 minutos |
| Por **IP** | Las respuestas con error (`4xx`) | Al terminar la ventana | 20 intentos cada 15 minutos |

- El límite por IP es más alto porque varios docentes pueden salir a internet por la misma IP de la escuela.
- Mientras un correo está bloqueado, el servidor no verifica la contraseña y responde `429`, aunque sea la correcta.
- El bloqueo se aplica igual a correos existentes e inexistentes, así que tampoco revela qué cuentas existen.
- Los contadores viven **en memoria**. Con más de una instancia del servidor, o para que sobrevivan a un reinicio, habría que moverlos a Redis (`express-rate-limit` acepta un *store* de Redis).
- Si la API corre detrás de un proxy inverso (Nginx, etc.), hay que configurar `app.set('trust proxy', ...)` para que la IP sea la del cliente y no la del proxy.

### El logout con JWT no revoca el token en el servidor

`POST /api/auth/logout` le pide al navegador que borre la cookie, pero **el JWT sigue siendo válido hasta que expira**. Si alguien copió el token antes del logout, podría seguir usándolo. Así se mitiga:

1. **La cookie es `httpOnly`**: un script malicioso en la página no puede leer el token para robarlo.
2. **`SameSite=Strict`** y, en producción, **`Secure`**: el token no viaja en peticiones de otros sitios ni por HTTP sin cifrar.
3. **Vigencia corta**: 8 horas, configurable con `JWT_EXPIRACION_HORAS`, el equivalente a una jornada.
4. **Revalidación en cada solicitud**: si se desactiva la cuenta (`activo = false`), todos sus tokens dejan de funcionar al instante. Es la forma de «revocar» una sesión comprometida.
5. **Rotar `JWT_SECRET`** invalida de golpe todas las sesiones activas. Es el último recurso ante una fuga.

Si más adelante se necesita una revocación individual, hay dos opciones: guardar el `jti` de los tokens cerrados en una lista negra (Redis, con TTL igual a la vigencia), o agregar al usuario una columna `sesiones_validas_desde` y rechazar los tokens emitidos antes. La segunda opción cambia el modelo entidad-relación, así que se decidiría con el equipo.

## Estructura del proyecto

```
db/
  migrations/001_esquema_inicial.sql
  seeds/001_datos_prueba.sql
  preparar-base.ts           crea la BD, aplica migraciones y semilla
scripts/db-setup.ts          comando npm run db:setup
src/
  config/env.ts              variables de entorno validadas con zod
  db/pool.ts                 pool de conexiones a PostgreSQL
  middleware/                requiereSesion, requiereRol, limiteIntentos, manejoErrores
  modules/auth/              routes, controller, service, schemas, types
  types/express.d.ts         tipo de req.usuario
  utils/                     HttpError, contrasena (argon2), sesion (JWT y cookie)
  app.ts                     arma la app de Express (la usan el servidor y las pruebas)
  server.ts                  punto de entrada
tests/                       pruebas de integración
```

Cada módulo nuevo (`nfc`, `estudiantes`, `asistencias`, `estadisticas`) va en `src/modules/<nombre>/` con la misma forma y se monta en `src/app.ts`.

## Pendientes

- **Acceso de estudiantes (UC-02): pendiente de definir.** El diagrama de casos de uso muestra un inicio de sesión para estudiantes, pero el modelo entidad-relación y los diagramas de actividades solo contemplan los roles Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Por ahora solo hay login para Docente y Administrador.
- Fuera del alcance de esta entrega: el registro NFC desde el ESP32, el alta y la baja de estudiantes (con bitácora), las consultas, las estadísticas, la exportación PDF/XLSX y el frontend.
- La tabla `bitacora` ya existe y es inmutable. Los endpoints de alta y baja tendrán que insertar en ella dentro de la misma transacción que la operación.
