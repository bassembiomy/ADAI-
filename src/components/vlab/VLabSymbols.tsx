import React from 'react';
import { getBlockDimensions } from './blockDimensions';

const SymGlyph = ({ w, h, color, text, sub }: { w: number; h: number; color?: string; text: string; sub?: string }) => (
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={color || '#94a3b8'} strokeWidth="2.4">
    <rect x="4" y="4" width={w - 8} height={h - 8} rx="8" strokeOpacity="0.7" />
    <text x={w / 2} y={h / 2 + (sub ? -1 : 5)} textAnchor="middle" fill={color || '#94a3b8'} fontSize="13" fontWeight="700" fontFamily="system-ui" stroke="none">{text}</text>
    {sub && <text x={w / 2} y={h / 2 + 12} textAnchor="middle" fill={color || '#94a3b8'} fontSize="6.5" fontWeight="600" letterSpacing="1" fontFamily="system-ui" stroke="none">{sub}</text>}
  </svg>
);

// Verbatim move of the ~1250-line switch from VLabWorkspace.tsx (was lines 286-1537).
export const RawSymbolRenderer = ({ type, color }: { type: string, color?: string }) => {
  switch (type) {
    case 'resistor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 15H15L18 5L24 25L30 5L36 25L42 5L45 15H60" />
        </svg>
      );
    case 'capacitor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 15H25M35 15H60M25 5V25M35 5V25" />
        </svg>
      );
    case 'inductor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 15H10C10 15 10 5 17.5 5C25 5 25 15 25 15C25 15 25 5 32.5 5C40 5 40 15 40 15C40 15 40 5 47.5 5C55 5 55 15 55 15H60" />
        </svg>
      );
    case 'diode':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 15H20L20 5L40 15L20 25L20 15M40 5V25M40 15H60" />
        </svg>
      );
    case 'ground':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 0V15M10 15H30M13 20H27M17 25H23" />
        </svg>
      );
    case 'dc_motor':
    case 'pmsm':
    case 'ac_motor':
    case 'bldc_motor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="25" />
          <text x="30" y="38" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" stroke="none">M</text>
        </svg>
      );
    case 'three_phase_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="25" />
          <path d="M15 30Q22.5 15 30 30T45 30" />
          <text x="45" y="50" textAnchor="middle" fill={color} fontSize="10" stroke="none">3~</text>
        </svg>
      );
    case 'transformer':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M15 10C15 10 5 10 5 20C5 30 15 30 15 30C15 30 5 30 5 40C5 50 15 50 15 50" />
          <path d="M45 10C45 10 55 10 55 20C55 30 45 30 45 30C45 30 55 30 55 40C55 50 45 50 45 50" />
          <line x1="25" y1="10" x2="25" y2="50" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="35" y1="10" x2="35" y2="50" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'gyrator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="30" r="10" />
          <circle cx="40" cy="30" r="10" />
          <path d="M20 20Q30 30 40 20M20 40Q30 30 40 40" />
        </svg>
      );
    case 'opamp':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 5V35L50 20L10 5Z" />
          <text x="15" y="15" fill={color} fontSize="8" stroke="none">+</text>
          <text x="15" y="30" fill={color} fontSize="8" stroke="none">-</text>
        </svg>
      );
    case 'memristor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="10" width="30" height="10" />
          <path d="M0 15H15M45 15H60M15 10L45 20" strokeWidth="1" />
        </svg>
      );
    case 'switch':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="15" cy="25" r="2" fill={color} />
          <circle cx="45" cy="25" r="2" fill={color} />
          <path d="M15 25L40 10" />
          <path d="M0 25H15M45 25H60" />
        </svg>
      );
    case 'variable_resistor':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 25H15L18 15L24 35L30 15L36 35L42 15L45 25H60" />
          <path d="M20 35L40 5" strokeWidth="1" />
          <path d="M40 5L35 7M40 5L38 10" strokeWidth="1" />
        </svg>
      );
    case 'gas_inf_resistance':
    case 'infinite_resistance':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="10" width="20" height="10" rx="2" strokeDasharray="2 2" />
          <text x="30" y="18" fill={color} fontSize="8" textAnchor="middle" stroke="none">∞</text>
          <path d="M0 15H20M40 15H60" />
        </svg>
      );
    case 'rotational_electromechanical_converter':
    case 'rotational_em':
    case 'translational_electromechanical_converter':
    case 'translational_em':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="30" r="8" />
          <rect x="35" y="22" width="15" height="15" />
          <path d="M28 30H35" strokeDasharray="2 2" />
        </svg>
      );
    case 'thermal_resistor':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="15" width="20" height="10" fill={color} fillOpacity="0.2" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 15V5M25 5H35" />
        </svg>
      );
    case 'v_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <text x="30" y="34" fill={color} fontSize="12" textAnchor="middle" stroke="none">V</text>
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'i_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <text x="30" y="34" fill={color} fontSize="12" textAnchor="middle" stroke="none">A</text>
          <path d="M0 30H15M45 30H60" strokeWidth="1" />
        </svg>
      );
    case 'dc_voltage':
    case 'ac_voltage':
    case 'controlled_voltage':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <text x="30" y="25" fill={color} fontSize="10" textAnchor="middle" stroke="none">+</text>
          <text x="30" y="42" fill={color} fontSize="10" textAnchor="middle" stroke="none">-</text>
          {type === 'ac_voltage' && <path d="M22 30Q30 20 38 30Q30 40 22 30" strokeWidth="1" />}
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'pwm_3ph_2level':
    case 'pwm_3ph_3level':
      return (
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="60" height="40" rx="4" />
          <path d="M20 30L30 20L40 30L50 20L60 30" strokeWidth="1.5" />
          <text x="40" y="55" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="bold">INV</text>
        </svg>
      );
    case 'im_foc_ctrl':
    case 'im_scalar_ctrl':
      return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="70" height="70" rx="2" fill={color} fillOpacity="0.05" />
          <circle cx="40" cy="40" r="20" strokeDasharray="2 2" />
          <path d="M30 40H50M40 30V50" strokeWidth="1" />
          <text x="40" y="70" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="black">
            {type.includes('foc') ? 'FOC' : 'V/f'}
          </text>
        </svg>
      );
    case 'washing_basket':
      return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="40" cy="40" r="30" />
          <circle cx="40" cy="40" r="25" strokeDasharray="2 2" />
          <path d="M40 10V15M40 65V70M10 40H15M65 40H70" strokeWidth="1" />
          <rect x="55" y="35" width="10" height="10" fill={color} fillOpacity="0.5" rx="2" />
          <text x="40" y="45" textAnchor="middle" fill={color} fontSize="8" stroke="none">BASKET</text>
        </svg>
      );
    case 'washing_fluid':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 40 Q 30 35 50 40 L 50 55 Q 30 60 10 55 Z" fill={color} fillOpacity="0.3" />
          <path d="M15 45 Q 30 42 45 45M18 50 Q 30 47 42 50" strokeWidth="1" strokeOpacity="0.5" />
          <text x="30" y="30" textAnchor="middle" fill={color} fontSize="8" stroke="none">FLUID</text>
        </svg>
      );
    case 'magnetron':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="18" />
          <circle cx="30" cy="30" r="6" fill={color} fillOpacity="0.3" />
          <path d="M30 12V6M30 54V48M12 30H6M54 30H48" strokeWidth="1" />
          <path d="M38 22L42 18M18 38L22 34" strokeWidth="1" />
          <text x="30" y="55" textAnchor="middle" fill={color} fontSize="8" stroke="none">MAG</text>
        </svg>
      );
    case 'upper_heater':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 10H50M10 20H50M10 30H50" strokeOpacity="0.3" />
          <path d="M10 10C10 10 15 5 20 10C25 15 30 5 35 10C40 15 45 5 50 10" />
          <path d="M0 20H10M50 20H60" strokeWidth="1" />
        </svg>
      );
    case 'steam_generator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M15 45H45V25C45 25 45 15 30 15C15 15 15 25 15 25V45Z" fill={color} fillOpacity="0.1" />
          <path d="M25 15V5M30 12V2M35 15V5" strokeWidth="1" strokeDasharray="2 1" />
          <text x="30" y="40" textAnchor="middle" fill={color} fontSize="8" stroke="none">STEAM</text>
        </svg>
      );
    case 'microwave_inverter':
      return (
        <svg width="70" height="50" viewBox="0 0 70 50" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="60" height="40" rx="4" />
          <path d="M15 25L25 15M25 35L35 25M35 25L45 15" />
          <text x="35" y="40" textAnchor="middle" fill={color} fontSize="8" stroke="none">HV-INV</text>
        </svg>
      );
    case 'microwave_cavity':
    case 'cavity':
      return (
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="60" height="40" rx="2" />
          <rect x="15" y="15" width="40" height="30" strokeOpacity="0.2" strokeDasharray="1 1" />
          <path d="M55 10V50M60 25V35" />
          <text x="35" y="34" textAnchor="middle" fill={color} fontSize="10" stroke="none" fontWeight="bold">25L</text>
        </svg>
      );
    case 'dc_current':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M30 20V40M25 25L30 20L35 25" />
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'vcvs':
    case 'vccs':
    case 'cccs':
    case 'ccvs':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M30 15L45 30L30 45L15 30Z" />
          <circle cx="30" cy="30" r="4" fill={color} fillOpacity="0.2" />
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'gas_flow_src':
    case 'gas_pres_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30L38 30M34 26L38 30L34 34" strokeWidth="1.5" />
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none">
            {type === 'gas_flow_src' ? 'M' : 'P'}
          </text>
          <path d="M0 30H15M45 30H60" strokeWidth="1" />
        </svg>
      );
    case 'gas_pipe':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="15" width="20" height="10" rx="2" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 25V35" stroke="#ef4444" strokeWidth="1" />
        </svg>
      );
    case 'gas_fixed_res':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 30H40" />
          <path d="M30 10V30" />
          <path d="M25 15L30 10L35 15" strokeWidth="1" />
        </svg>
      );
    case 'gas_rot_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 15C10 30 10 30 20 45" stroke="#10b981" />
          <path d="M30 15C40 30 40 30 30 45" stroke={color} />
          <circle cx="25" cy="30" r="4" fill={color} fillOpacity="0.2" />
          <path d="M30 30H40" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_trans_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="35" y="20" width="15" height="20" stroke="#10b981" />
          <path d="M30 30H35" stroke="#10b981" />
          <rect x="20" y="15" width="10" height="30" stroke={color} />
          <path d="M30 30H40" strokeDasharray="2 2" />
        </svg>
      );
    case 'flux_sensor':
    case 'mmf_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <text x="30" y="34" fill={color} fontSize="12" textAnchor="middle" stroke="none">
            {type === 'flux_sensor' ? 'Φ' : 'ℱ'}
          </text>
        </svg>
      );
    case 'mmf_source':
    case 'ctrl_mmf':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30C22 20 38 20 38 30C38 40 22 40 22 30" />
          <path d="M30 15L30 45" strokeWidth="1" />
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none">+</text>
          <text x="30" y="42" fill={color} fontSize="8" textAnchor="middle" stroke="none">-</text>
        </svg>
      );
    case 'flux_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30C22 20 38 20 38 30C38 40 22 40 22 30" strokeOpacity="0.3" />
          <path d="M30 20V40M25 25L30 20L35 25" />
        </svg>
      );
    case 'gear_box':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="10" width="20" height="40" />
          <path d="M25 15H35M25 45H35M30 10V5M30 50V55" />
          <text x="30" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">G</text>
          <path d="M0 30H20M40 30H60" />
        </svg>
      );
    case 'lever':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 20H50M30 20V35" />
          <circle cx="30" cy="20" r="3" fill="white" />
          <text x="15" y="15" fill={color} fontSize="8" textAnchor="middle" stroke="none">A</text>
          <text x="45" y="15" fill={color} fontSize="8" textAnchor="middle" stroke="none">B</text>
          <text x="30" y="10" fill={color} fontSize="8" textAnchor="middle" stroke="none">C</text>
        </svg>
      );
    case 'force_sensor':
    case 'torque_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <path d="M20 25L30 35L40 25" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">
            {type === 'force_sensor' ? 'F' : 'T'}
          </text>
          <path d="M0 30H15M45 30H60" />
        </svg>
      );
    case 'force_source':
    case 'torque_source':
    case 'ang_vel_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M30 20V40M25 35L30 40L35 35" />
          <text x="30" y="25" fill={color} fontSize="10" textAnchor="middle" stroke="none">
            {type === 'force_source' ? 'F' : type === 'torque_source' ? 'T' : 'W'}
          </text>
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'inertia':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 30C20 15 40 15 40 30" />
          <path d="M30 30V45" />
          <path d="M25 45H35" />
        </svg>
      );
    case 'rot_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 20H40M25 25H35M28 30H32" />
          <path d="M30 0V20" />
        </svg>
      );
    case 'rot_spring':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H10C10 20 15 10 20 20C25 30 30 10 35 20C40 30 45 10 50 20H60" />
        </svg>
      );
    case 'rot_damper':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30H40V10" />
          <path d="M30 15V25M25 15H35" />
        </svg>
      );
    case 'rot_friction':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H20M40 20H60" />
          <path d="M25 10V30M35 10V30" />
        </svg>
      );
    case 'rot_hard_stop':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30" />
          <path d="M20 10H30" strokeDasharray="2 2" />
        </svg>
      );
    case 'mass':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="20" width="20" height="20" />
          <path d="M30 0V20M30 40V60" strokeDasharray="2 2" strokeOpacity="0.5" />
          <path d="M25 60H35" />
        </svg>
      );
    case 'trans_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 20H40M20 20L15 25M25 20L20 25M30 20L25 25M35 20L30 25M40 20L35 25" />
          <path d="M30 0V20" />
        </svg>
      );
    case 'trans_spring':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H15L18 10L24 30L30 10L36 30L42 10L45 20H60" />
        </svg>
      );
    case 'trans_damper':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H15M45 20H60" />
          <path d="M15 10V30H45" />
          <path d="M30 10V30" />
        </svg>
      );
    case 'trans_friction':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 18H60M0 22H60" />
        </svg>
      );
    case 'trans_hard_stop':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30" />
          <path d="M20 20L25 15L25 25Z" fill={color} />
        </svg>
      );
    case 'ma_flow_sensor':
    case 'ma_pt_sensor':
    case 'ma_thermo':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <path d={type === 'ma_flow_sensor' ? "M30 20C22 20 22 40 30 40C38 40 38 20 30 20" : "M22 30L38 30M35 25L38 30L35 35"} />
          {type === 'ma_pt_sensor' && <text x="30" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">P/T</text>}
        </svg>
      );
    case 'ma_selector':
      return (
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="50" rx="2" />
          <path d="M10 15H30M10 30H30M10 45H30" strokeOpacity="0.5" />
          <text x="20" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">S</text>
        </svg>
      );
    case 'ma_moisture':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <path d="M28 28Q30 24 32 28Q30 32 28 28" fill={color} stroke="none" />
        </svg>
      );
    case 'ma_moisture_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M28 25Q30 20 32 25Q30 30 28 25" fill={color} stroke="none" />
          <path d="M30 15V45" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'ma_flow_src':
    case 'ma_pres_src':
    case 'ma_pressure_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30L38 30M34 26L38 30L34 34" strokeWidth="1.5" />
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none">
            {type === 'ma_flow_src' ? 'M' : 'P'}
          </text>
          <path d="M0 30H15M45 30H60" strokeWidth="1" />
        </svg>
      );
    case 'ma_properties':
    case 'ma_props':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="5" width="40" height="30" rx="2" fill={color} fillOpacity="0.05" />
          <path d="M20 15Q22 10 24 15Q22 20 20 15" fill={color} stroke="none" />
          <path d="M30 25Q32 20 34 25Q32 30 30 25" fill={color} stroke="none" />
        </svg>
      );
    case 'ps_delay':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <path d="M20 30L30 20L40 30" />
          <text x="20" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">U</text>
          <text x="40" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">Y</text>
        </svg>
      );
    case 'ps_add':
    case 'ps_subtract':
    case 'ps_product':
    case 'ps_divide':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="24" fill={color} fontSize="14" textAnchor="middle" stroke="none">
            {type === 'ps_add' ? '+' : type === 'ps_subtract' ? '-' : type === 'ps_product' ? '×' : '÷'}
          </text>
        </svg>
      );
    case 'ps_gain':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M15 10L45 20L15 30V10Z" />
          <text x="22" y="23" fill={color} fontSize="8" textAnchor="middle" stroke="none">K</text>
        </svg>
      );
    case 'ps_math':
      return (
        <svg width="50" height="40" viewBox="0 0 50 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="10" width="40" height="20" rx="2" />
          <text x="25" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">FCN</text>
        </svg>
      );
    case 'ps_sum':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="25" fill={color} fontSize="14" textAnchor="middle" stroke="none">Σ</text>
        </svg>
      );
    case 'ps_integrator':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="5" width="40" height="30" rx="2" />
          <path d="M25 15H35M30 10V30M25 25H35" strokeWidth="1" strokeOpacity="0.3" />
          <text x="30" y="24" fill={color} fontSize="12" textAnchor="middle" stroke="none">1/s</text>
        </svg>
      );
    case 'ps_transfer_fcn':
    case 'ps_tf':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">1/(Ts+1)</text>
        </svg>
      );
    case 'ps_lookup_1d':
    case 'ps_lookup_2d':
      return (
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="30" height="30" rx="2" />
          <path d="M15 35Q25 15 35 35" strokeWidth="1" />
          <path d="M15 15V35H35" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
      );
    case 'ps_abs':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M15 15L20 25L25 15" />
        </svg>
      );
    case 'ps_saturation':
    case 'ps_sat':
    case 'ps_dead_zone':
    case 'ps_dead':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d={type === 'ps_saturation' ? "M10 30H15L25 10H30" : "M10 25H20M30 25H40"} strokeWidth="1.5" />
          <path d="M5 20H35M20 5V35" strokeOpacity="0.2" strokeWidth="1" />
        </svg>
      );
    case 'ps_switch':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="10" width="30" height="40" rx="2" />
          <path d="M25 30L35 20" strokeWidth="1.5" />
          <circle cx="25" cy="30" r="2" fill={color} />
          <circle cx="35" cy="20" r="2" fill={color} />
          <path d="M0 20H15M0 40H15M45 30H60" strokeWidth="1" />
        </svg>
      );
    case 'ps_min':
    case 'ps_max':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">
            {type === 'ps_min' ? 'MIN' : 'MAX'}
          </text>
        </svg>
      );
    case 'constant':
    case 'ps_constant':
    case 'ps_const':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="25" fill={color} fontSize="14" textAnchor="middle" stroke="none">C</text>
        </svg>
      );
    case 'ps_sine':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M10 20Q15 10 20 20Q25 30 30 20" strokeWidth="1.5" />
        </svg>
      );
    case 'ps_step':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M10 30H20V10H30" strokeWidth="1.5" />
        </svg>
      );
    case 'ps_rms':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="5" width="40" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">RMS</text>
        </svg>
      );
    case 'ps_term':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 15V25M10 20H25M25 15V25" />
          <path d="M25 17H30M25 23H30" strokeOpacity="0.5" />
        </svg>
      );
    case 'conductive':
    case 'convective':
    case 'radiative':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M15 20H20" />
          <rect x="20" y="10" width="20" height="20" rx="1" fill={color} fillOpacity="0.1" />
          {type === 'conductive' && <path d="M22 15L38 25" strokeWidth="1" />}
          {type === 'convective' && <path d="M22 15Q30 20 22 25M25 15Q33 20 25 25" strokeWidth="1" />}
          {type === 'radiative' && <path d="M22 15L38 15M22 20L38 20M22 25L38 25" strokeWidth="1" strokeDasharray="2 2" />}
          <path d="M40 20H45" />
        </svg>
      );
    case 'thermal_mass':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="15" width="20" height="15" rx="1" />
          <path d="M20 5V15" />
          <path d="M15 35H25" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
      );
    case 'thermal_ref':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 5V15M10 15H30" />
          <path d="M12 20L15 15M17 20L20 15M22 20L25 15M27 20L30 15" strokeWidth="1" />
        </svg>
      );
    case 'temp_sensor':
    case 'heat_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <path d="M15 30H45" strokeWidth="1" strokeOpacity="0.3" />
          {type === 'temp_sensor' ? (
            <path d="M30 20V35M27 35H33" strokeWidth="1.5" />
          ) : (
            <path d="M25 25L35 25M30 20L35 25L30 30" strokeWidth="1.5" />
          )}
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none" opacity="0.5">
            {type === 'temp_sensor' ? 'T' : 'H'}
          </text>
        </svg>
      );
    case 'heat_src':
    case 'temp_src':
    case 'ctrl_heat_src':
    case 'ctrl_temp_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 40H40L35 20H25L20 40Z" />
          <path d="M30 35V25M27 28L30 25L33 28" strokeWidth="1.5" />
          {(type === 'ctrl_heat_src' || type === 'ctrl_temp_src') && (
            <path d="M0 30H20M15 27L20 30L15 33" strokeWidth="1" />
          )}
          <text x="30" y="50" fill={color} fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type.includes('heat') ? 'HEAT' : 'TEMP'}
          </text>
        </svg>
      );
    case 'solver_config':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">f(x) = 0</text>
        </svg>
      );
    case 'ps_to_sim':
    case 'sim_to_ps':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 15L20 15M30 15L35 15" strokeWidth="1" />
          <path d={type === 'ps_to_sim' ? "M20 10L25 15L20 20" : "M25 10L20 15L25 20"} strokeWidth="2.4" />
          <path d="M5 15L10 15" strokeDasharray="2 2" />
        </svg>
      );
    case 'probe':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="8" strokeWidth="1" />
          <path d="M25 30H35M30 25V35" strokeWidth="1" />
          <text x="50" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">x</text>
        </svg>
      );
    case 'conn_label':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="15" cy="20" r="8" />
          <path d="M23 20L35 20" strokeWidth="1" />
          <path d="M15 15L15 25M10 20L20 20" strokeWidth="1" strokeOpacity="0.3" />
        </svg>
      );
    case 'busbar':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="5" width="40" height="20" fill={color} fillOpacity="0.2" />
          <path d="M5 15H10M50 15H55" />
          <circle cx="15" cy="15" r="1.5" fill={color} />
          <circle cx="45" cy="15" r="1.5" fill={color} />
        </svg>
      );
    case 'phase_splitter':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 20H25M25 10V30M25 10H45M25 20H45M25 30H45" />
          <text x="35" y="15" fill={color} fontSize="6" stroke="none">a</text>
          <text x="35" y="25" fill={color} fontSize="6" stroke="none">b</text>
          <text x="35" y="35" fill={color} fontSize="6" stroke="none">c</text>
        </svg>
      );
    case 'delta_ref':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 10V20M10 30L20 20L30 30H10" />
        </svg>
      );
    case 'open_circuit':
      return (
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="15" cy="20" r="4" />
          <path d="M15 5V16" />
        </svg>
      );
    case 'ps_demux':
    case 'ps_demux_3':
      return (
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" stroke="#92400e" strokeWidth="3">
          <path d="M15 10V50" />
          <path d="M5 30H15M15 15H30M15 30H30M15 45H30" strokeWidth="1.5" />
          <text x="5" y="25" fill="#92400e" fontSize="6" stroke="none">abc</text>
        </svg>
      );
    case 'bldc_logic':
    case 'bldc_ctrl':
    case 'bldc_pwm':
    case 'dcdc_ctrl':
    case 'pfc_ctrl':
    case 'cyclo_ctrl':
      return (
        <svg width="100" height="120" viewBox="0 0 100 120" fill="none" stroke="white" strokeWidth="2.4">
          <rect x="10" y="5" width="80" height="110" rx="2" fill="#111" />
          <text x="50" y="60" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'dcdc_ctrl' ? 'DC-DC CTRL' : type === 'pfc_ctrl' ? 'PFC RECTIFIER' : 'CYCLOCONVERTER'}
          </text>
          <text x="85" y="110" fill="white" fontSize="4" textAnchor="end" stroke="none" opacity="0.5">Visualization</text>
        </svg>
      );
    case 'pi_ctrl':
    case 'lpf':
    case 'integrator':
    case 'mov_avg':
    case 'sr_ff':
    case 's_h':
    case 'smith':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="#111" />
          <text x="30" y="30" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'pi_ctrl' ? 'PI(z)' : type === 'lpf' ? '1/(Ts+1)' : type === 'integrator' ? '1/s' : type === 'mov_avg' ? 'MEAN' : type === 'sr_ff' ? 'SR FF' : type === 's_h' ? 'S&H' : 'SMITH'}
          </text>
          {type === 'pi_ctrl' && <path d="M10 40H20M15 35V45" strokeWidth="1" opacity="0.5" />}
        </svg>
      );
    case 'sine_3ph':
    case 'second_order':
    case 'state_fb':
    case 'smc':
    case 'stair':
    case 'washout':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="#111" />
          <text x="30" y="30" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'sine_3ph' ? '3~ SINE' : type === 'second_order' ? '1/(s²+...)' : type === 'state_fb' ? 'u = -Kx' : type === 'smc' ? 'SMC' : type === 'stair' ? 'STAIR' : 'WASHOUT'}
          </text>
          {type === 'stair' && <path d="M10 40H20V30H30V20H40" strokeWidth="1" opacity="0.4" />}
          {type === 'sine_3ph' && <path d="M10 45Q15 35 20 45T30 45" strokeWidth="1" opacity="0.4" />}
        </svg>
      );
    case 'dc_curr_ctrl':
    case 'dc_volt_ctrl':
    case 'hyst_ctrl':
    case 'vel_ctrl':
      return (
        <svg width="100" height="120" viewBox="0 0 100 120" fill="none" stroke="white" strokeWidth="2.4">
          <rect x="10" y="5" width="80" height="110" rx="2" fill="#111" />
          <text x="50" y="60" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'dc_curr_ctrl' ? 'DC CURR' : type === 'dc_volt_ctrl' ? 'DC VOLT' : type === 'hyst_ctrl' ? 'HYSTERESIS' : 'VELOCITY'}
          </text>
          <text x="50" y="70" fill="white" fontSize="5" textAnchor="middle" stroke="none" opacity="0.6">CONTROLLER</text>
        </svg>
      );
    case 'im_scalar':
    case 'im_foc':
    case 'im_dtc':
    case 'im_curr':
      return (
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2.4">
          <rect x="10" y="5" width="100" height="130" rx="2" fill="#111" />
          <text x="60" y="70" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'im_scalar' ? 'SCALAR (V/f)' : type === 'im_foc' ? 'FOC DRIVE' : type === 'im_dtc' ? 'DIRECT TORQUE' : 'DQ CURR CTRL'}
          </text>
          <text x="60" y="80" fill="white" fontSize="4" textAnchor="middle" stroke="none" opacity="0.6">INDUCTION MACHINE</text>
        </svg>
      );
    case 'clarke':
    case 'inv_clarke':
    case 'park':
    case 'inv_park':
    case 'sym_comp':
    case 'inv_sym_comp':
      return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="10" y="5" width="60" height="70" rx="2" fill="#111" />
          <text x="40" y="35" fill="white" fontSize="5" textAnchor="middle" stroke="none" fontWeight="bold">
            {type.includes('clarke') ? 'CLARKE' : type.includes('park') ? 'PARK' : 'SYM COMP'}
          </text>
          <text x="40" y="45" fill="white" fontSize="4" textAnchor="middle" stroke="none" opacity="0.6">
            {type.includes('inv') ? (type.includes('clarke') ? 'αβ0 → abc' : type.includes('park') ? 'dq0 → abc' : '+-0 → abc') : (type.includes('clarke') ? 'abc → αβ0' : type.includes('park') ? 'abc → dq0' : 'abc → +-0')}
          </text>
        </svg>
      );
    case 'flux_obs':
    case 'luenberger':
    case 'quad_dec':
    case 'rtd':
      return (
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="10" y="5" width="80" height="90" rx="2" fill="#111" />
          <text x="50" y="50" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'flux_obs' ? 'FLUX OBS' : type === 'luenberger' ? 'STATE OBS' : type === 'quad_dec' ? 'QUAD DEC' : 'R/D CONV'}
          </text>
          <text x="50" y="60" fill="white" fontSize="4" textAnchor="middle" stroke="none" opacity="0.6">
            {type === 'flux_obs' ? 'INDUCTION MACHINE' : type === 'luenberger' ? 'LUENBERGER' : 'SHAFT DECODER'}
          </text>
        </svg>
      );
    case 'pmsm_curr':
    case 'pmsm_ref':
    case 'pmsm_foc':
    case 'pmsm_fw':
    case 'pmsm_tq':
      return (
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2.4">
          <rect x="10" y="5" width="100" height="130" rx="2" fill="#111" />
          <text x="60" y="70" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'pmsm_curr' ? 'PMSM CURR' : type === 'pmsm_ref' ? 'REF GEN' : type === 'pmsm_foc' ? 'PMSM FOC' : type === 'pmsm_fw' ? 'FLD WEAK' : 'TQ EST'}
          </text>
          <text x="60" y="80" fill="white" fontSize="4" textAnchor="middle" stroke="none" opacity="0.6">PM SYNCHRONOUS</text>
        </svg>
      );
    case 'pwm_3ph':
    case 'pwm_npc':
    case 'pwm_vienna':
    case 'thy_6p':
    case 'thy_12p':
      return (
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2.4">
          <rect x="10" y="5" width="100" height="130" rx="2" fill="#111" />
          <text x="60" y="70" fill="white" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'pwm_3ph' ? 'PWM 2-LEVEL' : type === 'pwm_npc' ? 'PWM 3-LEVEL' : type === 'pwm_vienna' ? 'VIENNA PWM' : type === 'thy_6p' ? '6-PULSE' : '12-PULSE'}
          </text>
          <text x="60" y="80" fill="white" fontSize="4" textAnchor="middle" stroke="none" opacity="0.6">GATE GENERATOR</text>
          {(type === 'pwm_3ph' || type === 'pwm_npc') && <path d="M20 40V30H30V40H40V30H50V40" strokeWidth="1" opacity="0.4" />}
        </svg>
      );
    case 'belt_props':
    case 'belt_end':
    case 'belt_spool':
    case 'pulley':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="white" stroke="#ccc" />
          {type === 'belt_props' && (
            <g transform="translate(15,15)">
              <circle cx="15" cy="15" r="10" stroke="#3b82f6" strokeWidth="2.4" strokeDasharray="2 1" />
              <path d="M10 15L20 15M15 10L15 20" stroke="#333" />
            </g>
          )}
          {type === 'belt_spool' && (
            <g transform="translate(15,15)">
              <rect x="5" y="5" width="20" height="20" rx="2" fill="#1e293b" />
              <path d="M5 10H25M5 15H25M5 20H25" stroke="#3b82f6" strokeWidth="1" />
            </g>
          )}
          {type === 'pulley' && (
            <g transform="translate(15,15)">
              <circle cx="15" cy="15" r="12" stroke="#475569" strokeWidth="2.4" fill="#f1f5f9" />
              <circle cx="15" cy="15" r="3" fill="#475569" />
              <path d="M5 5L25 25" stroke="#3b82f6" strokeWidth="2.4" strokeDasharray="2 1" />
            </g>
          )}
          {type === 'belt_end' && (
            <g transform="translate(15,15)">
              <rect x="5" y="10" width="10" height="10" fill="#475569" />
              <path d="M15 15H30" stroke="#3b82f6" strokeWidth="2.4" strokeDasharray="2 1" />
            </g>
          )}
        </svg>
      );
    case 'world_frame':
    case 'ref_frame':
    case 'rigid_trans':
    case 'dist_cons':
    case 'angle_cons':
    case 'grav':
    case 'spring_damper':
    case 'ext_force':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="white" stroke="#ccc" />
          {type === 'world_frame' && (
            <g transform="translate(15,15)">
              <path d="M0 25H30M15 0V30" stroke="#475569" strokeWidth="1" />
              <path d="M15 15L25 5" stroke="#475569" strokeWidth="1" />
              <rect x="12" y="12" width="6" height="6" fill="#1e293b" />
            </g>
          )}
          {type === 'rigid_trans' && (
            <g transform="translate(15,15)">
              <path d="M5 25L25 5" stroke="#3b82f6" strokeWidth="2.4" strokeDasharray="2 2" />
              <circle cx="5" cy="25" r="3" fill="#1e293b" />
              <circle cx="25" cy="5" r="3" fill="#3b82f6" />
            </g>
          )}
          {type === 'spring_damper' && (
            <g transform="translate(15,15)">
              <path d="M0 15H10L12 10L14 20L16 10L18 20L20 15H30" stroke="#475569" strokeWidth="1.5" />
              <rect x="10" y="5" width="10" height="20" stroke="#475569" fill="white" opacity="0.3" />
            </g>
          )}
          {type.includes('cons') && (
            <g transform="translate(15,15)">
              <circle cx="5" cy="15" r="3" fill="#333" />
              <circle cx="25" cy="15" r="3" fill="#333" />
              <path d="M5 15H25" stroke="#333" strokeWidth="2.4" strokeDasharray="1 1" />
            </g>
          )}
        </svg>
      );
    case 'rev_joint':
    case 'prism_joint':
    case 'sphere_joint':
    case 'univ_joint':
    case 'weld_joint':
    case 'gear_cons':
    case 'rack_pinion':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="white" stroke="#ccc" />
          {type === 'rev_joint' && (
            <g transform="translate(15,15)">
              <circle cx="15" cy="15" r="8" stroke="#475569" strokeWidth="2.4" />
              <path d="M15 15L25 15M15 15L15 25" stroke="#3b82f6" strokeWidth="2.4" />
              <path d="M10 10L12 8L15 7L18 8L20 10" stroke="#3b82f6" strokeWidth="1" strokeDasharray="1 1" />
            </g>
          )}
          {type === 'prism_joint' && (
            <g transform="translate(15,15)">
              <rect x="5" y="10" width="20" height="10" fill="#475569" opacity="0.3" />
              <rect x="10" y="5" width="10" height="20" fill="#3b82f6" />
            </g>
          )}
          {type === 'sphere_joint' && (
            <g transform="translate(15,15)">
              <circle cx="15" cy="15" r="10" fill="#cbd5e1" stroke="#475569" />
              <circle cx="15" cy="15" r="4" fill="#475569" />
              <path d="M15 15L25 25" stroke="#475569" strokeWidth="2.4" />
            </g>
          )}
          {type === 'gear_cons' && (
            <g transform="translate(15,15)">
              <circle cx="10" cy="10" r="8" stroke="#475569" strokeWidth="2.4" />
              <circle cx="22" cy="22" r="5" stroke="#3b82f6" strokeWidth="2.4" />
              <path d="M5 10H15M10 5V15M19 22H25M22 19V25" stroke="#64748b" strokeWidth="1" />
            </g>
          )}
        </svg>
      );
    case 'mech_cfg':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
          <rect x="5" y="5" width="50" height="50" rx="2" fill="white" stroke="#ccc" />
          <g transform="translate(10,10)">
            {/* Robot Arm Icon */}
            <path d="M5 35L15 35L25 15L35 15" stroke="#475569" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="15" cy="35" r="4" fill="#333" />
            <circle cx="25" cy="15" r="3" fill="#333" />
            {/* Gear Icon */}
            <circle cx="10" cy="30" r="6" stroke="#333" strokeWidth="1" />
            <path d="M10 24V36M4 30H16M6 26L14 34M6 34L14 26" stroke="#333" strokeWidth="1" />
          </g>
        </svg>
      );
    case 'ma_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 30H40M25 35H35M28 40H32" strokeOpacity="0.5" />
          <path d="M30 10V30" />
          <path d="M28 5Q30 0 32 5Q30 10 28 5" fill={color} stroke="none" />
        </svg>
      );
    case 'ma_chamber':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="4" />
          <path d="M25 25Q27 20 29 25Q27 30 25 25" fill={color} stroke="none" />
          <path d="M30 0V15M30 45V60" strokeDasharray="2 2" strokeOpacity="0.5" />
        </svg>
      );
    case 'ma_pipe':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="15" width="20" height="10" rx="2" />
          <path d="M28 18Q30 14 32 18Q30 22 28 18" fill={color} stroke="none" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 25V35" stroke="#ef4444" strokeWidth="1" />
        </svg>
      );
    case 'ma_separator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <path d="M25 25Q27 20 29 25" strokeWidth="1" />
          <path d="M20 35H40" strokeOpacity="0.3" strokeDasharray="2 2" />
          <path d="M25 40Q27 35 29 40Q27 45 25 40" fill={color} stroke="none" />
        </svg>
      );
    case 'mag_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 30H40M25 35H35M28 40H32" strokeOpacity="0.5" />
          <path d="M30 10V30" />
          <circle cx="30" cy="5" r="2" fill={color} />
        </svg>
      );
    case 'reluctance':
    case 'reluctance_f':
    case 'var_reluctance':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="10" width="30" height="20" rx="2" />
          <text x="30" y="24" fill={color} fontSize="12" textAnchor="middle" stroke="none">ℛ</text>
          <path d="M0 20H15M45 20H60" />
          {type === 'var_reluctance' && <path d="M20 35L40 5" strokeWidth="1" />}
        </svg>
      );
    case 'perm_magnet':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="10" width="30" height="20" rx="2" />
          <line x1="30" y1="10" x2="30" y2="30" strokeWidth="1" strokeDasharray="2 2" />
          <text x="22" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">N</text>
          <text x="38" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">S</text>
          <path d="M0 20H15M45 20H60" />
        </svg>
      );
    case 'em_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M15 10C15 10 5 10 5 20C5 30 15 30 15 30C15 30 5 30 5 40C5 50 15 50 15 50" stroke="#3b82f6" />
          <path d="M45 15C55 30 55 30 45 45" />
          <path d="M15 30H45" strokeDasharray="2 2" strokeOpacity="0.5" />
        </svg>
      );
    case 'rel_force':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 20Q20 30 10 40" />
          <path d="M20 20Q30 30 20 40" />
          <rect x="35" y="22" width="15" height="15" stroke="#f59e0b" />
          <path d="M25 30H35" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_props':
    case 'gas_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 30H40M25 35H35M28 40H32" />
          <path d="M30 10V30" />
        </svg>
      );
    case 'gas_cap':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 10H40V30H20V10ZM30 30V40" />
        </svg>
      );
    case 'gas_chamber':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="15" y="15" width="30" height="30" rx="4" />
          <path d="M30 0V15M30 45V60" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_resistance':
    case 'gas_inf_res':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H15L20 10L30 30L40 10L45 20H60" />
          {type === 'gas_inf_res' && <rect x="20" y="10" width="20" height="20" fill={color} fillOpacity="0.2" />}
        </svg>
      );
    case 'gas_restriction':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M10 30H25M35 30H50" />
          <path d="M25 20L35 40M35 20L25 40" />
          <path d="M30 10V20" />
        </svg>
      );
    case 'scope':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <path d="M10 20L20 10L30 30L40 10L50 20" strokeWidth="1.5" strokeOpacity="0.5" />
          <circle cx="50" cy="10" r="1.5" fill={color} />
        </svg>
      );
    case 'ps_pi_ctrl':
    case 'ps_pid_ctrl':
    case 'pid_ctrl':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none" fontWeight="bold">
            {type === 'ps_pi_ctrl' ? 'PI' : 'PID'}
          </text>
        </svg>
      );
    case 'doe_custom':
    case 'DOE_MODEL':
    case 'Statistical':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color || '#c9a86c'} strokeWidth="2.4">
          <rect x="10" y="10" width="40" height="40" rx="8" fill={color || '#c9a86c'} fillOpacity="0.1" />
          <path d="M20 20L40 40M40 20L20 40" strokeOpacity="0.2" />
          <circle cx="30" cy="30" r="12" strokeDasharray="4 2" />
          <text x="30" y="34" textAnchor="middle" fill={color || '#c9a86c'} fontSize="10" fontWeight="black" stroke="none">DOE</text>
        </svg>
      );
    case 'lms_adaptive_filter':
      return (
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="60" height="40" rx="4" fill={color} fillOpacity="0.05" />
          <path d="M15 30H30L35 20L45 40L50 30H65" strokeWidth="1.5" />
          <text x="40" y="52" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="bold">LMS FILTER</text>
        </svg>
      );
    case 'neural_neuron_learning':
      return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="70" height="70" rx="4" fill={color} fillOpacity="0.05" />
          <circle cx="25" cy="25" r="6" />
          <circle cx="25" cy="55" r="6" />
          <circle cx="55" cy="40" r="10" fill={color} fillOpacity="0.2" />
          <line x1="31" y1="27" x2="46" y2="36" strokeWidth="1.5" />
          <line x1="31" y1="53" x2="46" y2="44" strokeWidth="1.5" />
          <text x="40" y="72" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="bold">NEURON</text>
        </svg>
      );
    case 'rl_q_learning_controller':
      return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="5" y="5" width="70" height="70" rx="4" fill={color} fillOpacity="0.05" />
          <path d="M25 40 A15 15 0 1 1 55 40 A15 15 0 0 1 25 40" strokeDasharray="3 3" />
          <path d="M55 40 L53 35 M55 40 L50 42" strokeWidth="2.4" />
          <text x="40" y="44" textAnchor="middle" fill={color} fontSize="14" stroke="none" fontWeight="bold">Q</text>
          <text x="40" y="72" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="bold">RL AGENT</text>
        </svg>
      );
    case 'ac_motor_pid_control':
      return (
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="80" height="80" rx="6" fill={color} fillOpacity="0.05" />
          <circle cx="65" cy="50" r="20" />
          <text x="65" y="56" textAnchor="middle" fill={color} fontSize="16" stroke="none" fontWeight="bold">M</text>
          <rect x="20" y="35" width="25" height="30" rx="2" strokeWidth="1.5" />
          <text x="32" y="53" textAnchor="middle" fill={color} fontSize="8" stroke="none" fontWeight="bold">PID</text>
          <path d="M45 50 H50" strokeWidth="1.5" />
        </svg>
      );
    case 'inport':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="20" r="14" /><path d="M0 20H16M44 20H60M38 20L32 14M38 20L32 26" strokeLinecap="round" />
        </svg>
      );
    case 'outport':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="20" r="14" /><path d="M0 20H16M22 20H38M52 20L44 14M52 20L44 26" strokeLinecap="round" />
        </svg>
      );
    case 'subsystem':
      return (
        <svg width="70" height="60" viewBox="0 0 70 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="50" height="40" rx="6" /><path d="M4 18V42M16 24H30M16 36H30M40 30H56M56 30L50 25M56 30L50 35" strokeLinecap="round" />
          <circle cx="34" cy="24" r="2" fill={color} /><circle cx="34" cy="36" r="2" fill={color} />
        </svg>
      );
    case 'nmos':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="24" /><path d="M12 30H26M26 22V38M32 20V40M38 24V36" strokeLinecap="round" />
          <path d="M38 30H48M48 30V46" strokeLinecap="round" /><text x="43" y="18" fontSize="9" fontWeight="700" fill={color} stroke="none">N</text>
        </svg>
      );
    case 'igbt':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="24" /><path d="M22 18V42M22 30H34M28 22V38M40 24V36M40 30H52" strokeLinecap="round" />
          <path d="M34 30L28 27V33Z" fill={color} stroke="none" />
        </svg>
      );
    case 'inverter':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M18 6V34L46 20L18 6Z" /><circle cx="49" cy="20" r="3" /><path d="M0 20H18M52 20H60" strokeLinecap="round" />
        </svg>
      );
    case 'minus':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="20" r="14" /><path d="M12 20H28" strokeLinecap="round" />
        </svg>
      );
    case 'zap':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M22 4L10 22H19L17 36L30 17H21L22 4Z" strokeLinejoin="round" />
        </svg>
      );
    case 'wind':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 14H38C44 14 44 6 38 6M4 22H48C54 22 54 30 48 30M4 30H30" strokeLinecap="round" />
        </svg>
      );
    case 'heater':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H12M48 20H60M12 20C12 12 24 12 24 20C24 28 36 28 36 20C36 12 48 12 48 20" strokeLinecap="round" />
          <path d="M30 4V9M25 6L27 10M35 6L33 10" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      );
    case 'check_valve':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H18M42 20H60M18 20L42 10V30L18 20Z" strokeLinejoin="round" />
        </svg>
      );
    case 'relief_valve':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 28H18M42 28H60M18 28V14H42V28M30 14V6M26 8L30 4L34 8" strokeLinecap="round" />
        </svg>
      );
    case 'orifice':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H22M38 20H60M22 6V34M38 6V34" strokeLinecap="round" />
        </svg>
      );
    case 'nozzle':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 8V32L34 26V14L4 8ZM34 20H50L56 23V17L50 20" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case 'fluid_resistance':
    case 'fluid_res':
    case 'gas_res':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="10" width="20" height="10" rx="2" /><path d="M0 15H20M40 15H60" />
          <text x="30" y="18" textAnchor="middle" fill={color} fontSize="8" fontWeight="700" stroke="none">{type === 'gas_res' ? 'G' : 'F'}</text>
        </svg>
      );
    case 'accumulator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 10H40V44C40 50 20 50 20 44V10Z" /><path d="M20 22H40M30 0V10M24 54H36" strokeLinecap="round" />
        </svg>
      );
    case 'steam_generator_fluid':
    case 'steam_gen':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="14" y="14" width="32" height="38" rx="5" /><path d="M20 40C24 34 26 46 30 40C34 34 36 46 40 40" strokeLinecap="round" />
          <path d="M22 8C22 5 26 5 26 8M34 8C34 5 38 5 38 8" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      );
    case 'rot_motion':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="18" cy="20" r="10" /><path d="M14 20A4 4 0 0 1 22 20" strokeDasharray="2 2" /><path d="M28 20H52M52 20L46 15M52 20L46 25" strokeLinecap="round" />
        </svg>
      );
    case 'trans_motion':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="8" y="12" width="20" height="16" rx="2" /><path d="M28 20H52M52 20L46 15M52 20L46 25" strokeLinecap="round" /><path d="M12 20H24" strokeDasharray="2 2" />
        </svg>
      );
    case 'rot_multibody':
      return <SymGlyph w={60} h={60} color={color} text="R-MB" sub="ROTATIONAL" />;
    case 'trans_multibody':
      return <SymGlyph w={60} h={60} color={color} text="T-MB" sub="TRANSLATIONAL" />;
    case 'ma_rot_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="30" r="11" /><rect x="34" y="20" width="16" height="20" rx="2" /><path d="M31 30H34" strokeDasharray="2 2" /><text x="20" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">ω</text>
        </svg>
      );
    case 'ma_trans_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="20" width="16" height="20" rx="2" /><rect x="34" y="20" width="16" height="20" rx="2" /><path d="M26 30H34" strokeDasharray="2 2" /><text x="18" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">v</text><text x="42" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">F</text>
        </svg>
      );
    case 'vel_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="22" /><path d="M16 30H38M38 30L31 24M38 30L31 36" strokeLinecap="round" /><text x="30" y="16" fontSize="9" fontWeight="700" fill={color} stroke="none" textAnchor="middle">v</text>
        </svg>
      );
    case 'wheel_axle':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="34" r="16" /><circle cx="30" cy="34" r="4" /><path d="M30 4V18M26 8L30 4L34 8" strokeLinecap="round" />
        </svg>
      );
    case 'database':
      return <SymGlyph w={60} h={60} color={color} text="DB" sub="DATA" />;
    case 'eye':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 20C14 8 46 8 56 20C46 32 14 32 4 20Z" strokeLinejoin="round" /><circle cx="30" cy="20" r="6" />
        </svg>
      );
    case 'ps_ramp':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 32H10L30 10V32" strokeLinecap="round" strokeLinejoin="round" /><path d="M30 28V32H26" strokeWidth="1.5" />
        </svg>
      );
    // Gas domain
    case 'gas_reservoir':
      return <SymGlyph w={60} h={60} color={color} text="GAS" sub="RESERVOIR" />;
    case 'gas_rotational_conv':
      return <SymGlyph w={60} h={60} color={color} text="G-R" sub="GAS↔ROT" />;
    case 'gas_translational_conv':
      return <SymGlyph w={60} h={60} color={color} text="G-T" sub="GAS↔TRA" />;
    case 'gas_flow_source':
      return <SymGlyph w={60} h={60} color={color} text="G-SRC" sub="FLOW" />;
    case 'gas_pressure_source':
      return <SymGlyph w={60} h={60} color={color} text="G-SRC" sub="PRESS" />;
    case 'gas_properties':
      return <SymGlyph w={60} h={60} color={color} text="GAS" sub="PROPS" />;
    // Magnetic
    case 'fundamental_reluctance':
      return <SymGlyph w={60} h={60} color={color} text="REL" sub="FUNDAMENTAL" />;
    case 'variable_reluctance':
      return <SymGlyph w={60} h={60} color={color} text="REL" sub="VAR" />;
    case 'permanent_magnet':
      return <SymGlyph w={60} h={60} color={color} text="PM" />;
    case 'em_converter':
      return <SymGlyph w={60} h={60} color={color} text="EM" sub="CONVERTER" />;
    case 'reluctance_force':
      return <SymGlyph w={60} h={60} color={color} text="REL-F" />;
    case 'mag_flux_sensor':
      return <SymGlyph w={60} h={60} color={color} text="Φ" sub="SENSOR" />;
    case 'mag_mmf_sensor':
      return <SymGlyph w={60} h={60} color={color} text="MMF" sub="SENSOR" />;
    case 'mag_mmf_source':
      return <SymGlyph w={60} h={60} color={color} text="MMF" sub="SOURCE" />;
    case 'mag_flux_source':
      return <SymGlyph w={60} h={60} color={color} text="Φ" sub="SOURCE" />;
    case 'mag_controlled_mmf':
      return <SymGlyph w={60} h={60} color={color} text="MMF" sub="CTRL" />;
    // Sensors
    case 'rot_motion_sensor':
      return <SymGlyph w={60} h={60} color={color} text="ω" sub="SENSOR" />;
    case 'trans_motion_sensor':
      return <SymGlyph w={60} h={60} color={color} text="v" sub="SENSOR" />;
    case 'heat_flow_sensor':
      return <SymGlyph w={60} h={60} color={color} text="Q" sub="SENSOR" />;
    case 'pressure_sensor':
      return <SymGlyph w={60} h={60} color={color} text="P" sub="SENSOR" />;
    case 'flow_sensor':
      return <SymGlyph w={60} h={60} color={color} text="ṁ" sub="SENSOR" />;
    // Interfaces
    case 'rot_multibody_interface':
      return <SymGlyph w={60} h={60} color={color} text="R-MB" sub="IFACE" />;
    case 'trans_multibody_interface':
      return <SymGlyph w={60} h={60} color={color} text="T-MB" sub="IFACE" />;
    case 'ma_moisture_sensor':
      return <SymGlyph w={60} h={60} color={color} text="%" sub="MOIST" />;
    case 'ma_thermo_sensor':
      return <SymGlyph w={60} h={60} color={color} text="T°" sub="SENSOR" />;
    case 'ma_moisture_source':
      return <SymGlyph w={60} h={60} color={color} text="%" sub="SRC" />;
    case 'ma_flow_source':
      return <SymGlyph w={60} h={60} color={color} text="MA" sub="FLOW" />;
    // Motor control
    case 'bldc_commutation':
      return <SymGlyph w={60} h={60} color={color} text="BLDC" sub="COMM" />;
    case 'bldc_current_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="BLDC" sub="I-CTRL" />;
    case 'bldc_pwm_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="BLDC" sub="PWM" />;
    case 'pfc_rectifier_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="PFC" />;
    case 'cycloconverter_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="CYCLO" />;
    case 'dc_current_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="DC" sub="I-CTRL" />;
    case 'dc_voltage_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="DC" sub="V-CTRL" />;
    case 'hysteresis_ctrl_3ph':
      return <SymGlyph w={60} h={60} color={color} text="HYS" sub="3PH" />;
    case 'velocity_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="VEL" sub="CTRL" />;
    case 'im_dtc_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="DTC" />;
    case 'im_curr_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="IM" sub="I-CTRL" />;
    case 'pmsm_curr_ctrl':
      return <SymGlyph w={60} h={60} color={color} text="PMSM" sub="I-CTRL" />;
    case 'pmsm_ref_gen':
      return <SymGlyph w={60} h={60} color={color} text="PMSM" sub="REF" />;
    case 'pmsm_field_weakening':
      return <SymGlyph w={60} h={60} color={color} text="PMSM" sub="FW" />;
    case 'pmsm_tq_est':
      return <SymGlyph w={60} h={60} color={color} text="PMSM" sub="TQ-EST" />;
    // Transforms / observers
    case 'clarke_transform':
      return <SymGlyph w={60} h={60} color={color} text="abc→αβ" />;
    case 'inv_clarke_transform':
      return <SymGlyph w={60} h={60} color={color} text="αβ→abc" />;
    case 'park_transform':
      return <SymGlyph w={60} h={60} color={color} text="dq" sub="PARK" />;
    case 'inv_park_transform':
      return <SymGlyph w={60} h={60} color={color} text="dq⁻¹" />;
    case 'sym_comp_transform':
      return <SymGlyph w={60} h={60} color={color} text="SYM" sub="COMP" />;
    case 'inv_sym_comp_transform':
      return <SymGlyph w={60} h={60} color={color} text="SYM⁻¹" />;
    case 'im_flux_observer':
      return <SymGlyph w={60} h={60} color={color} text="FLUX" sub="OBS" />;
    case 'luenberger_observer':
      return <SymGlyph w={60} h={60} color={color} text="LUEN" sub="OBS" />;
    case 'quad_decoder':
      return <SymGlyph w={60} h={60} color={color} text="QDEC" />;
    case 'resolver_to_digital':
      return <SymGlyph w={60} h={60} color={color} text="RDC" />;
    case 'thyristor_6pulse':
      return <SymGlyph w={60} h={60} color={color} text="THY" sub="6P" />;
    case 'thyristor_12pulse':
      return <SymGlyph w={60} h={60} color={color} text="THY" sub="12P" />;
    // Signal processing
    case 'ps_lpf':
      return <SymGlyph w={60} h={60} color={color} text="LPF" />;
    case 'ps_integrator_gen':
      return <SymGlyph w={60} h={60} color={color} text="∫" sub="GEN" />;
    case 'ps_moving_avg':
      return <SymGlyph w={60} h={60} color={color} text="MOV" sub="AVG" />;
    case 'ps_sr_flipflop':
      return <SymGlyph w={60} h={60} color={color} text="SR" sub="FF" />;
    case 'ps_sample_hold':
      return <SymGlyph w={60} h={60} color={color} text="S/H" />;
    case 'ps_smith_predictor':
      return <SymGlyph w={60} h={60} color={color} text="SMITH" />;
    case 'ps_sine_3phase':
      return <SymGlyph w={60} h={60} color={color} text="3~SIN" />;
    case 'ps_second_order_filter':
      return <SymGlyph w={60} h={60} color={color} text="2ND" sub="ORD" />;
    case 'ps_state_feedback':
      return <SymGlyph w={60} h={60} color={color} text="SF" sub="FB" />;
    case 'ps_sliding_mode':
      return <SymGlyph w={60} h={60} color={color} text="SMC" />;
    case 'ps_stair_gen':
      return <SymGlyph w={60} h={60} color={color} text="STAIR" />;
    case 'ps_washout':
      return <SymGlyph w={60} h={60} color={color} text="WASH" />;
    case 'ps_terminator':
      return <SymGlyph w={60} h={60} color={color} text="TERM" />;
    case 'ps_simulink_conv':
      return <SymGlyph w={60} h={60} color={color} text="PS→SL" />;
    case 'simulink_ps_conv':
      return <SymGlyph w={60} h={60} color={color} text="SL→PS" />;
    case 'vlab_probe':
      return <SymGlyph w={60} h={60} color={color} text="PROBE" />;
    // Mechanical
    case 'belt_properties':
      return <SymGlyph w={60} h={60} color={color} text="BELT" />;
    case 'rigid_transform':
      return <SymGlyph w={60} h={60} color={color} text="RIGID" />;
    case 'dist_constraint':
      return <SymGlyph w={60} h={60} color={color} text="DIST" sub="CONST" />;
    case 'angle_constraint':
      return <SymGlyph w={60} h={60} color={color} text="ANG" sub="CONST" />;
    case 'grav_field':
      return <SymGlyph w={60} h={60} color={color} text="g" sub="FIELD" />;
    case 'spring_damper_force':
      return <SymGlyph w={60} h={60} color={color} text="K-C" sub="FORCE" />;
    case 'external_force':
      return <SymGlyph w={60} h={60} color={color} text="F" sub="EXT" />;
    case 'revolute_joint':
      return <SymGlyph w={60} h={60} color={color} text="REV" sub="JOINT" />;
    case 'prismatic_joint':
      return <SymGlyph w={60} h={60} color={color} text="PRI" sub="JOINT" />;
    case 'spherical_joint':
      return <SymGlyph w={60} h={60} color={color} text="SPH" sub="JOINT" />;
    case 'universal_joint':
      return <SymGlyph w={60} h={60} color={color} text="UNI" sub="JOINT" />;
    case 'common_gear':
      return <SymGlyph w={60} h={60} color={color} text="GEAR" />;
    case 'mech_config':
      return <SymGlyph w={60} h={60} color={color} text="MECH" sub="CFG" />;
    // Heat
    case 'conductive_heat':
      return <SymGlyph w={60} h={60} color={color} text="COND" sub="HEAT" />;
    case 'convective_heat':
      return <SymGlyph w={60} h={60} color={color} text="CONV" sub="HEAT" />;
    case 'radiative_heat':
      return <SymGlyph w={60} h={60} color={color} text="RAD" sub="HEAT" />;
    // Fluid
    case 'fluid_ref':
      return <SymGlyph w={60} h={60} color={color} text="REF" sub="FLUID" />;
    case 'fluid_capacitance':
      return <SymGlyph w={60} h={60} color={color} text="C" sub="FLUID" />;
    case 'fluid_inertance':
      return <SymGlyph w={60} h={60} color={color} text="I" sub="FLUID" />;
    case 'pressure_source':
      return <SymGlyph w={60} h={60} color={color} text="P-SRC" />;
    case 'ctrl_pressure_source':
      return <SymGlyph w={60} h={60} color={color} text="P-SRC" sub="CTRL" />;
    case 'mass_flow_source':
      return <SymGlyph w={60} h={60} color={color} text="ṁ-SRC" />;
    case 'steam_accumulator':
      return <SymGlyph w={60} h={60} color={color} text="STEAM" sub="ACC" />;
    case 'steam_nozzle':
      return <SymGlyph w={60} h={60} color={color} text="NOZ" sub="STEAM" />;
    default:
      if (type && type.toLowerCase().includes('doe')) {
        return (
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color || '#c9a86c'} strokeWidth="2.4">
            <rect x="10" y="10" width="40" height="40" rx="8" fill={color || '#c9a86c'} fillOpacity="0.1" />
            <text x="30" y="34" textAnchor="middle" fill={color || '#c9a86c'} fontSize="10" fontWeight="700" stroke="none">DOE</text>
          </svg>
        );
      }
      return <UnknownSymbolGlyph type={type} color={color} />;
  }
};

export const UnknownSymbolGlyph = ({ type, color }: { type: string; color?: string }) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
    <rect x="8" y="8" width="44" height="44" rx="10" stroke={color || '#94a3b8'} strokeWidth="2.4" strokeDasharray="5 4" opacity="0.7" />
    <text x="30" y="35" textAnchor="middle" fill={color || '#94a3b8'} fontSize="11" fontWeight="700" fontFamily="system-ui" stroke="none">
      {(type || '?').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || '?'}
    </text>
  </svg>
);

export const SymbolRenderer = ({ type, color, size }: { type: string; color?: string; size?: number }) => {
  const inner = RawSymbolRenderer({ type, color });
  if (!size) return <div className="vlab-symbol">{inner}</div>;
  const d = getBlockDimensions(type);
  const k = Math.min(size / Math.max(d.width, d.height), 1);
  return (
    <div className="vlab-symbol" style={{ width: d.width * k, height: d.height * k, overflow: 'visible' }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: 'center' }}>{inner}</div>
    </div>
  );
};
