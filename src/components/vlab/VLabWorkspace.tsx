import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
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
  Position,
  ConnectionLineType,
  getBezierPath,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as math from 'mathjs';
import { VLabWorkspaceProps, VLabNode as AppVLabNode, VLabEdge as AppVLabEdge } from './VLabWorkspaceTypes';
import { VLabNode, NodeErrorBoundary } from './VLabNode';
import { SymbolRenderer } from './VLabSymbols';
import { VLAB_LIBRARY, VLabBlock, VLabPort, scoreVLabBlock, searchVLabBlocks } from '../../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../../engine/vlab/vlabComponentDefinitions';
import { VLabPhysicsEngine } from '../../engine/vlab/vlabPhysics';
import { Settings2, Play, Pause, Square, Send, ChevronLeft, ChevronDown, ChevronRight, Box, Activity, FlaskConical, LineChart, X, Maximize2, FileSpreadsheet, Info, GraduationCap, BookOpen, Layers, Settings, RefreshCcw, Zap, ZoomIn, ZoomOut, Minus, Network, Cloud, Download, CheckCircle2, AlertCircle, Triangle, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { isInputFocused } from '../../utils/domUtils';
import { getVLabSignalInfo, exportScopeToCSV, VLAB_SIGNAL_COLORS } from '../../utils/scopeUtils';
import { VLabSimulinkScope } from './VLabSimulinkScope';
import { computeAbsoluteReferencePressure, convertPressureFromSI, type PressureUnit, type ElevationUnit } from '../../utils/hydraulicUnits';
import { normalizeSolverConfiguration } from '../../engine/vlab/kernel/PhysicalNetworkExtractor';

interface LabNode {
  id: string;
  blockId: string;
  position: { x: number, y: number };
  label?: string;
  params?: Record<string, any>;
}

const LEARNING_LABS = [
  {
    id: 'air_fryer_thermal',
    name: 'Air Fryer Heat Transfer',
    category: 'Thermal & Fluid Dynamics',
    difficulty: 'Advanced',
    description: 'Study the multi-domain interaction between electrical power, forced convection, and thermal mass accumulation in a standard air fryer basket.',
    nodes: [
      { id: 'ac_supply', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '230V AC Supply', params: { Vpk: 325, f: 50 } },
      { id: 'heating_element', blockId: 'thermal_resistor', position: { x: 250, y: 200 }, label: 'Heating Element', params: { Rth: 35 } },
      { id: 'convection_link', blockId: 'convective_heat', position: { x: 450, y: 100 }, label: 'Convection Interface', params: { h: 80, A: 0.15 } },
      { id: 'air_chamber', blockId: 'ma_chamber', position: { x: 650, y: 200 }, label: 'Cooking Basket (Air)', params: { V: 0.005 } },
      { id: 'circulation_fan', blockId: 'ma_pressure_source', position: { x: 650, y: 400 }, label: 'Air Circulation Fan', params: { P: 150 } },
      { id: 'fan_ctrl', blockId: 'ps_constant', position: { x: 650, y: 550 }, label: 'Fan Speed Ctrl', params: { value: 0.8 } },
      { id: 'temp_sensor', blockId: 'temp_sensor', position: { x: 850, y: 200 }, label: 'Basket Temp Sensor' },
      { id: 'thermal_scope', blockId: 'scope', position: { x: 1050, y: 150 }, label: 'Temp Monitor', params: { time_range: 300 } },
      { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'PE Ground' }
    ],
    edges: [
      { id: 'e1', source: 'ac_supply', target: 'heating_element', sourceHandle: 'p_s', targetHandle: 'a_t' },
      { id: 'e1_ret', source: 'heating_element', target: 'ground', sourceHandle: 'b_s', targetHandle: 'a_t' },
      { id: 'e1_gnd', source: 'ac_supply', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e2', source: 'heating_element', target: 'convection_link', sourceHandle: 'h_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'convection_link', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'h_t' },
      { id: 'e4', source: 'fan_ctrl', target: 'circulation_fan', sourceHandle: 'y_s', targetHandle: 's_t' },
      { id: 'e5', source: 'circulation_fan', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'a_t' },
      { id: 'e6', source: 'air_chamber', target: 'temp_sensor', sourceHandle: 'h_s', targetHandle: 'a_t' },
      { id: 'e7', source: 'temp_sensor', target: 'thermal_scope', sourceHandle: 't_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'blender_mixer',
    name: 'Personal Blender Mixer',
    category: 'Electromechanical',
    difficulty: 'Intermediate',
    description: 'Analyze the start-up torque and steady-state mixing speed of a 24V DC blender motor under variable mixture viscosity.',
    nodes: [
      { id: 'dc_source', blockId: 'dc_voltage', position: { x: 50, y: 200 }, label: '24V Battery', params: { V: 24 } },
      { id: 'blender_motor', blockId: 'rotational_electromechanical_converter', position: { x: 250, y: 200 }, label: 'DC Motor', params: { K: 0.05, R: 2 } },
      { id: 'mixture_drag', blockId: 'rot_damper', position: { x: 450, y: 200 }, label: 'Mixture Viscosity', params: { b: 0.001 } },
      { id: 'blade_inertia', blockId: 'inertia', position: { x: 450, y: 350 }, label: 'Blade Inertia', params: { J: 0.0002 } },
      { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 650, y: 200 }, label: 'Speed Sensor' },
      { id: 'blender_scope', blockId: 'scope', position: { x: 850, y: 150 }, label: 'Performance Monitor', params: { time_range: 5 } },
      { id: 'gnd', blockId: 'ground', position: { x: 150, y: 400 }, label: 'Common' }
    ],
    edges: [
      { id: 'be1', source: 'dc_source', target: 'blender_motor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'be1_ret', source: 'blender_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'be1_gnd', source: 'dc_source', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'be2', source: 'blender_motor', target: 'mixture_drag', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be3', source: 'mixture_drag', target: 'blade_inertia', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be4', source: 'mixture_drag', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be5', source: 'speed_sensor', target: 'blender_scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'pid_ac_motor',
    name: 'PID Speed Control of Induction Motor',
    category: 'Control Systems',
    difficulty: 'Expert',
    description: 'Design and tune a PID controller to regulate the speed of an AC induction motor via an inverter bridge. Study closed-loop performance and stability.',
    nodes: [
      { id: 'ref_speed', blockId: 'ps_constant', position: { x: 50, y: 50 }, label: 'Ref Speed (rad/s)', params: { value: 157 } },
      { id: 'error_calc', blockId: 'ps_subtract', position: { x: 200, y: 100 }, label: 'Error' },
      { id: 'speed_pid', blockId: 'ps_pid_ctrl', position: { x: 350, y: 100 }, label: 'Speed PID', params: { Kp: 2.5, Ki: 1.2 } },
      { id: 'dc_bus', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 500, y: 300 }, label: 'Inverter Bridge' },
      { id: 'ac_motor', blockId: 'ac_motor', position: { x: 700, y: 300 }, label: 'Induction Motor', params: { P: 2 } },
      { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 850, y: 300 }, label: 'Encoder' },
      { id: 'scope', blockId: 'scope', position: { x: 1000, y: 150 }, label: 'PID Response', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 500, y: 500 }, label: 'GND' }
    ],
    edges: [
      { id: 'pe1', source: 'ref_speed', target: 'error_calc', sourceHandle: 'y_s', targetHandle: 'u1_t' },
      { id: 'pe2', source: 'speed_sensor', target: 'error_calc', sourceHandle: 'w_s', targetHandle: 'u2_t' },
      { id: 'pe3', source: 'error_calc', target: 'speed_pid', sourceHandle: 'y_s', targetHandle: 'e_t' },
      { id: 'pe4', source: 'speed_pid', target: 'inverter', sourceHandle: 'u_s', targetHandle: 'vabc_t' },
      { id: 'pe5', source: 'dc_bus', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'pe6', source: 'dc_bus', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe7', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe8', source: 'inverter', target: 'ac_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'pe9', source: 'inverter', target: 'ac_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'pe10', source: 'inverter', target: 'ac_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'pe11', source: 'ac_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe12', source: 'ac_motor', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'pe13', source: 'speed_sensor', target: 'scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'vfd_inverter_drive',
    name: 'Variable Frequency Drive (VFD)',
    category: 'Electromechanical',
    difficulty: 'Advanced',
    description: 'Compare Open-Loop V/f Control with High-Performance Sensorless FOC for Induction Motor speed and torque regulation.',
    nodes: [
      { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: '3-Phase Inverter' },
      { id: 'vfd_controller', blockId: 'im_foc_ctrl', position: { x: 300, y: 100 }, label: 'VFD Controller', params: { mode: 1 } },
      { id: 'im_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Induction Motor' },
      { id: 'ref_speed', blockId: 'ps_step', position: { x: 50, y: 100 }, label: 'Speed Reference', params: { time: 1, initial: 500, final: 1500 } },
      { id: 'vfd_scope', blockId: 'scope', position: { x: 800, y: 200 }, label: 'VFD Performance', params: { time_range: 5 } },
      { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Common Ground' }
    ],
    edges: [
      { id: 've1', source: 'ref_speed', target: 'vfd_controller', sourceHandle: 'y_s', targetHandle: 'wr_ref_t' },
      { id: 've2', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 've2_ret', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've3', source: 'vfd_controller', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
      { id: 've4_a', source: 'inverter', target: 'im_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 've4_b', source: 'inverter', target: 'im_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 've4_c', source: 'inverter', target: 'im_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 've4_n', source: 'im_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've5', source: 'im_motor', target: 'vfd_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'smart_washing_machine',
    name: 'Smart Washing Machine Dynamics',
    category: 'Consumer Appliances',
    difficulty: 'Expert',
    description: 'Simulate the complex mechanical and fluid interactions of a BLDC-driven washing machine, including sloshing water and unbalanced laundry loads.',
    nodes: [
      { id: 'washing_ctrl', blockId: 'im_foc_ctrl', position: { x: 50, y: 100 }, label: 'Wash Cycle Controller', params: { target_rpm: 600 } },
      { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Bus (320V)', params: { V: 320 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: 'Inverter Drive' },
      { id: 'wash_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Direct Drive Motor' },
      { id: 'basket_load', blockId: 'washing_basket', position: { x: 750, y: 300 }, label: 'Washing Basket', params: { load_mass: 6 } },
      { id: 'wash_scope', blockId: 'scope', position: { x: 950, y: 200 }, label: 'Cycle Analysis', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'System Ground' }
    ],
    edges: [
      { id: 'we1', source: 'washing_ctrl', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
      { id: 'we2_dc', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'we2_gnd', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we3_a', source: 'inverter', target: 'wash_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'we3_b', source: 'inverter', target: 'wash_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'we3_c', source: 'inverter', target: 'wash_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'we3_n', source: 'wash_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we4', source: 'wash_motor', target: 'basket_load', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'we5', source: 'wash_motor', target: 'wash_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'advanced_microwave_design',
    name: 'Advanced Microwave Design (25L)',
    category: 'Consumer Appliances',
    difficulty: 'Advanced',
    description: 'Design and validate a multi-function 25L microwave oven featuring a high-frequency inverter, magnetron, radiant upper heater, and an 800W steam generator.',
    nodes: [
      { id: 'pwr_ac', blockId: 'ac_voltage', position: { x: 50, y: 300 }, label: 'AC Supply (230V)', params: { Vpk: 325, f: 50 } },
      { id: 'mw_inverter', blockId: 'microwave_inverter', position: { x: 250, y: 150 }, label: 'HV Inverter', params: { v_out: 4000 } },
      { id: 'mw_magnetron', blockId: 'magnetron', position: { x: 450, y: 100 }, label: '900W Magnetron', params: { efficiency: 65 } },
      { id: 'mw_heater', blockId: 'upper_heater', position: { x: 450, y: 250 }, label: 'Upper Heater', params: { resistance: 35 } },
      { id: 'mw_steam', blockId: 'steam_generator', position: { x: 450, y: 400 }, label: '800W Steam Gen', params: { power: 800 } },
      { id: 'mw_cavity', blockId: 'microwave_cavity', position: { x: 700, y: 250 }, label: '25L Cavity', params: { volume: 25 } },
      { id: 'mw_scope', blockId: 'scope', position: { x: 900, y: 250 }, label: 'Temp Analysis', params: { time_range: 30 } },
      { id: 'mw_ground', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Circuit Ground', params: {} }
    ],
    edges: [
      { id: 'me1', source: 'pwr_ac', target: 'mw_inverter', sourceHandle: 'p_s', targetHandle: 'ac_in_t' },
      { id: 'me2', source: 'mw_inverter', target: 'mw_magnetron', sourceHandle: 'hv_out_s', targetHandle: 'p_t' },
      { id: 'me3', source: 'pwr_ac', target: 'mw_heater', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'me4', source: 'pwr_ac', target: 'mw_steam', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'me5', source: 'mw_magnetron', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h1_t' },
      { id: 'me6', source: 'mw_heater', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h2_t' },
      { id: 'me7', source: 'mw_steam', target: 'mw_cavity', sourceHandle: 's_s', targetHandle: 'h3_t' },
      { id: 'me8', source: 'mw_cavity', target: 'mw_scope', sourceHandle: 't_s', targetHandle: 'in1_t' },
      // Ground Connections
      { id: 'mg1', source: 'pwr_ac', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg2', source: 'mw_magnetron', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg3', source: 'mw_heater', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg4', source: 'mw_steam', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' }
    ]
  },
  {
    id: 'voltage_sensing_circuit',
    name: '220V Power Supply & Voltage Sensing',
    category: 'Electrical Networks',
    difficulty: 'Beginner',
    description: 'Learn to measure voltage across a 100Ω resistor connected to a 220V AC power supply (220V RMS / 311V Peak) using a voltage sensor and an oscilloscope.',
    nodes: [
      { id: 'ac_source', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '220V AC Supply', params: { Vpk: 311.13, f: 50 } },
      { id: 'resistor_load', blockId: 'resistor', position: { x: 300, y: 200 }, label: '100Ω Load Resistor', params: { R: 100 } },
      { id: 'v_sensor', blockId: 'v_sensor', position: { x: 550, y: 200 }, label: 'Voltage Sensor', params: { R_int: 1e8 } },
      { id: 'scope', blockId: 'scope', position: { x: 800, y: 150 }, label: 'Oscilloscope', params: { time_range: 0.1 } },
      { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'Ground Reference' }
    ],
    edges: [
      { id: 'e1', source: 'ac_source', target: 'resistor_load', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'resistor_load', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'ac_source', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'resistor_load', target: 'v_sensor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e5', source: 'v_sensor', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e6', source: 'v_sensor', target: 'scope', sourceHandle: 'v_s', targetHandle: 'in1_t' }
    ]
  }
];

const reconstructLabNodes = (labNodes: LabNode[]): Node[] => {
  const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

  return labNodes.map(ln => {
    const baseBlock = allBlocks.find(b => b.id === ln.blockId);
    if (!baseBlock) {
      console.error(`Block ${ln.blockId} not found in library`);
      return {
        id: ln.id,
        type: 'default',
        position: ln.position,
        data: { label: ln.label || ln.id, type: ln.blockId, params: {} }
      } as Node;
    }

    // Merge parameters
    const mergedParams = JSON.parse(JSON.stringify(baseBlock.params));
    if (ln.params) {
      Object.keys(ln.params).forEach(key => {
        if (mergedParams[key]) {
          mergedParams[key].value = ln.params![key];
        }
      });
    }

    const domain = VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === ln.blockId))?.type;

    return {
      id: ln.id,
      type: 'default',
      position: ln.position,
      data: {
        label: ln.label || baseBlock.name,
        type: baseBlock.id,
        icon: baseBlock.icon,
        color: baseBlock.color,
        ports: baseBlock.ports,
        params: mergedParams,
        domain
      }
    } as Node;
  });
};

const VLabEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  className,
  selected,
}: any) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const finalStyle = selected
    ? {
        ...style,
        stroke: '#ff9100',
        strokeWidth: 4.5,
      }
    : style;

  return (
    <>
      {/* Background thicker glow path when selected */}
      {selected && (
        <path
          id={`${id}-glow`}
          d={edgePath}
          fill="none"
          stroke="#ff9100"
          strokeWidth={10}
          strokeOpacity={0.6}
          className="transition-all duration-300 pointer-events-none"
          style={{
            filter: 'drop-shadow(0 0 6px #ff9100)'
          }}
        />
      )}
      <path
        id={id}
        className={`react-flow__edge-path transition-all duration-300 ${className || ''}`}
        d={edgePath}
        markerEnd={markerEnd}
        style={finalStyle}
      />
      {/* Thick invisible interaction path to make clicking/hovering easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        className="react-flow__edge-interaction cursor-pointer"
      />
    </>
  );
};

const VLabConnectionLine = ({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  connectionLineStyle,
}: any) => {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition || (fromPosition === Position.Left ? Position.Right : Position.Left),
  });

  return (
    <g>
      <path
        fill="none"
        stroke="#6c9ac6"
        strokeWidth={2}
        className="react-flow__connection-path"
        d={path}
        style={connectionLineStyle}
      />
    </g>
  );
};

const edgeTypes = {
  default: VLabEdge,
};

const nodeTypes = {
  default: (props: any) => <NodeErrorBoundary><VLabNode {...props} /></NodeErrorBoundary>,
  doe_custom: (props: any) => <NodeErrorBoundary><VLabNode {...props} /></NodeErrorBoundary>,
};

const getSignalColor = (index: number) => {
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
  return colors[index % colors.length];
};

const ScopeView = ({
  data, title, isPaused, onExpand, onAutoScale, params, signalInfos
}: {
  data: any[], title?: string, isPaused?: boolean, onExpand?: () => void, onAutoScale?: () => void, params?: any, signalInfos?: any[]
}) => {
  const keys = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'time' && k !== 't') : ['in1'];
  const lastPoint = data.length > 0 ? data[data.length - 1] : {};
  const lastVal = lastPoint.value !== undefined ? lastPoint.value : (keys.length > 0 ? lastPoint[keys[0]] : 0) ?? 0;
  const [scaleKey, setScaleKey] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  const timeRange = params?.time_range?.value || 10;
  const showGrid = params?.show_grid?.value !== 'off';
  const showLegend = params?.show_legend?.value !== 'off';

  const displayData = useMemo(() => {
    if (timeRange === 'auto' || data.length === 0) return data;
    const limit = Number(timeRange);
    if (isNaN(limit)) return data;
    const maxTime = data[data.length - 1].time !== undefined ? data[data.length - 1].time : (data[data.length - 1].t || 0);
    return data.filter(pt => (pt.time !== undefined ? pt.time : pt.t || 0) >= maxTime - limit);
  }, [data, timeRange]);

  const handleAutoScale = () => {
    setScaleKey(prev => prev + 1);
    setZoomLevel(1.0);
    if (onAutoScale) onAutoScale();
  };

  return (
    <div className="w-full h-full bg-[#050505] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative group">
      {/* Glossy CRT Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none z-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05),transparent)] pointer-events-none z-10" />

      {/* Header Info: Industrial Stats Bar */}
      <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isPaused ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-pulse'}`}>
            <Activity size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.25em] leading-tight">{title || 'Signal Monitor'}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-mono font-black text-white/90 tabular-nums">{typeof lastVal === 'number' ? lastVal.toFixed(4) : String(lastVal)}</span>
              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Units</span>
            </div>
          </div>
        </div>

        {showLegend && (
          <div className="flex flex-wrap gap-3 pr-2 max-w-[60%] justify-end">
            {keys.map((k, i) => {
              const info = signalInfos?.[i];
              const color = VLAB_SIGNAL_COLORS[i % VLAB_SIGNAL_COLORS.length];
              const labelText = info?.connected ? `${info.blockLabel}.${info.portName} (${info.dataType})` : (info?.fullName || k);
              return (
                <div key={k} className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-gray-300 font-mono font-semibold truncate max-w-[140px]" title={labelText}>{labelText}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 p-5 relative overflow-hidden">
        {/* Analog Scope Grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="majorGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="2" />
              </pattern>
              <pattern id="minorGrid" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#minorGrid)" />
            <rect width="100%" height="100%" fill="url(#majorGrid)" />
          </svg>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart key={scaleKey} data={displayData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              {keys.map((k, i) => {
                const color = VLAB_SIGNAL_COLORS[i % VLAB_SIGNAL_COLORS.length];
                return (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />}
            <XAxis
              dataKey="time"
              stroke="#ffffff20"
              fontSize={10}
              tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : String(v)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#ffffff20"
              fontSize={10}
              tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : String(v)}
              axisLine={false}
              tickLine={false}
              domain={([min, max]: [number, number]) => {
                if (!Number.isFinite(min) || !Number.isFinite(max)) return [-10, 10];
                const range = (max - min) || 10;
                const center = (max + min) / 2;
                const safeZoom = zoomLevel || 1.0;
                const newRange = range / safeZoom;
                return [center - newRange / 2, center + newRange / 2];
              }}
            />
            <Tooltip
              contentStyle={{
                background: '#0d0d0d',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)'
              }}
              itemStyle={{ fontWeight: 'bold' }}
              cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 }}
            />
            {keys.map((k, i) => {
              const color = VLAB_SIGNAL_COLORS[i % VLAB_SIGNAL_COLORS.length];
              return (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={color}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill={`url(#grad-${k})`}
                  isAnimationActive={false}
                  className={`drop-shadow-[0_0_8px_${color}44]`}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Interface: Controls & Status */}
      <div className="h-12 bg-white/[0.03] border-t border-white/5 flex items-center justify-between px-5 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-gray-700' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'}`} />
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              {isPaused ? 'System Halted' : 'Acquisition Active'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] text-gray-600 font-black uppercase">Channels</span>
            <span className="text-[10px] font-mono text-gray-400">{keys.length} active</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/5 mr-2">
            <button
              onClick={() => setZoomLevel(prev => prev / 1.25)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all active:scale-90"
              title="Scale Down"
            >
              <ZoomOut size={14} />
            </button>
            <div className="w-px h-3 bg-white/5 mx-0.5" />
            <button
              onClick={() => setZoomLevel(prev => prev * 1.25)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all active:scale-90"
              title="Scale Up"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <button
            onClick={handleAutoScale}
            className="p-2 hover:bg-white/10 rounded-xl text-gray-500 hover:text-emerald-400 transition-all group"
            title="Reset Scale"
          >
            <RefreshCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
          {onExpand && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onExpand(); }}
              className="p-2 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all ml-2 active:scale-90 cursor-pointer z-50"
              title="Expand View"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const VLabScopeWindow = ({
  id, data, onClose, title, isPaused, params, onUpdate, nodes = [], edges = []
}: {
  id: string, data: any[], onClose: () => void, title: string, isPaused: boolean, params: any, onUpdate?: (data: any) => void, nodes?: any[], edges?: any[]
}) => {
  const [pos, setPos] = useState({ x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const numChannels = params?.numSignals?.value || 1;
  const signalInfos = useMemo(() => {
    return Array.from({ length: numChannels }, (_, i) => getVLabSignalInfo(id, i, nodes, edges, data));
  }, [id, numChannels, nodes, edges, data]);

  const handleExportCSV = () => {
    const csvContent = exportScopeToCSV(title || 'VLabScope', data, signalInfos);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'scope'}_data_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDragging && !isMaximized) {
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
  }, [isDragging, isMaximized]);

  return (
    <div
      className={`fixed z-[9999] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col backdrop-blur-xl transition-all duration-300 ${isMaximized ? 'inset-0 !rounded-none' : isMinimized ? 'w-64 h-10' : 'w-[680px] h-[450px]'
        }`}
      style={isMaximized ? { left: 0, top: 0, width: '100vw', height: '100vh' } : { left: pos.x, top: pos.y }}
    >
      <div
        className="h-10 bg-[#151515] border-b border-white/5 flex items-center justify-between px-4 cursor-move select-none shrink-0"
        onMouseDown={() => !isMaximized && setIsDragging(true)}
        onDoubleClick={() => setIsMaximized(!isMaximized)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'} animate-pulse`} />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] truncate max-w-[150px]">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportCSV}
            className="p-1.5 hover:bg-emerald-500/20 hover:text-emerald-400 rounded-md transition-all text-gray-500"
            title="Export CSV Data"
          >
            <Download size={14} />
          </button>
          {onUpdate && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-md transition-all ${showSettings ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-white'}`}
              title="Scope Settings"
            >
              <Settings size={14} />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-white/5 rounded-md transition-all text-gray-500 hover:text-white"
            title={isMinimized ? "Restore" : "Minimize"}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => { setIsMaximized(!isMaximized); setIsMinimized(false); }}
            className="p-1.5 hover:bg-white/5 rounded-md transition-all text-gray-500 hover:text-white"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Layers size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-500/20 hover:text-red-500 rounded-md transition-all text-gray-500 ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {!isMinimized && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {showSettings && onUpdate && (
            <div className="w-52 border-r border-white/5 bg-black/40 p-4 space-y-3 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
              <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Settings</div>
              
              {/* Number of Input Channels */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Input Channels (Ports)</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={params.numSignals?.value || 1}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(8, parseInt(e.target.value) || 1));
                    onUpdate({ numSignals: { ...params.numSignals, value: val } });
                  }}
                  className="w-full text-xs px-1.5 py-0.5 border border-[#333] bg-[#111] text-white rounded outline-none font-mono"
                />
              </div>

              {/* Time Range */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Time Range</label>
                <select
                  value={String(params.time_range?.value || '10')}
                  onChange={(e) => {
                    const val = e.target.value === 'auto' ? 'auto' : parseFloat(e.target.value);
                    onUpdate({ time_range: { ...params.time_range, value: val } });
                  }}
                  className="w-full text-xs px-1.5 py-1 border border-[#333] bg-[#111] text-purple-400 font-bold rounded outline-none"
                >
                  <option value="auto">Auto (Full)</option>
                  <option value="1">1s</option>
                  <option value="2">2s</option>
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                  <option value="30">30s</option>
                  <option value="60">60s</option>
                </select>
              </div>

              {/* Limit Data Points */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Limit Points</label>
                <select
                  value={String(params.limit_data_points?.value || 'on')}
                  onChange={(e) => onUpdate({ limit_data_points: { ...params.limit_data_points, value: e.target.value } })}
                  className="w-full text-xs px-1.5 py-1 border border-[#333] bg-[#111] text-gray-300 rounded outline-none"
                >
                  <option value="on">On (Yes)</option>
                  <option value="off">Off (No)</option>
                </select>
              </div>

              {/* Buffer Size */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Max Points</label>
                <input
                  type="number"
                  value={params.buffer_size?.value || 1000}
                  onChange={(e) => onUpdate({ buffer_size: { ...params.buffer_size, value: parseInt(e.target.value) || 1000 } })}
                  className="w-full text-xs px-1.5 py-0.5 border border-[#333] bg-[#111] text-white rounded outline-none font-mono"
                />
              </div>

              {/* Decimation */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Decimation</label>
                <input
                  type="number"
                  min="1"
                  value={params.decimation?.value || 1}
                  onChange={(e) => onUpdate({ decimation: { ...params.decimation, value: parseInt(e.target.value) || 1 } })}
                  className="w-full text-xs px-1.5 py-0.5 border border-[#333] bg-[#111] text-white rounded outline-none font-mono"
                />
              </div>

              {/* Sample Time */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Sample Time (s)</label>
                <input
                  type="number"
                  step="any"
                  value={params.sample_time?.value ?? -1}
                  onChange={(e) => onUpdate({ sample_time: { ...params.sample_time, value: parseFloat(e.target.value) || -1 } })}
                  className="w-full text-xs px-1.5 py-0.5 border border-[#333] bg-[#111] text-white rounded outline-none font-mono"
                />
              </div>

              {/* Grid */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Grid</label>
                <select
                  value={String(params.show_grid?.value || 'on')}
                  onChange={(e) => onUpdate({ show_grid: { ...params.show_grid, value: e.target.value } })}
                  className="w-full text-xs px-1.5 py-1 border border-[#333] bg-[#111] text-gray-300 rounded outline-none"
                >
                  <option value="on">Show</option>
                  <option value="off">Hide</option>
                </select>
              </div>

              {/* Legend */}
              <div className="space-y-1">
                <label className="block text-[8px] font-bold text-gray-400 uppercase">Legend</label>
                <select
                  value={String(params.show_legend?.value || 'on')}
                  onChange={(e) => onUpdate({ show_legend: { ...params.show_legend, value: e.target.value } })}
                  className="w-full text-xs px-1.5 py-1 border border-[#333] bg-[#111] text-gray-300 rounded outline-none"
                >
                  <option value="on">Show</option>
                  <option value="off">Hide</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ScopeView data={data} title={title} isPaused={isPaused} params={params} signalInfos={signalInfos} />
          </div>
        </div>
      )}
    </div>
  );
};

export const areDomainsCompatible = (d1?: string, d2?: string): boolean => {
  if (!d1 || !d2) return true;
  const a = d1.toLowerCase();
  const b = d2.toLowerCase();
  if (a === b) return true;
  if (a === 'mechanical' && (b === 'translational' || b === 'rotational')) return true;
  if (b === 'mechanical' && (a === 'translational' || a === 'rotational')) return true;
  return false;
};

export const VLabWorkspace: React.FC<VLabWorkspaceProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange,
  onEdgesChange,
  onResult,
  onSendToDOE,
  onBack,
  onSaveAll,
  onNavigateToXbridges,
  initialSelectedNodeId
}) => {
  const [nodes, setNodes, onLocalNodesChange] = useNodesState<AppVLabNode>(initialNodes);
  const [edges, setEdges, onLocalEdgesChange] = useEdgesState<AppVLabEdge>(initialEdges);

  const [viewPath, setViewPath] = useState<string[]>(['root']);
  const currentParentId = viewPath[viewPath.length - 1];

  const [isConnecting, setIsConnecting] = useState(false);

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  const isSavingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialNodesRef = useRef(initialNodes);
  const initialEdgesRef = useRef(initialEdges);

  // Debounced save: fire onNodesChange and onEdgesChange 300ms after changes settle
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      isSavingRef.current = true;
      if (onNodesChange) onNodesChange(nodes);
      if (onEdgesChange) onEdgesChange(edges);
      requestAnimationFrame(() => requestAnimationFrame(() => { isSavingRef.current = false; }));
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  // Inward sync: only apply when initialNodes/initialEdges change AND we didn't cause the change
  useEffect(() => {
    if (initialNodes === initialNodesRef.current) return;
    initialNodesRef.current = initialNodes;
    if (isSavingRef.current) return;
    setNodes(initialNodes);
    setViewPath(['root']);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (initialEdges === initialEdgesRef.current) return;
    initialEdgesRef.current = initialEdges;
    if (isSavingRef.current) return;
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // --- Subsystem Port Synchronization ---
  useEffect(() => {
    let hasChanges = false;
    const nextNodes = nodes.map(node => {
      const type = node.data?.type || node.type || '';
      if (type === 'subsystem' || type === 'Subsystem') {
        const childInports = nodes.filter(n => n.data?.parentId === node.id && (n.data?.type === 'inport' || n.data?.type === 'Inport'));
        const childOutports = nodes.filter(n => n.data?.parentId === node.id && (n.data?.type === 'outport' || n.data?.type === 'Outport'));

        const newPorts = [
          ...childInports
            .sort((a, b) => {
              const aIdx = Number(a.data?.params?.port_index?.value) || 0;
              const bIdx = Number(b.data?.params?.port_index?.value) || 0;
              return aIdx - bIdx;
            })
            .map(p => ({
              id: p.id,
              pos: 'left' as const,
              label: String(p.data?.params?.name?.value || 'In'),
              domain: 'physical'
            })),
          ...childOutports
            .sort((a, b) => {
              const aIdx = Number(a.data?.params?.port_index?.value) || 0;
              const bIdx = Number(b.data?.params?.port_index?.value) || 0;
              return aIdx - bIdx;
            })
            .map(p => ({
              id: p.id,
              pos: 'right' as const,
              label: String(p.data?.params?.name?.value || 'Out'),
              domain: 'physical'
            }))
        ];

        if (JSON.stringify(newPorts) !== JSON.stringify(node.data?.ports)) {
          hasChanges = true;
          return {
            ...node,
            data: {
              ...node.data,
              ports: newPorts
            }
          };
        }
      }
      return node;
    });

    if (hasChanges) {
      setNodes(nextNodes);
    }
  }, [nodes, setNodes]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [solverConfigTab, setSolverConfigTab] = useState<'general' | 'numerical' | 'tolerances' | 'diagnostics'>('numerical');

  const [searchQuery, setSearchQuery] = useState('');
  const [clipboard, setClipboard] = useState<any[]>([]);
  const [history, setHistory] = useState<{ nodes: any[], edges: any[] }[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const simTimeRef = useRef<number>(0);
  const simPhysicsStateRef = useRef<any>(null);
  const [vlabLimitInput, setVlabLimitInput] = useState('');
  const vlabLimitRef = useRef<number | null>(null);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const simSpeedRef = useRef<number>(1);

  useEffect(() => {
    simSpeedRef.current = Math.max(1, Math.min(5, simSpeed));
  }, [simSpeed]);

  useEffect(() => {
    const val = parseFloat(vlabLimitInput);
    vlabLimitRef.current = (!isNaN(val) && val > 0) ? val : null;
  }, [vlabLimitInput]);

  const getEffectiveLimit = useCallback((): number | null => {
    if (vlabLimitRef.current !== null && vlabLimitRef.current > 0) {
      return vlabLimitRef.current;
    }
    const scNode = nodes.find(n => (n.data as any)?.type === 'solver_config' || (n.data as any)?.type === 'solver_configuration');
    if (scNode) {
      return normalizeSolverConfiguration(scNode).stopTime;
    }
    return null;
  }, [nodes]);

  // Sync solver_config stopTime into vlabLimitInput if top bar is empty
  useEffect(() => {
    const scNode = nodes.find(n => (n.data as any)?.type === 'solver_config' || (n.data as any)?.type === 'solver_configuration');
    if (scNode) {
      const st = (scNode.data as any)?.params?.stopTime?.value ?? (scNode.data as any)?.params?.stop_time?.value;
      if (st !== undefined && st !== null) {
        const parsed = typeof st === 'number' ? st : parseFloat(st);
        if (!isNaN(parsed) && parsed > 0 && vlabLimitInput === '') {
          setVlabLimitInput(String(parsed));
        }
      }
    }
  }, [nodes, vlabLimitInput]);

  const handleVlabLimitChange = (raw: string) => {
    const sanitized = raw.replace(/[^0-9.]/g, '');
    setVlabLimitInput(sanitized);
    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed) && parsed > 0) {
      setNodes(nds => nds.map(n => {
        if ((n.data as any)?.type === 'solver_config' || (n.data as any)?.type === 'solver_configuration') {
          return {
            ...n,
            data: {
              ...n.data,
              params: {
                ...n.data.params,
                stopTime: { ...n.data.params?.stopTime, value: parsed }
              }
            }
          };
        }
        return n;
      }));
    }
  };

  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // 3DEXPERIENCE Sync State
  const [show3dxSyncModal, setShow3dxSyncModal] = useState(false);
  const [tdxWorkspaces, setTdxWorkspaces] = useState<any[]>([]);
  const [tdxDocs, setTdxDocs] = useState<any[]>([]);
  const [selectedTdxWorkspace, setSelectedTdxWorkspace] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncAction, setSyncAction] = useState<'push' | 'pull'>('push');

  const handle3dxSyncInit = async (action: 'push' | 'pull') => {
    setSyncAction(action);
    setSyncStatus('loading');
    setShow3dxSyncModal(true);

    try {
      const electron = (window as any).require?.('electron');
      if (!electron) throw new Error('Not in desktop environment');
      
      const creds = await electron.ipcRenderer.invoke('3dx-load-credentials');
      if (!creds) {
        alert('Please login to 3DEXPERIENCE from the main dashboard gateway first.');
        setShow3dxSyncModal(false);
        return;
      }

      const res = await electron.ipcRenderer.invoke('3dx-get-workspaces');
      if (res && res.workspaces) {
        setTdxWorkspaces(res.workspaces);
        if (res.workspaces.length > 0) {
          setSelectedTdxWorkspace(res.workspaces[0].id);
        }
      }

      if (action === 'pull') {
        const docRes = await electron.ipcRenderer.invoke('3dx-search-documents', { query: 'vlab' });
        if (docRes && docRes.documents) {
          setTdxDocs(docRes.documents.filter((d: any) => d.fileType === 'json' || d.mimeType === 'application/json'));
        }
      }

      setSyncStatus('idle');
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    }
  };

  const handle3dxPush = async () => {
    setSyncStatus('loading');
    try {
      const electron = (window as any).require?.('electron');
      const payload = {
        fileName: `vlab_model_${new Date().toISOString().slice(0,10)}.json`,
        content: JSON.stringify({ nodes, edges }, null, 2),
        encoding: 'utf8',
        mimeType: 'application/json',
        targetWorkspaceId: selectedTdxWorkspace,
        title: 'VLab Physics Model Sync',
        description: `Uploaded from V-Lab Physics Simulator — ${new Date().toLocaleString()}`
      };
      const res = await electron.ipcRenderer.invoke('3dx-upload-document', payload);
      if (res.success) {
        setSyncStatus('success');
        setTimeout(() => setShow3dxSyncModal(false), 1500);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    }
  };

  const handle3dxPull = async (docId: string) => {
    setSyncStatus('loading');
    try {
      const electron = (window as any).require?.('electron');
      const res = await electron.ipcRenderer.invoke('3dx-download-document', { documentId: docId });
      if (res.success && res.content) {
        const data = JSON.parse(res.content);
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
          setSyncStatus('success');
          setTimeout(() => setShow3dxSyncModal(false), 1500);
        } else {
          setSyncStatus('error');
        }
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    }
  };

  const [scopeData, setScopeData] = useState<any[]>([]);
  const [perScopeData, setPerScopeData] = useState<Record<string, any[]>>({});
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'library' | 'labs'>('library');
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isLibCollapsed, setIsLibCollapsed] = useState(false);
  const [isPropsCollapsed, setIsPropsCollapsed] = useState(false);

  const isSpacePressedRef = useRef(false);
  const spaceComboUsedRef = useRef(false);
  const isRPressedRef = useRef(false);

  const toggleDomain = (type: string) => {
    setExpandedDomains(prev => ({ ...prev, [type]: prev[type] === false ? true : false }));
  };

  const toggleCategory = (catKey: string) => {
    setExpandedCategories(prev => ({ ...prev, [catKey]: prev[catKey] === false ? true : false }));
  };
  const [hoveredLabId, setHoveredLabId] = useState<string | null>(null);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [quickSearchPos, setQuickSearchPos] = useState({ x: 0, y: 0 });
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Right-click drag-to-copy state
  const [rightClickDrag, setRightClickDrag] = useState<{
    clonedNodeId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  useEffect(() => {
    if (!rightClickDrag) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const zoom = reactFlowInstance?.getZoom() || 1;
      const dx = (e.clientX - rightClickDrag.startMouseX) / zoom;
      const dy = (e.clientY - rightClickDrag.startMouseY) / zoom;
      
      setNodes(nds => nds.map(n => n.id === rightClickDrag.clonedNodeId ? {
        ...n,
        position: {
          x: rightClickDrag.startNodeX + dx,
          y: rightClickDrag.startNodeY + dy
        }
      } : n));
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        setRightClickDrag(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [rightClickDrag, reactFlowInstance, setNodes]);

  const handleNodeMouseDown = useCallback((event: React.MouseEvent, node: Node) => {
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      setHistory(h => [...h, { nodes, edges }].slice(-20));
      const newNodeId = `${node.data.type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const clonedNode: Node = {
        ...node,
        id: newNodeId,
        position: {
          x: node.position.x,
          y: node.position.y
        },
        selected: true,
        data: {
          ...node.data,
          id: newNodeId,
          selected: true
        }
      };
      setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), clonedNode]);
      setSelectedNodeId(newNodeId);
      setRightClickDrag({
        clonedNodeId: newNodeId,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startNodeX: node.position.x,
        startNodeY: node.position.y
      });
    }
  }, [nodes, edges, setNodes, setSelectedNodeId]);

  const scopeParamsRef = useRef<any>({});
  useEffect(() => {
    const selectedScope = selectedNodeId
      ? nodes.find(n => n.id === selectedNodeId && (n.data as any)?.type === 'scope')
      : null;
    const scopeNode = selectedScope || nodes.find(n => (n.data as any)?.type === 'scope');
    scopeParamsRef.current = scopeNode?.data?.params || {};
  }, [nodes, selectedNodeId]);

  // Select and focus programmatic node
  useEffect(() => {
    if (initialSelectedNodeId && reactFlowInstance) {
      setSelectedNodeId(initialSelectedNodeId);
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === initialSelectedNodeId })));
      const node = nodes.find(n => n.id === initialSelectedNodeId);
      if (node) {
        setTimeout(() => {
          reactFlowInstance.setCenter(node.position.x + 40, node.position.y + 30, { zoom: 1.2, duration: 800 });
        }, 150);
      }
    }
  }, [initialSelectedNodeId, reactFlowInstance, nodes]);
  const [invalidEdges, setInvalidEdges] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ message: string; type: 'idle' | 'info' | 'success' | 'warning' | 'error' }>({
    message: 'System Ready',
    type: 'idle'
  });

  // ── Physics Engine ──────────────────────────────────────────────────────────
  /**
   * Builds a domain-aware simulation step function from the current node graph.
   * Returns a function: (t, dt) => number  (the signal value at the scope)
   */
  const buildSimEngine = useCallback(() => {
    const engine = new VLabPhysicsEngine();
    let useFallback = false;

    // Helper: get a param value from a node by id for the fallback
    const param = (nodeId: string, key: string, fallback: number) => {
      const n = nodes.find(nd => nd.id === nodeId);
      if (!n) return fallback;
      const p = (n.data as any).params?.[key];
      if (p === undefined || p === null) return fallback;
      const val = p.value;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? fallback : parsed;
      }
      return fallback;
    };

    // Keep the old hardcoded solver as a safe runtime fallback
    const runFallbackSolver = () => {
      const hasAC = nodes.some(n => (n.data as any).type === 'ac_voltage');
      const hasThermal = nodes.some(n => ['thermal_resistor', 'convective_heat', 'thermal_mass', 'temp_sensor'].includes((n.data as any).type));
      const hasScope = nodes.some(n => (n.data as any).type === 'scope');

      if (hasAC && hasThermal && hasScope) {
        const Vpk = param('ac_supply', 'Vpk', 325);
        const R = param('heating_element', 'Rth', 35);
        const h = param('convection_link', 'h', 80);
        const A = param('convection_link', 'A', 0.15);
        const V = param('air_chamber', 'V', 0.005);
        const rho = 1.2, Cp = 1005;
        const C = rho * Cp * V;
        const hA = h * A;
        const P_avg = (Vpk * Vpk) / (2 * R);
        const T_amb = 293;

        let T = T_amb;
        return (t: number, dt: number) => {
          const dT = (P_avg - hA * (T - T_amb)) / C;
          T += dT * dt;
          return T - T_amb;
        };
      }

      const hasDC = nodes.some(n => (n.data as any).type === 'dc_voltage');
      const hasMotor = nodes.some(n => (n.data as any).type === 'rotational_electromechanical_converter');
      const isBlender = hasDC && hasMotor && nodes.some(n => n.id === 'blender_motor');

      if (isBlender) {
        const Vsrc = param('dc_source', 'V_const', 24);
        const K = param('blender_motor', 'K', 0.05);
        const Ra = param('blender_motor', 'R', 2.0);
        const b = param('mixture_drag', 'b', 0.001);
        const J = param('blade_inertia', 'J', 0.0002);

        let omega = 0;
        return (t: number, dt: number) => {
          const T_elec = K * (Vsrc - K * omega) / Ra;
          const dOmega = (T_elec - b * omega) / J;
          omega += dOmega * dt;
          return omega * (60 / (2 * Math.PI));
        };
      }

      const hasPID = nodes.some(n => (n.data as any).type === 'ps_pid_ctrl');
      const isPIDMotor = hasPID && nodes.some(n => n.id === 'speed_pid');

      if (isPIDMotor) {
        const w_ref = param('ref_speed', 'value', 1200);
        const Kp = param('speed_pid', 'Kp', 2.0);
        const Ki = param('speed_pid', 'Ki', 5.0);
        const Kd = param('speed_pid', 'Kd', 0.1);
        const N = param('speed_pid', 'N', 100);
        const limit = param('speed_pid', 'limit', 240);
        const J = param('rotor_inertia', 'J', 0.05);
        const b = 0.1;

        let omega = 0;
        let integ = 0;
        let filterState = 0;
        const w_ref_rad = w_ref * (2 * Math.PI / 60);

        return (t: number, dt: number) => {
          const target_rad = t < 0.5 ? 0 : w_ref_rad;
          const error = target_rad - omega;
          const dFilter = N * (error - filterState);
          filterState += dFilter * dt;
          const deriv = dFilter;
          const u_unsat = Kp * error + Ki * integ + Kd * deriv;
          const u = Math.max(-limit, Math.min(limit, u_unsat));
          const saturated = u !== u_unsat;
          const sameSign = Math.sign(error) === Math.sign(u_unsat);
          if (!(saturated && sameSign)) {
            integ += error * dt;
          }
          const dOmega = (u - b * omega) / J;
          omega += dOmega * dt;
          return {
            value: omega * (60 / (2 * Math.PI)),
            target: target_rad * (60 / (2 * Math.PI))
          };
        };
      }

      const customDoeNode = nodes.find(n => (n.data as any).type === 'doe_custom');
      if (customDoeNode) {
        const data = customDoeNode.data as any;
        const modelType = data.params?.modelType?.value || 'RSM';
        const eq = data.params?.equation?.value || '0';
        const inputNames = data.params?.inputNames || [];
        const layers = data.params?.layers || [];
        const polyOrder = data.params?.polyOrder || 2;

        return (t: number, dt: number) => {
          const inputs = inputNames.map((name: string, i: number) => {
            const edge = edges.find(e => e.target === customDoeNode.id && e.targetHandle === `in${i + 1}_t`);
            if (edge) {
              const sourceNode = nodes.find(n => n.id === edge.source);
              if (sourceNode) return param(sourceNode.id, 'value', 0);
            }
            return param(customDoeNode.id, name, 0);
          });

          if (modelType === 'RSM') {
            try {
              const lines = (eq || '0').split('\n');
              const eqLine = lines.find((l: string) => l.includes('Y ='));
              let eqStr = '0';
              if (eqLine) {
                eqStr = eqLine.split('Y =')[1].trim();
                lines.slice(lines.indexOf(eqLine) + 1).forEach((line: string) => {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
                    eqStr += ' ' + trimmed;
                  }
                });
              }
              const scope: any = {};
              inputNames.forEach((name: string, i: number) => {
                scope[name] = inputs[i];
                scope[`X${i + 1}`] = inputs[i];
              });
              return math.evaluate!(eqStr, scope);
            } catch (e) { return 0; }
          } else if (modelType === 'GMDH') {
            try {
              let currentVals = [...inputs];
              for (const layer of layers) {
                currentVals = layer.map((neuron: any) => {
                  const xi = currentVals[neuron.inputs[0]];
                  const xj = currentVals[neuron.inputs[1]];
                  let vals: number[];
                  if (polyOrder === 2) vals = [1, xi, xj, xi * xi, xj * xj, xi * xj];
                  else vals = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
                  return vals.reduce((sum, v, cIdx) => sum + v * (neuron.coeffs[cIdx] || 0), 0);
                });
              }
              return currentVals[0] || 0;
            } catch (e) { return 0; }
          }
          return 0;
        };
      }

      const isWash = nodes.some(n => n.id === 'basket_load');
      if (isWash) {
        let omega = 0, theta = 0;
        let iq = 0;
        const P = 4;
        const R = param('basket_load', 'radius', 0.25);
        const M_clothes = param('basket_load', 'load_mass', 5);
        const M_unbal = param('basket_load', 'unbalance', 0.5);
        const J_basket = param('basket_load', 'J_basket', 0.1);
        const Water = param('fluid_load', 'water_level', 10);
        const Det = param('fluid_load', 'detergent', 1);
        const J_total = J_basket + (M_clothes + Water) * R * R;

        return (t: number, dt: number) => {
          const subSteps = 20;
          const sdt = dt / subSteps;
          const w_ref_rad = 600 * (2 * Math.PI / 60);

          for (let i = 0; i < subSteps; i++) {
            const T_unbal = M_unbal * 9.81 * R * Math.sin(theta);
            const viscosity = 0.05 + (Det * 0.02) + (Water * 0.005);
            const T_drag = viscosity * omega + 0.01 * Math.sign(omega) * (omega * omega);
            const iq_ref = Math.max(-50, Math.min(50, (w_ref_rad - omega) * 20.0));
            const Te = 1.5 * P * 0.1 * iq;
            const dOmega = (Te - T_drag - T_unbal) / J_total;
            omega += dOmega * sdt;
            theta += omega * sdt;
            const dIq = (iq_ref - iq) * 100;
            iq += dIq * sdt;
          }
          return { value: omega * (60 / (2 * Math.PI)), amps: iq };
        };
      }

      const isVFD = nodes.some(n => n.id === 'vfd_controller');
      if (isVFD) {
        let omega = 0, theta_e = 0, id = 0, iq = 0, psi_r = 0;
        const mode = param('vfd_controller', 'mode', 1);
        const P = param('im_motor', 'pole_pairs', 2);
        const Rs = param('im_motor', 'Rs', 0.1);
        const Lm = 0.05, Ls = 0.06, Lr = 0.06;
        const sigma = 1 - (Lm * Lm) / (Ls * Lr);
        const J = 0.05, B = 0.1, Rr = 0.1;

        return (t: number, dt: number) => {
          const w_ref_rpm = t < 1.0 ? 500 : 1500;
          const w_ref_rad = w_ref_rpm * (2 * Math.PI / 60);
          const subSteps = 20;
          const sdt = dt / subSteps;
          const V_MAX = 600;

          for (let step = 0; step < subSteps; step++) {
            let vd_ref = 0, vq_ref = 0, we = 0;
            if (mode === 0) {
              we = w_ref_rad * P;
              const V = Math.max(20, Math.min(V_MAX, we * 0.8));
              vd_ref = V;
              vq_ref = 0;
              theta_e += we * sdt;
            } else {
              const iq_ref = Math.max(-100, Math.min(100, (w_ref_rad - omega) * 15.0));
              const id_ref = 12.0;
              vd_ref = (id_ref - id) * 40 + Rs * id;
              vq_ref = (iq_ref - iq) * 40 + Rs * iq + omega * P * psi_r * (Lm / Lr);
              vd_ref = Math.max(-V_MAX, Math.min(V_MAX, vd_ref));
              vq_ref = Math.max(-V_MAX, Math.min(V_MAX, vq_ref));
              const slip = (Rr * iq) / (Math.max(0.01, psi_r));
              we = Math.max(-2000, Math.min(2000, omega * P + slip));
              theta_e += we * sdt;
            }
            const Te = 1.5 * P * (Lm / Lr) * psi_r * iq;
            const dOmega = (Te - B * omega) / J;
            omega += dOmega * sdt;
            const dPsi = (Rr * Lm / Lr) * id - (Rr / Lr) * psi_r;
            psi_r += dPsi * sdt;
            const dId = (vd_ref - Rs * id + we * sigma * Ls * iq - (Lm / Lr) * dPsi) / (sigma * Ls);
            const dIq = (vq_ref - Rs * iq - we * sigma * Ls * id - we * (Lm / Lr) * psi_r) / (sigma * Ls);
            id += dId * sdt;
            iq += dIq * sdt;
          }
          return { value: omega * (60 / (2 * Math.PI)), target: w_ref_rpm };
        };
      }

      const isMicrowave = nodes.some(n => n.id === 'mw_cavity');
      if (isMicrowave) {
        const P_mag = param('mw_magnetron', 'power_rating', 900);
        const eff = param('mw_magnetron', 'efficiency', 65) / 100;
        const R_heat = param('mw_heater', 'resistance', 35);
        const P_steam = param('mw_steam', 'power', 800);
        const vol = param('mw_cavity', 'volume', 25);
        const T_amb = 25;
        const Q_total = (P_mag * eff) + ((230 * 230) / R_heat) + P_steam;
        const C = (vol * 0.0012 * 1005) + 500;
        let temp = T_amb;

        return (t: number, dt: number) => {
          const Q_loss = 0.8 * (temp - T_amb);
          const dTemp = (Q_total - Q_loss) / C;
          temp += dTemp * dt;
          return temp;
        };
      }

      return (_t: number, _dt: number) => 0;
    };

    const fallbackStep = runFallbackSolver();

    return (t: number, dt: number) => {
      if (!useFallback) {
        try {
          const result = engine.simulateStep(nodes, edges, simPhysicsStateRef.current, dt);
          simPhysicsStateRef.current = result;
          if (result && result.scopeValues !== undefined && result.scopeValues !== null) {
            if (result.perScopeValues) {
              const val = result.scopeValues;
              if (typeof val === 'object' && val !== null) {
                val.__perScope = result.perScopeValues;
                return val;
              } else {
                return { value: val, in1: val, __perScope: result.perScopeValues };
              }
            }
            return result.scopeValues;
          }
        } catch (e) {
          console.warn("DAE Physics Engine failed, falling back to Euler model:", e);
          useFallback = true;
        }
      }
      return fallbackStep(t, dt);
    };
  }, [nodes, edges]);

  // Simulation Loop
  useEffect(() => {
    if (!isSimulating || isPaused) return;

    // Build the physics engine once per simulation run
    const step = buildSimEngine();
    const DT = 0.05;   // seconds per tick (wall-clock 50 ms)

    let stepCount = 0;
    let lastSampleTime = 0;

    const interval = setInterval(() => {
      try {
        const stepsToRun = Math.max(1, Math.min(5, simSpeedRef.current || 1));
        for (let s = 0; s < stepsToRun; s++) {
          const currentT = simTimeRef.current;
          const limit = getEffectiveLimit();

          if (limit !== null && currentT >= limit - 1e-9) {
            setIsSimulating(false);
            clearInterval(interval);
            setStatus({ message: `Simulation reached limit of ${limit}s.`, type: 'success' });
            return;
          }

          const dt = limit !== null ? Math.min(DT, Math.max(0, limit - currentT)) : DT;
          if (dt <= 1e-12) {
            setIsSimulating(false);
            clearInterval(interval);
            setStatus({ message: `Simulation reached limit of ${limit}s.`, type: 'success' });
            return;
          }

          const val = step(currentT, dt);
          const nextT = parseFloat((currentT + dt).toFixed(6));
          simTimeRef.current = nextT;

          if (val !== null && val !== undefined) {
            stepCount++;

            const scopeParams = scopeParamsRef.current || {};
            const decimation = Number(scopeParams.decimation?.value) || 1;
            const sampleTime = scopeParams.sample_time?.value !== undefined ? Number(scopeParams.sample_time.value) : -1;
            const limitDataPoints = scopeParams.limit_data_points?.value !== 'off';
            const bufferSize = Number(scopeParams.buffer_size?.value) || 1000;

            let shouldSample = true;
            if (decimation > 1 && (stepCount % decimation !== 0)) {
              shouldSample = false;
            }

            if (sampleTime > 0) {
              if (currentT - lastSampleTime < sampleTime - 1e-9 && lastSampleTime > 0) {
                shouldSample = false;
              }
            }

            if (shouldSample) {
              setScopeData(prev => {
                let newPoint: any;
                if (typeof val === 'number') {
                  if (!Number.isFinite(val)) return prev;
                  const num = parseFloat(val.toFixed(6));
                  newPoint = { time: parseFloat(nextT.toFixed(3)), value: num, in1: num };
                } else {
                  const entries = Object.entries(val)
                    .filter(([k]) => k !== '__perScope')
                    .map(([k, v]) => {
                      const numVal = parseFloat((v as number).toFixed(6));
                      return [k, Number.isFinite(numVal) ? numVal : 0];
                    });
                  const obj = Object.fromEntries(entries);
                  const values = Object.values(obj) as number[];
                  newPoint = {
                    time: parseFloat(nextT.toFixed(3)),
                    ...obj,
                    in1: obj.in1 !== undefined ? obj.in1 : (obj.value !== undefined ? obj.value : (values[0] ?? 0)),
                    in2: obj.in2 !== undefined ? obj.in2 : (values[1] ?? 0),
                    in3: obj.in3 !== undefined ? obj.in3 : (values[2] ?? 0),
                    in4: obj.in4 !== undefined ? obj.in4 : (values[3] ?? 0),
                    in5: obj.in5 !== undefined ? obj.in5 : (values[4] ?? 0),
                    in6: obj.in6 !== undefined ? obj.in6 : (values[5] ?? 0),
                    in7: obj.in7 !== undefined ? obj.in7 : (values[6] ?? 0),
                    in8: obj.in8 !== undefined ? obj.in8 : (values[7] ?? 0),
                  };
                }
                
                const next = [...prev, newPoint];
                if (limitDataPoints) {
                  return next.slice(-bufferSize);
                }
                return next.slice(-20000); // safety cap
              });

              // Route per-scope data from engine
              if (val && typeof val === 'object' && val.__perScope) {
                const perScope = val.__perScope as Record<string, any>;
                setPerScopeData(prevMap => {
                  const nextMap = { ...prevMap };
                  for (const [scopeId, scopeVal] of Object.entries(perScope)) {
                    let point: any;
                    if (typeof scopeVal === 'number') {
                      if (!Number.isFinite(scopeVal)) continue;
                      const num = parseFloat(scopeVal.toFixed(6));
                      point = { time: parseFloat(nextT.toFixed(3)), value: num, in1: num };
                    } else {
                      const entries = Object.entries(scopeVal)
                        .filter(([k]) => k !== '__perScope')
                        .map(([k, v]) => {
                          const numVal = parseFloat((v as number).toFixed(6));
                          return [k, Number.isFinite(numVal) ? numVal : 0];
                        });
                      const obj = Object.fromEntries(entries);
                      const values = Object.values(obj) as number[];
                      point = {
                        time: parseFloat(nextT.toFixed(3)),
                        ...obj,
                        in1: obj.in1 !== undefined ? obj.in1 : (obj.value !== undefined ? obj.value : (values[0] ?? 0)),
                        in2: obj.in2 !== undefined ? obj.in2 : (values[1] ?? 0),
                        in3: obj.in3 !== undefined ? obj.in3 : (values[2] ?? 0),
                        in4: obj.in4 !== undefined ? obj.in4 : (values[3] ?? 0),
                        in5: obj.in5 !== undefined ? obj.in5 : (values[4] ?? 0),
                        in6: obj.in6 !== undefined ? obj.in6 : (values[5] ?? 0),
                        in7: obj.in7 !== undefined ? obj.in7 : (values[6] ?? 0),
                        in8: obj.in8 !== undefined ? obj.in8 : (values[7] ?? 0),
                      };
                    }
                    const prev = nextMap[scopeId] || [];
                    const next = [...prev, point];
                    nextMap[scopeId] = limitDataPoints ? next.slice(-bufferSize) : next.slice(-20000);
                  }
                  return nextMap;
                });
              }

              if (sampleTime > 0) {
                lastSampleTime = nextT;
              }
            }
          }

          if (limit !== null && nextT >= limit - 1e-9) {
            setIsSimulating(false);
            clearInterval(interval);
            setStatus({ message: `Simulation reached limit of ${limit}s.`, type: 'success' });
            return;
          }
        }
        setSimTime(simTimeRef.current);
      } catch (err) {
        console.error("Simulation step failed:", err);
        setIsSimulating(false);
        setStatus({ message: "Simulation crashed: Numerical instability or invalid configuration.", type: 'error' });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isSimulating, isPaused, buildSimEngine, getEffectiveLimit]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;

      // Track Space press
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        isSpacePressedRef.current = true;
      }

      // Space + C Combo: Collapse/Expand properties and library panels together in vlab
      if ((e.key === 'c' || e.key === 'C') && isSpacePressedRef.current) {
        e.preventDefault();
        spaceComboUsedRef.current = true;
        const allCollapsed = isLibCollapsed && isPropsCollapsed;
        if (allCollapsed) {
          setIsLibCollapsed(false);
          setIsPropsCollapsed(false);
        } else {
          setIsLibCollapsed(true);
          setIsPropsCollapsed(true);
        }
      }

      // Run Simulation (Ctrl + R)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
        e.preventDefault();
        handleStartSimulation();
      }

      // Pause Simulation (Ctrl + P)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyP') {
        e.preventDefault();
        setIsPaused(true);
      }

      // Stop Simulation (Ctrl + O)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        setIsSimulating(false);
        setIsPaused(false);
      }

      // Track R press (without modifiers)
      if ((e.key === 'r' || e.key === 'R' || e.code === 'KeyR') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        isRPressedRef.current = true;
      }

      // Rotate Selected Node 90 degrees left (R + T)
      if ((e.key === 't' || e.key === 'T' || e.code === 'KeyT') && isRPressedRef.current) {
        e.preventDefault();
        setNodes(nds => nds.map(node => {
          if (node.selected) {
            const currentRotation = node.data?.rotation || 0;
            const newRotation = currentRotation - 90;
            return {
              ...node,
              data: {
                ...node.data,
                rotation: newRotation
              }
            };
          }
          return node;
        }));
      }

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
        if (onSaveAll) onSaveAll();
        else console.log('V-Lab State Saved Locally');
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setNodes(nds => nds.filter(node => !node.selected));
        setEdges(eds => eds.filter(edge => !edge.selected));
      }

      // Ctrl + C (Copy or Collapse panels)
      if (e.ctrlKey && e.key === 'c') {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          setClipboard(selectedNodes);
        } else {
          const allCollapsed = isLibCollapsed && isPropsCollapsed;
          if (allCollapsed) {
            setIsLibCollapsed(false);
            setIsPropsCollapsed(false);
          } else {
            setIsLibCollapsed(true);
            setIsPropsCollapsed(true);
          }
        }
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

      // Simulink Fit View (F key or Space key)
      if ((e.code === 'KeyF' || e.code === 'Space') && !e.ctrlKey && !e.metaKey && !e.altKey && !isInputFocused(e.target)) {
        if (e.code === 'Space' && isSpacePressedRef.current && spaceComboUsedRef.current) return;
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
        }
      }

      // Ctrl + 0 (Reset Zoom 100%)
      if ((e.ctrlKey || e.metaKey) && e.code === 'Digit0') {
        e.preventDefault();
        if (reactFlowInstance) {
          reactFlowInstance.zoomTo(1.0, { duration: 300 });
        }
      }

      // Ctrl + Plus / Equals (Zoom In)
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        if (reactFlowInstance) {
          reactFlowInstance.zoomIn({ duration: 300 });
        }
      }

      // Ctrl + Minus (Zoom Out)
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        if (reactFlowInstance) {
          reactFlowInstance.zoomOut({ duration: 300 });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        spaceComboUsedRef.current = false;
      }
      if (e.key === 'r' || e.key === 'R' || e.code === 'KeyR') {
        isRPressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [nodes, edges, clipboard, setNodes, setEdges, isLibCollapsed, isPropsCollapsed, setIsSimulating, reactFlowInstance]);

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return VLAB_LIBRARY;
    const query = searchQuery.toLowerCase().trim();

    return VLAB_LIBRARY.map(domain => {
      const scored = domain.blocks
        .map(b => ({ block: b, score: scoreVLabBlock(b, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      return {
        ...domain,
        maxScore: scored.length > 0 ? Math.max(...scored.map(s => s.score)) : 0,
        blocks: scored.map(s => s.block)
      };
    })
    .filter(domain => domain.blocks.length > 0)
    .sort((a, b) => b.maxScore - a.maxScore);
  }, [searchQuery]);

  const handleStartSimulation = useCallback(() => {
    if (isSimulating) {
      setIsPaused(p => !p);
      return;
    }

    // Dynamic real-time connection check
    const invalidErrors: string[] = [];
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      const sourceData = sourceNode.data as any;
      const targetData = targetNode.data as any;

      const sPortId = edge.sourceHandle?.split('-').pop()?.replace(/_[st]$/, '');
      const tPortId = edge.targetHandle?.split('-').pop()?.replace(/_[st]$/, '');
      
      const sourcePort = sourceData.ports?.find((p: any) => p.id === sPortId);
      const targetPort = targetData.ports?.find((p: any) => p.id === tPortId);

      const sDomain = sourcePort?.domain || sourceData.domain;
      const tDomain = targetPort?.domain || targetData.domain;

      const isUniversalBlock = (id: string) =>
        id === 'scope' || id === 'vlab_probe' || id === 'conn_label' || id === 'ps_terminator' ||
        id === 'subsystem' || id === 'Subsystem' ||
        id === 'inport' || id === 'Inport' ||
        id === 'outport' || id === 'Outport' ||
        id === 'solver_config' || id === 'solver_configuration';
      // Domain-bridge converters accept a connection from ANY domain on either
      // side so they can join blocks from two different physical models.
      const isDomainBridge = (id: string) =>
        id === 'ps_simulink_conv' || id === 'simulink_ps_conv';
      const isWildcardDomain = (d: any) =>
        typeof d === 'string' && ['any', 'all', 'universal'].includes(d.toLowerCase());
      const isRelaxed = isUniversalBlock(sourceData.type) || isUniversalBlock(targetData.type) ||
        isDomainBridge(sourceData.type) || isDomainBridge(targetData.type) ||
        isWildcardDomain(sDomain) || isWildcardDomain(tDomain);

      if (sDomain && tDomain && !areDomainsCompatible(sDomain, tDomain) && !isRelaxed) {
        const sLabel = sourceData.label || sourceData.type;
        const tLabel = targetData.label || targetData.type;
        invalidErrors.push(`${sLabel} (${sDomain}) ➔ ${tLabel} (${tDomain})`);
      }
    });

    if (invalidEdges.size > 0 || invalidErrors.length > 0) {
      const detail = invalidErrors.length > 0 ? ` Incompatible: ${invalidErrors.slice(0, 2).join('; ')}${invalidErrors.length > 2 ? ` (+${invalidErrors.length - 2} more)` : ''}` : '';
      setStatus({ 
        message: `CANNOT RUN SIMULATION: ${Math.max(invalidEdges.size, invalidErrors.length)} invalid connection(s) detected.${detail}`, 
        type: 'error' 
      });
      return;
    }

    setIsSimulating(true);
    setIsPaused(false);
    simTimeRef.current = 0;
    simPhysicsStateRef.current = null;
    setSimTime(0);
    setScopeData([]);
    setPerScopeData({});
    setStatus({ message: 'Simulation started successfully.', type: 'success' });
  }, [isSimulating, edges, nodes, invalidEdges]);

  const onConnect = useCallback((params: Connection) => {
    // 1. Domain connection validation (Simscape connection safety parity)
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (sourceNode && targetNode) {
      const sourceData = sourceNode.data as any;
      const targetData = targetNode.data as any;

      // Extract port IDs stripping handle prefixes
      let sPortId = (params.sourceHandle || '').replace(/_[st]$/, '');
      if (sPortId.startsWith(params.source + '-')) {
        sPortId = sPortId.slice(params.source.length + 1);
      }
      let tPortId = (params.targetHandle || '').replace(/_[st]$/, '');
      if (tPortId.startsWith(params.target + '-')) {
        tPortId = tPortId.slice(params.target.length + 1);
      }
      
      // Strict scope channel limit enforcement (supports connections in either direction)
      const isTargetScope = targetData.type === 'scope';
      const isSourceScope = sourceData.type === 'scope';

      if (isTargetScope || isSourceScope) {
        const scopeNode = isTargetScope ? targetNode : sourceNode;
        const scopeData = isTargetScope ? targetData : sourceData;
        const scopeId = scopeNode.id;
        let scopePortId = isTargetScope ? tPortId : sPortId;

        const numChannels = Math.max(1, Math.min(8, Number(scopeData.params?.numSignals?.value) || (scopeData.ports?.length || 1)));

        // If no explicit handle was given, find the first available unconnected channel
        if (!scopePortId) {
          const usedPorts = new Set(
            edges
              .filter(e => e.target === scopeId || e.source === scopeId)
              .map(e => {
                const h = (e.target === scopeId ? e.targetHandle : e.sourceHandle) || '';
                let p = h.replace(/_[st]$/, '');
                if (p.startsWith(scopeId + '-')) p = p.slice(scopeId.length + 1);
                return p;
              })
          );
          for (let i = 1; i <= numChannels; i++) {
            if (!usedPorts.has(`in${i}`)) {
              scopePortId = `in${i}`;
              if (isTargetScope) {
                params.targetHandle = `${scopeId}-in${i}`;
              } else {
                params.sourceHandle = `${scopeId}-in${i}`;
              }
              break;
            }
          }
        }

        const chNum = parseInt(scopePortId.replace(/\D/g, '')) || 1;

        if (chNum > numChannels) {
          setStatus({
            message: `Scope '${scopeData.label || 'Scope'}' is configured for ${numChannels} channel(s). Increase 'Number of Input Ports' in properties to connect to Channel ${chNum}.`,
            type: 'error'
          });
          setTimeout(() => setStatus(s => s.type === 'error' ? { message: 'System Ready', type: 'idle' } : s), 5000);
          return; // Block excess channel connection
        }

        const alreadyConnected = edges.some(e => {
          if (e.target === scopeId) {
            let p = (e.targetHandle || '').replace(/_[st]$/, '');
            if (p.startsWith(scopeId + '-')) p = p.slice(scopeId.length + 1);
            return p === scopePortId;
          }
          if (e.source === scopeId) {
            let p = (e.sourceHandle || '').replace(/_[st]$/, '');
            if (p.startsWith(scopeId + '-')) p = p.slice(scopeId.length + 1);
            return p === scopePortId;
          }
          return false;
        });

        if (alreadyConnected) {
          setStatus({
            message: `Channel ${chNum} on Scope '${scopeData.label || 'Scope'}' is already connected. Disconnect existing wire first.`,
            type: 'error'
          });
          setTimeout(() => setStatus(s => s.type === 'error' ? { message: 'System Ready', type: 'idle' } : s), 5000);
          return;
        }
      }

      const sourcePort = sourceData.ports?.find((p: any) => p.id === sPortId);
      const targetPort = targetData.ports?.find((p: any) => p.id === tPortId);

      const sDomain = sourcePort?.domain || sourceData.domain;
      const tDomain = targetPort?.domain || targetData.domain;

      const isUniversalBlock = (id: string) =>
        id === 'scope' || id === 'vlab_probe' || id === 'conn_label' || id === 'ps_terminator' ||
        id === 'subsystem' || id === 'Subsystem' ||
        id === 'inport' || id === 'Inport' ||
        id === 'outport' || id === 'Outport' ||
        id === 'solver_config' || id === 'solver_configuration';
      // Domain-bridge converters accept a connection from ANY domain on either
      // side so they can join blocks from two different physical models.
      const isDomainBridge = (id: string) =>
        id === 'ps_simulink_conv' || id === 'simulink_ps_conv';
      const isWildcardDomain = (d: any) =>
        typeof d === 'string' && ['any', 'all', 'universal'].includes(d.toLowerCase());
      const isRelaxed = isUniversalBlock(sourceData.type) || isUniversalBlock(targetData.type) ||
        isDomainBridge(sourceData.type) || isDomainBridge(targetData.type) ||
        isWildcardDomain(sDomain) || isWildcardDomain(tDomain);

      if (sDomain && tDomain && !areDomainsCompatible(sDomain, tDomain) && !isRelaxed) {
        const sName = sourceData.label || sourceData.type;
        const tName = targetData.label || targetData.type;
        setStatus({
          message: `Cannot connect ${sDomain} port (${sName}) to ${tDomain} port (${tName}). Use a domain converter block.`,
          type: 'error'
        });
        setTimeout(() => setStatus(s => s.type === 'error' ? { message: 'System Ready', type: 'idle' } : s), 5000);
        return; // Block the connection
      }
    }

    setHistory(h => [...h, { nodes, edges }].slice(-20)); // Keep last 20 steps
    const edge = {
      ...params,
      animated: true,
      style: { stroke: '#6c9ac6', strokeWidth: 2 },
    };
    setEdges((eds) => addEdge(edge, eds));
  }, [edges, nodes, setEdges]);

  useEffect(() => {
    const invalid = new Set<string>();
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      const sourceData = sourceNode.data as any;
      const targetData = targetNode.data as any;

      const sPortId = edge.sourceHandle?.split('-').pop()?.replace(/_[st]$/, '');
      const tPortId = edge.targetHandle?.split('-').pop()?.replace(/_[st]$/, '');
      
      const sourcePort = sourceData.ports?.find((p: any) => p.id === sPortId);
      const targetPort = targetData.ports?.find((p: any) => p.id === tPortId);

      const sDomain = sourcePort?.domain || sourceData.domain;
      const tDomain = targetPort?.domain || targetData.domain;

      // Relaxed validation for scopes and probes to allow easy visualization
      const isUniversalBlock = (id: string) =>
        id === 'scope' || id === 'vlab_probe' || id === 'conn_label' || id === 'ps_terminator' ||
        id === 'subsystem' || id === 'Subsystem' ||
        id === 'inport' || id === 'Inport' ||
        id === 'outport' || id === 'Outport' ||
        id === 'solver_config' || id === 'solver_configuration';
      // Domain-bridge converters accept a connection from ANY domain on either
      // side so they can join blocks from two different physical models.
      const isDomainBridge = (id: string) =>
        id === 'ps_simulink_conv' || id === 'simulink_ps_conv';
      const isWildcardDomain = (d: any) =>
        typeof d === 'string' && ['any', 'all', 'universal'].includes(d.toLowerCase());
      const isRelaxed = isUniversalBlock(sourceData.type) || isUniversalBlock(targetData.type) ||
        isDomainBridge(sourceData.type) || isDomainBridge(targetData.type) ||
        isWildcardDomain(sDomain) || isWildcardDomain(tDomain);

      if (sDomain && tDomain && !areDomainsCompatible(sDomain, tDomain) && !isRelaxed) {
        invalid.add(edge.id);
      }
    });
    setInvalidEdges(invalid);
    if (invalid.size > 0) {
      setStatus({ message: `${invalid.size} invalid connection(s) detected. Fix red pulse edges.`, type: 'warning' });
    } else if (status.type === 'warning') {
      setStatus({ message: 'Connections validated.', type: 'success' });
      setTimeout(() => setStatus(s => s.type === 'success' ? { message: 'System Ready', type: 'idle' } : s), 3000);
    }
  }, [edges, nodes]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onPaneClick = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      // Double Click Detected
      setQuickSearchPos({ x: e.clientX, y: e.clientY });
      setIsQuickSearchOpen(true);
      setQuickSearchQuery('');
    } else {
      setIsQuickSearchOpen(false);
      setQuickSearchQuery('');
    }
    setSelectedNodeId(null);
  };

  const addBlockAtPos = (block: VLabBlock, pos: { x: number, y: number }) => {
    const id = `${block.id}_${Date.now()}`;
    // Convert screen coordinates to flow coordinates
    let flowPosition = { x: pos.x, y: pos.y };
    if (reactFlowInstance && typeof reactFlowInstance.screenToFlowPosition === 'function') {
      flowPosition = reactFlowInstance.screenToFlowPosition(pos);
    }

    const newNode: Node = {
      id,
      type: 'default',
      position: { x: flowPosition.x - 40, y: flowPosition.y - 30 }, // Center the block
      data: {
        label: block.name,
        type: block.id,
        icon: block.icon,
        color: block.color,
        params: JSON.parse(JSON.stringify(block.params || {})),
        ports: JSON.parse(JSON.stringify(block.ports || [])),
        domain: VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === block.id))?.type,
        parentId: currentParentId
      },
    };
    setNodes((nds) => nds.concat(newNode));
    setIsQuickSearchOpen(false);
  };

  const addBlockToCenter = (block: VLabBlock) => {
    setHistory(h => [...h, { nodes, edges }].slice(-20));

    let position = { x: 500, y: 300 };

    if (reactFlowInstance && typeof reactFlowInstance.screenToFlowPosition === 'function') {
      const container = document.querySelector('.react-flow__renderer');
      if (container) {
        const rect = container.getBoundingClientRect();
        position = reactFlowInstance.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        });
        // Center the 80x60 block
        position.x -= 40;
        position.y -= 30;
      }
    }

    const newNode: Node = {
      id: `${block.id}_${Date.now()}`,
      type: 'default',
      position,
      data: {
        label: block.name,
        type: block.id,
        icon: block.icon,
        color: block.color,
        params: JSON.parse(JSON.stringify(block.params || {})),
        ports: JSON.parse(JSON.stringify(block.ports || [])),
        domain: VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === block.id))?.type,
        parentId: currentParentId
      },
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const loadLabTemplate = (labId: string) => {
    const lab = LEARNING_LABS.find(l => l.id === labId);
    if (!lab) return;

    if (nodes.length > 0 && !window.confirm('Loading a template will clear your current workspace. Continue?')) {
      return;
    }

    const reconstructedNodes = reconstructLabNodes(lab.nodes as any);
    const reconstructedEdges = lab.edges.map(edge => {
      const sourcePort = edge.sourceHandle.replace(/_[st]$/, '');
      const targetPort = edge.targetHandle.replace(/_[st]$/, '');
      return {
        ...edge,
        sourceHandle: `${edge.source}-${sourcePort}`,
        targetHandle: `${edge.target}-${targetPort}`,
        animated: true,
        style: { stroke: '#6c9ac6', strokeWidth: 2 }
      };
    });

    setNodes(reconstructedNodes);
    setEdges(reconstructedEdges as any);

    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView(), 100);
    }
  };

  const quickSearchResults = useMemo(() => {
    if (!quickSearchQuery.trim()) return [];
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    return searchVLabBlocks(allBlocks, quickSearchQuery).slice(0, 10);
  }, [quickSearchQuery]);

  const onNodeDoubleClick = (_: any, node: Node) => {
    if ((node.data as any).type === 'scope') {
      setOpenScopes(prev => prev.includes(node.id) ? prev : [...prev, node.id]);
    } else if ((node.data as any).type === 'subsystem' || (node.data as any).type === 'Subsystem') {
      setViewPath(prev => [...prev, node.id]);
      setSelectedNodeId(null);
    }
  };

  const getNodeDimensions = (type: string) => {
    switch (type) {
      case 'ground':
        return { width: 40, height: 30 };
      case 'ma_selector':
        return { width: 40, height: 60 };
      case 'resistor':
      case 'capacitor':
      case 'inductor':
      case 'diode':
      case 'memristor':
      case 'infinite_resistance':
      case 'ps_to_sim':
      case 'sim_to_ps':
        return { width: 60, height: 30 };
      case 'opamp':
      case 'switch':
      case 'variable_resistor':
      case 'thermal_resistor':
      case 'upper_heater':
      case 'gas_pipe':
      case 'gas_fixed_res':
      case 'lever':
      case 'rot_ref':
      case 'rot_spring':
      case 'rot_damper':
      case 'rot_friction':
      case 'rot_hard_stop':
      case 'trans_ref':
      case 'trans_spring':
      case 'trans_damper':
      case 'trans_friction':
      case 'trans_hard_stop':
      case 'ma_properties':
      case 'conductive_heat':
      case 'convective_heat':
      case 'radiative_heat':
      case 'ps_gain':
      case 'ps_integrator':
      case 'ps_transfer_fcn':
      case 'ps_rms':
      case 'ps_pi_ctrl':
      case 'ps_pid_ctrl':
      case 'solver_config':
      case 'scope':
        return { width: 60, height: 40 };
      case 'ps_math':
      case 'ps_lookup_1d':
      case 'ps_lookup_2d':
        return { width: 50, height: 50 };
      case 'ps_add':
      case 'ps_subtract':
      case 'ps_product':
      case 'ps_divide':
      case 'ps_abs':
      case 'ps_deadzone':
      case 'ps_saturation':
      case 'ps_dead_zone':
      case 'constant':
      case 'ps_constant':
      case 'ps_sine':
      case 'ps_step':
      case 'ps_term':
      case 'conn_label':
        return { width: 40, height: 40 };
      case 'ps_demux':
      case 'ps_demux_3':
        return { width: 40, height: 60 };
      case 'microwave_inverter':
        return { width: 70, height: 50 };
      case 'pwm_3ph_2level':
      case 'pwm_3ph_3level':
      case 'microwave_cavity':
      case 'lms_adaptive_filter':
        return { width: 80, height: 60 };
      case 'im_foc_ctrl':
      case 'im_scalar_ctrl':
      case 'washing_basket':
      case 'neural_neuron_learning':
      case 'rl_q_learning_controller':
        return { width: 80, height: 80 };
      default:
        return { width: 60, height: 60 };
    }
  };

  const onNodeDragStop = (_event: any, draggedNode: AppVLabNode, draggedNodes: AppVLabNode[]) => {
    const nodesToMove = draggedNodes && draggedNodes.length > 0 ? draggedNodes : [draggedNode];
    const draggedNodeIds = new Set(nodesToMove.map(n => n.id));
    
    const availableSubsystems = nodes.filter(n => 
      (n.data?.parentId || 'root') === currentParentId && 
      (n.data?.type === 'subsystem' || n.data?.type === 'Subsystem') && 
      !draggedNodeIds.has(n.id)
    );
    
    if (availableSubsystems.length === 0) return;

    let targetSubsystemId: string | null = null;
    
    for (const subNode of availableSubsystems) {
      const subDim = getNodeDimensions(subNode.data?.type || '');
      const subBox = {
        x: subNode.position.x,
        y: subNode.position.y,
        width: subDim.width,
        height: subDim.height
      };
      
      const overlaps = nodesToMove.some(dn => {
        const dnDim = getNodeDimensions(dn.data?.type || dn.type || '');
        const dnBox = {
          x: dn.position.x,
          y: dn.position.y,
          width: dnDim.width,
          height: dnDim.height
        };
        
        return (
          dnBox.x < subBox.x + subBox.width &&
          dnBox.x + dnBox.width > subBox.x &&
          dnBox.y < subBox.y + subBox.height &&
          dnBox.y + dnBox.height > subBox.y
        );
      });
      
      if (overlaps) {
        targetSubsystemId = subNode.id;
        break;
      }
    }
    
    if (targetSubsystemId) {
      setHistory(h => [...h, { nodes, edges }].slice(-20));
      
      const nextEdges: Edge[] = [];
      const newInports: Node[] = [];
      const newOutports: Node[] = [];

      // Count existing inports and outports under the target subsystem
      const existingInports = nodes.filter(n => n.data?.parentId === targetSubsystemId && (n.data?.type === 'inport' || n.data?.type === 'Inport')).length;
      const existingOutports = nodes.filter(n => n.data?.parentId === targetSubsystemId && (n.data?.type === 'outport' || n.data?.type === 'Outport')).length;

      let inportsCount = existingInports;
      let outportsCount = existingOutports;

      edges.forEach(e => {
        const isSourceDragged = draggedNodeIds.has(e.source);
        const isTargetDragged = draggedNodeIds.has(e.target);

        if (isSourceDragged && !isTargetDragged) {
          // Outgoing boundary edge (dragged block -> external block)
          const sourceNode = nodes.find(n => n.id === e.source);
          if (sourceNode) {
            outportsCount++;
            const outportId = `outport_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const portName = `Out${outportsCount}`;

            newOutports.push({
              id: outportId,
              type: 'default',
              position: { x: sourceNode.position.x + 150, y: sourceNode.position.y },
              data: {
                label: portName,
                type: 'outport',
                icon: 'outport',
                color: '#4b5563',
                params: {
                  name: { value: portName, unit: '', label: 'Port Name' },
                  port_index: { value: outportsCount, unit: '', label: 'Port Index' },
                  data_type: { value: 'auto', unit: '', label: 'Data Type' }
                },
                ports: [{ id: 'in', pos: 'left', label: 'In' }],
                parentId: targetSubsystemId!
              }
            });

            // Create re-routed edges
            nextEdges.push({
              id: `ext_${e.id}`,
              source: targetSubsystemId!,
              sourceHandle: `${targetSubsystemId}-${outportId}`,
              target: e.target,
              targetHandle: e.targetHandle,
              style: e.style
            });
            nextEdges.push({
              id: `int_${e.id}`,
              source: e.source,
              sourceHandle: e.sourceHandle,
              target: outportId,
              targetHandle: `${outportId}-in`,
              style: e.style
            });
          } else {
            nextEdges.push(e);
          }
        } else if (!isSourceDragged && isTargetDragged) {
          // Incoming boundary edge (external block -> dragged block)
          const targetNode = nodes.find(n => n.id === e.target);
          if (targetNode) {
            inportsCount++;
            const inportId = `inport_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const portName = `In${inportsCount}`;

            newInports.push({
              id: inportId,
              type: 'default',
              position: { x: targetNode.position.x - 150, y: targetNode.position.y },
              data: {
                label: portName,
                type: 'inport',
                icon: 'inport',
                color: '#4b5563',
                params: {
                  name: { value: portName, unit: '', label: 'Port Name' },
                  port_index: { value: inportsCount, unit: '', label: 'Port Index' },
                  data_type: { value: 'auto', unit: '', label: 'Data Type' }
                },
                ports: [{ id: 'out', pos: 'right', label: 'Out' }],
                parentId: targetSubsystemId!
              }
            });

            // Create re-routed edges
            nextEdges.push({
              id: `ext_${e.id}`,
              source: e.source,
              sourceHandle: e.sourceHandle,
              target: targetSubsystemId!,
              targetHandle: `${targetSubsystemId}-${inportId}`,
              style: e.style
            });
            nextEdges.push({
              id: `int_${e.id}`,
              source: inportId,
              sourceHandle: `${inportId}-out`,
              target: e.target,
              targetHandle: e.targetHandle,
              style: e.style
            });
          } else {
            nextEdges.push(e);
          }
        } else {
          // Internal edge or completely external edge
          nextEdges.push(e);
        }
      });

      // Update nodes state
      setNodes(nds => {
        const updatedNodes = nds.map(n => {
          if (draggedNodeIds.has(n.id)) {
            return {
              ...n,
              data: {
                ...n.data,
                parentId: targetSubsystemId!
              },
              selected: false
            };
          }
          return n;
        });
        return [...updatedNodes, ...newInports, ...newOutports];
      });

      // Update edges state
      setEdges(nextEdges);
      
      setSelectedNodeId(null);
      
      setStatus({ message: `Moved ${nodesToMove.length} block(s) into Subsystem.`, type: 'success' });
      setTimeout(() => setStatus(s => s.type === 'success' ? { message: 'System Ready', type: 'idle' } : s), 3000);
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
        const updatedParams = {
          ...n.data.params,
          [paramKey]: { ...n.data.params[paramKey], value }
        };
        const updatedData: Record<string, any> = {
          ...n.data,
          params: updatedParams
        };

        if (n.data.type === 'scope' && (paramKey === 'numSignals' || paramKey === 'numPorts')) {
          const num = Math.max(1, Math.min(8, Number(value) || 1));
          updatedData.ports = Array.from({ length: num }, (_, i) => ({
            id: `in${i + 1}`,
            pos: 'left',
            label: `${i + 1}`,
            domain: 'Physical'
          }));
          // Prune any incoming edges to channels exceeding new capacity
          setEdges(eds => eds.filter(e => {
            if (e.target !== n.id) return true;
            let t = (e.targetHandle || '').replace(/_[st]$/, '');
            if (t.startsWith(n.id + '-')) t = t.slice(n.id.length + 1);
            const ch = parseInt(t.replace(/\D/g, '')) || 1;
            return ch <= num;
          }));
        }

        if ((n.data.type === 'solver_config' || n.data.type === 'solver_configuration') && paramKey === 'stopTime') {
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          if (!isNaN(num) && num > 0) {
            setVlabLimitInput(String(num));
          }
        }

        let updatedLabel = n.data.label;
        if (paramKey === 'name') {
          updatedLabel = String(value);
        }

        return {
          ...n,
          data: {
            ...updatedData,
            label: updatedLabel
          }
        };
      }
      return n;
    }));
  };

  const runSimulation = () => {
    // Run a batch physics simulation for the DOE export respecting the configured limit
    const step = buildSimEngine();
    const DT = 0.1;   // s
    const limit = getEffectiveLimit() ?? 30;
    const N = Math.max(1, Math.round(limit / DT));

    const timeArr: number[] = [];
    const valArr: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = i * DT;
      const val = step(t, DT);
      const scalarVal = typeof val === 'number' ? val : (val.value ?? 0);
      timeArr.push(parseFloat(t.toFixed(3)));
      valArr.push(parseFloat(scalarVal.toFixed(6)));
    }

    const result = {
      time: timeArr,
      data: nodes.map(n => ({
        id: n.id,
        label: (n.data as any).label,
        values: valArr          // share the primary trace; extend per-node if needed
      }))
    };
    onResult(result, nodes);
  };

  const exportToExcel = () => {
    if (scopeData.length === 0 && Object.keys(perScopeData).length === 0) return;

    const wb = XLSX.utils.book_new();

    // If per-scope data exists, create one sheet per scope
    const perScopeEntries = Object.entries(perScopeData).filter(([_, d]) => d && d.length > 0);
    if (perScopeEntries.length > 0) {
      for (const [scopeId, data] of perScopeEntries) {
        const scopeNode = nodes.find(n => n.id === scopeId);
        const rawLabel = (scopeNode?.data as any)?.label || scopeId;
        const sheetName = rawLabel.replace(/[:\\/?*[\]]/g, '_').slice(0, 31); // Excel valid sheet name
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    } else {
      const ws = XLSX.utils.json_to_sheet(scopeData);
      XLSX.utils.book_append_sheet(wb, ws, "Simulation Results");
    }

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
        params: JSON.parse(JSON.stringify(data.params || {})),
        ports: JSON.parse(JSON.stringify(data.ports || [])),
        domain: VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === data.id))?.type,
        parentId: currentParentId
      },
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  return (
    <div id="vlab-workspace-container" className="vlab-workspace flex h-full w-full bg-[var(--surface-canvas)] text-[var(--text-primary)] overflow-hidden">
      {/* Top Bar */}
      <div className="vlab-panel absolute top-0 left-0 right-0 h-12 bg-[var(--surface-panel)] border-b border-[var(--border-default)] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors text-gray-400"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <FlaskConical className="text-purple-500" size={18} />
            <h1 className="text-sm font-bold tracking-tight">V-LAB <span className="text-gray-500 font-normal">PHYSICS SIMULATOR</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Simulation End Time Input */}
          <div className="flex items-center gap-2 bg-[#141414] border border-[#2d2d2d] rounded-lg px-2.5 py-1 text-xs font-bold text-gray-300 shadow-md">
            <span className="text-[9px] text-gray-500 uppercase font-black tracking-wider">End Time</span>
            <div className="relative flex items-center">
              <input
                type="text"
                value={vlabLimitInput}
                onChange={e => handleVlabLimitChange(e.target.value)}
                disabled={isSimulating}
                placeholder="Unlimited"
                className="w-16 bg-black/40 border border-[#2d2d2d] focus:border-[#a855f7]/50 rounded px-1.5 py-0.5 text-center text-xs font-mono font-bold text-[#c084fc] focus:outline-none transition-all disabled:opacity-50"
              />
              <span className="text-[9px] text-gray-500 font-mono ml-1 font-bold">s</span>
            </div>
          </div>

          <button
            onClick={handleStartSimulation}
            className={`flex items-center gap-2 ${isSimulating && !isPaused ? 'bg-amber-600 hover:bg-amber-500' : 'bg-purple-600 hover:bg-purple-500'} text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-purple-900/20`}
          >
            {isSimulating && !isPaused ? <><Pause size={14} fill="currentColor" /> PAUSE</> : <><Play size={14} fill="currentColor" /> {isPaused ? 'RESUME' : 'RUN SIMULATION'}</>}
          </button>

          {isSimulating && (
            <button
              onClick={() => {
                setIsSimulating(false);
                setIsPaused(false);
                simPhysicsStateRef.current = null;
                setStatus({ message: 'Simulation stopped.', type: 'info' });
                setTimeout(() => setStatus({ message: 'System Ready', type: 'idle' }), 3000);
              }}
              className="flex items-center gap-2 bg-red-600/20 border border-red-600/30 hover:bg-red-600/30 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold"
            >
              <Square size={12} fill="currentColor" /> STOP
            </button>
          )}

          {(scopeData.length > 0 || Object.values(perScopeData).some(d => d.length > 0)) && (
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
            className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] hover:bg-[#222] text-gray-300 px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
          >
            <Send size={14} /> EXPORT TO DOE
          </button>

          <button
            onClick={() => handle3dxSyncInit('push')}
            className="flex items-center gap-2 bg-blue-900/25 hover:bg-blue-900/45 text-[#4da6ff] border border-blue-800/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            title="Push to 3DEXPERIENCE"
          >
            <Cloud size={14} /> PUSH 3DX
          </button>

          <button
            onClick={() => handle3dxSyncInit('pull')}
            className="flex items-center gap-2 bg-blue-900/25 hover:bg-blue-900/45 text-[#4da6ff] border border-blue-800/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            title="Pull from 3DEXPERIENCE"
          >
            <Download size={14} /> PULL 3DX
          </button>
        </div>
      </div>

      <div className="flex flex-1 mt-12 overflow-hidden">
        {/* Left Sidebar: Block Library / Learning Labs */}
        <div className={`${isLibCollapsed ? 'w-12' : 'w-72'} vlab-panel border-r border-[var(--border-default)] flex flex-col transition-all duration-500 ease-in-out relative group shrink-0`}>
          {/* Header */}
          <div className="p-4 border-b border-[#222] flex items-center justify-between overflow-hidden shrink-0">
            {!isLibCollapsed && (
              <div className="flex items-center gap-2 text-purple-400">
                <Layers size={16} className="text-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-white">Library</h3>
              </div>
            )}
            <button
              onClick={() => setIsLibCollapsed(!isLibCollapsed)}
              className={`p-2 rounded-xl bg-[#181818] border border-[#2d2d2d] text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all ${isLibCollapsed ? 'mx-auto' : ''}`}
              title={isLibCollapsed ? "Expand Library" : "Collapse Library"}
            >
              <Triangle size={12} className={`transition-transform duration-500 ${isLibCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
            </button>
          </div>

          {!isLibCollapsed && (
            <>
              {/* Sidebar Tab Switcher */}
              <div className="p-3 border-b border-[#222] flex gap-1">
                <button
                  onClick={() => setActiveSidebarTab('library')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSidebarTab === 'library'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                      : 'text-gray-500 hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <Layers size={14} />
                  Library
                </button>
                <button
                  onClick={() => setActiveSidebarTab('labs')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSidebarTab === 'labs'
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]'
                      : 'text-gray-500 hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <GraduationCap size={14} />
                  Labs
                </button>
              </div>

              {activeSidebarTab === 'library' ? (
                <>
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

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {filteredLibrary.map(domain => {
                      const categories = domain.blocks.reduce((acc, block) => {
                        const cat = block.category || 'Standard';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(block);
                        return acc;
                      }, {} as Record<string, VLabBlock[]>);

                      const isDomainExpanded = searchQuery.trim() !== '' || expandedDomains[domain.type] !== false;

                      return (
                        <div key={domain.type} className="flex flex-col space-y-3">
                          {/* Domain Header Button */}
                          <button
                            onClick={() => toggleDomain(domain.type)}
                            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                              isDomainExpanded 
                                ? 'bg-purple-500/10 text-purple-400 border-l-2 border-purple-500' 
                                : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-1 h-1 rounded-full ${isDomainExpanded ? 'bg-purple-400' : 'bg-gray-600'}`} />
                              {domain.type}
                            </div>
                            {isDomainExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>

                          {/* Domain Categories and Blocks */}
                          {isDomainExpanded && (
                            <div className="flex flex-col gap-4 pl-1 animate-in slide-in-from-top-2 duration-300">
                              {Object.entries(categories).map(([catName, catBlocks]) => {
                                const catKey = `${domain.type}_${catName}`;
                                const isCatExpanded = searchQuery.trim() !== '' || expandedCategories[catKey] !== false;

                                return (
                                  <div key={catName} className="flex flex-col space-y-2 pl-2 border-l border-[#222]">
                                    {/* Category Header Button */}
                                    <button
                                      onClick={() => toggleCategory(catKey)}
                                      className="flex items-center justify-between w-full py-1 text-left outline-none group text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider group-hover:text-gray-400 transition-colors">
                                        {catName}
                                      </span>
                                      <span className="text-gray-600 group-hover:text-gray-400 transition-colors flex items-center justify-center">
                                        {isCatExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                      </span>
                                    </button>

                                    {/* Category Blocks */}
                                    {isCatExpanded && (
                                      <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 duration-200">
                                        {catBlocks.map(block => (
                                          <div
                                            key={block.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, block)}
                                            onClick={() => addBlockToCenter(block)}
                                            className="group bg-[#111] border border-white/5 p-3 rounded-xl cursor-grab active:cursor-grabbing hover:border-purple-500/50 hover:bg-[#151515] transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden"
                                          >
                                            <div className="w-14 h-12 flex items-center justify-center group-hover:scale-110 transition-transform origin-center">
                                              <SymbolRenderer type={block.icon} color={block.color} size={46} />
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-bold text-center leading-tight truncate w-full px-1 group-hover:text-gray-200 transition-colors uppercase tracking-tight">
                                              {block.name}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  <div className="mb-6 p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl">
                    <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <BookOpen size={14} />
                      Physical Modeling Labs
                    </h3>
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">
                      Select a pre-configured learning model to explore real-world physical phenomena and multi-domain interactions.
                    </p>
                  </div>

                  {LEARNING_LABS.map(lab => (
                    <div
                      key={lab.id}
                      onClick={() => loadLabTemplate(lab.id)}
                      onMouseEnter={() => setHoveredLabId(lab.id)}
                      onMouseLeave={() => setHoveredLabId(null)}
                      className="group relative bg-[#111] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-orange-500/30 transition-all active:scale-95 shadow-xl"
                    >
                      {/* Decorative Background Glow */}
                      <div className={`absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent transition-opacity duration-500 ${hoveredLabId === lab.id ? 'opacity-100' : 'opacity-0'}`} />

                      <div className="relative p-5">
                        <div className="flex justify-between items-start mb-4">
                          <div className="p-2 bg-orange-500/20 rounded-xl border border-orange-500/20">
                            <FlaskConical size={20} className="text-orange-400" />
                          </div>
                          <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-full text-gray-400 uppercase tracking-widest border border-white/5">
                            {lab.difficulty}
                          </span>
                        </div>

                        <h4 className="text-xs font-black text-gray-200 uppercase tracking-wider mb-2 group-hover:text-orange-400 transition-colors">
                          {lab.name}
                        </h4>
                        <p className="text-[10px] text-gray-500 leading-relaxed mb-4 line-clamp-2">
                          {lab.description}
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter">
                            {lab.category}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] font-black text-orange-400 group-hover:translate-x-1 transition-transform">
                            LOAD LAB <ChevronLeft size={14} className="rotate-180" />
                          </div>
                        </div>
                      </div>

                      {/* Bottom Progress/Status Bar */}
                      <div className="h-1 w-full bg-white/5 overflow-hidden">
                        <div className={`h-full bg-orange-500 transition-all duration-700 ${hoveredLabId === lab.id ? 'w-full' : 'w-0'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Center: Flow Canvas */}
        <div className={`flex-1 relative bg-[#0a0a0a] ${isConnecting ? 'react-flow--connection-active' : ''}`} onDrop={onDrop} onDragOver={onDragOver} onContextMenu={(e) => e.preventDefault()}>
          <ReactFlow
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            nodes={useMemo(() => nodes.filter(n => (n.data.parentId || 'root') === currentParentId).map(n => ({
              ...n,
              data: {
                ...n.data,
                onNodeMouseDown: (e: React.MouseEvent) => handleNodeMouseDown(e, n),
                onRenameNode: (nodeId: string, newLabel: string) => {
                  setNodes(nds => nds.map(nd => {
                    if (nd.id === nodeId) {
                      return {
                        ...nd,
                        data: {
                          ...nd.data,
                          label: newLabel,
                          params: nd.data.params?.name
                            ? { ...nd.data.params, name: { ...nd.data.params.name, value: newLabel } }
                            : nd.data.params
                        }
                      };
                    }
                    return nd;
                  }));
                }
              }
            })), [nodes, currentParentId, handleNodeMouseDown, setNodes])}
            edges={useMemo(() => edges.filter(e => {
              const sourceNode = nodes.find(n => n.id === e.source);
              return sourceNode && (sourceNode.data.parentId || 'root') === currentParentId;
            }).map(e => ({
              ...e,
              className: invalidEdges.has(e.id) ? 'edge-error' : '',
              style: invalidEdges.has(e.id) ? { stroke: '#ff3333', strokeWidth: 3 } : e.style
            })), [edges, nodes, currentParentId, invalidEdges])}
            onNodesChange={onLocalNodesChange}
            onEdgesChange={onLocalEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionLineComponent={VLabConnectionLine}
            connectionLineStyle={{ stroke: '#6c9ac6', strokeWidth: 2 }}
            connectionLineType={ConnectionLineType.Bezier}
            connectionMode={ConnectionMode.Loose}
            className="engineering-canvas"
            fitView
            snapToGrid
            snapGrid={[10, 10]}
          >
            <Background color="var(--diagram-grid)" gap={20} variant={BackgroundVariant.Lines} />
            <Controls className="vlab-panel ui-control" />

            {/* Simulink Canvas Zoom HUD */}
            <Panel position="bottom-left" className="m-3 select-none">
              <div className="flex items-center gap-1 bg-[#121218]/90 border border-white/10 p-1 rounded-xl shadow-2xl backdrop-blur-md">
                <button
                  onClick={() => reactFlowInstance?.zoomOut({ duration: 300 })}
                  className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-all active:scale-95"
                  title="Zoom Out (Ctrl + -)"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => reactFlowInstance?.zoomTo(1.0, { duration: 300 })}
                  className="px-2 py-1 text-[10px] font-mono font-bold text-purple-400 hover:bg-purple-500/10 rounded-lg transition-all"
                  title="Reset Zoom to 100% (Ctrl + 0)"
                >
                  {Math.round((reactFlowInstance?.getZoom?.() || 1) * 100)}%
                </button>
                <button
                  onClick={() => reactFlowInstance?.zoomIn({ duration: 300 })}
                  className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-all active:scale-95"
                  title="Zoom In (Ctrl + +)"
                >
                  <ZoomIn size={14} />
                </button>
                <div className="w-px h-4 bg-white/10 mx-0.5" />
                <button
                  onClick={() => reactFlowInstance?.fitView({ padding: 0.2, duration: 400 })}
                  className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                  title="Zoom to Fit (Space / F)"
                >
                  <Maximize2 size={12} />
                  <span>Fit View</span>
                </button>
              </div>
            </Panel>

            <Panel position="top-left" className="m-0 select-none">
              <div className="flex items-center gap-1.5 bg-[#0d0d0d]/90 border border-white/5 px-3 py-1.5 rounded-full backdrop-blur-md shadow-2xl">
                {viewPath.map((pathId, idx) => {
                  const isLast = idx === viewPath.length - 1;
                  const label = pathId === 'root' ? 'Root Workspace' : (nodes.find(n => n.id === pathId)?.data?.label || 'Subsystem');
                  return (
                    <React.Fragment key={pathId}>
                      {idx > 0 && <ChevronRight size={12} className="text-gray-600" />}
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => setViewPath(viewPath.slice(0, idx + 1))}
                        className={`text-[10px] font-black uppercase tracking-widest transition-all ${
                          isLast ? 'text-purple-400' : 'text-gray-500 hover:text-purple-300'
                        }`}
                      >
                        {label}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </Panel>

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
                    className="bg-transparent text-xs w-full outline-none text-white" // Defensive check for e.target.value
                    value={quickSearchQuery || ''} // Ensure it's always a string
                    onChange={(e) => setQuickSearchQuery(e.target?.value || '')}
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
                      <div className="w-9 h-9 rounded-lg bg-[#141419] flex items-center justify-center border border-white/5 group-hover:border-purple-500/30 overflow-visible">
                        <SymbolRenderer type={block.icon} color={block.color} size={26} />
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
              <Panel position="bottom-right" className="w-96 h-64 mb-12 mr-4 shadow-2xl z-50">
                <ScopeView
                  data={perScopeData[selectedNode.id]?.length > 0 ? perScopeData[selectedNode.id] : scopeData}
                  title={selectedNode.data.label}
                  isPaused={isPaused}
                  params={selectedNode.data.params || {}}
                  onExpand={() => setOpenScopes(prev => prev.includes(selectedNode.id) ? prev : [...prev, selectedNode.id])}
                />
              </Panel>
            )}

            <MiniMap
              nodeColor={n => (n.data as any).color || '#222'}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-[#1a1a1a] border border-[#333] rounded-lg"
            />

            {/* Premium Status Bar */}
            <Panel position="bottom-center" className="mb-6">
              <div className={`flex items-center gap-3 px-4 py-2 rounded-full border backdrop-blur-md shadow-2xl transition-all duration-500 ${
                status.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-red-900/20' :
                status.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-900/20' :
                status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-900/20' :
                'bg-white/5 border-white/10 text-gray-400 shadow-black/40'
              }`}>
                {status.type === 'error' && <Zap size={14} className="animate-pulse" />}
                {status.type === 'warning' && <Info size={14} />}
                {status.type === 'success' && <Activity size={14} className="text-emerald-500" />}
                {status.type === 'idle' && <Box size={14} className="text-gray-600" />}
                
                <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                  {status.message}
                </span>

                {isSimulating && (
                  <div className="flex items-center gap-3 pl-3 ml-3 border-l border-white/10">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping" />
                      <span className="text-[10px] text-purple-400 font-mono">
                        T = {simTime.toFixed(2)}s
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-600 font-mono italic">
                      Solver: ODE45 (Fixed Step)
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </ReactFlow>

          <button
            onClick={() => setShowConfirmClear(true)}
            className="absolute top-4 right-4 z-50 bg-[#1a1a1a] border border-[#333] text-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Trash2 size={12} />
            Clear Canvas
          </button>
        </div>

        {/* Right Sidebar: Properties & Equations */}
        <div className={`${isPropsCollapsed ? 'w-12' : 'w-80'} vlab-panel border-l border-[var(--border-default)] flex flex-col transition-all duration-500 ease-in-out relative group shrink-0`}>
          {/* Header */}
          <div className="p-4 border-b border-[#222] flex items-center justify-between overflow-hidden shrink-0">
            {!isPropsCollapsed && (
              <div className="flex items-center gap-2 text-purple-400">
                <Settings2 size={16} className="text-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-white">Properties</h3>
              </div>
            )}
            <button
              onClick={() => setIsPropsCollapsed(!isPropsCollapsed)}
              className={`p-2 rounded-xl bg-[#181818] border border-[#2d2d2d] text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all ${isPropsCollapsed ? 'mx-auto' : ''}`}
              title={isPropsCollapsed ? "Expand Properties" : "Collapse Properties"}
            >
              <Triangle size={12} className={`transition-transform duration-500 ${isPropsCollapsed ? '-rotate-90' : 'rotate-90'}`} fill="currentColor" />
            </button>
          </div>

          {!isPropsCollapsed && (
            selectedNode ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
                {/* Properties Section */}
                <div className="p-4 border-b border-[#222]">
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
                    <div className="space-y-2">
                      <div className="bg-[#141414] p-3 rounded-xl border border-[#222]">
                        <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Block Name</label>
                        <input
                          type="text"
                          value={(selectedNode.data as any).label || (selectedNode.data as any).type || ''}
                          onChange={(e) => {
                            const newLabel = e.target.value;
                            setNodes(nds => nds.map(nd => {
                              if (nd.id === selectedNode.id) {
                                return {
                                  ...nd,
                                  data: {
                                    ...nd.data,
                                    label: newLabel,
                                    params: nd.data.params?.name
                                      ? { ...nd.data.params, name: { ...nd.data.params.name, value: newLabel } }
                                      : nd.data.params
                                  }
                                };
                              }
                              return nd;
                            }));
                          }}
                          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg py-1.5 px-2.5 text-xs text-purple-300 font-medium focus:border-purple-500 outline-none"
                          placeholder="Enter block name..."
                        />
                      </div>
                      <div className="bg-[#141414] px-3 py-2 rounded-xl border border-[#222] flex justify-between items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Block ID</span>
                        <span className="text-[10px] font-mono text-purple-400/80">{selectedNode.id}</span>
                      </div>
                    </div>

                    {selectedNode.data.type === 'solver_config' ? (
                      <div className="space-y-4">
                        {/* Segmented Solver Tab Switcher */}
                        <div className="grid grid-cols-4 gap-1 p-1 bg-[#141414] rounded-lg border border-[#222]">
                          {(['general', 'numerical', 'tolerances', 'diagnostics'] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setSolverConfigTab(tab)}
                              className={`py-1.5 px-1 text-[9px] font-bold uppercase rounded transition-all text-center ${
                                solverConfigTab === tab
                                  ? 'bg-purple-600 text-white shadow-md'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              {tab === 'tolerances' ? 'Tolerances' : tab === 'numerical' ? 'Numerical' : tab === 'diagnostics' ? 'Diagnostics' : 'General'}
                            </button>
                          ))}
                        </div>

                        {/* Tab 1: General Settings */}
                        {solverConfigTab === 'general' && (
                          <div className="space-y-3 animate-in fade-in duration-200">
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Start Time (s)</label>
                              <input
                                type="number"
                                value={(selectedNode.data as any).params?.startTime?.value ?? 0}
                                onChange={(e) => updateParameter('startTime', parseFloat(e.target.value) || 0)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-white font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Stop Time (s)</label>
                              <input
                                type="number"
                                value={(selectedNode.data as any).params?.stopTime?.value ?? 10}
                                onChange={(e) => updateParameter('stopTime', parseFloat(e.target.value) || 10)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-white font-mono"
                              />
                            </div>
                          </div>
                        )}

                        {/* Tab 2: Numerical Tab */}
                        {solverConfigTab === 'numerical' && (
                          <div className="space-y-3 animate-in fade-in duration-200">
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] text-purple-400 font-bold uppercase">Numerical Solver</label>
                                <span className="text-[8px] bg-purple-900/40 text-purple-300 border border-purple-700/50 px-1.5 py-0.5 rounded font-mono">
                                  SIMSCAPE KERNEL
                                </span>
                              </div>
                              <select
                                value={String((selectedNode.data as any).params?.solver?.value ?? 'auto')}
                                onChange={(e) => updateParameter('solver', e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-purple-500/40 rounded-lg py-2 px-3 text-xs focus:border-purple-500 outline-none text-purple-300 font-bold cursor-pointer"
                              >
                                <option value="auto">Auto (Stiffness & Constraint Analyzer)</option>
                                <option value="bdf">Variable-Step BDF (Implicit DAE)</option>
                                <option value="rk4">Runge-Kutta 4th Order (Explicit RK4)</option>
                                <option value="rk_adaptive">Adaptive Runge-Kutta (RKF45)</option>
                                <option value="euler">Forward Euler (Fixed-Step)</option>
                              </select>
                            </div>

                            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] space-y-2">
                              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Solver Capabilities</span>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400">DAE Index-1 Handling:</span>
                                <span className="text-emerald-400 font-bold">Supported (Newton-BDF)</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400">Linear Solver Backend:</span>
                                <span className="text-blue-400 font-mono text-[9px]">Dense LU (Partial Pivoting)</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400">Zero-Crossing Detection:</span>
                                <span className="text-amber-400 font-bold">Enabled</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tab 3: Tolerances & Steps */}
                        {solverConfigTab === 'tolerances' && (
                          <div className="space-y-3 animate-in fade-in duration-200">
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Initial Step (s)</label>
                              <input
                                type="number"
                                step="any"
                                value={(selectedNode.data as any).params?.initialStep?.value ?? 0.001}
                                onChange={(e) => updateParameter('initialStep', parseFloat(e.target.value) || 0.001)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-white font-mono"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Min Step (s)</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={(selectedNode.data as any).params?.minimumStep?.value ?? 1e-6}
                                  onChange={(e) => updateParameter('minimumStep', parseFloat(e.target.value) || 1e-6)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1 px-2 text-xs focus:border-purple-500 outline-none text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Max Step (s)</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={(selectedNode.data as any).params?.maximumStep?.value ?? 0.05}
                                  onChange={(e) => updateParameter('maximumStep', parseFloat(e.target.value) || 0.05)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1 px-2 text-xs focus:border-purple-500 outline-none text-white font-mono"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Relative Tol</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={(selectedNode.data as any).params?.relativeTolerance?.value ?? 1e-3}
                                  onChange={(e) => updateParameter('relativeTolerance', parseFloat(e.target.value) || 1e-3)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1 px-2 text-xs focus:border-purple-500 outline-none text-purple-300 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Absolute Tol</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={(selectedNode.data as any).params?.absoluteTolerance?.value ?? 1e-6}
                                  onChange={(e) => updateParameter('absoluteTolerance', parseFloat(e.target.value) || 1e-6)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1 px-2 text-xs focus:border-purple-500 outline-none text-purple-300 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tab 4: Diagnostics & Nonlinear */}
                        {solverConfigTab === 'diagnostics' && (
                          <div className="space-y-3 animate-in fade-in duration-200">
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Nonlinear Residual Tol</label>
                              <input
                                type="number"
                                step="any"
                                value={(selectedNode.data as any).params?.nonlinearTolerance?.value ?? 1e-8}
                                onChange={(e) => updateParameter('nonlinearTolerance', parseFloat(e.target.value) || 1e-8)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-emerald-400 font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Max Newton Iterations</label>
                              <input
                                type="number"
                                value={(selectedNode.data as any).params?.maximumIterations?.value ?? 50}
                                onChange={(e) => updateParameter('maximumIterations', parseInt(e.target.value) || 50)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-white font-mono"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Diagnostics</label>
                                <select
                                  value={String((selectedNode.data as any).params?.enableDiagnostics?.value ?? 'on')}
                                  onChange={(e) => updateParameter('enableDiagnostics', e.target.value)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-2 text-xs focus:border-purple-500 outline-none text-emerald-400 font-bold cursor-pointer"
                                >
                                  <option value="on">Enabled</option>
                                  <option value="off">Disabled</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 font-bold uppercase block mb-1">Log Stats</label>
                                <select
                                  value={String((selectedNode.data as any).params?.enableLogging?.value ?? 'on')}
                                  onChange={(e) => updateParameter('enableLogging', e.target.value)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-2 text-xs focus:border-purple-500 outline-none text-purple-400 font-bold cursor-pointer"
                                >
                                  <option value="on">Enabled</option>
                                  <option value="off">Disabled</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedNode.data.type === 'hydraulic_reference_il' || selectedNode.data.type === 'reservoir_il' ? (
                      (() => {
                        const params = (selectedNode.data as any).params || {};
                        const pRef = Number(params.referencePressure?.value ?? params.referencePressure ?? 101325);
                        const pRefUnit = (params.referencePressure?.unit || 'Pa') as PressureUnit;
                        const pType = String(params.pressureType?.value ?? params.pressureType ?? 'absolute').toLowerCase();
                        const pAtm = Number(params.atmosphericPressure?.value ?? params.atmosphericPressure ?? 101325);
                        const pAtmUnit = (params.atmosphericPressure?.unit || 'Pa') as PressureUnit;
                        const elevCorr = String(params.elevationCorrection?.value ?? params.elevationCorrection) === 'true';
                        const zRef = Number(params.referenceElevation?.value ?? params.referenceElevation ?? 0);
                        const zRefUnit = (params.referenceElevation?.unit || 'm') as ElevationUnit;
                        const initPriority = String(params.initializationPriority?.value ?? params.initializationPriority ?? 'high');

                        const pAbsPa = computeAbsoluteReferencePressure(pRef, pRefUnit, pType as any, pAtm, pAtmUnit);
                        const pAbsDisplay = convertPressureFromSI(pAbsPa, pRefUnit);

                        return (
                          <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Pressure Settings Section */}
                            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] space-y-3">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                                Pressure Settings
                              </span>

                              {/* Reference Pressure & Unit */}
                              <div>
                                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
                                  Reference Pressure
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    step="any"
                                    value={pRef}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      updateParameter('referencePressure', { value: val, unit: pRefUnit, label: 'Reference Pressure' } as any);
                                    }}
                                    className="flex-1 bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-blue-500 outline-none text-white font-mono"
                                  />
                                  <select
                                    value={pRefUnit}
                                    onChange={(e) => {
                                      updateParameter('referencePressure', { value: pRef, unit: e.target.value, label: 'Reference Pressure' } as any);
                                    }}
                                    className="bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-2 text-xs focus:border-blue-500 outline-none text-blue-400 font-bold cursor-pointer"
                                  >
                                    <option value="Pa">Pa</option>
                                    <option value="kPa">kPa</option>
                                    <option value="MPa">MPa</option>
                                    <option value="bar">bar</option>
                                    <option value="psi">psi</option>
                                    <option value="atm">atm</option>
                                  </select>
                                </div>
                              </div>

                              {/* Pressure Type Selector (Absolute vs Gauge) */}
                              <div>
                                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
                                  Pressure Type
                                </label>
                                <div className="grid grid-cols-2 gap-1 p-1 bg-[#1a1a1a] rounded-lg border border-[#222]">
                                  {(['absolute', 'gauge'] as const).map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => updateParameter('pressureType', { value: t, unit: '', label: 'Pressure Type' } as any)}
                                      className={`py-1 text-[10px] font-bold uppercase rounded transition-all text-center ${
                                        pType === t
                                          ? 'bg-blue-600 text-white shadow-sm'
                                          : 'text-gray-400 hover:text-gray-200'
                                      }`}
                                    >
                                      {t === 'absolute' ? 'Absolute' : 'Gauge'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Atmospheric Pressure */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[10px] text-gray-400 font-bold uppercase">
                                    Atmospheric Pressure
                                  </label>
                                  {pType === 'gauge' && (
                                    <span className="text-[8px] bg-blue-900/40 text-blue-300 border border-blue-700/50 px-1 py-0.2 rounded font-mono">
                                      GAUGE DATUM
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    step="any"
                                    value={pAtm}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      updateParameter('atmosphericPressure', { value: val, unit: pAtmUnit, label: 'Atmospheric Pressure' } as any);
                                    }}
                                    className="flex-1 bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-blue-500 outline-none text-white font-mono"
                                  />
                                  <select
                                    value={pAtmUnit}
                                    onChange={(e) => {
                                      updateParameter('atmosphericPressure', { value: pAtm, unit: e.target.value, label: 'Atmospheric Pressure' } as any);
                                    }}
                                    className="bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-2 text-xs focus:border-blue-500 outline-none text-blue-400 font-bold cursor-pointer"
                                  >
                                    <option value="Pa">Pa</option>
                                    <option value="kPa">kPa</option>
                                    <option value="MPa">MPa</option>
                                    <option value="bar">bar</option>
                                    <option value="psi">psi</option>
                                    <option value="atm">atm</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Elevation Settings Section */}
                            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                  Elevation Settings
                                </span>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={elevCorr}
                                    onChange={(e) => {
                                      updateParameter('elevationCorrection', { value: e.target.checked ? 'true' : 'false', unit: '', label: 'Enable Elevation Correction' } as any);
                                    }}
                                    className="rounded border-[#222] text-blue-500 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="text-[9px] text-gray-300 font-medium">Enable</span>
                                </label>
                              </div>

                              {elevCorr && (
                                <div className="space-y-2 animate-in fade-in duration-150">
                                  <label className="text-[10px] text-gray-400 font-bold uppercase block">
                                    Reference Elevation (z_ref)
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      step="any"
                                      value={zRef}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        updateParameter('referenceElevation', { value: val, unit: zRefUnit, label: 'Reference Elevation' } as any);
                                      }}
                                      className="flex-1 bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-blue-500 outline-none text-white font-mono"
                                    />
                                    <select
                                      value={zRefUnit}
                                      onChange={(e) => {
                                        updateParameter('referenceElevation', { value: zRef, unit: e.target.value, label: 'Reference Elevation' } as any);
                                      }}
                                      className="bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-2 text-xs focus:border-blue-500 outline-none text-blue-400 font-bold cursor-pointer"
                                    >
                                      <option value="m">m</option>
                                      <option value="cm">cm</option>
                                      <option value="mm">mm</option>
                                      <option value="km">km</option>
                                      <option value="ft">ft</option>
                                      <option value="in">in</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Initialization & Calculated Absolute Pressure Section */}
                            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] space-y-3">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                                Initialization
                              </span>

                              <div>
                                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
                                  Initialization Priority
                                </label>
                                <select
                                  value={initPriority}
                                  onChange={(e) => updateParameter('initializationPriority', { value: e.target.value, unit: '', label: 'Initialization Priority' } as any)}
                                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-blue-500 outline-none text-blue-300 font-bold cursor-pointer"
                                >
                                  <option value="high">High</option>
                                  <option value="low">Low</option>
                                  <option value="none">None</option>
                                </select>
                              </div>

                              {/* Calculated Absolute Reference Pressure Preview */}
                              <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40">
                                <div className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">
                                  Calculated Absolute Reference Pressure
                                </div>
                                <div className="text-sm font-mono font-bold text-blue-200 mt-0.5">
                                  {pAbsDisplay.toLocaleString(undefined, { maximumFractionDigits: 4 })} {pRefUnit}
                                </div>
                                {pRefUnit !== 'Pa' && (
                                  <div className="text-[9px] font-mono text-blue-400/70 mt-0.5">
                                    SI: {pAbsPa.toLocaleString()} Pa
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-3">
                        {Object.entries((selectedNode.data as any).params || {}).map(([key, param]: [string, any]) => (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] text-gray-400 font-bold uppercase">{param.label || key}</label>
                              <span className="text-[10px] text-gray-600">{param.unit || ''}</span>
                            </div>
                            {['limit_data_points', 'show_grid', 'show_legend'].includes(key) ? (
                              <select
                                value={String(param.value ?? 'on')}
                                onChange={(e) => updateParameter(key, e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-[#a855f7] font-bold cursor-pointer"
                              >
                                <option value="on">On (Yes)</option>
                                <option value="off">Off (No)</option>
                              </select>
                            ) : key === 'time_range' ? (
                              <select
                                value={String(param.value ?? '10')}
                                onChange={(e) => {
                                  const val = e.target.value === 'auto' ? 'auto' : parseFloat(e.target.value);
                                  updateParameter(key, val);
                                }}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-purple-400 font-mono font-bold cursor-pointer"
                              >
                                <option value="auto">Auto (Full)</option>
                                <option value="1">1s</option>
                                <option value="2">2s</option>
                                <option value="5">5s</option>
                                <option value="10">10s</option>
                                <option value="30">30s</option>
                                <option value="60">60s</option>
                                <option value="300">300s</option>
                              </select>
                            ) : key === 'numSignals' || key === 'numPorts' ? (
                              <select
                                value={String(param.value ?? 1)}
                                onChange={(e) => updateParameter(key, parseInt(e.target.value))}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-purple-400 font-bold cursor-pointer"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                  <option key={n} value={n}>{n} Channels</option>
                                ))}
                              </select>
                            ) : key === 'data_type' ? (
                              <select
                                value={String(param.value ?? 'auto')}
                                onChange={(e) => updateParameter(key, e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none text-purple-400 font-bold cursor-pointer"
                              >
                                <option value="auto">Auto (Loose)</option>
                                <option value="electrical">Electrical</option>
                                <option value="thermal">Thermal</option>
                                <option value="rotational">Rotational</option>
                                <option value="mechanical">Mechanical</option>
                                <option value="physical">Physical Signal</option>
                              </select>
                            ) : (
                              (() => {
                                const isPositivePhysical = ['C', 'heat_capacity', 'mass', 'm', 'R', 'resistance', 'k', 'conductivity', 'L', 'inductance', 'b', 'damping', 'J', 'inertia'].includes(key);
                                return (
                                  <input
                                    type={typeof (param.value ?? 0) === 'number' ? "number" : "text"}
                                    min={isPositivePhysical ? 0 : undefined}
                                    value={param.value ?? ''}
                                    onChange={(e) => {
                                      let val = typeof (param.value ?? 0) === 'number' ? parseFloat(e.target.value) : e.target.value;
                                      if (isPositivePhysical && typeof val === 'number' && !isNaN(val) && val < 0) {
                                        val = 0;
                                      }
                                      updateParameter(key, val);
                                    }}
                                    className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none"
                                  />
                                );
                              })()
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Interface & Ports Section */}
                <div className="p-4 border-b border-[#222]">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={16} className="text-emerald-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Interface & Ports</h3>
                  </div>
                  
                  <div className="space-y-2">
                    {(selectedNode.data as any).ports?.map((port: any) => (
                      <div key={port.id} className="bg-[#141414] p-2 rounded-lg border border-[#222] flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            port.pos === 'left' ? 'bg-blue-500' :
                            port.pos === 'right' ? 'bg-emerald-500' :
                            port.pos === 'top' ? 'bg-amber-500' : 'bg-purple-500'
                          }`} />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-mono text-emerald-500/70">[{port.id}]</span>
                              {selectedNode.data.type === 'subsystem' || selectedNode.data.type === 'Subsystem' ? (
                                <input
                                  type="text"
                                  value={port.label || ''}
                                  onChange={(e) => {
                                    const portBlockId = port.id;
                                    const newName = e.target.value;
                                    setNodes(nds => nds.map(n => {
                                      if (n.id === portBlockId) {
                                        return {
                                          ...n,
                                          data: {
                                            ...n.data,
                                            label: newName,
                                            params: {
                                              ...n.data.params,
                                              name: { ...n.data.params.name, value: newName }
                                            }
                                          }
                                        };
                                      }
                                      return n;
                                    }));
                                  }}
                                  className="bg-[#1a1a1a] border border-[#333] text-gray-200 text-xs rounded px-1.5 py-0.5 focus:border-purple-500 outline-none w-28"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-gray-200 uppercase tracking-tight">
                                  {port.label || 'Unlabeled'}
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-500 font-mono uppercase tracking-tighter">
                                {port.domain || (selectedNode.data as any).domain || 'General'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[9px] text-emerald-500/80 font-bold uppercase">
                             {port.pos === 'left' ? 'Input' : port.pos === 'right' ? 'Output' : 'Control'}
                           </div>
                           <div className="text-[8px] text-gray-700">
                             {port.pos === 'left' ? 'Terminal A' : port.pos === 'right' ? 'Terminal B' : 'Signal Port'}
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equations Section */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={16} className="text-blue-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Governing Equations</h3>
                  </div>

                  <div>
                    {selectedBlockDef ? (
                      <div className="space-y-4">
                        <div className="bg-[#141414] p-4 rounded-xl border border-[#222] flex flex-col items-center justify-center min-h-[100px] text-center">
                          {(selectedBlockDef.latex || []).map((eq, i) => (
                            <div key={i} className="text-sm font-serif italic text-purple-300 mb-2 last:mb-0">
                              {eq}
                            </div>
                          ))}
                          {(!selectedBlockDef.latex || selectedBlockDef.latex.length === 0) && (
                            <span className="text-[10px] text-gray-600 italic">No latex available</span>
                          )}
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
                      <div className="flex flex-col items-center justify-center text-gray-600 text-center px-4 py-8">
                        <Box size={32} className="mb-2 opacity-20" />
                        <p className="text-[10px] font-medium italic">No equations defined for this block type.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center p-8">
                <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222] flex items-center justify-center mb-4">
                  <Settings2 size={32} className="opacity-20" />
                </div>
                <h3 className="text-sm font-bold text-gray-400 mb-1">Select a Block</h3>
                <p className="text-[10px] leading-relaxed">Click on a component in the canvas to view and edit its physical parameters and governing equations.</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Individual MATLAB/Simulink Scope Windows */}
      {openScopes.map(scopeId => {
        const scopeNode = nodes.find(n => n.id === scopeId);
        if (!scopeNode) return null;
        return (
          <VLabSimulinkScope
            key={scopeId}
            id={scopeId}
            title={scopeNode.data.label || 'Scope'}
            data={perScopeData[scopeId]?.length > 0 ? perScopeData[scopeId] : scopeData}
            isPaused={isPaused}
            params={scopeNode.data.params || {}}
            nodes={nodes}
            edges={edges}
            onUpdate={(newData) => {
              setNodes(nds => nds.map(n => {
                if (n.id === scopeId) {
                  const updatedParams = { ...n.data.params, ...newData };
                  const updatedData: Record<string, any> = { ...n.data, params: updatedParams };
                  if (newData.numSignals) {
                    const num = Math.max(1, Math.min(8, Number(newData.numSignals.value) || 1));
                    updatedData.ports = Array.from({ length: num }, (_, i) => ({
                      id: `in${i + 1}`,
                      pos: 'left',
                      label: `${i + 1}`,
                      domain: 'Physical'
                    }));
                    // Prune any incoming edges to channels exceeding new capacity
                    setEdges(eds => eds.filter(e => {
                      if (e.target !== scopeId) return true;
                      let t = (e.targetHandle || '').replace(/_[st]$/, '');
                      if (t.startsWith(scopeId + '-')) t = t.slice(scopeId.length + 1);
                      const ch = parseInt(t.replace(/\D/g, '')) || 1;
                      return ch <= num;
                    }));
                  }
                  return { ...n, data: updatedData };
                }
                return n;
              }));
            }}
            onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
            onClear={() => {
              setPerScopeData(prev => ({ ...prev, [scopeId]: [] }));
              setScopeData([]);
            }}
            simSpeed={simSpeed}
            onSpeedChange={setSimSpeed}
          />
        );
      })}

        {/* 3DEXPERIENCE Sync Modal */}
        {show3dxSyncModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200">
            <div className="bg-[#0c0c10] border border-[#1e2a3a] rounded-2xl w-[480px] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1a2133] pb-3">
                <div className="flex items-center gap-2">
                  <Cloud className="text-[#4da6ff]" size={18} />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {syncAction === 'push' ? 'Push Workspace to 3DX' : 'Pull Workspace from 3DX'}
                  </h3>
                </div>
                <button
                  onClick={() => setShow3dxSyncModal(false)}
                  className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {syncStatus === 'loading' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCcw size={24} className="text-[#4da6ff] animate-spin" />
                  <span className="text-xs text-gray-400">Connecting to 3DEXPERIENCE...</span>
                </div>
              ) : syncStatus === 'success' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-bold">Workspace Synced Successfully!</span>
                </div>
              ) : syncStatus === 'error' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                  <AlertCircle size={24} className="text-red-400" />
                  <span className="text-xs text-red-400 font-bold">Sync Failed</span>
                  <p className="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Please ensure you have an active internet connection and are authenticated to the 3DEXPERIENCE platform.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {syncAction === 'push' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Target Workspace</label>
                        <select
                          value={selectedTdxWorkspace}
                          onChange={(e) => setSelectedTdxWorkspace(e.target.value)}
                          className="w-full bg-[#06080c] border border-[#1e2a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                        >
                          {tdxWorkspaces.map(ws => (
                            <option key={ws.id} value={ws.id}>{ws.title}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handle3dxPush}
                        className="w-full py-2.5 bg-[#0056b3] hover:bg-[#0069d9] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Push Now
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Select Document to Import</label>
                      {tdxDocs.length === 0 ? (
                        <div className="py-4 text-center text-xs text-gray-600">No compatible VLab models found.</div>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto border border-[#1a2133] rounded-lg divide-y divide-[#1a2133] bg-[#06080c]">
                          {tdxDocs.map(doc => (
                            <div
                              key={doc.id}
                              onClick={() => handle3dxPull(doc.id)}
                              className="p-3 text-xs text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer transition-all flex items-center justify-between"
                            >
                              <span className="font-medium truncate mr-2">{doc.title}</span>
                              <span className="text-[9px] text-gray-600 font-mono flex-shrink-0">{new Date(doc.modified).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showConfirmClear && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999]" onMouseDown={() => setShowConfirmClear(false)}>
            <div className="bg-[#1a1a1a] border border-red-900 rounded-lg w-[550px] max-h-[90vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
              <div className="h-12 flex items-center px-5 border-b border-red-900/50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" className="mr-3">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h2 className="text-lg font-bold text-red-400">Clear Canvas</h2>
              </div>

              <div className="p-5 bg-red-950/25 rounded-lg border border-red-900 m-5">
                <p className="text-red-300 text-sm whitespace-pre-wrap">Are you sure you want to clear the canvas? This will permanently delete all blocks and connections in your current workspace.</p>
              </div>

              <div className="h-14 flex items-center justify-end px-5 border-t border-[#222] gap-3">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="px-5 py-2 border border-[#333] text-[#a0a0a0] hover:text-[#e0e0e0] rounded bg-transparent text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsSimulating(false);
                    setIsPaused(false);
                    isSavingRef.current = true;
                    setNodes([]);
                    setEdges([]);
                    setSelectedNodeId(null);
                    setScopeData([]);
                    setPerScopeData({});
                    setHistory([]);
                    setStatus({ message: 'System Ready', type: 'idle' });
                    setShowConfirmClear(false);
                    if (onNodesChange) onNodesChange([]);
                    if (onEdgesChange) onEdgesChange([]);
                    requestAnimationFrame(() => requestAnimationFrame(() => { isSavingRef.current = false; }));
                  }}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors cursor-pointer font-bold"
                >
                  Clear Canvas
                </button>
              </div>
            </div>
          </div>
        )}

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
        @keyframes edge-pulse {
          0% { stroke-width: 2; stroke-opacity: 0.6; }
          50% { stroke-width: 5; stroke-opacity: 1; stroke: #ff3333; }
          100% { stroke-width: 2; stroke-opacity: 0.6; }
        }
        .edge-error {
          animation: edge-pulse 0.8s infinite;
          stroke: #ff3333 !important;
          stroke-dasharray: 5;
        }
      `}</style>
    </div>
  );
};
