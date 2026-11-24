import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSystemPrompt, buildUserContent } from '../shared/prompt';
import { rulesForTarget } from '../shared/rules';
import { calibrateCase, unchangedSubject } from './calibrate';
import { CASES, selectCases } from './cases/index';
import { allChecks, caseContext, evaluate } from './checks';
import { CURRENT_META_PROMPT, type MetaPromptSource, checkContract } from './contract';
import { CATEGORIES, type Trap } from './types';

const casesWith = (trap: Trap) => CASES.filter((evalCase) => evalCase.traps.includes(trap));

describe('golden set', () => {
  it('has 20 to 30 cases with unique ids', () => {
    assert.ok(CASES.length >= 20 && CASES.length <= 30, `${CASES.length} cases`);
    assert.equal(new Set(CASES.map((evalCase) => evalCase.id)).size, CASES.length);
  });

  it('covers every category, and both languages', () => {
    for (const category of CATEGORIES) {
      assert.ok(CASES.filter((evalCase) => evalCase.category === category).length >= 4, category);
    }
    assert.ok(CASES.some((evalCase) => evalCase.lang === 'zh') && CASES.some((evalCase) => evalCase.lang === 'en'));
  });

  it('has several of each trap: lost details, contradictions, legacy boosters', () => {
    assert.ok(casesWith('details').length >= 5);
    assert.ok(casesWith('contradiction').length >= 4);
    assert.ok(casesWith('boosters').length >= 5);
    // Contradictions come in both shapes: the draft says which rule wins, or it does not.
    const contradictions = casesWith('contradiction');
    assert.ok(contradictions.some((evalCase) => evalCase.checks.some((check) => check.kind === 'avoid' && check.label.startsWith('asks no question'))));
    assert.ok(contradictions.some((evalCase) => evalCase.checks.some((check) => check.kind === 'add' && check.label.includes('in brackets'))));
  });

  it('targets every model, including generic', () => {
    const targets = new Set(CASES.map((evalCase) => evalCase.target));
    for (const target of ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'generic']) {
      assert.ok(targets.has(target as never), target);
    }
  });

  it('selects by id, category, trap or target, and reports unknown names', () => {
    assert.equal(selectCases(['grading']).selected.length, 5);
    assert.ok(selectCases(['boosters']).selected.every((evalCase) => evalCase.traps.includes('boosters')));
    assert.deepEqual(selectCases(['coding-flaky-test-details']).selected.map((evalCase) => evalCase.id), ['coding-flaky-test-details']);
    assert.deepEqual(selectCases(['nope']).unknown, ['nope']);
  });
});

describe('each case', () => {
  for (const evalCase of CASES) {
    it(`${evalCase.id}: contract holds and the checks are calibrated`, () => {
      assert.deepEqual(checkContract(evalCase), []);
      const calibration = calibrateCase(evalCase);
      assert.deepEqual(calibration.problems, []);
      assert.equal(calibration.mutations.caught, calibration.mutations.total);
      assert.equal(calibration.pitfalls.caught, calibration.pitfalls.total);
    });
  }

  it('fails the unchanged draft on improve checks only, so a pass means the prompt got better', () => {
    for (const evalCase of CASES) {
      const results = evaluate(allChecks(evalCase), unchangedSubject(evalCase), caseContext(evalCase));
      const improve = results.filter((result) => result.check.role === 'improve');
      const keep = results.filter((result) => result.check.role === 'keep');
      assert.ok(improve.every((result) => !result.pass), evalCase.id);
      assert.ok(keep.every((result) => result.pass), evalCase.id);
      if (evalCase.expect === 'improve') assert.ok(improve.length > 0, evalCase.id);
    }
  });
});

describe('contract: noticing a change to prompt.ts or rules.ts without calling a model', () => {
  const withoutRule = (id: string): MetaPromptSource => ({
    ...CURRENT_META_PROMPT,
    rulesForTarget: (target) => rulesForTarget(target).filter((rule) => rule.id !== id),
  });

  it('fails the cases that rely on a rule a target no longer offers', () => {
    const failing = CASES.filter((evalCase) => checkContract(evalCase, withoutRule('talk-grader-checks')).length > 0);
    assert.deepEqual(
      failing.map((evalCase) => evalCase.id).sort(),
      ['grader-pairwise-sonnet', 'grader-translation-boosters-fable-zh', 'grader-undefined-scale-zh'],
    );
    const [problem] = checkContract(failing[0]!, withoutRule('talk-grader-checks'));
    assert.match(problem ?? '', /talk-grader-checks, which the meta-prompt no longer offers/);
  });

  it('accepts a rule removal when another rule the case accepts is still offered', () => {
    // The Opus chat case accepts either opus-no-think-lines or talk-try-harder-lines.
    const evalCase = CASES.find((c) => c.id === 'chatbot-think-lines-opus')!;
    assert.deepEqual(checkContract(evalCase, withoutRule('opus-no-think-lines')), []);
  });

  it('fails every case when the meta-prompt stops asking for the rationale', () => {
    const source: MetaPromptSource = {
      ...CURRENT_META_PROMPT,
      buildSystemPrompt: (target) => buildSystemPrompt(target).replaceAll('<rationale target=', '<notes target='),
    };
    for (const evalCase of CASES) assert.ok(checkContract(evalCase, source).some((p) => p.includes('<rationale')), evalCase.id);
  });

  it('fails when the draft no longer reaches the model word for word', () => {
    const source: MetaPromptSource = {
      ...CURRENT_META_PROMPT,
      buildUserContent: (request) => buildUserContent({ ...request, inputText: request.inputText.slice(0, 40) }),
    };
    assert.ok(checkContract(CASES[0]!, source).some((p) => p.includes('word for word')));
  });

  it('fails when a rule a case relies on is renamed', () => {
    const source: MetaPromptSource = {
      ...CURRENT_META_PROMPT,
      findRule: (id) => (id === 'talk-contradictions' ? undefined : CURRENT_META_PROMPT.findRule(id)),
    };
    const evalCase = CASES.find((c) => c.id === 'chatbot-contradiction-tone-sonnet')!;
    assert.ok(checkContract(evalCase, source).some((p) => p.includes('rules.ts no longer has')));
  });
});
