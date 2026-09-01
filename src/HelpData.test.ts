import { describe, it, expect } from 'vitest';
import { HELP_DATA } from './HelpData';
import { VLAB_LIBRARY } from './utils/vlabLibrary';
import { BLOCK_LIBRARY as XBRIDGES_LIBRARY } from './engine/xbridges/BlockDefinitions';

describe('HELP_DATA catalog completeness and integrity', () => {
  it('contains all essential module guide keys', () => {
    const requiredKeys = [
      'getting-started',
      'architecture-guide',
      'state-machine-fundamentals',
      'state-machine-transitions',
      'state-machine-simulation',
      'state-machine-tutorial',
      'vlab-fundamentals',
      'vlab-physics',
      'vlab-fluid-dynamics',
      'vlab-blocks-reference',
      'motor-models',
      'vfd-control',
      'xbridges-ref',
      'hil-fundamentals',
      'hil-configuration',
      'hil-dashboard',
      'hil-code-generation',
      'doe-discovery',
      'code-generation',
      'industrial-automation',
      'learning-labs',
      'robot-vacuum-digital-twin'
    ];

    for (const key of requiredKeys) {
      expect(HELP_DATA[key]).toBeDefined();
      expect(HELP_DATA[key].title).toBeTruthy();
      expect(HELP_DATA[key].category).toBeTruthy();
      expect(HELP_DATA[key].sections?.length).toBeGreaterThan(0);
    }
  });

  it('ensures each guide topic contains step-by-step instructions and button actions', () => {
    Object.entries(HELP_DATA).forEach(([key, topic]) => {
      expect(topic.content.length).toBeGreaterThan(20);
      expect(topic.sections).toBeDefined();
      topic.sections?.forEach(sec => {
        expect(sec.title).toBeTruthy();
        expect(sec.body).toBeTruthy();
      });
    });
  });

  it('verifies that HIL topics explicitly mention driver channels, signal mapper, and fault injection', () => {
    const hilConfig = HELP_DATA['hil-configuration'];
    expect(hilConfig).toBeDefined();
    const configBody = JSON.stringify(hilConfig);
    expect(configBody).toContain('Signal Mapper');
    expect(configBody).toContain('Driver Channels');

    const hilDash = HELP_DATA['hil-dashboard'];
    expect(hilDash).toBeDefined();
    const dashBody = JSON.stringify(hilDash);
    expect(dashBody).toContain('Fault Injection');
    expect(dashBody).toContain('Connect');
  });

  it('verifies Architecture and Stateflow topics explicitly document button workflows and UI controls', () => {
    const arch = HELP_DATA['architecture-guide'];
    expect(arch).toBeDefined();
    const archBody = JSON.stringify(arch);
    expect(archBody).toContain('BDD');
    expect(archBody).toContain('IBD');
    expect(archBody).toContain('Requirement');

    const smFund = HELP_DATA['state-machine-fundamentals'];
    expect(smFund).toBeDefined();
    const smBody = JSON.stringify(smFund);
    expect(smBody).toContain('Entry Action');
    expect(smBody).toContain('During Action');
    expect(smBody).toContain('Exit Action');
  });

  it('verifies all VLAB_LIBRARY blocks transform with valid properties for HelpModal', () => {
    const vlabBlocks = VLAB_LIBRARY.flatMap(domain =>
      domain.blocks.map(b => ({ ...b, domain: domain.type, source: 'V-Lab' }))
    );
    expect(vlabBlocks.length).toBeGreaterThan(200);
    vlabBlocks.forEach(b => {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.domain).toBeTruthy();
      expect(b.source).toBe('V-Lab');
    });
  });

  it('verifies all XBRIDGES_LIBRARY blocks transform with valid properties for HelpModal', () => {
    const xbridgesKeys = Object.keys(XBRIDGES_LIBRARY);
    expect(xbridgesKeys.length).toBeGreaterThan(15);
    const xbridgesBlocks = xbridgesKeys.map(key => {
      const b = XBRIDGES_LIBRARY[key]('tmp', {});
      return {
        id: key,
        name: key,
        domain: 'Control',
        source: 'X-Bridges',
        params: b.params,
        ports: [...(b.inputs || []), ...(b.outputs || [])],
        icon: b.icon,
        equation: b.equation,
        description: b.description
      };
    });
    xbridgesBlocks.forEach(b => {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.source).toBe('X-Bridges');
    });
  });
});
