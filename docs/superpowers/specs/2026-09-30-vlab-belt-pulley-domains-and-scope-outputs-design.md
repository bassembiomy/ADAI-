# VLab Belt, Spool, and Pulley Domain Separation & Measurement Outputs Design

## 1. Overview & Problem Statement
In the ADIA Virtual Laboratory (VLab) multi-body physical modeling engine:
1. **Property Port Domain Ambiguity**: `belt_properties` used a generic `"Physical"` domain for port `p`, which allowed parameter wiring to mix with mechanical translational and rotational networks.
2. **Missing Dedicated Property Ports on Consuming Blocks**: Consuming blocks (`belt_end`, `belt_spool`, and `pulley`) lacked a dedicated property port. The material injection logic attempted to check all ports or fell back globally to the first `belt_properties` block in the schematic.
3. **Improper Mechanical Domains**:
   - `belt_end` ports (`r`, `e`) were declared as generic `"Physical"` instead of `"Translational"`.
   - `belt_spool` and `pulley` ports (`r`, `a`, `b`) were declared as generic `"Physical"` instead of proper `"Rotational"` (shaft `r`) and `"Translational"` (belt ends `a`, `b`), preventing logical integration with standard rotational and translational mechanical components.
4. **Lack of Measurement Outputs for Scope**: There were no dedicated measurement output ports on `belt_end`, `belt_spool`, or `pulley` to inspect tension force ($F$) or torque ($\tau$). As a result, users could not directly observe the dynamic effects of varying belt material parameters (`density`, `youngs`) on a Scope.
5. **Silent Fallback Anti-Pattern**: If a belt component was unwired to a material block, `DAEAssembler.ts` automatically injected the properties of any `belt_properties` block present in the schematic, obscuring user wiring errors.

This design addresses these architectural flaws by introducing strict domain separation, dedicated property ports, explicit mechanical domains, measurement output ports for Scope visualization, and strict no-fallback wiring semantics.

---

## 2. Requirements & Domain Model

### 2.1 Dedicated "BeltProperty" Domain
* Introduce a new port domain `"BeltProperty"` in `src/utils/vlabLibrary.ts` and component definition types.
* Port `p` on `belt_properties` is typed as `"BeltProperty"`.
* Port `p` on `belt_end`, `belt_spool`, and `pulley` is typed as `"BeltProperty"`.
* The canvas domain-compatibility checker restricts `"BeltProperty"` ports to connect only with other `"BeltProperty"` ports, preventing accidental shorting with electrical, mechanical, or thermal networks.

### 2.2 Mechanical Domain Specialization
* **`belt_end`**:
  * Port `r` (Reference/Base attachment): Domain `"Translational"`, position: `'left'`.
  * Port `e` (End/Free attachment): Domain `"Translational"`, position: `'right'`.
* **`belt_spool`**:
  * Port `r` (Shaft/Rotor attachment): Domain `"Rotational"`, position: `'left'`.
  * Port `a` (Linear belt attachment): Domain `"Translational"`, position: `'right'`.
* **`pulley`**:
  * Port `r` (Shaft/Hub attachment): Domain `"Rotational"`, position: `'left'`.
  * Port `a` (Belt segment 1 attachment): Domain `"Translational"`, position: `'right'`.
  * Port `b` (Belt segment 2 attachment): Domain `"Translational"`, position: `'right'`.

### 2.3 Dedicated Property Reception Port `p`
* Add port `p` (`domain: 'BeltProperty'`, position: `'top'`, label: `'P'`) to:
  * `belt_end`
  * `belt_spool`
  * `pulley`
