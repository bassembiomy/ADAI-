# VLab Refined Schematic UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all VLab block icons to one professional schematic standard, pin connection ports onto each block's outer bounding-box edge, and unify rendering across canvas, palette, and quick-insert popup.

**Architecture:** Extract the three rendering units out of the 4765-line `VLabWorkspace.tsx` into focused modules (`blockDimensions.ts`, `VLabSymbols.tsx`, `VLabNode.tsx`). Normalization (shadow, round caps, stroke width) happens at a single wrapper point instead of editing hundreds of SVGs; missing symbols are added as dedicated cases or aliases to existing ones; ports become hollow rings anchored to the symbol bounding box with connected-state feedback.

**Tech Stack:** React 18, reactflow 11.11.4, Tailwind CSS, vitest 4 (tests call components as plain functions — no jsdom/@testing-library needed).

## Global Constraints

- **This workspace is NOT a git repo — there are NO commit steps.** Every task's final checkpoint is: `npx tsc --noEmit` exits clean.
- **NEVER change the Handle id format** `` `${id}-${port.id}` `` — saved projects, subsystem port sync, and edge validation depend on it.
- Only these paths may be touched: `src/components/vlab/*`, `src/index.css`.
- No new npm dependencies. No engine/solver/connection-rule changes (`src/engine/vlab/**` untouched).
- Run targeted tests with `npx vitest run <file>`; full suites at the end: `npm run test:vlab` and `npx vitest run src/components/vlab/vlabScopeDynamicPorts.test.ts`.
- All existing public behavior preserved: rotation (`data.rotation`), multi-port sides, `NodeErrorBoundary`, `nodeTypes` registration keys (`default`, `doe_custom`).

## File Structure

- Create `src/components/vlab/blockDimensions.ts` — per-type symbol bounding boxes + `getBlockDimensions(type)` (single source of truth for port anchoring and palette fitting).
- Create `src/components/vlab/blockDimensions.test.ts` — coverage/override tests.
- Create `src/components/vlab/VLabSymbols.tsx` — `SymbolRenderer` (+ internal `RawSymbolRenderer`, `SymGlyph`, `UnknownSymbolGlyph`) moved out of VLabWorkspace and restyled.
- Create `src/components/vlab/vlabSymbols.test.tsx` — "every library id renders a real symbol" guard.
- Create `src/components/vlab/VLabNode.tsx` — `VLabNode`, `getRotatedPosition`, `NodeErrorBoundary` moved out, with new port rings, labels, and selection states.
- Modify `src/components/vlab/VLabWorkspace.tsx` — delete moved code, import new modules, restyle palette tiles + quick-insert rows.
- Modify `src/index.css` — three small rules (round caps, symbol drop-shadow, selected brightness).

---

### Task 1: Extract block dimensions into `blockDimensions.ts`

**Files:**
- Create: `src/components/vlab/blockDimensions.ts`
- Create: `src/components/vlab/blockDimensions.test.ts`

**Interfaces:**
- Produces: `export interface BlockDimensions { width: number; height: number }`, `export const BLOCK_DIMENSIONS: Record<string, BlockDimensions>`, `export function getBlockDimensions(type: string | undefined): BlockDimensions`. Later tasks (VLabSymbols size-fitting, VLabNode port anchoring) import `getBlockDimensions`.

- [ ] **Step 1: Write the failing test**

Create `src/components/vlab/blockDimensions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getBlockDimensions, BLOCK_DIMENSIONS } from './blockDimensions';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('blockDimensions', () => {
  it('returns known overrides', () => {
    expect(getBlockDimensions('resistor')).toEqual({ width: 60, height: 30 });
    expect(getBlockDimensions('ground')).toEqual({ width: 40, height: 30 });
    expect(getBlockDimensions('im_foc_ctrl')).toEqual({ width: 80, height: 80 });
  });

  it('falls back to the default box for unknown types', () => {
    expect(getBlockDimensions('definitely_not_a_type')).toEqual({ width: 60, height: 60 });
    expect(getBlockDimensions(undefined)).toEqual({ width: 60, height: 60 });
  });

  it('resolves every library icon id to positive integer dimensions', () => {
    const ids = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => b.id));
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) {
      const d = getBlockDimensions(id);
      expect(Number.isInteger(d.width)).toBe(true);
      expect(Number.isInteger(d.height)).toBe(true);
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
    }
    for (const [id, d] of Object.entries(BLOCK_DIMENSIONS)) {
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/vlab/blockDimensions.test.ts`
Expected: FAIL — cannot resolve module `./blockDimensions`.

- [ ] **Step 3: Write the implementation**

Create `src/components/vlab/blockDimensions.ts`. Copy the mapping verbatim from the `useMemo` switch inside `VLabNode` (VLabWorkspace.tsx lines 1600–1683):

