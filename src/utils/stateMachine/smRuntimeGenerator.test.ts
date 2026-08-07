import { describe, expect, it } from 'vitest';
import { renderRuntimeFiles } from './smRuntimeGenerator';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

describe('smRuntimeGenerator', () => {
  it('generates runtime, config, version, and manifest files with explicit SM_Error_t and SM_STATIC_ASSERT', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const files = renderRuntimeFiles(ir!);
    
    const configHeader = files.find(f => f.name === 'generated/sm_config.h');
    const versionHeader = files.find(f => f.name === 'generated/sm_version.h');
    const runtimeHeader = files.find(f => f.name === 'runtime/sm_runtime.h');
    const manifest = files.find(f => f.name === 'generated/manifest.json');

    expect(configHeader?.content).toContain('#define SM_ENABLE_TRACE');
    expect(configHeader?.content).toContain('#define SM_XB_ABS_EPSILON');
    expect(configHeader?.content).toContain('#define SM_XB_REL_EPSILON');
    expect(configHeader?.content).toContain('SM_STATIC_ASSERT(sizeof(float) == 4U');
    expect(versionHeader?.content).toContain('#define SM_GENERATOR_VERSION "3.1"');
    expect(runtimeHeader?.content).toContain('SM_ERR_NULL_POINTER');
    expect(runtimeHeader?.content).toContain('SM_ERR_NUMERIC_FAULT');
    expect(runtimeHeader?.content).toContain('SM_ERR_INVALID_STATE');
    expect(manifest?.content).toContain('"generator": "ADIA"');
  });
});
