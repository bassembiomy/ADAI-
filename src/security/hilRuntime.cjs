'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { inspectElf } = require('./elfInspector.cjs');

const TARGETS = Object.freeze({
  atmega328p: { legacy: 'Arduino_Uno', env: 'uno', platform: 'atmelavr@5.1.0', board: 'uno', framework: 'arduino', tools: 'toolchain-atmelavr', prefix: 'avr' },
  atmega2560: { legacy: 'Arduino_Mega', env: 'megaatmega2560', platform: 'atmelavr@5.1.0', board: 'megaatmega2560', framework: 'arduino', tools: 'toolchain-atmelavr', prefix: 'avr' },
  stm32f103c8t6: { legacy: 'STM32F1', env: 'bluepill_f103c8', platform: 'ststm32@19.0.0', board: 'bluepill_f103c8', framework: 'stm32cube', tools: 'toolchain-gccarmnoneeabi', prefix: 'arm-none-eabi' },
  stm32f407vgt6: { legacy: 'STM32F4', env: 'stm32f407vg', platform: 'ststm32@19.0.0', board: 'disco_f407vg', framework: 'stm32cube', tools: 'toolchain-gccarmnoneeabi', prefix: 'arm-none-eabi' },
  'esp32-wroom-32': { legacy: 'ESP32', env: 'esp32dev', platform: 'espressif32@6.9.0', board: 'esp32dev', framework: 'arduino', tools: 'toolchain-xtensa-esp32', prefix: 'xtensa-esp32-elf' },
});
function hashFile(file) { return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`; }
function verifyRuntimeBundle(root, { deep = false } = {}) {
  const manifestFile = path.join(root, 'bundle-manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('HIL_RUNTIME_MISSING: Run npm run provision:hil before packaging.');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.platformioVersion !== '6.1.18' || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('HIL_RUNTIME_INVALID_MANIFEST');
  for (const target of Object.values(TARGETS)) {
    if (!manifest.targets?.includes(target.platform)) throw new Error(`HIL_RUNTIME_TARGET_MISSING: ${target.platform}`);
  }
  const mandatory = ['python/python.exe', 'python/Lib/site-packages/platformio/__init__.py', 'python/Lib/site-packages/sitecustomize.py',
    'core/platforms/atmelavr/platform.json', 'core/platforms/ststm32/platform.json', 'core/platforms/espressif32/platform.json',
    'core/packages/framework-arduino-avr/cores/arduino/Arduino.h', 'core/packages/framework-arduinoespressif32/cores/esp32/Arduino.h',
    'core/packages/framework-stm32cubef1/Drivers/STM32F1xx_HAL_Driver/Inc/stm32f1xx_hal.h',
    'core/packages/framework-stm32cubef4/Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'];
  for (const file of mandatory) if (!manifest.files.some(item => item.path === file)) throw new Error(`HIL_RUNTIME_ASSET_MISSING: ${file}`);
  const files = deep ? manifest.files : manifest.files.filter(item => item.required || mandatory.includes(item.path));
  for (const item of files) {
    const file = path.resolve(root, item.path);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file)) throw new Error(`HIL_RUNTIME_ASSET_MISSING: ${item.path}`);
    if (hashFile(file) !== item.sha256) throw new Error(`HIL_RUNTIME_HASH_MISMATCH: ${item.path}`);
  }
  return manifest;
}
function runtimeLocation(opts = {}) {
  return opts.runtimeRoot || path.join(opts.resourcesPath || opts.repoRoot || path.resolve(__dirname, '../..'), 'toolchains', 'hil-runtime');
}
function resolveRuntime(opts = {}) {
  const root = runtimeLocation(opts);
  try { verifyRuntimeBundle(root); }
  catch (error) { throw new Error(`${error.message} Runtime bundle: ${root}`); }
  return { root, python: path.join(root, 'python', 'python.exe'), core: path.join(root, 'core') };
}
function validateProductionSources(projectDir) {
  for (const file of ['Arduino.h', 'Arduino.cpp', 'SPI.h', 'Wire.h', 'stm32f1xx_hal.h', 'stm32f4xx_hal.h']) {
    if (fs.existsSync(path.join(projectDir, file))) throw new Error(`TEST_SHIM_IN_PRODUCTION: Remove generated test shim ${file} and regenerate this project.`);
  }
  if (!fs.existsSync(path.join(projectDir, 'platformio.ini'))) throw new Error('HIL_PROJECT_CONFIG_MISSING');
}
const CPP_HOOK = `Import("env")
from pathlib import Path
root = Path(env.subst("$PROJECT_DIR"))
(root / "hal_drivers.cpp").write_text((root / "hal_drivers.c").read_text(), encoding="utf-8")
`;
const HOST_SOURCES = Object.freeze(['sm_core.c','sm_mapping.c','sm_user_logic.c','sm_safety.c','adia_mcal.c','adia_component.c','hal_drivers.c','hil_interface.c','mcal_dio_hil.c','main_hil.c']);
function validateProductionConfigurationFiles(files, targetId) {
  if (targetId === 'generic-host') {
    const ini = files.find(file => file.name === 'platformio.ini')?.content;
    const normalized = typeof ini === 'string' ? ini.replace(/\r\n/g,'\n').split('\n').filter(line => line.trim() && !/^[;#]/.test(line.trim())).map(line => line.trim()).join('\n') : '';
    const expected = '[platformio]\nsrc_dir = .\ninclude_dir = .\n[env:generic]\nplatform = native\nbuild_flags =\n-I.\n-Wl,-Map,firmware.map\nbuild_src_filter = -<*> '+HOST_SOURCES.map(name => '+<'+name+'>').join(' ');
    if (normalized !== expected || files.some(file => file.name.endsWith('.py'))) throw new Error('UNTRUSTED_BUILD_CONFIGURATION: Regenerate the Generic host simulation project.');
    return;
  }
  const target = TARGETS[targetId];
  if (!target) throw new Error('HIL_UNSUPPORTED_TARGET');
  const reject = () => { throw new Error('UNTRUSTED_BUILD_CONFIGURATION: Regenerate the production project with ADIA.'); };
  const ini = files.find(file => file.name === 'platformio.ini')?.content;
  if (typeof ini !== 'string') reject();
  const normalized = ini.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim() && !/^[;#]/.test(line.trim())).map(line => line.trim()).join('\n');
  const speed = normalized.match(/^monitor_speed = (\d+)$/m)?.[1];
  if (!speed || Number(speed) < 1200 || Number(speed) > 2000000) reject();
  const arduino = target.framework === 'arduino';
  const sources = ['sm_core.c', 'sm_mapping.c', 'sm_user_logic.c', 'sm_safety.c', 'adia_mcal.c', 'adia_component.c', arduino ? 'hal_drivers.cpp' : 'hal_drivers.c', 'hil_interface.c', 'mcal_dio_hil.c', arduino ? 'main_hil.ino' : 'main_hil.c'];
  if (arduino) sources.push('main_hil.ino.cpp');
  if (!arduino) sources.push('stm32_runtime.c');
  const floatFlags = targetId.startsWith('atmega') ? '\n-Wl,-u,vfprintf\n-lprintf_flt\n-lm' : targetId.startsWith('stm32') ? '\n-Wl,-u,_printf_float' : '';
  const expected = `[platformio]\nsrc_dir = .\ninclude_dir = .\n[env:${target.env}]\nplatform = ${target.platform}\nboard = ${target.board}\nframework = ${target.framework}\nmonitor_speed = ${speed}\nbuild_flags =\n-I.\n-Wl,-Map,firmware.map${floatFlags}\nbuild_src_filter = -<*> ${sources.map(name => `+<${name}>`).join(' ')}${arduino ? '\nextra_scripts = pre:adia_cpp.py' : ''}`;
  if (normalized !== expected) reject();
  const script = files.find(file => file.name === 'adia_cpp.py');
  if (arduino && script?.content.replace(/\r\n/g, '\n') !== CPP_HOOK) reject();
  if (!arduino && script) reject();
  if (files.some(file => file.name.endsWith('.py') && file.name !== 'adia_cpp.py')) reject();
}
function compilerRuntimeRoot(runtime) {
  if (process.platform !== 'win32') return runtime.core;
  // Older Xtensa GCC expands response files into a Windows command line. Long
  // installation paths exceed CreateProcess's limit; keep SDK include paths short.
  const aliasRoot = path.join(os.tmpdir(), 'adia-hil-sdk');
  fs.mkdirSync(aliasRoot, { recursive: true });
  const identity = crypto.createHash('sha256').update(path.resolve(runtime.core)).digest('hex').slice(0, 12);
  const alias = path.join(aliasRoot, identity);
  if (!fs.existsSync(alias)) {
    try { fs.symlinkSync(path.resolve(runtime.core), alias, 'junction'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (!fs.lstatSync(alias).isSymbolicLink() || fs.realpathSync(alias).toLowerCase() !== fs.realpathSync(runtime.core).toLowerCase()) throw new Error('HIL_RUNTIME_ALIAS_INVALID');
  return alias;
}
function runtimeEnvironment(runtime, cacheDir, offline = true) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const compilerRoot = compilerRuntimeRoot(runtime);
  return { ...process.env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    PLATFORMIO_CORE_DIR: cacheDir, PLATFORMIO_PLATFORMS_DIR: path.join(compilerRoot, 'platforms'),
    PLATFORMIO_PACKAGES_DIR: path.join(compilerRoot, 'packages'), PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No',
    PLATFORMIO_SETTING_CHECK_PLATFORMIO_INTERVAL: '36500', PLATFORMIO_SETTING_CHECK_PLATFORMS_INTERVAL: '36500',
    PLATFORMIO_SETTING_CHECK_LIBRARIES_INTERVAL: '0', ADIA_HIL_OFFLINE: offline ? '1' : '0' };
}
function run(executable, args, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd: opts.cwd, env: opts.env, shell: false, windowsHide: true });
    let logs = ''; let finished = false;
    const finish = result => { if (!finished) { finished = true; resolve({ ...result, logs }); } };
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => { const line = data.toString(); logs = (logs + line).slice(-65536); opts.onLog?.(line); });
    child.on('error', error => finish({ success: false, code: 'HIL_TOOL_START_FAILED', error: error.message }));
    child.on('close', code => finish({ success: code === 0, code: code === 0 ? undefined : 'HIL_TOOL_FAILED', error: code === 0 ? undefined : `Build tool exited with code ${code}` }));
  });
}
function stageProductionProject(projectDir, files, cacheDir) {
  const builds = path.join(cacheDir, 'builds');
  fs.mkdirSync(builds, { recursive: true });
  const stage = fs.mkdtempSync(path.join(builds, 'project-'));
  for (const name of files) {
    if (typeof name !== 'string' || path.basename(name) !== name || /[/\\\0]/.test(name)) throw new Error('UNSAFE_BUILD_SOURCE');
    // These are derived from signed .c/.ino sources by the trusted framework hook.
    if (['hal_drivers.cpp', 'main_hil.ino.cpp'].includes(name)) continue;
    const source = path.join(projectDir, name);
    if (!fs.lstatSync(source).isFile()) throw new Error('UNSAFE_BUILD_SOURCE');
    fs.copyFileSync(source, path.join(stage, name));
  }
  return stage;
}
function ensureMapArtifact(projectDir, outputDir) {
  const map = path.join(outputDir, 'firmware.map');
  if (fs.existsSync(map) && fs.statSync(map).size) return map;
  const rootMap = path.join(projectDir, 'firmware.map');
  if (!fs.existsSync(rootMap) || !fs.statSync(rootMap).size) throw new Error('MAP_FILE_NOT_FOUND');
  fs.copyFileSync(rootMap, map);
  return map;
}
async function buildProductionProject(opts) {
  try {
    const target = TARGETS[opts.targetId];
    if (!target) throw new Error(`HIL_UNSUPPORTED_TARGET: ${opts.targetId}`);
    const runtime = resolveRuntime(opts);
    validateProductionSources(opts.projectDir);
    validateProductionConfigurationFiles(fs.readdirSync(opts.projectDir).filter(name => name === 'platformio.ini' || name.endsWith('.py')).map(name => ({ name, content: fs.readFileSync(path.join(opts.projectDir, name), 'utf8') })), opts.targetId);
    const cacheDir = opts.cacheDir || path.join(os.tmpdir(), 'adia-hil-runtime-cache');
    if (!Array.isArray(opts.files) || !opts.files.length) throw new Error('HIL_SAVED_SOURCE_SET_REQUIRED');
    const projectDir = stageProductionProject(opts.projectDir, opts.files, cacheDir);
    const result = await run(runtime.python, ['-m', 'platformio', 'run', '-d', projectDir, '-e', target.env], { env: runtimeEnvironment(runtime, cacheDir), onLog: opts.onLog });
    if (!result.success) return result;
    const output = path.join(projectDir, '.pio', 'build', target.env);
    const elfPath = path.join(output, 'firmware.elf');
    ensureMapArtifact(projectDir, output);
    const hexPath = path.join(output, 'firmware.hex'); const binPath = path.join(output, 'firmware.bin');
    const tools = path.join(runtime.core, 'packages', target.tools, 'bin');
    const inspection = await inspectElf(elfPath, opts.targetId, {
      sizeExecutable: path.join(tools, `${target.prefix}-size.exe`),
      objdumpExecutable: path.join(tools, `${target.prefix}-objdump.exe`),
      targetPacksDir: opts.resourcesPath || opts.repoRoot ? path.join(opts.resourcesPath || opts.repoRoot, 'target-packs') : undefined,
    });
    if (!inspection.valid) return { ...result, success: false, code: inspection.code, error: inspection.error, inspection };
    const imagePaths = opts.targetId.startsWith('atmega') ? [{ path: hexPath, address: null }]
      : opts.targetId.startsWith('stm32') ? [{ path: elfPath, address: '0x08000000' }]
      : [{ path: path.join(output, 'bootloader.bin'), address: '0x1000' }, { path: path.join(output, 'partitions.bin'), address: '0x8000' },
        { path: path.join(runtime.core, 'packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin'), address: '0xe000' }, { path: binPath, address: '0x10000' }];
    const flashImages = imagePaths.map(item => ({ ...item, sha256: hashFile(item.path) }));
    return { ...result, elfPath, hexPath: fs.existsSync(hexPath) ? hexPath : null, binPath: fs.existsSync(binPath) ? binPath : null, flashImages, inspection };
  } catch (error) { return { success: false, code: error.message.split(':')[0], error: error.message }; }
}
async function buildHostSimulation(opts) {
  try {
    if (opts.targetId !== 'generic-host') throw new Error('HIL_UNSUPPORTED_HOST_TARGET');
    if (!Array.isArray(opts.files) || !HOST_SOURCES.every(name => opts.files.includes(name))) throw new Error('HIL_SAVED_SOURCE_SET_REQUIRED');
    validateProductionConfigurationFiles(opts.files.filter(name => name === 'platformio.ini' || name.endsWith('.py')).map(name => ({name,content:fs.readFileSync(path.join(opts.projectDir,name),'utf8')})),opts.targetId);
    const { resolveInstalledToolchain } = require('./toolchainManager.cjs');
    const toolchain = resolveInstalledToolchain('Generic',{toolchainsDir:opts.toolchainsDir || path.join(opts.resourcesPath || opts.repoRoot || path.resolve(__dirname,'../..'),'toolchains'),repoRoot:opts.repoRoot,resourcesPath:opts.resourcesPath || null});
    if (!toolchain) throw new Error('OFFLINE_TOOLCHAIN_MISSING: Bundled Generic host compiler is missing.');
    const projectDir = stageProductionProject(opts.projectDir,opts.files,opts.cacheDir || path.join(os.tmpdir(),'adia-hil-host-cache'));
    const exePath = path.join(projectDir,'firmware.exe');
    const result = await run(toolchain.executable,['-B'+toolchain.binPath+path.sep,'-I.','-std=c99','-Wall','-Wextra','-Wl,-Map,firmware.map',...HOST_SOURCES,'-o',exePath,'-lm'],{cwd:projectDir,onLog:opts.onLog,env:{...process.env,PATH:toolchain.binPath+path.delimiter+(process.env.PATH || '')}});
    if (!result.success) return result;
    ensureMapArtifact(projectDir,projectDir);
    const inspection = await inspectElf(exePath,'generic-host',{sizeExecutable:path.join(toolchain.binPath,'size.exe'),objdumpExecutable:path.join(toolchain.binPath,'objdump.exe')});
    return {...result,success:inspection.valid && inspection.evidence === 'tool-output',hostSimulationVerified:inspection.valid && inspection.evidence === 'tool-output',exePath,inspection,code:inspection.code,error:inspection.error,flashImages:[]};
  } catch (error) {return {success:false,code:error.message.split(':')[0],error:error.message};}
}
function getFlashCommand(targetId, images, opts = {}) {
  if (!TARGETS[targetId]) throw new Error('HIL_UNSUPPORTED_TARGET');
  if (!targetId.startsWith('stm32') && !/^(?:COM\d+|\/dev\/[A-Za-z0-9._/-]+)$/i.test(opts.port || '')) throw new Error('INVALID_FLASH_PORT');
  const toolchainsDir = opts.toolchainsDir || path.join(opts.repoRoot || path.resolve(__dirname, '../..'), 'toolchains');
  const resolveTool = opts.resolveTool || (key => require('./toolchainManager.cjs').resolveInstalledToolchain(key, { resourcesPath: opts.resourcesPath, toolchainsDir }).executable);
  const key = targetId.startsWith('atmega') ? 'avrdude' : targetId.startsWith('stm32') ? 'openocd' : 'esptool';
  const executable = resolveTool(key);
  if (!executable) throw new Error(`OFFLINE_FLASH_TOOL_MISSING: ${key}`);
  let args;
  if (targetId.startsWith('atmega')) {
    args = ['-C', path.join(path.dirname(executable), 'avrdude.conf'), '-p', targetId === 'atmega328p' ? 'm328p' : 'm2560', '-c', targetId === 'atmega328p' ? 'arduino' : 'wiring', '-P', opts.port, '-b', '115200', '-D', '-U', `flash:w:${images[0].path}:i`];
  } else if (targetId.startsWith('stm32')) {
    const image = images[0].path.replace(/\\/g, '/');
    const scripts = ['../openocd/scripts', '../share/openocd/scripts', '../scripts'].map(relative => path.resolve(path.dirname(executable), relative)).find(dir => ['interface/stlink.cfg','target/stm32f1x.cfg','target/stm32f4x.cfg'].every(file => fs.existsSync(path.join(dir,file))));
    if (!scripts) throw new Error('OPENOCD_CONFIGURATION_MISSING');
    args = ['-s', scripts, '-f', 'interface/stlink.cfg', '-f', targetId === 'stm32f103c8t6' ? 'target/stm32f1x.cfg' : 'target/stm32f4x.cfg', '-c', `program {${image}} verify reset exit`];
  } else args = ['--chip', 'esp32', '--port', opts.port, '--baud', String(opts.baudRate || 921600), 'write_flash', '-z', ...images.flatMap(item => [item.address, item.path])];
  return { executable, args };
}
async function flashProductionBuild(opts) {
  try {
    const runtime = resolveRuntime(opts); const target = TARGETS[opts.targetId];
    if (!target) throw new Error('HIL_UNSUPPORTED_TARGET');
    const build = opts.build;
    const images = build.artifacts?.flashImages || build.flashImages;
    if (build.status !== 'LINKED_IMAGE_VERIFIED' || build.flashBlocked || !images?.length) throw new Error('NO_VERIFIED_FLASH_IMAGES');
    for (const item of images) if (hashFile(item.path) !== item.sha256) throw new Error('FLASH_IMAGE_CHANGED');
    const { executable, args } = getFlashCommand(opts.targetId, images, opts);
    return await run(executable, args, { onLog: opts.onLog, env: runtimeEnvironment(runtime, opts.cacheDir || path.join(os.tmpdir(), 'adia-hil-runtime-cache')) });
  } catch (error) { return { success: false, code: error.message.split(':')[0], error: error.message }; }
}
module.exports = { buildHostSimulation, HOST_SOURCES, TARGETS, resolveRuntime, runtimeLocation, verifyRuntimeBundle, validateProductionSources, validateProductionConfigurationFiles, stageProductionProject, ensureMapArtifact, runtimeEnvironment, buildProductionProject, flashProductionBuild, getFlashCommand, hashFile, run };
