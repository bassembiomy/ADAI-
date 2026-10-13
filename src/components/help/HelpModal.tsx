import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Layers, Settings2, Search, Box, ChevronRight, BookOpen,
  Activity, Zap, Database, Cpu, X, Network, Flame, RefreshCcw, Wind, Cloud, Rows
} from 'lucide-react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { HELP_DATA } from '../../HelpData';
import { SoftwareArchitectureExplorer } from './SoftwareArchitectureExplorer';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { BLOCK_LIBRARY as XBRIDGES_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { SymbolRenderer } from '../vlab/VLabSymbols';
import { XBlockNode } from '../xbridges/XBlockNode';
import { getBlockHelp, ITEM_HELP, ITEM_MODULE_LABELS } from '../../help';
import type { BlockHelpEntry, ItemHelpEntry, ItemModule } from '../../help';

// Safe React renderer for bold (**text**) markers without dangerouslySetInnerHTML
export const renderFormattedHelpText = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={index} className="text-white font-normal">{part.slice(2, -2)}</b>;
    }
    return part;
  });
};

const DynamicIcon = ({ name, size, className }: { name?: string; size: number; className?: string }) => {
  switch (name) {
    case 'activity': return <Activity size={size} className={className} />;
    case 'zap': return <Zap size={size} className={className} />;
    case 'cpu': return <Cpu size={size} className={className} />;
    case 'layers': return <Layers size={size} className={className} />;
    case 'database': return <Database size={size} className={className} />;
    case 'network': return <Network size={size} className={className} />;
    case 'plus': return <Plus size={size} className={className} />;
    case 'resistor': return <Zap size={size} className={className} />;
    case 'capacitor': return <Layers size={size} className={className} />;
    case 'inductor': return <Activity size={size} className={className} />;
    case 'dc_motor': return <Cpu size={size} className={className} />;
    case 'inertia': return <Database size={size} className={className} />;
    case 'mass': return <Box size={size} className={className} />;
    case 'trans_spring': return <Rows size={size} className={className} />;
    case 'scope': return <Activity size={size} className={className} />;
    case 'settings-2': return <Settings2 size={size} className={className} />;
    case 'magnetron': return <Zap size={size} className={className} />;
    case 'heater': return <Flame size={size} className={className} />;
    case 'cavity': return <Box size={size} className={className} />;
    case 'inverter': return <RefreshCcw size={size} className={className} />;
    case 'gas_chamber': return <Wind size={size} className={className} />;
    case 'ma_chamber': return <Cloud size={size} className={className} />;
    case 'reluctance': return <Activity size={size} className={className} />;
    case 'doe_model': return <Database size={size} className={className} />;
    default: return <Box size={size} className={className} />;
  }
};

// Topics that should appear first in the sidebar (foundation material).
const FOUNDATION_ORDER = [
  'getting-started', 'adia-philosophy', 'module-interconnection', 'reading-block-reference',
  'state-machine-semantics', 'simulation-execution-order', 'embedded-execution-order',
];
const FOUNDATION_CATEGORY_HINTS = ['foundation', 'concept', 'start', 'overview'];

const catRank = (cat: string, keys: string[]) => {
  const c = cat.toLowerCase();
  if (FOUNDATION_CATEGORY_HINTS.some(h => c.includes(h))) return -2;
  const idx = Math.min(...keys.map(k => { const i = FOUNDATION_ORDER.indexOf(k); return i < 0 ? 999 : i; }));
  return idx < 999 ? -1 : 0;
};

class BlockShapeBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* fall back to generic pin box */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const XB_NODE_TYPES = { xblock: XBlockNode } as any;

