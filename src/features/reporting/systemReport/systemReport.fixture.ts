import { createEmptyRepository, type SysmlRepository } from '../../../engine/sysml/model';
import { buildTraceabilityMatrix, computeCoverageMetrics } from '../../../engine/sysml/rtm';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../../../types/sysml_types';
import type { Layer, StateData, TransitionData } from '../../../types/sm_types';
import type { HierarchySourceModel } from '../reportHierarchyEngine';
import type { SystemReportInput } from './buildSystemReport';

const mult = { lower: 1, upper: 1 as const, ordered: false, unique: true };

/** Every id used by the rich fixture. None of them may appear in the visible text of the report. */
export const FIXTURE_IDS = [
  'blk_veh', 'blk_pt', 'blk_eng', 'blk_gb', 'blk_ch', 'blk_pis', 'blk_val',
  'part_pt', 'part_ch', 'part_spare', 'part_eng', 'part_gb', 'part_pis', 'part_val',
  'con_a', 'con_b', 'con_cross',
  'req_range', 'req_top', 'req_noise', 'req_safe', 'vc_range', 'vc_top', 'ev_pass', 'ev_fail',
  'st_idle', 'st_run', 'st_fast', 'st_slow', 'st_boost', 'st_cruise', 'lay_root', 'lay_run', 'lay_fast',
  'act_drive', 'ix_checkout', 'uc_drive', 'actor_driver', 'subj_car', 'pkg_struct', 'pkg_beh',
];

function block(id: string, name: string, extra: Partial<BlockData> = {}): BlockData {
  return { id, name, stereotype: 'block', x: 0, y: 0, width: 160, height: 100, properties: [], operations: [], constraints: [], classes: [], ports: [], ...extra };
}

function part(id: string, name: string, blockId: string, typeId: string, multiplicity = '1'): PartData {
  return { id, name, blockId, typeId, multiplicity, x: 0, y: 0, width: 140, height: 80 };
}

function state(id: string, name: string, extra: Partial<StateData> = {}): StateData {
  return {
    id, name, x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#fff',
    parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false, ...extra,
  } as unknown as StateData;
}

function transition(id: string, sourceId: string, targetId: string, condition: string, action = ''): TransitionData {
  return { id, sourceId, targetId, condition, action, afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 } as unknown as TransitionData;
}