```ts
export interface BlockDimensions { width: number; height: number }

export const BLOCK_DIMENSIONS: Record<string, BlockDimensions> = {
  ground: { width: 40, height: 30 },
  ma_selector: { width: 40, height: 60 },
  resistor: { width: 60, height: 30 },
  capacitor: { width: 60, height: 30 },
  inductor: { width: 60, height: 30 },
  diode: { width: 60, height: 30 },
  memristor: { width: 60, height: 30 },
  infinite_resistance: { width: 60, height: 30 },
  ps_to_sim: { width: 60, height: 30 },
  sim_to_ps: { width: 60, height: 30 },
  opamp: { width: 60, height: 40 },
  switch: { width: 60, height: 40 },
  variable_resistor: { width: 60, height: 40 },
  thermal_resistor: { width: 60, height: 40 },
  upper_heater: { width: 60, height: 40 },
  gas_pipe: { width: 60, height: 40 },
  gas_fixed_res: { width: 60, height: 40 },
  lever: { width: 60, height: 40 },
  rot_ref: { width: 60, height: 40 },
  rot_spring: { width: 60, height: 40 },
  rot_damper: { width: 60, height: 40 },
  rot_friction: { width: 60, height: 40 },
  rot_hard_stop: { width: 60, height: 40 },
  trans_ref: { width: 60, height: 40 },
  trans_spring: { width: 60, height: 40 },
  trans_damper: { width: 60, height: 40 },
  trans_friction: { width: 60, height: 40 },
  trans_hard_stop: { width: 60, height: 40 },
  ma_properties: { width: 60, height: 40 },
  conductive_heat: { width: 60, height: 40 },
  convective_heat: { width: 60, height: 40 },
  radiative_heat: { width: 60, height: 40 },
  ps_gain: { width: 60, height: 40 },
  ps_integrator: { width: 60, height: 40 },
  ps_transfer_fcn: { width: 60, height: 40 },
  ps_rms: { width: 60, height: 40 },
  ps_pi_ctrl: { width: 60, height: 40 },
  ps_pid_ctrl: { width: 60, height: 40 },
  solver_config: { width: 60, height: 40 },
  scope: { width: 60, height: 40 },
  ps_math: { width: 50, height: 50 },
  ps_lookup_1d: { width: 50, height: 50 },
  ps_lookup_2d: { width: 50, height: 50 },
  ps_add: { width: 40, height: 40 },
  ps_subtract: { width: 40, height: 40 },
  ps_product: { width: 40, height: 40 },
  ps_divide: { width: 40, height: 40 },
  ps_abs: { width: 40, height: 40 },
  ps_deadzone: { width: 40, height: 40 },
  ps_saturation: { width: 40, height: 40 },
  ps_dead_zone: { width: 40, height: 40 },
  ps_constant: { width: 40, height: 40 },
  ps_sine: { width: 40, height: 40 },
  ps_step: { width: 40, height: 40 },
  ps_term: { width: 40, height: 40 },
  conn_label: { width: 40, height: 40 },
  ps_demux: { width: 40, height: 60 },
  ps_demux_3: { width: 40, height: 60 },
  microwave_inverter: { width: 70, height: 50 },
  pwm_3ph_2level: { width: 80, height: 60 },
  pwm_3ph_3level: { width: 80, height: 60 },
  microwave_cavity: { width: 80, height: 60 },
  lms_adaptive_filter: { width: 80, height: 60 },
  im_foc_ctrl: { width: 80, height: 80 },
  im_scalar_ctrl: { width: 80, height: 80 },
  washing_basket: { width: 80, height: 80 },
  neural_neuron_learning: { width: 80, height: 80 },
  rl_q_learning_controller: { width: 80, height: 80 }
};

export const DEFAULT_DIMENSIONS: BlockDimensions = { width: 60, height: 60 };

export function getBlockDimensions(type: string | undefined): BlockDimensions {
  if (!type) return DEFAULT_DIMENSIONS;
  return BLOCK_DIMENSIONS[type] || DEFAULT_DIMENSIONS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/vlab/blockDimensions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task 2: Move `SymbolRenderer` into `VLabSymbols.tsx` (pure move + wrapper)

**Files:**
- Create: `src/components/vlab/VLabSymbols.tsx`
- Modify: `src/components/vlab/VLabWorkspace.tsx` (delete lines 286–1537, add import)
- Create: `src/components/vlab/vlabSymbols.test.tsx`

**Interfaces:**
- Produces: `export const SymbolRenderer: (props: { type: string; color?: string; size?: number }) => JSX.Element` — same call signature as today plus optional `size`; `export const RawSymbolRenderer: (props: { type: string; color?: string }) => JSX.Element`; `export const UnknownSymbolGlyph` (React component, used by Task 3's test). Task 5 imports `SymbolRenderer`; Task 6 uses the `size` prop.

- [ ] **Step 1: Write the failing test**

Create `src/components/vlab/vlabSymbols.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { SymbolRenderer, RawSymbolRenderer } from './VLabSymbols';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

