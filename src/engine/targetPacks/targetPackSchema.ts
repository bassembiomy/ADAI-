import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';
import { DRIVER_MODES } from './targetPackTypes.js';

const SUPPORTED_SCHEMA_VERSION = '1.0.0';
const SAFE_IDENTIFIER = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_TOKEN = /^[A-Za-z0-9._:+/-]{1,255}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const CERTIFIED_STATUSES = new Set([
  'STATIC_ANALYSIS_ONLY',
  'GENERATED_WITH_STUBS',
  'TARGET_COMPILE_VERIFIED',
  'LINKED_IMAGE_VERIFIED',
  'FLASH_VERIFIED',
  'SELF_TEST_VERIFIED',
  'EXTERNAL_HIL_VERIFIED',
  'RELEASE_READY',
]);
const PERIPHERALS = new Set([
  'gpio', 'adc', 'dac', 'pwm', 'uart', 'spi', 'i2c', 'can', 'timer',
  'capture', 'watchdog', 'systemclock', 'resetreason', 'nonvolatilestorage',
]);

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

function validateStringArray(
  value: unknown,
  path: string,
  errors: ValidationError[],
  predicate: (item: string) => boolean = () => true,
): void {
  if (!isArray(value)) {
    errors.push({ path, message: `${path} must be an array` });
    return;
  }
  value.forEach((item, index) => {
    if (!isString(item) || !predicate(item)) {
      errors.push({ path: `${path}[${index}]`, message: `${path} entries must be valid strings` });
    }
  });
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

  for (const key of ['schemaVersion', 'packVersion', 'minimumGeneratorSchemaVersion', 'targetId', 'deviceRevision', 'displayName', 'contentHash']) {
    if (!isString(value[key])) {
      errors.push({ path: key, message: `${key} must be a string` });
    }
  }
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', message: `schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}` });
  }
  if (!isString(value.packVersion) || !SEMVER.test(value.packVersion)) {
    errors.push({ path: 'packVersion', message: 'packVersion must be semantic version x.y.z' });
  }
  if (value.minimumGeneratorSchemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    errors.push({
      path: 'minimumGeneratorSchemaVersion',
      message: `minimumGeneratorSchemaVersion must be compatible with ${SUPPORTED_SCHEMA_VERSION}`,
    });
  }
  if (!isString(value.targetId) || !SAFE_IDENTIFIER.test(value.targetId)) {
    errors.push({ path: 'targetId', message: 'targetId must be a lowercase safe identifier' });
  }
  if (!isString(value.contentHash) || !SAFE_TOKEN.test(value.contentHash)) {
    errors.push({ path: 'contentHash', message: 'contentHash must be a non-empty safe token' });
  }

  errors.push(...collectDeviceErrors('device', value.device));

  if (!isArray(value.memoryRegions) || value.memoryRegions.length === 0) {
    errors.push({ path: 'memoryRegions', message: 'memoryRegions must be a non-empty array' });
  } else {
    value.memoryRegions.forEach((region, idx) => {
      if (!isObject(region)) {
        errors.push({ path: `memoryRegions[${idx}]`, message: 'region must be an object' });
        return;
      }
      if (!isString(region.name) || !SAFE_TOKEN.test(region.name)) {
        errors.push({ path: `memoryRegions[${idx}].name`, message: 'region name must be a safe token' });
      }
      if (!isNumber(region.start) || !Number.isInteger(region.start) || region.start < 0) {
        errors.push({ path: `memoryRegions[${idx}].start`, message: 'region start must be a non-negative integer' });
      }
      if (!isNumber(region.size) || !Number.isInteger(region.size) || region.size <= 0) {
        errors.push({ path: `memoryRegions[${idx}].size`, message: 'region size must be a positive integer' });
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

  if (!isArray(value.pins)) errors.push({ path: 'pins', message: 'pins must be an array' });
  else value.pins.forEach((pin, idx) => {
    if (!isObject(pin) || !isString(pin.id) || !SAFE_TOKEN.test(pin.id)
      || (!isString(pin.pin) && !isNumber(pin.pin))) {
      errors.push({ path: `pins[${idx}]`, message: 'pin must contain a safe id and string/number pin' });
    }
  });

  if (!isArray(value.peripheralConstraints)) errors.push({ path: 'peripheralConstraints', message: 'peripheralConstraints must be an array' });
  else value.peripheralConstraints.forEach((constraint, idx) => {
    if (!isObject(constraint) || !isString(constraint.peripheral)
      || !PERIPHERALS.has(constraint.peripheral.toLowerCase())) {
      errors.push({ path: `peripheralConstraints[${idx}]`, message: 'constraint must name a supported peripheral' });
    }
  });

  if (!isObject(value.buildRecipes)) {
    errors.push({ path: 'buildRecipes', message: 'buildRecipes must be an object' });
  } else {
    validateStringArray(value.buildRecipes.compilerFlags, 'buildRecipes.compilerFlags', errors,
      item => item.length <= 255 && !/[\0\r\n]/.test(item));
    validateStringArray(value.buildRecipes.linkerFlags, 'buildRecipes.linkerFlags', errors,
      item => item.length <= 255 && !/[\0\r\n]/.test(item));
  }

  if (!isArray(value.programmers)) errors.push({ path: 'programmers', message: 'programmers must be an array' });
  else value.programmers.forEach((programmer, idx) => {
    if (!isObject(programmer) || !isString(programmer.id) || !SAFE_IDENTIFIER.test(programmer.id)
      || !isString(programmer.name) || programmer.name.length === 0) {
      errors.push({ path: `programmers[${idx}]`, message: 'programmer must contain a safe id and name' });
    }
  });

  if (!isObject(value.capabilityManifest)) {
    errors.push({ path: 'capabilityManifest', message: 'capabilityManifest must be an object' });
  } else {
    validateStringArray(
      value.capabilityManifest.supportedPeripherals,
      'capabilityManifest.supportedPeripherals',
      errors,
      item => PERIPHERALS.has(item.toLowerCase()),
    );
    validateStringArray(
      value.capabilityManifest.certifiedStatuses,
      'capabilityManifest.certifiedStatuses',
      errors,
      item => CERTIFIED_STATUSES.has(item),
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, manifest: value as unknown as TargetPackManifest };
}
