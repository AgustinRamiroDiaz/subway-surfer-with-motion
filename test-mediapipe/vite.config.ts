/**
 * Adapted from google-ai-edge/mediapipe-samples-web for this standalone
 * Gesture Recognizer profiling fixture.
 */
import { defineConfig } from 'vite';
import { copyWasmFiles } from './copy-wasm.js';

export default defineConfig({
  base: '/',
  plugins: [{
    name: 'copy-mediapipe-wasm',
    buildStart() {
      copyWasmFiles();
    },
    configureServer() {
      copyWasmFiles();
    },
  }],
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  worker: { format: 'es' },
  build: { sourcemap: false },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
});
