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

const VALID_PORT_POSITIONS = new Set(['left', 'right', 'top', 'bottom']);
const VALID_PORT_DOMAINS = new Set([
  'Electrical',
  'Fluid',
  'Physical',
  'Rotational',
  'Thermal',
  'Translational',
]);
const ZERO_PORT_BLOCKS = new Set(['gas_properties', 'ma_properties', 'subsystem', 'doe_custom']);

const collectPortIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];
  const assembler = new DAEAssembler();

  for (const { domain, block } of inventory) {
    const portIds = new Set<string>();
    if (block.ports.length === 0 && !ZERO_PORT_BLOCKS.has(block.id)) {
      issues.push(issue(domain, block.id, 'ports', 'unexpected zero-port block'));
    }

    for (const port of block.ports) {
      if (!port.id.trim()) issues.push(issue(domain, block.id, 'ports', 'empty port ID'));
      if (portIds.has(port.id)) issues.push(issue(domain, block.id, 'ports', `duplicate port ID "${port.id}"`));
      if (!VALID_PORT_POSITIONS.has(port.pos)) issues.push(issue(domain, block.id, 'ports', `invalid position "${port.pos}"`));
      if (port.label !== undefined && !port.label.trim()) issues.push(issue(domain, block.id, 'ports', `port "${port.id}" has an empty label`));
      if (port.domain !== undefined && !VALID_PORT_DOMAINS.has(port.domain)) {
        issues.push(issue(domain, block.id, 'ports', `port "${port.id}" has unknown domain "${port.domain}"`));
      }
      portIds.add(port.id);
    }

    const node: Node = {
      id: `cert-${block.id}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { type: block.id, params: block.params, ports: block.ports, domain },
    } as Node;

    try {
      const system = assembler.assemble([node], []);
      if (!Number.isInteger(system.systemSize) || system.systemSize < 0) {
        issues.push(issue(domain, block.id, 'ports', `invalid assembled system size ${system.systemSize}`));
      }
      if (system.variableNames.length !== system.systemSize) {
        issues.push(issue(domain, block.id, 'ports', 'variable-name count does not match system size'));
      }
      if (system.isDifferentialState.length !== system.systemSize) {
        issues.push(issue(domain, block.id, 'ports', 'differential-state mask does not match system size'));
      }
    } catch (error) {
      issues.push(issue(domain, block.id, 'ports', `assembly threw: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  return issues;
};

describe('V-Lab full certification', () => {
  it('certifies the complete live catalog in both directions', () => {
    const issues = collectCatalogIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });

  it('certifies every declared port and its DAE assembly contract', () => {
    const issues = collectPortIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
});

