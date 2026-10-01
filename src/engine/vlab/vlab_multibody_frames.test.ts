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
