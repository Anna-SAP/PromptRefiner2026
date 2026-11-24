import type Anthropic from '@anthropic-ai/sdk';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { CASES } from './cases/index';
import { targetFingerprint } from './fingerprint';
import { referenceAnswer, renderAnswer } from './output';
import { readRecording } from './recording';
import { type EvalEnvironment, type EvalOptions, runEval } from './run';
import type { EvalCase } from './types';

/** What the fake model does for one request. */
type FakeReply = { text: string; stopReason?: string } | Error;

/**
 * Stands in for the Anthropic client: answers each request through `reply`,
 * streamed in small pieces like the real API. It also checks that the request
 * is the one the app would send for the case: the case's draft inside
 * <raw_request>, and the meta-prompt section for the case's target.
 */
function fakeClient(reply: (evalCase: EvalCase) => FakeReply, seen: string[] = []): Anthropic {
  const stream = (params: {
    model: string;
    system: { text: string }[];
    messages: { content: { type: string; text?: string }[] }[];
  }) => {
    const system = params.system.map((block) => block.text).join('\n\n');
    const user = params.messages[0]?.content.at(-1)?.text ?? '';
    // The base prompt shows the tag as an example; the target section, last, gives the real one.
    const target = [...system.matchAll(/<rationale target="([^"]+)">/g)].at(-1)?.[1];
    const evalCase = CASES.find((c) => c.target === target && user === `<raw_request>\n${c.draft.trim()}\n</raw_request>`);
    if (!evalCase) throw new Error('the fake model got a request that matches no case');
    seen.push(evalCase.id);
    const answer = reply(evalCase);
    return {
      async *[Symbol.asyncIterator]() {
        if (answer instanceof Error) throw answer;
        for (let i = 0; i < answer.text.length; i += 37) {
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer.text.slice(i, i + 37) } };
        }
      },
      finalMessage: async () => ({
        model: params.model,
        stop_reason: answer instanceof Error ? 'end_turn' : (answer.stopReason ?? 'end_turn'),
        usage: { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
      }),
    };
  };
  return { beta: { messages: { stream } } } as unknown as Anthropic;
}

const perfect = (evalCase: EvalCase): FakeReply => ({ text: referenceAnswer(evalCase) });

/** A refiner that has lost the details of one case and kept the boosters of another. */
const regressed = (evalCase: EvalCase): FakeReply => {
  if (evalCase.id === 'coding-flaky-test-details') {
    const prompt = evalCase.reference.prompt.replaceAll('BILL-2291', 'the ticket');
    return { text: renderAnswer(evalCase.target, { ...evalCase.reference, prompt }) };
  }
  if (evalCase.id === 'coding-boosters-sonnet') {
    const prompt = `${evalCase.reference.prompt}\n\nThink step by step and double-check your work.`;
    return { text: renderAnswer(evalCase.target, { ...evalCase.reference, prompt }) };
  }
  return perfect(evalCase);
};

