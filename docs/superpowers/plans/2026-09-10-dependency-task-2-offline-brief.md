Retry Task 2 in G:\adia project using npm offline cache only because registry access is currently EACCES.

Read docs/superpowers/plans/2026-09-10-dependency-vulnerability-remediation.md Task 2. You may update only safe non-breaking transitive/tooling dependencies already available in the local npm cache. Do not modify Plotly packages, Electron Forge packages, application source, or use npm audit fix --force. Candidate cached patched versions include @vitest/mocker/vitest 4.1.11, @xmldom/xmldom 0.9.10, fflate 0.8.3, browserslist 4.28.7 or 4.28.9, and postcss-selector-parser 7.1.1. Verify compatibility before changing package.json/package-lock.json; do not force overrides if a parent pins a dependency.

Use npm install/update with --offline only. Run npm ls for affected packages, npm audit --json (record if endpoint still fails), focused Vitest suites, and npm run build. Do not commit. Report exact changes and unresolved chains.
