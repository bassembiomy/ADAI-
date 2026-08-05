# Design Spec: Remove React Flow Attribution Badge from Workspace Canvases

## Overview
This specification details the removal of the bottom-right React Flow attribution watermark badge/button across the XBridges workspace and other workspace canvases in the ADIA Stateflow application.

## User Intent & Requirements
- Completely hide/remove the square badge labeled "React Flow" at the bottom-right corner of the canvas in XBridges (`XbridgesWorkspace`).
- Do not add any new buttons, website links, or external redirections.

## Target Components & Changes

### 1. Component Level (`src/components/xbridges/XbridgesWorkspace.tsx`)
- Add `proOptions={{ hideAttribution: true }}` to the `<ReactFlow>` component props.
- Ensure no lingering attribution elements or anchor tags render in the canvas DOM.

### 2. Supporting Canvases (`src/components/vlab/VLabWorkspace.tsx`, `src/components/entropy/EntropyWorkspace.tsx`)
- Pass `proOptions={{ hideAttribution: true }}` to `<ReactFlow>` in both `VLabWorkspace` and `EntropyWorkspace` to maintain visual consistency across all diagramming canvases.

### 3. Global Styling (`src/index.css`)
- Add global CSS rule to hide the `.react-flow__attribution` class completely:
  ```css
  /* Hide React Flow bottom-right attribution badge */
  .react-flow__attribution {
    display: none !important;
  }
  ```

## Verification Plan
1. Launch or build dev environment (`npm run build` / verify React Flow rendering).
2. Inspect the bottom-right canvas area in `XbridgesWorkspace`, `VLabWorkspace`, and `EntropyWorkspace` to confirm the React Flow attribution badge is removed.
