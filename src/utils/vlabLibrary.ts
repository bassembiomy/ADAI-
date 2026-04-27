export interface VLabPort {
  id: string;
  pos: 'left' | 'right' | 'top' | 'bottom';
  label?: string;
}

export interface VLabBlock {
  id: string;
  name: string;
  color: string;
  icon: string;
  params: Record<string, { value: number; unit: string; label: string }>;
  category?: string;
  ports: VLabPort[];
}

export interface VLabDomain {
  type: string;
  blocks: VLabBlock[];
}

export const VLAB_LIBRARY: VLabDomain[] = [
  {
    type: 'Electrical',
    blocks: [
      // Passive
      { 
        id: 'resistor', name: 'Resistor', color: '#3b82f6', icon: '—[██]—', category: 'Passive',
        params: { R: { value: 100, unit: 'Ω', label: 'Resistance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'capacitor', name: 'Capacitor', color: '#3b82f6', icon: '—||—', category: 'Passive',
        params: { C: { value: 1e-6, unit: 'F', label: 'Capacitance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'inductor', name: 'Inductor', color: '#3b82f6', icon: '—m—', category: 'Passive',
        params: { L: { value: 1e-3, unit: 'H', label: 'Inductance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },

      // Semiconductors
      { 
        id: 'diode', name: 'Diode', color: '#60a5fa', icon: '—|>|—', category: 'Semiconductors',
        params: { Is: { value: 1e-12, unit: 'A', label: 'Saturation Current' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'k', pos: 'right', label: 'K' }]
      },
      { 
        id: 'mosfet_ideal', name: 'Ideal MOSFET', color: '#60a5fa', icon: '—[M]—', category: 'Semiconductors',
        params: { Ron: { value: 0.1, unit: 'Ω', label: 'On Resistance' }, Vth: { value: 2.5, unit: 'V', label: 'Threshold Voltage' } },
        ports: [{ id: 'd', pos: 'top', label: 'D' }, { id: 'g', pos: 'left', label: 'G' }, { id: 's', pos: 'bottom', label: 'S' }]
      },

      // Power Electronics
      { 
        id: 'universal_bridge', name: 'Universal Bridge', color: '#8b5cf6', icon: '[===]', category: 'Power Electronics',
        params: { Ron: { value: 1e-3, unit: 'Ω', label: 'On Resistance' } },
        ports: [
          { id: 'dc_p', pos: 'top', label: 'DC+' }, { id: 'dc_n', pos: 'bottom', label: 'DC-' },
          { id: 'a', pos: 'right', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },

      // Machines
      { 
        id: 'dc_motor', name: 'DC Motor', color: '#f59e0b', icon: '( M )', category: 'Machines',
        params: { Ra: { value: 0.5, unit: 'Ω', label: 'Armature Resistance' }, J: { value: 0.01, unit: 'kg-m²', label: 'Inertia' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'left', label: '-' }, { id: 'r', pos: 'right', label: 'R' }]
      },
      { 
        id: 'pmsm', name: 'PMSM', color: '#f59e0b', icon: '(PMSM)', category: 'Machines',
        params: { Rs: { value: 0.1, unit: 'Ω', label: 'Stator Resistance' }, p: { value: 4, unit: '1', label: 'Pole Pairs' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'left', label: 'B' }, { id: 'c', pos: 'left', label: 'C' },
          { id: 'r', pos: 'right', label: 'R' }
        ]
      },

      // Three-Phase
      { 
        id: 'three_phase_source', name: '3-Phase Source', color: '#ef4444', icon: '( 3~ )', category: 'Three-Phase',
        params: { Vll_rms: { value: 400, unit: 'V', label: 'Line-to-Line RMS' } },
        ports: [{ id: 'a', pos: 'right', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'c', pos: 'right', label: 'C' }]
      },

      // Utilities
      { 
        id: 'ground', name: 'Electrical Reference', color: '#10b981', icon: '⏚', category: 'Utilities',
        params: {},
        ports: [{ id: 'g', pos: 'top', label: '' }]
      }
    ]
  },
  {
    type: 'Mechanical',
    blocks: [
      { 
        id: 'mass', name: 'Mass', color: '#f59e0b', icon: '[ M ]',
        params: { m: { value: 1, unit: 'kg', label: 'Mass' } },
        ports: [{ id: 'p', pos: 'left', label: 'P' }]
      },
      { 
        id: 'spring', name: 'Spring', color: '#f59e0b', icon: '-/\/\/-',
        params: { k: { value: 1000, unit: 'N/m', label: 'Spring Rate' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      }
    ]
  }
];
