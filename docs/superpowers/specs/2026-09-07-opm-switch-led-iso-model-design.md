# OPM ISO 19450 Switch and LED Model Design

## Overview
This design introduces an ISO 19450 (Object-Process Methodology) compliant template model for a Switch and LED system into the ADIA Entropy OPM module. The model captures a bidirectional on/off operational cycle featuring human actuation, physical components, internal state transitions, and reactive causal trigger links.

## System Architecture & OPM Formalization

### 1. Structural Elements (Objects)
- **`Switch_Circuit`**: Physical aggregation representing the overall composite circuit containing `Switch` and `LED`.
- **`Switch`**: Physical object with discrete operational states `Off` and `On`.
- **`LED`**: Physical object with discrete illumination states `Off` and `On`.
- **`User`**: Physical human agent executing manual control operations.

### 2. Behavioral Elements (Processes)
- **`Toggle_Switch`**: Process executed by `User` that transitions `Switch` between its `Off` and `On` states.
- **`Light_LED`**: Reactive process triggered when `Switch` enters state `On`, transitioning `LED` from `Off` to `On`.
- **`Extinguish_LED`**: Reactive process triggered when `Switch` enters state `Off`, transitioning `LED` from `On` to `Off`.

### 3. Procedural and Structural Links (ISO 19450)
- **Aggregation**: `Switch_Circuit consists of Switch and LED.`
- **Agent Link**: `User executes Toggle_Switch.`
- **State Transition / Effect Links**:
  - `Toggle_Switch changes Switch from Off to On.`
  - `Toggle_Switch changes Switch from On to Off.`
  - `Light_LED changes LED from Off to On.`
  - `Extinguish_LED changes LED from On to Off.`
- **Trigger Links**:
  - `Switch in state On triggers Light_LED.`
  - `Switch in state Off triggers Extinguish_LED.`

### 4. Complete OPL (Object-Process Language) Specification
```opl
Object Switch_Circuit consists of Switch and LED.
Object Switch_Circuit is physical.
Object Switch is physical.
Object LED is physical.
Object User is physical.
Object Switch has states Off, On.
Object LED has states Off, On.
Process Toggle_Switch.
Process Light_LED.
Process Extinguish_LED.
User executes Toggle_Switch.
Toggle_Switch changes Switch from Off to On.
Switch in state On triggers Light_LED.
Light_LED changes LED from Off to On.
Toggle_Switch changes Switch from On to Off.
Switch in state Off triggers Extinguish_LED.
Extinguish_LED changes LED from On to Off.
```

## Integration Points

### 1. Template Registry (`src/components/entropy/EntropyExamples.ts`)
Add a new template record `switchLed` to `OPM_EXAMPLES`:
- Key: `switchLed`
- Name: `"Switch & LED Circuit"`
- Description: `"ISO 19450 standard model: User toggles a physical switch between Off and On, triggering reactive processes to Light or Extinguish the LED."`
- OPL text: Standard OPL specification shown above.

The template is automatically rendered in the template picker in `EntropyWorkspace.tsx` because it iterates dynamically over `Object.entries(OPM_EXAMPLES)`.

### 2. Automated Tests (`src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`)
Add dedicated unit test suite for the `switchLed` example:
- Verifies OPL parses cleanly with 0 syntax errors.
- Verifies `Switch` and `LED` objects are physical and own child state nodes `Off` and `On` nested in parent trays.
- Verifies `User` executes `Toggle_Switch` via agent link.
- Verifies trigger and consumption/result effect links for both `Light_LED` and `Extinguish_LED`.

## Verification Strategy
- Run Vitest suite on `src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`.
- Verify graph layout and simulation step progression in OPM simulation engine.
