import type { TargetModel } from './protocol';

/**
 * The prompting rules the meta-prompt applies, and where each one comes from.
 *
 * Every rule here is taken from one of Anthropic's published prompting guides.
 * The model that does the refinement is given the rules for the chosen target
 * and cites them by id in its <rationale> block; the app then looks the id up
 * here to show the rule, its source section and the link. The model never
 * writes a link itself, so a link in the UI can only be one listed in this file.
 *
 * Section anchors were checked against the `id` attributes of the headings on
 * the live pages. `npm run check:links` repeats that check.
 */

export type GuideId = 'best-practices' | 'fable-5-2' | 'opus-5-5' | 'sonnet-5-5' | 'haiku-5-5';

const DOCS_BASE = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering';

export const GUIDES: Record<GuideId, { title: string; url: string }> = {
  'best-practices': { title: 'Prompting best practices', url: `${DOCS_BASE}/claude-prompting-best-practices` },
  'fable-5-2': { title: 'Prompting Claude Fable 5.2', url: `${DOCS_BASE}/prompting-claude-fable-5-2` },
  'opus-5-5': { title: 'Prompting Claude Opus 5.5', url: `${DOCS_BASE}/prompting-claude-opus-5-5` },
  'sonnet-5-5': { title: 'Prompting Claude Sonnet 5.5', url: `${DOCS_BASE}/prompting-claude-sonnet-5-5` },
  'haiku-5-5': { title: 'Prompting Claude Haiku 5.5', url: `${DOCS_BASE}/prompting-claude-haiku-5-5` },
};

export interface RuleSource {
  guide: GuideId;
  /** The section heading as it reads on the page. */
  section: string;
  /** The heading's `id` on the page, without the leading `#`. */
  anchor: string;
}

export function sourceUrl(source: RuleSource): string {
  return `${GUIDES[source.guide].url}#${source.anchor}`;
}

export interface PromptRule {
  id: string;
  /** Short name, shown as the rule's heading in the rationale panel. */
  title: string;
  /** What the refinement model is told to do. Shown to the user as the rule's text. */
  instruction: string;
  sources: RuleSource[];
  /**
   * Who the source guide wrote the rule for: every current Claude model, or one
   * model. A rule can be applied to a target outside its scope (see
   * `fable-exception-in-rule`); the UI says so when that happens.
   */
  scope: 'all' | Exclude<TargetModel, 'generic'>;
  /** The scope in words, as the user reads it. */
  appliesTo: string;
  /** Anything the user should know about how far the source backs the rule. */
  note?: string;
}

/**
 * Rule id for an edit that rests on Prompt Refiner's own editing approach
 * rather than on a rule from a guide. It has no source, and the UI says so.
 */
export const REFINER_EDIT_RULE = 'refiner-edit';

const ALL_MODELS = 'All current Claude models';
const FABLE_MODELS = 'Claude Fable 5.2 and Claude Mythos 5.2';

const bp = (section: string, anchor: string): RuleSource => ({ guide: 'best-practices', section, anchor });

