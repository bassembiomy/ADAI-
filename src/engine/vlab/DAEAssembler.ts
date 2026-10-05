import { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { interfaceBranchSpecs, jointBranchSpecs, jointConfiguration, jointKindOf } from './vlabJointCore';
import { EquationContext, AssembledSystem, PhysicalDomain, ComponentEquation, ScopeChannelBinding } from './types';
import { blockEquations, DERIVATIVE_DEPENDENT_BLOCK_TYPES, withStatefulEquationCaches } from './vlabEquations';
import { numericParam, stringParam, VLabParamError } from './vlabParams';
import { computeAbsoluteReferencePressure, computeEffectivePortPressure } from '../../utils/hydraulicUnits';
import {
  ConstraintTopology,
  MultibodyConstraintDiagnosticError,
  validateMultibodyConstraintTopology,
} from './vlabConstraintDiagnostics';
import { ANY_DOMAIN_BLOCKS, TRANSPARENT_BLOCKS, portIdFromHandle } from './vlabConnectionRules';
import {
  PortWidthMismatchError, channelVariableSuffix, portShape, vectorBranchName,
  type PortShape, type PortWidthDiagnostic,
} from './vlabVectorPorts';
import { BlockEquationError, NonFiniteResidualError, type ResidualDiagnostic } from './vlabResidualDiagnostics';
import { ScopeReadError } from './vlabScopeRead';
import { DAEStructureError, UNSUPPORTED_BLOCKS, rowCountDiagnostic, type StructuralDiagnostic } from './vlabStructure';

const SIGNAL_CONTROL_BLOCKS = new Set([
  'ps_lookup_2d', 'bldc_commutation', 'bldc_current_ctrl', 'bldc_pwm_ctrl',
  'dcdc_ctrl', 'pfc_rectifier_ctrl', 'cycloconverter_ctrl', 'ps_integrator_gen',
  'ps_moving_avg', 'ps_sr_flipflop', 'ps_sample_hold', 'ps_smith_predictor',
  'ps_sine_3phase', 'ps_second_order_filter', 'ps_state_feedback', 'ps_sliding_mode',
  'ps_stair_gen', 'ps_washout', 'dc_current_ctrl', 'dc_voltage_ctrl',
  'hysteresis_ctrl_3ph', 'velocity_ctrl', 'im_scalar_ctrl', 'im_dtc_ctrl',
  'im_curr_ctrl', 'inv_clarke_transform', 'clarke_transform', 'park_transform', 'inv_park_transform',
  'sym_comp_transform', 'inv_sym_comp_transform', 'quad_decoder', 'resolver_to_digital',
  'pmsm_curr_ctrl', 'pmsm_ref_gen', 'pmsm_field_weakening', 'pmsm_tq_est',
  'pwm_3ph_3level', 'pwm_vienna', 'thyristor_6pulse', 'thyristor_12pulse',
  'ps_simulink_conv', 'simulink_ps_conv', 'vlab_probe', 'conn_label', 'doe_custom',
  'subsystem', 'Subsystem', 'inport', 'Inport', 'outport', 'Outport', 'nmos'
]);

const FRAME_WRENCH_BRANCHES = ['fx', 'fy', 'fz', 'tx', 'ty', 'tz'];

// Physical-signal measurement outputs of the multibody force elements, in equation order.
const FRAME_FORCE_MEASUREMENTS: Record<string, string[]> = {
  grav_field: ['fm'],
  spring_damper_force: ['x', 'v', 'fm'],
  external_force: ['fm', 'tm'],
};

// Blocks that load or observe a frame without constraining its pose. A frame
// node touched only by these has no kinematic definition and is held at origin.
const FRAME_NON_KINEMATIC_TYPES = new Set([
  'grav_field', 'spring_damper_force', 'external_force', 'transform_sensor', 'mech_config',
  'scope', 'vlab_probe', 'conn_label',
]);

class UnionFind {
  parent: Record<string, string> = {};

  find(id: string): string {
    if (!this.parent[id]) {
      this.parent[id] = id;
    }
    if (this.parent[id] === id) {
      return id;
    }
    this.parent[id] = this.find(this.parent[id]);
    return this.parent[id];
  }

  union(id1: string, id2: string) {
    const root1 = this.find(id1);
    const root2 = this.find(id2);
    if (root1 !== root2) {
      this.parent[root1] = root2;
    }
  }
}

export class DAEAssembler {
  assemble(rawNodes: Node[], rawEdges: Edge[]): AssembledSystem {
    const { flatNodes, flatEdges } = this.flattenSubsystems(rawNodes, rawEdges);
    const nodes = flatNodes;
    const edges = flatEdges;

    const uf = new UnionFind();
    
    // 1. Identify all ports on all nodes
    const nodePorts = new Map<string, string[]>();
    const nodePortDomains = new Map<string, PhysicalDomain>();
    const nodePortPositions = new Map<string, string>();
    // Signal direction of every Physical port, from the library (source of truth) or the instance's own port metadata.
    const nodePortDirections = new Map<string, 'in' | 'out'>();
    // Ports that exist in the block's library definition (everything else is a dynamic instance port).
    const libraryPortKeys = new Set<string>();
    // WP-09c: width / composite shape of every port that declares one (key = `<node>_<port>`; absent = scalar), and the
    // ports whose net width is not checked because the block is width-agnostic (scope / probe sinks, Simulink-PS wildcards,
    // transparent utility blocks).
    const nodePortShapes = new Map<string, PortShape>();
    const widthAgnosticKeys = new Set<string>();

    // Helper to get ports of a block type
    const getBlockPortsFromLib = (blockType: string) => {
      for (const domain of VLAB_LIBRARY) {
        const block = domain.blocks.find(b => b.id === blockType);
        if (block) {
          return block.ports.map(p => {
            let d = p.domain;
            if (!d) {
              const pid = p.id.toLowerCase();
              if (['ctrl', 'src', 'phi'].includes(pid)) d = 'Physical';
              else if (domain.type === 'Magnetic' && (pid === 'n' || pid === 's')) d = 'Magnetic';
              else d = domain.type;
            }
            return {
              id: p.id,
              domain: d.toLowerCase() as PhysicalDomain,
              pos: p.pos,
              direction: p.direction,
              // WP-09c: width / composite metadata (library is the source of truth)
              shape: portShape(p, `Port "${p.id}" of block type "${blockType}"`),
            };
          });
        }
      }
      return [];
    };

    // Exact port id behind an edge handle (`<node>-<port>` editor format). The library/instance port ids are tried
    // first, so ports that really end in `_s` / `_t` (pmsm_foc.vdc_s, iabc_s, w_s, th_s) are never mis-parsed; the
    // legacy `<port>_s|_t` suffix is only stripped when the exact id does not exist (vlabConnectionRules.portIdFromHandle).
    const nodeById = new Map<string, Node>(nodes.map(n => [n.id, n]));
    const resolveHandlePort = (nodeId: string, handle: string | null | undefined): string => {
      const n = nodeById.get(nodeId);
      const id = n ? portIdFromHandle(n as any, handle) : undefined;
      return id ?? 'p';
    };

    // Find all ports from library, custom definitions, or connected edges
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const portsSet = new Set<string>();
      const isSignalCtrl = SIGNAL_CONTROL_BLOCKS.has(type);

      // Get ports from library
      const libPorts = getBlockPortsFromLib(type);
      libPorts.forEach(p => {
        portsSet.add(p.id);
        const resolvedDomain = isSignalCtrl ? 'physical' : p.domain;
        nodePortDomains.set(`${node.id}_${p.id}`, resolvedDomain);
        nodePortPositions.set(`${node.id}_${p.id}`, p.pos);
        libraryPortKeys.add(`${node.id}_${p.id}`);
        if (p.direction) nodePortDirections.set(`${node.id}_${p.id}`, p.direction);
        if (p.shape.width > 1) nodePortShapes.set(`${node.id}_${p.id}`, p.shape);
      });

      // Get ports from node data
      if (node.data && Array.isArray((node.data as any).ports)) {
        (node.data as any).ports.forEach((p: any) => {
          if (p && p.id) {
            portsSet.add(p.id);
            const resolvedDomain = isSignalCtrl ? 'physical' : (p.domain ? p.domain.toLowerCase() as PhysicalDomain : undefined);
            if (resolvedDomain) {
              nodePortDomains.set(`${node.id}_${p.id}`, resolvedDomain);
            }
            if (p.pos) {
              nodePortPositions.set(`${node.id}_${p.id}`, p.pos);
            }
            // DOE deployment ports declare `type: input|output` instead of `direction` (same rule as vlabConnectionRules).
            const direction = p.direction ?? (p.type === 'output' ? 'out' : p.type === 'input' ? 'in' : undefined);
            if (direction === 'in' || direction === 'out') nodePortDirections.set(`${node.id}_${p.id}`, direction);
            // an instance port only declares a shape when the library does not know the port (library wins)
            if (!libraryPortKeys.has(`${node.id}_${p.id}`)) {
              const shape = portShape(p, `Port "${p.id}" of block "${node.id}"`);
              if (shape.width > 1) nodePortShapes.set(`${node.id}_${p.id}`, shape);
            }
          }
        });
      }

      // Discover ports from edges
      edges.forEach(edge => {
        if (edge.source === node.id && edge.sourceHandle) {
          portsSet.add(resolveHandlePort(node.id, edge.sourceHandle));
        }
        if (edge.target === node.id && edge.targetHandle) {
          portsSet.add(resolveHandlePort(node.id, edge.targetHandle));
        }
      });

      nodePorts.set(node.id, Array.from(portsSet));
      if (type === 'scope' || TRANSPARENT_BLOCKS.has(type) || ANY_DOMAIN_BLOCKS.has(type)) {
        portsSet.forEach(pid => widthAgnosticKeys.add(`${node.id}_${pid}`));
      }
    });

    // Populate default domains for ports that don't have them
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        if (!nodePortDomains.has(key)) {
          // Guess domain based on type & naming
          const id = portId.toLowerCase();
          let domain: PhysicalDomain = 'electrical';
          if (id.includes('in') || id.includes('out') || id.includes('ctrl') || id.includes('ref') || id.includes('sig') || id.includes('val') || ['s', 'y', 'u', 'e', 'g'].includes(id)) {
            domain = 'physical';
          } else if (['r', 'c', 'w', 't', 'theta'].includes(id)) {
            domain = 'rotational';
          } else if (['h'].includes(id)) {
            domain = 'thermal';
          } else {
            // Find parent domain from library
            for (const domainObj of VLAB_LIBRARY) {
              if (domainObj.blocks.some(b => b.id === type)) {
                domain = domainObj.type.toLowerCase() as PhysicalDomain;
                break;
              }
            }
          }
          nodePortDomains.set(key, domain);
        }
      });
    });

    // Initialize all ports in Union-Find
    nodes.forEach(node => {
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        uf.find(`${node.id}_${portId}`);
      });
    });

    // 2. Connect ports according to edges
    const connectedPortKeys = new Set<string>();
    const warnedUnconnectedNmosGates = new Set<string>();
    edges.forEach(edge => {
      const sourcePort = resolveHandlePort(edge.source, edge.sourceHandle);
      const targetPort = resolveHandlePort(edge.target, edge.targetHandle);

      const sourceKey = `${edge.source}_${sourcePort}`;
      const targetKey = `${edge.target}_${targetPort}`;
      
      uf.union(sourceKey, targetKey);
      connectedPortKeys.add(sourceKey);
      connectedPortKeys.add(targetKey);
    });


    // Group ports by their Union-Find root
    const rootToPorts = new Map<string, string[]>();
    nodes.forEach(node => {
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        const root = uf.find(key);
        if (!rootToPorts.has(root)) {
          rootToPorts.set(root, []);
        }
        rootToPorts.get(root)!.push(key);
      });
    });

    // 3. Allocate Across variables for each physical node
    const physicalNodes: { id: string; domain: PhysicalDomain; acrossVarIndex: number; stride: number; composite: boolean }[] = [];
    const nodeAcrossIndex = new Map<string, number>(); // rootId -> index in x[]
    const variableNames: string[] = [];
    const isDifferentialState: boolean[] = [];
    let varCount = 0;

    const widthDiagnostics: PortWidthDiagnostic[] = [];
    const describePortKey = (pKey: string) => {
      const nodeId = [...nodes].map(n => n.id).filter(id => pKey.startsWith(id + '_')).sort((a, b) => b.length - a.length)[0] ?? pKey;
      return { blockId: nodeId, portId: pKey.slice(nodeId.length + 1) };
    };
    rootToPorts.forEach((ports, root) => {
      let domain: PhysicalDomain = 'physical';
      for (const pKey of ports) {
        const d = nodePortDomains.get(pKey);
        if (d && d !== 'physical') {
          domain = d;
          break;
        }
      }
      if (domain === 'physical' && ports.length > 0) {
        domain = nodePortDomains.get(ports[0]) || 'physical';
      }
      
      const isFrameDomain = (domain === 'frame' || domain === 'multibodyframe');
      // WP-09c: every port of a net must have exactly the same width / composite-ness (width-agnostic sinks excepted)
      let netWidth = 1; let netComposite = false;
      {
        const checked = ports.filter(k => !widthAgnosticKeys.has(k));
        const first = checked[0];
        if (first !== undefined) {
          const firstShape = nodePortShapes.get(first);
          netWidth = firstShape?.width ?? 1; netComposite = !!firstShape?.composite;
          for (const k of checked.slice(1)) {
            const sh = nodePortShapes.get(k);
            const w = sh?.width ?? 1; const c = !!sh?.composite;
            if (w !== netWidth || c !== netComposite) {
              const a = describePortKey(first); const b = describePortKey(k);
              const composite = c !== netComposite;
              // the signal INPUT defines the expected width (same convention as the connection rules)
              const kIsInput = nodePortDirections.get(k) === 'in';
              const expectedWidth = kIsInput ? w : netWidth; const actualWidth = kIsInput ? netWidth : w;
              widthDiagnostics.push({
                code: composite ? 'composite-mismatch' : 'width-mismatch',
                blockId: b.blockId, portId: b.portId, expectedWidth, actualWidth, otherBlockId: a.blockId, otherPortId: a.portId,
                reason: composite
                  ? `Port "${b.blockId}.${b.portId}" (${c ? 'composite three-phase' : 'scalar'}) shares a net with "${a.blockId}.${a.portId}" (${netComposite ? 'composite three-phase' : 'scalar'}); a composite port connects only to a composite port.`
                  : `Port "${b.blockId}.${b.portId}" has width ${w} but shares a net with "${a.blockId}.${a.portId}" of width ${netWidth}; widths must match exactly (expected width ${netWidth}, got width ${w}).`,
              });
              break;
            }
          }
        }
      }
      const stride = isFrameDomain ? 6 : netWidth;
      const acrossIndex = varCount;
      varCount += stride;
      nodeAcrossIndex.set(root, acrossIndex);
      
      physicalNodes.push({
        id: root,
        domain,
        acrossVarIndex: acrossIndex,
        stride,
        composite: netComposite,
      });
      
      if (isFrameDomain) {
        const frameSuffixes = ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz'];
        frameSuffixes.forEach(s => {
          variableNames.push(`Across_${root}_${s}_(${domain})`);
          isDifferentialState.push(false);
        });
      } else if (stride > 1) {
        for (let k = 0; k < stride; k++) {
          variableNames.push(`Across_${root}_${channelVariableSuffix(k, netComposite)}_(${domain})`);
          isDifferentialState.push(false);
        }
      } else {
        variableNames.push(`Across_${root}_(${domain})`);
        isDifferentialState.push(false);
      }
    });

    if (widthDiagnostics.length) throw new PortWidthMismatchError(widthDiagnostics);

    // Map each port key to its across variable index
    const portToVarIndex = new Map<string, number>();
    nodes.forEach(node => {
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        const root = uf.find(key);
        portToVarIndex.set(key, nodeAcrossIndex.get(root)!);
      });
    });

    // 4. Allocate branch variables and state variables for components
    const componentsList: ComponentEquation[] = [];
    const componentBranchVarIndices = new Map<string, number[]>(); // blockId -> indices in x[]
    const componentStateVarIndices = new Map<string, number[]>(); // blockId -> indices in x[]

    // Define branch configurations for common components
    const getComponentSpec = (blockId: string, blockType: string, ports: string[]) => {
      const branches: { name: string; ports: { id: string; sign: number; coord?: number }[] }[] = [];
      const states: string[] = [];

      if (['subsystem', 'Subsystem', 'inport', 'Inport', 'outport', 'Outport'].includes(blockType)) {
        return { branches, states };
      }

      // A Physical (signal) port gets a signal branch iff it is an OUTPUT. The library `direction` is the single source
      // of truth (F-026/F-036); there is no name vocabulary any more. Only a DYNAMIC instance port that carries no
      // metadata at all (an edge-discovered handle, a custom port without `direction`) falls back to its position:
      // a port drawn on the right/bottom edge is an output, anything else is an input.
      const isPhysicalOutputPort = (portId: string) => {
        const key = `${blockId}_${portId}`;
        const direction = nodePortDirections.get(key);
        if (direction) return direction === 'out';
        if (libraryPortKeys.has(key)) return false; // library port without a direction (transparent): never driven
        const pos = nodePortPositions.get(key);
        return pos === 'right' || pos === 'bottom';
      };

      // 1. Allocate standard physical branch currents/forces/heat flows
    switch (blockType) {
      case 'resistor':
      case 'variable_resistor':
      case 'infinite_resistance':
      case 'capacitor':
      case 'inductor':
      case 'memristor':
      case 'switch':
      case 'dc_voltage':
      case 'ac_voltage':
      case 'dc_current':
      case 'controlled_voltage':
        branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
        if (blockType === 'memristor') states.push('w');
        break;
      case 'phase_splitter':
        // Composite three-phase port abc <-> scalar phase ports a, b, c (WP-09c). One through variable per phase: the
        // current from the composite phase k INTO the block (sign -1 at abc, coord k) and out through the scalar port.
        // The equation row of each is V_scalar,k - V_abc,k = 0 (an ideal wire), so KCL holds per phase.
        branches.push({ name: 'current_a', ports: [{ id: 'abc', sign: -1, coord: 0 }, { id: 'a', sign: 1 }] });
        branches.push({ name: 'current_b', ports: [{ id: 'abc', sign: -1, coord: 1 }, { id: 'b', sign: 1 }] });
        branches.push({ name: 'current_c', ports: [{ id: 'abc', sign: -1, coord: 2 }, { id: 'c', sign: 1 }] });
        break;
      case 'three_phase_source':
        branches.push({ name: 'phase_a', ports: [{ id: 'a', sign: -1 }] });
        branches.push({ name: 'phase_b', ports: [{ id: 'b', sign: -1 }] });
        branches.push({ name: 'phase_c', ports: [{ id: 'c', sign: -1 }] });
        break;
      case 'v_sensor':
      case 'i_sensor':
        branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
        break;
      case 'gas_cap':
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: 1 }] });
        break;
      case 'gas_chamber':
        branches.push({ name: 'mass_flow_a', ports: [{ id: 'a', sign: -1 }] });
        branches.push({ name: 'mass_flow_b', ports: [{ id: 'b', sign: -1 }] });
        states.push('pressure');
        break;
      case 'gas_reservoir':
      case 'gas_fixed_res':
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }] });
        break;
      case 'gas_resistance':
      case 'gas_restriction':
      case 'gas_pipe':
      case 'gas_flow_source':
      case 'gas_pressure_source':
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
        break;
      case 'gas_pressure_sensor':
        branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: 1 }] });
        break;
      case 'gas_flow_sensor':
        branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
        break;
      case 'gas_rotational_conv':
        // Through variable = torque INTO the block at r (delivered torque = D*(Pa - Ph) = -branch).
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'h', sign: 1 }] });
        branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
        break;
      case 'gas_translational_conv':
        // Through variable = force INTO the block at r (delivered force = A*(Pa - Ph) = -branch).
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'h', sign: 1 }] });
        branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
        break;
      case 'reluctance':
      case 'fundamental_reluctance':
      case 'variable_reluctance':
      case 'permanent_magnet':
      case 'mag_mmf_source':
      case 'mag_flux_source':
      case 'mag_controlled_mmf':
        branches.push({ name: 'flux', ports: [{ id: 'n', sign: -1 }, { id: 's', sign: 1 }] });
        break;
      case 'em_converter':
        branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
        branches.push({ name: 'flux', ports: [{ id: 'mag_n', sign: -1 }, { id: 'mag_s', sign: 1 }] });
        break;
      case 'reluctance_force':
        branches.push({ name: 'flux', ports: [{ id: 'n', sign: -1 }, { id: 's', sign: 1 }] });
        branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
        break;
      case 'mag_flux_sensor':
        branches.push({ name: 'flux', ports: [{ id: 'n', sign: -1 }, { id: 's', sign: 1 }] });
        branches.push({ name: 'signal_phi', ports: [{ id: 'phi', sign: 1 }] });
        break;
      case 'mag_mmf_sensor':
        branches.push({ name: 'flux', ports: [{ id: 'n', sign: -1 }, { id: 's', sign: 1 }] });
        branches.push({ name: 'signal_f', ports: [{ id: 'f', sign: 1 }] });
        break;
      case 'luenberger_observer':
        states.push('xhat');
        break;
      case 'im_flux_observer':
        states.push('psi_d', 'psi_q');
        break;
      case 'pmsm_foc':
        states.push('integ_d', 'integ_q');
        break;
      case 'rigid_transform':
        branches.push({ name: 'fx', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'fy', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'fz', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'tx', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'ty', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'tz', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        break;
      case 'transform_sensor':
        branches.push({ name: 'signal_x', ports: [{ id: 'x', sign: 1 }] });
        branches.push({ name: 'signal_y', ports: [{ id: 'y', sign: 1 }] });
        branches.push({ name: 'signal_z', ports: [{ id: 'z', sign: 1 }] });
        branches.push({ name: 'signal_rx', ports: [{ id: 'rx', sign: 1 }] });
        branches.push({ name: 'signal_ry', ports: [{ id: 'ry', sign: 1 }] });
        branches.push({ name: 'signal_rz', ports: [{ id: 'rz', sign: 1 }] });
        break;
      case 'dist_constraint':
        // lambda is an internal scalar multiplier (no Kirchhoff port); fx/fy/fz
        // carry the reaction force into the Frame equilibrium at B and F.
        branches.push({ name: 'lambda', ports: [] });
        branches.push({ name: 'fx', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'fy', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'fz', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        if (ports.includes('d')) branches.push({ name: 'signal_d', ports: [{ id: 'd', sign: 1 }] });
        if (ports.includes('f_reac')) branches.push({ name: 'signal_f', ports: [{ id: 'f_reac', sign: 1 }] });
        break;
      case 'angle_constraint':
        // lambda is an internal scalar multiplier (no Kirchhoff port); tx/ty/tz
        // carry the reaction torque into the Frame equilibrium at B and F.
        branches.push({ name: 'lambda', ports: [] });
        branches.push({ name: 'tx', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'ty', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        branches.push({ name: 'tz', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        if (ports.includes('ang')) branches.push({ name: 'signal_ang', ports: [{ id: 'ang', sign: 1 }] });
        if (ports.includes('t_reac')) branches.push({ name: 'signal_t', ports: [{ id: 't_reac', sign: 1 }] });
        break;
      case 'weld_joint':
      case 'spherical_joint':
      case 'universal_joint':
      case 'revolute_joint':
      case 'prismatic_joint':
        // One shared joint core (vlabJointCore.ts): wrench components with explicit Frame coordinates, multipliers
        // and one signal branch per wired measurement port.
        branches.push(...jointBranchSpecs(jointKindOf(blockType)!, ports));
        break;
      case 'common_gear':
        branches.push({ name: 'torque1', ports: [{ id: 'b', sign: -1 }] });
        branches.push({ name: 'torque2', ports: [{ id: 'f', sign: -1 }] });
        break;
      case 'rack_pinion':
        branches.push({ name: 'torque', ports: [{ id: 'b', sign: -1 }] });
        branches.push({ name: 'force', ports: [{ id: 'f', sign: -1 }] });
        break;
      case 'grav_field':
      case 'spring_damper_force':
      case 'external_force': {
        // Six wrench components applied on F (+1); the reaction acts on B (-1)
        // only when B is wired, otherwise it is absorbed by the world.
        const wrenchPorts = connectedPortKeys.has(`${blockId}_b`)
          ? [{ id: 'f', sign: 1 }, { id: 'b', sign: -1 }]
          : [{ id: 'f', sign: 1 }];
        for (const name of FRAME_WRENCH_BRANCHES) {
          branches.push({ name, ports: wrenchPorts });
        }
        for (const out of FRAME_FORCE_MEASUREMENTS[blockType]) {
          if (ports.includes(out)) branches.push({ name: `signal_${out}`, ports: [{ id: out, sign: 1 }] });
        }
        break;
      }
      case 'heat_flow_sensor':
      case 'heat_sensor':
        branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
        branches.push({ name: 'signal_h', ports: [{ id: 'h', sign: 1 }] });
        break;
        case 'transformer':
        case 'gyrator':
          branches.push({ name: 'current1', ports: [{ id: 'p1', sign: -1 }, { id: 'n1', sign: 1 }] });
          branches.push({ name: 'current2', ports: [{ id: 'p2', sign: -1 }, { id: 'n2', sign: 1 }] });
          break;
        case 'cccs':
        case 'ccvs':
          branches.push({ name: 'current_out', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_ctrl', ports: [{ id: 'cp', sign: -1 }, { id: 'cn', sign: 1 }] });
          break;
        case 'opamp':
          branches.push({ name: 'current_out', ports: [{ id: 'out', sign: 1 }] });
          break;
        case 'rotational_electromechanical_converter':
        case 'translational_electromechanical_converter':
          branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'mechanical_through', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          break;
        case 'thermal_resistor':
          branches.push({ name: 'current', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          branches.push({ name: 'heat_flow', ports: [{ id: 'h', sign: 1 }] });
          break;
        case 'dc_motor':
          branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: 1 }] });
          states.push('theta', 'omega');
          break;
        case 'ac_motor':
          branches.push({ name: 'ia', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'ib', ports: [{ id: 'b', sign: -1 }] });
          branches.push({ name: 'ic', ports: [{ id: 'c', sign: -1 }] });
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: 1 }] });
          states.push('theta', 'omega', 'psi_r_alpha', 'psi_r_beta');
          break;
        case 'bldc_motor':
        case 'pmsm':
          branches.push({ name: 'ia', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'ib', ports: [{ id: 'b', sign: -1 }] });
          branches.push({ name: 'ic', ports: [{ id: 'c', sign: -1 }] });
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: 1 }] });
          states.push('theta', 'omega');
          break;
        case 'ma_chamber':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'heat_flow', ports: [{ id: 'h', sign: 1 }] });
          states.push('temp');
          break;
        case 'inertia':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          break;
        case 'rot_spring':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          states.push('theta');
          break;
        case 'rot_motion_sensor':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          branches.push({ name: 'signal_w', ports: [{ id: 'w', sign: 1 }] });
          branches.push({ name: 'signal_a', ports: [{ id: 'a', sign: 1 }] });
          states.push('theta');
          break;
        case 'wheel_axle':
          branches.push({ name: 'torque', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'force', ports: [{ id: 'p', sign: -1 }] });
          break;
        case 'rot_damper':
        case 'rot_friction':
        case 'torque_sensor':
        case 'torque_source':
        case 'ang_vel_source':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          break;
        case 'rot_hard_stop':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          states.push('theta');
          break;
        case 'gear_box':
          if (ports.includes('r1') || ports.includes('c1')) {
            branches.push({ name: 'torque1', ports: [{ id: 'r1', sign: -1 }, { id: 'c1', sign: 1 }] });
            branches.push({ name: 'torque2', ports: [{ id: 'r2', sign: -1 }, { id: 'c2', sign: 1 }] });
          } else {
            branches.push({ name: 'torque1', ports: [{ id: 's1', sign: -1 }] });
            branches.push({ name: 'torque2', ports: [{ id: 's2', sign: -1 }] });
          }
          break;
        case 'mass':
          branches.push({ name: 'force', ports: [{ id: 'p', sign: -1 }] });
          break;
        case 'lever':
          // three forces INTO the block: arm A, arm B and the pivot reaction at C
          branches.push({ name: 'force_a', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'force_b', ports: [{ id: 'b', sign: -1 }] });
          branches.push({ name: 'force_c', ports: [{ id: 'c', sign: -1 }] });
          break;
        case 'rot_multibody_interface':
          branches.push(...interfaceBranchSpecs('rotation', ports));
          break;
        case 'trans_multibody_interface':
          branches.push(...interfaceBranchSpecs('translation', ports));
          break;
        case 'trans_spring':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          states.push('x');
          break;
        case 'belt_properties':
          // Property link block: no DAE branches or states. Its density/youngs
          // are injected into belt consumer params (see injectBeltMaterial) and
          // broadcast via ctx.parameters by its equation factory.
          break;
        case 'belt_end':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'e', sign: 1 }] });
          if (ports.includes('f')) {
            branches.push({ name: 'signal_f', ports: [{ id: 'f', sign: 1 }] });
          }
          states.push('x');
          break;
        case 'belt_spool':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          branches.push({ name: 'force', ports: [{ id: 'a', sign: -1 }] });
          if (ports.includes('t')) {
            branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          }
          break;
        case 'pulley':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          branches.push({ name: 'force_a', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'force_b', ports: [{ id: 'b', sign: -1 }] });
          if (ports.includes('t')) {
            branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          }
          break;
        case 'trans_motion_sensor':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          branches.push({ name: 'signal_v', ports: [{ id: 'v', sign: 1 }] });
          branches.push({ name: 'signal_p', ports: [{ id: 'p', sign: 1 }] });
          states.push('x');
          break;
        case 'force_sensor':
          branches.push({ name: 'force', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'trans_damper':
        case 'trans_friction':
        case 'trans_hard_stop':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          break;
        case 'force_source':
          branches.push({ name: 'force', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'conductive_heat':
        case 'convective_heat':
        case 'radiative_heat':
          branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'temp_sensor':
          branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          break;

        case 'thermal_mass':
        case 'temp_src':
          branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }] });
          break;
        case 'heat_src':
        case 'ctrl_heat_src':
        case 'ctrl_temp_src':
          if (ports.includes('b')) {
            branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          } else {
            branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }] });
          }
          break;
        case 'magnetron':
        case 'upper_heater':
        case 'steam_generator':
          branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'heat_flow', ports: [{ id: 'h', sign: 1 }] });
          break;
        case 'microwave_inverter':
          branches.push({ name: 'current_in', ports: [{ id: 'ac_in', sign: -1 }] });
          branches.push({ name: 'current_out', ports: [{ id: 'hv_out', sign: 1 }] });
          break;
        case 'microwave_cavity':
          branches.push({ name: 'heat_flow1', ports: [{ id: 'h1', sign: -1 }] });
          branches.push({ name: 'heat_flow2', ports: [{ id: 'h2', sign: -1 }] });
          branches.push({ name: 'heat_flow3', ports: [{ id: 'h3', sign: -1 }] });
          branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          states.push('temp');
          break;
        case 'washing_basket':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          break;
        case 'washing_fluid':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          break;
        case 'pwm_3ph_2level':
          branches.push({ name: 'dc_link', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_a', ports: [{ id: 'a', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_b', ports: [{ id: 'b', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_c', ports: [{ id: 'c', sign: -1 }, { id: 'n', sign: 1 }] });
          break;
        case 'pwm_3ph_3level':
        case 'pwm_vienna':
          for (const name of ['ga', 'gb', 'gc', 'ma', 'mb', 'mc']) {
            branches.push({ name, ports: [{ id: name, sign: 1 }] });
          }
          break;
        case 'thyristor_6pulse':
          for (const name of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) {
            branches.push({ name, ports: [{ id: name, sign: 1 }] });
          }
          break;
        case 'thyristor_12pulse':
          // Keep the equation ordering and the visible port ordering in sync:
          // six independent delta gate branches followed by six wye branches.
          for (let gate = 1; gate <= 6; gate++) {
            const name = `delta_g${gate}`;
            branches.push({ name, ports: [{ id: name, sign: 1 }] });
          }
          for (let gate = 1; gate <= 6; gate++) {
            const name = `wye_g${gate}`;
            branches.push({ name, ports: [{ id: name, sign: 1 }] });
          }
          break;
        case 'ma_pipe':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'ma_flow_source':
        case 'ma_pressure_source':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'ma_moisture_source':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }] });
          break;
        case 'ps_integrator':
        case 'ps_integrator_gen':
        case 'ps_moving_avg':
        case 'ps_smith_predictor':
        case 'ps_transfer_fcn':
        case 'ps_lpf':
        case 'ps_washout':
        case 'ps_sample_hold':
        case 'ps_sr_flipflop':
          states.push('y');
          break;
        case 'ps_simulink_conv':
        case 'simulink_ps_conv':
          // Simulink boundary converters: `in` (Any) is read, `out` (Any) is driven. Wildcard ports carry no direction metadata.
          branches.push({ name: 'signal_out', ports: [{ id: 'out', sign: 1 }] });
          break;
        case 'busbar':
          // Ideal bus bar (V_1 = V_2 = ... = V_n, sum I_k = 0): one current into the bar per terminal. Without these
          // unknowns the equalities had no row and the terminals were not tied together at all (F-025).
          ports.forEach(portId => branches.push({ name: `current_${portId}`, ports: [{ id: portId, sign: -1 }] }));
          break;
        case 'ps_pi_ctrl':
          states.push('integral');
          break;
        case 'ps_pid_ctrl':
          states.push('integral');
          states.push('filter');
          break;
        case 'ps_second_order_filter':
          states.push('y');
          states.push('dy');
          break;
        case 'lms_adaptive_filter':
          states.push('w1', 'w2', 'x_prev');
          break;
        case 'neural_neuron_learning':
          states.push('w1', 'w2', 'bias');
          break;
        case 'rl_q_learning_controller':
          // RL uses a persistent state cache, no continuous DAE states
          break;
        case 'ac_motor_pid_control':
          states.push('ias', 'ibs', 'psiar', 'psibr', 'omega', 'theta', 'i_state', 'd_state');
          break;
        case 'diode':
          branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          break;
        case 'nmos':
          branches.push({ name: 'drain_current', ports: [{ id: 'd', sign: -1 }, { id: 's', sign: 1 }] });
          break;
        case 'igbt':
          branches.push({ name: 'collector_current', ports: [{ id: 'c', sign: -1 }, { id: 'e', sign: 1 }] });
          break;
        case 'fluid_resistance':
        case 'orifice':
        case 'check_valve':
        case 'relief_valve':
        case 'steam_generator_fluid':
        case 'steam_nozzle':
        case 'flow_sensor':
          branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          break;
        case 'fluid_capacitance':
        case 'pressure_source':
        case 'ctrl_pressure_source':
        case 'mass_flow_source':
        case 'pressure_sensor':
          branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }] });
          break;
        case 'fluid_ref':
          // Pressure reference (like `ground`): its node is pinned to the reference pressure and absorbs any flow,
          // so the block has no through variable and no residual (F-025).
          break;
        case 'fluid_inertance':
          // dP = Li * d(mdot)/dt reads the mass-flow branch derivative; there is no separate `mdot` state.
          branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          break;
        case 'steam_accumulator':
          branches.push({ name: 'flow_in', ports: [{ id: 'pin', sign: -1 }] });
          branches.push({ name: 'flow_out', ports: [{ id: 'pout', sign: 1 }] });
          break;
        case 'pump_il':
        case 'pipe_il':
        case 'restriction_il':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        default: {
          // Generic two-terminal fallback for conserving ports only: the signal ports of a controller/demux that happen
          // to be called a/b/p/n/r/c are not terminals (they get their own signal branches below).
          const terminal = (id: string) => ports.includes(id) && nodePortDomains.get(`${blockId}_${id}`) !== 'physical';
          if (terminal('p') && terminal('n')) {
            branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          } else if (terminal('r') && terminal('c')) {
            branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          } else if (terminal('a') && terminal('b')) {
            branches.push({ name: 'through', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          }
          break;
        }
      }

      // 2. Automatically allocate physical signal output branches
      ports.forEach(portId => {
        const key = `${blockId}_${portId}`;
        const domain = nodePortDomains.get(key);
        if (domain === 'physical' && isPhysicalOutputPort(portId)) {
          // Check if this branch is already added
          if (!branches.some(b => b.name === `signal_${portId}` || b.name.startsWith(`signal_${portId}[`) || b.ports.some(port => port.id === portId))) {
            const width = nodePortShapes.get(key)?.width ?? 1;
            if (width > 1) {
              // WP-09c: a width-N signal output drives N channels: one signal branch (and residual row) per channel
              for (let k = 0; k < width; k++) branches.push({ name: vectorBranchName(portId, k), ports: [{ id: portId, sign: 1, coord: k }] });
            } else {
              branches.push({ name: `signal_${portId}`, ports: [{ id: portId, sign: 1 }] });
            }
          }
        }
      });

      return { branches, states };
    };

    // Belt/Cable material sources: collect belt_properties blocks so their
    // density/youngs can be injected into belt consumer params below.
    // A consumer wired (via the P property-link port) to a properties block
    // inherits that block; otherwise the single model-wide block applies.
    const BELT_CONSUMER_TYPES = new Set(['belt_end', 'belt_spool', 'pulley']);
    const unwrapNodeParam = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    const toFiniteNumber = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const beltMaterialSources: { nodeId: string; root: string; density: number; youngs: number }[] = [];
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      if (type !== 'belt_properties') return;
      const p = (node.data as any)?.params || {};
      const density = numericParam(p, 'density', 1.1, node.id);
      const youngs = numericParam(p, 'youngs', 1e9, node.id);
      beltMaterialSources.push({
        nodeId: node.id,
        root: uf.find(`${node.id}_p`),
        density: Math.max(0, density),
        youngs: youngs > 0 ? youngs : 1e9,
      });
    });
    const warnedAmbiguousBeltProps = new Set<string>();
    const injectBeltMaterial = (nodeId: string, blockType: string, ports: string[], params: Record<string, any>, nodeData?: any) => {
      if (!BELT_CONSUMER_TYPES.has(blockType) || beltMaterialSources.length === 0) return;
      // Strictly check the dedicated property port 'p'
      const pRoot = uf.find(`${nodeId}_p`);
      const matchedSource = beltMaterialSources.find(s => s.root === pRoot);
      if (!matchedSource) {
        // Unwired to any belt_properties: strictly do NOT inject fallback
        return;
      }
      params.belt_density = matchedSource.density;
      params.belt_youngs = matchedSource.youngs;
      params.belt_properties_source = matchedSource.nodeId;
      if (nodeData && typeof nodeData === 'object' && nodeData.params) {
        nodeData.params.belt_density = matchedSource.density;
        nodeData.params.belt_youngs = matchedSource.youngs;
        nodeData.params.belt_properties_source = matchedSource.nodeId;
      }
    };

    const exemptVariableIndices: number[] = [];
    const structuralProbes: { blockId: string; blockType: string; run: () => StructuralDiagnostic | null }[] = [];
    const nodeTypeOf = (n: Node) => (n.data as any)?.type || n.type || (n.data as any)?.blockId || '';
    nodes.forEach(node => {
      const type = nodeTypeOf(node);
      // Explicitly unsupported blocks are rejected before the solve by vlabTopologyValidation (missing-spec diagnostic);
      // their placeholder equations are known not to match their allocation, so they are not structurally probed.
      const isUnsupported = type in UNSUPPORTED_BLOCKS;
      const ports = nodePorts.get(node.id) || [];
      const spec = getComponentSpec(node.id, type, ports);
      const branchIndices: number[] = [];
      const stateIndices: number[] = [];
      
      spec.branches.forEach(b => {
        const idx = varCount++;
        branchIndices.push(idx);
        variableNames.push(`${node.id}_branch_${b.name}`);
        isDifferentialState.push(false);
      });
      
      spec.states.forEach(s => {
        const idx = varCount++;
        stateIndices.push(idx);
        variableNames.push(`${node.id}_state_${s}`);
        isDifferentialState.push(true);
      });
      
      componentBranchVarIndices.set(node.id, branchIndices);
      componentStateVarIndices.set(node.id, stateIndices);
      
      // Build port to node map
      const portNodeMap = new Map<string, string>();
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        const root = uf.find(key);
        portNodeMap.set(portId, root);
      });
      
      // Get parameters from ReactFlow node
      const params: Record<string, any> = {};
      if (node.data && (node.data as any).params) {
        Object.entries((node.data as any).params).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object' && 'value' in v) {
            params[k] = v.value;
          } else {
            params[k] = v;
          }
        });
      }

      // Inject belt/cable material (density, youngs) from belt_properties blocks
      // Joint parameters (axes, damping, weld pose) are validated here, before any solve (INVALID_JOINT_PARAMETER).
      const jointKind = jointKindOf(type);
      if (jointKind) jointConfiguration(jointKind, params, node.id);
      injectBeltMaterial(node.id, type, ports, params, node.data);

      // Look up equation factory
      const equationFactory = blockEquations[type];
      const equationCount = spec.branches.length + spec.states.length;
      
      // Evaluate the block's equation factory. `guard` (structural probe only) records branch/state reads outside the
      // allocation instead of letting them silently read `undefined`.
      const evaluate = (x: number[], dx: number[], ctx: EquationContext, guard?: Set<string>): number[] => {
        if (!equationFactory) {
          // If no equation is defined for this block, return 0 residuals for its variables
          return new Array(equationCount).fill(0);
        }
        
        // Map block ports to global across variable values and their derivatives
        const acrossVals = ports.map(portId => {
          const key = `${node.id}_${portId}`;
          const domain = nodePortDomains.get(key);
          const width = nodePortShapes.get(key)?.width ?? 1;
          if (width > 1) {
            // vector port: an N-element array. An unwired signal vector reads N zeros (topology validation reports required ones).
            if (domain === 'physical' && !connectedPortKeys.has(key)) return new Array(width).fill(0);
            const base = portToVarIndex.get(key)!;
            return Array.from({ length: width }, (_, k) => x[base + k]);
          }
          if (domain === 'physical' && !connectedPortKeys.has(key)) {
            if (type === 'nmos' && portId === 'g' && !warnedUnconnectedNmosGates.has(node.id)) {
              warnedUnconnectedNmosGates.add(node.id);
              console.warn(`NMOS gate input is unconnected on block "${node.id}"; using 0 V.`);
            }
            return 0;
          }
          if ((domain === 'frame' || domain === 'multibodyframe') && !connectedPortKeys.has(key)) {
            return [0, 0, 0, 0, 0, 0];
          }
          const varIdx = portToVarIndex.get(key)!;
          if (domain === 'frame' || domain === 'multibodyframe') {
            return [
              x[varIdx + 0] ?? 0,
              x[varIdx + 1] ?? 0,
              x[varIdx + 2] ?? 0,
              x[varIdx + 3] ?? 0,
              x[varIdx + 4] ?? 0,
              x[varIdx + 5] ?? 0
            ];
          }
          return x[varIdx];
        });
        
        const acrossDervs = ports.map(portId => {
          const key = `${node.id}_${portId}`;
          const domain = nodePortDomains.get(key);
          const width = nodePortShapes.get(key)?.width ?? 1;
          if (width > 1) {
            if (domain === 'physical' && !connectedPortKeys.has(key)) return new Array(width).fill(0);
            const base = portToVarIndex.get(key)!;
            return Array.from({ length: width }, (_, k) => dx[base + k]);
          }
          if (domain === 'physical' && !connectedPortKeys.has(key)) {
            return 0;
          }
          const isFramePort = domain === 'frame' || domain === 'multibodyframe';
          if (isFramePort && !connectedPortKeys.has(key)) {
            return [0, 0, 0, 0, 0, 0];
          }
          const varIdx = portToVarIndex.get(key)!;
          if (isFramePort) {
            return [0, 1, 2, 3, 4, 5].map(k => dx[varIdx + k] ?? 0);
          }
          return dx[varIdx];
        });

        // Map component branch variables and their derivatives
        const watch = (arr: number[], label: string): number[] => !guard ? arr : new Proxy(arr, {
          get(target, prop, receiver) {
            if (typeof prop === 'string' && /^\d+$/.test(prop) && Number(prop) >= target.length) guard.add(`${label}[${prop}]`);
            return Reflect.get(target, prop, receiver);
          },
        });
        const branchVals = watch(branchIndices.map(idx => x[idx]), 'branch');
        const branchDervs = watch(branchIndices.map(idx => dx[idx]), 'dBranch');

        // Map component internal states and their derivatives
        const stateVals = watch(stateIndices.map(idx => x[idx]), 'state');
        const stateDervs = watch(stateIndices.map(idx => dx[idx]), 'dState');

        // A non-finite input (a diverged Newton iterate) must never reach the equation: the many `across[i] || 0`
        // optional-port reads inside the factories would silently turn NaN into 0 (F-045). Missing (undefined) ports
        // are not flagged: those are the optional-port reads, which are legitimately 0.
        if (!guard) {
          const bad: ResidualDiagnostic[] = [];
          const scan = (label: string, value: unknown) => {
            const parts = Array.isArray(value) ? value : [value];
            parts.forEach((v, k) => {
              if (typeof v === 'number' && !Number.isFinite(v)) {
                const name = Array.isArray(value) ? `${label}[${k}]` : label;
                bad.push({
                  kind: 'non-finite-input', blockId: node.id, blockType: type, rowIndex: -1, variable: name, value: v,
                  reason: `Block "${node.id}" (${type}): input ${name} is ${v}`,
                });
              }
            });
          };
          ports.forEach((portId, i) => { scan(`across.${portId}`, acrossVals[i]); scan(`dAcross.${portId}`, acrossDervs[i]); });
          branchVals.forEach((v, i) => scan(`branch.${variableNames[branchIndices[i]] ?? i}`, v));
          branchDervs.forEach((v, i) => scan(`dBranch.${variableNames[branchIndices[i]] ?? i}`, v));
          stateVals.forEach((v, i) => scan(`state.${variableNames[stateIndices[i]] ?? i}`, v));
          stateDervs.forEach((v, i) => scan(`dState.${variableNames[stateIndices[i]] ?? i}`, v));
          if (bad.length) throw new NonFiniteResidualError(bad);
        }

        try {
          return equationFactory({
            across: acrossVals,
            dAcross: acrossDervs,
            branch: branchVals,
            dBranch: branchDervs,
            state: stateVals,
            dState: stateDervs,
            ctx,
            params,
            ports,
            nodeId: node.id,
            connectedPorts: ports.filter(p => connectedPortKeys.has(`${node.id}_${p}`))
          });
        } catch (e) {
          // A malformed user parameter is never turned into a default or a silent zero residual.
          if (e instanceof VLabParamError) {
            throw new VLabParamError(e.diagnostics.map(d => d.blockId ? d : {
              ...d, blockId: node.id, reason: d.reason.replace(/^Parameter "([^"]+)"/, `Parameter "$1" of block "${node.id}" (${type})`),
            }));
          }
          if (guard) throw e; // structural probe: the caller skips the check when the equation cannot be evaluated
          if (e instanceof NonFiniteResidualError || e instanceof BlockEquationError || e instanceof DAEStructureError) throw e;
          // An equation that throws is never replaced by a zero residual (F-045): it is a non-recoverable diagnostic.
          const message = e instanceof Error ? e.message : String(e);
          throw new BlockEquationError([{
            kind: 'equation-threw', blockId: node.id, blockType: type, rowIndex: -1, error: message,
            reason: `Block "${node.id}" (${type}): equation threw: ${message}`,
          }], e);
        }
      };

      // The equation must return exactly one row per allocated unknown. A mismatch is a structural error, never padded
      // with 0 or truncated (F-025); it is checked once at assembly (below) and on every evaluation.
      const residual = (x: number[], dx: number[], ctx: EquationContext): number[] => {
        const rows = evaluate(x, dx, ctx);
        if (rows.length !== equationCount) {
          throw new DAEStructureError([rowCountDiagnostic(node.id, type, equationCount, rows.length, [])]);
        }
        return rows;
      };

      if (typeof equationFactory === 'function' && !isUnsupported) {
        structuralProbes.push({
          blockId: node.id,
          blockType: type,
          run: () => {
            const reads = new Set<string>();
            const zeros = new Array(varCount).fill(0);
            const probeCtx: EquationContext = { dt: 1e-3, time: 0, parameters: {}, prevStates: zeros.slice(), states: zeros.slice(), stateDerivatives: zeros.slice(), order: 1 };
            let rows: number[];
            try {
              rows = withStatefulEquationCaches(() => evaluate(zeros.slice(), zeros.slice(), probeCtx, reads));
            } catch (e) {
              // cannot be evaluated at the origin (e.g. a malformed parameter that the pre-solve validation reports);
              // the per-evaluation row check still applies
              return null;
            }
            if (!Array.isArray(rows)) return rowCountDiagnostic(node.id, type, equationCount, 0, [...reads]);
            if (rows.length !== equationCount || reads.size > 0) return rowCountDiagnostic(node.id, type, equationCount, rows.length, [...reads]);
            return null;
          },
        });
      }

      componentsList.push({
        blockId: node.id,
        blockType: type,
        portNodeMap,
        params,
        stateIndices,
        residual,
        equationCount
      });
    });

    // Structural check of every block equation against its allocation (rows == unknowns, no unallocated reads).
    {
      const diagnostics: StructuralDiagnostic[] = [];
      for (const probe of structuralProbes) {
        const d = probe.run();
        if (d) diagnostics.push(d);
      }
      if (diagnostics.length) throw new DAEStructureError(diagnostics);
    }

    // 5. Setup Kirchhoff Conservation nodes
    // Identify which variables represent through-variables and which nodes they affect
    const kirchhoffNodes: { nodeId: string; throughIndices: number[]; signs: number[]; channel?: number }[] = [];
    const referenceNodeIds = new Set<string>();
    const referenceNodeTargets = new Map<string, number>();

    // Scan for reference components (e.g. world_frame, ground, rot_ref, hydraulic_reference_il, etc.)
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      if (['world_frame', 'ground', 'rot_ref', 'trans_ref', 'thermal_ref', 'mag_ref', 'gas_ref', 'ma_ref', 'delta_ref', 'fluid_ref', 'hydraulic_reference_il', 'reservoir_il'].includes(type)) {
        const ports = nodePorts.get(node.id) || [];
        let targetVal = 0;
        if (type === 'gas_ref') {
          targetVal = 101325;
        } else if (type === 'hydraulic_reference_il' || type === 'reservoir_il') {
          const params = (node.data as any)?.params || {};
          const pRef = numericParam(params, 'referencePressure', 101325, node.id);
          const pRefUnit = (params?.referencePressure?.unit || 'Pa');
          const pType = stringParam(params, 'pressureType', 'absolute');
          const pAtm = numericParam(params, 'atmosphericPressure', 101325, node.id);
          const pAtmUnit = (params?.atmosphericPressure?.unit || 'Pa');
          const elevCorr = String(params?.elevationCorrection?.value ?? params?.elevationCorrection) === 'true';
          const zRef = numericParam(params, 'referenceElevation', 0, node.id);
          const zRefUnit = (params?.referenceElevation?.unit || 'm');
          const zA = numericParam(params, 'portElevation', 0, node.id);
          const zAUnit = (params?.portElevation?.unit || 'm');
          const pAbs = computeAbsoluteReferencePressure(pRef, pRefUnit as any, pType as any, pAtm, pAtmUnit as any);
          targetVal = computeEffectivePortPressure(pAbs, elevCorr, zRef, zRefUnit as any, zA, zAUnit as any);
        } else if (type === 'fluid_ref') {
          targetVal = 101325;
        } else if (type === 'thermal_ref') {
          targetVal = 293.15;
        }
        ports.forEach(portId => {
          const key = `${node.id}_${portId}`;
          const root = uf.find(key);
          referenceNodeIds.add(root);
          referenceNodeTargets.set(root, targetVal);
        });
      }
    });

    // Automatically treat unconnected case/reference ports (e.g. c, b, n, ref, gnd) as reference nodes (0 potential/speed)
    // Also treat any unconnected fluid/gas/thermal ports as reference nodes (open to atmosphere/ambient)
    nodes.forEach(node => {
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        const root = uf.find(key);
        const portsInRoot = rootToPorts.get(root) || [];
        if (portsInRoot.length === 1) {
          const domain = nodePortDomains.get(key);
          const isFrameDomain = (domain === 'frame' || domain === 'multibodyframe');
          // Signal ports are never references by name: an unconnected output called `b` / `c` is driven by its own branch.
          // A vector / composite net is never a scalar reference (WP-09c).
          // The phase ports a, b, c of a Phase Splitter are phase nodes, not case / reference terminals: an open phase stays open.
          if (!nodePortShapes.has(key) && ((['c', 'b', 'n', 'ref', 'gnd'].includes(portId.toLowerCase()) && !isFrameDomain && domain !== 'physical' && nodeTypeOf(nodeById.get(node.id)!) !== 'phase_splitter') ||
              domain === 'fluid' || domain === 'gas' || domain === 'thermal')) {
            referenceNodeIds.add(root);
          }
        }
      });
    });

    // Multibody constraint topology diagnostics: reject redundant/over-constrained
    // dist_constraint / angle_constraint wiring deterministically, before any
    // solver iteration runs (and before it can ever reach a degenerate residual
    // evaluation on a structurally invalid model).
    {
      const prescribedFrameRoots = new Set<string>();
      physicalNodes.forEach(pn => {
        if ((pn.domain === 'frame' || pn.domain === 'multibodyframe') && referenceNodeIds.has(pn.id)) {
          prescribedFrameRoots.add(pn.id);
        }
      });

      // A rigid_transform fully determines its follower (F) pose given its
      // base (B) pose, so prescription propagates through transform chains.
      const rigidTransformLinks: { bRoot: string; fRoot: string }[] = [];
      nodes.forEach(node => {
        const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
        if (type !== 'rigid_transform') return;
        const ports = nodePorts.get(node.id) || [];
        if (!ports.includes('b') || !ports.includes('f')) return;
        rigidTransformLinks.push({ bRoot: uf.find(`${node.id}_b`), fRoot: uf.find(`${node.id}_f`) });
      });
      let grew = true;
      while (grew) {
        grew = false;
        for (const link of rigidTransformLinks) {
          // Rigid transforms are invertible: anchoring F prescribes B too.
          if (prescribedFrameRoots.has(link.fRoot) && !prescribedFrameRoots.has(link.bRoot)) {
            prescribedFrameRoots.add(link.bRoot);
            grew = true;
          }
          if (prescribedFrameRoots.has(link.bRoot) && !prescribedFrameRoots.has(link.fRoot)) {
            prescribedFrameRoots.add(link.fRoot);
            grew = true;
          }
        }
      }

      const constraintTopologies: ConstraintTopology[] = [];
      nodes.forEach(node => {
        const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
        if (type !== 'dist_constraint' && type !== 'angle_constraint' && !jointKindOf(type)) return;
        const ports = nodePorts.get(node.id) || [];
        if (!ports.includes('b') || !ports.includes('f')) return;
        const baseRoot = uf.find(`${node.id}_b`);
        const followerRoot = uf.find(`${node.id}_f`);
        constraintTopologies.push({ blockId: node.id, type, baseRoot, followerRoot });

        // Both ports wired to the literal same frame stay coincident at
        // EVERY possible position, so a nonzero target is impossible to
        // satisfy no matter how the solver iterates — a genuine, purely
        // structural fact, safe (and necessary) to catch once here rather
        // than relying on a runtime direction that can never become defined.
        if (baseRoot === followerRoot && (type === 'dist_constraint' || type === 'angle_constraint')) {
          // Both ports on the same frame: the constraint is redundant and its direction undefined at every position, so the
          // multiplier and reaction components are indeterminate by design (structural check exemption, WP-19a owns it).
          variableNames.forEach((name, idx) => {
            if (new RegExp(`^${node.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_branch_(lambda|fx|fy|fz|tx|ty|tz)$`).test(name)) exemptVariableIndices.push(idx);
          });
          const p = (node.data as any)?.params || {};
          const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
          const targetKey = type === 'dist_constraint' ? 'dist' : 'angle';
          const rawTarget = p[targetKey];
          const target = rawTarget !== undefined ? Number(unwrap(rawTarget)) : 0;
          if (target !== 0) {
            const noun = type === 'dist_constraint' ? 'distance direction' : 'relative rotation axis';
            const unit = type === 'dist_constraint' ? '' : ' deg';
            throw new MultibodyConstraintDiagnosticError(
              'UNDEFINED_DIRECTION',
              node.id,
              ['b', 'f'],
              `Block "${node.id}" (${type}): B and F are wired to the same frame, so its ${noun} ` +
              `is undefined at every position, while a nonzero target (${target}${unit}) is set. ` +
              `Wire B and F to distinct frames, or set ${targetKey} = 0.`
            );
          }
        }
      });

      validateMultibodyConstraintTopology(constraintTopologies, prescribedFrameRoots);
    }

    // Structural freedom of Frame poses (WP-19a). The structural-rank check no longer exempts every frame pose
    // coordinate; it exempts only what is legitimately undetermined and held at its previous value by the solver:
    //  - every frame of a free body: a connected set of frames that contains no World / reference frame;
    //  - the coordinates a joint leaves free: the rotation of a revolute / universal / spherical joint, the slide of a
    //    prismatic joint (both sides: the freedom may sit on either frame).
    // Any other frame pose that no equation determines is reported (free-unknown / structural-rank-deficient).
    {
      const isFrameDomain = (d: string | undefined) => d === 'frame' || d === 'multibodyframe';
      const link = new UnionFind();
      physicalNodes.forEach(pn => { if (isFrameDomain(pn.domain)) link.find(pn.id); });
      nodes.forEach(node => {
        const framePorts = (nodePorts.get(node.id) || []).filter(p => {
          const key = `${node.id}_${p}`;
          return isFrameDomain(nodePortDomains.get(key)) && connectedPortKeys.has(key);
        });
        for (let i = 1; i < framePorts.length; i++) {
          link.union(uf.find(`${node.id}_${framePorts[0]}`), uf.find(`${node.id}_${framePorts[i]}`));
        }
      });
      const anchoredBodies = new Set<string>();
      physicalNodes.forEach(pn => { if (isFrameDomain(pn.domain) && referenceNodeIds.has(pn.id)) anchoredBodies.add(link.find(pn.id)); });
      physicalNodes.forEach(pn => {
        if (!isFrameDomain(pn.domain) || anchoredBodies.has(link.find(pn.id))) return;
        for (let k = 0; k < 6; k++) exemptVariableIndices.push(pn.acrossVarIndex + k);
      });
      const FREE_COORDINATES: Record<string, number[]> = {
        revolute: [3, 4, 5], universal: [3, 4, 5], spherical: [3, 4, 5], prismatic: [0, 1, 2],
        // a distance constraint leaves both orientations free, an angle constraint both positions
        dist_constraint: [3, 4, 5], angle_constraint: [0, 1, 2],
      };
      nodes.forEach(node => {
        const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
        const coordinates = FREE_COORDINATES[jointKindOf(type) ? jointKindOf(type)! : type];
        if (!coordinates) return;
        for (const port of ['b', 'f']) {
          const key = `${node.id}_${port}`;
          if (!nodePortDomains.has(key)) continue;
          const pn = physicalNodes.find(item => item.id === uf.find(key));
          if (pn && isFrameDomain(pn.domain)) coordinates.forEach(k => exemptVariableIndices.push(pn.acrossVarIndex + k));
        }
      });
    }

    // KCL excluded node set remains empty so that physical signal nodes are mapped to branch variables for propagation
    const kclExcludedNodeIds = new Set<string>();

    // For each physical node that is NOT a reference node and NOT KCL-excluded,
    // construct its Kirchhoff through-variable sign maps
    const kirchhoffFrameNodes = new Map<string, { throughIndices: number[]; signs: number[] }[]>();

    physicalNodes.forEach(pn => {
      if (referenceNodeIds.has(pn.id) || kclExcludedNodeIds.has(pn.id)) {
        return;
      }
      const isFrame = (pn.domain === 'frame' || pn.domain === 'multibodyframe');
      const frameCoords: { throughIndices: number[]; signs: number[] }[] = Array.from({ length: 6 }, () => ({
        throughIndices: [],
        signs: []
      }));
      
      const throughIndices: number[] = [];
      const signs: number[] = [];
      // vector net (width-N signal, composite three-phase): one through list per channel (WP-09c)
      const isVector = !isFrame && pn.stride > 1;
      const vectorChannels: { throughIndices: number[]; signs: number[] }[] = Array.from({ length: isVector ? pn.stride : 0 }, () => ({
        throughIndices: [],
        signs: []
      }));
      
      // Look for any component whose ports connect to this physical node
      nodes.forEach(node => {
        const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
        const ports = nodePorts.get(node.id) || [];
        const spec = getComponentSpec(node.id, type, ports);
        const branchIndices = componentBranchVarIndices.get(node.id) || [];
        
        spec.branches.forEach((b, bIdx) => {
          const globalBranchVarIndex = branchIndices[bIdx];
          b.ports.forEach(bp => {
            const portKey = `${node.id}_${bp.id}`;
            const root = uf.find(portKey);
            if (root === pn.id) {
              if (isFrame) {
                // Joints name the Frame coordinate of every through variable explicitly (bp.coord); the legacy blocks
                // (force elements, rigid_transform, constraints) are still routed by their wrench branch name.
                let coord = bp.coord ?? -1;
                const bName = b.name.toLowerCase();
                if (coord >= 0) { /* explicit */ }
                else if (bName === 'fx' || bName === 'force') coord = 0;
                else if (bName === 'fy') coord = 1;
                else if (bName === 'fz') coord = 2;
                else if (bName === 'tx' || bName === 'torque') coord = 3;
                else if (bName === 'ty') coord = 4;
                else if (bName === 'tz') coord = 5;
                // Pure force elements have identically zero torque equations;
                // their placeholder torque branches must not create empty KCL
                // rows in place of the free rotational pose of a spherical joint.
                const isZeroTorque = coord >= 3 && (
                  type === 'grav_field' || type === 'spring_damper_force'
                  || (type === 'external_force' && !['in_tx', 'in_ty', 'in_tz'].some(id => connectedPortKeys.has(node.id + '_' + id)))
                );
                if (coord >= 0 && !isZeroTorque) {
                  frameCoords[coord].throughIndices.push(globalBranchVarIndex);
                  frameCoords[coord].signs.push(bp.sign);
                }
              } else if (isVector) {
                // a branch attached to a vector net names the channel it drives / loads (coord); one without is not part of it
                const ch = bp.coord ?? -1;
                if (ch >= 0 && ch < pn.stride) {
                  vectorChannels[ch].throughIndices.push(globalBranchVarIndex);
                  vectorChannels[ch].signs.push(bp.sign);
                }
              } else {
                throughIndices.push(globalBranchVarIndex);
                signs.push(bp.sign);
              }
            }
          });
        });
      });
      
      if (isFrame) {
        kirchhoffFrameNodes.set(pn.id, frameCoords);
      } else if (isVector) {
        vectorChannels.forEach((vc, ch) => kirchhoffNodes.push({ nodeId: pn.id, throughIndices: vc.throughIndices, signs: vc.signs, channel: ch }));
      } else {
        kirchhoffNodes.push({
          nodeId: pn.id,
          throughIndices,
          signs
        });
      }
    });

    // Frame nodes with no kinematic definition (only loads/sensors attached) would
    // leave the pose undetermined and the applied wrench unbalanced; hold them at origin.
    const floatingFrameNodeIds = new Set<string>();
    physicalNodes.forEach(pn => {
      if (pn.domain !== 'frame' && pn.domain !== 'multibodyframe') return;
      if (referenceNodeIds.has(pn.id)) return;
      const portsOnNode = rootToPorts.get(pn.id) || [];
      const allNonKinematic = portsOnNode.every(pKey => {
        const nodeId = pKey.slice(0, pKey.lastIndexOf('_'));
        const n = nodes.find(item => item.id === nodeId);
        const t = (n?.data as any)?.type || n?.type || (n?.data as any)?.blockId || '';
        return FRAME_NON_KINEMATIC_TYPES.has(t);
      });
      if (allNonKinematic) floatingFrameNodeIds.add(pn.id);
    });

    // 6. Build Scope mapping — map each scope port to its connected source variable index (or unconnected fallback)
    const scopeOutputs = new Map<string, number[]>();
    const scopeChannels = new Map<string, ScopeChannelBinding[]>();
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      if (type === 'scope') {
        const declaredPorts: any[] = (node.data as any)?.ports || [];
        const numSignalsParam = (node.data as any)?.params?.numSignals?.value;
        const maxConnectedPortIdx = edges.reduce((max, e) => {
          if (e.target === node.id || e.source === node.id) {
            const h = (e.target === node.id ? e.targetHandle : e.sourceHandle) || '';
            const m = h.match(/in[_-]?(\d+)/i);
            if (m) return Math.max(max, parseInt(m[1], 10));
          }
          return max;
        }, 1);
        const numSignals = Math.max(1, Math.min(8, Number(numSignalsParam) || Math.max(declaredPorts.length, maxConnectedPortIdx)));
        
        // Exact canonical ports strictly bounded by numSignals
        const canonicalPorts = Array.from({ length: numSignals }, (_, i) => `in${i + 1}`);

        const bindings: ScopeChannelBinding[] = [];
        const indices = canonicalPorts.map(pId => {
          const channelNo = canonicalPorts.indexOf(pId) + 1;
          const edge = edges.find(e => {
            if (e.target === node.id) {
              const tPort = resolveHandlePort(e.target, e.targetHandle || 'in1');
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              return norm(tPort) === norm(pId) || (norm(pId) === 'in1' && (norm(tPort) === 'p' || norm(tPort) === 'in' || !tPort));
            } else if (e.source === node.id) {
              const sPort = resolveHandlePort(e.source, e.sourceHandle || 'in1');
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              return norm(sPort) === norm(pId) || (norm(pId) === 'in1' && (norm(sPort) === 'p' || norm(sPort) === 'in' || !sPort));
            }
            return false;
          });
          
          if (edge) {
            const isTarget = edge.target === node.id;
            const otherNodeId = isTarget ? edge.source : edge.target;
            const otherHandle = isTarget ? edge.sourceHandle : edge.targetHandle;

            const srcPort = resolveHandlePort(otherNodeId, otherHandle || 'y');
            const srcKey = `${otherNodeId}_${srcPort}`;
            
            // Prefer the source component's explicit signal branch when it exists (e.g. sensors, PS blocks).
            const sourceBranchIndices = componentBranchVarIndices.get(otherNodeId) || [];
            const sourcePorts = nodePorts.get(otherNodeId) || [];
            const sourceNode = nodes.find(n => n.id === otherNodeId);
            const sourceType = (sourceNode?.data as any)?.type || sourceNode?.type || (sourceNode?.data as any)?.blockId || '';
            const sourceSpec = getComponentSpec(otherNodeId, sourceType, sourcePorts);
            
            // A Frame is a 6-vector, never a scalar channel: reject it before anything is bound (vlabScopeRead.ts).
            const srcDomain = nodePortDomains.get(srcKey);
            if (srcDomain === 'frame' || srcDomain === 'multibodyframe') {
              throw new ScopeReadError({
                code: 'frame', scopeId: node.id, channel: canonicalPorts.indexOf(pId) + 1, variable: srcKey,
                reason: `scope "${node.id}" channel ${canonicalPorts.indexOf(pId) + 1} is wired to Frame port "${otherNodeId}.${srcPort}"; a Frame is not a scalar signal (use a Transform Sensor for its components)`,
              });
            }

            // WP-09c: a width-N signal binds ALL its components (one trace per channel), never only channel 0.
            const srcShape = nodePortShapes.get(srcKey);
            if (srcShape && srcShape.width > 1 && !srcShape.composite) {
              const comps: number[] = [];
              for (let k = 0; k < srcShape.width; k++) {
                const bi = sourceSpec.branches.findIndex(b => b.name === vectorBranchName(srcPort, k));
                const base = portToVarIndex.get(srcKey);
                comps.push(bi !== -1 && sourceBranchIndices[bi] !== undefined ? sourceBranchIndices[bi] : (base !== undefined ? base + k : -1));
              }
              bindings.push({ channel: channelNo, width: srcShape.width, indices: comps, channelNames: srcShape.channelNames, sourcePortId: srcPort });
              return -1; // vector channel: see scopeChannels (never reduced to its first component)
            }

            // The channel reads the signal branch of EXACTLY the wired port: the branch named for that port id, or the
            // single-port signal branch attached to it. No block-type heuristics, no "first branch that looks right".
            const matchingBranchIdx = sourceSpec.branches.findIndex(b =>
              b.name === `signal_${srcPort}` || b.name === srcPort
              || (b.name.startsWith('signal_') && b.ports.length === 1 && b.ports[0].id === srcPort)
            );
            if (matchingBranchIdx !== -1 && sourceBranchIndices[matchingBranchIdx] !== undefined) {
              bindings.push({ channel: channelNo, width: 1, indices: [sourceBranchIndices[matchingBranchIdx]], channelNames: [], sourcePortId: srcPort });
              return sourceBranchIndices[matchingBranchIdx];
            }
            
            // wired to a conserving net: the net's across variable (the editor and the pre-solve check reject this for scopes)
            const netIdx = portToVarIndex.get(srcKey) ?? -1;
            bindings.push({ channel: channelNo, width: 1, indices: [netIdx], channelNames: [], sourcePortId: srcPort });
            return netIdx;
          } else {
            // unwired channel: no variable at all. It used to bind to the scope's own pinned-to-0 port node and read a silent 0.
            bindings.push({ channel: channelNo, width: 1, indices: [-1], channelNames: [] });
            return -1;
          }
        });
        scopeOutputs.set(node.id, indices);
        scopeChannels.set(node.id, bindings);
      }
    });

    // Empty rotational equilibrium rows on a spherical-joint frame are a
    // choice of free pose, not an orientation constraint to the world origin.
    const sphericalFrameRoots = new Set<string>();
    for (const component of componentsList) {
      if (component.blockType === 'spherical_joint') {
        for (const port of ['b', 'f']) {
          const root = component.portNodeMap.get(port);
          if (root) sphericalFrameRoots.add(root);
        }
      }
    }

    // 7. Assemble global residuals function
    const residuals = (x: number[], arg2: number[] | EquationContext, arg3?: EquationContext): number[] => {
      let dx: number[];
      let ctx: EquationContext;
      
      if (arg3 === undefined) {
        // Called with (x, ctx)
        ctx = arg2 as EquationContext;
        // A non-finite previous state propagates (and is reported by the block that reads it), never reads as 0.
        dx = x.map((val, idx) => (val - ctx.prevStates[idx]) / ctx.dt);
      } else {
        // Called with (x, dx, ctx)
        dx = arg2 as number[];
        ctx = arg3 as EquationContext;
      }
      
      // Update ctx states
      ctx.states = x;
      ctx.stateDerivatives = dx;

      const res = new Array(varCount).fill(0);
      
      // Equation pointer tracks where we put component residual equations
      // We will place component equations at the branch and state indices allocated for them
      nodes.forEach(node => {
        const comp = componentsList.find(c => c.blockId === node.id);
        if (!comp) return;
        
        const branchIndices = componentBranchVarIndices.get(node.id) || [];
        const stateIndices = componentStateVarIndices.get(node.id) || [];
        
        const compRes = comp.residual(x, dx, ctx);
        
        // Row i of the block equation is the equation of its i-th allocated unknown (branches, then states). A
        // non-finite row is a diagnostic naming block / row / unknown, never 0 (F-045).
        const bad: ResidualDiagnostic[] = [];
        let resPtr = 0;
        [...branchIndices, ...stateIndices].forEach(idx => {
          const value = compRes[resPtr];
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            bad.push({
              kind: 'non-finite-residual', blockId: comp.blockId, blockType: comp.blockType, rowIndex: resPtr,
              variable: variableNames[idx], value: value as number,
              reason: `Block "${comp.blockId}" (${comp.blockType}): residual row ${resPtr} (${variableNames[idx]}) is ${value}`,
            });
          } else {
            res[idx] = value;
          }
          resPtr++;
        });
        if (bad.length) throw new NonFiniteResidualError(bad);
      });
      
      // Set equations for physical nodes (Kirchhoff Conservation or Reference Constraints)
      physicalNodes.forEach(pn => {
        const acrossVarIdx = pn.acrossVarIndex;
        
        if (referenceNodeIds.has(pn.id)) {
          // Reference node potential/pressure/temperature/frame
          if (pn.domain === 'frame' || pn.domain === 'multibodyframe') {
            const target = referenceNodeTargets.get(pn.id) || 0;
            for (let k = 0; k < 6; k++) {
              res[acrossVarIdx + k] = x[acrossVarIdx + k] - target;
            }
          } else if (referenceNodeTargets.has(pn.id)) {
            res[acrossVarIdx] = x[acrossVarIdx] - referenceNodeTargets.get(pn.id)!;
          } else if (pn.domain === 'fluid' || pn.domain === 'gas' || pn.domain === 'isothermal_liquid') {
            res[acrossVarIdx] = x[acrossVarIdx] - 101325;
          } else if (pn.domain === 'thermal') {
            res[acrossVarIdx] = x[acrossVarIdx] - 293.15;
          } else {
            res[acrossVarIdx] = x[acrossVarIdx];
          }
        } else if (pn.stride > 1 && pn.domain !== 'frame' && pn.domain !== 'multibodyframe') {
          // Vector net (WP-09c): one row per channel. A width-N signal net equals the sum of the signal branches that drive
          // its channel k; a composite three-phase electrical node obeys KCL per phase (sum of through variables = 0).
          for (let k = 0; k < pn.stride; k++) {
            const kn = kirchhoffNodes.find(n => n.nodeId === pn.id && n.channel === k);
            const sum = kn ? kn.throughIndices.reduce((acc, ti, i) => acc + kn.signs[i] * x[ti], 0) : 0;
            const driven = !!kn && kn.throughIndices.length > 0;
            res[acrossVarIdx + k] = pn.domain === 'physical'
              ? (driven ? x[acrossVarIdx + k] - sum : x[acrossVarIdx + k])
              : (driven ? sum : x[acrossVarIdx + k]); // an isolated phase node is held at the reference potential
          }
        } else if (pn.domain === 'physical') {
          // Physical signal node:
          // It is equal to the sum of its connected signal output branch variables.
          const kn = kirchhoffNodes.find(k => k.nodeId === pn.id);
          if (kn && kn.throughIndices.length > 0) {
            let sum = 0;
            for (let i = 0; i < kn.throughIndices.length; i++) {
              sum += kn.signs[i] * x[kn.throughIndices[i]];
            }
            res[acrossVarIdx] = x[acrossVarIdx] - sum;
          } else {
            res[acrossVarIdx] = x[acrossVarIdx];
          }
        } else if (pn.domain === 'frame' || pn.domain === 'multibodyframe') {
          const frameCoords = kirchhoffFrameNodes.get(pn.id);
          if (floatingFrameNodeIds.has(pn.id)) {
            for (let k = 0; k < 6; k++) {
              res[acrossVarIdx + k] = x[acrossVarIdx + k];
            }
            return;
          }
          for (let k = 0; k < 6; k++) {
            const fc = frameCoords ? frameCoords[k] : undefined;
            if (fc && fc.throughIndices.length > 0) {
              let sum = 0;
              for (let i = 0; i < fc.throughIndices.length; i++) {
                sum += fc.signs[i] * x[fc.throughIndices[i]];
              }
              res[acrossVarIdx + k] = sum;
            } else {
              res[acrossVarIdx + k] = x[acrossVarIdx + k]
                - (k >= 3 && sphericalFrameRoots.has(pn.id) ? (ctx.prevStates[acrossVarIdx + k] ?? 0) : 0);
            }
          }
        } else {
          // Kirchhoff Conservation node: Sum of through variables = 0
          const kn = kirchhoffNodes.find(k => k.nodeId === pn.id);
          if (kn && kn.throughIndices.length > 0) {
            let sum = 0;
            for (let i = 0; i < kn.throughIndices.length; i++) {
              sum += kn.signs[i] * x[kn.throughIndices[i]];
            }
            // For open mechanical source-to-scope measurement nodes with no other physical loads, velocity is 0
            const portsOnNode = rootToPorts.get(pn.id) || [];
            const isPureSourceToScope = portsOnNode.length > 0 && portsOnNode.every(pKey => {
              const lastIdx = pKey.lastIndexOf('_');
              const nodeId = lastIdx !== -1 ? pKey.slice(0, lastIdx) : pKey;
              const n = nodes.find(item => item.id === nodeId);
              const t = (n?.data as any)?.type || n?.type || '';
              return ['force_source', 'torque_source', 'constant', 'ps_constant', 'ps_step', 'ps_sine', 'scope', 'vlab_probe', 'conn_label'].includes(t);
            });

            if (isPureSourceToScope && (pn.domain === 'translational' || pn.domain === 'rotational') && kn.throughIndices.length === 1) {
              res[acrossVarIdx] = x[acrossVarIdx];
            } else {
              res[acrossVarIdx] = sum;
            }
          } else {
            // Unconnected isolated node has reference across potential
            if (pn.domain === 'thermal') {
              res[acrossVarIdx] = x[acrossVarIdx] - 293.15;
            } else if (pn.domain === 'fluid' || pn.domain === 'gas' || pn.domain === 'isothermal_liquid') {
              res[acrossVarIdx] = x[acrossVarIdx] - 101325;
            } else {
              res[acrossVarIdx] = x[acrossVarIdx];
            }
          }
        }
      });

      // Node rows (Kirchhoff / reference constraints) can also be non-finite when an unknown diverged.
      const badRows: ResidualDiagnostic[] = [];
      for (let i = 0; i < res.length; i++) {
        if (!Number.isFinite(res[i])) {
          const owner = variableOwners[i] ?? { blockId: '', blockType: '' };
          badRows.push({
            kind: 'non-finite-residual', blockId: owner.blockId, blockType: owner.blockType, rowIndex: i,
            variable: variableNames[i], value: res[i],
            reason: `Row ${i} (${variableNames[i]}${owner.blockId ? `, owner "${owner.blockId}" (${owner.blockType})` : ''}) is ${res[i]}`,
          });
        }
      }
      if (badRows.length) throw new NonFiniteResidualError(badRows);

      return res;
    };

    // Owners of every unknown / residual row (row i is the equation of unknown i): the block that owns a branch or
    // state, the first block wired to a net for an across variable. Used by the structural-rank diagnostics.
    const keyOwner = new Map<string, { blockId: string; blockType: string }>();
    nodes.forEach(node => {
      const owner = { blockId: node.id, blockType: nodeTypeOf(node) };
      (nodePorts.get(node.id) || []).forEach(portId => keyOwner.set(`${node.id}_${portId}`, owner));
    });
    const variableOwners: { blockId: string; blockType: string }[] = new Array(varCount).fill({ blockId: '', blockType: '' });
    physicalNodes.forEach(pn => {
      const owner = keyOwner.get(pn.id) ?? { blockId: '', blockType: '' };
      const stride = pn.stride;
      for (let k = 0; k < stride; k++) variableOwners[pn.acrossVarIndex + k] = owner;
    });
    componentsList.forEach(c => {
      const owner = { blockId: c.blockId, blockType: c.blockType };
      (componentBranchVarIndices.get(c.blockId) || []).forEach(i => { variableOwners[i] = owner; });
      (componentStateVarIndices.get(c.blockId) || []).forEach(i => { variableOwners[i] = owner; });
    });

    return {
      structure: { variableOwners, rowOwners: variableOwners, exemptVariables: exemptVariableIndices },
      systemSize: varCount,
      variableNames,
      isDifferentialState,
      isPurelyAlgebraic: !isDifferentialState.some(Boolean) && componentsList.every(c =>
        !DERIVATIVE_DEPENDENT_BLOCK_TYPES.has(c.blockType)
        && (c.equationCount === 0 || Boolean(blockEquations[c.blockType]))),
      residuals,
      kirchhoffNodes,
      components: componentsList,
      scopeOutputs,
      scopeChannels
    };
  }

  /** Public so pre-simulation topology validation checks the same flattened graph the assembler solves. */
  flattenSubsystems(nodes: Node[], edges: Edge[]): { flatNodes: Node[]; flatEdges: Edge[] } {
    let currentNodes = [...nodes];
    let currentEdges = [...edges];
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      const { nodes: nextNodes, edges: nextEdges, flattenedAny } = this.flattenOneLevel(currentNodes, currentEdges);
      if (!flattenedAny) {
        break;
      }
      currentNodes = nextNodes;
      currentEdges = nextEdges;
      iterations++;
    }

    return { flatNodes: currentNodes, flatEdges: currentEdges };
  }

  private flattenOneLevel(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[]; flattenedAny: boolean } {
    const subsystem = nodes.find(n => {
      const type = n.data?.type || n.type || '';
      return type === 'subsystem' || type === 'Subsystem';
    });
    if (!subsystem) {
      return { nodes, edges, flattenedAny: false };
    }

    const subId = subsystem.id;
    const childInports = nodes.filter(n => n.data?.parentId === subId && (n.data?.type === 'inport' || n.data?.type === 'Inport'));
    const childOutports = nodes.filter(n => n.data?.parentId === subId && (n.data?.type === 'outport' || n.data?.type === 'Outport'));

    const childInportIds = new Set(childInports.map(n => n.id));
    const childOutportIds = new Set(childOutports.map(n => n.id));

    let newEdges: Edge[] = [];

    const externalInEdges = edges.filter(e => e.target === subId);
    const externalOutEdges = edges.filter(e => e.source === subId);
    const internalInEdges = edges.filter(e => childInportIds.has(e.source));
    const internalOutEdges = edges.filter(e => childOutportIds.has(e.target));
    const remainingEdges = edges.filter(e => 
      e.target !== subId && 
      e.source !== subId && 
      !childInportIds.has(e.source) && 
      !childOutportIds.has(e.target)
    );

    externalInEdges.forEach(extEdge => {
      let inportId = extEdge.targetHandle || '';
      if (inportId.startsWith(subId + '-')) {
        inportId = inportId.slice(subId.length + 1);
      }
      
      const matchingInternals = internalInEdges.filter(intEdge => intEdge.source === inportId);
      matchingInternals.forEach(intEdge => {
        newEdges.push({
          id: `flat_in_${extEdge.id}_${intEdge.id}`,
          source: extEdge.source,
          sourceHandle: extEdge.sourceHandle,
          target: intEdge.target,
          targetHandle: intEdge.targetHandle,
          style: extEdge.style
        });
      });
    });

    externalOutEdges.forEach(extEdge => {
      let outportId = extEdge.sourceHandle || '';
      if (outportId.startsWith(subId + '-')) {
        outportId = outportId.slice(subId.length + 1);
      }

      const matchingInternals = internalOutEdges.filter(intEdge => intEdge.target === outportId);
      matchingInternals.forEach(intEdge => {
        newEdges.push({
          id: `flat_out_${extEdge.id}_${intEdge.id}`,
          source: intEdge.source,
          sourceHandle: intEdge.sourceHandle,
          target: extEdge.target,
          targetHandle: extEdge.targetHandle,
          style: extEdge.style
        });
      });
    });

    newEdges.push(...remainingEdges);

    const nextNodes = nodes.filter(n => n.id !== subId && !childInportIds.has(n.id) && !childOutportIds.has(n.id));

    return {
      nodes: nextNodes,
      edges: newEdges,
      flattenedAny: true
    };
  }
}
