/**
 * Glyph data shared by the React HMI widgets and the portable report renderer: vector icons, segment-display
 * polygons and character maps, a 5x7 dot-matrix font and LCD glass themes. Everything here is JSON-serializable
 * data plus two self-contained layout functions, so the portable report can embed them verbatim.
 */
export type HmiIconCategory = 'power' | 'media' | 'climate' | 'status' | 'connectivity' | 'appliance' | 'navigation' | 'audio';
export interface HmiIconDef { label: string; category: HmiIconCategory; paths: string[] }

export const HMI_ICON_IDS = [
  'power', 'bolt', 'plug', 'battery-full', 'battery-half', 'battery-low',
  'play', 'pause', 'stop',
  'light', 'fan', 'flame', 'steam', 'droplet', 'snowflake', 'thermometer', 'sun', 'moon', 'wind', 'leaf', 'water-wave',
  'warning', 'bell', 'error', 'info', 'check', 'close', 'lock', 'unlock', 'child-lock',
  'wifi', 'bluetooth', 'signal', 'cloud',
  'clock', 'timer', 'gear', 'motor', 'pump', 'valve', 'door', 'home', 'filter', 'refresh', 'eye',
  'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'plus', 'minus',
  'speaker', 'mute',
] as const;
export type HmiIconId = typeof HMI_ICON_IDS[number];

export type HmiLcdTheme = 'green-stn' | 'blue-negative' | 'amber' | 'white-fstn' | 'red-led' | 'green-led' | 'cyan-oled';
export interface HmiLcdThemeDef { label: string; background: string; bezel: string; on: string; off: string; glow: boolean }
export type HmiSegmentStyle = '7' | '14' | '16';
export interface HmiSegmentDef { paths: Record<string, string>; chars: Record<string, string> }
export interface HmiGlyphData {
  icons: Record<HmiIconId, HmiIconDef>;
  segments: Record<HmiSegmentStyle, HmiSegmentDef>;
  font5x7: Record<string, number[]>;
  lcdThemes: Record<HmiLcdTheme, HmiLcdThemeDef>;
}
export interface HmiSegmentCell { char: string; segments: string; dp: boolean; colon: boolean }

const icon = (label: string, category: HmiIconCategory, ...paths: string[]): HmiIconDef => ({ label, category, paths });
const batteryBody = 'M4 7 H17 a2 2 0 0 1 2 2 V15 a2 2 0 0 1 -2 2 H4 a2 2 0 0 1 -2 -2 V9 a2 2 0 0 1 2 -2 Z';
const lockBody = 'M5 11 H19 A2 2 0 0 1 21 13 V20 A2 2 0 0 1 19 22 H5 A2 2 0 0 1 3 20 V13 A2 2 0 0 1 5 11 Z';

