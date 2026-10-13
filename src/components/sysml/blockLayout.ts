import type { BlockData } from '../../types/sysml_types';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';
import { formatAllocationCompartment } from '../../engine/sysml/allocation';

export interface BlockDisplayBounds {
  width: number;
  height: number;
}

/** Text lines of the «allocatedFrom» / «allocatedTo» compartments; empty when the block has no allocations. */
export function allocationCompartmentLines(block: Pick<BlockData, 'allocatedFrom' | 'allocatedTo'>): string[] {
  return [
    ...formatAllocationCompartment('allocatedFrom', block.allocatedFrom ?? []),
    ...formatAllocationCompartment('allocatedTo', block.allocatedTo ?? []),
  ];
}

/** Vertical space the allocation compartments occupy at the bottom of the block (0 when empty). */
export function allocationCompartmentHeight(block: Pick<BlockData, 'allocatedFrom' | 'allocatedTo'>): number {
  const lines = allocationCompartmentLines(block).length;
  return lines === 0 ? 0 : 8 + lines * 12;
}

const MAX_COMPARTMENT_LINE = 44;
const clip = (text: string): string => {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > MAX_COMPARTMENT_LINE ? `${single.slice(0, MAX_COMPARTMENT_LINE - 1)}…` : single;
};

/**
 * Text lines of a Viewpoint's compartments (SysML 1.6 §7.3.2.2): purpose,
 * stakeholders and concerns. Each section is drawn only when it has content;
 * a header line starts with « so the renderer can italicise it.
 */
export function viewpointCompartmentLines(
  block: Pick<BlockData, 'stereotype' | 'viewpointPurpose' | 'viewpointStakeholders' | 'viewpointConcerns'>,
): string[] {
  if (block.stereotype !== 'viewpoint') return [];  const lines: string[] = [];
  if (block.viewpointPurpose?.trim()) lines.push('«purpose»', clip(block.viewpointPurpose));
  const stakeholders = block.viewpointStakeholders ?? [];
  if (stakeholders.length > 0) lines.push('«stakeholders»', ...stakeholders.slice(0, 4).map(clip), ...(stakeholders.length > 4 ? [`… +${stakeholders.length - 4} more`] : []));
  const concerns = block.viewpointConcerns ?? [];
  if (concerns.length > 0) lines.push('«concerns»', ...concerns.slice(0, 4).map(clip), ...(concerns.length > 4 ? [`… +${concerns.length - 4} more`] : []));
  return lines;
}

type CompartmentSource = Pick<BlockData, 'stereotype' | 'allocatedFrom' | 'allocatedTo' | 'viewpointPurpose' | 'viewpointStakeholders' | 'viewpointConcerns'>;

/** Every text line of the bottom compartments (allocation, then Viewpoint). */
export function blockCompartmentLines(block: CompartmentSource): string[] {
  return [...allocationCompartmentLines(block), ...viewpointCompartmentLines(block)];
}

/** Vertical space all bottom compartments occupy (0 when empty). */
export function blockCompartmentHeight(block: CompartmentSource): number {
  const lines = blockCompartmentLines(block).length;
  return lines === 0 ? 0 : 8 + lines * 12;
}

/**
 * Computes a safe minimum SVG frame for a legacy SysML block. The renderer
 * uses fixed-size text rows, so the frame must grow with the longest visible
 * row and with the number of rows that can be rendered.
 */
export function computeBlockDisplayBounds(block: BlockData): BlockDisplayBounds {
  const propertyLines = block.properties.map(property =>
    `${formatLegacyProperty(property)}${property.defaultValue ? ` = ${property.defaultValue}` : ''}`,
  );
  const classLines = block.classes ?? [];
  const operationLines = block.operations.slice(0, 2);
  const constraintLines = (block.constraints ?? []).slice(0, 2).map(constraint => `{${constraint}}`);
  const visibleLines = [
    block.isAbstract ? `${block.name} {abstract}` : block.name,
    `«${block.stereotype}»`,
    ...propertyLines,
    ...classLines,
    ...operationLines,
    ...constraintLines,
    ...blockCompartmentLines(block),
  ];
  const longestLine = visibleLines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(block.width || 150, Math.ceil(longestLine * 6.2 + 20));

  const ownedFeatureRows = Math.max(1, propertyLines.length + classLines.length);
  const heightFromContent = 45 + ownedFeatureRows * 12 + 10 + (classLines.length > 0 ? 7 : 0) +
    (operationLines.length > 0 ? 25 : 0) + (constraintLines.length > 0 ? 25 : 0) + blockCompartmentHeight(block);
  const heightFromPorts = 35 + block.ports.length * 15;
  return { width, height: Math.max(block.height || 100, heightFromContent, heightFromPorts) };
}
