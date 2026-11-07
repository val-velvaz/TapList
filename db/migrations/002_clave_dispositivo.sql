-- =====================================================================
-- TapList · Migración 002: clave de API de los dispositivos
-- CAMBIO AL MODELO ENTIDAD-RELACIÓN: agrega DISPOSITIVO.clave_api_hash.
-- Cada lector (ESP32) se autentica con su id y una clave secreta; aquí
-- solo se guarda el hash argon2id de esa clave, nunca la clave en claro.
-- =====================================================================

BEGIN;

ALTER TABLE dispositivo
  ADD COLUMN clave_api_hash varchar(255);

-- Obligatoria para los dispositivos nuevos o modificados. NOT VALID hace que
-- PostgreSQL no revise las filas que ya existían antes de esta migración;
-- esas quedan sin clave (y sin poder autenticarse) hasta que se les asigne
-- una con: npm run dispositivo:clave -- <id_dispositivo>
ALTER TABLE dispositivo
  ADD CONSTRAINT ck_dispositivo_clave_api_hash CHECK (clave_api_hash IS NOT NULL) NOT VALID;

COMMIT;
