import {
  EngineeringModelIR,
  BoundEngineeringModelIR,
  SemanticComponent
} from '../contracts/modelIr';
import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringPattern } from '../../planner/generalGraphPlanner';
import { CapabilityGap } from './capabilityGap';
import { CompositionResolver } from './compositionResolver';

export type CapabilityMappingResult =
  | {
      status: 'ok';
      boundIr: BoundEngineeringModelIR;
      compositionSummary: string[];
    }
  | {
      status: 'capability_gap';
      gaps: CapabilityGap[];
      unsupportedComponents: string[];
    };

export class ConceptToBlockMapper {
  private resolver = new CompositionResolver();

  /**
   * Deterministically maps semantic concepts in the Model IR to verified ADIA catalog block capabilities.
   * If any concept cannot be resolved to a valid catalog block, returns a structured CapabilityGap.
   */
  public map(
    ir: EngineeringModelIR,
    catalog: XbridgesCapabilityIndex,
    patterns: readonly EngineeringPattern[] = []
  ): CapabilityMappingResult {
    const gaps: CapabilityGap[] = [];
    const unsupportedComponents: string[] = [];
    const compositionSummary: string[] = [];
    const boundComponents: SemanticComponent[] = [];

    for (const comp of ir.components) {
      const resolution = this.resolver.resolveConcept(comp.conceptId, catalog, patterns);

      if (!resolution) {
        gaps.push({
          type: 'BLOCK_CAPABILITY_GAP',
          conceptId: comp.conceptId,
          componentId: comp.id,
          description: `No verified ADIA catalog block matches concept '${comp.conceptId}' for component '${comp.name}'`
        });
        unsupportedComponents.push(comp.id);
        continue;
      }

      // Check if catalog actually contains the resolved block
      const catalogBlock = catalog.blocks.get(resolution.blockId);
      if (!catalogBlock) {
        gaps.push({
          type: 'BLOCK_CAPABILITY_GAP',
          conceptId: comp.conceptId,
          componentId: comp.id,
          description: `Resolved block '${resolution.blockId}' is not present in active catalog fingerprint '${catalog.catalogFingerprint}'`
        });
        unsupportedComponents.push(comp.id);
        continue;
      }

      boundComponents.push({
        ...comp,
        capabilityBinding: {
          catalogBlockId: resolution.blockId,
          catalogBlockType: resolution.blockType,
          parameterMapping: resolution.parameterMapping,
          portMapping: resolution.portMapping
        }
      });

      compositionSummary.push(
        `Mapped ${comp.id} (${comp.conceptId}) -> ADIA Block ${resolution.blockId}`
      );
    }

    if (gaps.length > 0) {
      return {
        status: 'capability_gap',
        gaps,
        unsupportedComponents
      };
    }

    const boundIr: BoundEngineeringModelIR = {
      ...ir,
      components: boundComponents
    };

    return {
      status: 'ok',
      boundIr,
      compositionSummary
    };
  }
}
