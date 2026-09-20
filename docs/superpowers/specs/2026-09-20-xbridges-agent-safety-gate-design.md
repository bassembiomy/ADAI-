# X-Bridges Agent Generated-Graph Safety Gate

## Goal

Make deterministic and LLM-generated X-Bridges plans fail closed when they contain invalid block types, ports, parameters, topology, or ambiguous engineering inputs.

## Design

The planner remains responsible for synthesis. A new focused validator is responsible for checking synthesized graphs against the canonical capability index before actions are created. Both deterministic archetypes and LLM output use the same validation path.

Unknown or ambiguous requests will return structured refusal/clarification diagnostics instead of silently creating a `Constant -> Scope` generic model. Retrieved, verified patterns will be passed into planning and preferred before zero-shot LLM synthesis.

Numeric and unit-bearing inputs will use the existing engineering entity parser, with invalid or ambiguous values rejected. Plans that pass structural validation will continue through the existing isolated proof runner; tests will additionally assert meaningful simulated outputs for arithmetic models.

## Validation rules

- Block IDs are unique and non-empty.
- Every block type exists in the capability index.
- Parameters are allowed by the block capability, have valid types, and satisfy declared ranges where available.
- Every connection references existing blocks.
- Every source port is a declared output and every target port is a declared input.
- Connections do not duplicate an existing edge or overfill a non-vector input.
- The graph has no isolated generated block unless the block is explicitly a source or sink.
- The graph contains a valid observable sink for requests requiring display/measurement.
- LLM output is bounded by schema and graph-size limits.

## Success criteria

The safety gate rejects malformed/adversarial LLM graphs without producing executable actions, arithmetic requests compute correct results including negative/fractional inputs, retrieved patterns reach the planner, unsupported requests are explicit, and focused plus full agent regression suites pass.

