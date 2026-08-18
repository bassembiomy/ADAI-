import { ActionCapability, RiskClass, RollbackLevel, SideEffectClass } from './types';

export class CapabilityRegistry {
  private capabilities: Map<string, ActionCapability> = new Map();

  private makeKey(actionType: string, schemaVersion: string): string {
    return `${actionType}@${schemaVersion}`;
  }

  public register(capability: ActionCapability): void {
    if (capability.riskClass === RiskClass.HARDWARE_ACTUATION && capability.rollbackLevel === RollbackLevel.INVERSE_ACTION) {
      throw new Error('Hardware actuation cannot have rollback level INVERSE_ACTION (physical effects are irreversible).');
    }
    if (capability.sideEffectClass === SideEffectClass.PHYSICAL_HARDWARE && !capability.requiresCommitBarrier) {
      throw new Error('Hardware side-effect capabilities must require a commit barrier.');
    }
    if (capability.riskClass === RiskClass.READ_ONLY && capability.resourceAccess.writeSets.length > 0) {
      throw new Error('Read-only capabilities cannot declare writeSets.');
    }

    const key = this.makeKey(capability.actionType, capability.schemaVersion);
    if (this.capabilities.has(key)) {
      throw new Error(`Capability ${key} is already registered.`);
    }
    this.capabilities.set(key, capability);
  }

  public get(actionType: string, schemaVersion: string = '1.0.0'): ActionCapability | undefined {
    return this.capabilities.get(this.makeKey(actionType, schemaVersion));
  }

  public getAll(): ActionCapability[] {
    return Array.from(this.capabilities.values());
  }

  public filterByModules(activeModules: string[]): ActionCapability[] {
    const set = new Set(activeModules);
    return this.getAll().filter(c => set.has(c.module));
  }
}
