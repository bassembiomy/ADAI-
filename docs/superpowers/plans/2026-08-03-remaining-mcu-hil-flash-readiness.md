# Remaining MCU/HIL Flash Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the exact-target build, link, flash, self-test, external-HIL, evidence, and delivery pipeline for `stm32f103c8t6`, `stm32f407vgt6`, `atmega328p`, `atmega2560`, and `esp32-wroom-32` without treating object compilation, compatibility shims, estimates, or disconnected hardware as release evidence.

**Architecture:** Keep the verified state-machine/X-Bridges application generator target-independent. Resolve hardware behavior through immutable target packs that own driver providers, startup/linker assets, fixed build/flash recipes, device identities, and HIL fixtures; execute recipes only in the Electron main process and advance evidence only when the exact artifact passes the corresponding gate.

**Tech Stack:** TypeScript 5.4, Vitest 4, C99/C++, Electron 43 CommonJS IPC, Node `crypto`/`child_process.spawn`, Arm GNU 10.3, AVR GNU 15.2, ESP-IDF, STM32Cube HAL, OpenOCD/STM32CubeProgrammer, avrdude, esptool.

## Completed Baseline

- Exact target selection, target-pack schema/hash validation, immutable registry, MCAL contract rendering, generated component/MCAL integration layers, source-workspace hashes, fixed build-policy IDs, fail-closed flash policy, and honest UI evidence labels are already present.
- Start from commit `8ffd07d` or later and preserve the unrelated user edit in `docs/superpowers/specs/2026-08-02-stateflow-codegen-runtime-efficiency-design.md`.
- Do not weaken `hilBuildPolicy.cjs` or `hilFlashPolicy.cjs` to make a test or demo pass.

## Global Constraints

- A target is always `{ targetId, packVersion, driverMode, boardRevision }`; family aliases are migration input only.
- Target packs are data and hashed assets, never executable renderer-provided command strings.
- Commands use application-owned recipe builders, explicit argument arrays, `shell: false`, contained paths, bounded logs, and timeouts.
- Unsupported providers emit deterministic `ADIA_MCAL_NOT_IMPLEMENTED`, apply safe outputs, appear in `integration_manifest.json`, and block linking evidence, flashing, HIL, and release status.
- `TARGET_COMPILE_VERIFIED` requires the pinned target compiler; `LINKED_IMAGE_VERIFIED` additionally requires a complete ELF and artifact inspection.
- `FLASH_VERIFIED`, `SELF_TEST_VERIFIED`, and `EXTERNAL_HIL_VERIFIED` require physical evidence from the exact board/probe/fixture and remain `NOT_RUN` when hardware is absent.
- Every implementation step follows red-green-refactor and ends with a focused commit.
- No functional-safety certification claim is permitted; `RELEASE_READY` means only that this application's declared engineering gates passed.

---

### Task 1: Extend the target-pack contract for owned assets and fixed recipes

**Files:**
- Modify: `src/engine/targetPacks/targetPackTypes.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.test.ts`
- Modify: `src/engine/targetPacks/packResolver.ts`
- Modify: `src/engine/targetPacks/packResolver.test.ts`
- Create: `src/engine/targetPacks/targetPackAssets.ts`
- Create: `src/engine/targetPacks/targetPackAssets.test.ts`

**Interfaces:**
- Produces: `TargetPackAsset`, `TargetBuildRecipeRef`, `TargetFlashRecipeRef`, `TargetDeviceIdentity`, and `resolveTargetPackAsset(pack, relativePath, expectedHash)`.
- Consumes: existing `TargetPackManifest`, canonical content hashing, and immutable pack registry.

- [ ] **Step 1: Write failing schema tests for asset ownership and recipe references**

```ts
it('rejects traversal, unknown recipes, and unhashed startup assets', () => {
  const result = validateTargetPackManifest({
    ...validManifest,
    assets: [{ kind: 'startup', path: '../startup.c', sha256: '' }],
    recipes: { build: 'renderer-command', flash: 'unknown-flasher' },
  });
  expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining([
    'assets[0].path', 'assets[0].sha256', 'recipes.build', 'recipes.flash',
  ]));
});
```

- [ ] **Step 2: Run the target-pack tests and confirm RED**

