import React, { useId } from 'react';
import type { NotationItem } from '../../help/notationReference';

/** Small explanatory glyphs, not screenshots or a second diagram editor. */
function NotationGlyph({ item }: { item: NotationItem }) {
  const id = useId().replace(/:/g, '');
  const ink = 'var(--text-primary)';
  const fill = 'var(--surface-raised)';
  const outline = { stroke: ink, strokeWidth: 2, fill };
  const text = (label: string, y = 36) => <text x="60" y={y} textAnchor="middle" fill={ink} fontSize="10" fontWeight="600">{label}</text>;
  const marker = (name: string) => `url(#${id}-${name})`;
  const startStyle = item.start === 'diamond' || item.start === 'triangle' || item.start === 'circle' || item.start === 'filledArrow' ? ink : fill;
  const glyph = (() => {
    switch (item.glyph) {
      case 'filledCircle': return <circle cx="60" cy="33" r="13" fill={ink} />;
      case 'bullseye': return <><circle cx="60" cy="33" r="17" {...outline} /><circle cx="60" cy="33" r="10" fill={ink} /></>;
      case 'crossCircle': return <><circle cx="60" cy="33" r="17" {...outline} /><path d="M52 25l16 16m0-16L52 41" stroke={ink} strokeWidth="2" /></>;
      case 'diamond': return <path d="M60 12 85 33 60 54 35 33Z" {...outline} />;
      case 'bar': return <rect x="27" y="29" width="66" height="9" fill={ink} />;
      case 'actor': return <g stroke={ink} strokeWidth="2" fill="none"><circle cx="60" cy="14" r="7"/><path d="M60 21v20M42 31h36M60 41 45 57m15-16 15 16"/></g>;
      case 'useCase': case 'process': return <><ellipse cx="60" cy="33" rx="47" ry="22" {...outline} />{text(item.glyph === 'process' ? 'Process' : 'Use Case', item.label === 'Extension point' ? 28 : 36)}{item.label === 'Extension point' && <><path d="M22 40h76" stroke={ink} />{text('extension points', 51)}</>}</>;
      case 'package': return <><path d="M12 19h39l9 7h48v31H12Z" {...outline} />{text('Package', 44)}</>;
      case 'subject': return <><rect x="16" y="7" width="88" height="52" {...outline} /><path d="M16 22h88" stroke={ink} />{text('Subject', 18)}</>;
      case 'compartment': case 'requirement': return <><rect x="13" y="6" width="94" height="53" {...outline} /><path d="M13 28h94" stroke={ink} />{text(item.glyph === 'requirement' ? '«requirement»' : item.label.includes('Constraint') ? '«constraint»' : item.label.includes('Interface') ? '«interfaceBlock»' : item.label.includes('Enumeration') ? '«enumeration»' : '«block»', 21)}{text(item.glyph === 'requirement' ? 'ID | Text' : 'name: Type', 46)}</>;
      case 'part': case 'rect': return <><rect x="17" y="16" width="86" height="36" {...outline} />{text(item.glyph === 'part' ? 'use: Type' : 'typed value')}</>;
      case 'object': return <><rect x="13" y="14" width="94" height="40" rx="8" {...outline} />{text('«Object»')}</>;
      case 'roundedRect': case 'state': return <><rect x="16" y="12" width="88" height="44" rx="12" {...outline} />{item.glyph === 'state' && <path d="M16 30h88" stroke={ink} />}{text(item.glyph === 'state' ? 'State' : item.label.length > 15 ? `${item.label.slice(0, 14)}…` : item.label, item.glyph === 'state' ? 24 : 36)}</>;
      case 'history': return <><circle cx="60" cy="33" r="22" {...outline} />{text('H*')}</>;
      case 'port': return <><rect x="22" y="17" width="76" height="34" {...outline} /><rect x="18" y="28" width="10" height="10" {...outline} /><rect x="92" y="28" width="10" height="10" {...outline} /></>;
      case 'pin': return <><rect x="22" y="17" width="75" height="34" rx="8" {...outline} /><rect x="91" y="27" width="12" height="12" {...outline} />{text('Action')}</>;
      case 'lifeline': return <><rect x="25" y="4" width="70" height="24" {...outline} />{text('Participant', 21)}<path d="M60 28v35" stroke={ink} strokeWidth="2" strokeDasharray="5 4" /></>;
      case 'fragment': return <><rect x="9" y="7" width="102" height="54" {...outline} /><path d="M9 26h31l7-10H9M9 39h102" fill="none" stroke={ink} strokeDasharray="5 3" />{text(item.label.includes('ref') ? 'ref' : 'alt', 20)}</>;
      case 'bracket': return <><path d="M35 12h12v42H35" stroke={ink} strokeWidth="2" fill="none" /><text x="56" y="37" fill={ink} fontSize="10">100 ms</text></>;
      case 'matrix': return <g>{[0,1,2].flatMap(row => [0,1,2].map(col => <rect key={`${row}-${col}`} x={17+col*29} y={8+row*17} width="28" height="16" fill={row === 1 && col === 2 ? ink : fill} stroke={ink} strokeWidth="1"/>))}</g>;
      case 'tree': return <g stroke={ink} strokeWidth="2" fill="none"><path d="M26 13v38h13M26 24h13M26 37h13"/><rect x="39" y="14" width="58" height="12" rx="2"/><rect x="39" y="32" width="53" height="12" rx="2"/><rect x="39" y="47" width="43" height="11" rx="2"/></g>;
      case 'line': return <>
        <defs>
          <marker id={`${id}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke={ink} strokeWidth="1.5" /></marker>
          <marker id={`${id}-filled`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 10 5 0 10Z" fill={ink} /></marker>
          <marker id={`${id}-triangle`} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M0 0 12 6 0 12Z" fill={fill} stroke={ink} /></marker>
          <marker id={`${id}-start`} viewBox="0 0 12 12" refX="1" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
            {item.start === 'circle' ? <circle cx="6" cy="6" r="4" fill={ink} /> : item.start === 'filledArrow'
              ? <path d="M0 0 12 6 0 12Z" fill={ink} />
              : item.start?.toLowerCase().includes('diamond') ? <path d="M0 6 6 0 12 6 6 12Z" fill={startStyle} stroke={ink} />
                : <path d="M0 0 12 6 0 12Z" fill={startStyle} stroke={ink} />}
          </marker>
        </defs>
        <line x1="18" y1="33" x2={item.end === 'cross' ? 96 : 102} y2="33" stroke={ink} strokeWidth="2" strokeDasharray={item.line === 'dashed' ? '6 4' : undefined} markerStart={item.start ? marker('start') : undefined} markerEnd={item.end && item.end !== 'cross' ? marker(item.end) : undefined} />
        {item.end === 'cross' && <path d="M96 27l12 12m0-12-12 12" stroke={ink} strokeWidth="2"/>}
      </>;
    }
  })();
  return <svg viewBox="0 0 120 66" width="120" height="66" role="img" aria-label={`${item.label}: ${item.appearance}`} className="shrink-0"><title>{`${item.label}: ${item.appearance}`}</title>{glyph}</svg>;
}

export function HelpNotation({ items }: { items: readonly NotationItem[] }) {
  return <div className="my-4 grid gap-3 lg:grid-cols-2" aria-label="Notation examples">
    {items.map(item => <figure key={item.label} className="flex gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3">
      <NotationGlyph item={item} />
      <figcaption className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
        <strong className="block text-sm text-[var(--text-primary)]">{item.label}</strong>
        <span className="block">Shape: {item.appearance}</span>
        <span className="block">Use: {item.meaning}</span>
        <span className="block">Connect: {item.connect}</span>
      </figcaption>
    </figure>)}
  </div>;
}
