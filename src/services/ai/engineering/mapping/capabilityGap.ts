export type CapabilityGapType =
  | 'BLOCK_CAPABILITY_GAP'
  | 'PORT_CAPABILITY_GAP'
  | 'PARAMETER_CAPABILITY_GAP';

export interface CapabilityGap {
  type: CapabilityGapType;
  conceptId: string;
  componentId: string;
  description: string;
  candidateBlockIds?: string[];
}
