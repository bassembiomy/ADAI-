# X-Bridges Canonical Boundary Mappings Design

## Goal

Allow state-machine variables to enter and leave X-Bridges states through
Inport and Outport blocks without invalid saved mappings, simulation drift, or
generated-C behavior differences.

## Root Cause

The application currently exposes three independently editable identifiers for
each mapping: state-machine variable, block, and port. New rows are persisted
immediately with empty block and port IDs. Inport and Outport blocks also store
their own `params.smVarId`, creating a second mapping source that can disagree
with `xBridgesModel.mappings`.

Exported models can therefore contain a valid variable ID but empty block and
port IDs, or boundary-block parameters that refer to a deleted variable. Model
migration rejects those files before semantic validation, simulation, or code
generation can begin.

## Canonical Data Contract

`xBridgesModel.mappings` is the only authoritative persisted mapping source.
Every mapping contains four non-empty stable fields:

```ts
interface XBMappingV1 {
  smVarId: string;
  blockId: string;
  portId: string;
  direction: 'in' | 'out';
}
```

Boundary mappings use this contract:

- `in`: state-machine variable to an Inport input port.
- `out`: Outport output port to a state-machine variable.

Inport and Outport `params.smVarId` may be maintained as derived UI metadata
for compatibility, but it must never override the canonical mapping array.

## Editor Behavior

The mapping editor replaces free-text block and port IDs with selections based
on the actual X-Bridges graph.

- The user selects the variable and direction.
- For `in`, only Inport input ports are offered.
- For `out`, only Outport output ports are offered.
- When exactly one compatible boundary exists, the application selects it
  automatically.
- A mapping is written to application state only when all four fields are
  valid.
- Removing a boundary block removes mappings that reference that block.
- Changing direction clears any incompatible boundary selection before a new
  valid mapping is committed.

The engine remains generic: canonical mappings still identify block and port
IDs explicitly, and semantic validation remains responsible for type, shape,
direction, uniqueness, and driver rules.

## Legacy Repair

During model migration, incomplete boundary mappings are repaired only when the
intent is unambiguous:

- A mapping with a valid variable, direction `in`, and missing block/port IDs
  binds to the sole Inport input in the state.
- A mapping with a valid variable, direction `out`, and missing block/port IDs
  binds to the sole Outport output in the state.
- A valid canonical mapping wins over stale `params.smVarId` metadata.
- If multiple compatible boundaries exist, migration reports a precise error
  and does not guess.
- If a canonical mapping is absent, a boundary block's valid `params.smVarId`
  may be imported only when it produces one unambiguous mapping.
- References to nonexistent variables remain errors.

This repair permits the supplied `G:\statemachine.json` to recover its two
blank target IDs because it has exactly one Inport, one Outport, and a valid
variable ID in each canonical mapping row.

## Execution Semantics

Simulation and generated C use the same order and data path:

```text
SM variable -> Inport input -> Inport output -> X-Bridges graph
X-Bridges graph -> Outport input -> Outport output -> SM variable
```

Inport and Outport are scalar pass-through operations when both ports exist.
Legacy one-sided semantic models remain mapping-owned and are not overwritten
with synthesized zero values.

The scalar example uses `Sum`, not `VectorAdd`:

```text
x -> Inport -> Sum(+ Constant 1) -> Outport -> x
```

`VectorAdd` remains vector-only for embedded code until separate scalar
conformance is intentionally added.

## Error Handling

- The UI prevents saving incomplete mappings.
- Migration repairs only deterministic legacy cases.
- Ambiguous or stale mappings produce diagnostics identifying the state,
  mapping, missing element, and required correction.
- Semantic validation is not weakened or bypassed.
- Code generation stops on unresolved mapping diagnostics.

## Verification

Tests must prove:

1. Creating an input or output mapping persists stable variable, block, and
   port IDs without an intermediate invalid row.
2. Changing direction cannot leave an incompatible port selection.
3. Deleting a boundary block prunes its mappings.
4. Saving and reopening a model preserves canonical mappings.
5. The supplied legacy blank-ID shape repairs when one Inport and Outport are
   present.
6. Multiple compatible boundaries remain an explicit migration error.
7. Stale `params.smVarId` does not override a valid canonical mapping.
8. The semantic model accepts the repaired two-port graph.
9. For `x = 1`, Inport -> Sum(+1) -> Outport commits `x = 2`.
10. TypeScript simulation and compiled C produce identical traces.

## Scope

This change covers scalar state-machine boundary mappings through Inport and
Outport. It does not enable scalar code generation for vector-only blocks or
silently coerce vector/matrix signals into scalar variables.
