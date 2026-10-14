/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const isProfiling = process.env.VITE_PROFILE === 'true';

const REACT_PKGS = new Set(['react', 'react-dom', 'scheduler', 'lucide-react', 'react-resizable-panels']);
const MATH_PKGS = new Set([
  'mathjs', 'decimal.js', 'complex.js', 'fraction.js', 'typed-function',
  'javascript-natural-sort', 'escape-latex', 'seedrandom', 'tiny-emitter',
]);

/** Package name for a module id, using the LAST node_modules/ segment; null if not in node_modules. */
function getPackageName(id: string): string | null {
  const norm = id.split('?')[0].replace(/\\/g, '/');
  const marker = 'node_modules/';
  const i = norm.lastIndexOf(marker);
  if (i === -1) return null;
  const parts = norm.slice(i + marker.length).split('/');
  if (!parts[0]) return null;
  return parts[0].startsWith('@') ? (parts[1] ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      ...(isProfiling
        ? [
            { find: /^react-dom\/client$/, replacement: 'react-dom/profiling' },
            { find: /^react-dom$/, replacement: 'react-dom/profiling' },
          ]
        : []),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Manual chunks are only for libraries that are already loaded at startup.
        // Assigning a lazily imported library (plotly, three, xlsx, jspdf, ...) to a
        // manual chunk makes it eager, so those return undefined and Rollup chunks them.
        manualChunks(id) {
          const pkg = getPackageName(id);
          if (!pkg) return undefined;
          if (REACT_PKGS.has(pkg) || pkg.startsWith('@radix-ui/')) return 'vendor-react';
          if (pkg.startsWith('@xyflow/') || pkg === 'zustand') return 'vendor-flow';
          if (pkg.startsWith('d3-') || pkg === 'recharts' || pkg === 'victory-vendor') return 'vendor-charts';
          if (MATH_PKGS.has(pkg)) return 'vendor-math';
          return undefined;
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
