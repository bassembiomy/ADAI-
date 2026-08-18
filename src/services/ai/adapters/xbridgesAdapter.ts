import { XBridgeDomainModel, XBridgeSnapshot } from './xbridgeDomainModel';
import { XBLOCK_REGISTRY } from './xbridgeBlockRegistry';
import { ExecutionContext, PreparedAction } from '../execution/types';
import { Diagnostic } from '../contracts/diagnostics';
import { DimensionalEngine } from '../validation/dimensionalEngine';

export class XBridgesModuleAdapter {
  public readonly moduleName = 'xbridges';

  constructor(private model: XBridgeDomainModel) {}

  public getStateHash(): string {
    const stateStr = JSON.stringify({
      comps: Array.from(this.model.components.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      conns: [...this.model.connections].sort((a, b) => a.id.localeCompare(b.id))
    });
    let hash = 0;
    for (let i = 0; i < stateStr.length; i++) {
      hash = ((hash << 5) - hash) + stateStr.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${hash}`;
  }

  public async restoreSnapshot(snapshot: XBridgeSnapshot): Promise<void> {
    this.model.components = new Map(snapshot.components.map(([k, v]) => [k, structuredClone(v)]));
    this.model.connections = structuredClone(snapshot.connections);
  }

  async validate(action: any, context: ExecutionContext): Promise<{ isValid: boolean; diagnostics: Diagnostic[] }> {
    if (action.type === 'XB_CREATE_BLOCK') {
      const { blockId, blockType, parameters } = action.payload;
      if (this.model.components.has(blockId)) {
        return { isValid: false, diagnostics: [{ code: 'DUPLICATE_BLOCK_ID', severity: 'ERROR', message: `Block '${blockId}' already exists.` }] };
      }
      const def = XBLOCK_REGISTRY[blockType];
      if (!def) {
        return { isValid: false, diagnostics: [{ code: 'UNKNOWN_BLOCK_TYPE', severity: 'ERROR', message: `Unknown block type: ${blockType}` }] };
      }
      if (parameters) {
        for (const [key, q] of Object.entries(parameters)) {
          const expectedDim = def.expectedParameters[key];
          if (expectedDim && q && typeof q === 'object' && 'unit' in q) {
            const compCheck = DimensionalEngine.validateCompatibility(q as any, expectedDim);
            if (!compCheck.isValid) return compCheck;
          }
        }
      }
    }

    if (action.type === 'XB_CONNECT_PORTS') {
      const { connectionId, sourceBlockId, sourcePortId, targetBlockId, targetPortId } = action.payload;
      if (this.model.connections.some(c => c.id === connectionId)) {
        return { isValid: false, diagnostics: [{ code: 'DUPLICATE_CONNECTION_ID', severity: 'ERROR', message: `Connection '${connectionId}' already exists.` }] };
      }
      const srcComp = this.model.components.get(sourceBlockId);
      const tgtComp = this.model.components.get(targetBlockId);
      if (!srcComp || !tgtComp) {
        return { isValid: false, diagnostics: [{ code: 'BLOCK_NOT_FOUND', severity: 'ERROR', message: 'Source or target block not found.' }] };
      }
      const srcDef = XBLOCK_REGISTRY[srcComp.type];
      const tgtDef = XBLOCK_REGISTRY[tgtComp.type];
      const srcPort = srcDef?.ports.find(p => p.id === sourcePortId);
      const tgtPort = tgtDef?.ports.find(p => p.id === targetPortId);

      if (!srcPort || !tgtPort) {
        return { isValid: false, diagnostics: [{ code: 'PORT_NOT_FOUND', severity: 'ERROR', message: 'Port not found.' }] };
      }

      if (srcPort.domain === 'SIGNAL_OUT' && tgtPort.domain === 'SIGNAL_IN') {
        const alreadyDriven = this.model.connections.some(c => c.targetBlockId === targetBlockId && c.targetPortId === targetPortId);
        if (alreadyDriven) {
          return { isValid: false, diagnostics: [{ code: 'SIGNAL_PORT_ALREADY_DRIVEN', severity: 'ERROR', message: `Signal input port '${targetPortId}' on block '${targetBlockId}' already has an active driver.` }] };
        }
      } else if (srcPort.domain === 'PHYSICAL_ELECTRICAL' && tgtPort.domain === 'PHYSICAL_ELECTRICAL') {
        // Conserving physical connection
      } else {
        return { isValid: false, diagnostics: [{ code: 'INCOMPATIBLE_PORT_DOMAINS', severity: 'ERROR', message: `Cannot connect ${srcPort.domain} to ${tgtPort.domain}.` }] };
      }
    }

    return { isValid: true, diagnostics: [] };
  }

  async prepare(action: any, context: ExecutionContext): Promise<PreparedAction<XBridgeSnapshot>> {
    const snapshot: XBridgeSnapshot = {
      components: Array.from(this.model.components.entries()).map(([k, v]) => [k, structuredClone(v)]),
      connections: structuredClone(this.model.connections)
    };
    return {
      snapshot,
      beforeStateHash: this.getStateHash()
    };
  }

  async execute(action: any, context: ExecutionContext): Promise<any> {
    if (action.type === 'XB_CREATE_BLOCK') {
      const { blockId, blockType, parameters } = action.payload;
      const comp = { id: blockId, type: blockType, parameters: parameters || {} };
      this.model.addComponent(comp);
      return { type: 'BLOCK_CREATED', id: blockId };
    }

    if (action.type === 'XB_CONNECT_PORTS') {
      const connId = action.payload.id || action.payload.connectionId;
      const conn = { ...action.payload, id: connId };
      this.model.addConnection(conn);
      return { type: 'CONNECTION_CREATED', id: connId };
    }

    throw new Error(`Unsupported action ${action.type}`);
  }

  async verify(action: any, result: any, context: ExecutionContext): Promise<{ isVerified: boolean; diagnostics: Diagnostic[] }> {
    if (action.type === 'XB_CREATE_BLOCK') {
      const comp = this.model.components.get(action.payload.blockId);
      if (!comp || comp.type !== action.payload.blockType) {
        return { isVerified: false, diagnostics: [{ code: 'BLOCK_NOT_VERIFIED', severity: 'ERROR', message: `Block ${action.payload.blockId} verification failed.` }] };
      }
    }
    if (action.type === 'XB_CONNECT_PORTS') {
      const connId = action.payload.id || action.payload.connectionId;
      const conn = this.model.connections.find(c => c.id === connId);
      if (!conn || conn.sourceBlockId !== action.payload.sourceBlockId || conn.targetBlockId !== action.payload.targetBlockId) {
        return { isVerified: false, diagnostics: [{ code: 'CONNECTION_NOT_VERIFIED', severity: 'ERROR', message: `Connection ${connId} verification failed.` }] };
      }
    }
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext, prepared: PreparedAction<XBridgeSnapshot>): Promise<void> {
    if (result?.type === 'BLOCK_CREATED') {
      this.model.removeComponent(result.id);
    } else if (result?.type === 'CONNECTION_CREATED') {
      this.model.removeConnection(result.id);
    } else if (prepared?.snapshot) {
      await this.restoreSnapshot(prepared.snapshot);
    }
  }
}
