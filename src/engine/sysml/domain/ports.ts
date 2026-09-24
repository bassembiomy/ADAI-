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
  /** Required for legacy FlowPort representations. */
  flowSpecificationId?: string;
  /** SysML v1 legacy atomic/non-atomic FlowPort distinction. */
  isAtomicFlowPort?: boolean;
  /** Resolved semantic nesting path, root-to-leaf, for nested ports. */
  nestedPortPathIds?: string[];
}
