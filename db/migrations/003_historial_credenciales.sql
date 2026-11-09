-- =====================================================================
-- TapList · Migración 003: historial de credenciales NFC
-- CAMBIO AL MODELO ENTIDAD-RELACIÓN: ESTUDIANTE–CREDENCIAL_NFC pasa de
-- 1:1 a 1:N con, a lo más, UNA credencial activa por estudiante.
--
-- Al reemplazar una credencial perdida o dañada, la anterior se conserva
-- con activa = false (y su fecha_asignacion) en lugar de sobrescribirse,
-- para no perder la trazabilidad. uid sigue siendo UNIQUE: una credencial
-- reemplazada no puede volver a vincularse a nadie.
-- =====================================================================

BEGIN;

ALTER TABLE credencial_nfc
  DROP CONSTRAINT uq_credencial_nfc_estudiante;

-- Como máximo una credencial activa por estudiante.
CREATE UNIQUE INDEX uq_credencial_nfc_estudiante_activa
  ON credencial_nfc (id_estudiante)
  WHERE activa;

-- El UNIQUE anterior también servía de índice para la FK; el parcial solo
-- cubre las activas, así que la FK necesita su propio índice.
CREATE INDEX idx_credencial_nfc_id_estudiante
  ON credencial_nfc (id_estudiante);

-- Búsqueda de estudiantes sin distinguir acentos ('Lopez' encuentra 'López').
-- unaccent es una extensión estándar de PostgreSQL (contrib) y es "trusted":
-- no requiere superusuario. No es una tabla, así que no cambia el diagrama.
CREATE EXTENSION IF NOT EXISTS unaccent;

COMMIT;
