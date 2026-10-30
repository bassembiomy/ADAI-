# HMI displays, LCD types, segment displays and vector icons

Planner: Opus (design, acceptance tests, review). Executor: Sonnet (implementation).

## Goal

Make the HMI dashboard look like a real appliance / instrument front panel:

1. A vector **icon library** (≥ 50 icons, 24 × 24 grid) replacing emoji glyphs wherever an HMI widget shows an icon.
2. **LCD types** — selectable glass/backlight themes on every display widget, plus a character LCD (HD44780 style)
   and an appliance segment LCD with icon annunciators.
3. **Segment displays with 7, 14 and 16 segments**, decimal point and colon cells, fixed digit count, ghost
   (unlit) segments, optional italic skew, and a 5 × 7 dot-matrix display.
4. Better rendering of existing items: lamps / LEDs as lit bulbs with glow and an icon, mode icons with vector
   icons, gauges with major/minor ticks and a value arc, LED bar graph.

Rendered **identically** in the React workspace and in the portable report/export SVG renderer.

## Architecture

### Single source of glyph data — `src/features/hmi/hmiGlyphs.ts`

Pure, JSON-serializable data plus self-contained functions (no references to anything outside their own body, so
`fn.toString()` can be embedded in the portable report script, exactly like `renderHmiWidgetSvg` today).

```ts
export type HmiIconCategory = 'power' | 'media' | 'climate' | 'status' | 'connectivity' | 'appliance' | 'navigation' | 'audio';
export interface HmiIconDef { label: string; category: HmiIconCategory; paths: string[] }   // stroke paths, 24×24, stroke-width 2 round caps
export const HMI_ICON_IDS = [...] as const;   export type HmiIconId = typeof HMI_ICON_IDS[number];
export type HmiLcdTheme = 'green-stn' | 'blue-negative' | 'amber' | 'white-fstn' | 'red-led' | 'green-led' | 'cyan-oled';
export interface HmiLcdThemeDef { label: string; background: string; bezel: string; on: string; off: string; glow: boolean }
export interface HmiGlyphData {
  icons: Record<HmiIconId, HmiIconDef>;
  segments: Record<'7'|'14'|'16', { paths: Record<string, string>; chars: Record<string, string> }>; // segment id → polygon path in a 40×64 cell; char → segment ids string
  font5x7: Record<string, number[]>;   // ASCII 32–126 → 7 row bitmasks (bit 4 = leftmost column)
  lcdThemes: Record<HmiLcdTheme, HmiLcdThemeDef>;
}
export const HMI_GLYPHS: HmiGlyphData;
export interface HmiSegmentCell { char: string; segments: string; dp: boolean; colon: boolean }
export function layoutSegmentCells(text: string, options: { style: '7'|'14'|'16'; digits?: number; numeric?: boolean }, glyphs: HmiGlyphData): HmiSegmentCell[];
export function formatCharacterLcdLines(lines: readonly string[], rows: number, columns: number, tokens: Record<string, string>): string[];
export const HMI_RENDER_LIB = { glyphs: HMI_GLYPHS, layoutSegmentCells, formatCharacterLcdLines };
export type HmiRenderLib = typeof HMI_RENDER_LIB;
```

Segment ids: 7 = `abcdefg`; 14 = `a b c d e f g1 g2 h i j k l m` encoded as single letters `abcdefghijklmn`
(g1 = `g`, g2 = `h`, diagonals/verticals `i..n`); 16 = 14-seg with split top/bottom: `abcdefghijklmnop`
(a1 a2 b c d1 d2 e f g1 g2 h i j k l m). Each segment is a beveled hexagon/diamond polygon, not a line.

`layoutSegmentCells` rules (real segment-display behaviour):
- `.` merges into the previous cell as its decimal point (a leading `.` gets its own blank cell); `:` sets
  `colon` on the previous cell.
- Character lookup: exact → upper case → lower case → blank (`segments: ''`).
- With `digits`: right-align (pad with blank cells on the left). If more cells than `digits`: when `numeric`,
  every cell becomes `-` (overflow, never a silently truncated number); otherwise keep the first `digits` cells.
- Without `digits`: one cell per character (minimum 1).

`formatCharacterLcdLines`: replaces `{key}` tokens, returns exactly `rows` strings, each exactly `columns`
characters (truncate / pad with spaces). Missing lines are blank.

### Model — `HmiComponent` additions (`src/types/sysml_types.ts`)

| field | used by | values |
|---|---|---|
| `icon?: HmiIconId \| 'none'` (widened) | lamp, led, mode-icon, icon-indicator, button, latching-button | library id |
| `lcdTheme?: HmiLcdTheme` | lcd, seven/fourteen/sixteen-segment, dot-matrix, character-lcd, segment-lcd, led-bar, oled | theme |
| `digitCount?: number` | seven/fourteen/sixteen-segment, dot-matrix, segment-lcd | integer 1–16 |
| `segmentSkew?: boolean` | seven/fourteen/sixteen-segment, segment-lcd | italic slant 8° |
| `lcdRows?` / `lcdColumns?` | character-lcd | 1–4 / 8–40 |
| `lcdLines?: string[]` | character-lcd | templates, tokens `{value}` `{name}` `{unit}` |
| `annunciators?: {icon: HmiIconId; variableId: string \| null; label?: string}[]` | segment-lcd | ≤ 12 |
| `barSegments?: number` | led-bar | integer 4–40 |

New display catalog types (all `Displays`, role `display`):

