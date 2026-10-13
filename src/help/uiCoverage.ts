export interface UiControlCandidate {
  source:string; signature:string; feature?:string; topic?:string; dynamicTopic?:string;
}
export function classifyUiControl(item:UiControlCandidate, features:ReadonlySet<string>, topics:ReadonlySet<string>, reviewed?:{status:string;featureIds:string[];reason:string}) {
  if(item.feature) return features.has(item.feature)
    ? {status:'documented',featureIds:[item.feature],reason:'Direct stable feature binding resolves to a live instructional destination.'}
    : {status:'unreviewed',featureIds:[],reason:'Direct feature binding does not resolve to a registered feature.'};
  if(item.topic) return topics.has(item.topic)
    ? {status:'documented',featureIds:[],reason:'Direct topic binding resolves to an authored destination.'}
    : {status:'unreviewed',featureIds:[],reason:'Direct topic binding does not resolve to an authored destination.'};
  if(item.dynamicTopic&&/`(?:vlab|xbridges):\$\{data.type\}`/.test(item.dynamicTopic)) return {status:'documented',featureIds:[],reason:'Dynamic component type resolves through the complete qualified catalog; catalog equality is tested.'};
  if(item.dynamicTopic&&/`hmi-component-\$\{comp.type\}`/.test(item.dynamicTopic)) return {status:'documented',featureIds:[],reason:'Dynamic HMI widget type resolves through the shared catalog; all catalog Help topics are tested.'};
  if(reviewed) return reviewed;
  return {status:'unreviewed',featureIds:[],reason:'New or changed handler has no direct reviewed binding or matching reviewed source signature.'};
}
