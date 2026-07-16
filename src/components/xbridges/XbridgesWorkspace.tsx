// src/components/xbridges/XbridgesWorkspace.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  Panel,
  BackgroundVariant,
  MiniMap,
  ConnectionLineType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Play, Pause, Square, Save, Trash2, Box, Network, MousePointer2, Settings2, ChevronDown, ChevronRight, Search, Triangle, Layers,
  Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2, Minimize2, Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw,
  Hash, TrendingUp, Monitor, Download, LogIn, LogOut, ChevronLeft, Zap, Settings, ZapOff, Cpu, Wind, Filter, Eye,
  GraduationCap, ArrowRightCircle, ArrowLeftCircle, Cloud, CheckCircle2, AlertCircle, FileText
} from 'lucide-react';
import { XBRIDGES_CATEGORIES, BLOCK_LIBRARY, getPolynomialCoefficients, trimLeadingZeros } from '../../engine/xbridges/BlockDefinitions';

// Map icon string names to Lucide icon components
const LucideIconMap: Record<string, React.ComponentType<any>> = {
  'square': Square,
  'activity': Activity,
  'plus': Plus,
  'minus': Minus,
  'x': X,
  'divide': Divide,
  'chevron-up': ChevronUp,
  'minus-circle': MinusCircle,
  'maximize': Maximize,
  'maximize2': Maximize2,
  'sigma': Sigma,
  'bar-chart': BarChart,
  'arrow-up': ArrowUp,
  'grid': Grid,
  'rotate-cw': RotateCw,
  'refresh-ccw': RefreshCcw,
  'hash': Hash,
  'trending-up': TrendingUp,
  'monitor': Monitor,
  'box': Box,
  'download': Download,
  'log-in': LogIn,
  'log-out': LogOut,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'zap': Zap,
  'settings': Settings,
  'zap-off': ZapOff,
  'cpu': Cpu,
  'layers': Layers,
  'wind': Wind,
  'filter': Filter,
  'eye': Eye,
  'graduation-cap': GraduationCap,
  'arrow-right-circle': ArrowRightCircle,
  'arrow-left-circle': ArrowLeftCircle,
  'network': Network,
  'integral': TrendingUp,
  'file-text': FileText,
};

const renderLibraryIcon = (iconName: string, size = 14, className?: string) => {
  const IconComp = LucideIconMap[iconName] || Box;
  return <IconComp size={size} className={className} />;
};

import { XbridgesEngine } from '../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../engine/xbridges/Solvers';
import { AdaptiveSolver } from '../../engine/xbridges/AdaptiveSolver';
import { ModelDiagnostic } from '../../engine/xbridges/types';
import { XBlockNode, getColor } from './XBlockNode';
import { XbridgesPropertiesPanel } from './XbridgesPropertiesPanel';
import { XbridgesScopeWindow } from './XbridgesScopeWindow';
import { XbridgesRootLocusWindow } from './XbridgesRootLocusWindow';
import { PremiumEdge } from './PremiumEdge';
import { PremiumConnectionLine } from './PremiumConnectionLine';
import { WorkspaceContext } from './context';

const nodeTypes = { xblock: XBlockNode };
const edgeTypes = {
  default: PremiumEdge,
  straight: PremiumEdge,
  smoothstep: PremiumEdge
};

const normalizeNumerals = (val: string) => {
  if (!val) return "";
  return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
    .replace(/[٫،,]/g, '.');
};

