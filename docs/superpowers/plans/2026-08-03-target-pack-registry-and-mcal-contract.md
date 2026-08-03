# Target-Pack Registry and MCAL Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational target-pack registry, validation, discovery, and stable MCAL public-API contract so later component/driver/platform generators can discover, trust, and consume exact-device target packs without embedding target-specific conditionals.

**Architecture:** A read-only `TargetRegistry` loads immutable target packs from a configured search path, validates their manifests against a runtime schema, and exposes strongly typed pack metadata plus a driver-mode selector. A separate `mcalHeaderGenerator` renders the stable `adia_mcal.h` contract from the model's peripheral mappings and the selected pack's channel metadata.

**Tech Stack:** TypeScript (ES modules), Vitest, Node `crypto` for hashes, no external validation libraries.

## Global Constraints

- MCU support shall be added through versioned target packs rather than by adding target-specific conditionals to the state-machine generator.
- A package may be compiled, flashed, or certified only after resolving to an exact target ID and target-pack version.
- Family labels such as `STM32F4` shall remain migration aliases only.
- The component layer shall own orchestration but shall contain no direct vendor register or SDK calls.
- Driver generation shall consume target-owned pin, clock, interrupt, DMA, and peripheral capability metadata. It shall not infer register addresses or alternate-function selections from free-form user strings.
- Unused peripherals shall not create source code, initialization calls, or memory allocations.
- Renderer data shall never become executable command text. Tool invocations shall use target-owned executables and fixed argument arrays with `shell: false`.
- Builds shall run in contained temporary workspaces with file-count, file-size, output-size, concurrency, and timeout limits.
- Browser mode may generate source packages but shall not claim local compile, flash, self-test, or HIL execution.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/targetPacks/targetPackTypes.ts` | TypeScript interfaces for the target-pack manifest and all sub-records. |
| `src/engine/targetPacks/targetPackSchema.ts` | Runtime validators that turn JSON manifests into typed, validated objects or `ValidationError[]`. |
| `src/engine/targetPacks/packResolver.ts` | Discover packs under a configured search path and load/validate their manifests. |
| `src/engine/targetPacks/TargetRegistry.ts` | Immutable registry holding all loaded packs; enforces unique IDs, schema compatibility, and driver-mode support. |
| `src/engine/mcal/mcalTypes.ts` | TypeScript model for MCAL channels, peripherals, status codes, and operation kinds. |
| `src/engine/mcal/mcalHeaderGenerator.ts` | Renders `adia_mcal.h` from a model's mappings and the selected pack's channel metadata. |
| `scripts/validate_target_pack.ts` | CLI entry point that loads a pack directory and prints validation results. |

---

### Task 1: Target pack manifest types

**Files:**
- Create: `src/engine/targetPacks/targetPackTypes.ts`
- Test: `src/engine/targetPacks/targetPackTypes.test.ts`

**Interfaces:**
- Produces: `TargetPackManifest`, `TargetDevice`, `TargetMemoryRegion`, `DriverMode`, `TargetPin`, `TargetPeripheralConstraint`, `TargetBuildRecipe`, `TargetProgrammer`, `TargetCapabilityManifest`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/targetPacks/targetPackTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';

describe('target pack types compile and accept a valid shape', () => {
  it('accepts a minimal manifest', () => {
    const manifest: TargetPackManifest = {
      schemaVersion: '1.0.0',
      targetId: 'stm32f103c8t6',
      deviceRevision: 'A',
      displayName: 'STM32F103C8T6',
      device: {
        architecture: 'armv7-m',
        core: 'cortex-m3',
        fpu: 'none',
        abi: 'eabi',
        endianness: 'little',
        maxCpuClockHz: 72_000_000,
      },
      memoryRegions: [
        { name: 'flash', start: 0x0800_0000, size: 64 * 1024 },
        { name: 'sram', start: 0x2000_0000, size: 20 * 1024 },
      ],
      supportedDriverModes: ['vendor', 'bare-metal'] as DriverMode[],
      pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '13.2.1' }],
      pins: [],
      peripheralConstraints: [],
      buildRecipes: {
        compilerFlags: ['-mcpu=cortex-m3', '-mthumb', '-O2', '-Wall', '-Wextra'],
        linkerFlags: ['-Tlinker/stm32f103c8t6.ld'],
      },
      programmers: [],
      capabilityManifest: {
        supportedPeripherals: ['gpio', 'adc', 'pwm', 'uart'],
        certifiedStatuses: ['STATIC_ANALYSIS_ONLY', 'GENERATED_WITH_STUBS'],
      },
      contentHash: 'deadbeef',
    };
    expect(manifest.targetId).toBe('stm32f103c8t6');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/targetPacks/targetPackTypes.test.ts`

