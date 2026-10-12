'use strict';

/**
 * Pure (no Electron) build-invocation planner for real STM32 firmware that is
 * linked against the official STM32Cube HAL.
 *
 *   stm32CompileInvocation({ target, buildDir, vendorDir, targetPacksDir, compiler })
 *     -> { executable, args, cwd }
 *
 * Throws Error with `.code`:
 *   STM32_HAL_MISSING      vendored HAL/CMSIS sources not found (run `npm run fetch:stm32cube`)
 *   TARGET_PACK_MISSING    target-pack manifest, startup file or linker script missing / altered
 *   STM32_TARGET_UNSUPPORTED  target is not STM32F1 / STM32F4
 *   STM32_SOURCES_MISSING  buildDir contains no generated *.c sources
 *
 * The output image is `adia_hil.elf` in buildDir. Core/optimisation/linker flags
 * come from hilBuildRecipes.cjs so they are defined in exactly one place.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getBuildRecipe } = require('./hilBuildRecipes.cjs');
const { loadTargetPackManifest } = require('./targetPackLoader.cjs');

const OUTPUT_ELF = 'adia_hil.elf';

/**
 * HAL modules compiled into the image. MUST match STM32_HAL_ENABLED_MODULES in
 * src/engine/hil/stm32HalConf.ts (checked by stm32FirmwareBuild.test.cjs and
 * hilStm32RealBuild.test.ts). Each module lists the driver .c suffixes it needs.
 */
const MODULE_SOURCES = Object.freeze({
  STM32F4: Object.freeze({
    ADC: ['adc', 'adc_ex'],
    CORTEX: ['cortex'],
    DAC: ['dac', 'dac_ex'],
    DMA: ['dma', 'dma_ex'],
    FLASH: ['flash', 'flash_ex', 'flash_ramfunc'],
    GPIO: ['gpio'],
    I2C: ['i2c', 'i2c_ex'],
    PWR: ['pwr', 'pwr_ex'],
    RCC: ['rcc', 'rcc_ex'],
    SPI: ['spi'],
    TIM: ['tim', 'tim_ex'],
    UART: ['uart'],
  }),
  STM32F1: Object.freeze({
    ADC: ['adc', 'adc_ex'],
    CORTEX: ['cortex'],
    DMA: ['dma'],
    FLASH: ['flash', 'flash_ex'],
    GPIO: ['gpio', 'gpio_ex'],
    I2C: ['i2c'],
    PWR: ['pwr'],
    RCC: ['rcc', 'rcc_ex'],
    SPI: ['spi'],
    TIM: ['tim', 'tim_ex'],
    UART: ['uart'],
  }),
});

const FAMILIES = Object.freeze({
  STM32F4: Object.freeze({
    family: 'STM32F4',
    targetId: 'stm32f407vgt6',
    prefix: 'stm32f4xx',
    define: 'STM32F407xx',
    halRepo: 'stm32f4xx-hal-driver',
    deviceRepo: 'cmsis-device-f4',
    systemFile: 'system_stm32f4xx.c',
  }),
  STM32F1: Object.freeze({
    family: 'STM32F1',
    targetId: 'stm32f103c8t6',
    prefix: 'stm32f1xx',
    define: 'STM32F103xB',
    halRepo: 'stm32f1xx-hal-driver',
    deviceRepo: 'cmsis-device-f1',
    systemFile: 'system_stm32f1xx.c',
  }),
});

