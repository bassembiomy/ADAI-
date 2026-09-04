/**
 * Embedded C99 code generator: artifact orchestration + manifest only.
 * Model tables come from cModelGenerator, the bounded scheduler from
 * cRuntimeGenerator. File order is deterministic.
 */

import type { ExecutableOpmModel } from './pipeline';
import type { GeneratedOpmFile } from './cGeneratorTypes';
import { generateOpmModelFiles } from './cModelGenerator';
import { generateOpmRuntimeFiles } from './cRuntimeGenerator';

export type { GeneratedOpmFile } from './cGeneratorTypes';
export { generateOpmModelFiles } from './cModelGenerator';
export { generateOpmRuntimeFiles } from './cRuntimeGenerator';

export interface OpmManifest {
  generatorVersion: string;
  fingerprint: string;
  settings: ExecutableOpmModel['settings'];
  symbols: ExecutableOpmModel['symbols'];
  objects: readonly { id: string; name: string; cIdentifier: string }[];
  states: readonly { id: string; name: string; cIdentifier: string; parentObjectId: string }[];
  processes: readonly { id: string; name: string; cIdentifier: string }[];
  links: readonly { id: string; type: string; sourceId: string; targetId: string }[];
  events: ExecutableOpmModel['events'];
  enums: ExecutableOpmModel['enums'];
}

export interface GenerateOpmCArtifactsResult {
  files: GeneratedOpmFile[];
  manifest: OpmManifest;
}

const DETERMINISTIC_ORDER = [
  'opm_types.h',
  'opm_config.h',
  'opm_model.h',
  'opm_model.c',
  'opm_runtime.h',
  'opm_runtime.c',
  'opm_io.h',
  'opm_io.c',
  'opm_trace.h',
  'opm_trace.c',
  'main_example.c',
  'opm_manifest.json',
];

export function generateOpmCArtifacts(model: ExecutableOpmModel): GenerateOpmCArtifactsResult {
  const modelFiles = generateOpmModelFiles(model);
  const runtimeFiles = generateOpmRuntimeFiles(model);

  const byName = new Map<string, GeneratedOpmFile>();
  for (const f of [...modelFiles, ...runtimeFiles]) byName.set(f.name, f);

  const manifest: OpmManifest = {
    generatorVersion: '1.0.0',
    fingerprint: model.fingerprint,
    settings: model.settings,
    symbols: model.symbols,
    objects: model.objects.map(o => ({ id: o.id, name: o.name, cIdentifier: o.cIdentifier })),
    states: model.states.map(s => ({ id: s.id, name: s.name, cIdentifier: s.cIdentifier, parentObjectId: s.parentObjectId })),
    processes: model.processes.map(p => ({ id: p.id, name: p.name, cIdentifier: p.cIdentifier })),
    links: model.links.map(l => ({ id: l.id, type: l.type, sourceId: l.sourceId, targetId: l.targetId })),
    events: model.events,
    enums: model.enums,
  };

  byName.set('opm_manifest.json', {
    name: 'opm_manifest.json',
    content: JSON.stringify(manifest, null, 2),
  });

  const files: GeneratedOpmFile[] = [];
  for (const name of DETERMINISTIC_ORDER) {
    const f = byName.get(name);
    if (f) files.push(f);
  }

  return { files, manifest };
}
