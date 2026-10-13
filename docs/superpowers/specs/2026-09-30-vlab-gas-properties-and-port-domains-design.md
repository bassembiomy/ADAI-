# V-Lab `gas_properties` Cleanup and Port-Domain Certification Design

## Goal

Remove the obsolete `gas_properties` component completely, preserve safe loading of legacy V-Lab models that still contain it, and make port-domain certification use the engine's canonical physical-domain definitions so `Gas` and `Magnetic` are accepted correctly.

## Scope

The change covers:

- the V-Lab equation registry;
- governing-equation component metadata;
- certification allowlists for zero-port and zero-residual blocks;
- the unused `gas_properties` symbol case;
- runtime physical-domain metadata and certification validation;
- legacy V-Lab node normalization at workspace/import boundaries;
- focused regression tests and the full V-Lab certification test.

It does not reintroduce `gas_properties` as a functional component or alter the equations of any gas or magnetic component.

## Design

### 1. Remove `gas_properties` registry remnants

Delete the `gas_properties` equation factory, governing-equation definition, symbol switch case, and entries in certification exceptions. The library already excludes the block, so these deletions make every registry agree with the catalog and eliminate the orphan factory.

No compatibility alias will remain in the equation registry. Keeping one would perpetuate the orphan-registry condition and incorrectly imply that the block still has simulation semantics.

### 2. Centralize runtime physical domains

Export a readonly runtime list of canonical physical domains from the same module that defines `PhysicalDomain`. Derive the TypeScript union from that list so runtime validation and compile-time typing cannot drift independently.

Canonical engine names remain lowercase. Port metadata may use display-style capitalization, so certification normalizes a declared port domain to lowercase before checking it against the canonical list. Explicit non-engine port categories such as `Any` and `BeltProperty` remain in a small, named supplemental set because they are connection metadata rather than physical solver domains.

This makes `Gas` map to canonical `gas` and `Magnetic` map to canonical `magnetic`, while still rejecting genuinely unknown values.

### 3. Legacy model normalization

Add a small pure V-Lab model normalizer that removes nodes whose effective block type is `gas_properties`. It also removes edges referencing any removed node, even though the historical component had no ports; this makes the migration safe for malformed or hand-edited legacy files.

Apply the normalizer whenever node/edge data enters `VLabWorkspace`:

- initial workspace props;
- subsequent inward prop synchronization;
- downloaded/imported 3DEXPERIENCE V-Lab payloads.

The normalizer will not mutate caller-owned arrays. Once the workspace saves normally, the obsolete nodes disappear from persisted project state.

### 4. Tests

Use test-driven development with focused failing tests before production edits:

- assert that the equation registry, governing definitions, certification exceptions, and symbol source no longer contain `gas_properties`;
- assert that legacy normalization removes obsolete nodes and incident edges while preserving unrelated graph data;
- assert that canonical domain validation accepts case variants including `Gas` and `Magnetic` and rejects an unknown domain;
- run the full V-Lab certification test to prove that the orphan factory and false domain errors are gone;
- run relevant V-Lab library/workspace tests to catch integration regressions.

## Error Handling and Compatibility

Normalization is deterministic and silent because removing this historical zero-port, zero-equation node cannot change a valid physical network. Malformed edges attached to it are removed with the node. Other unknown block types are untouched so this migration does not become a general-purpose destructive cleanup.

## Acceptance Criteria

- `gas_properties` has no equation factory, component definition, certification exception, or symbol.
- Legacy V-Lab graph inputs do not retain `gas_properties` nodes or their incident edges.
- Certification derives physical-domain acceptance from the canonical engine domain list.
- Ports declared as `Gas` and `Magnetic` pass certification.
- Unknown port domains still fail certification.
- Focused tests and full V-Lab certification pass.