const ICONS: Record<HmiIconId, HmiIconDef> = {
  power: icon('Power', 'power', 'M12 2 V12', 'M18.4 6.6 a9 9 0 1 1 -12.8 0'),
  bolt: icon('Lightning', 'power', 'M13 2 L4 14 H12 L11 22 L20 10 H12 Z'),
  plug: icon('Plug', 'power', 'M12 22 V17', 'M9 8 V2', 'M15 8 V2', 'M18 8 V13 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 V8 Z'),
  'battery-full': icon('Battery full', 'power', batteryBody, 'M22 11 V13', 'M6 10 V14', 'M10 10 V14', 'M14 10 V14'),
  'battery-half': icon('Battery half', 'power', batteryBody, 'M22 11 V13', 'M6 10 V14', 'M10 10 V14'),
  'battery-low': icon('Battery low', 'power', batteryBody, 'M22 11 V13', 'M6 10 V14'),
  play: icon('Play', 'media', 'M7 4.5 L19 12 L7 19.5 Z'),
  pause: icon('Pause', 'media', 'M6 4 H10 V20 H6 Z', 'M14 4 H18 V20 H14 Z'),
  stop: icon('Stop', 'media', 'M6 4 H18 A2 2 0 0 1 20 6 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V6 A2 2 0 0 1 6 4 Z'),
  light: icon('Light bulb', 'appliance', 'M12 3 C8 3 5.5 6 5.5 9 C5.5 11.3 6.7 12.8 8 14.2 C8.8 15 9 15.8 9 17 H15 C15 15.8 15.2 15 16 14.2 C17.3 12.8 18.5 11.3 18.5 9 C18.5 6 16 3 12 3 Z', 'M9.5 20 H14.5', 'M10.5 22.5 H13.5'),
  fan: icon('Fan', 'appliance',
    'M12 10.2 C8.8 8.6 8 5.2 10.2 3.4 C12.8 1.6 15.2 4.4 13.6 7.4 C13 8.6 12.4 9.6 12 10.2 Z',
    'M13.56 12.9 C16.54 10.93 19.89 11.94 20.35 14.74 C20.61 17.89 16.98 18.57 15.18 15.69 C14.44 14.57 13.88 13.55 13.56 12.9 Z',
    'M10.44 12.9 C10.66 16.47 8.11 18.86 5.45 17.86 C2.59 16.51 3.82 13.03 7.22 12.91 C8.56 12.83 9.72 12.85 10.44 12.9 Z',
    'M13.6 12 A1.6 1.6 0 1 1 10.4 12 A1.6 1.6 0 1 1 13.6 12 Z',
    'M22.5 12 A10.5 10.5 0 1 1 1.5 12 A10.5 10.5 0 1 1 22.5 12 Z'),
  flame: icon('Flame', 'climate', 'M8.5 14.5 A2.5 2.5 0 0 0 11 12 c0 -1.38 -0.5 -2 -1 -3 c-1.072 -2.143 -0.224 -4.054 2 -6 c0.5 2.5 2 4.9 4 6.5 c2 1.6 3 3.5 3 5.5 a7 7 0 1 1 -14 0 c0 -1.153 0.433 -2.294 1 -3 a2.5 2.5 0 0 0 2.5 2.5 Z'),
  steam: icon('Steam', 'climate', 'M8 3 c-1.5 1.5 1.5 3 0 4.5 s1.5 3 0 4.5', 'M12 3 c-1.5 1.5 1.5 3 0 4.5 s1.5 3 0 4.5', 'M16 3 c-1.5 1.5 1.5 3 0 4.5 s1.5 3 0 4.5', 'M4 15 H20 a8 8 0 0 1 -16 0 Z'),
  droplet: icon('Water drop', 'climate', 'M12 2.5 C12 2.5 5.5 9.5 5.5 14.5 a6.5 6.5 0 0 0 13 0 C18.5 9.5 12 2.5 12 2.5 Z'),
  snowflake: icon('Snowflake', 'climate', 'M12 12 L12 2 M12 5.8 L10.02 3.82 M12 5.8 L13.98 3.82 M12 12 L20.66 7 M17.37 8.9 L18.09 6.2 M17.37 8.9 L20.07 9.62 M12 12 L20.66 17 M17.37 15.1 L20.07 14.38 M17.37 15.1 L18.09 17.8 M12 12 L12 22 M12 18.2 L13.98 20.18 M12 18.2 L10.02 20.18 M12 12 L3.34 17 M6.63 15.1 L5.91 17.8 M6.63 15.1 L3.93 14.38 M12 12 L3.34 7 M6.63 8.9 L3.93 9.62 M6.63 8.9 L5.91 6.2'),
  thermometer: icon('Thermometer', 'climate', 'M14 14.76 V3.5 a2.5 2.5 0 0 0 -5 0 V14.76 a4.5 4.5 0 1 0 5 0 Z', 'M11.5 9 V18'),
  sun: icon('Sun', 'climate', 'M16 12 A4 4 0 1 1 8 12 A4 4 0 1 1 16 12 Z', 'M12 2 V4', 'M12 20 V22', 'M4.93 4.93 L6.34 6.34', 'M17.66 17.66 L19.07 19.07', 'M2 12 H4', 'M20 12 H22', 'M4.93 19.07 L6.34 17.66', 'M17.66 6.34 L19.07 4.93'),
  moon: icon('Moon', 'climate', 'M21 12.79 A9 9 0 1 1 11.21 3 A7 7 0 0 0 21 12.79 Z'),
  wind: icon('Wind', 'climate', 'M17.7 7.7 a2.5 2.5 0 1 1 1.8 4.3 H2', 'M9.6 4.6 A2 2 0 1 1 11 8 H2', 'M12.6 19.4 A2 2 0 1 0 14 16 H2'),
  leaf: icon('Leaf', 'climate', 'M11 20 A7 7 0 0 1 9.8 6.1 C15.5 5 17 4.48 19 2 c1 2 2 4.18 2 8 0 5.5 -4.78 10 -10 10 Z', 'M2 21 c0 -3 1.85 -5.36 5.08 -6 C9.5 14.52 12 13 13 12'),
  'water-wave': icon('Water waves', 'climate', 'M2 7 c2 -2 3 -2 5 0 s3 2 5 0 s3 -2 5 0 s3 2 5 0', 'M2 12 c2 -2 3 -2 5 0 s3 2 5 0 s3 -2 5 0 s3 2 5 0', 'M2 17 c2 -2 3 -2 5 0 s3 2 5 0 s3 -2 5 0 s3 2 5 0'),
  warning: icon('Warning', 'status', 'M21.73 18 L13.73 4 a2 2 0 0 0 -3.48 0 L2.27 18 A2 2 0 0 0 4 21 H20 A2 2 0 0 0 21.73 18 Z', 'M12 9 V13', 'M12 17 H12.01'),
  bell: icon('Bell', 'status', 'M6 8 a6 6 0 0 1 12 0 c0 7 3 9 3 9 H3 s3 -2 3 -9', 'M10.3 21 a1.94 1.94 0 0 0 3.4 0'),
  error: icon('Error', 'status', 'M22 12 A10 10 0 1 1 2 12 A10 10 0 1 1 22 12 Z', 'M15 9 L9 15', 'M9 9 L15 15'),
  info: icon('Information', 'status', 'M22 12 A10 10 0 1 1 2 12 A10 10 0 1 1 22 12 Z', 'M12 16 V12', 'M12 8 H12.01'),
  check: icon('Check', 'status', 'M20 6 L9 17 L4 12'),
  close: icon('Close', 'status', 'M18 6 L6 18', 'M6 6 L18 18'),
  lock: icon('Lock', 'status', lockBody, 'M7 11 V7 a5 5 0 0 1 10 0 V11'),
  unlock: icon('Unlock', 'status', lockBody, 'M7 11 V7 a5 5 0 0 1 9.9 -1'),
  'child-lock': icon('Child lock', 'appliance', lockBody, 'M7 11 V7 a5 5 0 0 1 10 0 V11', 'M12 15 H12.01', 'M10 20 L12 17.5 L14 20'),
  wifi: icon('Wi-Fi', 'connectivity', 'M5 12.55 a11 11 0 0 1 14.08 0', 'M1.42 9 a16 16 0 0 1 21.16 0', 'M8.53 16.11 a6 6 0 0 1 6.95 0', 'M12 20 H12.01'),
  bluetooth: icon('Bluetooth', 'connectivity', 'M6.5 6.5 L17.5 17.5 L12 23 V1 L17.5 6.5 L6.5 17.5'),
  signal: icon('Signal strength', 'connectivity', 'M4 20 V16', 'M9 20 V12', 'M14 20 V8', 'M19 20 V4'),
  cloud: icon('Cloud', 'connectivity', 'M17.5 19 H9 a7 7 0 1 1 6.71 -9 h1.79 a4.5 4.5 0 1 1 0 9 Z'),
  clock: icon('Clock', 'appliance', 'M22 12 A10 10 0 1 1 2 12 A10 10 0 1 1 22 12 Z', 'M12 6 V12 L16 14'),
  timer: icon('Timer', 'appliance', 'M10 2 H14', 'M12 14 L15 11', 'M20 14 A8 8 0 1 1 4 14 A8 8 0 1 1 20 14 Z'),
  gear: icon('Gear', 'appliance',
    'M10.21 4.82 L10.44 2.12 L13.56 2.12 L13.79 4.82 L15.81 5.66 L17.88 3.91 L20.09 6.12 L18.34 8.19 L19.18 10.21 L21.88 10.44 L21.88 13.56 L19.18 13.79 L18.34 15.81 L20.09 17.88 L17.88 20.09 L15.81 18.34 L13.79 19.18 L13.56 21.88 L10.44 21.88 L10.21 19.18 L8.19 18.34 L6.12 20.09 L3.91 17.88 L5.66 15.81 L4.82 13.79 L2.12 13.56 L2.12 10.44 L4.82 10.21 L5.66 8.19 L3.91 6.12 L6.12 3.91 L8.19 5.66 Z',
    'M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12 Z'),
  motor: icon('Motor', 'appliance', 'M3 7 H15 V17 H3 Z', 'M6 7 V17', 'M9 7 V17', 'M15 9 H18 V15 H15', 'M18 12 H22', 'M5 17 V20 H13 V17'),
  pump: icon('Pump', 'appliance', 'M18 13 A7 7 0 1 1 4 13 A7 7 0 1 1 18 13 Z', 'M11 6 V3 H21', 'M4 13 H2', 'M9 10 L14 13 L9 16 Z'),
  valve: icon('Valve', 'appliance', 'M3 10 L12 16 L3 22 Z', 'M21 10 L12 16 L21 22 Z', 'M12 16 V6', 'M8 6 H16'),
  door: icon('Door', 'appliance', 'M6 21 V4 a1 1 0 0 1 1 -1 H17 a1 1 0 0 1 1 1 V21', 'M3 21 H21', 'M15 12 H15.01'),
  home: icon('Home', 'navigation', 'M3 11 L12 3 L21 11', 'M5 9.5 V21 H19 V9.5', 'M10 21 V14 H14 V21'),
  filter: icon('Filter', 'appliance', 'M22 3 H2 L10 12.46 V19 L14 21 V12.46 Z'),
  refresh: icon('Refresh', 'navigation', 'M21 12 a9 9 0 1 1 -9 -9 c2.52 0 4.93 1 6.74 2.74 L21 8', 'M21 3 v5 h-5'),
  eye: icon('Eye', 'status', 'M2 12 s3.6 -7 10 -7 s10 7 10 7 s-3.6 7 -10 7 s-10 -7 -10 -7 Z', 'M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12 Z'),
  'arrow-up': icon('Arrow up', 'navigation', 'M12 19 V5', 'M5 12 L12 5 L19 12'),
  'arrow-down': icon('Arrow down', 'navigation', 'M12 5 V19', 'M19 12 L12 19 L5 12'),
  'arrow-left': icon('Arrow left', 'navigation', 'M19 12 H5', 'M12 19 L5 12 L12 5'),
  'arrow-right': icon('Arrow right', 'navigation', 'M5 12 H19', 'M12 5 L19 12 L12 19'),
  plus: icon('Plus', 'navigation', 'M12 5 V19', 'M5 12 H19'),
  minus: icon('Minus', 'navigation', 'M5 12 H19'),
  speaker: icon('Speaker', 'audio', 'M11 5 L6 9 H2 V15 H6 L11 19 Z', 'M15.5 8.5 a5 5 0 0 1 0 7', 'M19 5 a10 10 0 0 1 0 14'),
  mute: icon('Muted speaker', 'audio', 'M11 5 L6 9 H2 V15 H6 L11 19 Z', 'M23 9 L17 15', 'M17 9 L23 15'),
};

