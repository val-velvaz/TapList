// Credenciales de la semilla (SOLO PARA DESARROLLO Y PRUEBAS; ver README).
export const CORREO_ADMIN = 'admin.taplist@academicos.udg.mx';
export const CONTRASENA_ADMIN = 'Admin#TapList2026';
export const CORREO_DOCENTE = 'roberto.gomez@academicos.udg.mx';
export const CONTRASENA_DOCENTE = 'Docente#TapList2026';
// Cuenta con activo = false que crea tests/globalSetup.ts.
export const CORREO_INACTIVO = 'cuenta.inactiva@academicos.udg.mx';

// --- Dispositivos ---
// Dispositivo de la semilla (id 1, aula 101) y su clave de prueba (ver README).
export const ID_DISPOSITIVO = 1;
export const CLAVE_DISPOSITIVO = 'dev-esp32-aula101-SoloDesarrollo-2026';
// Dispositivo con estado 'Inactivo' que crea tests/globalSetup.ts (id 2).
export const ID_DISPOSITIVO_INACTIVO = 2;
export const CLAVE_DISPOSITIVO_INACTIVO = 'clave-de-prueba-dispositivo-inactivo';

// --- Credenciales NFC de la semilla (grupo D01: lunes 07:00, tolerancia 10) ---
export const UID_ANDREA = '04A1B2C3'; // matrícula 220000001
export const UID_BRUNO = '04D4E5F6'; // matrícula 220000002
export const UID_CARLA = '0411223344556A'; // matrícula 220000003
// Creadas por tests/globalSetup.ts en el grupo D01:
export const UID_CREDENCIAL_INACTIVA = 'AAAA0001'; // estudiante activo, credencial inactiva
export const UID_ESTUDIANTE_INACTIVO = 'AAAA0002'; // estudiante inactivo, credencial activa
