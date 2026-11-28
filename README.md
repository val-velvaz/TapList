# TapList · API y web

[![Pruebas](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml/badge.svg)](https://github.com/val-velvaz/TapList/actions/workflows/pruebas.yml)

Sistema de asistencia escolar con credenciales NFC. Proyecto de Ingeniería de Software del equipo **SoftProduct** (CUCEI, Universidad de Guadalajara).

Hasta ahora incluye:

- El **esquema completo de la base de datos**, construido a partir del modelo entidad-relación.
- La **autenticación web**: inicio y cierre de sesión, consulta del usuario actual y middleware de sesión y de rol.
- El **registro de asistencia por NFC**: autenticación de los lectores ESP32, el endpoint de lecturas con la lógica del diagrama de actividades AD-03, soporte para lecturas guardadas sin conexión y un simulador para probar sin el dispositivo.
- La **gestión de estudiantes** para el Administrador (P4, P5, AD-06 y AD-07): consulta paginada con búsqueda, alta, vinculación y reemplazo de credenciales NFC y baja lógica, todo con bitácora.
- La **consulta de asistencias** para el Docente (P2, AD-04): lista paginada de sus clases con asistencias, retardos, faltas y pendientes, filtros (incluida la búsqueda de estudiante por nombre o matrícula) y aviso en tiempo real con SSE.
- Las **estadísticas y la exportación** para el Docente (P3, AD-05, RF-16 y RF-06): porcentaje de asistencia, retardos y faltas por grupo, clase y periodo, asistencia por semana, estudiantes con más faltas, y exportación a PDF y XLSX.

- La **página web** (carpeta `web/`), en construcción: ya tiene el inicio de sesión (P1), el encabezado, las rutas por rol y la consulta de asistencias del Docente (P2) con aviso en vivo y exportación. Ver [Página web](#página-web).

Faltan las pantallas P3 a P5 de la web y el firmware del lector, que programa el equipo.

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
12. [Página web](#página-web)
13. [Decisiones técnicas](#decisiones-técnicas)
14. [Cambios al modelo de datos](#cambios-al-modelo-de-datos)
15. [Estructura del proyecto](#estructura-del-proyecto)
16. [Pendientes](#pendientes)

## Requisitos previos

| Herramienta | Versión |
|---|---|
| Node.js | **24 LTS** (fijada en `.nvmrc` y en `engines` de `package.json`) |
| npm | 10 o superior |
| PostgreSQL | 14 o superior (probado con 16 y 18), **compilado con ICU**, como los instaladores oficiales y la imagen de Docker. El orden alfabético usa la colación `es-x-icu`. |

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

El workflow `.github/workflows/pruebas.yml` corre en **cada PR** y en **cada push a `main`**, con tres trabajos independientes:

**«Tipos, compilación y pruebas»** (la API):

1. Levanta un PostgreSQL 18 de servicio.
2. Instala Node con la versión de `.nvmrc` (24 LTS).
3. Corre `npm ci`, `npm run typecheck`, `npm run build` y `npm test`.

**«Web: tipos, compilación y pruebas»** (la carpeta `web/`): instala Node igual y corre los mismos cuatro pasos dentro de `web/`. No necesita la base de datos.

**«Secretos: gitleaks»**: busca contraseñas, claves y direcciones privadas en todos los commits de la rama que se revisa, y falla si encuentra una. Ver [Revisión de secretos](#revisión-de-secretos).

No usa `.env` ni secretos del repositorio:
- La contraseña de PostgreSQL solo existe dentro del contenedor efímero de CI.
- `vitest.config.ts` genera un `JWT_SECRET` aleatorio en cada corrida.

El resultado aparece como un check en cada PR y en la insignia de arriba. Conviene proteger la rama `main` en GitHub para exigir que los checks **Tipos, compilación y pruebas**, **Web: tipos, compilación y pruebas** y **Secretos: gitleaks** pasen antes de fusionar. Se configura en *Settings → Branches → Add branch ruleset → Require status checks to pass*.

Las pruebas usan Vitest y Supertest contra `PGDATABASE_TEST`. Antes de correr, `tests/globalSetup.ts`:

1. Recrea la base de pruebas.
2. Aplica la migración y la semilla. La base se crea con la configuración regional «C» a propósito (ver [Orden alfabético](#orden-alfabético-en-español)).
3. Agrega una cuenta inactiva.

El `JWT_SECRET` de las pruebas se genera al azar en cada corrida.

### Revisión de secretos

El repositorio es público: una contraseña que se sube queda en el historial aunque después se borre. Por eso el CI corre [gitleaks](https://github.com/gitleaks/gitleaks) 8.21.2, con la configuración de `.gitleaks.toml`:

| Regla | Qué detecta |
|---|---|
| Las de fábrica de gitleaks | Claves de servicios conocidos (AWS, GitHub, Google…), llaves privadas, tokens |
| `archivo-de-secretos` | Un `secretos.h` o un `.env` subido al repositorio, aunque se haya forzado a pasar el `.gitignore` |
| `secreto-en-firmware` | En el código del lector (`.ino`, `.h`, `.c`, `.cpp`), una contraseña, clave, token o red Wi-Fi escrita como texto. Esos valores van en `firmware/secretos.h` |
| `url-apps-script` | La dirección privada de una implementación web de Google Apps Script, en cualquier archivo |

- **Las reglas propias existen porque las de fábrica no detectaban** una contraseña de Wi-Fi ni la dirección de un Apps Script. Se probaron con el código que las tenía: las reglas de fábrica no encontraron nada; con las propias, las tres líneas.
- **Qué se revisa:** todos los commits que llevan a la rama del PR, no solo el último, así que también se detecta un secreto que se agregó y se borró dentro del mismo PR. No revisa las demás ramas del repositorio.
- **Los valores no salen en el registro del CI** (`--redact`), porque el registro también es público.
- **Si el check falla:** quita el secreto del código y, sobre todo, **cámbialo** (la contraseña, la clave o la implementación del script), porque ya quedó en el historial de la rama.
- **Para probarlo en tu computadora,** con gitleaks instalado: `gitleaks git --config .gitleaks.toml --redact -v --log-opts="HEAD" .`

La web tiene sus propias pruebas (ver [Pruebas de la web](#pruebas-de-la-web)). La API tiene 193 pruebas en nueve archivos:

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `tests/auth.test.ts` | 19 | Inicio y cierre de sesión, `me`, roles y límite de intentos. |
| `tests/tiempo.test.ts` | 22 | Unitarias de las funciones puras de tiempo: zona horaria, medianoche, domingo, ventana de la clase y estado. |
| `tests/lecturas.test.ts` | 26 | Integración de `POST /api/dispositivo/lecturas`, con el reloj fijo y el proceso en la zona `Asia/Tokyo`, para comprobar que no se usa la zona del servidor. |
| `tests/estudiantes.test.ts` | 38 | Gestión de estudiantes: roles, consulta, alta, credenciales, baja, concurrencia, RNF-06 y reversión de la bitácora. Cada prueba crea sus propios estudiantes para no afectar a las demás. |
| `tests/asistencias.test.ts` | 18 | Consulta de asistencias del Docente y SSE, con docentes, grupos y clases propios. Las pruebas del SSE levantan el servidor en un puerto real y leen el flujo con `fetch`. |
| `tests/estadisticas.test.ts` | 21 | Estadísticas con un mes de datos fijos y resultados calculados a mano (incluido «estudiantes en el grupo» con altas, bajas y un cambio de grupo), y exportación PDF/XLSX. Los archivos se leen con `exceljs` y `unpdf`. |
| `tests/orden.test.ts` | 10 | Orden alfabético en español de todas las listas (P2, P3, P4, P5, XLSX y PDF) con la base en configuración «C»: acentos, «ñ», minúsculas y empates en «más faltas». |
| `tests/faltas.test.ts` | 15 | Faltas y pendientes con el reloj fijo antes, durante y después de la ventana de registro, con los mismos totales en P2, P3 y las exportaciones; y la búsqueda de estudiante de P2. |
| `tests/uid.test.ts` | 24 | Formato canónico del UID: lo que `esquemaUid` acepta (4, 7 y 10 bytes con mayúsculas, minúsculas, espacios y dos puntos) y lo que rechaza (decimal, ceros perdidos, truncado), y el análisis de `npm run uid:revisar`. |

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

Además se prueban UID con formato inválido (`400`), incluidos el decimal de 10 dígitos, los ceros perdidos y el UID truncado, que los UID bien formados de 4, 7 y 10 bytes se aceptan, una falla simulada al guardar (`500` «No se pudo guardar»), el límite de 60 solicitudes por minuto (`429`), que el evento se emite una vez por registro nuevo y sin el UID, que un oyente con errores no afecta la respuesta, y que la respuesta llega en menos de 500 ms.

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

### Orden alfabético (`orden.test.ts`)

El encabezado de la prueba tiene los datos y el orden esperado junto al orden incorrecto de la configuración «C».

| Caso | Qué se comprueba |
|---|---|
| Base de pruebas | Está en configuración «C» y, sin `ORDEN_ES`, PostgreSQL deja los acentos y la «ñ» al final |
| P4 | Los apellidos `alba, Álvarez, Núñez, Ñandú, Ochoa, Presente, Zúñiga` salen en ese orden, también al paginar |
| P5 y P2 | Los grupos `Ábaco, álgebra, Nube, Ñu, Zeta` y sus clases salen en orden |
| P3 | «Por clase» sale por grupo y materia. Con seis estudiantes empatados en faltas, «más faltas» sale por apellidos, y con `top=3` entran los tres primeros del alfabeto |
| XLSX y PDF | El mismo orden que el endpoint |

Para confirmar que detectan el error, se quitó a propósito la colación de `ORDEN_ES`: fallaron 10 pruebas (9 de este archivo y la de paginación de `estudiantes.test.ts`).

### Faltas y pendientes (`faltas.test.ts`)

El encabezado de la prueba describe el escenario. El reloj de la API se fija con `vi.setSystemTime` y avanza durante el lunes 16 de noviembre, en una clase de las 08:00 con 10 minutos de tolerancia (la ventana cierra a las 09:00):

| Momento | Qué se comprueba |
|---|---|
| 07:40 | Todavía no hay sesión ese día; la sesión de la semana anterior ya tiene faltas |
| 07:56 (registró uno) | Los demás aparecen como `Pendiente`, sin hora ni lector. P3 no los cuenta como falta ni en el porcentaje |
| 08:30 | Orden de la lista: lecturas de la más reciente a la más antigua y luego pendientes por apellidos. «Más faltas» no cuenta lo pendiente |
| 09:00:59 | El último minuto de la ventana: siguen pendientes |
| 09:01 | Los pendientes pasan a `Falta` en P2, P3 y las exportaciones |

En cada momento, `totalesCoinciden` compara la lista de P2 con el resumen de P3 y con los totales de los cuatro archivos (PDF y XLSX de P2 y de P3). Además: una clase a las 23:30 que sigue pendiente hasta las 00:30 del día siguiente, una tolerancia de 75 minutos (mayor que `MINUTOS_MAX_REGISTRO`), el filtro de estado con `Falta` y `Pendiente`, el aislamiento con otro docente del mismo grupo y la búsqueda `q` (sin acentos, por palabras, por matrícula, con `%` y `_` literales, y solo en las clases del docente).

Para confirmar que detectan errores reales, se rompió el código a propósito seis veces, y cada vez fallaron pruebas: sin pendientes (6), con el último minuto como falta (3), sin la tolerancia en la ventana (2), con el reloj de PostgreSQL en lugar del de la API (14), con P3 contando los pendientes como faltas (5) y con la búsqueda sensible a los acentos (2).

### Formato del UID (`uid.test.ts`)

Son pruebas unitarias, sin base de datos, de `esquemaUid` (la validación que comparten las lecturas y la vinculación) y de las funciones de `npm run uid:revisar`.

| Caso | Resultado esperado |
|---|---|
| UID de 4, 7 y 10 bytes en mayúsculas, minúsculas, con dos puntos, con espacios y con espacios alrededor | Se aceptan y dan el mismo formato canónico |
| 3, 5, 6, 8, 9 y 11 bytes | Se rechazan |
| Longitud impar (un cero perdido) | Se rechaza |
| Decimal de 10 dígitos y de otras longitudes inválidas | Se rechazan |
| UID de 7 bytes truncado a 5 o 6 | Se rechaza |
| Letras fuera de A-F, guiones, comas, puntos, `0x`, vacío y valores que no son texto | Se rechazan |
| `analizarUid` | Coincide con la API en qué es válido; avisa del posible decimal y muestra su equivalente, del UID aleatorio (`08…`), de la etiqueta de cascada (`88…`) y de las lecturas fallidas |
| `compararUids` | Reconoce iguales, bytes invertidos, decimal, ceros perdidos, truncado y distintos |

La integración se prueba en `lecturas.test.ts` (los valores mal formados responden `400` sin registro) y en `estudiantes.test.ts` (se vinculan credenciales de 4, 7 y 10 bytes, y los mal formados no vinculan nada).

Para confirmar que detectan el error, se regresó a propósito a la longitud amplia (de 8 a 20 caracteres): fallaron 9 pruebas en los tres archivos.

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

El contrato completo para quien programe el firmware (cabeceras, cuerpos, respuestas, señales, *timeout* y cola sin conexión) está en **[docs/contrato-dispositivo.md](docs/contrato-dispositivo.md)**. La guía para organizar el firmware, conectar el lector y probarlo está en **[docs/guia-firmware.md](docs/guia-firmware.md)**.

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

### Formato canónico del UID y cambio de lector

- **Lector previsto: RC522 (MFRC522), sin confirmar.** El equipo podría terminar usando un PN532 u otro módulo.
- **El servidor no depende del modelo del lector.** Solo conoce el UID en un formato único, definido en [`docs/contrato-dispositivo.md`](docs/contrato-dispositivo.md#formato-canónico-del-uid): hexadecimal en mayúsculas, sin separadores, con los bytes en el orden de la anticolisión, de 4, 7 o 10 bytes.
- **Cambiar de lector solo afecta a la capa del lector en el firmware.** [`docs/guia-firmware.md`](docs/guia-firmware.md) explica cómo separarla (una interfaz de dos funciones y una implementación por modelo), las conexiones, qué tarjetas lee cada lector y la lista de pruebas con el circuito. El firmware lo programa el equipo en `firmware/`.
- **La API rechaza con `400` las longitudes que no son de 4, 7 o 10 bytes** (`PATRON_UID` en `src/utils/uid.ts`). Antes aceptaba cualquier longitud de 8 a 20 caracteres, y con eso pasaban el decimal de 10 dígitos de los lectores USB, los valores con un cero perdido y los UID truncados a 5 o 6 bytes. La restricción de la base (`ck_credencial_nfc_uid`, de 8 a 20 caracteres) no cambió: no hizo falta una migración.
- **Lo que la API no puede detectar:** un UID con los bytes invertidos, truncado a 4 bytes exactos o en decimal de 8, 14 o 20 dígitos tiene un formato válido. La lectura sale `RECHAZADA` porque no coincide con la credencial. Para eso está la herramienta de abajo.

### Revisar el formato de un UID

```bash
npm run uid:revisar -- 04:a1:b2:c3
npm run uid:revisar -- 0077705923 --comparar 04A1B2C3
```

Muestra el formato canónico y si la API lo aceptaría, y avisa si el valor parece decimal, aleatorio (`08…`) o a media lectura (`88…`). Con `--comparar`, dice si los dos valores son la misma tarjeta con otro formato:

```
Valor: 0077705923
  ❌ La API lo rechazaría (400):
     - Tiene 5 bytes (10 caracteres). Un UID tiene 4, 7 o 10 bytes (8, 14 o 20 caracteres).
  ⚠️  Solo tiene dígitos: puede ser un UID en DECIMAL, como lo entregan muchos lectores USB. […]

Comparación: ⚠️  Son la misma tarjeta, pero uno está en DECIMAL y el otro en hexadecimal. […]
```

Reconoce los bytes invertidos, el decimal, los ceros perdidos y el UID truncado. No se conecta a la API ni a la base y no guarda nada. Muestra el UID completo en la terminal, así que es para tarjetas de prueba (RNF-06). Termina con código `0` solo si el valor es válido y, con `--comparar`, si los dos son iguales.

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

Los estudiantes de la semilla están inscritos desde el 1 de agosto de 2026 (inicio aproximado del ciclo 2026-B), así que una base recién creada ya muestra faltas en P2 y P3. Las clases de la semilla son los lunes, martes y miércoles. En otro día u horario, la respuesta será `SIN_CLASE`. Para probar una asistencia fuera de horario, usa `--leido-en` con una hora de clase de las últimas 24 horas.

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

- **El UID se valida y normaliza igual que en las lecturas del ESP32** (`esquemaUid`), al [formato canónico](#formato-canónico-del-uid-y-cambio-de-lector): hexadecimal de 4, 7 o 10 bytes (8, 14 o 20 caracteres), sin espacios ni dos puntos y en mayúsculas. Un decimal de 10 dígitos, como el que entregan muchos lectores USB, responde `400`.
- ⚠️ **Configura el lector USB para que entregue el UID en hexadecimal y con los bytes en el mismo orden que el ESP32.** Muchos lectores USB entregan, por defecto, el UID en decimal o con los bytes invertidos. Si no coincide, la credencial se vincula, pero las lecturas en el aula salen `RECHAZADA`. Para verificarlo **antes de vincular credenciales reales**, compara lo que entregan los dos lectores para la misma tarjeta con `npm run uid:revisar -- <del lector USB> --comparar <del ESP32>`.
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

`GET /api/asistencias?id_grupo=&id_clase=&id_estudiante=&q=&estado=&desde=&hasta=&pagina=&por_pagina=`

La lista tiene **una fila por estudiante esperado en cada sesión**, no solo las lecturas: quien registró aparece con `Asistencia` o `Retardo`, y quien no, con `Pendiente` o `Falta` (ver [Faltas y pendientes](#faltas-y-pendientes)).

| Parámetro | Valores |
|---|---|
| `id_grupo`, `id_clase`, `id_estudiante` | Ids; deben ser del docente (si no, `404`) |
| `q` | Texto, hasta 100 caracteres. Busca por nombre, apellidos o matrícula, por palabras y sin distinguir mayúsculas ni acentos, igual que en P4. Solo dentro de las clases del docente: un estudiante ajeno simplemente no aparece |
| `estado` | `Asistencia`, `Retardo`, `Falta` o `Pendiente` |
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
    },
    {
      "id": null, "fecha": "2026-11-09", "hora": null, "estado": "Pendiente",
      "estudiante": { "id": 2, "matricula": "220000002", "nombre": "Bruno", "apellidos": "Martínez Cruz", "activo": true },
      "clase": { "id": 1, "materia": "Ingeniería de Software", "dia_semana": 1, "hora_inicio": "07:00" },
      "grupo": { "id": 1, "nombre": "D01" },
      "dispositivo": null
    }
  ],
  "pagina": 1, "por_pagina": 20, "total": 2, "total_paginas": 1
}
```

- **Faltas y pendientes:** no tienen lectura, así que `id`, `hora` y `dispositivo` valen `null`.
- **Orden:** de la sesión más reciente a la más antigua (fecha y hora de inicio de la clase). Dentro de una sesión, primero las lecturas, de la más reciente a la más antigua, y después quien no ha registrado, por apellidos.
- **Filtros:** grupo, clase y fechas eligen las sesiones; estudiante, `q` y estado eligen filas dentro de ellas. Así, una falta siempre se calcula con la sesión completa.
- **Los totales coinciden con P3:** la lista, las estadísticas y las dos exportaciones usan el mismo cálculo (`asistencias/registros.ts`).
- **Sin UID**, ni siquiera enmascarado: las consultas no tocan `credencial_nfc` (RNF-06).
- **Base de datos:** se apoya en los índices que ya existen, `asistencia (id_clase, fecha)` e `idx_clase_id_docente`.

`GET /api/asistencias/filtros` responde `{ grupos: [{ id, nombre, ciclo_escolar }], clases: [{ id, materia, dia_semana, hora_inicio, tolerancia_min, grupo }] }`, solo con lo que el docente imparte.

### Faltas y pendientes

El sistema no guarda faltas: las calcula con la misma regla que las estadísticas (ver [Cómo se calculan las faltas](#cómo-se-calculan-las-faltas)). En cada sesión, cada estudiante esperado queda en uno de cuatro estados:

| Estado | Cuándo |
|---|---|
| `Asistencia` o `Retardo` | Registró con su credencial |
| `Pendiente` | No ha registrado y **la ventana de registro de la clase sigue abierta**: todavía puede llegar |
| `Falta` | No registró y la ventana ya cerró |

- **Cierre de la ventana:** `hora_inicio + max(MINUTOS_MAX_REGISTRO, tolerancia_min)`, la misma regla con la que el endpoint de lecturas acepta una lectura. Ese último minuto todavía cuenta como pendiente: los segundos de una lectura se truncan, así que 08:00:59 es el minuto 08:00.
- **Ejemplo:** una clase del lunes a las 08:00, con 10 minutos de tolerancia y `MINUTOS_MAX_REGISTRO` = 60. Si alguien registra a las 07:55, desde ese momento sus compañeros aparecen como `Pendiente`; a las 09:01 pasan a `Falta`.
- **Una clase que cruza la medianoche** (por ejemplo, a las 23:30) sigue pendiente hasta que su ventana cierra al día siguiente.
- **Hora y zona:** se usa la hora del servidor de la API, convertida a `ZONA_HORARIA_ESCUELA`; nunca la zona del servidor ni el reloj de PostgreSQL.
- **El SSE no avisa de los pendientes ni de las faltas:** solo envía las lecturas nuevas. La web vuelve a pedir la lista cuando llega una lectura, porque una lectura puede convertir a un pendiente en asistencia o abrir una sesión nueva.

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
| `resumen` | `sesiones`, `esperados`, `asistencias`, `retardos`, `faltas`, `pendientes` y `porcentaje_asistencia` |
| `por_semana` | Lo mismo por semana ISO (`semana` = el lunes), para la gráfica de P3 |
| `por_clase` | Lo mismo por clase |
| `estudiantes_en_grupo` | Estudiantes inscritos en la fecha final del periodo (ver abajo), para la tarjeta «Estudiantes en el grupo» de P3 |
| `estudiantes_con_mas_faltas` | Solo quienes tienen al menos una falta (un pendiente no cuenta). Se ordenan por faltas, luego por retardos y luego por apellidos. Traen también sus `pendientes`. Sin UID. |

- `estudiantes_en_grupo`: los estudiantes **inscritos en la fecha final del periodo** (`periodo.hasta`, ya recortada a hoy), no hoy, para que cuadre con el resto de las estadísticas.
  - **Grupos:** el del filtro `id_grupo`; con `id_clase`, el grupo de esa clase; sin filtros, todos los grupos donde el docente da clase.
  - **Inscrito en esa fecha:** `desde <= hasta del periodo` y la inscripción sigue abierta o cerró después. Quien se dio de baja o cambió de grupo dentro del periodo ya no cuenta, ni tampoco quien lo hizo ese mismo día. Quien se dio de alta ese día sí cuenta, aunque ese día no se le espere en la clase.
  - **Ejemplo** (datos de `estadisticas.test.ts`): en G1, al 13 de octubre hay 5; al 14, día de la baja de S3, hay 4.
  - Va también en los totales del PDF y del XLSX, como «Estudiantes en el grupo (al AAAA-MM-DD)».
- `esperados` = `asistencias + retardos + faltas`. Un **pendiente** todavía no es ni falta ni asistencia: no cuenta en los esperados ni en el porcentaje, y se informa aparte en `pendientes`.
- `porcentaje_asistencia` = `(asistencias + retardos) / esperados × 100`, con un decimal. Vale `null` si no hubo esperados.

Todo sale de **una sola consulta SQL** (`estadisticas.service.ts`), que también usa la exportación. Los registros de esa consulta son los mismos de la lista de P2 (`asistencias/registros.ts`), así que los totales coinciden.

### Cómo se calculan las faltas

El sistema no guarda las faltas: solo guarda asistencias y retardos. Las faltas se calculan así:

1. **Sesión:** un par (clase, fecha) del periodo, hasta hoy, en el que **al menos una credencial registró asistencia**. Ya no se exige que la fecha coincida con el `dia_semana` actual de la clase: si alguien registró, hubo clase, aunque después se haya cambiado el día de la clase.
2. **Esperados en una sesión:**
   - Los estudiantes inscritos en el grupo de la clase según `inscripcion_grupo`, **sin contar el día del alta ni el de la baja o cambio de grupo** (`desde < fecha < hasta`). Por ejemplo, quien se da de alta a las 10:00 no pudo llegar a la clase de las 7:00.
   - Además, siempre cuenta quien sí registró ese día, aunque esté fuera de esas fechas. Una asistencia real nunca se pierde.
3. **Falta:** un esperado sin registro en esa sesión, **cuando la ventana de registro de la clase ya cerró**. Mientras siga abierta, es un **pendiente**, que no cuenta como falta (ver [Faltas y pendientes](#faltas-y-pendientes)).

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
| `GET /api/asistencias/exportar` | `formato` + los mismos filtros de `GET /api/asistencias`, incluida `q` | Encabezado (docente, filtros, búsqueda, fecha de generación), una fila por registro (faltas y pendientes con hora y lector «—») y los totales: registros, asistencias, retardos, faltas y pendientes |
| `GET /api/estadisticas/exportar` | `formato` + los mismos parámetros de `GET /api/estadisticas` | Encabezado, resumen, por clase, por semana y estudiantes con más faltas, con la columna «Pendientes». En XLSX, cada tabla va en su propia hoja: «Resumen», «Por semana» y «Más faltas». |

- **Mismos totales que la pantalla, por construcción:** la exportación llama a las mismas funciones que los endpoints JSON (`listarAsistencias` y `calcularEstadisticas`). Las pruebas leen los archivos y comparan sus totales con los del endpoint.
- **Sin UID** (RNF-06): esas funciones no leen `credencial_nfc`.
- **Límite:** la lista exporta como máximo `EXPORTACION_MAX_FILAS` filas (5000 por defecto). Si el filtro da más, responde **`422`** «La exportación tendría N filas y el máximo es M. Acota el periodo o los filtros.», en lugar de cortar el archivo en silencio.
- **Nombres de archivo descriptivos y solo ASCII**, por ejemplo:
  - `asistencias_D01_Ingenieria-de-Software_2026-10-01_a_2026-10-31.xlsx`
  - `estadisticas_D01_2026-10-01_a_2026-10-31.pdf`
- **XLSX:** `exceljs` escribe los textos como texto, nunca como fórmula, así que un nombre que empiece con `=` no se ejecuta en Excel.
- **PDF:** `pdfkit`, tamaño carta horizontal, con Helvetica (incluye acentos y eñes). Las tablas se reparten en varias páginas con la cabecera repetida, y cada hoja lleva su número de página.
- **Dependencias:** `exceljs@4` depende de `uuid@8`, que tiene una alerta moderada (GHSA-w5hq-g745-h8pq). La alerta es por las funciones v3, v5 y v6 con un buffer, que `exceljs` no usa. Aun así, `package.json` fuerza `uuid@11` con `overrides`. `npm audit` reporta 0 vulnerabilidades.

## Página web

La web vive en la carpeta `web/`, con su propio `package.json`: **Vite, React, TypeScript y React Router**. Sigue los bocetos de la Actividad 11 (pantallas P1 a P5) y se construye en cinco entregas:

| Entrega | Contenido | Estado |
|---|---|---|
| 1 | Proyecto, CI, inicio de sesión (P1), encabezado y rutas por rol | Lista |
| 2 | Consulta de asistencias (P2) con aviso en vivo y exportación | Lista |
| 3 | Estadísticas (P3) | Pendiente |
| 4 | Gestión de estudiantes (P4 y P5) | Pendiente |
| 5 | Express sirve la web en producción | Pendiente |

### Levantar la web en desarrollo

Hacen falta dos terminales: una para la API y otra para la web.

```bash
# Terminal 1, en la raíz del repositorio: la API en http://localhost:3000
npm run dev

# Terminal 2: la web en http://localhost:5173
cd web
npm install
npm run dev
```

Abre `http://localhost:5173` y entra con una de las [credenciales de prueba](#credenciales-de-prueba).

| Comando (dentro de `web/`) | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run typecheck` | Verifica los tipos |
| `npm run build` | Compila a `web/dist/` |
| `npm test` | Corre las pruebas (no necesitan la API ni la base) |

Si la API corre en otra dirección, indícala al arrancar la web con la variable `TAPLIST_API_URL` (por defecto, `http://localhost:3000`).

### Mismo origen y sesión

- **La web y la API deben estar en el mismo origen.** La cookie de sesión es `httpOnly` y `SameSite=Strict`: JavaScript no puede leerla y el navegador no la envía a otro sitio.
  - En desarrollo, Vite reenvía todo lo que empieza con `/api` a la API (`web/vite.config.ts`).
  - En producción, Express servirá la web compilada junto con la API (entrega 5).
- **La web no guarda ningún token:** ni en `localStorage`, ni en `sessionStorage`, ni en memoria. Para saber si hay sesión, al abrir la página consulta `GET /api/auth/me`.
- **Las rutas por rol son una comodidad, no la seguridad.** `RutaProtegida` evita mostrar una pantalla que no corresponde, pero quien decide es la API, que valida el rol en cada solicitud (RF-09).

### Rutas

| Ruta | Pantalla | Quién |
|---|---|---|
| `/login` | P1 · Inicio de sesión | Todos |
| `/aviso-de-privacidad` | Aviso de privacidad (borrador) | Todos |
| `/asistencias` | P2 · Consulta de asistencias | Docente |
| `/estadisticas` | P3 · Estadísticas (en construcción) | Docente |
| `/estudiantes` | P4 · Gestión de estudiantes (en construcción) | Administrador |
| `/estudiantes/nuevo` | P5 · Agregar estudiante (en construcción) | Administrador |

- Después de entrar, la web va a la ruta que indica la API en `redirigirA`. Solo acepta rutas internas; cualquier otra cosa se cambia por el inicio del rol.
- Sin sesión, una ruta protegida lleva al login. Con sesión y otro rol, muestra «Sin permiso».

### Manejo de errores

Todas las pantallas llaman a la API con una sola función, `pedir` (`web/src/api/cliente.ts`), que convierte cualquier fallo en un `ErrorApi` con el código, el mensaje y los detalles por campo:

| Respuesta | Qué hace la web |
|---|---|
| `400` | Muestra el mensaje de cada campo junto al campo |
| `401` | Cierra la sesión de la web y lleva al login con el aviso «Tu sesión terminó». En el login significa «credenciales incorrectas» y se muestra el mensaje genérico de la API |
| `403` | «Sin permiso» |
| `404` | «No encontrado» |
| `409` y `429` | Muestra el mensaje de la API |
| Sin red | «No se pudo conectar con el servidor» |

### Diferencias con los bocetos de la Actividad 11

| Boceto | En la web | Motivo |
|---|---|---|
| «¿Olvidaste tu contraseña?» (P1) | Muestra «Para restablecer tu contraseña, contacta al administrador del sistema» | La API no tiene recuperación de contraseña. Queda como pendiente |
| Dirección `/admin/estudiantes` (P4 y P5) | `/estudiantes` y `/estudiantes/nuevo` | Son las rutas que devuelve la API en `redirigirA` |
| Pestaña «Asistencias» del Administrador (P4) | No aparece todavía | La consulta de asistencias es solo para Docentes. Se decide en la entrega 4 |
| «Prof. R. Navarro · Docente» | Nombre y apellidos completos, y el rol | La API no devuelve un nombre abreviado |

| Filas con «Falta» y filtro de estudiante por nombre (P2) | Iguales al boceto | Se agregaron a la API (`GET /api/asistencias` con faltas, pendientes y `q`) |
| Estados de P2: Asistencia, Retardo y Falta | Además, «Pendiente» (etiqueta gris) | Quien todavía puede registrar no es falta; ver [Faltas y pendientes](#faltas-y-pendientes) |
| «Lector: Aula 3» (P2) | El nombre del dispositivo, por ejemplo «Módulo X, aula 101» | Es el `nombre_ubicacion` que se registró para el lector |
| Fechas «10/10/2026» en los filtros (P2) | Campo de fecha del navegador | Se muestra en el formato del idioma del navegador; en español, día/mes/año |

La tarjeta «Estudiantes en el grupo» de P3 se decide en el plan de la entrega 3.

### P2 · Consulta de asistencias

- **Filtros:** Grupo, Clase (solo las del grupo elegido), Estudiante (texto: nombre o matrícula, sin acentos), Estado (Asistencia, Retardo, Pendiente o Falta), Desde y Hasta. «Buscar» los aplica y «Limpiar» vuelve a **la última semana sin filtros**, que es también lo que se ve al entrar.
- **Los filtros viven en la dirección de la página** (`/asistencias?id_grupo=1&estado=Falta…`): sobreviven a una recarga y se pueden guardar como favorito.
- **Tabla:** estudiante, grupo, clase, fecha (`dd/mm/aaaa`), hora, estado y lector, con 20 filas por página. Faltas y pendientes muestran «—» en hora y lector.
- **En vivo (RNF-01):** la página abre `EventSource('/api/asistencias/eventos')` (`useEnVivo.ts`).

  | Evento o situación | Qué hace la web |
  |---|---|
  | `conectado` | Indicador «En vivo». Si era una reconexión, vuelve a pedir la lista |
  | `asistencia` | Vuelve a pedir la lista (varias lecturas seguidas, una sola vez, a los 300 ms) y muestra «última lectura hace N s» |
  | `sesion_terminada` | Cierra la conexión y lleva al login con «Tu sesión terminó» |
  | Corte de red | «Reconectando…»; el navegador reintenta solo |
  | El navegador deja de reintentar | «Sin actualización automática»; revisa la sesión y abre otra conexión a los 10 s |

- **Pendientes que vencen:** un pendiente pasa a falta sin que llegue ninguna lectura, así que mientras haya pendientes en pantalla la lista se vuelve a pedir cada minuto.
- **Exportar PDF o XLSX:** usa los filtros aplicados y el nombre de archivo que propone la API. Si pasa de `EXPORTACION_MAX_FILAS` (`422`), pide acotar los filtros.
- **Teléfono:** los filtros se acomodan en dos columnas y la tabla se desplaza de lado, sin ensanchar la página.

### Pruebas de la web

Hay 56 pruebas en cuatro archivos de `web/src/pruebas/`, con Vitest y Testing Library. Montan la aplicación completa y sustituyen `fetch` por una API simulada; una llamada que la prueba no espera la hace fallar.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `login.test.tsx` | 14 | Los elementos del boceto, la entrada de cada rol a su pantalla, `redirigirA` externo, `401`, `429`, `400` por campo, sin red, `500`, validación sin llamar a la API, Mostrar/Ocultar, «¿Olvidaste tu contraseña?», el aviso de privacidad y que no se guarda nada en el navegador |
| `sesion.test.tsx` | 11 | Rutas protegidas sin sesión, sesión ya abierta, inicio por rol, «Sin permiso» en ambos sentidos, página no encontrada, estado de carga, cierre de sesión, y que un `401` posterior lleva al login mientras que un `403` o un `404` no |
| `asistencias.test.tsx` | 23 | P2: los elementos del boceto con una fila de cada estado, la semana por defecto, filtros desde la dirección y con «Buscar» y «Limpiar», clases según el grupo, fechas invertidas, paginación, lista vacía, en vivo (conexión, lectura nueva, reconexión, `sesion_terminada`, reintento tras un corte definitivo y cierre al salir), refresco de pendientes, exportación con filtros y `422`, `404`, sin red y `401`. El SSE se simula con `EventSourceFalso` |
| `cliente.test.ts` | 8 | `pedir`: JSON, `204`, mensajes y detalles de la API, mensajes propios por código, sin red, petición cancelada y aviso de pérdida de sesión solo con `401`; y `rutaDeInicio` |

Para confirmar que detectan errores reales, se rompió el código a propósito tres veces en la entrega 1: sin revisar el rol en `RutaProtegida` fallaron 2 pruebas; sin avisar del `401`, 2; y aceptando cualquier `redirigirA`, 1. En la entrega 2, siete veces, y cada una hizo fallar al menos una prueba: una lectura nueva que no recarga la lista, pendientes que no se refrescan, `sesion_terminada` que no cierra la sesión, una reconexión que no recarga, una exportación sin filtros, la semana por defecto un día más larga y «Pendiente» pintado como «Falta».

Además, la entrega 1 se probó a mano en un navegador contra la API real con la semilla: entrada de los dos roles, mensaje de credenciales incorrectas, recarga con la sesión abierta, «Sin permiso» y cierre de sesión. La cookie llegó como `httpOnly` y `SameSite=Strict`, y `document.cookie` quedó vacío.

La entrega 2 se probó igual, con la semilla y lecturas del simulador: los cuatro estados en la tabla, una lectura nueva que cambió una fila de «Pendiente» a «Retardo» en menos de un segundo sin recargar la página, la búsqueda «ramirez» (sin acento), la descarga del PDF con el filtro aplicado y la vista en un teléfono de 390 px.

## Decisiones técnicas

- **Node 24 LTS, Express 5 y TypeScript.** Express 5 propaga solo los errores de los handlers `async`, así que no hacen falta envoltorios. Las capas están separadas en `routes`, `controller`, `service` y `schemas` por módulo.
- **PostgreSQL con SQL directo (`pg`), sin ORM.** La migración es SQL legible que coincide uno a uno con el modelo entidad-relación entregado. Además, PostgreSQL permite `CHECK` con expresiones regulares, triggers en PL/pgSQL y `DROP DATABASE ... WITH (FORCE)` para las pruebas.
- **argon2id para las contraseñas** (19 MiB, 2 iteraciones, el mínimo que recomienda OWASP). Ganó el *Password Hashing Competition* y resiste ataques con GPU mejor que bcrypt.
- **JWT en una cookie `httpOnly` y `SameSite=Strict`, en lugar de sesiones del lado del servidor.** El token no se puede leer desde JavaScript (protege contra XSS) y no viaja en peticiones de otros sitios (protege contra CSRF). Además, no hace falta una tabla de sesiones fuera del modelo entidad-relación. La bandera `secure` depende de `NODE_ENV` y solo se activa en producción, porque en desarrollo y en pruebas el servidor corre en HTTP.
- **El rol nunca se toma del token.** El JWT solo lleva el id del usuario. En cada solicitud, `requiereSesion` vuelve a leer el usuario en la base y exige `activo = true`. Así, una cuenta desactivada o un cambio de rol aplican de inmediato (RF-09).
- **Error genérico con tiempo similar.** Si el correo no existe, la contraseña se verifica contra un hash ficticio. De esta forma, «correo inexistente», «contraseña incorrecta» y «cuenta inactiva» cuestan lo mismo: una verificación argon2 completa. En una medición local, las medianas fueron de 47.5 ms y 44.9 ms.
- **Validación con `zod`.** Repite en la API la validación de forma del frontend (paso 2 de AD-01). El correo se normaliza con `trim` y minúsculas, y la contraseña tiene un máximo de 256 caracteres para que no se pueda gastar CPU con hashes enormes. Las variables de entorno también se validan con `zod` al arrancar.
- **Orden alfabético fijo en las consultas.** Ver [Orden alfabético en español](#orden-alfabético-en-español).
- **Web con Vite, React y TypeScript en `web/`, en el mismo repositorio.** Un solo repositorio y un solo PR por cambio que toque la API y la web, con el mismo lenguaje y el mismo Vitest que el backend. Va en su propia carpeta, con su `package.json`, para no mezclar dependencias del navegador con las del servidor. Pocas librerías: React Router para las rutas y `fetch` para la API.
- **`helmet`** agrega los encabezados de seguridad, y `express.json` acepta como máximo 10 KB.

### Orden alfabético en español

Sin indicar nada, PostgreSQL ordena el texto según la configuración regional con la que se creó la base. Con la configuración «C» (habitual en contenedores e instalaciones mínimas) compara byte por byte: «Álvarez» y «Ñandú» quedan después de «Zúñiga», y las minúsculas, después de las mayúsculas. En «más faltas», que tiene un límite, eso cambia incluso **quién aparece** cuando hay empate.

- **Decisión:** todo `ORDER BY` sobre un texto visible lleva la constante `ORDEN_ES` (`COLLATE "es-x-icu"`, en `src/db/orden.ts`). El orden es el mismo en cualquier servidor: los acentos no mueven la letra y la «ñ» va después de la «n».
- **Dónde se usa:** lista de estudiantes (P4), grupos (P5), selectores de P2, y «por clase» y «más faltas» de P3. Los PDF y XLSX usan esas mismas consultas. Cada orden termina con el id, para que los empates salgan siempre igual.
- **Opciones descartadas:**
  - Crear la base con idioma español: depende de quien la instale, y los nombres de la configuración cambian entre Windows y Linux.
  - Cambiar la colación de las columnas con una migración: reconstruye índices y es un cambio grande para un problema de orden.
- **Cómo se vigila:** la base de pruebas se crea en configuración «C» (`colacionC` en `db/preparar-base.ts`). Una consulta nueva que ordene texto sin `ORDEN_ES` falla en cualquier computadora y en el CI.
- **Requisito:** PostgreSQL compilado con ICU. No cambia el modelo de datos ni necesita migración.
- **No afecta a la búsqueda `q`,** que ya usa `unaccent` e `ILIKE`.

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
docs/guia-firmware.md        guía del firmware: capa del lector, conexiones y pruebas
.gitleaks.toml               reglas de la revisión de secretos del CI
scripts/
  db-setup.ts                npm run db:setup
  dispositivo-clave.ts       npm run dispositivo:clave
  simular-lectura.ts         npm run simular:lectura
  uid-revisar.ts             npm run uid:revisar
src/
  config/env.ts              variables de entorno validadas con zod
  db/pool.ts                 pool de conexiones a PostgreSQL
  db/orden.ts                ORDEN_ES: orden alfabético en español para los ORDER BY
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
tests/                       pruebas unitarias y de integración de la API
web/                         página web (Vite, React y TypeScript), con su propio package.json
  vite.config.ts             proxy de /api en desarrollo y configuración de las pruebas
  src/api/cliente.ts         pedir(): única puerta hacia la API, con el manejo común de errores
  src/sesion/                ContextoSesion (usuario actual, entrar y salir) y rutas de inicio por rol
  src/api/asistencias.ts     tipos y llamadas de P2 (lista, filtros y exportación)
  src/componentes/           Marco (encabezado y menú), RutaProtegida y Paginacion
  src/paginas/               Login (P1), AvisoPrivacidad, SinPermiso, NoEncontrada y EnConstruccion
  src/paginas/asistencias/   Asistencias (P2) y useEnVivo (SSE)
  src/utilidades/fechas.ts   fechas y horas para mostrar y para los filtros
  src/pruebas/               pruebas de la web
```

Cada módulo nuevo va en `src/modules/<nombre>/` con la misma forma y se monta en `src/app.ts`.

## Pendientes

- **Acceso de estudiantes (UC-02): pendiente de definir.** El diagrama de casos de uso muestra un inicio de sesión para estudiantes, pero el modelo entidad-relación y los diagramas de actividades solo contemplan los roles Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Por ahora solo hay login para Docente y Administrador.
- **Recuperación de contraseña:** no existe. El boceto de P1 tiene «¿Olvidaste tu contraseña?», y la web solo pide contactar al administrador. Hacerla de verdad necesita envío de correos y un token de un solo uso; mientras tanto, un administrador tendría que cambiar la contraseña directamente en la base.
- **Aviso de privacidad:** la página `/aviso-de-privacidad` es un borrador marcado como tal. El texto definitivo (LFPDPPP) lo redacta el equipo.
- **Web:** faltan las entregas 2 a 5 (ver [Página web](#página-web)).
- El firmware del ESP32 lo programa el equipo en `firmware/`.
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
- **Lector NFC:** el equipo debe confirmar el modelo (previsto: RC522) y pasar la lista de pruebas de [`docs/guia-firmware.md`](docs/guia-firmware.md) con el circuito, incluida una credencial real de la escuela. Si se usa un lector USB en P5, hay que compararlo antes con `npm run uid:revisar`.
- La gestión de dispositivos desde la web (alta, baja y rotación de clave con bitácora) todavía no existe; por ahora la clave se asigna con `npm run dispositivo:clave`.