/* ---------------------------------------------------------------- segment displays (cell is 40 x 64) */
const SEG = {
  a: 'M6 4 L9 1 H31 L34 4 L31 7 H9 Z', b: 'M36 5 L39 8 V27 L36 30 L33 27 V8 Z', c: 'M36 34 L39 37 V56 L36 59 L33 56 V37 Z',
  d: 'M6 60 L9 57 H31 L34 60 L31 63 H9 Z', e: 'M4 34 L7 37 V56 L4 59 L1 56 V37 Z', f: 'M4 5 L7 8 V27 L4 30 L1 27 V8 Z', g: 'M5 32 L8 29 H32 L35 32 L32 35 H8 Z',
};
/** Seven-segment: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle. */
const SEGMENTS_7: HmiSegmentDef = {
  paths: { ...SEG },
  chars: {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    '-': 'g', '_': 'd', ' ': '', '=': 'dg', '[': 'adef', ']': 'abcd', '"': 'bf', "'": 'b', '?': 'abeg', '°': 'abfg',
    A: 'abcefg', b: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', E: 'adefg', F: 'aefg', G: 'acdef', H: 'bcefg', h: 'cefg', I: 'ef', i: 'c', J: 'bcde', L: 'def',
    n: 'ceg', o: 'cdeg', O: 'abcdef', P: 'abefg', r: 'eg', S: 'acdfg', t: 'defg', U: 'bcdef', u: 'cde', Y: 'bcdfg',
  },
};
/** Fourteen-segment: a..f outer ring, g/h middle halves (left/right), i upper-left diagonal, j upper centre, k upper-right diagonal, l lower-left diagonal, m lower centre, n lower-right diagonal. */
const SEGMENTS_14: HmiSegmentDef = {
  paths: {
    a: SEG.a, b: SEG.b, c: SEG.c, d: SEG.d, e: SEG.e, f: SEG.f,
    g: 'M5 32 L8 29 H17 L19 32 L17 35 H8 Z', h: 'M21 32 L23 29 H32 L35 32 L32 35 H23 Z',
    i: 'M8.5 11 H12 L16.4 24.5 H12.9 Z', j: 'M20 9 L22 11 V25 L20 27 L18 25 V11 Z', k: 'M31.5 11 H28 L23.6 24.5 H27.1 Z',
    l: 'M8.5 53 H12 L16.4 39.5 H12.9 Z', m: 'M20 55 L22 53 V39 L20 37 L18 39 V53 Z', n: 'M31.5 53 H28 L23.6 39.5 H27.1 Z',
  },
  chars: {
    '0': 'abcdefkl', '1': 'bc', '2': 'abdegh', '3': 'abcdgh', '4': 'bcfgh', '5': 'acdfgh', '6': 'acdefgh', '7': 'abc', '8': 'abcdefgh', '9': 'abcdfgh',
    A: 'abcefgh', B: 'abcdhjm', C: 'adef', D: 'abcdjm', E: 'adefgh', F: 'aefgh', G: 'acdefh', H: 'bcefgh', I: 'adjm', J: 'bcde', K: 'efgkn', L: 'def',
    M: 'bcefik', N: 'bcefin', O: 'abcdef', P: 'abefgh', Q: 'abcdefn', R: 'abefghn', S: 'acdfgh', T: 'ajm', U: 'bcdef', V: 'efkl', W: 'bcefln', X: 'ikln', Y: 'ikm', Z: 'adkl',
    '-': 'gh', '_': 'd', ' ': '', '+': 'ghjm', '*': 'ghijklmn', '/': 'kl', '\\': 'in', '=': 'dgh', '<': 'kn', '>': 'il', '°': 'abfgh', '?': 'abhm', '"': 'bj', "'": 'j',
  },
};
/**
 * Sixteen-segment: a top left, b top right, c upper right, d lower right, e bottom right, f bottom left, g lower left,
 * h upper left, i middle left, j middle right, k upper-left diagonal, l upper centre, m upper-right diagonal,
 * n lower-left diagonal, o lower centre, p lower-right diagonal.
 */
