import type { Multiplicity, SemanticElement } from './base';

export type PortKind = 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort';

export interface Port extends SemanticElement {
  metaclass: 'Port';
  portKind: PortKind;
  typeId: string;
  direction: 'in' | 'out' | 'inout';
  isConjugated: boolean;
  multiplicity: Multiplicity;
  isBehavior?: boolean;
  isService?: boolean;
  providedInterfaceIds?: string[];
  requiredInterfaceIds?: string[];
}
