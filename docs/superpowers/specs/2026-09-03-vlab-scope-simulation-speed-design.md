# V-Lab Scope Simulation Speed Control Design Specification

## 1. Objective
Enable users to accelerate V-Lab simulation up to 5x faster directly from the Scope interface while preserving physical model accuracy, DAE governing equations, and integration step size (dt = 0.05 s).

## 2. Requirements & Constraints
- **Scope Speed Multiplier**: Available speed settings: 1x, 2x, 3x, 4x, 5x (default: 1x).
- **Physical Model & Step Size Integrity**: The numerical step size dt = 0.05 s must remain constant. Acceleration is achieved by evaluating N solver integration sub-steps per wall-clock clock tick (50 ms), not by enlarging dt.
- **Scope UI**: A dropdown button in the Scope ribbon toolbar styled with Zap icon and speed label (e.g. 1x v), allowing rapid switching between 1x and 5x.
- **Continuous Acquisition & Buffer Health**: All sub-steps update the Scope buffer according to decimation and buffer limit settings so traces remain smooth without gaps.

## 3. Architecture & Interfaces

### 3.1 VLabSimulinkScope Component (`src/components/vlab/VLabSimulinkScope.tsx`)
- Props additions:
  - `simSpeed?: number;` (default 1)
  - `onSpeedChange?: (speed: number) => void;`
- Toolbar layout:
  - Add speed selector dropdown next to the Layout selector.
  - Dropdown options: `1x Speed (Real-Time)`, `2x Speed`, `3x Speed`, `4x Speed`, `5x Speed`.

### 3.2 VLabWorkspace Component (`src/components/vlab/VLabWorkspace.tsx`)
- State:
  - `const [simSpeed, setSimSpeed] = useState<number>(1);`
  - `const simSpeedRef = useRef<number>(1);`
  - Synchronize `simSpeedRef.current = simSpeed;`
- Simulation loop:
  - In each 50ms interval tick, execute a loop of N = simSpeedRef.current sub-steps (1 <= N <= 5).
  - For each sub-step:
    - Check effective limit (`currentT >= limit`).
    - Step the physics engine: `val = step(currentT, dt)`.
    - Advance time: `simTimeRef.current = nextT`.
    - Update `scopeData` and `perScopeData` with sampling filters.
  - Update `setSimTime(simTimeRef.current)` once per interval tick to minimize React render overhead.
- Pass `simSpeed={simSpeed}` and `onSpeedChange={setSimSpeed}` to `<VLabSimulinkScope>`.

## 4. Verification Plan
- Unit test in `src/components/vlab/VLabSimulinkScope.test.tsx` verifying:
  - Scope renders speed control dropdown button with active multiplier.
  - Speed change event propagation.
- Full regression check (`npm run test:vlab`, `npm run test:vlab:connected`, `npx tsc --noEmit`).
