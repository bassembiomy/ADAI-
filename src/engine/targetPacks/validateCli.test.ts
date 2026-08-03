import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, '..', '..', '..', 'scripts', 'validate_target_pack.ts');
const fixture = resolve(__dirname, '__fixtures__', 'valid-pack');

describe('validate_target_pack CLI', () => {
  it('exits 0 for the valid fixture', () => {
    const output = execSync(`npx tsx "${script}" "${fixture}"`, { encoding: 'utf8' });
    expect(output).toContain('VALID');
  });
});
