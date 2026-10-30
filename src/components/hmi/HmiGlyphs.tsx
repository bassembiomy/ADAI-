import React, { useId } from 'react';
import {
  HMI_GLYPHS, formatCharacterLcdLines, layoutSegmentCells,
  type HmiIconId, type HmiLcdTheme, type HmiLcdThemeDef, type HmiSegmentCell, type HmiSegmentStyle,
} from '../../features/hmi/hmiGlyphs';
import type { HmiAnnunciator, HmiComponentType } from '../../types/sysml_types';

/** Vector previews shown next to each palette entry. */
export const HMI_PALETTE_ICONS: Record<HmiComponentType, HmiIconId> = {
  toggle: 'power', button: 'stop', slider: 'minus', input: 'plus', rotary: 'refresh', 'hybrid-rotary': 'refresh', encoder: 'gear', 'mode-selector': 'gear', 'mode-icon': 'light',
  checkbox: 'check', 'combo-box': 'arrow-down', 'radio-group': 'info', 'rocker-switch': 'bolt', 'slide-switch': 'arrow-right', knob: 'refresh', 'vertical-slider': 'arrow-up',
  'latching-button': 'lock', 'pulse-button': 'bolt', 'simulation-command': 'play',
  lamp: 'light', led: 'light', lcd: 'eye', gauge: 'timer', buzzer: 'bell', oled: 'eye', 'half-gauge': 'timer', 'quarter-gauge': 'timer', 'linear-gauge': 'minus', 'vertical-gauge': 'arrow-up',
  'dashboard-scope': 'signal', 'xy-plot': 'signal', 'multi-state-image': 'eye', 'active-state-indicator': 'check', 'alarm-list': 'warning', 'progress-bar': 'minus', thermometer: 'thermometer',
  'tank-level': 'droplet', 'seven-segment': 'clock', 'fourteen-segment': 'clock', 'sixteen-segment': 'clock', 'dot-matrix': 'info', 'character-lcd': 'info', 'segment-lcd': 'clock',
  'icon-indicator': 'power', 'led-bar': 'signal', label: 'info', image: 'eye', panel: 'home', tabs: 'arrow-right',
};

const cleanId = (raw: string) => raw.replace(/[^A-Za-z0-9_-]/g, '');
export function resolveLcdTheme(id: string | undefined, fallback: HmiLcdTheme): { id: HmiLcdTheme; theme: HmiLcdThemeDef } {
  const themeId = (id && Object.prototype.hasOwnProperty.call(HMI_GLYPHS.lcdThemes, id) ? id : fallback) as HmiLcdTheme;
  return { id: themeId, theme: HMI_GLYPHS.lcdThemes[themeId] };
}

export function HmiIcon({ id, size = 24, x, y, className, style, title }: { id: string | undefined; size?: number; x?: number; y?: number; className?: string; style?: React.CSSProperties; title?: string }) {
  const def = id ? (HMI_GLYPHS.icons as Record<string, { paths: string[] } | undefined>)[id] : undefined;
  if (!id || !def) return null;
  return <svg data-icon={id} className={className ? `hmi-icon ${className}` : 'hmi-icon'} x={x} y={y} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>{def.paths.map((d, i) => <path key={i} d={d} />)}</svg>;
}

