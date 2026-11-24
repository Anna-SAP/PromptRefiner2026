import { createHash } from 'node:crypto';
import type { TargetModel } from '../shared/protocol';
import { buildSystemBlocks, buildUserContent } from '../shared/prompt';
import { rulesForTarget } from '../shared/rules';
import { caseRequest } from './contract';
import type { EvalCase } from './types';

export function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * A summary of the meta-prompt one target receives, precise enough to say what
 * changed between two versions of prompt.ts and rules.ts: the base prompt, the
 * target section as a whole, and the instruction of every rule it offers.
 */
export interface TargetFingerprint {
  base: string;
  section: string;
  rules: Record<string, string>;
}

export function targetFingerprint(target: TargetModel): TargetFingerprint {
  const [baseBlock, targetBlock] = buildSystemBlocks(target);
  return {
    base: hash(baseBlock?.text ?? ''),
    section: hash(targetBlock?.text ?? ''),
    rules: Object.fromEntries(rulesForTarget(target).map((rule) => [rule.id, hash(rule.instruction)])),
  };
}

/** The user turn the case sends, so a recording notices when the draft or its framing changes. */
export function caseInputHash(evalCase: EvalCase): string {
  return hash(JSON.stringify(buildUserContent(caseRequest(evalCase))));
}

/** How the meta-prompt for one target differs between a recording and now. Empty when it does not. */
export function metaPromptChanges(recorded: TargetFingerprint, current: TargetFingerprint, target: TargetModel): string[] {
  const changes: string[] = [];
  if (recorded.base !== current.base) changes.push('the base meta-prompt in prompt.ts changed');
  if (recorded.section === current.section) return changes;

  const added = Object.keys(current.rules).filter((id) => !(id in recorded.rules));
  const removed = Object.keys(recorded.rules).filter((id) => !(id in current.rules));
  const edited = Object.keys(current.rules).filter((id) => id in recorded.rules && recorded.rules[id] !== current.rules[id]);
  if (added.length) changes.push(`rules added for ${target}: ${added.join(', ')}`);
  if (removed.length) changes.push(`rules removed for ${target}: ${removed.join(', ')}`);
  if (edited.length) changes.push(`rule text changed: ${edited.join(', ')}`);
  if (!added.length && !removed.length && !edited.length) changes.push(`the ${target} section of the meta-prompt changed`);
  return changes;
}
