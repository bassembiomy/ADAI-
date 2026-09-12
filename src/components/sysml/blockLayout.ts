import type { BlockData } from '../../types/sysml_types';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';

export interface BlockDisplayBounds {
  width: number;
  height: number;
}

/**
 * Computes a safe minimum SVG frame for a legacy SysML block. The renderer
 * uses fixed-size text rows, so the frame must grow with the longest visible
 * row and with the number of rows that can be rendered.
 */
export function computeBlockDisplayBounds(block: BlockData): BlockDisplayBounds {
  const propertyLines = block.properties.slice(0, 3).map(property =>
    `${formatLegacyProperty(property)}${property.defaultValue ? ` = ${property.defaultValue}` : ''}`,
  );
  const classLines = (block.classes ?? []).slice(0, 3);
  const operationLines = block.operations.slice(0, 2);
  const constraintLines = (block.constraints ?? []).slice(0, 2).map(constraint => `{${constraint}}`);
  const visibleLines = [
    block.name,
    block.isAbstract ? `«${block.stereotype}, abstract»` : `«${block.stereotype}»`,
    ...propertyLines,
    ...classLines,
    ...operationLines,
    ...constraintLines,
  ];
  const longestLine = visibleLines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(block.width || 150, Math.ceil(longestLine * 6.2 + 20));

  const propertyRows = Math.max(propertyLines.length, classLines.length);
  const contentRows = Math.max(propertyRows, operationLines.length, constraintLines.length, 1);
  const heightFromContent = 45 + contentRows * 12 + (classLines.length > 0 ? 7 : 0) +
    (operationLines.length > 0 ? 25 : 0) + (constraintLines.length > 0 ? 25 : 0);
  const heightFromPorts = 35 + block.ports.length * 15;
  return { width, height: Math.max(block.height || 100, heightFromContent, heightFromPorts) };
}
