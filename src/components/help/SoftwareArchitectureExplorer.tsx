import React, { useMemo, useState } from 'react';
import { RotateCcw, Search, ShieldCheck, X } from 'lucide-react';

export type ArchitectureDataType = {
  id: string;
  label: string;
  description: string;
  usage: string;
};

export type ArchitectureProtection = {
  id: string;
  label: string;
  detail: string;
};

export type ArchitectureCard = {
  id: string;
  name: string;
  icon: string;
  responsibility: string;
  source: string;
  dataTypes: string[];
  protections: string[];
};

export type ArchitectureLayer = {
  id: string;
  label: string;
  description: string;
  cards: ArchitectureCard[];
};

export const ARCHITECTURE_DATA_TYPES: ArchitectureDataType[] = [
  { id: 'domain', label: 'Domain model objects', description: 'Blocks, ports, parts, connectors, relationships, states, transitions, OPM objects/processes, and lab models.', usage: 'Editing and rendering engineering diagrams.' },
  { id: 'runtime', label: 'Runtime values', description: 'Booleans, signed/unsigned integers, floating-point values, matrices, solver states, and simulation outputs.', usage: 'Simulation ticks, expressions, and control execution.' },
  { id: 'persisted', label: 'Persisted project data', description: 'Unified payloads, snapshots, migration inputs, and .adia/JSON content.', usage: 'Save/load, import/export, recovery, and report assembly.' },
  { id: 'telemetry', label: 'Telemetry and time-series data', description: 'Serial frames, scope samples, traces, and HIL observations.', usage: 'Live simulation and hardware-in-the-loop monitoring.' },
  { id: 'artifacts', label: 'Generated artifacts', description: 'C source, runtime bundles, ELF/build evidence, HTML, PDF, DOCX, XLSX, and ZIP outputs.', usage: 'Code generation, verification, reporting, and delivery.' },
  { id: 'safety', label: 'Validation and safety results', description: 'Error items, diagnostics, integrity findings, policy decisions, and verification reports.', usage: 'Blocking invalid or unsafe operations and recovery guidance.' },
];

export const ARCHITECTURE_PROTECTIONS: ArchitectureProtection[] = [
  { id: 'input', label: 'Input validation', detail: 'JSON validation, migration, sanitization, and safe parsing protect against malformed files.' },
  { id: 'integrity', label: 'Integrity services', detail: 'Cascade deletion, reconciliation, snapshots, and unsaved-change guards prevent dangling state.' },
  { id: 'bounded', label: 'Bounded work', detail: 'Guarded simulation lifecycle, cancellation/reset controls, and FPS monitoring limit runaway work.' },
  { id: 'runtime-errors', label: 'Recoverable errors', detail: 'Error boundaries, global error reporting, defensive defaults, and session reset contain exceptions.' },
  { id: 'verification', label: 'Verification gates', detail: 'Restricted expressions, generated-code checks, OPM verification, and toolchain hashes gate execution.' },
  { id: 'hil-policy', label: 'Deny-by-default HIL', detail: 'Pin validation, recipes, environment checks, trace comparison, and build/flash policy gates protect hardware.' },
];