const dir = mkdtempSync(join(tmpdir(), 'refiner-eval-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function options(overrides: Partial<EvalOptions> = {}): EvalOptions {
  return {
    live: false,
    only: [],
    saveBaseline: false,
    repeat: 1,
    concurrency: 3,
    model: 'claude-fable-5-2',
    effort: 'medium',
    maxTokens: 64_000,
    useFallbacks: true,
    strict: false,
    verbose: false,
    ...overrides,
  };
}

function environment(name: string, client?: Anthropic, extra: Partial<EvalEnvironment> = {}): EvalEnvironment {
  return {
    baselinePath: join(dir, name, 'baseline.json'),
    resultsDir: join(dir, name, 'results'),
    ...(client ? { createClient: () => client } : {}),
    now: () => new Date('2026-11-24T08:00:00Z'),
    ...extra,
  };
}

/** A baseline recorded from the correct refiner, shared by the tests that compare with one. */
let baselineRun: Promise<string> | undefined;
function perfectBaseline(): Promise<string> {
  baselineRun ??= (async () => {
    const env = environment('baseline', fakeClient(perfect));
    const result = await runEval(options({ live: true, saveBaseline: true }), env);
    assert.equal(result.exitCode, 0, result.text);
    return env.baselinePath;
  })();
  return baselineRun;
}

describe('offline run', () => {
  it('needs no client and judges only the model-free checks when nothing was recorded', async () => {
    const result = await runEval(options(), environment('empty'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.reports.length, CASES.length);
    assert.ok(result.reports.every((report) => report.status === 'not-run'));
    assert.match(result.text, /no recording at/);
    assert.match(result.text, /Contract: 27\/27 hold/);
  });

  it('rejects an unknown --only name', async () => {
    const result = await runEval(options({ only: ['no-such-case'] }), environment('empty'));
    assert.equal(result.exitCode, 2);
    assert.match(result.text, /"no-such-case"/);
  });
});

describe('live run', () => {
  it('sends each case through the same request the app builds, and passes a correct refiner', async () => {
    const seen: string[] = [];
    const env = environment('perfect', fakeClient(perfect, seen));
    const result = await runEval(options({ live: true, saveBaseline: true }), env);
    assert.equal(result.exitCode, 0, result.text);
    assert.deepEqual([...seen].sort(), CASES.map((c) => c.id).sort());
    assert.ok(result.reports.every((report) => report.status === 'pass' && report.change === 'new'));
    assert.match(result.text, /^PASS +coding-flaky-test-details .*improve 1\/1 · keep 13\/13 · explain 3\/3 · format 6\/6/m);

    const baseline = readRecording(env.baselinePath);
    assert.equal(Object.keys(baseline.cases).length, CASES.length);
    const recorded = baseline.cases['grader-undefined-scale-zh'];
    assert.equal(recorded?.runs[0]?.output, referenceAnswer(CASES.find((c) => c.id === 'grader-undefined-scale-zh')!));
    assert.deepEqual(recorded?.metaPrompt, targetFingerprint('generic'));
  });

  it('reports a regression against the baseline, with the reason for each failed check', async () => {
    const baselinePath = await perfectBaseline();
    const env = environment('regressed', fakeClient(regressed));
    const result = await runEval(options({ live: true, recordingPath: baselinePath }), env);
    assert.equal(result.exitCode, 1);

    const byId = new Map(result.reports.map((report) => [report.evalCase.id, report]));
    assert.equal(byId.get('coding-flaky-test-details')?.change, 'regression');
    assert.equal(byId.get('coding-boosters-sonnet')?.change, 'regression');
    assert.equal(byId.get('grader-pairwise-sonnet')?.change, 'same');
    assert.match(result.text, /✗ keep: keeps "BILL-2291" — not found in the refined prompt/);
    assert.match(result.text, /✗ improve: drops "think step by step" — refined prompt still has "step by step"/);
    assert.match(result.text, /Regressions — these passed in the baseline and fail now: coding-flaky-test-details, coding-boosters-sonnet/);
  });

  it('turns a request failure, a refusal or a cut-off answer into a failed case', async () => {
    const reply = (evalCase: EvalCase): FakeReply => {
      if (evalCase.id === 'coding-flaky-test-details') return new Error('socket hang up');
      if (evalCase.id === 'coding-boosters-sonnet') return { text: '', stopReason: 'refusal' };
      return { text: referenceAnswer(evalCase).slice(0, 200), stopReason: 'max_tokens' };
    };
    const result = await runEval(
      options({ live: true, only: ['coding-flaky-test-details', 'coding-boosters-sonnet', 'coding-review-already-good'] }),
      environment('failures', fakeClient(reply)),
    );
    assert.equal(result.exitCode, 1);
    assert.ok(result.reports.every((report) => report.status === 'fail'));
    assert.match(result.text, /request failed — server: .*socket hang up/);
    assert.match(result.text, /request failed — refusal: Claude declined/);
    assert.match(result.text, /answer was cut off at max_tokens/);
  });

  it('repeats each case and reports how many runs passed', async () => {
    let calls = 0;
    const flaky = (evalCase: EvalCase): FakeReply => (calls++ % 2 === 0 ? perfect(evalCase) : regressed(evalCase));
    const result = await runEval(
      options({ live: true, only: ['coding-flaky-test-details'], repeat: 2, concurrency: 1 }),
      environment('repeat', fakeClient(flaky)),
    );
    assert.equal(result.reports[0]?.status, 'fail');
    assert.match(result.text, /1\/2 runs pass/);
    assert.match(result.text, /keeps "BILL-2291" — not found in the refined prompt \(1 of 2 runs\)/);
  });

  it('never prints or records the API key, even when an error message contains it', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    const key = ['sk', 'ant', 'api03'].join('-') + '-FAKE0123456789abcdefFAKE';
    process.env.ANTHROPIC_API_KEY = key;
    try {
      const env = environment('secret', fakeClient(() => new Error(`401 invalid x-api-key ${key}`)));
      const result = await runEval(options({ live: true, only: ['coding-review-already-good'] }), env);
      assert.ok(!result.text.includes(key));
      assert.ok(result.writtenTo?.every((path) => !readFileSync(path, 'utf8').includes(key)));
      assert.match(result.text, /\[redacted\]/);
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});

describe('replaying a recording after prompt.ts or rules.ts changes', () => {
  it('judges a fresh recording with the current checks', async () => {
    const result = await runEval(options({ recordingPath: await perfectBaseline() }), environment('replay'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.reports.every((report) => report.status === 'pass'));
  });

  it('marks results recorded before a rule changed as stale, and names the rule', async () => {
    const edited = (target: EvalCase['target']) => {
      const fingerprint = targetFingerprint(target);
      return {
        ...fingerprint,
        section: `${fingerprint.section}-edited`,
        rules: { ...fingerprint.rules, 'talk-grader-checks': 'edited' },
      };
    };
    const env = environment('replay', undefined, { fingerprint: edited });
    const result = await runEval(options({ recordingPath: await perfectBaseline() }), env);
    assert.equal(result.exitCode, 0, 'stale is a warning by default');
    assert.ok(result.reports.every((report) => report.status === 'stale'));
    assert.match(result.text, /recorded output passed, but it predates: rule text changed: talk-grader-checks/);
    assert.match(result.text, /Re-check them with:\n  npm run eval:live$/m, 'every case is stale, so no --only list');
    // The three cases that cite the grading rule are named as the ones to re-check first.
    assert.match(
      result.text,
      /re-check first:\n  npm run eval:live -- --only grader-undefined-scale-zh,grader-pairwise-sonnet,grader-translation-boosters-fable-zh$/m,
    );

    const strict = await runEval(options({ recordingPath: await perfectBaseline(), strict: true }), env);
    assert.equal(strict.exitCode, 1);
  });

  it('marks results stale when the base prompt or the refiner model changed', async () => {
    const env = environment('replay', undefined, {
      fingerprint: (target) => ({ ...targetFingerprint(target), base: 'edited' }),
    });
    const result = await runEval(
      options({ recordingPath: await perfectBaseline(), model: 'claude-opus-5-5', only: ['grading'] }),
      env,
    );
    const stale = result.reports[0]?.output?.stale ?? [];
    assert.ok(stale.some((reason) => reason.includes('the base meta-prompt in prompt.ts changed')));
    assert.ok(stale.some((reason) => reason.includes('the refiner is now claude-opus-5-5')));
  });

  it('merges a partial re-run into the baseline without dropping the other cases', async () => {
    const env = environment('merge', fakeClient(perfect));
    await runEval(options({ live: true, saveBaseline: true }), env);
    await runEval(options({ live: true, saveBaseline: true, only: ['grading'] }), { ...env, now: () => new Date('2026-11-25T08:00:00Z') });
    const merged = readRecording(env.baselinePath);
    assert.equal(Object.keys(merged.cases).length, CASES.length);
    assert.equal(merged.cases['grader-pairwise-sonnet']?.recordedAt, '2026-11-25T08:00:00.000Z');
    assert.equal(merged.cases['coding-flaky-test-details']?.recordedAt, '2026-11-24T08:00:00.000Z');
  });
});