const ALL_IDS = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => b.id));

describe('VLabSymbols', () => {
  it('renders a wrapper element for every library icon without throwing', () => {
    for (const id of ALL_IDS) {
      const el = SymbolRenderer({ type: id, color: '#3b82f6' });
      expect(el).toBeDefined();
      expect((el as any).type).toBe('div');
    }
  });

  it('renders raw symbols with an svg root or the designed fallback', () => {
    const resistor = RawSymbolRenderer({ type: 'resistor', color: '#fff' });
    expect((resistor as any).type).toBe('svg');
    const unknown = RawSymbolRenderer({ type: 'no_such_symbol', color: '#fff' });
    expect(unknown).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx`
Expected: FAIL — cannot resolve module `./VLabSymbols`.

- [ ] **Step 3: Implement**

Create `src/components/vlab/VLabSymbols.tsx`:

```tsx
import React from 'react';
import { getBlockDimensions } from './blockDimensions';

// Verbatim move of the ~1250-line switch from VLabWorkspace.tsx (was lines 286-1537).
export const RawSymbolRenderer = ({ type, color }: { type: string, color?: string }) => {
  // ... entire existing switch statement pasted unchanged here ...
};

export const UnknownSymbolGlyph = ({ type, color }: { type: string; color?: string }) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
    <rect x="8" y="8" width="44" height="44" rx="10" stroke={color || '#94a3b8'} strokeWidth="2.4" strokeDasharray="5 4" opacity="0.7" />
    <text x="30" y="35" textAnchor="middle" fill={color || '#94a3b8'} fontSize="11" fontWeight="700" fontFamily="system-ui" stroke="none">
      {(type || '?').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || '?'}
    </text>
  </svg>
);

export const SymbolRenderer = ({ type, color, size }: { type: string; color?: string; size?: number }) => {
  const inner = RawSymbolRenderer({ type, color });
  if (!size) return <div className="vlab-symbol">{inner}</div>;
  const d = getBlockDimensions(type);
  const k = Math.min(size / Math.max(d.width, d.height), 1);
  return (
    <div className="vlab-symbol" style={{ width: d.width * k, height: d.height * k, overflow: 'visible' }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: 'center' }}>{inner}</div>
    </div>
  );
};
```

In `RawSymbolRenderer`, replace ONLY the existing `default:` fallback body (the `<div className="text-xl ...">UNK</div>` at old lines 1522–1535) so unknown types render the designed glyph while keeping the DOE special case:

```tsx
    default:
      if (type && type.toLowerCase().includes('doe')) {
        return (
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color || '#c9a86c'} strokeWidth="2.4">
            <rect x="10" y="10" width="40" height="40" rx="8" fill={color || '#c9a86c'} fillOpacity="0.1" />
            <text x="30" y="34" textAnchor="middle" fill={color || '#c9a86c'} fontSize="10" fontWeight="700" stroke="none">DOE</text>
          </svg>
        );
      }
      return <UnknownSymbolGlyph type={type} color={color} />;
```

In `src/components/vlab/VLabWorkspace.tsx`: delete old lines 286–1537 (`const SymbolRenderer = ... };`) and add to the import section:

```tsx
import { SymbolRenderer } from './VLabSymbols';
```

All existing `<SymbolRenderer ... />` usages keep working (props are compatible).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit && npx vitest run src/components/vlab/blockDimensions.test.ts`
Expected: no errors; prior task still green.

### Task 3: Cover the 36 uncovered library icons (aliases + new glyphs)

**Files:**
- Modify: `src/components/vlab/VLabSymbols.tsx` (add cases to `RawSymbolRenderer`, add `SymGlyph` helper)
- Modify: `src/components/vlab/blockDimensions.ts` (alias entries)
- Modify: `src/components/vlab/vlabSymbols.test.tsx` (strengthen guard)

**Interfaces:**
- Consumes: `RawSymbolRenderer` from Task 2, `BLOCK_DIMENSIONS` from Task 1.
- Produces: every `VLAB_LIBRARY` id renders a real symbol; `SymGlyph` internal helper for text-style glyphs.

The 36 ids with no `case` today: accumulator, cavity, check_valve, database, eye, fluid_res, gas_res, heater, igbt, inport, inverter, ma_props, ma_rot_conv, ma_trans_conv, minus, nmos, nozzle, orifice, outport, pid_ctrl, ps_const, ps_dead, ps_ramp, ps_sat, ps_tf, relief_valve, rot_motion, rot_multibody, steam_gen, subsystem, trans_motion, trans_multibody, vel_source, wheel_axle, wind, zap.

