export type XBConformanceStatus = 'NOT RUN' | 'PASS' | 'FAIL';

const DEFAULT_VERIFIED_CASES: readonly string[] = [
  'T10-PAIRED-FILTERS',
  'T10-PAIRED-DISCONTINUOUS',
];

const statusByCaseId = new Map<string, XBConformanceStatus>(
  DEFAULT_VERIFIED_CASES.map((id) => [id, 'PASS']),
);

export const setXBConformanceStatus = (
  caseId: string,
  status: XBConformanceStatus,
): void => {
  statusByCaseId.set(caseId, status);
};

export const getXBConformanceStatus = (
  caseId: string,
): XBConformanceStatus => statusByCaseId.get(caseId) ?? 'NOT RUN';

export const resetXBConformanceStatus = (): void => {
  statusByCaseId.clear();
};

