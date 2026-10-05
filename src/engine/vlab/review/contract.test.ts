import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { blockEquations } from '../vlabEquations';
import { VLAB_COMPONENT_DEFINITIONS } from '../vlabComponentDefinitions';
import { VLAB_VALIDATION_CONTRACTS } from '../vlabValidationContracts';
import { REPO_ROOT, parseDae, parseDaeCaseLabels, parseSymbols } from './contractInventory';
import {
  ALL_WPS, CHECK_IDS, CHECK_TITLES, buildContexts, evaluateBlock, libraryStats,
  type BlockContext, type CheckId,
} from './contractChecks';
import {
  BLOCK_CLASSIFICATION, BLOCK_CLASS_LISTS, ORPHAN_DAE_CASES, ORPHAN_DEFINITION_KEYS, ORPHAN_EQUATION_KEYS, UTILITY_REASONS,
} from './blockClassification';
import { CONTRACT_EXPECTED_FAILURES } from './contractExpectedFailures';

/**
 * WP-03: canonical block contract certification, catalog <-> equation <-> DAE <-> ports <-> params <-> scope.
 *
 * Every live VLAB_LIBRARY block gets one describe with one test per contract check. Blocks that do not meet the
 * contract today are listed in contractExpectedFailures.ts (blockId -> check -> owning WP) and run as it.fails:
 * when a later WP fixes the block the it.fails turns red and forces removal of the entry (ratchet). A failure that
 * is not in the map is a plain red test.
 */

const contexts = buildContexts();
const byId = new Map<string, BlockContext>(contexts.map(c => [c.block.id, c]));
const memo = new Map<string, Record<CheckId, string[]>>();
const results = (id: string) => {
  let r = memo.get(id);
  if (!r) { r = evaluateBlock(byId.get(id)!); memo.set(id, r); }
  return r;
};
const liveIds = contexts.map(c => c.block.id);
const liveSet = new Set(liveIds);