- [ ] **Step 1: Strengthen the failing test**

Append to the describe block in `src/components/vlab/vlabSymbols.test.tsx`:

```tsx
import { UnknownSymbolGlyph } from './VLabSymbols';

it('never falls back for any library icon', () => {
  for (const id of ALL_IDS) {
    const el = RawSymbolRenderer({ type: id, color: '#fff' }) as any;
    const isFallback = el.type === UnknownSymbolGlyph;
    expect(isFallback).toBe(false);
  }
});
```

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx`
Expected: FAIL — 36 ids hit `UnknownSymbolGlyph`.

- [ ] **Step 2: Add alias + new cases**

In `VLabSymbols.tsx`, add this helper above `RawSymbolRenderer`:

```tsx
const SymGlyph = ({ w, h, color, text, sub }: { w: number; h: number; color?: string; text: string; sub?: string }) => (
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={color || '#94a3b8'} strokeWidth="2.4">
    <rect x="4" y="4" width={w - 8} height={h - 8} rx="8" strokeOpacity="0.7" />
    <text x={w / 2} y={h / 2 + (sub ? -1 : 5)} textAnchor="middle" fill={color || '#94a3b8'} fontSize="13" fontWeight="700" fontFamily="system-ui" stroke="none">{text}</text>
    {sub && <text x={w / 2} y={h / 2 + 12} textAnchor="middle" fill={color || '#94a3b8'} fontSize="6.5" fontWeight="600" letterSpacing="1" fontFamily="system-ui" stroke="none">{sub}</text>}
  </svg>
);
```

Add these **alias fall-through cases** directly above the existing case that draws the same shape (exact JSX of the target case is reused by falling through):

```tsx
    // aliases -> reuse existing artwork
    case 'cavity':            // same art as microwave_cavity
    case 'ps_const':          // same art as ps_constant
    case 'ps_dead':           // same art as ps_dead_zone
    case 'ps_sat':            // same art as ps_saturation
    case 'ps_tf':             // same art as ps_transfer_fcn
    case 'pid_ctrl':          // same art as ps_pid_ctrl
    case 'ma_props':          // same art as ma_properties
```

Placement rule: `case 'cavity':` merges into the existing `case 'pwm_3ph_2level': case 'pwm_3ph_3level': case 'microwave_cavity': case 'lms_adaptive_filter':` group only if dimensions match — they do NOT (cavity is 80×60, same as microwave_cavity, so it DOES merge there). Merge each alias into its target's existing `case` line; e.g. change

```tsx
    case 'microwave_cavity':
```
to
```tsx
    case 'microwave_cavity':
    case 'cavity':
