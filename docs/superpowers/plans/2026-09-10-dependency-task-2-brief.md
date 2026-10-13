# Task 2: Safe dependency updates

Work in G:\adia project on the current branch. Read Task 2 in docs/superpowers/plans/2026-09-10-dependency-vulnerability-remediation.md.

Update only non-breaking vulnerable transitive/tooling dependencies. Do not modify Plotly packages, Electron Forge packages, or application source. Do not run npm audit fix --force. Use registry metadata and targeted npm installs/updates. Target patched versions where compatible: @vitest/mocker >=4.1.11, @xmldom/xmldom >0.8.14, fast-uri >=3.1.6, browserslist >4.28.6, fflate >=0.8.3, postcss-selector-parser >=6.1.3. If a parent pins a package or the registry is unavailable, document the blocker and do not invent overrides.

Modify package.json/package-lock.json only if the update is real and compatible. Run npm ls for the affected packages, npm audit --json, the focused Vitest suites (src/engine/sysml, src/engine/vlab, src/components/sysml, src/utils/vlabLibrary.test.ts), and npm run build. Do not commit; report exact files, commands, results, and any unresolved chains.
