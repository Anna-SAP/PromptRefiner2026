import { type CaseReport, type OutputVerdict, failureSummary, outputPasses, roleTally } from './judge';
import { redact } from './text';
import type { CheckRole } from './types';

export interface ReportHeader {
  mode: 'offline' | 'live';
  /** One or more lines describing where the refiner output came from. */
  source: string[];
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const red = (text: string) => paint(31, text);
const green = (text: string) => paint(32, text);
const yellow = (text: string) => paint(33, text);
const dim = (text: string) => paint(2, text);

const STATUS_TEXT: Record<CaseReport['status'], string> = {
  pass: 'PASS',
  fail: 'FAIL',
  stale: 'STALE',
  // Model-free checks passed; there was no refiner output to judge.
  'not-run': 'OK',
};

function statusWord(report: CaseReport): string {
  const text = STATUS_TEXT[report.status].padEnd(8);
  if (report.status === 'pass') return green(text);
  if (report.status === 'fail') return red(text);
  if (report.status === 'stale') return yellow(text);
  return dim(text);
}

const ROLES: CheckRole[] = ['improve', 'keep', 'explain', 'format'];

function tallyLine(output: OutputVerdict): string {
  const runs = output.verdicts;
  if (runs.length > 1) {
    const passed = runs.filter((verdict) => verdict.pass).length;
    return `${passed}/${runs.length} runs pass`;
  }
  const [only] = runs;
  if (!only) return 'no runs';
  if (only.error) return 'request failed';
  const tally = roleTally(only);
  return ROLES.filter((role) => tally[role][1] > 0)
    .map((role) => `${role} ${tally[role][0]}/${tally[role][1]}`)
    .join(' · ');
}

function calibrationLine(report: CaseReport): string {
  const { calibration } = report;
  const parts = [
    report.evalCase.expect === 'improve'
      ? `unchanged draft fails ${calibration.unchangedFails.length} improve check${calibration.unchangedFails.length === 1 ? '' : 's'}`
      : 'unchanged draft passes (preserve case)',
    `${calibration.mutations.caught}/${calibration.mutations.total} broken variants caught`,
  ];
  if (calibration.pitfalls.total > 0) parts.push(`${calibration.pitfalls.caught}/${calibration.pitfalls.total} pitfalls caught`);
  return parts.join(', ');
}

function changeText(report: CaseReport): string {
  switch (report.change) {
    case 'regression':
      return red('REGRESSION: passed in the baseline');
    case 'fixed':
      return green('fixed: failed in the baseline');
    case 'new':
      return dim('no baseline for this case');
    default:
      return '';
  }
}

function caseLines(report: CaseReport, verbose: boolean): string[] {
  const { evalCase } = report;
  const target = evalCase.target.replace(/^claude-/, '');
  const head = `${statusWord(report)} ${evalCase.id.padEnd(38)} ${evalCase.category.padEnd(17)} ${target.padEnd(11)}`;
  let summary: string;
  if (report.output) {
    summary = tallyLine(report.output);
    const change = changeText(report);
    if (change) summary += `  ${change}`;
  } else {
    summary = dim(
      report.contract.length === 0 && report.calibration.problems.length === 0
        ? 'contract ok · calibration ok · no refiner output to judge'
        : '',
    );
  }
  const lines = [`${head} ${summary}`.trimEnd()];
  const indent = '           ';

  for (const problem of report.contract) lines.push(`${indent}${red('✗')} contract: ${problem}`);
  for (const problem of report.calibration.problems) lines.push(`${indent}${red('✗')} calibration: ${problem}`);

  if (report.output) {
    if (report.output.stale.length > 0) {
      const verdict = outputPasses(report.output) ? 'passed' : 'failed';
      lines.push(`${indent}${yellow('!')} recorded output ${verdict}, but it predates: ${report.output.stale.join('; ')}`);
    }
    const runs = report.output.verdicts.length;
    for (const failure of failureSummary(report.output)) {
      const count = runs > 1 ? ` (${failure.runs} of ${runs} runs)` : '';
      const reason = failure.reason ? ` — ${redact(failure.reason)}` : '';
      lines.push(`${indent}${red('✗')} ${failure.role}: ${failure.label}${reason}${count}`);
    }
    if (verbose) {
      report.output.verdicts.forEach((verdict, index) => {
        if (runs > 1) lines.push(`${indent}run ${index + 1}:`);
        for (const result of verdict.results) {
          if (result.pass) lines.push(`${indent}${green('✓')} ${result.check.role}: ${result.check.label}`);
        }
      });
    }
  }
  if (report.baseline && verbose) {
    const failures = failureSummary(report.baseline);
    const state = outputPasses(report.baseline) ? 'passed' : `failed ${failures.map((failure) => `"${failure.label}"`).join(', ')}`;
    lines.push(`${indent}${dim(`baseline ${state}`)}`);
  }
  if (verbose) {
    lines.push(`${indent}${dim(`calibration: ${calibrationLine(report)}`)}`);
    if (report.calibration.unchangedFails.length > 0) {
      lines.push(`${indent}${dim(`the unchanged draft fails: ${report.calibration.unchangedFails.join('; ')}`)}`);
    }
  }
  return lines;
}

export interface Totals {
  cases: number;
  pass: number;
  fail: number;
  stale: number;
  notRun: number;
  regressions: number;
  fixed: number;
  contractFailures: number;
  calibrationFailures: number;
  mutations: { total: number; caught: number };
  pitfalls: { total: number; caught: number };
}

export function totals(reports: CaseReport[]): Totals {
  const count = (predicate: (report: CaseReport) => boolean) => reports.filter(predicate).length;
  return {
    cases: reports.length,
    pass: count((report) => report.status === 'pass'),
    fail: count((report) => report.status === 'fail'),
    stale: count((report) => report.status === 'stale'),
    notRun: count((report) => report.status === 'not-run'),
    regressions: count((report) => report.change === 'regression'),
    fixed: count((report) => report.change === 'fixed'),
    contractFailures: count((report) => report.contract.length > 0),
    calibrationFailures: count((report) => report.calibration.problems.length > 0),
    mutations: {
      total: reports.reduce((sum, report) => sum + report.calibration.mutations.total, 0),
      caught: reports.reduce((sum, report) => sum + report.calibration.mutations.caught, 0),
    },
    pitfalls: {
      total: reports.reduce((sum, report) => sum + report.calibration.pitfalls.total, 0),
      caught: reports.reduce((sum, report) => sum + report.calibration.pitfalls.caught, 0),
    },
  };
}

export function formatReport(header: ReportHeader, reports: CaseReport[], { verbose = false } = {}): string {
  const sum = totals(reports);
  const byCategory = new Map<string, number>();
  for (const report of reports) byCategory.set(report.evalCase.category, (byCategory.get(report.evalCase.category) ?? 0) + 1);

  const lines = [
    `Prompt Refiner eval · ${header.mode === 'offline' ? 'offline, no API calls' : 'live'} · ${sum.cases} case${sum.cases === 1 ? '' : 's'} (${[...byCategory]
      .map(([category, n]) => `${category} ${n}`)
      .join(', ')})`,
    ...header.source,
    '',
  ];
  for (const report of reports) lines.push(...caseLines(report, verbose));
  lines.push('');

  const outcome = [`${sum.pass} pass`, `${sum.fail} fail`];
  if (sum.stale) outcome.push(`${sum.stale} stale`);
  if (sum.notRun) outcome.push(`${sum.notRun} ok on the model-free checks, refiner output not judged`);
  if (sum.regressions) outcome.push(red(`${sum.regressions} regression${sum.regressions === 1 ? '' : 's'}`));
  if (sum.fixed) outcome.push(`${sum.fixed} fixed`);
  lines.push(`Cases: ${outcome.join(' · ')}`);
  lines.push(
    `Contract: ${sum.cases - sum.contractFailures}/${sum.cases} hold · Calibration: ${sum.cases - sum.calibrationFailures}/${sum.cases} cases, ` +
      `${sum.mutations.caught}/${sum.mutations.total} broken variants and ${sum.pitfalls.caught}/${sum.pitfalls.total} pitfalls caught`,
  );
  return lines.join('\n');
}

/** The same report as data, for --json. Reasons are redacted like the console output. */
export function reportJson(header: ReportHeader, reports: CaseReport[]): unknown {
  return {
    mode: header.mode,
    source: header.source,
    totals: totals(reports),
    cases: reports.map((report) => ({
      id: report.evalCase.id,
      category: report.evalCase.category,
      target: report.evalCase.target,
      traps: report.evalCase.traps,
      status: report.status,
      ...(report.change ? { change: report.change } : {}),
      contract: report.contract,
      calibration: report.calibration,
      ...(report.output
        ? {
            stale: report.output.stale,
            runs: report.output.verdicts.map((verdict) => ({
              pass: verdict.pass,
              truncated: verdict.truncated,
              ...(verdict.error ? { error: redact(verdict.error) } : {}),
              failures: verdict.results
                .filter((result) => !result.pass)
                .map((result) => ({ role: result.check.role, check: result.check.label, reason: redact(result.reason ?? '') })),
            })),
          }
        : {}),
      ...(report.baseline ? { baselinePasses: outputPasses(report.baseline) } : {}),
    })),
  };
}
