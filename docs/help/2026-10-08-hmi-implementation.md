# HMI implementation and verification — 2026-10-08

The approved HMI expansion is implemented in the working tree. The catalog contains 42 components: the 15 legacy types and 27 engineering controls, displays and layout components. The Help reference includes an authored page for every type and an execution-boundary diagram.

## Result

- Categorized searchable palette, shared catalog/defaults, property editing, nested panels/tabs and existing project migration.
- Application theme variables, managed-window geometry, responsive panels, keyboard/pointer operation and explicit binding errors.
- Numeric drafts and staged controls remain distinct from committed displays. Controls respect type, overflow policy, component ranges, write permission and external sensor ownership.
- Input commands enter the semantic interpreter after successful external reads and before the tick. Fast presses/pulses survive one consumed tick; release follows. Reset/model replacement clears pending inputs. State indicators and plots consume committed states/values/timestamps.
- Legacy one-hot rotary positions, discrete encoder/hybrid presets, OLED channels, colors and configured active/inactive values are preserved. Multi-state images support per-value image URLs. Gauges and seven-segment displays have their actual graphical geometry.
- Static, preview and downloaded HTML reports share the widget renderer and the semantic runtime. The exported input queue uses the same queue implementation and typed parser.

## Evidence

Focused HMI, Help, application adapter, standalone runtime and HMI reporting verification: **20 files, 176 tests passed**. These include nested/parallel direct-input trace comparisons, quick press/release, cancelled reads, keyboard, blur/cancel/unmount, rebinding while held, pulse values, queued Reset, paused drafts, staged knob/switch operation, ownership, migration, report serialization, nested layouts, OLED and all catalog render paths.

Help coverage: **2090/2090 features**, zero missing destinations. Live UI evidence is regenerated from the actual source; all new controls resolve authored Help topics.

Final compilation checks: `npx tsc --noEmit` and `npx vite build` both completed with exit code 0. The Vite build retains the existing large-chunk advisory; this is a successful web build, not an Electron packaging/release claim.

Real browser verification loads the legacy model fixture through the application Open path, operates the HMI, advances the chart, checks Reset, verifies both themes/mobile layout, generates the actual report and exercises the downloaded HTML. See `audit/hmi-browser-verification.json`, `audit/hmi-runtime-dark.png`, `audit/hmi-runtime-light.png`, `audit/hmi-mobile.png`, `audit/hmi-portable-report.html` and `audit/hmi-portable-report.png`. Reproduce with `node scripts/help/verifyHmiBrowser.cjs` while the development server is running.

Independent task reviews found and corrected Boolean parsing, custom pulse release values, nonzero inactive switches, release bounds, stale held bindings, command-button write flags, nested report positioning/visibility and missing legacy OLED channels.
The final independent review approved the HMI scope with no remaining critical or important findings.

An exploratory full reporting run encountered an existing unrelated assertion expecting exact `class="sm-stub"` while the State Machine figure now includes `sm-stub rf-node`. That assertion is outside this HMI change; the HMI reporting tests pass. Other dirty workspace changes were preserved. No commit or release was created.
