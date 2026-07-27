# Design Document: State Machine `Shift + X` Add X-Bridges Block Shortcut

**Date**: 2026-07-27  
**Status**: Approved  

---

## 1. Overview
Add a keyboard shortcut (`Shift + X`) in the ADIA State Machine Editor that creates a new X-Bridges block at the center of the current canvas viewport.

---

## 2. Requirements & Goals

### Functional Requirements
1. **Shortcut Key**: `Shift + X` (case-insensitive for `X` or `x`).
2. **Context Guard**: Must not trigger while typing inside `<input>`, `<textarea>`, or content-editable elements.
3. **Action Execution**:
   - Calculate viewport center coordinates using canvas dimensions and current `view` transform (`scale`, `offsetX`, `offsetY`).
   - Invoke `createXBridgesState(centerX, centerY)`.
4. **User Feedback**: Select new block and display toast `Created X-Bridges state: XBridges_N`.

---

## 3. Architecture & Design Details

### Implementation in `App.tsx`
Add condition inside `handleKeyDown`:
```ts
if (e.shiftKey && (e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.metaKey && !e.altKey && !isSpacePressed.current) {
  e.preventDefault();
  const canvasW = canvasRef.current?.clientWidth || 800;
  const canvasH = canvasRef.current?.clientHeight || 600;
  const worldX = ((canvasW / 2) / uiZoom - view.offsetX) / view.scale;
  const worldY = ((canvasH / 2) / uiZoom - view.offsetY) / view.scale;
  createXBridgesState(worldX, worldY);
}
```

---

## 4. Verification Plan

### Automated / Manual Verification
1. **Shortcut Execution**:
   - Press `Shift + X` in state machine mode -> Verify a new green X-Bridges state block is created at center of screen.
2. **Input Guarding**:
   - Click inside a state name input or property field and type `X` with Shift -> Verify capital letter `X` is typed without creating a block.
