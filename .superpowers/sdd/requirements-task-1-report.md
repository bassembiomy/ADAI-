# Requirements Diagram BDD Visibility — Task 1 Report

## Status

Task 1 completed as a red-only TDD test addition. The new test file was committed, and no production code was modified.

## Test file

Created `src/engine/sysml/requirementsDiagramScope.test.ts`.

The tests cover:

- inclusion of a requirement and its connected `testCase` through `verify`;
- inclusion of a connected `block` through `satisfy`;
- exclusion of unrelated BDD elements;
- exclusion of BDD-only `association`/`composition` relationships; and
- exclusion of cross-layer endpoints and relationships when `currentLayerId` is supplied.

The assertions target the planned API:

```ts
getRequirementsDiagramScope(blocks, relationships, currentLayerId?)
```

and its `visibleBlockIds` and `visibleRelationshipIds` sets.

## RED evidence

The exact command requested by the brief was run before any implementation:

```text
npm test -- src/engine/sysml/requirementsDiagramScope.test.ts
```

It exited with status 1 because this repository does not define an npm `test` script:

```text
npm error Missing script: "test"
```

Because that command did not reach Vitest, the underlying test runner was also invoked to verify the intended missing-module failure:

```text
npx vitest run src/engine/sysml/requirementsDiagramScope.test.ts
```

It exited with status 1. Vitest reported:

```text
Error: Cannot find module './requirementsDiagramScope' imported from G:/adia project/src/engine/sysml/requirementsDiagramScope.test.ts
Test Files  1 failed (1)
Tests  no tests
```

This is the expected RED state for Task 1 because `requirementsDiagramScope.ts` is intentionally not created in this task.

## Commit

`a59aaa2 test: add requirements diagram scope cases`

Only the test file was staged and committed. Existing unrelated worktree changes were preserved.

## Concerns

- The brief’s exact `npm test -- ...` command cannot execute tests until the repository adds a `test` script; use the equivalent Vitest command above in the meantime.
- The test suite is intentionally failing until Task 2 adds `requirementsDiagramScope.ts`.
- A pre-existing dirty worktree remains unchanged: files under `hil_build/`, `tests/e2e/`, and untracked plan documents.

## Review fix

Amended `src/engine/sysml/requirementsDiagramScope.test.ts` to address the review findings:

- Added coverage for all supported relationship types: `satisfy`, `verify`, `refine`, `trace`, `derive`, `deriveReqt`, `copy`, and `requirementContainment`.
- Added parameterized rejection coverage for every remaining unsupported BDD-only relationship type: `association`, `generalization`, `composition`, `aggregation`, `allocation`, `binding`, and `dependency`.
- Added an explicit assertion that a requirement in another layer is hidden along with its cross-layer relationship.
- Added a root-layer regression asserting blocks with an omitted `layerId` are visible when `currentLayerId` is `root`.
- No production code was modified.

## Review-fix test output

The focused Vitest command was rerun after the test amendments:

```text
npx vitest run src/engine/sysml/requirementsDiagramScope.test.ts

 RUN  v4.1.11 G:/adia project

 ❯ src/engine/sysml/requirementsDiagramScope.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/engine/sysml/requirementsDiagramScope.test.ts [ src/engine/sysml/requirementsDiagramScope.test.ts ]
Error: Cannot find module './requirementsDiagramScope' imported from G:/adia project/src/engine/sysml/requirementsDiagramScope.test.ts

 Test Files  1 failed (1)
 Tests  no tests
```

Exit status: `1` (expected RED state until Task 2 adds the production helper).

## Remaining Task 1 review fix

Added an unconnected same-layer `block` (`unconnected-same-layer`) to the inclusion fixture and asserted that it is absent from `visibleBlockIds`. All existing supported-relationship, unsupported-relationship, cross-layer, and root-layer coverage remains unchanged. No production code was modified.

## Focused Vitest RED output — remaining review fix

The focused test was run again after this fixture-only amendment:

```text
npx vitest run src/engine/sysml/requirementsDiagramScope.test.ts

 RUN  v4.1.11 G:/adia project

 ❯ src/engine/sysml/requirementsDiagramScope.test.ts (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/engine/sysml/requirementsDiagramScope.test.ts [ src/engine/sysml/requirementsDiagramScope.test.ts ]
Error: Cannot find module './requirementsDiagramScope' imported from G:/adia project/src/engine/sysml/requirementsDiagramScope.test.ts

 Test Files  1 failed (1)
 Tests  no tests
```

Exit status: `1` (expected RED state because the production scope module is intentionally absent for Task 1).

## Final Task 1 review fix

Added a separate unconnected same-layer `testCase` (`unconnected-same-layer-test-case`) to the inclusion fixture and asserted that it is absent from `visibleBlockIds`. No production code was modified.

## Final review-fix RED evidence

The focused Vitest command was run after this fixture-only amendment:

```text
npx vitest run src/engine/sysml/requirementsDiagramScope.test.ts

 RUN  v4.1.11 G:/adia project

 ❯ src/engine/sysml/requirementsDiagramScope.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/engine/sysml/requirementsDiagramScope.test.ts [ src/engine/sysml/requirementsDiagramScope.test.ts ]
Error: Cannot find module './requirementsDiagramScope' imported from G:/adia project/src/engine/sysml/requirementsDiagramScope.test.ts

 Test Files  1 failed (1)
      Tests  no tests
```

Exit status: `1` (expected RED state because the production scope module is intentionally absent for Task 1).