const XBridgesShape = ({ block }: { block: any }) => {
  const node = useMemo(() => {
    let inst: any = {};
    try { inst = XBRIDGES_LIBRARY[block.id]('help_preview', {}); } catch { inst = {}; }
    return [{
      id: 'help_preview',
      type: 'xblock',
      position: { x: 40, y: 30 },
      draggable: false,
      data: {
        type: block.id,
        label: block.name,
        params: inst.params || {},
        inputs: inst.inputs || [],
        outputs: inst.outputs || [],
        state: inst.state,
      },
    }];
  }, [block.id, block.name]);
  return (
    <div style={{ width: '100%', height: 220 }} data-testid="xbridges-shape">
      <ReactFlowProvider>
        <ReactFlow
          nodes={node as any}
          edges={[]}
          nodeTypes={XB_NODE_TYPES}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
};

const GenericPinBox = ({ block }: { block: any }) => (
  <div className="w-36 h-36 bg-orange-500/5 border-2 border-orange-500/30 rounded-3xl flex flex-col items-center justify-center relative shadow-[0_0_50px_rgba(249,115,22,0.1)] group">
    <DynamicIcon name={block.icon} size={40} className="text-orange-500 mb-1" />
    <span className="text-[10px] font-black text-white/80 max-w-[100px] text-center truncate px-1">{block.name}</span>
    {block.ports?.map((p: any, i: number) => {
      const pos = p.position || p.pos || (i % 2 === 0 ? 'left' : 'right');
      return (
        <div
          key={i}
          className={`absolute text-[8px] font-black uppercase text-gray-400 flex items-center gap-1 ${pos === 'left' ? '-left-14' : pos === 'right' ? '-right-14' : pos === 'top' ? '-top-8' : '-bottom-8'}`}
        >
          <span className="px-1 py-0.5 bg-black/80 rounded border border-white/10 text-orange-400/90">{p.label || p.name || p.id || `Pin ${i + 1}`}</span>
          <div className={`w-2.5 h-2.5 rounded-full border-2 border-orange-500 bg-black ${pos === 'left' ? 'order-last' : 'order-first'}`}></div>
        </div>
      );
    })}
  </div>
);

const RealBlockShape = ({ block }: { block: any }) => {
  const fallback = <GenericPinBox block={block} />;
  if (block.source === 'V-Lab') {
    return (
      <BlockShapeBoundary fallback={fallback}>
        <div className="flex items-center justify-center p-4" data-testid="vlab-shape">
          <SymbolRenderer type={block.id} color="#f97316" />
        </div>
      </BlockShapeBoundary>
    );
  }
  return (
    <BlockShapeBoundary fallback={fallback}>
      <XBridgesShape block={block} />
    </BlockShapeBoundary>
  );
};

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">{children}</h3>
);

const PreBlock = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div className="relative">
    {label && <div className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">{label}</div>}
    <div className="bg-black/90 rounded-2xl border border-white/10 p-5 font-mono text-xs text-orange-400 overflow-x-auto shadow-inner">
      <pre className="m-0 whitespace-pre">{children}</pre>
    </div>
  </div>
);

const Prose = ({ text }: { text: string }) => (
  <p className="text-sm text-gray-400 leading-relaxed font-light whitespace-pre-wrap">{renderFormattedHelpText(text)}</p>
);

const NumberedSteps = ({ steps }: { steps: string[] }) => (
  <ol className="p-6 bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 rounded-3xl space-y-3 text-xs text-gray-300 font-light list-none m-0">
    {steps.map((s, i) => (
      <li key={i} className="flex items-start gap-2.5">
        <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">{i + 1}</span>
        <span>{renderFormattedHelpText(s)}</span>
      </li>
    ))}
  </ol>
);

