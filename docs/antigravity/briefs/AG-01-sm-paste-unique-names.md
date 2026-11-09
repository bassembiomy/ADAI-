<task>
Task AG-01, repository ADIA (TypeScript, React, vitest), branch `antigravity/sandbox`.

In the State Machine editor, Ctrl+V names pasted states and junctions `Name_copy`. Right-drag copy already uses
Simulink-style unique names (Idle -> Idle1). Make Ctrl+V follow the same rule.

Current state:
- `src/utils/stateMachineClipboard.ts`, function `pasteStateMachineClipboard`: states get `name: \`${s.name}_copy\``
  (about line 142) and junctions `name: \`${j.name}_copy\`` (about line 160). It returns `newStates`, `newJunctions`
  (only the pasted items) and `updatedLayers`.
- `src/utils/stateMachineDragCopy.ts` shows the wanted rule: it imports `uniqueBlockLabel` from
  `src/components/common/canvasCopy/blockCopy.ts` and builds a `taken` set of names already used in the target layer.

Required behaviour (the acceptance tests define it exactly):
- A pasted top-level state gets a name unique among the states already in the target layer (`currentLayerId`), using
  `uniqueBlockLabel(name, taken)`; add each new name to `taken` before naming the next one (State_1, State_2 pasted
  next to State_1 and State_2 become State_3 and State_4).
- Top-level junctions: the same rule among the junctions already in the target layer; an empty name stays empty.
- States inside a pasted composite state keep their original names (they live in their own new sub-layer).
- A name that is free in the target layer is kept unchanged.
- SysML blocks and parts in the clipboard (`newBlocks`, `newParts`, the `_copy` at about lines 208 and 222) stay as
  they are.
- Also in `src/App.tsx` (about line 11403): the junction right-click clone names the copy `${name}_copy`; use
  `uniqueBlockLabel` against the junction names of the current layer instead (keep the `J${n}` fallback for an unnamed
  junction). Change only that expression and the import it needs.

May change: `src/utils/stateMachineClipboard.ts`, `src/App.tsx` (only the junction clone name expression and one
import line), `docs/antigravity/results/AG-01.md` (your report).
Leave untouched: every test file, `src/utils/stateMachineDragCopy.ts`, `src/components/common/canvasCopy/**`, all
other files. Follow `.agents/rules/antigravity-sandbox.md`.
</task>

<verification_loop>
Run and make green before finishing (from the repository root):
  npx vitest run src/utils/stateMachineClipboard.test.ts src/utils/stateMachineClipboardNaming.test.ts src/components/common/canvasCopy.test.ts
  npx vitest run src/components/sysml
  npx tsc --noEmit -p tsconfig.json
Confirm `git status` shows only the files listed under "May change".
</verification_loop>

<action_safety>
Keep the change scoped to the task. No refactors, renames or cleanup elsewhere. Do NOT edit tests. Do NOT run git add,
git commit, git push, npm install or anything that uses the network. Leave the work uncommitted.
</action_safety>

<missing_context_gating>
Do not guess repository facts. If a line number above has moved, find the code by its content. If the tests cannot
pass without touching a file outside the allowed list, stop and explain in the report.
</missing_context_gating>

<structured_output_contract>
Write this report to docs/antigravity/results/AG-01.md and print it as your final message:
  1. What changed and why
  2. Files touched
  3. Gate outcomes (paste the vitest summary lines and the tsc result)
  4. Anything you deviated on, left open, or want a decision on
</structured_output_contract>
