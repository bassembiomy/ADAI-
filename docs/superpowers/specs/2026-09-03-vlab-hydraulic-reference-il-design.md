# Hydraulic Reference (IL) Block Specification & Design

## 1. Overview & Objective

This specification details the addition of the **Hydraulic Reference (IL)** block (`hydraulic_reference_il`) to the V-Lab Isothermal Liquid library. The block establishes the absolute pressure datum for an isothermal liquid hydraulic network, analogous in purpose and mathematical behavior to connecting the physical network to an infinite liquid reservoir maintained at a specified pressure.

---

## 2. Block Identification & Taxonomy

* **Display Name**: `Hydraulic Reference (IL)`
* **Alternative Library Name / Alias**: `Reservoir (IL)`
* **Category**: `V-Lab / Fluids / Isothermal Liquid / Utilities`
* **Block Abbreviation**: `IL Reference`
* **Block Type ID**: `hydraulic_reference_il`
* **Domain**: `isothermal_liquid` (Library Domain: `"Isothermal Liquid"`)
* **Visual Icon**: Conserving hydraulic connection above a reservoir datum symbol
* **Icon / Theme Color**: Blue (`#2563eb`)
* **Ports**: Single conserving port `A` (`isothermal_liquid`), bidirectional.

---

## 3. Physical Port Specification

| Port | Type | Direction | Across Variable | Through Variable | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `A` | Isothermal Liquid conserving port | Bidirectional | Absolute Pressure $p_A$ ($\text{Pa}$) | Mass flow rate $\dot{m}_A$ ($\text{kg/s}$) | Connects the hydraulic network to the reference pressure datum |

* **Port Across Variable**: Absolute pressure $p_A$ ($\text{Pa}$).
* **Port Through Variable**: Mass flow rate $\dot{m}_A$ ($\text{kg/s}$), where:
  * $\dot{m}_A > 0$: Fluid enters the hydraulic network from the reference.
  * $\dot{m}_A < 0$: Fluid leaves the network into the reference.
* **Conserving Medium Properties**: Fluid density $\rho$ ($\text{kg/m}^3$) and kinematic viscosity/bulk modulus defined by the connected Isothermal Liquid domain.
* **Strict Domain Isolation**: Port `A` refuses connections to electrical, gas, thermal, mechanical, or signal ports.

---

## 4. Block Parameters

| Parameter | Symbol | Default Value | Unit | Type / Options | Validation Rule |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Reference pressure** | $p_{ref}$ | `101325` | `Pa` | Numeric | Must be $> 0$ |
| **Pressure type** | — | `Absolute` | — | Enum (`Absolute`, `Gauge`) | Must be one of `Absolute` or `Gauge` |
| **Atmospheric pressure** | $p_{atm}$ | `101325` | `Pa` | Numeric | Must be $> 0$ |
| **Enable elevation correction** | — | `false` | — | Boolean | `true` or `false` |
| **Reference elevation** | $z_{ref}$ | `0` | `m` | Numeric | Finite real number |
| **Initialization priority** | — | `High` | — | Enum (`High`, `Low`, `None`) | Priority hint for algebraic solver |

### Supported Engineering Units

* **Pressure**: `Pa`, `kPa`, `MPa`, `bar`, `psi`, `atm`
* **Elevation**: `m`, `cm`, `mm`, `km`, `ft`, `in`
* All parameter calculations, state equations, and DAE residuals are evaluated internally in SI units (`Pa`, `m`, `kg/s`).

---

## 5. Governing Equations & DAE Representation

### 5.1 Absolute Pressure Computation
* When `pressureType === 'gauge'`:
  $$p_{absolute} = p_{atm} + p_{ref}$$
* When `pressureType === 'absolute'`:
  $$p_{absolute} = p_{ref}$$

### 5.2 Terminal Constraint
* Without elevation correction (`elevationCorrection === false`):
  $$p_A = p_{absolute}$$
* With elevation correction (`elevationCorrection === true`):
  $$p_A = p_{absolute} + \rho g (z_{ref} - z_A)$$
  where:
  * $\rho$: Fluid density (default: $1000\text{ kg/m}^3$, or resolved from the Isothermal Liquid Properties block).
  * $g$: Gravitational acceleration ($9.80665\text{ m/s}^2$).
  * $z_{ref}$: Reference fluid elevation ($\text{m}$).
  * $z_A$: Connected port elevation ($\text{m}$, defaults to $0\text{ m}$).

### 5.3 Mass Flow & Continuity
* The mass flow rate $\dot{m}_A$ is completely unrestricted by the reference:
  $$\dot{m}_A = \text{determined by connected network continuity}$$
* The block represents an infinite capacity fluid source/sink; its pressure is invariant with respect to $\dot{m}_A$.
* In the DAE system, the reference block imposes an algebraic boundary condition:
  $$\text{Residual}[p_A] = x[p_A] - p_A^{target} = 0$$
* Node $A$ is registered as a reference datum node in `DAEAssembler`, satisfying Kirchhoff's mass conservation equation without a redundant pressure degree of freedom.

---

## 6. Network Topology Rules & Model Checker

The model checker and network compiler enforce the following rules:

1. **Mandatory Pressure Datum**:
   * Every isolated Isothermal Liquid network must contain at least one pressure-defining boundary block (`hydraulic_reference_il` or `reservoir_il`).
   * **Diagnostic**: If missing, emit error:
     `"Isothermal Liquid network has no pressure reference. Add a Hydraulic Reference (IL), Reservoir (IL), or another pressure boundary."`
2. **Overconstraint Detection**:
   * Connecting two conflicting ideal pressure boundaries directly to the same node without an intervening impedance/resistance triggers:
     `"Conflicting ideal pressure references connected to the same node (overconstraint)."`
