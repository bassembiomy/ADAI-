import React, { useCallback, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  Panel,
  BackgroundVariant,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { VLabWorkspaceProps } from './VLabWorkspaceTypes';
import { VLAB_LIBRARY, VLabBlock } from '../../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../../engine/vlab/vlabComponentDefinitions';
import { Settings2, Play, Pause, Square, Send, ChevronLeft, Box, Activity, Cpu, LineChart, X, Maximize2, FileSpreadsheet, Info } from 'lucide-react';
import { LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';


const SymbolRenderer = ({ type, color }: { type: string, color: string }) => {
  switch (type) {
    case 'resistor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H15L18 5L24 25L30 5L36 25L42 5L45 15H60" />
        </svg>
      );
    case 'capacitor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H25M35 15H60M25 5V25M35 5V25" />
        </svg>
      );
    case 'inductor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H10C10 15 10 5 17.5 5C25 5 25 15 25 15C25 15 25 5 32.5 5C40 5 40 15 40 15C40 15 40 5 47.5 5C55 5 55 15 55 15H60" />
        </svg>
      );
    case 'diode':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H20L20 5L40 15L20 25L20 15M40 5V25M40 15H60" />
        </svg>
      );
    case 'ground':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 0V15M10 15H30M13 20H27M17 25H23" />
        </svg>
      );
    case 'dc_motor':
    case 'pmsm':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="25" />
          <text x="30" y="38" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" stroke="none">M</text>
        </svg>
      );
    case 'three_phase_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="25" />
          <path d="M15 30Q22.5 15 30 30T45 30" />
          <text x="45" y="50" textAnchor="middle" fill={color} fontSize="10" stroke="none">3~</text>
        </svg>
      );
    case 'transformer':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M15 10C15 10 5 10 5 20C5 30 15 30 15 30C15 30 5 30 5 40C5 50 15 50 15 50" />
          <path d="M45 10C45 10 55 10 55 20C55 30 45 30 45 30C45 30 55 30 55 40C55 50 45 50 45 50" />
          <line x1="25" y1="10" x2="25" y2="50" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="35" y1="10" x2="35" y2="50" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'gyrator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="20" cy="30" r="10" />
          <circle cx="40" cy="30" r="10" />
          <path d="M20 20Q30 30 40 20M20 40Q30 30 40 40" />
        </svg>
      );
    case 'opamp':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 5V35L50 20L10 5Z" />
          <text x="15" y="15" fill={color} fontSize="8" stroke="none">+</text>
          <text x="15" y="30" fill={color} fontSize="8" stroke="none">-</text>
        </svg>
      );
    case 'memristor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="10" width="30" height="10" />
          <path d="M0 15H15M45 15H60M15 10L45 20" strokeWidth="1" />
        </svg>
      );
    case 'switch':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <circle cx="15" cy="25" r="2" fill={color} />
          <circle cx="45" cy="25" r="2" fill={color} />
          <path d="M15 25L40 10" />
          <path d="M0 25H15M45 25H60" />
        </svg>
      );
    case 'variable_resistor':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 25H15L18 15L24 35L30 15L36 35L42 15L45 25H60" />
          <path d="M20 35L40 5" strokeWidth="1" />
          <path d="M40 5L35 7M40 5L38 10" strokeWidth="1" />
        </svg>
      );
    case 'infinite_resistance':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="10" width="20" height="10" rx="2" strokeDasharray="2 2" />
          <text x="30" y="18" fill={color} fontSize="8" textAnchor="middle" stroke="none">∞</text>
          <path d="M0 15H20M40 15H60" />
        </svg>
      );
    case 'rotational_em':
    case 'translational_em':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="20" cy="30" r="8" />
          <rect x="35" y="22" width="15" height="15" />
          <path d="M28 30H35" strokeDasharray="2 2" />
        </svg>
      );
    case 'thermal_resistor':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="15" width="20" height="10" fill={color} fillOpacity="0.2" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 15V5M25 5H35" />
        </svg>
      );
    case 'v_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <text x="30" y="34" fill={color} fontSize="12" textAnchor="middle" stroke="none">V</text>
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'i_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="15" />
          <text x="30" y="25" fill={color} fontSize="10" textAnchor="middle" stroke="none">+</text>
          <text x="30" y="42" fill={color} fontSize="10" textAnchor="middle" stroke="none">-</text>
          {type === 'ac_voltage' && <path d="M22 30Q30 20 38 30Q30 40 22 30" strokeWidth="1" />}
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'dc_current':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M30 15L45 30L30 45L15 30Z" />
          <circle cx="30" cy="30" r="4" fill={color} fillOpacity="0.2" />
          <path d="M30 0V15M30 45V60" strokeWidth="1" />
        </svg>
      );
    case 'gas_flow_src':
    case 'gas_pres_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="15" width="20" height="10" rx="2" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 25V35" stroke="#ef4444" strokeWidth="1" />
        </svg>
      );
    case 'gas_fixed_res':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 30H40" />
          <path d="M30 10V30" />
          <path d="M25 15L30 10L35 15" strokeWidth="1" />
        </svg>
      );
    case 'gas_rot_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 15C10 30 10 30 20 45" stroke="#10b981" />
          <path d="M30 15C40 30 40 30 30 45" stroke={color} />
          <circle cx="25" cy="30" r="4" fill={color} fillOpacity="0.2" />
          <path d="M30 30H40" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_trans_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="35" y="20" width="15" height="20" stroke="#10b981" />
          <path d="M30 30H35" stroke="#10b981" />
          <rect x="20" y="15" width="10" height="30" stroke={color} />
          <path d="M30 30H40" strokeDasharray="2 2" />
        </svg>
      );
    case 'flux_sensor':
    case 'mmf_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30C22 20 38 20 38 30C38 40 22 40 22 30" />
          <path d="M30 15L30 45" strokeWidth="1" />
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none">+</text>
          <text x="30" y="42" fill={color} fontSize="8" textAnchor="middle" stroke="none">-</text>
        </svg>
      );
    case 'flux_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30C22 20 38 20 38 30C38 40 22 40 22 30" strokeOpacity="0.3" />
          <path d="M30 20V40M25 25L30 20L35 25" />
        </svg>
      );
    case 'gear_box':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="10" width="20" height="40" />
          <path d="M25 15H35M25 45H35M30 10V5M30 50V55" />
          <text x="30" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">G</text>
          <path d="M0 30H20M40 30H60" />
        </svg>
      );
    case 'lever':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 30C20 15 40 15 40 30" />
          <path d="M30 30V45" />
          <path d="M25 45H35" />
        </svg>
      );
    case 'rot_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 20H40M25 25H35M28 30H32" />
          <path d="M30 0V20" />
        </svg>
      );
    case 'rot_spring':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H10C10 20 15 10 20 20C25 30 30 10 35 20C40 30 45 10 50 20H60" />
        </svg>
      );
    case 'rot_damper':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30H40V10" />
          <path d="M30 15V25M25 15H35" />
        </svg>
      );
    case 'rot_friction':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H20M40 20H60" />
          <path d="M25 10V30M35 10V30" />
        </svg>
      );
    case 'rot_hard_stop':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30" />
          <path d="M20 10H30" strokeDasharray="2 2" />
        </svg>
      );
    case 'mass':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="20" width="20" height="20" />
          <path d="M30 0V20M30 40V60" strokeDasharray="2 2" strokeOpacity="0.5" />
          <path d="M25 60H35" />
        </svg>
      );
    case 'trans_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 20H40M20 20L15 25M25 20L20 25M30 20L25 25M35 20L30 25M40 20L35 25" />
          <path d="M30 0V20" />
        </svg>
      );
    case 'trans_spring':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H15L18 10L24 30L30 10L36 30L42 10L45 20H60" />
        </svg>
      );
    case 'trans_damper':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H15M45 20H60" />
          <path d="M15 10V30H45" />
          <path d="M30 10V30" />
        </svg>
      );
    case 'trans_friction':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 18H60M0 22H60" />
        </svg>
      );
    case 'trans_hard_stop':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H20M40 20H60" />
          <path d="M20 10V30" />
          <path d="M20 20L25 15L25 25Z" fill={color} />
        </svg>
      );
    case 'ma_flow_sensor':
    case 'ma_pt_sensor':
    case 'ma_thermo':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <path d={type === 'ma_flow_sensor' ? "M30 20C22 20 22 40 30 40C38 40 38 20 30 20" : "M22 30L38 30M35 25L38 30L35 35"} />
          {type === 'ma_pt_sensor' && <text x="30" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">P/T</text>}
        </svg>
      );
    case 'ma_selector':
      return (
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="50" rx="2" />
          <path d="M10 15H30M10 30H30M10 45H30" strokeOpacity="0.5" />
          <text x="20" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">S</text>
        </svg>
      );
    case 'ma_moisture':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="10" />
          <path d="M28 28Q30 24 32 28Q30 32 28 28" fill={color} stroke="none" />
        </svg>
      );
    case 'ma_moisture_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="15" />
          <path d="M28 25Q30 20 32 25Q30 30 28 25" fill={color} stroke="none" />
          <path d="M30 15V45" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'ma_flow_src':
    case 'ma_pres_src':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="15" />
          <path d="M22 30L38 30M34 26L38 30L34 34" strokeWidth="1.5" />
          <text x="30" y="25" fill={color} fontSize="8" textAnchor="middle" stroke="none">
            {type === 'ma_flow_src' ? 'M' : 'P'}
          </text>
          <path d="M0 30H15M45 30H60" strokeWidth="1" />
        </svg>
      );
    case 'ma_properties':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="5" width="40" height="30" rx="2" fill={color} fillOpacity="0.05" />
          <path d="M20 15Q22 10 24 15Q22 20 20 15" fill={color} stroke="none" />
          <path d="M30 25Q32 20 34 25Q32 30 30 25" fill={color} stroke="none" />
        </svg>
      );
    case 'ps_delay':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="24" fill={color} fontSize="14" textAnchor="middle" stroke="none">
            {type === 'ps_add' ? '+' : type === 'ps_subtract' ? '-' : type === 'ps_product' ? '×' : '÷'}
          </text>
        </svg>
      );
    case 'ps_gain':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M15 10L45 20L15 30V10Z" />
          <text x="22" y="23" fill={color} fontSize="8" textAnchor="middle" stroke="none">K</text>
        </svg>
      );
    case 'ps_math':
      return (
        <svg width="50" height="40" viewBox="0 0 50 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="10" width="40" height="20" rx="2" />
          <text x="25" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">FCN</text>
        </svg>
      );
    case 'ps_sum':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="25" fill={color} fontSize="14" textAnchor="middle" stroke="none">Σ</text>
        </svg>
      );
    case 'ps_integrator':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="5" width="40" height="30" rx="2" />
          <path d="M25 15H35M30 10V30M25 25H35" strokeWidth="1" strokeOpacity="0.3" />
          <text x="30" y="24" fill={color} fontSize="12" textAnchor="middle" stroke="none">1/s</text>
        </svg>
      );
    case 'ps_transfer_fcn':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">1/(Ts+1)</text>
        </svg>
      );
    case 'ps_lookup_1d':
    case 'ps_lookup_2d':
      return (
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="10" width="30" height="30" rx="2" />
          <path d="M15 35Q25 15 35 35" strokeWidth="1" />
          <path d="M15 15V35H35" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
      );
    case 'ps_abs':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M15 15L20 25L25 15" />
        </svg>
      );
    case 'ps_saturation':
    case 'ps_dead_zone':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d={type === 'ps_saturation' ? "M10 30H15L25 10H30" : "M10 25H20M30 25H40"} strokeWidth="1.5" />
          <path d="M5 20H35M20 5V35" strokeOpacity="0.2" strokeWidth="1" />
        </svg>
      );
    case 'ps_switch':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="24" fill={color} fontSize="8" textAnchor="middle" stroke="none">
            {type === 'ps_min' ? 'MIN' : 'MAX'}
          </text>
        </svg>
      );
    case 'ps_constant':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <text x="20" y="25" fill={color} fontSize="14" textAnchor="middle" stroke="none">C</text>
        </svg>
      );
    case 'ps_sine':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M10 20Q15 10 20 20Q25 30 30 20" strokeWidth="1.5" />
        </svg>
      );
    case 'ps_step':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="30" height="30" rx="2" />
          <path d="M10 30H20V10H30" strokeWidth="1.5" />
        </svg>
      );
    case 'ps_rms':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="5" width="40" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">RMS</text>
        </svg>
      );
    case 'ps_term':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 15V25M10 20H25M25 15V25" />
          <path d="M25 17H30M25 23H30" strokeOpacity="0.5" />
        </svg>
      );
    case 'conductive':
    case 'convective':
    case 'radiative':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="15" width="20" height="15" rx="1" />
          <path d="M20 5V15" />
          <path d="M15 35H25" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
      );
    case 'thermal_ref':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 5V15M10 15H30" />
          <path d="M12 20L15 15M17 20L20 15M22 20L25 15M27 20L30 15" strokeWidth="1" />
        </svg>
      );
    case 'temp_sensor':
    case 'heat_sensor':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
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
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <text x="30" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">f(x) = 0</text>
        </svg>
      );
    case 'ps_to_sim':
    case 'sim_to_ps':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 15L20 15M30 15L35 15" strokeWidth="1" />
          <path d={type === 'ps_to_sim' ? "M20 10L25 15L20 20" : "M25 10L20 15L25 20"} strokeWidth="2" />
          <path d="M5 15L10 15" strokeDasharray="2 2" />
        </svg>
      );
    case 'probe':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <circle cx="30" cy="30" r="8" strokeWidth="1" />
          <path d="M25 30H35M30 25V35" strokeWidth="1" />
          <text x="50" y="34" fill={color} fontSize="10" textAnchor="middle" stroke="none">x</text>
        </svg>
      );
    case 'conn_label':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <circle cx="15" cy="20" r="8" />
          <path d="M23 20L35 20" strokeWidth="1" />
          <path d="M15 15L15 25M10 20L20 20" strokeWidth="1" strokeOpacity="0.3" />
        </svg>
      );
    case 'busbar':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <rect x="10" y="5" width="40" height="20" fill={color} fillOpacity="0.2" />
          <path d="M5 15H10M50 15H55" />
          <circle cx="15" cy="15" r="1.5" fill={color} />
          <circle cx="45" cy="15" r="1.5" fill={color} />
        </svg>
      );
    case 'phase_splitter':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 20H25M25 10V30M25 10H45M25 20H45M25 30H45" />
          <text x="35" y="15" fill={color} fontSize="6" stroke="none">a</text>
          <text x="35" y="25" fill={color} fontSize="6" stroke="none">b</text>
          <text x="35" y="35" fill={color} fontSize="6" stroke="none">c</text>
        </svg>
      );
    case 'delta_ref':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 10V20M10 30L20 20L30 30H10" />
        </svg>
      );
    case 'open_circuit':
      return (
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke={color} strokeWidth="2">
          <circle cx="15" cy="20" r="4" />
          <path d="M15 5V16" />
        </svg>
      );
    case 'ps_demux':
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
        <svg width="100" height="120" viewBox="0 0 100 120" fill="none" stroke="white" strokeWidth="2">
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
        <svg width="100" height="120" viewBox="0 0 100 120" fill="none" stroke="white" strokeWidth="2">
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
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2">
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
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2">
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
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="white" strokeWidth="2">
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
              <circle cx="15" cy="15" r="10" stroke="#3b82f6" strokeWidth="2" strokeDasharray="2 1" />
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
              <circle cx="15" cy="15" r="12" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
              <circle cx="15" cy="15" r="3" fill="#475569" />
              <path d="M5 5L25 25" stroke="#3b82f6" strokeWidth="2" strokeDasharray="2 1" />
            </g>
          )}
          {type === 'belt_end' && (
            <g transform="translate(15,15)">
              <rect x="5" y="10" width="10" height="10" fill="#475569" />
              <path d="M15 15H30" stroke="#3b82f6" strokeWidth="2" strokeDasharray="2 1" />
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
              <path d="M5 25L25 5" stroke="#3b82f6" strokeWidth="2" strokeDasharray="2 2" />
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
              <path d="M5 15H25" stroke="#333" strokeWidth="2" strokeDasharray="1 1" />
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
              <circle cx="15" cy="15" r="8" stroke="#475569" strokeWidth="2" />
              <path d="M15 15L25 15M15 15L15 25" stroke="#3b82f6" strokeWidth="2" />
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
              <path d="M15 15L25 25" stroke="#475569" strokeWidth="2" />
            </g>
          )}
          {type === 'gear_cons' && (
            <g transform="translate(15,15)">
              <circle cx="10" cy="10" r="8" stroke="#475569" strokeWidth="2" />
              <circle cx="22" cy="22" r="5" stroke="#3b82f6" strokeWidth="2" />
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
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 30H40M25 35H35M28 40H32" strokeOpacity="0.5" />
          <path d="M30 10V30" />
          <path d="M28 5Q30 0 32 5Q30 10 28 5" fill={color} stroke="none" />
        </svg>
      );
    case 'ma_chamber':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="4" />
          <path d="M25 25Q27 20 29 25Q27 30 25 25" fill={color} stroke="none" />
          <path d="M30 0V15M30 45V60" strokeDasharray="2 2" strokeOpacity="0.5" />
        </svg>
      );
    case 'ma_pipe':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="20" y="15" width="20" height="10" rx="2" />
          <path d="M28 18Q30 14 32 18Q30 22 28 18" fill={color} stroke="none" />
          <path d="M0 20H20M40 20H60" />
          <path d="M30 25V35" stroke="#ef4444" strokeWidth="1" />
        </svg>
      );
    case 'ma_separator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="2" />
          <path d="M25 25Q27 20 29 25" strokeWidth="1" />
          <path d="M20 35H40" strokeOpacity="0.3" strokeDasharray="2 2" />
          <path d="M25 40Q27 35 29 40Q27 45 25 40" fill={color} stroke="none" />
        </svg>
      );
    case 'mag_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 30H40M25 35H35M28 40H32" strokeOpacity="0.5" />
          <path d="M30 10V30" />
          <circle cx="30" cy="5" r="2" fill={color} />
        </svg>
      );
    case 'reluctance':
    case 'reluctance_f':
    case 'var_reluctance':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="10" width="30" height="20" rx="2" />
          <text x="30" y="24" fill={color} fontSize="12" textAnchor="middle" stroke="none">ℛ</text>
          <path d="M0 20H15M45 20H60" />
          {type === 'var_reluctance' && <path d="M20 35L40 5" strokeWidth="1" />}
        </svg>
      );
    case 'perm_magnet':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="10" width="30" height="20" rx="2" />
          <line x1="30" y1="10" x2="30" y2="30" strokeWidth="1" strokeDasharray="2 2" />
          <text x="22" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">N</text>
          <text x="38" y="24" fill={color} fontSize="10" textAnchor="middle" stroke="none">S</text>
          <path d="M0 20H15M45 20H60" />
        </svg>
      );
    case 'em_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M15 10C15 10 5 10 5 20C5 30 15 30 15 30C15 30 5 30 5 40C5 50 15 50 15 50" stroke="#3b82f6" />
          <path d="M45 15C55 30 55 30 45 45" />
          <path d="M15 30H45" strokeDasharray="2 2" strokeOpacity="0.5" />
        </svg>
      );
    case 'rel_force':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 20Q20 30 10 40" />
          <path d="M20 20Q30 30 20 40" />
          <rect x="35" y="22" width="15" height="15" stroke="#f59e0b" />
          <path d="M25 30H35" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_props':
    case 'gas_ref':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 30H40M25 35H35M28 40H32" />
          <path d="M30 10V30" />
        </svg>
      );
    case 'gas_cap':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 10H40V30H20V10ZM30 30V40" />
        </svg>
      );
    case 'gas_chamber':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="15" width="30" height="30" rx="4" />
          <path d="M30 0V15M30 45V60" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'gas_resistance':
    case 'gas_inf_res':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 20H15L20 10L30 30L40 10L45 20H60" />
          {type === 'gas_inf_res' && <rect x="20" y="10" width="20" height="20" fill={color} fillOpacity="0.2" />}
        </svg>
      );
    case 'gas_restriction':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M10 30H25M35 30H50" />
          <path d="M25 20L35 40M35 20L25 40" />
          <path d="M30 10V20" />
        </svg>
      );
    case 'scope':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2">
          <rect x="5" y="5" width="50" height="30" rx="2" />
          <path d="M10 20L20 10L30 30L40 10L50 20" strokeWidth="1.5" strokeOpacity="0.5" />
          <circle cx="50" cy="10" r="1.5" fill={color} />
        </svg>
      );
    default:
      return (
        <div className="text-xl font-bold" style={{ color }}>{type.substring(0, 3).toUpperCase()}</div>
      );
  }
};

