export interface BlockDefinition {
  equations: string[];
  latex: string[];
  across: string;
  through: string;
}

export const VLAB_COMPONENT_DEFINITIONS: Record<string, BlockDefinition> = {
  // Electrical - Passive
  resistor: {
    equations: ['I = (Vp - Vn)/R'],
    latex: ['I = \\frac{V_p - V_n}{R}'],
    across: 'V',
    through: 'I'
  },
  capacitor: {
    equations: ['I = C * dV/dt'],
    latex: ['I = C \\cdot \\frac{dV}{dt}'],
    across: 'V',
    through: 'I'
  },
  inductor: {
    equations: ['V = L * dI/dt'],
    latex: ['V = L \\cdot \\frac{dI}{dt}'],
    across: 'V',
    through: 'I'
  },

  // Power Electronics
  universal_bridge: {
    equations: ['V_out = switching_state * V_dc'],
    latex: ['V_{abc} = S_{abc} \\cdot V_{dc}', 'i_{dc} = \\sum S_{abc} \\cdot i_{abc}'],
    across: 'V',
    through: 'I'
  },
  buck_converter: {
    equations: ['V_out = D * V_in'],
    latex: ['V_{out} = D \\cdot V_{in}', 'L \\frac{di_L}{dt} = D V_{in} - V_{out}'],
    across: 'V',
    through: 'I'
  },
  boost_converter: {
    equations: ['V_out = V_in / (1 - D)'],
    latex: ['V_{out} = \\frac{V_{in}}{1-D}', 'L \\frac{di_L}{dt} = V_{in} - (1-D) V_{out}'],
    across: 'V',
    through: 'I'
  },

  // Machines
  dc_motor: {
    equations: ['Va = Ra*Ia + La*dIa/dt + Ke*omega', 'Te = Kt*Ia', 'J*domega/dt = Te - Tl - B*omega'],
    latex: ['V_a = R_a I_a + L_a \\frac{dI_a}{dt} + K_e \\omega', 'T_e = K_t I_a', 'J \\frac{d\\omega}{dt} = T_e - T_l - B \\omega'],
    across: 'V',
    through: 'I'
  },
  pmsm: {
    equations: ['Vd = Rs*Id + Ld*dId/dt - omega_e*Lq*Iq', 'Vq = Rs*Iq + Lq*dIq/dt + omega_e*(Ld*Id + lambda_m)'],
    latex: [
      'V_d = R_s I_d + L_d \\frac{dI_d}{dt} - \\omega_e L_q I_q',
      'V_q = R_s I_q + L_q \\frac{dI_q}{dt} + \\omega_e (L_d I_d + \\lambda_m)',
      'T_e = 1.5 p (\\lambda_m I_q + (L_d - L_q) I_d I_q)'
    ],
    across: 'V',
    through: 'I'
  },
  bldc_motor: {
    equations: ['V_abc = R*I_abc + L*dI_abc/dt + E_abc'],
    latex: ['V_{abc} = R I_{abc} + L \\frac{dI_{abc}}{dt} + E_{abc}', 'T_e = \\frac{\\sum E_i I_i}{\\omega_m}'],
    across: 'V',
    through: 'I'
  },

  // Three-Phase Systems
  three_phase_source: {
    equations: ['Va = Vp*sin(wt)', 'Vb = Vp*sin(wt-2pi/3)', 'Vc = Vp*sin(wt+2pi/3)'],
    latex: ['V_{a} = V_{pk} \\sin(\\omega t)', 'V_{b} = V_{pk} \\sin(\\omega t - \\frac{2\\pi}{3})', 'V_{c} = V_{pk} \\sin(\\omega t + \\frac{2\\pi}{3})'],
    across: 'V',
    through: 'I'
  },

  // Transmission Lines
  pi_section_line: {
    equations: ['V_in - V_out = R*I + L*dI/dt'],
    latex: ['V_s - V_r = Z I', 'I_s - I_r = Y V'],
    across: 'V',
    through: 'I'
  },

  // Sources & Sensors (Common)
  voltage_dc: {
    equations: ['V = V_dc'],
    latex: ['V = V_{dc}'],
    across: 'V',
    through: 'I'
  },
  battery: {
    equations: ['V = V_oc(SOC) - I*R_int'],
    latex: ['V = V_{oc}(SOC) - I R_{int}', '\\frac{dSOC}{dt} = -\\frac{I}{3600 Ah}'],
    across: 'V',
    through: 'I'
  },
  v_sensor: {
    equations: ['V_out = Vp - Vn'],
    latex: ['V_{out} = V_p - V_n'],
    across: 'V',
    through: 'I'
  },
  i_sensor: {
    equations: ['I_out = I_branch'],
    latex: ['I_{out} = I_{branch}'],
    across: 'V',
    through: 'I'
  },
  ground: {
    equations: ['V = 0'],
    latex: ['V = 0'],
    across: 'V',
    through: 'I'
  }
};
