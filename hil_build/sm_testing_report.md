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
- Reachable state IDs: fc452778-f368-4f41-81bd-b1a3d3e2fac9, 71cb93e8-e357-4659-b62f-a3145823df82
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
| State_1 | fc452778-f368-4f41-81bd-b1a3d3e2fac9 | SM_ST_FC452778_F368_4F41_81BD_B1A3D3E2FAC9 | root | no |
| State_2 | 71cb93e8-e357-4659-b62f-a3145823df82 | SM_ST__71CB93E8_E357_4659_B62F_A3145823DF82 | root | no |

## 8. HIL Driver Mapping Report

- **Target Microcontroller:** Arduino_Mega
- Explicit mappings: 1
