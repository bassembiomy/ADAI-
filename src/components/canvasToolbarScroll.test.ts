import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Canvas Toolbar Scroll Configuration in App.tsx', () => {
  it('includes max-w, overflow-x-auto, adia-toolbar-scrollbar, and onWheel', () => {
    const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    
    expect(appContent).toContain('adia-toolbar-scrollbar');
    expect(appContent).toContain('handleHorizontalToolbarWheel');
    expect(appContent).toMatch(/max-w-\[calc\(100%-1\.5rem\)\]/);
    expect(appContent).toMatch(/overflow-x-auto/);
  });
});
