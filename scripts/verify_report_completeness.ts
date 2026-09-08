import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createReportSnapshot, toHierarchySource } from '../src/features/reporting/reportSnapshot';
import { generateArchitectureReport } from '../src/features/reporting/generateArchitectureReport';

const input = process.argv[2] || 'adia_project_unified_adia_corrected.json';
const project = JSON.parse(fs.readFileSync(input, 'utf8'));
const snapshot = createReportSnapshot(project);
const html = generateArchitectureReport(toHierarchySource(snapshot), snapshot.diagnostics, { projectName: project.projectName });
const missing = [...snapshot.relationships, ...snapshot.connectors, ...(snapshot.transitions ?? [])]
  .filter(edge => !html.includes(`id="edge-${edge.id}"`)).map(edge => edge.id);
fs.mkdirSync('artifacts/report-review', { recursive: true });
fs.writeFileSync('artifacts/report-review/architecture-report.html', html);
console.log(JSON.stringify({ input, relationships: snapshot.relationships.length, connectors: snapshot.connectors.length, transitions: snapshot.transitions?.length, missing, diagnostics: snapshot.diagnostics, output: 'artifacts/report-review/architecture-report.html' }, null, 2));
assert.equal(missing.length, 0, 'Every surviving connection must appear in the report');
