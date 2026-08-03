# MCU/HIL Flash Readiness Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current family-level HIL prototype with an exact-target, automatically generated application/component/MCAL/driver/platform project that can be cross-compiled, linked, safely flashed, self-tested, and externally HIL-verified without making unsupported evidence claims.

**Architecture:** Preserve the pure state-machine/X-Bridges generator and route all hardware access through generated component and MCAL interfaces. Exact, immutable target packs provide validated device metadata, driver providers, startup/linker assets, fixed build/flash recipes, and HIL capabilities; Electron executes only trusted recipes and records evidence bound to artifact hashes.

**Tech Stack:** TypeScript 5.4, Vitest 4, C99/C++ target toolchains, React 18, Electron 43 CommonJS main/preload boundary, Node `crypto`, `child_process.spawn` with `shell: false`.

## Global Constraints

- Preserve all existing uncommitted Kimi changes until each replacement is covered by a regression test.
- No family-only target may be compiled, flashed, or called certified.
- No UI label may claim compile, link, flash, self-test, HIL, or release evidence that has not been recorded for the exact artifact hash.
- Target-pack JSON is untrusted input: validate recursively, reject unknown schema versions, verify hashes, and never execute pack-supplied command strings.
- Generated C identifiers and comments must be escaped through canonical helpers.
- Every configured channel receives an explicit MCAL implementation or a deterministic `ADIA_MCAL_NOT_IMPLEMENTED` stub; any stub blocks flashing.
- Build and flash commands come from application-owned allowlisted recipe IDs and fixed argument builders, never arbitrary manifest flags or renderer text.
- Flashing requires an exact-device identity match, current linked artifact hash, one unambiguous probe, explicit user confirmation, and post-write verification.
- Physical `FLASH_VERIFIED`, `SELF_TEST_VERIFIED`, and `EXTERNAL_HIL_VERIFIED` statuses remain `NOT_RUN` without connected hardware and measured evidence.
- Keep Electron `contextIsolation: true`, `nodeIntegration: false`, sandboxing, RLS, IPC allowlists, rate limits, bounded payloads/logs, contained paths, timeouts, and `shell: false`.

---

### Task 1: Harden target-pack types, schema, resolver, and immutable registry

**Files:**
- Modify: `src/engine/targetPacks/targetPackTypes.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.test.ts`
- Modify: `src/engine/targetPacks/packResolver.ts`
- Modify: `src/engine/targetPacks/packResolver.test.ts`
- Modify: `src/engine/targetPacks/TargetRegistry.ts`
- Modify: `src/engine/targetPacks/TargetRegistry.test.ts`
- Modify: `scripts/validate_target_pack.ts`
- Modify: `src/engine/targetPacks/validateCli.test.ts`

**Interfaces:**
- Produces: `TargetPackManifestV1`, `TargetPackDiagnostic`, `resolvePacks(): PackResolution`, immutable `TargetRegistry`, and `computeTargetPackContentHash()`.

- [ ] Add failing tests that reject invalid identifiers/schema versions/statuses, negative/overlapping memory, malformed nested arrays, unsafe flags/paths, duplicate modes/pins, empty hashes, and unknown properties.
- [ ] Add a failing mutation test proving returned manifests cannot change registry selection.
- [ ] Add a failing resolver test with one valid and one invalid sibling and require structured diagnostics plus CLI exit code 1.
- [ ] Add `packVersion`, `minimumGeneratorSchemaVersion`, recipe IDs, asset hashes, and exact evidence-status enum; recursively validate every field.
- [ ] Canonicalize and hash pack files excluding the declared hash field, use timing-safe comparison, deep-clone/deep-freeze accepted packs, and key registry entries by `targetId@packVersion`.
- [ ] Run:

```bash
npx vitest run src/engine/targetPacks --reporter=verbose
npx tsc --noEmit
```

Expected: all target-pack tests pass; adversarial manifests fail closed.

---

### Task 2: Persist exact target configuration and remove false certification labels

