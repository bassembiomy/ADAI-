import seedConcepts from '../../../../../resources/engineering-knowledge/verified_concepts.json';
import type {
  ConceptRepository,
  ConceptFilter,
  FactRepository,
  FactFilter,
  RelationshipRepository,
  RelationshipFilter
} from './contentAddressedStore';
import { EngineeringConceptSchema, type EngineeringConcept, type EngineeringFact } from '../contracts/engineeringKnowledge';
import type { ConceptRelationship } from '../contracts/conceptGraph';

/** Browser-safe knowledge repositories used by the renderer process. */
export class InMemoryConceptStore implements ConceptRepository {
  private readonly records: Map<string, EngineeringConcept>;

  constructor(seed: unknown = seedConcepts) {
    const parsed = EngineeringConceptSchema.array().safeParse(seed);
    if (!parsed.success) {
      throw new Error(`Invalid bundled seed concept data: ${parsed.error.message}`);
    }
    this.records = new Map(parsed.data.map(concept => [concept.id, concept]));
  }

  async init(): Promise<void> {}
  async has(id: string): Promise<boolean> { return this.records.has(id); }
  async get(id: string): Promise<EngineeringConcept> {
    const record = this.records.get(id);
    if (!record) throw new Error(`CONCEPT_NOT_FOUND: Concept '${id}' does not exist.`);
    return record;
  }
  async put(concept: EngineeringConcept): Promise<EngineeringConcept> {
    this.records.set(concept.id, concept);
    return concept;
  }
  async list(filter?: ConceptFilter): Promise<EngineeringConcept[]> {
    return [...this.records.values()]
      .filter(record => !filter?.domain || record.domain === filter.domain)
      .filter(record => !filter?.lifecycle || record.lifecycle === filter.lifecycle)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class InMemoryFactStore implements FactRepository {
  private readonly records = new Map<string, EngineeringFact>();
  async init(): Promise<void> {}
  async has(id: string): Promise<boolean> { return this.records.has(id); }
  async get(id: string): Promise<EngineeringFact> {
    const record = this.records.get(id);
    if (!record) throw new Error(`FACT_NOT_FOUND: Fact '${id}' does not exist.`);
    return record;
  }
  async put(fact: EngineeringFact): Promise<EngineeringFact> { this.records.set(fact.id, fact); return fact; }
  async list(filter?: FactFilter): Promise<EngineeringFact[]> {
    return [...this.records.values()]
      .filter(record => !filter?.subjectConceptId || record.subjectConceptId === filter.subjectConceptId)
      .filter(record => filter?.verified === undefined || record.verified === filter.verified)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class InMemoryRelationshipStore implements RelationshipRepository {
  private readonly records = new Map<string, ConceptRelationship>();
  async init(): Promise<void> {}
  async has(id: string): Promise<boolean> { return this.records.has(id); }
  async get(id: string): Promise<ConceptRelationship> {
    const record = this.records.get(id);
    if (!record) throw new Error(`RELATIONSHIP_NOT_FOUND: Relationship '${id}' does not exist.`);
    return record;
  }
  async put(rel: ConceptRelationship): Promise<ConceptRelationship> { this.records.set(rel.id, rel); return rel; }
  async list(filter?: RelationshipFilter): Promise<ConceptRelationship[]> {
    return [...this.records.values()]
      .filter(record => !filter?.sourceConceptId || record.sourceConceptId === filter.sourceConceptId)
      .filter(record => !filter?.targetConceptId || record.targetConceptId === filter.targetConceptId)
      .filter(record => !filter?.relationType || record.relationType === filter.relationType)
      .filter(record => filter?.verified === undefined || record.verified === filter.verified)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
