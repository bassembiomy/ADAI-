# HIL Production Readiness Implementation Plan

> **For agentic workers:** Use subagent-driven-development for isolated implementation and review tasks.

**Goal:** Supply real vendor runtimes and truthful build/flash evidence for all five MCU targets in a fresh offline installation.

**Architecture:** Bundle a portable PlatformIO environment with pinned AVR Arduino, ESP32 Arduino and STM32Cube platforms. Generate projects against those real cores, route desktop compilation through one production build service, and inspect actual architecture, size and flash artifacts. Runtime startup never provisions packages.

**Tech Stack:** TypeScript generators, CommonJS Electron services, portable Python/PlatformIO, GCC vendor toolchains.

## Global Constraints

- Preserve pre-existing workspace changes and hil_build user files.
- Production builds exclude test shims.
- No synthesized memory values or hashes for absent artifacts.
- Verify programming separately when physical hardware is available.
- Use a writable user-data build directory in packaged execution.

## Task 1: Genuine firmware inspection

Files: src/security/elfInspector.cjs and elfInspector.test.cjs.

- [x] Add regression tests for missing size tooling, malformed size output, wrong architecture and missing artifact hashes; run node src/security/elfInspector.test.cjs and observe failures.
- [x] Replace invented fallback evidence with explicit failed inspection. Parse GNU size output strictly; resolve matching bundled tools and preserve null hashes for absent artifacts. Validate binary architecture with the matching objdump tool.
- [x] Run inspector and dependent security tests. Keep injected test output explicit rather than treating it as production evidence.

## Task 2: Complete generated production projects

Files: src/engine/hil/hilCodeGenerator.ts, hilDriverTemplates.ts and corresponding tests.

- [x] Add tests proving root source layout, pinned platforms, correct language boundary and exclusion of test shims from production generation.
- [x] Generate valid PlatformIO projects for AVR Arduino, ESP32 Arduino and STM32Cube; keep generated state-machine C ABI compatible with C++ framework glue. Include STM32 system clock configuration and required initialization dependencies.
- [x] Compile real generated projects against provisioned vendor dependencies; fix observed generator defects and unsupported capabilities without adding fake APIs.

## Task 3: Portable runtime preparation and verification

Files: scripts/provision_hil_runtime.cjs, scripts/verify_hil_runtime.cjs, src/security/hilRuntime.cjs and tests; forge.config.cjs; package.json.

- [x] Write tests for missing bundles, production source rejection, target mapping and packaged resource lookup.
- [x] Provision relocatable Python and PlatformIO into toolchains/hil-runtime, pin platform versions and preinstall every required package during release preparation.
- [x] Write a hashed bundle inventory; verify files and dependency closure during packaging. Package target-packs explicitly and resolve them from application resources.
- [x] Run the real production matrix with no test shims, a clean user cache and offline settings.

## Task 4: Desktop build and flash integration

Files: src/security/hilBuildService.cjs, src/main.cjs, src/security/hilFlashRecipes.cjs and tests; scripts/hil_emit_sources.ts and hil_build_matrix.cjs.

- [x] Add tests for real artifact conversion/selection, failed inspections and source identity handling.
- [x] Route compilation to the portable vendor build service; reject missing runtime bundles and stale/shim projects. Keep trusted request policy and record actual flash artifacts.
- [x] Flash with pinned local tools, selected port/baud, actual image hashes and complete ESP32 image layout. Fail closed on unverified images.
- [x] Replace the shim matrix with production compilation; label shim-only tests as simulation.
- [x] Run HIL unit tests, security tests, TypeScript checks and production matrix. Review the final diff, document evidence and physical-hardware limits.
