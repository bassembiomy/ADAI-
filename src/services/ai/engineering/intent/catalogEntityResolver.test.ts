import { describe, it, expect } from 'vitest';
import { CatalogEntityResolver } from './catalogEntityResolver';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';

describe('CatalogEntityResolver', () => {
  const catalog = buildXbridgesCapabilityIndex();
  const resolver = new CatalogEntityResolver(catalog);

  describe('Standard components grounding', () => {
    it('resolves Constant block with verified ports and parameters', () => {
      const result = resolver.resolve('Constant');
      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') return;

      expect(result.canonicalBlockId).toBe('Constant');
      expect(result.outputPortIds).toContain('out');
      expect(result.parameterNames).toContain('value');
    });

    it('resolves Sum block with verified in1, in2, and out ports', () => {
      const result = resolver.resolve('Sum');
      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') return;

      expect(result.canonicalBlockId).toBe('Sum');
      expect(result.inputPortIds).toContain('in1');
      expect(result.inputPortIds).toContain('in2');
      expect(result.outputPortIds).toContain('out');
    });

    it('resolves VectorMul block with verified ports', () => {
      const result = resolver.resolve('VectorMul');
      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') return;

      expect(result.canonicalBlockId).toBe('VectorMul');
      expect(result.outputPortIds).toContain('out');
    });

    it('resolves PID_CONTROLLER and aliases like "pid controller"', () => {
      const res1 = resolver.resolve('PID_CONTROLLER');
      expect(res1.status).toBe('resolved');
      if (res1.status === 'resolved') {
        expect(res1.canonicalBlockId).toBe('PID_CONTROLLER');
        expect(res1.parameterNames).toContain('Kp');
        expect(res1.parameterNames).toContain('Ki');
        expect(res1.parameterNames).toContain('Kd');
      }

      const res2 = resolver.resolve('pid controller');
      expect(res2.status).toBe('resolved');
      if (res2.status === 'resolved') {
        expect(res2.canonicalBlockId).toBe('PID_CONTROLLER');
      }
    });

    it('resolves TRANSFER_FUNCTION and "transfer function" with numerator and denominator', () => {
      const res = resolver.resolve('transfer function');
      expect(res.status).toBe('resolved');
      if (res.status !== 'resolved') return;

      expect(res.canonicalBlockId).toBe('TRANSFER_FUNCTION');
      expect(res.parameterNames).toContain('numerator');
      expect(res.parameterNames).toContain('denominator');
      expect(res.inputPortIds).toContain('u');
      expect(res.outputPortIds).toContain('y');
    });

    it('resolves Scope with verified input port', () => {
      const res = resolver.resolve('Scope');
      expect(res.status).toBe('resolved');
      if (res.status !== 'resolved') return;

      expect(res.canonicalBlockId).toBe('Scope');
      expect(res.inputPortIds).toContain('in1');
    });
  });

  describe('Capability gaps & unknown blocks', () => {
    it('returns capability gap for unknown / non-existent components without inventing blocks', () => {
      const res = resolver.resolve('flux_capacitor_subsystem');
      expect(res.status).toBe('capability_gap');
      if (res.status === 'capability_gap') {
        expect(res.reason).toMatch(/not found in catalog|capability gap/i);
      }
    });

    it('returns capability gap for 3D finite element blocks', () => {
      const res = resolver.resolve('cfd_navier_stokes_mesh');
      expect(res.status).toBe('capability_gap');
    });
  });

  describe('Resolution of extracted entities in StructuredEngineeringRequest', () => {
    it('grounds all entities in a structured request against the catalog', () => {
      const entities = [
        { id: 'c1', semanticType: 'Constant', sourceText: '10', confidence: 1.0 },
        { id: 'c2', semanticType: 'Constant', sourceText: '20', confidence: 1.0 },
        { id: 's1', semanticType: 'Sum', sourceText: 'add', confidence: 1.0 }
      ];

      const grounded = resolver.groundEntities(entities);
      expect(grounded.allResolved).toBe(true);
      expect(grounded.gaps).toHaveLength(0);
      expect(grounded.groundedEntities).toHaveLength(3);
      expect(grounded.groundedEntities[0].catalogBlockId).toBe('Constant');
      expect(grounded.groundedEntities[2].catalogBlockId).toBe('Sum');
    });

    it('identifies ungrounded entities as gaps', () => {
      const entities = [
        { id: 'u1', semanticType: 'WarpDrive', sourceText: 'warp drive', confidence: 0.5 }
      ];

      const grounded = resolver.groundEntities(entities);
      expect(grounded.allResolved).toBe(false);
      expect(grounded.gaps).toHaveLength(1);
      expect(grounded.gaps[0].entityId).toBe('u1');
      expect(grounded.gaps[0].semanticType).toBe('WarpDrive');
    });
  });
});
