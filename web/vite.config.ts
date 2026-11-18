import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// La cookie de sesión es httpOnly y SameSite=Strict, así que la web tiene que
// estar en el mismo origen que la API. En desarrollo, Vite reenvía /api al
// servidor de la API; en producción, Express sirve la web y la API juntas.
const API_DESARROLLO = process.env.TAPLIST_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_DESARROLLO, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/pruebas/preparar.ts'],
    restoreMocks: true,
  },
});