| type | default size | defaults |
|---|---|---|
| `fourteen-segment` | 240 × 100 | digitCount 8, lcdTheme `green-led` |
| `sixteen-segment` | 240 × 100 | digitCount 8, lcdTheme `red-led` |
| `dot-matrix` | 240 × 100 | digitCount 8, lcdTheme `amber` |
| `character-lcd` | 300 × 110 | rows 2, columns 16, lines `['{name}', '{value}']`, lcdTheme `green-stn` |
| `segment-lcd` | 280 × 150 | digitCount 4, annunciators `[]`, lcdTheme `white-fstn` |
| `icon-indicator` | 110 × 110 | icon `power` |
| `led-bar` | 220 × 80 | barSegments 10, lcdTheme `green-led` |

`seven-segment` keeps its type; `lcdTheme` defaults to `green-led`, `digitCount` stays unset (auto width) so
saved projects keep their width. `lcd` defaults to `green-stn`.

Displayed text for segment / dot-matrix displays: when `text` contains `{value}` it is a template; otherwise the
bound value formatted with precision; unbound → `text` or blank.

`normalizeHmiComponents` validates every new field (invalid enum → removed + diagnostic, out-of-range integers →
type default, arrays filtered to valid entries, annunciator list capped at 12, invalid annunciator icons dropped).

### Rendering

- **Portable / report** (`hmiReport.ts`): a self-contained core `renderHmiWidgetSvgWithLib(c, values, runtime, lib)`
  reads icons, segments, fonts and themes only through `lib`; the exported `renderHmiWidgetSvg(c, values, runtime)`
  keeps its signature and calls the core with `HMI_RENDER_LIB`. `installPortableHmi(renderer, lib)` calls
  `renderer(c, values, frame, lib)`. `getPortableHmiScript()` embeds the core's source and
  `{glyphs: <JSON>, layoutSegmentCells: <fn source>, formatCharacterLcdLines: <fn source>}`, so the script never
  references a bundler-renamed module identifier (the script must not contain `HMI_RENDER_LIB` / `HMI_GLYPHS`).
  Required markers (used by tests): `data-segment-style="7|14|16"`, one `data-segment-cell` per cell,
  `data-segment-on="true"` on each lit segment element, `data-icon="<id>"` on icon groups,
  `data-lcd-theme="<theme>"`, `data-lcd-cell` per character-LCD cell, `data-annunciator="<icon>" data-on="…"`
  (attributes adjacent, in that order), `data-bar-segment` with `data-on`, `data-dot-on="true"` on each lit
  dot-matrix dot (one element per dot), `data-gauge-tick` per gauge tick, `data-dp-on` / `data-colon-on` for lit
  decimal points and colons (these are not counted as segments).
  Character LCDs draw every character from the 5 × 7 font inside a 5 × 8 cell (lit and ghost dots, the way an
  HD44780 glass looks) and carry a `<title>` with the formatted lines so the text stays readable/searchable.
- **React** (`src/components/hmi/HmiGlyphs.tsx`): `HmiIcon`, `SegmentDisplay`, `DotMatrixDisplay`,
  `CharacterLcd`, `SegmentLcd`, `LedBar`, `Bulb` components built from the same data and the same markers.
  Ghost segments at the theme `off` colour; lit segments in `on` colour with an SVG glow filter when the theme has
  `glow`. Glass gradient + bezel. Gauges gain ticks and a value arc. Lamps / LEDs become radial-gradient bulbs with
  the vector icon (emoji `iconEmoji` still wins when set, for saved projects). OLED indicator entries that are icon
  ids render as vector icons.
- Colours: theme colours live in `HMI_GLYPHS.lcdThemes` (display glass is a deliberate hardware surface, like the
  plot/terminal allow-list in `scripts/check_theme_literals.cjs`). Workspace chrome keeps using theme tokens.

### Editor

Properties panel additions (edit mode):
- **Icon picker** for icon-capable types: searchable grid of `HmiIcon` buttons (`aria-label` = icon label,
  `aria-pressed` on the current one).
- **LCD theme** select for theme-capable types, **Digit count**, **Italic segments**, **Rows**, **Columns**,
  **Bar segments** number inputs where relevant, **LCD lines** JSON array (validated: array of strings).
- **Annunciators** list editor for `segment-lcd`: per row an icon select, variable select, label input, remove
  button; an **Add annunciator** button.
- Palette entries show a small vector preview icon next to each component name.

Help: `src/help/hmiTopics.ts` gets details and appearance text for each new type; help count test moves from 42 → 49.

## Work packages

1. **WP1 glyph library** — `hmiGlyphs.ts` (icons, segment maps 7/14/16, font 5×7, themes, layout functions).
   Acceptance: `src/features/hmi/hmiGlyphs.test.ts`.
2. **WP2 model** — types, catalog entries, defaults, normalization. Acceptance: `src/features/hmi/hmiDisplays.test.ts`
   (catalog + normalization part).
3. **WP3 portable renderer** — new types and re-rendered items in `renderHmiWidgetSvg`, lib injection.
   Acceptance: `hmiDisplays.test.ts` (report part) + existing `hmiReport.test.ts` (catalog sweep covers new types).
4. **WP4 React widgets + editor** — `HmiGlyphs.tsx`, `HmiWorkspace.tsx`, `hmi.css`. Acceptance:
   `src/components/hmi/HmiDisplays.test.tsx` + existing `HmiWorkspace.test.tsx`.
5. **WP5 help** — topics for new types. Acceptance: `src/help/hmiTopics.test.ts`, `npm run test:help`.

Gate: `npx vitest run src/features/hmi src/components/hmi src/help src/features/reporting`, `npx tsc --noEmit`,
`npm run lint:theme`, and a Playwright screenshot of a showcase panel reviewed by the planner.
