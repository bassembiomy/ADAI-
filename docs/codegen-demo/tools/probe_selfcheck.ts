/**
 * Probe: does the generator's own structural self-check reach the test package?
 *
 *   npx esbuild --bundle --platform=node --format=cjs --outfile=/tmp/probe.cjs \
 *     docs/codegen-demo/tools/probe_selfcheck.ts ...   # then: node /tmp/probe.cjs
 *
 * Finding (2026-09-14, gcc 12.2.0 / node 22): it does not.
 *   - flat mode  (10 files + reports): verifyGeneratedCStructure() runs, reports 0 errors,
 *     and `instance->data.x` never appears in the file list it scans.
 *   - package mode (27 files): generateCArtifacts() returns before the check runs at all,
 *     so the generated tests carrying `instance->data.x` ship with errors == [].
 *   Re-running verifyGeneratedCStructure() over the package output reports them.
 */
import { migrateStateMachineModel } from '../../../src/utils/stateMachine/smModelMigration';
import { buildSemanticModel } from '../../../src/utils/stateMachine/smSemanticBuilder';
import { generateCArtifacts, verifyGeneratedCStructure } from '../../../src/utils/stateMachine/smCGenerator';
import { thermalControllerModel } from '../thermal-model';

const migrated = migrateStateMachineModel(thermalControllerModel());
const built = buildSemanticModel(migrated.model);
if (!built.ir) throw new Error('model failed to build');
const ir = built.ir;

const flat = generateCArtifacts(ir);
console.log('FLAT files=%d errors=%d', flat.files.length, flat.errors.length);
for (const error of flat.errors) console.log('  FLAT-DIAG', error.message);

const pkg = generateCArtifacts(ir, { includeVerificationPackage: true });
console.log('PKG  files=%d errors=%d', pkg.files.length, pkg.errors.length);
const rescan = verifyGeneratedCStructure(pkg.files);
console.log('RESCAN valid=%s diagnostics=%d undeclared=%j', rescan.valid, rescan.diagnostics.length, rescan.undeclaredMembers);
for (const diag of rescan.diagnostics.slice(0, 3)) console.log('  RESCAN-DIAG', diag.message);

// Why the re-scan above still says "valid": its member regex only matches pointer access
// (`something->data.member`). The generated tests declare the instance on the stack and use
// `instance.data.x`, so they are invisible to it. Count both spellings, then re-scan with a
// regex that sees both.
const byFile = new Map<string, number>();
for (const file of pkg.files) {
  const hits = (file.content.match(/(?:->|\.)data\.x\b/g) ?? []).length;
  if (hits > 0) byFile.set(file.name, hits);
}
console.log('data.x occurrences in package (-> and .):', [...byFile.entries()].map(([name, n]) => `${name}:${n}`).join(', ') || 'none');

const header = pkg.files.find((file) => file.name.endsWith('.h') && file.content.includes('SM_Data_t'));
const declared = new Set<string>();
if (header) {
  const structMatch = /typedef\s+struct\s*\{([\s\S]*?)\}\s*SM_Data_t;/m.exec(header.content);
  for (const match of (structMatch?.[1] ?? '').matchAll(/^\s*[A-Za-z_][\w]*\s+([A-Za-z_]\w*)\s*;/gm)) declared.add(match[1]);
}
const undeclared = new Map<string, string[]>();
for (const file of pkg.files) {
  for (const match of file.content.matchAll(/(?:->|\.)data\.([A-Za-z_]\w*)/g)) {
    if (!declared.has(match[1])) {
      const list = undeclared.get(match[1]) ?? [];
      if (!list.includes(file.name)) list.push(file.name);
      undeclared.set(match[1], list);
    }
  }
}
console.log('corrected scan: SM_Data_t declares', [...declared].join(', '));
console.log('corrected scan: undeclared members', [...undeclared.entries()].map(([member, files]) => `${member} in ${files.join(', ')}`).join(' | ') || 'none');
