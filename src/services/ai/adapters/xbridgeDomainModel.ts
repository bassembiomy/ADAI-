export interface DomainComponent {
  id: string;
  type: string;
  parameters: Record<string, any>;
}

export interface DomainConnection {
  id: string;
  sourceBlockId: string;
  sourcePortId: string;
  targetBlockId: string;
  targetPortId: string;
  domainType: string;
}

export interface XBridgeSnapshot {
  components: Array<[string, DomainComponent]>;
  connections: DomainConnection[];
}

export class XBridgeDomainModel {
  public components: Map<string, DomainComponent> = new Map();
  public connections: DomainConnection[] = [];

  public addComponent(comp: DomainComponent): void {
    if (this.components.has(comp.id)) throw new Error(`Component ${comp.id} already exists`);
    this.components.set(comp.id, structuredClone(comp));
  }

  public removeComponent(id: string): { removedComponent: DomainComponent | undefined; removedConnections: DomainConnection[] } {
    const comp = this.components.get(id);
    this.components.delete(id);
    const removedConns = this.connections.filter(c => c.sourceBlockId === id || c.targetBlockId === id);
    this.connections = this.connections.filter(c => c.sourceBlockId !== id && c.targetBlockId !== id);
    return { removedComponent: comp, removedConnections: removedConns };
  }

  public addConnection(conn: DomainConnection): void {
    if (this.connections.some(c => c.id === conn.id)) throw new Error(`Connection ${conn.id} already exists`);
    this.connections.push(structuredClone(conn));
  }

  public removeConnection(id: string): DomainConnection | undefined {
    const idx = this.connections.findIndex(c => c.id === id);
    if (idx !== -1) {
      return this.connections.splice(idx, 1)[0];
    }
    return undefined;
  }
}
