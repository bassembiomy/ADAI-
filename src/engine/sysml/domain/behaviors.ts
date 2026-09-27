import type { SemanticElement } from './base';

/**
 * Normative SysML v1.6 / UML UseCase classifier (SysML Clause 16.3.2.6).
 * Represents a discrete unit of system behavior interacting with external actors/subjects.
 */
export interface UseCase extends SemanticElement {
  metaclass: 'UseCase';
  subjectIds: string[];
  extensionPointIds: string[];
  includeUseCaseIds?: string[];
  extendUseCaseIds?: string[];
}

/**
 * Normative SysML v1.6 / UML Activity classifier (SysML Clause 11.3.2.1).
 * Specifies behavior as the coordinated sequencing of subordinate units.
 */
export interface Activity extends SemanticElement {
  metaclass: 'Activity';
  parameterIds: string[];
  nodeIds: string[];
  partitionIds: string[];
  edgeIds?: string[];
}

/**
 * Normative SysML v1.6 / UML ActivityPartition (SysML Clause 11.3.2.4).
 * Identifies actions within an activity that share some feature / allocated element.
 */
export interface ActivityPartition extends SemanticElement {
  metaclass: 'ActivityPartition';
  representsElementId?: string;
  nodeIds: string[];
  subPartitionIds?: string[];
}
