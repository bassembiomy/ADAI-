// src/components/xbridges/XbridgesWorkspace.tsx
import React, { useState, useCallback, useEffect } from 'react';
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
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Play, Pause, Square, Save, Trash2, Box, Network, MousePointer2, Settings2, ChevronDown, ChevronRight, Search, Triangle, Layers,
  Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2, Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw,
  Hash, TrendingUp, Monitor, Download, LogIn, LogOut, ChevronLeft, Zap, Settings, ZapOff, Cpu, Wind, Filter, Eye,
  GraduationCap, ArrowRightCircle, ArrowLeftCircle
} from 'lucide-react';
import { XBRIDGES_CATEGORIES, BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';

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
};

const renderLibraryIcon = (iconName: string, size = 14, className?: string) => {
  const IconComp = LucideIconMap[iconName] || Box;
  return <IconComp size={size} className={className} />;
};

import { XbridgesEngine } from '../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../engine/xbridges/Solvers';
import { XBlockNode } from './XBlockNode';
import { XbridgesPropertiesPanel } from './XbridgesPropertiesPanel';
import { XbridgesScopeWindow } from './XbridgesScopeWindow';

const nodeTypes = { xblock: XBlockNode };

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
      { id: 'input_signal', type: 'WaveformGen', position: { x: 50, y: 150 }, label: 'Input Signal', params: { type: 'Sine', amp: 1, freq: 1, offset: 0 } },
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
      { id: 'input_1', type: 'WaveformGen', position: { x: 50, y: 50 }, label: 'Input x1 (Sine)', params: { type: 'Sine', amp: 1, freq: 0.5, offset: 0 } },
      { id: 'input_2', type: 'WaveformGen', position: { x: 50, y: 200 }, label: 'Input x2 (Square)', params: { type: 'Square', amp: 1, freq: 0.2, offset: 0 } },
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
      { id: 'ref_signal', type: 'WaveformGen', position: { x: 50, y: 150 }, label: 'Setpoint Reference', params: { type: 'Square', amp: 1, freq: 0.1, offset: 1 } },
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
  }
];