/** Radial-gradient lens with a glow halo when active, optionally carrying a vector icon. */
export function Bulb({ active, icon, emoji, shape = 'lamp' }: { active: boolean; icon?: string; emoji?: string; shape?: 'lamp' | 'led' }) {
  const uid = cleanId(useId());
  return <svg className={`hmi-bulb hmi-bulb-${shape}`} viewBox="0 0 64 64" aria-hidden="true" data-bulb={shape}>
    <defs>
      <radialGradient id={`${uid}-gloss`} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffffff" stopOpacity="0.85" /><stop offset="0.45" stopColor="#ffffff" stopOpacity="0.12" /><stop offset="1" stopColor="#000000" stopOpacity="0.25" /></radialGradient>
      <radialGradient id={`${uid}-halo`} cx="0.5" cy="0.5" r="0.5"><stop offset="0.55" className="hmi-bulb-halo-stop" stopOpacity="0.55" /><stop offset="1" className="hmi-bulb-halo-stop" stopOpacity="0" /></radialGradient>
    </defs>
    {active && <circle cx="32" cy="32" r="31" fill={`url(#${uid}-halo)`} />}
    <circle className="hmi-bulb-ring" cx="32" cy="32" r="22" />
    <circle className="hmi-bulb-lens" cx="32" cy="32" r="19" />
    <circle cx="32" cy="32" r="19" fill={`url(#${uid}-gloss)`} />
    {emoji && <text className="hmi-bulb-emoji" x="32" y="32" textAnchor="middle" dominantBaseline="central" fontSize="22">{emoji}</text>}
    {!emoji && icon && icon !== 'none' && <HmiIcon id={icon} size={24} x={20} y={20} className="hmi-bulb-icon" />}
  </svg>;
}

function GlassFrame({ uid, theme, themeId, width, height, bezel, radius, children }: { uid: string; theme: HmiLcdThemeDef; themeId: string; width: number; height: number; bezel: number; radius: number; children: React.ReactNode }) {
  return <>
    <defs>
      {theme.glow && <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>}
      <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.16" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0.02" /><stop offset="1" stopColor="#000000" stopOpacity="0.14" /></linearGradient>
    </defs>
    <g data-lcd-theme={themeId}>
      <rect x="0" y="0" width={width} height={height} rx={radius} fill={theme.bezel} />
      <rect x={bezel} y={bezel} width={width - bezel * 2} height={height - bezel * 2} rx={radius * 0.6} fill={theme.background} />
      {children}
      <rect x={bezel} y={bezel} width={width - bezel * 2} height={height - bezel * 2} rx={radius * 0.6} fill={`url(#${uid}-sheen)`} pointerEvents="none" />
    </g>
  </>;
}

const SEGMENT_PITCH = 50;
const SKEW_SHIFT = Math.tan(8 * Math.PI / 180);
const segmentWidth = (cells: number, skew: boolean) => cells * SEGMENT_PITCH - 6 + (skew ? 9 : 0);

function SegmentCells({ cells, style, theme, uid, skew }: { cells: HmiSegmentCell[]; style: HmiSegmentStyle; theme: HmiLcdThemeDef; uid: string; skew: boolean }) {
  const defs = Object.entries(HMI_GLYPHS.segments[style].paths);
  const glow = theme.glow ? `url(#${uid}-glow)` : undefined;
  const content = cells.map((cell, i) => <g key={i} data-segment-cell="" data-char={cell.char} transform={`translate(${i * SEGMENT_PITCH} 0)`}>
    {defs.map(([key, d]) => <path key={key} d={d} fill={theme.off} />)}
    <circle cx="45" cy="60" r="3.2" fill={theme.off} />
    <g filter={glow}>
      {defs.filter(([key]) => cell.segments.includes(key)).map(([key, d]) => <path key={key} data-segment-on="true" d={d} fill={theme.on} />)}
      {cell.dp && <circle data-dp-on="true" cx="45" cy="60" r="3.2" fill={theme.on} />}
      {cell.colon && <g data-colon-on="true" fill={theme.on}><circle cx="45" cy="22" r="3.2" /><circle cx="45" cy="44" r="3.2" /></g>}
    </g>
  </g>);
  return <g data-segment-skew={skew ? 'true' : undefined}>{skew ? <g transform={`translate(${(SKEW_SHIFT * 32).toFixed(2)} 0) skewX(-8)`}>{content}</g> : content}</g>;
}

