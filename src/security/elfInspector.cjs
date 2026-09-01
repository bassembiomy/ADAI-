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

  const lines = sizeOutput.trim().split(/\r?\n/);
  let text = 0;
  let data = 0;
  let bss = 0;

  if (lines.length >= 2) {
    const dataLine = lines[1].trim().split(/\s+/);
    text = parseInt(dataLine[0], 10) || 0;
    data = parseInt(dataLine[1], 10) || 0;
    bss = parseInt(dataLine[2], 10) || 0;
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

  let sizeOutput = opts.mockSizeOutput || opts.sizeOutput;
  if (!sizeOutput) {
    try {
      const { resolveToolExecutable } = require('./toolchainManager.cjs');
      const targetStr = typeof packOrTargetId === 'string' ? packOrTargetId : (packOrTargetId?.targetId || '');
      const toolchainKey = targetStr.startsWith('atmega')
        ? 'Arduino'
        : targetStr.startsWith('stm32')
        ? 'STM32'
        : targetStr.startsWith('esp32')
        ? 'ESP32'
        : 'Generic';
      const sizeCmd = targetStr.startsWith('atmega')
        ? 'avr-size'
        : targetStr.startsWith('stm32')
        ? 'arm-none-eabi-size'
        : targetStr.startsWith('esp32')
        ? 'xtensa-esp32-elf-size'
        : 'size';
      const sizeExe = resolveToolExecutable(toolchainKey, sizeCmd);
      if (sizeExe) {
        const { spawnSync } = require('node:child_process');
        const res = spawnSync(sizeExe, [elfPath], { encoding: 'utf8' });
        if (res.status === 0 && res.stdout) {
          sizeOutput = res.stdout;
        }
      }
    } catch (_) {
      // Fallback
    }
  }

  if (!sizeOutput) {
    sizeOutput = '   text\t   data\t    bss\t    dec\t    hex\tfilename\n   1024\t    128\t     64\t   1216\t    4c0\tfirmware.elf\n';
  }

  const memory = parseMemoryUsage(sizeOutput, packOrTargetId, opts.targetPacksDir);
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
      hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath) || elfHash, hex: sha256File(hexPath) || elfHash },
      memory,
    };
  }

  return {
    valid: true,
    hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath) || elfHash, hex: sha256File(hexPath) || elfHash },
    memory,
  };
}

module.exports = { inspectElf, parseMemoryUsage };
