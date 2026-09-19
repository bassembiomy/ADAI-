# General X-Bridges Engineering Agent Design

**Status:** Approved design draft  
**Date:** 2026-09-19  
**Scope:** Natural-language creation, inspection, modification, debugging, repair, and optimization of X-Bridges models

## Objective

Build a general AI engineering agent that converts natural-language requirements into verified X-Bridges models and can safely work on existing models. The agent may use only block definitions, parameters, and ports that exist in the active X-Bridges catalog. It must ask for every missing or ambiguous requirement, prove that the complete proposal compiles and simulates, and obtain approval for every individual mutation.

The agent is not required to satisfy requests outside the capabilities of the installed X-Bridges catalog and engine. It must refuse such requests and identify the unavailable block, physical behavior, connection semantics, solver capability, or evidence needed to proceed.

## Capability Boundary

The completed system supports six intents:

1. Create a new model from natural-language requirements.
2. Inspect and explain an existing model.
3. Modify an existing model while preserving unaffected behavior.
4. Diagnose compilation, topology, parameter, and simulation failures.
5. Apply deterministic, bounded repairs after individual user approvals.
6. Optimize a model against explicit objectives, constraints, parameter bounds, and a finite search budget.

A request is executable only when all of these conditions hold:

- Every component maps to an existing `BLOCK_LIBRARY` definition.
- Every connection uses existing ports with compatible direction and signal semantics.
- Every parameter exists in the source definition and has a valid value and unit.
- Mandatory engineering requirements and operating conditions are known.
- The selected topology and solver are supported by the real X-Bridges engine.
- An isolated preflight model compiles and simulates successfully.
- Every reported result is tied to the same model fingerprint and engine run.

If any condition fails, the agent refuses execution and returns structured diagnostics. It does not create a partially supported model.

## Architectural Decision

Use a capability-driven planner. Templates and retrieved examples are evidence and starting points, not execution authority. The current X-Bridges catalog, validation rules, and simulation engine remain the source of truth.

Rejected alternatives:

- A template-only agent cannot cover arbitrary compositions and creates brittle coverage gaps.
- A free-form LLM action generator creates excessive hallucination risk and non-deterministic retries.

The architecture has five layers.

### 1. Knowledge ingestion

Ingest legally accessible public models and documentation, ADIA examples, and user-imported MATLAB/Simulink or Scilab artifacts. Do not bypass payment, authentication, licensing, robots controls, technical access controls, or usage restrictions. Restricted sources may be represented only by permitted citations and metadata.

All online material is reviewed and normalized into a versioned offline database before the planning agent can use it. The runtime agent does not browse the internet during a design request.

### 2. X-Bridges compatibility compiler

Translate external concepts into combinations of existing X-Bridges blocks. External block definitions are never copied into the active project and the compiler never creates a new block type. An unmapped component, parameter, port, unit, or behavior makes the pattern non-executable.

### 3. Deterministic retrieval and planning

Classify the request, collect complete requirements, retrieve compatible patterns, and synthesize a typed graph plan. Given identical requirements, active-model fingerprint, catalog version, knowledge-base version, and planner configuration, the deterministic planning stage produces the same canonical plan. An LLM may extract intent and propose candidates, but schema validation and deterministic planning decide what is executable.

### 4. Proof before mutation

Validate the entire proposed graph before requesting mutation approvals. Proof includes catalog membership, parameter validation, port compatibility, connectivity, source/load/reference completeness where applicable, sample-time compatibility, solver support, compilation, and isolated simulation. A plan that cannot complete this proof is refused.

### 5. Approval-bound execution

Display the complete proved plan, then request approval for every individual creation, deletion, connection, disconnection, move, rename, and parameter update. Each token is single-use and bound to project ID, base revision, action ID, action kind, and canonical parameters. The executor verifies the observed state change after every action.

## Knowledge Base

Each executable pattern is an immutable `EngineeringPattern` with:

- `id`, `title`, `domain`, `version`, tags, and aliases.
- Source URI or file identity, author, license, retrieval time, content checksum, and citation.
- Mandatory and optional requirements, units, valid ranges, operating conditions, and clarification prompts.
- Logical components, connections, feedback paths, references, sources, loads, sensors, and sinks.
- Exact mappings to X-Bridges block IDs, parameter names, and port IDs.
- Supported solver set, fixed/adaptive step constraints, stop conditions, observables, and acceptance envelopes.
- Compilation evidence, simulation run ID, diagnostics, benchmark results, model fingerprint, catalog version, and engine version.
- Lifecycle state: `quarantined`, `reviewed`, `verified`, `deprecated`, or `rejected`.

Structured indexes provide deterministic filtering. A local vector index may rank candidates, but similarity cannot make a pattern executable. Only the compatibility compiler and proof pipeline can promote a pattern to `verified`.

Imported Simulink and Scilab artifacts begin in quarantine. Parsers extract supported topology, parameters, units, and simulation settings. The compatibility compiler maps those concepts to existing X-Bridges definitions. Unmappable artifacts remain non-executable references with provenance; they cannot contribute actions to a plan.

## Request Workflow

