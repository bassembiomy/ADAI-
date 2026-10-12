'use strict';

// Shared HIL environment readiness logic. Used by the `hil-env-status` IPC
// handler (main.cjs) and scripts/hil_env_doctor.cjs so both agree on resolution.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const {
  TOOLCHAINS, FLASH_TOOLS,
  resolveToolExecutable,
} = require('./toolchainManager.cjs');

const ESP32_BLOCKED_REASON = 'ESP32 build/flash requires the ESP32 SDK, which is not bundled yet.';

const TARGETS = Object.freeze({
  Generic: Object.freeze({ compiler: 'Generic', flasher: null }),
  Arduino_Uno: Object.freeze({ compiler: 'Arduino', flasher: 'avrdude' }),
  Arduino_Mega: Object.freeze({ compiler: 'Arduino', flasher: 'avrdude' }),
  STM32F1: Object.freeze({
    compiler: 'STM32', flasher: 'openocd', packId: 'stm32f103c8t6',
    halRepos: Object.freeze([['stm32f1xx-hal-driver', 'Inc'], ['cmsis-device-f1', 'Include'], ['cmsis_core', 'Include']]),
  }),
  STM32F4: Object.freeze({
    compiler: 'STM32', flasher: 'openocd', packId: 'stm32f407vgt6',
    halRepos: Object.freeze([['stm32f4xx-hal-driver', 'Inc'], ['cmsis-device-f4', 'Include'], ['cmsis_core', 'Include']]),
  }),
  ESP32: Object.freeze({ compiler: 'ESP32', flasher: 'esptool', unsupported: true }),
});

function specFor(key) {
  return TOOLCHAINS[key] || FLASH_TOOLS[key];
}

/** Default version probe: first line of `<exe> --version`, or null. */
function defaultProbeVersion(exe) {
  return new Promise((resolve) => {
    try {
      execFile(exe, ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout, stderr) => {
        const text = `${stdout || ''}\n${stderr || ''}`;
        const line = text.split(/\r?\n/).find((l) => /\d+\.\d+/.test(l));
        resolve(line ? line.trim().slice(0, 200) : null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function describeTool(key, ctx) {
  const spec = specFor(key);
  if (!spec) return { ok: false, tool: key, path: null, version: null };
  const exe = ctx.resolveExecutable(spec.cmd, ctx.toolchainDirs);
  if (!exe) return { ok: false, tool: spec.cmd, path: null, version: null };
  const version = await ctx.probeVersion(exe).catch(() => null);
  return { ok: true, tool: spec.cmd, path: exe, version: version || spec.version || null };
}

function checkStm32Hal(def, ctx) {
  const stm32cube = path.join(ctx.vendorDir, 'stm32cube');
  return def.halRepos.every(([repo, sub]) => ctx.exists(path.join(stm32cube, repo, sub)));
}

/**
 * Per-target readiness. Options:
 *   toolchainDirs  ordered [bundled, user] dirs
 *   targetPacksDir, vendorDir
 *   resolveExecutable(name, dirs), probeVersion(exe), exists(path)   (injectable for tests)
 * Returns [{ target, compiler, flasher, halAvailable?, compileBlockedReason?, flashBlockedReason?, blockedReason? }]
 */
async function computeHilEnvStatus(options = {}) {
  const ctx = {
    toolchainDirs: options.toolchainDirs,
    vendorDir: options.vendorDir || '',
    targetPacksDir: options.targetPacksDir || '',
    resolveExecutable: options.resolveExecutable || resolveToolExecutable,
    probeVersion: options.probeVersion || defaultProbeVersion,
    exists: options.exists || ((p) => fs.existsSync(p)),
  };
  const results = [];
  for (const [target, def] of Object.entries(TARGETS)) {
    const compiler = await describeTool(def.compiler, ctx);
    const flasher = def.flasher ? await describeTool(def.flasher, ctx) : { ok: true, tool: null, path: null, version: null };
    const status = { target, compiler, flasher };
    let compileBlocked = null;
    let flashBlocked = null;

    if (def.unsupported) {
      compileBlocked = ESP32_BLOCKED_REASON;
      flashBlocked = ESP32_BLOCKED_REASON;
      status.code = 'TARGET_NOT_YET_SUPPORTED';
    } else {
      if (!compiler.ok) compileBlocked = `Compiler '${compiler.tool}' not found. Reinstall ADIA or run the repair download.`;
      if (def.halRepos) {
        status.halAvailable = checkStm32Hal(def, ctx)
          && ctx.exists(path.join(ctx.targetPacksDir, def.packId));
        if (!status.halAvailable && !compileBlocked) {
          compileBlocked = 'STM32Cube HAL / target pack files are missing from this installation.';
        }
      }
      if (def.flasher && !flasher.ok) flashBlocked = `Flasher '${flasher.tool}' not found. Reinstall ADIA or run the repair download.`;
      if (!flashBlocked && compileBlocked) flashBlocked = compileBlocked;
    }
    if (compileBlocked) status.compileBlockedReason = compileBlocked;
    if (flashBlocked) status.flashBlockedReason = flashBlocked;
    const first = compileBlocked || flashBlocked;
    if (first) status.blockedReason = first;
    results.push(status);
  }
  return results;
}

/** Flat per-tool rows (compilers + flashers) for the CLI doctor. */
function listToolRows(toolchainDirs, resolveExecutable = resolveToolExecutable) {
  const rows = [];
  for (const [id, spec] of Object.entries(TOOLCHAINS)) {
    const p = resolveExecutable(spec.cmd, toolchainDirs);
    rows.push({ kind: 'compiler', id, label: `${spec.name} ${spec.version || ''}`.trim(), installed: Boolean(p), path: p || null });
  }
  for (const [id, spec] of Object.entries(FLASH_TOOLS)) {
    const p = resolveExecutable(spec.cmd, toolchainDirs);
    rows.push({ kind: 'flasher', id, label: `${spec.name} ${spec.version || ''}`.trim(), installed: Boolean(p), path: p || null });
  }
  return rows;
}

module.exports = { TARGETS, ESP32_BLOCKED_REASON, computeHilEnvStatus, listToolRows, defaultProbeVersion };
