/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const isProfiling = process.env.VITE_PROFILE === 'true';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      ...(isProfiling
        ? [
            { find: /^react-dom\/client$/, replacement: 'react-dom/profiling' },
            { find: /^react-dom$/, replacement: 'react-dom/profiling' },
            { find: 'scheduler/tracing', replacement: 'scheduler/tracing-profiling' },
          ]
        : []),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    port: 3000,
    host: true,
    // Arena's proxied live-preview host is a subdomain of e2b.app.
    allowedHosts: ['.e2b.app'],
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/.agents/**', '**/tests/e2e/**', '**/.kilo/**'],
  },
});
