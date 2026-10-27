import type { ErrorItem } from '../../../types/sm_types';
import { generateCArtifacts, modelHasDivision } from '../smCGenerator';
import type { LegacyStateMachineModel } from '../smModel';
import type { SemanticModel } from '../smSemanticModel';
import { runSmFrontEnd } from '../smFrontEnd';
import { renderArxml } from './autosarArxml';
import { renderIntegrationGuide, renderMisraCompliance } from './autosarDocs';
import { checkMisraSubset, type MisraFinding } from './autosarMisraChecker';
import { deriveAutosarPorts, toAutosarPlatformType } from './autosarPorts';
import {
  renderCompiler,
  renderCompilerCfg,
  renderMakefile,
  renderMemMap,
  renderPlatformTypes,
  renderRteHeader,
  renderRteStubHeader,
  renderRteStubSource,
  renderStdTypes,
  renderUnitTest,
} from './autosarStubs';
import { renderSwcHeader, renderSwcSource, type SwcRenderContext } from './autosarSwc';
import { AUTOSAR_GENERATOR_VERSION, modelFingerprint } from './autosarTrace';

export { deriveAutosarPorts, toAutosarPlatformType, AUTOSAR_GENERATOR_VERSION };
export type { AutosarPort, AutosarPortModel } from './autosarPorts';

export interface AutosarGeneratorOptions {
  swcName?: string;
}

export interface AutosarGeneratorResult {
  files: { name: string; content: string }[];
  errors: ErrorItem[];
  warnings: string[];
}

/** Everything the report and the verifier need besides the files themselves. */
export interface AutosarPackageCore extends AutosarGeneratorResult {
  swc: string;
  ir?: SemanticModel;
  ctx?: SwcRenderContext;
  /** Subset-checker findings over the production sources (always empty when files were produced). */
  findings: MisraFinding[];
}

const DEFAULT_SWC_NAME = 'AdiaSwc';
const SWC_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const SHORT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const MAX_PERIOD_MS = 4294967295;
const RESERVED_PORT_ELEMENTS = new Set(['SmStatus', 'SmFaultEvent']);

const makeError = (id: string, message: string, source = 'autosar-generator'): ErrorItem => ({
  id,
  type: 'error',
  message,
  timestamp: new Date(),
  source,
});

const failure = (swc: string, errors: ErrorItem[], warnings: string[] = []): AutosarPackageCore =>
  ({ swc, files: [], errors, warnings, findings: [] });

