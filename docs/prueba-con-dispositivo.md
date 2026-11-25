# Probar el lector ESP32 contra una computadora del equipo

Esta guía es para probar el lector real (ESP32 con lector NFC, LED y buzzer) contra la API que corre en la computadora de Valeria, en la misma red Wi-Fi. Es **solo para desarrollo**: usa la base con datos de prueba, HTTP sin cifrar y la clave de prueba del dispositivo.

- Qué envía el lector y qué responde la API: [contrato del dispositivo](contrato-dispositivo.md).
- Cómo organizar el firmware y las pruebas en la mesa: [guía del firmware](guia-firmware.md).

## Resumen

| Paso | Quién | Qué |
|---|---|---|
| 1 | Valeria | Levanta la API y anota la dirección que muestra |
| 2 | Valeria | Permite el puerto 3000 en el firewall |
| 3 | Compañera | Pone la dirección y la clave en el ESP32, en la misma red Wi-Fi |
| 4 | Las dos | Vinculan las tarjetas reales a estudiantes de prueba |
| 5 | Valeria | Prepara una clase que empieza en 5 minutos |
| 6 | Compañera | Pasa las tarjetas y compara el color con la tabla |

## 1. Levantar la API en la computadora de Valeria

En la carpeta del proyecto, con la base de desarrollo ya creada (`npm run db:setup`):

```bash
npm run dev
```

Al arrancar, la API muestra una línea por cada red a la que está conectada la computadora:

```
API de TapList escuchando en http://localhost:3000 (development)
  Desde otro equipo de esta red: http://192.168.1.34:3000
```

**Esa dirección (`http://192.168.1.34:3000` en el ejemplo) es la que va en el ESP32.** La API escucha en todas las interfaces de red, así que contesta tanto en `localhost` como en esa dirección.

### Si no aparece ninguna dirección, o hay varias

Busca la dirección IPv4 de la conexión Wi-Fi:

| Sistema | Comando | Qué buscar |
|---|---|---|
| Windows (PowerShell) | `ipconfig` | En el adaptador de Wi-Fi («Drahtlos-LAN-Adapter WLAN» en alemán), la línea «IPv4-Adresse» |
| Parrot OS | `ip -4 addr show` | En la interfaz Wi-Fi (`wlan0` o parecida), el número después de `inet`, sin el `/24` |

Suele empezar con `192.168.` o `10.`. Si aparecen varias, la buena es la de la red Wi-Fi a la que también estará conectado el ESP32; ignora las de VPN, Docker o máquinas virtuales.

**La dirección puede cambiar** al reconectarse a la red o al cambiar de red (por ejemplo, al pasar al hotspot). Revísala cada vez.

## 2. Permitir el puerto 3000 en el firewall

Sin este paso, el ESP32 no llega a la API aunque estén en la misma red.

### Windows

La primera vez que corre `npm run dev`, Windows puede mostrar una alerta de seguridad para Node.js. Permite el acceso en **redes privadas**, no en públicas.

Si no apareció la alerta, o se rechazó por error, abre **PowerShell como administrador** y crea la regla solo para redes privadas:

```powershell
New-NetFirewallRule -DisplayName "TapList API (desarrollo)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

La red Wi-Fi debe estar marcada como **privada**: Configuración → Red e Internet → Wi-Fi → la red → «Perfil de red: Privada». En una red pública, Windows bloquea el puerto aunque exista la regla.

Al terminar las pruebas, quita la regla:

```powershell
Remove-NetFirewallRule -DisplayName "TapList API (desarrollo)"
```

### Parrot OS

Revisa si el firewall está activo:

```bash
sudo ufw status
```

Si dice `Status: active`, abre el puerto mientras pruebas:

```bash
sudo ufw allow 3000/tcp
```

Y ciérralo al terminar:

```bash
sudo ufw delete allow 3000/tcp
```

Si dice `inactive` o que `ufw` no existe, no hace falta nada.

### Comprobar que se llega desde otro equipo

Antes de tocar el ESP32, abre la dirección del paso 1 con `/api/auth/me` al final en el navegador de un **celular conectado a la misma red Wi-Fi**. Por ejemplo, `http://192.168.1.34:3000/api/auth/me`.

