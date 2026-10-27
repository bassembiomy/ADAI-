import type { ErrorItem } from '../../../types/sm_types';
import { generateCArtifacts } from '../smCGenerator';
import type { LegacyStateMachineModel, ModelDiagnostic } from '../smModel';
import { migrateStateMachineModel } from '../smModelMigration';
import { buildSemanticModel } from '../smSemanticBuilder';
import { renderArxml } from './autosarArxml';
import { renderIntegrationGuide, renderMisraCompliance } from './autosarDocs';
import { checkMisraSubset } from './autosarMisraChecker';
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

export { deriveAutosarPorts, toAutosarPlatformType };
export type { AutosarPort, AutosarPortModel } from './autosarPorts';

export interface AutosarGeneratorOptions {
  swcName?: string;
}

export interface AutosarGeneratorResult {
  files: { name: string; content: string }[];
  errors: ErrorItem[];
  warnings: string[];
}

const DEFAULT_SWC_NAME = 'AdiaSwc';
const SWC_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const SHORT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_PORT_ELEMENTS = new Set(['SmStatus', 'SmFaultEvent']);

const makeError = (id: string, message: string, source = 'autosar-generator'): ErrorItem => ({
  id,
  type: 'error',
  message,
  timestamp: new Date(),
  source,
});

const failure = (errors: ErrorItem[], warnings: string[] = []): AutosarGeneratorResult =>
  ({ files: [], errors, warnings });

const diagnosticToError = (diagnostic: ModelDiagnostic): ErrorItem => ({
  id: diagnostic.code,
  type: diagnostic.severity,
  message: diagnostic.message,
  timestamp: new Date(),
  source: 'state-machine-semantic-model',
  elementId: diagnostic.elementId,
});

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

/** Converts a project/file name into a valid AUTOSAR short name (fallback 'AdiaSwc'). */
export const toAutosarSwcName = (rawName: string | null | undefined): string => {
  const cleaned = (rawName ?? '')
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 128);
  return SWC_NAME_PATTERN.test(cleaned) ? cleaned : DEFAULT_SWC_NAME;
};

export const generateAutosarSwc = (
  chart: Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: unknown },
  options: AutosarGeneratorOptions = {},
): AutosarGeneratorResult => {
  const swc = options.swcName ?? DEFAULT_SWC_NAME;
  if (!SWC_NAME_PATTERN.test(swc)) {
    return failure([makeError(
      'AUTOSAR_INVALID_SWC_NAME',
      `'${swc}' is not a valid AUTOSAR short name (letter first, then letters, digits or underscore, at most 128 characters).`,
    )]);
  }
  if (
    chart.safetyMode === true
    && !chart.states.some((state) => state.isSafeState === true)
  ) {
    return failure([makeError(
      'SAFE_STATE_REQUIRED',
      'No Safe State defined while safety mode is enabled.',
      'state-machine-semantic-model',
    )]);
  }

  // I/O of an AUTOSAR application component goes through RTE ports, never MCAL.
  const { hilConfig: _ignoredHil, ...withoutHil } = chart as typeof chart & { hilConfig?: unknown };
  void _ignoredHil;
  const migrated = migrateStateMachineModel(withoutHil as LegacyStateMachineModel);
  const built = buildSemanticModel(migrated.model);
  const diagnostics = [...migrated.diagnostics, ...built.diagnostics];
  const errors = diagnostics.filter((item) => item.severity === 'error').map(diagnosticToError);
  const warnings = diagnostics
    .filter((item) => item.severity === 'warning')
    .map((item) => `[${item.code}] ${item.message}`);
  if (built.ir === undefined || errors.length > 0) return failure(errors, warnings);
  const ir = built.ir;

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
  if (nameErrors.length > 0) return failure(nameErrors, warnings);

  const rendered = generateCArtifacts(ir, {
    platform: 'autosar',
    includeVerificationPackage: false,
    includeTestShims: false,
    includeHostHarness: false,
  });
  if (rendered.errors.length > 0) return failure([...errors, ...rendered.errors], warnings);

  const ctx: SwcRenderContext = {
    swc,
    swcUpper: swc.toUpperCase(),
    tickMs: ir.tickMs,
    ports,
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
    return failure(findings.map((finding) => makeError(
      'AUTOSAR_MISRA_VIOLATION',
      `${finding.rule} ${finding.file}:${finding.line} ${finding.message}`,
      'autosar-misra-checker',
    )), warnings);
  }

  const docsContext = {
    ...ctx,
    findings,
    checkedFiles: checked.map((file) => file.name.replace(/^autosar\//, '')),
    safetyMode: ir.safetyMode,
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
  return { files, errors: [], warnings: [...warnings, ...rendered.warnings] };
};
