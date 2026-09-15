export type SysmlCapabilityStatus = 'supported' | 'partial' | 'unsupported';

export interface SysmlCapability {
  id: string;
  status: SysmlCapabilityStatus;
  normativeReference: string;
  testId: string;
  limitation?: string;
}

const trackedCapabilities = [
  'bdd.block', 'bdd.valueType', 'bdd.partProperty', 'bdd.referenceProperty',
  'bdd.flowProperty', 'bdd.port', 'bdd.composition', 'bdd.sharedAggregation',
  'bdd.association', 'bdd.generalization', 'bdd.dependency', 'bdd.allocation',
  'ibd.partUsage', 'ibd.fullPort', 'ibd.proxyPort', 'ibd.connector',
  'ibd.itemFlow', 'ibd.bindingConnector', 'ibd.delegationConnector',
  'req.requirement', 'req.deriveReqt', 'req.satisfy', 'req.verify',
  'req.refine', 'req.trace', 'req.copy', 'rtm.matrix', 'rtm.baseline',
] as const;

const capabilities: SysmlCapability[] = trackedCapabilities.map((id, index) => ({
  id,
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 / ISO/IEC 19514:2017',
  testId: `SYSML-${String(index + 1).padStart(3, '0')}`,
}));

capabilities.push({
  id: 'interop.sysmlV2',
  status: 'unsupported',
  normativeReference: 'SysML 1.6 profile boundary; SysML v2 requires a versioned adapter',
  testId: 'SYSML-029',
  limitation: 'No semantic-equivalence claim is made for SysML v2.',
});

capabilities.push({
  id: 'req.containment',
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 Clause 16.3.2.1 / UML Namespace Containment',
  testId: 'SYSML-030',
});

capabilities.push({
  id: 'policy.typedDecisions',
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 / ISO/IEC 19514:2017',
  testId: 'SYSML-031',
});

capabilities.push({
  id: 'usecase.view',
  status: 'partial',
  normativeReference: 'OMG SysML 1.6 Clause 16 / ISO/IEC 19514:2017',
  testId: 'SYSML-032',
  limitation: 'Metamodel and validation active; UI lifecycle, normalized store, and persistence in progress.',
});

export const SYSML_PROFILE = Object.freeze({
  id: 'OMG-SysML-1.6-ADIA' as const,
  sysmlVersion: '1.6' as const,
  isoBaseline: 'ISO/IEC 19514:2017' as const,
  capabilities: Object.freeze(capabilities),
});

const byId = new Map(SYSML_PROFILE.capabilities.map(capability => [capability.id, capability]));

export function getCapability(id: string): SysmlCapability | undefined {
  return byId.get(id);
}
