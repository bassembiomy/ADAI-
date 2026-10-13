Update only docs/security/dependency-vulnerability-baseline-2026-09-10.md to address the Task 1 review findings.

1. Correct exposure wording for @capacitor/cli and @types/three: package.json lists them under dependencies and forge.config.cjs includes node_modules in packaged output. Distinguish “not imported by application source” from “not shipped”; do not claim they are build-only or development-only without qualification.
2. Mark the Vitest/@vitest/mocker and postcss-selector-parser rows explicitly as incomplete inventory paths because the requested tree/audit evidence did not fully expand them. Note package-lock evidence for postcss-selector-parser if verified, but do not invent a dependency parent.
3. Make the Plotly report/export wording precise, distinguishing Plotly DOM/static-image handling from direct jsPDF export if supported by source inspection.

Do not modify package files, source code, or the plan. Do not run remediation or commit. Report the changed file and checks run.
