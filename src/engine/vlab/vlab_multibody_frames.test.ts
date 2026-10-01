import { describe, it, expect } from 'vitest';
import { isValidVLabPortDomain } from './vlabPortDomains';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('VLab Multibody Frame Domains & Block Contracts', () => {
  it('validates Frame and MultibodyFrame port domains', () => {
    expect(isValidVLabPortDomain('Frame')).toBe(true);
    expect(isValidVLabPortDomain('frame')).toBe(true);
    expect(isValidVLabPortDomain('MultibodyFrame')).toBe(true);
    expect(isValidVLabPortDomain('multibodyframe')).toBe(true);
  });

  it('verifies world_frame, ref_frame, rigid_transform, dist_constraint, angle_constraint have Frame domain ports', () => {
    const physDomain = VLAB_LIBRARY.find(d => d.type === 'Physical');
    expect(physDomain).toBeDefined();

    const worldFrame = physDomain?.blocks.find(b => b.id === 'world_frame');
    expect(worldFrame?.ports.find(p => p.id === 'w')?.domain).toBe('Frame');

    const refFrame = physDomain?.blocks.find(b => b.id === 'ref_frame');
    expect(refFrame?.ports.find(p => p.id === 'r')?.domain).toBe('Frame');

    const rigidTrans = physDomain?.blocks.find(b => b.id === 'rigid_transform');
    expect(rigidTrans?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(rigidTrans?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');

    const distCons = physDomain?.blocks.find(b => b.id === 'dist_constraint');
    expect(distCons?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(distCons?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(distCons?.ports.find(p => p.id === 'd')?.domain).toBe('Physical');

    const angleCons = physDomain?.blocks.find(b => b.id === 'angle_constraint');
    expect(angleCons?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(angleCons?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(angleCons?.ports.find(p => p.id === 'ang')?.domain).toBe('Physical');

    const transformSensor = physDomain?.blocks.find(b => b.id === 'transform_sensor');
    expect(transformSensor).toBeDefined();
    expect(transformSensor?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(transformSensor?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(transformSensor?.ports.find(p => p.id === 'x')?.domain).toBe('Physical');
    expect(transformSensor?.ports.find(p => p.id === 'rx')?.domain).toBe('Physical');
  });
});

import {
  parseVector3,
  eulerToRotationMatrix,
  transformPoint,
  computeFrameDistance,
  computeRelativeAngle
} from './vlabFrameKinematics';

describe('VLab Frame Kinematics Math', () => {
  it('parses various vector3 representations', () => {
    expect(parseVector3('[1 2 3]')).toEqual([1, 2, 3]);
    expect(parseVector3('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(parseVector3('1 2 3')).toEqual([1, 2, 3]);
    expect(parseVector3([4, 5, 6])).toEqual([4, 5, 6]);
    expect(parseVector3(undefined, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('computes 3D Euclidean frame distance', () => {
    expect(computeFrameDistance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5.0);
    expect(computeFrameDistance([1, 1, 1], [1, 1, 1])).toBeCloseTo(0.0);
  });

  it('transforms vector with rotation matrix correctly (90 deg around Z)', () => {
    const Rz90 = eulerToRotationMatrix(0, 0, Math.PI / 2);
    const p = transformPoint(Rz90, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(1, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });

  it('computes relative angle between orientations', () => {
    const ang = computeRelativeAngle([0, 0, 0], [0, 0, Math.PI / 2]);
    expect(ang).toBeCloseTo(Math.PI / 2);
  });
});

import { DAEAssembler } from './DAEAssembler';
import { Node, Edge } from '@xyflow/react';

describe('DAEAssembler Frame System Allocation & World Pinning', () => {
  it('allocates 6 variables per Frame root and pins world_frame to 0', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'w1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
    ];
    const edges: Edge[] = [];

    const system = assembler.assemble(nodes, edges);
    // At least 6 across variables for world frame: Px, Py, Pz, Rx, Ry, Rz
    expect(system.variableNames.some(name => name.includes('Across_') && name.includes('_Px'))).toBe(true);
    expect(system.variableNames.some(name => name.includes('Across_') && name.includes('_Rz'))).toBe(true);

    // Residual of world frame must pin x to 0
    const ctx: any = { dt: 0.01, time: 0, parameters: {}, prevStates: new Array(system.systemSize).fill(0) };
    const testX = new Array(system.systemSize).fill(5); // Non-zero test vector
    const res = system.residuals(testX, ctx);

    // For world frame variables, residual should be testX[idx] - 0 = 5
    system.variableNames.forEach((name, idx) => {
      if (name.includes('Across_') && (name.includes('frame') || name.includes('multibody'))) {
        expect(res[idx]).toBe(5);
      }
    });
  });
});

import { VLabPhysicsEngine } from './vlabPhysics';

describe('Multibody Component Equations and Scope Connectivity', () => {
  it('correctly models rigid_transform offset and rotation into transform_sensor scope', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'w', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      {
        id: 't1',
        type: 'default',
        position: { x: 100, y: 0 },
        data: {
          type: 'rigid_transform',
          params: { offset: { value: '[1 2 3]' }, rotation: { value: '[0 0 90]' } }
        }
      } as any,
      { id: 's1', type: 'default', position: { x: 200, y: 0 }, data: { type: 'transform_sensor' } } as any,
      { id: 'scope1', type: 'default', position: { x: 300, y: 0 }, data: { type: 'scope' } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'w', target: 't1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 't1', target: 's1', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e3', source: 'w', target: 's1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e4', source: 's1', target: 'scope1', sourceHandle: 'x', targetHandle: 'in_1' },
      { id: 'e5', source: 's1', target: 'scope1', sourceHandle: 'y', targetHandle: 'in_2' },
      { id: 'e6', source: 's1', target: 'scope1', sourceHandle: 'z', targetHandle: 'in_3' },
      { id: 'e7', source: 's1', target: 'scope1', sourceHandle: 'rz', targetHandle: 'in_4' },
    ];

    let state: any = null;
    state = engine.simulateStep(nodes, edges, state, 0.01);
    expect(state).toBeDefined();

    // Verify Scope mapped channel values
    const scopeData = state.scopeOutputs['scope1'];
    expect(scopeData).toBeDefined();
    // [X, Y, Z, Rz]
    expect(scopeData[0]).toBeCloseTo(1, 2);
    expect(scopeData[1]).toBeCloseTo(2, 2);
    expect(scopeData[2]).toBeCloseTo(3, 2);
    expect(scopeData[3]).toBeCloseTo(90, 1);
  });
});



