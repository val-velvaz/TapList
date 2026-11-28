# CLAUDE.md · TapList

Este archivo es para Claude Code. Explica qué es TapList, cómo va el proyecto, lo que falta y cómo debes trabajar en este repositorio. Léelo completo al empezar cada sesión.

> **Estado actualizado al 28 de noviembre de 2026.** La sección 4 describe un momento concreto. Antes de actuar, confírmala contra el repositorio (`git log`, `gh pr list`) y actualízala cuando algo cambie.

---

## 1. El proyecto

**TapList** es un sistema de asistencia escolar con credenciales NFC. El estudiante acerca su credencial a un lector en el aula, y el sistema registra si llegó a tiempo, con retardo o si la lectura no es válida. Los docentes consultan la asistencia de sus grupos en una página web, ven estadísticas y descargan reportes. Un administrador da de alta a los estudiantes y les asigna su credencial.

- **Contexto académico:** proyecto de la materia Ingeniería de Software (CB224), CUCEI, Universidad de Guadalajara. Ciclo 2026-B. La evalúa la profesora de la materia.
- **Equipo SoftProduct:**
  - **Valeria Velázquez Vázquez** (`val-velvaz` en GitHub): dueña del repositorio. Hizo todo el backend contigo y es con quien hablas.
  - **Los otros dos integrantes** hacen el **firmware del ESP32 y el circuito**. Tienen poca experiencia con GitHub.
  - **Reparto del trabajo (decidido el 15 de noviembre):** tú (Claude Code) haces **toda la web** con Valeria. El firmware y el circuito son del equipo: **no escribas código en `firmware/`.** Lo tuyo es el servidor, la web, la documentación y las herramientas de apoyo.
- **Repositorio:** `https://github.com/val-velvaz/TapList` (público). Rama principal: `main`.

### Las tres partes del sistema

1. **Lector NFC (ESP32 con lector NFC, LED RGB y buzzer).** Lee el UID de la credencial, lo envía a la API y muestra el resultado con colores y sonidos. **No decide nada.**
2. **API (este repositorio).** Toda la lógica: credenciales, horarios, retardos, duplicados, roles, estadísticas y reportes.
3. **Página web (carpeta `web/`, en construcción).** Dos roles:
   - **Docente:** consulta las asistencias de sus grupos en tiempo real, ve estadísticas y exporta reportes.
   - **Administrador:** gestiona estudiantes y credenciales.

### Señales del lector

| Resultado | Señal | Pantalla del diseño |
|---|---|---|
| Asistencia | LED verde y 1 pitido corto | P9 |
| Retardo | LED amarillo y 2 pitidos cortos | P10 |
| Rechazada (credencial no válida o sin clase) | LED rojo y 1 pitido largo | P11 |
| No guardada (error, *timeout* o sin red) | 3 destellos azules, sin sonido | P12 |
| Encendido correcto | LED azul y 1 pitido corto | P8 |
| Sin alimentación | LED apagado y sin sonido | P7 |

### Pantallas diseñadas (Actividad 11)

| Pantalla | Contenido | Rol |
|---|---|---|
| P1 | Inicio de sesión (correo institucional, contraseña, aviso de privacidad) | Todos |
| P2 | Consulta de asistencias: tabla paginada, filtros, indicador «En vivo», exportar PDF o XLSX | Docente |
| P3 | Estadísticas: tarjetas de indicadores, gráfica por semana, tabla de estudiantes con más faltas, exportar | Docente |
| P4 | Gestión de estudiantes: lista con búsqueda y filtros, UID enmascarado, botón «Eliminar» con confirmación | Administrador |
| P5 | Agregar estudiante: formulario, «Leer tarjeta», UID enmascarado, «Guardar» o «Cancelar» | Administrador |
| P6 a P12 | Dispositivo físico: componentes, estados y señales | — |

### Requisitos que ya están en el código

Respétalos en todo lo que hagas:

| ID | Requisito |
|---|---|
| RF-04 | Solo registra asistencia una credencial activa de un estudiante activo. |
| RF-06 | Reportes exportables en PDF y XLSX. |
| RF-09 | Control de acceso por rol (Docente o Administrador). La API valida el rol en **cada** solicitud, leyéndolo de la base de datos, nunca del token. |
| RF-16 | Estadísticas por grupo, clase y periodo. |
| RNF-01 | La web refleja una lectura en un máximo de 5 segundos (SSE). |
| RNF-03 | Seguridad y trazabilidad: hashes argon2id y bitácora de solo inserción para las acciones del Administrador. |
| RNF-06 | El UID completo y el nombre del estudiante nunca salen en el lector, en las respuestas de la API ni en los logs. En la web, el UID solo aparece enmascarado (`****B2C3`). |

### Documentación de modelado ya entregada

El equipo entregó un documento con el modelo 4+1 que es la referencia del diseño. Lo que pide el código debe coincidir con él o los cambios deben quedar documentados.

- **Casos de uso:**
  - UC-01: inicio de sesión del docente.
  - UC-02: inicio de sesión del estudiante (**sin implementar**, ver la sección 6).
  - UC-03: registro de asistencia en el dispositivo.
- **Diagramas de actividades:**
  - AD-01: inicio de sesión.
  - AD-02: encendido del lector.
  - AD-03: registro de asistencia por NFC.
  - AD-04: consulta y exportación de asistencias.
  - AD-05: estadísticas.
  - AD-06: alta de estudiante y vinculación de la credencial.
  - AD-07: baja de estudiante.
- **Diagrama de secuencia:** registro de asistencia, incluido el caso sin conexión.
- **Modelo entidad-relación:** 8 entidades (USUARIO, GRUPO, CLASE, ESTUDIANTE, CREDENCIAL_NFC, DISPOSITIVO, ASISTENCIA y BITACORA). La implementación ya lo cambió en tres puntos (ver la sección 3.4).

---

## 2. Entorno de Valeria

