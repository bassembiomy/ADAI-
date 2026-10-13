# Deterministic Generic Agent Routing

## Goal

Make agent requests route deterministically to the correct planning workflow, without classifying architecture or knowledge-management prose as arithmetic or allowing intent data from a previous turn to leak into the current request.

## Requirements

1. Routing must be generic and reusable across domains; it must not contain a one-off PatternStore exception.
2. A planner may run only when its intent is explicitly selected and its required inputs are valid.
3. Arithmetic planning requires an explicit arithmetic operation and two valid operands for binary operations.
4. Pattern ingestion, quarantine, promotion, simulation, validation, and model-construction requests must be distinguishable by structured intent signals and required fields.
5. Loose substring matching must not select a planner. Operation words must be recognized as bounded semantic phrases and confirmed by context.
6. Current-request fields must be built from the current turn only; previous conversation intent, operands, or target behaviors must not be silently reused.
7. Missing or conflicting intent data must produce a structured clarification diagnostic rather than a misleading planner refusal.
8. Existing safety boundaries remain unchanged: external artifacts are non-executable, quarantined patterns cannot be consumed as verified patterns, and only verified patterns reach the execution planner.

## Proposed architecture

Introduce a deterministic routing stage before domain-specific planning:

`raw request → normalized request → intent candidates → candidate preconditions → selected planner or clarification`

The normalized request should preserve the original objective while separately representing explicit intent, entities, operands, source/artifact metadata, target behaviors, and conversation provenance. The router evaluates candidates in a stable order, records why each candidate passed or failed, and selects exactly one planner. A planner must not infer a different intent after dispatch.

Each planner exposes declarative preconditions. Examples:

- Arithmetic: explicit arithmetic phrase, recognized operator, and required operands.
- Pattern workflow: pattern/source/artifact language plus the metadata needed by the requested lifecycle action.
- Model construction: explicit create/build/model language and enough topology or behavior information.
- Validation/simulation: explicit validation/simulation language plus a model reference or active model scope.

If multiple candidates pass, the router uses an explicit precedence table for the request type; it does not depend on object-key order or incidental keyword ordering. If none pass, it returns a clarification diagnostic listing the missing requirements and the candidate interpretations considered.

## Arithmetic safeguards

Replace broad checks such as `text.includes('add')` with token or phrase matching. Arithmetic detection must be gated by an arithmetic context and must not activate merely because an unrelated document contains a similar character sequence. Binary arithmetic requests without two operands should ask for the operands; they should not be routed as general architecture requests or produce a generic planning refusal.

## Conversation isolation

The planner input adapter must create a fresh request envelope for every user turn. Previous-turn values may be used only when explicitly represented as referenced context by the current request. Target behaviors, operands, and operation names from an earlier request must not be appended automatically to the current objective.

## Diagnostics and observability

Routing decisions should expose a stable diagnostic structure containing selected intent, rejected candidates, failed preconditions, and requested clarification fields. Logs and UI messages should use the user-facing remediation, while retaining machine-readable codes for tests and telemetry.

## Testing strategy

- Unit-test bounded operation recognition against architecture prose, metadata prose, and unrelated words.
- Test each planner's positive and negative preconditions.
- Test that the reported architecture request cannot inherit arithmetic intent or operands from a prior add-numbers turn.
- Test deterministic behavior when several keywords occur in one request.
- Test structured clarification for missing operands, missing source metadata, and ambiguous intent.
- Run the existing planner, ingestion, retrieval, promotion, and integration suites to confirm safety and compatibility.

## Scope boundaries

This change covers request normalization, intent routing, planner preconditions, diagnostics, and regression tests. It does not redesign the PatternStore schema, external artifact parsers, or verified-pattern execution semantics.

