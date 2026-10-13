'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getTargetLimits } = require('./targetPackLoader.cjs');

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

function parseMemoryUsage(sizeOutput, packOrTargetId, targetPacksDir) {
  let flashTotal = 65536;
  let ramTotal = 20480;

  if (typeof packOrTargetId === 'string') {
    const limits = getTargetLimits(packOrTargetId, targetPacksDir);
    flashTotal = limits.flash;
    ramTotal = limits.sram;
  } else if (packOrTargetId && Array.isArray(packOrTargetId.memoryRegions)) {
    const flashRegion = packOrTargetId.memoryRegions.find(r => /flash/i.test(r.name)) || packOrTargetId.memoryRegions[0];
    const ramRegion = packOrTargetId.memoryRegions.find(r => /s?ram/i.test(r.name)) || packOrTargetId.memoryRegions[1] || packOrTargetId.memoryRegions[0];
    flashTotal = flashRegion ? flashRegion.size : 65536;
    ramTotal = ramRegion ? ramRegion.size : 20480;
  }

  const lines = typeof sizeOutput === 'string' ? sizeOutput.trim().split(/\r?\n/) : [];
  const row = lines.length === 2 && /^\s*text\s+data\s+bss\s+dec\s+hex\s+filename\s*$/.test(lines[0])
    ? lines[1].match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\da-fA-F]+)\s+(.+)$/) : null;
  if (!row) throw new Error('INVALID_SIZE_OUTPUT');
  const [text, data, bss, dec] = row.slice(1, 5).map(Number);
  if (![text, data, bss, dec].every(Number.isSafeInteger) || text + data + bss !== dec || parseInt(row[5], 16) !== dec) {
    throw new Error('INVALID_SIZE_OUTPUT');
  }

  const flashUsed = text + data;
  const ramUsed = data + bss;

  const flashOverflow = flashUsed > flashTotal;
  const ramOverflow = ramUsed > ramTotal;
  const overflow = flashOverflow || ramOverflow;

  return {
    text,
    data,
    bss,
    flashUsed,
    ramUsed,
    flashTotal,
    ramTotal,
    flashOverflow,
    ramOverflow,
    overflow,
  };
}

async function inspectElf(elfPath, packOrTargetId, opts = {}) {
  if (!fs.existsSync(elfPath)) {
    return { valid: false, code: 'ELF_FILE_NOT_FOUND', error: 'ELF_FILE_NOT_FOUND' };
  }

  const elfHash = sha256File(elfPath);
  const mapPath = path.join(path.dirname(elfPath), 'firmware.map');
  const mapHash = sha256File(mapPath);

  const binPath = path.join(path.dirname(elfPath), 'firmware.bin');
  const hexPath = path.join(path.dirname(elfPath), 'firmware.hex');

  const hashes = { elf: elfHash, map: mapHash, bin: sha256File(binPath), hex: sha256File(hexPath) };
  const fail = code => ({ valid: false, code, error: code, hashes });
  const targetId = require('./targetPackLoader.cjs').normalizeTargetId(typeof packOrTargetId === 'string' ? packOrTargetId : packOrTargetId?.targetId);
  const prefix = targetId.startsWith('atmega') ? 'avr-' : targetId.startsWith('stm32') ? 'arm-none-eabi-' : targetId.startsWith('esp32') ? 'xtensa-esp32-elf-' : '';
  function runTool(kind, args) {
    let executable = opts[`${kind}Executable`];
    if (!executable) {
      const { resolveToolExecutable } = require('./toolchainManager.cjs');
      const compiler = resolveToolExecutable(prefix === 'avr-' ? 'avr-g++' : `${prefix}gcc`, opts.toolchainsDir);
      const companion = compiler && path.join(path.dirname(compiler), `${prefix}${kind}${process.platform === 'win32' ? '.exe' : ''}`);
      executable = companion && fs.existsSync(companion) ? companion : resolveToolExecutable(`${prefix}${kind}`, opts.toolchainsDir);
    }
    if (!executable) throw new Error(`${kind.toUpperCase()}_TOOL_NOT_FOUND`);
    const result = require('node:child_process').spawnSync(executable, args, { encoding: 'utf8', timeout: 30000, windowsHide: true });
    if (result.error || result.status !== 0 || !result.stdout) throw new Error(`${kind.toUpperCase()}_TOOL_FAILED`);
    return result.stdout;
  }
  const injected = opts.mockSizeOutput !== undefined || opts.sizeOutput !== undefined;
  let sizeOutput = opts.mockSizeOutput ?? opts.sizeOutput;
  if (!injected) {
    try { sizeOutput = runTool('size', [elfPath]); }
    catch (error) { return fail(error.message); }
  }
  let memory;
  try { memory = parseMemoryUsage(sizeOutput, packOrTargetId, opts.targetPacksDir); }
  catch { return fail('INVALID_SIZE_OUTPUT'); }
  // Injected measurements support simulation fixtures; production always verifies architecture.
  if (!injected || opts.objdumpOutput !== undefined || opts.objdumpExecutable !== undefined) {
    let output;
    try { output = opts.objdumpOutput ?? runTool('objdump', ['-f', elfPath]); }
    catch (error) { return fail(error.message); }
    const architecture = output.match(/architecture:\s*([^,\r\n]+)/)?.[1].trim();
    const format = output.match(/file format\s+(\S+)/)?.[1];
    const matches = targetId.startsWith('atmega') ? /^avr(?::|$)/.test(architecture || '') && /^elf\d+-avr$/.test(format || '')
      : targetId.startsWith('stm32') ? /^arm(?:v[\w-]+)?(?::|$)/.test(architecture || '') && /^elf\d+-littlearm$/.test(format || '')
      : targetId.startsWith('esp32') ? /^xtensa(?::|$)/.test(architecture || '') && /^elf\d+-xtensa-le$/.test(format || '')
      : Boolean(architecture && format);
    if (!matches) return fail('ELF_ARCHITECTURE_MISMATCH');
  }
  if (memory.overflow) {
    const code = memory.flashOverflow ? 'FLASH_OVERFLOW' : 'RAM_OVERFLOW';
    const detail = memory.flashOverflow
      ? `FLASH overflow: image requires ${memory.flashUsed} bytes but target capacity is ${memory.flashTotal} bytes`
      : `RAM overflow: image requires ${memory.ramUsed} bytes but target capacity is ${memory.ramTotal} bytes`;
    return {
      valid: false,
      code,
      error: code,
      message: detail,
      hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath), hex: sha256File(hexPath) },
      memory,
    };
  }

  return {
    valid: true,
    hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath), hex: sha256File(hexPath) },
    evidence: opts.mockSizeOutput !== undefined || opts.sizeOutput !== undefined ? 'injected' : 'tool-output',
    memory,
  };
}

module.exports = { inspectElf, parseMemoryUsage };
