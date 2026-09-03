# Hydraulic Reference (IL) Block Documentation

## 1. Overview & Physical Interpretation

The **Hydraulic Reference (IL)** block (`hydraulic_reference_il`), also available as **Reservoir (IL)**, establishes the absolute reference pressure boundary in an **Isothermal Liquid (IL)** physical network. In physical modeling and DAE (Differential-Algebraic Equation) systems, physical across-variables (such as voltage in electrical networks, temperature in thermal domains, and pressure in fluid domains) are determined up to an arbitrary constant until anchored by a datum node.

The Hydraulic Reference (IL) block anchors this datum node:
$$p_A = p_{target}$$

where $p_A$ is the pressure at conserving port $A$, and $p_{target}$ is the target absolute pressure evaluated from user-configured reference pressure and optional hydrostatic elevation corrections.

```
       Hydraulic Port A (Isothermal Liquid)
              │
              ▼
           ┌──────┐
           │  ●   │  Stem
           └──┬───┘
         ═════╧═════ Liquid Surface Datum
          / / / / /  Reservoir Datum Boundary
```

---

## 2. Conserving Port & Domain Isolation

* **Port Identifier**: `A`
* **Domain**: `isothermal_liquid`
* **Physical Semantic**: Conserving port where across variable is **Pressure** ($p$, $\text{Pa}$) and through variable is **Mass Flow Rate** ($\dot{m}$, $\text{kg/s}$).
* **Domain Isolation**: Port $A$ can only connect to other Isothermal Liquid conserving ports (e.g. pumps, pipes, valves, orifices, accumulators, cylinders). Direct connections to Electrical (`electrical`), Gas (`gas`), or Thermal (`thermal`) conserving ports are strictly rejected by the V-Lab connection validator.

---

## 3. Parameter Specifications

| Parameter Name | Description | Default | Supported Units / Options |
| -------------- | ----------- | ------- | ------------------------- |
| `referencePressure` | Boundary pressure level | `101325` | `Pa`, `kPa`, `MPa`, `bar`, `psi`, `atm` |
| `pressureType` | Interpretation of reference pressure | `absolute` | `absolute`, `gauge` |
| `atmosphericPressure` | Ambient pressure datum for gauge calculations | `101325` | `Pa`, `kPa`, `MPa`, `bar`, `psi`, `atm` |
| `elevationCorrection` | Enable hydrostatic elevation offset | `false` | `true`, `false` |
| `referenceElevation` | Datum elevation $z_{ref}$ | `0` | `m`, `cm`, `mm`, `km`, `ft`, `in` |
| `portElevation` | Port elevation $z_A$ | `0` | `m`, `cm`, `mm`, `km`, `ft`, `in` |
| `initializationPriority` | DAE algebraic solver initialization weighting | `high` | `high`, `low`, `none` |

### Pressure Calculation Formulae

1. **Absolute Reference Pressure**:
   $$\begin{cases} p_{abs} = p_{ref} & \text{if pressureType is absolute} \\ p_{abs} = p_{atm} + p_{ref} & \text{if pressureType is gauge} \end{cases}$$

2. **Hydrostatic Correction**:
   $$\begin{cases} p_{target} = p_{abs} + \rho \cdot g \cdot (z_{ref} - z_A) & \text{if elevationCorrection is true} \\ p_{target} = p_{abs} & \text{if elevationCorrection is false} \end{cases}$$
   where $\rho = 1000\text{ kg/m}^3$ (standard liquid density) and $g = 9.80665\text{ m/s}^2$.

---

## 4. Architectural Comparison

| Block | Domain | Across Variable Anchor | Role in Network |
| ----- | ------ | ---------------------- | --------------- |
| **Hydraulic Reference (IL)** | `isothermal_liquid` | Absolute Pressure ($p$, $\text{Pa}$) | Sets hydraulic pressure datum; supplies or sinks arbitrary fluid mass flow |
| **Reservoir (IL)** | `isothermal_liquid` | Absolute Pressure ($p$, $\text{Pa}$) | Semantic alias for large constant-pressure liquid supply/return tank |
| **Thermal Reference** | `thermal` | Absolute Temperature ($T$, $\text{K}$) | Sets temperature datum ($293.15\text{ K}$) for heat transfer networks |
| **Solver Configuration** | Universal (`physical`) | N/A (Meta-component) | Defines DAE solver algorithms (Euler, BDF, SDIRK), tolerances, and time step sizes |

---

## 5. Diagnostic Codes & Model Checker Rules

* **`VL-REF-IL-001` (Missing Reference Error)**:
  * **Cause**: An Isothermal Liquid network was detected without any Hydraulic Reference (IL), Reservoir (IL), or pressure boundary block.
  * **Remedy**: Connect a Hydraulic Reference (IL) block to at least one node in the hydraulic sub-network.
* **`VL-OVERCONSTRAINT-001` (Conflicting Ideal References Error)**:
  * **Cause**: Two ideal pressure boundaries with different pressure targets are connected directly to the same node without flow impedance in between.
  * **Remedy**: Insert a hydraulic component (such as a pipe, valve, or pump) between the two references, or align their pressure targets.

---

## 6. Acceptance Test Circuit

The Section 15 acceptance circuit demonstrates stable DAE solution, non-singular initialization, mass conservation, and unit conversion:

```
[Hydraulic Ref 1] ──(1 bar)──> [Pump (IL)] ──(3 bar)──> [Pipe (IL)] ────> [Restriction (IL)] ──(1 bar)──> [Hydraulic Ref 2]
                                 Δp = 2 bar               R = 50 kΩ          Cd = 0.6
```

* **Inlet Pressure**: $1.0\text{ bar}$ ($100,000\text{ Pa}$)
* **Downstream Pump Pressure**: $3.0\text{ bar}$ ($300,000\text{ Pa}$)
* **Mass Flow Conservation**: $\dot{m}_{pump} = \dot{m}_{pipe} = \dot{m}_{restriction}$ across all series components in steady state.