describe('V-Lab catalog contract: library-level', () => {
  it('library has no duplicate block ids and derives its own size (246 vs 247 vs 248 is not a hard-coded number)', () => {
    const entries = VLAB_LIBRARY.reduce((n, d) => n + d.blocks.length, 0);
    expect(liveSet.size).toBe(entries);
    expect(Object.keys(VLAB_VALIDATION_CONTRACTS).sort()).toEqual([...liveSet].sort());
  });

  it('every live block is classified exactly once; no stale classification entries', () => {
    const seen = new Map<string, string[]>();
    for (const [cls, ids] of Object.entries(BLOCK_CLASS_LISTS)) for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), cls]);
    const dup = [...seen].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}: ${v.join('+')}`);
    expect(dup).toEqual([]);
    expect(liveIds.filter(id => !seen.has(id))).toEqual([]);
    expect([...seen.keys()].filter(id => !liveSet.has(id))).toEqual([]);
    expect(Object.keys(BLOCK_CLASSIFICATION).sort()).toEqual([...liveSet].sort());
  });

  it('utility allow-list and its written reasons are the same set', () => {
    expect([...BLOCK_CLASS_LISTS.utility].sort()).toEqual(Object.keys(UTILITY_REASONS).sort());
    for (const [id, reason] of Object.entries(UTILITY_REASONS)) expect(reason.trim().length, `reason for ${id}`).toBeGreaterThan(20);
  });

  it('a physical block is never hiding in the utility list (no conserving-domain ports)', () => {
    const bad = BLOCK_CLASS_LISTS.utility.filter(id => byId.get(id)!.block.ports.some(p => ['electrical', 'thermal', 'translational', 'rotational', 'magnetic', 'fluid', 'gas', 'isothermal_liquid', 'frame', 'multibodyframe'].includes((p.domain ?? '').toLowerCase())));
    expect(bad).toEqual([]);
  });

  it('no orphan equation factories beyond the documented alias list (and no stale allowance)', () => {
    const orphans = Object.keys(blockEquations).filter(k => !liveSet.has(k)).sort();
    expect(orphans).toEqual(Object.keys(ORPHAN_EQUATION_KEYS).sort());
  });

  it('no orphan DAEAssembler case labels beyond the documented list; no duplicate labels', () => {
    const labels = parseDaeCaseLabels();
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
    const orphans = [...parseDae().keys()].filter(k => !liveSet.has(k)).sort();
    expect(orphans).toEqual(Object.keys(ORPHAN_DAE_CASES).sort());
  });

  it('no orphan component definitions beyond the documented list', () => {
    const orphans = Object.keys(VLAB_COMPONENT_DEFINITIONS).filter(k => !liveSet.has(k)).sort();
    expect(orphans).toEqual(Object.keys(ORPHAN_DEFINITION_KEYS).sort());
  });

  it('expected-failure map only names live blocks, known checks and known WPs', () => {
    for (const [id, checks] of Object.entries(CONTRACT_EXPECTED_FAILURES)) {
      expect(liveSet.has(id), `expected-failure entry for non-existent block ${id}`).toBe(true);
      for (const [check, wp] of Object.entries(checks)) {
        expect(CHECK_IDS as readonly string[], `${id}: unknown check ${check}`).toContain(check);
        expect(ALL_WPS as string[], `${id}.${check}: unknown WP ${wp}`).toContain(wp);
      }
    }
  });
});

describe('V-Lab catalog contract: per block', () => {
  for (const ctx of contexts) {
    const id = ctx.block.id;
    describe(`${id} [${BLOCK_CLASSIFICATION[id] ?? 'unclassified'}]`, () => {
      for (const check of CHECK_IDS) {
        const wp = CONTRACT_EXPECTED_FAILURES[id]?.[check];
        const run = wp ? it.fails : it;
        run(`${check}${wp ? ` [expected failure -> ${wp}]` : ''}`, () => {
          expect(results(id)[check], CHECK_TITLES[check]).toEqual([]);
        });
      }
    });
  }
});

describe('V-Lab catalog contract: status report', () => {
  it('writes docs/vlab-review/contract-status.md (generated, deterministic)', () => {
    const stats = libraryStats();
    const perCheck = CHECK_IDS.map(check => {
      const failing = contexts.filter(c => results(c.block.id)[check].length > 0).map(c => c.block.id);
      const expected = contexts.filter(c => CONTRACT_EXPECTED_FAILURES[c.block.id]?.[check]).map(c => c.block.id);
      return { check, pass: contexts.length - failing.length, fail: failing.length, expected: expected.length };
    });
    const perWp = ALL_WPS.map(wp => {
      const row: Record<string, number> = {};
      let total = 0;
      for (const check of CHECK_IDS) {
        const n = contexts.filter(c => CONTRACT_EXPECTED_FAILURES[c.block.id]?.[check] === wp).length;
        if (n) { row[check] = n; total += n; }
      }
      return { wp, total, row };
    }).filter(r => r.total > 0);
    const certified = contexts.filter(c => CHECK_IDS.every(k => results(c.block.id)[k].length === 0)).map(c => c.block.id);
    const classCounts = Object.entries(BLOCK_CLASS_LISTS).map(([k, v]) => `${k} ${v.length}`).join(', ');
    const totalExpected = perWp.reduce((n, r) => n + r.total, 0);

    const md = [
      '# V-Lab block contract status (generated by src/engine/vlab/review/contract.test.ts, do not hand-edit)',
      '',
      'Source of truth for block count: `VLAB_LIBRARY` (derived, never hard-coded). See WP-03 notes for the 246/247/248 history.',
      '',
      '## Statistics',
      '| Item | Value |', '|---|---|',
      `| Live blocks | ${stats.blocks} |`,
      `| Classification | ${classCounts} |`,
      `| Total ports | ${stats.ports} |`,
      `| Ports without explicit domain | ${stats.noDomainPorts} |`,
      `| Blocks with at least one port lacking a domain | ${stats.noDomainBlocks} |`,
      `| Blocks with generic "governing ... equation" label (equation or description) | ${stats.genericLabels} |`,
      `| Blocks with no equation text | ${stats.noEquationText} |`,
      `| Unsafe numeric \`params.X ||\` fallbacks in vlabEquations.ts | ${stats.unsafeFallbacks} |`,
      `| Fully certified blocks (all checks pass, no expected failure) | ${certified.length} of ${stats.blocks} |`,
      `| Expected failures (ratchet entries) | ${totalExpected} across ${Object.keys(CONTRACT_EXPECTED_FAILURES).length} blocks |`,
      '',
      '## Per check (blocks)',
      '| Check | Meaning | Pass | Fail | Expected failure |', '|---|---|---|---|---|',
      ...perCheck.map(r => `| ${r.check} | ${CHECK_TITLES[r.check]} | ${r.pass} | ${r.fail} | ${r.expected} |`),
      '',
      '## Expected failures per owning WP',
      '| WP | Total | Breakdown by check |', '|---|---|---|',
      ...perWp.map(r => `| ${r.wp} | ${r.total} | ${Object.entries(r.row).map(([k, v]) => `${k} ${v}`).join(', ')} |`),
      '',
      '## Documented orphans (allow-lists in blockClassification.ts)',
      `- Equation keys: ${Object.keys(ORPHAN_EQUATION_KEYS).map(k => `\`${k}\``).join(', ')}`,
      `- DAEAssembler cases: ${Object.keys(ORPHAN_DAE_CASES).map(k => `\`${k}\``).join(', ')}`,
      `- Component definitions: ${Object.keys(ORPHAN_DEFINITION_KEYS).map(k => `\`${k}\``).join(', ')}`,
      `- RawSymbolRenderer type keys that match no library id (informational, UI parity belongs to WP-40): ${[...parseSymbols()].filter(k => !liveSet.has(k)).length}`,
      '',
    ].join('\n');
    fs.mkdirSync(path.join(REPO_ROOT, 'docs', 'vlab-review'), { recursive: true });
    fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'vlab-review', 'contract-status.md'), md);

    // The ratchet itself: every actual failure is mapped, every mapped entry still fails.
    const unmapped: string[] = []; const stale: string[] = [];
    for (const c of contexts) for (const k of CHECK_IDS) {
      const failing = results(c.block.id)[k].length > 0;
      const mapped = !!CONTRACT_EXPECTED_FAILURES[c.block.id]?.[k];
      if (failing && !mapped) unmapped.push(`${c.block.id}.${k}`);
      if (!failing && mapped) stale.push(`${c.block.id}.${k}`);
    }
    expect(unmapped).toEqual([]);
    expect(stale).toEqual([]);
  });
});