const XBRIDGES_LEARNING_LAB_STEPS: Record<string, any[]> = {
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
}> = ({ initialNodes = [], initialEdges = [], availableVariables = [], tickMs, onBack, onSave, onSaveAll, onLaunchDoe }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLibCollapsed, setIsLibCollapsed] = useState(false);
  const [isPropsCollapsed, setIsPropsCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [searchMenuPos, setSearchMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'library' | 'labs'>('library');

  // Tutorial / Learning Lab State
  const [activeLabId, setActiveLabId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedObjectives, setCompletedObjectives] = useState<Record<string, boolean>>({});
  const [labCompleted, setLabCompleted] = useState(false);

  // Hierarchical Navigation State
  const [viewPath, setViewPath] = useState<string[]>(['root']);
  const currentParentId = viewPath[viewPath.length - 1];

  const [solverType, setSolverType] = useState<'euler' | 'rk4'>('rk4');
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
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
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
              // Merge saved state and extra data into the fresh block
              return { ...freshBlock, id: d.id, state: d.state || freshBlock.state, params: { ...freshBlock.params, ...d.params } };
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
      engineRef.current.compile();

      const tick = () => {
        if (engineRef.current && !isPaused) {
          // Sync SM Variables to Inports (Data Connectivity)
          nodes.forEach(node => {
            if (node.data.type === 'Inport' && node.data.params?.smVarId && availableVariables) {
              const smVar = availableVariables.find(v => v.id === node.data.params.smVarId);
              if (smVar) {
                const numericVal = Number(smVar.currentValue);
                engineRef.current!.setSignalValue(node.id, 'out', numericVal);
                const block = engineRef.current!['blockMap'].get(node.id);
                if (block && block.params) block.params.value = numericVal;
              }
            }
          });

          if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
          else Solvers.stepEuler(engineRef.current, timeRef.current, fixedStep);

          timeRef.current += fixedStep;

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
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating]); // Deliberately omitted nodes/edges to prevent restarting loop while dragging

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { nodes, edges }]);
  }, [nodes, edges]);

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

  // Debounced auto-save for better reliability (FR-Persistence)
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (onSave) onSave(nodes, edges);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [nodes, edges, onSave]);

  const onConnect = useCallback((params: Connection | Edge) => {
    saveHistory();
    setEdges((eds) => addEdge({
      ...params,
      animated: isSimulating,
      style: { stroke: '#4caf50', strokeWidth: 3 } // FR-2.2 Continuous wire
    }, eds));

    // If simulating, hot-reload the connection in the engine
    if (isSimulating && engineRef.current) {
      engineRef.current['model'].connections.push({
        sourceBlock: params.source!, sourcePort: params.sourceHandle!,
        targetBlock: params.target!, targetPort: params.targetHandle!
      });
      engineRef.current['compiled'] = false; // Force recompile on next step
    }
  }, [setEdges, isSimulating, saveHistory]);

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

      // Toggle Simulation (Space)
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        setIsSimulating(prev => !prev);
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
        const nodeToCopy = nodes.find(n => n.id === selectedNodeId);
        if (nodeToCopy) {
          setCopiedNode(nodeToCopy);
        }
      }

      // Paste (Ctrl+V or Cmd+V)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && copiedNode) {
        saveHistory();
        const newNodeId = `${copiedNode.data.type || 'block'}-${Date.now()}`;
        const newNode: Node = {
          ...copiedNode,
          id: newNodeId,
          position: {
            x: copiedNode.position.x + 20,
            y: copiedNode.position.y + 20,
          },
          selected: true,
          data: { ...copiedNode.data, id: newNodeId, selected: true }
        };
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), newNode]);
        setSelectedNodeId(newNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, history, selectedNodeId, copiedNode, setNodes, setEdges, setIsSimulating, saveHistory]);

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
            newParams.cases !== oldParams.cases ||
            newParams.numCases !== oldParams.numCases ||
            newParams.numSignals !== oldParams.numSignals ||
            newParams.numOutputs !== oldParams.numOutputs;

          if (hasChanged) {
            // Re-instantiate block definition to get new ports
            const freshDef = BLOCK_LIBRARY[n.data.type](blockId, newParams);
            updatedData.inputs = freshDef.inputs;
            updatedData.outputs = freshDef.outputs;
          }
        }

        return { ...n, data: updatedData };
      }
      return n;
    }));
  };

  const stepSimulation = () => {
    if (!engineRef.current) return;

    if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
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
    setCurrentStepIndex(0);
    setCompletedObjectives({});
    setLabCompleted(false);

    const newNodes = lab.nodes.map(n => {
      const blockDef = BLOCK_LIBRARY[n.type](n.id, n.params || {});
      return {
        id: n.id,
        type: 'xblock',
        position: n.position,
        data: {
          ...blockDef,
          parentId: currentParentId,
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
    <div className="flex h-full w-full bg-[#0a0a0a] text-gray-300 font-sans overflow-hidden select-none relative">
      {/* Quick Search Menu */}
      {searchMenuPos && (
        <div
          className="fixed z-[9999] w-[260px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden"
          style={{ left: searchMenuPos.x, top: searchMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-white/5 flex items-center gap-2">
            <Search size={14} className="text-emerald-500" />
            <input
              autoFocus
              placeholder="Search blocks..."
              className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-white/20 font-bold"
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
                className="flex items-center justify-between p-2 hover:bg-emerald-500/10 rounded cursor-pointer group transition-colors"
                onClick={() => addBlockAtPos(b.type, searchMenuPos.x, searchMenuPos.y)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-gray-500 group-hover:text-emerald-400 transition-colors flex items-center justify-center w-5 h-5">
                    {renderLibraryIcon(b.icon)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white/90 group-hover:text-emerald-400">{b.label}</span>
                    <span className="text-[9px] text-white/30 uppercase tracking-widest">{b.category}</span>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500">
                  {renderLibraryIcon(b.icon, 12)}
                </div>
              </div>
            ))}
            {filteredBlocks.length === 0 && (
              <div className="p-4 text-center text-xs text-white/20 italic">No blocks found</div>
            )}
          </div>
        </div>
      )}
      {/* Sidebar Library */}
      <div className={`${isLibCollapsed ? 'w-12' : 'w-72'} bg-[#0d0d0d] border-r border-white/5 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-40 transition-all duration-500 ease-in-out relative group`}>
        {/* Cinematic Header */}
        <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent flex items-center justify-between overflow-hidden">
          {!isLibCollapsed && (
            <div className="flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#c9a86c]/20 shadow-[0_0_15px_rgba(201,168,108,0.2)]">
                  <Network size={20} className="text-[#c9a86c]" />
                </div>
                <span className="text-sm font-black uppercase tracking-[0.3em] text-white/90 drop-shadow-sm">X-Bridges</span>
              </div>
              <span className="text-[8px] text-[#c9a86c]/60 font-black uppercase tracking-widest mt-1 ml-9">Advanced Logic Suite</span>
            </div>
          )}
          <button
            onClick={() => setIsLibCollapsed(!isLibCollapsed)}
            className={`p-2 rounded-xl bg-white/5 border border-white/10 text-[#c9a86c] hover:bg-[#c9a86c]/10 hover:border-[#c9a86c]/30 transition-all ${isLibCollapsed ? 'mx-auto' : ''}`}
            title={isLibCollapsed ? "Expand Library" : "Collapse Library"}
          >
            <Triangle size={12} className={`transition-transform duration-500 ${isLibCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
          </button>
        </div>

        {/* Search Bar */}
        {!isLibCollapsed && (
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
            <div className="relative group">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#c9a86c] transition-colors" />
              <input 
                placeholder="Search Logic..."
                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold text-white placeholder-gray-700 focus:outline-none focus:border-[#c9a86c]/30 focus:bg-white/[0.08] transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Sidebar Tab Switcher */}
        {!isLibCollapsed && (
          <div className="p-3 border-b border-white/5 flex gap-1 bg-white/[0.01]">
            <button
              onClick={() => setActiveSidebarTab('library')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeSidebarTab === 'library'
                  ? 'bg-[#c9a86c]/10 text-[#c9a86c] border border-[#c9a86c]/20 shadow-[0_0_15px_rgba(201,168,108,0.1)]'
                  : 'text-gray-500 hover:bg-white/5 border border-transparent hover:text-gray-300'
                }`}
            >
              <Layers size={14} />
              Library
            </button>
            <button
              onClick={() => setActiveSidebarTab('labs')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeSidebarTab === 'labs'
                  ? 'bg-[#c9a86c]/10 text-[#c9a86c] border border-[#c9a86c]/20 shadow-[0_0_15px_rgba(201,168,108,0.1)]'
                  : 'text-gray-500 hover:bg-white/5 border border-transparent hover:text-gray-300'
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
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isExpanded ? 'bg-white/[0.05] text-[#c9a86c]' : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-1 rounded-full ${isExpanded ? 'bg-[#c9a86c]' : 'bg-gray-700'}`} />
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
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-all group border border-transparent hover:border-white/5"
                        >
                          <div className="text-gray-600 group-hover:text-[#c9a86c] transition-colors flex items-center justify-center w-5 h-5">
                            {renderLibraryIcon(b.icon)}
                          </div>
                          <span className="text-xs font-bold text-gray-500 group-hover:text-white/90 transition-colors">
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
              <div className="mb-4 p-4 bg-[#c9a86c]/5 border border-[#c9a86c]/10 rounded-2xl">
                <h3 className="text-[10px] font-black text-[#c9a86c] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                  <GraduationCap size={14} />
                  Co-Simulation Labs
                </h3>
                <p className="text-[10px] text-gray-500 leading-relaxed italic">
                  Select a pre-configured co-simulation learning model to understand online learning algorithms, adaptive filters, and neural feedback controls.
                </p>
              </div>

              {XBRIDGES_LEARNING_LABS.map(lab => (
                <div
                  key={lab.id}
                  onClick={() => loadLabTemplate(lab.id)}
                  className="group relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-[#c9a86c]/30 hover:bg-white/[0.04] transition-all duration-300 active:scale-95 shadow-xl p-5"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-[#c9a86c]/10 rounded-xl border border-[#c9a86c]/20 text-[#c9a86c]">
                      <GraduationCap size={18} />
                    </div>
                    <span className="text-[8px] font-black px-2 py-0.5 bg-white/5 rounded-full text-gray-400 uppercase tracking-widest border border-white/5">
                      {lab.difficulty}
                    </span>
                  </div>

                  <h4 className="text-xs font-black text-gray-200 uppercase tracking-wider mb-1.5 group-hover:text-[#c9a86c] transition-colors">
                    {lab.name}
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-relaxed mb-4 line-clamp-3">
                    {lab.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter">
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
      <div className="flex-1 relative flex flex-col">
        {/* Premium Top Toolbar */}
        <div className="h-16 bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isSimulating
                    ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:bg-rose-600 scale-95'
                    : 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-600 hover:scale-105 active:scale-95'
                  }`}
              >
                {isSimulating ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                {isSimulating ? 'Stop Engine' : 'Run Engine'}
              </button>

              {isSimulating && (
                <div className="flex items-center gap-1 ml-1 animate-in zoom-in duration-500">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    title={isPaused ? "Resume" : "Pause"}
                  >
                    {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                  </button>

                  <button
                    onClick={stepSimulation}
                    disabled={!isPaused}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'text-emerald-500 hover:bg-emerald-500/10'
                        : 'opacity-20 cursor-not-allowed text-gray-600'
                      }`}
                    title="Single Step"
                  >
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-white/5" />
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Solver Method</span>
                <div className="relative group">
                  <Settings2 size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c9a86c]" />
                  <select
                    value={solverType}
                    onChange={e => setSolverType(e.target.value as any)}
                    disabled={isSimulating}
                    className="bg-white/5 border border-white/5 rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-bold text-gray-300 focus:outline-none focus:border-[#c9a86c]/30 appearance-none cursor-pointer hover:bg-white/[0.08] transition-all disabled:opacity-50"
                  >
                    <option value="rk4">Fixed-Step RK4</option>
                    <option value="euler">Explicit Euler</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Time Step (Δt)</span>
                <div className="relative group">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-500 text-[8px] font-bold italic">s</div>
                  <input
                    type="text"
                    value={stepSizeInput}
                    onChange={e => setStepSizeInput(normalizeNumerals(e.target.value).replace(/[^0-9.]/g, ''))}
                    disabled={!!tickMs}
                    className={`w-20 bg-white/5 border border-white/5 rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-mono font-bold focus:outline-none focus:border-emerald-500 transition-all ${tickMs ? 'text-amber-500 opacity-80 cursor-not-allowed' : 'text-gray-300 hover:bg-white/[0.08]'}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Engine Status</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                  <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-gray-700'}`} />
                  <span className={`text-[10px] font-mono font-bold tabular-nums ${isSimulating ? 'text-emerald-500' : 'text-gray-500'}`}>
                    {isSimulating ? `T = ${timeRef.current.toFixed(4)}s` : 'IDLE'}
                  </span>
                </div>
                {onBack && (
                  <button
                    onClick={() => { if (onSave) onSave(nodes, edges); onBack(); }}
                    className="p-2.5 rounded-xl bg-[#c9a86c]/10 text-[#c9a86c] hover:bg-[#c9a86c]/20 border border-[#c9a86c]/20 transition-all"
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
        <div className="h-10 bg-[#0d0d0d] border-b border-white/5 flex items-center px-6 gap-3 z-20">
          <div className="p-1 rounded bg-white/5">
            <Layers size={12} className="text-gray-600" />
          </div>
          {viewPath.map((pathId, idx) => {
            const nodeName = pathId === 'root' ? 'ROOT PROJECT' : (nodes.find(n => n.id === pathId)?.data.params.name || pathId);
            const isLast = idx === viewPath.length - 1;
            return (
              <React.Fragment key={pathId}>
                <button
                  onClick={() => setViewPath(viewPath.slice(0, idx + 1))}
                  className={`text-[9px] font-black tracking-[0.2em] uppercase transition-all hover:text-[#c9a86c] ${isLast ? 'text-[#c9a86c]' : 'text-gray-500'}`}
                >
                  {nodeName}
                </button>
                {!isLast && <ChevronRight size={10} className="text-gray-800" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex-1 relative flex">
          <div className="flex-1 relative">
            <ReactFlow
              // Pass native React Flow selected state alongside custom data and an update callback
              onInit={setReactFlowInstance}
              nodes={nodes.filter(n => (n.data.parentId || 'root') === currentParentId).map(n => {
                const steps = activeLabId ? XBRIDGES_LEARNING_LAB_STEPS[activeLabId] : null;
                const currentStep = steps ? steps[currentStepIndex] : null;
                const isTarget = currentStep && currentStep.targetNodeId === n.id;
                
                return {
                  ...n,
                  data: {
                    ...n.data,
                    pulse: isTarget,
                    onUpdate: (newData: any) => updateBlock(n.id, newData),
                    onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
                  }
                };
              })}
              edges={edges.filter(e => {
                const sourceNode = nodes.find(n => n.id === e.source);
                return sourceNode && (sourceNode.data.parentId || 'root') === currentParentId;
              })}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={(e) => {
                if (e.detail === 2) {
                  // Double click
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
              snapToGrid
              snapGrid={[15, 15]}
              fitView
              // FR-2.1: Default Bezier routing, FR-2.4: Selection width
              defaultEdgeOptions={{
                type: 'default',
                animated: true,
                style: { stroke: '#4caf50', strokeWidth: 3 },
                interactionWidth: 20
              }}
              elevateNodesOnSelect
            >
              {/* FR-3.4 and FR-3.5: Pan/Zoom controls, Minimap, Grid Background */}
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#404040" />
              <Controls className="bg-[#1e1e1e] border-[#404040] fill-white" />
              <MiniMap
                nodeColor={(n) => n.data.selected ? '#4caf50' : '#2d2d2d'}
                maskColor="rgba(0, 0, 0, 0.6)"
                className="bg-[#1e1e1e] border border-[#404040]"
              />

              {activeLabId && (
                <Panel position="bottom-left" className="m-4 z-50">
                  <div className="w-[360px] bg-[#0d0d0d]/95 backdrop-blur-xl border border-[#c9a86c]/30 rounded-2xl shadow-2xl p-5 border-l-4 border-l-[#c9a86c] flex flex-col text-gray-300 transition-all duration-300 animate-in slide-in-from-left duration-300 select-text">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-[#c9a86c]/20 text-[#c9a86c] shadow-[0_0_10px_rgba(201,168,108,0.2)] animate-pulse">
                          <GraduationCap size={16} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9a86c]">Learning Lab</span>
                      </div>
                      <button
                        onClick={exitActiveLab}
                        className="text-[9px] font-black tracking-widest text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded transition-colors"
                      >
                        EXIT LAB
                      </button>
                    </div>

                    {/* Lab Title & Steps */}
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
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              STEP {currentStepIndex + 1} OF {totalSteps}
                            </span>
                            <span className="text-[9px] font-black text-[#c9a86c]">{percent}%</span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full h-1 bg-white/5 rounded-full mb-4 overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-[#c9a86c]/50 to-[#c9a86c] transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2">
                            {step.title}
                          </h3>
                          <p className="text-[10px] text-gray-400 leading-relaxed mb-4 whitespace-pre-line">
                            {step.instructions}
                          </p>

                          {/* Objectives Checklist */}
                          <div className="space-y-2 mb-5">
                            <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1.5">OBJECTIVES:</div>
                            {step.objectives.map((obj: any) => {
                              const done = !!completedObjectives[obj.id];
                              return (
                                <div 
                                  key={obj.id}
                                  className={`flex items-center gap-2.5 p-2 rounded-xl transition-all duration-300 ${done ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-400' : 'bg-white/[0.02] border border-white/5 text-gray-400'}`}
                                >
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${done ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-gray-700'}`}>
                                    {done ? <Zap size={10} className="fill-current" /> : <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />}
                                  </div>
                                  <span className={`text-[10px] font-bold ${done ? 'line-through text-emerald-400/80' : 'text-gray-400'}`}>
                                    {obj.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Controls */}
                          <div className="flex gap-2 border-t border-white/5 pt-3">
                            <button
                              onClick={() => {
                                if (currentStepIndex > 0) {
                                  setCurrentStepIndex(currentStepIndex - 1);
                                  setCompletedObjectives({});
                                }
                              }}
                              disabled={currentStepIndex === 0}
                              className="flex-1 py-2 rounded-xl border border-white/10 text-xs font-bold hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-gray-400"
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
                                ? 'bg-[#c9a86c] text-[#0a0a0a] shadow-[0_0_20px_rgba(201,168,108,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
                                : 'bg-white/5 border border-white/5 text-gray-600 cursor-not-allowed'
                              }`}
                            >
                              {currentStepIndex === totalSteps - 1 ? 'Finish Lab' : 'Next Step'}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </Panel>
              )}
            </ReactFlow>

            {/* Simple Clear Button to help user reset if old blocks are stuck */}
            <button
              onClick={() => { setNodes([]); setEdges([]); setSelectedNodeId(null); }}
              className="absolute top-4 right-4 z-50 bg-[#1a1a1a] border border-[#333] text-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded text-xs font-bold shadow-lg flex items-center gap-2"
            >
              <Trash2 size={12} />
              Clear Canvas
            </button>
          </div>

          {/* Right-Side Properties Panel */}
          {selectedNode && (
            <XbridgesPropertiesPanel
              block={selectedNode.data as any}
              availableVariables={availableVariables}
              onUpdate={updateBlock}
              onLaunchDoe={onLaunchDoe}
              onClose={() => setSelectedNodeId(null)}
            />
          )}

          {/* Floating Scope Windows */}
          {openScopes.map(scopeId => {
            const scopeNode = nodes.find(n => n.id === scopeId);
            if (!scopeNode) return null;
            return (
              <XbridgesScopeWindow
                key={scopeId}
                block={scopeNode.data}
                onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
              />
            );
          })}
        </div>

        {labCompleted && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-[450px] bg-[#0d0d0d] border border-[#c9a86c]/40 rounded-3xl shadow-[0_0_50px_rgba(201,168,108,0.2)] p-8 text-center flex flex-col items-center relative overflow-hidden select-text animate-in zoom-in-95 duration-300">
              {/* Ambient gold glow */}
              <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-[#c9a86c]/10 blur-3xl" />
              <div className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full bg-[#c9a86c]/10 blur-3xl" />

              <div className="w-16 h-16 rounded-full bg-[#c9a86c]/20 border border-[#c9a86c]/30 text-[#c9a86c] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(201,168,108,0.3)] animate-bounce z-10">
                <GraduationCap size={32} />
              </div>

              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#c9a86c] mb-1.5 z-10">Lab Completed Successfully</span>
              <h2 className="text-lg font-black text-white uppercase tracking-wider mb-4 z-10">
                {XBRIDGES_LEARNING_LABS.find(l => l.id === activeLabId)?.name || 'Co-Simulation Lab'}
              </h2>
              
              <p className="text-xs text-gray-400 leading-relaxed mb-6 z-10">
                Congratulations! You have completed all steps in this module. You have successfully simulated, monitored, and fine-tuned online learning models in the ADIA X-Bridges environment.
              </p>

              <div className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-5 mb-6 text-left z-10">
                <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">CONCEPTS MASTERED:</div>
                <ul className="space-y-1.5 text-[10px] text-gray-300 font-bold">
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
                      <li className="flex items-center gap-2"><Zap size={10} className="text-[#c9a86c]" /> Approximation of arbitrary plant reference models</li>
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
                </ul>
              </div>

              <button
                onClick={exitActiveLab}
                className="w-full py-3 rounded-2xl bg-[#c9a86c] text-[#0a0a0a] text-xs font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(201,168,108,0.4)] z-10"
              >
                Continue to Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
