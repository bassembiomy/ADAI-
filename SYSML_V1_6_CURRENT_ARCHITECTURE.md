# ADIA SysML v1.6 Current Architecture Audit

## Scope and method

This audit reviews the repository against the supplied SysML v1.6 brief. Evidence was limited to current source, tests, and project wiring; planned documents were not treated as implementation. Baseline command: `npm run test:sysml -- --reporter=dot`.

## Current architecture

ADIA now contains a canonical repository in `src/engine/sysml/model.ts`, persistence/migration in `src/engine/sysml/persistence.ts`, validation in `src/engine/sysml/validation.ts`, mutation/history support in `src/engine/sysml/mutations.ts`, and a command gateway in `src/services/sysmlCommandGateway.ts`. Model Explorer has a semantic projection in `src/features/modelExplorer/unifiedModelExplorerProjection.ts`.

The UI still carries a parallel legacy representation: `BlockData`, `PartData`, `ConnectorData`, and `RelationshipData` in `src/types/sysml_types.ts`, plus React state arrays in `src/App.tsx`. `fromRepository`/projection and legacy merge adapters bridge the two representations.

Persistence is stronger than the UI boundary: repository envelopes are checksummed, canonicalized, migrated, validated, and can be chunked transactionally. Diagram coordinates/presentation membership are tracked separately from semantic repository entities.

## Baseline result

`npm run test:sysml -- --reporter=dot`: 52 test files passed, 513 tests passed. Performance gates for 1k/10k/50k models also passed in that run.

