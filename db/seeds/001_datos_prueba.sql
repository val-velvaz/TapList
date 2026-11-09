-- =====================================================================
-- TapList · Semilla 001: datos de prueba (SOLO PARA DESARROLLO)
-- Las contraseñas van como hashes argon2id ya calculados; el texto plano
-- está documentado únicamente en el README.
-- Todos los nombres, correos, matrículas y UID son ficticios.
-- =====================================================================

BEGIN;

-- Usuarios: 1 Administrador y 2 Docentes
INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol) VALUES
  ('Laura',   'Méndez Ríos',    'admin.taplist@academicos.udg.mx',
   '$argon2id$v=19$m=19456,p=1,t=2$A8+b/Yo8VV4tTL8/nygMog$ip9GSRj52umzVP2ZEOoR6GZ0rOaMePRiPrsDKddtHOc', 'Administrador'),
  ('Roberto', 'Gómez Salazar',  'roberto.gomez@academicos.udg.mx',
   '$argon2id$v=19$m=19456,p=1,t=2$MbOLkmPyWMndiqxEPoOqBQ$grCdCkIt1Qfj/mvgM4NPbydVCmgqhscJlE40tukxICI', 'Docente'),
  ('Patricia','Hernández Luna', 'patricia.hernandez@academicos.udg.mx',
   '$argon2id$v=19$m=19456,p=1,t=2$YONrQZ5Zo9BeaJkW/iB+VA$/So3ONnlkqNPIAY95YNye77AdJGgDeBAgEj6Jk3mnEc', 'Docente');

-- Grupos
INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES
  ('D01', '5.º semestre', '2026-B'),
  ('D02', '7.º semestre', '2026-B');

-- Clases (dia_semana: 1 = lunes … 7 = domingo)
INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
SELECT g.id_grupo, u.id_usuario, c.materia, c.dia_semana, c.hora_inicio::time, c.tolerancia_min
FROM (VALUES
  ('D01', 'roberto.gomez@academicos.udg.mx',      'Ingeniería de Software', 1, '07:00', 10),
  ('D01', 'roberto.gomez@academicos.udg.mx',      'Bases de Datos',         3, '09:00', 10),
  ('D02', 'patricia.hernandez@academicos.udg.mx', 'Redes de Computadoras',  2, '11:00', 15)
) AS c (grupo, correo_docente, materia, dia_semana, hora_inicio, tolerancia_min)
JOIN grupo   g ON g.nombre = c.grupo AND g.ciclo_escolar = '2026-B'
JOIN usuario u ON u.correo = c.correo_docente;

-- Estudiantes
INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
SELECT e.matricula, e.nombre, e.apellidos, e.correo, g.id_grupo
FROM (VALUES
  ('220000001', 'Andrea',  'López Torres',    'andrea.lopez@alumnos.udg.mx',    'D01'),
  ('220000002', 'Bruno',   'Martínez Cruz',   'bruno.martinez@alumnos.udg.mx',  'D01'),
  ('220000003', 'Carla',   'Ramírez Ortega',  'carla.ramirez@alumnos.udg.mx',   'D01'),
  ('220000004', 'Diego',   'Sánchez Vega',    'diego.sanchez@alumnos.udg.mx',   'D02'),
  ('220000005', 'Elena',   'Flores Navarro',  'elena.flores@alumnos.udg.mx',    'D02')
) AS e (matricula, nombre, apellidos, correo, grupo)
JOIN grupo g ON g.nombre = e.grupo AND g.ciclo_escolar = '2026-B';

-- Credenciales NFC (UID en hexadecimal, 4 y 7 bytes)
INSERT INTO credencial_nfc (uid, id_estudiante)
SELECT c.uid, s.id_estudiante
FROM (VALUES
  ('04A1B2C3', '220000001'),
  ('04D4E5F6', '220000002'),
  ('0411223344556A', '220000003'),
  ('0477889900AABB', '220000004'),
  ('9F8E7D6C', '220000005')
) AS c (uid, matricula)
JOIN estudiante s ON s.matricula = c.matricula;

-- Dispositivo lector (la clave de prueba está en el README; migración 002)
INSERT INTO dispositivo (nombre_ubicacion, estado, clave_api_hash) VALUES
  ('Módulo X, aula 101', 'Activo',
   '$argon2id$v=19$m=19456,p=1,t=2$iok5VGWAkIMkmVy33MmcEg$Ked/9nRMmdwdmgYn+kHKWsMrJMjS1Jb4Jxkc3vN0CVk');

COMMIT;