```

Apply the same merge for: `ps_const`→`case 'ps_constant':`, `ps_dead`→`case 'ps_dead_zone':`, `ps_sat`→`case 'ps_saturation':`, `ps_tf`→`case 'ps_transfer_fcn':`, `pid_ctrl`→`case 'ps_pid_ctrl':`, `ma_props`→`case 'ma_properties':`.

Add these **new glyph cases** before `default:`:

```tsx
    case 'inport':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="20" r="14" /><path d="M0 20H16M44 20H60M38 20L32 14M38 20L32 26" strokeLinecap="round" />
        </svg>
      );
    case 'outport':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="20" r="14" /><path d="M0 20H16M22 20H38M52 20L44 14M52 20L44 26" strokeLinecap="round" />
        </svg>
      );
    case 'subsystem':
      return (
        <svg width="70" height="60" viewBox="0 0 70 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="10" width="50" height="40" rx="6" /><path d="M4 18V42M16 24H30M16 36H30M40 30H56M56 30L50 25M56 30L50 35" strokeLinecap="round" />
          <circle cx="34" cy="24" r="2" fill={color} /><circle cx="34" cy="36" r="2" fill={color} />
        </svg>
      );
    case 'nmos':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="24" /><path d="M12 30H26M26 22V38M32 20V40M38 24V36" strokeLinecap="round" />
          <path d="M38 30H48M48 30V46" strokeLinecap="round" /><text x="43" y="18" fontSize="9" fontWeight="700" fill={color} stroke="none">N</text>
        </svg>
      );
    case 'igbt':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="24" /><path d="M22 18V42M22 30H34M28 22V38M40 24V36M40 30H52" strokeLinecap="round" />
          <path d="M34 30L28 27V33Z" fill={color} stroke="none" />
        </svg>
      );
    case 'inverter':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M18 6V34L46 20L18 6Z" /><circle cx="49" cy="20" r="3" /><path d="M0 20H18M52 20H60" strokeLinecap="round" />
        </svg>
      );
    case 'minus':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="20" r="14" /><path d="M12 20H28" strokeLinecap="round" />
        </svg>
      );
    case 'zap':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M22 4L10 22H19L17 36L30 17H21L22 4Z" strokeLinejoin="round" />
        </svg>
      );
    case 'wind':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 14H38C44 14 44 6 38 6M4 22H48C54 22 54 30 48 30M4 30H30" strokeLinecap="round" />
        </svg>
      );
    case 'heater':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H12M48 20H60M12 20C12 12 24 12 24 20C24 28 36 28 36 20C36 12 48 12 48 20" strokeLinecap="round" />
          <path d="M30 4V9M25 6L27 10M35 6L33 10" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      );
    case 'check_valve':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H18M42 20H60M18 20L42 10V30L18 20Z" strokeLinejoin="round" />
        </svg>
      );
    case 'relief_valve':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 28H18M42 28H60M18 28V14H42V28M30 14V6M26 8L30 4L34 8" strokeLinecap="round" />
        </svg>
      );
    case 'orifice':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M0 20H22M38 20H60M22 6V34M38 6V34" strokeLinecap="round" />
        </svg>
      );
    case 'nozzle':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 8V32L34 26V14L4 8ZM34 20H50L56 23V17L50 20" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case 'fluid_res':
    case 'gas_res':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="20" y="10" width="20" height="10" rx="2" /><path d="M0 15H20M40 15H60" />
          <text x="30" y="18" textAnchor="middle" fill={color} fontSize="8" fontWeight="700" stroke="none">{type === 'gas_res' ? 'G' : 'F'}</text>
        </svg>
      );
    case 'accumulator':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M20 10H40V44C40 50 20 50 20 44V10Z" /><path d="M20 22H40M30 0V10M24 54H36" strokeLinecap="round" />
        </svg>
      );
    case 'steam_gen':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="14" y="14" width="32" height="38" rx="5" /><path d="M20 40C24 34 26 46 30 40C34 34 36 46 40 40" strokeLinecap="round" />
          <path d="M22 8C22 5 26 5 26 8M34 8C34 5 38 5 38 8" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      );
    case 'rot_motion':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="18" cy="20" r="10" /><path d="M14 20A4 4 0 0 1 22 20" strokeDasharray="2 2" /><path d="M28 20H52M52 20L46 15M52 20L46 25" strokeLinecap="round" />
        </svg>
      );
    case 'trans_motion':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="8" y="12" width="20" height="16" rx="2" /><path d="M28 20H52M52 20L46 15M52 20L46 25" strokeLinecap="round" /><path d="M12 20H24" strokeDasharray="2 2" />
        </svg>
      );
    case 'rot_multibody':
      return <SymGlyph w={60} h={60} color={color} text="R-MB" sub="ROTATIONAL" />;
    case 'trans_multibody':
      return <SymGlyph w={60} h={60} color={color} text="T-MB" sub="TRANSLATIONAL" />;
    case 'ma_rot_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="20" cy="30" r="11" /><rect x="34" y="20" width="16" height="20" rx="2" /><path d="M31 30H34" strokeDasharray="2 2" /><text x="20" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">ω</text>
        </svg>
      );
    case 'ma_trans_conv':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <rect x="10" y="20" width="16" height="20" rx="2" /><rect x="34" y="20" width="16" height="20" rx="2" /><path d="M26 30H34" strokeDasharray="2 2" /><text x="18" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">v</text><text x="42" y="34" fontSize="10" fontWeight="700" fill={color} stroke="none" textAnchor="middle">F</text>
        </svg>
      );
    case 'vel_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="30" r="22" /><path d="M16 30H38M38 30L31 24M38 30L31 36" strokeLinecap="round" /><text x="30" y="16" fontSize="9" fontWeight="700" fill={color} stroke="none" textAnchor="middle">v</text>
        </svg>
      );
    case 'wheel_axle':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="30" cy="34" r="16" /><circle cx="30" cy="34" r="4" /><path d="M30 4V18M26 8L30 4L34 8" strokeLinecap="round" />
        </svg>
      );
    case 'database':
      return <SymGlyph w={60} h={60} color={color} text="DB" sub="DATA" />;
    case 'eye':
      return (
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke={color} strokeWidth="2.4">
          <path d="M4 20C14 8 46 8 56 20C46 32 14 32 4 20Z" strokeLinejoin="round" /><circle cx="30" cy="20" r="6" />
        </svg>
      );
    default:
