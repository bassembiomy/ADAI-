# Task Checklist: X-Bridges Wave 1 Math and Reductions

- [x] **Task 1: Bounded embedded profile**
  - [x] Write failing limit tests (`src/utils/stateMachine/xbEmbeddedProfile.test.ts`)
  - [x] Confirm RED
  - [x] Implement `xbEmbeddedProfile.ts` (`XBEmbeddedLimits`, `DEFAULT_XB_EMBEDDED_LIMITS`, `assertXBResourceWithinLimits`)
  - [x] Update `XBTargetCapabilities` in `xbModel.ts` and `smSemanticValidator.ts`
  - [x] Verify profile & semantic validation tests pass
  - [x] Commit Task 1 changes

- [ ] **Task 2: Executed paired-conformance gate**
  - [ ] Write failing integrity test in `xbCapabilities.test.ts`
  - [ ] Confirm RED
  - [ ] Create `xbCConformanceCases.ts` & `xbDeclaredCConformance.test.ts`
  - [ ] Update `xbCapabilities.ts` to reference executable case coverage
  - [ ] Seed registry with existing declared cases and verify test passes
  - [ ] Commit Task 2 changes

- [ ] **Task 3: Vector power and reductions**
  - [ ] Write failing canonical tests for VectorPow, SumElements, Mean, Max in `xbInterpreter.test.ts`
  - [ ] Confirm RED
  - [ ] Implement operation semantics in `xbSemanticBuilder.ts`, `xbInterpreter.ts`, `xbCGenerator.ts`
  - [ ] Add `XB-W1-F32-MATH` and `XB-W1-FIXED-MATH` cases in `xbCConformanceCases.ts`
  - [ ] Run canonical, generator, and conformance tests
  - [ ] Commit Task 3 changes

- [ ] **Task 4: Identity matrix and capability release**
  - [ ] Write failing tests for `IdentityMatrix` dimension & output
  - [ ] Confirm RED
  - [ ] Implement `IdentityMatrix` in semantic builder, interpreter, and C generator
  - [ ] Add `XB-W1-F32-IDENTITY` and `XB-W1-FIXED-IDENTITY` case IDs
  - [ ] Enable capabilities in `xbCapabilities.ts`
  - [ ] Update `docs/XBRIDGES_EMBEDDED_CODEGEN.md`
  - [ ] Run tests & `npx tsc --noEmit`
  - [ ] Commit Task 4 changes

- [ ] **Task 5: Wave 1 release verification**
  - [ ] Run complete X-Bridges test suite
  - [ ] Verify generated C and run `npm run build:sm-runtime && npx tsc --noEmit`
  - [ ] Verify exclusions remain fail-closed
  - [ ] Commit generated runtime bundle if changed
