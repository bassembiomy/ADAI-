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
- Reachable state IDs: f250e7aa-b1cb-41f0-8e88-74ba0068c2b8, 9ec22ae9-b1db-4ec4-8fac-5712a1840705
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
| State_1 | f250e7aa-b1cb-41f0-8e88-74ba0068c2b8 | SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8 | root | no |
| State_2 | 9ec22ae9-b1db-4ec4-8fac-5712a1840705 | SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705 | root | no |

## 8. HIL Driver Mapping Report

- **Target Microcontroller:** Arduino_Mega
- Explicit mappings: 2