* When port `p` is connected to a `belt_properties` block's port `p`, the block inherits:
  * `belt_youngs` (Young's modulus $E$ in Pa)
  * `belt_density` (linear density $\rho$ in kg/m or volumetric density)
  * `belt_damping` (internal damping ratio/coefficient)

### 2.4 Measurement Output Ports for Scope
* Add dedicated output ports typed as domain `"Physical"` (or signal compatible) positioned at `'bottom'`:
  * **`belt_end`**: Port `f` (`label: 'F'`, domain: `'Physical'`, position: `'bottom'`) — outputs the calculated instantaneous tensile force $F(t) = k \cdot (x_e - x_r) + c \cdot (\dot{x}_e - \dot{x}_r)$ (with non-slack condition).
  * **`belt_spool`**: Port `t` (`label: 'T'`, domain: `'Physical'`, position: `'bottom'`) — outputs the calculated transmission torque $\tau(t) = F_{belt} \cdot R_{spool}$.
  * **`pulley`**: Port `t` (`label: 'T'`, domain: `'Physical'`, position: `'bottom'`) — outputs the calculated net transmission torque $\tau(t) = (F_{b} - F_{a}) \cdot R_{pulley}$.
* These measurement ports can be connected directly to a `scope` block to plot dynamic response and immediately see the effect of changing `density` or `youngs`.

### 2.5 Strict No-Fallback Material Assignment
* In `src/engine/vlab/DAEAssembler.ts`, material injection must verify equivalence only between port `p` of the consumer block and port `p` of the source `belt_properties` block:
  ```typescript
  uf.find(`${nodeId}_p`) === uf.find(`${src.nodeId}_p`)
  ```
* If a belt block's port `p` is not connected to any `belt_properties` block, do **NOT** assign fallback properties. The component uses its own local parameters (`stiffness`, `inertia`, `damping`).

---

## 3. Architecture & File Updates

### 3.1 `src/utils/vlabLibrary.ts` & `src/engine/vlab/vlabComponentDefinitions.ts`
1. Update `belt_properties`:
   - `ports: [{ id: 'p', label: 'P', type: 'inout', domain: 'BeltProperty', position: 'right' }]`.
2. Update `belt_end`:
   - `ports: [
       { id: 'r', label: 'R', type: 'inout', domain: 'Translational', position: 'left' },
       { id: 'e', label: 'E', type: 'inout', domain: 'Translational', position: 'right' },
       { id: 'p', label: 'P', type: 'input', domain: 'BeltProperty', position: 'top' },
       { id: 'f', label: 'F', type: 'output', domain: 'Physical', position: 'bottom' }
     ]`.
3. Update `belt_spool`:
   - `ports: [
       { id: 'r', label: 'R', type: 'inout', domain: 'Rotational', position: 'left' },
       { id: 'a', label: 'A', type: 'inout', domain: 'Translational', position: 'right' },
       { id: 'p', label: 'P', type: 'input', domain: 'BeltProperty', position: 'top' },
       { id: 't', label: 'T', type: 'output', domain: 'Physical', position: 'bottom' }
     ]`.
4. Update `pulley`:
   - `ports: [
       { id: 'r', label: 'R', type: 'inout', domain: 'Rotational', position: 'left' },
       { id: 'a', label: 'A', type: 'inout', domain: 'Translational', position: 'right' },
       { id: 'b', label: 'B', type: 'inout', domain: 'Translational', position: 'right' },
       { id: 'p', label: 'P', type: 'input', domain: 'BeltProperty', position: 'top' },
       { id: 't', label: 'T', type: 'output', domain: 'Physical', position: 'bottom' }
     ]`.

### 3.2 `src/engine/vlab/DAEAssembler.ts`
1. **Material Injection (`injectBeltMaterial`)**:
   - Check strictly:
     ```typescript
     const pRoot = uf.find(`${nodeId}_p`);
     const matchedSource = beltMaterialSources.find(src => uf.find(`${src.nodeId}_p`) === pRoot);
     ```
   - If `matchedSource` exists, set `node.parameters.belt_youngs`, `node.parameters.belt_density`, and `node.parameters.belt_damping`.
   - Remove the fallback: `const src = matchedSource || beltMaterialSources[0];` -> replaced by: `if (!matchedSource) return;`.
2. **Measurement Port Sensor Equations**:
   - For `belt_end`, if port `f` is connected, generate algebraic constraint equation coupling the variable at port `f` to the internal tension variable $F$.
   - For `belt_spool` and `pulley`, if port `t` is connected, generate algebraic constraint equation coupling the variable at port `t` to the torque $\tau$.

### 3.3 `src/engine/vlab/vlabEquations.ts`
- Ensure equations for `belt_end`, `belt_spool`, and `pulley` expose their through/across variables consistently to the measurement pins (`f` and `t`).
- Calculate dynamic stiffness based on $k = \frac{E \cdot A}{L}$ when $E$ (`belt_youngs`) is provided, and effective inertia based on $\rho$ (`belt_density`).

---

## 4. Testing & Verification Plan

### 4.1 Unit Tests
* **Port & Domain Verification**:
  - Test that `belt_properties.p` has domain `'BeltProperty'`.
  - Test that `belt_end` has domains `Translational` for `r`/`e`, `BeltProperty` for `p`, and `Physical` for `f`.
  - Test that `belt_spool` has `Rotational` for `r`, `Translational` for `a`, `BeltProperty` for `p`, and `Physical` for `t`.
  - Test that `pulley` has `Rotational` for `r`, `Translational` for `a`/`b`, `BeltProperty` for `p`, and `Physical` for `t`.

### 4.2 Material Inheritance & Isolation Tests
* Test that wiring `belt_properties.p` -> `belt_end.p` injects `belt_youngs` and `belt_density` into `belt_end`.
* Test that an unwired `belt_end` in the same schematic does NOT receive material properties from `belt_properties` (no silent global fallback).
* Test that cross-domain connections (e.g. `Rotational` shaft to `BeltProperty` port) are rejected.

### 4.3 Scope Measurement & Sensitivity Tests
* Test that connecting `belt_end.f` to `scope.in` logs the tension force signal.
* Test that changing `youngs` (e.g. steel belt vs rubber belt) produces quantitatively different tension/oscillation frequencies measured by Scope.
* Test that connecting `pulley.t` to `scope.in` logs the torque signal.