const Examples = ({ examples }: { examples?: { title: string; steps: string[] }[] }) => {
  if (!examples?.length) return null;
  return (
    <section>
      <SectionHeading>Examples</SectionHeading>
      <div className="space-y-4">
        {examples.map((ex, i) => (
          <div key={i} className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
            <div className="text-sm font-bold text-white mb-2">{ex.title}</div>
            <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-400 font-light">
              {ex.steps.map((s, j) => <li key={j}>{renderFormattedHelpText(s)}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
};

const Tips = ({ tips }: { tips?: string[] }) => {
  if (!tips?.length) return null;
  return (
    <section>
      <SectionHeading>Tips</SectionHeading>
      <ul className="space-y-2">
        {tips.map((t, i) => (
          <li key={i} className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
            <span className="text-xs text-gray-300 font-light leading-relaxed">{renderFormattedHelpText(t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const Chips = ({ labels, onSelect }: { labels: { id: string; name: string }[]; onSelect: (id: string) => void }) => {
  if (!labels.length) return null;
  return (
    <section>
      <SectionHeading>See Also</SectionHeading>
      <div className="flex flex-wrap gap-2">
        {labels.map(l => (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            className="px-3 py-1.5 bg-white/5 hover:bg-orange-500/10 hover:text-orange-400 border border-white/10 rounded-xl text-[10px] font-bold text-gray-400 transition-colors"
          >
            {l.name}
          </button>
        ))}
      </div>
    </section>
  );
};

const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="overflow-x-auto rounded-2xl border border-white/5">
    <table className="w-full text-left text-xs">
      <thead className="bg-white/[0.04] text-[9px] uppercase tracking-widest text-gray-500">
        <tr>{head.map(h => <th key={h} className="px-4 py-2.5 font-black">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-white/5 align-top">
            {r.map((c, j) => <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-mono text-orange-400' : 'text-gray-300 font-light'}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const fmtDefault = (p: any) => {
  const v = p?.value ?? p?.default;
  const s = v === undefined ? '-' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return p?.unit ? `${s} ${p.unit}` : s;
};

const fmtBool = (v: boolean | 'n/a') => (v === 'n/a' ? 'n/a' : v ? 'Yes' : 'No');

const BlockHelpPage = ({ block, help, onSelectBlock, allBlocks }: {
  block: any; help: BlockHelpEntry; onSelectBlock: (key: string) => void; allBlocks: any[];
}) => {
  const rawPorts: any[] = block.ports || [];
  const portMeta = (id: string) => rawPorts.find(p => p.id === id);
  const paramMeta = (key: string) => (block.params || {})[key];
  const seeAlso = (help.seeAlso || [])
    .map(id => allBlocks.find(b => b.source === block.source && b.id === id))
    .filter(Boolean)
    .map((b: any) => ({ id: `${b.source}|${b.id}`, name: b.name }));
  const c = help.characteristics;
  return (
    <div className="space-y-10" data-testid="block-help-page">
      <section>
        <SectionHeading>Description</SectionHeading>
        <p className="text-base text-white font-light mb-3">{help.summary}</p>
        <Prose text={help.description} />
      </section>

      <section>
        <SectionHeading><Box size={14} className="text-orange-500" /> Shape</SectionHeading>
        <div className="bg-black/60 rounded-3xl border border-white/5 p-6 flex flex-col items-center justify-center min-h-[220px] shadow-inner mb-4">
          <RealBlockShape block={block} />
        </div>
        <Prose text={help.shape} />
      </section>

      <section>
        <SectionHeading>Ports</SectionHeading>
        {help.ports.length ? (
          <Table
            head={['Port', 'Direction / Side', 'Description']}
            rows={help.ports.map(p => {
              const m = portMeta(p.id);
              const side = m ? (m.position || m.pos || (m.direction === 'input' ? 'left' : m.direction === 'output' ? 'right' : '')) : '';
              const dir = m ? [m.direction || m.domain, side].filter(Boolean).join(' / ') : '-';
              return [p.id, dir || '-', renderFormattedHelpText(p.description)];
            })}
          />
        ) : <p className="text-xs text-gray-600 italic">This block has no ports.</p>}
      </section>

      <section>
        <SectionHeading>Parameters</SectionHeading>
        {help.params.length ? (
          <Table
            head={['Key', 'Label', 'Default', 'Description', 'Range']}
            rows={help.params.map(p => {
              const m = paramMeta(p.key);
              return [p.key, m?.label || '-', m ? fmtDefault(m) : '-', renderFormattedHelpText(p.description), p.range || '-'];
            })}
          />
        ) : <p className="text-xs text-gray-600 italic">This block has no parameters.</p>}
      </section>

      <section>
        <SectionHeading>Algorithm</SectionHeading>
        <PreBlock>{help.algorithm}</PreBlock>
      </section>

      <section>
        <SectionHeading>Block Characteristics</SectionHeading>
        <Table
          head={['Characteristic', 'Value']}
          rows={[
            ['Direct feedthrough', fmtBool(c.directFeedthrough)],
            ['Sample time', c.sampleTime],
            ['States', c.states],
            ['Zero-crossing detection', c.zeroCrossing ? 'Yes' : 'No'],
            ['Data types / domain', c.dataTypes],
            ['Code generation', c.codeGeneration],
          ]}
        />
      </section>

      <section>
        <SectionHeading>Usage</SectionHeading>
        <NumberedSteps steps={help.usage} />
      </section>

      <section>
        <SectionHeading>Simulation Execution</SectionHeading>
        <Prose text={help.simulationExecution} />
      </section>

      <section>
        <SectionHeading>Embedded / Code Generation</SectionHeading>
        <Prose text={help.embeddedExecution} />
      </section>

      <Examples examples={help.examples} />
      <Tips tips={help.tips} />
      <Chips labels={seeAlso} onSelect={onSelectBlock} />
    </div>
  );
};

const ItemHelpPage = ({ item, onSelectItem }: { item: ItemHelpEntry; onSelectItem: (id: string) => void }) => {
  const seeAlso = (item.seeAlso || []).filter(id => ITEM_HELP[id]).map(id => ({ id, name: ITEM_HELP[id].name }));
  return (
    <div className="space-y-10" data-testid="item-help-page">
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">{item.name}</h1>
        <span className="px-3 py-0.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black text-gray-400 uppercase tracking-widest">
          {ITEM_MODULE_LABELS[item.module] || item.module}
        </span>
      </div>
      <section>
        <SectionHeading>Shape</SectionHeading>
        <Prose text={item.shape} />
        {item.shapeSketch && <div className="mt-4"><PreBlock label="Sketch">{item.shapeSketch}</PreBlock></div>}
      </section>
      <section>
        <SectionHeading>Description</SectionHeading>
        <p className="text-base text-white font-light mb-3">{item.summary}</p>
        <Prose text={item.description} />
      </section>
      <section>
        <SectionHeading>Usage</SectionHeading>
        <NumberedSteps steps={item.usage} />
      </section>
      <section>
        <SectionHeading>Connection Rules</SectionHeading>
        <ul className="space-y-2">
          {item.connections.map((c, i) => (
            <li key={i} className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
              <span className="text-xs text-gray-300 font-light leading-relaxed">{renderFormattedHelpText(c)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionHeading>Semantics</SectionHeading>
        <Prose text={item.semantics} />
      </section>
      {item.simulationExecution && (
        <section><SectionHeading>Simulation Execution</SectionHeading><Prose text={item.simulationExecution} /></section>
      )}
      {item.embeddedExecution && (
        <section><SectionHeading>Embedded / Code Generation</SectionHeading><Prose text={item.embeddedExecution} /></section>
      )}
      <Examples examples={item.examples} />
      <Tips tips={item.tips} />
      <Chips labels={seeAlso} onSelect={onSelectItem} />
    </div>
  );
};

type HelpView = 'guide' | 'blocks' | 'items';

export const HelpModal = ({
  isOpen, onClose, initialTopic, initialView, initialBlockKey, initialItemId, initialSearch,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
  /** Optional deep-link helpers (also used by tests). */
  initialView?: HelpView;
  initialBlockKey?: string; // "V-Lab|id" or "X-Bridges|id"
  initialItemId?: string;
  initialSearch?: string;
}) => {
  const [activeTopic, setActiveTopic] = useState<string>(initialTopic || 'getting-started');
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [view, setView] = useState<HelpView>(initialView || 'guide');
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(initialBlockKey || null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId || null);
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('All');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('All');
  const [showArchitectureExplorer, setShowArchitectureExplorer] = useState(false);

  useEffect(() => {
    if (initialTopic && isOpen) {
      setActiveTopic(initialTopic);
      setView('guide');
      setShowArchitectureExplorer(false);
    }
  }, [initialTopic, isOpen]);

  const showBlockRef = view === 'blocks';
  const q = searchQuery.toLowerCase().trim();

  const allBlocks = useMemo(() => {
    const vlab = VLAB_LIBRARY.flatMap(domain =>
      domain.blocks.map((b: any) => ({ ...b, domain: domain.type, source: 'V-Lab' }))
    );
    const xb = Object.keys(XBRIDGES_LIBRARY).map(key => {
      try {
        const b = XBRIDGES_LIBRARY[key]('tmp', {});
        return {
          id: key, name: key, domain: 'Control', source: 'X-Bridges',
          params: b.params, ports: [...(b.inputs || []), ...(b.outputs || [])],
          icon: b.icon, equation: b.equation, description: b.description,
        };
      } catch {
        return { id: key, name: key, domain: 'Control', source: 'X-Bridges', params: {}, ports: [], icon: undefined, equation: undefined, description: undefined };
      }
    });
    return [...vlab, ...xb] as any[];
  }, []);

  if (!isOpen) return null;

  const blockKey = (b: any) => `${b.source}|${b.id}`;
  const topic = HELP_DATA[activeTopic] || HELP_DATA['getting-started'];

  // ---- Topic list (filtered by search, foundation topics first)
  const topicMatches = (key: string) => {
    if (!q) return true;
    const t = HELP_DATA[key];
    const hay = [
      t.title, t.description, t.content, t.category,
      ...(t.sections || []).flatMap(s => [s.title, s.body, ...(s.list || []), s.code || '', s.diagram || '']),
    ].join('\n').toLowerCase();
    return hay.includes(q);
  };
  const filteredTopicKeys = Object.keys(HELP_DATA).filter(topicMatches);
  const topicCategories: Record<string, string[]> = {};
  filteredTopicKeys.forEach(key => {
    const cat = HELP_DATA[key].category;
    (topicCategories[cat] = topicCategories[cat] || []).push(key);
  });
  const orderedCategories = Object.keys(topicCategories)
    .map((cat, i) => ({ cat, i, rank: catRank(cat, topicCategories[cat]) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.cat);
  orderedCategories.forEach(cat => {
    topicCategories[cat].sort((a, b) => {
      const ia = FOUNDATION_ORDER.indexOf(a); const ib = FOUNDATION_ORDER.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  });

  // ---- Block reference
  const domainsList = ['All', ...Array.from(new Set(allBlocks.map(b => b.domain)))];
  const filteredBlocks = allBlocks
    .map(b => {
      const name = b.name.toLowerCase();
      const id = b.id.toLowerCase();
      const domain = b.domain.toLowerCase();
      const desc = (b.description || '').toLowerCase();
      const eq = (b.equation || '').toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else if (name === q || id === q) score = 1000;
      else if (name.startsWith(q) || id.startsWith(q)) score = 800;
      else if (name.includes(q) || id.includes(q)) score = 600;
      else if (domain.includes(q)) score = 400;
      else if (desc.includes(q) || eq.includes(q)) score = 100;
      const matchesDomain = selectedDomainFilter === 'All' || b.domain.toLowerCase() === selectedDomainFilter.toLowerCase();
      const matchesSource = selectedSourceFilter === 'All' || b.source.toLowerCase() === selectedSourceFilter.toLowerCase();
      return { block: b, score, match: score > 0 && matchesDomain && matchesSource };
    })
    .filter(x => x.match)
    .sort((a, b) => b.score - a.score)
    .map(x => x.block);

  const selectedBlock = selectedBlockKey ? allBlocks.find(b => blockKey(b) === selectedBlockKey) : undefined;
  const selectedHelp = selectedBlock ? getBlockHelp(selectedBlock.source, selectedBlock.id) : undefined;

  // ---- Diagram items
  const allItems = Object.values(ITEM_HELP) as ItemHelpEntry[];
  const filteredItems = allItems.filter(it => !q || [it.name, it.id, it.summary, it.description, it.shape, ITEM_MODULE_LABELS[it.module] || ''].join('\n').toLowerCase().includes(q));
  const itemsByModule: Record<string, ItemHelpEntry[]> = {};
  filteredItems.forEach(it => { (itemsByModule[it.module] = itemsByModule[it.module] || []).push(it); });
  const moduleOrder = (Object.keys(ITEM_MODULE_LABELS) as ItemModule[]).filter(m => itemsByModule[m]);
  const selectedItem = selectedItemId ? ITEM_HELP[selectedItemId] : undefined;

  const getDomainColor = (domain: string) => {
    const d = domain.toLowerCase();
    if (d.includes('electr')) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    if (d.includes('mechanic') || d.includes('rotat') || d.includes('translat')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    if (d.includes('therm')) return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (d.includes('magnet')) return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    if (d.includes('gas') || d.includes('fluid') || d.includes('air')) return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    if (d.includes('control')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  };

  const tabClass = (active: boolean) =>
    `px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white'}`;

  const placeholder = view === 'blocks' ? 'Search 250+ blocks, equations, ports...'
    : view === 'items' ? 'Search diagram items...' : 'Search documentation topics & guides...';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-6 md:p-10 text-white font-sans">
      <div className="bg-[#0f0f0f] rounded-3xl border border-white/10 w-full h-full max-w-7xl flex flex-col shadow-[0_0_150px_rgba(0,0,0,0.8)] overflow-hidden">

        {/* TOP HEADER */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 md:px-10 bg-[#151515]/50 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-6 md:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(249,115,22,0.3)]">A</div>
              <div className="flex flex-col">
                <span className="font-black tracking-tight text-xl leading-none">ADIA <span className="text-orange-500">DOCS</span></span>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">Multi-Domain MBD & HIL Reference</span>
              </div>
            </div>

            <div className="h-10 w-[1px] bg-white/10 hidden sm:block"></div>

            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              <button onClick={() => setView('guide')} className={tabClass(view === 'guide')}>User Guide & Modules</button>
              <button onClick={() => setView('blocks')} className={tabClass(view === 'blocks')}>Illustrated Block Reference ({allBlocks.length})</button>
              <button onClick={() => setView('items')} className={tabClass(view === 'items')}>Diagram Items</button>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder={placeholder}
                className="bg-black/60 border border-white/10 rounded-full py-2.5 pl-12 pr-6 text-xs w-64 md:w-80 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-all group shrink-0"
              title="Close Help"
            >
              <X size={22} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">

          {/* SIDEBAR */}
          <aside className="w-80 border-r border-white/5 bg-[#0a0a0a] flex flex-col shrink-0">
            {showBlockRef && (
              <div className="p-4 border-b border-white/5 bg-[#121212]/80 space-y-3 shrink-0">
                <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-lg border border-white/5 text-[9px] font-bold">
                  {['All', 'V-Lab', 'X-Bridges'].map(src => (
                    <button
                      key={src}
                      onClick={() => setSelectedSourceFilter(src)}
                      className={`flex-1 py-1 rounded text-center transition-all ${selectedSourceFilter === src ? 'bg-orange-500 text-black font-black' : 'text-gray-400 hover:text-white'}`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
                  {domainsList.slice(0, 8).map(d => (
                    <button
                      key={d}
                      onClick={() => setSelectedDomainFilter(d)}
                      className={`px-2 py-1 rounded text-[8px] font-bold uppercase whitespace-nowrap transition-all ${selectedDomainFilter === d ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {view === 'guide' && (
                <div className="space-y-8">
                  {orderedCategories.map(cat => (
                    <div key={cat}>
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                        {cat}
                      </h4>
                      <ul className="space-y-1">
                        {topicCategories[cat].map(key => (
                          <li key={key}>
                            <button
                              onClick={() => setActiveTopic(key)}
                              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-3 ${activeTopic === key ? 'bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                            >
                              <BookOpen size={14} className={activeTopic === key ? 'text-orange-500' : 'text-gray-700'} />
                              {HELP_DATA[key].title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {orderedCategories.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-600 italic">No topics match your search.</div>
                  )}
                </div>
              )}

              {view === 'blocks' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                    <span>Components ({filteredBlocks.length})</span>
                    {selectedDomainFilter !== 'All' && (
                      <button onClick={() => setSelectedDomainFilter('All')} className="text-orange-500 hover:underline">Reset</button>
                    )}
                  </div>
                  {filteredBlocks.map(block => {
                    const k = blockKey(block);
                    return (
                      <button
                        key={k}
                        onClick={() => setSelectedBlockKey(k)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-between group ${selectedBlockKey === k ? 'bg-orange-500 text-black font-black shadow-md shadow-orange-500/20' : 'text-gray-400 hover:bg-white/5'}`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Box size={13} className={selectedBlockKey === k ? 'text-black' : 'text-gray-600'} />
                          <span className="truncate">{block.name}</span>
                        </div>
                        <span className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded shrink-0 ml-2 ${selectedBlockKey === k ? 'bg-black/20 text-black' : 'bg-white/5 text-gray-500'}`}>
                          {block.domain}
                        </span>
                      </button>
                    );
                  })}
                  {filteredBlocks.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-600 italic">No blocks match your search or filter.</div>
                  )}
                </div>
              )}

              {view === 'items' && (
                <div className="space-y-8">
                  {moduleOrder.map(m => (
                    <div key={m}>
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                        {ITEM_MODULE_LABELS[m]}
                      </h4>
                      <ul className="space-y-1">
                        {itemsByModule[m].map(it => (
                          <li key={it.id}>
                            <button
                              onClick={() => setSelectedItemId(it.id)}
                              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs transition-all ${selectedItemId === it.id ? 'bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                            >
                              {it.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {moduleOrder.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-600 italic">No diagram items match your search.</div>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-10 md:p-14 custom-scrollbar relative">
            {view === 'guide' && (
              <div className="max-w-4xl mx-auto">
                {activeTopic === 'software-architecture' && showArchitectureExplorer ? (
                  <SoftwareArchitectureExplorer onClose={() => setShowArchitectureExplorer(false)} />
                ) : <>
                  <div className="mb-14">
                    <nav className="flex items-center gap-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-6">
                      <span className="hover:text-orange-500 cursor-pointer" onClick={() => setActiveTopic('getting-started')}>ADIA Docs</span>
                      <ChevronRight size={10} />
                      <span className="text-gray-400">{topic.category}</span>
                      <ChevronRight size={10} />
                      <span className="text-white">{topic.title}</span>
                    </nav>

                    <h1 className="text-5xl font-black text-white tracking-tighter mb-4 leading-tight">{topic.title}</h1>
                    <p className="text-lg text-gray-400 leading-relaxed font-light max-w-3xl">{topic.description}</p>
                  </div>

                  {activeTopic === 'software-architecture' && (
                    <button onClick={() => setShowArchitectureExplorer(true)} className="mb-10 flex items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-400 hover:bg-orange-500/20">
                      <Layers size={18} /> Open Architecture Explorer
                    </button>
                  )}

                  {topic.image && (
                    <div className="mb-14 rounded-3xl overflow-hidden border border-white/10 shadow-2xl group relative bg-black/40">
                      <img src={topic.image} alt={topic.title} className="w-full object-cover group-hover:scale-105 transition-transform duration-700 max-h-[380px]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                      <div className="absolute bottom-6 left-6 flex items-center gap-3">
                        <div className="p-2 bg-orange-500 rounded-lg text-black"><Activity size={16} /></div>
                        <span className="text-xs font-black uppercase tracking-widest text-white shadow-sm">Illustrated Architecture Diagram</span>
                      </div>
                    </div>
                  )}

                  <div className="prose prose-invert max-w-none">
                    <div className="text-gray-300 leading-relaxed text-base mb-14 font-light bg-white/[0.02] p-8 rounded-3xl border border-white/5">
                      {topic.content}
                    </div>

                    <div className="space-y-16">
                      {topic.sections?.map((section, idx) => (
                        <section key={idx} className="relative pl-10 border-l-2 border-white/10 group">
                          <div className="absolute left-[-7px] top-1 w-3 h-3 rounded-full bg-white/20 group-hover:bg-orange-500 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:shadow-orange-500/50"></div>
                          <h2 className="text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">{section.title}</h2>
                          <div className="text-gray-400 leading-relaxed mb-6 whitespace-pre-wrap font-light text-sm">{section.body}</div>

                          {section.list && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                              {section.list.map((item, i) => (
                                <div key={i} className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                                  <span className="text-xs text-gray-300 font-light leading-relaxed">{renderFormattedHelpText(item)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {section.diagram && (
                            <div className="mt-6 mb-6" data-testid="topic-diagram">
                              <div className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Diagram</div>
                              <div className="bg-black/90 rounded-2xl border border-white/10 p-6 font-mono text-xs text-emerald-300 overflow-x-auto shadow-inner">
                                <pre className="m-0 whitespace-pre">{section.diagram}</pre>
                              </div>
                            </div>
                          )}

                          {section.code && (
                            <div className="relative group/code mt-6">
                              <div className="absolute right-4 top-3 text-[9px] font-black text-white/30 uppercase tracking-widest">Mathematical / Code Formulation</div>
                              <div className="bg-black/90 rounded-2xl border border-white/10 p-6 font-mono text-xs text-orange-400 overflow-x-auto shadow-inner">
                                <pre className="m-0">{section.code}</pre>
                              </div>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>

                    {topic.related && (
                      <div className="mt-24 pt-12 border-t border-white/5">
                        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-8">Related Modules & Deep Dives</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {topic.related.filter(key => HELP_DATA[key]).map(key => (
                            <button
                              key={key}
                              onClick={() => setActiveTopic(key)}
                              className="p-6 bg-[#151515] border border-white/5 rounded-3xl hover:border-orange-500/40 transition-all text-left group hover:-translate-y-1"
                            >
                              <span className="text-[9px] text-orange-500 uppercase font-black block mb-1.5 tracking-widest">{HELP_DATA[key].category}</span>
                              <span className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors block leading-tight">{HELP_DATA[key].title}</span>
                              <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors">
                                Explore Guide <ChevronRight size={10} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>}
              </div>
            )}

            {view === 'blocks' && (
              <div className="max-w-4xl mx-auto">
                {selectedBlock ? (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-12 border-b border-white/5 pb-8">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="p-3.5 bg-orange-500 rounded-2xl text-black shadow-xl shadow-orange-500/20">
                            <DynamicIcon name={selectedBlock.icon} size={28} />
                          </div>
                          <div>
                            <h1 className="text-4xl font-black text-white tracking-tighter">{selectedBlock.name}</h1>
                            <div className="flex items-center gap-2.5 mt-1.5">
                              <span className="px-3 py-0.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black text-gray-400 uppercase tracking-widest">{selectedBlock.source} Component</span>
                              <span className={`px-3 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-widest ${getDomainColor(selectedBlock.domain)}`}>
                                {selectedBlock.domain} Domain
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Catalog Status</div>
                        <div className="text-emerald-400 font-bold text-xs flex items-center gap-1.5 justify-end">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                          {selectedHelp ? 'Full Reference Available' : 'Full Physics & Port Verified'}
                        </div>
                      </div>
                    </div>

                    {selectedHelp ? (
                      <BlockHelpPage
                        block={selectedBlock}
                        help={selectedHelp}
                        allBlocks={allBlocks}
                        onSelectBlock={setSelectedBlockKey}
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-8">
                          <section>
                            <SectionHeading><Box size={14} className="text-orange-500" /> Schematic Terminal Interface</SectionHeading>
                            <div className="bg-black/60 rounded-3xl border border-white/5 p-6 relative flex flex-col items-center justify-center min-h-[260px] shadow-inner">
                              <RealBlockShape block={selectedBlock} />
                              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-6">
                                {selectedBlock.ports?.length || 2} Connected Terminals ({selectedBlock.source === 'V-Lab' ? 'Acausal Energy Ports' : 'Causal Signal Ports'})
                              </span>
                            </div>
                          </section>

                          <section>
                            <SectionHeading>Configurable Parameters</SectionHeading>
                            <div className="space-y-2.5">
                              {Object.entries(selectedBlock.params || {}).map(([key, p]: [string, any]) => (
                                <div key={key} className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-white">{p.label || key}</span>
                                    <span className="text-[9px] text-gray-600 font-mono">{key}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-bold text-orange-400 font-mono">{String(p.value ?? p.default ?? '0')}</span>
                                    <span className="text-[9px] text-gray-500 ml-1.5 uppercase font-bold">{p.unit || ''}</span>
                                  </div>
                                </div>
                              ))}
                              {Object.keys(selectedBlock.params || {}).length === 0 && (
                                <div className="p-6 text-center text-xs text-gray-600 italic bg-white/[0.01] border border-dashed border-white/10 rounded-2xl">
                                  Standard ideal component with fixed internal characteristics.
                                </div>
                              )}
                            </div>
                          </section>
                        </div>

                        <div className="space-y-8">
                          <section>
                            <SectionHeading>Governing Physics & Transfer Equations</SectionHeading>
                            <div className="bg-black/60 rounded-3xl border border-white/5 p-6">
                              <p className="text-xs text-gray-400 leading-relaxed font-light mb-4">
                                {selectedBlock.description || 'This component participates in continuous simulation through simultaneous differential-algebraic equations solved by the numerical solver.'}
                              </p>
                              <div className="bg-orange-500/5 p-5 rounded-2xl border border-orange-500/20">
                                <h4 className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">Mathematical Formulation</h4>
                                <div className="font-mono text-xs text-white/90 italic whitespace-pre-wrap leading-relaxed">
                                  {selectedBlock.equation || (selectedBlock.domain === 'Electrical' ? 'V_p - V_n = I * R' : selectedBlock.domain === 'Mechanical' ? 'F = m * dv/dt + B * v' : 'Y = f(U)')}
                                </div>
                              </div>
                            </div>
                          </section>

                          <section>
                            <SectionHeading>How to Use & Button Steps in Canvas</SectionHeading>
                            <NumberedSteps steps={[
                              `Click and drag **${selectedBlock.name}** from the left component panel onto the canvas.`,
                              `Drag connection wires between terminal pins matching the **${selectedBlock.domain}** domain.`,
                              'Double-click the block on the canvas to open the sidebar parameters editor.',
                              'Click **Start Simulation** in the top toolbar to execute real-time solver steps.',
                            ]} />
                          </section>
                        </div>
                      </div>
                    )}

                    <section className="mt-10">
                      <button
                        onClick={() => {
                          setView('guide');
                          setActiveTopic(selectedBlock.source === 'V-Lab' ? 'vlab-fundamentals' : 'xbridges-ref');
                        }}
                        className="w-full py-3.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
                      >
                        <span>Read Full {selectedBlock.source} Theory Guide</span>
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </section>
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-white/[0.03] rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <Search size={32} className="text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight mb-2">Explore the Multi-Domain Block Catalog</h2>
                    <p className="text-gray-500 max-w-md leading-relaxed text-xs font-light mb-6">
                      Select any physical component or control block from the sidebar to inspect its pinouts, transfer equations, parameters, algorithm, execution order and step-by-step canvas usage.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                      {['Resistor', 'Capacitor', 'Inertia', 'DC Voltage Source', 'PID Controller', 'Clarke Transform', 'BLDC Motor'].map(sample => {
                        const target = allBlocks.find(b => b.name.toLowerCase().includes(sample.toLowerCase()));
                        return target ? (
                          <button
                            key={sample}
                            onClick={() => setSelectedBlockKey(blockKey(target))}
                            className="px-3 py-1.5 bg-white/5 hover:bg-orange-500/10 hover:text-orange-400 border border-white/10 rounded-xl text-[10px] font-bold text-gray-400 transition-colors"
                          >
                            {sample}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'items' && (
              <div className="max-w-4xl mx-auto">
                {selectedItem ? (
                  <ItemHelpPage item={selectedItem} onSelectItem={setSelectedItemId} />
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-white/[0.03] rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <Layers size={32} className="text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight mb-2">Diagram Items Reference</h2>
                    <p className="text-gray-500 max-w-md leading-relaxed text-xs font-light">
                      {allItems.length > 0
                        ? `Select a state, node, link or other drawable item from the sidebar (${allItems.length} documented) to read its shape, connection rules and semantics.`
                        : 'No diagram item documentation is available yet.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* FOOTER */}
        <footer className="h-14 border-t border-white/5 bg-[#111] flex items-center justify-between px-8 md:px-10 shrink-0">
          <div className="flex items-center gap-6">
            <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">ADIA Model-Based Design Engineering Suite</span>
            <div className="h-4 w-[1px] bg-white/5"></div>
            <div className="flex gap-4">
              <span className="text-[9px] text-gray-500 font-bold uppercase">250+ Multi-Domain Blocks Verified</span>
              <span className="text-[9px] text-gray-500 font-bold uppercase">HIL Real-Time Driver Ready</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-gray-600 font-bold">Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white font-mono text-[8px]">Esc</kbd> to exit</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HelpModal;