const SEGMENTS_16: HmiSegmentDef = {
  paths: {
    a: 'M6 4 L9 1 H19 V7 H9 Z', b: 'M21 1 H31 L34 4 L31 7 H21 Z', c: SEG.b, d: SEG.c, e: 'M21 57 H31 L34 60 L31 63 H21 Z', f: 'M6 60 L9 57 H19 V63 H9 Z', g: SEG.e, h: SEG.f,
    i: SEGMENTS_14.paths.g, j: SEGMENTS_14.paths.h, k: SEGMENTS_14.paths.i, l: SEGMENTS_14.paths.j, m: SEGMENTS_14.paths.k, n: SEGMENTS_14.paths.l, o: SEGMENTS_14.paths.m, p: SEGMENTS_14.paths.n,
  },
  chars: {
    '0': 'abcdefghmn', '1': 'cd', '2': 'abcefgij', '3': 'abcdefij', '4': 'cdhij', '5': 'abdefhij', '6': 'abdefghij', '7': 'abcd', '8': 'abcdefghij', '9': 'abcdefhij',
    A: 'abcdghij', B: 'abcdefjlo', C: 'abefgh', D: 'abcdeflo', E: 'abefghij', F: 'abghij', G: 'abdefghj', H: 'cdghij', I: 'abeflo', J: 'cdefg', K: 'ghimp', L: 'efgh',
    M: 'cdghkm', N: 'cdghkp', O: 'abcdefgh', P: 'abcghij', Q: 'abcdefghp', R: 'abcghijp', S: 'abdefhij', T: 'ablo', U: 'cdefgh', V: 'ghmn', W: 'cdghnp', X: 'kmnp', Y: 'kmo', Z: 'abefmn',
    '-': 'ij', '_': 'ef', ' ': '', '+': 'ijlo', '*': 'ijklmnop', '/': 'mn', '\\': 'kp', '=': 'efij', '<': 'mp', '>': 'kn', '°': 'abhij', '?': 'abcjo', '"': 'cl', "'": 'l',
  },
};

