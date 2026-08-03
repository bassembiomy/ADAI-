import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';
import { DRIVER_MODES } from './targetPackTypes.js';

export interface ValidationError {
  path: string;
  message: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectDeviceErrors(path: string, device: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isObject(device)) {
    return [{ path, message: 'device must be an object' }];
  }
  for (const key of ['architecture', 'core', 'abi']) {
    if (!isString(device[key])) {
      errors.push({ path: `${path}.${key}`, message: `${key} must be a string` });
    }
  }
  if (!isString(device.fpu)) {
    errors.push({ path: `${path}.fpu`, message: 'fpu must be a string' });
  }
  if (device.endianness !== 'little' && device.endianness !== 'big') {
    errors.push({ path: `${path}.endianness`, message: 'endianness must be little or big' });
  }
  if (!isNumber(device.maxCpuClockHz) || device.maxCpuClockHz <= 0) {
    errors.push({ path: `${path}.maxCpuClockHz`, message: 'maxCpuClockHz must be a positive number' });
  }
  return errors;
}

export function validateTargetPackManifest(
  value: unknown,
): { success: true; manifest: TargetPackManifest } | { success: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!isObject(value)) {
    return { success: false, errors: [{ path: '', message: 'manifest must be an object' }] };
  }

  for (const key of ['schemaVersion', 'targetId', 'deviceRevision', 'displayName', 'contentHash']) {
    if (!isString(value[key])) {
      errors.push({ path: key, message: `${key} must be a string` });
    }
  }

  errors.push(...collectDeviceErrors('device', value.device));

  if (!isArray(value.memoryRegions) || value.memoryRegions.length === 0) {
    errors.push({ path: 'memoryRegions', message: 'memoryRegions must be a non-empty array' });
  } else {
    value.memoryRegions.forEach((region, idx) => {
      if (!isObject(region) || !isString(region.name) || !isNumber(region.start) || !isNumber(region.size)) {
        errors.push({ path: `memoryRegions[${idx}]`, message: 'region must have name, start, size' });
      }
    });
  }

  if (!isArray(value.supportedDriverModes) || value.supportedDriverModes.length === 0) {
    errors.push({ path: 'supportedDriverModes', message: 'supportedDriverModes must be a non-empty array' });
  } else {
    value.supportedDriverModes.forEach((mode, idx) => {
      if (!DRIVER_MODES.includes(mode as DriverMode)) {
        errors.push({ path: `supportedDriverModes[${idx}]`, message: `driver mode must be one of ${DRIVER_MODES.join(', ')}` });
      }
    });
  }

  if (!isArray(value.pinnedToolchains) || value.pinnedToolchains.length === 0) {
    errors.push({ path: 'pinnedToolchains', message: 'pinnedToolchains must be a non-empty array' });
  } else {
    value.pinnedToolchains.forEach((tc, idx) => {
      if (!isObject(tc) || !isString(tc.name) || !isString(tc.version)) {
        errors.push({ path: `pinnedToolchains[${idx}]`, message: 'toolchain must have name and version' });
      }
    });
  }

  if (!isArray(value.pins)) {
    errors.push({ path: 'pins', message: 'pins must be an array' });
  }

  if (!isArray(value.peripheralConstraints)) {
    errors.push({ path: 'peripheralConstraints', message: 'peripheralConstraints must be an array' });
  }

  if (!isObject(value.buildRecipes)) {
    errors.push({ path: 'buildRecipes', message: 'buildRecipes must be an object' });
  } else {
    if (!isArray(value.buildRecipes.compilerFlags)) {
      errors.push({ path: 'buildRecipes.compilerFlags', message: 'compilerFlags must be an array' });
    }
    if (!isArray(value.buildRecipes.linkerFlags)) {
      errors.push({ path: 'buildRecipes.linkerFlags', message: 'linkerFlags must be an array' });
    }
  }

  if (!isArray(value.programmers)) {
    errors.push({ path: 'programmers', message: 'programmers must be an array' });
  }

  if (!isObject(value.capabilityManifest)) {
    errors.push({ path: 'capabilityManifest', message: 'capabilityManifest must be an object' });
  } else {
    if (!isArray(value.capabilityManifest.supportedPeripherals)) {
      errors.push({ path: 'capabilityManifest.supportedPeripherals', message: 'supportedPeripherals must be an array' });
    }
    if (!isArray(value.capabilityManifest.certifiedStatuses)) {
      errors.push({ path: 'capabilityManifest.certifiedStatuses', message: 'certifiedStatuses must be an array' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, manifest: value as unknown as TargetPackManifest };
}
