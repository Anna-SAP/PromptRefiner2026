import type { EvalCase } from '../types';
import { AGENT_CASES } from './agents';
import { CHATBOT_CASES } from './chatbots';
import { CODING_CASES } from './coding';
import { GRADING_CASES } from './grading';
import { WRITING_CASES } from './writing';

/** The golden set: every draft the eval refines and judges, in report order. */
export const CASES: readonly EvalCase[] = [
  ...CODING_CASES,
  ...AGENT_CASES,
  ...GRADING_CASES,
  ...CHATBOT_CASES,
  ...WRITING_CASES,
];

/**
 * Picks cases by id, category, trap or target. An empty filter keeps them all.
 * Unknown names are returned so the caller can report them.
 */
export function selectCases(filter: string[], cases: readonly EvalCase[] = CASES): {
  selected: EvalCase[];
  unknown: string[];
} {
  if (filter.length === 0) return { selected: [...cases], unknown: [] };
  const matches = (evalCase: EvalCase, name: string) =>
    evalCase.id === name ||
    evalCase.category === name ||
    evalCase.target === name ||
    evalCase.traps.includes(name as EvalCase['traps'][number]);
  return {
    selected: cases.filter((evalCase) => filter.some((name) => matches(evalCase, name))),
    unknown: filter.filter((name) => !cases.some((evalCase) => matches(evalCase, name))),
  };
}
