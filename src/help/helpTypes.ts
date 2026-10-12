export interface HelpDiagram {
  kind: 'flow' | 'sequence' | 'usecase' | 'blocks';
  nodes: { id: string; label: string; role?: 'actor' | 'usecase'; x?: number; y?: number }[];
  edges: { from: string; to: string; label?: string; notation?: 'call' | 'reply' | 'async' | 'association' | 'dependency' | 'generalization' | 'conserving' }[];
  fragments?: { operator: string; startEdge: number; endEdge: number; operands: { guard: string; startEdge: number; endEdge: number }[] }[];
  subject?: string;
  caption?: string;
}
export interface HelpSection {
  id?: string;
  title: string;
  body: string;
  code?: string;
  list?: string[];
  diagram?: HelpDiagram;
  sources?: string[];
  table?: { columns: string[]; rows: string[][] };
}
export interface HelpTopic {
  title: string;
  category: string;
  description: string;
  content: string;
  image?: string;
  sections?: HelpSection[];
  related?: string[];
  sources?: string[];
}
