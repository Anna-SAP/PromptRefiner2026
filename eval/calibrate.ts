import type { ParsedRationale } from '../shared/parseRationale';
import { REFINER_EDIT_RULE, findRule } from '../shared/rules';
import { allChecks, caseContext, evaluate, globalChecks, promptBefore, runCheck } from './checks';
import { parseAnswer, referenceAnswer, renderAnswer } from './output';
import { detectLanguage, globalPattern, mentionsNumber, normalize, sentences } from './text';
import type { Check, EvalCase, Subject } from './types';

/**
 * Calibration answers one question per case without calling a model: can
 * these checks tell a better prompt from a worse one?
 *
 * 1. The case is well formed: every detail it expects to be kept is in the
 *    draft, every line it expects to be removed is in the draft, and so on.
 * 2. The unchanged draft passes every keep check and fails every improve
 *    check. An improve check the draft already passes could not show that a
 *    refinement made anything better.
 * 3. A hand-written correct refinement, in different words from the draft,
 *    passes every check. Checks that only accept the draft's own wording would
 *    fail here.
 * 4. Broken variants of that refinement (a detail deleted, a booster put back,
 *    a limit invented, a tag missing, ...) each fail the check meant to catch
 *    them.
 * 5. The case's pitfalls, wrong refinements that read well, fail the checks
 *    they name.
 */
export interface CaseCalibration {
  caseId: string;
  /** Empty when the case is calibrated. */
  problems: string[];
  /** Labels of the improve checks the unchanged draft fails. */
  unchangedFails: string[];
  mutations: { total: number; caught: number };
  pitfalls: { total: number; caught: number };
}

const EMPTY_RATIONALE = (target: string): ParsedRationale => ({ started: true, complete: true, target, entries: [] });

/** The draft passed through untouched, as if the refiner had changed nothing. */
export function unchangedSubject(evalCase: EvalCase): Subject {
  return {
    format: 'tagged',
    analysis: '',
    prompt: promptBefore(evalCase),
    promptComplete: true,
    rationale: EMPTY_RATIONALE(evalCase.target),
  };
}

function patternsOf(check: Check): RegExp[] {
  switch (check.kind) {
    case 'keepMatch':
    case 'avoid':
    case 'drop':
    case 'analysis':
      return [check.pattern];
    case 'add':
    case 'sameSentence':
      return check.patterns;
    case 'order':
      return [...check.first, check.then];
    case 'qualified':
      return [check.pattern, check.qualifier];
    default:
      return [];
  }
}

/** Problems with the case itself, before any output is judged. */
export function validateCase(evalCase: EvalCase): string[] {
  const problems: string[] = [];
  const context = caseContext(evalCase);
  const source = normalize(context.source);
  const checks = allChecks(evalCase);

  const labels = checks.map((check) => check.label);
  for (const label of new Set(labels.filter((label, index) => labels.indexOf(label) !== index))) {
    problems.push(`two checks share the label "${label}"`);
  }
  if (detectLanguage(evalCase.draft) !== evalCase.lang) {
    problems.push(`the draft reads as ${detectLanguage(evalCase.draft)}, but the case says ${evalCase.lang}`);
  }
  const improveChecks = evalCase.checks.filter((check) => check.role === 'improve');
  if (evalCase.expect === 'improve' && improveChecks.length === 0) problems.push('an improve case needs an improve check');
  if (evalCase.expect === 'preserve' && improveChecks.length > 0) {
    problems.push('a preserve case cannot have improve checks');
  }

  for (const check of evalCase.checks) {
    for (const pattern of patternsOf(check)) {
      if (pattern.global || pattern.sticky) problems.push(`"${check.label}": patterns must not use the g or y flag`);
    }
    if (check.kind === 'keep' && !source.includes(normalize(check.text))) {
      problems.push(`"${check.label}": "${check.text}" is not in the draft`);
    }
    if (check.kind === 'keepMatch' && !check.pattern.test(source)) {
      problems.push(`"${check.label}": ${check.pattern} does not match the draft`);
    }
    if (check.kind === 'drop' && !check.pattern.test(source)) {
      problems.push(`"${check.label}": ${check.pattern} does not match the draft, so there is nothing to drop`);
    }
    if (check.kind === 'avoid') {
      if (check.pattern.test(source)) problems.push(`"${check.label}": ${check.pattern} already matches the draft`);
      if (!check.pattern.test(normalize(check.example))) problems.push(`"${check.label}": its example does not match`);
    }
    if (check.kind === 'cites') {
      for (const rule of check.rules) {
        if (rule !== REFINER_EDIT_RULE && !findRule(rule)) problems.push(`"${check.label}": no rule "${rule}"`);
      }
    }
  }
  for (const pitfall of evalCase.pitfalls ?? []) {
    for (const label of pitfall.fails) {
      if (!labels.includes(label)) problems.push(`pitfall "${pitfall.name}" names an unknown check "${label}"`);
    }
  }
  return problems;
}