1. Classify the request as create, inspect, modify, diagnose, repair, or optimize.
2. Inspect the active X-Bridges model, project revision, catalog version, and engine capabilities.
3. Extract requirements and ask one clarification at a time until every mandatory field and ambiguity is resolved.
4. Retrieve only reviewed or verified patterns compatible with the request and active catalog.
5. Generate a typed canonical graph plan containing exact block, parameter, port, and connection identifiers.
6. Preflight the complete graph without mutating the live workspace.
7. Compile and simulate an isolated realization with the same engine used by the UI.
8. Refuse unsupported or unsuccessful plans with structured, actionable diagnostics.
9. Present requirements, selected evidence, topology, assumptions, predicted observables, simulation evidence, and every planned action.
10. Request approval separately for each mutation.
11. Before each action, verify the token and live project revision; after it, verify the expected state delta.
12. After the last action, compile, simulate, save, reload, and compare the persisted fingerprint.
13. Commit the transaction only after every check succeeds.
14. On rejection, cancellation, stale state, or failure, restore the exact pre-transaction live and persisted snapshots.
15. Expose one-step transaction undo and reject it if later user edits changed the committed fingerprint.

Read-only inspection and explanation do not require mutation approval. Running simulation does require explicit approval because it consumes compute and produces project evidence, but it does not authorize model mutation.

## Debugging and Repair

Diagnostics must identify the failing layer: requirement, retrieval, mapping, schema, topology, compilation, solver, runtime, persistence, or reload. The agent traces a failure to concrete blocks, ports, parameters, or engine diagnostics and distinguishes observed evidence from hypotheses.

Repairs are deterministic and bounded to three candidates per diagnostic cycle. Every repair candidate is preflighted and simulated in isolation. Each mutation in an accepted repair still receives individual approval. If no candidate passes proof, the agent refuses repair and reports the remaining capability gap.

## Optimization

Optimization requires:

- A numeric objective or ordered set of objectives.
- Explicit constraints and acceptance thresholds.
- Allowed parameters and numeric bounds.
- A deterministic algorithm and random seed when stochastic sampling is used.
- A finite evaluation and time budget.
- A fixed simulation scenario and model fingerprint.

The report contains the baseline, candidates evaluated, rejected candidates and reasons, winning configuration, measured improvement, engine run IDs, and reproducibility settings. LLM judgment is never accepted as optimization evidence.

## Transactions and Failure Handling

The orchestrator captures a complete node, edge, presentation, revision, and persisted-project snapshot before the first mutation. Although approvals are action-by-action, all actions belong to one atomic transaction. Rejecting any remaining action or encountering any failure rolls back the whole transaction.

Rollback covers block creation, deletion, parameter updates, connection changes, movement, rename, compile failure, simulation failure, cancellation, worker failure, save failure, and reload mismatch. Rollback success is verified by comparing stable fingerprints of live and persisted state. A rollback mismatch is a critical failure and must not be reported as success.

## User Interface

The Agent panel exposes:

- Detected intent and active project/revision.
- Outstanding clarification questions.
- Confirmed requirements and explicit assumptions.
- Retrieved pattern provenance and compatibility status.
- Exact proposed blocks, parameters, ports, connections, and layout.
- Preflight, compilation, and isolated-simulation evidence.
- One approval card per action, including expected state delta.
- Live progress, diagnostics, cancellation, transaction rollback, and undo.
- Final persisted fingerprint and engine run identifiers.

The UI never labels a model completed when compilation, simulation, persistence, or reload verification is missing.

## Security and Provenance

- Ollama output is untrusted and must satisfy strict schemas.
- Model text cannot invoke tools directly or provide approval tokens.
- Only local loopback LLM endpoints are supported by the local provider.
- Imports are size-limited, parsed without executing macros or embedded code, and scanned before quarantine entry.
- Source licenses and provenance are mandatory; unknown or incompatible licenses prevent executable promotion.
- Online ingestion runs separately from request-time planning and cannot mutate an open project.
- Logs and reports distinguish sourced facts, deterministic inference, simulation evidence, and user assumptions.

## Verification and Release Gates

Release requires all of the following:

- Automatic catalog indexing covers every registered X-Bridges block and its actual ports and parameters.
- Acceptance tests show zero invented block IDs, port IDs, parameters, or connections.
- End-to-end tests cover create, inspect, modify, diagnose, repair, and optimize intents.
- Clarification tests prove that unresolved mandatory requirements prevent planning.
- Approval tests prove tokens are exact, revision-bound, single-use, and action-specific.
- Failure-injection tests prove exact rollback for every mutation phase, cancellation, worker failure, save failure, and reload mismatch.
- Every successful model compiles and simulates in the real X-Bridges worker.
- Reported measurements share the committed model fingerprint and engine run identifier.
- Import tests retain source, license, checksum, and mapping evidence and prevent unsupported content from becoming executable.
- Restart tests prove persisted models reload with identical fingerprints and remain undoable as one transaction.
- Ollama tests cover health, selected-model discovery, timeout, cancellation, malformed output, offline behavior, and model switching.
- Domain acceptance scenarios cover electrical, control, signal processing, robotics, thermal, hydraulic, logic, and mixed-rate systems only where the catalog and engine advertise those capabilities.
- TypeScript, unit tests, browser tests, security scanning, and production packaging pass.
- Independent review has no unresolved blocker or high-severity model-integrity finding.

## Delivery Decomposition

This scope is delivered as independently testable increments:

1. Canonical catalog and capability index.
2. Typed general graph planner and complete clarification engine.
3. Live action-complete X-Bridges adapter and atomic approval transaction.
4. Isolated compile/simulation proof and persisted save/reload verification.
5. Versioned engineering pattern store and deterministic retrieval.
6. Public-source ingestion and provenance pipeline.
7. Simulink and Scilab quarantine importers and compatibility compiler.
8. Existing-model diagnosis and bounded repair.
9. Deterministic optimization and evidence reporting.
10. Cross-domain acceptance corpus, security review, and release gate.

Each increment must work through the same UI-connected live delegate used in production. In-memory adapters may support unit tests but cannot constitute acceptance evidence.
