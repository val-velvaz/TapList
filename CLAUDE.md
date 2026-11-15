# CLAUDE.md · TapList

Este archivo es para Claude Code. Explica qué es TapList, cómo va el proyecto, lo que falta y cómo debes trabajar en este repositorio. Léelo completo al empezar cada sesión.

> **Estado actualizado al 15 de noviembre de 2026.** La sección 4 describe un momento concreto. Antes de actuar, confírmala contra el repositorio (`git log`, `gh pr list`) y actualízala cuando algo cambie.

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
3. **Página web (pendiente).** Dos roles:
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

- **Windows**, con la terminal en alemán: verás mensajes como «Der Befehl … konnte nicht gefunden werden».
- **Node 24 LTS** con nvm-windows, en `C:\nvm4w\nodejs`. El proyecto exige `>=24 <25` (`.nvmrc` y `engines`).
- **GitHub CLI** en `C:\Program Files\GitHub CLI`, con sesión iniciada como `val-velvaz`.
- **Terminales antiguas:** las que se abrieron antes de instalar nvm-windows y `gh` no encuentran `node` ni `gh`. Una terminal nueva sí los encuentra. Si te pasa, agrega esas dos rutas al `PATH` del comando; no reinstales nada.
- **PostgreSQL 18 local.** `psql` entra como `postgres` sin pedir contraseña (por `pgpass.conf` o por confianza local). El `.env` usa `PGUSER=postgres` con `PGPASSWORD` vacío.
- **La carpeta de usuario de Windows es un repositorio de Git**, probablemente creado por accidente. Trabaja siempre dentro de la carpeta del proyecto, que tiene su propio `.git`. Nunca hagas commits en el repositorio de la carpeta de usuario.
- **`curl` en Windows rompe los acentos** si el JSON va en la línea de comandos: «Núñez» llega como «N�ez». Para probar a mano con acentos, manda el cuerpo desde un archivo UTF-8 (`curl --data-binary @cuerpo.json`) o usa `Invoke-RestMethod`. No es un problema de la API.
- **`main` está protegida** con un ruleset: exige el check «Tipos, compilación y pruebas» y bloquea los *force push*. No exige aprobaciones, porque Valeria trabaja sola en el repositorio y GitHub no deja aprobar los propios PR.
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
npm run simular:lectura -- <uid> [--leido-en <ISO>]   # simula el ESP32
```

### 3.3 Estructura

```
.github/workflows/pruebas.yml   CI: PostgreSQL 18 + Node de .nvmrc → npm ci, typecheck, build, test
db/migrations/001..004          esquema (orden alfabético)
db/seeds/001_datos_prueba.sql   datos ficticios solo para desarrollo
db/preparar-base.ts             crea la base, migra y carga la semilla
docs/contrato-dispositivo.md    contrato de la API para el firmware del ESP32
scripts/                        db-setup, dispositivo-clave, simular-lectura
src/app.ts                      arma Express y monta las rutas (lo usan el servidor y las pruebas)
src/server.ts                   punto de entrada; cierra las conexiones SSE al apagar
src/config/env.ts               variables de entorno validadas con zod
src/db/pool.ts                  pool de pg; cada sesión usa timezone = ZONA_HORARIA_ESCUELA
src/db/transaccion.ts           conTransaccion(fn): BEGIN / COMMIT / ROLLBACK
src/eventos/eventos.ts          EventEmitter tipado: asistencia:registrada (sin UID)
src/middleware/                 requiereSesion, requiereRol, requiereDispositivo,
                                limiteIntentos, limiteDispositivo, manejoErrores
src/modules/<módulo>/           <módulo>.routes / .controller / .service / .schemas
  auth, lecturas (+ tiempo.ts), estudiantes, grupos, bitacora, dispositivos,
  asistencias (+ tiempoReal.ts, SSE), estadisticas, exportacion (+ pdf.ts, xlsx.ts)
src/utils/                      HttpError, contrasena, sesion, uid, erroresPg, validacion
tests/                          auth, tiempo, lecturas, estudiantes, asistencias, estadisticas
                                + datos.ts (credenciales de prueba) y globalSetup.ts
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
| `GET /api/asistencias` | Docente | Lista paginada de **sus** clases, con filtros |
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
- **Lecturas sin conexión:** llegan con `leido_en` y se aceptan desde 24 horas atrás hasta 2 minutos en el futuro.
- **Faltas:** no se guardan, se calculan. Una sesión es un par (clase, fecha) en el que **alguien registró asistencia** («hubo clase si alguien registró»). Los esperados salen de `inscripcion_grupo`, sin contar el día del alta ni el de la baja. Así nunca se inventan faltas.
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

Según el README, hay **139 pruebas** en 6 archivos:

| Archivo | Pruebas |
|---|---|
| `auth.test.ts` | 19 |
| `tiempo.test.ts` | 22 |
| `lecturas.test.ts` | 24 |
| `estudiantes.test.ts` | 37 |
| `asistencias.test.ts` | 18 |
| `estadisticas.test.ts` | 19 |

Cómo están hechas:

- Corren contra `taplist_test`, que `tests/globalSetup.ts` recrea en cada corrida.
- `vitest.config.ts` genera un `JWT_SECRET` aleatorio, baja `SSE_LATIDO_SEGUNDOS` a 0.5 y `EXPORTACION_MAX_FILAS` a 12, y corre los archivos en serie (`fileParallelism: false`).
- Las de lecturas fijan el reloj y corren el proceso en la zona `Asia/Tokyo`, para comprobar que no se usa la zona del servidor.
- Las de estadísticas usan un mes de datos con resultados **calculados a mano** (7 sesiones, 26 esperados, 12 asistencias, 4 retardos, 10 faltas, 61.5 %).
- **Mutaciones a propósito:** ya se rompió el código a propósito para comprobar que las pruebas importantes detectan errores reales. Por ejemplo, se quitó el `BEGIN` de las transacciones, se enviaron los eventos SSE a todos los docentes y se contó el día del alta como falta.

**Confirma el conteo con `npm test` al empezar.** Si no coincide, actualiza la tabla del README.

---

## 4. Estado del proyecto (al 15 de noviembre de 2026)

### Historial de PR

| PR | Rama | Contenido | Estado |
|---|---|---|---|
| #1 | `feat/registro-nfc` | Esquema 001-002, login, registro NFC, simulador, contrato del dispositivo | Fusionado |
| #2 | `ci/pruebas-automaticas` | Workflow de CI | Fusionado |
| #3 | `feat/gestion-estudiantes` | Migración 003, transacciones, bitácora, gestión de estudiantes | Fusionado (`2214441`) |
| #4 | `feat/consulta-asistencias` | Consulta de asistencias y SSE | Fusionado (`284efb3`) |
| #5 | `feat/estadisticas-exportacion` | Migración 004, estadísticas, exportación PDF y XLSX | Fusionado el 15 de noviembre (`47ad82f`), que es el `main` actual |

### Avance aproximado

| Parte | Peso | Avance |
|---|---|---|
| Análisis y diseño | 15 % | 100 % |
| Backend | 40 % | 100 % (quedan los pendientes menores de la sección 5) |
| Web | 25 % | 0 %. Plan aprobado: 5 entregas, un PR por entrega. |
| Firmware del ESP32 y circuito | 15 % | ≈ 5 %. Está el contrato, sin código. El circuito está en prototipo. |
| Puesta en marcha | 5 % | 0 % |
| **Total** | | **≈ 56 %** |

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

La haces tú. El plan general ya está aprobado (15 de noviembre): carpeta `web/` con Vite, React y TypeScript, y Express sirve la web en producción. Son **5 entregas, una rama y un PR por entrega:** (1) base, CI y P1; (2) P2 con SSE y exportación; (3) P3; (4) P4 y P5; (5) producción. **Antes de cada entrega, presenta un plan corto y espera aprobación.** Al abrir el PR de la entrega 1, recuérdale a Valeria agregar el check nuevo de la web al ruleset de `main`. Lo que cada plan debe respetar:

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

- **Su guía es `docs/contrato-dispositivo.md`.** Si cambias el contrato, actualiza ese documento y avísale a Valeria.
- **El código va en `firmware/`** (Arduino IDE o PlatformIO). Valeria lo subirá por él si hace falta.
- **Pendiente urgente:** confirmar qué lector NFC usa (RC522, PN532…) y que el UID salga en **hexadecimal con los bytes en el mismo orden** que espera la API. Si no coincide, las credenciales se vinculan bien pero salen `RECHAZADA` en el aula.
- **La clave del dispositivo** va en NVS y nunca se imprime por el puerto serie.

### Paso 4. Actualizar la documentación académica

Los tres cambios de la sección 3.4 deben pasar al diagrama entidad-relación y al documento Word del modelado. Esto se hace **fuera del repositorio**: Valeria lo pidió en otra conversación. Si te pregunta, recuérdale que está pendiente.

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

---

## 6. Decisiones pendientes del equipo

**No las tomes tú. Pregúntale a Valeria.**

1. **Acceso de estudiantes (UC-02).** El equipo lo consultará con la profesora; **mientras tanto, la web solo tiene Docente y Administrador.** El caso de uso existe, pero el modelo entidad-relación, los diagramas de actividades y el código solo tienen Docente y Administrador, y la tabla `estudiante` no tiene contraseña. Si se aprueba, cambia el modelo de datos y la web. **Conviene decidirlo antes de avanzar la web.**
2. **Ubicación y stack de la web** (paso 2). **Decidido el 15 de noviembre:** carpeta `web/` en este repositorio, con Vite, React y TypeScript; Express sirve la web en producción.
3. **Modelo del lector NFC y formato del UID** (paso 3).
4. **Lector USB de escritorio para capturar UID en P5.** Antes de usarlo, hay que comprobar que entregue el mismo formato que el ESP32.

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
4. **Antes de abrir el PR:** `npm run typecheck`, `npm run build` y `npm test` en verde, con Node 24.
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
- **Secretos:** nada en el código. Todo va en `.env`, documentado en `.env.example` y validado en `env.ts`. Las credenciales de la semilla son solo para desarrollo.
- **SQL directo con parámetros** (`$1`, `$2`…), nunca concatenando valores.

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
