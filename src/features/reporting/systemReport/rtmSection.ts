import type { SysmlRepository, VerificationEvidence } from '../../../engine/sysml/model';
import type { CoverageMetrics, RtmRequirementRef, RtmRow, RtmStatus, TraceabilityMatrix } from '../../../engine/sysml/rtm';
import { deriveEvidenceStatus } from '../../../engine/sysml/evidence';
import { friendlySysmlKind, hasSysmlReference, resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../sysml/sysmlDisplayLabel';
import { escapeHtml } from '../reportDiagramModel';
import { ReportNumbering, notModelled } from './numbering';

export interface RtmSectionInput {
  repository: SysmlRepository;
  matrix: TraceabilityMatrix;
  metrics: CoverageMetrics;
  modelHash?: string;
  repositoryRevision?: number;
  /** In-document link of a requirement's specification entry, when the report has one. */
  requirementHref?: (requirementElementId: string) => string | undefined;
}

/** Most columns per page of the requirement x element grid. */
export const RTM_GRID_MAX_COLUMNS = 12;

const STATUS_INFO: Record<RtmStatus, { label: string; cls: string; meaning: string }> = {
  verified: { label: 'Verified', cls: 'ok', meaning: 'Satisfied by the design and backed by current passing evidence.' },
  covered: { label: 'Covered', cls: 'info', meaning: 'Satisfied by at least one design element; no current passing evidence yet.' },
  uncovered: { label: 'Not covered', cls: 'warn', meaning: 'Has traceability links but no satisfy relationship.' },
  failed: { label: 'Failed', cls: 'bad', meaning: 'Verification evidence reports a failure.' },
  stale: { label: 'Stale', cls: 'warn', meaning: 'Evidence or the requirement is out of date with the model.' },
  suspect: { label: 'Suspect', cls: 'warn', meaning: 'A linked element changed after the trace link was last validated.' },
  orphan: { label: 'Orphan', cls: 'muted', meaning: 'No trace links, verification case or evidence at all.' },
  unresolved: { label: 'Unresolved', cls: 'bad', meaning: 'A trace link points at an element that is not in the model.' },
  unsupported: { label: 'Unsupported', cls: 'muted', meaning: 'Linked through a relationship kind the matrix cannot evaluate.' },
};

export function rtmStatusBadge(status: RtmStatus): string {
  const info = STATUS_INFO[status] ?? { label: friendlySysmlKind(status), cls: 'muted', meaning: '' };
  return `<span class="badge badge-${info.cls}" data-status="${escapeHtml(status)}">${escapeHtml(info.label)}</span>`;
}

const GLYPHS = [
  { glyph: 'S', title: 'satisfy' },
  { glyph: 'V', title: 'verify' },
  { glyph: 'R', title: 'refine' },
  { glyph: 'D', title: 'derive' },
  { glyph: 'T', title: 'trace' },
] as const;

/** Relationship kind -> grid glyph. */
const KIND_GLYPH: Record<string, string> = {
  satisfy: 'S', verify: 'V', refine: 'R', deriveReqt: 'D', derive: 'D', trace: 'T',
};

const pct = (value: number): string => `${value.toFixed(1)}%`;

/**
 * Share of requirements (rows) satisfied / verified according to each row's own status. The engine's
 * metrics count `covered` and `verified` as exclusive buckets of the combined row status, so a requirement
 * that is satisfied but whose verification failed is not counted as covered there; the coverage cards must
 * report each dimension separately.
 */
export function rowPercentages(matrix: TraceabilityMatrix): { satisfied: number; satisfiedCount: number; verified: number; verifiedCount: number } {
  const total = matrix.rows.length;
  const satisfiedCount = matrix.rows.filter(row => row.satisfactionStatus === 'satisfied').length;
  const verifiedCount = matrix.rows.filter(row => row.verificationStatus === 'passed').length;
  return {
    satisfied: total ? (satisfiedCount * 100) / total : 0, satisfiedCount,
    verified: total ? (verifiedCount * 100) / total : 0, verifiedCount,
  };
}
const dash = '<span class="muted">&#8212;</span>';
const joinList = (items: string[]): string => (items.length ? items.map(i => `<div>${i}</div>`).join('') : dash);

function reqRefText(ref: RtmRequirementRef): string {
  return escapeHtml(`${ref.requirementId} ${sysmlObjectLabel({ name: ref.name }, 'Requirement')}`.trim());
}

function elementName(repo: SysmlRepository, id: string, fallbackName: string | undefined, fallbackKind: string): string {
  if (hasSysmlReference(repo, id)) return resolveSysmlReferenceLabel(repo, id, fallbackKind);
  return sysmlObjectLabel({ name: fallbackName }, fallbackKind);
}

/** Case name plus the result of its latest evidence (highest revision, then latest execution time). */
function verifiedByCell(repo: SysmlRepository, row: RtmRow): string {
  const ids = [...new Set([...row.verificationCases, ...row.verifiedBy.map(v => v.id)])];
  const evidence = row.evidence.map(id => repo.evidence[id]).filter((e): e is VerificationEvidence => Boolean(e));
  return joinList(ids.map(id => {
    const ref = row.verifiedBy.find(v => v.id === id);
    const name = escapeHtml(elementName(repo, id, ref?.name, 'Verification Case'));
    const latest = evidence
      .filter(e => e.verificationCaseId === id)
      .sort((a, b) => b.revision - a.revision || String(b.executedAt).localeCompare(String(a.executedAt)))[0];
    if (!latest) return `${name} <span class="ev ev-none">no evidence</span>`;
    const currency = deriveEvidenceStatus(repo, latest.id) === 'current' ? '' : ' (stale)';
    return `${name} <span class="ev ev-${latest.result}">${escapeHtml(latest.result)}${currency}</span>`;
  }));
}

/**
 * Derive links whose other end is a design element, not a requirement. These are what the grid's `D` glyph marks;
 * requirement-to-requirement derivations are shown only in the table ("derived from ..."), so the grid and the
 * table never disagree about where a derivation is recorded.
 */
function elementDerivations(repo: SysmlRepository, row: RtmRow): string[] {
  const out: string[] = [];
  for (const relId of row.relationshipIds) {
    const rel = repo.relationships[relId];
    if (!rel || (rel.kind !== 'deriveReqt' && String(rel.kind) !== 'derive')) continue;
    const otherId = rel.sourceId === row.requirement.id ? rel.targetId : rel.sourceId;
    if (repo.requirements[otherId] || !hasSysmlReference(repo, otherId)) continue;
    out.push(`derive link with ${resolveSysmlReferenceLabel(repo, otherId, 'Element')}`);
  }
  return out;
}

interface GridColumn { id: string; name: string; kind: string }

/** Requirement -> element -> glyph set, built from the relationships that touch each matrix row. */
function buildGrid(repo: SysmlRepository, matrix: TraceabilityMatrix): { columns: GridColumn[]; marks: Map<string, Map<string, Set<string>>> } {
  const marks = new Map<string, Map<string, Set<string>>>();
  const columnById = new Map<string, GridColumn>();
  for (const row of matrix.rows) {
    const byElement = new Map<string, Set<string>>();
    for (const relId of row.relationshipIds) {
      const rel = repo.relationships[relId];
      const glyph = rel ? KIND_GLYPH[rel.kind] : undefined;
      if (!rel || !glyph) continue;
      const otherId = rel.sourceId === row.requirement.id ? rel.targetId : rel.sourceId;
      if (repo.requirements[otherId] || !hasSysmlReference(repo, otherId)) continue;
      if (!columnById.has(otherId)) {
        const found: { kind?: string; metaclass?: string } | undefined = repo.definitions[otherId] ?? repo.usages[otherId]
          ?? repo.verificationCases[otherId] ?? repo.useCases[otherId] ?? repo.artifacts[otherId] ?? undefined;
        columnById.set(otherId, {
          id: otherId,
          name: resolveSysmlReferenceLabel(repo, otherId, 'Element'),
          kind: friendlySysmlKind(found?.kind, 'Element'),
        });
      }
      if (!byElement.has(otherId)) byElement.set(otherId, new Set());
      byElement.get(otherId)!.add(glyph);
    }
    marks.set(row.requirement.id, byElement);
  }
  const columns = [...columnById.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { columns, marks };
}

/**
 * Section 8: coverage summary, status legend, the full traceability table and the paginated
 * requirement x design-element grid. `base` is the section number (default "8").
 */
export function renderRtmSection(input: RtmSectionInput, numbering: ReportNumbering, base = '8'): string {
  const { repository: repo, matrix, metrics } = input;
  const linked = (elementId: string, html: string): string => {
    const href = input.requirementHref?.(elementId);
    return href ? `<a href="${escapeHtml(href)}">${html}</a>` : html;
  };
  let html = '';
  if (matrix.rows.length === 0) {
    return notModelled();
  }

  // --- coverage summary ----------------------------------------------------
  html += numbering.heading(3, `${base}.1`, 'Coverage summary');
  const shares = rowPercentages(matrix);
  const cards: [string, string, string][] = [
    ['Requirements', String(metrics.total), ''],
    [`Satisfied (${shares.satisfiedCount} of ${matrix.rows.length})`, pct(shares.satisfied), 'ok'],
    [`Verified, evidence passed (${shares.verifiedCount} of ${matrix.rows.length})`, pct(shares.verified), 'ok'],
    ['Failed', String(metrics.failed), metrics.failed ? 'bad' : ''],
    ['Suspect', String(metrics.suspect), metrics.suspect ? 'warn' : ''],
    ['Stale', String(metrics.stale), metrics.stale ? 'warn' : ''],
    ['Orphan', String(metrics.orphan), metrics.orphan ? 'warn' : ''],
    ['Unresolved', String(metrics.unresolved), metrics.unresolved ? 'bad' : ''],
  ];
  html += `<div class="rtm-cards">${cards.map(([label, value, cls]) =>
    `<div class="rtm-card${cls ? ` rtm-card-${cls}` : ''}"><div class="rtm-card-value">${escapeHtml(value)}</div><div class="rtm-card-label">${escapeHtml(label)}</div></div>`).join('')}</div>`;
  const meta: string[] = [];
  if (input.repositoryRevision !== undefined) meta.push(`<strong>Model revision:</strong> ${escapeHtml(String(input.repositoryRevision))}`);
  if (input.modelHash) meta.push(`<strong>Model hash:</strong> <code>${escapeHtml(input.modelHash)}</code>`);
  if (meta.length) html += `<p class="rtm-meta">${meta.join(' &bull; ')}</p>`;
  html += `<div class="rtm-legend"><strong>Status legend</strong>${(Object.keys(STATUS_INFO) as RtmStatus[]).map(s =>
    `<span class="rtm-legend-item">${rtmStatusBadge(s)} ${escapeHtml(STATUS_INFO[s].meaning)}</span>`).join('')}</div>`;

  // --- full table ----------------------------------------------------------
  html += numbering.heading(3, `${base}.2`, 'Traceability table');
  html += numbering.table({
    caption: 'Requirements traceability matrix',
    className: 'rtm-table',
    head: ['Req ID', 'Name / text', 'Risk / priority', 'Status', 'Derived from / contains', 'Satisfied by', 'Refined by', 'Verified by', 'Traced', 'Change'],
    rows: matrix.rows.map(row => {
      const r = row.requirement;
      const derived = [
        ...row.derivedFrom.map(d => `derived from ${reqRefText(d)}`),
        ...row.containmentChildren.map(c => `contains ${reqRefText(c)}`),
        ...elementDerivations(repo, row),
      ];
      return {
        className: 'rtm-row',
        cells: [
          linked(r.id, `<code>${escapeHtml(r.requirementId)}</code>`),
          `<strong>${linked(r.id, escapeHtml(sysmlObjectLabel(r, 'Requirement')))}</strong>${r.text ? `<div class="req-text">${escapeHtml(r.text)}</div>` : ''}`,
          escapeHtml(`${r.risk ?? 'unspecified'} / ${r.priority ?? 'unspecified'}`),
          rtmStatusBadge(row.status),
          joinList(derived.map(escapeHtml)),
          joinList(row.satisfiedBy.map(s => escapeHtml(elementName(repo, s.id, s.name, s.type || 'Element')))),
          joinList(row.refinedBy.map(s => escapeHtml(elementName(repo, s.id, s.name, s.type || 'Element')))),
          verifiedByCell(repo, row),
          joinList(row.tracedElements.map(s => escapeHtml(elementName(repo, s.id, s.name, s.type || 'Element')))),
          row.changeKind ? escapeHtml(row.changeKind) : dash,
        ],
      };
    }),
  });

  // --- grid ----------------------------------------------------------------
  html += numbering.heading(3, `${base}.3`, 'Requirement to design-element grid');
  const { columns, marks } = buildGrid(repo, matrix);
  if (columns.length === 0) {
    html += '<p class="not-modelled">No requirement is traced to a design element.</p>';
  } else {
    html += `<p class="rtm-meta">Glyphs: ${GLYPHS.map(g => `<span class="glyph glyph-${g.glyph}">${g.glyph}</span> ${g.title}`).join(' &nbsp; ')}. A glyph marks a relationship between the requirement and the design element, verification case or other model element in that column; <span class="glyph glyph-D">D</span> is therefore a derive link to such an element only &mdash; derivations between two requirements are listed in the traceability table (&ldquo;Derived from / contains&rdquo;), not in this grid. Columns are split into pages of at most ${RTM_GRID_MAX_COLUMNS}.</p>`;
    const pages: GridColumn[][] = [];
    for (let i = 0; i < columns.length; i += RTM_GRID_MAX_COLUMNS) pages.push(columns.slice(i, i + RTM_GRID_MAX_COLUMNS));
    pages.forEach((page, index) => {
      const from = index * RTM_GRID_MAX_COLUMNS + 1;
      html += numbering.table({
        caption: `Requirement to element grid${pages.length > 1 ? ` (elements ${from}-${from + page.length - 1} of ${columns.length})` : ''}`,
        className: 'rtm-grid',
        head: ['Requirement', ...page.map(c => `<span class="grid-col">${escapeHtml(c.name)}<small>${escapeHtml(c.kind)}</small></span>`)],
        rows: matrix.rows.map(row => ({
          className: 'grid-row',
          cells: [
            linked(row.requirement.id, `<strong>${escapeHtml(row.requirement.requirementId)}</strong> ${escapeHtml(sysmlObjectLabel(row.requirement, 'Requirement'))}`),
            ...page.map(col => {
              const set = marks.get(row.requirement.id)?.get(col.id);
              if (!set || set.size === 0) return '';
              return GLYPHS.filter(g => set.has(g.glyph))
                .map(g => `<span class="glyph glyph-${g.glyph}" title="${g.title}">${g.glyph}</span>`).join('');
            }),
          ],
        })),
      });
    });
  }
  return html;
}
