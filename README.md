# TapList · API

[![Pruebas](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml/badge.svg)](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml)

Sistema de asistencia escolar con credenciales NFC. Proyecto de Ingeniería de Software del equipo **SoftProduct** (CUCEI, Universidad de Guadalajara).

Hasta ahora incluye:

- El **esquema completo de la base de datos**, construido a partir del modelo entidad-relación.
- La **autenticación web**: inicio y cierre de sesión, consulta del usuario actual y middleware de sesión y de rol.
- El **registro de asistencia por NFC**: autenticación de los lectores ESP32, el endpoint de lecturas con la lógica del diagrama de actividades AD-03, soporte para lecturas guardadas sin conexión y un simulador para probar sin el dispositivo.

Los módulos de estudiantes, consultas, estadísticas y exportación se agregarán sobre esta misma estructura.

## Contenido

1. [Requisitos previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Configuración (`.env`)](#configuración-env)
4. [Base de datos](#base-de-datos)
5. [Levantar el servidor](#levantar-el-servidor)
6. [Pruebas](#pruebas)
7. [API de autenticación](#api-de-autenticación)
8. [Registro de asistencia por NFC](#registro-de-asistencia-por-nfc)
9. [Decisiones técnicas](#decisiones-técnicas)
10. [Cambios al modelo de datos](#cambios-al-modelo-de-datos)
11. [Estructura del proyecto](#estructura-del-proyecto)
12. [Pendientes](#pendientes)

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
| `ZONA_HORARIA_ESCUELA` | Zona horaria IANA de la escuela (por defecto, `America/Mexico_City`). Fechas, horas y días de la semana se calculan en ella, **nunca** en la del servidor. |
| `MINUTOS_ANTES_CLASE` | Minutos antes de `hora_inicio` en que una clase ya acepta lecturas (por defecto, 15). |
| `MINUTOS_MAX_REGISTRO` | Minutos después de `hora_inicio` en que una clase todavía acepta lecturas (por defecto, 60). |
| `HORAS_MAX_LECTURA_OFFLINE` | Antigüedad máxima de una lectura guardada sin conexión (por defecto, 24). |
| `DISPOSITIVO_MAX_SOLICITUDES_MINUTO` | Solicitudes por minuto de cada dispositivo autenticado (por defecto, 60). |
| `DISPOSITIVO_MAX_FALLOS_IP` | Fallos de autenticación de dispositivo por IP cada 15 minutos (por defecto, 30). |
| `SIMULADOR_API_URL`, `SIMULADOR_DISPOSITIVO_ID`, `SIMULADOR_DISPOSITIVO_CLAVE` | Solo los usa `npm run simular:lectura`. `.env.example` trae el dispositivo y la clave de la semilla (**solo para desarrollo**). |

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
- `db/migrations/002_clave_dispositivo.sql`: agrega `dispositivo.clave_api_hash`. Ver [Cambios al modelo de datos](#cambios-al-modelo-de-datos).
- `db/seeds/001_datos_prueba.sql`: 1 Administrador, 2 Docentes, 2 grupos, 3 clases, 5 estudiantes con credencial NFC y 1 dispositivo con clave de prueba. Los datos son ficticios.

Las migraciones se aplican en orden alfabético y las semillas, después de todas ellas.

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

| Dispositivo | `X-Dispositivo-Id` | `X-Dispositivo-Clave` |
|---|---|---|
| Módulo X, aula 101 | `1` | `dev-esp32-aula101-SoloDesarrollo-2026` |

| Estudiante (grupo D01) | UID de la credencial | Clase del grupo |
|---|---|---|
| Andrea López Torres | `04A1B2C3` | Ingeniería de Software, lunes 07:00, tolerancia 10 min |
| Bruno Martínez Cruz | `04D4E5F6` | (mismo grupo) |
| Carla Ramírez Ortega | `0411223344556A` | (mismo grupo) |

El grupo D01 también tiene «Bases de Datos» los miércoles a las 09:00, y el grupo D02 (UID `0477889900AABB` y `9F8E7D6C`), «Redes de Computadoras» los martes a las 11:00 con 15 minutos de tolerancia.

La semilla guarda solo los hashes `argon2id`. Las contraseñas y la clave en texto plano aparecen únicamente aquí, en `.env.example` (la clave del dispositivo) y en `tests/datos.ts`.

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

### Integración continua (GitHub Actions)

El workflow `.github/workflows/pruebas.yml` corre en **cada PR** y en **cada push a `main`**:

1. Levanta un PostgreSQL 18 de servicio.
2. Instala Node con la versión de `.nvmrc` (24 LTS).
3. Corre `npm ci`, `npm run typecheck`, `npm run build` y `npm test`.

No usa `.env` ni secretos del repositorio:
- La contraseña de PostgreSQL solo existe dentro del contenedor efímero de CI.
- `vitest.config.ts` genera un `JWT_SECRET` aleatorio en cada corrida.

El resultado aparece como un check en cada PR y en la insignia de arriba. Conviene proteger la rama `main` en GitHub para exigir que el check **Tipos, compilación y pruebas** pase antes de fusionar. Se configura en *Settings → Branches → Add branch ruleset → Require status checks to pass*.

Las pruebas usan Vitest y Supertest contra `PGDATABASE_TEST`. Antes de correr, `tests/globalSetup.ts`:

1. Recrea la base de pruebas.
2. Aplica la migración y la semilla.
3. Agrega una cuenta inactiva.

El `JWT_SECRET` de las pruebas se genera al azar en cada corrida.

Hay 65 pruebas en tres archivos:

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `tests/auth.test.ts` | 19 | Inicio y cierre de sesión, `me`, roles y límite de intentos. |
| `tests/tiempo.test.ts` | 22 | Unitarias de las funciones puras de tiempo: zona horaria, medianoche, domingo, ventana de la clase y estado. |
| `tests/lecturas.test.ts` | 24 | Integración de `POST /api/dispositivo/lecturas`, con el reloj fijo y el proceso en la zona `Asia/Tokyo`, para comprobar que no se usa la zona del servidor. |

### Autenticación web (`auth.test.ts`)

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

### Registro de asistencia (`lecturas.test.ts`)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Lectura dentro de la tolerancia | `ASISTENCIA` y se crea el registro |
| 2 | Lectura después de la tolerancia | `RETARDO` |
| 3 | Justo en el minuto límite (07:10:00 y 07:10:59) | `ASISTENCIA` |
| 4–6 | UID inexistente, credencial inactiva, estudiante inactivo | `RECHAZADA` con `CREDENCIAL_NO_VALIDA`, sin registro |
| 7 | Fuera de cualquier ventana (08:01 y un sábado) | `RECHAZADA` con `SIN_CLASE` |
| 8 | Segunda lectura en la misma clase y día | Mismo resultado, `duplicado: true`, un solo registro |
| 9 | 5 lecturas simultáneas (`Promise.all`) | Un solo registro, una sola respuesta con `duplicado: false` |
| 10 | Lectura sin conexión con `leido_en` (con `-06:00` y con `Z`) | Se registra con la fecha y la hora de `leido_en`; una que ya existía no se duplica |
| 11 | `leido_en` 3 min en el futuro, con más de 24 h o sin zona horaria | `400`; 1 min en el futuro sí se acepta |
| 12 | Sin cabeceras, clave incorrecta o id inexistente | `401` con el mismo mensaje |
| 13 | Dispositivo inactivo | `403` con su clave correcta; `401` con una incorrecta |
| 14 | Respuestas de asistencia, rechazo y duplicado | Sin nombre, matrícula, UID ni ids del estudiante; los logs llevan el UID enmascarado |
| 15 | `ultima_conexion` | Se actualiza al autenticarse, aunque la lectura se rechace, y no con una clave incorrecta |
| 16 | UID en minúsculas, con dos puntos o con espacios | Se normaliza y encuentra la credencial |

Además se prueban UID con formato inválido (`400`), una falla simulada al guardar (`500` «No se pudo guardar»), el límite de 60 solicitudes por minuto (`429`), que el evento se emite una vez por registro nuevo y sin el UID, que un oyente con errores no afecta la respuesta, y que la respuesta llega en menos de 500 ms.

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

## Registro de asistencia por NFC

El ESP32 lee la credencial y envía el UID a `POST /api/dispositivo/lecturas`. La API decide todo y responde con el resultado que el lector debe mostrar.

El contrato completo para quien programe el firmware (cabeceras, cuerpos, respuestas, señales, *timeout* y cola sin conexión) está en **[docs/contrato-dispositivo.md](docs/contrato-dispositivo.md)**.

| Respuesta | Señal |
|---|---|
| `200` `{ "resultado": "ASISTENCIA", "duplicado": false }` | 🟢 Verde |
| `200` `{ "resultado": "RETARDO", "duplicado": false }` | 🟡 Amarillo |
| `200` `{ "resultado": "RECHAZADA", "motivo": "CREDENCIAL_NO_VALIDA" \| "SIN_CLASE" }` | 🔴 Rojo |
| `400` | 🔴 Rojo |
| `401`, `403`, `429` o `500` | 🔵 3 destellos azules |

### Flujo (diagrama de actividades AD-03)

1. `requiereDispositivo` valida `X-Dispositivo-Id` y `X-Dispositivo-Clave` contra el hash argon2id y exige `estado = 'Activo'`. Responde `401` si la clave no es válida o el id no existe, y `403` si la clave es correcta pero el dispositivo no está activo. Después actualiza `ultima_conexion`.
2. Se busca la credencial por UID. Si no existe, si la credencial está inactiva o si el estudiante está inactivo, el resultado es `RECHAZADA` con el motivo genérico `CREDENCIAL_NO_VALIDA` (RF-04). El detalle solo queda en el log del servidor, con el UID enmascarado (`uid=****B2C3`).
3. Se busca la clase en curso del grupo del estudiante con la regla de la ventana (abajo). Si no hay una, el resultado es `RECHAZADA` con `SIN_CLASE`.
4. Hasta `hora_inicio + tolerancia_min` es `ASISTENCIA`; después, `RETARDO`.
5. Se guarda con `INSERT ... ON CONFLICT (id_estudiante, id_clase, fecha) DO NOTHING`. Si ya existía un registro, no se crea otro y se responde su estado con `duplicado: true`.
6. Si se creó un registro nuevo, se emite el evento `asistencia:registrada` (ver abajo).

### Regla de la ventana de la clase

El modelo no tiene `hora_fin`, así que se usa una ventana alrededor de `hora_inicio`:

- **La lectura cuenta para una clase** si cae entre `hora_inicio − MINUTOS_ANTES_CLASE` y `hora_inicio + MINUTOS_MAX_REGISTRO`, ambos incluidos (por defecto, de 15 minutos antes a 60 minutos después). Si `tolerancia_min` es mayor que `MINUTOS_MAX_REGISTRO`, la ventana se extiende hasta `hora_inicio + tolerancia_min`.
- **Las comparaciones son al minuto:** los segundos de la lectura se truncan. En una clase de las 07:00 con 10 minutos de tolerancia, 07:10:59 todavía es `ASISTENCIA` y 07:11:00 ya es `RETARDO`.
- **Si dos clases del grupo caen en la ventana,** gana la de `hora_inicio` más cercana a la lectura. En empate, gana la que empieza antes y, después, la de menor `id_clase`.
- **Las ventanas pueden cruzar la medianoche:** se revisan las clases del día anterior, del mismo día y del siguiente. La `fecha` del registro es la del **día de la clase**. Por ejemplo, una clase del lunes a las 00:10 acepta lecturas desde el domingo a las 23:55 y se registra con fecha del lunes.
- **Zona horaria:** fecha, hora y día de la semana (1 = lunes … 7 = domingo) se calculan en `ZONA_HORARIA_ESCUELA` con `Intl`, sin depender de la zona del servidor.

Las reglas son funciones puras en `src/modules/lecturas/tiempo.ts` y tienen pruebas unitarias.

### Lecturas guardadas sin conexión

Si el ESP32 pierde la conexión, guarda la lectura con su hora local y la reenvía al reconectarse con el campo `leido_en` (ISO 8601 con zona horaria). En ese caso, la API usa `leido_en`, y no la hora del servidor, para elegir la clase y calcular el estado.

- Responde `400` si `leido_en` está más de 2 minutos en el futuro (tolerancia por desfase de reloj) o tiene más de `HORAS_MAX_LECTURA_OFFLINE` horas.
- Si la misma lectura ya había llegado en línea, no se duplica.

### Seguridad de los dispositivos

- La clave de cada dispositivo es aleatoria (256 bits) y se guarda solo como hash argon2id, igual que las contraseñas. Un id inexistente cuesta lo mismo que una clave incorrecta, y el estado del dispositivo solo se revela si la clave es correcta.
- **Generar o rotar una clave:**

  ```bash
  npm run dispositivo:clave -- <id_dispositivo>
  ```

  La muestra **una sola vez** y la anterior deja de funcionar de inmediato. Este script no escribe en la bitácora, porque `bitacora.id_usuario` debe ser un Administrador y el script no tiene una sesión web.
- **Dos límites de solicitudes**, en memoria (con varias instancias habría que pasarlos a Redis, como los del login):
  - Antes de autenticar: como máximo `DISPOSITIVO_MAX_FALLOS_IP` respuestas `401` por IP cada 15 minutos. Protege la verificación argon2. No se cuenta por `X-Dispositivo-Id`, porque entonces un atacante podría bloquear al lector real mandando claves falsas con su id.
  - Después de autenticar: como máximo `DISPOSITIVO_MAX_SOLICITUDES_MINUTO` solicitudes por minuto de cada dispositivo, para que uno comprometido no sature la API.
- **Las respuestas nunca incluyen** el nombre, la matrícula, el UID ni identificadores del estudiante (RNF-06).

### Evento `asistencia:registrada`

`src/eventos/eventos.ts` exporta un `EventEmitter` tipado. Cada asistencia **nueva** emite `asistencia:registrada` con `idAsistencia`, `idEstudiante`, `idClase`, `idDispositivo`, `fecha`, `hora` y `estado`, **sin el UID**. Los duplicados y los rechazos no emiten. Si un oyente lanza un error, se registra en el log y no afecta la respuesta al dispositivo.

Es el punto de extensión para el aviso en tiempo real a la web (RNF-01). El transporte (WebSocket o SSE) se suscribirá aquí sin tocar el módulo de lecturas:

```ts
import { eventos } from './eventos/eventos.js';
eventos.on('asistencia:registrada', (datos) => { /* avisar a la web */ });
```

### Simulador

Con el servidor corriendo (`npm run dev`):

```bash
npm run simular:lectura -- 04A1B2C3
npm run simular:lectura -- 04:a1:b2:c3 --leido-en 2026-11-09T07:03:00-06:00
```

Hace la petición como el ESP32, con el dispositivo de la semilla y un *timeout* de 3 segundos, y muestra la respuesta y la señal del LED. Por ejemplo:

```
← 200 en 48 ms · {"resultado":"ASISTENCIA","duplicado":false}

🟢  LED verde y 1 pitido corto
```

Las clases de la semilla son los lunes, martes y miércoles. En otro día u horario, la respuesta será `SIN_CLASE`. Para probar una asistencia fuera de horario, usa `--leido-en` con una hora de clase de las últimas 24 horas.

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

### Duplicados sin condición de carrera

El registro usa `INSERT ... ON CONFLICT (id_estudiante, id_clase, fecha) DO NOTHING` y, solo si no insertó nada, lee en una sentencia aparte el registro existente:

- Si dos lecturas de la misma credencial llegan a la vez, PostgreSQL hace esperar a la segunda hasta que la primera termina, y la segunda no inserta.
- La lectura posterior ya ve la fila confirmada.
- Un `SELECT` previo seguido de un `INSERT` tendría una condición de carrera: las dos lecturas verían «no existe» e intentarían insertar.

## Cambios al modelo de datos

Cambios respecto al modelo entidad-relación entregado. **El equipo debe actualizar la documentación del modelo** para que coincida.

| Migración | Tabla | Cambio | Motivo |
|---|---|---|---|
| `002_clave_dispositivo.sql` | DISPOSITIVO | Nueva columna `clave_api_hash` (texto). Obligatoria para dispositivos nuevos o modificados, con `CHECK (clave_api_hash IS NOT NULL) NOT VALID`; las filas anteriores a la migración no se validan. | RNF-03: solo dispositivos registrados y activos pueden registrar asistencias. El modelo no tenía dónde guardar la credencial del lector. Se guarda solo el hash argon2id, nunca la clave. |

Un dispositivo sin clave no puede autenticarse hasta que se le asigne una con `npm run dispositivo:clave -- <id>`.

## Estructura del proyecto

```
db/
  migrations/001_esquema_inicial.sql
  migrations/002_clave_dispositivo.sql
  seeds/001_datos_prueba.sql
  preparar-base.ts           crea la BD, aplica migraciones y semilla
docs/contrato-dispositivo.md contrato de la API para el firmware del ESP32
scripts/
  db-setup.ts                npm run db:setup
  dispositivo-clave.ts       npm run dispositivo:clave
  simular-lectura.ts         npm run simular:lectura
src/
  config/env.ts              variables de entorno validadas con zod
  db/pool.ts                 pool de conexiones a PostgreSQL
  eventos/eventos.ts         EventEmitter tipado (asistencia:registrada)
  middleware/                requiereSesion, requiereRol, requiereDispositivo,
                             limiteIntentos, limiteDispositivo, manejoErrores
  modules/auth/              routes, controller, service, schemas, types
  modules/dispositivos/      service: autenticación y última conexión de los lectores
  modules/lecturas/          routes, controller, service, schemas y tiempo.ts (funciones puras)
  types/express.d.ts         tipos de req.usuario y req.dispositivo
  utils/                     HttpError, contrasena (argon2), sesion (JWT y cookie), uid
  app.ts                     arma la app de Express (la usan el servidor y las pruebas)
  server.ts                  punto de entrada
tests/                       pruebas unitarias y de integración
```

Cada módulo nuevo (`estudiantes`, `asistencias`, `estadisticas`) va en `src/modules/<nombre>/` con la misma forma y se monta en `src/app.ts`.

## Pendientes

- **Acceso de estudiantes (UC-02): pendiente de definir.** El diagrama de casos de uso muestra un inicio de sesión para estudiantes, pero el modelo entidad-relación y los diagramas de actividades solo contemplan los roles Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Por ahora solo hay login para Docente y Administrador.
- Fuera del alcance por ahora: el firmware del ESP32, el alta y la baja de estudiantes (con bitácora), las consultas, las estadísticas, la exportación PDF/XLSX, el transporte del aviso en tiempo real (WebSocket o SSE) y el frontend.
- La gestión de dispositivos desde la web (alta, baja y rotación de clave con bitácora) todavía no existe; por ahora la clave se asigna con `npm run dispositivo:clave`.
- La tabla `bitacora` ya existe y es inmutable. Los endpoints de alta y baja tendrán que insertar en ella dentro de la misma transacción que la operación.
