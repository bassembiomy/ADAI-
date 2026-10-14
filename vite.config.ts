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
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('plotly.js') || id.includes('recharts') || id.includes('gsap')) {
              return 'vendor-viz';
            }
            if (id.includes('@xyflow')) {
              return 'vendor-flow';
            }
            if (id.includes('mathjs')) {
              return 'vendor-math';
            }
            if (id.includes('xlsx') || id.includes('jspdf') || id.includes('docx') || id.includes('jszip') || id.includes('html2canvas')) {
              return 'vendor-docs';
            }
            if (id.includes('react') || id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-react';
            }
          }
        },
      },
    },
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
