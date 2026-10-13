import {
  EngineeringPattern,
  EngineeringPatternSchema,
  computePatternContentHash
} from './patternSchemas';

export interface RuntimePatternBridge {
  patternStoreList(filter?: { lifecycle?: string; domain?: string }): Promise<unknown[]>;
}

function defaultBridge(): RuntimePatternBridge | undefined {
  const root = globalThis as typeof globalThis & {
    window?: { electronAPI?: RuntimePatternBridge };
  };
  return root.window?.electronAPI;
}

export async function loadVerifiedRuntimePatterns(
  bridge: RuntimePatternBridge | undefined = defaultBridge()
): Promise<EngineeringPattern[]> {
  if (!bridge?.patternStoreList) return [];

  const records = await bridge.patternStoreList({ lifecycle: 'verified' });
  return records.map((record) => {
    const pattern = EngineeringPatternSchema.parse(record);
    if (!pattern.provenance.licenseApproved || pattern.lifecycle !== 'verified') {
      throw new Error(`PATTERN_NOT_EXECUTABLE: Pattern '${pattern.id}' is not licensed and verified.`);
    }
    const { id: _id, contentHash, ...payload } = pattern;
    const actualHash = computePatternContentHash(payload);
    if (actualHash !== contentHash) {
      throw new Error(
        `PATTERN_CHECKSUM_MISMATCH: Pattern '${pattern.id}' expected '${contentHash}' but computed '${actualHash}'.`
      );
    }
    return pattern;
  });
}
