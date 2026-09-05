/**
 * Embedded C99 code generator: artifact orchestration + manifest only.
 * Model tables come from cModelGenerator, the bounded scheduler from
 * cRuntimeGenerator. File order is deterministic.
 */

import type { ExecutableOpmModel } from './pipeline';
import type { GeneratedOpmFile } from './cGeneratorTypes';
import type { OpmDiagnostic } from './executableTypes';
import { generateOpmModelFiles } from './cModelGenerator';
import { generateOpmRuntimeFiles } from './cRuntimeGenerator';
import { isSafeCIdentifier } from './cIr';

export type { GeneratedOpmFile } from './cGeneratorTypes';
export { generateOpmModelFiles } from './cModelGenerator';
export { generateOpmRuntimeFiles } from './cRuntimeGenerator';

export interface OpmResourceLimits {
  maxNodes: number;
  maxStates: number;
  maxProcesses: number;
  maxLinks: number;
  maxEvents: number;
  maxStagedWrites: number;
  maxTransitions: number;
  eventQueueCapacity: number;
  traceCapacity: number;
  maxGeneratedTextBytes: number;
}

export const DEFAULT_OPM_RESOURCE_LIMITS: OpmResourceLimits = {
  maxNodes: 1000,
  maxStates: 256,
  maxProcesses: 256,
  maxLinks: 512,
  maxEvents: 64,
  maxStagedWrites: 128,
  maxTransitions: 64,
  eventQueueCapacity: 64,
  traceCapacity: 256,
  maxGeneratedTextBytes: 500000,
};

export const STRICT_C99_COMPILER_FLAGS: readonly string[] = Object.freeze([
  '-std=c99',
  '-pedantic-errors',
  '-Wall',
  '-Wextra',
  '-Werror',
]);

export interface OpmManifest {
  generatorVersion: string;
  fingerprint: string;
  modelFingerprint: string;
  tickMs: number;
  resourceLimits: OpmResourceLimits;
  strictCompilerFlags: readonly string[];
  qualificationStatus: 'pending' | 'qualified' | 'failed';
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
  diagnostics: OpmDiagnostic[];
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
  const diagnostics: OpmDiagnostic[] = [];
  const limits = DEFAULT_OPM_RESOURCE_LIMITS;

