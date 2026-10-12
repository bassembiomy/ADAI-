import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { HELP_DATA } from '../../HelpData';
import { getBlockHelpReferences } from '../../help/blockReference';
import { getAdjacentHelpTopics, helpSectionId, searchHelpTopics } from '../../help/helpNavigation';
import type { HelpTopic } from '../../help/helpTypes';
import { HelpDiagram } from './HelpDiagram';
import { SoftwareArchitectureExplorer } from './SoftwareArchitectureExplorer';
import './help.css';

export interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
  initialSection?: string;
  topics?: Record<string, HelpTopic>;
}

function InlineHelpText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith('`') && part.endsWith('`') ? <code key={index} className="rounded bg-[var(--surface-raised)] px-1">{part.slice(1, -1)}</code> : part)}</>;
}

function HelpText({ text }: { text: string }) {
  return <div className="space-y-3 text-sm leading-7 text-[var(--text-secondary)]">{text.split(/```/g).map((part, index) => index % 2
    ? <pre key={index} className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] p-4 font-mono text-xs whitespace-pre">{part.replace(/^(?:[a-z]+)?\n/, '')}</pre>
    : <div key={index} className="whitespace-pre-wrap"><InlineHelpText text={part} /></div>)}</div>;
}

const controlClass = 'ui-control rounded-lg px-3 py-2 text-sm';
const selectedClass = 'border-[var(--focus-ring)] bg-[color-mix(in_srgb,var(--focus-ring)_12%,var(--surface-panel))]';
const elementCategories = new Set(['SysML Elements', 'SysML Relationships', 'Behavior Elements']);
const referenceCategories = new Set([...elementCategories, 'Properties', 'AI Actions', 'Workspace Controls', 'Application controls', 'Component References', 'Block Reference']);
const guideCategoryOrder = ['Fundamentals', 'Getting Started', 'Diagram Reference', 'Architecture', 'State Machine', 'X-Bridges', 'V-Lab', 'Control Systems', 'Analysis', 'Deployment', 'Integrations', 'Examples', 'System'];

function ReferenceTable({ table }: { table: NonNullable<HelpTopic['sections']>[number]['table'] }) {
  if (!table?.rows.length) return null;
  return <div className="my-4 overflow-x-auto rounded-lg border border-[var(--border-default)]"><table className="w-full text-left text-sm">
    <thead className="bg-[var(--surface-raised)]"><tr>{table.columns.map(column => <th key={column} scope="col" className="p-3 font-semibold">{column}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, i) => <tr key={i} className="border-t border-[var(--border-default)] align-top">{row.map((cell, j) => j === 0 ? <th key={j} scope="row" className="p-3 font-medium"><InlineHelpText text={cell} /></th> : <td key={j} className="p-3 leading-6 text-[var(--text-secondary)]"><InlineHelpText text={cell} /></td>)}</tr>)}</tbody>
  </table></div>;
}

export function HelpModal({ isOpen, onClose, initialTopic, initialSection, topics = HELP_DATA }: HelpModalProps) {
  const [activeTopic, setActiveTopic] = useState(initialTopic ?? 'getting-started');
  const [query, setQuery] = useState('');
  const [blockMode, setBlockMode] = useState(false);
  const [elementMode, setElementMode] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [architecture, setArchitecture] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const blocks = useMemo(() => isOpen ? getBlockHelpReferences() : [], [isOpen]);
  const topicId = topics[activeTopic] ? activeTopic : 'getting-started';
  const topic = topics[topicId];
  const selectedBlock = blocks.find(block => block.id === selectedBlockId);
  const searchResults = useMemo(() => searchHelpTopics(topics, query), [topics, query]);
  const categories = useMemo(() => {
    const visible = [...new Set(Object.values(topics).map(item => item.category))].filter(category => elementMode ? elementCategories.has(category) : !referenceCategories.has(category));
    const rank = (category: string) => guideCategoryOrder.includes(category) ? guideCategoryOrder.indexOf(category) : guideCategoryOrder.length;
    return elementMode ? visible : visible.sort((a, b) => rank(a) - rank(b));
  }, [topics, elementMode]);
  const blockCategories = useMemo(() => [...new Set(blocks.filter(block => sourceFilter === 'All' || block.source === sourceFilter).map(block => block.category))].sort(), [blocks, sourceFilter]);
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filteredBlocks = blocks.filter(block => (sourceFilter === 'All' || block.source === sourceFilter)
    && (categoryFilter === 'All' || block.category === categoryFilter)
    && words.every(word => `${block.name} ${block.typeId} ${block.source} ${block.category} ${block.description} ${block.behavior} ${block.example} ${block.equation ?? ''} ${JSON.stringify(block.parameters)} ${JSON.stringify(block.ports)}`.toLocaleLowerCase().includes(word)));
  const navigationTopics = useMemo(() => Object.fromEntries(Object.entries(topics).filter(([, item]) => categories.includes(item.category))), [topics, categories]);
  const adjacent = getAdjacentHelpTopics(navigationTopics, topicId);

  const scrollToSection = (sectionId?: string) => {
    if (!sectionId) { contentRef.current?.scrollTo?.({ top: 0 }); return; }
    const element = document.getElementById('help-section-'+sectionId);
    element?.scrollIntoView?.({ block: 'start' });
  };
  const openTopic = (id: string, sectionId?: string) => {
    if (!topics[id]) return;
    setActiveTopic(id); setBlockMode(false); setArchitecture(false);
    requestAnimationFrame(() => scrollToSection(sectionId));
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveTopic(initialTopic ?? 'getting-started'); setBlockMode(false); setElementMode(false); setArchitecture(false);
    setQuery(''); setSelectedBlockId(null);
    const frame = requestAnimationFrame(() => scrollToSection(initialSection));
    return () => cancelAnimationFrame(frame);
  }, [isOpen, initialTopic, initialSection]);

  useEffect(() => {
    if (!isOpen) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => priorFocus?.focus?.();
  }, [isOpen]);

  if (!isOpen || !topic) return null;
  return <div data-help-feature="live:components/help/HelpModal:84e4feee74c2" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-3 md:p-8" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div data-help-feature="live:components/help/HelpModal:17f503c89b06" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="adia-help-title" className="adia-help flex h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-canvas)] text-[var(--text-primary)] shadow-2xl" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,a[href],[tabindex="0"]') ?? []);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
        <h2 id="adia-help-title" className="mr-3 flex items-center gap-2 font-bold"><BookOpen size={20} /> ADIA Help</h2>
        <label className="relative flex min-w-48 flex-1 items-center"><Search size={16} className="absolute left-3 text-[var(--text-secondary)]" /><input data-help-feature="live:components/help/HelpModal:992a4d2572d1" ref={searchRef} type="search" aria-label="Search Help" placeholder="Search modules, commands, properties and blocks…" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-canvas)] py-2 pl-10 pr-3 text-sm" /></label>
        <button data-help-topic="diagram-reference" className={`${controlClass} ${!blockMode && !elementMode ? selectedClass : ''}`} aria-pressed={!blockMode && !elementMode} onClick={() => { setBlockMode(false); setElementMode(false); setArchitecture(false); }}>Documentation</button>
        <button data-help-topic="diagram-reference" className={`${controlClass} ${elementMode ? selectedClass : ''}`} aria-pressed={elementMode} onClick={() => { setBlockMode(false); setElementMode(true); setArchitecture(false); setQuery(''); }}>Element reference</button>
        <button data-help-feature="live:components/help/HelpModal:67f9dc166de3" className={`${controlClass} ${blockMode ? selectedClass : ''}`} aria-pressed={blockMode} onClick={() => { setBlockMode(true); setElementMode(false); setArchitecture(false); }}>Block reference</button>
        <button data-help-feature="live:components/help/HelpModal:09c5dbfae3b8" className={controlClass} aria-label="Close Help" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside aria-label={blockMode ? 'Block catalog' : elementMode ? 'Element catalog' : 'Help topics'} className="max-h-40 w-full shrink-0 overflow-y-auto border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-4 md:max-h-none md:w-72 md:border-b-0 md:border-r">
          {blockMode ? <>
            <label className="mb-3 block text-xs">Source<select data-help-feature="live:components/help/HelpModal:b7d960843f6e" aria-label="Block source" className={`${controlClass} mt-1 w-full bg-[var(--surface-canvas)]`} value={sourceFilter} onChange={event => { setSourceFilter(event.target.value); setCategoryFilter('All'); }}><option>All</option><option>X-Bridges</option><option>V-Lab</option></select></label>
            <label className="mb-3 block text-xs">Category<select data-help-feature="live:components/help/HelpModal:22e21793ae47" aria-label="Block category" className={`${controlClass} mt-1 w-full bg-[var(--surface-canvas)]`} value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option>All</option>{blockCategories.map(category => <option key={category}>{category}</option>)}</select></label>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">{filteredBlocks.length} references</p>
            <div className="space-y-1">{filteredBlocks.map(block => <button data-help-feature="live:components/help/HelpModal:963004dc3b8c" key={block.id} aria-current={selectedBlockId === block.id ? 'page' : undefined} className={`${controlClass} w-full text-left ${selectedBlockId === block.id ? selectedClass : ''}`} onClick={() => { setSelectedBlockId(block.id); contentRef.current?.scrollTo?.({ top: 0 }); }}><span className="block font-medium">{block.name}</span><span className="text-xs text-[var(--text-secondary)]">{block.source} · {block.category}</span></button>)}</div>
            {!filteredBlocks.length && <p role="status">No blocks match your search or filter.</p>}
          </> : query.trim() ? <>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">{searchResults.length} matching topics and sections</p>
            {searchResults.map(result => <button data-help-feature="live:components/help/HelpModal:6b21118f7870" key={`${result.topicId}:${result.sectionId ?? ''}`} className={`${controlClass} mb-2 w-full text-left`} onClick={() => openTopic(result.topicId, result.sectionId)}><span className="block font-medium">{result.title}</span><span className="text-xs text-[var(--text-secondary)]">{result.excerpt}</span></button>)}
            {!searchResults.length && <p role="status">No Help results. Try a module, command, property or block name.</p>}
          </> : <>{!elementMode && <p className="mb-4 text-xs leading-5 text-[var(--text-muted)]">Browse guides below. Search also includes every property, command and reference entry.</p>}{categories.map(category => <nav key={category} aria-label={category} className="mb-6"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">{category}</h3>{Object.entries(topics).filter(([, item]) => item.category === category).map(([id, item]) => <button data-help-feature="live:components/help/HelpModal:f627721dbe61" key={id} aria-current={id === topicId ? 'page' : undefined} className={`${controlClass} mb-1 w-full text-left ${id === topicId ? selectedClass : ''}`} onClick={() => openTopic(id)}>{item.title}</button>)}</nav>)}</>}
        </aside>
        <main ref={contentRef} className="min-w-0 flex-1 overflow-y-auto p-6 md:p-10">
          {blockMode ? selectedBlock ? <article className="mx-auto max-w-5xl">
            <p className="mb-2 text-xs text-[var(--text-secondary)]">{selectedBlock.source} / {selectedBlock.category} / {selectedBlock.typeId}</p>
            <h1 className="mb-4 text-3xl font-bold">{selectedBlock.name}</h1>
            <nav aria-label="On this page" className="my-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4"><h2 className="mb-2 font-bold">On this page</h2><div className="flex flex-wrap gap-2">{['Purpose', 'Behavior', 'Ports', 'Parameters', 'Example'].map(label => <button data-help-topic="xbridges-ref" key={label} className={controlClass} onClick={() => scrollToSection(`block-${label.toLowerCase()}`)}>{label}</button>)}</div></nav>
            <h2 id="help-section-block-purpose" className="mb-2 mt-6 scroll-mt-6 text-xl font-semibold">Purpose</h2><HelpText text={selectedBlock.description} />
            <h2 id="help-section-block-behavior" className="mb-2 mt-6 scroll-mt-6 text-xl font-semibold">Behavior</h2><HelpText text={selectedBlock.behavior} />
            {selectedBlock.equation && <pre className="my-4 overflow-auto rounded-xl bg-[var(--surface-panel)] p-4 font-mono text-xs whitespace-pre-wrap">{selectedBlock.equation}</pre>}
            <h2 id="help-section-block-ports" className="mb-2 mt-6 scroll-mt-6 text-xl font-semibold">Inputs, outputs and ports</h2>
            {(selectedBlock.across || selectedBlock.through) && <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] p-4 text-sm leading-7 text-[var(--text-secondary)]"><p><strong>Across quantity:</strong> {selectedBlock.across}</p><p><strong>Through quantity:</strong> {selectedBlock.through}</p><p>Conserving connections couple these quantities. Follow the component's documented orientation for positive flow.</p></div>}
            <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Port</th><th className="p-2">Direction / domain</th><th className="p-2">Type</th></tr></thead><tbody>{selectedBlock.ports.map((port, i) => <tr key={`${port.id}:${i}`} className="border-t border-[var(--border-default)]"><td className="p-2">{port.name ?? port.id}<code className="ml-2 text-xs text-[var(--text-muted)]">{port.id}</code></td><td className="p-2">{port.direction ?? port.domain ?? 'Conserving'}</td><td className="p-2">{port.type ?? port.domain ?? 'Physical'}{port.unit && ` / ${port.unit}`}{port.width && ` / width ${port.width}`}{port.dimensions && ` / shape ${port.dimensions.join(' × ')}`}{port.composite && ` / ${port.composite}`}{port.channelNames?.length ? ` / channels ${port.channelNames.join(', ')}` : ''}{port.quantity && ` / ${port.quantity}`}</td></tr>)}</tbody></table></div>
            {!selectedBlock.ports.length && <p className="text-sm">This block has no connection ports.</p>}
            <h2 id="help-section-block-parameters" className="mb-2 mt-6 scroll-mt-6 text-xl font-semibold">Parameters</h2>
            <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Parameter</th><th className="p-2">Default / unit</th><th className="p-2">Meaning and valid values</th></tr></thead><tbody>{selectedBlock.parameters.map(parameter => <tr key={parameter.name} className="border-t border-[var(--border-default)]"><td className="p-2">{parameter.label ?? parameter.name}</td><td className="p-2"><code>{typeof parameter.defaultValue === 'object' ? JSON.stringify(parameter.defaultValue) : String(parameter.defaultValue)}</code> {parameter.unit}</td><td className="p-2">{parameter.description}{parameter.bounds && <div className="mt-1 text-xs">{parameter.bounds.min !== undefined && `Minimum ${parameter.bounds.exclusiveMin ? '>' : '≥'} ${parameter.bounds.min}. `}{parameter.bounds.max !== undefined && `Maximum ${parameter.bounds.exclusiveMax ? '<' : '≤'} ${parameter.bounds.max}. `}{parameter.bounds.nonZero && 'Must be nonzero.'}</div>}</td></tr>)}</tbody></table></div>
            {!selectedBlock.parameters.length && <p className="text-sm">No configurable parameters.</p>}
            <h2 id="help-section-block-example" className="mb-2 mt-6 scroll-mt-6 text-xl font-semibold">Example</h2><HelpText text={selectedBlock.example} />
            {selectedBlock.diagram && <HelpDiagram diagram={selectedBlock.diagram} />}
            <button data-help-feature="live:components/help/HelpModal:f18426c65bd3" className={`${controlClass} mt-8`} onClick={() => openTopic(selectedBlock.source === 'V-Lab' ? 'vlab-fundamentals' : 'xbridges-ref')}>Read Full {selectedBlock.source} Theory Guide</button>
          </article> : <div className="mx-auto mt-12 max-w-xl"><h1 className="mb-4 text-3xl font-bold">Block and component reference</h1><p className="text-[var(--text-secondary)]">Choose a block to see its purpose, ports, parameters, behavior, example and diagram. The catalog follows the application's live registries.</p></div> : architecture ? <SoftwareArchitectureExplorer onClose={() => setArchitecture(false)} /> : <article className="mx-auto max-w-5xl">
            <p className="mb-2 text-xs text-[var(--text-secondary)]">ADIA Docs / {topic.category}</p><h1 className="mb-4 text-3xl font-bold">{topic.title}</h1>
            <p className="mb-6 text-lg text-[var(--text-secondary)]">{topic.description}</p>{topic.content !== topic.description && <HelpText text={topic.content} />}
            {topicId === 'software-architecture' && <button data-help-feature="live:components/help/HelpModal:6aaab003a445" className={`${controlClass} my-6`} onClick={() => setArchitecture(true)}>Open Architecture Explorer</button>}
            {topic.image && <img src={topic.image} alt={topic.title} className="my-6 max-h-96 w-full rounded-xl object-contain" />}
            <nav aria-label="On this page" className="my-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4"><h2 className="mb-2 font-bold">On this page</h2><div className="flex flex-wrap gap-2">{topic.sections?.map((section, index) => <button data-help-feature="live:components/help/HelpModal:324900354f85" key={index} className={controlClass} onClick={() => scrollToSection(helpSectionId(section, index))}>{section.title}</button>)}</div></nav>
            {topic.sections?.map((section, index) => <section key={helpSectionId(section, index)} id={`help-section-${helpSectionId(section, index)}`} className="scroll-mt-6 border-t border-[var(--border-default)] py-6"><h2 className="mb-4 text-xl font-bold">{section.title}</h2><HelpText text={section.body} /><ReferenceTable table={section.table} />{section.list && <ul className="my-4 list-disc space-y-2 pl-6 text-sm leading-7 text-[var(--text-secondary)]">{section.list.map((item, i) => <li key={i}><InlineHelpText text={item} /></li>)}</ul>}{section.code && <pre className="my-4 overflow-x-auto rounded-xl bg-[var(--surface-panel)] p-4 font-mono text-xs whitespace-pre">{section.code}</pre>}{section.diagram && <HelpDiagram diagram={section.diagram} />}</section>)}
            {!!topic.related?.length && <nav aria-label="Related topics" className="mt-8 border-t border-[var(--border-default)] pt-5"><h2 className="mb-3 text-lg font-bold">Related topics</h2><div className="flex flex-wrap gap-2">{topic.related.filter(id => topics[id]).map(id => <button data-help-feature="live:components/help/HelpModal:f627721dbe61" key={id} className={controlClass} onClick={() => openTopic(id)}>{topics[id].title}</button>)}</div></nav>}
            <nav aria-label="Previous and next topics" className="mt-8 flex justify-between gap-4">{adjacent.previous ? <button data-help-feature="live:components/help/HelpModal:c46385b163b0" className={controlClass} onClick={() => openTopic(adjacent.previous!)}><ChevronLeft size={14} className="mr-1 inline" />Previous: {topics[adjacent.previous].title}</button> : <span />}{adjacent.next && <button data-help-feature="live:components/help/HelpModal:04ac6564bcbc" className={controlClass} onClick={() => openTopic(adjacent.next!)}>Next: {topics[adjacent.next].title}<ChevronRight size={14} className="ml-1 inline" /></button>}</nav>
          </article>}
        </main>
      </div>
    </div>
  </div>;
}
