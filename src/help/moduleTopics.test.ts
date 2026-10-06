import { describe, expect, it } from 'vitest';
import { ADDITIONAL_HELP_TOPICS, HELP_TOPIC_CORRECTIONS } from './moduleTopics';
import { existsSync } from 'node:fs';
import { MESSAGE_SORTS, FRAGMENT_OPERATORS } from '../engine/sysml/interaction';

describe('source verified Help chapters', () => {
  it('provides actionable chapters with stable section IDs and source references', () => {
    for (const id of ['sequence-diagrams', 'use-case-diagrams', 'model-browser', 'activity-diagrams', 'parametric-diagrams', 'package-diagrams', 'ai-assistant', 'project-files', 'settings-guide', 'reports-guide']) {
      const topic = ADDITIONAL_HELP_TOPICS[id];
      expect(topic, id).toBeDefined();
      expect(topic.sections!.length).toBeGreaterThanOrEqual(3);
      expect(new Set(topic.sections!.map(s => s.id)).size).toBe(topic.sections!.length);
      expect(topic.sections!.every(s => s.body.length > 80 && s.sources?.length)).toBe(true);
    }
  });
  it('covers every implemented message sort and fragment operator without claiming simulation', () => {
    const text = JSON.stringify(ADDITIONAL_HELP_TOPICS['sequence-diagrams']);
    for (const value of [...MESSAGE_SORTS, ...FRAGMENT_OPERATORS, 'User', 'Controller', 'Service', 'Repository']) expect(text).toContain(value);
    expect(text).toContain('not an execution engine');
    expect(text).toContain('derived');
  });
  it('keeps authored source references resolvable in the application', () => {
    for (const topic of Object.values({...ADDITIONAL_HELP_TOPICS, ...HELP_TOPIC_CORRECTIONS})) {
      for (const section of topic.sections ?? []) {
        for (const source of section.sources ?? []) expect(existsSync(source), `${topic.title}: ${source}`).toBe(true);
      }
    }
  });
  it('corrects misleading repository and code-generation claims', () => {
    const text = JSON.stringify(HELP_TOPIC_CORRECTIONS);
    expect(text).toContain('outside the SysML repository');
    expect(text).toContain('does not certify MISRA');
    expect(text).toContain('not automatically converted');
  });
  it('explains state execution ordering and generated API with an integration example', () => {
    const runtime = JSON.stringify(ADDITIONAL_HELP_TOPICS['state-machine-execution']);
    for (const word of ['OR','AND','priority','external-self','internal-action','autostart','TIMING','Reset']) expect(runtime).toContain(word);
    const codegen = JSON.stringify(HELP_TOPIC_CORRECTIONS['code-generation']);
    for (const word of ['SM_Init','SM_Step','SM_ReadInputs','SM_WriteOutputs','ADIA_Instance_t']) expect(codegen).toContain(word);
  });
  it('keeps every authored diagram structurally navigable', () => {
    const diagrams = Object.values({...ADDITIONAL_HELP_TOPICS, ...HELP_TOPIC_CORRECTIONS}).flatMap(t => t.sections ?? []).flatMap(s => s.diagram ? [s.diagram] : []);
    expect(diagrams.length).toBeGreaterThanOrEqual(4);
    for (const diagram of diagrams) {
      const ids = new Set(diagram.nodes.map(n => n.id));
      expect(ids.size).toBe(diagram.nodes.length);
      for (const edge of diagram.edges) { expect(ids.has(edge.from)).toBe(true); expect(ids.has(edge.to)).toBe(true); }
    }
  });
  it('provides a detailed State Machine execution order diagram and lifecycle stage breakdown', () => {
    const topic = ADDITIONAL_HELP_TOPICS['state-machine-execution'];
    const section = topic.sections?.find(s => s.id === 'execution-order' || s.id === 'cycle');
    expect(section).toBeDefined();
    expect(section?.diagram).toBeDefined();
    expect(section?.diagram?.kind).toBe('flow');
    const labels = section!.diagram!.nodes.map(n => n.label);
    expect(labels.some(l => l.includes('Validate Tick') || l.includes('Validate tick'))).toBe(true);
    expect(labels.some(l => l.includes('Active State Timers') || l.includes('Increment active timers'))).toBe(true);
    expect(labels.some(l => l.includes('Outer Transition'))).toBe(true);
    expect(labels.some(l => l.includes('During Action'))).toBe(true);
    expect(labels.some(l => l.includes('Embedded X-Bridges') || l.includes('embedded X-Bridges'))).toBe(true);
    expect(labels.some(l => l.includes('Inner Transition') || l.includes('Inner transition'))).toBe(true);
    expect(labels.some(l => l.includes('Child Layers') || l.includes('Child layers'))).toBe(true);
    expect(section!.body).toContain('Exit Action');
    expect(section!.body).toContain('Entry Action');
    expect(section!.body).toContain('least common ancestor');
  });
  it('provides a complete Use Case item/symbol catalog and error causes reference', () => {
    const topic = ADDITIONAL_HELP_TOPICS['use-case-diagrams'];
    const symbols = topic.sections?.find(s => s.id === 'symbols');
    expect(symbols).toBeDefined();
    for (const item of ['Actor', 'Subject', 'Use Case', 'Association', '«include»', '«extend»', 'Generalization', 'extension point']) {
      expect(symbols!.body).toContain(item);
    }
    const errors = topic.sections?.find(s => s.id === 'errors');
    expect(errors).toBeDefined();
    for (const code of ['DUPLICATE_RELATIONSHIP', 'INVALID_ENDPOINT_KIND', 'INVALID_DIRECTION', 'MISSING_EXTENSION_POINT', 'GENERALIZATION_CYCLE', 'INCLUDE_CYCLE']) {
      expect(errors!.body).toContain(code);
    }
  });
});