  // 1. Identifier safety verification
  for (const obj of model.objects) {
    if (!isSafeCIdentifier(obj.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
        severity: 'error',
        message: `Object "${obj.name}" has invalid C identifier "${obj.cIdentifier}".`,
        source: obj.source || { elementId: obj.id, propertyPath: 'cIdentifier' },
      });
    }
    for (const attr of obj.attributes) {
      if (!isSafeCIdentifier(attr.cIdentifier)) {
        diagnostics.push({
          code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
          severity: 'error',
          message: `Attribute "${attr.displayName || attr.id}" has invalid C identifier "${attr.cIdentifier}".`,
          source: { elementId: attr.id, propertyPath: 'cIdentifier' },
        });
      }
    }
  }

  for (const st of model.states) {
    if (!isSafeCIdentifier(st.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
        severity: 'error',
        message: `State "${st.name}" has invalid C identifier "${st.cIdentifier}".`,
        source: st.source || { elementId: st.id, propertyPath: 'cIdentifier' },
      });
    }
  }

  for (const proc of model.processes) {
    if (!isSafeCIdentifier(proc.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
        severity: 'error',
        message: `Process "${proc.name}" has invalid C identifier "${proc.cIdentifier}".`,
        source: proc.source || { elementId: proc.id, propertyPath: 'cIdentifier' },
      });
    }
  }

  for (const ev of model.events) {
    if (!isSafeCIdentifier(ev.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
        severity: 'error',
        message: `Event "${ev.displayName || ev.id}" has invalid C identifier "${ev.cIdentifier}".`,
        source: { elementId: ev.id, propertyPath: 'cIdentifier' },
      });
    }
  }

  for (const en of model.enums) {
    if (!isSafeCIdentifier(en.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
        severity: 'error',
        message: `Enum "${en.displayName || en.id}" has invalid C identifier "${en.cIdentifier}".`,
        source: { elementId: en.id, propertyPath: 'cIdentifier' },
      });
    }
    for (const m of en.members) {
      if (!isSafeCIdentifier(m.cIdentifier)) {
        diagnostics.push({
          code: 'OPM_CODEGEN_INVALID_IDENTIFIER',
          severity: 'error',
          message: `Enum member "${m.displayName || m.id}" has invalid C identifier "${m.cIdentifier}".`,
          source: { elementId: m.id, propertyPath: 'cIdentifier' },
        });
      }
    }
  }

  // 2. Resource limit verification
  if (model.objects.length > limits.maxNodes) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Object count ${model.objects.length} exceeds limit of ${limits.maxNodes}.`,
      source: { elementId: 'settings', propertyPath: 'objects' },
    });
  }
  if (model.states.length > limits.maxStates) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `State count ${model.states.length} exceeds limit of ${limits.maxStates}.`,
      source: { elementId: 'settings', propertyPath: 'states' },
    });
  }
  if (model.processes.length > limits.maxProcesses) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Process count ${model.processes.length} exceeds limit of ${limits.maxProcesses}.`,
      source: { elementId: 'settings', propertyPath: 'processes' },
    });
  }
  if (model.links.length > limits.maxLinks) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Link count ${model.links.length} exceeds limit of ${limits.maxLinks}.`,
      source: { elementId: 'settings', propertyPath: 'links' },
    });
  }
  if (model.events.length > limits.maxEvents) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Event count ${model.events.length} exceeds limit of ${limits.maxEvents}.`,
      source: { elementId: 'settings', propertyPath: 'events' },
    });
  }
  if (model.settings.eventQueueCapacity > limits.eventQueueCapacity) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `EventQueueCapacity ${model.settings.eventQueueCapacity} exceeds limit of ${limits.eventQueueCapacity}.`,
      source: { elementId: 'settings', propertyPath: 'settings.eventQueueCapacity' },
    });
  }
  if (model.settings.maxStagedWrites > limits.maxStagedWrites) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `MaxStagedWrites ${model.settings.maxStagedWrites} exceeds limit of ${limits.maxStagedWrites}.`,
      source: { elementId: 'settings', propertyPath: 'settings.maxStagedWrites' },
    });
  }
  if (model.settings.maxTransitions > limits.maxTransitions) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `MaxTransitions ${model.settings.maxTransitions} exceeds limit of ${limits.maxTransitions}.`,
      source: { elementId: 'settings', propertyPath: 'settings.maxTransitions' },
    });
  }
  if (model.settings.traceCapacity > limits.traceCapacity) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `TraceCapacity ${model.settings.traceCapacity} exceeds limit of ${limits.traceCapacity}.`,
      source: { elementId: 'settings', propertyPath: 'settings.traceCapacity' },
    });
  }

  // Fail-closed on any validation or resource error
  if (diagnostics.length > 0) {
    const errorManifest: OpmManifest = {
      generatorVersion: '1.0.0',
      fingerprint: model.fingerprint,
      modelFingerprint: model.fingerprint,
      tickMs: model.settings.tickMs,
      resourceLimits: limits,
      strictCompilerFlags: STRICT_C99_COMPILER_FLAGS,
      qualificationStatus: 'failed',
      settings: model.settings,
      symbols: model.symbols,
      objects: [],
      states: [],
      processes: [],
      links: [],
      events: model.events,
      enums: model.enums,
    };
    return { files: [], manifest: errorManifest, diagnostics };
  }

  const modelFiles = generateOpmModelFiles(model);
  const runtimeFiles = generateOpmRuntimeFiles(model);

  const byName = new Map<string, GeneratedOpmFile>();
  for (const f of [...modelFiles, ...runtimeFiles]) byName.set(f.name, f);

  const manifest: OpmManifest = {
    generatorVersion: '1.0.0',
    fingerprint: model.fingerprint,
    modelFingerprint: model.fingerprint,
    tickMs: model.settings.tickMs,
    resourceLimits: limits,
    strictCompilerFlags: STRICT_C99_COMPILER_FLAGS,
    // Generation creates artifacts only.  Qualification is granted by the
    // host compile/runtime verification step, never by text generation.
    qualificationStatus: 'pending',
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

  // 3. Generated text size limit check
  const totalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.content, 'utf8'), 0);
  if (totalBytes > limits.maxGeneratedTextBytes) {
    diagnostics.push({
      code: 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Generated C artifact size (${totalBytes} bytes) exceeds limit of ${limits.maxGeneratedTextBytes} bytes.`,
      source: { elementId: 'generator', propertyPath: 'generatedText' },
    });
    return {
      files: [],
      manifest: { ...manifest, qualificationStatus: 'failed' },
      diagnostics,
    };
  }

  return { files, manifest, diagnostics };
}