Expected: FAIL with module not found / type not found errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/targetPacks/targetPackTypes.ts`:

```ts
export type DriverMode = 'vendor' | 'bare-metal';

export interface TargetDevice {
  architecture: string;
  core: string;
  fpu: 'none' | 'fpv4-sp-d16' | 'fpv5-d16' | string;
  abi: string;
  endianness: 'little' | 'big';
  maxCpuClockHz: number;
}

export interface TargetMemoryRegion {
  name: string;
  start: number;
  size: number;
}

export interface ToolchainPin {
  name: string;
  version: string;
}

export interface TargetPin {
  id: string;
  port?: string;
  pin: number | string;
  alternateFunctions?: Record<string, string>;
  electrical?: string;
}

export interface TargetPeripheralConstraint {
  peripheral: string;
  instance?: string;
  interrupt?: string;
  dmaChannels?: string[];
  maxClockHz?: number;
}

export interface TargetBuildRecipe {
  compilerFlags: string[];
  linkerFlags: string[];
  defines?: string[];
  includePaths?: string[];
}

export interface TargetProgrammer {
  id: string;
  name: string;
  detectionCommand?: string[];
}

export interface TargetCapabilityManifest {
  supportedPeripherals: string[];
  certifiedStatuses: string[];
}

export interface TargetPackManifest {
  schemaVersion: string;
  targetId: string;
  deviceRevision: string;
  displayName: string;
  device: TargetDevice;
  memoryRegions: TargetMemoryRegion[];
  supportedDriverModes: DriverMode[];
  pinnedToolchains: ToolchainPin[];
  pins: TargetPin[];
  peripheralConstraints: TargetPeripheralConstraint[];
  buildRecipes: TargetBuildRecipe;
  programmers: TargetProgrammer[];
  capabilityManifest: TargetCapabilityManifest;
  contentHash: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/targetPacks/targetPackTypes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/targetPacks/targetPackTypes.ts \
        src/engine/targetPacks/targetPackTypes.test.ts
git commit -m "feat(target-packs): add target pack manifest types"
```

---

### Task 2: Target pack schema validator

**Files:**
- Create: `src/engine/targetPacks/targetPackSchema.ts`
- Test: `src/engine/targetPacks/targetPackSchema.test.ts`

**Interfaces:**
- Consumes: `TargetPackManifest` types from Task 1.
- Produces: `validateTargetPackManifest(value: unknown): { success: true; manifest: TargetPackManifest } | { success: false; errors: ValidationError[] }`, `ValidationError` type.

- [ ] **Step 1: Write the failing test**

Create `src/engine/targetPacks/targetPackSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateTargetPackManifest } from './targetPackSchema.js';
import type { TargetPackManifest } from './targetPackTypes.js';

const validManifest: TargetPackManifest = {
  schemaVersion: '1.0.0',
  targetId: 'stm32f103c8t6',
  deviceRevision: 'A',
  displayName: 'STM32F103C8T6',
  device: {
    architecture: 'armv7-m',
    core: 'cortex-m3',
    fpu: 'none',
    abi: 'eabi',
    endianness: 'little',
    maxCpuClockHz: 72_000_000,
  },
  memoryRegions: [{ name: 'flash', start: 0x0800_0000, size: 65536 }],
  supportedDriverModes: ['vendor'],
  pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '13.2.1' }],
  pins: [],
  peripheralConstraints: [],
  buildRecipes: { compilerFlags: ['-mcpu=cortex-m3'], linkerFlags: [] },
  programmers: [],
  capabilityManifest: { supportedPeripherals: ['gpio'], certifiedStatuses: [] },
  contentHash: 'deadbeef',
};