- **Trabaja en dos computadoras: Windows y Parrot OS** (Linux basado en Debian, con zsh). Pregúntale en cuál está antes de darle comandos; si no lo dice, da los dos.
- **En Parrot OS** (desde el 19 de noviembre): Node 24 con **nvm** (`nvm install` y `nvm use` leen `.nvmrc`; si una terminal no encuentra `npm`, `nvm use`). PostgreSQL de `apt`, con el usuario `postgres` con contraseña `postgres` **solo para desarrollo** (en Linux no entra sin contraseña por `localhost`), así que su `.env` usa `PGPASSWORD=postgres` y `psql` necesita `PGPASSWORD=postgres psql -h localhost -U postgres`.
- **En Windows**, la terminal está en alemán: verás mensajes como «Der Befehl … konnte nicht gefunden werden».
- **Node 24 LTS** con nvm-windows, en `C:\nvm4w\nodejs`. El proyecto exige `>=24 <25` (`.nvmrc` y `engines`).
- **GitHub CLI** en `C:\Program Files\GitHub CLI`, con sesión iniciada como `val-velvaz`.
- **Terminales antiguas:** las que se abrieron antes de instalar nvm-windows y `gh` no encuentran `node` ni `gh`. Una terminal nueva sí los encuentra. Si te pasa, agrega esas dos rutas al `PATH` del comando; no reinstales nada.
- **PostgreSQL 18 local en Windows.** `psql` entra como `postgres` sin pedir contraseña (por `pgpass.conf` o por confianza local). Ahí el `.env` usa `PGUSER=postgres` con `PGPASSWORD` vacío.
- **La carpeta de usuario de Windows es un repositorio de Git**, probablemente creado por accidente. Trabaja siempre dentro de la carpeta del proyecto, que tiene su propio `.git`. Nunca hagas commits en el repositorio de la carpeta de usuario.
- **`curl` en Windows rompe los acentos** si el JSON va en la línea de comandos: «Núñez» llega como «N�ez». Para probar a mano con acentos, manda el cuerpo desde un archivo UTF-8 (`curl --data-binary @cuerpo.json`) o usa `Invoke-RestMethod`. No es un problema de la API.
- **`main` está protegida** con un ruleset: exige los checks «Tipos, compilación y pruebas» y «Web: tipos, compilación y pruebas» y bloquea los *force push*. El tercer check, «Secretos: gitleaks», existe desde el PR de `ci/revision-secretos`; Valeria debe agregarlo al ruleset (si no lo ha hecho, recuérdaselo). No exige aprobaciones, porque Valeria trabaja sola en el repositorio y GitHub no deja aprobar los propios PR.
- **Ya usaste Auto-fix** en algunos PR para atender fallas del CI y comentarios. CodeRabbit deja un comentario automático diciendo que no revisa el repositorio por tener pocas estrellas; ignóralo salvo que Valeria pida la revisión.

---

## 3. Arquitectura del backend

El README (unas 900 líneas) tiene el detalle de cada módulo, las reglas del esquema, la tabla de pruebas, las decisiones técnicas y los pendientes. **Es la fuente de verdad del detalle.** Esta sección es el mapa.

### 3.1 Stack

| Pieza | Versión o herramienta |
|---|---|
| Lenguaje y servidor | Node.js 24 LTS, TypeScript 7 (ESM, `"type": "module"`), Express 5 |
| Base de datos | PostgreSQL 14 o superior (local 18, CI 18), con `pg` y **SQL directo, sin ORM** |
| Validación | `zod` 4, también para las variables de entorno (`src/config/env.ts`) |
| Seguridad | `argon2` (argon2id), `jsonwebtoken` (JWT en cookie `taplist_sesion`, `httpOnly`, `SameSite=Strict`, `secure` solo en producción), `helmet`, `express-rate-limit` |
| Exportación | `pdfkit` (PDF) y `exceljs` (XLSX). `overrides` fuerza `uuid@11` por una alerta en `exceljs@4` |
| Pruebas | Vitest 4, Supertest y `unpdf` para leer los PDF |
| Desarrollo | `tsx` |

### 3.2 Scripts

```bash
npm run dev                          # servidor con recarga automática (puerto 3000)
npm run build && npm start           # compilar a dist/ y ejecutar
npm run typecheck                    # tsc --noEmit
npm test                             # todas las pruebas (recrean taplist_test solas)
npm run db:setup                     # crea "taplist", migra y carga la semilla
npm run db:setup -- --reset          # borra "taplist" y la recrea
npm run dispositivo:clave -- <id>    # genera o rota la clave de un lector y la muestra una sola vez
npm run dispositivo:diagnostico [-- <uid>] [--real] [--url <dir>] [--id <id>]   # revisa red, clave, UID y clase como el ESP32; sin --real no registra nada
npm run simular:lectura -- <uid> [--leido-en <ISO>]   # simula el ESP32
npm run uid:revisar -- <valor> [--comparar <otro>]    # revisa el formato de un UID y lo compara con otro
npm run dev:clase-ahora [-- --minutos N]              # SOLO DESARROLLO: clase de prueba de D01 que empieza en N minutos
npm run dev:vincular [-- <uid> --matricula <m>]       # SOLO DESARROLLO: vincula una tarjeta real a un estudiante de D01

# La web, dentro de web/ (con la API corriendo en otra terminal):
npm run dev                          # web en http://localhost:5173, con /api reenviado a la API
npm run typecheck && npm run build && npm test
```

### 3.3 Estructura

