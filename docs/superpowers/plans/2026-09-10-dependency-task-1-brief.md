# Task 1 Brief: Dependency Vulnerability Baseline

Work in `G:\adia project` on the current branch. Read the full remediation plan at `docs/superpowers/plans/2026-09-10-dependency-vulnerability-remediation.md`, especially Task 1.

Create only `docs/security/dependency-vulnerability-baseline-2026-09-10.md`. Capture the current `npm audit --json` counts and all vulnerable dependency chains, including direct/transitive status, installed versions, proposed fixes, and production/build/test exposure based on the repository usage. Use the exact current audit output; do not invent versions or claim remediation.

Run:

```powershell
npm audit --json
npm ls plotly.js @plotly/mapbox-gl maplibre-gl @electron-forge/cli @electron/packager extract-zip @xmldom/xmldom fast-uri browserslist fflate vitest --all
```

Do not modify `package.json` or `package-lock.json`. Do not delete files, run `npm audit fix`, or commit. Report changed files, commands/results, and concerns in your final response.
