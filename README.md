# TapList · API

[![Pruebas](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml/badge.svg)](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml)

Sistema de asistencia escolar con credenciales NFC. Proyecto de Ingeniería de Software del equipo **SoftProduct** (CUCEI, Universidad de Guadalajara).

Hasta ahora incluye:

- El **esquema completo de la base de datos**, construido a partir del modelo entidad-relación.
- La **autenticación web**: inicio y cierre de sesión, consulta del usuario actual y middleware de sesión y de rol.
- El **registro de asistencia por NFC**: autenticación de los lectores ESP32, el endpoint de lecturas con la lógica del diagrama de actividades AD-03, soporte para lecturas guardadas sin conexión y un simulador para probar sin el dispositivo.
- La **gestión de estudiantes** para el Administrador (P4, P5, AD-06 y AD-07): consulta paginada con búsqueda, alta, vinculación y reemplazo de credenciales NFC y baja lógica, todo con bitácora.
- La **consulta de asistencias** para el Docente (P2, AD-04): lista paginada con filtros, solo de sus clases, y aviso en tiempo real con SSE.
- Las **estadísticas y la exportación** para el Docente (P3, AD-05, RF-16 y RF-06): porcentaje de asistencia, retardos y faltas por grupo, clase y periodo, asistencia por semana, estudiantes con más faltas, y exportación a PDF y XLSX.

Falta el frontend, que se construirá sobre esta API.

## Contenido

