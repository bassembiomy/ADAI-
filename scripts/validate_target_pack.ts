import { resolvePacks } from '../src/engine/targetPacks/packResolver.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateTargetPackManifest } from '../src/engine/targetPacks/targetPackSchema.js';

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/validate_target_pack.ts <path-to-pack-or-search-dir>');
    process.exit(1);
  }

  const normalized = resolve(inputPath);
  let packs = await resolvePacks(normalized);

  // If the path itself contains a manifest.json, validate it as a single pack.
  if (packs.length === 0) {
    try {
      const raw = await readFile(resolve(normalized, 'manifest.json'), 'utf8');
      const parsed = JSON.parse(raw);
      const result = validateTargetPackManifest(parsed);
      if (result.success) {
        packs = [{ manifest: result.manifest, packPath: normalized, manifestPath: resolve(normalized, 'manifest.json') }];
      } else {
        console.error('Validation failed:');
        for (const err of result.errors) {
          console.error(`  ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }
    } catch {
      // Fall through to the "no valid packs" error below.
    }
  }

  if (packs.length === 0) {
    console.error('No valid target packs found.');
    process.exit(1);
  }

  for (const pack of packs) {
    console.log(`VALID: ${pack.manifest.targetId} @ ${pack.packPath}`);
  }
  console.log(`${packs.length} pack(s) validated.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
