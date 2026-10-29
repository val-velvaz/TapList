-- =====================================================================
-- TapList · Migración 001: esquema inicial
-- Fuente de verdad: modelo entidad-relación (SoftProduct, CUCEI).
-- Reglas generales:
--   * Nombres en español y snake_case, igual que en la documentación.
--   * Toda FK usa ON DELETE RESTRICT: nada se borra en cascada para
--     conservar el historial de asistencias. Las bajas son lógicas.
--   * Todas las tablas llevan created_at / updated_at.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------

-- Mantiene updated_at al día en cada UPDATE.
CREATE FUNCTION fn_actualizar_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Verifica que la FK hacia USUARIO indicada en TG_ARGV[0] apunte a un
-- usuario con el rol TG_ARGV[1]. Un CHECK no puede consultar otra tabla,
-- por eso se valida con trigger.
--   Ej.: CLASE.id_docente debe ser 'Docente'.
CREATE FUNCTION fn_validar_rol_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_columna      text := TG_ARGV[0];
  v_rol_esperado text := TG_ARGV[1];
  v_id_usuario   integer := (to_jsonb(NEW) ->> v_columna)::integer;
  v_rol_real     text;
BEGIN
  SELECT rol INTO v_rol_real FROM usuario WHERE id_usuario = v_id_usuario;
  -- Si el usuario no existe, la FK reportará el error.
  IF v_rol_real IS NOT NULL AND v_rol_real <> v_rol_esperado THEN
    RAISE EXCEPTION '%.% debe referenciar a un usuario con rol %, pero el usuario % tiene rol %',
      TG_TABLE_NAME, v_columna, v_rol_esperado, v_id_usuario, v_rol_real
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- USUARIO: cuentas de acceso a la web (Docente / Administrador)
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id_usuario      integer      GENERATED ALWAYS AS IDENTITY,
  nombre          varchar(100) NOT NULL,
  apellidos       varchar(150) NOT NULL,
  correo          varchar(254) NOT NULL,
  contrasena_hash varchar(255) NOT NULL,
  rol             varchar(20)  NOT NULL,
  activo          boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_usuario PRIMARY KEY (id_usuario),
  CONSTRAINT uq_usuario_correo UNIQUE (correo),
  -- El correo se guarda en minúsculas; junto con el UNIQUE evita que
  -- "Ana@..." y "ana@..." sean dos cuentas distintas.
  CONSTRAINT ck_usuario_correo_minusculas CHECK (correo = lower(correo)),
  CONSTRAINT ck_usuario_rol CHECK (rol IN ('Docente', 'Administrador'))
);

-- ---------------------------------------------------------------------
-- GRUPO
-- ---------------------------------------------------------------------
CREATE TABLE grupo (
  id_grupo      integer     GENERATED ALWAYS AS IDENTITY,
  nombre        varchar(50) NOT NULL,
  nivel_grado   varchar(50) NOT NULL,
  ciclo_escolar varchar(10) NOT NULL,   -- p. ej. '2026-B'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_grupo PRIMARY KEY (id_grupo)
);

-- ---------------------------------------------------------------------
-- CLASE: materia que un docente imparte a un grupo en un horario
--   USUARIO (Docente) 1—N CLASE «imparte»
--   GRUPO 1—N CLASE «organiza»
-- ---------------------------------------------------------------------
CREATE TABLE clase (
  id_clase       integer      GENERATED ALWAYS AS IDENTITY,
  id_grupo       integer      NOT NULL,
  id_docente     integer      NOT NULL,
  materia        varchar(100) NOT NULL,
  dia_semana     smallint     NOT NULL,   -- 1 = lunes … 7 = domingo (ISO 8601)
  hora_inicio    time         NOT NULL,
  tolerancia_min smallint     NOT NULL DEFAULT 10,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_clase PRIMARY KEY (id_clase),
  CONSTRAINT fk_clase_grupo FOREIGN KEY (id_grupo)
    REFERENCES grupo (id_grupo) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_clase_docente FOREIGN KEY (id_docente)
    REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_clase_dia_semana CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT ck_clase_tolerancia CHECK (tolerancia_min >= 0)
);

