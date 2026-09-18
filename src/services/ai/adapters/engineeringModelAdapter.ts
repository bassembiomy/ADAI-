import { EngineeringDomain, LogicalBlock, LogicalConnection, ParameterIntent, EngineeringModelPlan } from '../contracts/engineeringModel';
import { Diagnostic } from '../contracts/diagnostics';
import { AdiaBlockCatalog, CatalogBlock } from '../../../agent/adiaBlockCatalog';

export interface StoredBlock {
  id: string;
  blockDefinitionId: string;
  domain: EngineeringDomain;
  name: string;
  parameters: Record<string, unknown>;
}

export interface StoredConnection {
  id: string;
  fromBlockId: string;
  fromPortId: string;
  toBlockId: string;
  toPortId: string;
  domain: EngineeringDomain;
}

export interface EngineeringModelSnapshot {
  blocks: Array<[string, StoredBlock]>;
  connections: Array<[string, StoredConnection]>;
}

export class EngineeringModelAdapter {
  public readonly targetDomain: EngineeringDomain;
  private blocks = new Map<string, StoredBlock>();
  private connections = new Map<string, StoredConnection>();
  private catalog: typeof AdiaBlockCatalog;

  constructor(targetDomain: EngineeringDomain = 'xbridges', catalog = AdiaBlockCatalog) {
    this.targetDomain = targetDomain;
    this.catalog = catalog;
  }

  public getBlock(id: string): StoredBlock | undefined {
    const block = this.blocks.get(id);
    return block ? structuredClone(block) : undefined;
  }

  public getConnection(id: string): StoredConnection | undefined {
    const conn = this.connections.get(id);
    return conn ? structuredClone(conn) : undefined;
  }

  public getAllBlocks(): StoredBlock[] {
    return Array.from(this.blocks.values()).map(b => structuredClone(b));
  }

  public getAllConnections(): StoredConnection[] {
    return Array.from(this.connections.values()).map(c => structuredClone(c));
  }

  public getStateHash(): string {
    const sortedBlocks = Array.from(this.blocks.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const sortedConns = Array.from(this.connections.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const stateStr = JSON.stringify({ blocks: sortedBlocks, conns: sortedConns });

    let hash = 0;
    for (let i = 0; i < stateStr.length; i++) {
      hash = ((hash << 5) - hash) + stateStr.charCodeAt(i);
      hash |= 0;
    }
    return `em_hash_${hash}`;
  }

  public createSnapshot(): EngineeringModelSnapshot {
    return {
      blocks: Array.from(this.blocks.entries()).map(([k, v]) => [k, structuredClone(v)]),
      connections: Array.from(this.connections.entries()).map(([k, v]) => [k, structuredClone(v)])
    };
  }

  public async restoreSnapshot(snapshot: EngineeringModelSnapshot): Promise<void> {
    this.blocks = new Map(snapshot.blocks.map(([k, v]) => [k, structuredClone(v)]));
    this.connections = new Map(snapshot.connections.map(([k, v]) => [k, structuredClone(v)]));
  }

  // --- Narrow Transactional Operations ---

  public async addBlock(block: LogicalBlock): Promise<{ success: boolean; error?: string }> {
    if (this.blocks.has(block.id)) {
      return { success: false, error: `Block with ID '${block.id}' already exists.` };
    }

    const def = this.catalog.findById(block.blockDefinitionId);
    if (!def) {
      return { success: false, error: `Unknown block definition ID '${block.blockDefinitionId}' in catalog.` };
    }

    const paramsRecord: Record<string, unknown> = {};
    for (const p of block.parameters) {
      paramsRecord[p.parameterName] = p.value;
    }

    this.blocks.set(block.id, {
      id: block.id,
      blockDefinitionId: block.blockDefinitionId,
      domain: block.domain,
      name: block.name,
      parameters: paramsRecord
    });

    return { success: true };
  }

  public async removeBlock(blockId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.blocks.has(blockId)) {
      return { success: false, error: `Block '${blockId}' does not exist.` };
    }

    // Remove associated connections
    for (const [connId, conn] of this.connections.entries()) {
      if (conn.fromBlockId === blockId || conn.toBlockId === blockId) {
        this.connections.delete(connId);
      }
    }

    this.blocks.delete(blockId);
    return { success: true };
  }

  public async setParameter(blockId: string, parameterName: string, value: unknown): Promise<{ success: boolean; error?: string }> {
    const block = this.blocks.get(blockId);
    if (!block) {
      return { success: false, error: `Block '${blockId}' does not exist.` };
    }

    const def = this.catalog.findById(block.blockDefinitionId);
    if (def && def.parameters && Object.keys(def.parameters).length > 0) {
      if (!(parameterName in def.parameters)) {
        return { success: false, error: `Parameter '${parameterName}' is not valid for block definition '${block.blockDefinitionId}'.` };
      }
    }

    block.parameters[parameterName] = value;
    return { success: true };
  }

  public async connectPorts(conn: LogicalConnection): Promise<{ success: boolean; error?: string }> {
    if (this.connections.has(conn.id)) {
      return { success: false, error: `Connection '${conn.id}' already exists.` };
    }

    const fromBlock = this.blocks.get(conn.fromBlockId);
    const toBlock = this.blocks.get(conn.toBlockId);
    if (!fromBlock || !toBlock) {
      return { success: false, error: `Connection endpoint block not found: from='${conn.fromBlockId}', to='${conn.toBlockId}'.` };
    }

    const fromDef = this.catalog.findById(fromBlock.blockDefinitionId);
    const toDef = this.catalog.findById(toBlock.blockDefinitionId);

    if (fromDef && fromDef.ports.length > 0) {
      const portExists = fromDef.ports.some(p => p.id === conn.fromPortId);
      if (!portExists) {
        return { success: false, error: `Source port '${conn.fromPortId}' not found on block definition '${fromDef.id}'.` };
      }
    }

    if (toDef && toDef.ports.length > 0) {
      const portExists = toDef.ports.some(p => p.id === conn.toPortId);
      if (!portExists) {
        return { success: false, error: `Target port '${conn.toPortId}' not found on block definition '${toDef.id}'.` };
      }
    }

    this.connections.set(conn.id, {
      id: conn.id,
      fromBlockId: conn.fromBlockId,
      fromPortId: conn.fromPortId,
      toBlockId: conn.toBlockId,
      toPortId: conn.toPortId,
      domain: conn.domain
    });

    return { success: true };
  }

  public async disconnectPorts(connId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.connections.has(connId)) {
      return { success: false, error: `Connection '${connId}' does not exist.` };
    }
    this.connections.delete(connId);
    return { success: true };
  }

  // --- Verification ---
  public verifyBlockExists(blockId: string, expectedDefinitionId?: string): boolean {
    const b = this.blocks.get(blockId);
    if (!b) return false;
    if (expectedDefinitionId && b.blockDefinitionId !== expectedDefinitionId) return false;
    return true;
  }

  public verifyConnectionExists(connId: string): boolean {
    return this.connections.has(connId);
  }
}
