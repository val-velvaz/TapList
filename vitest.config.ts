import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      // Secreto aleatorio por corrida: las pruebas no dependen del JWT_SECRET del .env.
      JWT_SECRET: randomBytes(48).toString('base64'),
    },
    // Las pruebas comparten la base y los limitadores en memoria.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
