import { describe, expect, it } from 'vitest';
import { HELP_DATA } from '../HelpData';
import { DIAGRAM_REFERENCES } from './referenceTopics';

const section = (topic: string, id: string) => HELP_DATA[topic]?.sections?.find(entry => entry.id === id);

describe('cross-workspace modeling and state execution guide', () => {
  it('teaches design intent, explicit handoffs and evidence without collapsing workspaces', () => {
    expect(section('modeling-philosophy', 'model-to-evidence')?.diagram?.edges.length).toBeGreaterThan(5);
    const boundaries = section('modeling-philosophy', 'handoffs')!;
    const text = `${boundaries.body} ${boundaries.table?.rows.flat().join(' ')}`;
    for (const domain of ['SysML', 'OPM', 'State Machine', 'X-Bridges', 'V-Lab', 'HMI', 'HIL']) expect(text).toContain(domain);
    expect(text).toMatch(/not automatic|separate|distinct/i);
    expect(section('modeling-philosophy', 'worked-project')?.list?.length).toBeGreaterThanOrEqual(5);
    for (const chapterId of Object.keys(DIAGRAM_REFERENCES)) expect(HELP_DATA[chapterId]?.related).toContain('modeling-philosophy');
  });
  it('separates semantic model, simulation, codegen and hardware evidence for every diagram', () => {
    const matrix = section('execution-boundaries', 'matrix')?.table;
    expect(matrix?.rows.length).toBeGreaterThanOrEqual(Object.keys(DIAGRAM_REFERENCES).length);
    expect(matrix?.columns).toEqual(['View or workspace', 'Model intent', 'Runtime/simulation', 'Generated code / deployment']);
    expect(matrix?.rows.find(row => row[0].includes('V-Lab'))?.[3]).toMatch(/not.*State Machine|not.*embedded/i);
    expect(matrix?.rows.find(row => row[0].includes('State Machine'))?.[3]).toMatch(/conditional|supported/i);
  });
  it('explains ascending priority, two transition phases, embedded graph order and separate C I/O', () => {
    const execution = HELP_DATA['state-machine-execution'];
    const priorities = section('state-machine-execution', 'priority')!;
    const rendered = `${priorities.body} ${priorities.table?.rows.flat().join(' ')}`;
    expect(rendered).toMatch(/ascending.*priority/i);
    expect(rendered).toMatch(/ID/i);
    expect(rendered).toMatch(/outer.*during.*inner.*child/i);
    expect(rendered).toMatch(/first.*enabled/i);
    const embedded = section('state-machine-execution', 'embedded')!;
    expect(`${embedded.body} ${embedded.table?.rows.flat().join(' ')}`).toMatch(/topolog|solver.*divide|substep/i);
    const generated = section('state-machine-execution', 'generated-c')!;
    expect(generated.body).toContain('SM_ReadInputs');
    expect(generated.body).toContain('SM_Step');
    expect(generated.body).toContain('SM_WriteOutputs');
    expect(generated.code).toMatch(/SM_ReadInputs[\s\S]+SM_Step[\s\S]+SM_WriteOutputs/);
    expect(generated.code).toContain('observed_delta_ms');
    expect(generated.body).toMatch(/observed elapsed.*SM_TICK_MS.*logical/i);
    expect(execution.related).toContain('code-generation');
  });
});
