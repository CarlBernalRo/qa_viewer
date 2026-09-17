/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // "source" hace que @rastro/shared se lea desde su código TS, sin compilarlo antes.
    conditions: ['source', ...defaultClientConditions],
  },
  clearScreen: false,
  envPrefix: ['VITE_'],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    // Vitest resuelve como servidor: se apunta al código fuente del paquete compartido.
    alias: {
      '@rastro/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