export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  { id: 'shell', label: 'L0 · Shell and entry', description: 'Desktop shell, bootstrap, UI foundation, and AI assistants.', cards: [
    { id: 'electron', name: 'Electron shell', icon: '🖥️', responsibility: 'Packaging, file association, IPC, and protected desktop lifecycle.', source: 'src/main.cjs · electron/ · preload.cjs', dataTypes: ['persisted'], protections: ['input', 'runtime-errors'] },
    { id: 'app-shell', name: 'App shell + router', icon: '🧭', responsibility: 'Canvas editors, tabs, undo history, error boundary, and recovery overlays.', source: 'src/App.tsx · components/GlobalErrorBoundary', dataTypes: ['domain', 'safety'], protections: ['bounded', 'runtime-errors'] },
  ] },
  { id: 'workspaces', label: 'L1 · Editor workspaces', description: 'Editors for domain-specific models joined in the saved project; SysML semantic ownership is separate from executable chart and physical graph state.', cards: [
    { id: 'sysml', name: 'SysML / State Machine', icon: '🧱', responsibility: 'SysML commands update semantic elements and presentation membership; the separate State Machine adapter builds validated executable chart semantics.', source: 'src/services/sysmlCommandGateway.ts · src/engine/sysml/domain · src/utils/stateMachine/smAppAdapter.ts', dataTypes: ['domain', 'safety'], protections: ['integrity'] },
    { id: 'simulation-workspaces', name: 'VLab / X-Bridges / DOE', icon: '🧪', responsibility: 'Physical models, control blocks, experiments, and analysis views.', source: 'src/components/vlab · src/components/xbridges · src/components/doe', dataTypes: ['domain', 'runtime'], protections: ['bounded', 'runtime-errors'] },
    { id: 'hil', name: 'HIL workspace', icon: '🔌', responsibility: 'Configure, build/flash, map signals, and observe hardware telemetry.', source: 'src/components/hil/HILWorkspace.tsx', dataTypes: ['telemetry', 'safety'], protections: ['hil-policy'] },
  ] },
  { id: 'integrity', label: 'L2 · Integrity, persistence, and reporting', description: 'Rules, snapshots, one project payload, and deterministic report assembly.', cards: [
    { id: 'integrity-services', name: 'Integrity services', icon: '✅', responsibility: 'Cascade consistency, reference validation, migration, and deterministic snapshots.', source: 'src/services/ · src/utils/adiaProjectPersistence', dataTypes: ['persisted', 'safety'], protections: ['input', 'integrity'] },
    { id: 'reporting', name: 'Reporting pipeline', icon: '📄', responsibility: 'Validated snapshots become diagrams and delivery formats.', source: 'src/features/reporting/', dataTypes: ['persisted', 'artifacts', 'safety'], protections: ['verification'] },
  ] },
  { id: 'engines', label: 'L3 · Simulation and code-generation engines', description: 'Headless, testable execution semantics for each domain.', cards: [
    { id: 'engines-core', name: 'Simulation engines', icon: '⚙️', responsibility: 'VLab, X-Bridges, OPM, DOE/GMDH, and state-machine execution.', source: 'src/engine/', dataTypes: ['runtime', 'telemetry'], protections: ['bounded', 'runtime-errors'] },
    { id: 'codegen', name: 'Code generation', icon: '🛠️', responsibility: 'Generate deterministic C and runtime bundles from validated models.', source: 'src/utils/stateMachineCodeGenerator.ts · src/engine/opm', dataTypes: ['artifacts', 'safety'], protections: ['verification'] },
  ] },
  { id: 'targets', label: 'L4 · HIL, targets, and external gateways', description: 'Build/flash, policy gates, gateways, digital twins, and delivery formats.', cards: [
    { id: 'target-packs', name: 'Target packs and toolchains', icon: '🎯', responsibility: 'Platform-specific build recipes, hashes, and evidence.', source: 'src/security/ · src/engine/hil/', dataTypes: ['artifacts', 'safety'], protections: ['hil-policy', 'verification'] },
    { id: 'gateways', name: 'Gateways and twins', icon: '🌐', responsibility: 'Connect validated models to external simulators and hardware.', source: 'src/components/FactoryIOGateway.tsx · src/components/ThreeDXGateway.tsx', dataTypes: ['telemetry', 'runtime'], protections: ['hil-policy'] },
  ] },
  { id: 'cross-cutting', label: 'L5 · Cross-cutting concerns', description: 'Security, verification, build/release, and regression evidence.', cards: [
    { id: 'security', name: 'Security and verification', icon: '🛡️', responsibility: 'SAST, policy enforcement, code verification, and test gates.', source: 'src/security/ · scripts/', dataTypes: ['safety', 'artifacts'], protections: ['verification', 'hil-policy'] },
  ] },
];

const allCards = ARCHITECTURE_LAYERS.flatMap(layer => layer.cards);

