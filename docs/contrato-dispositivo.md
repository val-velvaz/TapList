# Contrato de la API para el dispositivo lector (ESP32)

Este documento es para quien programe el firmware del lector NFC de TapList. Describe la única petición que hace el dispositivo, las respuestas posibles y la señal que debe mostrar con cada una.

Para organizar el firmware, conectar el lector y probarlo, consulta la [guía del firmware](guia-firmware.md).

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
| `uid` | Sí | El UID en el [formato canónico](#formato-canónico-del-uid): hexadecimal de 4, 7 o 10 bytes (exactamente 8, 14 o 20 caracteres). Cualquier otra longitud responde `400`. |
| `leido_en` | No | Fecha y hora **de la lectura** en ISO 8601 **con zona horaria** (`-06:00` o `Z`). Solo se envía en las lecturas guardadas sin conexión. |

## Formato canónico del UID

El UID es el número de serie que la tarjeta entrega al lector. La API compara el que envía el dispositivo con el que se guardó al vincular la credencial: **si no son idénticos, carácter por carácter, la lectura sale `RECHAZADA`**, aunque la tarjeta sea la correcta. Por eso el formato es uno solo, sin importar el modelo del lector:

| Regla | Detalle |
|---|---|
| Hexadecimal | Dos caracteres por byte, del `00` al `FF`. Nunca en decimal. |
| En mayúsculas | `04A2B3C4`, no `04a2b3c4`. |
| Sin separadores | Ni espacios, ni dos puntos, ni guiones, ni `0x`. |
| Bytes en el orden de la anticolisión | El primer byte que entrega la tarjeta va primero. Es el orden en que las librerías llenan su arreglo: del índice `0` al último. |
| Completo | Los 4, 7 o 10 bytes que tenga la tarjeta: 8, 14 o 20 caracteres. |

Ejemplo: una tarjeta que entrega los bytes `0x04 0xA2 0xB3 0xC4 0xD5 0xE6 0xF7` se envía como `04A2B3C4D5E6F7`.

Por comodidad en las pruebas a mano, la API también acepta minúsculas, espacios y dos puntos (`04:a2:b3:c4` equivale a `04A2B3C4`) y los convierte al formato canónico. **El firmware debe enviar siempre el formato canónico.** Los guiones, las comas y el prefijo `0x` no se aceptan.

### Cómo obtenerlo con cada librería

Los dos fragmentos son ejemplos para mostrar de dónde salen los bytes; no son un firmware completo.

**RC522, con la librería MFRC522:** después de `PICC_ReadCardSerial()`, los bytes están en `mfrc522.uid.uidByte[0]` … `mfrc522.uid.uidByte[mfrc522.uid.size - 1]`.

```cpp
// EJEMPLO
for (byte i = 0; i < mfrc522.uid.size; i++) {
  byte b = mfrc522.uid.uidByte[i];   // i = 0 es el primer byte del UID
  // agregar b al texto con DOS caracteres hexadecimales en mayúsculas
}
```

**PN532, con la librería Adafruit_PN532:** después de `readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength)`, los bytes están en `uid[0]` … `uid[uidLength - 1]`.

```cpp
// EJEMPLO
uint8_t uid[10];        // 10, no 7: así cabe el UID más largo
uint8_t uidLength;
if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength)) {
  for (uint8_t i = 0; i < uidLength; i++) {
    uint8_t b = uid[i];              // i = 0 es el primer byte del UID
    // agregar b al texto con DOS caracteres hexadecimales en mayúsculas
  }
}
```

En los dos casos, el recorrido es **del índice 0 al último** y la conversión a texto debe ser **la misma función** (ver la [guía del firmware](guia-firmware.md#3-una-sola-función-para-convertir-el-uid-a-texto)).

### Errores comunes

Para los ejemplos, la tarjeta entrega `0x04 0x0A 0xB2 0xC3` y su UID correcto es `040AB2C3`.

| Error | Lo que se envía | Por qué pasa | Qué responde la API |
|---|---|---|---|
| Bytes invertidos | `C3B20A04` | Recorrer el arreglo del último al primero, o armar un número de 32 bits y luego imprimirlo. | `200` con `RECHAZADA`: el formato es válido, pero no coincide con la credencial. |
| Formato decimal | `0067809987` | Convertir los bytes a un número y enviarlo con `String(numero)`. Es lo que hacen por defecto muchos lectores USB. | `400` si tiene 10 dígitos. Con 8, 14 o 20 dígitos **no se puede distinguir** de un hexadecimal: `RECHAZADA`. |
| Ceros a la izquierda perdidos | `4AB2C3` | `String(b, HEX)` y `Serial.print(b, HEX)` escriben `0x0A` como `A`, con un solo carácter. | `400` si la longitud queda impar o no es 8, 14 o 20. Si por casualidad queda en una longitud válida, `RECHAZADA`. |
| UID truncado a 4 bytes | `04A2B3C4` en vez de `04A2B3C4D5E6F7` | Guardar el UID en un arreglo de 4 bytes o en un `uint32_t`, o leer solo el primer nivel de la anticolisión. | `RECHAZADA`. Si empieza con `88`, es la señal de este error: `88` es una marca interna de las tarjetas de 7 y 10 bytes, no parte del UID. |

Los errores que responden `RECHAZADA` son los más difíciles de encontrar, porque la API no puede saber que el formato está mal. Para detectarlos antes de llegar al aula:

```bash
npm run uid:revisar -- <lo que imprime el ESP32> --comparar <lo que entrega el otro lector>
```

La herramienta dice si los dos valores son la misma tarjeta con los bytes invertidos, en decimal, con ceros perdidos o truncada. Está explicada en la [guía del firmware](guia-firmware.md#7-lista-de-pruebas-con-el-circuito).

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
