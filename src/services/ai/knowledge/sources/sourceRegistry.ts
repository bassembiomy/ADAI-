import { KnowledgeSource, KnowledgeSourceSchema, KnowledgeSourceType, deriveSourceId } from './sourceSchemas';

export interface SourceListFilter {
  provider?: string;
  sourceType?: KnowledgeSourceType;
  enabled?: boolean;
}

export class SourceRegistry {
  private readonly sources = new Map<string, KnowledgeSource>();

  public seed(records: readonly KnowledgeSource[]): KnowledgeSource[] {
    for (const record of records) {
      const source = KnowledgeSourceSchema.parse(record);
      if (source.id !== deriveSourceId(source.url)) {
        throw new Error(`SOURCE_ID_MISMATCH: Source '${source.url}' has a non-deterministic ID.`);
      }
      const existing = this.sources.get(source.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(source)) {
        throw new Error(`SOURCE_CONFLICT: Source '${source.id}' already exists with different metadata.`);
      }
      this.sources.set(source.id, source);
    }
    return this.list();
  }

  public get(id: string): KnowledgeSource {
    const source = this.sources.get(id);
    if (!source) throw new Error(`SOURCE_NOT_FOUND: Source '${id}' does not exist.`);
    return { ...source, licensePolicy: { ...source.licensePolicy }, retrievalPolicy: { ...source.retrievalPolicy } };
  }

  public list(filter?: SourceListFilter): KnowledgeSource[] {
    return [...this.sources.values()]
      .filter(source => !filter?.provider || source.provider === filter.provider)
      .filter(source => !filter?.sourceType || source.sourceType === filter.sourceType)
      .filter(source => filter?.enabled === undefined || source.enabled === filter.enabled)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(source => this.get(source.id));
  }
}