- Si sale un texto como `{"error":"No autenticado"}`, **la red y el firewall están bien**: el ESP32 también podrá llegar.
- Si el celular dice que no puede conectarse, revisa el firewall, la dirección y que estén en la misma red. Si todo está bien y sigue sin llegar, la red bloquea la comunicación entre equipos: usa el hotspot (sección 3).

## 3. La red Wi-Fi

- **El ESP32 solo funciona en redes de 2.4 GHz**, no en 5 GHz. Si la red solo tiene 5 GHz, el ESP32 no se conecta.
- **Las redes de escuelas y cafeterías suelen bloquear la comunicación entre equipos**, aunque los dos tengan internet. Si la prueba del celular falla, usa el hotspot.

### Usar el hotspot de un celular

1. Activa el hotspot del celular y, en sus opciones, elige la banda de **2.4 GHz** (a veces se llama «compatibilidad ampliada» o «AP Band: 2.4 GHz»).
2. Conecta la computadora de Valeria y el ESP32 a ese hotspot.
3. Vuelve a arrancar la API (`Ctrl+C` y `npm run dev`) o revisa la dirección con el paso 1: **será distinta** a la de la otra red.
4. En Windows, marca la red del hotspot como privada.

Las pruebas usan pocos datos móviles: cada lectura es una petición pequeña dentro de la red del celular.

## 4. Qué poner en el ESP32