Run: `npx vitest run src/engine/targetPacks/targetPackSchema.test.ts src/engine/targetPacks/targetPackAssets.test.ts --reporter=verbose`

Expected: FAIL because the asset and recipe fields/resolver do not exist.

- [ ] **Step 3: Add exact typed fields and recursive validation**

```ts
export interface TargetPackAsset {
  kind: 'startup' | 'linker' | 'driver' | 'sdk-lock' | 'hil-fixture';
  path: string;
  sha256: `sha256:${string}`;
}

export interface TargetRecipeSet {
  build: 'arm-none-eabi-stm32f103-v1' | 'arm-none-eabi-stm32f407-v1'
    | 'avr-atmega328p-v1' | 'avr-atmega2560-v1' | 'esp-idf-wroom32-v1';
  flash: 'openocd-stm32f103-v1' | 'openocd-stm32f407-v1'
    | 'avrdude-atmega328p-v1' | 'avrdude-atmega2560-v1' | 'esptool-wroom32-v1';
  inspect: 'arm-elf-v1' | 'avr-elf-v1' | 'esp-idf-image-v1';
}
```

Reject absolute paths, `..`, symlinks escaping the pack, noncanonical hashes, duplicate assets, recipe IDs outside the application allowlist, and device identities without mask/value pairs.

- [ ] **Step 4: Resolve assets with containment and hash verification**

```ts
export async function resolveTargetPackAsset(
  packRoot: string,
  asset: TargetPackAsset,
): Promise<Uint8Array> {
  const candidate = resolve(packRoot, asset.path);
  if (!candidate.startsWith(`${resolve(packRoot)}${sep}`)) throw new Error('TARGET_ASSET_ESCAPE');
  const bytes = await readFile(candidate);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.sha256) {
    throw new Error('TARGET_ASSET_HASH_MISMATCH');
  }
  return bytes;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/engine/targetPacks --reporter=dot && npx tsc --noEmit`

Expected: all target-pack tests and TypeScript pass.

Commit: `feat(target-packs): validate owned assets and fixed recipes`

---

### Task 2: Supply exact packs, startup/linker assets, provider inventories, and pin constraints

**Files:**
- Create: `target-packs/stm32f103c8t6/manifest.json`
- Create: `target-packs/stm32f103c8t6/startup/startup_stm32f103c8tx.c`
- Create: `target-packs/stm32f103c8t6/linker/stm32f103c8tx.ld`
- Create: `target-packs/stm32f407vgt6/manifest.json`
- Create: `target-packs/stm32f407vgt6/startup/startup_stm32f407xx.c`
- Create: `target-packs/stm32f407vgt6/linker/stm32f407vgtx.ld`
- Create: `target-packs/atmega328p/manifest.json`
- Create: `target-packs/atmega2560/manifest.json`
- Create: `target-packs/esp32-wroom-32/manifest.json`
- Create: `target-packs/esp32-wroom-32/sdk/sdkconfig.defaults`
- Create: `src/engine/targetPacks/builtinPackLoader.ts`
- Create: `src/engine/targetPacks/builtinPackLoader.test.ts`
- Create: `src/engine/targetPacks/exactPackValidation.test.ts`

**Interfaces:**
- Produces: `loadBuiltinTargetPacks(): Promise<ResolvedPack[]>` and five hash-verified packs.
- Consumes: Task 1 asset resolver and existing `TargetRegistry`.

- [ ] **Step 1: Add a failing five-pack inventory and memory-boundary test**

```ts
it.each([
  ['stm32f103c8t6', 0x08000000, 64 * 1024, 0x20000000, 20 * 1024],
  ['stm32f407vgt6', 0x08000000, 1024 * 1024, 0x20000000, 128 * 1024],
  ['atmega328p', 0x00000000, 32 * 1024, 0x00800100, 2 * 1024],
  ['atmega2560', 0x00000000, 256 * 1024, 0x00800200, 8 * 1024],
])('%s declares exact flash/RAM bounds', async (id, flashStart, flashSize, ramStart, ramSize) => {
  const pack = await loadPack(id);
  expect(pack.manifest.memoryRegions).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'FLASH', start: flashStart, size: flashSize }),
    expect.objectContaining({ name: 'RAM', start: ramStart, size: ramSize }),
  ]));
});
```

