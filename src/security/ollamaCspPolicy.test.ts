import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

describe('Electron Ollama network policy', () => {
  it('allows the loopback Ollama API in connect-src', () => {
    const connectSource = mainSource.match(/`connect-src[^`]+`/)?.[0] || '';
    expect(connectSource).toContain('http://127.0.0.1:11434');
    expect(connectSource).toContain('http://localhost:11434');
  });
});
