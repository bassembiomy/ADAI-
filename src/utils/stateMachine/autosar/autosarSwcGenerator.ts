import { generateAutosarCore, toAutosarSwcName, type AutosarGeneratorOptions, type AutosarGeneratorResult } from './autosarPackage';
import { buildAutosarReportFromCore } from './autosarReport';
import { renderSafetyManual } from './autosarSafetyManual';
import { sha256Hex } from './autosarSha256';
import { deriveAutosarPorts, toAutosarPlatformType } from './autosarPorts';
import { AUTOSAR_GENERATOR_VERSION } from './autosarTrace';
import type { LegacyStateMachineModel } from '../smModel';

export { deriveAutosarPorts, toAutosarPlatformType, toAutosarSwcName, AUTOSAR_GENERATOR_VERSION };
export type { AutosarPort, AutosarPortModel } from './autosarPorts';
export type { AutosarGeneratorOptions, AutosarGeneratorResult };

/** `sha256sum` format over every package file except the sums file itself, sorted by path relative to autosar/. */
export const renderSha256Sums = (files: readonly { name: string; content: string }[]): string => {
  const rows = files
    .filter((file) => file.name !== 'autosar/doc/SHA256SUMS')
    .map((file) => ({ path: file.name.replace(/^autosar\//, ''), hash: sha256Hex(file.content) }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return rows.map((row) => `${row.hash}  ${row.path}\n`).join('');
};

export const generateAutosarSwc = (
  chart: Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: unknown },
  options: AutosarGeneratorOptions = {},
): AutosarGeneratorResult => {
  const core = generateAutosarCore(chart, options);
  if (core.errors.length > 0 || core.ctx === undefined) {
    return { files: [], errors: core.errors, warnings: core.warnings };
  }
  const withDocs = [
    ...core.files,
    { name: 'autosar/doc/Verification_Report.md', content: buildAutosarReportFromCore(core).markdown },
    { name: 'autosar/doc/Safety_Manual.md', content: renderSafetyManual(core.ctx) },
  ];
  const files = [...withDocs, { name: 'autosar/doc/SHA256SUMS', content: renderSha256Sums(withDocs) }];
  return { files, errors: [], warnings: core.warnings };
};