export function SoftwareArchitectureExplorer({ onClose }: { onClose?: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(allCards[0].id);
  const [protectionOverlay, setProtectionOverlay] = useState(false);
  const selected = allCards.find(card => card.id === selectedId) ?? allCards[0];
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (card: ArchitectureCard) => !normalizedQuery || [card.name, card.responsibility, card.source, ...card.dataTypes.map(id => ARCHITECTURE_DATA_TYPES.find(type => type.id === id)?.label ?? ''), ...card.protections.map(id => ARCHITECTURE_PROTECTIONS.find(item => item.id === id)?.label ?? '')].join(' ').toLowerCase().includes(normalizedQuery);
  const visibleLayers = useMemo(() => ARCHITECTURE_LAYERS.map(layer => ({ ...layer, cards: layer.cards.filter(matches) })).filter(layer => layer.cards.length), [normalizedQuery]);
  const reset = () => { setQuery(''); setSelectedId(allCards[0].id); setProtectionOverlay(false); };
  return <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-5 md:p-10 text-[var(--text-primary)]">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--focus-ring)]">Interactive architecture map</p><h1 className="mt-2 text-3xl font-black tracking-tight">Software Architecture Explorer</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">Follow the canonical flow: edit → guard → snapshot/report → execute → deploy/observe → telemetry feedback.</p></div><div className="flex gap-2">{onClose && <button data-help-feature="ui:help/SoftwareArchitectureExplorer:aec94544e440" data-help-source="src/components/help/SoftwareArchitectureExplorer.tsx" onClick={onClose} aria-label="Close explorer" className="ui-control rounded-lg border border-[var(--border-default)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={16} /></button>}<button data-help-feature="ui:help/SoftwareArchitectureExplorer:aec94544e440" data-help-source="src/components/help/SoftwareArchitectureExplorer.tsx" onClick={reset} className="flex items-center gap-2 ui-control rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--focus-ring)]"><RotateCcw size={14} />Reset</button></div></div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input data-help-feature="ui:help/SoftwareArchitectureExplorer:2002fbae5c5d" data-help-source="src/components/help/SoftwareArchitectureExplorer.tsx" aria-label="Search architecture" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search components, data types, protections..." className="w-full ui-control rounded-lg border border-[var(--border-default)] bg-[var(--surface-canvas)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--focus-ring)]" /></div><button data-help-feature="ui:help/SoftwareArchitectureExplorer:2002fbae5c5d" data-help-source="src/components/help/SoftwareArchitectureExplorer.tsx" aria-pressed={protectionOverlay} onClick={() => setProtectionOverlay(value => !value)} className={`flex items-center gap-2 ui-control rounded-lg border px-3 py-2 text-xs ${protectionOverlay ? 'border-[var(--status-success)] bg-[color-mix(in_srgb,var(--status-success)_12%,var(--surface-panel))] text-[var(--status-success)]' : 'border-[var(--border-default)] text-[var(--text-secondary)]'}`}><ShieldCheck size={15} />Protection overlay</button></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-3">{visibleLayers.map(layer => <section key={layer.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-black">{layer.label}</h2><span className="text-xs text-[var(--text-muted)]">{layer.description}</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{layer.cards.map(card => <button data-help-feature="ui:help/SoftwareArchitectureExplorer:c820f45bf2ef" data-help-source="src/components/help/SoftwareArchitectureExplorer.tsx" key={card.id} onClick={() => setSelectedId(card.id)} className={`min-h-28 ui-control rounded-lg border p-3 text-left transition ${selected.id === card.id ? 'border-[var(--focus-ring)] bg-[color-mix(in_srgb,var(--focus-ring)_12%,var(--surface-panel))]' : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]'} ${protectionOverlay && card.protections.length ? 'ring-1 ring-[var(--status-success)]' : ''}`}><div className="flex items-start justify-between gap-2"><span className="text-lg">{card.icon}</span>{protectionOverlay && <ShieldCheck size={15} className="text-[var(--status-success)]" />}</div><h3 className="mt-2 text-sm font-bold">{card.name}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{card.responsibility}</p></button>)}</div></section>)}{!visibleLayers.length && <div className="rounded-xl border border-dashed border-[var(--border-default)] p-10 text-center text-sm text-[var(--text-muted)]">No architecture components match this search.</div>}</div>
        <aside className="h-fit rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 xl:sticky xl:top-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--focus-ring)]">Inspector</p><h2 className="mt-2 text-xl font-black">{selected.icon} {selected.name}</h2><p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{selected.responsibility}</p><p className="mt-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Representative source</p><code className="mt-1 block break-words text-xs text-[var(--focus-ring)]">{selected.source}</code><p className="mt-5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Data handled</p><div className="mt-2 space-y-2">{selected.dataTypes.map(id => { const type = ARCHITECTURE_DATA_TYPES.find(item => item.id === id)!; return <div key={id} className="ui-control rounded-lg border border-[var(--border-default)] p-2"><p className="text-xs font-bold text-[var(--text-primary)]">{type.label}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{type.usage}</p></div>; })}</div><p className="mt-5 text-[10px] font-black uppercase tracking-widest text-[var(--status-success)]">Safeguards</p><ul className="mt-2 space-y-2">{selected.protections.map(id => { const item = ARCHITECTURE_PROTECTIONS.find(protection => protection.id === id)!; return <li key={id} className="text-xs leading-relaxed text-[var(--text-secondary)]"><ShieldCheck size={13} className="mr-1 inline text-[var(--status-success)]" />{item.detail}</li>; })}</ul></aside>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-4">{ARCHITECTURE_DATA_TYPES.map(type => <span key={type.id} className="rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">{type.label}</span>)}</div>
    </div>
  </div>;
}
