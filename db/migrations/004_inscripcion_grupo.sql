-- =====================================================================
-- TapList · Migración 004: historial de inscripción a grupos
-- CAMBIO AL MODELO ENTIDAD-RELACIÓN: nueva entidad INSCRIPCION_GRUPO.
--   ESTUDIANTE 1—N INSCRIPCION_GRUPO N—1 GRUPO
--
-- Guarda desde cuándo y hasta cuándo perteneció cada estudiante a cada
-- grupo, para que las estadísticas no cuenten faltas en días en que el
-- estudiante no estaba inscrito (alta, baja o cambio de grupo a mitad del
-- periodo). estudiante.id_grupo sigue siendo el grupo ACTUAL.
--
-- Las fechas son del día de la escuela: la aplicación y db:setup abren cada
-- sesión con timezone = ZONA_HORARIA_ESCUELA, así que current_date y ::date
-- usan esa zona.
-- =====================================================================

BEGIN;

CREATE TABLE inscripcion_grupo (
  id_inscripcion integer     GENERATED ALWAYS AS IDENTITY,
  id_estudiante  integer     NOT NULL,
  id_grupo       integer     NOT NULL,
  desde          date        NOT NULL,
  hasta          date,       -- NULL: inscripción vigente
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_inscripcion_grupo PRIMARY KEY (id_inscripcion),
  CONSTRAINT fk_inscripcion_grupo_estudiante FOREIGN KEY (id_estudiante)
    REFERENCES estudiante (id_estudiante) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inscripcion_grupo_grupo FOREIGN KEY (id_grupo)
    REFERENCES grupo (id_grupo) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_inscripcion_grupo_fechas CHECK (hasta IS NULL OR hasta >= desde)
);

-- Como máximo una inscripción vigente por estudiante.
CREATE UNIQUE INDEX uq_inscripcion_grupo_vigente ON inscripcion_grupo (id_estudiante) WHERE hasta IS NULL;
CREATE INDEX idx_inscripcion_grupo_id_estudiante ON inscripcion_grupo (id_estudiante);
-- Consulta de las estadísticas: quiénes estaban en un grupo en cierta fecha.
CREATE INDEX idx_inscripcion_grupo_grupo_desde ON inscripcion_grupo (id_grupo, desde);

CREATE TRIGGER trg_inscripcion_grupo_updated_at
  BEFORE UPDATE ON inscripcion_grupo
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();

-- ---------------------------------------------------------------------
-- Datos existentes: una inscripción por estudiante, desde su alta
-- (created_at) y, si está dado de baja, hasta la fecha de su BAJA_ESTUDIANTE
-- en la bitácora (o su updated_at si no hay entrada).
-- ---------------------------------------------------------------------
INSERT INTO inscripcion_grupo (id_estudiante, id_grupo, desde, hasta)
SELECT e.id_estudiante,
       e.id_grupo,
       e.created_at::date,
       CASE WHEN e.activo THEN NULL
            ELSE greatest(e.created_at::date, coalesce(baja.fecha, e.updated_at::date)) END
  FROM estudiante e
  LEFT JOIN LATERAL (
    SELECT max(b.fecha_hora)::date AS fecha
      FROM bitacora b
     WHERE b.accion = 'BAJA_ESTUDIANTE'
       AND (b.entidad_afectada = 'estudiante#' || e.id_estudiante
            OR b.entidad_afectada LIKE 'estudiante#' || e.id_estudiante || ' (%')
  ) baja ON true;

-- ---------------------------------------------------------------------
-- Triggers: la tabla se mantiene sola con cualquier alta, baja o cambio de
-- grupo, ya sea desde la API o directo en SQL.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_inscripcion_al_dar_alta() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.activo THEN
    INSERT INTO inscripcion_grupo (id_estudiante, id_grupo, desde)
    VALUES (NEW.id_estudiante, NEW.id_grupo, current_date);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_estudiante_inscripcion_alta
  AFTER INSERT ON estudiante
  FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_al_dar_alta();

CREATE FUNCTION fn_inscripcion_al_actualizar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Baja o cambio de grupo de un estudiante activo: se cierra la vigente.
  IF OLD.activo AND (NOT NEW.activo OR OLD.id_grupo <> NEW.id_grupo) THEN
    UPDATE inscripcion_grupo SET hasta = current_date
     WHERE id_estudiante = NEW.id_estudiante AND hasta IS NULL;
  END IF;
  -- Cambio de grupo o reactivación: se abre una nueva.
  IF NEW.activo AND (NOT OLD.activo OR OLD.id_grupo <> NEW.id_grupo) THEN
    INSERT INTO inscripcion_grupo (id_estudiante, id_grupo, desde)
    VALUES (NEW.id_estudiante, NEW.id_grupo, current_date);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_estudiante_inscripcion_cambio
  AFTER UPDATE OF id_grupo, activo ON estudiante
  FOR EACH ROW
  WHEN (OLD.id_grupo IS DISTINCT FROM NEW.id_grupo OR OLD.activo IS DISTINCT FROM NEW.activo)
  EXECUTE FUNCTION fn_inscripcion_al_actualizar();

COMMIT;
