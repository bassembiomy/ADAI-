import { Node, Edge } from 'reactflow';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { EquationContext, AssembledSystem, PhysicalDomain, ComponentEquation } from './types';
import { blockEquations } from './vlabEquations';

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
  assemble(nodes: Node[], edges: Edge[]): AssembledSystem {
    const uf = new UnionFind();
    
    // 1. Identify all ports on all nodes
    const nodePorts = new Map<string, string[]>();
    const nodePortDomains = new Map<string, PhysicalDomain>();
    const nodePortPositions = new Map<string, string>();
    
    // Helper to get ports of a block type
    const getBlockPortsFromLib = (blockType: string) => {
      for (const domain of VLAB_LIBRARY) {
        const block = domain.blocks.find(b => b.id === blockType);
        if (block) {
          return block.ports.map(p => ({
            id: p.id,
            domain: (p.domain || domain.type).toLowerCase() as PhysicalDomain,
            pos: p.pos
          }));
        }
      }
      return [];
    };

    // Find all ports from library, custom definitions, or connected edges
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const portsSet = new Set<string>();
      
      // Get ports from library
      const libPorts = getBlockPortsFromLib(type);
      libPorts.forEach(p => {
        portsSet.add(p.id);
        nodePortDomains.set(`${node.id}_${p.id}`, p.domain);
        nodePortPositions.set(`${node.id}_${p.id}`, p.pos);
      });
      
      // Get ports from node data
      if (node.data && Array.isArray((node.data as any).ports)) {
        (node.data as any).ports.forEach((p: any) => {
          if (p && p.id) {
            portsSet.add(p.id);
            if (p.domain) {
              nodePortDomains.set(`${node.id}_${p.id}`, p.domain.toLowerCase() as PhysicalDomain);
            }
            if (p.pos) {
              nodePortPositions.set(`${node.id}_${p.id}`, p.pos);
            }
          }
        });
      }
      
      // Discover ports from edges
      edges.forEach(edge => {
        if (edge.source === node.id && edge.sourceHandle) {
          let pId = edge.sourceHandle.replace(/_[st]$/, '');
          if (pId.startsWith(node.id + '-')) {
            pId = pId.slice(node.id.length + 1);
          }
          portsSet.add(pId);
        }
        if (edge.target === node.id && edge.targetHandle) {
          let pId = edge.targetHandle.replace(/_[st]$/, '');
          if (pId.startsWith(node.id + '-')) {
            pId = pId.slice(node.id.length + 1);
          }
          portsSet.add(pId);
        }
      });
      
      nodePorts.set(node.id, Array.from(portsSet));
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
          if (['r', 'c', 'w', 't', 'theta'].includes(id)) domain = 'rotational';
          else if (['h'].includes(id)) domain = 'thermal';
          else if (id.startsWith('in') || id.startsWith('out') || ['s', 'y', 'u', 'ctrl'].includes(id)) domain = 'physical';
          else {
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
    edges.forEach(edge => {
      let sourcePort = (edge.sourceHandle || 'p').replace(/_[st]$/, '');
      if (sourcePort.startsWith(edge.source + '-')) {
        sourcePort = sourcePort.slice(edge.source.length + 1);
      }
      let targetPort = (edge.targetHandle || 'p').replace(/_[st]$/, '');
      if (targetPort.startsWith(edge.target + '-')) {
        targetPort = targetPort.slice(edge.target.length + 1);
      }
      
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
    const physicalNodes: { id: string; domain: PhysicalDomain; acrossVarIndex: number }[] = [];
    const nodeAcrossIndex = new Map<string, number>(); // rootId -> index in x[]
    const variableNames: string[] = [];
    const isDifferentialState: boolean[] = [];
    let varCount = 0;

    rootToPorts.forEach((ports, root) => {
      const domain = nodePortDomains.get(ports[0]) || 'electrical';
      const acrossIndex = varCount++;
      nodeAcrossIndex.set(root, acrossIndex);
      
      physicalNodes.push({
        id: root,
        domain,
        acrossVarIndex: acrossIndex
      });
      
      variableNames.push(`Across_${root}_(${domain})`);
      isDifferentialState.push(false);
    });

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
      const branches: { name: string; ports: { id: string; sign: number }[] }[] = [];
      const states: string[] = [];

      const isPhysicalOutputPort = (portId: string) => {
        if (blockType === 'lms_adaptive_filter' && ['x', 'd', 'lr'].includes(portId)) return false;
        if (blockType === 'neural_neuron_learning' && ['x1', 'x2', 'target', 'lr'].includes(portId)) return false;
        if (blockType === 'rl_q_learning_controller' && ['error', 'reward', 'reset'].includes(portId)) return false;
        if (blockType === 'ac_motor_pid_control' && ['w_ref', 'tl'].includes(portId)) return false;

        const key = `${blockId}_${portId}`;
        const pos = nodePortPositions.get(key);
        if (pos === 'right' || pos === 'bottom') {
          return true;
        }
        const id = portId.toLowerCase();
        return ['y', 'out', 'v', 'i', 'w', 't', 'a', 'theta', 'd', 'q', 'alpha', 'beta', 'pos', 'neg', 'zero', 'abc', 'y1', 'y2', 'y3', 'amps'].includes(id) || 
               id.startsWith('out') || id.startsWith('signal');
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
      case 'gas_rotational_conv':
        branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'h', sign: 1 }] });
        branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
        break;
      case 'gas_translational_conv':
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
      case 'mag_mmf_sensor':
        branches.push({ name: 'flux', ports: [{ id: 'n', sign: -1 }, { id: 's', sign: 1 }] });
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
      case 'dist_constraint':
      case 'weld_joint':
      case 'rigid_transform':
        branches.push({ name: 'force', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        break;
      case 'spherical_joint':
      case 'universal_joint':
      case 'revolute_joint':
        branches.push({ name: 'torque', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        break;
      case 'prismatic_joint':
        branches.push({ name: 'force', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
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
        branches.push({ name: 'force', ports: [{ id: 'b', sign: -1 }, { id: 'f', sign: 1 }] });
        break;
      case 'external_force':
        branches.push({ name: 'force', ports: [{ id: 'f', sign: -1 }, { id: 'b', sign: 1 }] });
        break;
      case 'heat_flow_sensor':
        branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
        break;
        case 'transformer':
        case 'gyrator':
          branches.push({ name: 'current1', ports: [{ id: 'p1', sign: -1 }, { id: 'n1', sign: 1 }] });
          branches.push({ name: 'current2', ports: [{ id: 'p2', sign: -1 }, { id: 'n2', sign: 1 }] });
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
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          states.push('theta');
          break;
        case 'ac_motor':
        case 'bldc_motor':
        case 'pmsm':
          branches.push({ name: 'ia', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'ib', ports: [{ id: 'b', sign: -1 }] });
          branches.push({ name: 'ic', ports: [{ id: 'c', sign: -1 }] });
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          states.push('theta');
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
          states.push('theta');
          break;
        case 'rot_damper':
        case 'rot_friction':
        case 'rot_hard_stop':
        case 'torque_sensor':
        case 'torque_source':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          break;
        case 'gear_box':
          branches.push({ name: 'torque1', ports: [{ id: 'r1', sign: -1 }, { id: 'c1', sign: 1 }] });
          branches.push({ name: 'torque2', ports: [{ id: 'r2', sign: -1 }, { id: 'c2', sign: 1 }] });
          break;
        case 'mass':
          branches.push({ name: 'force', ports: [{ id: 'p', sign: -1 }] });
          break;
        case 'trans_spring':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          states.push('x');
          break;
        case 'trans_motion_sensor':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
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
        case 'heat_sensor':
          branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'thermal_mass':
        case 'heat_src':
        case 'temp_src':
        case 'ctrl_heat_src':
        case 'ctrl_temp_src':
          branches.push({ name: 'heat_flow', ports: [{ id: 'a', sign: -1 }] });
          break;
        case 'magnetron':
        case 'upper_heater':
        case 'steam_generator':
          branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'heat_flow', ports: [{ id: 'h', sign: 1 }] });
          break;
        case 'microwave_inverter':
          branches.push({ name: 'current_in', ports: [{ id: 'p_in', sign: -1 }, { id: 'n_in', sign: 1 }] });
          branches.push({ name: 'current_out', ports: [{ id: 'p_out', sign: -1 }, { id: 'n_out', sign: 1 }] });
        case 'microwave_cavity':
          branches.push({ name: 'heat_flow1', ports: [{ id: 'h1', sign: -1 }] });
          branches.push({ name: 'heat_flow2', ports: [{ id: 'h2', sign: -1 }] });
          branches.push({ name: 'heat_flow3', ports: [{ id: 'h3', sign: -1 }] });
          branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          states.push('temp');
          break;
        case 'washing_basket':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
        case 'pwm_3ph_2level':
          branches.push({ name: 'current_a', ports: [{ id: 'a', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_b', ports: [{ id: 'b', sign: -1 }, { id: 'n', sign: 1 }] });
          branches.push({ name: 'current_c', ports: [{ id: 'c', sign: -1 }, { id: 'n', sign: 1 }] });
          break;
        case 'ma_pipe':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          break;
        case 'ma_flow_src':
        case 'ma_pres_src':
        case 'ma_moisture_source':
          branches.push({ name: 'mass_flow', ports: [{ id: 'a', sign: -1 }] });
          break;
        case 'ps_integrator':
        case 'ps_transfer_fcn':
        case 'ps_lpf':
        case 'ps_washout':
        case 'ps_sample_hold':
        case 'ps_sr_flipflop':
          states.push('y');
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
        case 'fluid_ref':
        case 'pressure_sensor':
          branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }] });
          break;
        case 'fluid_inertance':
          branches.push({ name: 'mass_flow', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          states.push('mdot');
          break;
        case 'steam_accumulator':
          branches.push({ name: 'flow_in', ports: [{ id: 'pin', sign: -1 }] });
          branches.push({ name: 'flow_out', ports: [{ id: 'pout', sign: 1 }] });
          break;
        default:
          if (ports.includes('p') && ports.includes('n')) {
            branches.push({ name: 'current', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
          } else if (ports.includes('r') && ports.includes('c')) {
            branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] });
          } else if (ports.includes('a') && ports.includes('b')) {
            branches.push({ name: 'through', ports: [{ id: 'a', sign: -1 }, { id: 'b', sign: 1 }] });
          }
          break;
      }

      // 2. Automatically allocate physical signal output branches
      ports.forEach(portId => {
        const key = `${blockId}_${portId}`;
        const domain = nodePortDomains.get(key);
        if (domain === 'physical' && isPhysicalOutputPort(portId)) {
          // Check if this branch is already added
          if (!branches.some(b => b.name === `signal_${portId}`)) {
            branches.push({ name: `signal_${portId}`, ports: [{ id: portId, sign: 1 }] });
          }
        }
      });

      return { branches, states };
    };

    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
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

      // Look up equation factory
      const equationFactory = blockEquations[type];
      const equationCount = spec.branches.length + spec.states.length;
      
      // Build component equation residual
      const residual = (x: number[], dx: number[], ctx: EquationContext): number[] => {
        if (!equationFactory) {
          // If no equation is defined for this block, return 0 residuals for its variables
          return new Array(equationCount).fill(0);
        }
        
        // Map block ports to global across variable values and their derivatives
        const acrossVals = ports.map(portId => {
          const key = `${node.id}_${portId}`;
          const domain = nodePortDomains.get(key);
          if (domain === 'physical' && !connectedPortKeys.has(key)) {
            return undefined as any;
          }
          const varIdx = portToVarIndex.get(key)!;
          return x[varIdx];
        });
        
        const acrossDervs = ports.map(portId => {
          const key = `${node.id}_${portId}`;
          const domain = nodePortDomains.get(key);
          if (domain === 'physical' && !connectedPortKeys.has(key)) {
            return undefined as any;
          }
          const varIdx = portToVarIndex.get(key)!;
          return dx[varIdx];
        });

        // Map component branch variables and their derivatives
        const branchVals = branchIndices.map(idx => x[idx]);
        const branchDervs = branchIndices.map(idx => dx[idx]);
        
        // Map component internal states and their derivatives
        const stateVals = stateIndices.map(idx => x[idx]);
        const stateDervs = stateIndices.map(idx => dx[idx]);

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
            nodeId: node.id
          });
        } catch (e) {
          console.error(`Error calculating residual for ${node.id} (${type}):`, e);
          return new Array(equationCount).fill(0);
        }
      };

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

    // 5. Setup Kirchhoff Conservation nodes
    // Identify which variables represent through-variables and which nodes they affect
    const kirchhoffNodes: { nodeId: string; throughIndices: number[]; signs: number[] }[] = [];
    const referenceNodeIds = new Set<string>();

    // Scan for reference components (e.g. ground, rot_ref, etc.)
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      if (['ground', 'rot_ref', 'trans_ref', 'thermal_ref', 'mag_ref', 'gas_ref', 'ma_ref', 'delta_ref'].includes(type)) {
        const ports = nodePorts.get(node.id) || [];
        ports.forEach(portId => {
          const key = `${node.id}_${portId}`;
          const root = uf.find(key);
          referenceNodeIds.add(root);
        });
      }
    });

    // Automatically treat unconnected case/reference ports (e.g. c, n, ref) as reference nodes (0 potential/speed)
    nodes.forEach(node => {
      const ports = nodePorts.get(node.id) || [];
      ports.forEach(portId => {
        const key = `${node.id}_${portId}`;
        const root = uf.find(key);
        const portsInRoot = rootToPorts.get(root) || [];
        if (portsInRoot.length === 1 && ['c', 'n', 'ref', 'gnd'].includes(portId.toLowerCase())) {
          referenceNodeIds.add(root);
        }
      });
    });

    // For each physical node that is NOT a reference node,
    // construct its Kirchhoff through-variable sign maps
    physicalNodes.forEach(pn => {
      if (referenceNodeIds.has(pn.id)) {
        return;
      }
      
      const throughIndices: number[] = [];
      const signs: number[] = [];
      
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
              throughIndices.push(globalBranchVarIndex);
              signs.push(bp.sign);
            }
          });
        });
      });
      
      kirchhoffNodes.push({
        nodeId: pn.id,
        throughIndices,
        signs
      });
    });

    // 6. Build Scope mapping — map each scope port to its connected source variable index (or unconnected fallback)
    const scopeOutputs = new Map<string, number[]>();
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      if (type === 'scope') {
        const ports = nodePorts.get(node.id) || [];
        const indices = ports.map(pId => {
          const targetKey = `${node.id}_${pId}`;
          const edge = edges.find(e => {
            let tPort = (e.targetHandle || 'p').replace(/_[st]$/, '');
            if (tPort.startsWith(e.target + '-')) {
              tPort = tPort.slice(e.target.length + 1);
            }
            return e.target === node.id && tPort === pId;
          });
          
          if (edge) {
            let srcPort = (edge.sourceHandle || 'y').replace(/_[st]$/, '');
            if (srcPort.startsWith(edge.source + '-')) {
              srcPort = srcPort.slice(edge.source.length + 1);
            }
            const srcKey = `${edge.source}_${srcPort}`;
            
            const srcDomain = nodePortDomains.get(srcKey) || 'electrical';
            if (srcDomain === 'physical') {
              const sourceBranchIndices = componentBranchVarIndices.get(edge.source) || [];
              const sourcePorts = nodePorts.get(edge.source) || [];
              const sourceNode = nodes.find(n => n.id === edge.source);
              const sourceType = (sourceNode?.data as any)?.type || sourceNode?.type || (sourceNode?.data as any)?.blockId || '';
              const sourceSpec = getComponentSpec(edge.source, sourceType, sourcePorts);
              
              const matchingBranchIdx = sourceSpec.branches.findIndex(b =>
                b.name === `signal_${srcPort}` || b.ports.some(p => p.id === srcPort)
              );
              if (matchingBranchIdx !== -1 && sourceBranchIndices[matchingBranchIdx] !== undefined) {
                return sourceBranchIndices[matchingBranchIdx];
              }
            }
            const varIdx = portToVarIndex.get(srcKey);
            return varIdx !== undefined ? varIdx : portToVarIndex.get(targetKey)!;
          } else {
            return portToVarIndex.get(targetKey)!;
          }
        });
        scopeOutputs.set(node.id, indices);
      }
    });

    // 7. Assemble global residuals function
    const residuals = (x: number[], arg2: number[] | EquationContext, arg3?: EquationContext): number[] => {
      let dx: number[];
      let ctx: EquationContext;
      
      if (arg3 === undefined) {
        // Called with (x, ctx)
        ctx = arg2 as EquationContext;
        dx = x.map((val, idx) => (val - (ctx.prevStates[idx] || 0)) / ctx.dt);
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
        
        let resPtr = 0;
        branchIndices.forEach(idx => {
          res[idx] = compRes[resPtr++] || 0;
        });
        stateIndices.forEach(idx => {
          res[idx] = compRes[resPtr++] || 0;
        });
      });
      
      // Set equations for physical nodes (Kirchhoff Conservation or Reference Constraints)
      physicalNodes.forEach(pn => {
        const acrossVarIdx = pn.acrossVarIndex;
        
        if (referenceNodeIds.has(pn.id)) {
          // Reference node potential = 0
          res[acrossVarIdx] = x[acrossVarIdx];
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
        } else {
          // Kirchhoff Conservation node: Sum of through variables = 0
          const kn = kirchhoffNodes.find(k => k.nodeId === pn.id);
          if (kn) {
            let sum = 0;
            for (let i = 0; i < kn.throughIndices.length; i++) {
              sum += kn.signs[i] * x[kn.throughIndices[i]];
            }
            res[acrossVarIdx] = sum;
          } else {
            // Unconnected isolated node has 0 across potential
            res[acrossVarIdx] = x[acrossVarIdx];
          }
        }
      });

      return res;
    };

    return {
      systemSize: varCount,
      variableNames,
      isDifferentialState,
      residuals,
      kirchhoffNodes,
      components: componentsList,
      scopeOutputs
    };
  }
}
