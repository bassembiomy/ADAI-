import { describe, expect, it } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { buildDomainFixture } from '../../engine/vlab/vlabDomainFixture';
import { normalizeLegacyVLabGraph } from './vlabModelMigration';
import { parseProjectJsonBuffer } from '../../utils/projectJsonBuffer';
import { validateImportedJson } from '../../utils/jsonImportValidator';
import { collectMigrationNotices } from './VLabMigrationBanner';
import { validateTopology } from '../../engine/vlab/vlabTopologyValidation';

/**
 * Save -> open of a V-Lab model through App's own path: `getActiveStateData('vlab')` returns `{ vlabNodes, vlabEdges }`, the project file is
 * JSON of that object, and open runs parseProjectJsonBuffer -> validateImportedJson -> setVlabNodes/setVlabEdges -> VLabWorkspace's
 * normalizeLegacyVLabGraph. App.tsx itself is not touched; the functions it calls are.
 */
const saveThenOpen = async (vlabNodes: Node[], vlabEdges: Edge[]) => {
  const file = JSON.stringify({ vlabNodes, vlabEdges }, null, 2);
  const parsed = await parseProjectJsonBuffer(new TextEncoder().encode(file).buffer as ArrayBuffer);
  const validation = validateImportedJson(parsed);
  expect(validation.isValid, JSON.stringify(validation)).toBe(true);
  const data = validation.sanitizedData || parsed;
  return normalizeLegacyVLabGraph(data.vlabNodes, data.vlabEdges);
};

/** first block of a domain whose single-block fixture builds */
const fixtureOf = (domainType: string) => {
  const domain = VLAB_LIBRARY.find(d => d.type === domainType)!;
  for (const block of domain.blocks) {
    try {
      const fx = buildDomainFixture(block, {});
      if (fx.nodes.length > 1 && fx.edges.length > 0) return { block, fx };
    } catch { /* try the next block of the domain */ }
  }
  // a domain without a physical network fixture (e.g. DOE Models): the block placed as a palette drop makes it
  const block = domain.blocks[0];
  const dut: Node = {
    id: 'dut', type: 'default', position: { x: 0, y: 0 },
    data: { type: block.id, label: block.name, icon: block.icon, color: block.color, params: JSON.parse(JSON.stringify(block.params ?? {})), ports: JSON.parse(JSON.stringify(block.ports ?? [])) },
  };
  return { block, fx: { nodes: [dut], edges: [] as Edge[], scopeConnected: false } };
};

describe('V-Lab save/open round trip (one model per domain)', () => {
  it.each(VLAB_LIBRARY.map(d => d.type))('preserves types, params + units, ports, connections, scope channels and migration notices: %s', async (domainType) => {
    const { block, fx } = fixtureOf(domainType);
    const nodes: Node[] = JSON.parse(JSON.stringify(fx.nodes));
    const edges: Edge[] = JSON.parse(JSON.stringify(fx.edges));

    // user edits that must survive: a negative, a fraction and a scientific-notation value with their units; migration notices; scope channels
    const dut = nodes.find(n => n.id === 'dut')!;
    const numericKeys = Object.entries((dut.data as any).params ?? {}).filter(([, p]: [string, any]) => typeof p?.value === 'number').map(([k]) => k);
    const edited: Record<string, number> = {};
    [-0.25, 1.5e-3, -2.5e4].forEach((v, i) => { const k = numericKeys[i]; if (k) { (dut.data as any).params[k].value = v; edited[k] = v; } });
    (dut.data as any).migrationNotices = ['Kt differed from Ke; Kt was set to Ke.', 'thermal reference is now +293.15 K'];
    const scope = nodes.find(n => (n.data as any).type === 'scope');
    if (scope) (scope.data as any).params = { ...(scope.data as any).params, numSignals: { value: 2, unit: '', label: 'Number of inputs' }, time_range: { value: 5, unit: 's', label: 'Time range' } };

    const reopened = await saveThenOpen(nodes, edges);
    const byId = new Map(reopened.nodes.map(n => [n.id, n]));

    for (const original of nodes) {
      const now = byId.get(original.id);
      expect(now, `${block.id}: node ${original.id} kept`).toBeTruthy();
      const was = original.data as any; const is = now!.data as any;
      expect(is.type, `${original.id} type`).toBe(was.type);
      // params: every saved value and unit
      for (const [key, p] of Object.entries(was.params ?? {}) as [string, any][]) {
        expect(is.params?.[key], `${original.id}.${key} kept`).toBeDefined();
        expect(is.params[key].value, `${original.id}.${key} value`).toEqual(p.value);
        if (p.unit !== undefined) expect(is.params[key].unit, `${original.id}.${key} unit`).toBe(p.unit);
      }
      // ports: ids, sides and domains (handles)
      const portsNow = new Map<string, any>((is.ports ?? []).map((q: any) => [q.id, q]));
      for (const q of was.ports ?? []) {
        expect(portsNow.get(q.id), `${original.id} port ${q.id}`).toBeDefined();
        expect(portsNow.get(q.id).pos).toBe(q.pos);
        if (q.domain !== undefined) expect(portsNow.get(q.id).domain).toBe(q.domain);
      }
      // migration notices
      // (opening an unmigrated fixture may legitimately ADD notices; none that were saved may be lost or duplicated)
      expect(is.migrationNotices ?? [], `${original.id} notices`).toEqual(expect.arrayContaining(was.migrationNotices ?? []));
      expect(new Set(is.migrationNotices ?? []).size, `${original.id} notices unique`).toBe((is.migrationNotices ?? []).length);
    }
    for (const [k, v] of Object.entries(edited)) expect((byId.get('dut')!.data as any).params[k].value).toBe(v);

    // connections: source / target / handles
    const edgeKey = (e: Edge) => `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`;
    const edgesNow = new Set(reopened.edges.map(edgeKey));
    for (const e of edges) expect(edgesNow.has(edgeKey(e)), `edge ${edgeKey(e)} kept`).toBe(true);

    // scope channels
    if (scope) {
      const s = (byId.get(scope.id)!.data as any).params;
      expect(s.numSignals.value).toBe(2);
      expect(s.time_range.value).toBe(5);
      expect(s.time_range.unit).toBe('s');
    }

    // the notices are the ones the banner lists, and the topology verdict is unchanged by the round trip
    expect(collectMigrationNotices(reopened.nodes).filter(n => n.nodeId === 'dut').map(n => n.notice)).toEqual(expect.arrayContaining((dut.data as any).migrationNotices));
    expect(validateTopology(reopened.nodes as any, reopened.edges as any).valid).toBe(validateTopology(nodes as any, edges as any).valid);
  });

  it('keeps a second save of an opened model byte-identical (no drift on repeated save/open)', async () => {
    const { fx } = fixtureOf(VLAB_LIBRARY[0].type);
    const once = await saveThenOpen(JSON.parse(JSON.stringify(fx.nodes)), fx.edges);
    const twice = await saveThenOpen(once.nodes as Node[], once.edges as Edge[]);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