**Files:**
- Modify: `src/engine/hil/hilTypes.ts`
- Modify: `src/engine/targetPacks/defaultTargetPacks.ts`
- Modify: `src/engine/targetPacks/defaultTargetPacks.test.ts`
- Modify: `src/components/hil/TargetPackSelector.tsx`
- Replace: `src/components/hil/TargetPackSelector.test.tsx`
- Modify: `src/components/hil/HILWorkspace.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `TargetSelectionConfig = { targetId; packVersion; driverMode; boardRevision; programmerId? }` stored inside `HILConfig`.

- [ ] Add failing component tests proving target ID and driver mode survive selection, project serialization, regeneration, and build requests.
- [ ] Add failing tests proving Generic does not fall back to STM32 and no certification badge appears without evidence.
- [ ] Replace initial IDs with `stm32f103c8t6`, `stm32f407vgt6`, `atmega328p`, `atmega2560`, and `esp32-wroom-32`.
- [ ] Remove `HARDWARE_TESTED`; built-ins start at `STATIC_ANALYSIS_ONLY` and expose `packVersion`, real recipe IDs, and honest capability gaps.
- [ ] Bind selector state to `config.targetSelection`; remove legacy family conversion and show evidence-specific labels only.
- [ ] Run selector, model serialization, HIL, and TypeScript tests.

---

### Task 3: Complete and safely render the MCAL contract

**Files:**
- Modify: `src/engine/mcal/mcalTypes.ts`
- Modify: `src/engine/mcal/mcalTypes.test.ts`
- Modify: `src/engine/mcal/mcalHeaderGenerator.ts`
- Modify: `src/engine/mcal/mcalHeaderGenerator.test.ts`
- Create: `src/engine/mcal/cRendering.ts`
- Create: `src/engine/mcal/cRendering.test.ts`

**Interfaces:**
- Produces: `toCIdentifier()`, `escapeCComment()`, `generateMcalHeader()`, typed per-peripheral operations, and channel metadata constants.

- [ ] Add failing tests for `*/`, newlines, directives, Unicode, duplicate normalized IDs, reserved C identifiers, direction errors, and every peripheral type.
- [ ] Reject unsafe/duplicate IDs before rendering; escape comments and use canonical stable identifiers.
- [ ] Render only direction-valid operations with appropriate types: bool GPIO, count ADC/DAC/PWM, byte-buffer UART/SPI/I2C/CAN, timer/capture timestamps, watchdog service, clock/reset/NVM APIs.
- [ ] Render safe value, range, scaling, units, and timeout metadata using bounded integer/floating representations.
- [ ] Compile generated headers as strict C99 and C++ in tests.

---

### Task 4: Generate component, MCAL implementation, driver, and platform layers

**Files:**
- Create: `src/engine/embedded/componentGenerator.ts`
- Create: `src/engine/embedded/componentGenerator.test.ts`
- Create: `src/engine/embedded/mcalImplementationGenerator.ts`
- Create: `src/engine/embedded/mcalImplementationGenerator.test.ts`
- Create: `src/engine/embedded/driverGenerator.ts`
- Create: `src/engine/embedded/driverGenerator.test.ts`
- Create: `src/engine/embedded/platformGenerator.ts`
- Create: `src/engine/embedded/platformGenerator.test.ts`
- Create: `src/engine/embedded/integrationManifest.ts`
- Create: `src/engine/embedded/integrationManifest.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Produces: `generateEmbeddedProject(chart, targetSelection): EmbeddedProjectResult` containing layered files and an immutable integration manifest.

- [ ] Add failing golden tests for the five exact targets and both driver modes.
- [ ] Generate deterministic lifecycle/scheduler/watchdog/safe-output component code around `SM_ReadInputs -> SM_Step -> SM_WriteOutputs`.
- [ ] Generate per-channel MCAL bodies from target capability metadata; use explicit safe stubs returning `ADIA_MCAL_NOT_IMPLEMENTED` where unavailable.
- [ ] Generate one driver source per used peripheral and no code for unused peripherals.
- [ ] Generate platform startup/linker/build configuration only from trusted application-owned templates referenced by recipe ID.
- [ ] Add every source, channel, provider, asset hash, dependency, and stub to `integration_manifest.json`; set `flashBlocked=true` whenever any stub exists.
- [ ] Replace legacy `generateHALCode` calls in the production generation path while retaining migration compatibility tests.

---

### Task 5: Supply exact target packs and target-owned assets

**Files:**
- Create: `target-packs/stm32f103c8t6/`
- Create: `target-packs/stm32f407vgt6/`
- Create: `target-packs/atmega328p/`
- Create: `target-packs/atmega2560/`
- Create: `target-packs/esp32-wroom-32/`
- Create: `src/engine/targetPacks/builtinPackLoader.ts`
- Create: `src/engine/targetPacks/builtinPackLoader.test.ts`

**Interfaces:**
- Each pack provides manifest, pin/AF database, capability table, vendor and bare-metal provider inventory, startup/linker assets where applicable, trusted build/flash recipe IDs, and self-test/HIL mappings.

- [ ] Add manifest/asset-hash tests for every pack.
- [ ] Add representative pin-mux, peripheral-conflict, clock, interrupt, DMA, flash/RAM, FPU/ABI, and unsupported-provider tests.
- [ ] Provide exact startup/vector/linker assets for STM32/AVR and ESP-IDF project/image configuration for ESP32.
- [ ] Mark unavailable providers as stub-required rather than certified.
- [ ] Validate all packs through the hardened CLI.

---

### Task 6: Replace compile IPC with a secure target build service

**Files:**
- Create: `src/security/hilBuildService.cjs`
- Create: `src/security/hilBuildService.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/security/roleSecurity.cjs`
- Modify: `src/security/roleSecurity.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ buildId, targetSelection, sourceManifestHash }` only.
- Produces: bounded result containing artifact hashes, tool versions, ELF/map/size inspection, and `TARGET_COMPILE_VERIFIED`/`LINKED_IMAGE_VERIFIED` evidence.

