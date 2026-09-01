// src/engine/vlab/kernel/PhysicalSystemCompiler.ts
import { Node } from '@xyflow/react';
import {
  PhysicalNetwork,
  PhysicalSystemIR,
  IRComponent,
  StateVariable,
  AlgebraicVariable,
  Parameter,
  Equation
} from './types';

export class PhysicalSystemCompiler {
  compile(network: PhysicalNetwork, rawNodes: Node[]): PhysicalSystemIR {
    const compNodes = rawNodes.filter(n => network.componentIds.includes(n.id));
    const components: IRComponent[] = [];
    const states: StateVariable[] = [];
    const algebraicVariables: AlgebraicVariable[] = [];
    const parameters: Parameter[] = [];
    const equations: Equation[] = [];

    compNodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || '';
      const params = (node.data as any)?.params || {};

      Object.entries(params).forEach(([k, v]) => {
        const val = typeof v === 'object' && v !== null && 'value' in v ? (v as any).value : v;
        parameters.push({
          id: `${node.id}_${k}`,
          name: k,
          value: Number(val) || 0,
          componentId: node.id
        });
      });

      if (type === 'capacitor') {
        states.push({
          id: `state_${node.id}_v`,
          name: `V_${node.id}`,
          symbol: 'V_C',
          unit: 'V',
          initialValue: 0,
          sourceComponentId: node.id,
          preferred: true
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'I = C * dV/dt',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`V_${node.id}`],
          domain: 'electrical',
          residualForm: 'I - C * dV/dt = 0'
        });
      } else if (type === 'inductor') {
        states.push({
          id: `state_${node.id}_i`,
          name: `I_${node.id}`,
          symbol: 'I_L',
          unit: 'A',
          initialValue: 0,
          sourceComponentId: node.id,
          preferred: true
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'V = L * dI/dt',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`I_${node.id}`],
          domain: 'electrical',
          residualForm: 'V - L * dI/dt = 0'
        });
      } else if (type === 'resistor') {
        algebraicVariables.push({
          id: `alg_${node.id}_i`,
          name: `I_${node.id}`,
          symbol: 'I_R',
          unit: 'A',
          sourceComponentId: node.id
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'V = R * I',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`I_${node.id}`],
          domain: 'electrical',
          residualForm: 'V - R * I = 0'
        });
      }

      components.push({
        id: node.id,
        type,
        name: (node.data as any)?.label || node.id,
        ports: [],
        parameters: parameters.filter(p => p.componentId === node.id),
        sourceModelNodeId: node.id
      });
    });

    return {
      id: network.id,
      domains: network.domains,
      components,
      nodes: [],
      states,
      algebraicVariables,
      parameters,
      equations,
      connections: network.connections,
      references: [],
      metadata: {
        nodeCount: network.nodeIds.length,
        stateCount: states.length,
        algebraicCount: algebraicVariables.length,
        hasNonlinearities: false,
        isStiff: true,
        isDAE: true
      }
    };
  }
}
