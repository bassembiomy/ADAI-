# ADIA Help Enhancements: State Machine Execution Order, Use Case Notation & Sequence Diagnostics

Date: 2026-10-06  
Status: Approved  

## 1. Goal

Enhance the in-application ADIA Help system with:
1. A structured execution order diagram and lifecycle breakdown for the State Machine runtime.
2. A complete item and symbol notation guide for Use Case Diagrams, along with a comprehensive reference of all error/validation message causes.
3. A complete item and symbol notation guide for Sequence Diagrams, along with a comprehensive reference of all 18 interaction validator error codes, their underlying causes, and resolution actions.

All explanations and diagrams must remain grounded in the actual codebase implementations:
- State Machine: `src/utils/stateMachine/smInterpreter.ts`, `src/utils/stateMachine/smSemanticBuilder.ts`.
- Use Case Diagrams: `src/engine/sysml/useCases.ts`, `src/features/sysml/useCaseDiagramView.ts`, `src/services/sysmlUseCaseCommands.ts`.
- Sequence Diagrams: `src/engine/sysml/interaction.ts`, `src/services/sysmlInteractionCommands.ts`, `src/features/sysml/sequenceDiagramView.ts`.

---

## 2. Topic Enhancements

### 2.1 State Machine Execution Order (`state-machine-execution`)

Add a dedicated `lifecycle-order` section containing a structured SVG diagram (`HelpDiagram` flow/blocks) and accompanying text detailing the exact evaluation stages of a single logical tick:

1. **Tick Validity & Time Threshold Check:**
   - Evaluates `delta_ms` against non-negative finite bounds (`INVALID_ELAPSED_MS`).
   - Verifies tick tolerance against configured `tickMs` (`TIMING` fault if exceeded).
2. **Timer Updates:**
   - Increments active state elapsed timers: `stateTimers[s] += delta_ms`.
3. **Configuration & Region Evaluation Order:**
   - Active state configurations are evaluated top-down from composite states to leaf states.
   - For `AND` parallel regions: active orthogonal children execute in deterministic ascending priority order, tie-broken by element ID.
   - For `OR` regions: exactly one active child state executes.
4. **Per-State Order of Operations:**
   - **Stage 1 (Outer Transitions):** Candidate outgoing transitions are sorted by ascending numeric `order`/priority, then ID. For each candidate:
     - Check trigger type (`condition`, `after`, `and`, `or`).
     - Condition checks guard expression against variables.
     - `after` checks if `stateTimers[s] >= afterTicks * tickMs`.
     - If transition fires:
       - Run Exit Actions of exiting states (from innermost active child up to the least common ancestor).
       - Run Transition Action statements.
       - Run Entry Actions of entered states (from ancestor down to target state).
       - Reset entered state timer to 0.
       - **Returns immediately** (skipping Stages 2–5 for this state).
   - **Stage 2 (During Action):** Executes if and only if no outer transition was taken.
   - **Stage 3 (Embedded X-Bridges Step):** If `isXBridges` is true, advances the embedded signal graph by one step.
   - **Stage 4 (Inner/Internal Transitions):** Evaluated in priority order; when taken, executes transition action **without** running exit or entry actions and **without** leaving the state.
   - **Stage 5 (Child Layers):** Recursively advances nested child state configurations.
5. **Fault Latching:**
   - Any evaluation error, unhandled exception, or timing violation transitions the machine into a Fault state and latches the error. No normal ticks run until an explicit `Reset`.

---

### 2.2 Use Case Diagram Notation & Error Reference (`use-case-diagrams`)

Expand the `use-case-diagrams` topic with:

#### 2.2.1 Item & Symbol Catalog
- **Actor (`«actor»`):** Stick figure or box with «actor» keyword representing an external entity, user role, or hardware peripheral interacting with the system.
- **Subject Boundary (`«subject»`):** Rectangular frame representing the system or subsystem boundary enclosing the use cases it realizes.
- **Use Case (`(Goal)`):** Ellipse/oval representing an autonomous user/system goal.
- **Association:** Solid line connecting an Actor to a Use Case.
- **Include (`«include»`):** Dashed line with open arrowhead pointing from base use case to the mandatory included sub-use case.
- **Extend (`«extend»`):** Dashed line with open arrowhead pointing from optional extending use case to the base use case. Includes an extension point label and optional `[condition]`.
- **Generalization:** Solid line with a hollow closed triangular arrowhead pointing from the specific (specialized) use case or actor to the general one.
- **Traceability (`«satisfy»`, `«refine»`, `«trace»`):** Dashed dependency arrows linking Use Cases to requirements.

