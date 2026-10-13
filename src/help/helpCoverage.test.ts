import { describe, expect, it } from 'vitest';
import { validateHelpCoverage } from './helpCoverage';
import { findHelpFeature, getHelpFeatures } from './helpFeatures';
import { HELP_DATA } from '../HelpData';
import { readFileSync } from 'node:fs';
import { scanLiveUi, scanUiSource } from '../../scripts/help/scanLiveUi';
import { classifyUiControl } from './uiCoverage';
import { pairReplies } from '../engine/sysml/interaction';

const feature = { id: 'test:save', label: 'Save', topicId: 'project-files', sectionId: 'save', sourcePath: 'src/App.tsx', kind: 'action' as const };
const topics = { 'project-files': { title: 'Projects', content: 'Save the active project to a file.', sections: [{ id: 'save', title: 'Save', body: 'Choose Save to write the active project.' }] } };
describe('help coverage validation', () => {
  it('requires fresh live UI evidence and detects a new unmapped inline control', () => {
    const report=JSON.parse(readFileSync('docs/help/2026-10-06-live-ui-reconciliation.json','utf8'));
    expect(scanLiveUi().fingerprint).toBe(report.fingerprint);
    expect(report.items.some((item:{status:string})=>item.status==='unreviewed')).toBe(false);
    const [newControl]=scanUiSource('src/new-component.tsx','export const New = () => <button onClick={() => performNewAction()}>New action</button>;');
    expect(classifyUiControl(newControl,new Set(),new Set()).status).toBe('unreviewed');
    expect(classifyUiControl({...newControl,feature:'missing:feature'},new Set(),new Set()).status).toBe('unreviewed');
  }, 20_000); // Parses all production TSX files, including on slower Windows hosts.
  it('resolves every live registered feature and every reviewed UI destination', () => {
    expect(validateHelpCoverage(getHelpFeatures(),HELP_DATA)).toMatchObject({valid:true,missing:0,coverage:100});
    const report=JSON.parse(readFileSync('docs/help/2026-10-06-ui-reconciliation.json','utf8'));
    const ids=new Set(getHelpFeatures().map(feature=>feature.id));
    for(const record of report.items) {
      expect(['mapped','documented','excluded','obsolete']).toContain(record.status);
      if(record.status==='mapped'||record.status==='documented') {
        expect(record.featureIds.length).toBeGreaterThan(0);
        for(const id of record.featureIds) expect(ids.has(id),record.candidateId+' → '+id).toBe(true);
      } else expect(record.reason.length).toBeGreaterThan(20);
    }
  });
  it('checks every diagram endpoint and the direction of instructional examples', () => {
    for(const topic of Object.values(HELP_DATA)) for(const section of topic.sections??[]) if(section.diagram) {
      const diagram=section.diagram,ids=new Set(diagram.nodes.map(node=>node.id));
      expect(ids.size).toBe(diagram.nodes.length);
      for(const edge of diagram.edges) {expect(ids.has(edge.from)).toBe(true);expect(ids.has(edge.to)).toBe(true);}
    }
    const seq=HELP_DATA['sequence-diagrams'].sections!.find(section=>section.id==='example')!.diagram!;
    expect(seq.edges.map(edge=>edge.notation)).toEqual(['call','call','call','reply','reply','reply']);
    const advanced=HELP_DATA['sequence-diagrams'].sections!.find(section=>section.id==='guarded-example')!.diagram!;
    const pairing=pairReplies({messages:advanced.edges.map((edge,i)=>({id:`m${i}`,name:edge.label??'',order:i,sourceLifelineId:edge.from,targetLifelineId:edge.to,sort:edge.notation==='call'?'synchCall':edge.notation==='async'?'asynchSignal':'reply'}))});
    expect(pairing.orphanReplyIds).toEqual([]);
    expect(pairing.callOf.size).toBe(5);
    for(const fragment of advanced.fragments??[]) {
      expect(fragment.startEdge).toBeGreaterThanOrEqual(0);
      expect(fragment.endEdge).toBeLessThan(advanced.edges.length);
      for(const operand of fragment.operands) {expect(operand.guard).toBeTruthy();expect(operand.startEdge).toBeGreaterThanOrEqual(fragment.startEdge);expect(operand.endEdge).toBeLessThanOrEqual(fragment.endEdge);}
    }
    const uc=HELP_DATA['use-case-diagrams'].sections!.find(section=>section.id==='example')!.diagram!;
    expect(uc.edges.find(edge=>edge.label==='«include»')).toMatchObject({from:'checkout',to:'validate'});
    expect(uc.edges.find(edge=>edge.label?.includes('«extend»'))).toMatchObject({from:'coupon',to:'checkout'});
    const cycle=HELP_DATA['state-machine-execution'].sections!.find(section=>section.id==='cycle')!.diagram!;
    expect(cycle.edges.some(edge=>edge.from==='outer'&&edge.to==='commit')).toBe(true);
    expect(cycle.edges.some(edge=>edge.from==='children'&&edge.to==='commit')).toBe(false);
  });
  it('counts only resolvable instructional destinations', () => {
    expect(validateHelpCoverage([feature], topics)).toMatchObject({ total: 1, documented: 1, missing: 0, coverage: 100 });
  });
  it('detects a missing topic introduced by a new registry item', () => {
    const report = validateHelpCoverage([feature, { ...feature, id: 'new:item', topicId: 'new:item' }], topics);
    expect(report.missingTopics).toContain('new:item');
    expect(report.documented).toBe(1);
  });
  it('does not count a block with declared instructional gaps as complete', () => {
    expect(validateHelpCoverage([{ ...feature, documentationGaps: ['worked example'] }], topics).insufficientContent).toContain('test:save');
  });
  it('detects a missing section', () => {
    expect(validateHelpCoverage([{ ...feature, sectionId: 'unknown' }], topics).missingSections).toContain('test:save');
  });
  it('detects duplicate stable feature ids', () => {
    expect(validateHelpCoverage([feature, feature], topics).duplicateFeatureIds).toContain('test:save');
  });
  it('rejects generic getting-started fallbacks and empty instructional sections', () => {
    expect(validateHelpCoverage([{ ...feature, topicId: 'getting-started', sectionId: undefined }], { 'getting-started': topics['project-files'] }).documented).toBe(0);
    expect(validateHelpCoverage([feature], { 'project-files': { ...topics['project-files'], sections: [{ id: 'save', title: 'Save', body: '' }] } }).documented).toBe(0);
  });
  it('keeps IDs unique and derives inspector properties including UseCase', () => {
    const features = getHelpFeatures();
    expect(new Set(features.map(f => f.id)).size).toBe(features.length);
    expect(features.some(f => f.id === 'sysml:element:UseCase')).toBe(true);
    expect(features.some(f => f.id === 'sysml:property:Port:direction')).toBe(true);
  });
  it('uses exact scoped labels and never guesses from substrings', () => {
    expect(findHelpFeature({ label: 'Direction', module: 'sysml' })?.label).toBe('Direction');
    expect(findHelpFeature({ label: 'direc', module: 'sysml' })).toBeUndefined();
    expect(findHelpFeature({ label: 'Direction', module: 'vlab' })).toBeUndefined();
  });
});
