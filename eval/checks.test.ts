import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRACKETED_QUESTION,
  type CaseContext,
  add,
  analysisSays,
  avoid,
  cites,
  drop,
  keep,
  lengthRatio,
  maxChars,
  order,
  qualified,
  runCheck,
  sameSentence,
  similar,
} from './checks';
import { parseAnswer, renderAnswer } from './output';
import { detectLanguage, lengthLimits, mentionsNumber, normalize, redact, retainedShare, sentences } from './text';
import type { Check, Subject } from './types';

const context: CaseContext = {
  target: 'claude-fable-5-2',
  lang: 'en',
  source: 'Fix BILL-2291 in src/a.ts. Think step by step. Keep it under 300 words.',
  before: 'Fix BILL-2291 in src/a.ts. Think step by step. Keep it under 300 words.',
  allowedRules: new Set(['talk-try-harder-lines', 'refiner-edit']),
};

function subject(prompt: string, extra: Partial<Subject> = {}): Subject {
  return {
    format: 'tagged',
    analysis: 'Removed the boosters; the effort setting controls thinking.',
    prompt,
    promptComplete: true,
    rationale: {
      started: true,
      complete: true,
      target: 'claude-fable-5-2',
      entries: [{ rule: 'talk-try-harder-lines', change: 'Removed "think step by step".' }],
    },
    ...extra,
  };
}

const passes = (check: Check, s: Subject, c = context) => runCheck(check, s, c) === null;

describe('text helpers', () => {
  it('normalizes width and the spaces around Chinese characters', () => {
    assert.equal(normalize('截止 2026 年 12 月 5 日！'), '截止2026年12月5日!');
    assert.equal(normalize('价格：￥89（含税）'), '价格:¥89(含税)');
    assert.equal(normalize('push 到 main  分支'), 'push到main分支');
    assert.equal(normalize('a  b\t c'), 'a b c');
  });

  it('splits sentences without breaking file names', () => {
    assert.deepEqual(sentences('Edit CHANGELOG.md now. Then stop!\nNext line'), ['Edit CHANGELOG.md now.', 'Then stop!', 'Next line']);
    assert.deepEqual(sentences('不要 push 到 main；收到 LGTM 后再合并。好'), ['不要push到main;', '收到LGTM后再合并。', '好']);
  });

  it('tells Chinese from English prose, ignoring code and placeholders', () => {
    assert.equal(detectLanguage('在 feat/export-csv 分支上完成订单导出功能，运行 `make lint` 和 make test。'), 'zh');
    assert.equal(detectLanguage('Fix the flaky test in `src/proration/calculate.ts`.'), 'en');
    assert.equal(detectLanguage('{{customer_question}} https://example.com/页面'), 'mixed');
  });

  it('finds length limits and whether the source gives their number', () => {
    assert.deepEqual(
      lengthLimits('Keep it under 150 words, or 1,200 characters. 控制在 300 字以内。').map((limit) => limit.value),
      ['150', '1200', '300'],
    );
    assert.equal(lengthLimits('5 attempts per 15 minutes; Node 20.11').length, 0);
    assert.ok(mentionsNumber('limit is 1,200 chars', '1200'));
    assert.ok(!mentionsNumber('price 1500', '150'));
  });

  it('measures how much of the wording is kept', () => {
    assert.equal(retainedShare('alpha beta gamma', 'alpha beta gamma delta'), 1);
    assert.ok(retainedShare('alpha beta gamma delta', 'alpha') < 0.5);
    assert.equal(retainedShare('城市读书夜', '城市读书夜活动'), 1);
  });

  it('redacts anything that looks like a key, and the configured key itself', () => {
    const fake = ['sk', 'ant', 'test'].join('-') + 'A1b2C3d4E5f6G7h8';
    assert.equal(redact(`key=${fake}`), 'key=sk-ant-[redacted]');
    assert.equal(redact('token abcdefgh1234 here', 'abcdefgh1234'), 'token [redacted] here');
    assert.equal(redact('nothing secret', undefined), 'nothing secret');
  });
});

