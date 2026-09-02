# VLab Constant Block Specification & Design

## 1. Overview
The goal of this feature is to add `constant` as a first-class block and alias alongside `ps_constant` in the VLab module. This enables users to search for, drop, configure, and simulate a "Constant" block in the VLab workspace interchangeably with physical signal constant sources.

## 2. Component Specifications

### 2.1 Library Definition (`src/utils/vlabLibrary.ts`)
- Add the `constant` block entry under the `Physical` domain in `VLAB_LIBRARY`:
  - **id**: `'constant'`
  - **name**: `'Constant'`
  - **color**: `'#92400e'`
  - **icon**: `'ps_const'`
  - **category**: `'Sources'`
  - **params**:
    - `value`: `{ value: 1, unit: '1', label: 'Constant Value' }`
  - **ports**:
    - `[{ id: 'y', pos: 'right', label: 'C', domain: 'Physical' }]`
  - **equation**: `'y(t) = Value'`
  - **description**: `'Outputs a steady constant scalar value across all simulation time.'`

### 2.2 Physics & Component Definitions (`src/engine/vlab/`)
- **`vlabComponentDefinitions.ts`**:
  - Add `constant` definition:
    - `equations: ['y = value']`
    - `latex: ['y(t) = C']`
    - `across: 'None'`, `through: 'Signal'`
    - `description: 'Generates a constant physical signal. Use to set fixed setpoints or parameters in control loops.'`
- **`vlabEquations.ts`**:
  - Add `constant` equation handler to `VLAB_EQUATIONS`:
    ```typescript
    constant: ({ branch, params }) => {
      const val = params.value !== undefined ? params.value : 1.0;
      return [branch[0] - val];
    },
    ```

### 2.3 UI & Canvas Integration (`src/components/vlab/`)
- **`VLabSymbols.tsx`**:
  - Add `case 'constant':` alongside `case 'ps_constant':` and `case 'ps_const':` for rendering the standard rectangular symbol with `C`.
- **`VLabNode.tsx`**:
  - Handle `type === 'constant'` alongside `type === 'ps_constant'` when generating primary subtitle text (`const ${params.value.value ?? params.value}`).
- **`blockDimensions.ts` & `VLabWorkspace.tsx`**:
  - Set default node dimensions for `constant` to `{ width: 40, height: 40 }`.

## 3. Verification & Testing
- Unit tests verifying:
  1. `VLAB_LIBRARY` contains the `constant` block with expected ports and parameters.
  2. `vlabEquations` calculates correct branch residuals for `constant` across different configured values.
  3. Connected model simulation with `constant` node successfully resolves against downstream blocks (e.g. gain, subtract, scope).
