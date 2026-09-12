import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, createReadStream } from 'fs';
import https from 'https';

/**
 * Helper to download WebAssembly binary from fallback remote URLs
 */
function downloadWasm(urls, destPaths) {
  return new Promise((resolvePromise) => {
    let index = 0;
    function tryNext() {
      if (index >= urls.length) {
        resolvePromise(null);
        return;
      }
      const url = urls[index++];
      try {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
          if (res.statusCode === 200) {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
              const buffer = Buffer.concat(chunks);
              // Verify wasm magic bytes \0asm (0x00, 0x61, 0x73, 0x6d)
              if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x61 && buffer[2] === 0x73 && buffer[3] === 0x3d) {
                for (const dest of destPaths) {
                  try {
                    mkdirSync(dirname(dest), { recursive: true });
                    writeFileSync(dest, buffer);
                  } catch (e) {}
                }
                resolvePromise(buffer);
                return;
              }
              tryNext();
            });
          } else {
            res.resume();
            tryNext();
          }
        });
        req.on('error', () => tryNext());
        req.on('timeout', () => { req.destroy(); tryNext(); });
      } catch (e) {
        tryNext();
      }
    }
    tryNext();
  });
}

export default defineConfig({
  root: '.',
  publicDir: resolve(__dirname, '../public'),
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [
        // 允许访问项目根目录及上层目录（包括上层的 public 资源目录）
        resolve(__dirname, '..')
      ]
    },
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
        server.middlewares.use(async (req, res, next) => {
          const pathname = (req.url || '').split('?')[0].split('#')[0];

          // 1. Handle ort-wasm requests (simd-threaded) specifically
          if (pathname.includes('ort-wasm-simd-threaded') || pathname.endsWith('.wasm')) {
            const inRoot = resolve(__dirname, '../public/ort-wasm-simd-threaded-CxTQ5xH-.wasm');
            const inAssets = resolve(__dirname, '../public/assets/ort-wasm-simd-threaded-CxTQ5xH-.wasm');
            const genericDiskPath = resolve(__dirname, '../public', pathname.replace(/^\//, ''));

            const foundPath = existsSync(inRoot)
              ? inRoot
              : existsSync(inAssets)
              ? inAssets
              : existsSync(genericDiskPath)
              ? genericDiskPath
              : null;

            if (foundPath) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/wasm');
              res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
              res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
              createReadStream(foundPath).pipe(res);
              return;
            }

            // If not on disk, try downloading on-demand from remote/CDN
            try {
              const buffer = await downloadWasm([
                'https://car-soccer.com/ort-wasm-simd-threaded-CxTQ5xH-.wasm',
                'https://car-soccer.com/assets/ort-wasm-simd-threaded-CxTQ5xH-.wasm',
                'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/ort-wasm-simd-threaded.wasm',
                'https://unpkg.com/onnxruntime-web@1.19.0/dist/ort-wasm-simd-threaded.wasm'
              ], [inRoot, inAssets]);

              if (buffer) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/wasm');
                res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
                res.end(buffer);
                return;
              }
            } catch (err) {}
          }

          // 2. Handle /custom/ static file requests from repository root
          if (pathname.startsWith('/custom/')) {
            const customDiskPath = resolve(__dirname, "..", pathname.replace(/^\//, ""));
            if (existsSync(customDiskPath)) {
              res.statusCode = 200;
              const ext = pathname.split(".").pop().toLowerCase();
              const mimeMap = {
                ogg: "audio/ogg",
                wav: "audio/wav",
                mp3: "audio/mpeg",
                json: "application/json",
                png: "image/png"
              };
              res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
              res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
              res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
              createReadStream(customDiskPath).pipe(res);
              return;
            } else {
              res.statusCode = 404;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.setHeader("X-Asset-Missing", "true");
              res.end(`[Custom Asset 404] The requested custom asset "${pathname}" was not found at: ${customDiskPath}.`);
              return;
            }
          }

          // 3. Guard any /assets/ or /images/ static file requests
          if (pathname.startsWith('/assets/') || pathname.startsWith('/images/')) {
            const diskPath = resolve(__dirname, '../public', pathname.replace(/^\//, ''));
            if (!existsSync(diskPath)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('X-Asset-Missing', 'true');
              res.end(`[Asset Missing 404] The requested asset "${pathname}" was not found on disk at: ${diskPath}.\nPlease verify that all assets listed in public/file_list.md are present or run public/parallel.py.`);
              return;
            }
          }
          next();
        });
      }
    }
  ]
});