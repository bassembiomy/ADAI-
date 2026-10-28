/**
 * Verification report of an AUTOSAR SWC package. Pure, browser-safe and deterministic: the same
 * model and the same evidence always give the same bytes. ADIA does not certify anything; the report
 * lists the evidence that was produced, what each gate really did, and what remains open.
 */
import type { ErrorItem } from '../../../types/sm_types';
import type { LegacyStateMachineModel } from '../smModel';
import { checkArxmlStructure } from './autosarArxmlCheck';
import {
  AUTOSAR_GATE_IDS,
  type AutosarGateEvidence,
  type AutosarGateStatus,
  type AutosarVerificationEvidence,
} from './autosarEvidence';
import { CHECKED_MISRA_RULES, checkMisraSubset } from './autosarMisraChecker';
import { generateAutosarCore, type AutosarPackageCore } from './autosarPackage';
import { sha256Hex } from './autosarSha256';
import { AUTOSAR_GENERATOR_VERSION } from './autosarTrace';

export interface AutosarReportOptions {
  swcName?: string;
  evidence?: AutosarVerificationEvidence;
}

export interface AutosarReport {
  markdown: string;
  html: string;
  errors: ErrorItem[];
}

type Chart = Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: unknown };

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const GATE_LABEL: Record<AutosarGateStatus, string> = { pass: 'PASS', fail: 'FAIL', 'not-run': 'NOT RUN' };

const DYNAMIC_NOT_RUN = 'Not run: no verification evidence was supplied (run `npm run verify:autosar`).';