describe('validateTargetPackManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateTargetPackManifest(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.targetId).toBe('stm32f103c8t6');
    }
  });

  it('rejects a missing targetId', () => {
    const bad = { ...validManifest, targetId: undefined };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path === 'targetId')).toBe(true);
    }
  });

  it('rejects an unsupported driver mode', () => {
    const bad = { ...validManifest, supportedDriverModes: ['shim'] };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path === 'supportedDriverModes')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/targetPacks/targetPackSchema.test.ts`

Expected: FAIL with `validateTargetPackManifest` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/targetPacks/targetPackSchema.ts`:

```ts
import type { TargetPackManifest, DriverMode, TargetDevice } from './targetPackTypes.js';

export interface ValidationError {
  path: string;
  message: string;
}

const DRIVER_MODES: DriverMode[] = ['vendor', 'bare-metal'];

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
  if (!['none', 'fpv4-sp-d16', 'fpv5-d16'].includes(String(device.fpu)) && !isString(device.fpu)) {
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

  return { success: true, manifest: value as TargetPackManifest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/targetPacks/targetPackSchema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/targetPacks/targetPackSchema.ts \
        src/engine/targetPacks/targetPackSchema.test.ts
git commit -m "feat(target-packs): add manifest schema validator"
```

---

### Task 3: Pack discovery and resolver

**Files:**
- Create: `src/engine/targetPacks/packResolver.ts`
- Test: `src/engine/targetPacks/packResolver.test.ts`
- Create fixture: `src/engine/targetPacks/__fixtures__/valid-pack/manifest.json`

**Interfaces:**
- Consumes: `validateTargetPackManifest` from Task 2.
- Produces: `resolvePacks(searchPath: string): Promise<ResolvedPack[]>`, `ResolvedPack` = `{ manifest: TargetPackManifest; packPath: string; manifestPath: string; }`.

- [ ] **Step 1: Write the failing test**

Create fixture directory and a minimal valid manifest in `src/engine/targetPacks/__fixtures__/valid-pack/manifest.json`:

```json
{
  "schemaVersion": "1.0.0",
  "targetId": "atmega328p",
  "deviceRevision": "A",
  "displayName": "ATmega328P",
  "device": {
    "architecture": "avr",
    "core": "avr5",
    "fpu": "none",
    "abi": "eabi",
    "endianness": "little",
    "maxCpuClockHz": 16000000
  },
  "memoryRegions": [
    { "name": "flash", "start": 0, "size": 32768 },
    { "name": "sram", "start": 256, "size": 2048 }
  ],
  "supportedDriverModes": ["vendor"],
  "pinnedToolchains": [{ "name": "avr-gcc", "version": "14.1.0" }],
  "pins": [],
  "peripheralConstraints": [],
  "buildRecipes": {
    "compilerFlags": ["-mmcu=atmega328p", "-Os"],
    "linkerFlags": []
  },
  "programmers": [],
  "capabilityManifest": {
    "supportedPeripherals": ["gpio", "adc", "pwm", "uart"],
    "certifiedStatuses": ["STATIC_ANALYSIS_ONLY"]
  },
  "contentHash": "fixture-hash-1"
}
```

Create `src/engine/targetPacks/packResolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePacks } from './packResolver.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('resolvePacks', () => {
  it('discovers and validates a valid pack fixture', async () => {
    const packs = await resolvePacks(resolve(__dirname, '__fixtures__'));
    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.targetId).toBe('atmega328p');
    expect(packs[0].packPath).toContain('valid-pack');
  });

  it('returns an empty array for a non-existent directory', async () => {
    const packs = await resolvePacks(resolve(__dirname, '__fixtures__', 'missing'));
    expect(packs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/targetPacks/packResolver.test.ts`

Expected: FAIL with `resolvePacks` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/targetPacks/packResolver.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TargetPackManifest } from './targetPackTypes.js';
import { validateTargetPackManifest } from './targetPackSchema.js';

export interface ResolvedPack {
  manifest: TargetPackManifest;
  packPath: string;
  manifestPath: string;
}

