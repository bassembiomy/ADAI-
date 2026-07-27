# Design Document: State Machine `Shift + C` Connect Shortcut

**Date**: 2026-07-27  
**Status**: Approved  

---

## 1. Overview
Add a keyboard shortcut (`Shift + C`) in the ADIA State Machine Editor that performs the exact action of clicking the "Connect" button in the canvas toolbar (toggling transition creation mode).

---

## 2. Requirements & Goals

### Functional Requirements
1. **Shortcut Key**: `Shift + C` (case-insensitive for `C` or `c`).
2. **Context Guard**: Must not trigger while typing inside `<input>`, `<textarea>`, or content-editable elements.
3. **Action Execution**:
   - In `statemachine`, `bdd`, and `requirements` diagram modes: Toggle `isCreatingTransition`. Reset `transitionSourceId` when toggling off.
   - In `ibd` diagram mode: Toggle `isCreatingConnector`. Reset `connectorSource` when toggling off.
4. **User Feedback**: Toast notification announcing "Connect mode activated" or "Connect mode canceled".

---

## 3. Architecture & Design Details

### Implementation in `App.tsx`
Add condition inside `handleKeyDown`:
```ts
if (e.shiftKey && (e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
  e.preventDefault();
  if (diagramMode === 'ibd') {
    setIsCreatingConnector(prev => {
      const next = !prev;
      if (!next) setConnectorSource(null);
      addError('info', next ? 'Connect mode activated' : 'Connect mode canceled');
      return next;
    });
  } else {
    setIsCreatingTransition(prev => {
      const next = !prev;
      if (!next) setTransitionSourceId(null);
      addError('info', next ? 'Connect mode activated' : 'Connect mode canceled');
      return next;
    });
  }
}
```

---

## 4. Verification Plan

### Automated / Manual Verification
1. **Shortcut Trigger**:
   - Press `Shift + C` in state machine mode -> Verify banner "Click source state/junction..." appears and `isCreatingTransition` is true.
   - Press `Shift + C` again -> Verify connection mode cancels.
2. **Input Guarding**:
   - Click inside a state name input or property field and type `C` with Shift -> Verify capital letter `C` is typed without triggering connection mode.