// ------------------------------------------------------------------ rendering

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const htmlInline = (text: string): string =>
  escapeHtml(text).replace(/`([^`]*)`/g, '<code>$1</code>');

const cell = (text: string): string => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

const renderMarkdown = (blocks: readonly Block[]): string => {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading') out.push(`${'#'.repeat(block.level)} ${block.text}`, '');
    else if (block.kind === 'paragraph') out.push(block.text, '');
    else if (block.kind === 'list') out.push(...block.items.map((item) => `- ${item.replace(/\r?\n/g, ' ')}`), '');
    else {
      out.push(
        `| ${block.head.map(cell).join(' | ')} |`,
        `|${block.head.map(() => '---').join('|')}|`,
        ...block.rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
        '',
      );
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
};

const renderHtml = (blocks: readonly Block[], headingOffset: number): string => {
  const out: string[] = ['<div class="autosar-report">'];
  for (const block of blocks) {
    if (block.kind === 'heading') {
      const level = Math.min(6, block.level + headingOffset);
      out.push(`<h${level}>${htmlInline(block.text)}</h${level}>`);
    } else if (block.kind === 'paragraph') {
      out.push(`<p>${htmlInline(block.text)}</p>`);
    } else if (block.kind === 'list') {
      out.push('<ul>', ...block.items.map((item) => `<li>${htmlInline(item)}</li>`), '</ul>');
    } else {
      out.push(
        '<table>',
        `<thead><tr>${block.head.map((text) => `<th>${htmlInline(text)}</th>`).join('')}</tr></thead>`,
        '<tbody>',
        ...block.rows.map((row) => `<tr>${row.map((text) => `<td>${htmlInline(text)}</td>`).join('')}</tr>`),
        '</tbody>',
        '</table>',
      );
    }
  }
  out.push('</div>');
  return `${out.join('\n')}\n`;
};

// ------------------------------------------------------------------ gates

interface GateRow {
  id: string;
  status: AutosarGateStatus;
  summary: string;
  detail: AutosarGateEvidence | null;
}

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const sourcesOf = (core: AutosarPackageCore): Array<{ name: string; content: string }> =>
  core.files.filter((file) => /^autosar\/(swc|core)\/[^/]+\.(c|h)$/.test(file.name));

/** The three gates ADIA can decide itself at generation time (the rest needs real tools). */
const staticGates = (core: AutosarPackageCore): GateRow[] => {
  const sources = sourcesOf(core);
  const findings = checkMisraSubset(sources);
  const arxml = core.files.find((file) => file.name.endsWith('.arxml'));
  const arxmlCheck = arxml === undefined ? null : checkArxmlStructure(arxml.content);
  return [
    {
      id: 'generation',
      status: 'pass',
      summary: `Generator produced ${core.files.length} files without errors (${core.warnings.length} warnings).`,
      detail: null,
    },
    {
      id: 'misra-subset',
      status: findings.length === 0 ? 'pass' : 'fail',
      summary: `${findings.length} findings from the textual MISRA C:2012 subset checker (${CHECKED_MISRA_RULES.length} rules, ${sources.length} files).`,
      detail: null,
    },
    {
      id: 'arxml-structure',
      status: arxmlCheck !== null && arxmlCheck.errors.length === 0 ? 'pass' : 'fail',
      summary: arxmlCheck === null
        ? 'No ARXML file in the package.'
        : arxmlCheck.errors.length === 0
          ? `ARXML well-formed, ${arxmlCheck.references} references resolve (${arxmlCheck.elements} elements, not an XSD validation).`
          : `${arxmlCheck.errors.length} ARXML errors, first: ${arxmlCheck.errors[0]}`,
      detail: null,
    },
  ];
};

const gateRows = (core: AutosarPackageCore | null, evidence: AutosarVerificationEvidence | undefined, errors: readonly ErrorItem[]): GateRow[] => {
  if (core === null || errors.length > 0) {
    return AUTOSAR_GATE_IDS.map((id) => ({
      id,
      status: id === 'generation' ? 'fail' : 'not-run',
      summary: id === 'generation'
        ? `Generation failed with ${errors.length} error(s); no package exists.`
        : 'Not run: there is no package to verify.',
      detail: null,
    }));
  }
  const computed = new Map(staticGates(core).map((row) => [row.id, row]));
  return AUTOSAR_GATE_IDS.map((id): GateRow => {
    const recorded = evidence?.gates.find((gate) => gate.id === id);
    if (recorded !== undefined) {
      return { id, status: recorded.status, summary: recorded.summary, detail: recorded };
    }
    const own = computed.get(id);
    if (own !== undefined && evidence === undefined) return own;
    return { id, status: 'not-run', summary: DYNAMIC_NOT_RUN, detail: null };
  });
};

// ------------------------------------------------------------------ content

const memorySections = (core: AutosarPackageCore): string[] => {
  const used = new Set<string>();
  for (const file of sourcesOf(core).filter((item) => item.name.endsWith('.c'))) {
    for (const match of file.content.matchAll(/_START_SEC_(\w+)/g)) used.add(match[1]);
  }
  return [...used].sort(compareText);
};

const deviationRows = (core: AutosarPackageCore): string[][] => {
  const doc = core.files.find((file) => file.name === 'autosar/doc/MISRA_Compliance.md');
  if (doc === undefined) return [];
  return doc.content.split('\n')
    .map((line) => /^\| (DEV-\d+) \| ([^|]*) \| ([^|]*) \|/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1], match[2].trim(), match[3].trim()]);
};

const VERDICT_EXPLANATION = 'A package is accepted only when all 11 gates are PASS; a gate that did not run counts as not passed.';

const buildBlocks = (
  core: AutosarPackageCore | null,
  swc: string,
  rows: readonly GateRow[],
  errors: readonly ErrorItem[],
  evidence: AutosarVerificationEvidence | undefined,
): { blocks: Block[]; accepted: boolean } => {
  const accepted = errors.length === 0 && rows.length === AUTOSAR_GATE_IDS.length && rows.every((row) => row.status === 'pass');
  const blocks: Block[] = [{ kind: 'heading', level: 1, text: `AUTOSAR SWC verification report - ${swc}` }];

  if (core === null || core.ctx === undefined || core.ir === undefined || errors.length > 0) {
    blocks.push(
      { kind: 'heading', level: 2, text: '1. Identification' },
      {
        kind: 'list',
        items: [
          `Software component: ${swc}`,
          `ADIA-AUTOSAR-GENERATOR: ${AUTOSAR_GENERATOR_VERSION}`,
          'Package: not generated',
        ],
      },
      { kind: 'heading', level: 2, text: 'Generation errors' },
      { kind: 'paragraph', text: `The model cannot be generated: ${errors.length} error(s). No package, no fingerprint and no manifest exist.` },
      { kind: 'list', items: errors.map((error) => `${error.id}: ${error.message}`) },
      { kind: 'heading', level: 2, text: '5. Verification gates' },
      {
        kind: 'table',
        head: ['Gate', 'Result', 'Summary'],
        rows: rows.map((row) => [row.id, GATE_LABEL[row.status], row.summary]),
      },
      { kind: 'heading', level: 2, text: '8. Verdict' },
      { kind: 'paragraph', text: '**Verdict: NOT ACCEPTED**' },
      { kind: 'paragraph', text: 'This report is not a certificate and the component is not certified.' },
    );
    return { blocks, accepted: false };
  }

  const { ctx, ir } = core;
  const fingerprint = evidence?.fingerprint ?? ctx.fingerprint;
  const manifestNames = Object.keys(evidence?.fileSha256 ?? {}).length > 0
    ? Object.entries(evidence!.fileSha256)
    : core.files.map((file): [string, string] => [file.name, sha256Hex(file.content)]);
  const manifest = manifestNames
    .filter(([name]) => name !== 'autosar/doc/Verification_Report.md' && name !== 'autosar/doc/SHA256SUMS')
    .sort((left, right) => compareText(left[0], right[0]));

  // 1 Identification
  blocks.push(
    { kind: 'heading', level: 2, text: '1. Identification' },
    {
      kind: 'list',
      items: [
        `Software component: ${swc}`,
        `ADIA-AUTOSAR-GENERATOR: ${AUTOSAR_GENERATOR_VERSION}`,
        `ADIA-FINGERPRINT: ${fingerprint}`,
        `Tick period: ${ctx.tickMs} ms, safety mode: ${ctx.safetyMode ? 'on' : 'off'}`,
        ...(evidence?.executedAt != null ? [`Verification executed at: ${evidence.executedAt}`] : []),
      ],
    },
    {
      kind: 'paragraph',
      text: 'ADIA does not certify software. This package is not certified; the report is evidence for the integrator\'s safety case, not a certificate.',
    },
    {
      kind: 'paragraph',
      text: 'SHA-256 manifest of the package files. `doc/SHA256SUMS` lists every file including this report (verify with `sha256sum -c doc/SHA256SUMS` from the `autosar` directory after copying it there); the report and `SHA256SUMS` are not listed here because they cannot contain their own hash.',
    },
    {
      kind: 'table',
      head: ['File', 'SHA-256'],
      rows: manifest.map(([name, hash]) => [name.replace(/^autosar\//, ''), hash]),
    },
  );

  // 2 AUTOSAR process
  blocks.push(
    { kind: 'heading', level: 2, text: '2. AUTOSAR process' },
    {
      kind: 'table',
      head: ['Step', 'Artefact', 'Evidence'],
      rows: [
        ['Model', 'ADIA state machine', 'generation gate: model validation and semantic model'],
        ['Semantic IR', 'Validated, typed intermediate model; fingerprint above', 'generation gate'],
        ['MISRA C core', 'core/sm_*.c, the verified state-machine core shared with Generate C/H', 'misra-subset, host-build, static-analysis gates'],
        ['SWC and RTE', `swc/${swc}.c: runnables ${swc}_Init and ${swc}_MainFunction using Rte_Read, Rte_Write and Rte_Call only`, 'unit-test, coverage, sanitizers, second-compiler, differential gates'],
        ['ARXML', `arxml/${swc}.arxml: AUTOSAR 4 component description`, 'arxml-structure gate'],
        ['Integration', 'Replace stubs by the stack, import the ARXML, run integration tests', 'open items in section 7'],
      ],
    },
    {
      kind: 'table',
      head: ['Standard', 'Clause', 'Contribution of this package'],
      rows: [
        ['ISO 26262-6', 'Clause 8, software unit design and implementation', 'Code generated from the model, MISRA C:2012 subset check, compilation with two compilers, static analysis, reproducible build.'],
        ['ISO 26262-6', 'Clause 9, software unit verification', 'Generated unit test with statement and branch coverage, sanitizers, back-to-back comparison with the ADIA interpreter.'],
        ['ISO 26262-8', 'Clause 11, confidence in the use of software tools', 'Safety manual with the proposed TI, TD and TCL classification (doc/Safety_Manual.md); the gates are the tool error detection measures.'],
        ['MISRA C:2012', 'Guidelines', 'Textual subset checked here; a qualified MISRA tool must be run by the integrator (doc/MISRA_Compliance.md).'],
        ['AUTOSAR Classic Platform R4.x', 'Software component template, RTE, memory mapping, compiler abstraction', 'ARXML, RTE-based runnables, MemMap and Compiler abstraction in the package.'],
      ],
    },
    { kind: 'paragraph', text: 'The ASIL is assigned by the hazard analysis and risk assessment of the item; the generator assigns none.' },
  );

  // 3 Software architecture
  const portRow = (port: { portName: string; interfaceName: string; dataElementName: string; platformType: string; initValue: string; variableId: string }, direction: string, api: string): string[] =>
    [port.portName, direction, port.interfaceName, port.dataElementName, port.platformType, port.initValue, `${api}_${port.portName}_${port.dataElementName}`];
  blocks.push(
    { kind: 'heading', level: 2, text: '3. Software architecture' },
    {
      kind: 'table',
      head: ['Runnable', 'Event', 'Period'],
      rows: [
        [`${swc}_Init`, 'InitEvent', '-'],
        [`${swc}_MainFunction`, 'TimingEvent', `${ctx.tickMs} ms (${ctx.swcUpper}_PERIOD_MS)`],
      ],
    },
    {
      kind: 'table',
      head: ['Port', 'Direction', 'Interface', 'Element', 'Type', 'Init', 'RTE API'],
      rows: [
        ...ctx.ports.required.map((port) => portRow(port, 'required', 'Rte_Read')),
        ...ctx.ports.provided.map((port) => portRow(port, 'provided', 'Rte_Write')),
        ['PP_SmStatus', 'provided', 'SRI_SmStatus', 'ActiveState', 'uint16', '0', 'Rte_Write_PP_SmStatus_ActiveState'],
        ['PP_SmStatus', 'provided', 'SRI_SmStatus', 'ErrorStatus', 'uint8', '0', 'Rte_Write_PP_SmStatus_ErrorStatus'],
        ['RP_SmFaultEvent', 'required', 'CSI_DemEvent', 'SetEventStatus', 'uint8', '-', 'Rte_Call_RP_SmFaultEvent_SetEventStatus'],
      ],
    },
    ...(ctx.ports.mapped
      ? [
        {
          kind: 'table',
          head: ['Port', 'Variable', 'Invalid-input policy / safe value'],
          rows: [
            ...ctx.ports.required.map((port) => [port.portName, port.cName, `input policy: ${port.invalidInputPolicy ?? 'reject'}`]),
            ...ctx.ports.provided.map((port) => [port.portName, port.cName, port.safeValue === undefined ? 'no safe value' : `safe value: ${String(port.safeValue)}`]),
          ],
        } as Block,
        { kind: 'paragraph', text: 'The ports follow the I/O mapping of the model; variables without a mapping are internal.' } as Block,
      ]
      : []),
    {
      kind: 'list',
      items: [
        `Memory sections: ${memorySections(core).join(', ')}.`,
        'Back-to-back test: test/test_' + swc + '_b2b.c compares the component with the ADIA semantic interpreter on seeded input vectors (make test prints B2B PASSED).',
        'Dem: every activation reports DEM_EVENT_STATUS_FAILED (0x01) while the core reports an error or a required port reached the RTE error limit, otherwise DEM_EVENT_STATUS_PASSED (0x00).',
        `The component keeps one static instance: it cannot be instantiated more than once; the runnables are not invoked concurrently.`,
      ],
    },
  );

  // 4 Code properties
  const findings = checkMisraSubset(sourcesOf(core));
  const deviations = deviationRows(core);
  blocks.push(
    { kind: 'heading', level: 2, text: '4. Code properties' },
    {
      kind: 'list',
      items: [
        `MISRA C:2012 subset: ${findings.length} findings over ${sourcesOf(core).length} production files; rules checked: ${CHECKED_MISRA_RULES.map((item) => item.rule).join(', ')}.`,
        'The subset checker is textual and is not a qualified MISRA tool; the full guideline set is not claimed.',
        'Defensive behaviour: a failed or non-finite RTE read keeps the last valid value; consecutive read failures are counted per port (saturating) and reaching the limit reports Dem FAILED; a good read clears it.',
        'No dynamic memory, no goto, no standard I/O; test hooks exist only when ADIA_TESTING is defined.',
        ...core.warnings.map((warning) => `Generator note: ${warning}`),
      ],
    },
    deviations.length > 0
      ? { kind: 'table', head: ['Deviation', 'Guideline', 'Where'], rows: deviations }
      : { kind: 'paragraph', text: 'No documented deviation.' },
  );

  // 5 Verification gates
  const details = rows.filter((row) => row.detail !== null && row.detail.status !== 'not-run');
  blocks.push(
    { kind: 'heading', level: 2, text: '5. Verification gates' },
    {
      kind: 'table',
      head: ['Gate', 'Result', 'Summary'],
      rows: rows.map((row) => [row.id, GATE_LABEL[row.status], row.summary]),
    },
    {
      kind: 'paragraph',
      text: 'PASS means the gate really ran and passed; NOT RUN means it was not executed (no evidence supplied, tool missing or gate not selected). Nothing is reported as PASS without having run.',
    },
    {
      kind: 'paragraph',
      text: 'Differential comparison rule: the generated C and the ADIA semantic interpreter receive the same seeded pseudo-random input vectors; every provided port, ActiveState and the error status are compared each cycle. Integers and booleans must match exactly; floating-point values must be bit-exact or within 1e-12 relative error.',
    },
  );
  if (details.length > 0) {
    blocks.push({
      kind: 'list',
      items: details.map((row) => {
        const detail = row.detail!;
        const metrics = Object.keys(detail.metrics).sort(compareText).map((key) => `${key}=${detail.metrics[key]}`).join(', ');
        return [
          `${row.id}:`,
          detail.tool !== null ? `tool ${detail.tool}${detail.toolVersion !== null ? ` ${detail.toolVersion}` : ''};` : 'ADIA built-in check;',
          detail.command !== null ? `command \`${detail.command}\`;` : '',
          `metrics ${metrics === '' ? 'none' : metrics}`,
        ].filter((part) => part !== '').join(' ');
      }),
    });
  }

  // 6 Traceability
  const traceOf = (id: string): { traceId: string; requirementIds: string[] } | undefined =>
    ir.traceableElements.find((item) => item.id === id);
  const requirements = (id: string): string => {
    const ids = traceOf(id)?.requirementIds ?? [];
    return ids.length === 0 ? '-' : ids.join(', ');
  };
  const states = Object.values(ir.states).sort((left, right) => left.activityIndex - right.activityIndex);
  const transitions = Object.values(ir.transitions).sort((left, right) => compareText(left.id, right.id));
  const variableName = (variableId: string): string => ir.variables[variableId]?.name ?? variableId;
  blocks.push(
    { kind: 'heading', level: 2, text: '6. Traceability matrix' },
    {
      kind: 'paragraph',
      text: ir.traceableElements.some((item) => item.requirementIds.length > 0)
        ? 'Requirement ids are shown where the model links them.'
        : 'No requirement is linked in this model; the requirement column shows "-".',
    },
    {
      kind: 'table',
      head: ['State id', 'State', 'Trace id', 'C functions', 'Requirements'],
      rows: states.map((state) => [
        state.id,
        state.name,
        traceOf(state.id)?.traceId ?? '-',
        `${state.enumName}_Entry, ${state.enumName}_During, ${state.enumName}_Exit`,
        requirements(state.id),
      ]),
    },
    {
      kind: 'table',
      head: ['Transition id', 'Trace id', 'Source -> destination', 'Guard', 'Action', 'Requirements'],
      rows: transitions.map((transition) => {
        const trace = traceOf(transition.id)?.traceId ?? '-';
        return [
          transition.id,
          trace === '-' ? '-' : `${trace} (sm_trans_${trace.replace(/^TRACE-TRANS-/, '').toLowerCase()})`,
          `${ir.states[transition.sourceStateId]?.name ?? transition.sourceStateId} -> ${ir.states[transition.destinationStateId]?.name ?? transition.destinationStateId}`,
          transition.guardSource === '' ? '-' : transition.guardSource,
          transition.actionSource === '' ? '-' : transition.actionSource,
          requirements(transition.id),
        ];
      }),
    },
    {
      kind: 'table',
      head: ['Port', 'Variable', 'Direction'],
      rows: [
        ...ctx.ports.required.map((port) => [port.portName, variableName(port.variableId), 'required (Rte_Read)']),
        ...ctx.ports.provided.map((port) => [port.portName, variableName(port.variableId), 'provided (Rte_Write)']),
        ['PP_SmStatus', 'active state slot 0 and core error status', 'provided (Rte_Write)'],
        ['RP_SmFaultEvent', 'core error status and RTE error limit', 'required (Rte_Call)'],
      ],
    },
  );

  // 7 Open items
  blocks.push(
    { kind: 'heading', level: 2, text: '7. Open items before certification' },
    {
      kind: 'list',
      items: [
        'Run a qualified MISRA C:2012 checker on the production configuration (the subset check here is textual).',
        'Validate the ARXML against the AUTOSAR XSD of the target stack release (only a structural check ran here).',
        'Build with the target compiler and run on the target hardware or a HIL setup (evidence here is from a host build).',
        'Integration test with the real RTE and basic software (the package was tested with host stubs).',
        'Derive the ASIL and the safety requirements from the HARA of the item.',
        'Tool qualification of the generator according to the Safety Manual and ISO 26262-8 clause 11.',
      ],
    },
  );

  // 8 Verdict
  const notPassed = rows.filter((row) => row.status !== 'pass').map((row) => `${row.id} (${GATE_LABEL[row.status]})`);
  blocks.push(
    { kind: 'heading', level: 2, text: '8. Verdict' },
    { kind: 'paragraph', text: `**Verdict: ${accepted ? 'ACCEPTED' : 'NOT ACCEPTED'}**` },
    { kind: 'paragraph', text: VERDICT_EXPLANATION },
    ...(accepted ? [] : [{ kind: 'paragraph', text: `Gates not passed: ${notPassed.join(', ')}.` } as Block]),
    { kind: 'paragraph', text: 'This is not a certification: the component is not certified and the verdict covers the listed gates only.' },
  );
  return { blocks, accepted };
};