interface Mutation {
  name: string;
  subject: Subject;
  check: Check;
}

function otherLanguageStub(lang: 'zh' | 'en'): string {
  return lang === 'zh' ? 'Write the requested text in plain language.' : '请按要求写出这段内容，语言自然。';
}

/** Broken variants of the reference refinement, each aimed at one check. */
function mutations(evalCase: EvalCase, reference: Subject): Mutation[] {
  const context = caseContext(evalCase);
  const prompt = normalize(reference.prompt);
  const source = normalize(context.source);
  const withPrompt = (text: string): Subject => ({ ...reference, prompt: text });
  const out: Mutation[] = [];
  const push = (name: string, check: Check, subject: Subject) => out.push({ name, check, subject });

  for (const check of allChecks(evalCase)) {
    switch (check.kind) {
      case 'keep':
        push(`delete "${check.text}"`, check, withPrompt(prompt.split(normalize(check.text)).join('')));
        break;
      case 'keepMatch':
        push(`delete ${check.pattern}`, check, withPrompt(prompt.replace(globalPattern(check.pattern), '')));
        break;
      case 'avoid':
        push(`add "${check.example}"`, check, withPrompt(`${prompt}\n${check.example}`));
        break;
      case 'drop': {
        const line = check.pattern.exec(source)?.[0];
        if (line) push(`put back "${line}"`, check, withPrompt(`${prompt}\n${line}`));
        break;
      }
      case 'add': {
        let stripped = prompt;
        for (const pattern of check.patterns) stripped = stripped.replace(globalPattern(pattern), '');
        push('remove what the refinement added', check, withPrompt(stripped));
        break;
      }
      case 'order': {
        const later = check.then.exec(prompt)?.[0];
        if (later) push(`move "${later}" to the top`, check, withPrompt(`${later}\n${prompt}`));
        break;
      }
      case 'qualified':
        if (check.role === 'improve') {
          const bare = sentences(context.before).find(
            (sentence) => check.pattern.test(sentence) && !check.qualifier.test(sentence),
          );
          if (bare) push(`put back "${bare}"`, check, withPrompt(`${prompt}\n${bare}`));
        } else {
          push('remove the qualifier', check, withPrompt(prompt.replace(globalPattern(check.qualifier), '')));
        }
        break;
      case 'sameSentence': {
        const last = check.patterns.at(-1);
        if (last) push('separate the two parts', check, withPrompt(prompt.replace(globalPattern(last), '')));
        break;
      }
      case 'maxChars':
        push('carry out the task instead', check, withPrompt(`${prompt}\n${'x'.repeat(check.max)}`));
        break;
      case 'similar':
        push('rewrite from scratch', check, withPrompt(otherLanguageStub(evalCase.lang === 'zh' ? 'en' : 'zh')));
        break;
      case 'lengthRatio':
        push('pad the prompt', check, withPrompt(Array(Math.ceil(check.max) + 1).fill(prompt).join('\n\n')));
        break;
      case 'analysis':
        push('vague analysis', check, { ...reference, analysis: 'Edited the prompt.' });
        break;
      case 'cites':
        push('cite only refiner-edit', check, {
          ...reference,
          rationale: { ...reference.rationale, entries: [{ rule: REFINER_EDIT_RULE, change: 'Edited the prompt.' }] },
        });
        break;
      case 'structure':
        push('plain answer without tags', check, { ...reference, format: 'plain' });
        break;
      case 'complete':
        push('answer cut off mid-prompt', check, { ...reference, promptComplete: false });
        break;
      case 'noLeakedTags':
        push('leak a tag into the prompt', check, withPrompt(`${prompt}\n</analysis>`));
        break;
      case 'rationaleBlock':
        push('no rationale', check, { ...reference, rationale: { started: false, complete: false, target: null, entries: [] } });
        break;
      case 'rationaleTarget':
        push('wrong rationale target', check, {
          ...reference,
          rationale: { ...reference.rationale, target: evalCase.target === 'generic' ? 'claude-opus-5-5' : 'generic' },
        });
        break;
      case 'knownRules':
        push('cite an unknown rule', check, {
          ...reference,
          rationale: {
            ...reference.rationale,
            entries: [...reference.rationale.entries, { rule: 'made-up-rule', change: 'Changed something.' }],
          },
        });
        break;
      case 'analysisPresent':
        push('empty analysis', check, { ...reference, analysis: '' });
        break;
      case 'rationaleEntries':
        push('empty rationale', check, { ...reference, rationale: { ...reference.rationale, entries: [] } });
        break;
      case 'language':
        push('answer in the other language', check, withPrompt(otherLanguageStub(evalCase.lang)));
        break;
      case 'noNewLimits': {
        const value = mentionsNumber(context.source, '137') ? '9137' : '137';
        const limit = evalCase.lang === 'zh' ? `篇幅控制在 ${value} 字以内。` : `Keep it under ${value} words.`;
        push(`invent "${limit}"`, check, withPrompt(`${prompt}\n${limit}`));
        break;
      }
    }
  }
  return out;
}

