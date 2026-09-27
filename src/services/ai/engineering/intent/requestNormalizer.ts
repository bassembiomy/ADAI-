export interface AppliedCorrection {
  original: string;
  corrected: string;
  category: 'operation' | 'component' | 'observability' | 'unit' | 'general';
}

export interface NormalizationResult {
  originalText: string;
  normalizedText: string;
  tokens: string[];
  correctionsApplied: AppliedCorrection[];
}

const OPERATION_TYPOS: Record<string, string> = {
  creat: 'create',
  craete: 'create',
  crate: 'create',
  generat: 'generate',
  multiblying: 'multiplying',
  multibly: 'multiply',
  multipliing: 'multiplying',
  mutliply: 'multiply',
  multply: 'multiply',
  substract: 'subtract',
  subtrct: 'subtract',
  divde: 'divide',
  simulat: 'simulate',
  optimiz: 'optimize'
};

const COMPONENT_TYPOS: Record<string, string> = {
  cnstant: 'constant',
  contant: 'constant',
  costant: 'constant',
  integator: 'integrator',
  intergrator: 'integrator',
  invertr: 'inverter',
  invertor: 'inverter',
  senser: 'sensor',
  senosr: 'sensor',
  motorr: 'motor',
  controler: 'controller',
  trasfer: 'transfer'
};

const OBSERVABILITY_TYPOS: Record<string, string> = {
  scop: 'scope',
  sccope: 'scope',
  disply: 'display',
  dsplay: 'display',
  ploting: 'plotting'
};

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  hundred: '100'
};

const UNIT_SPELLINGS: Record<string, string> = {
  volts: 'V',
  volt: 'V',
  v: 'V',
  ohms: 'ohm',
  amperes: 'A',
  amps: 'A',
  amp: 'A',
  hertz: 'Hz',
  hz: 'Hz',
  watts: 'W',
  watt: 'W',
  seconds: 's',
  sec: 's',
  secs: 's',
  milliseconds: 'ms',
  radians: 'rad',
  degrees: 'deg'
};

export class RequestNormalizer {
  public normalize(input: string): NormalizationResult {
    const originalText = input;
    const correctionsApplied: AppliedCorrection[] = [];

    // Step 1: Whitespace cleanup
    let text = input.trim();

    // Step 2: Extract words / tokens while preserving punctuation spacing
    // Tokenize word by word or punctuation
    const words = text.split(/\s+/);
    const normalizedWords = words.map(rawWord => {
      // Separate leading/trailing punctuation if any
      const match = rawWord.match(/^([^\w]*)([\w.-]+)([^\w]*)$/);
      if (!match) return rawWord;

      const prefix = match[1];
      const core = match[2];
      const suffix = match[3];

      const lowerCore = core.toLowerCase();

      // 1. Check operation typos
      if (OPERATION_TYPOS[lowerCore]) {
        const corrected = OPERATION_TYPOS[lowerCore];
        correctionsApplied.push({
          original: core,
          corrected,
          category: 'operation'
        });
        return `${prefix}${corrected}${suffix}`;
      }

      // 2. Check component typos
      if (COMPONENT_TYPOS[lowerCore]) {
        const corrected = COMPONENT_TYPOS[lowerCore];
        correctionsApplied.push({
          original: core,
          corrected,
          category: 'component'
        });
        return `${prefix}${corrected}${suffix}`;
      }

      // 3. Check observability typos
      if (OBSERVABILITY_TYPOS[lowerCore]) {
        const corrected = OBSERVABILITY_TYPOS[lowerCore];
        correctionsApplied.push({
          original: core,
          corrected,
          category: 'observability'
        });
        return `${prefix}${corrected}${suffix}`;
      }

      // 4. Check number words
      if (NUMBER_WORDS[lowerCore]) {
        const corrected = NUMBER_WORDS[lowerCore];
        return `${prefix}${corrected}${suffix}`;
      }

      // 5. Check unit spellings
      if (UNIT_SPELLINGS[lowerCore]) {
        const corrected = UNIT_SPELLINGS[lowerCore];
        return `${prefix}${corrected}${suffix}`;
      }

      return rawWord;
    });

    let reconstructed = normalizedWords.join(' ');

    // Normalize spacing around commas, colons, and punctuation
    reconstructed = reconstructed
      .replace(/,\s*and\b/gi, ' and')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*;\s*/g, '; ')
      .replace(/[!?.]$/, '') // strip trailing sentence terminator
      .replace(/\s+/g, ' ')
      .trim();

    // Lowercase words unless they are recognized standard unit notations (like V, Hz, W, A)
    // or contain numeric units with prefixes (e.g. 1MHz, 1Mohm, 500mV, 10kHz)
    const UNIT_CAPITALS = new Set(['V', 'Hz', 'W', 'A', 'N']);
    reconstructed = reconstructed
      .split(' ')
      .map(w => {
        if (UNIT_CAPITALS.has(w)) return w;
        if (/^[+-]?\d+(?:\.\d+)?[pnuµmkKMGT]?(?:Hz|ohm|ohms|Ω|V|s|sec|F|H|A|W|%|rad\/s)$/i.test(w)) {
          return w;
        }
        return w.toLowerCase();
      })
      .join(' ');

    // Generate lowercase tokens for matching (stripping punctuation from tokens)
    const tokens = reconstructed
      .toLowerCase()
      .split(/[\s,;:!?-]+/)
      .filter(t => t.length > 0);

    return {
      originalText,
      normalizedText: reconstructed,
      tokens,
      correctionsApplied
    };
  }
}

export const requestNormalizer = new RequestNormalizer();

export function normalizeEngineeringRequest(text: string): NormalizationResult {
  return requestNormalizer.normalize(text);
}