/* ---------------------------------------------------------------- 5 x 7 dot-matrix font (ASCII 32..126, bit 4 = leftmost) */
const FONT_ROWS = [
  '00,00,00,00,00,00,00', '04,04,04,04,04,00,04', '0A,0A,0A,00,00,00,00', '0A,0A,1F,0A,1F,0A,0A', '04,0F,14,0E,05,1E,04', '18,19,02,04,08,13,03', '0C,12,14,08,15,12,0D', '0C,04,08,00,00,00,00',
  '02,04,08,08,08,04,02', '08,04,02,02,02,04,08', '00,04,15,0E,15,04,00', '00,04,04,1F,04,04,00', '00,00,00,00,0C,04,08', '00,00,00,1F,00,00,00', '00,00,00,00,00,0C,0C', '00,01,02,04,08,10,00',
  '0E,11,13,15,19,11,0E', '04,0C,04,04,04,04,0E', '0E,11,01,02,04,08,1F', '1F,02,04,02,01,11,0E', '02,06,0A,12,1F,02,02', '1F,10,1E,01,01,11,0E', '06,08,10,1E,11,11,0E', '1F,01,02,04,08,08,08',
  '0E,11,11,0E,11,11,0E', '0E,11,11,0F,01,02,0C', '00,0C,0C,00,0C,0C,00', '00,0C,0C,00,0C,04,08', '02,04,08,10,08,04,02', '00,00,1F,00,1F,00,00', '08,04,02,01,02,04,08', '0E,11,01,02,04,00,04',
  '0E,11,01,0D,15,15,0E', '0E,11,11,1F,11,11,11', '1E,11,11,1E,11,11,1E', '0E,11,10,10,10,11,0E', '1C,12,11,11,11,12,1C', '1F,10,10,1E,10,10,1F', '1F,10,10,1E,10,10,10', '0E,11,10,17,11,11,0F',
  '11,11,11,1F,11,11,11', '0E,04,04,04,04,04,0E', '07,02,02,02,02,12,0C', '11,12,14,18,14,12,11', '10,10,10,10,10,10,1F', '11,1B,15,15,11,11,11', '11,11,19,15,13,11,11', '0E,11,11,11,11,11,0E',
  '1E,11,11,1E,10,10,10', '0E,11,11,11,15,12,0D', '1E,11,11,1E,14,12,11', '0F,10,10,0E,01,01,1E', '1F,04,04,04,04,04,04', '11,11,11,11,11,11,0E', '11,11,11,11,11,0A,04', '11,11,11,15,15,15,0A',
  '11,11,0A,04,0A,11,11', '11,11,11,0A,04,04,04', '1F,01,02,04,08,10,1F', '0E,08,08,08,08,08,0E', '00,10,08,04,02,01,00', '0E,02,02,02,02,02,0E', '04,0A,11,00,00,00,00', '00,00,00,00,00,00,1F',
  '08,04,02,00,00,00,00', '00,00,0E,01,0F,11,0F', '10,10,16,19,11,11,1E', '00,00,0E,10,10,11,0E', '01,01,0D,13,11,11,0F', '00,00,0E,11,1F,10,0E', '06,09,08,1C,08,08,08', '00,0F,11,11,0F,01,0E',
  '10,10,16,19,11,11,11', '04,00,0C,04,04,04,0E', '02,00,06,02,02,12,0C', '10,10,12,14,18,14,12', '0C,04,04,04,04,04,0E', '00,00,1A,15,15,11,11', '00,00,16,19,11,11,11', '00,00,0E,11,11,11,0E',
  '00,00,1E,11,1E,10,10', '00,00,0D,13,0F,01,01', '00,00,16,19,10,10,10', '00,00,0E,10,0E,01,1E', '08,08,1C,08,08,09,06', '00,00,11,11,11,13,0D', '00,00,11,11,11,0A,04', '00,00,11,11,15,15,0A',
  '00,00,11,0A,04,0A,11', '00,00,11,11,0F,01,0E', '00,00,1F,02,04,08,1F', '02,04,04,08,04,04,02', '04,04,04,04,04,04,04', '08,04,04,02,04,04,08', '00,00,08,15,02,00,00',
];
const FONT_5X7: Record<string, number[]> = Object.fromEntries(FONT_ROWS.map((rows, index) => [String.fromCharCode(32 + index), rows.split(',').map(hex => parseInt(hex, 16))]));

