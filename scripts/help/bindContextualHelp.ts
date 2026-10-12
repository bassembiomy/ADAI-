import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { UI_HELP_FEATURES } from '../../src/help/uiFeatureTopics';

const snapshot = JSON.parse(readFileSync('docs/help/audit/2026-10-06-ui-candidates.json','utf8'));
const review = JSON.parse(readFileSync('docs/help/audit/ui-controls-reconciliation.json','utf8'));
const records = new Map(review.items.map((item: any)=>[item.candidateId,item]));
const normalize = (text: string)=>text.replace(/\s+/g,'');
const signature = (tag: string, handlers: Record<string,string>)=>tag+'|'+Object.entries(handlers).sort().map(([key,value])=>key+':'+normalize(value)).join('|');
const results: any[] = [];
for (const source of [...new Set<string>(UI_HELP_FEATURES.map(feature=>feature.sourcePath))]) {
  const original = readFileSync(source,'utf8');
  const file = ts.createSourceFile(source,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const matches = new Map<string,Set<string>>();
  for (const candidate of snapshot.items.filter((item:any)=>item.source===source)) {
    const reviewed: any = records.get(candidate.candidateId);
    if (reviewed?.status !== 'mapped') continue;
    const key=signature(candidate.tag,candidate.handlers);
    const ids=matches.get(key)??new Set<string>();
    for (const id of reviewed.featureIds) ids.add(id);
    matches.set(key,ids);
  }
  const edits: {position:number;text:string}[]=[];
  let bound=0;
  function visit(node: ts.Node) {
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const handlers:Record<string,string>={};
      for (const attr of node.attributes.properties) if(ts.isJsxAttribute(attr)&&/^on[A-Z]/.test(attr.name.getText(file))&&attr.initializer) handlers[attr.name.getText(file)]=attr.initializer.getText(file);
      const ids=matches.get(signature(node.tagName.getText(file),handlers));
      if(ids?.size===1) {
        bound++;
        const already=node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&['data-help-feature','data-help-topic'].includes(attr.name.getText(file)));
        if(!already) edits.push({position:node.tagName.end,text:` data-help-feature="${[...ids][0]}" data-help-source="${source}"`});
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(file);
  let updated=original;
  for(const edit of edits.sort((a,b)=>b.position-a.position)) updated=updated.slice(0,edit.position)+edit.text+updated.slice(edit.position);
  if(updated!==original) writeFileSync(source,updated);
  results.push({source,bound,added:edits.length});
}
writeFileSync('docs/help/audit/contextual-bindings.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({files:results.length,bound:results.reduce((n,r)=>n+r.bound,0),added:results.reduce((n,r)=>n+r.added,0)}));