#### 2.2.2 Error Causes & Diagnostics Reference Table
- `DUPLICATE_RELATIONSHIP`: A relationship of the same kind already exists between the same source and target.
- `INVALID_ENDPOINT_KIND`: Relationship endpoint kinds are incompatible (e.g., Include/Extend between Actors, or drawing associations directly to Subject boundaries).
- `INVALID_DIRECTION`: Relationship arrow drawn in reverse (e.g., Include pointing from included goal to base goal, or Generalization pointing from general to specific).
- `MISSING_EXTENSION_POINT`: Creating an «extend» relationship without specifying an existing or new extension point on the target use case.
- `GENERALIZATION_CYCLE`: An actor or use case directly or indirectly generalizes itself, creating an infinite inheritance loop.
- `INCLUDE_CYCLE`: Transitive include dependencies form a circular inclusion graph.

---

### 2.3 Sequence Diagram Notation & Error Reference (`sequence-diagrams`)

Expand the `sequence-diagrams` topic with:

#### 2.3.1 Item & Symbol Catalog
- **Lifeline:** Box header containing participant name/type and vertical dashed line with derived execution activation bars.
- **Synchronous Call (`synchCall`):** Solid arrow with filled arrowhead representing a blocking request that awaits a reply.
- **Asynchronous Call (`asynchCall`):** Solid arrow with open arrowhead representing a non-blocking invocation.
- **Signal (`asynchSignal`):** Solid arrow with open arrowhead representing an asynchronous broadcast or signal event.
- **Reply (`reply`):** Dashed arrow with open arrowhead returning control/data from an earlier synchronous call.
- **Create Message (`createMessage`):** Dashed arrow pointing directly to a lifeline header box, lowering the participant head to the point of creation.
- **Delete Message (`deleteMessage`):** Solid arrow ending in a prominent stop cross ('X') indicating participant destruction.
- **Self Message:** Directed arrow looping back to the same lifeline.
- **Combined Fragment:** Rectangular frame labeled with an operator (`alt`, `opt`, `loop`, `par`, `break`, `critical`, `neg`, `seq`, `strict`) and dashed horizontal dividers separating operands with condition guards `[guard]`.
- **Interaction Use (`ref`):** Rectangular frame referencing a separate reusable Interaction definition.
- **State Invariant:** Curly bracket `{state}` notation placed on a lifeline asserting that a participant must occupy that state at that point in time.

#### 2.3.2 Diagnostics & Error Causes Reference Table (All 18 Validator Codes)
- `MISSING_LIFELINE_REPRESENTS`: The Lifeline's `representsId` targets a deleted or nonexistent Block, Part, or Actor.
- `DUPLICATE_LIFELINE_NAME`: Two or more lifelines in the same interaction have identical names.
- `SCENARIO_ACTOR_NOT_ASSOCIATED`: A lifeline represents an Actor that is not associated with the Use Case owning this scenario.
- `LIFELINE_OUTSIDE_CONTEXT`: In an interaction owned by a Block, a lifeline represents an element outside that Block's internal part hierarchy.
- `MESSAGE_ENDPOINT_MISSING`: Message references a deleted or nonexistent sender or receiver lifeline.
- `LOST_FOUND_INVALID`: A lost or found message is used with a synchronous call or reply (only asynchronous calls and signals may have lost/found endpoints).
- `INVALID_MESSAGE_ORDER` / `DUPLICATE_MESSAGE_ORDER`: Message sequence positions are non-finite or share the same order number.
- `MESSAGE_BEFORE_CREATE`: A message is sent or received by a lifeline before that lifeline's `createMessage` order.
- `MULTIPLE_CREATE_MESSAGES`: A lifeline is targeted by more than one `createMessage`.
- `MESSAGE_AFTER_DELETE`: A message is placed on a lifeline after that lifeline's destruction order.
- `REPLY_WITHOUT_CALL`: A reply message has no preceding unmatched synchronous call between the same two lifelines in the reverse direction.
- `CALL_WITHOUT_REPLY`: A synchronous call is not answered by a matching reply before either participant terminates.
- `SIGNAL_SIGNATURE_MISSING`: An asynchronous signal message is missing its linked Signal definition reference.
- `UNKNOWN_MESSAGE_OPERATION`: A call message references an operation name that is not declared on the receiving Block classifier.
- `MESSAGE_CONNECTOR_MISSING` / `MESSAGE_CONNECTOR_MISMATCH`: The connector assigned to the message does not exist or does not connect the parts represented by the lifelines.
- `UNKNOWN_FRAGMENT_OPERATOR`: A combined fragment uses an unrecognized operator string.
- `OPERAND_WITHOUT_GUARD`: A combined fragment operand is missing its required condition guard.
- `OPT_LOOP_SINGLE_OPERAND`: An `opt`, `loop`, `break`, `critical`, or `neg` fragment has multiple operands (only 1 operand is permitted).
- `USE_CYCLE`: A circular dependency exists between Interaction definitions through `ref` interaction uses.

---

## 3. Verification & Acceptance Criteria

1. Help content tests in `src/help/moduleTopics.test.ts` pass and assert presence of the new symbols, lifecycle stages, and error tables.
2. `npm run test:help` passes all tests across all help suites.
3. `npm run help:coverage` maintains 100.00% registered feature coverage with 0 missing destinations.
4. `npx tsc --noEmit` compiles cleanly with 0 TypeScript errors.
