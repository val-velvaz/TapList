# Contrato de la API para el dispositivo lector (ESP32)

Este documento es para quien programe el firmware del lector NFC de TapList. Describe la única petición que hace el dispositivo, las respuestas posibles y la señal que debe mostrar con cada una.

**Regla de oro:** el dispositivo **no decide nada**. Lee el UID, lo envía y muestra lo que la API responde. Toda la lógica (credenciales, horarios, retardos, duplicados) vive en el servidor.

## Petición

```
POST /api/dispositivo/lecturas
```

En producción, la URL siempre usa **HTTPS**. Por ejemplo: `https://taplist.ejemplo.mx/api/dispositivo/lecturas`.

### Cabeceras

| Cabecera | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `X-Dispositivo-Id` | El id numérico del dispositivo (`id_dispositivo`), por ejemplo `1`. |
| `X-Dispositivo-Clave` | La clave secreta del dispositivo. |

La clave la genera un administrador con `npm run dispositivo:clave -- <id_dispositivo>`, que la muestra **una sola vez**:

- Guárdala en la memoria no volátil (NVS) del ESP32 y **nunca** la imprimas por el puerto serie ni en los logs.
- Si se pierde o se filtra, se genera otra con el mismo comando; la anterior deja de funcionar de inmediato.

### Cuerpo

Lectura en línea:

```json
{ "uid": "04A2B3C4D5E6F7" }
```

Lectura guardada sin conexión, reenviada al reconectarse:

```json
{ "uid": "04A2B3C4D5E6F7", "leido_en": "2026-11-09T08:05:12-06:00" }
```

| Campo | Obligatorio | Formato |
|---|---|---|
| `uid` | Sí | Hexadecimal, de 8 a 20 caracteres (4, 7 o 10 bytes). Se aceptan mayúsculas o minúsculas, espacios y dos puntos: `04:a2:b3:c4` equivale a `04A2B3C4`. |
| `leido_en` | No | Fecha y hora **de la lectura** en ISO 8601 **con zona horaria** (`-06:00` o `Z`). Solo se envía en las lecturas guardadas sin conexión. |

## Respuestas y señales

| Código | Cuerpo | Señal del dispositivo |
|---|---|---|
| `200` | `{ "resultado": "ASISTENCIA", "duplicado": false }` | 🟢 LED verde y 1 pitido corto |
| `200` | `{ "resultado": "RETARDO", "duplicado": false }` | 🟡 LED amarillo y 2 pitidos cortos |
| `200` | `{ "resultado": "RECHAZADA", "motivo": "CREDENCIAL_NO_VALIDA" }` | 🔴 LED rojo y 1 pitido largo |
| `200` | `{ "resultado": "RECHAZADA", "motivo": "SIN_CLASE" }` | 🔴 LED rojo y 1 pitido largo |
| `400` | `{ "error": "...", "detalles": { ... } }` (UID mal formado o `leido_en` fuera de rango) | 🔴 LED rojo y 1 pitido largo |
| `401` | `{ "error": "Dispositivo no autenticado" }` | 🔵 3 destellos azules, sin sonido |
| `403` | `{ "error": "El dispositivo no está activo" }` | 🔵 3 destellos azules, sin sonido |
| `429` | `{ "error": "..." }` (demasiadas solicitudes) | 🔵 3 destellos azules, sin sonido |
| `500` | `{ "error": "No se pudo guardar" }` | 🔵 3 destellos azules, sin sonido |
| *Timeout o sin red* | — | 🔵 3 destellos azules, sin sonido |

### Cómo leer las respuestas

- **`duplicado: true`** significa que el estudiante ya tenía un registro en esa clase ese día. El resultado es el del registro existente, así que la señal es la misma (verde o amarillo). Reintentar una lectura siempre es seguro: **nunca** genera un registro doble.
- **Una lectura rechazada no es un error HTTP:** llega con `200` y `resultado: "RECHAZADA"`.
- **`CREDENCIAL_NO_VALIDA`** agrupa a propósito «UID no registrado», «credencial inactiva» y «estudiante inactivo», para no revelar qué credenciales existen.
- **`SIN_CLASE`** significa que el grupo del estudiante no tiene una clase en curso a esa hora.
- **Ninguna respuesta incluye el nombre, la matrícula ni el UID del estudiante.** Tampoco el dispositivo debe mostrarlos ni registrarlos en logs (RNF-06).
- **Busca la señal solo con el código HTTP y `resultado`.** El texto de `error` es para personas y puede cambiar.