function codedError(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function resolveFamily(target) {
  const key = String(target || '').trim();
  const byId = Object.values(FAMILIES).find((f) => f.targetId === key.toLowerCase());
  const fam = FAMILIES[key.toUpperCase()] || byId;
  if (!fam) throw codedError('STM32_TARGET_UNSUPPORTED', `'${key}' is not an STM32F1/STM32F4 target`);
  return fam;
}

/** Driver .c files (basenames) compiled for a family, in a stable order. */
function halSourceNames(familyKey) {
  const fam = FAMILIES[familyKey];
  const names = [`${fam.prefix}_hal.c`];
  for (const suffixes of Object.values(MODULE_SOURCES[familyKey])) {
    for (const s of suffixes) names.push(`${fam.prefix}_hal_${s}.c`);
  }
  return names;
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function sha256File(p) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`;
}

function locateVendor(fam, vendorDir) {
  if (!vendorDir) throw codedError('STM32_HAL_MISSING', 'vendorDir not provided');
  const root = path.join(vendorDir, 'stm32cube');
  const hal = path.join(root, fam.halRepo);
  const device = path.join(root, fam.deviceRepo);
  const core = path.join(root, 'cmsis_core');
  const missing = [];
  const need = (p, label) => { if (!(label.endsWith('/') ? isDir(p) : isFile(p))) missing.push(label.replace(/\/$/, '') + ` (${p})`); };

  need(path.join(hal, 'Inc'), 'HAL Inc/');
  need(path.join(device, 'Include'), 'CMSIS device Include/');
  need(path.join(core, 'Include'), 'CMSIS core Include/');
  const systemFile = path.join(device, 'Source', 'Templates', fam.systemFile);
  need(systemFile, fam.systemFile);
  const halSources = halSourceNames(fam.family).map((n) => path.join(hal, 'Src', n));
  for (const s of halSources) need(s, path.basename(s));
  if (missing.length) {
    throw codedError('STM32_HAL_MISSING',
      `STM32Cube HAL sources are not vendored (${missing.slice(0, 3).join('; ')}${missing.length > 3 ? '; ...' : ''}). Run "npm run fetch:stm32cube".`);
  }
  return {
    includes: [path.join(hal, 'Inc'), path.join(device, 'Include'), path.join(core, 'Include')],
    halSources,
    systemFile,
  };
}

function locatePackAssets(fam, targetPacksDir) {
  if (!targetPacksDir) throw codedError('TARGET_PACK_MISSING', 'targetPacksDir not provided');
  const manifest = loadTargetPackManifest(fam.targetId, targetPacksDir);
  if (!manifest || !Array.isArray(manifest.assets)) {
    throw codedError('TARGET_PACK_MISSING', `no manifest for ${fam.targetId} in ${targetPacksDir}`);
  }
  const packDir = path.join(targetPacksDir, fam.targetId);
  const result = {};
  for (const kind of ['startup', 'linker']) {
    const asset = manifest.assets.find((a) => a.kind === kind);
    if (!asset) throw codedError('TARGET_PACK_MISSING', `${fam.targetId} manifest has no ${kind} asset`);
    const full = path.resolve(packDir, asset.path);
    if (!full.startsWith(path.resolve(packDir) + path.sep) || !isFile(full)) {
      throw codedError('TARGET_PACK_MISSING', `${kind} asset '${asset.path}' not found for ${fam.targetId}`);
    }
    if (asset.sha256 && sha256File(full) !== asset.sha256) {
      throw codedError('TARGET_PACK_MISSING', `${kind} asset '${asset.path}' does not match the manifest sha256 (pack altered or corrupt)`);
    }
    result[kind] = full;
  }
  return result;
}

function listGeneratedSources(buildDir) {
  if (!buildDir || !isDir(buildDir)) throw codedError('STM32_SOURCES_MISSING', `build directory not found: ${buildDir}`);
  const files = fs.readdirSync(buildDir)
    .filter((f) => f.endsWith('.c') && !/^(system_stm32|startup_)/i.test(f))
    .sort();
  if (files.length === 0) throw codedError('STM32_SOURCES_MISSING', `no generated .c sources in ${buildDir}`);
  return files;
}

function stm32CompileInvocation(opts = {}) {
  const fam = resolveFamily(opts.target);
  const buildDir = opts.buildDir;
  const sources = Array.isArray(opts.sources) && opts.sources.length ? opts.sources : listGeneratedSources(buildDir);
  const vendor = locateVendor(fam, opts.vendorDir);
  const pack = locatePackAssets(fam, opts.targetPacksDir);
  const executable = opts.compiler || 'arm-none-eabi-gcc';

  const allSources = [...sources, ...vendor.halSources, vendor.systemFile];
  const recipe = getBuildRecipe(fam.targetId, {
    armGcc: executable,
    sources: allSources,
    startupFile: pack.startup,
    linkerScript: pack.linker,
  });

  const optimization = opts.optimization && /^-O[0-3sgz]$/.test(opts.optimization) ? opts.optimization : null;
  const extraFlags = (opts.extraFlags || []).filter((f) => typeof f === 'string' && /^-[A-Za-z]/.test(f));

  const recipeArgs = recipe.args.map((a) => {
    if (a === '-o') return a;
    if (a === 'firmware.elf') return OUTPUT_ELF;
    if (a === '-Wl,-Map=firmware.map') return '-Wl,-Map=adia_hil.map';
    if (optimization && /^-O[0-3sgz]$/.test(a)) return optimization;
    return a;
  });

  const args = [
    `-D${fam.define}`,
    '-DUSE_HAL_DRIVER',
    ...extraFlags,
    ...vendor.includes.map((d) => `-I${d}`),
    ...recipeArgs,
    // newlib-nano omits float support from printf/scanf unless forced in; the
    // generated telemetry uses snprintf("%.4f") and sscanf("%f").
    '-Wl,-u,_printf_float',
    '-Wl,-u,_scanf_float',
  ];
  return { executable, args, cwd: buildDir };
}

module.exports = {
  stm32CompileInvocation,
  halSourceNames,
  MODULE_SOURCES,
  FAMILIES,
  OUTPUT_ELF,
};