/** 7, 14 or 16 segment digits on a themed glass with ghost (unlit) segments. */
export function SegmentDisplay({ text, style, digits, numeric, themeId, skew = false }: { text: string; style: HmiSegmentStyle; digits?: number; numeric?: boolean; themeId?: string; skew?: boolean }) {
  const uid = cleanId(useId());
  const { id, theme } = resolveLcdTheme(themeId, style === '16' ? 'red-led' : 'green-led');
  const cells = layoutSegmentCells(text, { style, digits, numeric }, HMI_GLYPHS);
  const pad = 14, width = segmentWidth(cells.length, skew) + pad * 2, height = 64 + pad * 2;
  return <svg className="hmi-segment-display" data-segment-style={style} data-segment-skew={skew ? 'true' : undefined} role="img" aria-label={text} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <GlassFrame uid={uid} theme={theme} themeId={id} width={width} height={height} bezel={5} radius={10}>
      <g transform={`translate(${pad} ${pad})`}><SegmentCells cells={cells} style={style} theme={theme} uid={uid} skew={skew} /></g>
    </GlassFrame>
  </svg>;
}

const dotRows = (ch: string) => HMI_GLYPHS.font5x7[ch] ?? HMI_GLYPHS.font5x7['?'];
const bitSet = (row: number, column: number) => ((row >> (4 - column)) & 1) === 1;
const squareD = (x: number, y: number) => `M${x} ${y}h0.88v0.88h-0.88z`;

export function DotMatrixDisplay({ text, digits, numeric, themeId }: { text: string; digits: number; numeric?: boolean; themeId?: string }) {
  const uid = cleanId(useId());
  const { id, theme } = resolveLcdTheme(themeId, 'amber');
  const count = Math.max(1, Math.min(16, Math.floor(digits)));
  let chars = Array.from(text);
  if (chars.length > count) chars = numeric ? Array.from({ length: count }, () => '-') : chars.slice(0, count);
  while (chars.length < count) { if (numeric) chars.unshift(' '); else chars.push(' '); }
  const pad = 2.5, width = count * 7 - 2 + pad * 2, height = 7 + pad * 2;
  const glow = theme.glow ? `url(#${uid}-glow)` : undefined;
  return <svg className="hmi-dot-matrix" role="img" aria-label={text} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <GlassFrame uid={uid} theme={theme} themeId={id} width={width} height={height} bezel={0.7} radius={1.4}>
      <g transform={`translate(${pad} ${pad})`}>
        {chars.map((ch, i) => <g key={i} data-dot-char={ch}>
          {dotRows(ch).flatMap((row, r) => [0, 1, 2, 3, 4].map(col => <circle key={`${r}-${col}`} cx={i * 7 + col + 0.5} cy={r + 0.5} r="0.4" fill={theme.off} />))}
        </g>)}
        <g filter={glow}>
          {chars.flatMap((ch, i) => dotRows(ch).flatMap((row, r) => [0, 1, 2, 3, 4].filter(col => bitSet(row, col)).map(col => <circle key={`${i}-${r}-${col}`} data-dot-on="true" cx={i * 7 + col + 0.5} cy={r + 0.5} r="0.4" fill={theme.on} />)))}
        </g>
      </g>
    </GlassFrame>
  </svg>;
}

/** HD44780-style character LCD: every cell shows a 5 x 7 glyph with ghost dots. */
export function CharacterLcd({ lines, rows, columns, tokens, themeId }: { lines: readonly string[]; rows: number; columns: number; tokens: Record<string, string>; themeId?: string }) {
  const uid = cleanId(useId());
  const { id, theme } = resolveLcdTheme(themeId, 'green-stn');
  const r = Math.max(1, Math.min(4, Math.floor(rows))), cols = Math.max(8, Math.min(40, Math.floor(columns)));
  const formatted = formatCharacterLcdLines(lines, r, cols, tokens);
  const pad = 3, width = cols * 6 - 1 + pad * 2, height = r * 9 - 2 + pad * 2;
  const ghostD = [0, 1, 2, 3, 4, 5, 6].flatMap(y => [0, 1, 2, 3, 4].map(x => squareD(x, y))).join('');
  const label = formatted.map(line => line.trimEnd()).join('\n');
  return <svg className="hmi-character-lcd" role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <title>{formatted.join('\n')}</title>
    <defs><path id={`${uid}-ghost`} d={ghostD} /></defs>
    <GlassFrame uid={uid} theme={theme} themeId={id} width={width} height={height} bezel={1} radius={2}>
      <g transform={`translate(${pad} ${pad})`}>
        {formatted.map((line, row) => Array.from({ length: cols }, (_, col) => {
          const ch = line[col] ?? ' ';
          const bits = dotRows(ch);
          const d = bits.flatMap((rowBits, y) => [0, 1, 2, 3, 4].filter(x => bitSet(rowBits, x)).map(x => squareD(x, y))).join('');
          return <g key={`${row}-${col}`} data-lcd-cell="" data-char={ch} transform={`translate(${col * 6} ${row * 9})`}>
            <use href={`#${uid}-ghost`} fill={theme.off} />
            {d && <path d={d} fill={theme.on} />}
          </g>;
        }))}
      </g>
    </GlassFrame>
  </svg>;
}

