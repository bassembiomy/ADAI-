// Original engineering pictograms for powertrain blocks (48x32 viewBox, currentColor only).
import React from 'react';
import type { PtSymbolId } from '../../../engine/xbridges/powertrain/ptSpec';

const gearPath = (cx: number, cy: number, r: number, teeth: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (Math.PI * i) / teeth;
    const a1 = (Math.PI * (i + 1)) / teeth;
    const rr = i % 2 === 0 ? r : r * 0.78;
    pts.push(`${(cx + rr * Math.cos(a0)).toFixed(2)},${(cy + rr * Math.sin(a0)).toFixed(2)}`);
    pts.push(`${(cx + rr * Math.cos(a1)).toFixed(2)},${(cy + rr * Math.sin(a1)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};

const Gear = ({ cx, cy, r, n = 8 }: { cx: number; cy: number; r: number; n?: number }) => (
  <g><path d={gearPath(cx, cy, r, n)} /><circle cx={cx} cy={cy} r={r * 0.28} /></g>
);
const Shaft = ({ x1 = 2, x2 = 46, y = 16 }: { x1?: number; x2?: number; y?: number }) => <line x1={x1} y1={y} x2={x2} y2={y} />;
const Box = ({ x = 8, y = 6, w = 32, h = 20 }: { x?: number; y?: number; w?: number; h?: number }) => <rect x={x} y={y} width={w} height={h} rx="2" />;
const Bolt = () => <path d="M26 7 L18 17 H24 L22 25 L30 14 H24 Z" />;
const Sine = ({ y = 16, a = 5 }: { y?: number; a?: number }) => (
  <path d={`M10 ${y} Q15 ${y - a * 2} 20 ${y} T30 ${y} T40 ${y}`} />
);
const Cylinders = ({ n = 3 }: { n?: number }) => (
  <g>
    <rect x="6" y="14" width="36" height="12" rx="1" />
    {Array.from({ length: n }, (_, i) => {
      const x = 10 + i * (28 / n);
      return <rect key={i} x={x} y="6" width={22 / n} height="8" />;
    })}
  </g>
);
const ArrowR = ({ x = 6, y = 16, len = 36 }: { x?: number; y?: number; len?: number }) => (
  <path d={`M${x} ${y} H${x + len} M${x + len - 4} ${y - 3} L${x + len} ${y} L${x + len - 4} ${y + 3}`} />
);
const Wheel = ({ cx = 24, cy = 16, r = 11 }: { cx?: number; cy?: number; r?: number }) => (
  <g><circle cx={cx} cy={cy} r={r} /><circle cx={cx} cy={cy} r={r * 0.5} /><circle cx={cx} cy={cy} r="1.5" /></g>
);
const Turbine = ({ cx = 24, cy = 16, r = 11, blades = 6 }: { cx?: number; cy?: number; r?: number; blades?: number }) => (
  <g>
    <circle cx={cx} cy={cy} r="2" />
    {Array.from({ length: blades }, (_, i) => {
      const a = (2 * Math.PI * i) / blades;
      const b = a + 0.5;
      return (
        <path key={i} d={`M${cx} ${cy} L${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)} L${(cx + r * 0.7 * Math.cos(b)).toFixed(2)} ${(cy + r * 0.7 * Math.sin(b)).toFixed(2)} Z`} />
      );
    })}
  </g>
);

export const PT_SYMBOL_RENDERERS: Record<PtSymbolId, () => React.ReactElement> = {
  'drive-cycle': () => <g><path d="M4 26 V6 M4 26 H44" /><path d="M6 22 L12 12 L18 18 L24 8 L30 20 L36 10 L42 16" /></g>,
  'driver': () => <g><circle cx="24" cy="16" r="11" /><path d="M13 16 H35 M24 16 V27" /><circle cx="24" cy="16" r="2" /></g>,
  'vehicle': () => <g><path d="M4 22 V16 L10 14 L15 8 H31 L37 14 L44 16 V22 Z" /><circle cx="14" cy="23" r="4" /><circle cx="34" cy="23" r="4" /></g>,
  'wheel': () => <g><Wheel /><path d="M24 5 V27 M13 16 H35" /></g>,
  'clutch': () => <g><Shaft x1={2} x2={16} /><Shaft x1={32} x2={46} /><rect x="16" y="6" width="4" height="20" /><rect x="28" y="6" width="4" height="20" /><path d="M22 10 V22 M26 10 V22" /></g>,
  'torque-converter': () => <g><circle cx="24" cy="16" r="12" /><path d="M14 10 Q24 16 14 22 M34 10 Q24 16 34 22" /><Shaft x1={2} x2={12} /><Shaft x1={36} x2={46} /></g>,
  'compliance': () => <g><Shaft x1={2} x2={12} /><path d="M12 16 L15 8 L21 24 L27 8 L33 24 L36 16" /><Shaft x1={36} x2={46} /></g>,
  'inertia': () => <g><Shaft /><rect x="17" y="5" width="14" height="22" rx="2" /><path d="M17 11 H31 M17 21 H31" /></g>,
  'gear': () => <g><Gear cx={15} cy={16} r={11} n={8} /><Gear cx={34} cy={16} r={8} n={6} /></g>,
  'planetary': () => <g><circle cx="24" cy="16" r="14" /><circle cx="24" cy="16" r="4" /><circle cx="24" cy="7" r="3" /><circle cx="16" cy="21" r="3" /><circle cx="32" cy="21" r="3" /></g>,
  'differential': () => <g><circle cx="24" cy="16" r="12" /><path d="M2 16 H12 M36 16 H46 M24 4 V10" /><path d="M18 16 L24 10 L30 16 L24 22 Z" /></g>,
  'transfer-case': () => <g><Gear cx={14} cy={16} r={9} n={7} /><Gear cx={34} cy={16} r={9} n={7} /><path d="M14 7 H34 M14 25 H34" /></g>,
  'transmission': () => <g><Box x={4} y={4} w={40} h={24} /><Gear cx={16} cy={16} r={7} n={6} /><Gear cx={31} cy={16} r={5} n={5} /></g>,
  'cvt': () => <g><path d="M8 6 L18 13 V19 L8 26 M40 6 L30 13 V19 L40 26" /><path d="M13 7 Q24 16 35 9 M13 25 Q24 16 35 23" /></g>,
  'transmission-controller': () => <g><Box x={5} y={9} w={24} h={14} /><path d="M29 16 H42 M38 12 L42 16 L38 20" /><path d="M10 14 H24 M10 18 H20" /></g>,
  'battery': () => <g><Box x={4} y={8} w={36} h={16} /><rect x="40" y="13" width="4" height="6" /><path d="M10 12 V20 M16 12 V20 M22 12 V20" /></g>,
  'ecm-battery': () => <g><path d="M4 16 H12 M36 16 H44" /><path d="M12 16 H16 L18 11 L21 21 L24 11 L27 21 L29 16 H36" /><path d="M14 6 V26" /></g>,
  'dcdc': () => <g><Box x={4} y={4} w={40} h={24} /><path d="M4 28 L44 4" /><path d="M9 11 H17 M9 15 H17" /><path d="M31 21 Q35 17 39 21" /></g>,
  'starter': () => <g><circle cx="16" cy="16" r="11" /><text x="16" y="20" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">M</text><Shaft x1={27} x2={46} /><Gear cx={38} cy={16} r={6} n={6} /></g>,
  'alternator': () => <g><circle cx="24" cy="16" r="12" /><Sine /><Shaft x1={2} x2={12} /></g>,
  'motor-mapped': () => <g><circle cx="20" cy="16" r="12" /><text x="20" y="20" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">M</text><Shaft x1={32} x2={46} /><path d="M10 28 L16 24 L22 26 L30 22" /></g>,
  'pmsm': () => <g><circle cx="24" cy="16" r="13" /><circle cx="24" cy="16" r="6" /><path d="M21 13 H27 V19 H21 Z" /><path d="M24 3 V10 M24 22 V29" /></g>,
  'induction-motor': () => <g><circle cx="24" cy="16" r="13" /><circle cx="24" cy="16" r="6" /><path d="M18 12 L30 20 M18 20 L30 12" /></g>,
  'inverter': () => <g><Box x={4} y={4} w={40} h={24} /><path d="M8 12 H18 M8 17 H18" /><path d="M26 20 Q30 10 34 16 T42 12" /></g>,
  'motor-controller': () => <g><Box x={4} y={6} w={22} h={20} /><path d="M26 16 H34" /><circle cx="40" cy="16" r="6" /><path d="M9 12 H21 M9 16 H17 M9 20 H21" /></g>,
  'engine-si': () => <g><Cylinders n={3} /><path d="M20 3 L24 7 M24 3 L20 7" /><path d="M42 20 H46" /></g>,
  'engine-ci': () => <g><Cylinders n={3} /><path d="M12 3 V7 M20 3 V7 M28 3 V7" /><path d="M42 20 H46" /></g>,
  'engine-core': () => <g><rect x="12" y="4" width="14" height="14" /><circle cx="19" cy="22" r="5" /><path d="M19 18 V22 M26 11 H36" /><path d="M2 22 H14 M24 22 H46" /></g>,
  'engine-controller': () => <g><Box x={4} y={6} w={20} h={20} /><path d="M24 16 H30" /><Cylinders n={2} /></g>,
  'control-volume': () => <g><ellipse cx="24" cy="16" rx="14" ry="10" /><path d="M2 16 H10 M38 16 H46" /></g>,
  'flow-boundary': () => <g><path d="M10 4 V28" /><path d="M10 16 H44 M38 12 L44 16 L38 20" /></g>,
  'flow-restriction': () => <g><path d="M2 8 H16 L22 13 H26 L32 8 H46 M2 24 H16 L22 19 H26 L32 24 H46" /><ArrowR x={6} y={16} len={36} /></g>,
  'heat-exchanger': () => <g><Box x={10} y={4} w={28} h={24} /><path d="M14 8 V24 M20 8 V24 M26 8 V24 M32 8 V24" /><path d="M2 12 H10 M38 20 H46" /></g>,
  'throttle': () => <g><path d="M2 6 H46 M2 26 H46" /><path d="M14 24 L34 8" /><circle cx="24" cy="16" r="2" /></g>,
  'compressor': () => <g><path d="M4 8 L28 12 V20 L4 24 Z" /><Turbine cx={16} cy={16} r={7} blades={5} /><path d="M28 16 H46" /></g>,
  'turbine': () => <g><path d="M4 12 L26 8 V24 L4 20 Z" /><Turbine cx={34} cy={16} r={9} blades={6} /></g>,
  'boost-shaft': () => <g><Shaft /><circle cx="10" cy="16" r="7" /><circle cx="38" cy="16" r="7" /><path d="M7 13 L13 19 M35 13 L41 19" /></g>,
  'two-way': () => <g><Box x={10} y={6} w={28} h={20} /><path d="M14 12 H34 M30 9 L34 12 L30 15 M34 20 H14 M18 17 L14 20 L18 23" /></g>,
};

export function PtSymbol({ id, size = 24 }: { id: PtSymbolId; size?: number }): React.ReactElement {
  const Render = PT_SYMBOL_RENDERERS[id];
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 48 32" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-pt-symbol={id}>
      {Render ? <Render /> : null}
    </svg>
  );
}

export default PtSymbol;
