import { describe, it, expect } from 'vitest';
import type { UseCaseNode, UseCaseRelationship } from './usecase_types';

describe('UseCase Types', () => {
  it('supports SysML traceability metadata on UseCaseNode', () => {
    const node: UseCaseNode = {
      id: 'uc-1',
      type: 'useCase',
      position: { x: 100, y: 100 },
      data: {
        label: 'Perform Cruise Control',
        subjectBlockId: 'block-vehicle-mgmt',
        elaboratingDiagramId: 'act-cruise-control',
        requirementTraces: [
          { requirementId: 'REQ-001', relationType: 'refine' },
          { requirementId: 'REQ-002', relationType: 'satisfy' },
        ],
        extensionPoints: ['HighSpeedMode', 'EcoMode'],
      },
    };

    expect(node.data.subjectBlockId).toBe('block-vehicle-mgmt');
    expect(node.data.requirementTraces?.length).toBe(2);
    expect(node.data.extensionPoints).toContain('EcoMode');
  });

  it('supports SysML relationship stereotypes', () => {
    const edge: UseCaseRelationship = {
      id: 'e-1',
      source: 'uc-1',
      target: 'uc-2',
      type: 'include',
    };
    expect(edge.type).toBe('include');
  });
});
