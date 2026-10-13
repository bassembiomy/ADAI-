import { describe, expect, it } from 'vitest';
import { SYSML_PROFILE, getCapability } from './profile';

describe('ADIA SysML profile', () => {
  it('declares the supported normative baseline', () => {
    expect(SYSML_PROFILE.id).toBe('OMG-SysML-1.6-ADIA');
    expect(SYSML_PROFILE.sysmlVersion).toBe('1.6');
    expect(SYSML_PROFILE.isoBaseline).toBe('ISO/IEC 19514:2017');
  });

  it.each([
    'bdd.block', 'bdd.valueType', 'bdd.partProperty', 'bdd.referenceProperty',
    'bdd.flowProperty', 'bdd.port', 'bdd.composition', 'bdd.sharedAggregation',
    'bdd.association', 'bdd.generalization', 'bdd.dependency', 'bdd.allocation',
    'ibd.partUsage', 'ibd.fullPort', 'ibd.proxyPort', 'ibd.connector',
    'ibd.itemFlow', 'ibd.bindingConnector', 'ibd.delegationConnector',
    'req.requirement', 'req.deriveReqt', 'req.satisfy', 'req.verify',
    'req.refine', 'req.trace', 'req.copy', 'rtm.matrix', 'rtm.baseline',
  ])('registers capability %s with conformance evidence', id => {
    const capability = getCapability(id);
    expect(capability?.id).toBe(id);
    expect(capability?.status).toBe('supported');
    expect(capability?.normativeReference).toMatch(/SysML 1\.6/);
    expect(capability?.testId).toMatch(/^SYSML-/);
  });

  it('records known gaps against SysML 1.6 instead of implying full coverage', () => {
    for (const id of ['bdd.compartments', 'ibd.inheritedFeatures', 'bdd.enumerationSignalUnit', 'par.parametricDiagram', 'alloc.allocationMatrix', 'view.viewpoint', 'act.activityDiagram', 'seq.sequenceDiagram']) {
      expect(getCapability(id)?.status).toBe('partial');
      expect(getCapability(id)?.limitation).toBeTruthy();
    }
    // Nested connector ends are complete in engine, file format and IBD UI; the entry keeps its remaining limits and claims no browser verification.
    const nested = getCapability('ibd.nestedConnectorEnds');
    expect(nested?.status).toBe('supported');
    expect(nested?.limitation).toMatch(/format 5/);
    expect(nested?.limitation).toMatch(/Nested parts/);
    expect(nested?.limitation).toMatch(/Remaining limits/);
    expect(nested?.limitation).toMatch(/not been verified in a real browser/);
    expect(nested?.limitation).not.toMatch(/no UI/i);
    // Test ids stay unique so conformance evidence maps one-to-one.
    const ids = SYSML_PROFILE.capabilities.map(capability => capability.testId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes the Use Case diagram as a real canvas with its remaining gaps, not as in progress', () => {
    const capability = getCapability('usecase.view');
    expect(capability?.status).toBe('partial');
    expect(capability?.limitation).toContain('canvas');
    expect(capability?.limitation).toContain('extend');
    expect(capability?.limitation).toMatch(/model explorer/);
    expect(capability?.limitation).not.toContain('in progress');
  });

  it('describes Unit and QuantityKind as done and the Enumeration/Signal editor gap as remaining', () => {
    const capability = getCapability('bdd.enumerationSignalUnit');
    expect(capability?.status).toBe('partial');
    expect(capability?.limitation).toContain('{unit=symbol}');
    expect(capability?.limitation).not.toContain('still only free-text');
    expect(capability?.limitation).toMatch(/Enumeration and Signal have no BDD symbol/);
  });

  it('describes View/Viewpoint/Stakeholder as modelled with honest remaining gaps', () => {
    const capability = getCapability('view.viewpoint');
    expect(capability?.status).toBe('partial');
    expect(capability?.limitation).toContain('MULTIPLE_VIEWPOINTS');
    expect(capability?.limitation).toMatch(/Comment/);
    expect(capability?.limitation).not.toMatch(/are not modelled/);
  });

  it('describes the Activity diagram as modelled and drawn, with its remaining gaps and no execution claim', () => {
    const capability = getCapability('act.activityDiagram');
    expect(capability?.status).toBe('partial');
    expect(capability?.limitation).toContain('swimlane');
    expect(capability?.limitation).toContain('pins');
    expect(capability?.limitation).toContain('«allocate»');
    expect(capability?.limitation).toMatch(/no execution or simulation/);
    expect(capability?.limitation).not.toMatch(/No activity model or diagram/);
  });

  it('describes the Sequence diagram as modelled and drawn, with its remaining gaps and no execution claim', () => {
    const capability = getCapability('seq.sequenceDiagram');
    expect(capability?.status).toBe('partial');
    expect(capability?.limitation).toContain('lifelines');
    expect(capability?.limitation).toContain('combined fragments');
    expect(capability?.limitation).toContain('reply');
    expect(capability?.limitation).toMatch(/no execution or simulation/);
    expect(capability?.limitation).toMatch(/not been verified in a real browser/);
    expect(capability?.limitation).not.toMatch(/No interaction model or diagram/);
  });

  it('keeps SysML v2 outside the semantic-equivalence claim', () => {
    expect(getCapability('interop.sysmlV2')?.status).toBe('unsupported');
  });

  it('registers req.containment capability with conformance evidence', () => {
    const capability = getCapability('req.containment');
    expect(capability?.id).toBe('req.containment');
    expect(capability?.status).toBe('supported');
    expect(capability?.testId).toBe('SYSML-030');
  });
});