// ------------------------------------------------------------------ public API

const build = (
  core: AutosarPackageCore | null,
  swc: string,
  evidence: AutosarVerificationEvidence | undefined,
  headingOffset: number,
): AutosarReport => {
  const errors = core?.errors ?? [];
  const rows = gateRows(core, evidence, errors);
  const { blocks } = buildBlocks(core, swc, rows, errors, evidence);
  return { markdown: renderMarkdown(blocks), html: renderHtml(blocks, headingOffset), errors: [...errors] };
};

/** Report for an already generated package (used by the generator itself to avoid generating twice). */
export const buildAutosarReportFromCore = (
  core: AutosarPackageCore,
  evidence?: AutosarVerificationEvidence,
): AutosarReport => build(core, core.swc, evidence, 0);

export const buildAutosarReport = (chart: Chart, options: AutosarReportOptions = {}): AutosarReport => {
  const swcName = options.swcName ?? options.evidence?.swcName;
  const core = generateAutosarCore(chart, swcName === undefined ? {} : { swcName });
  return build(core, core.swc, options.evidence, 0);
};

export const buildAutosarReportSection = (
  chart: Chart,
  swcName: string,
): { id: string; title: string; html: string } => {
  const core = generateAutosarCore(chart, { swcName });
  return {
    id: 'autosar-swc',
    title: `AUTOSAR Software Component (${swcName})`,
    // The section title is rendered by the project report; headings start one level below it.
    html: build(core, swcName, undefined, 2).html,
  };
};
