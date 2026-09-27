import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/theme-contract.css', 'utf8');

describe('theme contract', () => {
  it.each(['surface-canvas', 'surface-panel', 'surface-raised', 'surface-terminal', 'text-primary', 'text-secondary', 'border-default', 'focus-ring', 'diagram-grid', 'diagram-node'])('defines %s in both themes', token => {
    expect((css.match(new RegExp(`--${token}:`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('provides a visible keyboard focus rule', () => {
    expect(css).toMatch(/:focus-visible[\s\S]*outline:\s*2px/);
  });
  it('enforces literal color lint across migrated workspace files', () => {
    const { execSync } = require('node:child_process');
    expect(() => execSync('node scripts/check_theme_literals.cjs', { stdio: 'pipe' })).not.toThrow();
  });
});