- [ ] **Step 2: Run the pack test and confirm RED**

Run: `npx vitest run src/engine/targetPacks/exactPackValidation.test.ts --reporter=verbose`

Expected: FAIL because the five physical pack directories are absent.

- [ ] **Step 3: Add the manifests and target-owned assets**

Each manifest must declare exact CPU/FPU/ABI, memory, clock range, supported pins/alternate functions, peripheral constraints, interrupt/DMA ownership, programmer device signature, driver-mode inventory, recipe IDs, SDK/toolchain pins, and every asset hash. Obtain startup/linker files from the matching pinned vendor/device package and retain their license notices; do not synthesize register maps from memory.

- [ ] **Step 4: Add deterministic conflict tests**

```ts
expect(validateTargetConfiguration(pack, {
  channels: [uartOn('PA9', 'USART1_TX'), pwmOn('PA9', 'TIM1_CH2')],
})).toContainEqual(expect.objectContaining({ code: 'PIN_FUNCTION_CONFLICT' }));
```

Cover invalid ADC pins, duplicate interrupt ownership, DMA collision, impossible system clocks, wrong FPU mode, unavailable bare-metal providers, and reserved debug/programming pins.

- [ ] **Step 5: Validate all packs and commit**

Run: `npx tsx scripts/validate_target_pack.ts target-packs`

Run: `npx vitest run src/engine/targetPacks --reporter=dot`

Expected: five packs resolve with matching hashes; every adversarial fixture fails closed.

Commit: `feat(target-packs): add five exact flashable target packs`

---

### Task 3: Replace legacy HAL templates with target-pack-owned driver and platform generation

**Files:**
- Create: `src/engine/embedded/driverProviderGenerator.ts`
- Create: `src/engine/embedded/driverProviderGenerator.test.ts`
- Create: `src/engine/embedded/platformProjectGenerator.ts`
- Create: `src/engine/embedded/platformProjectGenerator.test.ts`
- Create: `src/engine/embedded/integrationManifest.ts`
- Create: `src/engine/embedded/integrationManifest.test.ts`
- Modify: `src/engine/embedded/embeddedLayerGenerator.ts`
- Modify: `src/engine/hil/hilCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/engine/hil/hilCompilation.test.ts`

**Interfaces:**
- Produces: `generateEmbeddedProject(model, selection, pack): EmbeddedProjectResult`.
- Result: `{ files, manifest, diagnostics }`, where every file has `{ path, layer, sha256, content }` and every configured channel has exactly one provider or stub record.

- [ ] **Step 1: Add failing golden tests for target/mode/channel combinations**

```ts
expect(project.manifest.channels).toContainEqual({
  channelId: 'motor_pwm', peripheral: 'pwm', provider: 'stm32f407-tim4-vendor', stub: false,
});
expect(project.files.map(file => file.path)).toContain('src/driver/adia_mcal_pwm.c');
expect(project.files.map(file => file.path)).not.toContain('src/driver/adia_mcal_adc.c');
```

Run: `npx vitest run src/engine/embedded/driverProviderGenerator.test.ts --reporter=verbose`

Expected: FAIL because generation still routes through legacy family templates.

- [ ] **Step 2: Implement provider resolution without target conditionals in the application generator**

```ts
export interface DriverProviderResolution {
  channelId: string;
  providerId: string;
  sourceAssetIds: readonly string[];
  stub: boolean;
  reason?: 'UNSUPPORTED_PERIPHERAL' | 'UNSUPPORTED_MODE' | 'PIN_CONFLICT';
}
```

The driver generator selects providers only from the resolved pack. It generates typed switch-based channel adapters, explicit status propagation, timeouts, safe-state bodies, and no unused peripheral source.

- [ ] **Step 3: Generate deterministic platform files**

Copy verified startup/linker assets into `src/platform` and `build/linker`; render `CMakeLists.txt` or `Makefile` from application-owned templates keyed by recipe ID. Include an exact dependency lock with pack hash, toolchain version, SDK version, mode, and board revision.

- [ ] **Step 4: Remove duplicate runtime paths**

