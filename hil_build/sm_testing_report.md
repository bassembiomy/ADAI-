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
- Reachable state IDs: 535ddd5a-c012-46ce-b23c-9a6ce8d81df6, 979256a5-9d43-41f5-929f-5b27ad7deb22
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
| State_1 | 535ddd5a-c012-46ce-b23c-9a6ce8d81df6 | SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6 | root | no |
| State_2 | 979256a5-9d43-41f5-929f-5b27ad7deb22 | SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22 | root | no |

## 8. HIL Driver Mapping Report

- **Target Microcontroller:** Arduino_Mega
- Explicit mappings: 1
