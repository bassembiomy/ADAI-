import React from 'react';
import {
  Activity, ArrowUp, BarChart, Box, ChevronLeft, ChevronRight, ChevronUp, Cpu, Divide, Download,
  Eye, FileText, Filter, GraduationCap, Grid, Hash, Layers, LogIn, LogOut, Maximize, Maximize2, Minus,
  MinusCircle, Monitor, Network, Plus, RefreshCcw, RotateCw, Settings, Sigma, Square, ArrowRightCircle, ArrowLeftCircle,
  TrendingUp, Wind, X, Zap, ZapOff,
} from 'lucide-react';
import type { BlockHelpPort, BlockHelpReference } from '../../help/blockReference';
import { SymbolRenderer } from '../vlab/VLabSymbols';

// The same icon keys and fallbacks used by the X-Bridges palette/node. Unmapped keys display its Box fallback.
const paletteIcons = {
  square: Square, activity: Activity, plus: Plus, minus: Minus, x: X, divide: Divide,
  'chevron-up': ChevronUp, 'minus-circle': MinusCircle, maximize: Maximize, maximize2: Maximize2, sigma: Sigma,
  'arrow-right-circle': ArrowRightCircle, 'arrow-left-circle': ArrowLeftCircle,
  'bar-chart': BarChart, 'arrow-up': ArrowUp, grid: Grid, 'rotate-cw': RotateCw,
  'refresh-ccw': RefreshCcw, hash: Hash, 'trending-up': TrendingUp, monitor: Monitor,
  box: Box, download: Download, 'log-in': LogIn, 'log-out': LogOut,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, zap: Zap, settings: Settings,
  'zap-off': ZapOff, cpu: Cpu, layers: Layers, wind: Wind, filter: Filter, eye: Eye,
  'graduation-cap': GraduationCap, network: Network, integral: TrendingUp, 'file-text': FileText,
};

function PortLabels({ side, ports }: { side: NonNullable<BlockHelpPort['position']>; ports: BlockHelpPort[] }) {
  return <div data-side={side} className={`flex gap-2 ${side === 'left' || side === 'right' ? 'max-h-64 flex-col overflow-y-auto' : 'flex-wrap justify-center'}`}>
    {ports.map(port => <span key={`${port.id}:${port.direction}`} className="rounded border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]" title={`${port.direction} · ${port.domain ?? port.type ?? 'signal'}`}>
      {port.name} [{port.id}]
    </span>)}
  </div>;
}

/** Palette glyph + catalog terminal orientation, not a screenshot of a configured/resized instance. */
export function HelpBlockSymbol({ block }: { block: BlockHelpReference }) {
  const usesGenericIcon = block.source === 'X-Bridges' && !(block.icon in paletteIcons);
  const Icon = paletteIcons[block.icon as keyof typeof paletteIcons] ?? Box;
  const visiblePorts = block.ports.filter(port => !(block.typeId === 'Inport' && port.id === 'in') && !(block.typeId === 'Outport' && port.id === 'out'));
  const onSide = (side: NonNullable<BlockHelpPort['position']>) => visiblePorts.filter(port => port.position === side);
  return <figure aria-label={`Symbol for ${block.name}`} data-symbol={block.icon} className="my-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
    <div className="flex flex-col items-center gap-3">
      <PortLabels side="top" ports={onSide('top')} />
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
        <PortLabels side="left" ports={onSide('left')} />
        <div className="flex min-h-24 min-w-24 max-w-52 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-center text-[var(--text-primary)]">
          {block.source === 'V-Lab' ? <SymbolRenderer type={block.icon} color="var(--text-primary)" size={90} /> : <Icon size={32} aria-hidden="true" />}
          <span className="break-words text-xs font-semibold">{block.name}</span>
          {block.typeId === 'Note' && <span className="text-xs font-normal">Editable annotation text…</span>}
        </div>
        <PortLabels side="right" ports={onSide('right')} />
      </div>
      <PortLabels side="bottom" ports={onSide('bottom')} />
    </div>
    <figcaption className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
      {block.availability === 'palette-only' ? 'Palette glyph only — no executable factory or terminals are registered.'
        : block.availability === 'factory-only' ? 'Factory icon (not listed in the current palette).'
          : 'Palette glyph and default catalog terminal sides; an edited instance may be resized, rotated or have configurable ports.'}
      {usesGenericIcon && ' The live X-Bridges node uses a generic box fallback for this palette icon key.'}
      {' '}For port IDs, types and dimensions, use the table below.
    </figcaption>
  </figure>;
}
