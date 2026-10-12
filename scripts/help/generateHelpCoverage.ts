import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { getHelpFeatures, HELP_FEATURE_TOPICS } from '../../src/help/helpFeatures';
import { validateHelpCoverage } from '../../src/help/helpCoverage';
import { HELP_DATA } from '../../src/HelpData';

const features = getHelpFeatures();
const topics = { ...HELP_DATA, ...HELP_FEATURE_TOPICS };
const coverage = validateHelpCoverage(features, topics);
const snapshot = JSON.parse(readFileSync('docs/help/audit/2026-10-06-ui-candidates.json', 'utf8'));
const appAudit = JSON.parse(readFileSync('docs/help/audit/app-ui-reconciliation.json', 'utf8'));
const opmAudit = JSON.parse(readFileSync('docs/help/audit/opm-ui-reconciliation.json', 'utf8'));
const uiAudit = JSON.parse(readFileSync('docs/help/audit/ui-controls-reconciliation.json', 'utf8'));

const auditMap = new Map<string, any>();
for (const r of appAudit.records || []) auditMap.set(r.candidateId, r);
for (const r of opmAudit || []) auditMap.set(r.candidateId, r);
for (const r of (uiAudit && uiAudit.items) || []) auditMap.set(r.candidateId, r);

const candidateFiles = [...new Set<string>(snapshot.items.map((item: { source: string }) => item.source))].sort();
const reconciliation = snapshot.items.map((item: { candidateId: string; source: string; line: number; tag: string; label: string; handlers: Record<string, string> }) => {
  const rec = auditMap.get(item.candidateId);
  const status = rec?.status ?? 'requires-semantic-review';
  const featureIds = rec?.featureIds ?? [];
  const reason = rec?.reason ?? 'Source candidate is not proof of rendered reachability or useful instructional coverage. Inspect the handler and map its actual effect before counting.';
  return {
    candidateId: item.candidateId,
    sourcePath: item.source,
    snapshotLine: item.line,
    tag: item.tag,
    label: item.label,
    status,
    featureIds,
    reason,
    sourceEvidence: rec?.sourceEvidence ?? [item.source],
  };
});
const statusCounts = Object.fromEntries([...new Set(reconciliation.map((row: {status:string}) => row.status))].sort().map(status => [status, reconciliation.filter((row: {status:string}) => row.status === status).length]));
const modules = candidateFiles.map(sourcePath => ({
  sourcePath,
  candidates: reconciliation.filter((row: {sourcePath:string}) => row.sourcePath === sourcePath).length,
  mapped: reconciliation.filter((row: {sourcePath:string;status:string}) => row.sourcePath === sourcePath && (row.status === 'mapped' || row.status === 'documented' || row.status.startsWith('mapped'))).length,
  excluded: reconciliation.filter((row: {sourcePath:string;status:string}) => row.sourcePath === sourcePath && (row.status === 'excluded' || row.status === 'obsolete')).length,
  unresolved: reconciliation.filter((row: {sourcePath:string;status:string}) => row.sourcePath === sourcePath && (row.status === 'requires-semantic-review' || row.status === 'unreviewed')).length,
}));
mkdirSync('docs/help', { recursive: true });
writeFileSync('docs/help/2026-10-06-help-coverage.json', JSON.stringify({ scope: 'Registered semantic features; UI source candidates reported separately.', ...coverage, features, uiCandidates: { total: reconciliation.length, files: candidateFiles.length, statusCounts, modules } }, null, 2));
writeFileSync('docs/help/2026-10-06-ui-reconciliation.json', JSON.stringify({ sourceSnapshot: 'docs/help/audit/2026-10-06-ui-candidates.json', scope: 'Snapshot reconciliation. Snapshot line numbers locate evidence, never stable feature identity. Unresolved sites remain visible.', statusCounts, modules, items: reconciliation }, null, 2));
const missing = [...coverage.missingTopics, ...coverage.missingSections, ...coverage.insufficientContent];
writeFileSync('docs/help/2026-10-06-help-coverage.md', `# ADIA Help coverage\n\nGenerated from live registries and schema factories. This is feature mapping coverage, not proof that every reachable UI control has complete instructions.\n\n${coverage.documented}/${coverage.total} registered features have resolvable instructional destinations (${coverage.coverage.toFixed(2)}%). ${coverage.missing} missing. Duplicate IDs: ${coverage.duplicateFeatureIds.length}.\n\n## Source UI reconciliation\n\n${reconciliation.length} source candidates across ${candidateFiles.length} files. Status: ${JSON.stringify(statusCounts)}. The full JSON preserves every candidate and its reconciliation reason. Dynamic factories expand separately; duplicate sites are not unique feature counts.\n\n| Source | Candidates | Mapped | Excluded | Unresolved |\n|---|---:|---:|---:|---:|\n${modules.map(module => `| ${module.sourcePath} | ${module.candidates} | ${module.mapped} | ${module.excluded} | ${module.unresolved} |`).join('\n')}\n\n## Missing instructional destinations\n\n${missing.length ? missing.map(id => `- ${id}`).join('\n') : 'None in the registered feature inventory.'}\n`);
console.log(JSON.stringify({ total: coverage.total, documented: coverage.documented, missing: coverage.missing, coverage: coverage.coverage, uiCandidates: statusCounts }));
if(!coverage.valid) process.exitCode=1;
await import('./generateLiveUiCoverage');
const live=JSON.parse(readFileSync('docs/help/2026-10-06-live-ui-reconciliation.json','utf8'));
appendFileSync('docs/help/2026-10-06-help-coverage.md', `\n## Current source scan\n\n${live.items.length} handler sites across ${live.files} production TSX files were scanned from the current source, including callback wiring and gestures omitted from the earlier snapshot. Status: ${JSON.stringify(live.statusCounts)}. The live report retains source signatures and a fingerprint; tests reject stale evidence and demonstrate failure for a new unmapped inline control. Callback wiring, profiler hooks and propagation wrappers are explicitly excluded rather than counted as user features.\n\n## Implementation limits\n\nCOSEC is a palette-only entry with no registered X-Bridges factory; its unavailability is documented. Component instructions distinguish current simplified/placeholder relations from intended physical behavior. Mapping coverage does not certify numerical correctness, hardware behavior, standards compliance or engineering validity.\n`);
