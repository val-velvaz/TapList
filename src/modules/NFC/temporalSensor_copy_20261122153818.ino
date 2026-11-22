
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// def de pines del sensor
#define SS_PIN  5
#define RST_PIN 22

// def de pines LED RGB y buzzer
#define LED_R   25
#define LED_G   26
#define LED_B   27
#define BUZZER  4

//LED RGB es de catodo comun (low para anodo)
#define LED_ANODO_COMUN true

//conexion wifi 
const char* WIFI_SSID = "TOTALPLAY_ROJO_2.4G";
const char* WIFI_PASS = "Atoyac2711.@";

// URL de la implementacion web de Apps Script
const char* URL_SCRIPT = "https://script.google.com/macros/s/AKfycbzlpKaG91H_OrUChdmQJEu0rRM54Qm8plblHyXtEVsZsFN9fPVNCZZ8DDVaU7Zg6GGWuA/exec";

// config de tiempos
const unsigned long MINUTOS_TOLERANCIA = 10; //tiempo de retraso desde que se prende el sistema

const unsigned long TIEMPO_LED = 1000; //tiempo que se queda encendido el led despues de leer

// false = tarjeta leida cuenta como registro (verde/amarillo).
// true  = solo cuentan las tarjetas de la lista; las demas dan rojo.
const bool VALIDAR_LISTA = false;

// tarjetas
// (solo se usan si VALIDAR_LISTA = true)
// UID de las tarjetas (monitor serie)
const byte NUM_TARJETAS = 2; //x
const byte UIDS_REGISTRADOS[NUM_TARJETAS][4] = {
  {0x4A, 0x3F, 0x9C, 0x12},
  {0xDE, 0xAD, 0xBE, 0xEF}
};

MFRC522 sensor(SS_PIN, RST_PIN);

// funciones del led
void ledColor(bool r, bool g, bool b) {
  if (LED_ANODO_COMUN) {
    r = !r; g = !g; b = !b;
  }
  digitalWrite(LED_R, r);
  digitalWrite(LED_G, g);
  digitalWrite(LED_B, b);
}

void ledApagado() { ledColor(false, false, false); }
void ledVerde()   { ledColor(false, true,  false); }
void ledAmarillo(){ ledColor(true,  true,  false); }  // rojo + verde
void ledRojo()    { ledColor(true,  false, false); }

// funciones del buzzer
void pitido(unsigned int duracion) {
  digitalWrite(BUZZER, HIGH);
  delay(duracion);
  digitalWrite(BUZZER, LOW);
}

void pitidos(byte cantidad, unsigned int duracion, unsigned int pausa) {
  for (byte i = 0; i < cantidad; i++) {
    pitido(duracion);
    if (i < cantidad - 1) delay(pausa);
  }
}

// registro
bool tarjetaRegistrada() {
  if (sensor.uid.size != 4) return false;

  for (byte t = 0; t < NUM_TARJETAS; t++) {
    bool coincide = true;
    for (byte i = 0; i < 4; i++) {
      if (sensor.uid.uidByte[i] != UIDS_REGISTRADOS[t][i]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return true;
  }
  return false;
}

bool esRetardo() {
  return millis() > (MINUTOS_TOLERANCIA * 60UL * 1000UL);
}

void imprimirUID() {
  Serial.print("UID: ");
  for (byte i = 0; i < sensor.uid.size; i++) {
    if (sensor.uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(sensor.uid.uidByte[i], HEX);
    Serial.print(" ");
  }
  Serial.println();
}

// wifi y envío a google sheets
void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Conectando a WiFi");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi conectado. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("No se pudo conectar al WiFi (se reintentara al registrar).");
  }
}

// UID como texto continuo ("4A3F9C12")
String uidComoTexto() {
  String uid = "";
  for (byte i = 0; i < sensor.uid.size; i++) {
    if (sensor.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(sensor.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

bool enviarRegistro(const String& uid, const char* estado) {
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Sin WiFi: registro NO guardado.");
      return false;
    }
  }

  WiFiClientSecure cliente;
  cliente.setInsecure();   // simplifica la conexion HTTPS con Google

  HTTPClient http;
  String url = String(URL_SCRIPT) + "?uid=" + uid + "&estado=" + estado;

  http.begin(cliente, url);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(8000);

  int codigo = http.GET();
  http.end();

  if (codigo == 200) {
    Serial.println("Registro guardado en Google Sheets.");
    return true;
  }

  Serial.print("Error al guardar. Codigo HTTP: ");
  Serial.println(codigo);
  return false;
}

// 3 destellos azules = no se pudo guardar
void avisoErrorEnvio() {
  for (byte i = 0; i < 3; i++) {
    ledColor(false, false, true);
    delay(150);
    ledApagado();
    delay(150);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);
  ledApagado();

  conectarWiFi();

  Serial.println("Iniciando RC522...");

  SPI.begin();
  sensor.PCD_Init();

  delay(100);

  Serial.println("RC522 iniciado.");
  Serial.println("Escanea una tarjeta...");

  // confirmacion inicial: un pitido corto y destello azul
  ledColor(false, false, true);
  pitido(100);
  delay(300);
  ledApagado();
}

void loop() {
  if (!sensor.PICC_IsNewCardPresent()) {
    return;
  }

  // si la lectura falla: NO DETECTADO, intentar de nuevo
  if (!sensor.PICC_ReadCardSerial()) {
    Serial.println("Resultado: NO DETECTADO, intenta de nuevo.");
    ledRojo();
    pitidos(1, 700, 0);           // 1 pitido largo
    delay(TIEMPO_LED);
    ledApagado();
    return;
  }

  Serial.println("Tarjeta detectada.");
  imprimirUID();

  unsigned long inicio = millis();
  const char* estado;

  // si se activa la validacion por lista y la tarjeta no esta, tambien da rojo
  if (VALIDAR_LISTA && !tarjetaRegistrada()) {
    Serial.println("Resultado: NO DETECTADO (tarjeta no autorizada), intenta de nuevo.");
    estado = "NO_AUTORIZADO";
    ledRojo();
    pitidos(1, 700, 0);
  } else if (esRetardo()) {
    Serial.println("Resultado: RETARDO");
    estado = "RETARDO";
    ledAmarillo();
    pitidos(2, 150, 120);         // 2 pitidos cortos
  } else {
    Serial.println("Resultado: REGISTRADO");
    estado = "REGISTRADO";
    ledVerde();
    pitidos(1, 200, 0);           // 1 pitido corto
  }

  // guardar en la base de datos (el LED y el buzzer ya dieron la confirmacion)
  bool guardado = enviarRegistro(uidComoTexto(), estado);

  // mantener el LED encendido al menos TIEMPO_LED
  while (millis() - inicio < TIEMPO_LED) {
    delay(10);
  }

  if (!guardado) {
    avisoErrorEnvio();
  }
  ledApagado();
  

  sensor.PICC_HaltA();
  sensor.PCD_StopCrypto1();

  Serial.println("Escanea una tarjeta...");
}