export function richRepository(): SysmlRepository {
  const repo = createEmptyRepository();
  const R = repo as any;
  R.revision = 7;
  const pkg = (id: string, name: string) => { R.packages[id] = { id, kind: 'package', name, namespace: [], ownerId: 'model' }; };
  pkg('pkg_struct', 'Structure');
  pkg('pkg_beh', 'Behaviour');
  const def = (id: string, name: string, extra: object = {}) => {
    R.definitions[id] = { id, kind: 'block', name, namespace: [], ownerId: 'pkg_struct', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [], ...extra };
  };
  ['blk_veh:Vehicle', 'blk_pt:Powertrain', 'blk_eng:Engine', 'blk_gb:Gearbox', 'blk_ch:Chassis', 'blk_pis:Piston', 'blk_val:Valve']
    .forEach(s => { const [id, name] = s.split(':'); def(id, name); });
  R.definitions.real = { id: 'real', kind: 'valueType', name: 'Real', namespace: [] };

  // requirements
  const req = (id: string, rid: string, name: string, text: string, extra: object = {}) => {
    R.requirements[id] = { id, kind: 'requirement', name, namespace: [], ownerId: 'pkg_struct', requirementId: rid, text, status: 'approved', version: '1', risk: 'high', priority: 'high', ...extra };
  };
  req('req_range', 'REQ-001', 'Range', 'The system shall travel 400 km on one charge.');
  req('req_top', 'REQ-002', 'Top speed', 'The system shall reach 180 km/h.', { risk: 'medium' });
  req('req_noise', 'REQ-003', 'Noise', 'Cabin noise shall stay below 65 dB.', { risk: 'low' });
  req('req_safe', 'REQ-004', 'Safe stop', 'The system shall stop safely on fault.');

  // verification
  R.verificationCases.vc_range = { id: 'vc_range', kind: 'verificationCase', name: 'Range test', namespace: [], method: 'test', verifiesRequirementIds: ['req_range'] };
  R.verificationCases.vc_top = { id: 'vc_top', kind: 'verificationCase', name: 'Top speed test', namespace: [], method: 'test', verifiesRequirementIds: ['req_top'] };
  R.evidence.ev_pass = { id: 'ev_pass', verificationCaseId: 'vc_range', requirementId: 'req_range', revision: 7, result: 'passed', executedAt: '2026-01-01T10:00:00Z' };
  R.evidence.ev_fail = { id: 'ev_fail', verificationCaseId: 'vc_top', requirementId: 'req_top', revision: 7, result: 'failed', executedAt: '2026-01-02T10:00:00Z' };

  const rel = (id: string, kind: string, sourceId: string, targetId: string) => { R.relationships[id] = { id, kind, sourceId, targetId }; };
  rel('rel_s1', 'satisfy', 'blk_veh', 'req_range');
  rel('rel_v1', 'verify', 'vc_range', 'req_range');
  rel('rel_d1', 'deriveReqt', 'req_top', 'req_range');
  rel('rel_s2', 'satisfy', 'blk_eng', 'req_top');
  rel('rel_t1', 'trace', 'blk_gb', 'req_top');
  rel('rel_v2', 'verify', 'vc_top', 'req_top');
  rel('rel_r1', 'refine', 'act_drive', 'req_noise');
  rel('rel_d2', 'deriveReqt', 'blk_ch', 'req_range');

  // behaviour
  R.definitions.act_drive = {
    id: 'act_drive', kind: 'activity', name: 'Drive Vehicle', namespace: [], parameters: [],
    nodes: [{ id: 'n0', kind: 'initial', name: '' }, { id: 'n1', kind: 'action', name: 'Accelerate' }, { id: 'n2', kind: 'activityFinal', name: '' }],
    edges: [{ id: 'ne1', kind: 'controlFlow', sourceId: 'n0', targetId: 'n1' }, { id: 'ne2', kind: 'controlFlow', sourceId: 'n1', targetId: 'n2' }],
    partitions: [],
  };
  R.actors.actor_driver = { id: 'actor_driver', kind: 'actor', name: 'Driver', namespace: [], ownerId: 'model', isExternal: false, generalizationIds: [] };
  R.subjects.subj_car = { id: 'subj_car', kind: 'subject', name: 'Car', namespace: [], ownerId: 'model' };
  R.useCases.uc_drive = { id: 'uc_drive', kind: 'useCase', name: 'Drive to work', namespace: [], ownerId: 'model', subjectId: 'subj_car', description: 'The driver commutes.', extensionPointIds: [], behaviorArtifactIds: [] };
  rel('rel_uc1', 'useCaseAssociation', 'actor_driver', 'uc_drive');
  R.definitions.ix_checkout = {
    id: 'ix_checkout', kind: 'interaction', name: 'Start Journey', namespace: [],
    lifelines: [{ id: 'll_d', name: 'driver' }, { id: 'll_c', name: 'car' }],
    messages: [
      { id: 'mm1', order: 1, sort: 'synchCall', name: 'start', sourceLifelineId: 'll_d', targetLifelineId: 'll_c' },
      { id: 'mm2', order: 2, sort: 'reply', name: 'ready', sourceLifelineId: 'll_c', targetLifelineId: 'll_d' },
    ],
    fragments: [],
  };
  // parametric
  R.definitions.newton = {
    id: 'newton', kind: 'constraintBlock', name: 'NewtonSecondLaw', namespace: [],
    parameters: [{ id: 'cpF', name: 'F', typeId: 'real' }, { id: 'cpM', name: 'm', typeId: 'real' }],
    constraints: ['F = m * a'],
  };
  R.definitions.body = {
    id: 'body', kind: 'block', name: 'RigidBody', namespace: [], isAbstract: false, isLeaf: false, ports: [], operations: [], constraints: [],
    properties: [
      { id: 'pMass', name: 'mass', kind: 'value', typeId: 'real', multiplicity: mult },
      { id: 'pForce', name: 'force', kind: 'value', typeId: 'real', multiplicity: mult },
      { id: 'pLaw', name: 'law', kind: 'constraint', typeId: 'newton', multiplicity: mult },
    ],
  };
  R.connectors.bind1 = { id: 'bind1', kind: 'binding', ownerId: 'body', sourcePortId: '', targetPortId: '', sourceEnd: { propertyId: 'pForce' }, targetEnd: { propertyId: 'pLaw', parameterId: 'cpF' } };
  R.connectors.bind2 = { id: 'bind2', kind: 'binding', ownerId: 'body', sourcePortId: '', targetPortId: '', sourceEnd: { propertyId: 'pMass' }, targetEnd: { propertyId: 'pLaw', parameterId: 'cpM' } };
  return repo;
}

