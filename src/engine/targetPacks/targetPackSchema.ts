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

const ALLOWED_BUILD_RECIPES = new Set([
  'arm-none-eabi-stm32f103-v1',
  'arm-none-eabi-stm32f407-v1',
  'avr-atmega328p-v1',
  'avr-atmega2560-v1',
  'esp-idf-wroom32-v1',
]);

const ALLOWED_FLASH_RECIPES = new Set([
  'openocd-stm32f103-v1',
  'openocd-stm32f407-v1',
  'avrdude-atmega328p-v1',
  'avrdude-atmega2560-v1',
  'esptool-wroom32-v1',
]);

const ALLOWED_INSPECT_RECIPES = new Set([
  'arm-elf-v1',
  'avr-elf-v1',
  'esp-idf-image-v1',
]);

const ALLOWED_ASSET_KINDS = new Set([
  'startup', 'linker', 'driver', 'sdk-lock', 'hil-fixture',
]);

const SHA256_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HEX_STRING_PATTERN = /^0x[0-9a-fA-F]+$/;

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

  if (value.recipes !== undefined) {
    if (!isObject(value.recipes)) {
      errors.push({ path: 'recipes', message: 'recipes must be an object' });
    } else {
      if (!isString(value.recipes.build) || !ALLOWED_BUILD_RECIPES.has(value.recipes.build)) {
        errors.push({ path: 'recipes.build', message: 'recipes.build must be an allowed build recipe ID' });
      }
      if (!isString(value.recipes.flash) || !ALLOWED_FLASH_RECIPES.has(value.recipes.flash)) {
        errors.push({ path: 'recipes.flash', message: 'recipes.flash must be an allowed flash recipe ID' });
      }
      if (!isString(value.recipes.inspect) || !ALLOWED_INSPECT_RECIPES.has(value.recipes.inspect)) {
        errors.push({ path: 'recipes.inspect', message: 'recipes.inspect must be an allowed inspect recipe ID' });
      }
    }
  }

  if (value.assets !== undefined) {
    if (!isArray(value.assets)) {
      errors.push({ path: 'assets', message: 'assets must be an array' });
    } else {
      const seenPaths = new Set<string>();
      value.assets.forEach((asset, idx) => {
        if (!isObject(asset)) {
          errors.push({ path: `assets[${idx}]`, message: 'asset must be an object' });
          return;
        }
        if (!isString(asset.kind) || !ALLOWED_ASSET_KINDS.has(asset.kind)) {
          errors.push({ path: `assets[${idx}].kind`, message: 'asset kind must be an allowed kind' });
        }
        if (!isString(asset.path) || asset.path.includes('..') || asset.path.startsWith('/') || asset.path.startsWith('\\') || /^[a-zA-Z]:/.test(asset.path)) {
          errors.push({ path: `assets[${idx}].path`, message: 'asset path must be a contained relative path without traversal' });
        } else {
          if (seenPaths.has(asset.path)) {
            errors.push({ path: `assets[${idx}].path`, message: `duplicate asset path ${asset.path}` });
          } else {
            seenPaths.add(asset.path);
          }
        }
        if (!isString(asset.sha256) || !SHA256_HASH_PATTERN.test(asset.sha256)) {
          errors.push({ path: `assets[${idx}].sha256`, message: 'asset sha256 must be a canonical sha256:hash string' });
        }
      });
    }
  }

  if (value.deviceIdentity !== undefined) {
    if (!isObject(value.deviceIdentity)) {
      errors.push({ path: 'deviceIdentity', message: 'deviceIdentity must be an object' });
    } else {
      if (!isString(value.deviceIdentity.mask) || !HEX_STRING_PATTERN.test(value.deviceIdentity.mask)) {
        errors.push({ path: 'deviceIdentity.mask', message: 'deviceIdentity.mask must be a hex string starting with 0x' });
      }
      if (!isString(value.deviceIdentity.value) || !HEX_STRING_PATTERN.test(value.deviceIdentity.value)) {
        errors.push({ path: 'deviceIdentity.value', message: 'deviceIdentity.value must be a hex string starting with 0x' });
      }
      if (value.deviceIdentity.signature !== undefined && (!isString(value.deviceIdentity.signature) || !HEX_STRING_PATTERN.test(value.deviceIdentity.signature))) {
        errors.push({ path: 'deviceIdentity.signature', message: 'deviceIdentity.signature must be a hex string starting with 0x' });
      }
    }
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

  if (value.verificationRecipe !== undefined) {
    if (!isObject(value.verificationRecipe)) {
      errors.push({ path: 'verificationRecipe', message: 'verificationRecipe must be an object' });
    } else {
      const recipe = value.verificationRecipe;
      const SHELL_CONTROL = /[;&|`$<>\0\r\n]/;
      const TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
      const IS_ABSOLUTE = /^(?:\/|\\|[a-zA-Z]:)/;

      if (!isString(recipe.executable) || recipe.executable.length === 0 || SHELL_CONTROL.test(recipe.executable)) {
        errors.push({
          path: 'verificationRecipe.executable',
          message: 'executable must be a non-empty string without shell-control characters',
        });
      }

      validateStringArray(
        recipe.args,
        'verificationRecipe.args',
        errors,
        (item) => item.length <= 255 && !SHELL_CONTROL.test(item),
      );

      validateStringArray(
        recipe.sourceGlobs,
        'verificationRecipe.sourceGlobs',
        errors,
        (item) => !TRAVERSAL.test(item) && !IS_ABSOLUTE.test(item) && !SHELL_CONTROL.test(item),
      );

      validateStringArray(
        recipe.includeDirectories,
        'verificationRecipe.includeDirectories',
        errors,
        (item) => !TRAVERSAL.test(item) && !IS_ABSOLUTE.test(item) && !SHELL_CONTROL.test(item),
      );

      if (!isString(recipe.outputPath) || recipe.outputPath.length === 0 || TRAVERSAL.test(recipe.outputPath) || IS_ABSOLUTE.test(recipe.outputPath) || SHELL_CONTROL.test(recipe.outputPath)) {
        errors.push({
          path: 'verificationRecipe.outputPath',
          message: 'outputPath must be a contained pack-relative path without shell-control characters',
        });
      }

      if (recipe.versionArgs !== undefined) {
        validateStringArray(
          recipe.versionArgs,
          'verificationRecipe.versionArgs',
          errors,
          (item) => !SHELL_CONTROL.test(item),
        );
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, manifest: value as unknown as TargetPackManifest };
}