const VLabNode = ({ data, selected }: { data: any, selected: boolean }) => {
  // Group ports by side to calculate offsets
  const portsBySide = (data.ports || []).reduce((acc: any, port: any) => {
    if (!acc[port.pos]) acc[port.pos] = [];
    acc[port.pos].push(port);
    return acc;
  }, {});

  return (
    <div className={`relative group flex flex-col items-center transition-all ${selected ? 'z-50' : 'z-10'}`}>
      {/* Component Symbol Container */}
      <div 
        className={`relative flex items-center justify-center transition-all duration-300 ${
          selected 
          ? 'bg-purple-500/5 shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-105' 
          : 'bg-transparent'
        }`}
        style={{ minWidth: 80, minHeight: 60 }}
      >
        {/* Bidirectional Ports with Offsets */}
        {Object.entries(portsBySide).map(([side, sidePorts]: [any, any]) => (
          sidePorts.map((port: any, index: number) => {
            const totalOnSide = sidePorts.length;
            const offset = totalOnSide > 1 ? (index - (totalOnSide - 1) / 2) * 20 : 0;
            const position = side === 'left' ? Position.Left : 
                             side === 'right' ? Position.Right : 
                             side === 'top' ? Position.Top : Position.Bottom;
            
            return (
              <div 
                key={port.id} 
                className="absolute"
                style={{
                  top: (side === 'left' || side === 'right') ? `calc(50% + ${offset}px)` : (side === 'top' ? 0 : '100%'),
                  left: (side === 'top' || side === 'bottom') ? `calc(50% + ${offset}px)` : (side === 'left' ? 0 : '100%'),
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {/* Acausal "Trick": Overlay Source and Target for any-to-any connection */}
                <Handle
                  type="target"
                  position={position}
                  id={`${port.id}_t`}
                  className="!w-2 !h-2 !bg-blue-400/80 !border !border-white/20 hover:!bg-blue-300 hover:!scale-125 transition-all"
                />
                <Handle
                  type="source"
                  position={position}
                  id={`${port.id}_s`}
                  className="!w-2 !h-2 !bg-transparent !border-none" // Invisible source handle
                />
                
                {/* Port Label */}
                <div 
                  className="absolute text-[8px] font-black text-blue-500/50 select-none pointer-events-none uppercase"
                  style={{
                    top: side === 'top' ? -15 : side === 'bottom' ? 15 : 0,
                    left: side === 'left' ? -15 : side === 'right' ? 15 : 0,
                    transform: (side === 'left' || side === 'right') ? 'translateY(-50%)' : 'translateX(-50%)'
                  }}
                >
                  {port.label}
                </div>
              </div>
            );
          })
        ))}

        {/* The SVG Symbol */}
        <div className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <SymbolRenderer type={data.type} color={data.color} />
        </div>
      </div>

      {/* Block Label */}
      <div className={`mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${selected ? 'text-purple-400 bg-purple-500/10 border border-purple-500/20' : 'text-gray-500'}`}>
        {data.label}
      </div>
    </div>
  );
};

const nodeTypes = {
  default: VLabNode,
};

const ScopeView = ({ data, title }: { data: any[], title?: string }) => {
  return (
    <div className="w-full h-full bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden flex flex-col shadow-2xl">
      <div className="p-3 border-b border-[#222] bg-[#111] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-yellow-500" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title || 'Scope Signal Monitor'}</span>
        </div>
      </div>
      <div className="flex-1 p-6">
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="time" stroke="#444" fontSize={10} tickFormatter={(v) => v.toFixed(2)} />
            <YAxis stroke="#444" fontSize={10} />
            <Tooltip 
              contentStyle={{ background: '#111', border: '1px solid #333', fontSize: '10px' }}
              itemStyle={{ color: '#fbbf24' }}
            />
            <Line type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ReLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const VLabScopeWindow = ({ id, data, onClose, title }: { id: string, data: any[], onClose: () => void, title: string }) => {
  const [pos, setPos] = useState({ x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({ x: e.clientX - 200, y: e.clientY - 20 });
      }
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  return (
    <div 
      className="fixed z-[9999] w-[600px] h-[400px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div 
        className="h-10 bg-[#151515] border-b border-white/5 flex items-center justify-between px-4 cursor-move select-none"
        onMouseDown={() => setIsDragging(true)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-red-500/20 hover:text-red-500 rounded-md transition-all text-gray-500"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1">
        <ScopeView data={data} title={title} />
      </div>
    </div>
  );
};

export const VLabWorkspace: React.FC<VLabWorkspaceProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange,
  onEdgesChange,
  onResult,
  onSendToDOE,
  onBack
}) => {
  const [nodes, setNodes, onLocalNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onLocalEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboard, setClipboard] = useState<any[]>([]);
  const [history, setHistory] = useState<{ nodes: any[], edges: any[] }[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const [scopeData, setScopeData] = useState<any[]>([]);
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [quickSearchPos, setQuickSearchPos] = useState({ x: 0, y: 0 });
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [lastPaneClick, setLastPaneClick] = useState(0);

  // Simulation Loop
  useEffect(() => {
    let interval: any;
    if (isSimulating && !isPaused) {
      interval = setInterval(() => {
        setSimTime(t => t + 0.05);
        setScopeData(prev => {
          const newData = [...prev, { time: simTime, value: Math.sin(simTime * 2) + Math.random() * 0.1 }];
          return newData.slice(-50); // Keep last 50 points
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isSimulating, isPaused, simTime]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // Undo (Ctrl + Z)
      if (e.ctrlKey && e.key === 'z') {
        if (history.length > 0) {
          const prevState = history[history.length - 1];
          setNodes(prevState.nodes);
          setEdges(prevState.edges);
          setHistory(h => h.slice(0, -1));
        }
      }

      // Save (Ctrl + S)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('V-Lab State Saved Locally');
        // Trigger parent save if available
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setNodes(nds => nds.filter(node => !node.selected));
        setEdges(eds => eds.filter(edge => !edge.selected));
      }

      // Ctrl + C (Copy)
      if (e.ctrlKey && e.key === 'c') {
        const selectedNodes = nodes.filter(n => n.selected);
        setClipboard(selectedNodes);
      }

      // Ctrl + V (Paste)
      if (e.ctrlKey && e.key === 'v') {
        if (clipboard.length > 0) {
          const pastedNodes = clipboard.map(n => ({
            ...n,
            id: `${n.data.type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
            selected: true
          }));
          setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(pastedNodes));
        }
      }

      // Ctrl + A (Select All)
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(e => ({ ...e, selected: true })));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, clipboard, setNodes, setEdges]);

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return VLAB_LIBRARY;
    const query = searchQuery.toLowerCase();

    return VLAB_LIBRARY.map(domain => ({
      ...domain,
      blocks: domain.blocks.filter(block =>
        block.name.toLowerCase().includes(query) ||
        (block.category || '').toLowerCase().includes(query)
      )
    })).filter(domain => domain.blocks.length > 0);
  }, [searchQuery]);

  const onConnect = useCallback((params: Connection) => {
    setHistory(h => [...h, { nodes, edges }].slice(-20)); // Keep last 20 steps
    const edge = {
      ...params,
      animated: true,
      style: { stroke: '#6c9ac6', strokeWidth: 2 },
    };
    setEdges((eds) => addEdge(edge, eds));
    onEdgesChange(addEdge(edge, edges));
  }, [edges, nodes, onEdgesChange, setEdges]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onPaneClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastPaneClick < 300) {
      // Double Click Detected
      setQuickSearchPos({ x: e.clientX, y: e.clientY });
      setIsQuickSearchOpen(true);
      setQuickSearchQuery('');
    }
    setLastPaneClick(now);
    setSelectedNodeId(null);
  };

  const addBlockAtPos = (block: VLabBlock, pos: { x: number, y: number }) => {
    const id = `${block.id}_${Date.now()}`;
    // Convert screen coordinates to flow coordinates
    // For simplicity, we'll use a relative offset for now if project() isn't easily accessible
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: pos.x - 400, y: pos.y - 100 }, // Rough estimate, ideally use project()
      data: { 
        ...block,
        onUpdate: (params: any) => {
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === id) {
                return { ...node, data: { ...node.data, params } };
              }
              return node;
            })
          );
        }
      },
    };
    setNodes((nds) => nds.concat(newNode));
    setIsQuickSearchOpen(false);
  };

  const quickSearchResults = useMemo(() => {
    if (!quickSearchQuery.trim()) return [];
    const query = quickSearchQuery.toLowerCase();
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    return allBlocks.filter(b => 
      b.name.toLowerCase().includes(query) || 
      (b.category || '').toLowerCase().includes(query)
    ).slice(0, 8);
  }, [quickSearchQuery]);

  const onNodeDoubleClick = (_: any, node: Node) => {
    if ((node.data as any).type === 'scope') {
      setOpenScopes(prev => prev.includes(node.id) ? prev : [...prev, node.id]);
    }
  };

  const selectedNode = useMemo(() =>
    nodes.find(n => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const selectedBlockDef = useMemo(() => {
    if (!selectedNode) return null;
    const blockType = (selectedNode.data as any).type;
    return VLAB_COMPONENT_DEFINITIONS[blockType] || null;
  }, [selectedNode]);

  const updateParameter = (paramKey: string, value: number | string) => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            params: {
              ...n.data.params,
              [paramKey]: { ...n.data.params[paramKey], value }
            }
          }
        };
      }
      return n;
    }));
  };

  const runSimulation = () => {
    const mockResult = {
      time: Array.from({ length: 100 }, (_, i) => i * 0.01),
      data: nodes.map(n => ({
        id: n.id,
        values: Array.from({ length: 100 }, () => Math.random() * 10)
      }))
    };
    onResult(mockResult, nodes);
  };

  const exportToExcel = () => {
    if (scopeData.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(scopeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Simulation Results");
    
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `ADIA_VLab_Results_${date}.xlsx`);
  };

  const onDragStart = (event: React.DragEvent, block: VLabBlock) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(block));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setHistory(h => [...h, { nodes, edges }].slice(-20));

    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    const data = JSON.parse(event.dataTransfer.getData('application/reactflow')) as VLabBlock;

    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };

    const newNode: Node = {
      id: `${data.id}_${Date.now()}`,
      type: 'default',
      position,
      data: { 
        label: data.name,
        type: data.id,
        icon: data.icon,
        color: data.color,
        params: data.params,
        ports: data.ports
      },
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-[#e0e0e0] overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-[#0d0d0d] border-b border-[#222] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors text-gray-400"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Cpu className="text-purple-500" size={18} />
            <h1 className="text-sm font-bold tracking-tight">V-LAB <span className="text-gray-500 font-normal">PHYSICS SIMULATOR</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (isSimulating) {
                setIsPaused(!isPaused);
              } else {
                setIsSimulating(true);
                setIsPaused(false);
                setSimTime(0);
                setScopeData([]);
              }
            }}
            className={`flex items-center gap-2 ${isSimulating && !isPaused ? 'bg-amber-600 hover:bg-amber-500' : 'bg-purple-600 hover:bg-purple-500'} text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-purple-900/20`}
          >
            {isSimulating && !isPaused ? <><Pause size={14} fill="currentColor" /> PAUSE</> : <><Play size={14} fill="currentColor" /> {isPaused ? 'RESUME' : 'RUN SIMULATION'}</>}
          </button>
          
          {isSimulating && (
            <button 
              onClick={() => {
                setIsSimulating(false);
                setIsPaused(false);
              }}
              className="flex items-center gap-2 bg-red-600/20 border border-red-600/30 hover:bg-red-600/30 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold"
            >
              <Square size={12} fill="currentColor" /> STOP
            </button>
          )}

          {scopeData.length > 0 && (
            <button 
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-emerald-600/20 border border-emerald-600/30 hover:bg-emerald-600/30 text-emerald-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              title="Export Results to Excel"
            >
              <FileSpreadsheet size={14} /> EXPORT EXCEL
            </button>
          )}

          <button
            onClick={() => onSendToDOE({ nodes, edges })}
            className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] hover:bg-[#222] text-gray-300 px-4 py-1.5 rounded-lg text-xs font-bold"
          >
            <Send size={14} /> EXPORT TO DOE
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 mt-12 overflow-hidden">
        {/* Left Sidebar: Block Library */}
        <div className="w-72 bg-[#0d0d0d] border-r border-[#222] flex flex-col">
          <div className="p-4 border-b border-[#222]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search blocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {filteredLibrary.map(domain => {
              // Group blocks by category if they have one
              const categories = domain.blocks.reduce((acc, block) => {
                const cat = block.category || 'Standard';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(block);
                return acc;
              }, {} as Record<string, VLabBlock[]>);

              return (
                <div key={domain.type} className="space-y-4">
                  <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] mb-1">{domain.type}</h3>
                  {Object.entries(categories).map(([catName, catBlocks]) => (
                    <div key={catName} className="space-y-2 pl-2 border-l border-[#222]">
                      <h4 className="text-[9px] font-bold text-gray-600 uppercase tracking-wider">{catName}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {catBlocks.map(block => (
                          <div
                            key={block.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, block)}
                            className="group bg-[#111] border border-white/5 p-3 rounded-xl cursor-grab hover:border-purple-500/50 hover:bg-[#151515] transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden"
                          >
                            <div className="w-12 h-12 flex items-center justify-center transform scale-[0.6] group-hover:scale-[0.7] transition-transform origin-center">
                              <SymbolRenderer type={block.icon} color={block.color} />
                            </div>
                            <span className="text-[8px] text-gray-500 font-bold text-center leading-tight truncate w-full px-1 group-hover:text-gray-200 transition-colors uppercase tracking-tight">
                              {block.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Flow Canvas */}
        <div className="flex-1 relative bg-[#0a0a0a]" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onLocalNodesChange}
            onEdgesChange={onLocalEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[10, 10]}
          >
            <Background color="#151515" gap={20} variant={BackgroundVariant.Lines} />
            <Controls className="bg-[#1a1a1a] border-[#333] fill-white" />
            
            {/* Quick Search Overlay */}
            {isQuickSearchOpen && (
              <div 
                className="fixed z-[9999] w-64 bg-[#111] border border-purple-500/30 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl overflow-hidden p-1 flex flex-col"
                style={{ left: quickSearchPos.x, top: quickSearchPos.y }}
              >
                <div className="flex items-center gap-2 p-2 border-b border-[#222]">
                  <Box size={14} className="text-purple-500" />
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Quick insert..."
                    className="bg-transparent text-xs w-full outline-none text-white"
                    value={quickSearchQuery}
                    onChange={(e) => setQuickSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsQuickSearchOpen(false);
                      if (e.key === 'Enter' && quickSearchResults.length > 0) {
                        addBlockAtPos(quickSearchResults[0], quickSearchPos);
                      }
                    }}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {quickSearchResults.map(block => (
                    <button
                      key={block.id}
                      onClick={() => addBlockAtPos(block, quickSearchPos)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-purple-600/10 transition-colors group text-left border-b border-white/5 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-lg border border-white/5 group-hover:border-purple-500/30" style={{ color: block.color }}>
                        {block.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-gray-200">{block.name}</span>
                        <span className="text-[9px] text-gray-500">{block.category}</span>
                      </div>
                    </button>
                  ))}
                  {quickSearchQuery && quickSearchResults.length === 0 && (
                    <div className="p-4 text-center text-[10px] text-gray-500 uppercase tracking-widest">No blocks found</div>
                  )}
                  {!quickSearchQuery && (
                    <div className="p-4 text-center text-[10px] text-gray-500 uppercase tracking-widest">Type to search</div>
                  )}
                </div>
              </div>
            )}

            {/* Real-time Scope Overlay (if a scope is selected) */}
            {selectedNode && (selectedNode.data as any).type === 'scope' && !openScopes.includes(selectedNode.id) && (
              <Panel position="bottom-right" className="w-96 h-64 mb-12 mr-4 shadow-2xl">
                <ScopeView data={scopeData} />
              </Panel>
            )}

            <MiniMap
              nodeColor={n => (n.data as any).color || '#222'}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-[#1a1a1a] border border-[#333] rounded-lg"
            />
          </ReactFlow>
        </div>

        {/* Right Sidebar: Properties & Equations */}
        <div className="w-80 bg-[#0d0d0d] border-l border-[#222] flex flex-col">
          {selectedNode ? (
            <>
              {/* Properties Section */}
              <div className="p-4 border-b border-[#222]">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 size={16} className="text-purple-500" />
                  <h3 className="text-xs font-bold uppercase tracking-widest">Block Properties</h3>
                </div>

                {/* Block Help */}
                {selectedBlockDef && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-6">
                    <div className="flex items-center gap-2 text-purple-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                      <Info size={12} />
                      Block Help
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed italic">
                      {selectedBlockDef.description}
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="bg-[#141414] p-3 rounded-xl border border-[#222]">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Block ID</span>
                    <span className="text-xs font-mono text-purple-400">{selectedNode.id}</span>
                  </div>

                  <div className="space-y-3">
                    {Object.entries((selectedNode.data as any).params || {}).map(([key, param]: [string, any]) => (
                      <div key={key}>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] text-gray-400 font-bold uppercase">{param.label}</label>
                          <span className="text-[10px] text-gray-600">{param.unit}</span>
                        </div>
                        <input
                          type={typeof param.value === 'number' ? "number" : "text"}
                          value={param.value}
                          onChange={(e) => {
                            const val = typeof param.value === 'number' ? parseFloat(e.target.value) : e.target.value;
                            updateParameter(key, val);
                          }}
                          className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equations Section */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#222]">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-blue-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Governing Equations</h3>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {selectedBlockDef ? (
                    <div className="space-y-4">
                      <div className="bg-[#141414] p-4 rounded-xl border border-[#222] flex flex-col items-center justify-center min-h-[100px] text-center">
                        {selectedBlockDef.latex.map((eq, i) => (
                          <div key={i} className="text-sm font-serif italic text-purple-300 mb-2 last:mb-0">
                            {eq}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#222]">
                          <span className="text-[9px] text-gray-600 block uppercase font-bold">Across Var</span>
                          <span className="text-xs text-blue-400">{selectedBlockDef.across}</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#222]">
                          <span className="text-[9px] text-gray-600 block uppercase font-bold">Through Var</span>
                          <span className="text-xs text-green-400">{selectedBlockDef.through}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center px-4">
                      <Box size={32} className="mb-2 opacity-20" />
                      <p className="text-[10px] font-medium italic">No equations defined for this block type.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center p-8">
              <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222] flex items-center justify-center mb-4">
                <Settings2 size={32} className="opacity-20" />
              </div>
              <h3 className="text-sm font-bold text-gray-400 mb-1">Select a Block</h3>
              <p className="text-[10px] leading-relaxed">Click on a component in the canvas to view and edit its physical parameters and governing equations.</p>
            </div>
          )}
        </div>
      </div>

      {/* Individual Scope Windows */}
      {openScopes.map(scopeId => {
        const scopeNode = nodes.find(n => n.id === scopeId);
        if (!scopeNode) return null;
        return (
          <VLabScopeWindow 
            key={scopeId}
            id={scopeId}
            title={scopeNode.data.label}
            data={scopeData}
            onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
          />
        );
      })}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #222;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
      `}</style>
    </div>
  );
};