```
.github/workflows/pruebas.yml   CI con tres trabajos: la API (PostgreSQL 18), la web (npm ci, typecheck, build y test) y «Secretos: gitleaks»
.gitleaks.toml                  reglas de gitleaks: las de fábrica más archivo-de-secretos, secreto-en-firmware y url-apps-script
firmware/                       código del lector, del equipo: firmware.ino, secretos.ejemplo.h y LEEME.md (secretos.h está en .gitignore)
db/migrations/001..004          esquema (orden alfabético)
db/seeds/001_datos_prueba.sql   datos ficticios solo para desarrollo
db/preparar-base.ts             crea la base, migra y carga la semilla
docs/contrato-dispositivo.md    contrato de la API para el firmware del ESP32 (incluye el formato canónico del UID)
docs/guia-firmware.md           guía para el equipo: capa del lector, conexiones y lista de pruebas
docs/prueba-con-dispositivo.md  probar el ESP32 real contra la API de una computadora del equipo (lista de 10 minutos, IP, firewall, hotspot)
docs/revision-firmware.md       qué le falta a firmware/firmware.ino para hablar con la API, con líneas y correcciones sugeridas
docs/cambios-al-modelo.md       los tres cambios al modelo ER, con el diagrama Mermaid generado de las migraciones
docs/decisiones-pendientes.md   UC-02, recuperación de contraseña y aviso de privacidad: opciones, costo y recomendación
scripts/                        db-setup, dispositivo-clave, dispositivo-diagnostico, simular-lectura, uid-revisar, dev-clase-ahora, dev-vincular
src/app.ts                      arma Express y monta las rutas (lo usan el servidor y las pruebas)
src/server.ts                   punto de entrada; escucha en todas las interfaces y, en desarrollo, muestra las IP de red; cierra las conexiones SSE al apagar
src/desarrollo/                 herramientas solo de desarrollo (clase de prueba, vincular tarjetas, diagnóstico del lector y tabla de señales); excluidas de dist/
src/config/env.ts               variables de entorno validadas con zod
src/db/pool.ts                  pool de pg; cada sesión usa timezone = ZONA_HORARIA_ESCUELA
src/db/transaccion.ts           conTransaccion(fn): BEGIN / COMMIT / ROLLBACK
src/db/orden.ts                 ORDEN_ES: orden alfabético en español para los ORDER BY
src/eventos/eventos.ts          EventEmitter tipado: asistencia:registrada (sin UID)
src/middleware/                 requiereSesion, requiereRol, requiereDispositivo,
                                limiteIntentos, limiteDispositivo, manejoErrores
src/modules/<módulo>/           <módulo>.routes / .controller / .service / .schemas
  auth, lecturas (+ tiempo.ts), estudiantes, grupos, bitacora, dispositivos,
  asistencias (+ registros.ts: faltas y pendientes; tiempoReal.ts: SSE), estadisticas, exportacion (+ pdf.ts, xlsx.ts)
src/utils/                      HttpError, contrasena, sesion, uid, erroresPg, validacion, busqueda
tests/                          auth, tiempo, lecturas, estudiantes, asistencias, estadisticas, orden, uid, faltas, desarrollo, diagnostico
                                + datos.ts (credenciales de prueba) y globalSetup.ts
web/                            página web: Vite, React, TypeScript y React Router, con su propio package.json
  vite.config.ts                proxy de /api hacia la API en desarrollo y configuración de Vitest
  src/api/cliente.ts            pedir() y descargarArchivo(): única puerta hacia la API, con el manejo común de errores (ErrorApi)
  src/api/asistencias.ts        tipos y llamadas de P2
  src/api/estadisticas.ts       tipos y llamadas de P3
  src/sesion/                   ContextoSesion (usuario, iniciarSesion, cerrarSesion) y rutas de inicio por rol
  src/componentes/              Marco (encabezado y menú por rol), RutaProtegida y Paginacion
  src/paginas/                  Login (P1), AvisoPrivacidad, SinPermiso, NoEncontrada, EnConstruccion
  src/paginas/asistencias/      Asistencias (P2) y useEnVivo (SSE)
  src/paginas/estadisticas/     Estadisticas (P3) y GraficaSemanal (barras propias)
  src/utilidades/fechas.ts      fechas y horas para mostrar y para los filtros
  src/pruebas/                  login, sesion, cliente, asistencias y estadisticas + ayudas.tsx (simularApi, montar,
                                API_P2_VACIA) y eventSourceFalso.ts
```

Cada módulo nuevo va en `src/modules/<nombre>/` con la misma forma, y se monta en `src/app.ts`.

### 3.4 Base de datos

**Tablas:** `usuario`, `grupo`, `clase`, `estudiante`, `credencial_nfc`, `dispositivo`, `asistencia`, `bitacora` y, desde la migración 004, `inscripcion_grupo`.

**Reglas clave** (el detalle está en el README, sección «Reglas del esquema»):

- **Llaves foráneas:** todas con `ON DELETE RESTRICT`. Nada se borra; las bajas son lógicas (`activo = false`).
- **`UNIQUE`:**
  - `usuario.correo` (en minúsculas).
  - `estudiante.matricula`.
  - `credencial_nfc.uid` (en toda la tabla, también entre credenciales inactivas).
  - `asistencia (id_estudiante, id_clase, fecha)`.
- **Índices únicos parciales:**
  - `credencial_nfc (id_estudiante) WHERE activa`: una sola credencial activa por estudiante.
  - Una sola inscripción vigente por estudiante.
- **`CHECK`** en `rol`, `estado`, `dia_semana` (1 = lunes … 7 = domingo) y `tolerancia_min >= 0`.
- **Triggers:**
  - Mantienen `updated_at`.
  - Exigen que `clase.id_docente` sea un Docente y que `bitacora.id_usuario` sea un Administrador.
  - Hacen la bitácora de solo inserción.
  - Mantienen `inscripcion_grupo` al dar de alta, dar de baja, cambiar de grupo o reactivar.
- **Extensión `unaccent`** para buscar estudiantes sin distinguir acentos.

**Cambios respecto al modelo entidad-relación entregado.** Están documentados en el README, sección «Cambios al modelo de datos», y **el diagrama entregado todavía no los refleja:**

1. **Migración 002:** `dispositivo.clave_api_hash`, para autenticar a los lectores.
2. **Migración 003:** ESTUDIANTE–CREDENCIAL_NFC pasa de **1:1 a 1:N**, con a lo más una credencial activa, para reemplazar credenciales sin perder el historial.
3. **Migración 004:** la tabla nueva **`inscripcion_grupo`** (`id_inscripcion`, `id_estudiante`, `id_grupo`, `desde`, `hasta`), para no contar faltas fuera del periodo en que el estudiante perteneció al grupo.

**Semilla y credenciales de desarrollo:** el README, sección «Credenciales de prueba», tiene el Administrador, los dos Docentes, el dispositivo 1 con su clave y los UID de los 5 estudiantes. **Son solo para desarrollo.** Nunca cargues la semilla fuera de desarrollo ni reutilices esas claves.

### 3.5 Endpoints

| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/auth/login` | Público, con límite por correo e IP | `{ correo, contrasena }` → `{ usuario, redirigirA }` y la cookie. Responde `401` genérico, `400` o `429`. |
| `POST /api/auth/logout` | — | Borra la cookie. **No** revoca el JWT; ver el README. |
| `GET /api/auth/me` | Sesión | Usuario actual |
| `POST /api/dispositivo/lecturas` | Dispositivo (`X-Dispositivo-Id`, `X-Dispositivo-Clave`) | Registro de asistencia (AD-03). Ver `docs/contrato-dispositivo.md`. |
| `GET /api/estudiantes` | Administrador | Lista paginada. Busca con `q` y filtra por `id_grupo`, `con_credencial` y `estado`. |
| `GET /api/estudiantes/:id` | Administrador | Detalle con la credencial activa y el historial de credenciales (UID enmascarado) |
| `POST /api/estudiantes` | Administrador | Alta, con `uid` opcional (todo o nada) |
| `POST /api/estudiantes/:id/credencial` | Administrador | Vincular una credencial |
| `PUT /api/estudiantes/:id/credencial` | Administrador | Reemplazar la credencial (la anterior queda inactiva en el historial) |
| `POST /api/estudiantes/:id/baja` | Administrador | Baja lógica (AD-07) |
| `GET /api/grupos` | Administrador | Grupos para el formulario de alta |
| `GET /api/asistencias` | Docente | Lista paginada de **sus** clases: asistencias, retardos, faltas y pendientes. Filtros, incluida la búsqueda `q` por nombre o matrícula |
| `GET /api/asistencias/filtros` | Docente | Sus grupos y clases, para los selectores |
| `GET /api/asistencias/eventos` | Docente | SSE: asistencias nuevas de sus clases, con `Last-Event-ID`, latido y `sesion_terminada` |
| `GET /api/asistencias/exportar?formato=pdf\|xlsx` | Docente | La lista de P2 en un archivo |
| `GET /api/estadisticas` | Docente | Indicadores de P3 (`desde` y `hasta` obligatorios) |
| `GET /api/estadisticas/exportar?formato=pdf\|xlsx` | Docente | Las estadísticas en un archivo |

**Convenciones de respuesta:**

- `400`: datos inválidos, con detalle por campo.
- `401`: sin sesión.
- `403`: rol incorrecto.
- `404`: no existe **o es de otro docente**. Las dos respuestas son idénticas, para no revelar que el recurso existe.
- `409`: conflicto (duplicados o un estado que no permite la operación).
- `422`: la exportación supera `EXPORTACION_MAX_FILAS`.
- `429`: límite de solicitudes.

Las listas devuelven `pagina`, `por_pagina`, `total` y `total_paginas`.

**Reglas de negocio que no debes romper:**

- **Ventana de una lectura:** cuenta para una clase entre `hora_inicio − 15 min` y `hora_inicio + 60 min`, ambos configurables. Hasta `hora_inicio + tolerancia_min` es Asistencia; después, Retardo. Todo se calcula en `ZONA_HORARIA_ESCUELA` (`America/Mexico_City`), nunca en la zona del servidor.
- **Duplicados:** `INSERT … ON CONFLICT DO NOTHING` y luego se lee el registro existente. Una lectura repetida responde `duplicado: true` con el mismo estado.
- **Formato del UID:** uno solo, el canónico de `docs/contrato-dispositivo.md`: hexadecimal en mayúsculas, sin separadores, bytes en el orden de la anticolisión, de 4, 7 o 10 bytes (8, 14 o 20 caracteres; `PATRON_UID` en `src/utils/uid.ts`). La API normaliza mayúsculas, espacios y dos puntos, y rechaza con `400` cualquier otra longitud. El servidor no sabe ni debe saber qué modelo de lector hay.
- **Lecturas sin conexión:** llegan con `leido_en` y se aceptan desde 24 horas atrás hasta 2 minutos en el futuro.
- **Faltas y pendientes:** no se guardan, se calculan en `src/modules/asistencias/registros.ts`, **el único lugar** que define los estados; lo usan P2, P3 y las dos exportaciones, así que sus totales coinciden. Una sesión es un par (clase, fecha) en el que **alguien registró asistencia** («hubo clase si alguien registró»). Los esperados salen de `inscripcion_grupo`, sin contar el día del alta ni el de la baja. Quien no registró es **`Pendiente`** mientras la ventana de la clase siga abierta (hasta `hora_inicio + max(MINUTOS_MAX_REGISTRO, tolerancia_min)`, ese minuto incluido) y **`Falta`** después. En P3, un pendiente no cuenta en los esperados, las faltas ni el porcentaje; va aparte en `pendientes`. La hora actual llega como parámetro (`ahora`) desde la API, nunca del reloj de PostgreSQL, para que las pruebas la fijen.
- **Aislamiento entre docentes:** un docente filtra por un estudiante si este pertenece hoy a uno de sus grupos **o** tiene asistencias en alguna de sus clases.

### 3.6 Variables de entorno

`.env.example` las documenta todas:

- **Servidor:** `NODE_ENV` y `PORT`.
- **Base de datos:** `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` y `PGDATABASE_TEST`.
- **Sesión y login:** `JWT_SECRET`, `JWT_EXPIRACION_HORAS`, `LOGIN_MAX_INTENTOS`, `LOGIN_MAX_INTENTOS_IP` y `LOGIN_VENTANA_MINUTOS`.
- **Lecturas:** `ZONA_HORARIA_ESCUELA`, `MINUTOS_ANTES_CLASE`, `MINUTOS_MAX_REGISTRO` y `HORAS_MAX_LECTURA_OFFLINE`.
- **Dispositivos:** `DISPOSITIVO_MAX_SOLICITUDES_MINUTO` y `DISPOSITIVO_MAX_FALLOS_IP`.
- **SSE:** `SSE_LATIDO_SEGUNDOS` y `SSE_MAX_CONEXIONES_DOCENTE`.
- **Exportación:** `EXPORTACION_MAX_FILAS`.
- **Simulador:** `SIMULADOR_API_URL`, `SIMULADOR_DISPOSITIVO_ID` y `SIMULADOR_DISPOSITIVO_CLAVE`.

Toda variable nueva va en `.env.example` **y** en `src/config/env.ts`.

### 3.7 Pruebas

Según el README, hay **240 pruebas** en 11 archivos:

| Archivo | Pruebas |
|---|---|
| `auth.test.ts` | 19 |
| `tiempo.test.ts` | 22 |
| `lecturas.test.ts` | 26 |
| `estudiantes.test.ts` | 38 |
| `asistencias.test.ts` | 18 |
| `estadisticas.test.ts` | 21 |
| `orden.test.ts` | 10 |
| `uid.test.ts` | 24 |
| `faltas.test.ts` | 15 |
| `desarrollo.test.ts` | 13 |
| `diagnostico.test.ts` | 34 |

Cómo están hechas:

- Corren contra `taplist_test`, que `tests/globalSetup.ts` recrea en cada corrida **con la configuración regional «C»**, para que una consulta que ordene texto sin `ORDEN_ES` falle en cualquier computadora.
- `vitest.config.ts` genera un `JWT_SECRET` aleatorio, baja `SSE_LATIDO_SEGUNDOS` a 0.5 y `EXPORTACION_MAX_FILAS` a 12, y corre los archivos en serie (`fileParallelism: false`).
- Las de lecturas fijan el reloj y corren el proceso en la zona `Asia/Tokyo`, para comprobar que no se usa la zona del servidor.
- Las de estadísticas usan un mes de datos con resultados **calculados a mano** (7 sesiones, 26 esperados, 12 asistencias, 4 retardos, 10 faltas, 61.5 %).
- **Mutaciones a propósito:** ya se rompió el código a propósito para comprobar que las pruebas importantes detectan errores reales. Por ejemplo, se quitó el `BEGIN` de las transacciones, se enviaron los eventos SSE a todos los docentes y se contó el día del alta como falta.

**Confirma el conteo con `npm test` al empezar.** Si no coincide, actualiza la tabla del README.

**Pruebas de la web:** aparte, en `web/src/pruebas/`, hay **78 pruebas** en 5 archivos (`login` 14, `sesion` 11, `cliente` 8, `asistencias` 23, `estadisticas` 22). Toda pantalla que entre a `/asistencias` necesita las respuestas de P2 (usa `API_P2_VACIA`); el SSE se simula con `EventSourceFalso`, que `preparar.ts` instala antes de cada prueba. Se corren con `npm test` dentro de `web/`, no necesitan la API ni la base (sustituyen `fetch` con `simularApi`) y montan la aplicación completa con `montar(ruta)`.

---

## 4. Estado del proyecto (al 28 de noviembre de 2026)

### Historial de PR

| PR | Rama | Contenido | Estado |
|---|---|---|---|
| #1 | `feat/registro-nfc` | Esquema 001-002, login, registro NFC, simulador, contrato del dispositivo | Fusionado |
| #2 | `ci/pruebas-automaticas` | Workflow de CI | Fusionado |
| #3 | `feat/gestion-estudiantes` | Migración 003, transacciones, bitácora, gestión de estudiantes | Fusionado (`2214441`) |
| #4 | `feat/consulta-asistencias` | Consulta de asistencias y SSE | Fusionado (`284efb3`) |
| #5 | `feat/estadisticas-exportacion` | Migración 004, estadísticas, exportación PDF y XLSX | Fusionado el 15 de noviembre (`47ad82f`) |
| #6 | `docs/claude-md` | Este archivo | Fusionado el 15 de noviembre (`f79a04a`) |
| #7 | `fix/orden-alfabetico` | Orden alfabético en español en todas las listas y base de pruebas en configuración «C» | Fusionado el 15 de noviembre (`4cd8367`) |
| #8 | `docs/lector-nfc` | Formato canónico del UID, guía del firmware, `uid:revisar` y longitud exacta del UID en la API | Fusionado el 15 de noviembre (`9c4b386`) |
| #9 | `feat/web-base-login` | Web, entrega 1: proyecto en `web/`, trabajo de CI, login (P1), encabezado y rutas por rol | Fusionado (`920daed`) |
| #10 | `feat/faltas-y-busqueda` | API para la entrega 2: faltas y pendientes en P2 con la misma regla que P3, y búsqueda `q` | Fusionado (`1076ce0`) |
| #11 | `feat/web-asistencias` | Web, entrega 2: P2 con filtros, en vivo, refresco de pendientes y exportación; semilla inscrita desde el inicio del ciclo | Fusionado (`1b74aac`) |
| #12 | `feat/estudiantes-en-grupo` | API para la entrega 3: `estudiantes_en_grupo` en P3, a la fecha final del periodo | Fusionado (`05dd375`) |
| #13 | `feat/registro-nfc` | Primer código del firmware, de una compañera; traía la contraseña de un Wi-Fi y la dirección de un Apps Script | **Cerrado sin fusionar** (25 de noviembre). Su código pasó al #16, sin los datos privados. La rama la borra Valeria |
| #14 | `chore/prueba-dispositivo` | Prueba con el ESP32 real: `dev:clase-ahora`, `dev:vincular` y `docs/prueba-con-dispositivo.md` | Fusionado el 28 de noviembre (`f8d11a7`) |
| #15 | `feat/web-estadisticas` | Web, entrega 3: P3 con tarjetas, gráfica semanal propia y exportación | Fusionado el 28 de noviembre (`a1688b4`) |
| #16 | `firmware/version-inicial` | El código del #13 en `firmware/`, sin cambiar su lógica, con los datos privados en `firmware/secretos.h` | Fusionado el 28 de noviembre (`2098f67`) |
| #17 | `ci/revision-secretos` | Revisión de secretos con gitleaks en el CI | Fusionado el 28 de noviembre (`a2fe9a8`) |
| #18 | `docs/preparacion-entrega` | Revisión del firmware, `dispositivo:diagnostico`, lista de 10 minutos, cambios al modelo con diagrama y decisiones pendientes | Abierto, **no fusionar sin que Valeria lo pida** |

Los cuatro (#17, #14, #15 y #16) se fusionaron el 28 de noviembre en ese orden, con merge commit. Después se revisó `main` con gitleaks: la contraseña del #13 **no llegó** a `main` ni a otra rama; solo está en `feat/registro-nfc` (y en el PR #13 cerrado, que GitHub conserva). Se le pidió a la compañera cambiar la contraseña del router.

### Avance aproximado

| Parte | Peso | Avance |
|---|---|---|
| Análisis y diseño | 15 % | 100 % |
| Backend | 40 % | 100 % (quedan los pendientes menores de la sección 5) |
| Web | 25 % | ≈ 70 %. Entregas 1, 2 y 3 fusionadas (P1, P2 y P3). Faltan P4, P5 y producción. |
| Firmware del ESP32 y circuito | 15 % | ≈ 15 %. La versión inicial está en `main`, pero todavía envía a Google Sheets: `docs/revision-firmware.md` dice qué le falta. El circuito está en prototipo. |
| Puesta en marcha | 5 % | 0 % |
| **Total** | | **≈ 75 %** |

---

## 5. Lo que sigue, en orden

### Paso 0. Al abrir la sesión

1. `git fetch` y revisa `git log origin/main`, las ramas remotas y `gh pr list --state all`.
2. Confirma si el PR de estadísticas ya se fusionó y si el equipo subió algo (ramas `feat/frontend`, `firmware/` u otras).
3. Corre `npm ci` y `npm test`.
4. Dile a Valeria en lenguaje sencillo qué encontraste antes de proponer nada.

### Paso 1. Cerrar las estadísticas

Si el PR de `feat/estadisticas-exportacion` no existe, ábrelo. Si existe, revisa su CI con `gh` y corrige en la misma rama lo que falle. **No lo fusiones sin que Valeria lo pida.**

### Paso 2. Página web (la parte más grande que falta)

La haces tú. El plan general ya está aprobado (15 de noviembre): carpeta `web/` con Vite, React y TypeScript, y Express sirve la web en producción. Son **5 entregas, una rama y un PR por entrega:** (1) base, CI y P1; (2) P2 con SSE y exportación; (3) P3; (4) P4 y P5; (5) producción. **Antes de cada entrega, presenta un plan corto y espera aprobación.** Lo que cada plan debe respetar:

- **Referencia visual:** los bocetos de la Actividad 11 (P1 a P5), que Valeria compartió en PDF. La web debe ser lo más fiel posible a ellos; los colores y las medidas ya están como variables en `web/src/estilos.css`. El PDF no está en el repositorio: si no lo tienes en la sesión, pídeselo.
- **Diferencias entre los bocetos y la API.** En el plan de la entrega que toque cada una, **propón si conviene agregarla a la API o ajustar la pantalla, con ventajas y desventajas**, y espera la decisión:
  - Entrega 2 (P2): **decidido (opción A en las dos):** la API agrega las filas de «Falta» y «Pendiente» y la búsqueda `q` por nombre o matrícula (PR #10). La web de P2 va en un PR aparte, después de fusionar el #10, y su plan corto se presenta antes.
  - Entrega 3 (P3, fusionada en el PR #15): **decidido el 21 de noviembre:**
    - La tarjeta «Estudiantes en el grupo» sale de la API (`estudiantes_en_grupo`, PR #12): inscritos en la fecha «Hasta» del periodo, no hoy.
    - La gráfica por semana se dibuja con barras propias (sin Recharts). Una semana sin sesiones se muestra como «sin clases», **nunca como 0 %**, y cada porcentaje se puede leer sin el mouse (visible o accesible para lectores de pantalla).
    - El periodo inicial son las últimas 6 semanas.
    - La web de P3 va en un PR aparte, después de fusionar el #12.
  - Entrega 4 (P4): la pestaña «Asistencias» del Administrador, cuando la consulta es solo para Docentes. Por ahora el menú del Administrador solo tiene «Estudiantes».
  - Ya decidida (P1): «¿Olvidaste tu contraseña?» muestra «contacta al administrador», sin funcionalidad. La recuperación real queda como pendiente.
- **Check del CI:** la web tiene su propio trabajo, «Web: tipos, compilación y pruebas», y ya está en el ruleset de `main` junto con el de la API.
- **Estado de las entregas:** 1, 2 y 3 fusionadas (P1, P2 y P3). Las pantallas P4 y P5 existen como rutas con la página `EnConstruccion`. El tamaño del archivo de la web (más de 500 KB) se atiende en la entrega 5 (decidido el 28 de noviembre).
- **Semilla:** los estudiantes están inscritos desde el 1 de agosto de 2026, así que una base recién creada ya muestra faltas. Para ver un «Pendiente» a mano hace falta una clase cuya ventana esté abierta en ese momento (por ejemplo, una clase de prueba insertada en la base de desarrollo) y una lectura con `simular:lectura`.

- **Ubicación:**
  - Recomendado: una carpeta `web/` en este mismo repositorio, con su propio `package.json`.
  - Alternativa: un repositorio aparte.
  - Si la web vive en este repositorio, el CI debe correr también sus verificaciones sin romper las de la API.
- **Stack:** por ejemplo, Vite, React y TypeScript. Propón y justifica; la decisión es del equipo.
- **Cookie y mismo origen:** la cookie de sesión es `SameSite=Strict` y `httpOnly`, así que la web debe servirse **desde el mismo sitio** que la API.
  - En desarrollo, usa el *proxy* de Vite hacia `http://localhost:3000`.
  - En producción, sirve la web y la API detrás del mismo dominio.
  - **No** relajes `SameSite` ni muevas el token a `localStorage`.
