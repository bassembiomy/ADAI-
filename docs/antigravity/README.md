# Antigravity sandbox

Antigravity (Google's agentic IDE / `agy` CLI) works here as an **implementer** under review: the planner (Claude
Opus) writes the acceptance tests and a brief, Antigravity changes code on an isolated branch, and the reviewer
re-runs the gates and reads the diff before anything reaches `automative`.

The cloud session that plans and reviews has no Antigravity CLI, so Antigravity runs on your machine.

## Isolation

| Layer | How |
|---|---|
| Branch | Antigravity works only on `antigravity/sandbox` (created from `automative`). Nothing it does touches `automative` until the reviewer merges it. |
| Rules | `.agents/rules/antigravity-sandbox.md`: allowed files per brief, tests read-only, no installs/network/secrets, no git writes. |
| Brief | `docs/antigravity/briefs/<task>.md`: one bounded task, the exact gate commands, the files it may change. |
| Acceptance tests | Written by the planner before the run and committed on the sandbox branch. |
| Runtime | Use Antigravity's terminal sandbox (`agy ... --sandbox`) and do not pass `--dangerously-skip-permissions`. |

## Run a task (Windows, PowerShell)

```powershell
cd "G:\adia project"            # your clone
git fetch origin antigravity/sandbox
git checkout antigravity/sandbox
git pull origin antigravity/sandbox
npm ci                           # once per clone
```

Then either

- **Antigravity IDE:** open the folder, start a new agent conversation and paste the whole brief file
  (`docs/antigravity/briefs/AG-01-sm-paste-unique-names.md`), or
- **CLI:** `node .agents/skills/agy-delegate/scripts/relay.mjs --brief docs/antigravity/briefs/AG-01-sm-paste-unique-names.md --cd . --sandbox`

When it finishes, push its work for review (Antigravity itself does not commit):

```powershell
git add src/utils/stateMachineClipboard.ts src/App.tsx docs/antigravity/results/AG-01.md
git commit -m "AG-01: State Machine paste unique names (Antigravity, for review)"
git push origin antigravity/sandbox
```

Then ask the reviewer to "review AG-01".

## Review (done by the reviewer, not Antigravity)

1. `git diff automative...antigravity/sandbox` limited to the brief's files; anything else is rejected.
2. Re-run every gate from the brief on a clean checkout.
3. Read the report in `docs/antigravity/results/<task>.md` against the diff.
4. Accept → the reviewer merges the reviewed commit into `automative`. Rework → a delta brief in
   `docs/antigravity/briefs/<task>-r1.md` and another run.

## Task log

| Task | Brief | Status |
|---|---|---|
| AG-01 | State Machine Ctrl+V gives unique names (Idle → Idle1), like right-drag copy | Ready for Antigravity |
