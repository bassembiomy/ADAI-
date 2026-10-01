# Prompt-Driven ADIA Engineering Agent Design

## Status

Approved design. Initial vertical workflow: air-fryer engineering, with support for new and existing ADIA projects.

## Goal

Provide one central, JARVIS-like conversational agent that understands engineering requests, asks focused questions until the request is sufficiently specified, and coordinates the complete ADIA engineering workflow. The agent must remain approval-gated: it may inspect, reason, propose, and validate, but it cannot modify project state without explicit user approval.

## Operating model

The agent follows this loop:

`Understand -> Ask -> Record -> Confirm specification -> Plan -> Ask approval -> Propose ADIA-block changes -> Ask approval -> Execute -> Validate -> Report`

It supports both:

- New projects, starting from a natural-language product idea.
- Existing projects, starting from project files and current ADIA artifacts.

Example request: “Make an X-BRIDGES model for a BLDC motor with inverter.” The agent identifies the required architecture, inspects the available ADIA library, asks for missing motor, inverter, control, sensor, load, and test data, and continues until the model has approved requirements and success criteria.

## Architecture

### Offline LLM runtime

The baseline deployment targets normal office computers with approximately 8–16 GB RAM and CPU-focused execution. The agent uses a local 7B–8B instruction-tuned model in 4-bit quantized form, served through Ollama or `llama.cpp`. The exact model remains configurable and must be selected through local benchmark testing rather than hard-coded into the application. A model-provider interface keeps the agent compatible with another local model or an optional online provider later.

The LLM performs language understanding, clarification, structured requirement drafting, proposals, and explanations. Deterministic ADIA logic, schemas, tool contracts, and validators remain responsible for block availability, model integrity, compilation, simulation checks, and engineering verification. If the local model is unavailable, the application may still inspect projects and run deterministic validators, but natural-language orchestration is limited.

### Central ADIA Agent

The single coordinating agent interprets user intent, maintains context, selects the next question or action, and explains decisions in concise natural language. Its personality may be JARVIS-like, but its engineering behavior remains explicit, traceable, and conservative.

### Structured requirement state

Each task maintains objective, target system, inputs, constraints, assumptions, required outputs, success criteria, open questions, project context, proposed actions, approvals, evidence, and status. The state is the source of truth rather than unstructured chat history.

### Clarification engine

The engine asks one focused question at a time. It must detect missing, ambiguous, conflicting, or technically unsafe information. It must not silently invent engineering values. Standard defaults may be proposed, but they enter the specification only after approval.

### Specification and planning stages

When required information is complete, the agent presents a structured specification and waits for explicit approval. After approval, it creates an execution plan and waits for explicit approval before proposing changes.

### Controlled tool gateway

All external actions go through a controlled gateway for ADIA project files, ADIA model operations, MATLAB/Simulink, compilers, test runners, and validators. The gateway records the requested operation, target, inputs, result, and evidence.

## ADIA block constraint

The agent must use only blocks and components already available in the ADIA application. It must never create a new block or component. If no suitable existing block exists, it must stop that workflow, identify the missing capability, and report that the model cannot be completed with the current ADIA library. It may suggest existing alternatives for user selection, but cannot substitute one silently.

## Approval and safety

The first release is read-only until approval. Required gates are:

1. Specification approval.
2. Execution-plan approval.
3. Approval before every model, file, or project modification.
4. Approval before applying any proposed engineering default.

The agent may inspect files, analyze existing artifacts, prepare proposals, and run permitted validation without changing project state. Every proposed change must show its reason, affected artifacts, expected result, and dependencies.

## Traceability and validation

The system links user requests to requirements, ADIA blocks, model connections, simulations, generated code, tests, and reports. Validation must identify passed checks, failed checks, unresolved questions, assumptions, missing blocks, and evidence locations. A task is complete only when its approved success criteria are satisfied or the agent clearly reports why completion is blocked.

## Initial workflow scope

The first end-to-end workflow is an air fryer. It covers product requirements, system architecture, thermal/control behavior, temperature sensing, safety limits, operating modes, power considerations, simulation planning, embedded-control planning, verification tests, and engineering reports, using existing ADIA capabilities. The architecture should remain extensible to other systems after this vertical workflow is validated.

## Error handling

- Missing information: ask a focused question.
- Conflicting information: show the conflict and ask which requirement governs.
- Proposed default: request approval before recording or using it.
- Missing ADIA block: stop and report the library limitation.
- Tool failure: preserve the state, show the error and evidence, and propose a retry or corrective plan for approval.
- Failed validation: do not claim completion; map the failure back to affected requirements and request the next decision.

## Success criteria

The design succeeds when a user can submit an air-fryer idea or existing project, answer the agent’s focused questions, approve a complete specification and plan, approve each proposed change, and receive a validated ADIA engineering package with traceable evidence—without the agent creating any new ADIA blocks or silently making engineering decisions.