```

- [ ] **Step 3: Add dimension aliases**

In `src/components/vlab/blockDimensions.ts`, add inside `BLOCK_DIMENSIONS`:

```ts
  cavity: { width: 80, height: 60 },
  ps_const: { width: 40, height: 40 },
  ps_dead: { width: 40, height: 40 },
  ps_sat: { width: 40, height: 40 },
  ps_tf: { width: 60, height: 40 },
  pid_ctrl: { width: 60, height: 40 },
  ma_props: { width: 60, height: 40 },
  subsystem: { width: 70, height: 60 },
  inport: { width: 60, height: 40 },
  outport: { width: 60, height: 40 },
  eye: { width: 60, height: 40 },
  wind: { width: 60, height: 40 },
  heater: { width: 60, height: 40 },
  check_valve: { width: 60, height: 40 },
  relief_valve: { width: 60, height: 40 },
  orifice: { width: 60, height: 40 },
  nozzle: { width: 60, height: 40 },
  fluid_res: { width: 60, height: 30 },
  gas_res: { width: 60, height: 30 },
  inverter: { width: 60, height: 40 },
  minus: { width: 40, height: 40 },
  zap: { width: 40, height: 40 },
  rot_motion: { width: 60, height: 40 },
  trans_motion: { width: 60, height: 40 },
```

(All remaining new ids use the 60×60 default.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx src/components/vlab/blockDimensions.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task 4: Apply the style guide at the single wrapper point

**Files:**
- Modify: `src/components/vlab/VLabSymbols.tsx` (strokeWidth promotion)
- Modify: `src/index.css` (append 4 rules)

**Interfaces:**
- Consumes: the `.vlab-symbol` wrapper class introduced in Task 2.
- Produces: CSS classes `.vlab-symbol` (shadow + round caps) and `.symbol-bright` (selected-state brightening used by Task 5).

- [ ] **Step 1: Promote primary stroke widths mechanically**

In `VLabSymbols.tsx` only, run this PowerShell from the repo root:

```powershell
$p = "src\components\vlab\VLabSymbols.tsx"
(Get-Content $p -Raw) -replace 'strokeWidth="2"', 'strokeWidth="2.4"' -replace 'strokeWidth=\{2\}', 'strokeWidth={2.4}' | Set-Content $p -NoNewline
```

This promotes every primary outline to the 2.4px standard while intentionally leaving auxiliary thin strokes (`strokeWidth="1"`, `"1.5"`) untouched. Verify no stragglers:

Run: `rg -n 'strokeWidth="?2"?[ >]' src/components/vlab/VLabSymbols.tsx`
Expected: only matches for `2.4` (no bare `2`).

- [ ] **Step 2: Add the shared CSS**

Append to `src/index.css` (same file that already defines `.custom-scrollbar`; locate it with `rg -l custom-scrollbar src`):

```css
/* VLab Refined Schematic symbols */
.vlab-symbol svg, .vlab-symbol svg * { stroke-linecap: round; stroke-linejoin: round; }
.vlab-symbol { filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.55)); }
.vlab-node .symbol-bright { filter: brightness(1.3) drop-shadow(0 0 10px rgba(168, 85, 247, 0.35)); }
```

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx`
Expected: PASS.

- [ ] **Step 4: Checkpoint**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task 5: Extract and restyle `VLabNode` — boundary rings, labels, states

**Files:**
- Create: `src/components/vlab/VLabNode.tsx`
- Modify: `src/components/vlab/VLabWorkspace.tsx` (delete old lines ~1539–1763: `NodeErrorBoundary`, `getRotatedPosition`, `VLabNode`; import from new file)

**Interfaces:**
- Consumes: `getBlockDimensions`, `SymbolRenderer`, `VLAB_LIBRARY`.
- Produces: `export const VLabNode`, `export const NodeErrorBoundary`, `export const getRotatedPosition`. `VLabWorkspace`'s existing `nodeTypes` map keeps referencing `VLabNode` unchanged.

- [ ] **Step 1: Create the new component file**

Create `src/components/vlab/VLabNode.tsx` with the complete implementation:

