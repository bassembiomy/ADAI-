import type { ReportModelDiagnostics } from '../../services/reportModelConsistency';

export interface ReportHeader {
  systemTitle: string;
  documentTitle: string;
  subtitle: string;
  primaryObjective: string;
  status: string;
  safetyClassification: string;
  runningHeader: string;
}

export interface ReportSafetyGate {
  title: string;
  description: string;
  stopTestRule: string;
  rootCauses?: string[];
}

export interface ReportSignalRow {
  signalGroup: string;
  signalsToLog: string;
}

export interface ReportRequiredData {
  requiredEquipment: string[];
  requiredPreconditions: string[];
  signalsTable: ReportSignalRow[];
  currentRatingRule?: string;
}

export interface ReportTestProcedure {
  id: string;
  badgeLabel?: string;
  title: string;
  purpose: string;
  procedure: string[];
  record: string[];
  acceptanceCriteria: string[];
  decisionRule: string;
}

export interface ReportDecisionMatrixRow {
  observedResult: string;
  probableCause: string;
  confirmWith: string;
  requiredAction: string;
}

export interface ReportDecisionMatrix {
  title: string;
  rows: ReportDecisionMatrixRow[];
}

export interface ReportClassification {
  title: string;
  criteria: string[];
}

export interface ReportFinalDecision {
  title: string;
  classifications: ReportClassification[];
  releaseCondition: string;
}

export interface ReportConsistencySummary {
  revision: string;
  removedRelationshipIds: string[];
  removedConnectorIds: string[];
  errors: ReportModelDiagnostics['errors'];
}

export interface ReportDocument {
  header: ReportHeader;
  safetyGate: ReportSafetyGate;
  requiredDataAndSignals: ReportRequiredData;
  testProcedures: ReportTestProcedure[];
  decisionMatrix: ReportDecisionMatrix;
  finalDecisionCriteria: ReportFinalDecision;
  consistency: ReportConsistencySummary;
}

export function validateReportDocument(doc: any): doc is ReportDocument {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.header?.documentTitle || !doc.header?.primaryObjective) return false;
  if (!doc.safetyGate?.stopTestRule) return false;
  if (!Array.isArray(doc.testProcedures) || doc.testProcedures.length === 0) return false;
  if (!Array.isArray(doc.decisionMatrix?.rows)) return false;
  if (!doc.finalDecisionCriteria?.releaseCondition) return false;
  if (!doc.consistency || typeof doc.consistency !== 'object') return false;
  if (typeof doc.consistency.revision !== 'string') return false;
  if (!Array.isArray(doc.consistency.removedRelationshipIds)) return false;
  if (!Array.isArray(doc.consistency.removedConnectorIds)) return false;
  if (!Array.isArray(doc.consistency.errors)) return false;
  return true;
}

