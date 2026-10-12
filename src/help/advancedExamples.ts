import type { HelpDiagram, HelpTopic } from './helpTypes';
const messages: [string,string,string,NonNullable<HelpDiagram['edges'][number]['notation']>][] = [
  ['User','Controller','submit()','call'],
  ['Controller','Controller','checkSession()','call'],
  ['Controller','Controller','sessionOK','reply'],
  ['Controller','Service','validate()','call'],
  ['Service','Controller','validationResult','reply'],
  ['Controller','Service','persist()','call'],
  ['Service','Repository','save()','call'],
  ['Repository','Service','saved','reply'],
  ['Service','Controller','persisted','reply'],
  ['Controller','User','validationFailed notification','async'],
  ['Controller','User','result','reply'],
];
export function attachAdvancedExamples(topics: Record<string,HelpTopic>): void {
  const sequence=topics['sequence-diagrams'];
  if(sequence && !sequence.sections?.some(section=>section.id==='guarded-example')) sequence.sections!.push({
    id:'guarded-example',title:'Self call and guarded alternatives',
    body:'Add the ordered messages shown below. Give each synchronous call its matching reverse-direction reply, including the self call. Put persist/save and their replies in the alt [valid] operand, and the asynchronous validationFailed notification in [invalid]. The final result reply is outside the alt and answers submit once. This keeps the stored reply pairing unambiguous. Alternatives describe scenario choices; this workspace does not execute them. Define appropriate operation signatures and the notification Signal.',
    code:messages.map(([from,to,label,notation],i)=>`${i+1}. ${from} → ${to}: ${label} [${notation==='call'?'synchCall':notation==='async'?'asynchSignal':notation}]`).join('\n'),
    sources:['src/engine/sysml/interaction.ts','src/components/sysml/SequenceWorkspace.tsx'],
    diagram:{kind:'sequence',nodes:['User','Controller','Service','Repository'].map(label=>({id:label,label})),edges:messages.map(([from,to,label,notation])=>({from,to,label,notation})),fragments:[{operator:'alt',startEdge:5,endEdge:9,operands:[{guard:'valid',startEdge:5,endEdge:8},{guard:'invalid',startEdge:9,endEdge:9}]}],caption:'Self call/reply, validation, guarded alternatives and one final result reply.'},
  });
  const usecase=topics['use-case-diagrams'];
  if(usecase && !usecase.sections?.some(section=>section.id==='specialization')) usecase.sections!.push({
    id:'specialization',title:'Actor specialization',
    body:'Add Premium Customer as a specialized Actor and draw Generalization toward Customer. The hollow triangle points to the general role. Keep Actor generalization within the Actor family and avoid cycles. Associate Customer with Checkout. Specialization expresses role inheritance; include and extend relate Use Cases instead.',
    sources:['src/engine/sysml/useCases.ts','src/features/sysml/useCaseDiagramView.ts'],
    diagram:{kind:'usecase',subject:'Shop',nodes:[{id:'customer',label:'Customer',role:'actor',x:80,y:100},{id:'premium',label:'Premium Customer',role:'actor',x:80,y:310},{id:'checkout',label:'Checkout',role:'usecase',x:360,y:100}],edges:[{from:'premium',to:'customer',notation:'generalization'},{from:'customer',to:'checkout',notation:'association'}],caption:'Premium Customer specializes Customer. The general Actor and specialized Actor are outside the Shop subject.'},
  });
}
