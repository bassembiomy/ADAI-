import { JudgmentVerdict } from './oracle_judge/MetricsComparator';

export interface ComponentReportEntry {
  domain: string;
  component: string;
  testId: string;
  measuredSteadyState: number;
  expectedSteadyState: number;
  nrmsePercent: number;
  tauSim?: number;
  tauRef?: number;
  verdict: JudgmentVerdict;
}

export class WhiteboxReporter {
  private static entries: ComponentReportEntry[] = [];

  static record(entry: ComponentReportEntry) {
    this.entries.push(entry);
  }

  static generateSummaryTable(): string {
    const header = `\n========================================================================================================================\n` +
      `| Test ID | Domain           | Component / Benchmark            | Expected SS | Simulated SS | NRMSE (%) | Status | Verdict |\n` +
      `========================================================================================================================`;

    const rows = this.entries.map((e) => {
      const status = e.verdict.passed ? '✅ PASS' : '❌ FAIL';
      const testId = e.testId.padEnd(7);
      const domain = e.domain.padEnd(16);
      const comp = e.component.padEnd(32);
      const expSs = e.expectedSteadyState.toFixed(3).padStart(11);
      const simSs = e.measuredSteadyState.toFixed(3).padStart(12);
      const nrmse = e.nrmsePercent.toFixed(2).padStart(9);
      const verdict = (e.verdict.passed ? 'Certified' : 'Out of Tol').padEnd(7);
      return `| ${testId} | ${domain} | ${comp} | ${expSs} | ${simSs} | ${nrmse} | ${status} | ${verdict} |`;
    });

    const footer = `========================================================================================================================\n`;
    return `${header}\n${rows.join('\n')}\n${footer}`;
  }

  static getEntries(): ComponentReportEntry[] {
    return this.entries;
  }

  static clear() {
    this.entries = [];
  }
}
