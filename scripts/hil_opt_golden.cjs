#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { configureToolchainPaths, isToolchainLocallyInstalled, resolveToolExecutable } = require('../src/security/toolchainManager.cjs');
const { parseMemoryUsage } = require('../src/security/elfInspector.cjs');

const toolchainsDir = path.join(process.cwd(), 'toolchains');
configureToolchainPaths(toolchainsDir);

async function runOptTest() {
  console.log('\n======================================================');
  console.log('  ADIA HIL Compiler Optimization (-Os) Golden Test');
  console.log('======================================================\n');

  if (!isToolchainLocallyInstalled('STM32', toolchainsDir)) {
    console.log('[SKIP] STM32 toolchain is not locally installed. Skipping opt golden test.');
    process.exit(0);
  }

  const armGcc = resolveToolExecutable('arm-none-eabi-gcc', toolchainsDir) || 'arm-none-eabi-gcc';
  const armSize = resolveToolExecutable('arm-none-eabi-size', toolchainsDir) || 'arm-none-eabi-size';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-opt-test-'));

  try {
    // 1. Emit sources for STM32F4
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    execFileSync(process.execPath, [tsxCli, path.join(__dirname, 'hil_emit_sources.ts'), '--target', 'STM32F4', '--out', tmpDir], { stdio: 'pipe', shell: false });

    // 2. Check volatile qualifiers in emitted hil_interface.c
    const interfaceC = fs.readFileSync(path.join(tmpDir, 'hil_interface.c'), 'utf8');
    const hasVolatileVal = /static\s+volatile\s+float\s+override_val_/i.test(interfaceC);
    const hasVolatileActive = /static\s+volatile\s+bool\s+override_active_/i.test(interfaceC);

    if (!hasVolatileVal || !hasVolatileActive) {
      console.error('[FAIL] Missing volatile qualifier on HIL override variables in hil_interface.c');
      process.exit(1);
    }
    console.log('[ PASS ] Volatile qualifiers verified on HIL override variables.');

    const cFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.c'));
    const baseFlags = [
      '-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16',
      '-Wall', '-Wextra',
      '-ffunction-sections', '-fdata-sections',
      '--specs=nano.specs', '--specs=nosys.specs',
      '-I.',
      ...cFiles,
      '-Wl,-Map=firmware.map', '-Wl,--gc-sections',
    ];

    // 3. Compile -O0
    const outO0 = path.join(tmpDir, 'firmware_O0.elf');
    execFileSync(armGcc, ['-O0', ...baseFlags, '-o', outO0], { cwd: tmpDir, stdio: 'pipe', shell: false });

    const sizeO0Output = execFileSync(armSize, [outO0], { cwd: tmpDir }).toString();
    const memO0 = parseMemoryUsage(sizeO0Output, 'stm32f407vgt6');

    // 4. Compile -Os
    const outOs = path.join(tmpDir, 'firmware_Os.elf');
    execFileSync(armGcc, ['-Os', ...baseFlags, '-o', outOs], { cwd: tmpDir, stdio: 'pipe', shell: false });

    const sizeOsOutput = execFileSync(armSize, [outOs], { cwd: tmpDir }).toString();
    const memOs = parseMemoryUsage(sizeOsOutput, 'stm32f407vgt6');

    console.log('\nOptimization Size Comparison (STM32F407VGT6):');
    console.log(`  -O0 (Debug/Unoptimized): Flash = ${memO0.flashUsed} B, RAM = ${memO0.ramUsed} B`);
    console.log(`  -Os (Size Optimized):   Flash = ${memOs.flashUsed} B, RAM = ${memOs.ramUsed} B`);

    const flashReductionPct = (((memO0.flashUsed - memOs.flashUsed) / memO0.flashUsed) * 100).toFixed(1);
    console.log(`  Flash size reduction with -Os: ${memO0.flashUsed - memOs.flashUsed} bytes (${flashReductionPct}%)`);

    if (memOs.flashUsed > memO0.flashUsed) {
      console.error(`[FAIL] -Os produced larger binary (${memOs.flashUsed} B) than -O0 (${memO0.flashUsed} B)`);
      process.exit(1);
    }

    console.log('\n[ PASS ] Optimization integrity test passed.');
    process.exit(0);
  } catch (err) {
    console.error('[EXCEPTION]', err.message);
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

runOptTest().catch(err => {
  console.error(err);
  process.exit(1);
});