describe('checks', () => {
  it('keep and drop match after normalization', () => {
    assert.ok(passes(keep('BILL-2291'), subject('See BILL-2291.')));
    assert.ok(!passes(keep('BILL-2291'), subject('See the ticket.')));
    assert.ok(passes(keep('12 月 5 日'), subject('截止12月5日')));
    assert.equal(runCheck(drop(/step by step/i, 'x'), subject('Think step by step.'), context), 'refined prompt still has "step by step"');
    assert.ok(passes(drop(/step by step/i, 'x'), subject('Fix it.')));
  });

  it('avoid rejects an invented requirement', () => {
    const check = avoid(/severity/i, 'no severity', 'Rate severity.');
    assert.ok(passes(check, subject('List the bugs.')));
    assert.ok(!passes(check, subject('List the bugs by severity.')));
  });

  it('add needs `min` of its patterns', () => {
    const check = add([/a1/, /b2/, /c3/], 'two of three', 2);
    assert.ok(passes(check, subject('a1 b2')));
    assert.equal(runCheck(check, subject('a1 only'), context), 'found 1 of the 2 needed');
    assert.ok(passes(add(BRACKETED_QUESTION, 'q'), subject('Tone: [playful or formal?]')));
    assert.ok(passes(add(BRACKETED_QUESTION, 'q'), subject('语气：[活泼还是正式？]')));
    assert.ok(!passes(add(BRACKETED_QUESTION, 'q'), subject('Audience: [target audience]')));
  });

  it('order needs every earlier part before the later one', () => {
    const check = order([/Bank/, /PIN/], /\{\{user\}\}/, 'fixed first');
    assert.ok(passes(check, subject('Bank rules. Never ask for a PIN.\n{{user}}')));
    assert.ok(!passes(check, subject('Bank assistant for {{user}}. Never ask for a PIN.')));
    assert.ok(!passes(check, subject('{{user}}\nBank rules. PIN.')));
  });

  it('qualified looks at each sentence that states the rule', () => {
    const ban = /不要[^。;]*push[^。;]*main/;
    const check = qualified(ban, /LGTM/, 'ban carries its exception');
    assert.ok(passes(check, subject('在我回复 LGTM 之前，不要 push 到 main。')));
    assert.ok(!passes(check, subject('不要 push 到 main。收到 LGTM 后可以合并。')));
    assert.ok(passes(check, subject('收到 LGTM 后可以合并到 main。')), 'no ban left at all is fine unless required');
    assert.ok(!passes(qualified(ban, /LGTM/, 'x', { required: true }), subject('收到 LGTM 后可以合并到 main。')));
  });

  it('sameSentence, maxChars, similar and lengthRatio', () => {
    assert.ok(passes(sameSentence([/main/, /LGTM/], 'x'), subject('Merge to main after LGTM.')));
    assert.ok(!passes(sameSentence([/main/, /LGTM/], 'x'), subject('Merge to main. Wait for LGTM.')));
    assert.ok(!passes(maxChars(10), subject('x'.repeat(11))));
    assert.ok(passes(similar(0.8), subject(context.before)));
    assert.ok(!passes(similar(0.8), subject('Something else entirely.')));
    assert.ok(!passes(lengthRatio(1.5), subject(`${context.before} ${context.before}`)));
  });

  it('analysis and cites read the explanation, not the prompt', () => {
    assert.ok(passes(analysisSays(/effort/, 'x'), subject('Fix it.')));
    assert.ok(!passes(analysisSays(/effort/, 'x'), subject('Fix it.', { analysis: 'Tidied up.' })));
    assert.ok(passes(cites(['talk-try-harder-lines']), subject('Fix it.')));
    assert.equal(runCheck(cites(['fable-finish-task']), subject('Fix it.'), context), 'cited talk-try-harder-lines');
  });

  it('global checks catch format, rationale, language and invented limits', () => {
    const check = (kind: Check['kind']) => ({ kind, role: 'format', label: kind }) as Check;
    assert.ok(!passes(check('structure'), subject('x', { format: 'plain' })));
    assert.ok(!passes(check('complete'), subject('x', { promptComplete: false })));
    assert.ok(!passes(check('noLeakedTags'), subject('x </analysis>')));
    assert.ok(!passes(check('rationaleBlock'), subject('x', { rationale: { started: false, complete: false, target: null, entries: [] } })));
    assert.ok(!passes(check('rationaleTarget'), subject('x', { rationale: { started: true, complete: true, target: 'generic', entries: [] } })));
    const unknown = subject('x', { rationale: { started: true, complete: true, target: 'claude-fable-5-2', entries: [{ rule: 'opus-no-think-lines', change: 'c' }] } });
    assert.match(runCheck(check('knownRules'), unknown, context) ?? '', /opus-no-think-lines/);
    assert.ok(!passes(check('language'), subject('请修复这个测试，并说明原因。')));
    assert.ok(passes(check('noNewLimits'), subject('Keep it under 300 words.')), 'the draft gives 300');
    assert.match(runCheck(check('noNewLimits'), subject('Keep it under 150 words.'), context) ?? '', /150 words/);
  });
});

describe('answer parsing', () => {
  it('reads a rendered answer the way the app does', () => {
    const raw = renderAnswer('generic', {
      analysis: 'Cut the greeting.',
      prompt: 'Summarize the report.',
      rationale: [['refiner-edit', 'Removed the greeting.']],
    });
    const parsed = parseAnswer(raw);
    assert.equal(parsed.format, 'tagged');
    assert.equal(parsed.prompt, 'Summarize the report.');
    assert.equal(parsed.analysis, 'Cut the greeting.');
    assert.equal(parsed.rationale.target, 'generic');
    assert.deepEqual(parsed.rationale.entries, [{ rule: 'refiner-edit', change: 'Removed the greeting.' }]);
  });
});
