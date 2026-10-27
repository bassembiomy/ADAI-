// @vitest-environment node
/**
 * Phase-3 acceptance tests (planner-owned): real verification evidence, honest reports,
 * determinism. Plan: docs/superpowers/plans/2026-10-27-autosar-codegen.md, "Phase 3" (V1-V8).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync as readSource } from 'node:fs';
import type { VariableDef } from '../../../types/sm_types';
import { flatOrFixture } from '../smFixtures';
import type { StateMachineModelV5 } from '../smModel';
import { generateAutosarSwc } from './autosarSwcGenerator';
import {
  runAutosarVerification,
  verifyAutosarPackage,
  type AutosarGateEvidence,
  type AutosarVerificationEvidence,
} from './autosarVerifier';
import { buildAutosarReport, buildAutosarReportSection } from './autosarReport';
import { sha256Hex } from './autosarSha256';

type GeneratedFile = { name: string; content: string };

const GATE_IDS = [
  'generation', 'misra-subset', 'arxml-structure', 'host-build', 'unit-test', 'coverage',
  'static-analysis', 'sanitizers', 'second-compiler', 'differential', 'reproducible-build',
] as const;

const variable = (id: string, type: VariableDef['type'], initialValue = '0'): VariableDef => ({
  id, name: id, type, initialValue,
  currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue),
  visibleInScope: true,
});

const automotiveFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables.push(variable('lamp_level', 'uint8'));
  model.states[1].entry = 'lamp_level = 200;';
  return model;
};

/** Richer behaviour for the differential gate: counters, back-transition, temporal trigger, mixed types. */
const differentialFixture = (): StateMachineModelV5 => {
  const model = automotiveFixture();
  model.variables.push(variable('speed', 'int16'), variable('ticks', 'uint16'), variable('alarm', 'bool', 'false'));
  model.states[0].during = 'ticks = ticks + 1;';
  model.states[1].during = 'alarm = speed > 120;';
  model.transitions.push({
    ...model.transitions[0],
    id: 't_ba',
    sourceId: 'b',
    targetId: 'a',
    condition: 'speed < 10',
    action: 'lamp_level = 0;',
  });
  model.layers[0].transitionIds = ['t_ab', 't_ba'];
  return model;
};

const safetyFixture = (): StateMachineModelV5 => {
  const model = automotiveFixture();
  model.safetyMode = true;
  model.states[1].isSafeState = true;
  return model;
};

const gate = (evidence: AutosarVerificationEvidence, id: string): AutosarGateEvidence => {
  const found = evidence.gates.find((item) => item.id === id);
  expect(found, `gate ${id}`).toBeDefined();
  return found!;
};

const reportRow = (markdown: string, id: string): string => {
  const match = new RegExp(`^\\|\\s*${id}\\s*\\|\\s*(PASS|FAIL|NOT RUN)\\s*\\|`, 'm').exec(markdown);
  expect(match, `report row for ${id}`).not.toBeNull();
  return match![1];
};

const generated = (model: StateMachineModelV5): GeneratedFile[] => {
  const result = generateAutosarSwc(model);
  expect(result.errors).toEqual([]);
  return result.files;
};

const replaceIn = (files: GeneratedFile[], name: string, from: string | RegExp, to: string): GeneratedFile[] =>
  files.map((item) => {
    if (item.name !== name) return item;
    const content = item.content.replace(from, to);
    expect(content, `sabotage of ${name} must change it`).not.toBe(item.content);
    return { ...item, content };
  });

// One full real run per model, shared by the tests below (each run compiles and executes everything).
let accepted: AutosarVerificationEvidence;
let acceptedAgain: AutosarVerificationEvidence;
let differential: AutosarVerificationEvidence;
let safety: AutosarVerificationEvidence;

beforeAll(async () => {
  accepted = await runAutosarVerification(automotiveFixture(), { executedAt: null });
  acceptedAgain = await runAutosarVerification(automotiveFixture(), { executedAt: null });
  differential = await runAutosarVerification(differentialFixture(), { cycles: 1000, seed: 7, executedAt: null });
  safety = await runAutosarVerification(safetyFixture(), { executedAt: null });
}, 600_000);

