'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BUILTIN_FALLBACK_LIMITS = Object.freeze({
  'atmega328p': { flash: 32256, sram: 2048 },
  'atmega2560': { flash: 262144, sram: 8192 },
  'stm32f103c8t6': { flash: 65536, sram: 20480 },
  'stm32f407vgt6': { flash: 524288, sram: 131072 },
  'esp32-wroom-32': { flash: 4194304, sram: 532480 },
  'Arduino_Uno': { flash: 32256, sram: 2048 },
  'Arduino_Mega': { flash: 262144, sram: 8192 },
  'STM32F1': { flash: 65536, sram: 20480 },
  'STM32F4': { flash: 524288, sram: 131072 },
  'ESP32': { flash: 4194304, sram: 532480 },
  'Generic': { flash: 1048576, sram: 262144 },
});

function normalizeTargetId(targetId) {
  if (!targetId) return 'Generic';
  const tid = String(targetId).trim();
  const map = {
    'Arduino_Uno': 'atmega328p',
    'Arduino_Mega': 'atmega2560',
    'STM32F1': 'stm32f103c8t6',
    'STM32F4': 'stm32f407vgt6',
    'ESP32': 'esp32-wroom-32',
  };
  return map[tid] || tid;
}

function loadTargetPackManifest(targetId, targetPacksDir = path.join(process.cwd(), 'target-packs')) {
  const normId = normalizeTargetId(targetId);
  const manifestPath = path.join(targetPacksDir, normId, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      // ignore parse errors and fallback
    }
  }
  return null;
}

function getTargetLimits(targetId, targetPacksDir) {
  const manifest = loadTargetPackManifest(targetId, targetPacksDir);
  if (manifest && Array.isArray(manifest.memoryRegions)) {
    const flashRegion = manifest.memoryRegions.find(r => /flash/i.test(r.name)) || manifest.memoryRegions[0];
    const ramRegion = manifest.memoryRegions.find(r => /s?ram/i.test(r.name)) || manifest.memoryRegions[1] || manifest.memoryRegions[0];
    return {
      flash: flashRegion ? flashRegion.size : (BUILTIN_FALLBACK_LIMITS[targetId]?.flash ?? 65536),
      sram: ramRegion ? ramRegion.size : (BUILTIN_FALLBACK_LIMITS[targetId]?.sram ?? 20480),
      source: 'manifest',
      manifest,
    };
  }

  const fb = BUILTIN_FALLBACK_LIMITS[targetId] || BUILTIN_FALLBACK_LIMITS[normalizeTargetId(targetId)] || BUILTIN_FALLBACK_LIMITS.Generic;
  return {
    flash: fb.flash,
    sram: fb.sram,
    source: 'fallback',
    manifest: null,
  };
}

module.exports = {
  loadTargetPackManifest,
  getTargetLimits,
  normalizeTargetId,
  BUILTIN_FALLBACK_LIMITS,
};