1. [Requisitos previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Configuración (`.env`)](#configuración-env)
4. [Base de datos](#base-de-datos)
5. [Levantar el servidor](#levantar-el-servidor)
6. [Pruebas](#pruebas)
7. [API de autenticación](#api-de-autenticación)
8. [Registro de asistencia por NFC](#registro-de-asistencia-por-nfc)
9. [Gestión de estudiantes](#gestión-de-estudiantes)
10. [Consulta de asistencias (Docente)](#consulta-de-asistencias-docente)
11. [Estadísticas y exportación (Docente)](#estadísticas-y-exportación-docente)
12. [Decisiones técnicas](#decisiones-técnicas)
13. [Cambios al modelo de datos](#cambios-al-modelo-de-datos)
14. [Estructura del proyecto](#estructura-del-proyecto)
15. [Pendientes](#pendientes)

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
| `SSE_LATIDO_SEGUNDOS` | Cada cuánto el flujo SSE envía un latido y revisa que la sesión siga vigente (por defecto, 25). |
| `SSE_MAX_CONEXIONES_DOCENTE` | Conexiones SSE simultáneas por docente, una por pestaña (por defecto, 5); la siguiente recibe `429`. |
| `EXPORTACION_MAX_FILAS` | Máximo de filas al exportar la lista de asistencias (por defecto, 5000); si el filtro da más, la API responde `422`. |
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
- `db/migrations/003_historial_credenciales.sql`: permite varias credenciales por estudiante, con una sola activa, e instala la extensión `unaccent` para la búsqueda. Ver [Cambios al modelo de datos](#cambios-al-modelo-de-datos).
- `db/migrations/004_inscripcion_grupo.sql`: historial de inscripción de cada estudiante a sus grupos, que se mantiene solo con triggers. Ver [Cambios al modelo de datos](#cambios-al-modelo-de-datos).
- `db/seeds/001_datos_prueba.sql`: 1 Administrador, 2 Docentes, 2 grupos, 3 clases, 5 estudiantes con credencial NFC y 1 dispositivo con clave de prueba. Los datos son ficticios.

Las migraciones se aplican en orden alfabético y las semillas, después de todas ellas.

### Reglas del esquema

- **Llaves foráneas con `ON DELETE RESTRICT`:** nada se borra en cascada, para conservar el historial. Las bajas de estudiantes y usuarios son lógicas (`activo = false`).
- **`UNIQUE`** en `usuario.correo`, `estudiante.matricula` y `credencial_nfc.uid` (en toda la tabla, también entre credenciales inactivas), y en `asistencia (id_estudiante, id_clase, fecha)`: una asistencia por clase al día. Un índice único parcial sobre `credencial_nfc (id_estudiante) WHERE activa` permite **una sola credencial activa por estudiante** (migración 003).
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

Hay 139 pruebas en seis archivos:

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `tests/auth.test.ts` | 19 | Inicio y cierre de sesión, `me`, roles y límite de intentos. |
| `tests/tiempo.test.ts` | 22 | Unitarias de las funciones puras de tiempo: zona horaria, medianoche, domingo, ventana de la clase y estado. |
| `tests/lecturas.test.ts` | 24 | Integración de `POST /api/dispositivo/lecturas`, con el reloj fijo y el proceso en la zona `Asia/Tokyo`, para comprobar que no se usa la zona del servidor. |
| `tests/estudiantes.test.ts` | 37 | Gestión de estudiantes: roles, consulta, alta, credenciales, baja, concurrencia, RNF-06 y reversión de la bitácora. Cada prueba crea sus propios estudiantes para no afectar a las demás. |
| `tests/asistencias.test.ts` | 18 | Consulta de asistencias del Docente y SSE, con docentes, grupos y clases propios. Las pruebas del SSE levantan el servidor en un puerto real y leen el flujo con `fetch`. |
| `tests/estadisticas.test.ts` | 19 | Estadísticas con un mes de datos fijos y resultados calculados a mano, y exportación PDF/XLSX. Los archivos se leen con `exceljs` y `unpdf`. |

En las pruebas, `vitest.config.ts` cambia dos valores:
- `SSE_LATIDO_SEGUNDOS` vale `0.5`, para comprobar en segundos el cierre por sesión terminada.
- `EXPORTACION_MAX_FILAS` vale `12`, para probar el `422` con pocos datos.

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

### Gestión de estudiantes (`estudiantes.test.ts`)

| Caso | Resultado esperado |
|---|---|
| Docente en cualquiera de los 7 endpoints | `403`, sin cambios en la bitácora; sin sesión, `401` |
| Lista paginada | `total` y `total_paginas` correctos, orden por apellidos, página fuera de rango vacía |
| Búsqueda `q` | Sin distinguir mayúsculas ni acentos, por palabras en cualquier orden; los comodines `%` y `_` se buscan literalmente |
| Filtros | `con_credencial`, `estado` e `id_grupo` |
| Alta sin UID / con UID | `201`; con UID, credencial vinculada y dos entradas en la bitácora |
| Matrícula duplicada (con otras mayúsculas o espacios) | `409` «Ya existe un estudiante con esa matrícula» |
| Alta con un UID ya asignado | `409`, y **no** se crea el estudiante (todo o nada) |
| Grupo inexistente / validaciones | `400` con un mensaje por campo |
| Vincular | `201`; la credencial registra asistencia en el aula |
| UID de otro estudiante / ya tiene credencial / dado de baja / no existe | `409`, `409`, `409`, `404` |
| Dos vinculaciones simultáneas (mismo UID o mismo estudiante) | Una `201` y una `409`; una sola credencial |
| Reemplazar | La anterior queda inactiva en el historial y sale `RECHAZADA` en el aula; la nueva registra asistencia; la bitácora registra `credencial_nfc#A → credencial_nfc#B` |
| Volver a vincular una credencial reemplazada | `409`, incluso al mismo estudiante |
| Baja | Estudiante y credencial inactivos, asistencias conservadas, lectura posterior `RECHAZADA`, segunda baja `409` |
| Falla de la bitácora en alta, vinculación, reemplazo y baja | El cambio se revierte completo |
| RNF-06 | Ninguna respuesta ni entrada de la bitácora contiene un UID completo |

Para la reversión, las pruebas llaman al servicio con el id de un Docente. El trigger de la bitácora solo acepta Administradores, así que la falla es real, no simulada. Para confirmar que estas pruebas detectan el error, se quitó a propósito el `BEGIN` de `conTransaccion`: fallaron justo las 5 pruebas de «todo o nada».

### Consulta de asistencias (`asistencias.test.ts`)

| Caso | Resultado esperado |
|---|---|
| Administrador / sin sesión en los 3 endpoints | `403` / `401` |
| Docente A y docente B | Cada uno ve solo las asistencias de sus clases, ordenadas de la más reciente a la más antigua |
| Filtro por la clase, el grupo o un estudiante del otro docente | `404`, con la misma respuesta que un id inexistente |
| Estudiante que cambió de grupo | Su antiguo docente lo filtra y ve su historial; el nuevo también lo filtra (sin asistencias aún); sin ninguna de las dos condiciones, `404` |
| Filtros por clase, grupo, estudiante, estado y fechas, solos y combinados | Totales correctos; `desde` y `hasta` incluidos |
| Paginación | `total`, `total_paginas` y página fuera de rango vacía |
| Validación | `400` por campo; `hasta` anterior a `desde` |
| RNF-06 | Ninguna clave ni valor relacionado con el UID |
| Filtros del docente | Solo sus grupos y clases |
| SSE: lectura NFC en la clase de A y luego en la de B | Le llega solo al docente correcto, en menos de 5 s, con `id` igual al de la asistencia |
| SSE: lectura duplicada | No envía evento |
| SSE: dos pestañas del mismo docente | Las dos reciben el evento |
| SSE: una conexión más del límite | `429`; otro docente no se afecta y, al cerrar, se liberan los lugares |
| SSE: reconexión con `Last-Event-ID` | Reenvía, en orden y antes de `conectado`, solo lo posterior y del mismo docente |
| SSE: cuenta desactivada | `sesion_terminada` en el siguiente latido, flujo cerrado y reconexión con `401` |

Para confirmar que la prueba de aislamiento detecta un error real, se cambió a propósito el SSE para enviar cada evento a **todos** los docentes, y esa prueba falló.

### Estadísticas y exportación (`estadisticas.test.ts`)

El encabezado de la prueba describe un mes de datos y el cálculo hecho a mano. Las pruebas comparan los resultados **exactamente**:
- **Docentes y clases:** el docente E tiene 3 clases en 2 grupos, y el docente F tiene una clase en uno de esos grupos.
- **Estudiantes:** 8, entre ellos uno que se da de alta, dos que se dan de baja y uno que cambia de grupo a mitad del mes.
- **Días sin clase:** un lunes festivo sin registros.
- **Fuera del periodo:** un registro del mes anterior.

| Caso | Resultado esperado |
|---|---|
| Resumen de octubre | 7 sesiones, 26 esperados, 12 asistencias, 4 retardos, 10 faltas, 61.5 % |
| Por semana, por clase y estudiantes con más faltas | Cada fila calculada a mano; empates resueltos por retardos y apellidos |
| Alta, baja y cambio de grupo | No suman faltas fuera de su inscripción, ni el día del alta o de la baja |
| Lunes sin registros | No cuenta como sesión |
| Filtros por grupo, clase y periodo; `top` | Totales calculados a mano |
| Periodo que llega al futuro | Se recorta a hoy, en la zona de la escuela |
| Periodo sin sesiones | Todo en cero y porcentaje `null` |
| Docente F | Solo ve su clase; E recibe `404` con la clase y el grupo de F |
| Triggers de inscripción | El alta, el cambio de grupo y la baja abren y cierran inscripciones con la fecha de hoy |
| XLSX y PDF de estadísticas | Mismos totales, semanas y estudiantes que el endpoint; sin UID; nombre de archivo descriptivo |
| XLSX y PDF de la lista | Mismas filas y totales que `GET /api/asistencias`; sin UID |
| Más filas que el límite | `422` con el número de filas y el máximo |
| Administrador / sin sesión | `403` / `401` |

**Mutaciones a propósito**, para confirmar que las pruebas detectan errores reales en la regla de faltas:
- Contar el día del alta.
- Contar el día de la baja.
- No contar a quien registró fuera de su inscripción.

Cada una hizo fallar 7 pruebas.

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

> **Acentos en Windows:** `curl` en Windows convierte los argumentos a la página de códigos del sistema, así que `-d '{"apellidos":"Núñez"}'` llega a la API con caracteres inválidos. Para enviar texto con acentos o eñes, guarda el JSON en un archivo UTF-8 y usa `--data-binary @archivo.json`. Desde el navegador o Postman no pasa.

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

El aviso en tiempo real a la web (RNF-01) se suscribe a este evento, sin tocar el módulo de lecturas. Ver [Aviso en tiempo real](#aviso-en-tiempo-real-sse).

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

## Gestión de estudiantes

Pantallas P4 (consulta) y P5 (alta y detalle), diagramas de actividades AD-06 (vincular credencial) y AD-07 (baja). Todo el módulo exige `requiereSesion` + `requiereRol('Administrador')` (RF-09) y responde con `Cache-Control: no-store`.

| Método y ruta | Qué hace | Éxito | Errores |
|---|---|---|---|
| `GET /api/estudiantes` | Lista paginada con búsqueda y filtros (P4) | `200` | `400` |
| `GET /api/estudiantes/:id` | Detalle con el historial de credenciales (P5) | `200` | `400`, `404` |
| `POST /api/estudiantes` | Alta, con `uid` opcional (P5) | `201` + `Location` | `400`, `409` |
| `POST /api/estudiantes/:id/credencial` | Vincula una credencial (AD-06) | `201` | `400`, `404`, `409` |
| `PUT /api/estudiantes/:id/credencial` | Reemplaza la credencial activa | `200` | `400`, `404`, `409` |
| `POST /api/estudiantes/:id/baja` | Baja lógica (AD-07) | `200` | `400`, `404`, `409` |
| `GET /api/grupos` | Grupos para el formulario de alta | `200` | — |

### Consulta (P4)

`GET /api/estudiantes?q=gomez&id_grupo=1&con_credencial=true&estado=activos&pagina=1&por_pagina=20`

| Parámetro | Valores | Por defecto |
|---|---|---|
| `q` | Texto. Cada palabra debe aparecer en el nombre, los apellidos o la matrícula, en cualquier orden, sin distinguir mayúsculas (`ILIKE`) ni acentos (`unaccent`). | — |
| `id_grupo` | Id del grupo | — |
| `con_credencial` | `true` o `false` (tiene o no una credencial **activa**) | — |
| `estado` | `activos`, `inactivos` o `todos` | `activos` |
| `pagina` / `por_pagina` | Enteros; `por_pagina` va de 1 a 100 | `1` / `20` |

```json
{
  "datos": [
    {
      "id": 1, "matricula": "220000001", "nombre": "Andrea", "apellidos": "López Torres",
      "correo": "andrea.lopez@alumnos.udg.mx", "activo": true,
      "grupo": { "id": 1, "nombre": "D01", "ciclo_escolar": "2026-B" },
      "credencial": { "id": 1, "uid_enmascarado": "****B2C3", "activa": true, "fecha_asignacion": "2026-11-09T14:44:57.260Z" }
    }
  ],
  "pagina": 1, "por_pagina": 20, "total": 1, "total_paginas": 1
}
```

Las respuestas de este módulo usan `snake_case` (`total_paginas`, `uid_enmascarado`, `ciclo_escolar`), igual que los parámetros y las columnas de la base.

### Alta (P5)

```json
{ "matricula": "230000010", "nombre": "Mario", "apellidos": "Núñez Peña",
  "correo": "mario.nunez@alumnos.udg.mx", "id_grupo": 1, "uid": "0A1B2C3D" }
```

- **`matricula`:** se normaliza con `trim` y mayúsculas y acepta de 5 a 20 letras o números.
- **`correo`:** se guarda en minúsculas.
- **`uid`:** es **opcional**. Si viene, el alta y la vinculación ocurren en la misma transacción: si el UID ya está asignado, tampoco se crea el estudiante (todo o nada).
- **Errores:**
  - Matrícula o UID duplicados: `409` con un mensaje claro.
  - Grupo inexistente: `400` sobre `id_grupo`.

### Cómo llega el UID al vincular

En esta versión, el UID se **captura en la pantalla P5**. El campo se puede escribir a mano o llenar con un **lector NFC USB de escritorio que funciona como teclado**: el administrador pulsa «Leer tarjeta», acerca la tarjeta y el lector «escribe» el UID.

- **El UID se valida y normaliza igual que en las lecturas del ESP32** (`esquemaUid`): hexadecimal de 8 a 20 caracteres, sin espacios ni dos puntos y en mayúsculas.
- ⚠️ **Configura el lector USB para que entregue el UID en hexadecimal y con los bytes en el mismo orden que el ESP32.** Muchos lectores USB entregan, por defecto, el UID en decimal o con los bytes invertidos. Si no coincide, la credencial se vincula, pero las lecturas en el aula salen `RECHAZADA`. Para verificarlo, vincula una tarjeta y pásala por un lector del aula o por el simulador.
- **Siguiente versión, el «modo registro» del ESP32:** la API dejaría pendiente la vinculación unos segundos y la siguiente tarjeta leída en un lector de registro dedicado se vincularía sola. Así, el formato siempre coincide y el UID completo nunca pasa por la web. La lógica ya está en una sola función, `insertarCredencial`, que el modo registro podrá reutilizar.

### Reemplazar una credencial perdida o dañada

`PUT /api/estudiantes/:id/credencial` con `{ "uid": "..." }` hace todo en una transacción:
1. Desactiva la credencial activa, que **se conserva** en el historial con `activa = false`.
2. Vincula la nueva.
3. Escribe en la bitácora `credencial_nfc#7 → credencial_nfc#9 (estudiante#12)`.

**Una credencial reemplazada no se puede volver a vincular a nadie, ni siquiera al mismo estudiante. Es intencional.**
- `credencial_nfc.uid` es único en toda la tabla, también entre credenciales inactivas.
- Si una tarjeta reportada como perdida aparece en otras manos, cualquier lectura con ella sale `RECHAZADA`, y el historial siempre indica a quién perteneció.
- Si el estudiante la recupera, se le vincula una tarjeta nueva.

### Baja lógica (AD-07)

`POST /api/estudiantes/:id/baja` hace todo en una transacción:
- Pone `estudiante.activo = false`.
- Desactiva su credencial activa.
- Escribe en la bitácora.

No borra nada:
- Las asistencias anteriores se conservan.
- Una lectura posterior de esa credencial sale `RECHAZADA` (RF-04).

Una segunda baja responde `409`.

### Bitácora (RNF-03)

Cada operación escribe en `bitacora` con el **mismo cliente de la transacción** (`conTransaccion` + `registrarEnBitacora`). Si la escritura en la bitácora falla, se revierte todo el cambio.

| Acción | `entidad_afectada` |
|---|---|
| `ALTA_ESTUDIANTE` | `estudiante#12` |
| `VINCULAR_CREDENCIAL` | `credencial_nfc#9 → estudiante#12` |
| `REEMPLAZAR_CREDENCIAL` | `credencial_nfc#7 → credencial_nfc#9 (estudiante#12)` |
| `BAJA_ESTUDIANTE` | `estudiante#12 (credencial_nfc#9 desactivada)` o `estudiante#12` |

La bitácora nunca guarda UID ni nombres: solo ids internos.

### Privacidad del UID (RNF-06)

- Las consultas enmascaran el UID **dentro del SQL** (`'****' || right(uid, 4)`), así que el UID completo no sale de la base hacia la aplicación.
- El UID que captura el administrador nunca se devuelve: las respuestas solo traen `uid_enmascarado`.
- **Logs de errores:** PostgreSQL incluye los valores de la fila en el `DETAIL` de sus errores; por ejemplo, «Ya existe la llave (uid)=(04A1B2C3)». Por eso los errores inesperados se registran con `errorParaLog`, que omite `detail`.

### Concurrencia

- **Duplicados:** los detectan las restricciones `UNIQUE` de la base y se traducen a `409`, sin un `SELECT` previo.
- **Operaciones sobre el mismo estudiante:** cada una bloquea su fila con `SELECT … FOR UPDATE`, así que una baja y una vinculación simultáneas se ejecutan una después de otra.
- **Probado:** dos vinculaciones simultáneas del mismo UID, o al mismo estudiante, dejan una sola credencial.

## Consulta de asistencias (Docente)

Pantalla P2 y diagrama de actividades AD-04. Todo el módulo exige `requiereSesion` + `requiereRol('Docente')`: un Administrador recibe `403`. Las respuestas llevan `Cache-Control: no-store`.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/asistencias` | Lista paginada de las asistencias de **sus** clases |
| `GET /api/asistencias/filtros` | Los grupos y clases que imparte, para los selectores |
| `GET /api/asistencias/eventos` | Aviso en tiempo real con SSE (`text/event-stream`) |

### Aislamiento entre docentes

- Cada consulta se filtra por `clase.id_docente`, con el id del docente de la sesión. Ese id sale de la base, no del token.
- Si un filtro apunta a algo que el docente no imparte, la respuesta es **`404`, no `403`**, y es idéntica a la de un id inexistente. Así no se revela que el recurso existe. Aplica a:
  - `id_clase`: una clase de otro docente.
  - `id_grupo`: un grupo donde no tiene clases.
  - `id_estudiante`: un estudiante que no cumple **ninguna** de estas dos condiciones:
    - Pertenece hoy a uno de sus grupos.
    - Tiene al menos una asistencia en alguna de sus clases.
- **Estudiante que cambió de grupo:** su antiguo docente puede seguir filtrando por él, porque tiene asistencias en sus clases, y su nuevo docente también, porque es de su grupo actual, aunque todavía no tenga asistencias con él.

### Lista (P2)

`GET /api/asistencias?id_grupo=&id_clase=&id_estudiante=&estado=&desde=&hasta=&pagina=&por_pagina=`

| Parámetro | Valores |
|---|---|
| `id_grupo`, `id_clase`, `id_estudiante` | Ids; deben ser del docente (si no, `404`) |
| `estado` | `Asistencia` o `Retardo` |
| `desde`, `hasta` | `YYYY-MM-DD` del **día de la clase** (`asistencia.fecha`), ambas incluidas; `hasta` no puede ser anterior a `desde` |
| `pagina`, `por_pagina` | Como en estudiantes: `por_pagina` de 1 a 100, por defecto 20 |

```json
{
  "datos": [
    {
      "id": 5, "fecha": "2026-11-09", "hora": "07:05:00", "estado": "Asistencia",
      "estudiante": { "id": 1, "matricula": "220000001", "nombre": "Andrea", "apellidos": "López Torres", "activo": true },
      "clase": { "id": 1, "materia": "Ingeniería de Software", "dia_semana": 1, "hora_inicio": "07:00" },
      "grupo": { "id": 1, "nombre": "D01" },
      "dispositivo": { "id": 1, "nombre_ubicacion": "Módulo X, aula 101" }
    }
  ],
  "pagina": 1, "por_pagina": 20, "total": 1, "total_paginas": 1
}
```

- **Orden:** de lo más reciente a lo más antiguo, por fecha y luego por hora.
- **Sin UID**, ni siquiera enmascarado: las consultas no tocan `credencial_nfc` (RNF-06).
- **Base de datos:** se apoya en los índices que ya existen, `asistencia (id_clase, fecha)` e `idx_clase_id_docente`.

`GET /api/asistencias/filtros` responde `{ grupos: [{ id, nombre, ciclo_escolar }], clases: [{ id, materia, dia_semana, hora_inicio, tolerancia_min, grupo }] }`, solo con lo que el docente imparte.

### Aviso en tiempo real (SSE)

Cuando el registro NFC guarda una asistencia **nueva**, emite `asistencia:registrada`. Entonces el servidor:
1. Completa la fila con **una sola** consulta, con el mismo formato que la lista.
2. La envía **solo a las conexiones del docente de esa clase**.

El evento se emite justo después del `INSERT`, así que llega a la web en milisegundos. En las pruebas, el tiempo se mide de punta a punta y debe ser menor que los 5 s de RNF-01. Las lecturas duplicadas o rechazadas no envían nada.

**Eventos del flujo:**

| Evento | Cuándo | Qué hacer en la web |
|---|---|---|
| `asistencia` | Una asistencia nueva en una de sus clases. `data` tiene el formato de la lista e `id` es el de la asistencia. | Agregarla a la tabla si coincide con los filtros. |
| `conectado` | El flujo está listo, después de reenviar lo pendiente. | En una reconexión, volver a cargar la lista. |
| `sesion_terminada` | La sesión venció o la cuenta ya no es Docente activo. | Cerrar el `EventSource` y mandar al login. |

Además, cada `SSE_LATIDO_SEGUNDOS` llega un comentario (`: latido`), que `EventSource` ignora.

**Si el docente pierde la conexión:**
- **Reconexión automática:** el servidor envía `retry: 3000`, así que `EventSource` se reconecta solo a los 3 segundos.
- **Recuperar lo perdido:** al reconectarse, el navegador envía `Last-Event-ID`, y el servidor reenvía en orden las asistencias posteriores de **sus** clases, como máximo 100 y de la última hora.
  - Es una ayuda, **no una garantía**: dos inserciones simultáneas pueden confirmarse en un orden distinto al de sus ids.
  - Por eso, **la lista es la fuente de verdad**: al recibir `conectado` después de una reconexión, la web debe volver a cargarla.
- **Revalidación de la sesión:** en cada latido se revisa que el token siga vigente y que la cuenta siga activa y con rol Docente. Si no, llega `sesion_terminada` y se cierra el flujo. Si el navegador intenta reconectarse, recibe `401` y `EventSource` deja de intentarlo.

**Varias pestañas:**
- **Una conexión por pestaña:** cada pestaña abre la suya y todas reciben los eventos.
- **Límite por docente:** máximo `SSE_MAX_CONEXIONES_DOCENTE` conexiones (5 por defecto). La siguiente recibe `429`, y los lugares se liberan al cerrar pestañas.
- **Límite del navegador:** con HTTP/1.1, el navegador permite unas **6 conexiones por sitio** sumando todas las pestañas, así que muchas pestañas abiertas pueden bloquear las demás peticiones. Hay dos soluciones:
  - En producción, servir la API con **HTTP/2** detrás del proxy.
  - En el frontend, abrir una sola conexión y compartirla entre pestañas con `BroadcastChannel`.
- **Proxy Nginx:** la respuesta envía `X-Accel-Buffering: no` para que Nginx no retenga los eventos.

**Una sola instancia:** las conexiones viven en la memoria del proceso. Con varias instancias del servidor haría falta Redis pub/sub o `LISTEN/NOTIFY` de PostgreSQL. Al apagar el servidor, `cerrarConexionesTiempoReal()` cierra todos los flujos para que `server.close()` no se quede esperando.

**Ejemplo para el frontend** (mismo origen; la cookie de sesión viaja sola):

```js
const fuente = new EventSource('/api/asistencias/eventos');
let reconectando = false;

fuente.addEventListener('conectado', () => {
  if (reconectando) recargarLista(); // la lista es la fuente de verdad
  reconectando = true;
});
fuente.addEventListener('asistencia', (e) => agregarFila(JSON.parse(e.data)));
fuente.addEventListener('sesion_terminada', () => {
  fuente.close();
  location.href = '/login';
});
```

Si el frontend vive en otro origen, usa `new EventSource(url, { withCredentials: true })` y configura CORS con credenciales.

## Estadísticas y exportación (Docente)

Pantalla P3, diagrama de actividades AD-05, RF-16 y RF-06. Todo exige `requiereSesion` + `requiereRol('Docente')`, así que un Administrador recibe `403`. El aislamiento es el mismo que en la consulta de asistencias: un `id_grupo` o `id_clase` ajeno responde `404`.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/estadisticas` | Indicadores de P3 por grupo, clase y periodo |
| `GET /api/estadisticas/exportar?formato=pdf\|xlsx` | Las mismas estadísticas en un archivo |
| `GET /api/asistencias/exportar?formato=pdf\|xlsx` | La lista de P2, con los mismos filtros y sin paginar |

### Indicadores (RF-16)

`GET /api/estadisticas?desde=2026-10-01&hasta=2026-10-31&id_grupo=&id_clase=&top=10`

| Parámetro | Valores |
|---|---|
| `desde`, `hasta` | **Obligatorios**, `YYYY-MM-DD`. El periodo puede durar hasta 366 días. Si `hasta` cae en el futuro, se recorta a hoy, en la zona de la escuela. |
| `id_grupo`, `id_clase` | Opcionales; deben ser del docente (si no, `404`) |
| `top` | Cuántos estudiantes devolver en «más faltas», de 1 a 50 (por defecto, 10) |

La respuesta trae:

| Campo | Contenido |
|---|---|
| `periodo` | `desde` y `hasta` efectivos |
| `filtros` | Grupo y clase elegidos, con sus nombres |
| `resumen` | `sesiones`, `esperados`, `asistencias`, `retardos`, `faltas` y `porcentaje_asistencia` |
| `por_semana` | Lo mismo por semana ISO (`semana` = el lunes), para la gráfica de P3 |
| `por_clase` | Lo mismo por clase |
| `estudiantes_con_mas_faltas` | Solo quienes tienen al menos una falta. Se ordenan por faltas, luego por retardos y luego por apellidos. Sin UID. |

`porcentaje_asistencia` = `(asistencias + retardos) / esperados × 100`, con un decimal. Vale `null` si no hubo esperados.

Todo sale de **una sola consulta SQL** (`estadisticas.service.ts`), que también usa la exportación.

### Cómo se calculan las faltas

El sistema no guarda las faltas: solo guarda asistencias y retardos. Las faltas se calculan así:

1. **Sesión:** un par (clase, fecha) del periodo, hasta hoy, en el que **al menos una credencial registró asistencia**, y cuya fecha coincide con el `dia_semana` de la clase.
2. **Esperados en una sesión:**
   - Los estudiantes inscritos en el grupo de la clase según `inscripcion_grupo`, **sin contar el día del alta ni el de la baja o cambio de grupo** (`desde < fecha < hasta`). Por ejemplo, quien se da de alta a las 10:00 no pudo llegar a la clase de las 7:00.
   - Además, siempre cuenta quien sí registró ese día, aunque esté fuera de esas fechas. Una asistencia real nunca se pierde.
3. **Falta:** un esperado sin registro en esa sesión.

**Por qué «hubo clase si alguien registró».** Comparamos tres opciones:

| Opción | Ventajas | Desventajas |
|---|---|---|
| Calendario puro: toda fecha que coincide con `dia_semana` | Simple | Cada festivo, vacación, clase cancelada o lector descompuesto pone falta a **todo el grupo** |
| Calendario + tabla `dia_inhabil` | Exacta si la tabla está al día | Cambia el modelo, necesita una pantalla de administración y un festivo olvidado da faltas falsas. Un lector caído sigue dando faltas. |
| **«Hubo clase si alguien registró»** (elegida) | No cambia el modelo. Detecta sola los festivos, las vacaciones, las clases canceladas y los lectores caídos. **Nunca inventa faltas.** | Si **todo** el grupo falta un día, ese día no cuenta. Si el lector falla a mitad de clase, quien no alcanzó a pasar queda con falta. |

En una escuela, una falta falsa le hace más daño a un estudiante que una falta no contada. Si más adelante se quiere la tabla `dia_inhabil`, se puede sumar a esta regla.

**Altas, bajas y cambios de grupo:** con el modelo original no se podía saber desde cuándo ni hasta cuándo perteneció un estudiante a un grupo. La fecha de baja solo estaba como texto en la bitácora, y los cambios de grupo no dejaban rastro. Por eso, la migración 004 agrega `inscripcion_grupo`, que se mantiene sola con triggers. Ver [Cambios al modelo de datos](#cambios-al-modelo-de-datos).

### Exportación (RF-06)

| Ruta | Parámetros | Contenido |
|---|---|---|
| `GET /api/asistencias/exportar` | `formato` + los mismos filtros de `GET /api/asistencias` | Encabezado (docente, filtros, fecha de generación), una fila por asistencia y los totales: registros, asistencias y retardos |
| `GET /api/estadisticas/exportar` | `formato` + los mismos parámetros de `GET /api/estadisticas` | Encabezado, resumen, por clase, por semana y estudiantes con más faltas. En XLSX, cada tabla va en su propia hoja: «Resumen», «Por semana» y «Más faltas». |

- **Mismos totales que la pantalla, por construcción:** la exportación llama a las mismas funciones que los endpoints JSON (`listarAsistencias` y `calcularEstadisticas`). Las pruebas leen los archivos y comparan sus totales con los del endpoint.
- **Sin UID** (RNF-06): esas funciones no leen `credencial_nfc`.
- **Límite:** la lista exporta como máximo `EXPORTACION_MAX_FILAS` filas (5000 por defecto). Si el filtro da más, responde **`422`** «La exportación tendría N filas y el máximo es M. Acota el periodo o los filtros.», en lugar de cortar el archivo en silencio.
- **Nombres de archivo descriptivos y solo ASCII**, por ejemplo:
  - `asistencias_D01_Ingenieria-de-Software_2026-10-01_a_2026-10-31.xlsx`
  - `estadisticas_D01_2026-10-01_a_2026-10-31.pdf`
- **XLSX:** `exceljs` escribe los textos como texto, nunca como fórmula, así que un nombre que empiece con `=` no se ejecuta en Excel.
- **PDF:** `pdfkit`, tamaño carta horizontal, con Helvetica (incluye acentos y eñes). Las tablas se reparten en varias páginas con la cabecera repetida, y cada hoja lleva su número de página.
- **Dependencias:** `exceljs@4` depende de `uuid@8`, que tiene una alerta moderada (GHSA-w5hq-g745-h8pq). La alerta es por las funciones v3, v5 y v6 con un buffer, que `exceljs` no usa. Aun así, `package.json` fuerza `uuid@11` con `overrides`. `npm audit` reporta 0 vulnerabilidades.

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

Cambios respecto al modelo entidad-relación entregado. **El equipo debe actualizar el diagrama entidad-relación** con los dos cambios de abajo para que coincida con la base.

### Qué cambiar en el diagrama

1. **DISPOSITIVO:** agregar el atributo `clave_api_hash`.
2. **ESTUDIANTE — CREDENCIAL_NFC («posee»):** cambiar la cardinalidad de **1:1** a **1:N**, con la nota «a lo más una credencial activa por estudiante». `CREDENCIAL_NFC.id_estudiante` deja de ser único; `CREDENCIAL_NFC.uid` sigue siéndolo.
3. **Nueva entidad INSCRIPCION_GRUPO** con los atributos `id_inscripcion` (PK), `id_estudiante` (FK), `id_grupo` (FK), `desde` y `hasta`. Relaciones: **ESTUDIANTE 1—N INSCRIPCION_GRUPO N—1 GRUPO**. `ESTUDIANTE.id_grupo` se queda como el grupo actual.

### Detalle

| # | Migración | Tabla | Cambio | Motivo |
|---|---|---|---|---|
| 1 | `002_clave_dispositivo.sql` | DISPOSITIVO | Nueva columna `clave_api_hash` (texto). Obligatoria para dispositivos nuevos o modificados, con `CHECK (clave_api_hash IS NOT NULL) NOT VALID`; las filas anteriores a la migración no se validan. | RNF-03: solo dispositivos registrados y activos pueden registrar asistencias. El modelo no tenía dónde guardar la credencial del lector. Se guarda solo el hash argon2id, nunca la clave. |
| 2 | `003_historial_credenciales.sql` | CREDENCIAL_NFC | Se quita `UNIQUE (id_estudiante)` y se crea el índice único parcial `(id_estudiante) WHERE activa`. La relación con ESTUDIANTE pasa de 1:1 a 1:N, con una sola credencial activa. | Reemplazar una credencial perdida o dañada sin perder la trazabilidad: la anterior se conserva inactiva, con su `fecha_asignacion`, en lugar de sobrescribirse. |
| 3 | `004_inscripcion_grupo.sql` | INSCRIPCION_GRUPO (nueva) | Guarda desde y hasta cuándo perteneció cada estudiante a cada grupo; `hasta` vacío significa inscripción vigente, y solo puede haber una vigente por estudiante. Triggers sobre ESTUDIANTE la mantienen al dar de alta, de baja, cambiar de grupo o reactivar. La migración rellena los estudiantes existentes. | RF-16: no contar faltas en días en que el estudiante no pertenecía al grupo. Con el modelo anterior no se podía saber la fecha de baja (solo como texto en la bitácora) ni ningún cambio de grupo. |

- Un dispositivo sin clave no puede autenticarse hasta que se le asigne una con `npm run dispositivo:clave -- <id>`.
- La migración 003 también instala la extensión `unaccent`, que se usa para buscar estudiantes sin distinguir acentos. Es una extensión estándar de PostgreSQL, no una tabla, así que no cambia el diagrama.
- **Zona horaria de las sesiones de base de datos:** la aplicación y `db:setup` abren cada sesión con `timezone = ZONA_HORARIA_ESCUELA`. Así, `current_date` (que usan los triggers de la 004) es el día de la escuela. Es configuración, no cambia el diagrama.
- **Días sin clase:** se resuelven sin tabla, con la regla «hubo clase si alguien registró». Una tabla `dia_inhabil` queda como opción futura y sería otro cambio al modelo.

## Estructura del proyecto

```
db/
  migrations/001_esquema_inicial.sql
  migrations/002_clave_dispositivo.sql
  migrations/003_historial_credenciales.sql
  migrations/004_inscripcion_grupo.sql
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
  db/transaccion.ts          conTransaccion: BEGIN / COMMIT / ROLLBACK
  eventos/eventos.ts         EventEmitter tipado (asistencia:registrada)
  middleware/                requiereSesion, requiereRol, requiereDispositivo,
                             limiteIntentos, limiteDispositivo, manejoErrores
  modules/asistencias/       routes, controller, service, schemas (P2) y tiempoReal.ts (SSE)
  modules/auth/              routes, controller, service, schemas, types
  modules/bitacora/          service: escribe en la bitácora dentro de una transacción
  modules/dispositivos/      service: autenticación y última conexión de los lectores
  modules/estadisticas/      routes, controller, service, schemas (P3, RF-16)
  modules/estudiantes/       routes, controller, service, schemas (P4, P5, AD-06, AD-07)
  modules/exportacion/       service, controller, pdf.ts (pdfkit) y xlsx.ts (exceljs) (RF-06)
  modules/grupos/            routes, service (lista para el formulario de alta)
  modules/lecturas/          routes, controller, service, schemas y tiempo.ts (funciones puras)
  types/express.d.ts         tipos de req.usuario y req.dispositivo
  utils/                     HttpError, contrasena (argon2), sesion (JWT y cookie), uid,
                             erroresPg (traduce errores de PostgreSQL y los limpia para el log),
                             validacion (validar con zod y paginación compartida)
  app.ts                     arma la app de Express (la usan el servidor y las pruebas)
  server.ts                  punto de entrada
tests/                       pruebas unitarias y de integración
```

Cada módulo nuevo va en `src/modules/<nombre>/` con la misma forma y se monta en `src/app.ts`.

## Pendientes

- **Acceso de estudiantes (UC-02): pendiente de definir.** El diagrama de casos de uso muestra un inicio de sesión para estudiantes, pero el modelo entidad-relación y los diagramas de actividades solo contemplan los roles Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Por ahora solo hay login para Docente y Administrador.
- Fuera del alcance por ahora: el firmware del ESP32 y el frontend.
- **Estadísticas, siguientes pasos:**
  - Una tabla `dia_inhabil` opcional, si la escuela quiere contar como faltas los días en que todo el grupo faltó.
  - Exportar en segundo plano si alguna vez hace falta superar `EXPORTACION_MAX_FILAS`.
  - Un endpoint para cambiar de grupo a un estudiante, que ya quedaría registrado en `inscripcion_grupo` gracias a los triggers.
- **Consulta de asistencias, siguientes pasos:**
  - Un selector con los estudiantes de un grupo para el filtro por estudiante.
  - **SSE con varias instancias del servidor:** hoy las conexiones y el `EventEmitter` viven en un solo proceso. Con más de una instancia haría falta Redis pub/sub o `LISTEN/NOTIFY` de PostgreSQL.
- **Gestión de estudiantes, siguientes pasos:**
  - Editar los datos de un estudiante.
  - Reactivar a un estudiante dado de baja.
  - El **«modo registro» del ESP32** (ver [Cómo llega el UID](#cómo-llega-el-uid-al-vincular)).
  - Una vista de la bitácora para el Administrador.
- La gestión de dispositivos desde la web (alta, baja y rotación de clave con bitácora) todavía no existe; por ahora la clave se asigna con `npm run dispositivo:clave`.