```tsx
import React, { useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useUpdateNodeInternals, useStore } from 'reactflow';
import { Activity } from 'lucide-react';
import { SymbolRenderer } from './VLabSymbols';
import { getBlockDimensions } from './blockDimensions';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

const TYPE_NAMES = new Map<string, string>(
  VLAB_LIBRARY.flatMap(d => d.blocks.map(b => [b.id, b.name]))
);

const getRotatedPosition = (originalPos: Position, rotation: number): Position => {
  const normRot = ((rotation % 360) + 360) % 360;
  if (normRot === 0) return originalPos;
  const posOrder = [Position.Top, Position.Right, Position.Bottom, Position.Left];
  const origIdx = posOrder.indexOf(originalPos);
  if (origIdx === -1) return originalPos;
  const shift = Math.round(normRot / 90);
  return posOrder[(origIdx + shift) % 4];
};

export const NodeErrorBoundary = class extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('VLab Node Error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border-2 border-red-500 bg-red-900/20 text-red-400 rounded-xl flex flex-col items-center justify-center text-center">
          <Activity size={24} className="mb-2 opacity-50" />
          <span className="text-[10px] font-black uppercase tracking-tighter">Rendering Failure</span>
          <span className="text-[8px] opacity-70">Check console for details</span>
        </div>
      );
    }
    return this.props.children;
  }
};

export const VLabNode = ({ id, data, selected }: { id: string; data: any; selected: boolean }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;

  useEffect(() => { updateNodeInternals(id); }, [id, rotation, updateNodeInternals]);

  const rawPorts = data.ports || [
    ...(data.inputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'left' })),
    ...(data.outputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'right' }))
  ];

  const portsBySide = rawPorts.reduce((acc: any, port: any) => {
    if (!port) return acc;
    const side = port.pos || port.position || 'left';
    if (!acc[side]) acc[side] = [];
    acc[side].push(port);
    return acc;
  }, {});

  const { width, height } = getBlockDimensions(data.type);

  // Handles referenced by an edge -> solid fill feedback ("connected dot")
  const connectedHandles = useStore(useCallback((s: any) => {
    const set = new Set<string>();
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [id]));

  const typeLabel = TYPE_NAMES.get(data.type) || String(data.type ?? '').replace(/[_]+/g, ' ').toUpperCase();

  return (
    <div
      data-selected={selected ? 'true' : 'false'}
      className={`vlab-node relative group flex flex-col items-center transition-all ${selected ? 'z-50' : 'z-10'} h-full w-full`}
      onMouseDown={(e) => data.onNodeMouseDown && data.onNodeMouseDown(e)}
    >
      {/* Type caption above symbol */}
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1 pointer-events-none select-none text-center max-w-[110px] truncate"
        style={{ color: selected ? '#c4b5fd' : '#77778a' }}>
        {typeLabel}
      </span>

      {/* Symbol container */}
      <div className={`relative flex-1 flex w-full items-center justify-center transition-all duration-300 ${selected ? 'bg-purple-500/5 shadow-[0_0_30px_rgba(168,85,247,0.12)] scale-105' : 'bg-transparent'}`}
        style={{ minWidth: 80, minHeight: 60 }}>
        <div className="relative flex items-center justify-center" style={{ width, height, transform: `rotate(${rotation}deg)` }}>
          {Object.entries(portsBySide).map(([side, sidePorts]: [any, any]) =>
            sidePorts.map((port: any, index: number) => {
              const totalOnSide = sidePorts.length;
              const offset = totalOnSide > 1 ? (index - (totalOnSide - 1) / 2) * 20 : 0;
              const position = side === 'left' ? Position.Left :
                side === 'right' ? Position.Right :
                  side === 'top' ? Position.Top : Position.Bottom;
              const rotatedPos = getRotatedPosition(position, rotation);
              const handleId = `${id}-${port.id}`;
              const isConnected = connectedHandles.has(handleId);
              const pc = data.color || '#3b82f6';

              return (
                <div key={port.id} className="absolute"
                  style={{
                    width: 12, height: 12,
                    top: (side === 'left' || side === 'right') ? `calc(50% + ${offset}px - 6px)` : (side === 'top' ? '-6px' : 'calc(100% - 6px)'),
                    left: (side === 'top' || side === 'bottom') ? `calc(50% + ${offset}px - 6px)` : (side === 'left' ? '-6px' : 'calc(100% - 6px)')
                  }}>
                  <Handle
                    type="source"
                    position={rotatedPos}
                    id={handleId}
                    className="!w-full !h-full !rounded-full !border-2 transition-all duration-150 hover:!scale-125 hover:!shadow-[0_0_10px_var(--pc)]"
                    style={{
                      ['--pc' as any]: pc,
                      transform: 'none',
                      background: isConnected ? pc : '#0f0f13',
                      borderColor: pc,
                      boxShadow: selected ? `0 0 0 4px ${pc}33` : undefined
                    }}
                  />
                  {/* Port label */}
                  <div className="absolute text-[8px] font-bold select-none pointer-events-none uppercase whitespace-nowrap"
                    style={{
                      color: isConnected ? pc : '#9a9aac',
                      top: side === 'top' ? -16 : side === 'bottom' ? 16 : 0,
                      left: side === 'left' ? -14 : side === 'right' ? 14 : 0,
                      transform: (side === 'left' || side === 'right') ? `translateY(-50%) rotate(${-rotation}deg)` : `translateX(-50%) rotate(${-rotation}deg)`
                    }}>
                    {port.label}
                  </div>
                </div>
              );
            })
          )}

          {/* The SVG Symbol */}
          <div className={selected ? 'symbol-bright' : ''}>
            <SymbolRenderer type={data.type} color={data.color} />
          </div>
        </div>
      </div>

      {/* Instance-name pill below */}
      <div className={`mt-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all max-w-[140px] truncate ${
        selected
          ? 'text-purple-300 bg-purple-500/15 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
          : 'text-gray-400 bg-white/[0.04] border border-white/10'
      }`}>
        {data.label}
      </div>
    </div>
  );
};
```

