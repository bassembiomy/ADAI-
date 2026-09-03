import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock } from '../../utils/vlabLibrary';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations, type BlockEquationArgs } from './vlabEquations';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_VALIDATION_CONTRACTS } from './vlabValidationContracts';

interface CatalogEntry {
  domain: string;
  block: VLabBlock;
}

interface CertificationIssue {
  domain: string;
  blockId: string;
  phase: 'catalog' | 'ports' | 'equation' | 'reference' | 'connected';
  message: string;
}

const inventory: CatalogEntry[] = VLAB_LIBRARY.flatMap((domain) =>
  domain.blocks.map((block) => ({ domain: domain.type, block })),
);

const COMPATIBILITY_FACTORY_ALIASES = new Set([
  'Subsystem',
  'Inport',
  'Outport',
  'heat_sensor',
  'vfd_controller',
]);

const issue = (
  domain: string,
  blockId: string,
  phase: CertificationIssue['phase'],
  message: string,
): CertificationIssue => ({ domain, blockId, phase, message });

const formatIssues = (issues: CertificationIssue[]): string =>
  issues.length === 0
    ? 'No certification issues.'
    : `V-Lab certification found ${issues.length} issue(s):\n${issues
        .map((item) => `- ${item.domain}/${item.blockId} [${item.phase}]: ${item.message}`)
        .join('\n')}`;

const isValidParameterValue = (value: number | string): boolean =>
  typeof value === 'number' ? Number.isFinite(value) : value.trim().length > 0;

const collectCatalogIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];
  const domainNames = new Set<string>();
  const blockIds = new Set<string>();

  for (const domain of VLAB_LIBRARY) {
    if (!domain.type.trim()) issues.push(issue('(empty)', '(domain)', 'catalog', 'domain name is empty'));
    if (domainNames.has(domain.type)) issues.push(issue(domain.type, '(domain)', 'catalog', 'duplicate domain name'));
    if (domain.blocks.length === 0) issues.push(issue(domain.type, '(domain)', 'catalog', 'domain contains no blocks'));
    domainNames.add(domain.type);

    for (const block of domain.blocks) {
      if (!block.id.trim()) issues.push(issue(domain.type, '(empty)', 'catalog', 'block ID is empty'));
      if (blockIds.has(block.id)) issues.push(issue(domain.type, block.id, 'catalog', 'duplicate global block ID'));
      blockIds.add(block.id);

      for (const [field, value] of Object.entries({
        name: block.name,
        icon: block.icon,
        color: block.color,
        equation: block.equation,
        description: block.description,
      })) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          issues.push(issue(domain.type, block.id, 'catalog', `${field} is empty`));
        }
      }

      if (!blockEquations[block.id]) issues.push(issue(domain.type, block.id, 'catalog', 'equation factory is missing'));
      if (!VLAB_VALIDATION_CONTRACTS[block.id]) issues.push(issue(domain.type, block.id, 'catalog', 'validation contract is missing'));

      for (const [name, parameter] of Object.entries(block.params)) {
        if (!parameter.label.trim()) issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} has no label`));
        if (typeof parameter.unit !== 'string') issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} unit is not a string`));
        if (!isValidParameterValue(parameter.value)) issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} has an invalid value`));
      }
    }
  }

  for (const factoryId of Object.keys(blockEquations)) {
    if (!blockIds.has(factoryId) && !COMPATIBILITY_FACTORY_ALIASES.has(factoryId)) {
      issues.push(issue('(registry)', factoryId, 'catalog', 'orphan equation factory'));
    }
  }

  for (const contractId of Object.keys(VLAB_VALIDATION_CONTRACTS)) {
    if (!blockIds.has(contractId)) issues.push(issue('(registry)', contractId, 'catalog', 'orphan validation contract'));
  }

  return issues;
};

describe('V-Lab full certification', () => {
  it('certifies the complete live catalog in both directions', () => {
    const issues = collectCatalogIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
});
