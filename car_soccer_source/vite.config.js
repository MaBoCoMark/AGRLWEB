import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  plugins: [
    {
      name: 'vite-external-fallback',
      resolveId(id) {
        if (id.includes('__vite-browser-external') || id.includes('module.no-external')) {
          return '\0' + id;
        }
      },
      load(id) {
        if (id.includes('__vite-browser-external')) {
          return 'export const createRequire = () => () => ({ readFileSync: () => new Uint8Array() }); export default { createRequire };';
        }
        if (id.includes('module.no-external')) {
          return 'export default { init: () => {} };';
        }
      }
    }
  ]
});
