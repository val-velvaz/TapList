# Firmware del lector (ESP32)

Código del lector NFC de TapList: un ESP32 con lector RC522, LED RGB y buzzer. Lo programa el equipo del circuito.

**Versión inicial:** es el primer código del equipo, tal como lo escribieron. Por ahora envía cada lectura a una hoja de Google (Apps Script), todavía no a la API de TapList.

## Cómo compilarlo

1. Abre la carpeta `firmware/` en Arduino IDE: el archivo principal es `firmware.ino`.
2. Instala la librería **MFRC522** y el soporte para placas **ESP32**.
3. **Crea tu archivo de secretos:** copia `secretos.ejemplo.h` como `secretos.h`, en esta misma carpeta, y llena la red Wi-Fi y la dirección del servidor.

`secretos.h` está en el `.gitignore`: se queda en tu computadora y **nunca se sube a GitHub**, porque el repositorio es público. Nunca escribas contraseñas, claves ni direcciones privadas directamente en `firmware.ino`. El CI revisa cada cambio y falla si encuentra una.

## Para conectarlo a la API de TapList

- [`docs/contrato-dispositivo.md`](../docs/contrato-dispositivo.md): qué enviar a la API, qué responde y qué color mostrar con cada respuesta.
- [`docs/guia-firmware.md`](../docs/guia-firmware.md): cómo organizar el código para poder cambiar de lector, conexiones y lista de pruebas.
- [`docs/prueba-con-dispositivo.md`](../docs/prueba-con-dispositivo.md): cómo probar el lector contra la API en la computadora de un compañero.
