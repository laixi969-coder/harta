import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/js/openfind-app/',
  plugins: [react()],
  build: { outDir: '../../js/openfind-app', emptyOutDir: true, sourcemap: false },
});
