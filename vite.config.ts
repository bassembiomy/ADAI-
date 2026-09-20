/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

/**
 * Serves the offline engineering knowledge base as static resources at
 * /engineering-patterns/* for the plain-browser runtime (dev server and e2e
 * Chromium, where the Electron preload bridge is unavailable). Traversal is
 * blocked: only files that resolve inside the knowledge directory are served.
 */
function engineeringPatternsStatic() {
  const baseDir = path.resolve(__dirname, 'resources', 'engineering-patterns');
  return {
    name: 'engineering-patterns-static',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: { url?: string }, res: { setHeader?: (k: string, v: string) => void; statusCode?: number; end: (b?: unknown) => void }, next: () => void) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/engineering-patterns/')) {
          next();
          return;
        }
        const rel = decodeURIComponent(url.slice('/engineering-patterns/'.length));
        const target = path.resolve(baseDir, '.' + path.sep + rel.split('/').filter(Boolean).join(path.sep));
        if (target !== baseDir && !target.startsWith(baseDir + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (res.setHeader) res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(target));
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), engineeringPatternsStatic()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/.agents/**', '**/tests/e2e/**', '**/.kilo/**'],
  },
});
