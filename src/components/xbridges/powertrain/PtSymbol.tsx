// Original engineering pictograms for powertrain blocks (48x32 viewBox, currentColor only).
import React from 'react';
import type { PtSymbolId } from '../../../engine/xbridges/powertrain/ptSpec';
import { getPowertrainSpec } from '../../../engine/xbridges/powertrain/index';

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


const polar = (cx: number, cy: number, r: number, deg: number): string =>
  `${(cx + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(cy - r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;

// Cylinder with piston and connecting rod; the head part (spark plug or injector) is passed in.
const Cylinder = ({ head }: { head: React.ReactNode }) => (
  <g>
    <rect x="11" y="9" width="26" height="21" rx="1" />
    <rect x="17" y="20" width="14" height="4" rx="1" />
    <path d="M24 24 L21 28" />
    <circle cx="21" cy="28" r="1.4" />
    {head}
  </g>
);
const Tyre = () => (
  <g>
    <circle cx="24" cy="16" r="12" />
    <circle cx="24" cy="16" r="8.5" />
    <circle cx="24" cy="16" r="2.5" />
    <path d={Array.from({ length: 8 }, (_, k) => `M${polar(24, 16, 9.6, 37.5 + 45 * k)} L${polar(24, 16, 11.2, 37.5 + 45 * k)}`).join(' ')} />
    <path d="M2 28.5 H46" />
    <rect x="-2.3" y="-4" width="4.6" height="8" rx="1.5" transform={`translate(${polar(24, 16, 10.2, 60)}) rotate(30)`} />
  </g>
);

export const PT_SYMBOL_RENDERERS: Record<PtSymbolId, () => React.ReactElement> = {
  'drive-cycle': () => <g><path d="M5 3 V27 H45 M2.5 6 L5 3 L7.5 6 M42 24.5 L45 27 L42 29.5" /><path d="M6 25 L13 11 H19 L25 25 H29 L36 8 H43" /></g>,
  'driver': () => <g><circle cx="24" cy="13" r="10" /><circle cx="24" cy="13" r="2.5" /><path d="M14 13 H21.5 M26.5 13 H34 M24 15.5 V23" /><rect x="19.5" y="26" width="9" height="4" rx="1" /></g>,
  'vehicle': () => <g><path d="M16 4.5 H33 M30 2 L33 4.5 L30 7" /><path d="M5 23 V18 L11 16 L16 10 H30 L36 16 L43 18 V23" /><path d="M2 27.5 H46" /><circle cx="14" cy="23.5" r="4" /><circle cx="34" cy="23.5" r="4" /></g>,
  'wheel': () => <Tyre />,
  'clutch': () => <g><Shaft x1={2} x2={16} /><Shaft x1={32} x2={46} /><rect x="16" y="6" width="4" height="20" /><rect x="28" y="6" width="4" height="20" /><path d="M22 10 V22 M26 10 V22" /></g>,
  'torque-converter': () => <g><circle cx="24" cy="16" r="12" /><path d="M14 10 Q24 16 14 22 M34 10 Q24 16 34 22" /><Shaft x1={2} x2={12} /><Shaft x1={36} x2={46} /></g>,
  'compliance': () => <g><Shaft x1={2} x2={12} /><path d="M12 16 L15 8 L21 24 L27 8 L33 24 L36 16" /><Shaft x1={36} x2={46} /></g>,
  'inertia': () => <g><Shaft /><rect x="17" y="5" width="14" height="22" rx="2" /><path d="M17 11 H31 M17 21 H31" /></g>,
  'gear': () => <g><Gear cx={15} cy={16} r={11} n={8} /><Gear cx={34} cy={16} r={8} n={6} /></g>,
  'planetary': () => <g><circle cx="24" cy="16" r="14" /><circle cx="24" cy="16" r="4" /><circle cx="24" cy="7" r="3" /><circle cx="16" cy="21" r="3" /><circle cx="32" cy="21" r="3" /></g>,
  'differential': () => <g><path d={gearPath(24, 14, 8, 12)} /><circle cx="24" cy="14" r="2" /><rect x="21.5" y="22" width="5" height="9" /><path d="M16 14 H8 M32 14 H40" /><rect x="3" y="7" width="5" height="14" rx="1" /><rect x="40" y="7" width="5" height="14" rx="1" /></g>,
  'transfer-case': () => <g><Gear cx={14} cy={16} r={9} n={7} /><Gear cx={34} cy={16} r={9} n={7} /><path d="M14 7 H34 M14 25 H34" /></g>,
  'transmission': () => <g><Box x={4} y={4} w={40} h={24} /><Gear cx={16} cy={16} r={7} n={6} /><Gear cx={31} cy={16} r={5} n={5} /></g>,
  'cvt': () => <g><path d="M8 6 L18 13 V19 L8 26 M40 6 L30 13 V19 L40 26" /><path d="M13 7 Q24 16 35 9 M13 25 Q24 16 35 23" /></g>,
  'transmission-controller': () => <g><Box x={5} y={9} w={24} h={14} /><path d="M29 16 H42 M38 12 L42 16 L38 20" /><path d="M10 14 H24 M10 18 H20" /></g>,
  'battery': () => <g><rect x="9" y="7" width="29" height="18" rx="2" /><rect x="38" y="12" width="3" height="8" /><rect x="12" y="10" width="13" height="12" fill="currentColor" stroke="none" /><path d="M2 16 H6 M43 16 H47 M45 14 V18" /></g>,
  'ecm-battery': () => <g><path d="M2 16 H5 M5 9 V23 M8 12 V20 M8 16 H12 L13 16 L14.5 13 L17 19 L19.5 13 L21 16 H26" /><path d="M26 8 V24 M43 8 V24 M43 16 H46" /><path d="M26 8 H29 L30.5 5.5 L33 10.5 L35.5 5.5 L37 8 H43" /><path d="M26 24 H32 M32 20.5 V27.5 M35 20.5 V27.5 M35 24 H43" /></g>,
  'dcdc': () => <g><Box x={4} y={4} w={40} h={24} /><path d="M4 28 L44 4" /><path d="M9 11 H17 M9 15 H17" /><path d="M31 21 Q35 17 39 21" /></g>,
  'starter': () => <g><circle cx="16" cy="16" r="11" /><text x="16" y="20" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">M</text><Shaft x1={27} x2={46} /><Gear cx={38} cy={16} r={6} n={6} /></g>,
  'alternator': () => <g><circle cx="24" cy="16" r="12" /><Sine /><Shaft x1={2} x2={12} /></g>,
  'motor-mapped': () => <g><circle cx="13" cy="16" r="11" /><text x="13" y="20.5" fontSize="12" textAnchor="middle" fill="currentColor" stroke="none">M</text><path d="M29 5 V27 H46" /><path d="M30 10 H36 Q42 10 45 23" /></g>,
  'pmsm': () => <g><circle cx="24" cy="16" r="13" /><circle cx="24" cy="16" r="6" /><path d="M21 13 H27 V19 H21 Z" /><path d="M24 3 V10 M24 22 V29" /></g>,
  'induction-motor': () => <g><circle cx="24" cy="16" r="13" /><circle cx="24" cy="16" r="6" /><path d="M18 12 L30 20 M18 20 L30 12" /></g>,
  'inverter': () => <g><Box x={4} y={4} w={40} h={24} /><path d="M8 12 H18 M8 17 H18" /><path d="M26 20 Q30 10 34 16 T42 12" /></g>,
  'motor-controller': () => <g><Box x={4} y={6} w={22} h={20} /><path d="M26 16 H34" /><circle cx="40" cy="16" r="6" /><path d="M9 12 H21 M9 16 H17 M9 20 H21" /></g>,
  'engine-si': () => <Cylinder head={<g><rect x="22" y="3" width="4" height="6" /><path d="M24 9 V12" /><path d="M26 10 L31 12.5 L27 15 L32 18" strokeWidth={2} /></g>} />,
  'engine-ci': () => <Cylinder head={<g><rect x="22.5" y="3" width="3" height="5" /><path d="M22.5 8 L24 10.5 L25.5 8" /><path d="M24 12 L16 19 M24 12 L21 19.5 M24 12 L27 19.5 M24 12 L32 19" strokeDasharray="1.5 2" /></g>} />,
  'engine-core': () => <g><rect x="12" y="4" width="14" height="14" /><circle cx="19" cy="22" r="5" /><path d="M19 18 V22 M26 11 H36" /><path d="M2 22 H14 M24 22 H46" /></g>,
  'engine-controller': () => <g><Box x={4} y={6} w={20} h={20} /><path d="M24 16 H30" /><Cylinders n={2} /></g>,
  'control-volume': () => <g><path d="M10 10 Q10 6 14 6 H30 Q34 6 34 10 V26 Q34 30 30 30 H14 Q10 30 10 26 Z" /><path d="M2 20 H10 M34 20 H40" /><circle cx="40" cy="9" r="5" /><path d="M40 9 L42.5 6.5 M24 6 V3 H35" /></g>,
  'flow-boundary': () => <g><path d="M2 10 H22 M2 22 H22" /><path d="M22 10 Q27 10 27 6 M22 22 Q27 22 27 26" /><path d="M32 16 H46 M42 12 L46 16 L42 20 M32 10 H42 M32 22 H42" /></g>,
  'flow-restriction': () => <g><path d="M2 6 H46 M2 26 H46" /><rect x="22" y="6" width="4" height="6" /><rect x="22" y="20" width="4" height="6" /><ArrowR x={6} y={16} len={36} /></g>,
  'heat-exchanger': () => <g><Box x={10} y={7} w={28} h={18} /><path d="M15 7 V25 M20 7 V25 M25 7 V25 M30 7 V25 M35 7 V25" /><path d="M2 16 H10 M38 16 H46" /><path d="M14 2 V6 M11 4 L14 7 L17 4 M34 30 V26 M31 28 L34 25 L37 28" /></g>,
  'throttle': () => <g><path d="M2 6 H46 M2 26 H46" /><path d="M17 22 L31 10" strokeWidth={3} /><circle cx="24" cy="16" r="2" /><path d="M5 16 H12 M9 13 L12 16 L9 19" /><path d="M36 16 H44 M41 13 L44 16 L41 19" /></g>,
  'compressor': () => <g><path d="M4 8 L28 12 V20 L4 24 Z" /><Turbine cx={16} cy={16} r={7} blades={5} /><path d="M28 16 H46" /></g>,
  'turbine': () => <g><path d="M4 12 L26 8 V24 L4 20 Z" /><Turbine cx={34} cy={16} r={9} blades={6} /></g>,
  'boost-shaft': () => <g><Shaft /><circle cx="10" cy="16" r="7" /><circle cx="38" cy="16" r="7" /><path d="M7 13 L13 19 M35 13 L41 19" /></g>,
  'cylinder-ci': () => <g><rect x="4" y="9" width="20" height="21" rx="1" /><rect x="8" y="19" width="12" height="4" rx="1" /><path d="M14 23 L12 27" /><circle cx="12" cy="28.5" r="1.3" /><rect x="12.5" y="3" width="3" height="5" /><path d="M14 9 L9 14 M14 9 L14 15 M14 9 L19 14" strokeDasharray="1.5 1.5" /><path d="M28 28 H46 M28 28 V4 M28 26 Q33 25 35 14 Q37 6 40 14 Q42 22 46 25" /></g>,
  'cylinder-si': () => <g><rect x="4" y="9" width="20" height="21" rx="1" /><rect x="8" y="19" width="12" height="4" rx="1" /><path d="M14 23 L12 27" /><circle cx="12" cy="28.5" r="1.3" /><rect x="12" y="3" width="4" height="6" /><path d="M14 9 V11 M16 12 L12 14 L16 16 L12 18" strokeWidth={2} /><path d="M28 28 H46 M28 28 V4 M28 26 Q33 25 35 14 Q37 6 40 14 Q42 22 46 25" /></g>,
  'intake-manifold': () => <g><rect x="12" y="4" width="22" height="9" rx="2" /><path d="M2 8.5 H12 M5 6 L2 8.5 L5 11" /><path d="M16 13 V28 M21 13 V28 M26 13 V28 M31 13 V28" /><path d="M16 28 H12 M31 28 H35" /></g>,
  'turbocharger': () => <g><circle cx="12" cy="16" r="9" /><circle cx="12" cy="16" r="3" /><path d="M12 7 H22 V3" /><circle cx="36" cy="16" r="9" /><circle cx="36" cy="16" r="3" /><path d="M36 25 H26 V29" /><path d="M15 16 H33" /></g>,
  'fuel-injector': () => <g><rect x="18" y="2" width="12" height="12" rx="1" /><path d="M21 14 V18 H27 V14 M24 18 V21" /><path d="M24 21 L12 30 M24 21 L24 30 M24 21 L36 30" strokeDasharray="1.8 2" /><path d="M21 6 H27" /></g>,
  'valvetrain': () => <g><path d="M24 4 C32 4 33 12 24 15 C15 12 16 4 24 4 Z" /><circle cx="24" cy="8.5" r="1.6" /><path d="M24 15 V25 M19 25 H29 M16 29 H20 M28 29 H32" /><path d="M19 25 Q24 28 29 25" /><path d="M5 12 Q9 5 15 8 M12 6 L15 8 L12 11" /><path d="M36 26 H46 M43 23 L46 26 L43 29" /></g>,
  'calibration-ecu': () => <g><rect x="3" y="4" width="42" height="24" rx="2" /><path d="M8 9 H22 V23 H8 Z M8 14 H22 M8 19 H22 M13 9 V23 M17 9 V23" /><circle cx="29" cy="21" r="1.2" /><circle cx="34" cy="14" r="1.2" /><circle cx="39" cy="19" r="1.2" /><circle cx="37" cy="9" r="1.2" /><circle cx="30" cy="10" r="1.2" /></g>,
  'calibration-map': () => <g><path d="M4 26 H44 M4 26 V4 M4 26 L12 30" /><path d="M10 22 Q18 8 26 14 T42 8 M14 26 Q22 14 30 20 T44 14" /><path d="M10 22 L14 26 M26 14 L30 20 M42 8 L44 14 M18 16 L22 23 M34 12 L37 17" /></g>,
  'dyno': () => <g><circle cx="22" cy="16" r="10" /><circle cx="22" cy="16" r="3" /><path d="M22 6 V13 M22 19 V26 M12 16 H19 M25 16 H32" /><path d="M2 16 H12" /><path d="M36 6 Q44 8 44 16 Q44 24 36 26 M36 22 V26 H40" /><path d="M16 28 H28 M18 26 L16 30 M26 26 L28 30" /></g>,
  'ambient': () => <g><rect x="5" y="3" width="5" height="16" rx="2.5" /><circle cx="7.5" cy="23" r="4" /><path d="M7.5 8 V23" /><circle cx="26" cy="9" r="6" /><path d="M26 9 L29 6" /><path d="M20 24 Q18 24 18 27 Q18 29 21 29 H40 Q44 29 44 26 Q44 23 40 23 Q39 19 34 20 Q30 17 27 21 Q22 20 20 24 Z" /></g>,
  'doe-sweeper': () => <g><circle cx="7" cy="7" r="1.5" /><circle cx="17" cy="7" r="1.5" /><circle cx="27" cy="7" r="1.5" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /><circle cx="27" cy="17" r="1.5" /><circle cx="7" cy="27" r="1.5" /><circle cx="17" cy="27" r="1.5" /><circle cx="27" cy="27" r="1.5" /><path d="M9 7 H15 M19 7 H25 M27 9 V15 M25 17 H19 M15 17 H9 M7 19 V25 M9 27 H15 M19 27 H25" /><path d="M34 18 L39 24 L46 9" strokeWidth={2.2} /></g>,
  'two-way': () => <g><Box x={10} y={6} w={28} h={20} /><path d="M14 12 H34 M30 9 L34 12 L30 15 M34 20 H14 M18 17 L14 20 L18 23" /></g>,
};

export const PT_SYMBOL_TITLES: Record<PtSymbolId, string> = {
  'drive-cycle': 'Speed versus time drive cycle',
  'driver': 'Steering wheel with pedal',
  'vehicle': 'Car moving forward on road',
  'wheel': 'Tyre on road with disc brake',
  'clutch': 'Two friction plates clutch',
  'torque-converter': 'Torque converter with turbine blades',
  'compliance': 'Torsional spring between shafts',
  'inertia': 'Rotating inertia on shaft',
  'gear': 'Two meshing gears',
  'planetary': 'Planetary gear set',
  'differential': 'Differential with ring gear and axles',
  'transfer-case': 'Transfer case with two gears',
  'transmission': 'Gearbox housing with gears',
  'cvt': 'Continuously variable transmission pulleys',
  'transmission-controller': 'Transmission controller with command output',
  'battery': 'Battery cell with charge level',
  'ecm-battery': 'Battery equivalent circuit with resistors and capacitor',
  'dcdc': 'DC to DC converter',
  'starter': 'Starter motor with pinion gear',
  'alternator': 'Alternator with alternating output',
  'motor-mapped': 'Motor with torque speed envelope',
  'pmsm': 'Permanent magnet synchronous motor',
  'induction-motor': 'Induction motor with rotor bars',
  'inverter': 'DC to AC inverter',
  'motor-controller': 'Motor controller driving a motor',
  'engine-si': 'Spark ignition engine cylinder with spark plug',
  'engine-ci': 'Diesel engine cylinder with fuel injector',
  'engine-core': 'Engine core with intake and exhaust',
  'engine-controller': 'Engine controller for cylinders',
  'control-volume': 'Closed gas vessel with pressure gauge',
  'flow-boundary': 'Open pipe end to the atmosphere',
  'flow-restriction': 'Orifice plate in a pipe',
  'heat-exchanger': 'Finned cooler with coolant arrows',
  'throttle': 'Throttle valve in a pipe',
  'compressor': 'Compressor with impeller',
  'turbine': 'Turbine with blades',
  'boost-shaft': 'Shaft connecting compressor and turbine',
  'cylinder-ci': 'Diesel cylinder with injector spray and pressure trace',
  'cylinder-si': 'Spark ignition cylinder with spark and pressure trace',
  'intake-manifold': 'Intake manifold plenum with four runners',
  'turbocharger': 'Turbocharger with compressor and turbine',
  'fuel-injector': 'Fuel injector with spray cone',
  'valvetrain': 'Cam lobe pushing a valve with phasing',
  'calibration-ecu': 'Engine control unit with calibration map',
  'calibration-map': 'Three dimensional calibration map surface',
  'dyno': 'Engine dynamometer with torque arrow',
  'ambient': 'Ambient temperature pressure and humidity',
  'doe-sweeper': 'Design of experiments sweep with check mark',
  'two-way': 'Two way bidirectional connection',
};

export function PtSymbol({ id, size = 24 }: { id: PtSymbolId; size?: number }): React.ReactElement {
  const Render = PT_SYMBOL_RENDERERS[id];
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 48 32" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" role="img" data-pt-symbol={id}>
      <title>{PT_SYMBOL_TITLES[id]}</title>
      {Render ? <Render /> : null}
    </svg>
  );
}

export function PtLibraryIcon({ type, size }: { type: string; size?: number }): React.ReactElement | null {
  const spec = getPowertrainSpec(type);
  if (!spec) return null;
  return (
    <span title={spec.description.split(/(?<=\.)\s/)[0]} className="inline-flex items-center justify-center">
      <PtSymbol id={spec.symbol} size={size ?? 22} />
    </span>
  );
}

export default PtSymbol;