## Tiempos

- **Timeout recomendado: 3 segundos** desde que se envía la petición. Si no hay respuesta, trátalo como «sin conexión» (3 destellos azules).
- El servidor responde normalmente en menos de 500 ms en la red local.
- **Límite de solicitudes:** cada dispositivo puede hacer como máximo **60 solicitudes por minuto**. Si recibe `429`, debe esperar los segundos que indique la cabecera `RateLimit` o `Retry-After` antes de reintentar.

## Comportamiento sin conexión

Si el dispositivo no recibe confirmación (*timeout*, sin red o `5xx`), la lectura **no** se guardó.

### 1. Al momento de la lectura

1. Muestra los 3 destellos azules para que el estudiante sepa que la lectura no quedó registrada en línea.
2. Guarda la lectura en una cola local (NVS o SPIFFS) con el UID y la **hora local de la lectura**, incluida la zona horaria (por ejemplo, `2026-11-09T08:05:12-06:00`).

Para eso, el reloj del ESP32 debe estar sincronizado por **NTP**. Si nunca se sincronizó desde el arranque, **no** guardes la lectura: una hora inventada asignaría la asistencia a otra clase.

### 2. Al reconectarse

Envía las lecturas de la cola **en orden**, una por petición, con el campo `leido_en`, y decide qué hacer con cada una según la respuesta:

| Respuesta | Qué hacer con la lectura en cola |
|---|---|
| `200` (cualquier `resultado`) | Quitarla de la cola. |
| `400` | Quitarla de la cola: es inválida o demasiado vieja, y reintentarla no la arregla. |
| `401` o `403` | Conservarla y dejar de enviar. El dispositivo necesita una clave nueva o que lo reactiven; avisa con el LED azul. |
| `429` | Conservarla, esperar `Retry-After` y continuar. |
| `5xx`, *timeout* o sin red | Conservarla y reintentar más tarde, con espera creciente (5 s, 10 s, 20 s… hasta 5 min). |

Durante el reenvío **no** muestres señales por cada lectura de la cola: el estudiante ya no está frente al lector.

### Límites de `leido_en`

- No puede estar más de **2 minutos en el futuro** respecto al reloj del servidor (tolerancia por desfase).
- No puede tener más de **24 horas** de antigüedad. El valor es configurable en el servidor con `HORAS_MAX_LECTURA_OFFLINE`.
- Fuera de ese rango, la respuesta es `400`.

## Pseudocódigo de referencia

```text
al leer una credencial (uid):
    respuesta = POST /api/dispositivo/lecturas { uid }   (timeout 3 s)
    si no hubo respuesta o código >= 500:
        mostrar AZUL x3
        si reloj_sincronizado: cola.agregar(uid, hora_local_con_zona())
    si no:
        mostrar senal(respuesta)

senal(respuesta):
    200 y resultado = ASISTENCIA → VERDE + 1 pitido corto
    200 y resultado = RETARDO    → AMARILLO + 2 pitidos cortos
    200 y resultado = RECHAZADA  → ROJO + 1 pitido largo
    400                          → ROJO + 1 pitido largo
    cualquier otro               → AZUL x3, sin sonido

cada 30 s, si hay red y la cola no está vacía:
    para cada lectura en orden:
        respuesta = POST { uid, leido_en }
        según la tabla «Al reconectarse»
```

## Probar sin el ESP32

Desde el repositorio de la API, con el servidor corriendo (`npm run dev`):

```bash
npm run simular:lectura -- 04A1B2C3
npm run simular:lectura -- 04:a1:b2:c3 --leido-en 2026-11-09T07:03:00-06:00
```

El simulador usa el dispositivo de la semilla y muestra la respuesta y la señal que daría el lector.
