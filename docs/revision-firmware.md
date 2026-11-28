# Revisión del firmware contra el contrato de la API

Revisión de `firmware/firmware.ino` (versión inicial, fusionada en el PR #16) contra [`contrato-dispositivo.md`](contrato-dispositivo.md). **Este documento no cambia el firmware:** solo dice qué le falta para hablar con la API y cómo se podría corregir. Los cambios los hace el equipo del firmware.

> Los números de línea son los de `firmware/firmware.ino` en `main` al 28 de noviembre de 2026. Si el archivo cambia, busquen el fragmento citado.

## En pocas palabras

Hoy el lector **funciona por su cuenta**: decide él mismo si es asistencia o retardo (con un reloj que empieza al encenderlo), prende el LED **antes** de enviar nada y manda la lectura a una hoja de Google Sheets.

Para TapList tiene que funcionar **al revés**: el lector solo lee el UID, se lo **pregunta a la API** y prende el LED **según lo que la API conteste**. La API es la que sabe qué estudiante es, si tiene clase, si llegó tarde y si ya había registrado.

| Lo que ya está bien | Lo que falta |
|---|---|
| Lee la tarjeta con el RC522 y la convierte a texto en el formato correcto (`uidComoTexto`). | Enviar la lectura a la API con `POST` y JSON, no a Google Sheets con `GET`. |
| Los datos privados ya están en `secretos.h`. | Mandar el id y la clave del dispositivo en los encabezados. |
| Tiene las funciones de LED, pitidos y los 3 destellos azules. | Esperar la respuesta (máximo 3 s) y mostrar la señal **según la respuesta**. |
| La señal de encendido (azul y pitido corto) coincide con el diseño (P8). | Quitar la decisión local de retardo y la lista local de tarjetas. |
| | No imprimir el UID completo por el puerto serie. |
| | (Después de la primera prueba) Cola sin conexión con `leido_en`, reloj por NTP y clave en NVS. |

## Qué cambiar para la primera prueba con la API

Estos seis cambios bastan para que el lector registre asistencias reales. Están ordenados de más a menos importante.

### 1. Enviar a la API, no a Google Sheets (líneas 29-30 y 153-163)

**Hoy:**

```cpp
const char* URL_SCRIPT = SECRETO_URL_SERVIDOR;                          // línea 30: dirección del Apps Script
...
WiFiClientSecure cliente;                                               // línea 153
cliente.setInsecure();                                                  // línea 154
String url = String(URL_SCRIPT) + "?uid=" + uid + "&estado=" + estado;  // línea 157
http.begin(cliente, url);
http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
http.setTimeout(8000);                                                  // línea 161
int codigo = http.GET();                                                // línea 163
```

**Qué pide el contrato:**

- `POST` a `http://<IP de la computadora>:3000/api/dispositivo/lecturas`.
- Cuerpo JSON con el UID: `{"uid":"4A3F9C12"}`. **No** se manda el estado: lo calcula la API.
- Cuatro cosas en la petición: `Content-Type: application/json`, `X-Dispositivo-Id` y `X-Dispositivo-Clave` (ver el punto 2), y un tiempo máximo de **3 segundos** (hoy son 8).

**Cómo cambiarlo:**

- En `secretos.h`, `SECRETO_URL_SERVIDOR` pasa a ser la dirección completa de la API, por ejemplo `"http://192.168.1.50:3000/api/dispositivo/lecturas"`. La IP la da la computadora de Valeria (ver [`prueba-con-dispositivo.md`](prueba-con-dispositivo.md), paso 1).
- Para la prueba la API va por **HTTP** en la red local, así que se usa `WiFiClient` en lugar de `WiFiClientSecure`. `setInsecure()` (línea 154) desactiva la revisión del certificado: en producción la API irá por HTTPS y habrá que **validar** el certificado, no saltárselo.
- Ya no hace falta `setFollowRedirects` (la API no redirige).

### 2. Mandar el id y la clave del dispositivo (no se usan hoy)

`secretos.ejemplo.h` ya tiene `SECRETO_DISPOSITIVO_ID` y `SECRETO_DISPOSITIVO_CLAVE`, pero `firmware.ino` no los usa. Sin ellos la API responde `401` a todo (3 destellos azules).

```cpp
http.addHeader("Content-Type", "application/json");
http.addHeader("X-Dispositivo-Id", SECRETO_DISPOSITIVO_ID);       // por ejemplo "1"
http.addHeader("X-Dispositivo-Clave", SECRETO_DISPOSITIVO_CLAVE); // la que dio npm run dispositivo:clave
```

- La clave **nunca** se imprime por el puerto serie.
- Para la prueba basta con tenerla en `secretos.h`. Más adelante el contrato pide guardarla en la memoria NVS del ESP32 (ver «Después de la prueba»).

### 3. Mostrar la señal según la respuesta, no antes (líneas 243-256 y 263-265)

**Hoy:** el lector prende verde o amarillo y pita (líneas 243-253) y **después** envía (línea 256). Si el envío falla, muestra además los 3 destellos azules (líneas 263-265). El estudiante ve «verde» y luego «azul»: dos señales que se contradicen, y la verde pudo ser falsa.

El comentario de la línea 255 lo dice: «el LED y el buzzer ya dieron la confirmación».

**Qué pide el contrato:** primero enviar y esperar la respuesta; luego **una sola** señal:

| Respuesta de la API | Señal |
|---|---|
| `200` con `"resultado":"ASISTENCIA"` | 🟢 verde y 1 pitido corto |
| `200` con `"resultado":"RETARDO"` | 🟡 amarillo y 2 pitidos cortos |
| `200` con `"resultado":"RECHAZADA"` | 🔴 rojo y 1 pitido largo |
| `400` | 🔴 rojo y 1 pitido largo |
| `401`, `403`, `429`, `500`, sin red o más de 3 s sin respuesta | 🔵 3 destellos azules, sin sonido |

- La señal se elige solo con el **código HTTP** y el campo **`resultado`**. El texto de `error` es para personas y puede cambiar.
- Si la respuesta trae `"duplicado":true`, la señal es la misma (verde o amarillo): significa que ya había registrado y no se guarda dos veces.
- Para leer `resultado` se puede usar la biblioteca **ArduinoJson**, o, más sencillo, buscar el texto en la respuesta: `cuerpo.indexOf("\"resultado\":\"ASISTENCIA\"") >= 0`.

### 4. Quitar la decisión local de retardo (líneas 33, 98-100 y 243-253)

**Hoy:** `esRetardo()` (líneas 98-100) cuenta los minutos **desde que se encendió el lector** (`millis()`) y, pasados 10 (`MINUTOS_TOLERANCIA`, línea 33), todo es retardo. Si alguien desconecta y vuelve a conectar el lector, se reinicia la cuenta.

**Qué pide el contrato:** el lector **no decide nada**. La API conoce la hora real, el horario de cada clase y su tolerancia (que puede ser distinta en cada materia). Hay que borrar `MINUTOS_TOLERANCIA`, `esRetardo()` y la variable `estado` (líneas 235-253), y elegir la señal con la tabla del punto 3.

### 5. Quitar la lista local de tarjetas (líneas 37-48, 82-96 y 238-242)

**Hoy:** `VALIDAR_LISTA`, `UIDS_REGISTRADOS` y `tarjetaRegistrada()` comparan la tarjeta con una lista escrita en el código. Además solo aceptan UID de 4 bytes (línea 83), y hay credenciales de 7.

**Qué pide el contrato:** la API valida la credencial (RF-04: solo cuenta una credencial activa de un estudiante activo). Si la tarjeta no está vinculada, responde `RECHAZADA` con `"motivo":"CREDENCIAL_NO_VALIDA"` y el lector muestra rojo. Las tarjetas se vinculan desde la computadora (`npm run dev:vincular`, y después desde la web), no en el código.

### 6. No imprimir el UID completo (líneas 102-110 y 232)

**Hoy:** `imprimirUID()` muestra el UID completo en cada lectura.

**Qué pide el diseño (RNF-06):** el UID completo no debe salir en el lector ni en los registros. Durante las pruebas sí hace falta verlo para vincular tarjetas, así que la sugerencia de [`guia-firmware.md`](guia-firmware.md) (sección 6) es imprimirlo solo si se activa a propósito:

```cpp
// #define DEPURAR_UID   // quitar las // solo mientras se vinculan tarjetas
...
#ifdef DEPURAR_UID
  imprimirUID();
#endif
```

En el uso normal basta con «Tarjeta detectada».

### Cómo quedaría el envío (sugerencia)

Es un ejemplo para orientarse, no código probado en el circuito. Usa las funciones de LED y pitidos que ya existen.

```cpp
#include <WiFiClient.h>

// Lo que contestó la API, ya traducido a la señal que hay que mostrar.
enum Senal { VERDE, AMARILLO, ROJO, AZUL };

Senal enviarLectura(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) return AZUL;   // sin red: no esperar 15 s aquí

  WiFiClient cliente;
  HTTPClient http;
  http.begin(cliente, SECRETO_URL_SERVIDOR);
  http.setTimeout(3000);                             // 3 s, como pide el contrato
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Dispositivo-Id", SECRETO_DISPOSITIVO_ID);
  http.addHeader("X-Dispositivo-Clave", SECRETO_DISPOSITIVO_CLAVE);

  int codigo = http.POST("{\"uid\":\"" + uid + "\"}");
  String cuerpo = (codigo > 0) ? http.getString() : "";
  http.end();

  Serial.print("Respuesta de la API: ");
  Serial.println(codigo);                            // el código sí se puede imprimir; el UID no

  if (codigo == 200 && cuerpo.indexOf("\"resultado\":\"ASISTENCIA\"") >= 0) return VERDE;
  if (codigo == 200 && cuerpo.indexOf("\"resultado\":\"RETARDO\"") >= 0)    return AMARILLO;
  if (codigo == 200 && cuerpo.indexOf("\"resultado\":\"RECHAZADA\"") >= 0)  return ROJO;
  if (codigo == 400) return ROJO;
  return AZUL;                                       // 401, 403, 429, 500, timeout (código negativo)
}

void mostrarSenal(Senal s) {
  switch (s) {
    case VERDE:    ledVerde();    pitidos(1, 200, 0);   break;
    case AMARILLO: ledAmarillo(); pitidos(2, 150, 120); break;
    case ROJO:     ledRojo();     pitidos(1, 700, 0);   break;
    case AZUL:     avisoErrorEnvio();                   break;  // 3 destellos, sin sonido
  }
  delay(TIEMPO_LED);
  ledApagado();
}

// En loop(), en lugar de las líneas 234-266:
//   mostrarSenal(enviarLectura(uidComoTexto()));
```

## Otras diferencias menores

| Líneas | Qué pasa | Sugerencia |
|---|---|---|
| 113-131 y 145-151 | Si se cae el Wi-Fi, `conectarWiFi()` se queda hasta 15 s esperando **mientras el estudiante está frente al lector**. | Si no hay red, mostrar azul de inmediato y reconectar en segundo plano (por ejemplo, revisando `WiFi.status()` en `loop()` cada pocos segundos, o con `WiFi.setAutoReconnect(true)`). |
| 222-228 | Si la tarjeta no se alcanza a leer, muestra rojo con pitido largo. El contrato no define esa señal, y rojo significa «credencial no válida». | Lo más claro es no mostrar nada y esperar a que vuelvan a acercar la tarjeta. Si quieren una señal, que no sea igual a la de rechazada. Es decisión del equipo. |
| 22-23 | El comentario dice «cátodo común», pero `LED_ANODO_COMUN` vale `true`. | Corregir el comentario según el LED que tengan. Si los colores salen al revés (apagado cuando debería encender), es esta constante. |
| 4-6 y 112 | Los comentarios todavía hablan de Google Sheets. | Actualizarlos cuando cambie el envío. |
| 216-273 | La misma tarjeta, si se deja sobre el lector, se puede leer varias veces seguidas. | No es grave (la API responde `duplicado: true` y no guarda dos veces), pero gasta el límite de 60 peticiones por minuto. La guía (sección 2, «Evitar lecturas repetidas») sugiere ignorar el mismo UID durante 3 s. |

## Después de la prueba

Estas partes del contrato no hacen falta para la primera prueba, pero sí para la entrega final:

1. **Reloj por NTP** (`configTime` con la zona de México). Sin él no se puede guardar la hora de una lectura sin conexión.
2. **Cola sin conexión** ([contrato, sección «Sin conexión»](contrato-dispositivo.md)): si no hay red o la API no contesta, guardar el UID y la hora con zona (`2026-11-09T08:05:12-06:00`) en la memoria del ESP32 y reenviarlas después con el campo `leido_en`, sin mostrar señales. El contrato tiene una tabla de qué hacer con cada respuesta (por ejemplo, con `400` se borra de la cola; con `500` se reintenta).
3. **Clave en NVS:** guardar la clave del dispositivo en la memoria no volátil (biblioteca `Preferences`) en lugar de tenerla en `secretos.h`, para que no quede en el código compilado que se comparte.
4. **Respetar `429`:** si la API responde `429`, esperar los segundos de la cabecera `Retry-After` antes de volver a enviar.
5. **HTTPS con certificado** cuando la API se publique (paso de puesta en marcha).

## Cómo comprobar los cambios sin el lector

Desde la computadora donde corre la API:

- `npm run dispositivo:diagnostico` revisa que la dirección, el id y la clave que van en `secretos.h` funcionen, **sin registrar nada**.
- `npm run simular:lectura -- <UID>` hace exactamente la petición que debe hacer el ESP32 y dice qué color debería mostrar. Si el simulador da verde y el lector da otro color con la misma tarjeta, la diferencia está en el firmware.
- `npm run uid:revisar -- <UID del monitor serie>` dice si el UID está en el formato correcto.

Los pasos completos del día de la prueba están en [`prueba-con-dispositivo.md`](prueba-con-dispositivo.md).
