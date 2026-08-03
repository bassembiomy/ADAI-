export interface HilWiringConfig {
  channelId: string;
  direction: 'In' | 'Out';
  pin: string;
  loadOhms?: number;
}

export interface HilFixtureManifest {
  fixtureId: string;
  revision: string;
  hash: `sha256:${string}`;
  wiring: HilWiringConfig[];
  sampleRateHz: number;
  timingToleranceMs: number;
}

export function validateHilFixture(value: unknown): { valid: true; manifest: HilFixtureManifest } | { valid: false; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Fixture manifest must be an object'] };
  }

  const obj = value as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.fixtureId !== 'string' || !obj.fixtureId) {
    errors.push('fixtureId must be a non-empty string');
  }
  if (typeof obj.revision !== 'string' || !obj.revision) {
    errors.push('revision must be a non-empty string');
  }
  if (typeof obj.hash !== 'string' || !obj.hash.startsWith('sha256:')) {
    errors.push('hash must start with sha256:');
  }
  if (!Array.isArray(obj.wiring)) {
    errors.push('wiring must be an array');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, manifest: value as HilFixtureManifest };
}
