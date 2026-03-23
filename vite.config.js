import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  root: '.',
  base: '/Commission-Tracker/',
  define: {
    __APP_VERSION__: JSON.stringify(`${buildDate}.${commitHash}`)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 8080,
    host: '0.0.0.0'
  }
});