- **Pantallas:**
  - P1: login. Redirige según `redirigirA`.
  - P2: consulta, con `EventSource('/api/asistencias/eventos')`. Al recibir `conectado` después de una reconexión, vuelve a cargar la lista. Con `sesion_terminada`, manda al login.
  - P3: estadísticas, con gráfica por semana.
  - P4 y P5: gestión de estudiantes, con confirmación antes de la baja.
  - Descarga de PDF y XLSX.
- **Manejo de errores comunes:**
  - `401`: ir al login.
  - `403`: «sin permiso».
  - `404`: «no encontrado».
  - `409`: mostrar el mensaje de la API.
  - `422` de la exportación: pedir que se acote el filtro.
- **RNF-06:** el UID solo se muestra enmascarado. En P5, el campo del UID no debe quedar visible después de guardar.
- **Pruebas mínimas de la web** (por ejemplo, Vitest con Testing Library) y su verificación en el CI.

### Paso 3. Firmware del ESP32

Lo hacen los compañeros de Valeria, que tienen poca experiencia con GitHub. **Tú no escribes código en `firmware/`.**

- **Sus guías son `docs/contrato-dispositivo.md`, `docs/guia-firmware.md` y, para probar el ESP32 contra la computadora de Valeria, `docs/prueba-con-dispositivo.md`** (que empieza con una lista de 10 minutos para el día de la prueba). Si cambias el contrato, actualiza esos documentos y avísale a Valeria.
- **`docs/revision-firmware.md`** compara `firmware/firmware.ino` con el contrato, línea por línea: envía a Google Sheets con `GET`, no manda el id ni la clave, decide el retardo con `millis()`, valida con una lista local, muestra la señal antes de enviar e imprime el UID completo. Trae las correcciones sugeridas; **las hace el equipo**. Si el firmware cambia, revisa que el documento siga vigente.
- **`npm run dispositivo:diagnostico`** revisa, desde la computadora, la dirección, el id y la clave que van en `secretos.h`. Sin `--real` no registra nada (envía la petición sin UID; la API revisa la clave antes que el cuerpo y responde `400`); con `--real` envía la petición completa. **No hay ni debe haber un modo de prueba en la API** (decidido el 28 de noviembre).
- **Lector previsto: RC522 (MFRC522), sin confirmar** (decisión del 15 de noviembre). Podría terminar siendo un PN532 u otro. **Cambiar de lector solo afecta a la capa del lector en el firmware** (una interfaz de dos funciones y una implementación por modelo, elegida con un `#define`): no toca el servidor, el contrato ni el resto del firmware.
- **El código va en `firmware/`** (Arduino IDE o PlatformIO). Valeria lo subirá por él si hace falta. Desde el 28 de noviembre está en `main` una versión inicial, `firmware/firmware.ino` (de una compañera, PR #16), que todavía envía las lecturas a Google Sheets y no a la API. **No cambies su lógica.**
- **Datos privados del lector** (Wi-Fi, dirección del servidor, id y clave del dispositivo): van en `firmware/secretos.h`, que está en `.gitignore`; `firmware/secretos.ejemplo.h` tiene los mismos campos vacíos. Nunca escritos en `firmware.ino`.
- **El PR #13 se cerró sin fusionar** (25 de noviembre) porque traía la contraseña de una red Wi-Fi y la dirección de un Apps Script en este repositorio público. Tiene un comentario que dice que lo reemplaza el #16. Se pidió cambiar la contraseña. Su rama, `feat/registro-nfc`, la borra Valeria: esta sesión no tiene permiso para borrar ramas (GitHub responde `403`).
- **Pendiente urgente:** que el equipo confirme el modelo del lector, compruebe que la credencial de la escuela es compatible (13.56 MHz, ISO 14443A) y pase la lista de pruebas de la guía. Si el UID no sale en el formato canónico, las credenciales se vinculan bien pero salen `RECHAZADA` en el aula; `npm run uid:revisar` sirve para encontrar la diferencia.
- **La clave del dispositivo** va en NVS y nunca se imprime por el puerto serie.

### Paso 4. Actualizar la documentación académica

Los tres cambios de la sección 3.4 deben pasar al diagrama entidad-relación y al documento Word del modelado. Esto se hace **fuera del repositorio**: Valeria lo pidió en otra conversación. Si te pregunta, recuérdale que está pendiente. **`docs/cambios-al-modelo.md`** los explica (qué, por qué y con qué migración) y trae el diagrama completo en Mermaid, generado de las migraciones y comprobado contra la base; si agregas una migración que cambie el modelo, actualízalo.

### Paso 5. Puesta en marcha (cuando la web y el lector funcionen)

- Publicar la API con **HTTPS**, `NODE_ENV=production` y un `JWT_SECRET` propio. **Sin cargar la semilla.**
- Si va detrás de un proxy inverso, configurar `trust proxy` para que los límites usen la IP real. Con Nginx, conservar `X-Accel-Buffering: no` para el SSE y, de preferencia, usar HTTP/2.
- **Una sola instancia:** el SSE y los limitadores viven en memoria. Con varias instancias harían falta Redis o `LISTEN/NOTIFY`.
- Crear los usuarios reales, los grupos, las clases y los dispositivos, y generar sus claves con `dispositivo:clave`.
- Prueba piloto en un aula real.

### Pendientes menores (del README, sin urgencia)

- Editar los datos de un estudiante y reactivar a uno dado de baja.
- Un endpoint para cambiar de grupo a un estudiante. Los triggers de `inscripcion_grupo` ya lo soportan.
- Una vista de la bitácora para el Administrador.
- Gestión de dispositivos desde la web: alta, baja y rotación de clave con bitácora.
- Un selector de estudiantes por grupo para el filtro de P2.
- La tabla opcional `dia_inhabil`.
- El «modo registro» del ESP32, para vincular credenciales sin escribir el UID. La función `insertarCredencial` ya está lista para reutilizarse.
- La revocación individual de los JWT.
- La recuperación de contraseña (el boceto de P1 la muestra; la web solo pide contactar al administrador).
- El texto definitivo del aviso de privacidad: **lo redacta el equipo** (decidido el 18 de noviembre). `web/src/paginas/AvisoPrivacidad.tsx` es un borrador marcado como tal; no lo reescribas como si fuera el definitivo.

---

## 6. Decisiones pendientes del equipo

**No las tomes tú. Pregúntale a Valeria.** Las opciones, el costo y una recomendación de las tres primeras (UC-02, recuperación de contraseña y aviso de privacidad) están en `docs/decisiones-pendientes.md`. Ahí también se señala que el aviso cita la LFPDPPP, que es para particulares, y que a la universidad podría aplicarle la ley de sujetos obligados: **está por confirmar**, no lo des por hecho.

1. **Acceso de estudiantes (UC-02).** El equipo lo consultará con la profesora; **mientras tanto, la web solo tiene Docente y Administrador.** El caso de uso existe, pero el modelo entidad-relación, los diagramas de actividades y el código solo tienen Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Si se aprueba, cambia el modelo de datos y la web. **Conviene decidirlo antes de avanzar la web.**
2. **Ubicación y stack de la web** (paso 2). **Decidido el 15 de noviembre:** carpeta `web/` en este repositorio, con Vite, React y TypeScript; Express sirve la web en producción.
3. **Modelo del lector NFC** (paso 3). Previsto el RC522, sin confirmar. El **formato del UID ya está decidido** y no depende del modelo.
4. **Lector USB de escritorio para capturar UID en P5.** Antes de usarlo, hay que comprobar con `npm run uid:revisar -- <valor> --comparar <otro>` que entregue el mismo formato que el ESP32.

---

## 7. Cómo debes trabajar en este proyecto

### Comunicación

- **Todo en español:** respuestas, commits, PR, comentarios del código, README y mensajes de error de la API. Los identificadores también siguen las convenciones en español que ya existen (`snake_case` en SQL, `camelCase` en TypeScript).
- **Valeria es estudiante.** Explícale en lenguaje claro qué hiciste y qué falta, con tablas o listas cortas. A veces pide el resumen «en lenguaje común» o «en porcentaje»: sin jerga, con avance aproximado.
- **Cuando necesites algo de ella** (aprobar, fusionar, configurar algo en GitHub, decidir), díselo explícitamente al final, en una sección «Ahora te toca».
- **No inventes resultados.** Si no pudiste ver algo (logs del CI, el estado de un PR), dilo.

### Flujo de trabajo por módulo

1. **Plan antes de código.** Revisa el repositorio y presenta un plan con endpoints, validaciones, decisiones con ventajas y desventajas, cambios al modelo, pruebas y la lista de archivos. **Espera la aprobación.** Si algo es ambiguo o contradice el diseño entregado, pregunta.
2. **Una rama por módulo**, creada desde el `main` actualizado (`git checkout main && git pull`), con nombres como `feat/…`, `fix/…`, `ci/…` o `docs/…`.
3. **Un commit en español por paso**, en modo imperativo descriptivo, como los existentes: «Agrega la baja lógica de estudiantes (AD-07)».
4. **Antes de abrir el PR:** `npm run typecheck`, `npm run build` y `npm test` en verde, con Node 24. Si el cambio toca `web/`, también esos tres comandos dentro de `web/`, y una prueba a mano en el navegador contra la API con la semilla.
5. **Un PR hacia `main`** con un resumen, la lista de commits, cómo se verificó y una sección **«Para revisar»** con los puntos delicados y las limitaciones conocidas. Después revisa el CI con `gh`.
6. **No fusiones, no hagas *force push* a `main` y no cambies el ruleset** sin que Valeria lo pida.

### Calidad y seguridad (no negociable)

- **Pruebas primero en lo crítico.** Cubre los casos felices, los errores, los permisos (`401`, `403` y `404` de aislamiento), la concurrencia (`Promise.all`) y RNF-06. Para las pruebas importantes, haz una **mutación a propósito** y confirma que fallan.
- **RNF-06:**
  - El UID completo nunca aparece en respuestas, logs, bitácora ni eventos.
  - En los logs va enmascarado.
  - Los errores de PostgreSQL pueden traer el UID en su `DETAIL`: usa `src/utils/erroresPg.ts` para limpiarlos.
- **RF-09:** toda ruta nueva lleva `requiereSesion` + `requiereRol(...)` a nivel de router, y el rol se lee de la base de datos.
- **Aislamiento entre docentes:** un recurso ajeno responde `404`, idéntico a uno inexistente.
- **Transacciones:** toda operación que cambie varias tablas usa `conTransaccion`. Las acciones del Administrador se escriben en la bitácora **dentro de la misma transacción**.
- **Concurrencia:** nunca un `SELECT` previo seguido de un `INSERT` para evitar duplicados. Usa restricciones `UNIQUE` con `ON CONFLICT` o atrapa el error `23505`, y `SELECT … FOR UPDATE` cuando dos operaciones tocan la misma fila.
- **Zona horaria:** nunca uses la zona del servidor. Usa `ZONA_HORARIA_ESCUELA` y las funciones de `tiempo.ts`.
- **Secretos:** nada en el código. Todo va en `.env`, documentado en `.env.example` y validado en `env.ts`; en el firmware, en `firmware/secretos.h`. Las credenciales de la semilla son solo para desarrollo.
- **Revisión de secretos en el CI (gitleaks, desde el 25 de noviembre):** el check «Secretos: gitleaks» revisa todos los commits de la rama con `.gitleaks.toml` y falla si encuentra contraseñas, claves, un `secretos.h` o un `.env` subidos, o una dirección de Apps Script. Se agregó después de que el PR #13 subiera la contraseña de una red Wi-Fi y la dirección de un Apps Script. **Si falla:** no lo silencies ni agregues excepciones sin preguntarle a Valeria; quita el secreto y dile que hay que **cambiarlo**, porque ya quedó en el historial. Una excepción solo vale para un valor de desarrollo documentado (como las claves de la semilla), con su motivo en `.gitleaks.toml`.
- **SQL directo con parámetros** (`$1`, `$2`…), nunca concatenando valores.
- **Orden alfabético:** todo `ORDER BY` sobre un texto visible lleva `ORDEN_ES` (`src/db/orden.ts`) y termina con el id como desempate. Nunca dependas de la configuración regional de la base.

### Modelo de datos

- **Toda modificación del esquema es una migración nueva y numerada** (`005_…sql`). Nunca edites una migración ya fusionada.
- **Todo cambio al modelo entidad-relación entregado** se anuncia en el plan, se aprueba y se documenta en la sección «Cambios al modelo de datos» del README, con su migración y su motivo. El equipo tiene que reflejarlo en su documentación académica.

### Documentación

- Al terminar cada módulo, actualiza el README:
  - La lista inicial de lo que incluye.
  - La sección del módulo, con sus endpoints y reglas.
  - La tabla y el conteo de pruebas.
  - Las decisiones técnicas.
  - Los cambios al modelo de datos.
  - Los pendientes.
- Mantén `docs/contrato-dispositivo.md` sincronizado con el endpoint de lecturas.
- Actualiza la sección 4 de este archivo (estado del proyecto) cuando se fusione un PR o cambie el avance.
