# Sequence Diagram support

ADIA implements a practical Interaction subset for editing, validation and diagrams.
This support does not establish full UML 2.5.1 / SysML 1.6 Interaction semantic conformance.

## Lifeline lifecycle validation

- Lifelines without a create message exist from the start of the interaction.
- A lifeline with a create message cannot send or receive earlier messages
  (`MESSAGE_BEFORE_CREATE`). A lifeline cannot send its own creation message.
- A lifeline can receive only one create message (`MULTIPLE_CREATE_MESSAGES`).
- Messages after deletion remain invalid (`MESSAGE_AFTER_DELETE`).
- Ordering follows message `order`, not storage array position. Duplicate positions
  are independently invalid (`DUPLICATE_MESSAGE_ORDER`).
- The editor's message checks and repository diagnostics share creation rules.
  Inserting or moving creation after existing traffic is rejected by message checks.

## Semantic limits

Messages connect lifelines directly. Occurrence specifications, editable execution
specifications, general ordering, gates, continuations, lifeline decomposition and
selectors are not represented. Execution bars are inferred from call/reply pairing.
Operands store message ids; visual nesting does not provide explicit fragment ownership.
Supported operators are alt, opt, loop, par, break, critical, neg, seq and strict;
assert, ignore and consider are not supported.

Arguments and operation signatures are text. Argument validation checks counts,
not value types or parameter directions. Time/duration constraints anchor to messages,
not individual send/receive occurrences, and expressions are not evaluated.

## PlantUML export

PlantUML export is a one-way visual representation, not full model interchange.
It includes participants, messages, fragment groups and guards, ref frames and state
invariants. Time/duration constraints, connector identity and traceability relationships
are omitted. Fragment ranges are assumed to span consecutive messages. Importing the
text cannot restore the complete ADIA model.