export function richHierarchy(): HierarchySourceModel {
  const blocks: BlockData[] = [
    block('blk_veh', 'Vehicle', { ports: [{ id: 'port_fuel', name: 'fuel', type: 'Real', direction: 'in' }] }),
    block('blk_pt', 'Powertrain', { ports: [{ id: 'port_ptout', name: 'torqueOut', type: 'Real', direction: 'out' }] }),
    block('blk_eng', 'Engine', { ports: [{ id: 'port_engout', name: 'shaft', type: 'Real', direction: 'out' }], properties: [{ id: 'prop_cc', name: 'displacement', type: 'Real', defaultValue: '2.0' }] }),
    block('blk_gb', 'Gearbox', { ports: [{ id: 'port_gbin', name: 'input', type: 'Real', direction: 'in' }] }),
    block('blk_ch', 'Chassis', { ports: [{ id: 'port_chin', name: 'driveIn', type: 'Real', direction: 'in' }] }),
    block('blk_pis', 'Piston'),
    block('blk_val', 'Valve'),
    ...[
      ['req_range', 'REQ-001', 'Range', 'The system shall travel 400 km on one charge.'],
      ['req_top', 'REQ-002', 'Top speed', 'The system shall reach 180 km/h.'],
      ['req_noise', 'REQ-003', 'Noise', 'Cabin noise shall stay below 65 dB.'],
      ['req_safe', 'REQ-004', 'Safe stop', 'The system shall stop safely on fault.'],
    ].map(([id, reqId, name, description]) => block(id, name, { stereotype: 'requirement', reqId, description, status: 'approved', priority: 'high' })),
  ];
  const parts: PartData[] = [
    part('part_pt', 'drivetrain', 'blk_veh', 'blk_pt'),
    part('part_ch', 'frame', 'blk_veh', 'blk_ch'),
    part('part_spare', 'spareDrivetrain', 'blk_veh', 'blk_pt', '0..1'),
    part('part_eng', 'motor', 'blk_pt', 'blk_eng'),
    part('part_gb', 'transmission', 'blk_pt', 'blk_gb'),
    part('part_pis', 'piston', 'blk_eng', 'blk_pis', '4'),
    part('part_val', 'valve', 'blk_eng', 'blk_val', '16'),
  ];
  const connectors: ConnectorData[] = [
    { id: 'con_a', sourcePartId: 'part_pt', sourcePortId: 'port_ptout', targetPartId: 'part_ch', targetPortId: 'port_chin', itemFlow: 'torque' },
    { id: 'con_b', sourcePartId: 'part_eng', sourcePortId: 'port_engout', targetPartId: 'part_gb', targetPortId: 'port_gbin', itemFlow: 'rotation' },
    // One end in the Powertrain context, the other in the Vehicle context: belongs to neither completely.
    { id: 'con_cross', sourcePartId: 'part_eng', sourcePortId: 'port_engout', targetPartId: 'part_ch', targetPortId: 'port_chin' },
  ];
  const relationships: RelationshipData[] = [
    { id: 'hrel_c1', sourceId: 'blk_veh', targetId: 'blk_pt', type: 'composition', label: '', sourceMultiplicity: '1', targetMultiplicity: '1' },
    { id: 'hrel_c2', sourceId: 'blk_veh', targetId: 'blk_ch', type: 'composition', label: '' },
    { id: 'hrel_c3', sourceId: 'blk_pt', targetId: 'blk_eng', type: 'composition', label: '' },
    { id: 'hrel_c4', sourceId: 'blk_pt', targetId: 'blk_gb', type: 'composition', label: '' },
    { id: 'hrel_s1', sourceId: 'blk_veh', targetId: 'req_range', type: 'satisfy', label: '' },
    { id: 'hrel_d1', sourceId: 'req_range', targetId: 'req_top', type: 'requirementContainment', label: '' },
  ];
  const states = [
    state('st_idle', 'Idle', { autostart: true, entry: 'motor = 0' }),
    state('st_run', 'Running', { during: 'monitor()' }),
    state('st_fast', 'Fast', { exit: 'log()' }),
    state('st_slow', 'Slow', { autostart: true }),
    state('st_boost', 'Boost', { autostart: true }),
    state('st_cruise', 'Cruise'),
  ];
  const transitions = [
    transition('tr_1', 'st_idle', 'st_run', 'start == true', 'motor = 1'),
    transition('tr_2', 'st_run', 'st_idle', 'stop == true'),
    transition('tr_3', 'st_slow', 'st_fast', 'speed > 50'),
    transition('tr_4', 'st_fast', 'st_slow', 'speed < 40'),
    transition('tr_5', 'st_boost', 'st_cruise', 'steady == true'),
  ];
  const layers: Layer[] = [
    { id: 'lay_root', name: 'Main', parentStateId: null, stateIds: ['st_idle', 'st_run'], transitionIds: ['tr_1', 'tr_2'], junctionIds: [] },
    { id: 'lay_run', name: 'Running regions', parentStateId: 'st_run', stateIds: ['st_slow', 'st_fast'], transitionIds: ['tr_3', 'tr_4'], junctionIds: [] },
    { id: 'lay_fast', name: 'Fast modes', parentStateId: 'st_fast', stateIds: ['st_boost', 'st_cruise'], transitionIds: ['tr_5'], junctionIds: [] },
  ];
  return { blocks, parts, connectors, relationships, states, layers, transitions, junctions: [] };
}

export function richReportInput(overrides: Partial<SystemReportInput> = {}): SystemReportInput {
  const repository = richRepository();
  const matrix = buildTraceabilityMatrix(repository);
  return {
    projectName: 'Electric Car',
    author: 'A. Engineer',
    engineVersion: '9.9.9',
    generatedAt: new Date('2026-10-08T09:30:00Z'),
    repository,
    hierarchy: richHierarchy(),
    diagnostics: { errors: [], removedRelationshipIds: [], removedConnectorIds: [] },
    traceability: { matrix, metrics: computeCoverageMetrics(matrix), modelHash: 'abc123', repositoryRevision: repository.revision, diagnostics: [] },
    extraSections: [{ id: 'sm-analysis', title: 'State Machine Analysis', html: '<h3>Critical Path Analysis</h3><p>None.</p><h3>Test Scenario Matrix</h3><p>None.</p>' }],
    ...overrides,
  };
}