-- ---------------------------------------------------------------------
-- ESTUDIANTE (baja lógica con activo = false; nunca se borra la fila)
--   GRUPO 1—N ESTUDIANTE «inscribe»
-- ---------------------------------------------------------------------
CREATE TABLE estudiante (
  id_estudiante integer      GENERATED ALWAYS AS IDENTITY,
  matricula     varchar(20)  NOT NULL,
  nombre        varchar(100) NOT NULL,
  apellidos     varchar(150) NOT NULL,
  correo        varchar(254) NOT NULL,
  id_grupo      integer      NOT NULL,
  activo        boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_estudiante PRIMARY KEY (id_estudiante),
  CONSTRAINT uq_estudiante_matricula UNIQUE (matricula),
  CONSTRAINT fk_estudiante_grupo FOREIGN KEY (id_grupo)
    REFERENCES grupo (id_grupo) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ---------------------------------------------------------------------
-- CREDENCIAL_NFC
--   ESTUDIANTE 1—1 CREDENCIAL_NFC «posee» (id_estudiante es UNIQUE)
-- ---------------------------------------------------------------------
CREATE TABLE credencial_nfc (
  id_credencial    integer     GENERATED ALWAYS AS IDENTITY,
  uid              varchar(32) NOT NULL,
  id_estudiante    integer     NOT NULL,
  activa           boolean     NOT NULL DEFAULT true,
  fecha_asignacion timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_credencial_nfc PRIMARY KEY (id_credencial),
  CONSTRAINT uq_credencial_nfc_uid UNIQUE (uid),
  CONSTRAINT uq_credencial_nfc_estudiante UNIQUE (id_estudiante),
  CONSTRAINT fk_credencial_nfc_estudiante FOREIGN KEY (id_estudiante)
    REFERENCES estudiante (id_estudiante) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- UID en hexadecimal en mayúsculas, sin separadores (4, 7 o 10 bytes).
  CONSTRAINT ck_credencial_nfc_uid CHECK (uid ~ '^[0-9A-F]{8,20}$')
);

-- ---------------------------------------------------------------------
-- DISPOSITIVO: lectores NFC (ESP32) instalados
-- ---------------------------------------------------------------------
CREATE TABLE dispositivo (
  id_dispositivo   integer      GENERATED ALWAYS AS IDENTITY,
  nombre_ubicacion varchar(100) NOT NULL,
  estado           varchar(20)  NOT NULL DEFAULT 'Activo',
  ultima_conexion  timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_dispositivo PRIMARY KEY (id_dispositivo),
  CONSTRAINT ck_dispositivo_estado CHECK (estado IN ('Activo', 'Inactivo', 'Mantenimiento'))
);

-- ---------------------------------------------------------------------
-- ASISTENCIA: una fila por lectura válida
--   ESTUDIANTE 1—N ASISTENCIA «registra»
--   CLASE 1—N ASISTENCIA «corresponde a»
--   DISPOSITIVO 1—N ASISTENCIA «capta»
-- ---------------------------------------------------------------------
CREATE TABLE asistencia (
  id_asistencia  integer     GENERATED ALWAYS AS IDENTITY,
  id_estudiante  integer     NOT NULL,
  id_clase       integer     NOT NULL,
  id_dispositivo integer     NOT NULL,
  fecha          date        NOT NULL,
  hora           time        NOT NULL,
  estado         varchar(20) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_asistencia PRIMARY KEY (id_asistencia),
  CONSTRAINT fk_asistencia_estudiante FOREIGN KEY (id_estudiante)
    REFERENCES estudiante (id_estudiante) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_asistencia_clase FOREIGN KEY (id_clase)
    REFERENCES clase (id_clase) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_asistencia_dispositivo FOREIGN KEY (id_dispositivo)
    REFERENCES dispositivo (id_dispositivo) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_asistencia_estado CHECK (estado IN ('Asistencia', 'Retardo')),
  -- Un estudiante registra como máximo una asistencia por clase al día.
  CONSTRAINT uq_asistencia_estudiante_clase_fecha UNIQUE (id_estudiante, id_clase, fecha)
);

-- ---------------------------------------------------------------------
-- BITACORA: auditoría de acciones del Administrador (RNF-03)
--   USUARIO (Administrador) 1—N BITACORA «genera»
-- ---------------------------------------------------------------------
CREATE TABLE bitacora (
  id_bitacora      integer      GENERATED ALWAYS AS IDENTITY,
  id_usuario       integer      NOT NULL,
  accion           varchar(50)  NOT NULL,
  entidad_afectada varchar(100) NOT NULL,
  fecha_hora       timestamptz  NOT NULL DEFAULT now(),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_bitacora PRIMARY KEY (id_bitacora),
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ---------------------------------------------------------------------
-- Índices
-- Las FK que ya son la primera columna de un UNIQUE no necesitan índice
-- propio: credencial_nfc.id_estudiante y asistencia.id_estudiante.
-- asistencia.id_clase queda cubierta por (id_clase, fecha).
-- ---------------------------------------------------------------------
CREATE INDEX idx_clase_id_grupo           ON clase (id_grupo);
CREATE INDEX idx_clase_id_docente         ON clase (id_docente);
CREATE INDEX idx_estudiante_id_grupo      ON estudiante (id_grupo);
CREATE INDEX idx_asistencia_id_clase_fecha ON asistencia (id_clase, fecha);  -- reportes y estadísticas
CREATE INDEX idx_asistencia_id_dispositivo ON asistencia (id_dispositivo);
CREATE INDEX idx_bitacora_id_usuario      ON bitacora (id_usuario);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_usuario_updated_at        BEFORE UPDATE ON usuario        FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_grupo_updated_at          BEFORE UPDATE ON grupo          FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_clase_updated_at          BEFORE UPDATE ON clase          FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_estudiante_updated_at     BEFORE UPDATE ON estudiante     FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_credencial_nfc_updated_at BEFORE UPDATE ON credencial_nfc FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_dispositivo_updated_at    BEFORE UPDATE ON dispositivo    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
CREATE TRIGGER trg_asistencia_updated_at     BEFORE UPDATE ON asistencia     FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
-- bitacora no lleva trigger de updated_at: es inmutable (ver abajo).

-- CLASE.id_docente solo puede ser un Docente.
CREATE TRIGGER trg_clase_validar_docente
  BEFORE INSERT OR UPDATE OF id_docente ON clase
  FOR EACH ROW EXECUTE FUNCTION fn_validar_rol_usuario('id_docente', 'Docente');

-- BITACORA.id_usuario solo puede ser un Administrador.
CREATE TRIGGER trg_bitacora_validar_administrador
  BEFORE INSERT OR UPDATE OF id_usuario ON bitacora
  FOR EACH ROW EXECUTE FUNCTION fn_validar_rol_usuario('id_usuario', 'Administrador');

-- Impide cambiar el rol de un usuario si eso rompe las reglas anteriores
-- (p. ej., convertir en Administrador a un docente que tiene clases).
CREATE FUNCTION fn_validar_cambio_rol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rol <> 'Docente' AND EXISTS (SELECT 1 FROM clase WHERE id_docente = NEW.id_usuario) THEN
    RAISE EXCEPTION 'El usuario % tiene clases asignadas; no puede dejar de ser Docente', NEW.id_usuario
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.rol <> 'Administrador' AND EXISTS (SELECT 1 FROM bitacora WHERE id_usuario = NEW.id_usuario) THEN
    RAISE EXCEPTION 'El usuario % tiene registros en la bitácora; no puede dejar de ser Administrador', NEW.id_usuario
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_validar_cambio_rol
  BEFORE UPDATE OF rol ON usuario
  FOR EACH ROW WHEN (OLD.rol IS DISTINCT FROM NEW.rol)
  EXECUTE FUNCTION fn_validar_cambio_rol();

-- La bitácora es de solo inserción: no se modifica ni se borra (RNF-03).
CREATE FUNCTION fn_bitacora_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es de solo inserción; no se permite %', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_bitacora_inmutable
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION fn_bitacora_inmutable();

COMMIT;