Route state-machine I/O through the stable `adia_mcal.h` contract. Delete generation of parallel `mcal_dio_hil.c`/string-dispatched HAL access once parity tests prove the new path, and retain a migration error for unsupported old project formats rather than emitting both paths.

- [ ] **Step 5: Compile every generated provider as strict target C/C++**

Run: `npx vitest run src/engine/embedded src/engine/hil/hilCompilation.test.ts --reporter=dot`

Expected: all used-provider compilations pass with `-Wall -Wextra -Werror`; tests named “link” actually produce an ELF or are renamed “object compile.”

- [ ] **Step 6: Commit**

Commit: `feat(codegen): generate target-pack driver and platform projects`

---

### Task 4: Implement contained target build, full link, image creation, and ELF inspection

**Files:**
- Create: `src/security/hilBuildRecipes.cjs`
- Create: `src/security/hilBuildRecipes.test.cjs`
- Create: `src/security/hilBuildService.cjs`
- Create: `src/security/hilBuildService.test.cjs`
- Create: `src/security/elfInspector.cjs`
- Create: `src/security/elfInspector.test.cjs`
- Modify: `src/security/hilBuildPolicy.cjs`
- Modify: `src/main.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ buildId, sourceManifestHash, targetSelection }` plus server-owned saved workspace.
- Produces: `VerifiedBuildRecord` containing exact artifact hashes, measured memory, tool versions, recipe/pack identity, inspection results, and evidence status.

- [ ] **Step 1: Add failing security tests**

```js
await assert.rejects(
  () => service.build({ ...validRequest, flags: ['-DATTACK'] }),
  error => error.code === 'UNEXPECTED_BUILD_FIELD',
);
assert.equal(spawnCalls[0].options.shell, false);
assert.deepEqual(spawnCalls[0].args, trustedRecipe.args);
```

Also test stale hashes, concurrent builds, workspace escape, oversized source/output/logs, timeout, wrong compiler version, missing startup/linker assets, unresolved symbols, absent reset/vector symbols, memory overflow, FPU/ABI mismatch, and forbidden APIs.

- [ ] **Step 2: Implement fixed recipe builders**

```js
function buildRecipe(record, paths) {
  return Object.freeze({
    executable: paths.armGcc,
    args: Object.freeze([
      '-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16',
      '-Os', '-Wall', '-Wextra', '-Werror', '-ffunction-sections', '-fdata-sections',
      ...record.sources, record.startup,
      `-T${record.linker}`, '-Wl,-Map=firmware.map,--gc-sections', '-o', 'firmware.elf',
    ]),
  });
}
```

Do not accept optimization, warnings, debug level, paths, executable, or flags from IPC.

- [ ] **Step 3: Build inside a contained unique workspace**

Use `fs.mkdtemp`, copy only manifest-listed files, disallow symlinks, cap 64 files/2 MiB each/32 MiB outputs, cap logs, terminate on timeout, and allow one build per sender/build ID.

- [ ] **Step 4: Inspect and convert artifacts**

Use the target `size`, `nm`, `readelf`/`objdump`, and `objcopy` tools with fixed arguments. Verify reset/vector symbols, entry point, sections within pack memory, stack/heap reservations, no undefined symbols, ABI/FPU attributes, and forbidden functions. Only then generate BIN/HEX and hash ELF/map/BIN/HEX.

- [ ] **Step 5: Replace the provisional compile IPC path**

`hil-run-compile` must call `HilBuildService.build()` and set `currentVerifiedHilBuild` only for `LINKED_IMAGE_VERIFIED`. Delete the inline family-level compiler construction from `src/main.cjs`.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test:security && npx tsc --noEmit`

Expected: all policies/services pass; a linked record is impossible without artifact inspection.

Commit: `feat(hil): build and inspect exact target images securely`

---

### Task 5: Implement probe detection, exact-device flashing, readback, and confirmation

**Files:**
- Create: `src/security/hilProbeService.cjs`
- Create: `src/security/hilProbeService.test.cjs`
- Create: `src/security/hilFlashRecipes.cjs`
- Create: `src/security/hilFlashRecipes.test.cjs`
- Create: `src/security/hilFlashService.cjs`
- Create: `src/security/hilFlashService.test.cjs`
- Modify: `src/security/hilFlashPolicy.cjs`
- Modify: `src/security/rateLimiter.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- `detectProbes(selection): Promise<DetectedProbe[]>`.
- `issueFlashConfirmation(buildId, probeId): { token, expiresAt }` stored main-process-only.
- `flash(request): Promise<FlashEvidence>` accepts `{ buildId, artifactHash, targetSelection, programmerId, probeId, confirmationToken }`.

