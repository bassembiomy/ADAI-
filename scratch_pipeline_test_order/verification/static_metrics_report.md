# ADIA State Machine Static Metrics Report

## Validated semantic model

| Metric | Value |
|---|---:|
| States | 2 |
| Transitions | 1 |
| Junctions | 0 |
| Variables | 4 |
| Layers | 1 |
| OR layers | 1 |
| AND layers | 0 |
| Active configuration slots | 1 |
| Fixed step | 10 ms |

## Shared behavioral analysis

- State reachability: 100.0%
- Reachable state IDs: a, b
- Unreachable state IDs: None
- Terminal state IDs: None
- Enumerated paths: 1
- Maximum path length: 2
- Structural branch coverage estimate: 100.0%
- Potential deadlocks: 1
- Potential unconditional self-loops: 0

## Generated source metrics

| Metric | Value |
|---|---:|
| Files measured | 10 |
| Total lines | 852 |
| Functional lines | 738 |
| Comment/blank density | 13.4% |

## X-Bridges static code-generation metrics

- X-Bridges states: 0
- X-Bridges blocks: 0
- Operation evaluations per tick: 0
- Estimated X-Bridges static memory lower bound: 0 bytes (lower-bound-excludes-padding; excludes target ABI padding and linker allocation)
- Solver: None
- Numeric types: None
- Required target capabilities: None
- Unsupported embedded capabilities: None

These are structural metrics derived from the same validated semantic analysis used by the testing report. They are not formal MISRA, safety-certification, embedded-timing, or target-hardware evidence.
