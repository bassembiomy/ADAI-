import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateMISRACCode } from '../src/utils/stateMachineCodeGenerator';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outDir = join(__dirname, '..', 'scratch', 'routing_probe_verify');
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true });
}
mkdirSync(outDir, { recursive: true });

const jsonPath = 'C:/Users/EL-Dawlia/Downloads/delay/New folder/statemachine-xbridges-master-batch2b-routing-probe.json';
const rawJson = readFileSync(jsonPath, 'utf-8');
const model = JSON.parse(rawJson);

const result = generateMISRACCode(model);
console.log('Generation errors:', result.errors.length);
if (result.errors.length > 0) {
  console.log(result.errors);
}
console.log('Generation warnings:', result.warnings.length);

const cFiles = result.files.filter((f) => f.name.endsWith('.c') || f.name.endsWith('.h'));
for (const file of cFiles) {
  writeFileSync(join(outDir, file.name), file.content);
}

// Try to compile the core runtime files the same way the test suite does.
const compiler = process.env.CC || 'gcc';
const cFilesToCompile = readdirSync(outDir).filter((name) => name.endsWith('.c'));
const flags = [
  '-std=c99',
  '-pedantic-errors',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-I.',
  '-fsyntax-only',
  ...cFilesToCompile,
];
console.log(`\nRunning: ${compiler} ${flags.join(' ')}`);
try {
  const output = execFileSync(compiler, flags, { cwd: outDir, encoding: 'utf8', stdio: 'pipe' });
  console.log(output || 'Compile succeeded with no output');
} catch (err: any) {
  console.error('Compile failed');
  console.error(err.stdout || '');
  console.error(err.stderr || '');
  process.exitCode = 1;
}

console.log(`\nGenerated files written to: ${outDir}`);
