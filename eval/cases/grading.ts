import { MENTIONS_EFFORT, add, analysisSays, avoid, cites, drop, keep } from '../checks';
import type { EvalCase } from '../types';
import { block } from './text';

/** Pass/fail wording, in either language. */
const PASS_FAIL = /通过|不通过|合格|不合格|达标|是\s*\/\s*否|pass|fail/i;

export const GRADING_CASES: EvalCase[] = [
  {
    id: 'grader-undefined-scale-zh',
    category: 'grading',
    title: 'Support-reply grader on a 1–10 scale whose levels mean nothing in particular',
    traps: ['grader-scale'],
    target: 'generic',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      你是一个专业的客服质检员。请给下面这段客服回复打分，1 到 10 分，分数越高越好。主要看三点：语气是否礼貌、信息是否准确、有没有真正解决客户的问题。

      客户问题：{{customer_question}}
      客服回复：{{agent_reply}}
    `,
    checks: [
      drop(/1\s*(到|至|-|–|~)\s*10|10\s*分制/, 'drops the 1–10 scale with undefined levels'),
      add(PASS_FAIL, 'turns the criteria into pass/fail checks'),
      keep(/礼貌/, 'keeps the politeness criterion'),
      keep(/准确/, 'keeps the accuracy criterion'),
      keep(/解决/, 'keeps the problem-solved criterion'),
      keep('{{customer_question}}'),
      keep('{{agent_reply}}'),
      cites(['talk-grader-checks']),
    ],
    reference: {
      analysis: '没有定义各档含义的 1 到 10 分打分改成了三项逐一判断的通过 / 不通过检查，每项写清楚了怎样算通过，两次评审更容易给出一致的结果。',
      prompt: block`
        你是客服质检员。请按下面三项检查这段客服回复，每项只判断"通过"或"不通过"，并用一句话说明依据：

        1. 礼貌：语气礼貌，没有指责、敷衍或居高临下的措辞。
        2. 准确：回复中的信息与事实一致，没有错误或编造的内容。
        3. 解决问题：回复直接处理了客户提出的问题，客户不需要再追问就知道下一步怎么做。

        <customer_question>
        {{customer_question}}
        </customer_question>

        <agent_reply>
        {{agent_reply}}
        </agent_reply>
      `,
      rationale: [
        ['talk-grader-checks', '把没有定义各档含义的 1 到 10 分改成了三项通过 / 不通过检查。'],
        ['bp-xml-structure', '用标签把客户问题和客服回复与指令分开。'],
      ],
    },
    pitfalls: [
      {
        name: 'polished wording around the same noisy scale',
        prompt: block`
          你是资深客服质检员。请从语气是否礼貌、信息是否准确、是否真正解决了客户的问题三个方面，对下面的客服回复给出 1 到 10 分的综合评分，并简要说明理由。

          客户问题：{{customer_question}}
          客服回复：{{agent_reply}}
        `,
        fails: ['drops the 1–10 scale with undefined levels', 'turns the criteria into pass/fail checks'],
      },
    ],
  },

  {
    id: 'grader-defined-scale-opus',
    category: 'grading',
    title: 'Groundedness grader whose 1–5 levels are each defined and must survive',
    traps: ['grader-scale', 'boosters'],
    target: 'claude-opus-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are an expert evaluator. Think step by step before scoring.

      Score how well the answer is grounded in the retrieved passages, on a 1–5 scale:
      5 = every factual claim is supported by a cited passage
      4 = one minor claim lacks a citation; nothing contradicts the passages
      3 = several claims lack citations, but nothing contradicts the passages
      2 = at least one claim contradicts a passage
      1 = the answer ignores the passages or is mostly unsupported

      Return only the score and one sentence explaining it.

      <passages>{{passages}}</passages>
      <answer>{{answer}}</answer>
    `,
    checks: [
      drop(/step by step/i, 'drops "think step by step"'),
      keep(/1\s*(–|-|to)\s*5/, 'keeps the defined 1–5 scale'),
      keep('every factual claim is supported by a cited passage'),
      keep('one minor claim lacks a citation'),
      keep('several claims lack citations'),
      keep('at least one claim contradicts a passage'),
      keep('the answer ignores the passages or is mostly unsupported'),
      keep('{{passages}}'),
      keep('{{answer}}'),
      keep(/one sentence/i, 'keeps "one sentence explaining it"'),
      avoid(
        /pass\s*\/\s*fail|\bPASS\b|\bFAIL\b|binary/i,
        'keeps the defined scale instead of switching to pass/fail',
        'Mark each claim PASS or FAIL.',
      ),
      analysisSays(MENTIONS_EFFORT, 'analysis says the effort setting controls how much the model thinks'),
      cites(['talk-try-harder-lines']),
    ],
    reference: {
      analysis:
        'Removed "think step by step"; the effort setting, not the prompt, controls how much the model thinks. Kept the 1–5 scale as written, since each level is defined.',
      prompt: block`
        You are an evaluator checking whether an answer is grounded in the retrieved passages.

        Score the answer on this 1–5 scale:
        5 = every factual claim is supported by a cited passage
        4 = one minor claim lacks a citation; nothing contradicts the passages
        3 = several claims lack citations, but nothing contradicts the passages
        2 = at least one claim contradicts a passage
        1 = the answer ignores the passages or is mostly unsupported

        Return only the score and one sentence explaining it.

        <passages>
        {{passages}}
        </passages>

        <answer>
        {{answer}}
        </answer>
      `,
      rationale: [['talk-try-harder-lines', 'Removed "Think step by step before scoring."']],
    },
    pitfalls: [
      {
        name: 'over-applies the grader rule to a scale that is already defined',
        prompt: block`
          You are an evaluator checking whether an answer is grounded in the retrieved passages. Check each factual claim in the answer: mark it PASS if a cited passage supports it and FAIL otherwise, then give one sentence on the overall result.

          <passages>
          {{passages}}
          </passages>

          <answer>
          {{answer}}
          </answer>
        `,
        fails: [
          'keeps the defined 1–5 scale',
          'keeps "at least one claim contradicts a passage"',
          'keeps the defined scale instead of switching to pass/fail',
        ],
      },
    ],
  },

  {
    id: 'grader-pairwise-sonnet',
    category: 'grading',
    title: 'Comparison of two answers that scores each one out of 10 instead of choosing',
    traps: ['grader-scale'],
    target: 'claude-sonnet-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      Here are two answers to the same customer question, from two versions of our support bot. Give each answer a score out of 10 for helpfulness and a score out of 10 for accuracy, then add up the totals so we know which bot version to ship.

      Question: {{question}}
      Answer A: {{answer_a}}
      Answer B: {{answer_b}}
    `,
    checks: [
      drop(/out of 10|\/\s*10\b|\btotals?\b/i, 'drops the separate 10-point scores and their totals'),
      add(
        /which (answer|one|response) is (better|stronger|more helpful)|(choose|pick|decide) (the better|which|between)|better of the two|\bA or B\b|"A" or "B"/i,
        'keeps it a choice between the two answers',
      ),
      keep(/helpful/i, 'keeps the helpfulness criterion'),
      keep(/accura/i, 'keeps the accuracy criterion'),
      keep('{{question}}'),
      keep('{{answer_a}}'),
      keep('{{answer_b}}'),
      cites(['talk-grader-checks']),
    ],
    reference: {
      analysis:
        'The draft compares two answers, so it now asks for a choice between them instead of a 10-point score for each; separate scores on an undefined scale are noisy and add little to "which one ships".',
      prompt: block`
        Two versions of our support bot answered the same customer question. Decide which answer is better, judging helpfulness (it addresses what the customer actually asked and tells them what to do next) and accuracy (everything it states is correct). The result decides which bot version we ship.

        <question>
        {{question}}
        </question>

        <answer_a>
        {{answer_a}}
        </answer_a>

        <answer_b>
        {{answer_b}}
        </answer_b>

        Reply with "A" or "B" for the better answer and say briefly what decided it.
      `,
      rationale: [
        ['talk-grader-checks', 'Replaced the two 10-point scores per answer with a choice between the answers.'],
        ['bp-xml-structure', 'Wrapped the question and both answers in their own tags.'],
      ],
    },
    pitfalls: [
      {
        name: 'clearer wording, same per-answer scores',
        prompt: block`
          Two versions of our support bot answered the same customer question. Rate Answer A and Answer B separately, each out of 10 for helpfulness and for accuracy, and report the totals so we can choose the version to ship.

          Question: {{question}}
          Answer A: {{answer_a}}
          Answer B: {{answer_b}}
        `,
        fails: ['drops the separate 10-point scores and their totals', 'keeps it a choice between the two answers'],
      },
    ],
  },

  {
    id: 'grader-json-think-line-sonnet',
    category: 'grading',
    title: 'JSON compliance check where one rule removes "step by step" and another adds a think line',
    traps: ['boosters', 'rule-interplay'],
    target: 'claude-sonnet-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are an expense auditor. Think step by step and show your working in the response.

      Total the line items in the expense report below, apply the per-diem cap of $75 per day (hotel costs are excluded from the cap), and decide whether the report complies with travel policy FIN-7.

      Output JSON: {"compliant": boolean, "total": number, "violations": string[]}

      <report>{{expense_report}}</report>
    `,
    checks: [
      drop(/step by step/i, 'drops "think step by step"'),
      drop(/show your working/i, 'drops "show your working in the response"'),
      add(/Think the problem through before you answer/i, 'adds Sonnet 5.5\'s line "Think the problem through before you answer."'),
      keep('$75'),
      keep(/hotel/i, 'keeps the hotel exclusion'),
      keep('FIN-7'),
      keep('"compliant"'),
      keep('"total"'),
      keep('"violations"'),
      keep(/string\[\]/, 'keeps the violations type (string[])'),
      keep('{{expense_report}}'),
      cites(['sonnet-think-before-json']),
      cites(['talk-try-harder-lines', 'sonnet-no-reasoning-in-reply']),
    ],
    reference: {
      analysis:
        'Replaced "think step by step and show your working" with the line Sonnet 5.5\'s guide recommends before a JSON answer that takes working out; the working itself stays in the model\'s thinking, and the effort setting controls how much it thinks.',
      prompt: block`
        You are an expense auditor. Total the line items in the expense report below, apply the per-diem cap of $75 per day (hotel costs are excluded from the cap), and decide whether the report complies with travel policy FIN-7.

        Think the problem through before you answer.

        Output JSON: {"compliant": boolean, "total": number, "violations": string[]}

        <report>
        {{expense_report}}
        </report>
      `,
      rationale: [
        ['sonnet-think-before-json', 'Added "Think the problem through before you answer." because the JSON answer needs totalling and a rule applied first.'],
        ['talk-try-harder-lines', 'Removed "Think step by step".'],
        ['sonnet-no-reasoning-in-reply', 'Removed the request to show the working in the response.'],
      ],
    },
  },

  {
    id: 'grader-translation-boosters-fable-zh',
    category: 'grading',
    title: 'Translation-quality judge with shouting, visible reasoning and a 0–100 score',
    traps: ['boosters', 'grader-scale', 'details'],
    target: 'claude-fable-5-2',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      你是全世界最严格的翻译评审专家。请一步一步仔细思考，把你的完整思考过程写在回复里，并反复检查三遍。

      任务：评估下面这段英译中的译文质量，给出 0-100 分。重点看：术语是否符合术语表（Message Store → 消息存储；agent → 坐席）、占位符 {agent_name} 是否原样保留、语句是否通顺。

      原文：{{source}}
      译文：{{translation}}
    `,
    checks: [
      drop(/全世界最/, 'drops "全世界最严格"'),
      drop(/一步一步/, 'drops "一步一步仔细思考"'),
      drop(/思考过程写在回复/, 'drops the request to write the reasoning into the reply'),
      drop(/反复检查|检查三遍/, 'drops "反复检查三遍"'),
      drop(/0\s*(-|–|到|至|~)\s*100/, 'drops the 0–100 score with undefined levels'),
      add(PASS_FAIL, 'turns the criteria into pass/fail checks'),
      keep('Message Store'),
      keep('消息存储'),
      keep(/\bagent\b/, 'keeps the glossary source term "agent"'),
      keep('坐席'),
      keep('{agent_name}'),
      keep(/通顺/, 'keeps the fluency criterion'),
      keep('{{source}}'),
      keep('{{translation}}'),
      analysisSays(MENTIONS_EFFORT, 'analysis says the effort setting controls how much the model thinks'),
      analysisSays(/思考摘要|推理摘要|摘要|summar/i, 'analysis says the reasoning can be read in the thinking summary'),
      cites(['talk-grader-checks']),
      cites(['fable-no-reasoning-in-reply']),
      cites(['talk-try-harder-lines', 'fable-earlier-model-lines']),
    ],
    reference: {
      analysis:
        '删掉了「一步一步思考」「反复检查三遍」这类加码句：模型思考多少由思考深度（effort）设置决定，不取决于提示词措辞；也删掉了把思考过程写进回复的要求，需要看推理时可以看思考摘要。没有定义各档含义的 0-100 分改成了三项通过 / 不通过检查。',
      prompt: block`
        你是翻译评审。请按下面三项检查这段英译中的译文，每项判断"通过"或"不通过"，并用一句话说明理由：

        1. 术语：使用术语表中的译法——Message Store → 消息存储，agent → 坐席。
        2. 占位符：{agent_name} 原样保留，没有被翻译、改写或删除。
        3. 通顺：译文读起来是自然的中文，没有因直译造成的病句或歧义。

        <source>
        {{source}}
        </source>

        <translation>
        {{translation}}
        </translation>
      `,
      rationale: [
        ['talk-grader-checks', '把没有定义各档含义的 0-100 分改成了三项通过 / 不通过检查。'],
        ['fable-no-reasoning-in-reply', '删掉了把完整思考过程写进回复的要求。'],
        ['talk-try-harder-lines', '删掉了「一步一步仔细思考」和「反复检查三遍」。'],
        ['bp-calm-wording', '去掉了「全世界最严格」这类夸张的角色设定。'],
      ],
    },
  },
];
