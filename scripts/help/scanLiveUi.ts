import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function scanUiSource(source:string, text:string) {
  const file=ts.createSourceFile(source,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const items: {source:string;line:number;tag:string;signature:string;handlers:Record<string,string>;feature?:string;topic?:string;dynamicTopic?:string}[]=[];
  const visit=(node:ts.Node)=>{
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const handlers:Record<string,string>={};
      let feature:string|undefined,topic:string|undefined,dynamicTopic:string|undefined;
      for(const attr of node.attributes.properties) if(ts.isJsxAttribute(attr)) {
        const name=attr.name.getText(file),value=attr.initializer;
        if(/^on[A-Z]/.test(name)&&value) handlers[name]=value.getText(file);
        if(name==='data-help-feature'&&value&&ts.isStringLiteral(value)) feature=value.text;
        if(name==='data-help-topic'&&value) {
          if(ts.isStringLiteral(value)) topic=value.text; else dynamicTopic=value.getText(file);
        }
      }
      if(Object.keys(handlers).length) {
        const tag=node.tagName.getText(file);
        const signature=tag+'|'+Object.entries(handlers).sort().map(([key,value])=>key+':'+value.replace(/\s+/g,'')).join('|');
        items.push({source,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,tag,signature,handlers,feature,topic,dynamicTopic});
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file);return items;
}
export function scanLiveUi(root='src') {
  const files:string[]=[];
  const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})) {
    const path=dir+'/'+entry.name;
    if(entry.isDirectory()) walk(path);
    else if(/\.tsx$/.test(path)&&!/(?:\.test\.|\.spec\.|\/__tests__\/)/.test(path)) files.push(path);
  }};
  walk(root);
  const items=files.sort().flatMap(source=>scanUiSource(source,readFileSync(source,'utf8')));
  const fingerprint=createHash('sha256').update(JSON.stringify(items.map(({source,signature,feature,topic,dynamicTopic})=>({source,signature,feature,topic,dynamicTopic})))).digest('hex');
  return {files:files.length,fingerprint,items};
}
