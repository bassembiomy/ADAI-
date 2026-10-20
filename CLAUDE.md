# ADIA — working rules

## Building a model for the user (`.adia` projects)

A model is built the way a user builds it in ADIA, never by changing ADIA for the model.

- Use only what the app's UI can create: the model-explorer factories and the gateway commands the editor
  dispatches (`createElement`, `createOwnedFeature`, `createOwnedPort`, `updateElement` with the fields the property
  panels edit, the BDD / IBD / requirements / use case / sequence / activity diagram tools). Never write repository
  data directly, and never store data no screen shows or edits (free-text interface features, documentation in block
  constraints, nested ports, parametric diagrams or bindings — ADIA has no parametric canvas).
- Do not change application code, add features, element kinds or UI to make a model work. If a model cannot be
  expressed with the app as it is, say so instead of working around it.
- Use only the blocks of the user's source; add no new blocks. Whatever the source has that ADIA cannot express is
  reported, not invented.
- Follow SysML v1.6 and Cameo practice: containment by ownership, a diagram owned by its package (or a block owning
  only its IBD, so a double-click opens it), requirement containment as ownership.
- Before delivering: run the app's validators (repository, IBD, BDD), Validate and Generate C/H in the app, open the
  file in the unmodified app and save it with the app's own Save (see `scripts/save_mr_pld_a5414465340_in_app.mjs`).

The engine itself is changed only when the user asks for an engine review, and then only to follow SysML v1.6 /
Cameo semantics, with tests.