Note: `useMemo` import may be unused after extraction — remove it if `tsc` flags it (project uses `noUnusedLocals` behavior via build; keep imports exact).

- [ ] **Step 2: Rewire `VLabWorkspace.tsx`**

Delete old definitions of `NodeErrorBoundary` (~lines 1539–1560), `getRotatedPosition` (~lines 1562–1573), and `VLabNode` (~lines 1575–1763). Add:

```tsx
import { VLabNode, NodeErrorBoundary } from './VLabNode';
```

The `nodeTypes` map (line ~1867) stays exactly as-is.

- [ ] **Step 3: Checkpoint**

Run: `npx tsc --noEmit && npx vitest run src/components/vlab/vlabScopeDynamicPorts.test.ts`
Expected: clean; scope ports test green.

- [ ] **Step 4: Manual render check**

Dev server is already running on http://localhost:3001/. Open the VLab workspace and verify: blocks show type caption above + name pill below; ports are hollow rings sitting ON the symbol bounding-box edge; hovering a ring scales it with a glow in the block color; drawing a wire fills the ring; selecting a node brightens strokes and adds halo rings around its ports; rotating a block keeps ports on correct sides.

### Task 6: Palette tiles + quick-insert consistency

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx` (two small JSX swaps)

**Interfaces:**
- Consumes: `SymbolRenderer` with `size` prop (Task 2), `BLOCK_DIMENSIONS` (Task 1).

- [ ] **Step 1: Library palette tile**

Replace the palette thumbnail (old lines ~4063–4065):

```tsx
<div className="w-12 h-12 flex items-center justify-center transform scale-[0.6] group-hover:scale-[0.7] transition-transform origin-center">
  <SymbolRenderer type={block.icon} color={block.color} />
</div>
```

with:

```tsx
<div className="w-14 h-12 flex items-center justify-center group-hover:scale-110 transition-transform origin-center">
  <SymbolRenderer type={block.icon} color={block.color} size={46} />
</div>
```

Each symbol now fits its tile proportionally from its real bounding box — no blanket 0.6 scale.

- [ ] **Step 2: Quick-insert row icon**

Replace the raw-text icon (old line ~4242–4244):

```tsx
<div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-lg border border-white/5 group-hover:border-purple-500/30" style={{ color: block.color }}>
  {block.icon}
</div>
```

with:

```tsx
<div className="w-9 h-9 rounded-lg bg-[#141419] flex items-center justify-center border border-white/5 group-hover:border-purple-500/30 overflow-visible">
  <SymbolRenderer type={block.icon} color={block.color} size={26} />
</div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Manual: in the running app, open the block library sidebar and the quick-insert popup (Ctrl+K / search field) — every tile shows a rendered schematic symbol, including previously text-only ones (nmos, subsystem, steam_gen, ...).

### Task 7: Full verification sweep

**Files:** none modified.

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Component + library tests**

Run: `npx vitest run src/components/vlab/vlabSymbols.test.tsx src/components/vlab/blockDimensions.test.ts src/components/vlab/vlabScopeDynamicPorts.test.ts`
Expected: all PASS.

- [ ] **Step 3: Engine regression suites**

Run: `npm run test:vlab`
Expected: PASS — proves no engine files were touched.

- [ ] **Step 4: Manual QA checklist on http://localhost:3001/**

- Drag resistor, PMSM motor, PID, scope onto canvas; connect them end-to-end (rings align with wire endpoints).
- Multi-port blocks (opamp, gyrator, transformer): ports distribute evenly along their edge.
- Rotate a block via its controls: port sides follow rotation.
- Subsystem block: add Inport/Outport children, confirm outer ports sync (existing effect at VLabWorkspace.tsx ~line 2370 still works because handle ids are unchanged).
- Selected state: brightened strokes, purple pill, port halos.
- Library palette and quick-insert show rendered icons for every entry.
- Open a saved project file to confirm edges still attach (handle id format untouched).

## Self-Review Notes

- Spec coverage: style guide → Tasks 2–4; boundary ports → Task 5; labels/states → Task 5; everywhere-consistency → Tasks 5–6; fallback glyph + coverage audit → Tasks 2–3; testing → Task 7 + per-task tests; refactor extraction → Tasks 1, 2, 5.
- Handle IDs, `nodeTypes` keys, `data.*` shapes unchanged per Global Constraints.
- "Connected ports show a filled center dot" is implemented as solid-fill ring when connected (same visual language, simpler plumbing via `useStore`).
