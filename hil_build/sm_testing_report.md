# ADIA State Machine Generated-C Verification Report

## Summary

- Execution mode: STATIC_ANALYSIS_ONLY
- Static AST reachability: 100.0%
- Dynamic executable reachability: NOT RUN

## Structural validation

- Structural model validation: PASS
- States: 2
- Layers: 1 (1 OR, 0 AND)
- Active configuration slots: 1
- Static AST reachability: 100.0%
- Reachable state IDs: 265d4f7c-6336-4720-a143-e009c1002387, 480c2bb1-273c-4c96-a72c-29b0644f4691
- Unreachable state IDs: None
- Terminal state IDs: None

## Semantic validation

- Semantic IR validation: PASS
- Rendering consumed one immutable, validated semantic model.
- OR layers maintain one active child; AND layers maintain one active child per region.
- Terminal states are quiescent and do not trigger implicit reset.
- Shallow history restores the direct child; deep history restores the recorded descendant configuration.
- Runtime order is outer transition, during action, inner transition, then active children.

## Verification evidence

- Structural validation: PASS
- Semantic validation: PASS
- Host compilation: NOT RUN
- Host runtime: NOT RUN
- Differential trace: NOT RUN
- Compiled X-Bridges execution: NOT RUN
- Embedded compilation: NOT RUN
- Target hardware: PENDING
- Formal MISRA compliance and safety certification: NOT CLAIMED

Evidence labels describe only the checks actually recorded for this generated package. A PASS at one level does not imply a PASS at any other level.

## X-Bridges code generation

- X-Bridges states: 0
- X-Bridges blocks: 0
- Operation evaluations per tick: 0
- Estimated X-Bridges static memory lower bound: 0 bytes (lower-bound-excludes-padding; excludes target ABI padding and linker allocation)
- Solver: None
- Numeric types: None
- Required target capabilities: None
- Unsupported embedded capabilities: None

## State traceability

| State name | Model ID | C enum | Layer | X-Bridges |
|---|---|---|---|---|
| State_1 | 265d4f7c-6336-4720-a143-e009c1002387 | SM_ST__265D4F7C_6336_4720_A143_E009C1002387 | root | no |
| State_2 | 480c2bb1-273c-4c96-a72c-29b0644f4691 | SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691 | root | no |

## 8. HIL Driver Mapping Report

- **Target Microcontroller:** Arduino_Mega
- Explicit mappings: 1
