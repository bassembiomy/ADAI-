import type { SemanticModel } from './smSemanticModel';
import type { GeneratedCFile } from './smCGenerator';

export interface TraceLocation {
  file: string;
  symbol: string;
  startLine: number;
  endLine: number;
}

export interface RequirementMapping {
  requirementIds: string[];
  traceId: string;
  modelElementId: string;
  locations: TraceLocation[];
}

export interface TraceabilityReport {
  mappings: RequirementMapping[];
}

export function generateTraceabilityReport(
  ir: SemanticModel,
  files: readonly GeneratedCFile[]
): TraceabilityReport {
  const mappings: RequirementMapping[] = [];
  const elements = ir.traceableElements || [];

  for (const elem of elements) {
    const locations: TraceLocation[] = [];

    for (const file of files) {
      if (!file.name.endsWith('.c') && !file.name.endsWith('.h')) continue;
      const lines = file.content.split('\n');
      let startLine = -1;
      let symbol = `sm_element_${elem.id}`;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`TRACE-BEGIN: traceId=${elem.traceId}`)) {
          startLine = i + 1;
          const match = lines[i].match(/symbol=([a-zA-Z0-9_]+)/);
          if (match) symbol = match[1];
        }
        if (lines[i].includes(`TRACE-END: traceId=${elem.traceId}`) && startLine !== -1) {
          locations.push({ file: file.name, symbol, startLine, endLine: i + 1 });
          startLine = -1;
        }
      }
    }

    if (locations.length === 0) {
      throw new Error(`TRACEABILITY_UNRESOLVED: Model element '${elem.id}' (${elem.traceId}) could not be located in generated C source.`);
    }

    mappings.push({
      requirementIds: elem.requirementIds,
      traceId: elem.traceId,
      modelElementId: elem.id,
      locations
    });
  }

  return { mappings };
}