/** Wraps a core .c body (after its leading includes) in the CODE memory section. */
const wrapCoreSource = (swc: string, content: string): string => {
  const rows = content.split('\n');
  let split = 0;
  while (split < rows.length && /^(#include\s.*|\s*)$/.test(rows[split])) split += 1;
  const head = rows.slice(0, split);
  const body = rows.slice(split);
  while (head.length > 0 && head[head.length - 1].trim() === '') head.pop();
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  return [
    ...head,
    '',
    `#define ${swc}_START_SEC_CODE`,
    `#include "${swc}_MemMap.h"`,
    '',
    ...body,
    '',
    `#define ${swc}_STOP_SEC_CODE`,
    `#include "${swc}_MemMap.h"`,
    '',
  ].join('\n');
};

/** Longest name the UI derives: keeps `<SWC>_<suffix>` external identifiers distinct within 31 characters (Rule 5.1). */
const MAX_DERIVED_SWC_NAME = 18;

/** Converts a project/file name into a valid, MISRA 5.1-safe AUTOSAR short name (fallback 'AdiaSwc'). */
export const toAutosarSwcName = (rawName: string | null | undefined): string => {
  const cleaned = (rawName ?? '')
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .slice(0, MAX_DERIVED_SWC_NAME)
    .replace(/_+$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{0,17}$/.test(cleaned) ? cleaned : DEFAULT_SWC_NAME;
};

/**
 * Generates the package WITHOUT the three documents that describe the package itself
 * (Verification_Report.md, Safety_Manual.md, SHA256SUMS): the report needs this result
 * to compute its manifest, so it cannot be part of it.
 */
export const generateAutosarCore = (
  chart: Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: unknown },
  options: AutosarGeneratorOptions = {},
): AutosarPackageCore => {
  const swc = options.swcName ?? DEFAULT_SWC_NAME;
  if (!SWC_NAME_PATTERN.test(swc)) {
    return failure(swc, [makeError(
      'AUTOSAR_INVALID_SWC_NAME',
      `'${swc}' is not a valid AUTOSAR short name (letter first, then letters, digits or underscore, at most 128 characters).`,
    )]);
  }
  // I/O of an AUTOSAR application component goes through RTE ports, never MCAL.
  const frontEnd = runSmFrontEnd(chart, { stripHil: true });
  const errors = [...frontEnd.errors];
  const warnings = [...frontEnd.warnings];
  const tick = frontEnd.ir?.tickMs ?? chart.tickMs;
  if (typeof tick === 'number' && (!Number.isInteger(tick) || tick <= 0 || tick > MAX_PERIOD_MS)) {
    errors.push(makeError(
      'AUTOSAR_INVALID_PERIOD',
      `The tick period ${tick} ms is not a positive integer number of milliseconds (1..${MAX_PERIOD_MS}); the TimingEvent period and <SWC>_PERIOD_MS must be integral.`,
    ));
  }
  if (frontEnd.ir === undefined || errors.length > 0) return failure(swc, errors, warnings);
  const ir = frontEnd.ir;

  const ports = deriveAutosarPorts(ir);
  const seen = new Set<string>();
  const nameErrors: ErrorItem[] = [];
  for (const port of [...ports.provided, ...ports.required]) {
    if (!SHORT_NAME_PATTERN.test(port.cName) || RESERVED_PORT_ELEMENTS.has(port.cName) || seen.has(port.cName)) {
      nameErrors.push(makeError(
        'AUTOSAR_INVALID_SHORT_NAME',
        `Variable '${port.cName}' cannot be used as an AUTOSAR port name (invalid, reserved or duplicate short name).`,
      ));
    }
    seen.add(port.cName);
  }
  if (nameErrors.length > 0) return failure(swc, nameErrors, warnings);

  for (const name of ports.unused) {
    warnings.push(`[AUTOSAR_UNUSED_VARIABLE] Variable '${name}' is neither read nor written by the model; no port, ARXML entry or code is generated for it.`);
  }
  for (const variable of Object.values(ir.variables)) {
    if (variable.type !== 'int64' && variable.type !== 'uint64') continue;
    if (![...ports.provided, ...ports.required].some((port) => port.variableId === variable.id)) continue;
    warnings.push(`[AUTOSAR_64BIT_PRECISION] Variable '${variable.name}' is ${variable.type}: the core evaluates arithmetic on it in double precision (53 bit mantissa), so results beyond 2^53 lose precision; plain copies through the ports are exact.`);
  }

  const rendered = generateCArtifacts(ir, {
    platform: 'autosar',
    includeVerificationPackage: false,
    includeTestShims: false,
    includeHostHarness: false,
  });
  if (rendered.errors.length > 0) return failure(swc, [...errors, ...rendered.errors], warnings);

  const ctx: SwcRenderContext = {
    swc,
    swcUpper: swc.toUpperCase(),
    tickMs: ir.tickMs,
    ports,
    fingerprint: modelFingerprint(ir),
    safetyMode: ir.safetyMode,
    hasDivision: modelHasDivision(ir),
  };

  const coreFiles = rendered.files
    .filter((file) => /\.(c|h)$/.test(file.name))
    .map((file) => ({
      name: `autosar/core/${file.name}`,
      content: file.name.endsWith('.c') ? wrapCoreSource(swc, file.content) : file.content,
    }));
  const swcFiles = [
    { name: `autosar/swc/${swc}.c`, content: renderSwcSource(ctx) },
    { name: `autosar/swc/${swc}.h`, content: renderSwcHeader(ctx) },
  ];

  const checked = [...swcFiles, ...coreFiles];
  const findings = checkMisraSubset(checked);
  if (findings.length > 0) {
    return failure(swc, findings.map((finding) => makeError(
      'AUTOSAR_MISRA_VIOLATION',
      `${finding.rule} ${finding.file}:${finding.line} ${finding.message}`,
      'autosar-misra-checker',
    )), warnings);
  }

  const docsContext = {
    ...ctx,
    findings,
    checkedFiles: checked.map((file) => file.name.replace(/^autosar\//, '')),
    warnings,
    hasXBridges: Object.values(ir.states).some((state) => state.xBridges !== null),
  };

  const files = [
    ...swcFiles,
    ...coreFiles,
    { name: `autosar/arxml/${swc}.arxml`, content: renderArxml(ctx) },
    { name: 'autosar/stubs/Std_Types.h', content: renderStdTypes() },
    { name: 'autosar/stubs/Platform_Types.h', content: renderPlatformTypes() },
    { name: 'autosar/stubs/Compiler.h', content: renderCompiler() },
    { name: 'autosar/stubs/Compiler_Cfg.h', content: renderCompilerCfg(ctx) },
    { name: `autosar/stubs/${swc}_MemMap.h`, content: renderMemMap(ctx) },
    { name: `autosar/stubs/Rte_${swc}.h`, content: renderRteHeader(ctx) },
    { name: `autosar/stubs/Rte_${swc}_Stub.h`, content: renderRteStubHeader(ctx) },
    { name: `autosar/stubs/Rte_${swc}_Stub.c`, content: renderRteStubSource(ctx) },
    { name: `autosar/test/test_${swc}.c`, content: renderUnitTest(ctx) },
    { name: 'autosar/Makefile', content: renderMakefile() },
    { name: 'autosar/doc/MISRA_Compliance.md', content: renderMisraCompliance(docsContext) },
    { name: 'autosar/doc/Integration_Guide.md', content: renderIntegrationGuide(docsContext) },
  ];
  return { swc, files, errors: [], warnings: [...warnings, ...rendered.warnings], ir, ctx, findings };
};
