import { readFileSync, writeFileSync } from 'node:fs';
import { scanLiveUi } from './scanLiveUi';
import { HELP_DATA } from '../../src/HelpData';
import { getHelpFeatures } from '../../src/help/helpFeatures';
import { classifyUiControl } from '../../src/help/uiCoverage';

const snapshot=JSON.parse(readFileSync('docs/help/audit/2026-10-06-ui-candidates.json','utf8'));
const previous=JSON.parse(readFileSync('docs/help/2026-10-06-ui-reconciliation.json','utf8'));
const byId=new Map(previous.items.map((item:any)=>[item.candidateId,item]));
const signatures=new Map<string,any>();
for(const item of snapshot.items) {
  const signature=item.tag+'|'+Object.entries(item.handlers).sort().map(([key,value])=>key+':'+String(value).replace(/\s+/g,'')).join('|');
  signatures.set(item.source+'|'+signature,byId.get(item.candidateId));
}
const features=new Set(getHelpFeatures().map(feature=>feature.id));
const additional=JSON.parse(readFileSync('docs/help/audit/live-ui-additional-review.json','utf8'));
const additionalMap=new Map(additional.map((item:any)=>[item.source+'|'+item.signature,item]));
const live=scanLiveUi();
const items=live.items.map(item=>{
  const original:any=additionalMap.get(item.source+'|'+item.signature) ?? signatures.get(item.source+'|'+item.signature);
  return {...item,...classifyUiControl(item,features,new Set(Object.keys(HELP_DATA)),original)};
});
const counts=Object.fromEntries([...new Set(items.map(item=>item.status))].sort().map(status=>[status,items.filter(item=>item.status===status).length]));
writeFileSync('docs/help/2026-10-06-live-ui-reconciliation.json',JSON.stringify({...live,items,statusCounts:counts},null,2));
console.log(JSON.stringify({files:live.files,total:items.length,statusCounts:counts}));
if(items.some(item=>item.status==='unreviewed')) process.exitCode=1;