/* ---------------------------------------------------------------- LCD glass themes */
const THEMES: Record<HmiLcdTheme, HmiLcdThemeDef> = {
  'green-stn': { label: 'Green STN (reflective)', background: '#b3c27a', bezel: '#2a2f26', on: '#1d2812', off: '#a2b36d', glow: false },
  'blue-negative': { label: 'Blue negative (transmissive)', background: '#1a3a9c', bezel: '#14171f', on: '#e6f0ff', off: '#2a4cb0', glow: false },
  amber: { label: 'Amber backlight', background: '#1c1004', bezel: '#15120e', on: '#ffb000', off: '#3a2608', glow: true },
  'white-fstn': { label: 'White FSTN (positive)', background: '#e8ecee', bezel: '#2c3036', on: '#14181c', off: '#d3d9dc', glow: false },
  'red-led': { label: 'Red LED', background: '#150505', bezel: '#141414', on: '#ff3b30', off: '#3a0f0d', glow: true },
  'green-led': { label: 'Green LED', background: '#04120a', bezel: '#141414', on: '#3dff7a', off: '#0f2a18', glow: true },
  'cyan-oled': { label: 'Cyan OLED', background: '#02080c', bezel: '#101417', on: '#4fe8ff', off: '#0b2a33', glow: true },
};

