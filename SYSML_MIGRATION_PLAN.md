# SysML Migration Plan

1. Snapshot current legacy project files and repository envelopes.
2. Load legacy arrays through one importer into canonical repository entities.
3. Generate typed diagram presentations from legacy coordinates and membership.
4. Route all new UI commands through `sysmlCommandGateway`.
5. Run canonical-vs-legacy projection parity checks.
6. Migrate persisted files with explicit schema version and diagnostics.
7. Keep read-only legacy adapters until all diagrams and tests use canonical selectors.
8. Remove duplicated semantic state only after a release cycle of migration telemetry.

