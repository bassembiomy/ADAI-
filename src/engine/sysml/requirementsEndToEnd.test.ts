import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from './model';
import {
  evaluateSysmlConnection,
  type ConnectionEndpoint,
  type SysmlEndpointFamily,
} from './connectionPolicy';
import { validateLegacyRelationshipCandidate } from '../../services/sysmlCreationRules';
import { getCanvasRelationshipKinds } from '../../services/sysmlConnectionUi';
import { buildTraceabilityMatrix, exportRtmCsv, computeCoverageMetrics } from './rtm';
import { renderRequirementsDiagram } from '../../features/reporting/reportDiagrams';
import { getRelationshipDefinition } from './relationshipDefinitions';

const ep = (family: SysmlEndpointFamily, id: string = family): ConnectionEndpoint => ({ id, name: id, family });

describe('Requirements Diagram & RTM End-to-End Integration (Section 15.4)', () => {
  it('implements full lifecycle for all 7 requirement relationship kinds', () => {
    const repo = createEmptyRepository();
    repo.revision = 1;

    // 1. Setup Elements
    repo.requirements.req1 = {
      id: 'req1',
      kind: 'requirement',
      requirementId: 'REQ-001',
      name: 'Thermal System Spec',
      text: 'The thermal subsystem shall regulate temperature.',
      status: 'approved',
      version: '1.0',
      namespace: ['Thermal'],
    };

    repo.requirements.req2 = {
      id: 'req2',
      kind: 'requirement',
      requirementId: 'REQ-002',
      name: 'Heater Output Regulation',
      text: 'The heater shall maintain 65C +/- 2C.',
      status: 'approved',
      version: '1.0',
      namespace: ['Thermal'],
    };

    repo.requirements.req3 = {
      id: 'req3',
      kind: 'requirement',
      requirementId: 'REQ-003',
      name: 'Copied Regulation Spec',
      text: 'Copy of heater output regulation for secondary loop.',
      status: 'draft',
      version: '1.0',
      namespace: ['Thermal'],
    };

    repo.definitions.heater = {
      id: 'heater',
      name: 'HeaterController',
      namespace: ['Thermal'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    repo.verificationCases.tc1 = {
      id: 'tc1',
      name: 'TC-001 Thermal Chamber Test',
      namespace: ['Thermal', 'Tests'],
      kind: 'verificationCase',
      method: 'test',
      verifiesRequirementIds: ['req2'],
    };

    repo.definitions.sm = {
      id: 'sm',
      name: 'Thermal State Machine',
      namespace: ['Thermal'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    // 2. Validate Connection Policy & Canonical Directions on requirements canvas
    // requirementContainment: REQ-001 (Parent) -> REQ-002 (Child)
    const valContain = evaluateSysmlConnection({
      relationshipKind: 'requirementContainment',
      source: ep('requirement', 'req1'),
      target: ep('requirement', 'req2'),
      diagram: 'requirements',
    });
    expect(valContain.allowed).toBe(true);

    // deriveReqt: REQ-002 (Derived) -> REQ-001 (Origin)
    const valDerive = evaluateSysmlConnection({
      relationshipKind: 'deriveReqt',
      source: ep('requirement', 'req2'),
      target: ep('requirement', 'req1'),
      diagram: 'requirements',
    });
    expect(valDerive.allowed).toBe(true);

    // copy: REQ-003 (Copy) -> REQ-002 (Master)
    const valCopy = evaluateSysmlConnection({
      relationshipKind: 'copy',
      source: ep('requirement', 'req3'),
      target: ep('requirement', 'req2'),
      diagram: 'requirements',
    });
    expect(valCopy.allowed).toBe(true);

    // satisfy: HeaterController (Design) -> REQ-002 (Requirement)
    const valSatisfy = evaluateSysmlConnection({
      relationshipKind: 'satisfy',
      source: ep('block', 'heater'),
      target: ep('requirement', 'req2'),
      diagram: 'requirements',
    });
    expect(valSatisfy.allowed).toBe(true);

    // verify: TC-001 (Verification) -> REQ-002 (Requirement)
    const valVerify = evaluateSysmlConnection({
      relationshipKind: 'verify',
      source: ep('verificationCase', 'tc1'),
      target: ep('requirement', 'req2'),
      diagram: 'requirements',
    });
    expect(valVerify.allowed).toBe(true);

    // refine: Thermal State Machine -> REQ-002 (Requirement)
    const valRefine = evaluateSysmlConnection({
      relationshipKind: 'refine',
      source: ep('block', 'sm'),
      target: ep('requirement', 'req2'),
      diagram: 'requirements',
    });
    expect(valRefine.allowed).toBe(true);

    // trace: REQ-003 -> HeaterController
    const valTrace = evaluateSysmlConnection({
      relationshipKind: 'trace',
      source: ep('requirement', 'req3'),
      target: ep('block', 'heater'),
      diagram: 'requirements',
    });
    expect(valTrace.allowed).toBe(true);

    // 3. Reversal Policy: dragging from Requirement to Test Case is invalid forward, but reverse direction offers verify
    const revVerify = evaluateSysmlConnection({
      relationshipKind: 'verify',
      source: ep('requirement', 'req2'),
      target: ep('verificationCase', 'tc1'),
      diagram: 'requirements',
    });
    expect(revVerify.allowed).toBe(false);

    const uiState = {
      blocks: [
        { id: 'req2', name: 'Heater Output Regulation', stereotype: 'requirement', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
        { id: 'tc1', name: 'TC-001 Thermal Chamber Test', stereotype: 'testCase', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      ],
      parts: [],
      relationships: [],
    };
    const forwardKinds = getCanvasRelationshipKinds(uiState, 'req2', 'tc1', 'requirements');
    const reverseKinds = getCanvasRelationshipKinds(uiState, 'tc1', 'req2', 'requirements');
    expect(forwardKinds).not.toContain('verify');
    expect(reverseKinds).toContain('verify');

    // 4. Graph Cycle & Single Master Rules
    const legacyBlocks = [
      { id: 'req1', name: 'REQ-001', stereotype: 'requirement', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      { id: 'req2', name: 'REQ-002', stereotype: 'requirement', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      { id: 'req3', name: 'REQ-003', stereotype: 'requirement', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
    ];
    const existingEdges = [
      { id: 'e1', sourceId: 'req1', targetId: 'req2', type: 'requirementContainment' as const, label: '' },
      { id: 'e2', sourceId: 'req2', targetId: 'req1', type: 'deriveReqt' as const, label: '' },
      { id: 'e3', sourceId: 'req3', targetId: 'req2', type: 'copy' as const, label: '' },
    ];

    // Independent graphs: REQ-001 -> REQ-002 containment and REQ-002 -> REQ-001 deriveReqt do NOT cycle
    const valDeriveCycle = validateLegacyRelationshipCandidate(
      { blocks: legacyBlocks, parts: [], relationships: existingEdges },
      { id: 'eNew', sourceId: 'req2', targetId: 'req1', type: 'deriveReqt', label: '' },
    );
    expect(valDeriveCycle.codes).not.toContain('RELATIONSHIP_CYCLE');

    // Adding reverse containment REQ-002 -> REQ-001 would cycle in containment
    const valContainCycle = validateLegacyRelationshipCandidate(
      { blocks: legacyBlocks, parts: [], relationships: existingEdges },
      { id: 'eNew', sourceId: 'req2', targetId: 'req1', type: 'requirementContainment', label: '' },
    );
    expect(valContainCycle.codes).toContain('REQUIREMENT_CONTAINMENT_CYCLE');

    // Second copy master rule: REQ-003 already copies REQ-002; attempting to copy REQ-001 as well is prevented
    const valSecondMaster = validateLegacyRelationshipCandidate(
      { blocks: legacyBlocks, parts: [], relationships: existingEdges },
      { id: 'eNew', sourceId: 'req3', targetId: 'req1', type: 'copy', label: '' },
    );
    expect(valSecondMaster.codes).toContain('MULTIPLE_MASTERS_FOR_COPY');

    // 5. Establish all 7 relationships in Repository
    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'req1', targetId: 'req2' };
    repo.relationships.rd1 = { id: 'rd1', kind: 'deriveReqt', sourceId: 'req2', targetId: 'req1' };
    repo.relationships.rcopy1 = { id: 'rcopy1', kind: 'copy', sourceId: 'req3', targetId: 'req2' };
    repo.relationships.rsat1 = { id: 'rsat1', kind: 'satisfy', sourceId: 'heater', targetId: 'req2' };
    repo.relationships.rver1 = { id: 'rver1', kind: 'verify', sourceId: 'tc1', targetId: 'req2' };
    repo.relationships.rref1 = { id: 'rref1', kind: 'refine', sourceId: 'sm', targetId: 'req2' };
    repo.relationships.rtrace1 = { id: 'rtrace1', kind: 'trace', sourceId: 'req3', targetId: 'heater' };

    // 6. Build Traceability Matrix & Verify Directional Indexing
    const matrix = buildTraceabilityMatrix(repo);
    expect(matrix.rows).toHaveLength(3);

    const rowReq1 = matrix.rows.find(r => r.requirement.id === 'req1')!;
    const rowReq2 = matrix.rows.find(r => r.requirement.id === 'req2')!;
    const rowReq3 = matrix.rows.find(r => r.requirement.id === 'req3')!;

    // REQ-001
    expect(rowReq1.containmentChildren.map(c => c.id)).toContain('req2');
    expect(rowReq1.derivedRequirements.map(d => d.id)).toContain('req2');

    // REQ-002
    expect(rowReq2.containmentParents.map(p => p.id)).toContain('req1');
    expect(rowReq2.derivedFrom.map(d => d.id)).toContain('req1');
    expect(rowReq2.copiedRequirements.map(c => c.id)).toContain('req3');
    expect(rowReq2.satisfiedBy.map(s => s.id)).toContain('heater');
    expect(rowReq2.verifiedBy.map(v => v.id)).toContain('tc1');
    expect(rowReq2.refinedBy.map(r => r.id)).toContain('sm');
    expect(rowReq2.satisfactionStatus).toBe('satisfied');
    expect(rowReq2.verificationStatus).toBe('not-run');

    // REQ-003
    expect(rowReq3.copiedFrom.map(c => c.id)).toContain('req2');
    expect(rowReq3.tracedElements.map(t => t.id)).toContain('heater');

    // 7. Test Execution & Evidence Verification
    repo.evidence.ev1 = {
      id: 'ev1',
      verificationCaseId: 'tc1',
      requirementId: 'req2',
      revision: 1,
      result: 'passed',
      executedAt: '2026-09-15T16:00:00Z',
    };

    const updatedMatrix = buildTraceabilityMatrix(repo);
    const updatedRowReq2 = updatedMatrix.rows.find(r => r.requirement.id === 'req2')!;
    expect(updatedRowReq2.verificationStatus).toBe('passed');
    expect(updatedRowReq2.status).toBe('verified');

    // 8. Metrics Verification
    const metrics = computeCoverageMetrics(updatedMatrix);
    expect(metrics.total).toBe(3);
    expect(metrics.covered).toBe(1);
    expect(metrics.verified).toBe(1);

    // 9. CSV Export Verification
    const csv = exportRtmCsv(updatedMatrix);
    expect(csv).toContain('Requirement ID,Name,Text,Status');
    expect(csv).toContain('Contained By');
    expect(csv).toContain('Contains');
    expect(csv).toContain('Derived From');
    expect(csv).toContain('Derived Requirements');
    expect(csv).toContain('Copied From');
    expect(csv).toContain('Copied Requirements');
    expect(csv).toContain('Satisfied By');
    expect(csv).toContain('Verified By');
    expect(csv).toContain('Refined By');
    expect(csv).toContain('Traced Elements');
    expect(csv).toContain('Satisfaction Status');
    expect(csv).toContain('Verification Status');
    expect(csv).toContain('HeaterController');
    expect(csv).toContain('TC-001 Thermal Chamber Test');
    expect(csv).toContain('Thermal State Machine');

    // 10. Diagram Presentation & SVG Rendering
    const containmentMeta = getRelationshipDefinition('requirementContainment');
    expect(containmentMeta.sourceMarker).toBe('requirement-containment-crosshair');
    expect(containmentMeta.targetMarker).toBeNull();

    const diagramBlocks = [
      ...Object.values(repo.requirements).map(r => ({
        id: r.id,
        name: r.name,
        stereotype: 'requirement',
        reqId: r.requirementId,
        x: 0, y: 0, width: 160, height: 80,
        properties: [], operations: [], constraints: [], classes: [], ports: [],
      })),
      {
        id: 'heater',
        name: 'HeaterController',
        stereotype: 'block',
        x: 0, y: 0, width: 160, height: 80,
        properties: [], operations: [], constraints: [], classes: [], ports: [],
      },
      {
        id: 'tc1',
        name: 'TC-001 Thermal Chamber Test',
        stereotype: 'testCase',
        x: 0, y: 0, width: 160, height: 80,
        properties: [], operations: [], constraints: [], classes: [], ports: [],
      },
    ];
    const diagramRels = Object.values(repo.relationships).map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.kind as any,
      label: '',
    }));

    const svg = renderRequirementsDiagram({
      blocks: diagramBlocks,
      relationships: diagramRels,
    });
    expect(svg).toContain('REQ-001');
    expect(svg).toContain('REQ-002');
    expect(svg).toContain('REQ-003');
    expect(svg).toContain('requirement-containment-crosshair');
    expect(svg).toContain('edge-rc1');
    expect(svg).toContain('edge-rd1');
    expect(svg).toContain('edge-rcopy1');
    expect(svg).toContain('edge-rsat1');
    expect(svg).toContain('edge-rver1');
  });
});