export const HMI_GLYPHS: HmiGlyphData = {
  icons: ICONS,
  segments: { '7': SEGMENTS_7, '14': SEGMENTS_14, '16': SEGMENTS_16 },
  font5x7: FONT_5X7,
  lcdThemes: THEMES,
};

/**
 * Lays text out as segment-display cells. A '.' becomes the decimal point of the previous cell (a leading one gets
 * its own blank cell), ':' marks a colon on the previous cell. With `digits`, cells are right-aligned; surplus cells
 * show dashes for numbers and are truncated for text. Self-contained: the portable report embeds this source.
 */
export function layoutSegmentCells(text: string, options: { style: '7' | '14' | '16'; digits?: number; numeric?: boolean }, glyphs: HmiGlyphData): HmiSegmentCell[] {
  const chars = glyphs.segments[options.style].chars;
  let cells: HmiSegmentCell[] = [];
  for (const ch of Array.from(String(text ?? ''))) {
    const last = cells[cells.length - 1];
    if (ch === '.') {
      if (last && !last.dp) last.dp = true;
      else cells.push({ char: ' ', segments: '', dp: true, colon: false });
    } else if (ch === ':') {
      if (last && !last.colon) last.colon = true;
      else cells.push({ char: ' ', segments: '', dp: false, colon: true });
    } else {
      cells.push({ char: ch, segments: chars[ch] ?? chars[ch.toUpperCase()] ?? chars[ch.toLowerCase()] ?? '', dp: false, colon: false });
    }
  }
  const digits = options.digits !== undefined && Number.isFinite(options.digits) && options.digits >= 1 ? Math.floor(options.digits) : 0;
  if (digits) {
    if (cells.length > digits) {
      cells = options.numeric
        ? Array.from({ length: digits }, () => ({ char: '-', segments: chars['-'] ?? '', dp: false, colon: false }))
        : cells.slice(0, digits);
    }
    while (cells.length < digits) cells.unshift({ char: ' ', segments: '', dp: false, colon: false });
  } else if (!cells.length) {
    cells.push({ char: ' ', segments: '', dp: false, colon: false });
  }
  return cells;
}

/** Substitutes `{token}` placeholders and returns exactly `rows` lines of exactly `columns` characters. Self-contained. */
export function formatCharacterLcdLines(lines: readonly string[], rows: number, columns: number, tokens: Record<string, string>): string[] {
  const height = Math.max(0, Math.floor(rows)), width = Math.max(0, Math.floor(columns));
  const result: string[] = [];
  for (let row = 0; row < height; row++) {
    const text = String(lines[row] ?? '').replace(/\{(\w+)\}/g, (_match, key: string) => (Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key]) : ''));
    result.push(text.slice(0, width).padEnd(width, ' '));
  }
  return result;
}

export const HMI_RENDER_LIB = { glyphs: HMI_GLYPHS, layoutSegmentCells, formatCharacterLcdLines };
export type HmiRenderLib = typeof HMI_RENDER_LIB;

export const isHmiIconId = (value: unknown): value is HmiIconId => typeof value === 'string' && (HMI_ICON_IDS as readonly string[]).includes(value);
