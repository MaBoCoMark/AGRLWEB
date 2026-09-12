import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

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
    },
    {
      name: 'static-assets-guard',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const pathname = (req.url || '').split('?')[0].split('#')[0];

          // Route root-level ort-wasm request to assets folder if present
          if (pathname === '/ort-wasm-simd-threaded-CxTQ5xH-.wasm') {
            const inAssets = resolve(__dirname, 'public/assets/ort-wasm-simd-threaded-CxTQ5xH-.wasm');
            if (existsSync(inAssets)) {
              req.url = '/assets/ort-wasm-simd-threaded-CxTQ5xH-.wasm';
              return next();
            }
          }

          // Guard any /assets/, /images/, or .wasm static file requests
          if (pathname.startsWith('/assets/') || pathname.startsWith('/images/') || pathname.endsWith('.wasm')) {
            const diskPath = resolve(__dirname, 'public', pathname.replace(/^\//, ''));
            if (!existsSync(diskPath)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', pathname.endsWith('.wasm') ? 'text/plain; charset=utf-8' : 'text/plain; charset=utf-8');
              res.setHeader('X-Asset-Missing', 'true');
              res.end(`[Asset Missing 404] The requested asset "${pathname}" was not found on disk at: ${diskPath}.\nPlease verify that all assets listed in file_list.md are present or run tools/parallel.py.`);
              return;
            }
          }
          next();
        });
      }
    }
  ]
});