- [ ] **Step 1: Add failing tests for every unsafe flash path**

```js
assert.equal((await service.flash({ ...request, probeId: 'wrong' })).code, 'DEVICE_MISMATCH');
assert.equal((await service.flash(request, { probes: [probeA, probeB] })).code, 'AMBIGUOUS_PROBE');
assert.equal((await service.flash({ ...request, artifactHash: stale })).code, 'STALE_ARTIFACT');
assert.equal((await service.flash(request, { readbackHash: wrong })).code, 'READBACK_MISMATCH');
```

Cover missing RLS permission, rate limit, expired/single-use confirmation, family ID, stubbed build, nonverified link, missing programmer, timeout, unexpected device signature, and browser mode.

- [ ] **Step 2: Implement target-owned probe detection and device identity matching**

Recipe builders may select only known tools and arguments. Parse bounded output into probe serial, transport, device signature/chip ID, and firmware-readback capability. Require exactly one explicitly selected matching probe.

- [ ] **Step 3: Require short-lived explicit confirmation**

Bind a cryptographically random, single-use, 60-second token to build ID, artifact hash, exact target, programmer, and probe. Invalidate it on any configuration change or flash attempt.

- [ ] **Step 4: Program, verify/read back, reset, and audit**

Flash only the recorded artifact path. Require programmer verify or readback hash, then reset and query firmware identity. Store bounded logs without source contents, ports beyond the chosen ID, credentials, or tokens.

- [ ] **Step 5: Replace erase and flash IPC handlers**

Erase uses the same detection/confirmation policy and never has a host/family bypass. Remove the remaining legacy inline flasher from `src/main.cjs`.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test:security && npx tsc --noEmit`

Expected: flash succeeds only in the injected happy-path test with matching identity and readback.

Commit: `feat(hil): flash and verify exact devices safely`

---

### Task 6: Generate firmware identity, on-target self-test, and immutable evidence chain

**Files:**
- Create: `src/engine/hil/hilEvidence.ts`
- Create: `src/engine/hil/hilEvidence.test.ts`
- Create: `src/engine/hil/hilSelfTestGenerator.ts`
- Create: `src/engine/hil/hilSelfTestGenerator.test.ts`
- Modify: `src/engine/hil/hilProtocol.ts`
- Modify: `src/engine/hil/hil.test.ts`
- Modify: `src/engine/embedded/embeddedLayerGenerator.ts`

**Interfaces:**
- `appendEvidence(previous, input): EvidenceRecord` with `previousHash`, `recordHash`, status, exact input/output hashes, tools, timestamp, and build identity.
- `generateHilSelfTest(model, pack): GeneratedFile[]`.

- [ ] **Step 1: Add failing evidence-chain tamper tests**

```ts
const chain = appendEvidence(appendEvidence(null, compile), link);
expect(verifyEvidenceChain(chain)).toEqual({ valid: true });
expect(verifyEvidenceChain([{ ...chain[0], outputHashes: ['tampered'] }, chain[1]])).toEqual({
  valid: false, index: 0, code: 'RECORD_HASH_MISMATCH',
});
```

- [ ] **Step 2: Implement canonical evidence hashing and invalidation**

Evidence progression is `STATIC_ANALYSIS_ONLY -> TARGET_COMPILE_VERIFIED -> LINKED_IMAGE_VERIFIED -> FLASH_VERIFIED -> SELF_TEST_VERIFIED -> EXTERNAL_HIL_VERIFIED -> RELEASE_READY`. Any model/source/pack/mode/revision/tool/test-vector change removes all downstream evidence.

- [ ] **Step 3: Extend the HIL protocol**

Frames include magic/version, payload length, sequence, logical tick, firmware/model/source/pack hashes, target ID, active configuration, variables/X-Bridges signals, faults/safe outputs, and CRC. Reject duplicate/out-of-order frames and mismatched firmware identity.

- [ ] **Step 4: Generate on-target self-tests**

Generate boot identity, clock/tick, initialized RAM pattern, watchdog recovery marker, scheduler overrun, protocol CRC/sequence, configured loopback, fault latch, and safe-output tests. Unsupported physical loopbacks report `NOT_RUN`, never pass.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/engine/hil --reporter=dot && npx tsc --noEmit`

