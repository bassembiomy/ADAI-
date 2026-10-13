import { test, expect } from '@playwright/test';

const cases = [
  { type: 'scatter', x: [0, 1, 2], y: [1, 3, 2], mode: 'lines+markers' },
  { type: 'bar', x: ['A', 'B', 'C'], y: [1, 3, 2] },
  { type: 'histogram', x: [0, 0, 1, 1, 1, 2], xbins: { start: -0.5, end: 2.5, size: 1 } },
  { type: 'contour', z: [[0, 1, 2], [1, 4, 1], [2, 1, 0]], showscale: false },
  { type: 'surface', z: [[0, 1, 2], [1, 4, 1], [2, 1, 0]], showscale: false },
  { type: 'scatter3d', x: [0, 1, 2], y: [1, 3, 2], z: [2, 0, 3], mode: 'lines+markers' },
];

// Intentionally exercise the app's lazy React wrapper, not a separately created
// Plotly instance. Vite's transformed imports give us the same optimized modules
// (including dependency aliases) without hard-coding its cache filenames/hashes.
test.describe('Map-free Plotly real rendering and static export', () => {
  for (const trace of cases) {
    test(`${trace.type} renders and exports nonempty chart pixels`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await expect(page).toHaveTitle(/ADIA/);
      await expect(page.locator('#root > *').first()).toBeVisible();

      const result = await page.evaluate(async (data) => {
        const wrapperUrl = '/src/components/doe/PlotlyRenderer.tsx';
        const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/src/"]');
        if (!entry) throw new Error('App module entry not found');
        const readModule = async (url: string) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Vite module failed: ${url} (${response.status})`);
          return response.text();
        };
        const [wrapperSource, entrySource] = await Promise.all([
          readModule(wrapperUrl), readModule(entry.src),
        ]);
        const imports = (source: string) => Array.from(
          source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g), match => match[1],
        );
        const reactUrl = imports(wrapperSource).find(url => /\/react\.js(?:\?|$)/.test(url));
        const domUrl = imports(entrySource).find(url => /react-dom_client/.test(url));
        const is3d = ['surface', 'scatter3d'].includes(data.type);
        const plotlyUrl = imports(wrapperSource).find(url =>
          /plotly/.test(url) && !/react.plotly/.test(url) && /gl3d/.test(url) === is3d);
        if (!reactUrl || !domUrl || !plotlyUrl) {
          throw new Error('Cannot resolve real Vite React/Plotly modules from app sources');
        }
        const [reactModule, domModule, wrapper, plotlyModule] = await Promise.all([
          import(reactUrl), import(domUrl), import(wrapperUrl), import(plotlyUrl),
        ]);
        const React = reactModule.default;
        const Plotly = plotlyModule.default;
        const host = document.createElement('div');
        host.id = 'dependency-plotly-harness';
        Object.assign(host.style, {
          position: 'fixed', inset: '0', zIndex: '2147483647', background: 'white',
        });
        document.body.append(host);
        const createRoot = domModule.default?.createRoot ?? domModule.createRoot;
        const root = createRoot(host);
        let graph: any;
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`No ${data.type} initialization callback`)), 30_000);
            root.render(React.createElement(wrapper.default, {
              data: [data],
              layout: {
                width: 640, height: 480, showlegend: false,
                paper_bgcolor: 'white', plot_bgcolor: 'white',
                margin: { l: 50, r: 30, t: 30, b: 50 },
              },
              config: { displayModeBar: false, responsive: false },
              onInitialized: (_figure: unknown, gd: unknown) => {
                clearTimeout(timer); graph = gd; resolve();
              },
              onError: (error: Error) => { clearTimeout(timer); reject(error); },
            }));
          });
          // Plotly silently coerces unsupported trace types to scatter: checking
          // _fullData catches missing bundle registrations, not just blank divs.
          const fullType = graph._fullData[0].type;
          const selector = data.type === 'scatter' ? '.scatterlayer .point'
            : ['bar', 'histogram'].includes(data.type) ? '.barlayer .point path'
              : data.type === 'contour' ? '.contourlayer path' : '.gl-container canvas';
          const marks = graph.querySelectorAll(selector).length;
          const png = await Plotly.toImage(graph, { format: 'png', width: 640, height: 480 });
          const img = new Image();
          img.src = png;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          // Colored pixels inside the plot exclude white background, gray axes,
          // and text. This also detects WebGL charts exporting an empty canvas.
          const pixels = ctx.getImageData(60, 40, 540, 380).data;
          let coloredPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
            if (pixels[i + 3] > 200 && Math.max(...rgb) - Math.min(...rgb) > 35) coloredPixels++;
          }
          return { fullType, marks, width: img.naturalWidth, height: img.naturalHeight,
            png: png.startsWith('data:image/png;base64,'), coloredPixels };
        } finally {
          root.unmount();
          host.remove();
        }
      }, trace);

      expect(result.fullType).toBe(trace.type);
      expect(result.marks, 'Real SVG marks or WebGL canvas must exist').toBeGreaterThan(0);
      expect(result.png).toBe(true);
      expect([result.width, result.height]).toEqual([640, 480]);
      expect(result.coloredPixels, 'Export must contain colored chart geometry').toBeGreaterThan(100);
      expect(errors, 'No uncaught app or chart exceptions').toEqual([]);
    });
  }
});
