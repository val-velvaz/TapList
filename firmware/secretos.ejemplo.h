// Datos privados del lector. NO pongas valores reales en este archivo.
//
// 1. Copia este archivo como secretos.h, en esta misma carpeta (firmware/).
// 2. Llena los valores en secretos.h.
//
// secretos.h está en .gitignore: se queda en tu computadora y nunca se sube a
// GitHub. El repositorio es público.
#pragma once

// Red Wi-Fi (el ESP32 solo usa redes de 2.4 GHz).
#define SECRETO_WIFI_SSID ""
#define SECRETO_WIFI_PASS ""

// Dirección a la que el lector envía las lecturas.
// Para la API de TapList en la computadora de un compañero, por ejemplo:
//   "http://192.168.1.34:3000/api/dispositivo/lecturas"
// (ver docs/prueba-con-dispositivo.md).
#define SECRETO_URL_SERVIDOR ""

// Credenciales del lector para la API de TapList (cabeceras X-Dispositivo-Id y
// X-Dispositivo-Clave; ver docs/contrato-dispositivo.md). Esta versión del
// código todavía no las usa.
#define SECRETO_DISPOSITIVO_ID ""
#define SECRETO_DISPOSITIVO_CLAVE ""