Commit: `feat(hil): add firmware self-test and evidence chain`

---

### Task 7: Implement external HIL parity orchestration and first-divergence reporting

**Files:**
- Create: `src/engine/hil/hilFixture.ts`
- Create: `src/engine/hil/hilFixture.test.ts`
- Create: `src/engine/hil/hilOrchestrator.ts`
- Create: `src/engine/hil/hilOrchestrator.test.ts`
- Create: `src/engine/hil/hilTraceComparator.ts`
- Create: `src/engine/hil/hilTraceComparator.test.ts`
- Modify: `src/components/hil/HILDashboard.tsx`

**Interfaces:**
- `runHilSuite(session, vectors, expectedTrace, fixture): Promise<HilRunResult>`.
- `compareTrace(expected, actual, tolerances): TraceComparison` returning the first divergence.

- [ ] **Step 1: Add deterministic simulator/compiled-C/hardware trace fixtures**

Include shallow/deep history, parallel regions, internal transitions, fixed logical time, fixed-point saturation, float tolerances, X-Bridges Inport/Outport flow, fault latching, and safe outputs.

- [ ] **Step 2: Add failing first-divergence tests**

```ts
expect(compareTrace(expected, actual, tolerances)).toEqual({
  passed: false,
  firstDivergence: expect.objectContaining({ stimulusIndex: 17, field: 'regions.motor', expected: 'Run', actual: 'Idle' }),
});
```

- [ ] **Step 3: Validate fixture definitions**

Require fixture ID/revision/hash, wiring, channel direction/range/load/calibration, sample rate, timing tolerance, and required loopbacks. Reject ambiguous mappings and missing calibration for analog certification channels.

- [ ] **Step 4: Implement orchestration**

Replay hashed vectors, collect CRC/sequence-verified frames, compare states/timers/variables/X-Bridges/faults/physical I/O, stop at the first divergence, and attach firmware/model/source/pack/vector/probe/board/fixture hashes.

- [ ] **Step 5: Keep disconnected hardware honest**

When no matching fixture is connected, return `{ status: 'NOT_RUN', reason: 'HARDWARE_NOT_CONNECTED' }`; do not create `EXTERNAL_HIL_VERIFIED` evidence.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/engine/hil/hilFixture.test.ts src/engine/hil/hilTraceComparator.test.ts src/engine/hil/hilOrchestrator.test.ts --reporter=verbose`

Commit: `feat(hil): compare physical traces with simulation behavior`

---

### Task 8: Package deterministic delivery artifacts and enforce release gates in reports/UI

**Files:**
- Create: `src/engine/embedded/deliveryPackager.ts`
- Create: `src/engine/embedded/deliveryPackager.test.ts`
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/components/hil/HILWorkspace.tsx`
- Modify: `src/components/hil/HILDashboard.tsx`
- Create: `docs/CODEGEN_MCU_VERIFICATION_GATE.md`
- Modify: `docs/SECURITY.md`

**Interfaces:**
- `packageDelivery(project, artifacts, evidence): DeliveryPackage`.
- `evaluateReleaseGate(evidence, manifest): ReleaseGateResult`.

- [ ] **Step 1: Add a failing deterministic-layout test**

```ts
expect(pkg.files.map(file => file.path)).toEqual(expect.arrayContaining([
  'src/app/sm_core.c', 'src/component/adia_component.c', 'src/mcal/adia_mcal.h',
  'out/firmware.elf', 'out/firmware.map', 'evidence/evidence_chain.json',
  'docs/integration.md', 'docs/wiring.md', 'docs/recovery.md',
]));
expect(packageDelivery(input).packageHash).toBe(packageDelivery(input).packageHash);
```