export async function resolvePacks(searchPath: string): Promise<ResolvedPack[]> {
  const packs: ResolvedPack[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(searchPath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packPath = resolve(searchPath, entry.name);
    const manifestPath = resolve(packPath, 'manifest.json');
    try {
      const raw = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = validateTargetPackManifest(parsed);
      if (result.success) {
        packs.push({ manifest: result.manifest, packPath, manifestPath });
      }
    } catch {
      // Skip directories without a valid manifest.json
    }
  }

  return packs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/targetPacks/packResolver.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/targetPacks/packResolver.ts \
        src/engine/targetPacks/packResolver.test.ts \
        src/engine/targetPacks/__fixtures__/valid-pack/manifest.json
git commit -m "feat(target-packs): add pack discovery resolver"
```

---

### Task 4: TargetRegistry

**Files:**
- Create: `src/engine/targetPacks/TargetRegistry.ts`
- Test: `src/engine/targetPacks/TargetRegistry.test.ts`

**Interfaces:**
- Consumes: `ResolvedPack` from Task 3, `DriverMode` from Task 1.
- Produces: `class TargetRegistry { constructor(packs: ResolvedPack[]); getTarget(targetId: string): TargetPackManifest | undefined; select(targetId: string, driverMode: DriverMode): { manifest: TargetPackManifest; driverMode: DriverMode } | TargetRegistryError; getAllTargetIds(): string[]; }`, `TargetRegistryError` type.

- [ ] **Step 1: Write the failing test**

Create `src/engine/targetPacks/TargetRegistry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TargetRegistry } from './TargetRegistry.js';
import type { ResolvedPack } from './packResolver.js';
import type { TargetPackManifest } from './targetPackTypes.js';

function makeManifest(targetId: string, modes: ('vendor' | 'bare-metal')[]): TargetPackManifest {
  return {
    schemaVersion: '1.0.0',
    targetId,
    deviceRevision: 'A',
    displayName: targetId,
    device: { architecture: 'arm', core: 'cortex-m0', fpu: 'none', abi: 'eabi', endianness: 'little', maxCpuClockHz: 48_000_000 },
    memoryRegions: [{ name: 'flash', start: 0, size: 65536 }],
    supportedDriverModes: modes,
    pinnedToolchains: [{ name: 'gcc', version: '1.0.0' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: { compilerFlags: [], linkerFlags: [] },
    programmers: [],
    capabilityManifest: { supportedPeripherals: [], certifiedStatuses: [] },
    contentHash: `hash-${targetId}`,
  };
}

describe('TargetRegistry', () => {
  let registry: TargetRegistry;

  beforeEach(() => {
    const packs: ResolvedPack[] = [
      { manifest: makeManifest('stm32f103c8t6', ['vendor', 'bare-metal']), packPath: '/p1', manifestPath: '/p1/manifest.json' },
      { manifest: makeManifest('atmega328p', ['vendor']), packPath: '/p2', manifestPath: '/p2/manifest.json' },
    ];
    registry = new TargetRegistry(packs);
  });

  it('returns all target ids', () => {
    expect(registry.getAllTargetIds().sort()).toEqual(['atmega328p', 'stm32f103c8t6']);
  });

  it('selects a target with a supported driver mode', () => {
    const result = registry.select('stm32f103c8t6', 'bare-metal');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.targetId).toBe('stm32f103c8t6');
      expect(result.driverMode).toBe('bare-metal');
    }
  });

  it('rejects an unsupported driver mode', () => {
    const result = registry.select('atmega328p', 'bare-metal');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('bare-metal');
    }
  });

  it('rejects a family-only target id', () => {
    const result = registry.select('STM32F4', 'vendor');
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/targetPacks/TargetRegistry.test.ts`

Expected: FAIL with `TargetRegistry` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/targetPacks/TargetRegistry.ts`:

```ts
import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';
import type { ResolvedPack } from './packResolver.js';

export interface TargetRegistryError {
  success: false;
  error: string;
}

export interface TargetSelection {
  success: true;
  manifest: TargetPackManifest;
  driverMode: DriverMode;
}

export class TargetRegistry {
  private readonly byId = new Map<string, TargetPackManifest>();

  constructor(packs: ResolvedPack[]) {
    for (const pack of packs) {
      const existing = this.byId.get(pack.manifest.targetId);
      if (existing) {
        throw new Error(`Duplicate targetId ${pack.manifest.targetId}`);
      }
      this.byId.set(pack.manifest.targetId, pack.manifest);
    }
  }

  getTarget(targetId: string): TargetPackManifest | undefined {
    return this.byId.get(targetId);
  }

  getAllTargetIds(): string[] {
    return Array.from(this.byId.keys()).sort();
  }

  select(targetId: string, driverMode: DriverMode): TargetSelection | TargetRegistryError {
    const manifest = this.byId.get(targetId);
    if (!manifest) {
      return { success: false, error: `targetId ${targetId} not found` };
    }
    if (!manifest.supportedDriverModes.includes(driverMode)) {
      return { success: false, error: `driver mode ${driverMode} not supported for ${targetId}` };
    }
    return { success: true, manifest, driverMode };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/targetPacks/TargetRegistry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/targetPacks/TargetRegistry.ts \
        src/engine/targetPacks/TargetRegistry.test.ts
git commit -m "feat(target-packs): add immutable TargetRegistry"
```

---

### Task 5: MCAL contract types

**Files:**
- Create: `src/engine/mcal/mcalTypes.ts`
- Test: `src/engine/mcal/mcalTypes.test.ts`

**Interfaces:**
- Produces: `McalChannel`, `McalPeripheral`, `McalStatusCode`, `McalOperationKind`, `McalChannelConfig`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/mcal/mcalTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { McalChannelConfig, McalPeripheral } from './mcalTypes.js';

describe('MCAL types accept valid configs', () => {
  it('accepts a GPIO channel config', () => {
    const gpio: McalChannelConfig = {
      peripheral: 'gpio',
      channelId: 'LED_0',
      pin: 'PA0',
      direction: 'output',
      safeValue: false,
    };
    expect(gpio.peripheral).toBe('gpio');
  });

  it('accepts an ADC channel config', () => {
    const adc: McalChannelConfig = {
      peripheral: 'adc',
      channelId: 'TEMP_SENSOR',
      pin: 'PA1',
      direction: 'input',
      units: 'millivolts',
      scale: { numerator: 3300, denominator: 4095, offset: 0 },
      safeValue: 0,
    };
    expect(adc.scale?.numerator).toBe(3300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/mcal/mcalTypes.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/mcal/mcalTypes.ts`:

```ts
export type McalPeripheral =
  | 'gpio'
  | 'adc'
  | 'dac'
  | 'pwm'
  | 'uart'
  | 'spi'
  | 'i2c'
  | 'can'
  | 'timer'
  | 'capture'
  | 'watchdog'
  | 'systemClock'
  | 'resetReason'
  | 'nonvolatileStorage';

export type McalStatusCode =
  | 'OK'
  | 'ERROR'
  | 'TIMEOUT'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_CHANNEL'
  | 'INVALID_STATE'
  | 'HEALTH_FAULT';

export type McalOperationKind =
  | 'init'
  | 'deinit'
  | 'read'
  | 'write'
  | 'health'
  | 'safeState';

export type McalDirection = 'input' | 'output';

export interface McalScale {
  numerator: number;
  denominator: number;
  offset: number;
}

export interface McalRange {
  min: number;
  max: number;
}

export interface McalChannelConfig {
  peripheral: McalPeripheral;
  channelId: string;
  pin?: string;
  direction?: McalDirection;
  units?: string;
  scale?: McalScale;
  range?: McalRange;
  safeValue: boolean | number;
  timeoutMs?: number;
}

export interface McalHeaderModel {
  packTargetId: string;
  channels: McalChannelConfig[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/mcal/mcalTypes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/mcal/mcalTypes.ts \
        src/engine/mcal/mcalTypes.test.ts
git commit -m "feat(mcal): add MCAL channel and status types"
```

---

### Task 6: MCAL header generator

**Files:**
- Create: `src/engine/mcal/mcalHeaderGenerator.ts`
- Test: `src/engine/mcal/mcalHeaderGenerator.test.ts`

**Interfaces:**
- Consumes: `McalHeaderModel`, `McalStatusCode`, `McalChannelConfig`, `McalPeripheral` from Task 5.
- Produces: `generateMcalHeader(model: McalHeaderModel): string` returning the full `adia_mcal.h` source.

- [ ] **Step 1: Write the failing test**

Create `src/engine/mcal/mcalHeaderGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMcalHeader } from './mcalHeaderGenerator.js';
import type { McalHeaderModel } from './mcalTypes.js';

const emptyModel: McalHeaderModel = {
  packTargetId: 'stm32f103c8t6',
  channels: [],
};

const gpioModel: McalHeaderModel = {
  packTargetId: 'stm32f103c8t6',
  channels: [
    { peripheral: 'gpio', channelId: 'LED_0', pin: 'PA0', direction: 'output', safeValue: false },
    { peripheral: 'gpio', channelId: 'BUTTON_0', pin: 'PA1', direction: 'input', safeValue: false },
  ],
};

describe('generateMcalHeader', () => {
  it('emits header guard and status enum', () => {
    const header = generateMcalHeader(emptyModel);
    expect(header).toContain('#ifndef ADIA_MCAL_H');
    expect(header).toContain('#define ADIA_MCAL_H');
    expect(header).toContain('adia_mcal_status_t');
    expect(header).toContain('ADIA_MCAL_OK');
  });

  it('emits channel enums only for used peripherals', () => {
    const header = generateMcalHeader(gpioModel);
    expect(header).toContain('adia_mcal_gpio_channel_t');
    expect(header).toContain('ADIA_MCAL_GPIO_LED_0');
    expect(header).toContain('ADIA_MCAL_GPIO_BUTTON_0');
    expect(header).not.toContain('adia_mcal_adc_channel_t');
  });

  it('emits function prototypes for used peripherals', () => {
    const header = generateMcalHeader(gpioModel);
    expect(header).toContain('adia_mcal_gpio_init(void)');
    expect(header).toContain('adia_mcal_gpio_read(');
    expect(header).toContain('adia_mcal_gpio_write(');
  });

  it('includes the target id in a comment', () => {
    const header = generateMcalHeader(emptyModel);
    expect(header).toContain('Target: stm32f103c8t6');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/mcal/mcalHeaderGenerator.test.ts`

Expected: FAIL with `generateMcalHeader` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/mcal/mcalHeaderGenerator.ts`:

```ts
import type { McalHeaderModel, McalPeripheral } from './mcalTypes.js';

const STATUS_CODES = [
  ['ADIA_MCAL_OK', 0],
  ['ADIA_MCAL_ERROR', 1],
  ['ADIA_MCAL_TIMEOUT', 2],
  ['ADIA_MCAL_NOT_IMPLEMENTED', 3],
  ['ADIA_MCAL_INVALID_CHANNEL', 4],
  ['ADIA_MCAL_INVALID_STATE', 5],
  ['ADIA_MCAL_HEALTH_FAULT', 6],
] as const;

function usedPeripherals(model: McalHeaderModel): McalPeripheral[] {
  const set = new Set<McalPeripheral>();
  for (const ch of model.channels) {
    set.add(ch.peripheral);
  }
  return Array.from(set).sort();
}

function peripheralPrefix(p: McalPeripheral): string {
  return `adia_mcal_${p}`;
}

function channelEnumName(p: McalPeripheral): string {
  return `${peripheralPrefix(p)}_channel_t`;
}

export function generateMcalHeader(model: McalHeaderModel): string {
  const peripherals = usedPeripherals(model);
  const lines: string[] = [];

  lines.push('/* Generated by ADIA. Do not edit manually. */');
  lines.push(`/* Target: ${model.packTargetId} */`);
  lines.push('#ifndef ADIA_MCAL_H');
  lines.push('#define ADIA_MCAL_H');
  lines.push('');
  lines.push('#include <stdbool.h>');
  lines.push('#include <stdint.h>');
  lines.push('');
  lines.push('typedef enum {');
  for (const [name, value] of STATUS_CODES) {
    lines.push(`  ${name} = ${value},`);
  }
  lines.push('} adia_mcal_status_t;');
  lines.push('');

  for (const p of peripherals) {
    const channels = model.channels.filter(c => c.peripheral === p);
    const enumName = channelEnumName(p);
    lines.push(`typedef enum ${enumName} {`);
    for (const ch of channels) {
      lines.push(`  ${peripheralPrefix(p).toUpperCase()}_${ch.channelId},`);
    }
    lines.push(`} ${enumName};`);
    lines.push('');
  }

  lines.push('#ifdef __cplusplus');
  lines.push('extern "C" {');
  lines.push('#endif');
  lines.push('');

  for (const p of peripherals) {
    const prefix = peripheralPrefix(p);
    const enumName = channelEnumName(p);
    lines.push(`adia_mcal_status_t ${prefix}_init(void);`);
    lines.push(`adia_mcal_status_t ${prefix}_deinit(void);`);
    lines.push(`adia_mcal_status_t ${prefix}_health(void);`);
    lines.push(`adia_mcal_status_t ${prefix}_safe_state(void);`);
    if (p === 'gpio' || p === 'adc' || p === 'dac' || p === 'pwm') {
      lines.push(`adia_mcal_status_t ${prefix}_read(${enumName} ch, int32_t *out_value);`);
      lines.push(`adia_mcal_status_t ${prefix}_write(${enumName} ch, int32_t value);`);
    }
    lines.push('');
  }

  lines.push('#ifdef __cplusplus');
  lines.push('}');
  lines.push('#endif');
  lines.push('');
  lines.push('#endif /* ADIA_MCAL_H */');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/mcal/mcalHeaderGenerator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/mcal/mcalHeaderGenerator.ts \
        src/engine/mcal/mcalHeaderGenerator.test.ts
git commit -m "feat(mcal): add adia_mcal.h generator"
```

---

### Task 7: CLI target-pack validator

**Files:**
- Create: `scripts/validate_target_pack.ts`

**Interfaces:**
- Consumes: `resolvePacks` from Task 3.
- Produces: CLI exit code 0 on success, 1 on failure with printed diagnostics.

- [ ] **Step 1: Write the failing test**

Create a smoke test in `src/engine/targetPacks/validateCli.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, '..', '..', 'scripts', 'validate_target_pack.ts');
const fixture = resolve(__dirname, '__fixtures__', 'valid-pack');

describe('validate_target_pack CLI', () => {
  it('exits 0 for the valid fixture', () => {
    const output = execSync(`npx tsx ${script} ${fixture}`, { encoding: 'utf8' });
    expect(output).toContain('VALID');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/targetPacks/validateCli.test.ts`

Expected: FAIL with ENOENT or non-zero exit.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/validate_target_pack.ts`:

```ts
import { resolvePacks } from '../src/engine/targetPacks/packResolver.js';

async function main() {
  const [searchPath] = process.argv.slice(2);
  if (!searchPath) {
    console.error('Usage: npx tsx scripts/validate_target_pack.ts <path-to-pack-or-search-dir>');
    process.exit(1);
  }

  const packs = await resolvePacks(searchPath);
  if (packs.length === 0) {
    console.error('No valid target packs found.');
    process.exit(1);
  }

  for (const pack of packs) {
    console.log(`VALID: ${pack.manifest.targetId} @ ${pack.packPath}`);
  }
  console.log(`${packs.length} pack(s) validated.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/targetPacks/validateCli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_target_pack.ts \
        src/engine/targetPacks/validateCli.test.ts
git commit -m "feat(target-packs): add target pack validation CLI"
```

---

## Self-Review

**1. Spec coverage:**

| Spec Section | Covered By |
|---|---|
| 3: Architecture remains generic, platform access crosses component/MCAL interfaces | Registry + MCAL header contract enforce no vendor code in generic layers. |
| 4.3: MCAL layer typed read/write, explicit status, init/health/safe-state | Task 5 + Task 6. |
| 4.3: Unused peripherals shall not create source code | `generateMcalHeader` emits enums/prototypes only for used peripherals. |
| 4.4: Driver mode `vendor`/`bare-metal` selection | `TargetRegistry.select` validates supported modes. |
| 4.4: No free-form register inference | Typed channel handles in generated header. |
| 5: Target-pack contract fields | Task 1 + Task 2. |
| 5.1: Packaging/discovery/driver-mode selection | Task 3 + Task 4. |
| 8: Renderer data not executable | CLI and registry load JSON manifests; no command strings rendered here. |
| 9: Status model | Not covered — this is foundational; status/evidence chain belongs in a later sub-plan. |

**Gaps to address in later sub-plans:**
- Content hash verification (currently manifest stores hash but registry does not verify it).
- Pin-mux/electrical/peripheral-conflict validation.
- Build-recipe allowlist enforcement.
- Evidence/status chain.

**2. Placeholder scan:**
No TBD/TODO placeholders; every step includes concrete code, exact file paths, and exact commands.

**3. Type consistency:**
- `DriverMode`, `TargetPackManifest`, `ResolvedPack`, `TargetRegistry` names match across tasks.
- `McalHeaderModel` and `McalChannelConfig` names match across Task 5 and Task 6.
