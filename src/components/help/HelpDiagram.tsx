import React, { useId } from 'react';
import type { HelpDiagram as StructuredHelpDiagram } from '../../help/helpTypes';

function labelLines(label: string): string[] {
  return label.split('\n').flatMap(line => {
    const lines: string[] = [];
    let current = '';
    for (const word of line.split(/\s+/).filter(Boolean)) {
      if (current && current.length + word.length + 1 > 22) { lines.push(current); current = ''; }
      const parts = word.match(/.{1,22}/g) ?? [''];
      for (const part of parts.slice(0, -1)) { lines.push(part); }
      current = current ? `${current} ${parts.at(-1)}` : parts.at(-1)!;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  });
}

export function HelpDiagram({ diagram }: { diagram: StructuredHelpDiagram }) {
  const markerId = `help-arrow-${useId().replace(/:/g, '')}`;
  const sequence = diagram.kind === 'sequence';
  const positioned = diagram.nodes.some(node => node.x !== undefined || node.y !== undefined);
  const width = positioned ? Math.max(600, ...diagram.nodes.map(node => (node.x ?? 80) + 90)) : Math.max(600, diagram.nodes.length * (sequence ? 180 : 150));
  const height = sequence ? 100 + diagram.edges.length * 58 : Math.max(220, ...diagram.nodes.map(n => (n.y ?? 85) + Math.max(95, labelLines(n.label).length * 15)));
  const position = (id: string) => {
    const index = diagram.nodes.findIndex(node => node.id === id);
    return index < 0 ? undefined : diagram.nodes[index].x ?? 80 + index * (width - 160) / Math.max(1, diagram.nodes.length - 1);
  };
  return <figure className="my-6 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: sequence ? 540 : 480, width: '100%' }} role="img" aria-label={diagram.caption ?? `${diagram.kind} diagram`}>
      <title>{diagram.caption ?? `${diagram.kind} diagram`}</title>
      <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker><marker id={`${markerId}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="currentColor" /></marker></defs>
      <defs><marker id={`${markerId}-generalization`} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 12 6 L 0 12 z" fill="var(--surface-panel)" stroke="currentColor" /></marker></defs>
      {sequence && diagram.fragments?.map((fragment,i)=><g key={i} fill="none" stroke="var(--text-secondary)">
        <rect x={12} y={65+fragment.startEdge*58} width={width-24} height={(fragment.endEdge-fragment.startEdge+1)*58+16}/>
        <text x={20} y={80+fragment.startEdge*58} fill="var(--text-primary)" stroke="none" fontSize={12}>{fragment.operator}</text>
        {fragment.operands.map((operand,j)=><g key={j}>{j>0 && <line x1={12} x2={width-12} y1={65+operand.startEdge*58} y2={65+operand.startEdge*58} strokeDasharray="6 4"/>}<text x={60} y={73+operand.startEdge*58} fill="var(--text-primary)" stroke="none" fontSize={11}>[{operand.guard}]</text></g>)}
      </g>)}
      {diagram.subject && <g><rect x={180} y={8} width={width-190} height={height-16} fill="none" stroke="var(--text-secondary)" /><text x={195} y={28} fill="var(--text-primary)" fontSize={14}>{diagram.subject}</text></g>}
      {diagram.nodes.map(node => {
        const x = position(node.id)!;
        const y = node.y ?? 85;
        const lines = labelLines(node.label);
        const boxHeight = Math.max(48, lines.length * 15 + 18);
        return <g key={node.id}>
          {sequence && <line x1={x} y1={64} x2={x} y2={height - 10} stroke="currentColor" opacity={0.35} strokeDasharray="5 5" />}
          {node.role === 'actor' ? <g fill="none" stroke="var(--text-secondary)"><circle cx={x} cy={y-30} r={12}/><path d={`M ${x} ${y-18} v 40 M ${x-24} ${y} h 48 M ${x} ${y+22} l -20 25 M ${x} ${y+22} l 20 25`}/></g> : diagram.kind === 'usecase' ? <ellipse cx={x} cy={y} rx={72} ry={Math.max(34, boxHeight / 2)} fill="var(--surface-raised)" stroke="var(--text-secondary)" /> : <rect x={x - 70} y={sequence ? 10 : y-boxHeight/2} width={140} height={boxHeight} rx={8} fill="var(--surface-raised)" stroke="var(--text-secondary)" />}
          <text x={x} y={node.role === 'actor' ? y+65 : (sequence ? 10+boxHeight/2 : y) + 4-(lines.length-1)*7.5} textAnchor="middle" fill="var(--text-primary)" fontSize={12}>{lines.map((line, i) => <tspan key={i} x={x} dy={i ? 15 : 0}>{line}</tspan>)}</text>
        </g>;
      })}
      {diagram.edges.map((edge, index) => {
        const from = position(edge.from), to = position(edge.to);
        if (from === undefined || to === undefined) return null;
        const y = sequence ? 95 + index * 58 : 132 + (index % 3) * 28;
        const self = edge.from === edge.to;
        const isUseCase = diagram.kind === 'usecase';
        const direct = positioned && !sequence;
        const fromY = diagram.nodes.find(n => n.id === edge.from)?.y ?? 85;
        const toY = diagram.nodes.find(n => n.id === edge.to)?.y ?? 85;
        const dx = to-from, dy = toY-fromY;
        const sourceActor = diagram.nodes.find(n=>n.id===edge.from)?.role==='actor';
        const targetActor = diagram.nodes.find(n=>n.id===edge.to)?.role==='actor';
        const startScale = Math.max(Math.abs(dx)/(sourceActor?30:75), Math.abs(dy)/(sourceActor?70:35), 1);
        const endScale = Math.max(Math.abs(dx)/(targetActor?30:75), Math.abs(dy)/(targetActor?70:35), 1);
        const startX = from+dx/startScale, startY = fromY+dy/startScale;
        const endX = to-dx/endScale, endY = toY-dy/endScale;
        const marker = edge.notation === 'association' || edge.notation === 'conserving' ? undefined : `url(#${markerId}${edge.notation === 'generalization' ? '-generalization' : edge.notation === 'reply' || edge.notation === 'dependency' || edge.notation === 'async' ? '-open' : ''})`;
        const dash = edge.notation === 'reply' || edge.notation === 'dependency' ? '6 4' : undefined;
        return <g key={index} data-notation={edge.notation ?? 'flow'} style={{ color: 'var(--focus-ring)' }}>
          {self ? <path d={`M ${from} ${y} h 50 v 24 h -50`} fill="none" stroke="currentColor" strokeDasharray={dash} markerEnd={marker} /> : <line x1={direct ? startX : from} y1={direct ? startY : y} x2={direct ? endX : to} y2={direct ? endY : y} stroke="currentColor" strokeDasharray={dash} markerEnd={marker} />}
          {!sequence && !direct && <><line x1={from} y1={fromY+23} x2={from} y2={y} stroke="currentColor" opacity={0.5} /><line x1={to} y1={toY+23} x2={to} y2={y} stroke="currentColor" opacity={0.5} /></>}
          <text x={self ? from + 55 : (from + to) / 2 + (direct && dx === 0 ? 12 : 0)} y={(direct ? (fromY+toY)/2 : y) - 8} textAnchor={self || (direct && dx === 0) ? 'start' : 'middle'} fill="currentColor" fontSize={11}>{sequence ? `${index + 1}. ` : ''}{edge.label ?? ''}</text>
        </g>;
      })}
    </svg>
    {diagram.caption && <figcaption className="mt-3 text-sm text-[var(--text-secondary)]">{diagram.caption}</figcaption>}
  </figure>;
}