| Dato | Valor para esta prueba |
|---|---|
| Red Wi-Fi | La misma que la computadora de Valeria (2.4 GHz) |
| URL | `http://<dirección del paso 1>/api/dispositivo/lecturas`, por ejemplo `http://192.168.1.34:3000/api/dispositivo/lecturas` |
| `X-Dispositivo-Id` | `1` |
| `X-Dispositivo-Clave` | `dev-esp32-aula101-SoloDesarrollo-2026` |
| `Content-Type` | `application/json` |
| Cuerpo | `{ "uid": "04A1B2C3" }`, con el UID en el [formato canónico](contrato-dispositivo.md#formato-canónico-del-uid) |

- **Es `http://`, no `https://`.** En esta prueba la API no tiene certificado. En producción siempre será HTTPS, con otra dirección y otra clave.
- **La clave es de prueba:** solo existe en la semilla. Guárdala en NVS igual que la real y no la imprimas por el puerto serie.
- **Hora:** para las lecturas guardadas sin conexión (`leido_en`), el ESP32 necesita la hora por NTP, y el hotspot o la red deben tener internet.

## 5. Vincular las tarjetas reales

Las credenciales de la semilla tienen UID inventados. Para que las tarjetas reales registren, hay que vincularlas a estudiantes de prueba del grupo D01.

1. **Lee el UID de cada tarjeta con el ESP32**, con `DEPURAR_UID` activado (ver la [guía del firmware](guia-firmware.md#6-privacidad-qué-nunca-debe-imprimirse)), y anótalo.
2. **Revisa el formato** en la computadora de Valeria:

   ```bash
   npm run uid:revisar -- <UID que imprimió el ESP32>
   ```

   Debe decir «Válido», sin avisos. Si avisa que parece decimal o que está incompleto, corrige el firmware antes de seguir.
3. **Mira los estudiantes de prueba:**

   ```bash
   npm run dev:vincular
   ```

   ```
   Estudiantes activos de D01:
     220000001  Andrea López Torres        ****B2C3
     220000002  Bruno Martínez Cruz        ****E5F6
     220000003  Carla Ramírez Ortega       ****556A
   ```

4. **Vincula cada tarjeta a un estudiante distinto:**

   ```bash
   npm run dev:vincular -- <UID> --matricula 220000001
   ```

   El comando vuelve a revisar el formato y no vincula nada si el UID es inválido. Si es válido pero tiene avisos (por ejemplo, solo dígitos), pide repetirlo con `--forzar`. La credencial anterior del estudiante queda inactiva y la acción queda en la bitácora, como si se hubiera hecho desde la web.

Deja al menos un estudiante sin tarjeta real, para ver un «Pendiente» en la web.

## 6. Preparar una clase que empieza en 5 minutos

Una lectura solo cuenta si hay una clase en curso para el grupo del estudiante. Las clases de la semilla son el lunes a las 07:00, el martes a las 11:00 y el miércoles a las 09:00, así que para probar a cualquier hora:

```bash
npm run dev:clase-ahora
```

```
«Clase de prueba (dispositivo)» del grupo D01 (docente roberto.gomez@academicos.udg.mx)
  Hoy 2026-11-22, empieza a las 16:39.

Qué debe mostrar el lector con una credencial vinculada a un estudiante de D01:
  🟢 Asistencia  de 16:24 a 16:49
  🟡 Retardo     de 16:50 a 17:39
  🔴 Rechazada   antes de 16:24 o después de 17:39 (sin clase), o con una tarjeta no vinculada
```

- **Para repetir la prueba,** vuelve a correrlo: mueve la misma clase y borra sus lecturas, así cada tarjeta puede volver a dar verde.
- **Para que empiece ya:** `npm run dev:clase-ahora -- --minutos 0`. Así el retardo llega en unos 10 minutos en lugar de unos 15.
- Si avisa que **se cruza con otra clase** del grupo, una lectura podría irse a esa otra clase: muévela con `--minutos`.
- Se niega a correr con `NODE_ENV=production`, igual que `dev:vincular`.

Para ver el «En vivo» mientras tanto, abre la web y entra como Roberto (`roberto.gomez@academicos.udg.mx`, contraseña `Docente#TapList2026`).

## 7. Qué color debe ver

| Situación | Respuesta de la API | Lector |
|---|---|---|
| Tarjeta vinculada, dentro de la ventana y hasta 10 minutos después del inicio | `200` · `ASISTENCIA` | 🟢 Verde y 1 pitido corto |
| Tarjeta vinculada, después de esos 10 minutos y hasta 1 hora después del inicio | `200` · `RETARDO` | 🟡 Amarillo y 2 pitidos cortos |
| La misma tarjeta otra vez en la misma clase | `200` · el mismo resultado, con `duplicado: true` | El mismo color que la primera vez |
| Tarjeta no vinculada, o la credencial anterior de un estudiante | `200` · `RECHAZADA` · `CREDENCIAL_NO_VALIDA` | 🔴 Rojo y 1 pitido largo |
| Tarjeta vinculada, sin clase en curso | `200` · `RECHAZADA` · `SIN_CLASE` | 🔴 Rojo y 1 pitido largo |
| UID mal formado (decimal, incompleto) | `400` | 🔴 Rojo y 1 pitido largo |
| Clave o id del dispositivo incorrectos | `401` | 🔵 3 destellos azules |
| API apagada, dirección equivocada, firewall o Wi-Fi | Sin respuesta en 3 s | 🔵 3 destellos azules |

En la web (P2), cada lectura aparece en menos de 5 segundos, y quien todavía no registra sale como «Pendiente».

## 8. Límites de solicitudes

La API limita las solicitudes para protegerse, pero una prueba normal no llega a esos límites:

| Límite | Valor | Cuándo afecta |
|---|---|---|
| Lecturas por dispositivo | 60 por minuto | Solo con más de una lectura por segundo, de forma sostenida |
| Fallos de clave por dirección IP | 30 cada 15 minutos | Si el ESP32 manda la clave equivocada muchas veces |

Si se pasa alguno, la API responde `429` y el lector muestra los destellos azules. Para empezar de cero, corrige la causa (normalmente la clave) y **reinicia la API** con `Ctrl+C` y `npm run dev`: los contadores viven en memoria y se borran al reiniciar.

## 9. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Destellos azules con todas las tarjetas | El ESP32 no llega a la API | Comprueba con el celular (sección 2); revisa la dirección, el firewall y la red |
| El celular llega, pero el ESP32 no | El ESP32 está en otra red, o en 5 GHz | Misma red y 2.4 GHz |
| Destellos azules y el ESP32 recibe `401` | Clave o id del dispositivo mal escritos | Copia la clave de la tabla de la sección 4 |
| Rojo con una tarjeta que sí se vinculó | UID con otro formato, o fuera de horario | Activa `DEPURAR_UID` y compara con `npm run uid:revisar -- <del ESP32> --comparar <el vinculado>`; corre `npm run dev:clase-ahora` |
| Funcionaba y dejó de funcionar | La dirección cambió (otra red, o el router asignó otra) | Revisa la dirección con el paso 1 |

## 10. Al terminar

- Quita la regla del firewall (sección 2).
- Si quieres dejar la base como al principio: `npm run db:setup -- --reset`. Borra la clase de prueba, las lecturas y las tarjetas vinculadas.
- Nada de esto va a producción: ni la clave de prueba, ni la semilla, ni HTTP sin cifrar.