const XBRIDGES_LEARNING_LABS = [
  {
    id: 'lms_sys_id',
    name: 'LMS System Identification Lab',
    category: 'Adaptive Filtering',
    difficulty: 'Intermediate',
    description: 'Learn how to use the LMS Adaptive Filter to identify the coefficients of an unknown 2-tap signal path. Observe how w1 and w2 converge to 0.8 and 0.4.',
    nodes: [
      { id: 'input_signal', type: 'WaveformGen', position: { x: 50, y: 150 }, label: 'Input Signal', params: { type: 'Sine', amp: 1, freq: 1, offset: 0, phase: 0 } },
      { id: 'true_gain_1', type: 'GAIN', position: { x: 250, y: 50 }, label: 'True Weight w1 (0.8)', params: { gain: 0.8 } },
      { id: 'delay_1', type: 'DELAY', position: { x: 250, y: 250 }, label: 'Unit Delay', params: { delay_length: 1, initial_condition: 0 } },
      { id: 'true_gain_2', type: 'GAIN', position: { x: 400, y: 250 }, label: 'True Weight w2 (0.4)', params: { gain: 0.4 } },
      { id: 'sum_target', type: 'VectorAdd', position: { x: 550, y: 120 }, label: 'Sum (Desired d)' },
      { id: 'lms_filter', type: 'LMS_ADAPTIVE_FILTER', position: { x: 700, y: 220 }, label: 'LMS Learner', params: { lr: 0.05 } },
      { id: 'scope_error', type: 'Scope', position: { x: 920, y: 80 }, label: 'Error Scope', params: { numSignals: 3, bufferSize: 1000 } },
      { id: 'scope_weights', type: 'Scope', position: { x: 920, y: 280 }, label: 'Weights Scope', params: { numSignals: 2, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'e1', source: 'input_signal', sourceHandle: 'out', target: 'true_gain_1', targetHandle: 'u' },
      { id: 'e2', source: 'input_signal', sourceHandle: 'out', target: 'delay_1', targetHandle: 'u' },
      { id: 'e3', source: 'input_signal', sourceHandle: 'out', target: 'lms_filter', targetHandle: 'x' },
      { id: 'e4', source: 'delay_1', sourceHandle: 'y', target: 'true_gain_2', targetHandle: 'u' },
      { id: 'e5', source: 'true_gain_1', sourceHandle: 'y', target: 'sum_target', targetHandle: 'in1' },
      { id: 'e6', source: 'true_gain_2', sourceHandle: 'y', target: 'sum_target', targetHandle: 'in2' },
      { id: 'e7', source: 'sum_target', sourceHandle: 'out', target: 'lms_filter', targetHandle: 'd' },
      { id: 'e8', source: 'sum_target', sourceHandle: 'out', target: 'scope_error', targetHandle: 'in1' },
      { id: 'e9', source: 'lms_filter', sourceHandle: 'y', target: 'scope_error', targetHandle: 'in2' },
      { id: 'e10', source: 'lms_filter', sourceHandle: 'err', target: 'scope_error', targetHandle: 'in3' },
      { id: 'e11', source: 'lms_filter', sourceHandle: 'w1', target: 'scope_weights', targetHandle: 'in1' },
      { id: 'e12', source: 'lms_filter', sourceHandle: 'w2', target: 'scope_weights', targetHandle: 'in2' }
    ]
  },
  {
    id: 'neural_approx',
    name: 'Neural Function Approximation Lab',
    category: 'Neural Networks',
    difficulty: 'Advanced',
    description: 'Learn how a single neuron online gradient descent block approximates a target relationship. Run the engine to see the output error converge to zero.',
    nodes: [
      { id: 'input_1', type: 'WaveformGen', position: { x: 50, y: 50 }, label: 'Input x1 (Sine)', params: { type: 'Sine', amp: 1, freq: 0.5, offset: 0, phase: 0 } },
      { id: 'input_2', type: 'WaveformGen', position: { x: 50, y: 200 }, label: 'Input x2 (Square)', params: { type: 'Square', amp: 1, freq: 0.2, offset: 0, phase: 0 } },
      { id: 'target_neuron', type: 'NEURAL_NEURON_LEARNING', position: { x: 300, y: 80 }, label: 'Target System (Fixed)', params: { lr: 0, initW1: 0.7, initW2: -0.5, initBias: 0.2 } },
      { id: 'learning_neuron', type: 'NEURAL_NEURON_LEARNING', position: { x: 300, y: 260 }, label: 'Online Learner', params: { lr: 0.1, initW1: 0.1, initW2: -0.1, initBias: 0.0 } },
      { id: 'scope_compare', type: 'Scope', position: { x: 580, y: 50 }, label: 'Response Comparison', params: { numSignals: 2, bufferSize: 1000 } },
      { id: 'scope_weights', type: 'Scope', position: { x: 580, y: 220 }, label: 'Learned Weights', params: { numSignals: 3, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'ne1', source: 'input_1', sourceHandle: 'out', target: 'target_neuron', targetHandle: 'x1' },
      { id: 'ne2', source: 'input_1', sourceHandle: 'out', target: 'learning_neuron', targetHandle: 'x1' },
      { id: 'ne3', source: 'input_2', sourceHandle: 'out', target: 'target_neuron', targetHandle: 'x2' },
      { id: 'ne4', source: 'input_2', sourceHandle: 'out', target: 'learning_neuron', targetHandle: 'x2' },
      { id: 'ne5', source: 'target_neuron', sourceHandle: 'y', target: 'learning_neuron', targetHandle: 'target' },
      { id: 'ne6', source: 'target_neuron', sourceHandle: 'y', target: 'scope_compare', targetHandle: 'in1' },
      { id: 'ne7', source: 'learning_neuron', sourceHandle: 'y', target: 'scope_compare', targetHandle: 'in2' },
      { id: 'ne8', source: 'learning_neuron', sourceHandle: 'w1', target: 'scope_weights', targetHandle: 'in1' },
      { id: 'ne9', source: 'learning_neuron', sourceHandle: 'w2', target: 'scope_weights', targetHandle: 'in2' },
      { id: 'ne10', source: 'learning_neuron', sourceHandle: 'bias', target: 'scope_weights', targetHandle: 'in3' }
    ]
  },
  {
    id: 'rl_control',
    name: 'Reinforcement Learning Control Lab',
    category: 'Reinforcement Learning',
    difficulty: 'Expert',
    description: 'Learn how Q-learning regulates an integrator plant (environment) to a reference value. The agent receives rewards for minimizing error.',
    nodes: [
      { id: 'ref_val', type: 'Constant', position: { x: 50, y: 80 }, label: 'Reference Setpoint', params: { value: 1.0 } },
      { id: 'sub_error', type: 'VectorSub', position: { x: 200, y: 120 }, label: 'Error Calculator' },
      { id: 'rl_agent', type: 'RL_Q_LEARNING_CONTROLLER', position: { x: 350, y: 220 }, label: 'Q-Learning Agent', params: { alpha: 0.1, gamma: 0.9, epsilon: 0.1 } },
      { id: 'plant', type: 'Integrator', position: { x: 580, y: 220 }, label: 'Integrator Plant (Env)', params: { initialCondition: 0 } },
      { id: 'error_abs', type: 'Abs', position: { x: 350, y: 40 }, label: 'Absolute Error' },
      { id: 'error_neg', type: 'UnaryNeg', position: { x: 500, y: 40 }, label: 'Negate (Reward)' },
      { id: 'scope_rl', type: 'Scope', position: { x: 760, y: 100 }, label: 'RL System Monitor', params: { numSignals: 3, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'rle1', source: 'ref_val', sourceHandle: 'out', target: 'sub_error', targetHandle: 'in1' },
      { id: 'rle2', source: 'plant', sourceHandle: 'out', target: 'sub_error', targetHandle: 'in2' },
      { id: 'rle3', source: 'sub_error', sourceHandle: 'out', target: 'rl_agent', targetHandle: 'error' },
      { id: 'rle4', source: 'sub_error', sourceHandle: 'out', target: 'error_abs', targetHandle: 'in' },
      { id: 'rle5', source: 'sub_error', sourceHandle: 'out', target: 'scope_rl', targetHandle: 'in1' },
      { id: 'rle6', source: 'error_abs', sourceHandle: 'out', target: 'error_neg', targetHandle: 'in' },
      { id: 'rle7', source: 'error_neg', sourceHandle: 'out', target: 'rl_agent', targetHandle: 'reward' },
      { id: 'rle8', source: 'rl_agent', sourceHandle: 'action', target: 'plant', targetHandle: 'in' },
      { id: 'rle9', source: 'rl_agent', sourceHandle: 'action', target: 'scope_rl', targetHandle: 'in2' },
      { id: 'rle10', source: 'plant', sourceHandle: 'out', target: 'scope_rl', targetHandle: 'in3' }
    ]
  },
  {
    id: 'pid_control_sim',
    name: 'Simulink-Style PID Control Lab',
    category: 'Classical Control',
    difficulty: 'Intermediate',
    description: 'Learn how classical PID controllers regulate dynamic systems. A basic PID controller receives tracking error and drives an Integrator plant to follow a square wave setpoint. Observe reference tracking and control effort in the scopes.',
    nodes: [
      { id: 'ref_signal', type: 'WaveformGen', position: { x: 50, y: 150 }, label: 'Setpoint Reference', params: { type: 'Square', amp: 1, freq: 0.1, offset: 1, phase: 0 } },
      { id: 'error_sub', type: 'VectorSub', position: { x: 250, y: 150 }, label: 'Error Calculator' },
      { id: 'pid_controller', type: 'PID_BASIC', position: { x: 420, y: 150 }, label: 'PID Controller', params: { Kp: 2.5, Ki: 1.5, Kd: 0.1, max: 10, min: -10 } },
      { id: 'plant', type: 'Integrator', position: { x: 620, y: 150 }, label: 'Integrator Plant (Env)', params: { initialCondition: 0 } },
      { id: 'scope_tracking', type: 'Scope', position: { x: 820, y: 120 }, label: 'Closed-Loop Scope', params: { numSignals: 3, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'pe1', source: 'ref_signal', sourceHandle: 'out', target: 'error_sub', targetHandle: 'in1' },
      { id: 'pe2', source: 'plant', sourceHandle: 'out', target: 'error_sub', targetHandle: 'in2' },
      { id: 'pe3', source: 'error_sub', sourceHandle: 'out', target: 'pid_controller', targetHandle: 'e' },
      { id: 'pe4', source: 'pid_controller', sourceHandle: 'u', target: 'plant', targetHandle: 'in' },
      { id: 'pe5', source: 'ref_signal', sourceHandle: 'out', target: 'scope_tracking', targetHandle: 'in1' },
      { id: 'pe6', source: 'plant', sourceHandle: 'out', target: 'scope_tracking', targetHandle: 'in2' },
      { id: 'pe7', source: 'pid_controller', sourceHandle: 'u', target: 'scope_tracking', targetHandle: 'in3' }
    ]
  },
  {
    id: 'robot_vacuum_twin',
    name: 'Robot Vacuum Digital Twin Lab',
    category: 'Digital Twins',
    difficulty: 'Advanced',
    description: 'Build and simulate a complete differential-drive LiDAR robot vacuum using modular blocks. Observe robot pose estimation, SLAM mapping, sensor fusion, obstacle avoidance, and goal navigation.',
    nodes: [
      { id: 'target_x', type: 'Constant', position: { x: 50, y: 50 }, label: 'Target X (m)', params: { value: 1.5 } },
      { id: 'target_y', type: 'Constant', position: { x: 50, y: 170 }, label: 'Target Y (m)', params: { value: 1.5 } },
      { id: 'mode_select', type: 'Constant', position: { x: 50, y: 290 }, label: 'Cleaning Mode', params: { value: 4 } },
      { id: 'robot_nav', type: 'ROBOT_VACUUM_NAV', position: { x: 280, y: 100 }, label: 'Navigation Planner', params: {} },
      { id: 'robot_comm', type: 'ROBOT_VACUUM_COMM', position: { x: 520, y: 280 }, label: 'Communication Link', params: { latency_ms: 50.0, packet_loss_rate: 0.05, protocol: 'CAN' } },
      { id: 'robot_kinematics', type: 'ROBOT_VACUUM_KINEMATICS', position: { x: 620, y: 100 }, label: 'Inverse Kinematics', params: { wheel_radius: 0.033, wheel_separation: 0.16 } },
      { id: 'robot_pid', type: 'ROBOT_VACUUM_WHEEL_CONTROL', position: { x: 850, y: 100 }, label: 'Wheel Speed PI', params: { Kp_wheel: 12.0, Ki_wheel: 45.0, V_bat: 12.0 } },
      { id: 'motor_left', type: 'ROBOT_VACUUM_MOTOR', position: { x: 1080, y: 50 }, label: 'Left Motor', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
      { id: 'motor_right', type: 'ROBOT_VACUUM_MOTOR', position: { x: 1080, y: 200 }, label: 'Right Motor', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
      { id: 'robot_battery', type: 'ROBOT_VACUUM_BATTERY', position: { x: 1080, y: 350 }, label: 'Battery System', params: { nominal_voltage: 12.0, capacity_Ah: 2.6, static_draw_A: 0.1, charge_rate: 5.0 } },
      { id: 'robot_dynamics', type: 'ROBOT_VACUUM_DYNAMICS', position: { x: 1300, y: 80 }, label: 'Robot Dynamics (Plant)', params: { wheel_radius: 0.033, wheel_separation: 0.16 } },
      { id: 'robot_env', type: 'ROBOT_VACUUM_ENVIRONMENT', position: { x: 1520, y: 80 }, label: 'Simulation Environment (Canvas)', params: { lidar_max_range: 4.0, lidar_noise_std: 0.02 } },
      { id: 'robot_odom', type: 'ROBOT_VACUUM_ODOMETRY', position: { x: 1300, y: 350 }, label: 'Odometry', params: { wheel_radius: 0.033, wheel_separation: 0.16, encoder_cpr: 360 } },
      { id: 'robot_fusion', type: 'ROBOT_VACUUM_FUSION', position: { x: 1780, y: 220 }, label: 'Sensor Fusion', params: { filter_gain: 0.06 } },
      { id: 'robot_slam', type: 'ROBOT_VACUUM_SLAM', position: { x: 1780, y: 420 }, label: 'SLAM Map', params: { lidar_max_range: 4.0 } },
      { id: 'scope_pose', type: 'Scope', position: { x: 2040, y: 100 }, label: 'Pose Monitor', params: { numSignals: 3, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'e_nav_tx', source: 'target_x', sourceHandle: 'out', target: 'robot_nav', targetHandle: 'target_x_in' },
      { id: 'e_nav_ty', source: 'target_y', sourceHandle: 'out', target: 'robot_nav', targetHandle: 'target_y_in' },
      { id: 'e_nav_mode', source: 'mode_select', sourceHandle: 'out', target: 'robot_nav', targetHandle: 'mode_select' },
      
      { id: 'e_comm_vref_in', source: 'robot_nav', sourceHandle: 'v_ref', target: 'robot_comm', targetHandle: 'v_ref_in' },
      { id: 'e_comm_wref_in', source: 'robot_nav', sourceHandle: 'w_ref', target: 'robot_comm', targetHandle: 'w_ref_in' },
      { id: 'e_comm_navst_in', source: 'robot_nav', sourceHandle: 'nav_state', target: 'robot_comm', targetHandle: 'nav_state_in' },
      
      { id: 'e_kin_v', source: 'robot_comm', sourceHandle: 'v_ref', target: 'robot_kinematics', targetHandle: 'v_ref' },
      { id: 'e_kin_w', source: 'robot_comm', sourceHandle: 'w_ref', target: 'robot_kinematics', targetHandle: 'w_ref' },
      
      { id: 'e_pid_refL', source: 'robot_kinematics', sourceHandle: 'omegaL_ref', target: 'robot_pid', targetHandle: 'omegaL_ref' },
      { id: 'e_pid_refR', source: 'robot_kinematics', sourceHandle: 'omegaR_ref', target: 'robot_pid', targetHandle: 'omegaR_ref' },
      { id: 'e_mot_vl', source: 'robot_pid', sourceHandle: 'V_L', target: 'motor_left', targetHandle: 'pwm_duty' },
      { id: 'e_mot_vr', source: 'robot_pid', sourceHandle: 'V_R', target: 'motor_right', targetHandle: 'pwm_duty' },
      { id: 'e_pid_fbl', source: 'motor_left', sourceHandle: 'omega', target: 'robot_pid', targetHandle: 'omega_L' },
      { id: 'e_pid_fbr', source: 'motor_right', sourceHandle: 'omega', target: 'robot_pid', targetHandle: 'omega_R' },
      { id: 'e_dyn_wl', source: 'motor_left', sourceHandle: 'omega', target: 'robot_dynamics', targetHandle: 'omega_L' },
      { id: 'e_dyn_wr', source: 'motor_right', sourceHandle: 'omega', target: 'robot_dynamics', targetHandle: 'omega_R' },
      
      { id: 'e_bat_il', source: 'motor_left', sourceHandle: 'current', target: 'robot_battery', targetHandle: 'I_L' },
      { id: 'e_bat_ir', source: 'motor_right', sourceHandle: 'current', target: 'robot_battery', targetHandle: 'I_R' },
      { id: 'e_bat_dock', source: 'robot_env', sourceHandle: 'is_docked', target: 'robot_battery', targetHandle: 'is_docked' },
      { id: 'e_mot_vbat_l', source: 'robot_battery', sourceHandle: 'battery_voltage', target: 'motor_left', targetHandle: 'v_bat' },
      { id: 'e_mot_vbat_r', source: 'robot_battery', sourceHandle: 'battery_voltage', target: 'motor_right', targetHandle: 'v_bat' },
      
      { id: 'e_comm_encl_in', source: 'motor_left', sourceHandle: 'encoder', target: 'robot_comm', targetHandle: 'enc_L_in' },
      { id: 'e_comm_encr_in', source: 'motor_right', sourceHandle: 'encoder', target: 'robot_comm', targetHandle: 'enc_R_in' },
      { id: 'e_comm_omgl_in', source: 'motor_left', sourceHandle: 'omega', target: 'robot_comm', targetHandle: 'omega_L_in' },
      { id: 'e_comm_omgr_in', source: 'motor_right', sourceHandle: 'omega', target: 'robot_comm', targetHandle: 'omega_R_in' },
      { id: 'e_comm_bat_in', source: 'robot_battery', sourceHandle: 'battery_level', target: 'robot_comm', targetHandle: 'battery_in' },
      
      { id: 'e_odom_l', source: 'robot_comm', sourceHandle: 'enc_L', target: 'robot_odom', targetHandle: 'enc_L' },
      { id: 'e_odom_r', source: 'robot_comm', sourceHandle: 'enc_R', target: 'robot_odom', targetHandle: 'enc_R' },
      
      { id: 'e_comm_xod_in', source: 'robot_odom', sourceHandle: 'x_odom', target: 'robot_comm', targetHandle: 'x_odom_in' },
      { id: 'e_comm_yod_in', source: 'robot_odom', sourceHandle: 'y_odom', target: 'robot_comm', targetHandle: 'y_odom_in' },
      { id: 'e_comm_tod_in', source: 'robot_odom', sourceHandle: 'theta_odom', target: 'robot_comm', targetHandle: 'theta_odom_in' },
      
      { id: 'e_fus_xod', source: 'robot_comm', sourceHandle: 'x_odom', target: 'robot_fusion', targetHandle: 'x_odom' },
      { id: 'e_fus_yod', source: 'robot_comm', sourceHandle: 'y_odom', target: 'robot_fusion', targetHandle: 'y_odom' },
      { id: 'e_fus_tod', source: 'robot_comm', sourceHandle: 'theta_odom', target: 'robot_fusion', targetHandle: 'theta_odom' },
      { id: 'e_fus_xtr', source: 'robot_dynamics', sourceHandle: 'x', target: 'robot_fusion', targetHandle: 'x_true' },
      { id: 'e_fus_ytr', source: 'robot_dynamics', sourceHandle: 'y', target: 'robot_fusion', targetHandle: 'y_true' },
      { id: 'e_fus_ttr', source: 'robot_dynamics', sourceHandle: 'theta', target: 'robot_fusion', targetHandle: 'theta_true' },
      { id: 'e_fus_yaw_imu', source: 'robot_dynamics', sourceHandle: 'w_chassis', target: 'robot_fusion', targetHandle: 'yaw_rate_imu' },
      
      { id: 'e_slm_x', source: 'robot_fusion', sourceHandle: 'x_est', target: 'robot_slam', targetHandle: 'x_est' },
      { id: 'e_slm_y', source: 'robot_fusion', sourceHandle: 'y_est', target: 'robot_slam', targetHandle: 'y_est' },
      { id: 'e_slm_t', source: 'robot_fusion', sourceHandle: 'theta_est', target: 'robot_slam', targetHandle: 'theta_est' },
      { id: 'e_slm_lid', source: 'robot_env', sourceHandle: 'lidar_ranges', target: 'robot_slam', targetHandle: 'lidar_ranges' },
      { id: 'e_nav_xest', source: 'robot_fusion', sourceHandle: 'x_est', target: 'robot_nav', targetHandle: 'x_est' },
      { id: 'e_nav_yest', source: 'robot_fusion', sourceHandle: 'y_est', target: 'robot_nav', targetHandle: 'y_est' },
      { id: 'e_nav_test', source: 'robot_fusion', sourceHandle: 'theta_est', target: 'robot_nav', targetHandle: 'theta_est' },
      { id: 'e_nav_lid', source: 'robot_env', sourceHandle: 'lidar_ranges', target: 'robot_nav', targetHandle: 'lidar_ranges' },
      { id: 'e_nav_bat', source: 'robot_comm', sourceHandle: 'battery', target: 'robot_nav', targetHandle: 'battery_level' },
      { id: 'e_nav_dock', source: 'robot_env', sourceHandle: 'is_docked', target: 'robot_nav', targetHandle: 'is_docked' },
      
      { id: 'e_env_x', source: 'robot_dynamics', sourceHandle: 'x', target: 'robot_env', targetHandle: 'x' },
      { id: 'e_env_y', source: 'robot_dynamics', sourceHandle: 'y', target: 'robot_env', targetHandle: 'y' },
      { id: 'e_env_theta', source: 'robot_dynamics', sourceHandle: 'theta', target: 'robot_env', targetHandle: 'theta' },
      { id: 'e_env_xest', source: 'robot_fusion', sourceHandle: 'x_est', target: 'robot_env', targetHandle: 'x_est' },
      { id: 'e_env_yest', source: 'robot_fusion', sourceHandle: 'y_est', target: 'robot_env', targetHandle: 'y_est' },
      { id: 'e_env_thetaest', source: 'robot_fusion', sourceHandle: 'theta_est', target: 'robot_env', targetHandle: 'theta_est' },
      { id: 'e_env_tx', source: 'robot_nav', sourceHandle: 'target_x_active', target: 'robot_env', targetHandle: 'target_x_in' },
      { id: 'e_env_ty', source: 'robot_nav', sourceHandle: 'target_y_active', target: 'robot_env', targetHandle: 'target_y_in' },
      { id: 'e_env_navst', source: 'robot_comm', sourceHandle: 'nav_state', target: 'robot_env', targetHandle: 'nav_state' },
      { id: 'e_env_g', source: 'robot_slam', sourceHandle: 'grid', target: 'robot_env', targetHandle: 'grid' },
      
      { id: 'e_env_bat_lvl', source: 'robot_comm', sourceHandle: 'battery', target: 'robot_env', targetHandle: 'battery_level' },
      { id: 'e_env_comm_stats', source: 'robot_comm', sourceHandle: 'comm_stats', target: 'robot_env', targetHandle: 'comm_stats' },
      { id: 'e_env_nav_stats', source: 'robot_nav', sourceHandle: 'nav_stats', target: 'robot_env', targetHandle: 'nav_stats' },
      { id: 'e_env_confidence', source: 'robot_fusion', sourceHandle: 'confidence', target: 'robot_env', targetHandle: 'confidence' },
      
      { id: 'e_scp_x', source: 'robot_fusion', sourceHandle: 'x_est', target: 'scope_pose', targetHandle: 'in1' },
      { id: 'e_scp_y', source: 'robot_fusion', sourceHandle: 'y_est', target: 'scope_pose', targetHandle: 'in2' },
      { id: 'e_scp_t', source: 'robot_fusion', sourceHandle: 'theta_est', target: 'scope_pose', targetHandle: 'in3' }
    ]
  },
  {
    id: 'robot_vacuum_full_system',
    name: 'Autonomous Vacuum Navigation & Mapping System',
    category: 'Robotics',
    difficulty: 'Expert',
    description: 'Design and verify a complete closed-loop navigation, localization (EKF), mapping (SLAM), planning, and motion control system for an autonomous vacuum cleaner.',
    nodes: [
      { id: 'mode_select', type: 'Constant', position: { x: 50, y: 50 }, label: 'Cleaning Mode', params: { value: 4 } },
      { id: 'robot_map', type: 'ROBOT_VACUUM_MAPPING', position: { x: 250, y: 150 }, label: 'SLAM Mapping', params: {} },
      { id: 'robot_coverage', type: 'ROBOT_VACUUM_COVERAGE', position: { x: 500, y: 150 }, label: 'Coverage Planner', params: {} },
      { id: 'robot_global_planner', type: 'ROBOT_VACUUM_GLOBAL_PLANNER', position: { x: 750, y: 150 }, label: 'Global Path Planner', params: {} },
      { id: 'robot_obstacle_avoid', type: 'ROBOT_VACUUM_OBSTACLE_AVOIDANCE', position: { x: 1000, y: 150 }, label: 'Obstacle Avoidance', params: {} },
      { id: 'robot_motion_control', type: 'ROBOT_VACUUM_MOTION_CONTROLLER', position: { x: 1250, y: 150 }, label: 'Motion Controller', params: {} },
      { id: 'robot_motor_command', type: 'ROBOT_VACUUM_MOTOR_COMMAND', position: { x: 1500, y: 150 }, label: 'Motor Command Gen', params: {} },
      { id: 'motor_left', type: 'ROBOT_VACUUM_MOTOR', position: { x: 1750, y: 80 }, label: 'Left Motor', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
      { id: 'motor_right', type: 'ROBOT_VACUUM_MOTOR', position: { x: 1750, y: 220 }, label: 'Right Motor', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
      { id: 'robot_battery', type: 'ROBOT_VACUUM_BATTERY', position: { x: 1750, y: 360 }, label: 'Battery System', params: { nominal_voltage: 12.0, capacity_Ah: 2.6, static_draw_A: 0.1, charge_rate: 5.0 } },
      { id: 'robot_dynamics', type: 'ROBOT_VACUUM_DYNAMICS', position: { x: 2000, y: 150 }, label: 'Robot Dynamics', params: {} },
      { id: 'robot_encoder', type: 'ROBOT_VACUUM_ENCODER', position: { x: 2000, y: 350 }, label: 'Wheel Encoder', params: {} },
      { id: 'robot_odom', type: 'ROBOT_VACUUM_ODOMETRY', position: { x: 2220, y: 350 }, label: 'Odometry', params: {} },
      { id: 'robot_lidar', type: 'ROBOT_VACUUM_LIDAR', position: { x: 2220, y: 150 }, label: 'LiDAR Sensor', params: {} },
      { id: 'robot_localization', type: 'ROBOT_VACUUM_LOCALIZATION', position: { x: 2470, y: 150 }, label: 'EKF Localization', params: {} },
      { id: 'robot_visualizer', type: 'ROBOT_VACUUM_VISUALIZATION', position: { x: 2720, y: 150 }, label: 'Visualization Block', params: {} },
      { id: 'scope_pose', type: 'Scope', position: { x: 2970, y: 150 }, label: 'Pose Monitor', params: { numSignals: 3, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'e_dyn_x_env', source: 'robot_dynamics', sourceHandle: 'x', target: 'robot_visualizer', targetHandle: 'x' },
      { id: 'e_dyn_y_env', source: 'robot_dynamics', sourceHandle: 'y', target: 'robot_visualizer', targetHandle: 'y' },
      { id: 'e_dyn_theta_env', source: 'robot_dynamics', sourceHandle: 'theta', target: 'robot_visualizer', targetHandle: 'theta' },
      { id: 'e_dyn_x_lidar', source: 'robot_dynamics', sourceHandle: 'x', target: 'robot_lidar', targetHandle: 'x' },
      { id: 'e_dyn_y_lidar', source: 'robot_dynamics', sourceHandle: 'y', target: 'robot_lidar', targetHandle: 'y' },
      { id: 'e_dyn_theta_lidar', source: 'robot_dynamics', sourceHandle: 'theta', target: 'robot_lidar', targetHandle: 'theta' },
      { id: 'e_dyn_x_loc', source: 'robot_dynamics', sourceHandle: 'x', target: 'robot_localization', targetHandle: 'x_true' },
      { id: 'e_dyn_y_loc', source: 'robot_dynamics', sourceHandle: 'y', target: 'robot_localization', targetHandle: 'y_true' },
      { id: 'e_dyn_theta_loc', source: 'robot_dynamics', sourceHandle: 'theta', target: 'robot_localization', targetHandle: 'theta_true' },
      { id: 'e_lidar_ranges_map', source: 'robot_lidar', sourceHandle: 'ranges', target: 'robot_map', targetHandle: 'lidar_ranges' },
      { id: 'e_lidar_ranges_avoid', source: 'robot_lidar', sourceHandle: 'ranges', target: 'robot_obstacle_avoid', targetHandle: 'lidar_ranges' },
      { id: 'e_lidar_ranges_loc', source: 'robot_lidar', sourceHandle: 'ranges', target: 'robot_localization', targetHandle: 'lidar_ranges' },
      { id: 'e_lidar_ranges_viz', source: 'robot_lidar', sourceHandle: 'ranges', target: 'robot_visualizer', targetHandle: 'lidar_ranges' },
      { id: 'e_motL_omega_dyn', source: 'motor_left', sourceHandle: 'omega', target: 'robot_dynamics', targetHandle: 'omega_L' },
      { id: 'e_motR_omega_dyn', source: 'motor_right', sourceHandle: 'omega', target: 'robot_dynamics', targetHandle: 'omega_R' },
      { id: 'e_motL_omega_enc', source: 'motor_left', sourceHandle: 'omega', target: 'robot_encoder', targetHandle: 'omega_L' },
      { id: 'e_motR_omega_enc', source: 'motor_right', sourceHandle: 'omega', target: 'robot_encoder', targetHandle: 'omega_R' },
      { id: 'e_motL_omega_cmd', source: 'motor_left', sourceHandle: 'omega', target: 'robot_motor_command', targetHandle: 'omega_L' },
      { id: 'e_motR_omega_cmd', source: 'motor_right', sourceHandle: 'omega', target: 'robot_motor_command', targetHandle: 'omega_R' },
      { id: 'e_motL_current_bat', source: 'motor_left', sourceHandle: 'current', target: 'robot_battery', targetHandle: 'I_L' },
      { id: 'e_motR_current_bat', source: 'motor_right', sourceHandle: 'current', target: 'robot_battery', targetHandle: 'I_R' },
      { id: 'e_bat_v_motL', source: 'robot_battery', sourceHandle: 'battery_voltage', target: 'motor_left', targetHandle: 'v_bat' },
      { id: 'e_bat_v_motR', source: 'robot_battery', sourceHandle: 'battery_voltage', target: 'motor_right', targetHandle: 'v_bat' },
      { id: 'e_bat_level_viz', source: 'robot_battery', sourceHandle: 'battery_level', target: 'robot_visualizer', targetHandle: 'battery_level' },
      { id: 'e_encL_odom', source: 'robot_encoder', sourceHandle: 'enc_L', target: 'robot_odom', targetHandle: 'enc_L' },
      { id: 'e_encR_odom', source: 'robot_encoder', sourceHandle: 'enc_R', target: 'robot_odom', targetHandle: 'enc_R' },
      { id: 'e_odom_x_loc', source: 'robot_odom', sourceHandle: 'x_odom', target: 'robot_localization', targetHandle: 'x_odom' },
      { id: 'e_odom_y_loc', source: 'robot_odom', sourceHandle: 'y_odom', target: 'robot_localization', targetHandle: 'y_odom' },
      { id: 'e_odom_theta_loc', source: 'robot_odom', sourceHandle: 'theta_odom', target: 'robot_localization', targetHandle: 'theta_odom' },
      { id: 'e_loc_x_map', source: 'robot_localization', sourceHandle: 'x_est', target: 'robot_map', targetHandle: 'x_est' },
      { id: 'e_loc_y_map', source: 'robot_localization', sourceHandle: 'y_est', target: 'robot_map', targetHandle: 'y_est' },
      { id: 'e_loc_theta_map', source: 'robot_localization', sourceHandle: 'theta_est', target: 'robot_map', targetHandle: 'theta_est' },
      { id: 'e_loc_x_cov', source: 'robot_localization', sourceHandle: 'x_est', target: 'robot_coverage', targetHandle: 'x_est' },
      { id: 'e_loc_y_cov', source: 'robot_localization', sourceHandle: 'y_est', target: 'robot_coverage', targetHandle: 'y_est' },
      { id: 'e_loc_x_glob', source: 'robot_localization', sourceHandle: 'x_est', target: 'robot_global_planner', targetHandle: 'x_est' },
      { id: 'e_loc_y_glob', source: 'robot_localization', sourceHandle: 'y_est', target: 'robot_global_planner', targetHandle: 'y_est' },
      { id: 'e_loc_x_mot', source: 'robot_localization', sourceHandle: 'x_est', target: 'robot_motion_control', targetHandle: 'x_est' },
      { id: 'e_loc_y_mot', source: 'robot_localization', sourceHandle: 'y_est', target: 'robot_motion_control', targetHandle: 'y_est' },
      { id: 'e_loc_theta_mot', source: 'robot_localization', sourceHandle: 'theta_est', target: 'robot_motion_control', targetHandle: 'theta_est' },
      { id: 'e_loc_x_viz', source: 'robot_localization', sourceHandle: 'x_est', target: 'robot_visualizer', targetHandle: 'x_est' },
      { id: 'e_loc_y_viz', source: 'robot_localization', sourceHandle: 'y_est', target: 'robot_visualizer', targetHandle: 'y_est' },
      { id: 'e_loc_theta_viz', source: 'robot_localization', sourceHandle: 'theta_est', target: 'robot_visualizer', targetHandle: 'theta_est' },
      { id: 'e_loc_conf_viz', source: 'robot_localization', sourceHandle: 'confidence', target: 'robot_visualizer', targetHandle: 'confidence' },
      { id: 'e_scp_x', source: 'robot_localization', sourceHandle: 'x_est', target: 'scope_pose', targetHandle: 'in1' },
      { id: 'e_scp_y', source: 'robot_localization', sourceHandle: 'y_est', target: 'scope_pose', targetHandle: 'in2' },
      { id: 'e_scp_theta', source: 'robot_localization', sourceHandle: 'theta_est', target: 'scope_pose', targetHandle: 'in3' },
      { id: 'e_map_grid_cov', source: 'robot_map', sourceHandle: 'grid', target: 'robot_coverage', targetHandle: 'grid' },
      { id: 'e_map_grid_glob', source: 'robot_map', sourceHandle: 'grid', target: 'robot_global_planner', targetHandle: 'grid' },
      { id: 'e_map_grid_viz', source: 'robot_map', sourceHandle: 'grid', target: 'robot_visualizer', targetHandle: 'grid' },
      { id: 'e_cov_goalx_glob', source: 'robot_coverage', sourceHandle: 'goal_x', target: 'robot_global_planner', targetHandle: 'goal_x' },
      { id: 'e_cov_goaly_glob', source: 'robot_coverage', sourceHandle: 'goal_y', target: 'robot_global_planner', targetHandle: 'goal_y' },
      { id: 'e_cov_stats_viz', source: 'robot_coverage', sourceHandle: 'coverage_status', target: 'robot_visualizer', targetHandle: 'nav_stats' },
      { id: 'e_glob_tx_avoid', source: 'robot_global_planner', sourceHandle: 'target_x', target: 'robot_obstacle_avoid', targetHandle: 'target_x' },
      { id: 'e_glob_ty_avoid', source: 'robot_global_planner', sourceHandle: 'target_y', target: 'robot_obstacle_avoid', targetHandle: 'target_y' },
      { id: 'e_avoid_sx_mot', source: 'robot_obstacle_avoid', sourceHandle: 'safe_x', target: 'robot_motion_control', targetHandle: 'target_x' },
      { id: 'e_avoid_sy_mot', source: 'robot_obstacle_avoid', sourceHandle: 'safe_y', target: 'robot_motion_control', targetHandle: 'target_y' },
      { id: 'e_avoid_vc_mot', source: 'robot_obstacle_avoid', sourceHandle: 'velocity_constraints', target: 'robot_motion_control', targetHandle: 'velocity_constraints' },
      { id: 'e_avoid_sx_viz', source: 'robot_obstacle_avoid', sourceHandle: 'safe_x', target: 'robot_visualizer', targetHandle: 'target_x' },
      { id: 'e_avoid_sy_viz', source: 'robot_obstacle_avoid', sourceHandle: 'safe_y', target: 'robot_visualizer', targetHandle: 'target_y' },
      { id: 'e_avoid_nav_viz', source: 'robot_obstacle_avoid', sourceHandle: 'nav_state', target: 'robot_visualizer', targetHandle: 'nav_state' },
      { id: 'e_mot_v_cmd', source: 'robot_motion_control', sourceHandle: 'v_cmd', target: 'robot_motor_command', targetHandle: 'v_cmd' },
      { id: 'e_mot_w_cmd', source: 'robot_motion_control', sourceHandle: 'w_cmd', target: 'robot_motor_command', targetHandle: 'w_cmd' },
      { id: 'e_cmd_VL_motL', source: 'robot_motor_command', sourceHandle: 'V_cmd_L', target: 'motor_left', targetHandle: 'pwm_duty' },
      { id: 'e_cmd_VR_motR', source: 'robot_motor_command', sourceHandle: 'V_cmd_R', target: 'motor_right', targetHandle: 'pwm_duty' }
    ]
  },
  {
    id: 'robot_vacuum_learning_model',
    name: 'Autonomous Vacuum Cleaner Learning Model',
    category: 'Robotics & Control',
    difficulty: 'Expert',
    description: 'A complete hierarchical Simulink-style learning and control architecture for an autonomous vacuum cleaner, featuring sensor arrays, PF/EKF localization, A* coverage planners, PID motor controllers, and interactive 3D co-simulation.',
    nodes: [
      { id: 'sub_input_sensors', type: 'Subsystem', position: { x: 50, y: 150 }, label: 'Input Sensors', params: { name: 'Input Sensors' } },
      { id: 'sub_robot_localization', type: 'Subsystem', position: { x: 300, y: 100 }, label: 'Robot Localization', params: { name: 'Robot Localization' } },
      { id: 'sub_path_planning', type: 'Subsystem', position: { x: 620, y: 100 }, label: 'Path Planning', params: { name: 'Path Planning' } },
      { id: 'sub_motion_control', type: 'Subsystem', position: { x: 300, y: 450 }, label: 'Motion Control', params: { name: 'Motion Control' } },
      { id: 'sub_actuators_hw', type: 'Subsystem', position: { x: 620, y: 450 }, label: 'Actuators & HW', params: { name: 'Actuators & HW' } },
      { id: 'sub_robot_plant_model', type: 'Subsystem', position: { x: 920, y: 450 }, label: 'Robot Plant Model', params: { name: 'Robot Plant Model' } },
      { id: 'sub_3d_visualization', type: 'Subsystem', position: { x: 1220, y: 100 }, label: '3D Visualization', params: { name: '3D Visualization' } },
      { id: 'sub_dustbin_monitor', type: 'Subsystem', position: { x: 300, y: 780 }, label: 'Dustbin Monitor Subsystem', params: { name: 'Dustbin Monitor Subsystem' } },
      { id: 'sub_docking_battery', type: 'Subsystem', position: { x: 720, y: 780 }, label: 'Docking & Battery Subsystem', params: { name: 'Docking & Battery Subsystem' } },

      { id: 'lidar_sensor_block', type: 'ROBOT_VACUUM_LIDAR_SENSOR', position: { x: 80, y: 80 }, label: 'Lidar Sensor', params: {}, parentId: 'sub_input_sensors' },
      { id: 'odom_sensor_block', type: 'ROBOT_VACUUM_ODOMETRY_SENSOR', position: { x: 80, y: 220 }, label: 'Odometry', params: {}, parentId: 'sub_input_sensors' },
      { id: 'cliff_sensor_block', type: 'ROBOT_VACUUM_CLIFF_IR', position: { x: 80, y: 360 }, label: 'Cliff IR Sensor', params: {}, parentId: 'sub_input_sensors' },
      { id: 'dustbin_sensor_block', type: 'ROBOT_VACUUM_DUSTBIN_SENSOR', position: { x: 80, y: 500 }, label: 'Dustbin Sensor', params: {}, parentId: 'sub_input_sensors' },
      { id: 'motor_current_block', type: 'ROBOT_VACUUM_MOTOR_CURRENT', position: { x: 80, y: 640 }, label: 'Motor Current', params: {}, parentId: 'sub_input_sensors' },
      { id: 'in_sens_out_lidar', type: 'Outport', position: { x: 320, y: 90 }, label: 'Lidar Out', params: { name: 'Lidar Out', port_index: 1 }, parentId: 'sub_input_sensors' },
      { id: 'in_sens_out_odom', type: 'Outport', position: { x: 320, y: 230 }, label: 'Odom Out', params: { name: 'Odom Out', port_index: 2 }, parentId: 'sub_input_sensors' },
      { id: 'in_sens_out_cliff', type: 'Outport', position: { x: 320, y: 370 }, label: 'Cliff Out', params: { name: 'Cliff Out', port_index: 3 }, parentId: 'sub_input_sensors' },
      { id: 'in_sens_out_dust', type: 'Outport', position: { x: 320, y: 510 }, label: 'Dust Out', params: { name: 'Dust Out', port_index: 4 }, parentId: 'sub_input_sensors' },
      { id: 'in_sens_out_current', type: 'Outport', position: { x: 320, y: 650 }, label: 'Current Out', params: { name: 'Current Out', port_index: 5 }, parentId: 'sub_input_sensors' },

      { id: 'loc_in_lidar', type: 'Inport', position: { x: 50, y: 80 }, label: 'Lidar In', params: { name: 'Lidar In', port_index: 1 }, parentId: 'sub_robot_localization' },
      { id: 'loc_in_odom', type: 'Inport', position: { x: 50, y: 200 }, label: 'Odom In', params: { name: 'Odom In', port_index: 2 }, parentId: 'sub_robot_localization' },
      { id: 'loc_in_cliff', type: 'Inport', position: { x: 50, y: 320 }, label: 'Cliff In', params: { name: 'Cliff In', port_index: 3 }, parentId: 'sub_robot_localization' },
      { id: 'robot_fusion_pf', type: 'ROBOT_VACUUM_SENSOR_FUSION_EKF', position: { x: 250, y: 150 }, label: 'Robot (Sensor Fusion PF)', params: {}, parentId: 'sub_robot_localization' },
      { id: 'room_segmentation', type: 'ROBOT_VACUUM_ROOM_SEGMENTATION', position: { x: 550, y: 80 }, label: 'Room Segmentation', params: {}, parentId: 'sub_robot_localization' },
      { id: 'semantic_zone_map', type: 'ROBOT_VACUUM_SEMANTIC_MAP', position: { x: 550, y: 260 }, label: 'Semantic Zone Map', params: {}, parentId: 'sub_robot_localization' },
      { id: 'loc_out_pose', type: 'Outport', position: { x: 800, y: 160 }, label: 'Pose Out', params: { name: 'Pose Out', port_index: 1 }, parentId: 'sub_robot_localization' },
      { id: 'loc_out_y', type: 'Outport', position: { x: 800, y: 220 }, label: 'Pose Y Out', params: { name: 'Pose Y Out', port_index: 4 }, parentId: 'sub_robot_localization' },
      { id: 'loc_out_segment', type: 'Outport', position: { x: 800, y: 80 }, label: 'Room Seg Out', params: { name: 'Room Seg Out', port_index: 2 }, parentId: 'sub_robot_localization' },
      { id: 'loc_out_map', type: 'Outport', position: { x: 800, y: 270 }, label: 'Zone Map Out', params: { name: 'Zone Map Out', port_index: 3 }, parentId: 'sub_robot_localization' },

      { id: 'path_in_pose', type: 'Inport', position: { x: 50, y: 80 }, label: 'Pose In', params: { name: 'Pose In', port_index: 1 }, parentId: 'sub_path_planning' },
      { id: 'path_in_y', type: 'Inport', position: { x: 50, y: 140 }, label: 'Pose Y In', params: { name: 'Pose Y In', port_index: 5 }, parentId: 'sub_path_planning' },
      { id: 'path_in_segment', type: 'Inport', position: { x: 50, y: 200 }, label: 'Room Seg In', params: { name: 'Room Seg In', port_index: 2 }, parentId: 'sub_path_planning' },
      { id: 'path_in_map', type: 'Inport', position: { x: 50, y: 320 }, label: 'Zone Map In', params: { name: 'Zone Map In', port_index: 3 }, parentId: 'sub_path_planning' },
      { id: 'path_in_bat', type: 'Inport', position: { x: 50, y: 440 }, label: 'Bat % In', params: { name: 'Bat % In', port_index: 4 }, parentId: 'sub_path_planning' },
      { id: 'coverage_planner', type: 'ROBOT_VACUUM_COVERAGE_PLANNER', position: { x: 260, y: 150 }, label: 'Coverage Planner', params: {}, parentId: 'sub_path_planning' },
      { id: 'waypoint_generation', type: 'ROBOT_VACUUM_WAYPOINT_GEN', position: { x: 500, y: 80 }, label: 'Waypoint Generation', params: {}, parentId: 'sub_path_planning' },
      { id: 'room_scheduler', type: 'ROBOT_VACUUM_ROOM_SCHEDULER', position: { x: 260, y: 300 }, label: 'Room Scheduler', params: {}, parentId: 'sub_path_planning' },
      { id: 'battery_monitor', type: 'ROBOT_VACUUM_BATTERY_MONITOR', position: { x: 260, y: 440 }, label: 'Battery Monitor', params: {}, parentId: 'sub_path_planning' },
      { id: 'goal_manager', type: 'ROBOT_VACUUM_GOAL_MANAGER', position: { x: 500, y: 360 }, label: 'Goal Manager', params: {}, parentId: 'sub_path_planning' },
      { id: 'viz_3d_colors', type: 'ROBOT_VACUUM_3D_VIZ_COLORS', position: { x: 720, y: 360 }, label: '3D Viz (Room Colors)', params: {}, parentId: 'sub_path_planning' },
      { id: 'path_out_waypoints', type: 'Outport', position: { x: 920, y: 90 }, label: 'Waypoints Out', params: { name: 'Waypoints Out', port_index: 1 }, parentId: 'sub_path_planning' },
      { id: 'path_out_colors', type: 'Outport', position: { x: 920, y: 370 }, label: 'Colors Out', params: { name: 'Colors Out', port_index: 2 }, parentId: 'sub_path_planning' },

      { id: 'motion_in_current', type: 'Inport', position: { x: 50, y: 80 }, label: 'Current In', params: { name: 'Current In', port_index: 1 }, parentId: 'sub_motion_control' },
      { id: 'motion_in_waypoints', type: 'Inport', position: { x: 50, y: 200 }, label: 'Waypoints In', params: { name: 'Waypoints In', port_index: 2 }, parentId: 'sub_motion_control' },
      { id: 'motion_in_pose', type: 'Inport', position: { x: 50, y: 320 }, label: 'Pose In', params: { name: 'Pose In', port_index: 3 }, parentId: 'sub_motion_control' },
      { id: 'motion_in_y', type: 'Inport', position: { x: 50, y: 380 }, label: 'Pose Y In', params: { name: 'Pose Y In', port_index: 5 }, parentId: 'sub_motion_control' },
      { id: 'motion_in_cliff', type: 'Inport', position: { x: 50, y: 440 }, label: 'Cliff IR In', params: { name: 'Cliff IR In', port_index: 4 }, parentId: 'sub_motion_control' },
      { id: 'collision_avoidance', type: 'ROBOT_VACUUM_COLLISION_AVOID', position: { x: 260, y: 150 }, label: 'Collision Avoidance', params: {}, parentId: 'sub_motion_control' },
      { id: 'surface_adapter', type: 'ROBOT_VACUUM_SURFACE_ADAPTER', position: { x: 260, y: 350 }, label: 'Surface Adapter', params: {}, parentId: 'sub_motion_control' },
      { id: 'cliff_halt_logic', type: 'ROBOT_VACUUM_CLIFF_HALT', position: { x: 500, y: 400 }, label: 'Cliff Halt Logic', params: {}, parentId: 'sub_motion_control' },
      { id: 'motion_out_vel', type: 'Outport', position: { x: 720, y: 160 }, label: 'Vel CMD Out', params: { name: 'Vel CMD Out', port_index: 1 }, parentId: 'sub_motion_control' },
      { id: 'motion_out_halt', type: 'Outport', position: { x: 720, y: 410 }, label: 'Halt CMD Out', params: { name: 'Halt CMD Out', port_index: 2 }, parentId: 'sub_motion_control' },

      { id: 'act_in_vel', type: 'Inport', position: { x: 50, y: 80 }, label: 'Vel CMD In', params: { name: 'Vel CMD In', port_index: 1 }, parentId: 'sub_actuators_hw' },
      { id: 'act_in_halt', type: 'Inport', position: { x: 50, y: 200 }, label: 'Halt CMD In', params: { name: 'Halt CMD In', port_index: 2 }, parentId: 'sub_actuators_hw' },
      { id: 'velocity_pid', type: 'ROBOT_VACUUM_VELOCITY_PID', position: { x: 250, y: 80 }, label: 'Velocity PID', params: {}, parentId: 'sub_actuators_hw' },
      { id: 'mode_supervisor', type: 'ROBOT_VACUUM_MODE_SUPERVISOR', position: { x: 250, y: 200 }, label: 'Mode Supervisor', params: {}, parentId: 'sub_actuators_hw' },
      { id: 'bumper_sensor_block', type: 'ROBOT_VACUUM_BUMPER_SENSOR', position: { x: 250, y: 350 }, label: 'Bumper Sensor', params: {}, parentId: 'sub_actuators_hw' },
      { id: 'side_brush_model', type: 'ROBOT_VACUUM_SIDE_BRUSH', position: { x: 500, y: 120 }, label: 'Side Brush Model (S-Function)', params: {}, parentId: 'sub_actuators_hw' },
      { id: 'variable_suction', type: 'ROBOT_VACUUM_SUCTION_PWM', position: { x: 500, y: 260 }, label: 'Variable Suction (PWM)', params: {}, parentId: 'sub_actuators_hw' },
      { id: 'act_out_brush', type: 'Outport', position: { x: 750, y: 130 }, label: 'Brush Torque Out', params: { name: 'Brush Torque Out', port_index: 1 }, parentId: 'sub_actuators_hw' },
      { id: 'act_out_suction', type: 'Outport', position: { x: 750, y: 270 }, label: 'Suction Force Out', params: { name: 'Suction Force Out', port_index: 2 }, parentId: 'sub_actuators_hw' },
      { id: 'act_out_bump', type: 'Outport', position: { x: 750, y: 360 }, label: 'Bump State Out', params: { name: 'Bump State Out', port_index: 3 }, parentId: 'sub_actuators_hw' },

      { id: 'plant_in_brush', type: 'Inport', position: { x: 50, y: 80 }, label: 'Brush In', params: { name: 'Brush In', port_index: 1 }, parentId: 'sub_robot_plant_model' },
      { id: 'plant_in_suction', type: 'Inport', position: { x: 50, y: 200 }, label: 'Suction In', params: { name: 'Suction In', port_index: 2 }, parentId: 'sub_robot_plant_model' },
      { id: 'plant_in_bump', type: 'Inport', position: { x: 50, y: 320 }, label: 'Bump In', params: { name: 'Bump In', port_index: 3 }, parentId: 'sub_robot_plant_model' },
      { id: 'robot_kinematics_plant', type: 'ROBOT_VACUUM_DIGITAL_TWIN', position: { x: 260, y: 180 }, label: 'Robot Kinematics', params: {}, parentId: 'sub_robot_plant_model' },
      { id: 'terrain_model', type: 'ROBOT_VACUUM_TERRAIN_MODEL', position: { x: 550, y: 80 }, label: 'Terrain Model (Carpet/Hardwood)', params: {}, parentId: 'sub_robot_plant_model' },
      { id: 'collision_mesh', type: 'ROBOT_VACUUM_COLLISION_MESH', position: { x: 550, y: 200 }, label: 'Collision Mesh (Furniture Bounding Boxes)', params: {}, parentId: 'sub_robot_plant_model' },
      { id: 'dock_station_beacon', type: 'ROBOT_VACUUM_DOCK_BEACON', position: { x: 550, y: 320 }, label: 'Dock Station (Beacon)', params: {}, parentId: 'sub_robot_plant_model' },
      { id: 'plant_out_pose', type: 'Outport', position: { x: 800, y: 190 }, label: 'Pose Out', params: { name: 'Pose Out', port_index: 1 }, parentId: 'sub_robot_plant_model' },
      { id: 'plant_out_beacon', type: 'Outport', position: { x: 800, y: 330 }, label: 'Beacon Out', params: { name: 'Beacon Out', port_index: 2 }, parentId: 'sub_robot_plant_model' },
      { id: 'plant_out_grid', type: 'Outport', position: { x: 800, y: 260 }, label: 'Grid Out', params: { name: 'Grid Out', port_index: 3 }, parentId: 'sub_robot_plant_model' },
      { id: 'plant_out_ranges', type: 'Outport', position: { x: 800, y: 120 }, label: 'Ranges Out', params: { name: 'Ranges Out', port_index: 4 }, parentId: 'sub_robot_plant_model' },

      { id: 'viz_in_pose', type: 'Inport', position: { x: 50, y: 80 }, label: 'Pose In', params: { name: 'Pose In', port_index: 1 }, parentId: 'sub_3d_visualization' },
      { id: 'viz_in_colors', type: 'Inport', position: { x: 50, y: 180 }, label: 'Colors In', params: { name: 'Colors In', port_index: 2 }, parentId: 'sub_3d_visualization' },
      { id: 'viz_in_bat', type: 'Inport', position: { x: 50, y: 280 }, label: 'Bat In', params: { name: 'Bat In', port_index: 3 }, parentId: 'sub_3d_visualization' },
      { id: 'viz_in_dust', type: 'Inport', position: { x: 50, y: 380 }, label: 'Dust In', params: { name: 'Dust In', port_index: 4 }, parentId: 'sub_3d_visualization' },
      { id: 'viz_in_grid', type: 'Inport', position: { x: 50, y: 480 }, label: 'Grid In', params: { name: 'Grid In', port_index: 5 }, parentId: 'sub_3d_visualization' },
      { id: 'viz_in_ranges', type: 'Inport', position: { x: 50, y: 580 }, label: 'Ranges In', params: { name: 'Ranges In', port_index: 6 }, parentId: 'sub_3d_visualization' },
      { id: 'three_d_scene_view', type: 'ROBOT_VACUUM_3D_SCENE_VIEW', position: { x: 260, y: 280 }, label: '3D Scene View', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'furniture_mesh_3d', type: 'ROBOT_VACUUM_FURNITURE_MESH', position: { x: 500, y: 80 }, label: 'Furniture Mesh 3D', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'dirt_density_map', type: 'ROBOT_VACUUM_DIRT_DENSITY', position: { x: 500, y: 160 }, label: 'Dirt Density Map', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'room_zone_colors', type: 'ROBOT_VACUUM_ROOM_ZONE_COLORS', position: { x: 500, y: 240 }, label: 'Room Zone Colors', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'coverage_heatmap', type: 'ROBOT_VACUUM_COVERAGE_HEATMAP', position: { x: 500, y: 320 }, label: 'Coverage Heatmap', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'dock_station_icon', type: 'ROBOT_VACUUM_DOCK_ICON', position: { x: 500, y: 400 }, label: 'Dock Station Icon', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'battery_hud', type: 'ROBOT_VACUUM_BATTERY_HUD', position: { x: 500, y: 480 }, label: 'Battery HUD', params: {}, parentId: 'sub_3d_visualization' },
      { id: 'dustbin_level_hud', type: 'ROBOT_VACUUM_DUSTBIN_HUD', position: { x: 500, y: 560 }, label: 'Dustbin Level HUD', params: {}, parentId: 'sub_3d_visualization' },

      { id: 'dust_in', type: 'Inport', position: { x: 50, y: 100 }, label: 'Dust In', params: { name: 'Dust In', port_index: 1 }, parentId: 'sub_dustbin_monitor' },
      { id: 'capacity_threshold', type: 'ROBOT_VACUUM_CAPACITY_THRESHOLD', position: { x: 220, y: 100 }, label: 'Capacity Threshold', params: {}, parentId: 'sub_dustbin_monitor' },
      { id: 'halt_alert_state', type: 'ROBOT_VACUUM_HALT_ALERT', position: { x: 440, y: 100 }, label: 'Halt & Alert State', params: {}, parentId: 'sub_dustbin_monitor' },

      { id: 'dock_in_beacon', type: 'Inport', position: { x: 50, y: 150 }, label: 'Beacon In', params: { name: 'Beacon In', port_index: 1 }, parentId: 'sub_docking_battery' },
      { id: 'battery_monitor_dock', type: 'ROBOT_VACUUM_BATTERY_MONITOR', position: { x: 220, y: 80 }, label: 'Battery Monitor', params: {}, parentId: 'sub_docking_battery' },
      { id: 'battery_monitor_dock2', type: 'ROBOT_VACUUM_BATTERY_MONITOR', position: { x: 220, y: 220 }, label: 'Battery Monitor', params: {}, parentId: 'sub_docking_battery' },
      { id: 'dock_detect_logic', type: 'ROBOT_VACUUM_DOCK_DETECT', position: { x: 440, y: 150 }, label: 'Dock Detect Logic', params: {}, parentId: 'sub_docking_battery' },
      { id: 'resume_scheduler', type: 'ROBOT_VACUUM_RESUME_SCHEDULER', position: { x: 660, y: 150 }, label: 'Resume Scheduler', params: {}, parentId: 'sub_docking_battery' },
      { id: 'dock_out_state', type: 'Outport', position: { x: 860, y: 160 }, label: 'Docked State Out', params: { name: 'Docked State Out', port_index: 1 }, parentId: 'sub_docking_battery' }
    ],
    edges: [
      { id: 'el0_1', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_lidar', target: 'sub_robot_localization', targetHandle: 'loc_in_lidar', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_2', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_odom', target: 'sub_robot_localization', targetHandle: 'loc_in_odom', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_3', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_cliff', target: 'sub_robot_localization', targetHandle: 'loc_in_cliff', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_4', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_dust', target: 'sub_dustbin_monitor', targetHandle: 'dust_in', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_5', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_current', target: 'sub_motion_control', targetHandle: 'motion_in_current', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_6', source: 'sub_robot_localization', sourceHandle: 'loc_out_pose', target: 'sub_path_planning', targetHandle: 'path_in_pose', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_6_y', source: 'sub_robot_localization', sourceHandle: 'loc_out_y', target: 'sub_path_planning', targetHandle: 'path_in_y', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_7', source: 'sub_robot_localization', sourceHandle: 'loc_out_segment', target: 'sub_path_planning', targetHandle: 'path_in_segment', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_8', source: 'sub_robot_localization', sourceHandle: 'loc_out_map', target: 'sub_path_planning', targetHandle: 'path_in_map', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_9', source: 'sub_robot_localization', sourceHandle: 'loc_out_pose', target: 'sub_motion_control', targetHandle: 'motion_in_pose', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_9_y', source: 'sub_robot_localization', sourceHandle: 'loc_out_y', target: 'sub_motion_control', targetHandle: 'motion_in_y', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_10', source: 'sub_input_sensors', sourceHandle: 'in_sens_out_cliff', target: 'sub_motion_control', targetHandle: 'motion_in_cliff', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_11', source: 'sub_path_planning', sourceHandle: 'path_out_waypoints', target: 'sub_motion_control', targetHandle: 'motion_in_waypoints', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_12', source: 'sub_motion_control', sourceHandle: 'motion_out_vel', target: 'sub_actuators_hw', targetHandle: 'act_in_vel', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_13', source: 'sub_motion_control', sourceHandle: 'motion_out_halt', target: 'sub_actuators_hw', targetHandle: 'act_in_halt', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_14', source: 'sub_actuators_hw', sourceHandle: 'act_out_brush', target: 'sub_robot_plant_model', targetHandle: 'plant_in_brush', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_15', source: 'sub_actuators_hw', sourceHandle: 'act_out_suction', target: 'sub_robot_plant_model', targetHandle: 'plant_in_suction', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_16', source: 'sub_actuators_hw', sourceHandle: 'act_out_bump', target: 'sub_robot_plant_model', targetHandle: 'plant_in_bump', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_17', source: 'sub_robot_plant_model', sourceHandle: 'plant_out_pose', target: 'sub_3d_visualization', targetHandle: 'viz_in_pose', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_18', source: 'sub_path_planning', sourceHandle: 'path_out_colors', target: 'sub_3d_visualization', targetHandle: 'viz_in_colors', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_19', source: 'sub_robot_plant_model', sourceHandle: 'plant_out_grid', target: 'sub_3d_visualization', targetHandle: 'viz_in_grid', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_20', source: 'sub_robot_plant_model', sourceHandle: 'plant_out_ranges', target: 'sub_3d_visualization', targetHandle: 'viz_in_ranges', style: { stroke: '#c9a86c', strokeWidth: 3 } },
      { id: 'el0_21', source: 'sub_robot_plant_model', sourceHandle: 'plant_out_beacon', target: 'sub_docking_battery', targetHandle: 'dock_in_beacon', style: { stroke: '#c9a86c', strokeWidth: 3 } },

      { id: 'e_is_1', source: 'lidar_sensor_block', sourceHandle: 'ranges', target: 'in_sens_out_lidar', targetHandle: 'in' },
      { id: 'e_is_2', source: 'odom_sensor_block', sourceHandle: 'x_odom', target: 'in_sens_out_odom', targetHandle: 'in' },
      { id: 'e_is_3', source: 'cliff_sensor_block', sourceHandle: 'cliff_val', target: 'in_sens_out_cliff', targetHandle: 'in' },
      { id: 'e_is_4', source: 'dustbin_sensor_block', sourceHandle: 'dust_level', target: 'in_sens_out_dust', targetHandle: 'in' },
      { id: 'e_is_5', source: 'motor_current_block', sourceHandle: 'current', target: 'in_sens_out_current', targetHandle: 'in' },

      { id: 'e_rl_1', source: 'loc_in_lidar', sourceHandle: 'out', target: 'robot_fusion_pf', targetHandle: 'x_true' },
      { id: 'e_rl_2', source: 'loc_in_odom', sourceHandle: 'out', target: 'robot_fusion_pf', targetHandle: 'x_odom' },
      { id: 'e_rl_3', source: 'robot_fusion_pf', sourceHandle: 'x_est', target: 'room_segmentation', targetHandle: 'x_est' },
      { id: 'e_rl_4', source: 'robot_fusion_pf', sourceHandle: 'y_est', target: 'room_segmentation', targetHandle: 'y_est' },
      { id: 'e_rl_5', source: 'robot_fusion_pf', sourceHandle: 'x_est', target: 'semantic_zone_map', targetHandle: 'x_est' },
      { id: 'e_rl_6', source: 'robot_fusion_pf', sourceHandle: 'y_est', target: 'semantic_zone_map', targetHandle: 'y_est' },
      { id: 'e_rl_7', source: 'robot_fusion_pf', sourceHandle: 'x_est', target: 'loc_out_pose', targetHandle: 'in' },
      { id: 'e_rl_7_y', source: 'robot_fusion_pf', sourceHandle: 'y_est', target: 'loc_out_y', targetHandle: 'in' },
      { id: 'e_rl_8', source: 'room_segmentation', sourceHandle: 'room_seg', target: 'loc_out_segment', targetHandle: 'in' },
      { id: 'e_rl_9', source: 'semantic_zone_map', sourceHandle: 'semantic_map', target: 'loc_out_map', targetHandle: 'in' },

      { id: 'e_pp_1', source: 'path_in_segment', sourceHandle: 'out', target: 'coverage_planner', targetHandle: 'room_seg' },
      { id: 'e_pp_2', source: 'path_in_map', sourceHandle: 'out', target: 'coverage_planner', targetHandle: 'semantic_map' },
      { id: 'e_pp_3', source: 'coverage_planner', sourceHandle: 'coverage_plan', target: 'waypoint_generation', targetHandle: 'coverage_plan' },
      { id: 'e_pp_4', source: 'waypoint_generation', sourceHandle: 'waypoints', target: 'path_out_waypoints', targetHandle: 'in' },
      { id: 'e_pp_5', source: 'path_in_map', sourceHandle: 'out', target: 'room_scheduler', targetHandle: 'semantic_map' },
      { id: 'e_pp_6', source: 'path_in_bat', sourceHandle: 'out', target: 'battery_monitor', targetHandle: 'battery_level' },
      { id: 'e_pp_7', source: 'room_scheduler', sourceHandle: 'room_schedule', target: 'goal_manager', targetHandle: 'room_schedule' },
      { id: 'e_pp_8', source: 'battery_monitor', sourceHandle: 'battery_status', target: 'goal_manager', targetHandle: 'battery_status' },
      { id: 'e_pp_9', source: 'path_in_pose', sourceHandle: 'out', target: 'goal_manager', targetHandle: 'x_est' },
      { id: 'e_pp_9_y', source: 'path_in_y', sourceHandle: 'out', target: 'goal_manager', targetHandle: 'y_est' },
      { id: 'e_pp_9_bat_wp', source: 'battery_monitor', sourceHandle: 'battery_status', target: 'waypoint_generation', targetHandle: 'battery_status' },
      { id: 'e_pp_9_x_wp', source: 'path_in_pose', sourceHandle: 'out', target: 'waypoint_generation', targetHandle: 'x_est' },
      { id: 'e_pp_9_y_wp', source: 'path_in_y', sourceHandle: 'out', target: 'waypoint_generation', targetHandle: 'y_est' },
      { id: 'e_pp_9_x_bat', source: 'path_in_pose', sourceHandle: 'out', target: 'battery_monitor', targetHandle: 'x_est' },
      { id: 'e_pp_9_y_bat', source: 'path_in_y', sourceHandle: 'out', target: 'battery_monitor', targetHandle: 'y_est' },
      { id: 'e_pp_10', source: 'goal_manager', sourceHandle: 'goal_path', target: 'viz_3d_colors', targetHandle: 'goal_path' },
      { id: 'e_pp_11', source: 'viz_3d_colors', sourceHandle: 'room_colors', target: 'path_out_colors', targetHandle: 'in' },

      { id: 'e_mc_1', source: 'motion_in_current', sourceHandle: 'out', target: 'collision_avoidance', targetHandle: 'current' },
      { id: 'e_mc_2', source: 'motion_in_waypoints', sourceHandle: 'out', target: 'collision_avoidance', targetHandle: 'waypoints' },
      { id: 'e_mc_3', source: 'motion_in_pose', sourceHandle: 'out', target: 'collision_avoidance', targetHandle: 'x_est' },
      { id: 'e_mc_3_y', source: 'motion_in_y', sourceHandle: 'out', target: 'collision_avoidance', targetHandle: 'y_est' },
      { id: 'e_mc_4', source: 'collision_avoidance', sourceHandle: 'vel_cmd', target: 'motion_out_vel', targetHandle: 'in' },
      { id: 'e_mc_5', source: 'motion_in_pose', sourceHandle: 'out', target: 'surface_adapter', targetHandle: 'x_est' },
      { id: 'e_mc_6', source: 'surface_adapter', sourceHandle: 'surface', target: 'cliff_halt_logic', targetHandle: 'surface' },
      { id: 'e_mc_7', source: 'motion_in_cliff', sourceHandle: 'out', target: 'cliff_halt_logic', targetHandle: 'cliff_val' },
      { id: 'e_mc_8', source: 'cliff_halt_logic', sourceHandle: 'halt_cmd', target: 'motion_out_halt', targetHandle: 'in' },

      { id: 'e_ah_1', source: 'act_in_vel', sourceHandle: 'out', target: 'velocity_pid', targetHandle: 'vel_cmd' },
      { id: 'e_ah_2', source: 'act_in_halt', sourceHandle: 'out', target: 'mode_supervisor', targetHandle: 'halt_cmd' },
      { id: 'e_ah_3', source: 'velocity_pid', sourceHandle: 'speed_pwm', target: 'side_brush_model', targetHandle: 'speed_pwm' },
      { id: 'e_ah_4', source: 'mode_supervisor', sourceHandle: 'brush_pwm', target: 'side_brush_model', targetHandle: 'brush_pwm' },
      { id: 'e_ah_5', source: 'mode_supervisor', sourceHandle: 'suction_pwm', target: 'variable_suction', targetHandle: 'suction_pwm' },
      { id: 'e_ah_6', source: 'side_brush_model', sourceHandle: 'torque', target: 'act_out_brush', targetHandle: 'in' },
      { id: 'e_ah_7', source: 'variable_suction', sourceHandle: 'suction_force', target: 'act_out_suction', targetHandle: 'in' },
      { id: 'e_ah_8', source: 'bumper_sensor_block', sourceHandle: 'bump', target: 'act_out_bump', targetHandle: 'in' },

      { id: 'e_rp_1', source: 'plant_in_brush', sourceHandle: 'out', target: 'robot_kinematics_plant', targetHandle: 'omegaL_ref' },
      { id: 'e_rp_2', source: 'robot_kinematics_plant', sourceHandle: 'x_pos', target: 'plant_out_pose', targetHandle: 'in' },
      { id: 'e_rp_3', source: 'robot_kinematics_plant', sourceHandle: 'x_pos', target: 'terrain_model', targetHandle: 'x' },
      { id: 'e_rp_4', source: 'robot_kinematics_plant', sourceHandle: 'x_pos', target: 'collision_mesh', targetHandle: 'x' },
      { id: 'e_rp_5', source: 'robot_kinematics_plant', sourceHandle: 'x_pos', target: 'dock_station_beacon', targetHandle: 'x' },
      { id: 'e_rp_6', source: 'dock_station_beacon', sourceHandle: 'beacon', target: 'plant_out_beacon', targetHandle: 'in' },
      { id: 'e_rp_7', source: 'robot_kinematics_plant', sourceHandle: 'lidar_ranges', target: 'plant_out_ranges', targetHandle: 'in' },
      { id: 'e_rp_8', source: 'robot_kinematics_plant', sourceHandle: 'grid', target: 'plant_out_grid', targetHandle: 'in' },

      { id: 'e_vi_1', source: 'viz_in_pose', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'x' },
      { id: 'e_vi_2', source: 'viz_in_colors', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'room_colors' },
      { id: 'e_vi_3', source: 'viz_in_bat', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'battery' },
      { id: 'e_vi_4', source: 'viz_in_dust', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'dust' },
      { id: 'e_vi_5', source: 'viz_in_grid', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'grid' },
      { id: 'e_vi_6', source: 'viz_in_ranges', sourceHandle: 'out', target: 'three_d_scene_view', targetHandle: 'lidar_ranges' },

      { id: 'e_dm_1', source: 'dust_in', sourceHandle: 'out', target: 'capacity_threshold', targetHandle: 'dust' },
      { id: 'e_dm_2', source: 'capacity_threshold', sourceHandle: 'flag', target: 'halt_alert_state', targetHandle: 'flag' },

      { id: 'e_db_1', source: 'dock_in_beacon', sourceHandle: 'out', target: 'dock_detect_logic', targetHandle: 'beacon' },
      { id: 'e_db_2', source: 'battery_monitor_dock', sourceHandle: 'battery_status', target: 'dock_detect_logic', targetHandle: 'battery' },
      { id: 'e_db_3', source: 'dock_detect_logic', sourceHandle: 'docked', target: 'resume_scheduler', targetHandle: 'docked' },
      { id: 'e_db_4', source: 'dock_detect_logic', sourceHandle: 'docked', target: 'dock_out_state', targetHandle: 'in' }
    ]
  },
  {
    id: 'dem_particle_washing_machine',
    name: 'Washing Machine DEM Physics Lab',
    category: 'Particle Dynamics',
    difficulty: 'Expert',
    description: 'Deconstruct a multi-physics Discrete Element Method (DEM) model of a washing machine into its core components. Connect individual blocks representing drum geometry, particle systems, contact models, cloth elastic bonds, and fluid drag coupling.',
    nodes: [
      { id: 'rpm_val', type: 'Constant', position: { x: 50, y: 50 }, label: 'Drum RPM', params: { value: 45 } },
      { id: 'fill_val', type: 'Constant', position: { x: 50, y: 550 }, label: 'Water Fill Level', params: { value: 0.35 } },
      { id: 'const_two', type: 'Constant', position: { x: 1050, y: 400 }, label: 'Power Exponent', params: { value: 2 } },
      
      { id: 'dem_drum', type: 'DEM_DRUM', position: { x: 250, y: 50 }, label: 'DEM Drum Geometry', params: { drum_radius: 0.8 } },
      { id: 'dem_particles', type: 'DEM_PARTICLE_SYSTEM', position: { x: 550, y: 250 }, label: 'DEM Particle System', params: { num_sheets: 2, clothes_weight: 0.4, grid_rows: 4, grid_cols: 4, num_particles: 32, particle_radius: 0.05, particle_mass: 0.0125, gravity: 9.81 } },
      
      { id: 'hertz_contact', type: 'DEM_HERTZ_CONTACT', position: { x: 900, y: 50 }, label: 'Hertz Contact Model', params: { stiffness_normal: 500, damping_normal: 5, friction_coeff: 0.4 } },
      { id: 'bond_fabric', type: 'DEM_BOND_FABRIC', position: { x: 900, y: 250 }, label: 'Fabric Bond Model', params: { num_sheets: 2, grid_rows: 4, grid_cols: 4, bond_stiffness: 150, bond_damping: 5 } },
      { id: 'fluid_coupling', type: 'DEM_FLUID_COUPLING', position: { x: 900, y: 450 }, label: 'Fluid Phase Coupling', params: { drag_coeff: 0.8 } },
      
      { id: 'pow_block', type: 'VectorPow', position: { x: 1100, y: 250 }, label: 'Velocity Squared' },
      { id: 'sum_elements', type: 'SumElements', position: { x: 1300, y: 250 }, label: 'Sum of Squared Vel' },
      { id: 'ke_gain', type: 'GAIN', position: { x: 1450, y: 250 }, label: 'KE Factor (0.5 * m)', params: { gain: 0.05 } },
      { id: 'scope_ke', type: 'Scope', position: { x: 1650, y: 150 }, label: 'System Energies', params: { numSignals: 2, bufferSize: 1000 } }
    ],
    edges: [
      { id: 'de1', source: 'rpm_val', sourceHandle: 'out', target: 'dem_drum', targetHandle: 'rpm' },
      { id: 'de2', source: 'dem_drum', sourceHandle: 'drum_state', target: 'hertz_contact', targetHandle: 'drum_state' },
      { id: 'de3', source: 'dem_drum', sourceHandle: 'drum_state', target: 'fluid_coupling', targetHandle: 'drum_state' },
      { id: 'de4', source: 'dem_drum', sourceHandle: 'drum_state', target: 'dem_particles', targetHandle: 'drum_state' },
      
      { id: 'de5', source: 'dem_particles', sourceHandle: 'positions', target: 'hertz_contact', targetHandle: 'positions' },
      { id: 'de6', source: 'dem_particles', sourceHandle: 'velocities', target: 'hertz_contact', targetHandle: 'velocities' },
      { id: 'de7', source: 'dem_particles', sourceHandle: 'positions', target: 'bond_fabric', targetHandle: 'positions' },
      { id: 'de8', source: 'dem_particles', sourceHandle: 'velocities', target: 'bond_fabric', targetHandle: 'velocities' },
      { id: 'de9', source: 'dem_particles', sourceHandle: 'positions', target: 'fluid_coupling', targetHandle: 'positions' },
      { id: 'de10', source: 'dem_particles', sourceHandle: 'velocities', target: 'fluid_coupling', targetHandle: 'velocities' },
      
      { id: 'de11', source: 'fill_val', sourceHandle: 'out', target: 'fluid_coupling', targetHandle: 'fill_level' },
      { id: 'de12', source: 'hertz_contact', sourceHandle: 'contact_forces', target: 'dem_particles', targetHandle: 'contact_forces' },
      { id: 'de13', source: 'bond_fabric', sourceHandle: 'bond_forces', target: 'dem_particles', targetHandle: 'bond_forces' },
      { id: 'de14', source: 'fluid_coupling', sourceHandle: 'fluid_forces', target: 'dem_particles', targetHandle: 'fluid_forces' },
      
      { id: 'de15', source: 'dem_particles', sourceHandle: 'velocities', target: 'pow_block', targetHandle: 'in1' },
      { id: 'de16', source: 'const_two', sourceHandle: 'out', target: 'pow_block', targetHandle: 'in2' },
      { id: 'de17', source: 'pow_block', sourceHandle: 'out', target: 'sum_elements', targetHandle: 'in' },
      { id: 'de18', source: 'sum_elements', sourceHandle: 'out', target: 'ke_gain', targetHandle: 'u' },
      { id: 'de19', source: 'ke_gain', sourceHandle: 'y', target: 'scope_ke', targetHandle: 'in1' },
      { id: 'de20', source: 'dem_drum', sourceHandle: 'omega', target: 'scope_ke', targetHandle: 'in2' }
    ]
  },
  {
    id: 'dem_cfd_cosimulation',
    name: 'Washing Machine DEM-CFD Co-Simulation Lab',
    category: 'Particle Dynamics',
    difficulty: 'Expert',
    description: 'Simulate high-fidelity 2-way co-simulation between SPH fluid water solver and DEM fabric particles. Train an online neural surrogate learner on vibration and cleanliness telemetry to find the optimal drum speed.',
    nodes: [
      { id: 'rpm_val', type: 'Constant', position: { x: 50, y: 80 }, label: 'Drum RPM', params: { value: 55 } },
      { id: 'fill_val', type: 'Constant', position: { x: 50, y: 380 }, label: 'Water Fill Level', params: { value: 0.35 } },
      { id: 'dem_drum', type: 'DEM_DRUM', position: { x: 250, y: 80 }, label: 'DEM Drum Geometry', params: { drum_radius: 0.8 } },
      { id: 'cfd_sph', type: 'CFD_SPH_WATER_SOLVER', position: { x: 500, y: 220 }, label: 'CFD SPH Water Solver', params: { num_fluid_particles: 40, fluid_density: 1000, fluid_viscosity: 1.5, sph_smoothing_length: 0.12, sph_stiffness: 25 } },
      { id: 'dem_particles', type: 'DEM_PARTICLE_SYSTEM', position: { x: 780, y: 80 }, label: 'DEM Particle System', params: { num_sheets: 2, grid_rows: 4, grid_cols: 4, particle_radius: 0.05 } },
      { id: 'dem_cfd_coupler', type: 'DEM_CFD_COSIMULATION_INTERFACE', position: { x: 780, y: 380 }, label: 'CFD-DEM 2-Way Coupling', params: { drag_model: 'Gidaspow', drag_coeff: 0.8 } },
      { id: 'hertz_contact', type: 'DEM_HERTZ_CONTACT', position: { x: 1080, y: 80 }, label: 'Hertz Contact Model', params: { stiffness_normal: 500, damping_normal: 5, friction_coeff: 0.4 } },
      { id: 'bond_fabric', type: 'DEM_BOND_FABRIC', position: { x: 1080, y: 230 }, label: 'Fabric Bond Model', params: { num_sheets: 2, grid_rows: 4, grid_cols: 4, bond_stiffness: 150, bond_damping: 5 } },
      { id: 'fabric_analyzer', type: 'FABRIC_HARMONIC_ANALYZER', position: { x: 1380, y: 80 }, label: 'Fabric Harmonic Analyzer', params: { drum_mass: 15.0, suspension_stiffness: 8000 } },
      { id: 'surrogate_learner', type: 'CFD_DEM_SURROGATE_LEARNER', position: { x: 1380, y: 380 }, label: 'CFD-DEM Surrogate Learner', params: { learning_rate: 0.04, mode: 'training' } },
      { id: 'scope_vibration', type: 'Scope', position: { x: 1680, y: 80 }, label: 'Vibration Actual vs Pred', params: { numSignals: 2, bufferSize: 500 } },
      { id: 'scope_cleanliness', type: 'Scope', position: { x: 1680, y: 280 }, label: 'Cleanliness Actual vs Pred', params: { numSignals: 2, bufferSize: 500 } }
    ],
    edges: [
      { id: 'cde1', source: 'rpm_val', sourceHandle: 'out', target: 'dem_drum', targetHandle: 'rpm' },
      { id: 'cde2', source: 'rpm_val', sourceHandle: 'out', target: 'surrogate_learner', targetHandle: 'rpm' },
      { id: 'cde3', source: 'fill_val', sourceHandle: 'out', target: 'cfd_sph', targetHandle: 'fill_level' },
      { id: 'cde4', source: 'fill_val', sourceHandle: 'out', target: 'surrogate_learner', targetHandle: 'fill_level' },
      { id: 'cde5', source: 'dem_drum', sourceHandle: 'drum_state', target: 'cfd_sph', targetHandle: 'drum_state' },
      { id: 'cde6', source: 'dem_drum', sourceHandle: 'drum_state', target: 'dem_particles', targetHandle: 'drum_state' },
      { id: 'cde7', source: 'dem_drum', sourceHandle: 'drum_state', target: 'hertz_contact', targetHandle: 'drum_state' },
      { id: 'cde8', source: 'dem_drum', sourceHandle: 'drum_state', target: 'dem_cfd_coupler', targetHandle: 'drum_state' },
      { id: 'cde9', source: 'dem_drum', sourceHandle: 'drum_state', target: 'fabric_analyzer', targetHandle: 'drum_state' },
      { id: 'cde10', source: 'dem_particles', sourceHandle: 'positions', target: 'dem_cfd_coupler', targetHandle: 'dem_positions' },
      { id: 'cde11', source: 'dem_particles', sourceHandle: 'velocities', target: 'dem_cfd_coupler', targetHandle: 'dem_velocities' },
      { id: 'cde12', source: 'cfd_sph', sourceHandle: 'fluid_positions', target: 'dem_cfd_coupler', targetHandle: 'fluid_positions' },
      { id: 'cde13', source: 'cfd_sph', sourceHandle: 'fluid_velocities', target: 'dem_cfd_coupler', targetHandle: 'fluid_velocities' },
      { id: 'cde14', source: 'dem_particles', sourceHandle: 'positions', target: 'hertz_contact', targetHandle: 'positions' },
      { id: 'cde15', source: 'dem_particles', sourceHandle: 'velocities', target: 'hertz_contact', targetHandle: 'velocities' },
      { id: 'cde16', source: 'dem_particles', sourceHandle: 'positions', target: 'bond_fabric', targetHandle: 'positions' },
      { id: 'cde17', source: 'dem_particles', sourceHandle: 'velocities', target: 'bond_fabric', targetHandle: 'velocities' },
      { id: 'cde18', source: 'hertz_contact', sourceHandle: 'contact_forces', target: 'dem_particles', targetHandle: 'contact_forces' },
      { id: 'cde19', source: 'bond_fabric', sourceHandle: 'bond_forces', target: 'dem_particles', targetHandle: 'bond_forces' },
      { id: 'cde20', source: 'dem_cfd_coupler', sourceHandle: 'dem_coupling_forces', target: 'dem_particles', targetHandle: 'fluid_forces' },
      { id: 'cde21', source: 'dem_cfd_coupler', sourceHandle: 'fluid_coupling_forces', target: 'cfd_sph', targetHandle: 'coupling_forces' },
      { id: 'cde22', source: 'dem_particles', sourceHandle: 'positions', target: 'fabric_analyzer', targetHandle: 'fabric_positions' },
      { id: 'cde23', source: 'dem_particles', sourceHandle: 'velocities', target: 'fabric_analyzer', targetHandle: 'fabric_velocities' },
      { id: 'cde24', source: 'dem_cfd_coupler', sourceHandle: 'fluid_coupling_forces', target: 'fabric_analyzer', targetHandle: 'fluid_forces' },
      { id: 'cde25', source: 'fabric_analyzer', sourceHandle: 'vibration_amplitude', target: 'surrogate_learner', targetHandle: 'vibration_amp' },
      { id: 'cde26', source: 'dem_particles', sourceHandle: 'cleanliness', target: 'surrogate_learner', targetHandle: 'cleanliness' },
      { id: 'cde27', source: 'fabric_analyzer', sourceHandle: 'vibration_amplitude', target: 'scope_vibration', targetHandle: 'in1' },
      { id: 'cde28', source: 'surrogate_learner', sourceHandle: 'predicted_vibration', target: 'scope_vibration', targetHandle: 'in2' },
      { id: 'cde29', source: 'dem_particles', sourceHandle: 'cleanliness', target: 'scope_cleanliness', targetHandle: 'in1' },
      { id: 'cde30', source: 'surrogate_learner', sourceHandle: 'predicted_cleanliness', target: 'scope_cleanliness', targetHandle: 'in2' },
      { id: 'cde31', source: 'cfd_sph', sourceHandle: 'drum_fluid_torque', target: 'surrogate_learner', targetHandle: 'fluid_torque' },
      { id: 'cde32', source: 'cfd_sph', sourceHandle: 'slosh_intensity', target: 'surrogate_learner', targetHandle: 'slosh_intensity' }
    ]
  }
];

const XBRIDGES_LEARNING_LAB_STEPS: Record<string, any[]> = {
  'robot_vacuum_learning_model': [
    {
      title: '1. Explore the Subsystem Architecture',
      instructions: 'Welcome to the Autonomous Vacuum Cleaner Learning Lab! This model is organized into hierarchical subsystems just like in MATLAB/Simulink.\n\nDouble-click on the Robot Localization or Actuators & HW subsystems to inspect their inner blocks. Double-click "ROOT PROJECT" in the breadcrumbs bar at the top to go back up.',
      objectives: [
        { id: 'run_engine', label: 'Click Run Engine to start simulation', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '2. Launch the 3D Scene View',
      instructions: 'Let\'s view the vacuum cleaner co-simulation in 3D!\n\nEnter the "3D Visualization" subsystem and double-click the "3D Scene View" block to open the premium 3D co-simulation window.',
      objectives: [
        { 
          id: 'open_3d_view', 
          label: 'Open the 3D Scene Viewer window', 
          check: (wState: any) => wState.openScopes.includes('three_d_scene_view')
        }
      ]
    },
    {
      title: '3. Complete Room Cleanup',
      instructions: 'Excellent! The interactive 3D viewer is open. You can left-click and drag to rotate the camera in 3D, and scroll to zoom.\n\nKeep the simulation running to watch the EKF filter localize the robot, the coverage planner path-plan sweeps, and see the dirt particles get cleaned up in 3D!',
      objectives: [
        {
          id: 'cleanup_progress',
          label: 'Clean up at least 5% of the room',
          check: (wState: any) => {
            const vizNode = wState.nodes.find((n: any) => n.id === 'three_d_scene_view');
            const grid = vizNode?.data?.state?.grid;
            let cleaned = 0, total = 0;
            if (grid && Array.isArray(grid)) {
              for (let r=0; r<30; r++) {
                for (let c=0; c<30; c++) {
                  total++;
                  if (grid[r][c] > 0) cleaned++;
                }
              }
            }
            return total > 0 ? (cleaned / total) >= 0.05 : false;
          }
        }
      ]
    }
  ],
  'lms_sys_id': [
    {
      title: '1. Inspect the LMS Block',
      instructions: 'Welcome to the LMS System Identification Lab! Here, you will teach the LMS block to identify the weights of a 2-tap unknown system (w1 = 0.8 and w2 = 0.4).\n\nFirst, click on the LMS Learner block (highlighted in pulsing gold) to inspect its properties and read the recommended sampling time notes in the properties panel.',
      targetNodeId: 'lms_filter',
      objectives: [
        { id: 'select_lms', label: 'Select the LMS Learner block', check: (wState: any) => wState.selectedNodeId === 'lms_filter' }
      ]
    },
    {
      title: '2. Run the Engine',
      instructions: 'Great! The properties panel details the math and sampling times. To start learning online, the system needs continuous excitation.\n\nClick the green Run Engine button in the top toolbar to start the real-time simulation.',
      objectives: [
        { id: 'run_engine', label: 'Click Run Engine to start simulation', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Monitor the Scopes',
      instructions: 'The engine is simulating! To see adaptation in action, we need to inspect the signals.\n\nClick the maximize icon on the Weights Scope and Error Scope (located in the top-right of those blocks) to open their floating scope windows.',
      targetNodeId: 'scope_weights',
      objectives: [
        { 
          id: 'open_scopes', 
          label: 'Open both Error Scope and Weights Scope windows', 
          check: (wState: any) => wState.openScopes.includes('scope_error') && wState.openScopes.includes('scope_weights') 
        }
      ]
    },
    {
      title: '4. Weight Convergence',
      instructions: 'Look at the Weights Scope. w1 (w_vec[0]) and w2 (w_vec[1]) start at 0.0 and converge to the true coefficients (0.8 and 0.4). The estimation error (err) on the Error Scope drops to 0.\n\nKeep the engine running until the first weight w1 converges to at least 0.75.',
      objectives: [
        { 
          id: 'weight_converge', 
          label: 'Wait for w1 to reach >= 0.75', 
          check: (wState: any) => {
            const lmsNode = wState.nodes.find((n: any) => n.id === 'lms_filter');
            const w1Val = lmsNode?.data?.state?.w1 ?? 0;
            return w1Val >= 0.75;
          } 
        }
      ]
    },
    {
      title: '5. Adjust parameters in real-time',
      instructions: 'Fantastic! The LMS filter successfully identified the path weights. Now let\'s learn how parameters affect the learning rate.\n\nSelect the LMS Learner block and change the learning rate lr parameter to 0.1 or higher. Notice how it speeds up convergence, or makes the filter diverge if the learning rate is too large.',
      targetNodeId: 'lms_filter',
      objectives: [
        { 
          id: 'change_lr', 
          label: 'Change the LMS learning rate (lr) to >= 0.1', 
          check: (wState: any) => {
            const lmsNode = wState.nodes.find((n: any) => n.id === 'lms_filter');
            return (lmsNode?.data?.params?.lr ?? 0.05) >= 0.1;
          } 
        }
      ]
    }
  ],
  'neural_approx': [
    {
      title: '1. Select the Neural Learner',
      instructions: 'Welcome to the Neural Function Approximation Lab! A single neuron using online gradient descent can learn non-linear relationships.\n\nTo start, select the Online Learner block to inspect its parameters and mathematical description.',
      targetNodeId: 'learning_neuron',
      objectives: [
        { id: 'select_learner', label: 'Select the Online Learner block', check: (wState: any) => wState.selectedNodeId === 'learning_neuron' }
      ]
    },
    {
      title: '2. Excite and Update',
      instructions: 'To train the weights and bias of the neuron, we must simulate the system. Click the Run Engine button in the top toolbar to begin the learning process.',
      objectives: [
        { id: 'run_engine', label: 'Run the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Compare System Responses',
      instructions: 'Let\'s see how closely the neural network can approximate the target function.\n\nOpen the Response Comparison scope window by clicking its maximize button.',
      targetNodeId: 'scope_compare',
      objectives: [
        { 
          id: 'open_scope_compare', 
          label: 'Open the Response Comparison scope window', 
          check: (wState: any) => wState.openScopes.includes('scope_compare') 
        }
      ]
    },
    {
      title: '4. Gradient Descent Convergence',
      instructions: 'Online backpropagation updates the weights to minimize approximation error. Watch the target output and learner output converge in the scope!\n\nWait until the learned weight w1 reaches at least 0.6 (approaching the target value of 0.7).',
      objectives: [
        { 
          id: 'neuron_converge', 
          label: 'Wait for w1 to reach >= 0.6', 
          check: (wState: any) => {
            const neuronNode = wState.nodes.find((n: any) => n.id === 'learning_neuron');
            const w1Val = neuronNode?.data?.state?.w1 ?? 0;
            return w1Val >= 0.6;
          } 
        }
      ]
    },
    {
      title: '5. Experiment with Simulation Step Size',
      instructions: 'The simulation step size (dt) is crucial for discretized learning models. If dt is too large, the gradient updates oscillate.\n\nStop the engine, change the Time Step (Δt) in the top toolbar to a different value (e.g. 0.01s or 0.05s) to explore its impact, then restart the simulation.',
      objectives: [
        { 
          id: 'change_dt', 
          label: 'Change the simulation time step (Δt) away from 0.02s', 
          check: (wState: any) => {
            return Math.abs(wState.fixedStep - 0.02) > 0.001;
          } 
        }
      ]
    }
  ],
  'rl_control': [
    {
      title: '1. Select the Q-Learning Agent',
      instructions: 'Welcome to the Reinforcement Learning Control Lab! In this module, a Q-learning agent learns to regulate a physical plant (integrator) to a setpoint of 1.0. It receives a negative error reward.\n\nFirst, select the Q-Learning Agent block to inspect its reinforcement parameters (alpha, gamma, epsilon).',
      targetNodeId: 'rl_agent',
      objectives: [
        { id: 'select_agent', label: 'Select the Q-Learning Agent block', check: (wState: any) => wState.selectedNodeId === 'rl_agent' }
      ]
    },
    {
      title: '2. Run closed-loop learning',
      instructions: 'Start the simulation! The agent will start choosing control actions [-1, 0, 1] based on its error state and exploration rate, updating its Q-table online.',
      objectives: [
        { id: 'run_engine', label: 'Run the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Open the System Monitor',
      instructions: 'Let\'s view the closed-loop system behavior in real-time.\n\nOpen the RL System Monitor scope to watch the reference setpoint, control actions, and plant output.',
      targetNodeId: 'scope_rl',
      objectives: [
        { 
          id: 'open_scope_rl', 
          label: 'Open the RL System Monitor scope window', 
          check: (wState: any) => wState.openScopes.includes('scope_rl') 
        }
      ]
    },
    {
      title: '4. Plant Regulation Convergence',
      instructions: 'At first, exploration (random action jumps) causes the plant to oscillate. As the agent learns the optimal policy, it stabilizes the plant output near the 1.0 reference.\n\nKeep simulating until the plant output settles at >= 0.85.',
      objectives: [
        { 
          id: 'rl_converge', 
          label: 'Wait for plant output to reach >= 0.85', 
          check: (wState: any) => {
            const plantNode = wState.nodes.find((n: any) => n.id === 'plant');
            const outVal = plantNode?.data?.state;
            const numericVal = typeof outVal === 'object' ? (outVal?.out ?? 0) : Number(outVal ?? 0);
            return numericVal >= 0.85;
          } 
        }
      ]
    },
    {
      title: '5. Tune Exploration Rate',
      instructions: 'Great! You have trained an RL controller online. Now let\'s see the effect of exploration.\n\nSelect the Q-learning block and change epsilon (exploration rate) or alpha (learning rate) in the Properties panel. Higher epsilon increases exploration actions, while lower epsilon exploits learned policies.',
      targetNodeId: 'rl_agent',
      objectives: [
        { 
          id: 'change_rl_param', 
          label: 'Modify alpha or epsilon in properties', 
          check: (wState: any) => {
            const agentNode = wState.nodes.find((n: any) => n.id === 'rl_agent');
            const a = agentNode?.data?.params?.alpha ?? 0.1;
            const e = agentNode?.data?.params?.epsilon ?? 0.1;
            return Math.abs(a - 0.1) > 0.001 || Math.abs(e - 0.1) > 0.001;
          } 
        }
      ]
    }
  ],
  'pid_control_sim': [
    {
      title: '1. Inspect the PID Controller',
      instructions: 'Welcome to the Classical Closed-Loop PID Control Lab! In this scenario, we use a basic PID controller to regulate a physical plant (Integrator) to follow a square wave reference setpoint.\n\nFirst, click on the PID Controller block (highlighted in pulsing gold) to inspect its proportional (Kp), integral (Ki), and derivative (Kd) parameters in the properties panel.',
      targetNodeId: 'pid_controller',
      objectives: [
        { id: 'select_pid', label: 'Select the PID Controller block', check: (wState: any) => wState.selectedNodeId === 'pid_controller' }
      ]
    },
    {
      title: '2. Run the Engine',
      instructions: 'Great! To see the controller drive control effort in real-time, click the green Run Engine button in the top toolbar to start the continuous simulation.',
      objectives: [
        { id: 'run_engine', label: 'Click Run Engine to start simulation', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Monitor Reference Tracking',
      instructions: 'The loop is active! To observe the signals, open the Closed-Loop Scope window (click the maximize icon at its top right). It plots the Setpoint reference, plant output, and controller effort.',
      targetNodeId: 'scope_tracking',
      objectives: [
        { 
          id: 'open_scope_tracking', 
          label: 'Open the Closed-Loop Scope window', 
          check: (wState: any) => wState.openScopes.includes('scope_tracking') 
        }
      ]
    },
    {
      title: '4. Settle-Time Performance',
      instructions: 'Look at the scope! The plant output follows the square wave setpoint, with a slight overshoot and settling delay after each step change. Let the simulation run for a few seconds to track multiple setpoint cycles.',
      objectives: [
        { 
          id: 'time_elapsed', 
          label: 'Wait for simulation time to reach >= 5.0 seconds', 
          check: (wState: any) => {
            const scopeNode = wState.nodes.find((n: any) => n.id === 'scope_tracking');
            const history = scopeNode?.data?.state?.history || [];
            if (history.length === 0) return false;
            const lastSample = history[history.length - 1];
            return (lastSample?.t ?? 0) >= 5.0;
          } 
        }
      ]
    },
    {
      title: '5. Gain Tuning',
      instructions: 'Excellent! Now let\'s see the effect of tuning. Select the PID Controller block and increase the Proportional Gain Kp to 5.0 or higher in properties. Notice on the scope how the rise time decreases and tracking becomes sharper!',
      targetNodeId: 'pid_controller',
      objectives: [
        { 
          id: 'change_kp', 
          label: 'Increase Proportional Gain (Kp) to >= 4.0', 
          check: (wState: any) => {
            const pidNode = wState.nodes.find((n: any) => n.id === 'pid_controller');
            return (pidNode?.data?.params?.Kp ?? 1.0) >= 4.0;
          } 
        }
      ]
    }
  ],
  'robot_vacuum_twin': [
    {
      title: '1. Inspect the Robot Environment',
      instructions: 'Welcome to the Modular Robot Vacuum Digital Twin Lab! Unlike a single black-box block, here the system is split into connected modules: Navigation, Kinematics, Wheel PI, Left/Right Motors, Physical Dynamics (Plant), Simulation Environment (Canvas), Odometry, Sensor Fusion, and SLAM.\n\nFirst, select the Simulation Environment (Canvas) block (highlighted in gold) to view its parameters in the sidebar.',
      targetNodeId: 'robot_env',
      objectives: [
        { id: 'select_twin', label: 'Select the Simulation Environment block', check: (wState: any) => wState.selectedNodeId === 'robot_env' }
      ]
    },
    {
      title: '2. Start the Simulation',
      instructions: 'Let\'s run the closed-loop modular simulation! Click the green Run Engine button to start. You will see signals flowing between the controllers, motors, chassis plant, and SLAM map in real-time as the robot starts exploring.',
      objectives: [
        { id: 'run_engine', label: 'Start the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Open the Pose Monitor Scope',
      instructions: 'Let\'s watch the estimated robot trajectory. Open the Pose Monitor scope by clicking the maximize icon on the top-right of the scope block to track X, Y, and Theta estimated coordinates.',
      targetNodeId: 'scope_pose',
      objectives: [
        { id: 'open_scope', label: 'Open the Pose Monitor scope window', check: (wState: any) => wState.openScopes.includes('scope_pose') }
      ]
    },
    {
      title: '4. Observe Autonomous Cleaning Sweep',
      instructions: 'Watch the Simulation Environment block update its live 2D virtual twin as it runs. The motors turn, the dynamics plant integrates the movement, the raycast LiDAR finds obstacles, and the SLAM block builds a grid map.\n\nLet the robot explore the room until it completes at least 10 trajectory path trail points.',
      objectives: [
        { 
          id: 'traverse_room', 
          label: 'Let the robot explore (wait for trail points >= 10)', 
          check: (wState: any) => {
            const envNode = wState.nodes.find((n: any) => n.id === 'robot_env');
            const trail = envNode?.data?.state?.trail || [];
            return trail.length >= 10;
          } 
        }
      ]
    },
    {
      title: '5. Return-to-Dock Action',
      instructions: 'Great job! The modular system successfully executed control, odometry, and SLAM feedback. Let\'s command it to return to its charging dock at (0, -2.8).\n\nSelect the Cleaning Mode constant block and change its value to 5 (ReturnToDock) to command the navigation planner to guide the robot home.',
      targetNodeId: 'mode_select',
      objectives: [
        { 
          id: 'change_mode', 
          label: 'Change Cleaning Mode Constant to 5', 
          check: (wState: any) => {
            const modeNode = wState.nodes.find((n: any) => n.id === 'mode_select');
            return Number(modeNode?.data?.params?.value) === 5;
          } 
        }
      ]
    }
  ],
  'robot_vacuum_full_system': [
    {
      title: '1. Inspect EKF Localization',
      instructions: 'Welcome to the Decoupled Autonomous Vacuum Navigation and Mapping System Lab! Here, the system is fully decoupled into 13 individual subcomponents: coverage path planner, global path planner, obstacle avoidance steering constraints, motion controller, motor command PI regulator, dynamics plant, sensors, and localization filters.\n\nFirst, click on the EKF Localization block (highlighted in pulsing gold) to inspect its filter gain and active EKF fusion algorithm in the properties panel.',
      targetNodeId: 'robot_localization',
      objectives: [
        { id: 'select_loc', label: 'Select the EKF Localization block', check: (wState: any) => wState.selectedNodeId === 'robot_localization' }
      ]
    },
    {
      title: '2. Run Co-Simulation',
      instructions: 'Let\'s activate the co-simulation! Click the green Run Engine button in the top toolbar. You will see signals propagating across all 13 sub-blocks as the robot starts executing its boustrophedon (lawnmower) sweep coverage path.',
      objectives: [
        { id: 'run_engine', label: 'Start the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Open Pose Monitor Scope',
      instructions: 'To verify EKF tracking performance against ground truth dynamics, open the Pose Monitor scope block.',
      targetNodeId: 'scope_pose',
      objectives: [
        { id: 'open_scope', label: 'Open the Pose Monitor scope window', check: (wState: any) => wState.openScopes.includes('scope_pose') }
      ]
    },
    {
      title: '4. Track Coverage Performance',
      instructions: 'Watch the SLAM Mapping block build the occupancy grid and the robot sweep the floor. Let the simulation run for a few seconds so that the robot traverses the environment and covers at least 15 trajectory trail points.',
      objectives: [
        { 
          id: 'traverse_room', 
          label: 'Let the robot explore (wait for trail points >= 15)', 
          check: (wState: any) => {
            const vizNode = wState.nodes.find((n: any) => n.id === 'robot_visualizer');
            const trail = vizNode?.data?.state?.trail || [];
            return trail.length >= 15;
          } 
        }
      ]
    },
    {
      title: '5. Return-to-Dock Action',
      instructions: 'Excellent! The decoupled system successfully closed the loop from SLAM occupancy grids to motor PI controllers. Now, let\'s command the robot to return home to its charging dock at (0, -2.8).\n\nSelect the Cleaning Mode constant block and change its value to 5 (ReturnToDock) to command the planner to return home.',
      targetNodeId: 'mode_select',
      objectives: [
        { 
          id: 'change_mode', 
          label: 'Change Cleaning Mode Constant to 5', 
          check: (wState: any) => {
            const modeNode = wState.nodes.find((n: any) => n.id === 'mode_select');
            return Number(modeNode?.data?.params?.value) === 5;
          } 
        }
      ]
    }
  ],
  'dem_particle_washing_machine': [
    {
      title: '1. Inspect the DEM Particles Block',
      instructions: 'Welcome to the Multi-Physics DEM Washing Machine Simulation Lab! In this lab, we have decomposed the monolithic washing machine digital twin into individual modular blocks: Geometry, Particles, Hertzian Contact, Fabric Bonds, and Fluid Coupling.\n\nFirst, select the DEM Particle System block to inspect its physical parameters (particle radius, mass, gravity, and quantity) in the properties panel.',
      targetNodeId: 'dem_particles',
      objectives: [
        { id: 'select_particles', label: 'Select the DEM Particle System block', check: (wState: any) => wState.selectedNodeId === 'dem_particles' }
      ]
    },
    {
      title: '2. Start the Simulation Solver',
      instructions: 'Let\'s run the Discrete Element Method (DEM) engine. Click the green Run Engine button in the top toolbar to begin the time-stepping co-simulation solver.',
      objectives: [
        { id: 'run_engine', label: 'Start the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Open the Energy Scope',
      instructions: 'The physics solver is executing! Let\'s monitor the live signal trace of the system energies.\n\nClick the maximize icon on the System Energies scope block (at the top right of the block) to open the floating scope window.',
      targetNodeId: 'scope_ke',
      objectives: [
        { id: 'open_scope_ke', label: 'Open the System Energies scope window', check: (wState: any) => wState.openScopes.includes('scope_ke') }
      ]
    },
    {
      title: '4. Observe Multi-Physics Dynamics',
      instructions: 'Watch the real-time animations on the block nodes! The blue lines represent elastic cloth bonds, which stretch and stress. The sloshing water level is shown at the bottom of the drum.\n\nKeep the engine simulating until the elapsed time reaches at least 1.0s to let the system stabilize.',
      objectives: [
        { 
          id: 'simulate_a_bit', 
          label: 'Let the solver run (wait for time >= 1.0s)', 
          check: (wState: any) => {
            const scopeNode = wState.nodes.find((n: any) => n.id === 'scope_ke');
            const history = scopeNode?.data?.state?.history || [];
            if (history.length === 0) return false;
            const lastSample = history[history.length - 1];
            return (lastSample?.t ?? 0) >= 1.0;
          }
        }
      ]
    },
    {
      title: '5. Increase Drum Speed (RPM)',
      instructions: 'Great job! Now let\'s observe centrifugal acceleration. Select the Drum RPM constant block, and increase its value to 80 RPM or higher. Notice how the particles climb higher along the drum walls due to centripetal and friction forces!',
      targetNodeId: 'rpm_val',
      objectives: [
        { 
          id: 'change_rpm', 
          label: 'Set Drum RPM constant to >= 80', 
          check: (wState: any) => {
            const rpmNode = wState.nodes.find((n: any) => n.id === 'rpm_val');
            return Number(rpmNode?.data?.params?.value) >= 80;
          } 
        }
      ]
    }
  ],
  'dem_cfd_cosimulation': [
    {
      title: '1. Inspect SPH Fluid Phase',
      instructions: 'Welcome to the Washing Machine SPH CFD-DEM Co-Simulation Lab! This workspace couples a Smoothed Particle Hydrodynamics (SPH) 2D fluid solver with DEM fabric sheets.\n\nFirst, select the CFD SPH Water Solver block to inspect its parameters in the properties panel.',
      targetNodeId: 'cfd_sph',
      objectives: [
        { id: 'select_sph', label: 'Select the CFD SPH Water Solver block', check: (wState: any) => wState.selectedNodeId === 'cfd_sph' }
      ]
    },
    {
      title: '2. Run Coupled Solver',
      instructions: 'Let\'s run the coupled execution loop. Click the green Run Engine button in the top toolbar to begin the time-stepping co-simulation solver.',
      objectives: [
        { id: 'run_engine_coupled', label: 'Start the simulation engine', check: (wState: any) => wState.isSimulating }
      ]
    },
    {
      title: '3. Trace Suspension Vibration',
      instructions: 'The coupled solver is running, and fluid-structure interaction forces are affecting the drum! Let\'s monitor our suspension vibrations.\n\nOpen the Vibration Actual vs Pred scope block by clicking its maximize button.',
      targetNodeId: 'scope_vibration',
      objectives: [
        { id: 'open_scope_vib', label: 'Open the Vibration scope window', check: (wState: any) => wState.openScopes.includes('scope_vibration') }
      ]
    },
    {
      title: '4. Monitor Surrogate Learning',
      instructions: 'Select the CFD-DEM Surrogate Learner block. Watch as it runs Stochastic Gradient Descent (SGD) online. The prediction error will decrease as the drum rotates.\n\nKeep the engine simulating until the elapsed time reaches at least 2.0s to allow the surrogate network to train.',
      targetNodeId: 'surrogate_learner',
      objectives: [
        { 
          id: 'simulate_coupled', 
          label: 'Let the solver run (wait for time >= 2.0s)', 
          check: (wState: any) => {
            const scopeNode = wState.nodes.find((n: any) => n.id === 'scope_vibration');
            const history = scopeNode?.data?.state?.history || [];
            if (history.length === 0) return false;
            const lastSample = history[history.length - 1];
            return (lastSample?.t ?? 0) >= 2.0;
          }
        }
      ]
    },
    {
      title: '5. Set Optimal RPM',
      instructions: 'Fantastic! The surrogate learning model has trained and recommends the optimal speed to maximize cleaning and minimize vibrations.\n\nSelect the Drum RPM constant block, and set its value between 50 and 70 RPM to apply the recommended optimal operating speed.',
      targetNodeId: 'rpm_val',
      objectives: [
        { 
          id: 'set_opt_rpm', 
          label: 'Set Drum RPM constant to [50, 70]', 
          check: (wState: any) => {
            const rpmNode = wState.nodes.find((n: any) => n.id === 'rpm_val');
            const val = Number(rpmNode?.data?.params?.value);
            return val >= 50 && val <= 70;
          }
        }
      ]
    }
  ]
};

export const XbridgesWorkspace: React.FC<{
  initialNodes?: any[];
  initialEdges?: any[];
  availableVariables?: any[];
  tickMs?: number; // Added to sync with State Machine
  onBack?: () => void;
  onSave?: (nodes: any[], edges: any[]) => void;
  onSaveAll?: () => void;
  onLaunchDoe?: () => void;
  initialSelectedNodeId?: string | null;
  sharedClipboard?: { nodes: any[]; edges: any[]; sourceFileId: string } | null;
  onClipboardChange?: (clipboard: { nodes: any[]; edges: any[]; sourceFileId: string } | null) => void;
  fileId?: string;
  workspaceFiles?: any[];
  coSimEngine?: any;
  isSmSimulating?: boolean;
  simulationTime?: number;
}> = ({
  initialNodes = [],
  initialEdges = [],
  availableVariables = [],
  tickMs,
  onBack,
  onSave,
  onSaveAll,
  onLaunchDoe,
  initialSelectedNodeId,
  sharedClipboard,
  onClipboardChange,
  fileId,
  workspaceFiles,
  coSimEngine,
  isSmSimulating = false,
  simulationTime = 0
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [localClipboard, setLocalClipboard] = useState<{
    nodes: any[];
    edges: any[];
    sourceFileId: string;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = React.useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  const [simLimitInput, setSimLimitInput] = useState('');
  const simLimitRef = React.useRef<number | null>(null);
  const isSpacePressedRef = React.useRef(false);
  const spaceComboUsedRef = React.useRef(false);

  useEffect(() => {
    const val = parseFloat(simLimitInput);
    simLimitRef.current = (!isNaN(val) && val > 0) ? val : null;
  }, [simLimitInput]);

  // Track whether we are the ones who last changed the data (so we don't re-import our own save)
  const isSavingRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialNodesRef = React.useRef(initialNodes);
  const initialEdgesRef = React.useRef(initialEdges);

  // Debounced save: fire onSave 300ms after changes settle, but never re-import changes we caused
  useEffect(() => {
    // Don't start the timer while a copy-drag is in progress; we'll save manually on mouseup
    if (isDraggingCopyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (onSave) {
        isSavingRef.current = true;
        onSave(nodes, edges);
        // Allow inward sync again after two animation frames
        requestAnimationFrame(() => requestAnimationFrame(() => { isSavingRef.current = false; }));
      }
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, onSave]);

  // Inward sync: only apply when initialNodes/initialEdges change AND we didn't cause the change
  useEffect(() => {
    // Skip on first mount (initialNodesRef already holds this value)
    if (initialNodes === initialNodesRef.current) return;
    initialNodesRef.current = initialNodes;
    // If we are currently saving, this change came from our own onSave callback — skip it
    if (isSavingRef.current) return;
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (initialEdges === initialEdgesRef.current) return;
    initialEdgesRef.current = initialEdges;
    if (isSavingRef.current) return;
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);




  const [isLibCollapsed, setIsLibCollapsed] = useState(false);
  const [isPropsCollapsed, setIsPropsCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [searchMenuPos, setSearchMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'library' | 'labs'>('library');
  const [diagnostics, setDiagnostics] = useState<ModelDiagnostic[]>([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Tutorial / Learning Lab State
  const [activeLabId, setActiveLabId] = useState<string | null>(null);
  const [isLabGuideMinimized, setIsLabGuideMinimized] = useState(false);

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
        const docRes = await electron.ipcRenderer.invoke('3dx-search-documents', { query: 'xbridges' });
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
        fileName: `xbridges_workspace_${new Date().toISOString().slice(0,10)}.json`,
        content: JSON.stringify({ nodes, edges }, null, 2),
        encoding: 'utf8',
        mimeType: 'application/json',
        targetWorkspaceId: selectedTdxWorkspace,
        title: 'XBridges Workspace Sync',
        description: `Uploaded from XBridges Advanced Logic Suite — ${new Date().toLocaleString()}`
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
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedObjectives, setCompletedObjectives] = useState<Record<string, boolean>>({});
  const [labCompleted, setLabCompleted] = useState(false);

  // Hierarchical Navigation State
  const [viewPath, setViewPath] = useState<string[]>(['root']);
  const currentParentId = viewPath[viewPath.length - 1];

  const [solverType, setSolverType] = useState<'euler' | 'ode2' | 'ode3' | 'rk4' | 'ode5' | 'ode23' | 'ode45'>('rk4');
  const [edgeType, setEdgeType] = useState<'default' | 'straight' | 'smoothstep'>('smoothstep');
  const initialStep = tickMs ? tickMs / 1000 : 0.02;
  const [fixedStep, setFixedStep] = useState(initialStep);
  const [stepSizeInput, setStepSizeInput] = useState(String(initialStep));

  // Update fixedStep if tickMs changes from parent
  useEffect(() => {
    if (tickMs) {
      const step = tickMs / 1000;
      setFixedStep(step);
      setStepSizeInput(String(step));
    }
  }, [tickMs]);
  const engineRef = React.useRef<XbridgesEngine | null>(null);
  const timeRef = React.useRef(0);
  const activeSimulating = isSimulating || (!!coSimEngine && isSmSimulating);
  const activeTime = coSimEngine && isSmSimulating ? simulationTime : timeRef.current;

  // Sync with background co-simulation engine when running via State Machine
  useEffect(() => {
    if (!coSimEngine || !isSmSimulating) return;

    let frameId: number;
    let throttle = 0;

    const sync = () => {
      throttle++;
      if (throttle % 4 === 0) {
        setNodes(nds => nds.map(n => {
          const engineBlock = coSimEngine['blockMap']?.get(n.id);
          if (engineBlock && n.type === 'xblock') {
            return { ...n, data: { ...n.data, state: engineBlock.state } };
          }
          return n;
        }));
      }
      frameId = requestAnimationFrame(sync);
    };

    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [coSimEngine, isSmSimulating, setNodes]);

  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Right-click drag-to-copy state
  const [rightClickDrag, setRightClickDrag] = useState<{
    clonedNodeId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);
  const isDraggingCopyRef = React.useRef(false);

  useEffect(() => {
    if (!rightClickDrag) return;
    isDraggingCopyRef.current = true;

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
        isDraggingCopyRef.current = false;
        setRightClickDrag(null);
        // Fire one save after copy-drag ends
        if (onSave) {
          isSavingRef.current = true;
          onSave(nodesRef.current, edgesRef.current);
          requestAnimationFrame(() => requestAnimationFrame(() => { isSavingRef.current = false; }));
        }
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
  }, [rightClickDrag, reactFlowInstance, setNodes, onSave]);

  // Select and focus programmatic node from V-Lab
  useEffect(() => {
    if (initialSelectedNodeId && reactFlowInstance) {
      setSelectedNodeId(initialSelectedNodeId);
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === initialSelectedNodeId })));
      const node = nodes.find(n => n.id === initialSelectedNodeId);
      if (node) {
        setTimeout(() => {
          reactFlowInstance.setCenter(node.position.x + 70, node.position.y + 40, { zoom: 1.2, duration: 800 });
        }, 150);
      }
    }
  }, [initialSelectedNodeId, reactFlowInstance, nodes]);

  // Trigger window resize and fitView to handle initial container measurements,
  // tab transitions, or dimensions rendering as 0 initially.
  useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
    };

    // Staggered resize events to ensure React Flow catches the container's final size
    triggerResize();
    const t1 = setTimeout(triggerResize, 50);
    const t2 = setTimeout(triggerResize, 150);
    const t3 = setTimeout(triggerResize, 300);
    const t4 = setTimeout(triggerResize, 600);
    const t5 = setTimeout(triggerResize, 1200);

    // Fit view after a short delay on initial mount to ensure diagram is visible
    let t6: NodeJS.Timeout;
    if (reactFlowInstance) {
      t6 = setTimeout(() => {
        reactFlowInstance.fitView();
      }, 200);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      if (t6) clearTimeout(t6);
    };
  }, [reactFlowInstance]);

  // Use a ResizeObserver on the workspace container to handle resizing of sidebar,
  // properties panel, or workspace switching in real time.
  useEffect(() => {
    const container = document.getElementById('xbridges-workspace-container');
    if (!container) return;

    const observer = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Sources': true,
    'Continuous': true,
    'Logic Gates': true,
    'Sequential': true,
    'Sinks': true
  });

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Sync edge animation with simulation state
  useEffect(() => {
    setEdges(eds => eds.map(e => ({ ...e, animated: isSimulating })));
  }, [isSimulating, setEdges]);

  // Real-time Simulation Loop
  useEffect(() => {
    let animationFrameId: number;
    let updateThrottle = 0;

    if (isSimulating) {
      // Rebuild engine model on start - use BLOCK_LIBRARY to get live execute() functions
      const model = {
        blocks: nodes.map(n => {
          const d = n.data as any;
          // Try to rebuild via BLOCK_LIBRARY to get live execute() function
          if (BLOCK_LIBRARY[d.type]) {
            try {
              const freshBlock = BLOCK_LIBRARY[d.type](d.id, d.params || {});
              // Always start with fresh state on Play - never resume trained/stale state
              return { ...freshBlock, id: d.id, state: freshBlock.state, params: { ...d.params, ...freshBlock.params } };
            } catch (e) {
              return d; // fallback to raw data if rebuild fails
            }
          }
          return d;
        }),
        connections: edges.map(e => ({
          sourceBlock: e.source, sourcePort: e.sourceHandle!, targetBlock: e.target, targetPort: e.targetHandle!
        }))
      };
      engineRef.current = new XbridgesEngine(model);
      const compileDiagnostics = engineRef.current.compile();
      setDiagnostics(compileDiagnostics);

      const tick = () => {
        if (engineRef.current && !isPausedRef.current) {
          // Sync UI node parameters and SM Variables to engine block parameters (dynamic tuning)
          nodesRef.current.forEach(node => {
            const block = engineRef.current!['blockMap'].get(node.id);
            if (block) {
              // 1. Sync parameter tuning from UI properties panel (e.g. carrierType, frequency)
              if (block.params && node.data.params) {
                Object.keys(node.data.params).forEach(k => {
                  block.params[k] = node.data.params[k];
                });
              }

              // 2. Sync SM Variables to Inports (Data Connectivity)
              if (node.data.type === 'Inport' && node.data.params?.smVarId && availableVariables) {
                const smVar = availableVariables.find(v => v.id === node.data.params.smVarId);
                if (smVar) {
                  const numericVal = Number(smVar.currentValue);
                  engineRef.current!.setSignalValue(node.id, 'out', numericVal);
                  if (block.params) block.params.value = numericVal;
                }
              }
            }
          });

          if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
          else if (solverType === 'ode2') Solvers.stepODE2(engineRef.current, timeRef.current, fixedStep);
          else if (solverType === 'ode3') Solvers.stepODE3(engineRef.current, timeRef.current, fixedStep);
          else if (solverType === 'ode5') Solvers.stepODE5(engineRef.current, timeRef.current, fixedStep);
          else if (solverType === 'ode23') AdaptiveSolver.stepODE23(engineRef.current, timeRef.current, fixedStep);
          else if (solverType === 'ode45') AdaptiveSolver.stepODE45(engineRef.current, timeRef.current, fixedStep);
          else Solvers.stepEuler(engineRef.current, timeRef.current, fixedStep);

          timeRef.current += fixedStep;

          if (simLimitRef.current !== null && timeRef.current >= simLimitRef.current) {
            timeRef.current = simLimitRef.current;
            setIsSimulating(false);
            setNodes(nds => nds.map(n => {
              const engineBlock = engineRef.current!['blockMap'].get(n.id);
              if (engineBlock && n.type === 'xblock') {
                return { ...n, data: { ...n.data, state: engineBlock.state } };
              }
              return n;
            }));
            return;
          }

          // Throttle UI updates to ~15fps (every 4th frame at 60fps) to prevent ReactFlow lag
          updateThrottle++;
          if (updateThrottle % 4 === 0) {
            setNodes(nds => nds.map(n => {
              const engineBlock = engineRef.current!['blockMap'].get(n.id);
              if (engineBlock && n.type === 'xblock') {
                // Sync the engine's block state (which includes Scope history) to React node data
                return { ...n, data: { ...n.data, state: engineBlock.state } };
              }
              return n;
            }));
          }
        }
        animationFrameId = requestAnimationFrame(tick);
      };

      animationFrameId = requestAnimationFrame(tick);
    } else {
      timeRef.current = 0; // Reset time when stopped
      setIsPaused(false);
      setDiagnostics([]);
      setShowDiagnostics(false);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating]); // Deliberately omitted nodes/edges to prevent restarting loop while dragging

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { nodes, edges }]);
  }, [nodes, edges]);

  const handleNodeMouseDown = useCallback((event: React.MouseEvent, nodeId: string) => {
    if (event.button === 2) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      saveHistory();
      const newNodeId = `${node.data.type || 'block'}-${Date.now()}`;
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
  }, [nodes, saveHistory, setNodes, setSelectedNodeId]);

  // Auto-save on unmount to prevent data loss (FR-Persistence)
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const onSaveRef = React.useRef(onSave);

  React.useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  React.useEffect(() => { edgesRef.current = edges; }, [edges]);
  React.useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  React.useEffect(() => {
    return () => {
      if (onSaveRef.current) {
        onSaveRef.current(nodesRef.current, edgesRef.current);
      }
    };
  }, []); // Run ONLY on unmount


  // Synchronize LAPLACE_TRANSFORM parameters with connected DOE_MODEL block
  React.useEffect(() => {
    let changed = false;
    const nextNodes = nodes.map(node => {
      if (node.data?.type === 'LAPLACE_TRANSFORM') {
        const edge = edges.find(e => {
          if (e.target !== node.id) return false;
          if (e.targetHandle === 'doe') return true;
          if (e.targetHandle === 'u' || e.targetHandle === 'in') {
            const srcNode = nodes.find(n => n.id === e.source);
            return srcNode?.data?.type === 'DOE_MODEL';
          }
          return false;
        });
        if (edge) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          if (sourceNode && sourceNode.data?.type === 'DOE_MODEL') {
            const equationStr = sourceNode.data.params?.equation?.value || sourceNode.data.params?.equation || '';
            const inputNames = sourceNode.data.params?.inputNames?.value || sourceNode.data.params?.inputNames || ['X1'];
            const factorName = inputNames[0] || 'X1';
            const mappingType = node.data.params?.mappingType || 'denominator';
            const maxDegree = Number(node.data.params?.maxDegree) || 3;
            
            if (equationStr && (
              node.data.params?.equation !== equationStr || 
              node.data.params?.lastFactor !== factorName || 
              node.data.params?.lastMaxDegree !== maxDegree || 
              node.data.params?.lastMappingType !== mappingType
            )) {
              const coeffs = getPolynomialCoefficients(equationStr, factorName, inputNames, maxDegree);
              const poly = trimLeadingZeros([...coeffs].reverse());
              
              const newParams = { ...node.data.params };
              if (mappingType === 'denominator') {
                newParams.denominator = poly;
                newParams.numerator = [1];
              } else {
                newParams.numerator = poly;
                newParams.denominator = node.data.params?.defaultDenominator || [1, 1];
              }
              newParams.equation = equationStr;
              newParams.lastFactor = factorName;
              newParams.lastMaxDegree = maxDegree;
              newParams.lastMappingType = mappingType;
              
              changed = true;
              return {
                ...node,
                data: {
                  ...node.data,
                  params: newParams
                }
              };
            }
          }
        } else if (node.data.params?.equation) {
          // Connection removed, clear parsed equation details so user can manually edit
          const newParams = { ...node.data.params };
          delete newParams.equation;
          delete newParams.lastFactor;
          delete newParams.lastMaxDegree;
          delete newParams.lastMappingType;
          
          changed = true;
          return {
            ...node,
            data: {
              ...node.data,
              params: newParams
            }
          };
        }
      }
      return node;
    });
    
    if (changed) {
      setNodes(nextNodes);
    }
  }, [nodes, edges]);

  const onConnect = useCallback((params: Connection | Edge) => {
    saveHistory();
    setEdges((eds) => addEdge({
      ...params,
      type: edgeType,
      animated: isSimulating,
      style: { stroke: '#4caf50', strokeWidth: 3 } // FR-2.2 Continuous wire
    }, eds));

    // Auto-resize DEMUX outputs on connection if possible
    if (params.target && params.targetHandle === 'u') {
      setNodes((nds) => {
        const targetNode = nds.find(n => n.id === params.target);
        if (targetNode && targetNode.data?.type === 'DEMUX') {
          const sourceNode = nds.find(n => n.id === params.source);
          const sourcePort = sourceNode?.data?.outputs?.find((p: any) => p.id === params.sourceHandle);
          if (sourcePort) {
            let vectorLength = 2;
            if (sourcePort.dimensions && sourcePort.dimensions[0] > 0) {
              vectorLength = sourcePort.dimensions[0];
            } else if (Array.isArray(sourcePort.value)) {
              vectorLength = sourcePort.value.length;
            } else if (sourceNode?.data?.type === 'MUX') {
              vectorLength = sourceNode?.data?.inputs?.length || sourceNode?.data?.params?.numInputs || 2;
            } else if (sourcePort.type === 'vector' || sourcePort.type === 'matrix') {
              if (Array.isArray(sourcePort.value)) {
                vectorLength = sourcePort.value.length;
              }
            }

            if (vectorLength > 0 && vectorLength !== targetNode.data.params?.numOutputs) {
              return nds.map(n => {
                if (n.id === targetNode.id) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      params: { ...n.data.params, numOutputs: vectorLength },
                      outputs: Array.from({ length: vectorLength }, (_, i) => ({
                        id: `out${i+1}`,
                        name: `y${i+1}`,
                        type: 'auto' as const,
                        direction: 'output' as const,
                        position: 'right' as const,
                        value: 0
                      }))
                    }
                  };
                }
                return n;
              });
            }
          }
        }
        return nds;
      });
    }

    // If simulating, hot-reload the connection in the engine
    if (isSimulating && engineRef.current) {
      engineRef.current['model'].connections.push({
        sourceBlock: params.source!, sourcePort: params.sourceHandle!,
        targetBlock: params.target!, targetPort: params.targetHandle!
      });
      engineRef.current['compiled'] = false; // Force recompile on next step
    }
  }, [setEdges, setNodes, isSimulating, saveHistory, edgeType]);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !BLOCK_LIBRARY[type]) return;

    saveHistory();

    let position = { x: reactFlowBounds.width / 2 - 70, y: reactFlowBounds.height / 2 - 40 };
    if (reactFlowInstance) {
      position = reactFlowInstance.screenToFlowPosition({
        x: reactFlowBounds.left + reactFlowBounds.width / 2,
        y: reactFlowBounds.top + reactFlowBounds.height / 2
      });
      // offset slightly for block dimensions
      position.x -= 70;
      position.y -= 40;
    }

    // Instantiate block definition to get inputs/outputs/params
    const blockDef = BLOCK_LIBRARY[type](`${type}-${Date.now()}`, {});

    const newNode: Node = {
      id: blockDef.id,
      type: 'xblock',
      position,
      data: {
        ...blockDef,
        parentId: currentParentId, // NEW: Assign to current subsystem
        selected: false
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    if (node.data.type === 'Subsystem') {
      setViewPath(prev => [...prev, node.id]);
      setSelectedNodeId(null);
    } else if (['ROBOT_VACUUM_DYNAMICS', 'ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_VISUALIZATION', 'ROBOT_VACUUM_3D_SCENE_VIEW'].includes(node.data.type)) {
      if (!openScopes.includes(node.id)) {
        setOpenScopes(prev => [...prev, node.id]);
      }
    }
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
  };

  const onNodesDelete = useCallback((deleted: Node[]) => {
    // Clear selection if the currently selected node is deleted
    if (deleted.some(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId]);



  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields (Properties Panel)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Track Space press
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        isSpacePressedRef.current = true;
      }

      // Space + C Combo: Collapse/Expand properties and library panels together in xbridges
      if ((e.key === 'c' || e.key === 'C') && isSpacePressedRef.current) {
        e.preventDefault();
        spaceComboUsedRef.current = true;
        const allXbridgesCollapsed = isLibCollapsed && isPropsCollapsed;
        if (allXbridgesCollapsed) {
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
        setIsSimulating(true);
        setIsPaused(false);
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

      // Deselect (Escape)
      if (e.code === 'Escape') {
        setSelectedNodeId(null);
      }

      // Delete (Delete or Backspace)
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
        const selectedEdges = edges.filter(ed => ed.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          e.preventDefault(); // Prevent React Flow from also handling it
          saveHistory();

          if (selectedNodes.length > 0) {
            const nodeIds = selectedNodes.map(n => n.id);
            setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
            setEdges(eds => eds.filter(ed => !nodeIds.includes(ed.source) && !nodeIds.includes(ed.target)));
            if (selectedNodeId && nodeIds.includes(selectedNodeId)) {
              setSelectedNodeId(null);
            }
          }

          if (selectedEdges.length > 0) {
            const edgeIds = selectedEdges.map(ed => ed.id);
            // Delete edges, but if we already filtered edges from node deletion, filter those too
            setEdges(eds => eds.filter(ed => !edgeIds.includes(ed.id)));
          }
        }
      }

      // Select All (Ctrl+A or Cmd+A)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
      }

      // Save (Ctrl+S or Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        if (onSaveAll) onSaveAll();
        else console.log('Saved workspace state:', { nodes, edges });
      }

      // Undo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (history.length > 0) {
          const previousState = history[history.length - 1];
          setNodes(previousState.nodes);
          setEdges(previousState.edges);
          setHistory(prev => prev.slice(0, -1));
          setSelectedNodeId(null);
        }
      }

      // Copy (Ctrl+C or Cmd+C)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const activeSelectedNodes = nodes.filter(n => n.selected);
        const copyList = activeSelectedNodes.length > 0
          ? activeSelectedNodes
          : nodes.filter(n => n.id === selectedNodeId);

        if (copyList.length > 0) {
          const copyNodeIds = new Set(copyList.map(n => n.id));
          const copyEdges = edges.filter(ed => copyNodeIds.has(ed.source) && copyNodeIds.has(ed.target));
          
          if (onClipboardChange) {
            onClipboardChange({
              nodes: copyList,
              edges: copyEdges,
              sourceFileId: fileId || 'unknown'
            });
          } else {
            setLocalClipboard({
              nodes: copyList,
              edges: copyEdges,
              sourceFileId: fileId || 'unknown'
            });
          }
        }
      }

      // Paste (Ctrl+V or Cmd+V)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        const clipboardToUse = sharedClipboard !== undefined ? sharedClipboard : localClipboard;
        if (clipboardToUse && clipboardToUse.nodes.length > 0) {
          saveHistory();

          const idMap: Record<string, string> = {};
          
          const newNodes = clipboardToUse.nodes.map(oldNode => {
            const newNodeId = `${oldNode.data.type || 'block'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            idMap[oldNode.id] = newNodeId;
            
            return {
              ...oldNode,
              id: newNodeId,
              position: {
                x: oldNode.position.x + 40,
                y: oldNode.position.y + 40,
              },
              selected: true,
              data: {
                ...oldNode.data,
                id: newNodeId,
                selected: true
              }
            };
          });

          const newEdges = clipboardToUse.edges.map(oldEdge => {
            const newSource = idMap[oldEdge.source];
            const newTarget = idMap[oldEdge.target];
            const newEdgeId = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            return {
              ...oldEdge,
              id: newEdgeId,
              source: newSource,
              target: newTarget
            };
          });

          setNodes(nds => [
            ...nds.map(n => ({ ...n, selected: false })),
            ...newNodes
          ]);
          
          if (newEdges.length > 0) {
            setEdges(eds => [...eds, ...newEdges]);
          }

          if (newNodes.length === 1) {
            setSelectedNodeId(newNodes[0].id);
          } else {
            setSelectedNodeId(null);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        if (!spaceComboUsedRef.current) {
          setIsSimulating(prev => !prev);
        }
        spaceComboUsedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [nodes, edges, history, selectedNodeId, sharedClipboard, onClipboardChange, localClipboard, fileId, setNodes, setEdges, setIsSimulating, saveHistory, isLibCollapsed, isPropsCollapsed]);

  const updateBlock = (blockId: string, data: any) => {
    setNodes(nds => nds.map(n => {
      if (n.id === blockId) {
        const updatedData = { ...n.data, ...data };

        // Handle parameter-driven port changes (e.g., numInputs, bitWidth, cases)
        if (data.params && BLOCK_LIBRARY[n.data.type]) {
          // Check if critical params changed
          const oldParams = n.data.params || {};
          const newParams = data.params;

          const hasChanged =
            newParams.numInputs !== oldParams.numInputs ||
            newParams.signs !== oldParams.signs ||
            newParams.cases !== oldParams.cases ||
            newParams.numCases !== oldParams.numCases ||
            newParams.numSignals !== oldParams.numSignals ||
            newParams.numOutputs !== oldParams.numOutputs ||
            newParams.output_type !== oldParams.output_type ||
            newParams.wordLength !== oldParams.wordLength ||
            newParams.fractionLength !== oldParams.fractionLength;

          if (hasChanged) {
            // Re-instantiate block definition to get new ports
            const freshDef = BLOCK_LIBRARY[n.data.type](blockId, newParams);
            updatedData.inputs = freshDef.inputs;
            updatedData.outputs = freshDef.outputs;
          }

          // Sync input port default values with params if they share the same key
          if (updatedData.inputs) {
            updatedData.inputs = updatedData.inputs.map((inPort: any) => {
              if (newParams[inPort.id] !== undefined) {
                return { ...inPort, value: newParams[inPort.id] };
              }
              return inPort;
            });
          }

          if (['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN'].includes(n.data.type)) {
            try {
              const freshDef = BLOCK_LIBRARY[n.data.type](blockId, newParams);
              updatedData.params = { ...newParams, ...freshDef.params };
            } catch (e) {
              console.error(`Failed to refresh params for ${n.data.type}:`, e);
            }
          }
        }

        return { ...n, data: updatedData };
      }
      return n;
    }));

    // --- LIVE HOT-PATCH: sync param changes to running engine immediately ---
    // This is the core Simulink-like behavior: no stop/restart needed.
    // patchBlockParams will also re-seed state if learning hyperparams changed.
    if (data.params && isSimulating && engineRef.current) {
      engineRef.current.patchBlockParams(blockId, data.params);
    }
  };

  const stepSimulation = () => {
    if (!engineRef.current) return;

    if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
    else if (solverType === 'ode2') Solvers.stepODE2(engineRef.current, timeRef.current, fixedStep);
    else if (solverType === 'ode3') Solvers.stepODE3(engineRef.current, timeRef.current, fixedStep);
    else if (solverType === 'ode5') Solvers.stepODE5(engineRef.current, timeRef.current, fixedStep);
    else if (solverType === 'ode23') AdaptiveSolver.stepODE23(engineRef.current, timeRef.current, fixedStep);
    else if (solverType === 'ode45') AdaptiveSolver.stepODE45(engineRef.current, timeRef.current, fixedStep);
    else Solvers.stepEuler(engineRef.current, timeRef.current, fixedStep);

    timeRef.current += fixedStep;

    setNodes(nds => nds.map(n => {
      const engineBlock = engineRef.current!['blockMap'].get(n.id);
      if (engineBlock && n.type === 'xblock') {
        return { ...n, data: { ...n.data, state: engineBlock.state } };
      }
      return n;
    }));
  };

  // --- Subsystem Port Synchronization ---
  useEffect(() => {
    let hasChanges = false;
    const nextNodes = nodes.map(node => {
      if (node.data.type === 'Subsystem') {
        const internalInports = nodes.filter(n => n.data.parentId === node.id && n.data.type === 'Inport');
        const internalOutports = nodes.filter(n => n.data.parentId === node.id && n.data.type === 'Outport');

        const newInputs = internalInports
          .sort((a, b) => (a.data.params.port_index || 0) - (b.data.params.port_index || 0))
          .map(p => ({
            id: p.id,
            name: p.data.params.name || 'In',
            type: p.data.params.data_type || 'auto',
            direction: 'input',
            value: 0,
            position: 'left'
          }));

        const newOutputs = internalOutports
          .sort((a, b) => (a.data.params.port_index || 0) - (b.data.params.port_index || 0))
          .map(p => ({
            id: p.id,
            name: p.data.params.name || 'Out',
            type: p.data.params.data_type || 'auto',
            direction: 'output',
            value: 0,
            position: 'right'
          }));

        if (JSON.stringify(newInputs) !== JSON.stringify(node.data.inputs) ||
          JSON.stringify(newOutputs) !== JSON.stringify(node.data.outputs)) {
          hasChanges = true;
          return { ...node, data: { ...node.data, inputs: newInputs, outputs: newOutputs } };
        }
      }
      return node;
    });

    if (hasChanges) setNodes(nextNodes);
  }, [nodes, setNodes]);

  const exitActiveLab = () => {
    setActiveLabId(null);
    setCurrentStepIndex(0);
    setCompletedObjectives({});
    setLabCompleted(false);
    setViewPath(['root']);
    setNodes([]);
    setEdges([]);
  };

  // Validation loop for active Learning Labs
  useEffect(() => {
    if (!activeLabId) return;
    const steps = XBRIDGES_LEARNING_LAB_STEPS[activeLabId];
    if (!steps) return;
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    const interval = setInterval(() => {
      const wState = {
        nodes,
        edges,
        isSimulating,
        openScopes,
        selectedNodeId,
        fixedStep
      };

      let changed = false;
      const nextCompleted = { ...completedObjectives };

      currentStep.objectives.forEach((obj: any) => {
        const isCompletedNow = !!obj.check(wState);
        if (nextCompleted[obj.id] !== isCompletedNow) {
          nextCompleted[obj.id] = isCompletedNow;
          changed = true;
        }
      });

      if (changed) {
        setCompletedObjectives(nextCompleted);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [activeLabId, currentStepIndex, nodes, edges, isSimulating, openScopes, selectedNodeId, fixedStep, completedObjectives]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addBlockAtPos = (type: string, x: number, y: number) => {
    if (!reactFlowInstance || !BLOCK_LIBRARY[type]) return;
    saveHistory();

    const position = reactFlowInstance.screenToFlowPosition({ x, y });
    const blockDef = BLOCK_LIBRARY[type](`${type}-${Date.now()}`, {});

    const newNode: Node = {
      id: blockDef.id,
      type: 'xblock',
      position,
      data: {
        ...blockDef,
        parentId: currentParentId,
        // Ensure UI callbacks are present
        onUpdate: (newData: any) => updateBlock(blockDef.id, newData),
        onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
      }
    };

    setNodes(nds => [...nds, newNode]);
    setSearchMenuPos(null);
    setSearchTerm('');
  };

  const loadLabTemplate = (labId: string) => {
    const lab = XBRIDGES_LEARNING_LABS.find(l => l.id === labId);
    if (!lab) return;

    if (nodes.length > 0 && !window.confirm('Loading a template will clear your current workspace. Continue?')) {
      return;
    }

    saveHistory();
    setSelectedNodeId(null);
    setOpenScopes([]);
    setActiveLabId(labId);
    setIsLabGuideMinimized(false);
    setCurrentStepIndex(0);
    setCompletedObjectives({});
    setLabCompleted(false);
    setViewPath(['root']);

    const newNodes = lab.nodes.map(n => {
      const blockDef = BLOCK_LIBRARY[n.type](n.id, n.params || {});
      return {
        id: n.id,
        type: 'xblock',
        position: n.position,
        data: {
          ...blockDef,
          parentId: (n as any).parentId || 'root',
          selected: false,
          onUpdate: (newData: any) => updateBlock(n.id, newData),
          onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
        }
      };
    });

    const newEdges = lab.edges.map(e => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle || 'out',
      target: e.target,
      targetHandle: e.targetHandle || 'in',
      animated: isSimulating,
      style: { stroke: '#4caf50', strokeWidth: 3 }
    }));

    setNodes(newNodes);
    setEdges(newEdges);

    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView(), 150);
    }
  };

  const filteredBlocks = XBRIDGES_CATEGORIES.flatMap(cat =>
    cat.blocks.map(b => ({ ...b, category: cat.name }))
  ).filter(b => b.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div id="xbridges-workspace-container" className="flex h-full w-full bg-[#111] text-[#e0e0e0] font-sans overflow-hidden select-none relative">
      {/* Quick Search Menu */}
      {searchMenuPos && (
        <div
          className="fixed z-[9999] w-[260px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-[#333] rounded-lg shadow-2xl overflow-hidden"
          style={{ left: searchMenuPos.x, top: searchMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-[#333] flex items-center gap-2">
            <Search size={14} className="text-[#c9a86c]" />
            <input
              autoFocus
              placeholder="Search blocks..."
              className="bg-transparent border-none outline-none text-sm w-full text-[#e0e0e0] placeholder-slate-600 font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredBlocks.length > 0) {
                  addBlockAtPos(filteredBlocks[0].type, searchMenuPos.x, searchMenuPos.y);
                } else if (e.key === 'Escape') {
                  setSearchMenuPos(null);
                }
              }}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
            {filteredBlocks.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 hover:bg-[#222] rounded cursor-pointer group transition-colors"
                onClick={() => addBlockAtPos(b.type, searchMenuPos.x, searchMenuPos.y)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-slate-500 group-hover:text-[#c9a86c] transition-colors flex items-center justify-center w-5 h-5">
                    {renderLibraryIcon(b.icon)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#e0e0e0] group-hover:text-[#c9a86c]">{b.label}</span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest">{b.category}</span>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[#c9a86c]">
                  {renderLibraryIcon(b.icon, 12)}
                </div>
              </div>
            ))}
            {filteredBlocks.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400 italic">No blocks found</div>
            )}
          </div>
        </div>
      )}
      {/* Sidebar Library */}
      <div className={`${isLibCollapsed ? 'w-12' : 'w-72'} bg-[#1a1a1a] border-r border-[#333] flex flex-col shadow-sm z-40 transition-all duration-500 ease-in-out relative group`}>
        {/* Cinematic Header */}
        <div className="p-5 border-b border-[#333] bg-gradient-to-br from-[#222] to-transparent flex items-center justify-between overflow-hidden">
          {!isLibCollapsed && (
            <div className="flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#c9a86c]/10 border border-[#c9a86c]/20 shadow-sm">
                  <Network size={20} className="text-[#c9a86c]" />
                </div>
                <span className="text-sm font-black uppercase tracking-[0.3em] text-[#e0e0e0] drop-shadow-sm">X-Bridges</span>
              </div>
              <span className="text-[8px] text-[#c9a86c]/90 font-black uppercase tracking-widest mt-1 ml-9">Advanced Logic Suite</span>
            </div>
          )}
          <button
            onClick={() => setIsLibCollapsed(!isLibCollapsed)}
            className={`p-2 rounded-xl bg-[#222] border border-[#333] text-[#c9a86c] hover:bg-[#c9a86c]/10 hover:border-[#c9a86c]/30 transition-all ${isLibCollapsed ? 'mx-auto' : ''}`}
            title={isLibCollapsed ? "Expand Library" : "Collapse Library"}
          >
            <Triangle size={12} className={`transition-transform duration-500 ${isLibCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
          </button>
        </div>

        {/* Search Bar */}
        {!isLibCollapsed && (
          <div className="px-4 py-3 border-b border-[#333] bg-[#111]/50">
            <div className="relative group">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#c9a86c] transition-colors" />
              <input 
                placeholder="Search Logic..."
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold text-[#e0e0e0] placeholder-slate-600 focus:outline-none focus:border-[#c9a86c]/50 focus:ring-1 focus:ring-[#c9a86c]/50 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Sidebar Tab Switcher */}
        {!isLibCollapsed && (
          <div className="p-3 border-b border-[#333] flex gap-1 bg-[#111]/50">
            <button
              onClick={() => setActiveSidebarTab('library')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeSidebarTab === 'library'
                  ? 'bg-[#222] text-[#c9a86c] border border-[#333] shadow-sm'
                  : 'text-slate-500 hover:bg-[#222] border border-transparent hover:text-[#e0e0e0]'
                }`}
            >
              <Layers size={14} />
              Library
            </button>
            <button
              onClick={() => setActiveSidebarTab('labs')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeSidebarTab === 'labs'
                  ? 'bg-[#222] text-[#c9a86c] border border-[#333] shadow-sm'
                  : 'text-slate-500 hover:bg-[#222] border border-transparent hover:text-[#e0e0e0]'
                }`}
            >
              <GraduationCap size={14} />
              Labs
            </button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar ${isLibCollapsed ? 'hidden' : 'block'}`}>
          {activeSidebarTab === 'library' ? (
            XBRIDGES_CATEGORIES.map((cat) => {
              const isExpanded = !!expandedCategories[cat.name];
              return (
                <div key={cat.name} className="flex flex-col">
                  <button
                    onClick={() => toggleCategory(cat.name)}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isExpanded ? 'bg-[#222] text-[#c9a86c] border-l-2 border-[#c9a86c]' : 'text-slate-500 hover:bg-[#222] hover:text-[#e0e0e0]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-1 rounded-full ${isExpanded ? 'bg-[#c9a86c]' : 'bg-slate-600'}`} />
                      {cat.name}
                    </div>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-1 pl-4 pr-1 py-2 animate-in slide-in-from-top-2 duration-300">
                      {cat.blocks.map(b => (
                        <div
                          key={b.type}
                          draggable
                          onDragStart={(e) => onDragStart(e, b.type)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#222] border border-transparent hover:border-[#333] cursor-grab active:cursor-grabbing transition-all group"
                        >
                          <div className="text-slate-500 group-hover:text-[#c9a86c] transition-colors flex items-center justify-center w-5 h-5">
                            {renderLibraryIcon(b.icon)}
                          </div>
                          <span className="text-xs font-bold text-slate-400 group-hover:text-[#e0e0e0] transition-colors">
                            {b.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="mb-4 p-4 bg-[#c9a86c]/5 border border-[#c9a86c]/20 rounded-2xl">
                <h3 className="text-[10px] font-black text-[#c9a86c] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                  <GraduationCap size={14} />
                  Co-Simulation Labs
                </h3>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  Select a pre-configured co-simulation learning model to understand online learning algorithms, adaptive filters, and neural feedback controls.
                </p>
              </div>

              {XBRIDGES_LEARNING_LABS.map(lab => (
                <div
                  key={lab.id}
                  onClick={() => loadLabTemplate(lab.id)}
                  className="group relative bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden cursor-pointer hover:border-[#c9a86c]/40 hover:bg-[#222]/80 hover:shadow-md transition-all duration-300 active:scale-95 p-5"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-[#c9a86c]/10 rounded-xl border border-[#c9a86c]/20 text-[#c9a86c]">
                      <GraduationCap size={18} />
                    </div>
                    <span className="text-[8px] font-black px-2 py-0.5 bg-[#222] rounded-full text-slate-400 uppercase tracking-widest border border-[#333]">
                      {lab.difficulty}
                    </span>
                  </div>

                  <h4 className="text-xs font-black text-[#e0e0e0] uppercase tracking-wider mb-1.5 group-hover:text-[#c9a86c] transition-colors">
                    {lab.name}
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-4 line-clamp-3">
                    {lab.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      {lab.category}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] font-black text-[#c9a86c] group-hover:translate-x-1 transition-transform">
                      LOAD LAB <ChevronRight size={12} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex flex-col min-h-0">
        {/* Premium Top Toolbar */}
        <div className="h-16 bg-[#1a1a1a]/90 backdrop-blur-2xl border-b border-[#333] flex items-center justify-between px-6 z-30 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-[#222] p-1 rounded-2xl border border-[#333] shadow-inner">
              <button
                onClick={() => !coSimEngine && setIsSimulating(!isSimulating)}
                disabled={!!coSimEngine}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${activeSimulating
                    ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:bg-rose-600 scale-95'
                    : 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-600 hover:scale-105 active:scale-95'
                  } ${coSimEngine ? 'opacity-85 cursor-not-allowed' : ''}`}
              >
                {activeSimulating ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                {coSimEngine ? 'Co-Simulating' : activeSimulating ? 'Stop Engine' : 'Run Engine'}
              </button>

              {isSimulating && (
                <div className="flex items-center gap-1 ml-1 animate-in zoom-in duration-500">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                        : 'text-slate-400 hover:bg-[#333] hover:text-[#e0e0e0]'
                      }`}
                    title={isPaused ? "Resume" : "Pause"}
                  >
                    {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                  </button>

                  <button
                    onClick={stepSimulation}
                    disabled={!isPaused}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'text-emerald-600 hover:bg-emerald-55'
                        : 'opacity-20 cursor-not-allowed text-slate-400'
                      }`}
                    title="Single Step"
                  >
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-[#333]" />
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">Solver Method</span>
                <div className="relative group">
                  <Settings2 size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c9a86c]" />
                  <select
                    value={solverType}
                    onChange={e => setSolverType(e.target.value as any)}
                    disabled={activeSimulating}
                    className="bg-[#0a0a0a] border border-[#333] rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-bold text-[#e0e0e0] focus:outline-none focus:border-[#c9a86c]/55 appearance-none cursor-pointer hover:bg-[#222] transition-all disabled:opacity-50"
                  >
                    <option value="rk4">Fixed-Step RK4 (ODE4)</option>
                    <option value="euler">Explicit Euler (ODE1)</option>
                    <option value="ode2">Heun Method (ODE2)</option>
                    <option value="ode3">Bogacki-Shampine (ODE3)</option>
                    <option value="ode5">Dormand-Prince (ODE5)</option>
                    <option value="ode23">Adaptive ODE23 (BS)</option>
                    <option value="ode45">Adaptive ODE45 (DP)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">Routing Style</span>
                <div className="relative group">
                  <Network size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c9a86c]" />
                  <select
                    value={edgeType}
                    onChange={e => {
                      const newType = e.target.value as any;
                      setEdgeType(newType);
                      setEdges(eds => eds.map(edge => ({ ...edge, type: newType })));
                    }}
                    className="bg-[#0a0a0a] border border-[#333] rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-bold text-[#e0e0e0] focus:outline-none focus:border-[#c9a86c]/55 appearance-none cursor-pointer hover:bg-[#222] transition-all"
                  >
                    <option value="smoothstep">Orthogonal</option>
                    <option value="default">Bezier Curve</option>
                    <option value="straight">Straight Line</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">Time Step (Δt)</span>
                <div className="relative group">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 text-[8px] font-bold italic">s</div>
                  <input
                    type="text"
                    value={stepSizeInput}
                    onChange={e => setStepSizeInput(normalizeNumerals(e.target.value).replace(/[^0-9.]/g, ''))}
                    disabled={!!tickMs || activeSimulating}
                    className={`w-20 bg-[#0a0a0a] border border-[#333] rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-mono font-bold focus:outline-none focus:border-emerald-500 transition-all ${tickMs ? 'text-[#c9a86c] opacity-80 cursor-not-allowed' : 'text-[#e0e0e0] hover:bg-[#222]'}`}
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">End Time</span>
                <div className="relative group">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-500 text-[8px] font-bold italic">s</div>
                  <input
                    type="text"
                    value={simLimitInput}
                    onChange={e => setSimLimitInput(normalizeNumerals(e.target.value).replace(/[^0-9.]/g, ''))}
                    disabled={activeSimulating}
                    placeholder="Unlimited"
                    className="w-20 bg-[#0a0a0a] border border-[#333] rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-mono font-bold text-[#e0e0e0] focus:outline-none focus:border-rose-500 transition-all hover:bg-[#222] disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">Engine Status</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#0a0a0a] px-3 py-1.5 rounded-lg border border-[#333]">
                  <div className={`w-2 h-2 rounded-full ${activeSimulating ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-[#444]'}`} />
                  <span className={`text-[10px] font-mono font-bold tabular-nums ${activeSimulating ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {activeSimulating ? `T = ${activeTime.toFixed(4)}s` : 'IDLE'}
                  </span>
                </div>

                {/* Diagnostics Badge */}
                {diagnostics.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowDiagnostics(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                        diagnostics.some(d => d.severity === 'error')
                          ? 'bg-red-900/20 border-red-700/30 text-red-400 hover:bg-red-900/30'
                          : 'bg-amber-900/20 border-amber-700/30 text-amber-400 hover:bg-amber-900/30'
                      }`}
                      title="Model Diagnostics"
                    >
                      <span className="font-mono">
                        {diagnostics.filter(d => d.severity === 'error').length > 0 && (
                          <span className="text-red-500">{diagnostics.filter(d => d.severity === 'error').length}E</span>
                        )}
                        {diagnostics.filter(d => d.severity === 'error').length > 0 && diagnostics.filter(d => d.severity === 'warning').length > 0 && ' '}
                        {diagnostics.filter(d => d.severity === 'warning').length > 0 && (
                          <span className="text-amber-500">{diagnostics.filter(d => d.severity === 'warning').length}W</span>
                        )}
                      </span>
                      <span>DIAG</span>
                    </button>

                    {/* Floating Diagnostics Panel */}
                    {showDiagnostics && (
                      <div className="absolute top-full right-0 mt-2 w-[400px] bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-[9999] overflow-hidden text-[#e0e0e0] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#111]/50">
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Model Diagnostics</span>
                          <button onClick={() => setShowDiagnostics(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                          {diagnostics.map((d, i) => (
                            <div
                              key={i}
                              className={`flex gap-3 p-2.5 rounded-lg text-[11px] ${
                                d.severity === 'error'
                                  ? 'bg-red-900/15 border border-red-700/25'
                                  : d.severity === 'warning'
                                  ? 'bg-amber-900/15 border border-amber-700/25'
                                  : 'bg-blue-900/15 border border-blue-700/25'
                              }`}
                            >
                              <span className={`font-black text-[9px] uppercase mt-0.5 shrink-0 ${
                                d.severity === 'error' ? 'text-red-500' : d.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                              }`}>
                                {d.severity === 'error' ? '✖' : d.severity === 'warning' ? '⚠' : 'ℹ'}
                              </span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className={`font-black text-[9px] tracking-wider uppercase ${
                                  d.severity === 'error' ? 'text-red-500' : d.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                                }`}>[{d.code}]</span>
                                <span className="text-slate-300 leading-relaxed break-words">{d.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => handle3dxSyncInit('push')}
                  className="p-2.5 rounded-xl bg-blue-900/20 text-blue-400 hover:bg-blue-900/30 border border-blue-800/30 transition-all cursor-pointer shadow-sm"
                  title="Push to 3DEXPERIENCE"
                >
                  <Cloud size={18} />
                </button>

                <button
                  onClick={() => handle3dxSyncInit('pull')}
                  className="p-2.5 rounded-xl bg-blue-900/20 text-blue-400 hover:bg-blue-900/30 border border-blue-800/30 transition-all cursor-pointer shadow-sm"
                  title="Pull from 3DEXPERIENCE"
                >
                  <Download size={18} />
                </button>

                {(() => {
                  const clip = sharedClipboard !== undefined ? sharedClipboard : localClipboard;
                  if (!clip || clip.nodes.length === 0) return null;
                  
                  const srcName = workspaceFiles?.find((f: any) => f.id === clip.sourceFileId)?.name || 'another tab';
                  const isCurrent = clip.sourceFileId === fileId;
                  
                  return (
                    <div 
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-bold shadow-sm transition-all ${
                        isCurrent 
                          ? 'bg-[#c9a86c]/10 border-[#c9a86c]/30 text-[#c9a86c]' 
                          : 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400'
                      }`}
                      title={isCurrent ? "Clipboard has items copied from this workspace" : `Clipboard has items copied from "${srcName}"`}
                    >
                      <span>📋</span>
                      <span className="max-w-[150px] truncate">
                        {clip.nodes.length} block{clip.nodes.length > 1 ? 's' : ''} copied
                        {!isCurrent && ` (${srcName})`}
                      </span>
                    </div>
                  );
                })()}

                {onBack && (
                  <button
                    onClick={() => { if (onSave) onSave(nodes, edges); onBack(); }}
                    className="p-2.5 rounded-xl bg-[#222] text-[#e0e0e0] hover:bg-[#333] border border-[#333] transition-all shadow-sm"
                    title="Save & Exit"
                  >
                    <Save size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Path Navigation (Breadcrumbs) */}
        <div className="h-10 bg-[#111] border-b border-[#333] flex items-center px-6 gap-3 z-20">
          <div className="p-1 rounded bg-[#222]">
            <Layers size={12} className="text-slate-500" />
          </div>
          {viewPath.map((pathId, idx) => {
            const nodeName = pathId === 'root' ? 'ROOT PROJECT' : (nodes.find(n => n.id === pathId)?.data.params.name || pathId);
            const isLast = idx === viewPath.length - 1;
            return (
              <React.Fragment key={pathId}>
                <button
                  onClick={() => setViewPath(viewPath.slice(0, idx + 1))}
                  className={`text-[9px] font-black tracking-[0.2em] uppercase transition-all hover:text-[#c9a86c] ${isLast ? 'text-[#c9a86c]' : 'text-slate-500'}`}
                >
                  {nodeName}
                </button>
                {!isLast && <ChevronRight size={10} className="text-[#444]" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex-1 relative flex min-h-0">
          <div className="flex-1 relative" onContextMenu={(e) => e.preventDefault()} style={{ cursor: rightClickDrag ? 'copy' : undefined }}>
            {/* Copy-mode indicator badge */}
            {rightClickDrag && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#c9a86c]/90 backdrop-blur-md shadow-lg text-black text-[10px] font-black uppercase tracking-widest select-none animate-pulse">
                <span>⊕</span> Copying Block — Release Right Click to Place
              </div>
            )}
            <WorkspaceContext.Provider value={{
              saveHistory,
              updateBlock: (id, newData) => updateBlock(id, newData),
              onOpenScope: (blockId) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId]),
              onNodeMouseDown: (e, n) => handleNodeMouseDown(e, n),
              isTargetBlock: (blockId) => {
                const steps = activeLabId ? XBRIDGES_LEARNING_LAB_STEPS[activeLabId] : null;
                const currentStep = steps ? steps[currentStepIndex] : null;
                return !!(currentStep && currentStep.targetNodeId === blockId);
              },
              isSimulating: isSimulating && !isPaused,
              getColor: getColor
            }}>
              <ReactFlow
              onInit={setReactFlowInstance}
              nodes={useMemo(() => nodes.filter(n => (n.data.parentId || 'root') === currentParentId), [nodes, currentParentId])}
              edges={useMemo(() => edges.filter(e => {
                const sourceNode = nodes.find(n => n.id === e.source);
                return sourceNode && (sourceNode.data.parentId || 'root') === currentParentId;
              }), [edges, nodes, currentParentId])}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={(e) => {
                if (e.detail === 2) {
                  setSearchMenuPos({ x: e.clientX, y: e.clientY });
                } else {
                  setSearchMenuPos(null);
                  setSearchTerm('');
                }
                setSelectedNodeId(null);
              }}
              onSelectionChange={({ nodes: selectedNodes }) => {
                if (selectedNodes.length === 1) {
                  setSelectedNodeId(selectedNodes[0].id);
                } else if (selectedNodes.length === 0) {
                  setSelectedNodeId(null);
                }
              }}
              onNodesDelete={onNodesDelete}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineComponent={PremiumConnectionLine}
              connectionRadius={30}
              reconnectRadius={30}
              minZoom={0.2}
              maxZoom={2.0}
              snapToGrid
              snapGrid={[15, 15]}
              fitView
              connectionLineStyle={{ stroke: '#4caf50', strokeWidth: 3 }}
              connectionLineType={
                edgeType === 'straight' ? ConnectionLineType.Straight :
                edgeType === 'smoothstep' ? ConnectionLineType.SmoothStep :
                ConnectionLineType.Bezier
              }
              defaultEdgeOptions={{
                type: edgeType,
                animated: true,
                style: { stroke: '#4caf50', strokeWidth: 3 },
                interactionWidth: 20
              }}
              elevateNodesOnSelect
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a2a" />
              <Controls className="bg-[#1a1a1a] border-[#333] fill-[#e0e0e0] shadow-md [&_button]:bg-[#1a1a1a] [&_button]:border-b-[#333] [&_path]:fill-[#e0e0e0] hover:[&_button]:bg-[#222]" />
              <MiniMap
                nodeColor={(n) => n.data.selected ? '#10b981' : '#444'}
                maskColor="rgba(0, 0, 0, 0.4)"
                className="bg-[#1a1a1a] border border-[#333] rounded-lg shadow-md"
              />

              {activeLabId && (
                <Panel position="bottom-left" className="m-4 z-50">
                  {isLabGuideMinimized ? (
                    <button
                      onClick={() => setIsLabGuideMinimized(false)}
                      className="flex items-center gap-2.5 bg-[#1a1a1a] border border-[#333] rounded-full shadow-lg px-4 py-2 hover:bg-[#222] border-l-4 border-l-[#c9a86c] transition-all text-left group"
                    >
                      <div className="p-1.5 rounded-full bg-[#c9a86c]/10 text-[#c9a86c]">
                        <GraduationCap size={14} className="group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="flex flex-col pr-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[#c9a86c]">Lab Guide</span>
                        <span className="text-[8px] text-slate-500 font-mono">Step {currentStepIndex + 1} • Click to open</span>
                      </div>
                    </button>
                  ) : (
                    <div className="w-[360px] bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl p-5 border-l-4 border-l-[#c9a86c] flex flex-col text-[#e0e0e0] transition-all duration-300 animate-in slide-in-from-left duration-300 select-text">
                      <div className="flex items-center justify-between border-b border-[#333] pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsLabGuideMinimized(true)}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#333] transition-colors"
                            title="Minimize Lab Guide"
                          >
                            <Minimize2 size={12} />
                          </button>
                          <div className="p-1.5 rounded-lg bg-[#c9a86c]/10 text-[#c9a86c] shadow-[0_0_10px_rgba(201,168,108,0.2)] animate-pulse">
                            <GraduationCap size={16} />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9a86c]">Learning Lab</span>
                        </div>
                        <button
                          onClick={exitActiveLab}
                          className="text-[9px] font-black tracking-widest text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors"
                        >
                          EXIT LAB
                        </button>
                      </div>

                      {(() => {
                        const steps = XBRIDGES_LEARNING_LAB_STEPS[activeLabId];
                        const step = steps ? steps[currentStepIndex] : null;
                        if (!step) return null;

                        const totalSteps = steps.length;
                        const percent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);
                        const allDone = step.objectives.every((obj: any) => !!completedObjectives[obj.id]);

                        return (
                          <>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                STEP {currentStepIndex + 1} OF {totalSteps}
                              </span>
                              <span className="text-[9px] font-black text-[#c9a86c]">{percent}%</span>
                            </div>
                            
                            <div className="w-full h-1 bg-slate-100 rounded-full mb-4 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-[#c9a86c]/50 to-[#c9a86c] transition-all duration-500"
                                style={{ width: `${percent}%` }}
                              />
                            </div>

                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                              {step.title}
                            </h3>
                            <p className="text-[10px] text-slate-500 leading-relaxed mb-4 whitespace-pre-line">
                              {step.instructions}
                            </p>

                            <div className="space-y-2 mb-5">
                              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">OBJECTIVES:</div>
                              {step.objectives.map((obj: any) => {
                                const done = !!completedObjectives[obj.id];
                                return (
                                  <div 
                                    key={obj.id}
                                    className={`flex items-center gap-2.5 p-2 rounded-xl transition-all duration-300 ${done ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-slate-50 border border-slate-200 text-slate-650'}`}
                                  >
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${done ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-300'}`}>
                                      {done ? <Zap size={10} className="fill-current" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-350" />}
                                    </div>
                                    <span className={`text-[10px] font-bold ${done ? 'line-through text-emerald-600/80' : 'text-slate-600'}`}>
                                      {obj.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex gap-2 border-t border-slate-100 pt-3">
                              <button
                                onClick={() => {
                                  if (currentStepIndex > 0) {
                                    setCurrentStepIndex(currentStepIndex - 1);
                                    setCompletedObjectives({});
                                  }
                                }}
                                disabled={currentStepIndex === 0}
                                className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-slate-500"
                              >
                                Back
                              </button>
                              <button
                                onClick={() => {
                                  if (allDone) {
                                    if (currentStepIndex < totalSteps - 1) {
                                      setCurrentStepIndex(currentStepIndex + 1);
                                      setCompletedObjectives({});
                                    } else {
                                      setLabCompleted(true);
                                    }
                                  }
                                }}
                                disabled={!allDone}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${allDone
                                  ? 'bg-[#c9a86c] text-white shadow-md hover:scale-105 active:scale-95 cursor-pointer'
                                  : 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                {currentStepIndex === totalSteps - 1 ? 'Finish Lab' : 'Next Step'}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </Panel>
              )}
            </ReactFlow>
            </WorkspaceContext.Provider>

            <button
              onClick={() => setShowConfirmClear(true)}
              className="absolute top-4 right-4 z-50 bg-[#1a1a1a] border border-[#333] text-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded text-xs font-bold shadow-md flex items-center gap-2"
            >
              <Trash2 size={12} />
              Clear Canvas
            </button>
          </div>

          {selectedNode && (
            <XbridgesPropertiesPanel
              block={selectedNode.data as any}
              availableVariables={availableVariables}
              onUpdate={updateBlock}
              onLaunchDoe={onLaunchDoe}
              onClose={() => setSelectedNodeId(null)}
              isCollapsed={isPropsCollapsed}
              onCollapseToggle={setIsPropsCollapsed}
            />
          )}

          {openScopes.map(scopeId => {
            const scopeNode = nodes.find(n => n.id === scopeId);
            if (!scopeNode) return null;
            if (scopeNode.data.type === 'ROOT_LOCUS') {
              return (
                <XbridgesRootLocusWindow
                  key={scopeId}
                  block={scopeNode.data}
                  nodes={nodes}
                  edges={edges}
                  onUpdate={(newData) => updateBlock(scopeId, { params: { ...scopeNode.data.params, ...newData } })}
                  onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
                />
              );
            }
            return (
              <XbridgesScopeWindow
                key={scopeId}
                block={scopeNode.data}
                nodes={nodes}
                edges={edges}
                onUpdate={(newData) => updateBlock(scopeId, { params: { ...scopeNode.data.params, ...newData } })}
                onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
              />
            );
          })}
        </div>

        {labCompleted && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-[450px] bg-[#1a1a1a] border border-[#333] rounded-3xl shadow-2xl p-8 text-center flex flex-col items-center relative overflow-hidden select-text animate-in zoom-in-95 duration-300">
              <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-[#c9a86c]/5 blur-3xl" />
              <div className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full bg-[#c9a86c]/5 blur-3xl" />

              <div className="w-16 h-16 rounded-full bg-[#c9a86c]/10 border border-[#c9a86c]/20 text-[#c9a86c] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(201,168,108,0.2)] animate-bounce z-10">
                <GraduationCap size={32} />
              </div>

              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#c9a86c] mb-1.5 z-10">Lab Completed Successfully</span>
              <h2 className="text-lg font-black text-[#e0e0e0] uppercase tracking-wider mb-4 z-10">
                {XBRIDGES_LEARNING_LABS.find(l => l.id === activeLabId)?.name || 'Co-Simulation Lab'}
              </h2>
              
              <p className="text-xs text-slate-500 leading-relaxed mb-6 z-10">
                Congratulations! You have completed all steps in this module. You have successfully simulated, monitored, and fine-tuned online learning models in the ADIA X-Bridges environment.
              </p>

              <div className="w-full bg-[#0a0a0a] border border-[#333] rounded-2xl p-5 mb-6 text-left z-10">
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">CONCEPTS MASTERED:</div>
                <ul className="space-y-1.5 text-[10px] text-[#e0e0e0] font-bold">
                  {activeLabId === 'lms_sys_id' && (
                    <>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> 2-tap online LMS Filter weight adaptation</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Live error correction & convergence monitoring</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Learning rate stability bounds and dt requirements</li>
                    </>
                  )}
                  {activeLabId === 'neural_approx' && (
                    <>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Single-neuron online backpropagation / gradient descent</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Plant approximation of arbitrary reference models</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Discrete-time step solver dynamics (dt)</li>
                    </>
                  )}
                  {activeLabId === 'rl_control' && (
                    <>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Epsilon-greedy exploration vs exploitation policies</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Closed-loop reinforcement state-action control loops</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Reward assignment latency and time discretization</li>
                    </>
                  )}
                  {activeLabId === 'pid_control_sim' && (
                    <>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Closed-loop PID setpoint reference tracking</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Real-time Proportional/Integral/Derivative gain tuning</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Settle-time and overshoot dynamics in continuous physical plants</li>
                    </>
                  )}
                  {(activeLabId === 'robot_vacuum_twin' || activeLabId === 'robot_vacuum_full_system' || activeLabId === 'robot_vacuum_learning_model') && (
                    <>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Decoupled closed-loop EKF localization & SLAM mapping</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Boustrophedon sweep coverage planning & A* guidance</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Vector field histogram (VFH) obstacle avoidance steering</li>
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Multirate co-simulation of physical systems & controllers</li>
                    </>
                  )}
                </ul>
              </div>

              <button
                onClick={exitActiveLab}
                className="w-full py-3 rounded-2xl bg-[#c9a86c] text-white text-xs font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-md z-10"
              >
                Continue to Library
              </button>
            </div>
          </div>
        )}
        {show3dxSyncModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-[480px] p-6 shadow-2xl space-y-4 text-[#e0e0e0]">
              <div className="flex items-center justify-between border-b border-[#333] pb-3">
                <div className="flex items-center gap-2">
                  <Cloud className="text-blue-400" size={18} />
                  <h3 className="text-sm font-bold text-[#e0e0e0] uppercase tracking-wider">
                    {syncAction === 'push' ? 'Push Workspace to 3DX' : 'Pull Workspace from 3DX'}
                  </h3>
                </div>
                <button
                  onClick={() => setShow3dxSyncModal(false)}
                  className="text-slate-500 hover:text-slate-300 p-1 hover:bg-[#333] rounded-md transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {syncStatus === 'loading' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCcw size={24} className="text-blue-400 animate-spin" />
                  <span className="text-xs text-slate-400">Connecting to 3DEXPERIENCE...</span>
                </div>
              ) : syncStatus === 'success' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                  <span className="text-xs text-emerald-400 font-bold">Workspace Synced Successfully!</span>
                </div>
              ) : syncStatus === 'error' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                  <AlertCircle size={24} className="text-red-500" />
                  <span className="text-xs text-red-500 font-bold">Sync Failed</span>
                  <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                    Please ensure you have an active internet connection and are authenticated to the 3DEXPERIENCE platform.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {syncAction === 'push' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Target Workspace</label>
                        <select
                          value={selectedTdxWorkspace}
                          onChange={(e) => setSelectedTdxWorkspace(e.target.value)}
                          className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-xs text-[#e0e0e0] focus:outline-none focus:border-[#c9a86c]"
                        >
                          {tdxWorkspaces.map(ws => (
                            <option key={ws.id} value={ws.id}>{ws.title}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handle3dxPush}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Push Now
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Select Document to Import</label>
                      {tdxDocs.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-400">No compatible XBridges workspaces found.</div>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto border border-[#333] rounded-lg divide-y divide-[#222] bg-[#0a0a0a]">
                          {tdxDocs.map(doc => (
                            <div
                              key={doc.id}
                              onClick={() => handle3dxPull(doc.id)}
                              className="p-3 text-xs text-slate-400 hover:text-[#e0e0e0] hover:bg-[#222] cursor-pointer transition-all flex items-center justify-between"
                            >
                              <span className="font-medium truncate mr-2">{doc.title}</span>
                              <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{new Date(doc.modified).toLocaleDateString()}</span>
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
                    setNodes([]);
                    setEdges([]);
                    setSelectedNodeId(null);
                    setShowConfirmClear(false);
                  }}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors cursor-pointer font-bold"
                >
                  Clear Canvas
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
