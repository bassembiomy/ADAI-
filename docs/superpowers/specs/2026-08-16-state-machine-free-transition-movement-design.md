# Free and Smooth State Machine Transition Link Movement Design

**Date**: 2026-08-16  
**Status**: Approved  
**Topic**: State Machine Canvas Transition Link Free Movement & Smooth Bending

---

## 1. Overview & Objectives

In the ADIA State Machine graphical canvas, users require intuitive, fluid, and free-form manipulation of transition links connecting states and junctions. Currently, adjusting transition curvature requires finding and dragging a small control point circle that only appears after selecting the transition, which is easily obscured by label overlays and does not allow dragging directly on the transition wire.

This design enables:
1. **Direct Curve Manipulation**: Users can click and drag anywhere along the transition path to bend the curve in real time with immediate visual feedback.
2. **Accurate Quadratic Bezier Solver**: Smooth cursor-to-curve projection ensures the curve passes directly through the cursor during drag without jumpiness or coordinate drift across all zoom levels.
3. **Ergonomic Control Handle & Clean Labeling**: High-visibility interactive handle shown on hover/selection with non-blocking labels.
4. **Double-Click Reset**: Instant reset of curvature back to the clean default arc.
5. **Undo/Redo Integration**: Proper history tracking committing curve modifications on release.

---

## 2. Interaction & Architecture Design

### 2.1 Drag Initiation & Distinguishing Clicks vs Drags
- An invisible, enlarged hit-area `<path>` overlay sits on top of each transition curve with `cursor: grab` (or `cursor: grabbing` while dragging).
- On `onMouseDown`, we track the initial mouse coordinates `(startScreenX, startScreenY)`.
- If the cursor moves beyond a threshold ($>3\text{px}$ in screen space), dragging is initiated.
- If mouse is released without exceeding threshold, it is treated as a standard click / selection toggle (`Ctrl+Click` supported).

### 2.2 Quadratic Bezier Inversion Formula
The transition curve is defined as a quadratic Bezier curve from source point $P_0(x_0, y_0)$ to target point $P_2(x_2, y_2)$ with control point $P_1(x_1, y_1)$:
$$B(t) = (1-t)^2 P_0 + 2(1-t)t P_1 + t^2 P_2$$

When dragging anywhere along the curve, we project the world mouse coordinate $M(x, y)$ to the curve midpoint ($t = 0.5$):
$$M = \frac{1}{4} P_0 + \frac{1}{2} P_1 + \frac{1}{4} P_2$$
Solving for control point $P_1$:
$$P_1 = 2M - \frac{1}{2}(P_0 + P_2)$$

When dragging the dedicated control point handle directly:
$$P_1 = M$$

### 2.3 Coordinate System & Scaling
World coordinate transformation accounts for canvas position, UI zoom, and pan/zoom offsets:
$$\text{worldX} = \frac{\frac{\text{clientX} - \text{rect.left}}{\text{uiZoom}} - \text{view.offsetX}}{\text{view.scale}}$$
$$\text{worldY} = \frac{\frac{\text{clientY} - \text{rect.top}}{\text{uiZoom}} - \text{view.offsetY}}{\text{view.scale}}$$

### 2.4 Control Handle & Label Rendering Hierarchy
- The control handle circle is rendered with an outer glow on hover or selection.
- The transition label container `foreignObject` is styled with `pointer-events: none` on the container so mouse events pass directly to the underlying path and handle.
- Double-clicking the transition curve or handle triggers `resetTransitionCurve(transitionId)`, setting `hasControlPoint: false` and removing `controlPoint`.

### 2.5 History & State Synchronization
- While dragging is in progress, the transition state is updated live in component state for $60\text{ fps}$ smooth visual feedback.
- On `onMouseUp` (drag completion), `addToHistory()` is invoked to register the new layout state in the undo/redo stack.

---

## 3. Verification & Testing

### 3.1 Automated Tests
- Helper unit tests for:
  - Quadratic Bezier inversion ($P_1 = 2M - 0.5(P_0 + P_2)$).
  - Curve reset logic.
  - Coordinate transformations under various zoom scales.

### 3.2 Manual Verification
- Verify clicking and dragging anywhere on a transition curve smoothly bends it in real time.
- Verify dragging the control point handle works smoothly.
- Verify double-clicking on a bent transition resets it to the default arc.
- Verify panning, zooming in, and zooming out do not desynchronize cursor tracking.
- Verify `Ctrl+Z` / `Ctrl+Y` undoes and redoes curve bending.