- [ ] **Step 2: Enforce status prerequisites**

```ts
if (manifest.stubs.length > 0) return blocked('GENERATED_WITH_STUBS');
for (const required of ['LINKED_IMAGE_VERIFIED', 'FLASH_VERIFIED', 'SELF_TEST_VERIFIED', 'EXTERNAL_HIL_VERIFIED']) {
  if (!hasValidEvidence(required)) return blocked(`MISSING_${required}`);
}
return { status: 'RELEASE_READY' };
```

- [ ] **Step 3: Generate only real artifacts and evidence-aware reports**

Never create placeholder ELF/BIN/HEX/map/size reports. Reports display separate static, target compile, link, flash, self-test, external HIL, resources, safety, and release rows with `PASS`, `FAIL`, or `NOT_RUN`, plus exact hashes and timestamps.

- [ ] **Step 4: Update UI controls**

Build, flash, erase, self-test, HIL, and export buttons use backend capability/evidence state. Remove arbitrary flash address/programmer strings; select only detected programmer/probe entries. Show measured sizes only from verified build records.

- [ ] **Step 5: Document integration and recovery**

Document exact wiring, toolchain/SDK versions, build, flash confirmation, probe recovery, rollback, bootloader caveats, residual stubs, HIL fixture revision, and what `RELEASE_READY` does and does not certify.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/engine/embedded/deliveryPackager.test.ts src/utils/stateMachine/smReports.test.ts --reporter=dot && npx tsc --noEmit`

Commit: `feat(delivery): package verified MCU firmware and evidence`

---

### Task 9: Execute the software and physical acceptance matrix

**Files:**
- Create: `docs/hil/fixtures/stm32f103c8t6-v1.json`
- Create: `docs/hil/fixtures/stm32f407vgt6-v1.json`
- Create: `docs/hil/fixtures/atmega328p-v1.json`
- Create: `docs/hil/fixtures/atmega2560-v1.json`
- Create: `docs/hil/fixtures/esp32-wroom-32-v1.json`
- Create: `docs/hil/results/README.md`

**Interfaces:**
- Produces five exact-target acceptance records per implemented driver mode, or explicit `NOT_RUN` records with missing prerequisite codes.

- [ ] **Step 1: Run the complete software gate**

Run:

```powershell
npm run test:security
npx vitest run src/engine/targetPacks src/engine/embedded src/engine/hil src/utils/stateMachine --reporter=dot
npx tsc --noEmit
npm audit --audit-level=high
npm run build
git diff --check
```

Expected: zero failed tests/type errors/high vulnerabilities/build errors/whitespace errors.

- [ ] **Step 2: Cross-compile and link all exact targets**

For each target/mode/provider-complete fixture, verify pinned compiler version, strict compile, complete link, ELF inspection, BIN/HEX generation, and measured memory. Compatibility headers, host compilers, and `-c`-only tests do not satisfy this step.

- [ ] **Step 3: Flash each available physical target**

Record probe serial, device identity, board revision, artifact hash, programmer version, write/verify/readback result, reset, and firmware identity. If a board or programmer is unavailable, record `NOT_RUN/HARDWARE_NOT_CONNECTED` and do not advance status.

- [ ] **Step 4: Run self-test and external HIL**

Use the exact fixture revision and hashed vectors. Record nominal, boundary, noisy/disconnected input, timeout, invalid-frame, reset/watchdog, peripheral fault, and safe-output results; require simulation/compiled-C/hardware trace parity.

- [ ] **Step 5: Perform final review and commit evidence**

Review every acceptance criterion in `docs/superpowers/specs/2026-08-03-extensible-mcu-hil-delivery-design.md`. Confirm no status was inferred from a weaker gate and no pack/provider asset is unhashed.

Commit: `test(hil): record exact-target acceptance evidence`

## Completion Definition

Software implementation is complete when Tasks 1–8 pass with all physical statuses still allowed to be `NOT_RUN`. Full first-release acceptance is complete only after Task 9 produces valid `FLASH_VERIFIED`, `SELF_TEST_VERIFIED`, and `EXTERNAL_HIL_VERIFIED` evidence for each claimed target/mode; unavailable hardware must remain visibly incomplete.
