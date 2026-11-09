# Antigravity sandbox rules

These rules apply to every Antigravity run on a branch named `antigravity/*`.

1. **Branch.** Work only on the checked-out `antigravity/*` branch. Never switch to, merge into, rebase onto, or push
   `automative`, `main` or any other branch.
2. **Scope.** Edit only the files the brief lists under "may change". Everything else is read-only, including:
   - every `*.test.ts` / `*.test.tsx` file (the planner owns the acceptance tests — make them pass, never edit them);
   - `CLAUDE.md`, `.agents/**`, `.claude/**`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`;
   - `docs/superpowers/**`, `docs/antigravity/briefs/**`.
3. **No installs, no network, no secrets.** Do not run `npm install`/`npm ci`, add dependencies, download anything,
   or read/write credentials or `.env` files. Use the dependencies already in `node_modules`.
4. **No git writes.** Do not run `git add`, `git commit`, `git push`, `git reset`, `git checkout -- <file>` or
   `git stash`. Leave the work uncommitted; the human commits it to the sandbox branch and the reviewer lands it.
5. **Gates.** Run the brief's gate commands and fix what they surface before finishing.
6. **Report.** Write the report the brief asks for to `docs/antigravity/results/<task-id>.md` (this file is in scope)
   and print it as your final message.
7. **When unsure, stop.** If the brief's premise is wrong or the task needs a file outside its scope, stop and say so
   in the report instead of widening the change.
