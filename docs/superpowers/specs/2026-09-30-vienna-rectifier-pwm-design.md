# Vienna Rectifier PWM Generator Design

## Goal

Make `pwm_vienna` a real, physically consistent Vienna Rectifier PWM generator whose ports, DAE branches, UI parameters, component definitions, and equation outputs describe a true three-phase unidirectional three-level boost rectifier switching model.

## Ports and DAE Contract

All ports are explicitly typed as `domain: "Physical"`.

### Inputs (Left Ports)
1. `va`: Phase A AC voltage (V)
2. `vb`: Phase B AC voltage (V)
3. `vc`: Phase C AC voltage (V)
4. `ia`: Phase A AC current (A)
5. `ib`: Phase B AC current (A)
6. `ic`: Phase C AC current (A)
7. `vdc`: Total DC-link voltage (V)
8. `vneut`: Neutral-point midpoint potential / unbalance voltage (V)

### Outputs (Right Ports)
1. `ga`: Phase A gate command in `{0, 1}` (1 = switch active / clamped to neutral, 0 = diode conduction)
2. `gb`: Phase B gate command in `{0, 1}`
3. `gc`: Phase C gate command in `{0, 1}`
4. `ma`: Phase A normalized modulation index in `[-1, 1]`
5. `mb`: Phase B normalized modulation index in `[-1, 1]`
6. `mc`: Phase C normalized modulation index in `[-1, 1]`

The DAE assembler allocates an explicit output branch for each of the six outputs (`ga`, `gb`, `gc`, `ma`, `mb`, `mc`). No vector is collapsed into a single scalar port, and no output is left without a DAE branch.

## Parameters

The block definition and library UI expose:

| Parameter | Default | Unit | Meaning |
| --- | ---: | --- | --- |
| `f_sw` | 10000 | Hz | Triangular carrier switching frequency |
| `vdc_ref` | 800 | V | Target DC-link voltage reference |
| `kp_v` | 0.1 | A/V | Proportional gain for outer DC bus voltage regulation |
| `neutral_balance_gain` | 0.1 | 1/V | Neutral-point unbalance compensation gain |

## Physical and Switching Equations

At simulation time `t`:
1. **DC Voltage Regulation:**
   Calculates active current reference scaling $I^* = \max(0, k_{p\_v} \cdot (v_{dc\_ref} - v_{dc}))$.
2. **Neutral-Point Balancing:**
   Calculates bounded zero-sequence bias:
   $$\Delta_{neut} = \text{clamp}\left(k_{neut} \cdot \frac{v_{neut}}{\max(|v_{dc}|, 1)}, -0.2, 0.2\right)$$
3. **Modulation Indices ($m_a, m_b, m_c$):**
   For each phase $x \in \{a, b, c\}$:
   $$v_{norm, x} = \frac{2 \cdot v_x}{\max(|v_{dc}|, 1)}$$
   $$e_{i, x} = I^* \cdot \frac{v_x}{\max(\sqrt{v_a^2 + v_b^2 + v_c^2 + 1e-6}, 1)} - i_x$$
   $$m_x = \text{clamp}\left(v_{norm, x} + 0.05 \cdot e_{i, x} + \Delta_{neut}, -1, 1\right)$$
4. **PWM Switching & Gate Generation ($g_a, g_b, g_c$):**
   A normalized triangular carrier $C_{tri}(t) \in [0, 1]$ runs at frequency $f_{sw}$:
   $$\theta_c = (t \cdot f_{sw}) \bmod 1$$
   $$C_{tri}(t) = 2 \cdot |\theta_c - 0.5|$$
   In the Vienna Rectifier topology, the bidirectional phase switch is ON ($g_x = 1$) during the zero-voltage interval and OFF ($g_x = 0$) during the active boost interval:
   $$d_x = 1 - |m_x|$$
   $$g_x = \begin{cases} 1 & \text{if } C_{tri}(t) < d_x \\ 0 & \text{otherwise} \end{cases}$$
   When $v_x = 0, i_x = 0$, $m_x = 0 \implies d_x = 1 \implies g_x = 1$ (all switches clamped to neutral, idle state).

## Residual Equations

The component equation factory evaluates 6 residuals matching the 6 allocated branches:
- Residual 0: `branch[0] - ga`
- Residual 1: `branch[1] - gb`
- Residual 2: `branch[2] - gc`
- Residual 3: `branch[3] - ma`
- Residual 4: `branch[4] - mb`
- Residual 5: `branch[5] - mc`

## Verification Criteria

Tests in `src/engine/vlab/viennaPwmModel.test.ts` and `src/utils/vlabLibrary.test.ts` must prove:
1. All 14 ports (8 inputs, 6 outputs) have `domain: "Physical"`.
2. DAE Assembler allocates 6 explicit branches: `pwm_branch_ga`, `pwm_branch_gb`, `pwm_branch_gc`, `pwm_branch_ma`, `pwm_branch_mb`, `pwm_branch_mc`.
3. Gate outputs $g_a, g_b, g_c$ are strictly binary in $\{0, 1\}$.
4. Three distinct phases produce distinct phase-shifted outputs for balanced 3-phase AC inputs.
5. Varying `f_sw` alters switching transitions across time.
6. Changing `vdc` and `vneut` alters neutral balancing correction $\Delta_{neut}$ and modulation signals.
7. Changing `vdc_ref` affects current loop command and modulation signals.
