# Guía del firmware del lector (ESP32)

Esta guía es para quienes programan el firmware y arman el circuito del lector de TapList. Explica cómo organizar el código para que **cambiar de lector NFC no obligue a tocar nada más**, cómo conectar el lector y cómo comprobar que todo funciona.

- Qué enviar a la API y qué señal mostrar con cada respuesta está en el [contrato del dispositivo](contrato-dispositivo.md). Léelo primero.
- El código del firmware va en la carpeta `firmware/` del repositorio.
- Los fragmentos de código de esta guía son **ejemplos** para mostrar la idea. No son un firmware completo y **no se han probado en un circuito real**: ajústenlos a su placa y a las versiones de sus librerías.

**Lector previsto:** RC522 (MFRC522), según el documento de diseño. No está confirmado; podría terminar siendo un PN532 u otro. Con la organización de esta guía, ese cambio afecta a un solo archivo.

## Contenido

1. [La idea: el lector en su propia capa](#1-la-idea-el-lector-en-su-propia-capa)
2. [La interfaz del lector](#2-la-interfaz-del-lector)
3. [Una sola función para convertir el UID a texto](#3-una-sola-función-para-convertir-el-uid-a-texto)
4. [Conexiones](#4-conexiones)
5. [Qué tarjetas lee cada lector](#5-qué-tarjetas-lee-cada-lector)
6. [Privacidad: qué nunca debe imprimirse](#6-privacidad-qué-nunca-debe-imprimirse)
7. [Lista de pruebas con el circuito](#7-lista-de-pruebas-con-el-circuito)

## 1. La idea: el lector en su propia capa

El firmware hace cuatro cosas. Conviene que cada una viva en sus propios archivos:

```text
                 ┌──────────────────────────────┐
  tarjeta ──────▶│  LECTOR  (RC522 o PN532)     │──▶ bytes del UID
                 └──────────────────────────────┘
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │  UID A TEXTO (una función)   │──▶ "04A2B3C4"
                 └──────────────────────────────┘
                                │
                                ▼
        ┌───────────────┬───────────────┬──────────────────┐
        │  RED Y API    │  COLA SIN     │  SEÑALES         │
        │  (WiFi, POST) │  CONEXIÓN     │  (LED y buzzer)  │
        └───────────────┴───────────────┴──────────────────┘
```

La regla es una sola: **solo la capa del lector sabe qué modelo de lector hay.** La red, la cola sin conexión, el LED y el buzzer reciben el UID ya convertido a texto y no incluyen ninguna librería del lector.

Una forma de repartir los archivos (los nombres son una sugerencia):

| Archivo | Qué contiene | ¿Depende del modelo del lector? |
|---|---|---|
| `config.h` | Pines, y **la línea que elige el lector** | Solo esa línea |
| `lector.h` | La interfaz: dos funciones | No |
| `lector_rc522.cpp` | La interfaz hecha con la librería MFRC522 | **Sí** |
| `lector_pn532.cpp` | La interfaz hecha con la librería Adafruit_PN532 | **Sí** |
| `uid.h` y `uid.cpp` | La conversión de bytes a texto | No |
| `red.cpp`, `cola.cpp`, `senales.cpp` | WiFi y petición, cola sin conexión, LED y buzzer | No |
| El programa principal | Une todo: leer, convertir, enviar y mostrar la señal | No |

Para comprobar que la separación quedó bien: busquen `MFRC522` y `PN532` en todo el código. Solo deben aparecer en `config.h` y en su archivo `lector_….cpp`.

## 2. La interfaz del lector

La interfaz es lo mínimo que el resto del firmware necesita del lector: **iniciarlo** y **leer un UID como bytes**.

```cpp
// EJEMPLO · lector.h
#pragma once
#include <Arduino.h>

const uint8_t UID_MAX_BYTES = 10;   // el UID más largo que existe

struct Uid {
  uint8_t bytes[UID_MAX_BYTES];     // bytes[0] es el primer byte que entrega la tarjeta
  uint8_t longitud;                 // 4, 7 o 10
};

// Prepara el lector. Devuelve false si el lector no responde (cable suelto, sin alimentación).
bool lectorIniciar();

// Devuelve true si hay una tarjeta nueva y llena `uid`. Devuelve false si no hay tarjeta.
bool lectorLeerUid(Uid &uid);
```

### Elegir el lector en un solo lugar

```cpp
// EJEMPLO · config.h
#define LECTOR_RC522        // ← la única línea que cambia si cambian de lector
// #define LECTOR_PN532
```

Cada implementación se compila solo si su lector está elegido:

```cpp
// EJEMPLO · lector_rc522.cpp
#include "config.h"
#ifdef LECTOR_RC522

#include <SPI.h>
#include <MFRC522.h>
#include "lector.h"

static MFRC522 mfrc522(PIN_LECTOR_SS, PIN_LECTOR_RST);

bool lectorIniciar() {
  SPI.begin();
  mfrc522.PCD_Init();
  // 0x00 o 0xFF significa que el lector no contestó.
  byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
  return version != 0x00 && version != 0xFF;
}

bool lectorLeerUid(Uid &uid) {
  if (!mfrc522.PICC_IsNewCardPresent()) return false;
  if (!mfrc522.PICC_ReadCardSerial()) return false;

  uid.longitud = mfrc522.uid.size;
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    uid.bytes[i] = mfrc522.uid.uidByte[i];   // mismo orden: del 0 al último
  }
  mfrc522.PICC_HaltA();   // para no leer la misma tarjeta muchas veces seguidas
  return true;
}

#endif
```

```cpp
// EJEMPLO · lector_pn532.cpp
#include "config.h"
#ifdef LECTOR_PN532

#include <Wire.h>
#include <Adafruit_PN532.h>
#include "lector.h"

static Adafruit_PN532 nfc(PIN_LECTOR_IRQ, PIN_LECTOR_RST);   // conexión por I2C

bool lectorIniciar() {
  nfc.begin();
  if (!nfc.getFirmwareVersion()) return false;   // 0 significa que el lector no contestó
  nfc.SAMConfig();
  return true;
}

bool lectorLeerUid(Uid &uid) {
  uint8_t longitud = 0;
  // El último número es el tiempo máximo de espera en milisegundos. Sin él,
  // la función se queda esperando una tarjeta y detiene todo lo demás.
  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid.bytes, &longitud, 50)) return false;
  uid.longitud = longitud;                       // la librería ya llenó uid.bytes del 0 al último
  return true;
}

#endif
```

El programa principal queda igual con cualquier lector:

```cpp
// EJEMPLO · programa principal
Uid uid;
if (lectorLeerUid(uid)) {
  String texto = uidATexto(uid);        // sección 3
  enviarLectura(texto);                 // red, cola y señales: no saben qué lector hay
}
```

**Si aparece un tercer modelo de lector,** se agrega un archivo `lector_<modelo>.cpp` con esas mismas dos funciones y una línea `#define` en `config.h`. Nada más cambia, ni en el firmware ni en el servidor.

### Evitar lecturas repetidas

Mientras la tarjeta sigue sobre el lector, algunos lectores la reportan muchas veces por segundo. Enviar una lectura repetida no hace daño (la API responde `duplicado: true`), pero gasta el límite de 60 solicitudes por minuto. Conviene ignorar el mismo UID durante uno o dos segundos. Esa regla va en el programa principal, no en la capa del lector, para que funcione igual con cualquier modelo.

## 3. Una sola función para convertir el UID a texto

Todas las implementaciones entregan bytes, y **una sola función** los convierte al [formato canónico](contrato-dispositivo.md#formato-canónico-del-uid). Si cada lector tuviera su propia conversión, tarde o temprano una saldría distinta.

```cpp
// EJEMPLO · uid.cpp
#include "uid.h"

String uidATexto(const Uid &uid) {
  static const char DIGITOS[] = "0123456789ABCDEF";   // mayúsculas
  String texto;
  texto.reserve(uid.longitud * 2);
  for (uint8_t i = 0; i < uid.longitud; i++) {        // del primer byte al último
    texto += DIGITOS[uid.bytes[i] >> 4];              // primer carácter del byte
    texto += DIGITOS[uid.bytes[i] & 0x0F];            // segundo carácter del byte
  }
  return texto;
}
```

Esta función escribe **siempre dos caracteres por byte**: el byte `0x0A` sale como `0A`.

Para probarla sin tarjeta, con valores fijos:

| Bytes | Resultado correcto |
|---|---|
| `0x04 0x0A 0x00 0xC3` | `040A00C3` |
| `0x04 0xA2 0xB3 0xC4 0xD5 0xE6 0xF7` | `04A2B3C4D5E6F7` |

Si el primer caso sale `4A0C3`, `040a00c3` o `C3000A04`, la función está mal.

### Lo que no hay que hacer

| No hagan esto | Qué sale mal |
|---|---|
| `texto += String(b, HEX);` | Escribe `0x0A` como `a`: pierde el cero y sale en minúsculas. |
| Guardar el UID en un `uint32_t` o `unsigned long` | Solo caben 4 bytes: las tarjetas de 7 quedan truncadas. Además, al imprimirlo, los bytes pueden salir invertidos. |
| `String(numero)` | Envía el UID en decimal. |
| Recorrer el arreglo del último al primero | Bytes invertidos. |
| Un arreglo `uint8_t uid[4]` o `uid[7]` | No cabe un UID de 7 o de 10 bytes. Usen 10. |

Todos estos errores tienen el mismo síntoma: la credencial se vincula bien, pero en el aula el lector da **rojo** (`RECHAZADA`). Están explicados con ejemplos en el [contrato](contrato-dispositivo.md#errores-comunes).

## 4. Conexiones

Los pines son **sugerencias** para una placa ESP32 DevKit clásica (ESP32-WROOM-32), que son los pines SPI e I2C que usa Arduino por defecto. Otras placas (ESP32-S3, ESP32-C3) tienen otros: revisen el diagrama de la suya. Anoten los pines en `config.h`, no repartidos por el código.

### RC522 por SPI

| Pin del RC522 | Pin del ESP32 | Nota |
|---|---|---|
| `3.3V` | `3V3` | ⚠️ **Nunca a 5 V** (`VIN` o `5V`): el RC522 se daña. |
| `GND` | `GND` | |
| `SDA` (también rotulado `SS` o `NSS`) | GPIO 5 | En este módulo, `SDA` es la selección del SPI, no el I2C. |
| `SCK` | GPIO 18 | |
| `MOSI` | GPIO 23 | |
| `MISO` | GPIO 19 | |
| `RST` | GPIO 27 | Puede ser otro pin libre. |
| `IRQ` | Sin conectar | No hace falta. |

Las señales del ESP32 ya son de 3.3 V, así que no hacen falta resistencias ni convertidores de nivel.

### PN532 (por si cambian)

Los módulos PN532 pueden conectarse por I2C o por SPI. **El modo se elige con unos interruptores pequeños o puentes de la placa** (rotulados `SEL0` y `SEL1`, o `I0` e `I1`): sigan la tabla que trae impresa su módulo. Si los interruptores no coinciden con el cableado, el lector no responde.

**Por I2C** (menos cables):

| Pin del PN532 | Pin del ESP32 |
|---|---|
| `VCC` | `3V3` (ver la nota de alimentación) |
| `GND` | `GND` |
| `SDA` | GPIO 21 |
| `SCL` | GPIO 22 |
| `IRQ` y `RSTO`/`RSTPDN` | Dos pines libres, por ejemplo GPIO 4 y GPIO 27 |

**Por SPI:**

| Pin del PN532 | Pin del ESP32 |
|---|---|
| `VCC` | `3V3` (ver la nota de alimentación) |
| `GND` | `GND` |
| `SCK` | GPIO 18 |
| `MOSI` | GPIO 23 |
| `MISO` | GPIO 19 |
| `SS` (o `SSEL`) | GPIO 5 |

Con SPI, el objeto de la librería se crea distinto (`Adafruit_PN532 nfc(PIN_LECTOR_SS);`) y se incluye `SPI.h` en lugar de `Wire.h`. Ese cambio queda dentro de `lector_pn532.cpp`.

**Alimentación del PN532:** consume más que el RC522, sobre todo al leer. Si las lecturas fallan a ratos o el ESP32 se reinicia al acercar la tarjeta, el pin `3V3` de la placa puede no estar dando suficiente corriente: midan el voltaje con un multímetro mientras lee. Muchos módulos PN532 aceptan también 5 V en `VCC` porque traen su propio regulador, pero **compruébenlo en la hoja de datos de su módulo** antes de conectarlo, y confirmen que sus señales siguen siendo de 3.3 V.

### Consejos para cualquier lector

- **Cables cortos.** Con cables largos de protoboard, el SPI falla de forma intermitente.
- **Lejos del metal.** Una superficie metálica debajo de la antena reduce mucho la distancia de lectura.
- **Si `lectorIniciar()` devuelve `false`,** casi siempre es un cable suelto, la alimentación o, en el PN532, los interruptores de modo.

## 5. Qué tarjetas lee cada lector

Los dos lectores trabajan a **13.56 MHz** y leen tarjetas **ISO 14443A**. De ahí sale el UID de 4, 7 o 10 bytes.

| Tarjeta | Largo del UID | ¿RC522? | ¿PN532? |
|---|---|---|---|
| MIFARE Classic 1K y 4K (las tarjetas y llaveros que suelen venir con el lector) | 4 bytes, a veces 7 | Sí | Sí |
| MIFARE Ultralight y NTAG213/215/216 (etiquetas adhesivas) | 7 bytes | Sí | Sí |
| MIFARE DESFire | 7 bytes | Sí | Sí |
| Tarjetas de **125 kHz** (EM4100, HID Prox y parecidas) | — | **No** | **No** |
| Celulares y relojes con NFC | Cambia en cada lectura | No sirve | No sirve |

El PN532 también lee otros tipos de tarjeta (ISO 14443B, FeliCa), pero TapList solo usa el UID de las ISO 14443A.

### Cómo comprobar que la credencial de la escuela es compatible

Háganlo **antes** de dar por bueno el lector, con una credencial real:

1. **Con un celular con NFC** y una aplicación gratuita para leer etiquetas NFC, acerquen la credencial.
   - Si la aplicación muestra el tipo «ISO 14443-3A» (o «NFC-A») y un número de serie, es compatible. Anoten cuántos bytes tiene el número de serie.
   - Si el celular no detecta nada, lo más probable es que la credencial sea de 125 kHz. **Ninguno de los dos lectores la lee**: avisen al equipo, porque cambia el plan (otro lector, o repartir tarjetas propias).
2. **Con el circuito**, lean la misma credencial **tres veces** y comparen el UID (prueba 4 de la [lista](#7-lista-de-pruebas-con-el-circuito)).
   - Si sale igual las tres veces, sirve.
   - Si cambia cada vez, la tarjeta usa un **UID aleatorio** y no sirve como credencial. Los UID aleatorios de 4 bytes empiezan con `08`.
3. Comparen lo que mostró el celular con lo que imprime el ESP32. Deben ser los mismos bytes en el mismo orden.

### Dos avisos sobre el UID

- **Los celulares no sirven como credencial.** Por seguridad, un celular entrega un UID distinto en cada lectura.
- **Un UID que empieza con `88` está incompleto.** En las tarjetas de 7 y 10 bytes, `88` es una marca interna del protocolo, no parte del UID. Si la ven al principio, el lector se quedó a media lectura. Las librerías MFRC522 y Adafruit_PN532 ya entregan el UID completo; esto suele pasar con código copiado que lee «a mano».

## 6. Privacidad: qué nunca debe imprimirse

Por el requisito RNF-06, el UID completo no debe quedar a la vista ni guardado donde alguien lo pueda copiar.

- **En producción, el firmware nunca imprime el UID por el puerto serie.** Tampoco el nombre ni la matrícula (la API ni siquiera los envía).
- **La clave del dispositivo se guarda en NVS** y nunca se imprime, ni en depuración.
- **Para las pruebas,** impriman el UID solo en un modo de depuración que se active a propósito:

```cpp
// EJEMPLO · config.h
// #define DEPURAR_UID      // ← dejar comentado. Solo para pruebas en la mesa.
```

```cpp
// EJEMPLO · programa principal
#ifdef DEPURAR_UID
  Serial.print("UID: ");
  Serial.println(texto);
#endif
```

Antes de instalar un lector en un aula, confirmen que `DEPURAR_UID` está comentado.

## 7. Lista de pruebas con el circuito

Háganlas en orden. Las pruebas 3 a 8 necesitan el modo de depuración activado y, del lado del servidor, la ayuda de quien tenga el repositorio de la API instalado. Para conectar el ESP32 a la API de esa computadora (dirección, firewall, hotspot, vincular tarjetas y preparar una clase), sigan [prueba-con-dispositivo.md](prueba-con-dispositivo.md).

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Encender el circuito sin tarjeta. | `lectorIniciar()` devuelve `true`. Señal de encendido: LED azul y 1 pitido corto. |
| 2 | Desconectar un cable del lector y encender. | `lectorIniciar()` devuelve `false` y el firmware lo indica; no se queda colgado. |
| 3 | Probar `uidATexto` con los valores fijos de la [sección 3](#3-una-sola-función-para-convertir-el-uid-a-texto). | `040A00C3` y `04A2B3C4D5E6F7`, exactamente. |
| 4 | Leer la misma tarjeta tres veces. | El mismo UID las tres veces. |
| 5 | Leer una tarjeta de **4 bytes** (por ejemplo, la MIFARE Classic que viene con el lector). | 8 caracteres hexadecimales en mayúsculas, sin separadores. |
| 6 | Leer una tarjeta de **7 bytes** (por ejemplo, una etiqueta NTAG o Ultralight). | 14 caracteres. No empieza con `88` y no se corta a 8. |
| 7 | Revisar cada UID impreso con `uid:revisar`. | «Válido», sin avisos. |
| 8 | Comparar con el otro lector que se vaya a usar (el lector USB de la pantalla P5, o el celular). | «Son el mismo UID». |
| 9 | Vincular la tarjeta a un estudiante de prueba y leerla con el ESP32 en horario de clase. | Verde o amarillo, no rojo. |
| 10 | Desconectar el WiFi y leer una tarjeta. | 3 destellos azules; al volver la red, la lectura se envía con `leido_en`. |
| 11 | Cambiar el `#define` al otro lector (si tienen los dos). | Solo cambia `config.h`; las pruebas 4 a 9 dan los mismos UID con las mismas tarjetas. |
| 12 | Comentar `DEPURAR_UID` y leer una tarjeta. | El puerto serie **no** muestra el UID. |

### Las herramientas del servidor

Se ejecutan en la computadora que tiene el repositorio de la API, no en el ESP32.

**Revisar el formato de un UID** (no necesita el servidor encendido):

```bash
npm run uid:revisar -- 04A2B3C4D5E6F7
```

Dice si la API lo aceptaría, lo muestra en formato canónico y avisa si parece decimal, aleatorio o incompleto.

**Comparar lo que entregan dos lectores para la misma tarjeta:**

```bash
npm run uid:revisar -- C4B3A204 --comparar 04A2B3C4
```

Responde, por ejemplo, «son la misma tarjeta con los BYTES INVERTIDOS». También reconoce el formato decimal, los ceros perdidos y el UID truncado.

**Simular la lectura que haría el ESP32,** con el servidor encendido (`npm run dev`):

```bash
npm run simular:lectura -- 04A2B3C4D5E6F7
```

Escriban ahí el UID tal como lo imprimió el ESP32. La respuesta debe ser la misma que obtiene el ESP32 con esa tarjeta: si el simulador da verde y el ESP32 da rojo, el firmware está enviando algo distinto de lo que imprime.

Estas herramientas muestran el UID completo en la pantalla: úsenlas con tarjetas de prueba.

### Si el lector da rojo con una tarjeta que sí está vinculada

1. Activen `DEPURAR_UID` y anoten el UID que imprime el ESP32.
2. Pidan el UID con el que se vinculó la credencial (lo que entregó el lector USB o lo que se escribió en P5).
3. Compárenlos con `npm run uid:revisar -- <del ESP32> --comparar <el vinculado>`.
4. Si no son iguales, la herramienta dice cuál es la diferencia. Corrijan el lado que no siga el [formato canónico](contrato-dispositivo.md#formato-canónico-del-uid) y, si hace falta, pidan que se reemplace la credencial en P4 con el UID correcto.
5. Si son iguales, el formato está bien: revisen que la credencial y el estudiante estén activos y que haya una clase en curso (`SIN_CLASE` también da rojo).