3. **Strict Conserving Domain Boundary**:
   * Ports of domain `isothermal_liquid` only connect to `isothermal_liquid` ports. Cross-domain connections (e.g. to `electrical`, `gas`, `thermal`, `mechanical`, `signal`) are rejected during connection creation and flagged in pre-simulation diagnostics.
4. **Solver Configuration**:
   * Every independent physical network requires exactly one `solver_config` block.

---

## 7. User Interface Specification

### 7.1 Parameter Dialog (Right Inspector Panel in `VLabWorkspace.tsx`)
When a `hydraulic_reference_il` node is selected, the inspector renders:

1. **Pressure Settings**:
   * Reference pressure numeric field.
   * Unit selector dropdown (`Pa`, `kPa`, `MPa`, `bar`, `psi`, `atm`).
   * Pressure type selector (`Absolute` vs `Gauge`).
   * Atmospheric pressure numeric field + unit selector (enabled/displayed for Gauge pressure).
2. **Elevation Settings**:
   * Enable elevation correction toggle.
   * Reference elevation numeric field (visible when enabled).
   * Elevation unit selector (`m`, `cm`, `mm`, `km`, `ft`, `in`).
3. **Initialization & Computed Preview**:
   * Initialization priority selector (`High`, `Low`, `None`).
   * Dynamic preview banner displaying computed absolute pressure in user-selected units and SI (`Pa`):
     $$\text{Calculated Absolute Pressure: } p_{absolute}$$

### 7.2 Graphical Canvas Representation (`VLabSymbols.tsx`)
* Custom SVG glyph depicting a hydraulic terminal entering a stylized fluid reservoir datum with surface and hatch markings in blue (`#2563eb`).
* Single top port `A` labeled clearly.
* Tooltip on port hover: `"Isothermal Liquid conserving port"`.
* Parameter annotation under block showing active reference pressure (e.g., `"1.0 bar"`).

---

## 8. Serialization Schema

Models containing the block are saved and loaded in JSON conforming to:

```json
{
  "type": "hydraulic_reference_il",
  "name": "Hydraulic Reference",
  "parameters": {
    "referencePressure": {
      "value": 101325,
      "unit": "Pa"
    },
    "pressureType": "absolute",
    "atmosphericPressure": {
      "value": 101325,
      "unit": "Pa"
    },
    "elevationCorrection": false,
    "referenceElevation": {
      "value": 0,
      "unit": "m"
    },
    "initializationPriority": "high"
  }
}
```

---

## 9. Companion Components for Acceptance Test

To execute the Section 15 acceptance test circuit, the Isothermal Liquid domain includes:

1. **`pump_il` (Hydraulic Pump IL)**:
   * Conserving ports `A` (inlet) and `B` (outlet).
   * Parameter: `pressure_rise` ($\Delta p$, default $2\text{ bar} = 200,000\text{ Pa}$).
   * Equation: $p_B - p_A = \Delta p$, $\dot{m}_A = \dot{m}_B$.
2. **`pipe_il` (Hydraulic Pipe IL)**:
   * Conserving ports `A` and `B`.
   * Laminar/resistive pressure drop: $p_A - p_B = R_{pipe} \cdot \dot{m}$.
3. **`restriction_il` (Hydraulic Restriction IL)**:
   * Conserving ports `A` and `B`.
   * Orifice restriction equation: $\dot{m} = C_d A \sqrt{2\rho |p_A - p_B|} \operatorname{sign}(p_A - p_B)$.

---

## 10. Verification & Testing Plan

Automated test suites will be implemented in `src/engine/vlab/hydraulicReferenceIL.test.ts`:

1. **Default Reference**: Default atmospheric pressure ($101,325\text{ Pa}$) datum.
2. **Custom Absolute Pressure**: Arbitrary pressure setpoints (e.g. $500,000\text{ Pa}$).
3. **Gauge Conversion**: Verification of $p_{abs} = p_{atm} + p_{gauge}$ across unit variations.
4. **Unit Conversion Rigor**: Bidirectional conversions between Pa, kPa, MPa, bar, psi, atm.
5. **Positive Mass Flow**: Verifying fluid flow entering network from reference.
6. **Negative Mass Flow**: Verifying fluid flow leaving network into reference.
7. **Zero-Flow Static Equilibrium**: Two identical reference boundaries connected across a resistor yielding zero net flow.
8. **Domain Incompatibility Rejection**: Rejection of IL port connections to electrical, gas, thermal, mechanical, signal.
9. **Missing Reference Detection**: Model checker emits `VL-REF-IL-001` diagnostic when IL reference is missing.
10. **Conflicting Reference Detection**: Model checker emits overconstraint diagnostic for conflicting boundary connections.
11. **Serialization Integrity**: Save/load round-trip matches the specification schema.
12. **Canvas Editing Integrity**: Copy, paste, undo, redo preserves block configurations.
13. **Block Deletion Re-validation**: Deleting reference immediately transitions network to ungrounded state with diagnostic.
14. **Acceptance Test Simulation (Section 15)**:
    * Circuit: `Ref 1 (1 bar abs) -> Pump (IL, dp = 2 bar) -> Pipe (IL) -> Restriction (IL) -> Ref 2 (1 bar abs)`.
    * Solves without singular matrix or non-convergence errors.
    * Node immediately downstream of pump reaches $\approx 3\text{ bar}$ absolute ($1\text{ bar} + 2\text{ bar}$).
    * Mass conservation preserved across all series components ($\dot{m}_{\text{Ref1}} = \dot{m}_{\text{Pump}} = \dot{m}_{\text{Pipe}} = \dot{m}_{\text{Restriction}} = -\dot{m}_{\text{Ref2}}$).
    * Pressure values reported accurately in user-selected units.
