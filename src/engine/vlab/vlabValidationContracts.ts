import { VLabDomain, VLabBlock, VLAB_LIBRARY } from '../../utils/vlabLibrary';

export type VLabValidationClass =
  | 'algebraic'
  | 'dynamic'
  | 'nonlinear'
  | 'sensor'
  | 'controller'
  | 'coupling';

export interface VLabValidationTolerances {
  abs: number;
  rel: number;
  maxResidualNorm: number;
  conservationRel: number;
  convergenceOrderMin?: number;
}

export interface VLabValidationContract {
  blockId: string;
  domain: string;
  equationReference: string;
  acrossVariable: { name: string; unit: string };
  throughVariable: { name: string; unit: string };
  validationClass: VLabValidationClass;
  nominalParameters: Record<string, number>;
  boundaryParameters: Record<string, number>[];
  tolerances: VLabValidationTolerances;
  oracle?: (t: number, params: Record<string, number>, inputs?: Record<string, number>) => Record<string, number>;
}

const DEFAULT_TOLERANCES: VLabValidationTolerances = {
  abs: 1e-4,
  rel: 1e-3,
  maxResidualNorm: 1e-4,
  conservationRel: 1e-3,
  convergenceOrderMin: 0.5,
};

const domainVariables: Record<string, { across: { name: string; unit: string }; through: { name: string; unit: string } }> = {
  Electrical: { across: { name: 'Voltage', unit: 'V' }, through: { name: 'Current', unit: 'A' } },
  Gas: { across: { name: 'Pressure', unit: 'Pa' }, through: { name: 'MassFlow', unit: 'kg/s' } },
  Magnetic: { across: { name: 'MagnetomotiveForce', unit: 'A' }, through: { name: 'FluxRate', unit: 'Wb/s' } },
  Mechanical: { across: { name: 'Velocity', unit: 'm/s' }, through: { name: 'Force', unit: 'N' } },
  Fluid: { across: { name: 'Pressure', unit: 'Pa' }, through: { name: 'VolumetricFlow', unit: 'm3/s' } },
  Physical: { across: { name: 'Signal', unit: '1' }, through: { name: 'Flow', unit: '1' } },
  Thermal: { across: { name: 'Temperature', unit: 'K' }, through: { name: 'HeatFlow', unit: 'W' } },
  'Consumer Appliances': { across: { name: 'Temperature', unit: 'K' }, through: { name: 'Power', unit: 'W' } },
  'Microwave & Cooking': { across: { name: 'Temperature', unit: 'K' }, through: { name: 'Power', unit: 'W' } },
  Utilities: { across: { name: 'Signal', unit: '1' }, through: { name: 'Flow', unit: '1' } },
  'Fluid / Steam': { across: { name: 'Pressure', unit: 'Pa' }, through: { name: 'MassFlow', unit: 'kg/s' } },
  'DOE Models': { across: { name: 'State', unit: '1' }, through: { name: 'Rate', unit: '1' } },
};

/**
 * Build validation contracts for all 242 blocks in VLAB_LIBRARY.
 */
export const VLAB_VALIDATION_CONTRACTS: Record<string, VLabValidationContract> = {};

for (const domainObj of VLAB_LIBRARY) {
  const domainName = domainObj.type;
  const vars = domainVariables[domainName] ?? domainVariables.Electrical;

  for (const block of domainObj.blocks) {
    const params: Record<string, number> = {};
    if (block.params) {
      for (const [key, param] of Object.entries(block.params)) {
        params[key] = typeof param.value === 'number' ? param.value : 1.0;
      }
    }

    const isDynamic = block.id.includes('capacitor') || block.id.includes('inductor') || block.id.includes('mass') || block.id.includes('thermal_mass') || block.id.includes('tank');
    const isNonlinear = block.id.includes('diode') || block.id.includes('transistor') || block.id.includes('valve') || block.id.includes('friction');
    const isSensor = block.id.includes('sensor') || block.id.includes('meter') || block.id.includes('probe') || block.id.includes('scope');
    const isController = block.id.includes('pid') || block.id.includes('controller') || block.id.includes('relay');

    const validationClass: VLabValidationClass = isDynamic
      ? 'dynamic'
      : isNonlinear
      ? 'nonlinear'
      : isSensor
      ? 'sensor'
      : isController
      ? 'controller'
      : 'algebraic';

    VLAB_VALIDATION_CONTRACTS[block.id] = {
      blockId: block.id,
      domain: domainName,
      equationReference: block.equation || `${block.name} governing DAE equation`,
      acrossVariable: vars.across,
      throughVariable: vars.through,
      validationClass,
      nominalParameters: params,
      boundaryParameters: [
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v * 0.1])),
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v * 10.0])),
      ],
      tolerances: { ...DEFAULT_TOLERANCES },
    };
  }
}

export const getValidationContract = (blockId: string): VLabValidationContract | undefined => {
  return VLAB_VALIDATION_CONTRACTS[blockId];
};

export interface BidirectionalCoverageResult {
  isComplete: boolean;
  totalBlocks: number;
  totalContracts: number;
  missingContracts: string[];
  orphanContracts: string[];
  missingEquationFactories: string[];
}

export const assertBidirectionalCatalogCoverage = (
  library: VLabDomain[],
  equationFactories: Record<string, any>
): BidirectionalCoverageResult => {
  const allLibraryBlocks = library.flatMap((domain) => domain.blocks);
  const libraryBlockIds = new Set(allLibraryBlocks.map((b) => b.id));
  const contractBlockIds = new Set(Object.keys(VLAB_VALIDATION_CONTRACTS));
  const factoryBlockIds = new Set(Object.keys(equationFactories));

  const missingContracts = allLibraryBlocks
    .filter((b) => !contractBlockIds.has(b.id))
    .map((b) => b.id);

  const orphanContracts = [...contractBlockIds].filter((id) => !libraryBlockIds.has(id));

  const missingEquationFactories = allLibraryBlocks
    .filter((b) => !factoryBlockIds.has(b.id))
    .map((b) => b.id);

  const isComplete =
    missingContracts.length === 0 &&
    orphanContracts.length === 0 &&
    missingEquationFactories.length === 0;

  return {
    isComplete,
    totalBlocks: allLibraryBlocks.length,
    totalContracts: contractBlockIds.size,
    missingContracts,
    orphanContracts,
    missingEquationFactories,
  };
};