describe('V1/V2 real verifier', () => {
  it('runs every gate for real and accepts a correct package', () => {
    expect(accepted.gates.map((item) => item.id)).toEqual([...GATE_IDS]);
    for (const item of accepted.gates) {
      expect(item.status, `${item.id}: ${item.summary}`).toBe('pass');
      expect(item.summary.length, item.id).toBeGreaterThan(0);
    }
    expect(accepted.verdict).toBe('accepted');
    expect(accepted.swcName).toBe('AdiaSwc');
    expect(accepted.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    for (const id of ['host-build', 'unit-test', 'static-analysis', 'sanitizers', 'second-compiler', 'reproducible-build']) {
      const item = gate(accepted, id);
      expect(item.tool, id).not.toBeNull();
      expect(item.toolVersion, id).toMatch(/\d+\.\d+/);
      expect(item.command, id).not.toBeNull();
    }
    expect(gate(accepted, 'coverage').metrics.linesPercent).toBe(100);
    expect(gate(accepted, 'coverage').metrics.branchesTakenPercent).toBeGreaterThanOrEqual(90);
    expect(gate(accepted, 'differential').metrics.cycles).toBe(500);
    expect(gate(accepted, 'differential').metrics.mismatches).toBe(0);
    expect(gate(accepted, 'reproducible-build').metrics.objects).toBeGreaterThanOrEqual(5);
    expect(gate(accepted, 'misra-subset').metrics.findings).toBe(0);
  });

  it('accepts the safety-mode package', () => {
    for (const item of safety.gates) expect(item.status, `${item.id}: ${item.summary}`).toBe('pass');
    expect(safety.verdict).toBe('accepted');
  });

  it('records the SHA-256 of every package file, matching Node crypto', () => {
    const files = generated(automotiveFixture());
    expect(Object.keys(accepted.fileSha256).sort()).toEqual(files.map((item) => item.name).sort());
    for (const item of files) {
      expect(accepted.fileSha256[item.name], item.name).toBe(createHash('sha256').update(item.content, 'utf8').digest('hex'));
    }
  });
});

describe('V3 differential correctness against the ADIA interpreter', () => {
  it('matches the interpreter on 1000 seeded cycles of a model with counters, back-transitions and mixed types', () => {
    const item = gate(differential, 'differential');
    expect(item.status, item.summary).toBe('pass');
    expect(item.metrics.cycles).toBe(1000);
    expect(item.metrics.mismatches).toBe(0);
    expect(differential.verdict).toBe('accepted');
  });

  it('detects a one-value semantic bug that the unit test does not need to know about', async () => {
    const files = replaceIn(generated(automotiveFixture()), 'autosar/core/sm_user_logic.c', /\b200\b/, '201');
    const evidence = await verifyAutosarPackage(automotiveFixture(), files, { gates: ['differential'], executedAt: null });
    const item = gate(evidence, 'differential');
    expect(item.status).toBe('fail');
    expect(item.metrics.mismatches).toBeGreaterThan(0);
    expect(evidence.verdict).toBe('not-accepted');
  }, 300_000);
});

describe('V8 honesty: sabotage fails, missing tools are NOT RUN, never PASS', () => {
  it.each([
    ['misra-subset', 'autosar/swc/AdiaSwc.c', /\{/, '{ goto sabotage; sabotage: ;'],
    ['arxml-structure', 'autosar/arxml/AdiaSwc.arxml', /DEST="P-PORT-PROTOTYPE">([^<]*)</, 'DEST="P-PORT-PROTOTYPE">/Nowhere/Missing<'],
    ['host-build', 'autosar/swc/AdiaSwc.c', /FUNC\(void, AdiaSwc_CODE\) AdiaSwc_MainFunction\(void\)\s*\{/, 'FUNC(void, AdiaSwc_CODE) AdiaSwc_MainFunction(void)\n{\n    int unused_sabotage;'],
  ] as const)('a defect for %s makes that gate fail', async (gateId, name, from, to) => {
    const files = replaceIn(generated(automotiveFixture()), name, from, to);
    const evidence = await verifyAutosarPackage(automotiveFixture(), files, { gates: [gateId], executedAt: null });
    expect(gate(evidence, gateId).status).toBe('fail');
    expect(evidence.verdict).toBe('not-accepted');
    const markdown = buildAutosarReport(automotiveFixture(), { evidence }).markdown;
    expect(reportRow(markdown, gateId)).toBe('FAIL');
    expect(markdown).toMatch(/Verdict[^\n]*NOT ACCEPTED/);
  }, 300_000);

  it('gates that were not selected are NOT RUN and the verdict is not accepted', async () => {
    const evidence = await verifyAutosarPackage(automotiveFixture(), generated(automotiveFixture()), { gates: ['generation'], executedAt: null });
    expect(gate(evidence, 'generation').status).toBe('pass');
    for (const id of GATE_IDS.filter((item) => item !== 'generation')) {
      expect(gate(evidence, id).status, id).toBe('not-run');
    }
    expect(evidence.verdict).toBe('not-accepted');
  }, 120_000);

  it('a missing compiler makes its gates NOT RUN with a reason, and the report says so', async () => {
    const evidence = await verifyAutosarPackage(automotiveFixture(), generated(automotiveFixture()), {
      gates: ['host-build', 'unit-test', 'second-compiler'],
      tools: { gcc: '/nonexistent/gcc', clang: '/nonexistent/clang' },
      executedAt: null,
    });
    for (const id of ['host-build', 'unit-test', 'second-compiler']) {
      const item = gate(evidence, id);
      expect(item.status, id).toBe('not-run');
      expect(item.summary, id).toMatch(/not (found|available)/i);
      expect(reportRow(buildAutosarReport(automotiveFixture(), { evidence }).markdown, id)).toBe('NOT RUN');
    }
    expect(evidence.verdict).toBe('not-accepted');
  }, 120_000);
});

describe('V8 determinism', () => {
  it('two independent verifier runs produce identical evidence', () => {
    expect(acceptedAgain).toEqual(accepted);
  });

  it('report rendering is byte-identical for identical input, and generation-time reports have no dynamic PASS', () => {
    const first = buildAutosarReport(automotiveFixture(), { evidence: accepted });
    const second = buildAutosarReport(automotiveFixture(), { evidence: acceptedAgain });
    expect(second.markdown).toBe(first.markdown);
    expect(second.html).toBe(first.html);

    const bare = buildAutosarReport(automotiveFixture(), {});
    expect(bare.errors).toEqual([]);
    for (const id of ['host-build', 'unit-test', 'coverage', 'static-analysis', 'sanitizers', 'second-compiler', 'differential', 'reproducible-build']) {
      expect(reportRow(bare.markdown, id), id).toBe('NOT RUN');
    }
    expect(bare.markdown).toMatch(/Verdict[^\n]*NOT ACCEPTED/);
    expect(buildAutosarReport(automotiveFixture(), {}).markdown).toBe(bare.markdown);
  });
});

describe('V4 report content', () => {
  it('covers process, architecture, code properties, gates, traceability, open items and verdict', () => {
    const { markdown, html } = buildAutosarReport(differentialFixture(), { evidence: differential });
    for (const heading of [
      /^#+ .*Identification/m, /^#+ .*AUTOSAR process/m, /^#+ .*Software architecture/m, /^#+ .*Code properties/m,
      /^#+ .*Verification/m, /^#+ .*Traceability/m, /^#+ .*Open items/m, /^#+ .*Verdict/m,
    ]) expect(markdown).toMatch(heading);
    for (const reference of ['ISO 26262-6', 'ISO 26262-8', 'MISRA C:2012', 'AUTOSAR']) expect(markdown).toContain(reference);
    expect(markdown).toContain(`ADIA-FINGERPRINT: ${differential.fingerprint}`);
    expect(markdown).toMatch(/Verdict[^\n]*\bACCEPTED\b/);
    expect(markdown).not.toMatch(/Verdict[^\n]*NOT ACCEPTED/);
    for (const id of GATE_IDS) expect(reportRow(markdown, id), id).toBe('PASS');
    expect(markdown).toContain('1000'); // differential cycles reported
    expect(markdown).toMatch(/1e-12|bit-exact/);

    // Traceability: every state -> its C functions, every transition, every port -> variable.
    for (const stateId of ['A', 'B']) {
      for (const phase of ['Entry', 'During', 'Exit']) expect(markdown).toContain(`SM_ST_${stateId}_${phase}`);
    }
    for (const transitionId of ['t_ab', 't_ba']) expect(markdown).toContain(transitionId);
    for (const port of ['RP_go', 'RP_speed', 'PP_lamp_level', 'PP_ticks', 'PP_alarm', 'PP_SmStatus', 'RP_SmFaultEvent']) {
      expect(markdown).toContain(port);
    }

    // Honest language.
    for (const match of markdown.matchAll(/certifi\w*/gi)) {
      const before = markdown.slice(Math.max(0, match.index! - 40), match.index!);
      expect(before, `"${match[0]}" must be negated or framed as an open item`).toMatch(/\b(not|no|before|for|towards|toward|prior to)\b[^.\n]*$/i);
    }
    expect(html).toContain('<table');
  });

  it('escapes model text in HTML', () => {
    const model = automotiveFixture();
    model.states[0].name = '<script>alert(1)</script>';
    const { html, markdown } = buildAutosarReport(model, {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(markdown.length).toBeGreaterThan(0);
  });

  it('reports generation errors instead of a package', () => {
    const model = automotiveFixture();
    model.transitions[0].condition = 'ghost > 1';
    const report = buildAutosarReport(model, {});
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.markdown).toContain('GUARD_EXPRESSION_INVALID');
    expect(report.markdown).toMatch(/Verdict[^\n]*NOT ACCEPTED/);
  });
});

describe('V5 package documents', () => {
  it('ships the verification report, safety manual and a correct SHA256SUMS', () => {
    const model = automotiveFixture();
    const files = generated(model);
    const byName = new Map(files.map((item) => [item.name, item.content]));
    expect(byName.get('autosar/doc/Verification_Report.md')).toBe(buildAutosarReport(model, { swcName: 'AdiaSwc' }).markdown);

    const manual = byName.get('autosar/doc/Safety_Manual.md')!;
    expect(manual).toBeDefined();
    for (const term of ['ISO 26262-8', 'Tool Confidence Level', 'TCL', 'Tool Impact', 'limitation']) {
      expect(manual, term).toMatch(new RegExp(term, 'i'));
    }

    const sums = byName.get('autosar/doc/SHA256SUMS')!;
    const lines = sums.trim().split('\n');
    const listed = new Map(lines.map((line) => {
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      expect(match, line).not.toBeNull();
      return [match![2], match![1]] as const;
    }));
    const expectedNames = files.map((item) => item.name.slice('autosar/'.length)).filter((name) => name !== 'doc/SHA256SUMS').sort();
    expect([...listed.keys()].sort()).toEqual(expectedNames);
    for (const [name, hash] of listed) {
      expect(hash, name).toBe(createHash('sha256').update(byName.get(`autosar/${name}`)!, 'utf8').digest('hex'));
    }
  });

  it('pure-TS SHA-256 matches Node crypto', () => {
    for (const input of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é∑😀\n'.repeat(300)]) {
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    }
  });
});

describe('V6 ADIA project report section', () => {
  it('builds an escaped AUTOSAR section and App.tsx wires it into the project report', () => {
    const section = buildAutosarReportSection(automotiveFixture(), 'AdiaSwc');
    expect(section.id).toBe('autosar-swc');
    expect(section.title).toMatch(/AUTOSAR/);
    expect(section.html).toContain('AdiaSwc');
    expect(section.html).toMatch(/NOT RUN/);
    const app = readSource(join(__dirname, '../../../App.tsx'), 'utf8');
    const reportHandler = app.slice(app.indexOf('const handleGenerateReport'), app.indexOf('const handleGenerateReport') + 60_000);
    expect(reportHandler).toMatch(/extraSections\.push\(\s*buildAutosarReportSection\(/);
  });
});

describe('V7 CLI', () => {
  it('writes evidence and the filled report, exits 0 when accepted and 1 when a compiler is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'adia-autosar-cli-'));
    try {
      const chartPath = join(directory, 'chart.json');
      writeFileSync(chartPath, JSON.stringify(automotiveFixture()));
      const ok = spawnSync('npx', ['tsx', 'scripts/verify_autosar.ts', '--chart', chartPath, '--out', join(directory, 'ok'), '--swc', 'CtApLamp'], {
        cwd: join(__dirname, '../../../..'), encoding: 'utf8', timeout: 400_000,
      });
      expect(ok.status, `${ok.stdout}\n${ok.stderr}`).toBe(0);
      const evidence = JSON.parse(readFileSync(join(directory, 'ok', 'verification_evidence.json'), 'utf8')) as AutosarVerificationEvidence;
      expect(evidence.verdict).toBe('accepted');
      expect(evidence.swcName).toBe('CtApLamp');
      const report = readFileSync(join(directory, 'ok', 'autosar', 'doc', 'Verification_Report.md'), 'utf8');
      expect(reportRow(report, 'unit-test')).toBe('PASS');
      expect(report).toMatch(/Verdict[^\n]*\bACCEPTED\b/);

      const bad = spawnSync('npx', ['tsx', 'scripts/verify_autosar.ts', '--chart', chartPath, '--out', join(directory, 'bad'), '--gcc', '/nonexistent/gcc'], {
        cwd: join(__dirname, '../../../..'), encoding: 'utf8', timeout: 400_000,
      });
      expect(bad.status).toBe(1);
      const badEvidence = JSON.parse(readFileSync(join(directory, 'bad', 'verification_evidence.json'), 'utf8')) as AutosarVerificationEvidence;
      expect(badEvidence.verdict).toBe('not-accepted');
      expect(gate(badEvidence, 'host-build').status).toBe('not-run');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 900_000);

  it('is registered as an npm script', () => {
    const pkg = JSON.parse(readSource(join(__dirname, '../../../../package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:autosar']).toContain('scripts/verify_autosar.ts');
  });
});
