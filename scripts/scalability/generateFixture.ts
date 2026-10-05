import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  generateScalabilityFixture,
  type ScalabilityTopology,
  type ScalabilityFixtureResult,
} from '../../src/engine/sysml/largeModelGenerator';
import { validateSysmlRepository } from '../../src/engine/sysml/validation';
import {
  createSysmlGatewayState,
  buildCanonicalSysmlProjectPayload,
} from '../../src/services/sysmlCommandGateway';

export interface GenerateFixtureOptions {
  count: number;
  seed?: number;
  topology?: ScalabilityTopology;
  outPath?: string;
  asAdiaProject?: boolean;
}

export function generateAndSaveFixture(options: GenerateFixtureOptions): ScalabilityFixtureResult {
  const {
    count,
    seed = 42,
    topology = 'distributed',
    outPath,
    asAdiaProject = true,
  } = options;

  console.log(`[generateFixture] Generating ${count.toLocaleString()} elements (topology: ${topology}, seed: ${seed})...`);
  const start = performance.now();
  const fixture = generateScalabilityFixture({
    semanticCount: count,
    seed,
    topology,
  });
  const genMs = performance.now() - start;
  console.log(`[generateFixture] Generated in ${genMs.toFixed(2)}ms. Validating repository...`);

  const valStart = performance.now();
  const validation = validateSysmlRepository(fixture.repository);
  const valMs = performance.now() - valStart;

  const errors = validation.diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    console.error(`[generateFixture] Validation FAILED with ${errors.length} errors:`, errors.slice(0, 5));
    throw new Error(`Fixture validation failed with ${errors.length} errors`);
  }
  console.log(`[generateFixture] Validation PASSED in ${valMs.toFixed(2)}ms.`);

  if (outPath) {
    const fullPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(fullPath), { recursive: true });

    let content: string;
    if (asAdiaProject) {
      const gatewayState = createSysmlGatewayState(
        fixture.repository,
        fixture.coordinates,
        fixture.diagramPresentations
      );
      const payload = buildCanonicalSysmlProjectPayload(gatewayState, {
        version: '1.0',
        projectName: `Scalability-${count}`,
        diagramWorkspace: {
          tabs: [
            { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
            { kind: 'sysmlDiagram', diagramId: 'diagram-stress' },
          ],
          activeTab: { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
        },
        stateMachine: fixture.stateMachine,
      });
      content = JSON.stringify(payload, null, 2);
    } else {
      content = JSON.stringify(fixture, null, 2);
    }

    writeFileSync(fullPath, content, 'utf8');
    console.log(`[generateFixture] Saved to ${fullPath} (${(Buffer.byteLength(content) / 1024 / 1024).toFixed(2)} MB)`);
  }

  return fixture;
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('generateFixture.ts')) {
  const args = process.argv.slice(2);
  const countArg = args.find(a => a.startsWith('--count='));
  const seedArg = args.find(a => a.startsWith('--seed='));
  const topologyArg = args.find(a => a.startsWith('--topology='));
  const outArg = args.find(a => a.startsWith('--out='));

  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 1000;
  const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : 42;
  const topology = (topologyArg ? topologyArg.split('=')[1] : 'distributed') as ScalabilityTopology;
  const outPath = outArg ? outArg.split('=')[1] : undefined;

  try {
    generateAndSaveFixture({ count, seed, topology, outPath });
  } catch (err) {
    console.error('[generateFixture] Error:', err);
    process.exit(1);
  }
}
