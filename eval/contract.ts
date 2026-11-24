import { buildSystemPrompt, buildUserContent } from '../shared/prompt';
import type { EffortLevel, RefineRequest } from '../shared/protocol';
import { REFINER_EDIT_RULE, findRule, rulesForTarget } from '../shared/rules';
import { validateRefineRequest } from '../shared/validate';
import type { EvalCase } from './types';

/** The request the app would send for this case. */
export function caseRequest(evalCase: EvalCase, effort?: EffortLevel): RefineRequest {
  return {
    inputText: evalCase.draft,
    images: [],
    ...(evalCase.references ? { references: evalCase.references } : {}),
    ...(effort ? { effort } : {}),
    targetModel: evalCase.target,
  };
}

/**
 * The parts of shared/ the contract reads. Tests pass stand-ins to show that
 * the contract notices when prompt.ts or rules.ts stops providing something.
 */
export interface MetaPromptSource {
  buildSystemPrompt: typeof buildSystemPrompt;
  buildUserContent: typeof buildUserContent;
  rulesForTarget: typeof rulesForTarget;
  findRule: typeof findRule;
}

export const CURRENT_META_PROMPT: MetaPromptSource = { buildSystemPrompt, buildUserContent, rulesForTarget, findRule };

/**
 * What can be checked about a case without calling a model: whether the
 * meta-prompt built from prompt.ts and rules.ts still gives the refiner what
 * the case depends on.
 *
 * - The request for the case is valid, and the draft and earlier sessions
 *   reach the model word for word.
 * - The system prompt still asks for the blocks the eval reads.
 * - Every rule the case expects to see cited still exists and is still
 *   offered for the case's target. Removing a rule from a target, or renaming
 *   it, therefore fails the cases that rely on it before any model is called.
 *
 * Returns the problems found; an empty list means the contract holds.
 */
export function checkContract(evalCase: EvalCase, source: MetaPromptSource = CURRENT_META_PROMPT): string[] {
  const problems: string[] = [];
  const request = caseRequest(evalCase);

  const validation = validateRefineRequest(request);
  if (!validation.ok) problems.push(`the app would reject this request: ${validation.message}`);

  const blocks = source.buildUserContent(request);
  const last = blocks.at(-1);
  const expectedDraft = `<raw_request>\n${evalCase.draft.trim()}\n</raw_request>`;
  if (last?.type !== 'text' || last.text !== expectedDraft) {
    problems.push('the draft does not reach the model word for word inside <raw_request>');
  }
  if (evalCase.references?.length) {
    const first = blocks[0];
    const sessions = first?.type === 'text' ? first.text : '';
    for (const [index, reference] of evalCase.references.entries()) {
      if (!sessions.includes(reference.refinedPrompt.trim()) || !sessions.includes(reference.originalPrompt.trim())) {
        problems.push(`earlier session ${index + 1} does not reach the model word for word`);
      }
    }
  }

  const system = source.buildSystemPrompt(evalCase.target);
  for (const tag of ['<analysis>', '<refined_prompt>', `<rationale target="${evalCase.target}">`]) {
    if (!system.includes(tag)) problems.push(`the meta-prompt no longer asks for ${tag}`);
  }

  const offered = new Set(source.rulesForTarget(evalCase.target).map((rule) => rule.id));
  for (const check of evalCase.checks) {
    if (check.kind !== 'cites') continue;
    const missing = check.rules.filter((id) => id !== REFINER_EDIT_RULE && !source.findRule(id));
    if (missing.length > 0) problems.push(`relies on ${missing.join(', ')}, which rules.ts no longer has`);
    if (!check.rules.some((id) => offered.has(id))) {
      problems.push(`relies on ${check.rules.join(' or ')}, which the meta-prompt no longer offers for ${evalCase.target}`);
    }
  }
  return problems;
}