export function calibrateCase(evalCase: EvalCase): CaseCalibration {
  const problems = validateCase(evalCase);
  const context = caseContext(evalCase);
  const checks = allChecks(evalCase);
  const what = evalCase.references?.length ? 'the latest earlier prompt, unchanged,' : 'the unchanged draft';

  // 2. The unchanged draft.
  const unchanged = unchangedSubject(evalCase);
  const unchangedFails: string[] = [];
  const judged = [...globalChecks(evalCase).filter((check) => check.role === 'keep'), ...evalCase.checks];
  for (const result of evaluate(judged, unchanged, context)) {
    const { check } = result;
    if (check.role === 'improve') {
      if (result.pass) problems.push(`${what} already passes "${check.label}", so that check cannot show improvement`);
      else unchangedFails.push(check.label);
    } else if (check.role === 'keep' && !result.pass) {
      problems.push(`${what} fails the keep check "${check.label}" (${result.reason})`);
    }
  }

  // 3. The hand-written reference refinement.
  const reference = parseAnswer(referenceAnswer(evalCase));
  for (const result of evaluate(checks, reference, context)) {
    if (!result.pass) problems.push(`the reference refinement fails "${result.check.label}": ${result.reason}`);
  }

  // 4. Broken variants of it.
  const variants = mutations(evalCase, reference);
  let caught = 0;
  for (const variant of variants) {
    if (runCheck(variant.check, variant.subject, context) !== null) caught++;
    else problems.push(`"${variant.check.label}" does not catch the broken variant "${variant.name}"`);
  }

  // 5. Pitfalls: wrong refinements that read well.
  let pitfallsCaught = 0;
  const pitfalls = evalCase.pitfalls ?? [];
  for (const pitfall of pitfalls) {
    const subject = parseAnswer(
      renderAnswer(evalCase.target, {
        analysis: pitfall.analysis ?? evalCase.reference.analysis,
        prompt: pitfall.prompt,
        rationale: evalCase.reference.rationale,
      }),
    );
    const results = evaluate(checks, subject, context);
    const missed = pitfall.fails.filter((label) => results.find((result) => result.check.label === label)?.pass !== false);
    if (missed.length === 0) pitfallsCaught++;
    else problems.push(`pitfall "${pitfall.name}" passes ${missed.map((label) => `"${label}"`).join(', ')}`);
  }

  return {
    caseId: evalCase.id,
    problems,
    unchangedFails,
    mutations: { total: variants.length, caught },
    pitfalls: { total: pitfalls.length, caught: pitfallsCaught },
  };
}
