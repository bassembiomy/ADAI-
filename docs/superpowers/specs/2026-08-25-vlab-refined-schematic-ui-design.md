# VLab Refined Schematic UI — Design

- **Date:** 2026-08-25
- **Status:** Approved (pending final user review of this document)
- **Scope:** Visual/UI layer of the VLab module only — no engine, solver, or connection-logic changes.

## Context

The VLab workspace (`src/components/vlab/VLabWorkspace.tsx`, ~4700 lines) renders simulation blocks as floating SVG symbols drawn by `SymbolRenderer` (~356 hand-drawn cases). Problems today:

1. Icons are inconsistent (stroke widths, sizing, missing glyphs; unknown types fall through to a plain text box).
2. Connection ports float near symbols instead of sitting on a well-defined block boundary.
3. The quick-insert popup shows raw icon-name strings as text instead of rendered icons.
4. Node rendering lives inline in an oversized component file.

## Goals

- Professional, consistent icon set following one style guide.
- Ports visually pinned to the outer boundary (bounding-box edge) of each block.
- Consistent look across canvas nodes, library palette, and quick-insert popup.
- Slimmer, more maintainable rendering code.

## Non-goals

- No changes to wiring/connection rules, domain validation, simulation engine, or port IDs/handle ID format (`${id}-${port.id}` must stay stable).
- No new block types or palette reorganization.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Visual direction | **B — Refined Schematic** (floating symbols, professionally redrawn) |
| Apply where | Everywhere: canvas + library palette + quick-insert popup |
| Labels & states | Type caption above symbol + instance-name pill below; purple when selected |

## Design

### 1. Symbol style guide

All symbols in `SymbolRenderer` conform to:

- Stroke width **2.4px** on a shared base grid, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Standard viewBox sizes per category: 60×30 (in-line passives), 60×40 (2-port+control), 50×50 / 40×40 (math ops), 60×60 (machines, sources, sensors), 80×60 (converters/inverters), 80×80 (controllers).
- Drop shadow: one shared `<filter>` definition (dy=3, stdDeviation=4, ~60% black).
- Letter glyphs (M, V, A...) in bold system-ui, sized relative to their shape.
- Strokes use the block's domain color; highlights use a lighter tint of it.
- Every type in `VLAB_LIBRARY` gets a real symbol. Types with no specific drawing get a designed generic glyph (rounded outline + abbreviated text), never raw text in a box.

### 2. Ports on the outer boundary

- Each port renders as a hollow ring: 10px diameter, 2px border in the port/domain color, dark fill matching canvas background.
- Rings are positioned exactly on the bounding-box edge of the symbol container: left ports at x=0, right at x=width, top/bottom analogous — replacing today's `-5px` offsets that left ports floating off-symbol.
- Multiple ports on one side distribute evenly along that edge (existing offset math retained, re-anchored to the edge).
- Rotation behavior preserved via existing `getRotatedPosition`.
- Hover: ring scales ~125% with a colored glow. Connected ports show a small filled center dot in the port color for visual feedback.

### 3. Labels & selection state

- Above symbol: block-type caption — uppercase, letter-spaced, muted gray.
- Below symbol: instance-name pill; selected state = purple border/background/text (polished version of current layout).
- Selected node: brighter symbol strokes plus soft halo rings around each port.

### 4. Consistency across surfaces

- Library palette tiles render the same symbols at proper scale (removes the 0.6 CSS scale hack).
- Quick-insert popup renders `<SymbolRenderer>` thumbnails instead of `{block.icon}` text.
- Refactor: extract `SymbolRenderer` into `src/components/vlab/VLabSymbols.tsx` and `VLabNode` into `src/components/vlab/VLabNode.tsx`; `VLabWorkspace.tsx` imports them. Pure move + restyle; no behavioral coupling changes.

### 5. Data flow / compatibility

- Block data shape (`data.ports`, `data.color`, `data.rotation`, params) unchanged.
- Handle IDs unchanged → saved projects and subsystem port synchronization keep working.
- Per-type size map currently inlined in `VLabNode` becomes a single exported `BLOCK_DIMENSIONS` lookup co-located with the node component so symbol sizes and port anchoring share one source of truth.

### 6. Error handling

- `NodeErrorBoundary` stays wrapped around nodes.
- Unknown/legacy types render the designed generic glyph rather than crashing or showing raw text.

## Testing

- Existing suites stay green: `npm run test:vlab`, `src/components/vlab/vlabScopeDynamicPorts.test.ts`, security/project-file suites untouched.
- Manual verification on `npm run dev`: canvas nodes (incl. rotated blocks and multi-port sides), library palette tiles, quick-insert popup, selected/hover states, scope overlay unaffected, subsystem in/outport blocks.
- If `BLOCK_DIMENSIONS` is extracted as a pure helper, add a small unit test asserting every `VLAB_LIBRARY` icon id resolves to dimensions.

## Risks

- Handle geometry regressions (edges no longer meeting ports) — mitigated by keeping handle ID format and ReactFlow `Position` mapping unchanged; verify with connected demo models.
- Volume of symbol redraws (~356 cases) — style guide + shared primitives keep individual edits mechanical; fallback glyph guarantees no visual dead ends.
