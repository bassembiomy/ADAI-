# SysML Invalid-Action Rejection Design

## Goal

The editor must refuse any BDD relationship action that violates the supported SysML semantics and immediately expose a user-visible error. The rejected action must not mutate the model, history, selection, or persistence state.

## Rules

- A `composition` relationship is directed from the composite block to a block classifier representing the part type. In the BDD editor this is a classifier-level relation; the corresponding concrete part usage is created in the IBD/model layer.
- A composition may not use a requirement, verification case, or other non-block endpoint.
- A block type may be reused as a part type by multiple composite block definitions; that is not multiple ownership of one runtime instance.
- Self-composition and composition cycles are rejected.
- Existing valid composition relationships remain allowed, including one composite block owning multiple different part usages.

## Data flow

The legacy BDD create/update handlers call `validateLegacyRelationshipCandidate` before changing React state. The validator becomes the single guard for this UI path. On failure, the handler calls the existing `addError('error', ...)` surface and returns before `addToHistory` or state mutation. Canonical repository validation remains authoritative for imported and transactional models.

## Error and test contract

Validation returns stable diagnostic codes and a human-readable reason. Unit tests cover invalid endpoint, duplicate, cycle, self-composition, and valid block-to-block composition/reuse. The browser flow verifies that an invalid action leaves the relationship count unchanged and renders an error notification.