/** Appliance glass: icon annunciators above a row of seven-segment digits. */
export function SegmentLcd({ text, digits, numeric, themeId, skew = false, annunciators }: { text: string; digits: number; numeric?: boolean; themeId?: string; skew?: boolean; annunciators: (HmiAnnunciator & { on: boolean })[] }) {
  const uid = cleanId(useId());
  const { id, theme } = resolveLcdTheme(themeId, 'white-fstn');
  const cells = layoutSegmentCells(text, { style: '7', digits, numeric }, HMI_GLYPHS);
  const ann = annunciators.slice(0, 12);
  const pad = 14, labelled = ann.some(a => a.label), rowHeight = ann.length ? (labelled ? 48 : 36) : 0, slot = 52;
  const digitsWidth = segmentWidth(cells.length, skew);
  const width = Math.max(digitsWidth, ann.length * slot) + pad * 2, height = rowHeight + 64 + pad * 2;
  const glow = theme.glow ? `url(#${uid}-glow)` : undefined;
  const label = [text, ...ann.filter(a => a.on).map(a => a.label || HMI_GLYPHS.icons[a.icon]?.label)].filter(Boolean).join(', ');
  return <svg className="hmi-segment-lcd" role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <GlassFrame uid={uid} theme={theme} themeId={id} width={width} height={height} bezel={5} radius={10}>
      {ann.map((a, i) => {
        const cx = width / 2 - ann.length * slot / 2 + slot * (i + 0.5), stroke = a.on ? theme.on : theme.off;
        return <g key={i} data-annunciator={a.icon} data-on={String(a.on)} filter={a.on ? glow : undefined} style={{ color: stroke }}>
          <HmiIcon id={a.icon} size={24} x={cx - 12} y={pad - 2} />
          {a.label && <text x={cx} y={pad + 32} textAnchor="middle" fontSize="9" fill={stroke} stroke="none">{a.label}</text>}
        </g>;
      })}
      <g transform={`translate(${(width - digitsWidth) / 2} ${pad + rowHeight})`}><SegmentCells cells={cells} style="7" theme={theme} uid={uid} skew={skew} /></g>
    </GlassFrame>
  </svg>;
}

/** LED bar graph: horizontal (left to right) or vertical (bottom to top) lit segments in proportion to the value. */
export function LedBar({ fraction, segments, themeId, vertical = false }: { fraction: number; segments: number; themeId?: string; vertical?: boolean }) {
  const uid = cleanId(useId());
  const { id, theme } = resolveLcdTheme(themeId, 'green-led');
  const count = Math.max(4, Math.min(40, Math.floor(segments)));
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * count);
  const span = 12, thickness = 26, pad = 8;
  const width = (vertical ? thickness : count * span) + pad * 2, height = (vertical ? count * span : thickness) + pad * 2;
  const glow = theme.glow ? `url(#${uid}-glow)` : undefined;
  return <svg className="hmi-led-bar" role="img" aria-label={`${lit} of ${count} segments lit`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <GlassFrame uid={uid} theme={theme} themeId={id} width={width} height={height} bezel={3} radius={6}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < lit, z = i / count;
        const fill = on ? (id === 'green-led' ? (z >= 0.85 ? '#ff3b30' : z >= 0.65 ? '#ffb000' : theme.on) : theme.on) : theme.off;
        const pos = (vertical ? count - 1 - i : i) * span + 1;
        return <rect key={i} data-bar-segment="" data-on={String(on)} x={vertical ? pad : pad + pos} y={vertical ? pad + pos : pad} width={vertical ? thickness : span - 2} height={vertical ? span - 2 : thickness} rx="2" fill={fill} filter={on ? glow : undefined} />;
      })}
    </GlassFrame>
  </svg>;
}

