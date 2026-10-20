# Antigravity tasks for the Powertrain blockset

These briefs are the Antigravity share of `docs/superpowers/plans/2026-10-20-powertrain-blockset-xbridges.md` (§5).
Each file is one self-contained task. Antigravity sees nothing but the brief and the repository.

## Two ways to run a brief
- **Route a — Claude drives Antigravity** (on the Windows machine, `agy` installed and signed in):
  ```bash
  node .agents/skills/agy-delegate/scripts/relay.mjs --brief docs/powertrain/antigravity/WP-01-inventory.md --cd "G:/adia project"
  ```
  Opus reads `result.json`, re-runs the gates, reviews the diff and commits.
- **Route b — you paste it**: open the repo in the Antigravity IDE, start a new agent conversation, paste the whole
  brief. When it finishes, tell the Claude session "WP-xx done by Antigravity"; Opus reviews and commits.

## Rules every brief repeats
- Do not `git add` / `git commit`. Opus commits after review.
- Touch only the files the brief lists. Never edit tests, `docs/powertrain/ledger.json`, `.adia` files,
  `package.json` or lockfiles.
- Never copy MathWorks icons, images or shipped calibration tables into the repository.

## Status
| Brief | WP | Needs | State |
| --- | --- | --- | --- |
| `WP-01-inventory.md` | 01 | MATLAB R2024b + Powertrain Blockset | ready |
| `WP-02-goldens.md` | 02 (AG part) | WP-01 done | ready (runs after WP-01) |

Later briefs (WP-06, 07, 08, drive cycles, goldens per block group, reference apps, help, Simulink map) are written by
Opus when their dependencies are done, so they always match the code as it is then.
