# VLab Schematic Component Representation Design

## Summary
Transform the visual presentation of VLab components from card/block containers into seamless schematic symbols with pinned terminal ports and clean text labels directly on the workspace canvas.

## Background & Problem
Previously, VLab components were wrapped in a standard ReactFlow node container featuring a solid dark background, 1.5px border, and shadow. Additionally, each node included an upper type caption and a pill-styled container for the instance label, giving them a heavy "block/card" appearance rather than an authentic electronic/schematic CAD appearance.

## Design Specification

### 1. Transparent Node Container
- **ReactFlow Node Chrome Elimination**:
  - Add scoped CSS rules for `.react-flow__node` containing `.vlab-node` (and `.react-flow__node.react-flow__node-vlabNode`):
    - `background: transparent !important`
    - `border: none !important`
    - `box-shadow: none !important`
    - `padding: 0 !important`
- Removes the outer rounded rectangular frame, solid background fill, and border lines around all components.

### 2. Component Layout & Clean Typography
- In `VLabNode.tsx`:
  - **Upper Type Caption**: Removed/omitted to eliminate visual clutter and redundant text.
  - **Schematic SVG Symbol**: Rendered at full visual fidelity at the center of the component footprint.
  - **Port Rings & Handles**:
    - Terminals stay accurately placed at the perimeter coordinates according to port definitions.
    - Connected terminals show active accent fill, while unconnected ports maintain subtle schematic ring markers with hover animations.
  - **Instance Label**:
    - Displayed beneath the symbol as clean, crisp text (sans bulky pill background and heavy border) with high-contrast legible font styling.
    - Slight subtle glow / color highlight when the node is selected.

### 3. Selection & Hover Dynamics
- **Selected State**:
  - Instead of drawing a solid rectangle or block background, selected components highlight with an SVG symbol luminance/drop-shadow boost (`symbol-bright`) and an accent color highlight on the instance label and port rings.
- **Hover State**:
  - Interactive handles scale up smoothly for easy wire dragging without disturbing the schematic layout.

## Testing & Verification
1. **Visual Verification**: Check schematic nodes across all categories (Electrical, Mechanical, Thermal, Fluids, Signal) to confirm borderless rendering, clean labels, and port positioning.
2. **Interaction Verification**: Confirm node dragging, port connection (source/target handles), rotation, and selection work smoothly without hitbox clipping.
3. **Automated Tests**: Run existing VLab workspace and symbols test suites to ensure zero regressions in port mappings or node dimensions.
