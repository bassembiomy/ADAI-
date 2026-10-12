'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stm32CompileInvocation, halSourceNames, FAMILIES, MODULE_SOURCES } = require('./stm32FirmwareBuild.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const REAL_PACKS = path.join(REPO, 'target-packs');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function touch(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '/* test */\n'); }

/** Fake vendor tree containing every file the planner requires (contents irrelevant here). */
function fakeVendor(familyKey) {
  const root = tmp('adia_vendor_');
  const fam = FAMILIES[familyKey];
  const base = path.join(root, 'stm32cube');
  fs.mkdirSync(path.join(base, fam.halRepo, 'Inc'), { recursive: true });
  fs.mkdirSync(path.join(base, fam.deviceRepo, 'Include'), { recursive: true });
  fs.mkdirSync(path.join(base, 'cmsis_core', 'Include'), { recursive: true });
  touch(path.join(base, fam.deviceRepo, 'Source', 'Templates', fam.systemFile));
  for (const n of halSourceNames(familyKey)) touch(path.join(base, fam.halRepo, 'Src', n));
  return root;
}

function buildDirWith(files) {
  const dir = tmp('adia_build_');
  for (const f of files) touch(path.join(dir, f));
  return dir;
}

function expectCode(fn, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return true;
  });
}

function run() {
  console.log('Running stm32FirmwareBuild tests...');
  const sources = ['hal_drivers.c', 'main_hil.c', 'sm_core.c'];

  for (const [target, define, cpu, extra, targetId] of [
    ['STM32F4', '-DSTM32F407xx', '-mcpu=cortex-m4', ['-mfloat-abi=hard', '-mfpu=fpv4-sp-d16'], 'stm32f407vgt6'],
    ['STM32F1', '-DSTM32F103xB', '-mcpu=cortex-m3', [], 'stm32f103c8t6'],
  ]) {
    const key = target;
    const vendor = fakeVendor(key);
    const buildDir = buildDirWith([...sources, 'stm32f4xx_hal_conf.h', 'stale.o', 'system_stm32f4xx.c', 'startup_old.c']);
    for (const t of [target, targetId]) {
      const inv = stm32CompileInvocation({ target: t, buildDir, vendorDir: vendor, targetPacksDir: REAL_PACKS, compiler: '/opt/arm/bin/arm-none-eabi-gcc' });
      assert.equal(inv.executable, '/opt/arm/bin/arm-none-eabi-gcc');
      assert.equal(inv.cwd, buildDir);
      assert.ok(inv.args.includes(define), `${target}: ${define}`);
      assert.ok(inv.args.includes('-DUSE_HAL_DRIVER'));
      assert.ok(inv.args.includes(cpu));
      assert.ok(inv.args.includes('-mthumb'));
      for (const f of extra) assert.ok(inv.args.includes(f), `${target}: ${f}`);
      for (const f of ['-Wall', '-Wextra', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections', '--specs=nano.specs', '--specs=nosys.specs']) {
        assert.ok(inv.args.includes(f), `${target}: ${f}`);
      }
      assert.ok(inv.args.includes('-Wl,-u,_printf_float'));
      assert.equal(inv.args[inv.args.indexOf('-o') + 1], 'adia_hil.elf');
      assert.ok(inv.args.some((a) => a.startsWith('-T') && a.endsWith('.ld')), 'linker script');
      assert.ok(inv.args.some((a) => /startup_stm32f(407xx|103c8tx)\.c$/.test(a)), 'startup file');
      assert.ok(inv.args.some((a) => /system_stm32f[14]xx\.c$/.test(a)), 'vendored system file');
      assert.ok(inv.args.filter((a) => a.startsWith('-I') && a.includes('stm32cube')).length === 3, 'HAL/CMSIS include dirs');
      // generated sources: .c only, sorted, stale system/startup copies excluded
      const generated = inv.args.filter((a) => sources.includes(a));
      assert.deepEqual(generated, [...sources].sort());
      assert.ok(!inv.args.includes('startup_old.c'));
      assert.ok(!inv.args.includes('system_stm32f4xx.c'));
      assert.ok(!inv.args.includes('stale.o'));
      // one HAL source per module file
      for (const n of halSourceNames(key)) assert.ok(inv.args.some((a) => a.endsWith(n)), `${target}: ${n}`);
    }

    // optimisation override and extra flags are validated
    const inv = stm32CompileInvocation({ target, buildDir, vendorDir: vendor, targetPacksDir: REAL_PACKS, optimization: '-O2', extraFlags: ['-g3', 'rm -rf /', ''] });
    assert.ok(inv.args.includes('-O2') && !inv.args.includes('-Os'));
    assert.ok(inv.args.includes('-g3'));
    assert.ok(!inv.args.includes('rm -rf /'));
    assert.equal(inv.executable, 'arm-none-eabi-gcc');
  }

  // STM32_HAL_MISSING
  const buildDir = buildDirWith(sources);
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: path.join(os.tmpdir(), 'adia_no_such_vendor'), targetPacksDir: REAL_PACKS }), 'STM32_HAL_MISSING');
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, targetPacksDir: REAL_PACKS }), 'STM32_HAL_MISSING');
  const partial = fakeVendor('STM32F4');
  fs.rmSync(path.join(partial, 'stm32cube', 'stm32f4xx-hal-driver', 'Src', 'stm32f4xx_hal_uart.c'));
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: partial, targetPacksDir: REAL_PACKS }), 'STM32_HAL_MISSING');

  // TARGET_PACK_MISSING (no dir, missing startup, altered startup)
  const vendor = fakeVendor('STM32F4');
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: vendor, targetPacksDir: path.join(os.tmpdir(), 'adia_no_packs') }), 'TARGET_PACK_MISSING');
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: vendor }), 'TARGET_PACK_MISSING');
  const packs = tmp('adia_packs_');
  fs.cpSync(path.join(REAL_PACKS, 'stm32f407vgt6'), path.join(packs, 'stm32f407vgt6'), { recursive: true });
  const startup = path.join(packs, 'stm32f407vgt6', 'startup', 'startup_stm32f407xx.c');
  fs.appendFileSync(startup, '\n/* tampered */\n');
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: vendor, targetPacksDir: packs }), 'TARGET_PACK_MISSING');
  fs.rmSync(startup);
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir, vendorDir: vendor, targetPacksDir: packs }), 'TARGET_PACK_MISSING');

  // Other errors
  expectCode(() => stm32CompileInvocation({ target: 'ESP32', buildDir, vendorDir: vendor, targetPacksDir: REAL_PACKS }), 'STM32_TARGET_UNSUPPORTED');
  expectCode(() => stm32CompileInvocation({ target: 'STM32F4', buildDir: buildDirWith([]), vendorDir: vendor, targetPacksDir: REAL_PACKS }), 'STM32_SOURCES_MISSING');

  // Module table sanity: every family defines the modules the HIL templates need.
  for (const key of Object.keys(FAMILIES)) {
    for (const m of ['ADC', 'CORTEX', 'DMA', 'FLASH', 'GPIO', 'I2C', 'PWR', 'RCC', 'SPI', 'TIM', 'UART']) {
      assert.ok(MODULE_SOURCES[key][m], `${key} missing module ${m}`);
    }
  }
  assert.ok(MODULE_SOURCES.STM32F4.DAC && !MODULE_SOURCES.STM32F1.DAC, 'DAC is F4-only (F103xB has no DAC)');

  // If the real vendor tree has been fetched, the planner must accept it as-is.
  const realVendor = path.join(REPO, 'vendor');
  if (fs.existsSync(path.join(realVendor, 'stm32cube'))) {
    for (const t of ['STM32F4', 'STM32F1']) {
      const inv = stm32CompileInvocation({ target: t, buildDir, vendorDir: realVendor, targetPacksDir: REAL_PACKS });
      assert.ok(inv.args.length > 40);
    }
  }
  console.log('stm32FirmwareBuild tests passed!');
}

try { run(); } catch (err) { console.error('stm32FirmwareBuild tests failed:', err); process.exit(1); }
