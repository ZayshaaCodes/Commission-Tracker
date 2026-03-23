import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/Commission-Tracker/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 8080,
    host: '0.0.0.0'
  }
});
