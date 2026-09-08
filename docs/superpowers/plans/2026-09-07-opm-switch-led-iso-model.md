# ISO 19450 Switch and LED Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a standard ISO 19450 Switch and LED model template with bidirectional actuation, internal states, and causal trigger links into ADIA Entropy OPM.

**Architecture:** Add the `switchLed` OPM template definition to `OPM_EXAMPLES` in `EntropyExamples.ts` using standard OPL (Object-Process Language) syntax. Validate with Vitest unit tests in `opmTemplatesAndStates.test.tsx` verifying syntactic correctness, node/state extraction, and procedural link structures.

**Tech Stack:** TypeScript, React Flow (@xyflow/react), Vitest.

## Global Constraints
- Must strictly adhere to ISO 19450 (Object-Process Methodology) syntax supported by ADIA's `OplParser`.
- Zero syntax errors during OPL parsing.
- State nodes must have their `parentId` bound to their parent object node and sit inside the state tray.
- All tests must run cleanly via `vitest run src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`.

---

### Task 1: Add Unit Tests for Switch and LED Model (TDD Red)

**Files:**
- Modify: `src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`

**Interfaces:**
- Consumes: `OPM_EXAMPLES.switchLed` from `../EntropyExamples`, `parseOpl` from `../OplParser`.
- Produces: Test suite validating `switchLed` OPL parsing, state trays, agent links, triggers, and state transitions.

- [ ] **Step 1: Write the failing unit tests for `switchLed`**
Add test case in `src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`:
```typescript
test('switchLed template adheres to ISO 19450 standard: Switch and LED own Off and On states with triggers', () => {
  const { nodes, edges, errors } = parseOpl((OPM_EXAMPLES as any).switchLed.oplText);
  expect(errors).toHaveLength(0);

  const switchObj = nodes.find(n => n.data.name === 'Switch');
  const ledObj = nodes.find(n => n.data.name === 'LED');
  const userObj = nodes.find(n => n.data.name === 'User');
  const toggleProc = nodes.find(n => n.data.name === 'Toggle_Switch');
  const lightProc = nodes.find(n => n.data.name === 'Light_LED');
  const extProc = nodes.find(n => n.data.name === 'Extinguish_LED');

  expect(switchObj).toBeDefined();
  expect(switchObj!.data.physical).toBe(true);
  expect(ledObj).toBeDefined();
  expect(ledObj!.data.physical).toBe(true);
  expect(userObj).toBeDefined();
  expect(userObj!.data.physical).toBe(true);

  // States
  const switchStates = nodes.filter(n => n.data.type === 'state' && n.parentId === switchObj!.id);
  expect(switchStates).toHaveLength(2);
  const ledStates = nodes.filter(n => n.data.type === 'state' && n.parentId === ledObj!.id);
  expect(ledStates).toHaveLength(2);

  // Agent link: User -> Toggle_Switch
  const agentEdge = edges.find(e => e.source === userObj!.id && e.target === toggleProc!.id);
  expect(agentEdge).toBeDefined();
  expect(agentEdge!.data?.type).toBe('agent');

  // Trigger link: Switch in state On -> Light_LED
  const switchOnState = switchStates.find(s => s.data.name === 'On');
  const switchOffState = switchStates.find(s => s.data.name === 'Off');
  const onTrigger = edges.find(e => e.source === switchOnState!.id && e.target === lightProc!.id);
  expect(onTrigger).toBeDefined();
  expect(onTrigger!.data?.type).toBe('trigger');

  // Trigger link: Switch in state Off -> Extinguish_LED
  const offTrigger = edges.find(e => e.source === switchOffState!.id && e.target === extProc!.id);
  expect(offTrigger).toBeDefined();
  expect(offTrigger!.data?.type).toBe('trigger');
});
```

- [ ] **Step 2: Run test to confirm it fails**
Run: `npx vitest run src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`
Verify that the test fails because `OPM_EXAMPLES.switchLed` does not exist yet.

---

### Task 2: Implement Switch and LED Template in EntropyExamples (TDD Green)

**Files:**
- Modify: `src/components/entropy/EntropyExamples.ts`

**Interfaces:**
- Produces: `OPM_EXAMPLES.switchLed` conforming to `OpmExample`.

- [ ] **Step 1: Add `switchLed` entry to `OPM_EXAMPLES`**
Add the `switchLed` record to `OPM_EXAMPLES` in `src/components/entropy/EntropyExamples.ts`:
```typescript
  switchLed: {
    name: "Switch & LED Circuit",
    description: "ISO 19450 standard model: User toggles a physical switch between Off and On, which triggers reactive processes to Light or Extinguish the LED.",
    oplText: `Object Switch_Circuit consists of Switch and LED.
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
Extinguish_LED changes LED from On to Off.`
  },
```

- [ ] **Step 2: Run tests to confirm pass**
Run: `npx vitest run src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx`
Confirm all tests pass with 0 failures.

- [ ] **Step 3: Run full Entropy OPM test suite**
Run: `npm run test:opm`
Confirm all OPM engine tests pass.

- [ ] **Step 4: Commit changes**
Run: `git add src/components/entropy/EntropyExamples.ts src/components/entropy/__tests__/opmTemplatesAndStates.test.tsx docs/superpowers/plans/2026-09-07-opm-switch-led-iso-model.md`
`git commit -m "feat(opm): add ISO 19450 switch and led circuit template"`
