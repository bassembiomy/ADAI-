# Design Document: State Machine Scope Horizontal Scroll & Detachable Window

**Date**: 2026-07-27  
**Status**: Approved  

---

## 1. Overview
Enhance the State Machine Scope panel in `App.tsx` by providing horizontal sliding capabilities (left/right scroll bar) to view all variable charts clearly without truncation, and allow users to double-click the Scope to detach it into a floating overlay window for enhanced visualization, and double-click again to dock it back to its original size and location.

---

## 2. Requirements & Goals

### Functional Requirements
1. **Horizontal Scroll Bar**:
   - Scope variable chart cards must maintain a min-width of `220px` to prevent squeezing or line clipping.
   - A horizontal scrollbar (`overflow-x-auto`) at the bottom of the Scope panel must allow sliding left and right seamlessly across all enabled variables.
2. **Double-Click Detach**:
   - Double-clicking the Scope panel header or chart body toggles `isScopeDetached`.
   - When detached, Scope presents as a floating, centered, dark-themed window (`z-50`) overlay with backdrop blur.
3. **Double-Click Restore**:
   - Double-clicking the header of the floating Scope window (or clicking the Dock/Restore button) docks Scope back into the bottom dock with its original height and position.
4. **UI Styling**:
   - Custom dark scrollbar styling for Scope chart horizontal scroll.
   - Header badge displaying detachment status ("Double-click to expand/dock").

---

## 3. Architecture & Design Details

### State Additions in `App.tsx`
```ts
const [isScopeDetached, setIsScopeDetached] = useState<boolean>(false);
```

### Layout Modifications
1. **Docked View**:
   - When `!isScopeDetached`, Scope renders in the bottom panel (`scopeHeight` px).
   - Content container: `className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar pb-2"`
   - Header `onDoubleClick={() => setIsScopeDetached(true)}`.
2. **Detached View**:
   - When `isScopeDetached`, Scope renders as a fixed overlay:
     ```tsx
     <div className="fixed inset-6 z-50 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl flex flex-col backdrop-blur-md">
       {/* Header with double click to dock */}
       <div onDoubleClick={() => setIsScopeDetached(false)} className="h-11 px-4 border-b border-[#222] flex items-center justify-between cursor-pointer">
         ...
       </div>
       {/* Expanded scrollable charts */}
       <div className="flex-1 p-4 overflow-x-auto overflow-y-auto">
         ...
       </div>
     </div>
     ```

---

## 4. Verification Plan

### Automated / Manual Verification
1. **Horizontal Scroll Verification**:
   - Enable 5+ variables for Scope. Verify horizontal scrollbar appears at bottom and sliding left/right shows all charts with minimum 220px width.
2. **Detach & Dock Verification**:
   - Double click Scope header or chart area -> Scope pops out into floating window.
   - Double click Scope floating header again -> Scope returns to bottom dock.
   - Verify simulation data continues to stream live into both docked and detached views.