const RULES: PromptRule[] = [
  // --- Prompting best practices: techniques for all current models -----------
  {
    id: 'bp-clear-direct',
    title: 'Be clear and direct',
    instruction:
      'State explicitly what output is wanted and the constraints on it. If the draft wants more than the bare minimum, such as a fuller feature set or extra polish, have the prompt ask for that outright instead of leaving the model to infer it.',
    sources: [bp('Be clear and direct', 'be-clear-and-direct')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-ordered-steps',
    title: 'Number the steps when order matters',
    instruction:
      'Write instructions as numbered steps when the order or the completeness of the steps matters.',
    sources: [bp('Be clear and direct', 'be-clear-and-direct')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-give-reason',
    title: 'Give the reason behind an instruction',
    instruction:
      'Where the draft gives or plainly implies the reason for an instruction or constraint, put the reason in the prompt in place of a bare command such as "NEVER use ellipses". The model generalizes from the explanation.',
    sources: [bp('Add context to improve performance', 'add-context-to-improve-performance')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-examples',
    title: 'Mark examples as examples',
    instruction:
      'When the draft includes examples, wrap each one in <example> tags, and several in <examples> tags, so the model can tell them from instructions.',
    sources: [bp('Use examples effectively', 'use-examples-effectively')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-xml-structure',
    title: 'Separate kinds of content with XML tags',
    instruction:
      'When a prompt mixes instructions, context, examples and input material, wrap each kind in its own descriptively named XML tag, and use the same tag names throughout.',
    sources: [bp('Structure prompts with XML tags', 'structure-prompts-with-xml-tags')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-long-context',
    title: 'Long material first, request last',
    instruction:
      'When the prompt carries long documents or data, put that material at the top and the request after it. Wrap each of several documents in <document> tags with its source.',
    sources: [bp('Long context prompting', 'long-context-prompting')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-role',
    title: 'Keep a role that sets domain or tone',
    instruction:
      'Keep a role line that sets the domain or tone for the task. One sentence is enough.',
    sources: [bp('Give Claude a role', 'give-claude-a-role')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-positive-format',
    title: 'Say what format to use, not what to avoid',
    instruction:
      'Phrase a formatting wish as what to do: "write in flowing prose paragraphs", not "do not use markdown".',
    sources: [bp('Control the format of responses', 'control-the-format-of-responses')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-explicit-action',
    title: 'Ask for the action, not for suggestions',
    instruction:
      'If the draft wants the model to make a change, word it as an instruction to make it ("Change this function…"), not as a request for suggestions ("Can you suggest…"). If the draft wants advice only, say that.',
    sources: [bp('Tool usage', 'tool-usage')],
    scope: 'all',
    appliesTo: ALL_MODELS,
  },
  {
    id: 'bp-calm-wording',
    title: 'Plain wording instead of shouted emphasis',
    instruction:
      'Replace forceful wording such as "CRITICAL: You MUST use this tool when…" with plain phrasing such as "Use this tool when…". A model that follows instructions closely can over-apply a shouted rule.',
    sources: [bp('Tool usage', 'tool-usage')],
    scope: 'all',
    appliesTo: ALL_MODELS,
    note: 'The guide reports this effect on Claude Opus 4.5 and Claude Opus 4.6.',
  },
  // Owner-requested rule 1, as far as the cross-model guide supports it.
  {
    id: 'bp-finish-task',
    title: 'Finish the task; stop only before hard-to-reverse actions',
    instruction:
      'When the prompt sets up multi-step or tool-using work, have it tell the model to carry the whole task through before reporting back and to handle ordinary obstacles itself. Local, reversible actions can go ahead. The model stops to ask only before an action that is hard to reverse, affects shared systems or could be destructive, or when a decision is the user\'s to make.',
    sources: [bp('Balancing autonomy and safety', 'balancing-autonomy-and-safety')],
    scope: 'all',
    appliesTo: ALL_MODELS,
    note: 'The linked section covers which actions go ahead and which need confirmation; its example names Claude Opus 4.6. "Finish before reporting" is Prompt Refiner\'s own rule. The model-specific guides state it for their own models.',
  },

  // --- Prompting Claude Fable 5.2 ---------------------------------------------
  // Owner-requested rule 1.
  {
    id: 'fable-finish-task',
    title: 'Finish the whole task',
    instruction:
      'When the prompt sets up multi-step or tool-using work, have it tell the model to finish everything that was asked before reporting back, and to diagnose ordinary obstacles such as errors, timeouts, failing tools or empty results and work through them itself. The model stops early only when the work cannot move without the user\'s decision, when a blocker was put there deliberately, or before a risky or irreversible action, which still needs confirmation.',
    sources: [{ guide: 'fable-5-2', section: 'Finish the whole task', anchor: 'finish-the-whole-task' }],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-approval-scope',
    title: 'Name the exact actions an approval rule covers',
    instruction:
      'When the prompt has approval rules, name the exact actions each one covers. This model applies such a rule as written, so a broad category such as "sending messages to people outside this conversation" also holds back routine work. Narrow a rule only with what the draft says; where the draft does not say, use a bracketed placeholder.',
    sources: [{ guide: 'fable-5-2', section: 'Approvals', anchor: 'approvals' }],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  // Owner-requested rule 2. Listed for every target; see TARGET_RULE_IDS.
  {
    id: 'fable-exception-in-rule',
    title: 'Write the exception into the rule',
    instruction:
      'Write an approval rule or prohibition with its exception in the same sentence: "Do not deploy until I have given the go-ahead", not a bare "NEVER deploy" with the exception stated somewhere else. Keep the rule\'s scope and reason with it.',
    sources: [
      { guide: 'fable-5-2', section: 'Keep caution from piling up', anchor: 'keep-caution-from-piling-up' },
      {
        guide: 'fable-5-2',
        section: 'Review instructions written for earlier models',
        anchor: 'review-instructions-written-for-earlier-models',
      },
    ],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-earlier-model-lines',
    title: 'Remove lines written for earlier models',
    instruction:
      'Remove lines that no longer work on this model: instructions to think less or to "answer directly without deliberating" (they do not stop it from thinking; say in the analysis that a lower effort setting is the control), and rigid style limits such as "one instruction per sentence, in 20 words or fewer" (they can make its prose choppy).',
    sources: [
      {
        guide: 'fable-5-2',
        section: 'Review instructions written for earlier models',
        anchor: 'review-instructions-written-for-earlier-models',
      },
    ],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-no-reasoning-in-reply',
    title: 'Do not ask for the reasoning in the reply',
    instruction:
      'Remove instructions that ask the model to write out its reasoning or chain of thought in the reply; a request can be declined for that. Say in the analysis that the reasoning can be read from summarized thinking blocks instead.',
    sources: [{ guide: 'fable-5-2', section: 'Safeguard refusals', anchor: 'safeguard-refusals' }],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-code-ownership',
    title: 'Say who owns the code',
    instruction:
      'For coding work where the draft shows how much freedom the model has: if the draft wants the model to restructure the code and fix related problems as it goes, say that the codebase is the model\'s own to shape. If the draft wants the smallest possible change to someone else\'s code, leave any ownership statement out.',
    sources: [{ guide: 'fable-5-2', section: 'Say who owns the code', anchor: 'say-who-owns-the-code' }],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-progress-updates',
    title: 'Ask for updates when someone is watching',
    instruction:
      'When the draft says a person will follow a long task as it runs, have the prompt ask for a line on what the model is about to do before it starts, brief updates while it works, and a short closing recap that stands on its own.',
    sources: [
      {
        guide: 'fable-5-2',
        section: 'Keep users informed during long turns',
        anchor: 'keep-users-informed-during-long-turns',
      },
    ],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },
  {
    id: 'fable-readable-report',
    title: 'Make the final report stand on its own',
    instruction:
      'When the draft asks for a final report or handoff after long work, have the prompt say that the reader has not seen the work: the report is self-contained, puts the key points first, uses plain words, and uses no term coined along the way.',
    sources: [{ guide: 'fable-5-2', section: 'Make reports easy to follow', anchor: 'make-reports-easy-to-follow' }],
    scope: 'claude-fable-5-2',
    appliesTo: FABLE_MODELS,
  },

  // --- Prompting Claude Opus 5.5 -----------------------------------------------
  // Owner-requested rule 1.
  {
    id: 'opus-finish-task',
    title: 'Name the early stops to avoid',
    instruction:
      'When the prompt sets up multi-step work that runs with nobody there to answer, have it name the early stops to avoid: ending on a summary that announces the next step instead of taking it, offering to continue, listing decisions that block nothing, and pausing because a milestone is done. The model carries on with whatever does not depend on the user\'s answer. Have the prompt also name the stops that are wanted: nothing can move without the user, or the blocker is deliberately protected. Risky or destructive actions still need confirmation. Leave this out when a person is there to answer.',
    sources: [{ guide: 'opus-5-5', section: 'Unattended agentic runs', anchor: 'unattended-agentic-runs' }],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },
  {
    id: 'opus-no-think-lines',
    title: 'Drop "think carefully" lines from chat prompts',
    instruction:
      'In a system prompt for a chat application, remove lines that tell the model to think carefully before answering. This model decides how much to think, and the effort setting is the control; say so in the analysis.',
    sources: [
      {
        guide: 'opus-5-5',
        section: 'Thinking instructions in chat system prompts',
        anchor: 'thinking-instructions-in-chat-system-prompts',
      },
    ],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },
  {
    id: 'opus-no-reasoning-in-reply',
    title: 'Do not ask for the reasoning in the reply',
    instruction:
      'Remove instructions that ask the model to write out its reasoning in the reply; a request can be declined for that. A short explanation of the answer, or a summary of the actions taken, is still fine to ask for.',
    sources: [{ guide: 'opus-5-5', section: 'Safeguard refusals', anchor: 'safeguard-refusals' }],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },
  {
    id: 'opus-explore-first',
    title: 'Look around before acting across apps',
    instruction:
      'For loosely specified work across several connected apps (email, documents, spreadsheets, customer records), have the prompt tell the model to look through the sources that could be relevant, including ones the task does not mention, before it changes anything.',
    sources: [
      {
        guide: 'opus-5-5',
        section: 'Explore context in multiapp workflows',
        anchor: 'explore-context-in-multi-app-workflows',
      },
    ],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },
  {
    id: 'opus-progress-updates',
    title: 'Ask for updates at set points',
    instruction:
      'When the draft says a person will follow a long task and wants updates at predictable points, have the prompt ask for a one-line statement of intent before the first tool call and a short recap at the end.',
    sources: [
      { guide: 'opus-5-5', section: 'User-facing progress updates', anchor: 'user-facing-progress-updates' },
    ],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },
  {
    id: 'opus-frontend-patterns',
    title: 'Name the design patterns to avoid',
    instruction:
      'For frontend work where the draft wants a look that is not generic, replace a general request such as "avoid a generic AI look" with the specific patterns to avoid. The guide names this model\'s defaults: a cream or off-white background, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, and pill-shaped buttons.',
    sources: [{ guide: 'opus-5-5', section: 'Frontend design defaults', anchor: 'frontend-design-defaults' }],
    scope: 'claude-opus-5-5',
    appliesTo: 'Claude Opus 5.5',
  },

  // --- Prompting Claude Sonnet 5.5 ---------------------------------------------
  // Owner-requested rule 1.
  {
    id: 'sonnet-finish-task',
    title: 'Carry the work through',
    instruction:
      'When the prompt sets up multi-step or tool-using work, have it tell the model to keep working until everything asked for is done, and to stop to ask only when it cannot go on without the user or before a risky step.',
    sources: [{ guide: 'sonnet-5-5', section: 'Steer initiative and scope', anchor: 'steer-initiative-and-scope' }],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-stay-in-scope',
    title: 'Keep changes to what was asked',
    instruction:
      'When the draft wants changes limited to what was asked, have the prompt say to stop and report once the work is done and checked, and to mention possible extras (features, tests, files, docs, refactors) at the end instead of adding them.',
    sources: [{ guide: 'sonnet-5-5', section: 'Steer initiative and scope', anchor: 'steer-initiative-and-scope' }],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-ideas-first',
    title: 'Ideas or a plan means stop there',
    instruction:
      'When the draft asks for ideas, options or a plan, have the prompt say to give that and stop, and not to start building or changing anything until told to go ahead.',
    sources: [{ guide: 'sonnet-5-5', section: 'Steer initiative and scope', anchor: 'steer-initiative-and-scope' }],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-think-before-json',
    title: 'Ask it to think before a JSON answer',
    instruction:
      'When the prompt asks for a JSON answer to a task that takes a few steps of working out, such as totalling figures, applying a rule or ranking items, add the line "Think the problem through before you answer."',
    sources: [
      { guide: 'sonnet-5-5', section: 'Reasoning tasks with JSON output', anchor: 'reasoning-tasks-with-json-output' },
    ],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-current-facts',
    title: 'Search for details that may have changed',
    instruction:
      'Remove lines that discourage tool use, such as "only use tools when strictly necessary" or "minimize tool calls". When the prompt gives the model a search tool and the answer depends on details that may have changed (what is allowed, required or charged), have it say to search for those even when the model feels confident.',
    sources: [
      {
        guide: 'sonnet-5-5',
        section: 'Tool use in chat and knowledge work',
        anchor: 'tool-use-in-chat-and-knowledge-work',
      },
    ],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-verify-code',
    title: 'Run a real check before reporting code done',
    instruction:
      'For coding work, have the prompt ask the model to run a real check that exercises the change (the project\'s tests, type-checker or build) before it reports the change done, and to say which check it could not run and why.',
    sources: [
      { guide: 'sonnet-5-5', section: 'Verification on coding tasks', anchor: 'verification-on-coding-tasks' },
    ],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-progress-updates',
    title: 'Let findings out before the final answer',
    instruction:
      'Remove older instructions such as "hold all findings for the final response". When the draft wants updates at set points, have the prompt ask for a line on what the model is about to do before its first tool call and a short recap at the end.',
    sources: [
      { guide: 'sonnet-5-5', section: 'User-facing progress updates', anchor: 'user-facing-progress-updates' },
    ],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-no-think-less',
    title: 'Remove "think less" lines',
    instruction:
      'Remove lines that ask the model to think less; they do not reliably reduce its thinking. Say in the analysis that a lower effort setting is the control.',
    sources: [{ guide: 'sonnet-5-5', section: 'Calibrate effort', anchor: 'calibrate-effort' }],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },
  {
    id: 'sonnet-no-reasoning-in-reply',
    title: 'Do not ask for the reasoning in the reply',
    instruction:
      'Remove instructions that ask the model to include its reasoning in the reply; they invite a declined request. A short explanation of the answer, or a summary of the actions taken, is still fine to ask for.',
    sources: [{ guide: 'sonnet-5-5', section: 'Safeguard refusals', anchor: 'safeguard-refusals' }],
    scope: 'claude-sonnet-5-5',
    appliesTo: 'Claude Sonnet 5.5',
  },

  // --- Prompting Claude Haiku 5.5 ----------------------------------------------
  // Owner-requested rule 1.
  {
    id: 'haiku-finish-task',
    title: 'Prevent early stopping',
    instruction:
      'When the prompt sets up multi-step or tool-using work, have it tell the model to keep working until everything asked for is done, and to stop to ask only when it cannot go on without the user or before a risky step. Once the work is done and checked, the model stops and reports; it mentions possible extra features, docs or refactors at the end instead of adding them.',
    sources: [
      {
        guide: 'haiku-5-5',
        section: 'Prevent early stopping in long agent prompts',
        anchor: 'prevent-early-stopping-in-long-agent-prompts',
      },
    ],
    scope: 'claude-haiku-5-5',
    appliesTo: 'Claude Haiku 5.5',
  },
  {
    id: 'haiku-verify-code',
    title: 'Tell coding agents to verify their changes',
    instruction:
      'For coding work, have the prompt ask the model to run a real check that exercises the change (the project\'s tests, type-checker or build) before it reports the change done, and to say which check it could not run and why.',
    sources: [
      {
        guide: 'haiku-5-5',
        section: 'Tell coding agents to verify their changes',
        anchor: 'tell-coding-agents-to-verify-their-changes',
      },
    ],
    scope: 'claude-haiku-5-5',
    appliesTo: 'Claude Haiku 5.5',
  },
  {
    id: 'haiku-search-date',
    title: 'Give the date with a search tool',
    instruction:
      'When the prompt gives the model a search tool, include today\'s date, as the placeholder [current date] if the draft gives none. Have the prompt say that records, prices, versions, rules and anything "latest" may have changed since the model\'s training, so it searches for those before it answers. Do not use a blanket instruction to search for every factual question.',
    sources: [{ guide: 'haiku-5-5', section: 'Accurate search results', anchor: 'accurate-search-results' }],
    scope: 'claude-haiku-5-5',
    appliesTo: 'Claude Haiku 5.5',
  },
  {
    id: 'haiku-hold-system-prompt',
    title: 'Keep chatbots to their system prompt',
    instruction:
      'For the system prompt of a chatbot or support assistant, add that its rules hold for the whole conversation: when a user argues, gives a sympathetic reason, asks for just a small part, says that someone approved an exception, or keeps asking.',
    sources: [
      {
        guide: 'haiku-5-5',
        section: 'Keep chatbots to their system prompt',
        anchor: 'keep-chatbots-to-their-system-prompt',
      },
    ],
    scope: 'claude-haiku-5-5',
    appliesTo: 'Claude Haiku 5.5',
  },
  {
    id: 'haiku-no-think-less',
    title: 'Remove "answer directly" lines',
    instruction:
      'Remove lines that tell the model to answer directly or to think less; they do not stop it from thinking. Say in the analysis that a lower effort setting is the control.',
    sources: [
      { guide: 'haiku-5-5', section: 'Use effort to control thinking', anchor: 'use-effort-to-control-thinking' },
    ],
    scope: 'claude-haiku-5-5',
    appliesTo: 'Claude Haiku 5.5',
  },
];

const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export function findRule(id: string): PromptRule | undefined {
  return RULES_BY_ID.get(id);
}

export const ALL_RULES: readonly PromptRule[] = RULES;

/** The cross-model techniques. Each model's own guide says to use them alongside it. */
const GENERAL_RULE_IDS = [
  'bp-clear-direct',
  'bp-ordered-steps',
  'bp-give-reason',
  'bp-examples',
  'bp-xml-structure',
  'bp-long-context',
  'bp-role',
  'bp-positive-format',
  'bp-explicit-action',
  'bp-calm-wording',
];

/**
 * "Write the exception into the rule" comes from the Claude Fable 5.2 guide,
 * the only guide that states it. The owner of this tool wants it applied to
 * every target, so it is listed for all of them; for the others the UI says
 * that the rule was written for a different model.
 */
const EXCEPTION_RULE_ID = 'fable-exception-in-rule';

const TARGET_RULE_IDS: Record<TargetModel, string[]> = {
  'claude-fable-5-2': [
    'fable-finish-task',
    'fable-approval-scope',
    EXCEPTION_RULE_ID,
    'fable-earlier-model-lines',
    'fable-no-reasoning-in-reply',
    'fable-code-ownership',
    'fable-progress-updates',
    'fable-readable-report',
    ...GENERAL_RULE_IDS,
  ],
  'claude-opus-5-5': [
    'opus-finish-task',
    EXCEPTION_RULE_ID,
    'opus-no-think-lines',
    'opus-no-reasoning-in-reply',
    'opus-explore-first',
    'opus-progress-updates',
    'opus-frontend-patterns',
    ...GENERAL_RULE_IDS,
  ],
  'claude-sonnet-5-5': [
    'sonnet-finish-task',
    EXCEPTION_RULE_ID,
    'sonnet-stay-in-scope',
    'sonnet-ideas-first',
    'sonnet-think-before-json',
    'sonnet-current-facts',
    'sonnet-verify-code',
    'sonnet-progress-updates',
    'sonnet-no-think-less',
    'sonnet-no-reasoning-in-reply',
    ...GENERAL_RULE_IDS,
  ],
  'claude-haiku-5-5': [
    'haiku-finish-task',
    EXCEPTION_RULE_ID,
    'haiku-verify-code',
    'haiku-search-date',
    'haiku-hold-system-prompt',
    'haiku-no-think-less',
    ...GENERAL_RULE_IDS,
  ],
  generic: ['bp-finish-task', EXCEPTION_RULE_ID, ...GENERAL_RULE_IDS],
};

export function rulesForTarget(target: TargetModel): PromptRule[] {
  return TARGET_RULE_IDS[target].map((id) => {
    const rule = RULES_BY_ID.get(id);
    if (!rule) throw new Error(`Unknown rule id in target list: ${id}`);
    return rule;
  });
}

/** True when the rule's source guide was written for a model other than the target. */
export function isOutsideScope(rule: PromptRule, target: TargetModel): boolean {
  return rule.scope !== 'all' && rule.scope !== target;
}

export interface TargetInfo {
  label: string;
  /** The guides whose rules the meta-prompt uses for this target, most specific first. */
  guides: GuideId[];
}

export const TARGETS: Record<TargetModel, TargetInfo> = {
  'claude-fable-5-2': {
    label: 'Claude Fable 5.2',
    guides: ['fable-5-2', 'best-practices'],
  },
  'claude-opus-5-5': {
    label: 'Claude Opus 5.5',
    guides: ['opus-5-5', 'best-practices'],
  },
  'claude-sonnet-5-5': {
    label: 'Claude Sonnet 5.5',
    guides: ['sonnet-5-5', 'best-practices'],
  },
  'claude-haiku-5-5': {
    label: 'Claude Haiku 5.5',
    guides: ['haiku-5-5', 'best-practices'],
  },
  generic: {
    label: 'Generic',
    guides: ['best-practices'],
  },
};