/** Numeric LCD readout: ghost digits behind the live value on a themed glass. */
export function LcdReadout({ text, themeId }: { text: string; themeId?: string }) {
  const { id, theme } = resolveLcdTheme(themeId, 'green-stn');
  return <output className="hmi-numeric hmi-lcd" data-lcd-theme={id} style={{ background: theme.background, color: theme.on, borderColor: theme.bezel, textShadow: theme.glow ? `0 0 6px ${theme.on}` : undefined }}>
    <span className="hmi-lcd-ghost" aria-hidden="true" style={{ color: theme.off }}>{text.replace(/[0-9]/g, '8')}</span>
    <span className="hmi-lcd-text">{text}</span>
  </output>;
}

/** Circular, semicircular or quarter-circle gauge with major/minor ticks, a value arc and a needle. */
export function DialGauge({ kind, fraction, display, min, max }: { kind: 'gauge' | 'half-gauge' | 'quarter-gauge'; fraction: number; display: string; min: number; max: number }) {
  const sweep = kind === 'quarter-gauge' ? 90 : kind === 'half-gauge' ? 180 : 270;
  const start = kind === 'quarter-gauge' ? 0 : -sweep / 2;
  const track = kind === 'quarter-gauge' ? 'M60 14 A40 40 0 0 1 100 54' : kind === 'half-gauge' ? 'M20 54 A40 40 0 0 1 100 54' : 'M32 82 A40 40 0 1 1 88 82';
  const point = (deg: number, radius: number) => { const a = deg * Math.PI / 180; return [60 + radius * Math.sin(a), 54 - radius * Math.cos(a)]; };
  const fmt = (v: number) => +v.toFixed(2);
  const angle = start + fraction * sweep;
  const [vx0, vy0] = point(start, 40), [vx1, vy1] = point(angle, 40);
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= 10; i++) {
    const deg = start + sweep * i / 10, [x1, y1] = point(deg, 46), [x2, y2] = point(deg, 51);
    ticks.push(<line key={`M${i}`} data-gauge-tick="major" className="hmi-gauge-tick" x1={fmt(x1)} y1={fmt(y1)} x2={fmt(x2)} y2={fmt(y2)} />);
    if (i < 10) { const m = start + sweep * (i + 0.5) / 10, [a1, b1] = point(m, 46), [a2, b2] = point(m, 48.5); ticks.push(<line key={`m${i}`} data-gauge-tick="minor" className="hmi-gauge-tick hmi-gauge-tick-minor" x1={fmt(a1)} y1={fmt(b1)} x2={fmt(a2)} y2={fmt(b2)} />); }
  }
  return <div className="hmi-dial"><svg viewBox="0 0 120 100" role="img" aria-label={display}>
    <path className="hmi-gauge-arc" d={track} />
    {ticks}
    <path data-gauge-value="" className="hmi-gauge-value" d={`M${fmt(vx0)} ${fmt(vy0)} A40 40 0 ${Math.abs(angle - start) > 180 ? 1 : 0} 1 ${fmt(vx1)} ${fmt(vy1)}`} />
    <g transform={`rotate(${angle} 60 54)`}><path d="M60 54 L60 18" /><circle cx="60" cy="54" r="4" /></g>
    <text x="12" y="98">{min}</text><text x="95" y="98">{max}</text>
  </svg><output>{display}</output></div>;
}