- [ ] Add failing tests rejecting renderer flags, paths, commands, stale hashes, stubs, concurrent builds, oversized workspaces, missing assets, and wrong toolchain versions.
- [ ] Define application-owned recipe builders with fixed executables/argument arrays and `shell: false`; do not sanitize arbitrary strings into commands.
- [ ] Build in a contained temporary directory with time/output limits and cancellation.
- [ ] Compile and fully link target ELF; create BIN/HEX using target tools.
- [ ] Inspect ELF/map for vector/reset symbols, sections, memory bounds, unresolved symbols, ABI/FPU, stack/heap policy, forbidden APIs, and measured flash/RAM.
- [ ] Replace estimated UI memory with measured artifact data and preserve `NOT_RUN` on missing toolchains.

---

### Task 7: Implement guarded device detection, flashing, and verification

**Files:**
- Create: `src/security/hilFlashService.cjs`
- Create: `src/security/hilFlashService.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/security/rateLimiter.cjs`
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- Consumes: `{ buildId, artifactHash, targetSelection, programmerId, probeId, confirmationToken }`.
- Produces: device identity, program/readback result, logs, and exact-hash `FLASH_VERIFIED` evidence.

- [ ] Add failing tests proving RLS denial, rate limiting, exact-device mismatch, ambiguous probes, stale build, stubbed project, invalid confirmation, and readback mismatch all block flashing.
- [ ] Detect probes/devices with target-owned fixed recipes; require one matching device identity and an explicit short-lived confirmation token.
- [ ] Flash only the artifact recorded by the build service, verify/read back, reset, and query firmware identity.
- [ ] Remove arbitrary flash address/programmer text and all family-level bypass-success responses.
- [ ] Bound logs, timeout processes, audit privileged actions without source contents, and keep browser mode disabled.

---

### Task 8: Add evidence chain, on-target self-test, and external HIL parity

**Files:**
- Create: `src/engine/hil/hilEvidence.ts`
- Create: `src/engine/hil/hilEvidence.test.ts`
- Create: `src/engine/hil/hilSelfTestGenerator.ts`
- Create: `src/engine/hil/hilSelfTestGenerator.test.ts`
- Create: `src/engine/hil/hilOrchestrator.ts`
- Create: `src/engine/hil/hilOrchestrator.test.ts`
- Modify: `src/engine/hil/hilProtocol.ts`
- Modify: `src/engine/hil/hil.test.ts`
- Modify: `src/components/hil/HILDashboard.tsx`

**Interfaces:**
- Produces: hash-chained evidence records, firmware identity protocol, self-test results, external HIL trace comparison, and first-divergence diagnostics.

- [ ] Add CRC, sequence, firmware hash, target ID, pack version, driver mode, tick timestamp, state configuration, variables, faults, and safe-output data to protocol frames.
- [ ] Generate boot/clock/RAM/watchdog/overrun/protocol/peripheral-loopback/fault/safe-output self-tests.
- [ ] Replay deterministic simulation vectors through hardware and compare history, parallel regions, internal transitions, timing, fixed/float, X-Bridges, diagnostics, and physical I/O within declared tolerances.
- [ ] Record the first divergence and bind every result to firmware, model, source, target-pack, test-vector, programmer, board, and fixture hashes.
- [ ] Never infer physical evidence; disconnected hardware yields `NOT_RUN`.

---

### Task 9: Package delivery artifacts and enforce honest release gates

**Files:**
- Create: `src/engine/embedded/deliveryPackager.ts`
- Create: `src/engine/embedded/deliveryPackager.test.ts`
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `docs/CODEGEN_MCU_VERIFICATION_GATE.md`
- Modify: `docs/SECURITY.md`

- [ ] Generate deterministic layered source/build/out/evidence/docs layout.
- [ ] Include ELF/BIN/HEX/map/symbol/size data only when produced and hashed.
- [ ] Report each evidence layer separately; require compile, link, flash, self-test, external HIL, resource, safety, and no-stub gates for `RELEASE_READY`.
- [ ] Document build, wiring, flashing, debugging, rollback, recovery, residual stubs, and exact target dependencies.

---

### Task 10: Complete verification matrix

- [ ] Run all target-pack, MCAL, component, driver, platform, build, flash, HIL, report, security, and state-machine/X-Bridges tests.
- [ ] Run `npx tsc --noEmit`, `npm run test:security`, `npm audit --audit-level=high`, `git diff --check`, and production build gates.
- [ ] Cross-compile and link all five targets in every fully implemented driver mode using pinned real toolchains.
- [ ] Confirm host/stub builds never count as target evidence.
- [ ] On available hardware, flash and run self-test/external HIL; otherwise leave those statuses `NOT_RUN` and provide the exact hardware execution checklist.
- [ ] Perform final code review against `docs/superpowers/specs/2026-08-03-extensible-mcu-hil-delivery-design.md`.

