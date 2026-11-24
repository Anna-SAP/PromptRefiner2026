import {
  BRACKETED_QUESTION,
  MENTIONS_CONFLICT,
  MENTIONS_EFFORT,
  add,
  analysisSays,
  avoid,
  cites,
  drop,
  keep,
  qualified,
} from '../checks';
import type { EvalCase } from '../types';
import { block } from './text';

export const AGENT_CASES: EvalCase[] = [
  {
    id: 'agent-unattended-refunds-opus',
    category: 'multi-step-agent',
    title: 'Nightly refund run with nobody online to answer questions',
    traps: ['details'],
    target: 'claude-opus-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      Every night at 02:00 UTC, go through the Zendesk tickets tagged \`refund-request\` that were created in the last 24 hours. Check each one against our refund policy (the Notion page "Refund Policy v3"). If the refund is under $50 and the policy allows it, approve it in Stripe. Anything else goes to Slack #billing-escalations with the ticket link and a one-line reason. Nobody from the team is online at that hour, so don't wait for anyone.
    `,
    checks: [
      keep('02:00 UTC'),
      keep('refund-request'),
      keep(/24 hours/, 'keeps the 24-hour window'),
      keep('Refund Policy v3'),
      keep('$50'),
      keep('#billing-escalations'),
      keep(/Zendesk/),
      keep(/Stripe/),
      keep(/ticket link/i, 'keeps "with the ticket link"'),
      add(
        [
          /offer\w* to (continue|keep going|carry on)|ask\w* (whether|if) (to|it should|you should) continue/i,
          /next step/i,
          /milestone/i,
          /decisions? that (block|blocks) nothing|non-blocking decisions?|decisions? (that|which) (don't|do not) block/i,
        ],
        'names the early stops to avoid in an unattended run',
        2,
      ),
      avoid(
        /progress updates?|keep (me|the team|us) (posted|informed)|updates? (to|for) (me|the user|the team)/i,
        'asks for no progress updates: nobody is watching',
        'Post brief progress updates as you work.',
      ),
      cites(['opus-finish-task']),
    ],
    reference: {
      analysis:
        'Turned the run into ordered steps, kept every name, tag and threshold, and named the early stops to avoid, since nobody is online to answer during the run.',
      prompt: block`
        Run this every night at 02:00 UTC. Nobody from the team is online then, so work through the whole batch without waiting for anyone.

        1. Collect the Zendesk tickets tagged \`refund-request\` that were created in the last 24 hours.
        2. Check each ticket against the refund policy in the Notion page "Refund Policy v3".
        3. If the refund is under $50 and the policy allows it, approve it in Stripe.
        4. Post every other ticket to Slack #billing-escalations with the ticket link and a one-line reason.

        Process every ticket before you finish. Do not end on a summary that announces the next step instead of taking it, do not offer to continue, do not list decisions that block nothing, and do not pause because one ticket or one step is done. Stop early only when nothing can move without a person, or when a system you need is deliberately locked; in that case post the blocker to #billing-escalations. Refunds of $50 or more, or any the policy does not clearly allow, are never approved in this run; they go to #billing-escalations.
      `,
      rationale: [
        ['opus-finish-task', 'Named the early stops to avoid, because the run happens with nobody online to answer.'],
        ['bp-ordered-steps', 'Wrote the run as numbered steps, since each step depends on the one before.'],
      ],
    },
  },

  {
    id: 'agent-contradiction-unsettled-zh',
    category: 'multi-step-agent',
    title: 'Research task that asks for three sentences and for every plan in full',
    traps: ['contradiction', 'details'],
    target: 'claude-fable-5-2',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      帮我调研三家竞品的定价：Nimbus（https://nimbus.example.com/pricing）、Corvid（https://corvid.example.com/plans）、Tallyho（https://tallyho.example.com/pricing）。回复要尽量简短，控制在三句话以内，老板没时间看长文。每家都要把所有套餐、价格、用户数限制和存储上限完整列出来，一个都不能漏。最后告诉我我们的 Pro 套餐（¥89/人/月）在里面算贵还是便宜。
    `,
    checks: [
      keep('Nimbus'),
      keep('https://nimbus.example.com/pricing'),
      keep('Corvid'),
      keep('https://corvid.example.com/plans'),
      keep('Tallyho'),
      keep('https://tallyho.example.com/pricing'),
      keep('¥89'),
      keep(/用户数/, 'keeps the user-count limits'),
      keep(/存储/, 'keeps the storage limits'),
      add(BRACKETED_QUESTION, 'asks the user, in brackets, which of the two instructions wins'),
      analysisSays(MENTIONS_CONFLICT, 'analysis points out the conflict'),
      cites(['talk-contradictions']),
    ],
    reference: {
      analysis:
        '草稿里「控制在三句话以内」和「完整列出所有套餐」互相矛盾，草稿没说哪条优先，所以在提示词里留了一个方括号问题请你定下来；三个链接整理成了列表。',
      prompt: block`
        调研三家竞品的定价：
        - Nimbus：https://nimbus.example.com/pricing
        - Corvid：https://corvid.example.com/plans
        - Tallyho：https://tallyho.example.com/pricing

        对每一家，列出所有套餐的价格、用户数限制和存储上限。最后判断我们的 Pro 套餐（¥89/人/月）在这三家中算贵还是便宜。

        结果会交给时间很紧的老板看。[篇幅以哪条为准：控制在三句话以内，还是完整列出每家的全部套餐？]
      `,
      rationale: [
        ['talk-contradictions', '「三句话以内」和「完整列出所有套餐」无法同时满足，草稿没说哪条优先，改为在提示词里提问。'],
        ['refiner-edit', '把三家竞品和链接整理成列表。'],
      ],
    },
    pitfalls: [
      {
        name: 'smooth sentence that keeps both instructions',
        prompt: block`
          调研 Nimbus（https://nimbus.example.com/pricing）、Corvid（https://corvid.example.com/plans）和 Tallyho（https://tallyho.example.com/pricing）三家竞品的定价。

          请用不超过三句话简洁作答，同时完整列出每家的所有套餐、价格、用户数限制和存储上限。最后判断我们的 Pro 套餐（¥89/人/月）算贵还是便宜。
        `,
        analysis: '整理了竞品列表，语言更简洁。',
        fails: ['asks the user, in brackets, which of the two instructions wins', 'analysis points out the conflict'],
      },
    ],
  },

  {
    id: 'agent-contradiction-settled-sonnet',
    category: 'multi-step-agent',
    title: 'Docs agent with a docs-only rule and a newer CHANGELOG rule that the draft says wins',
    traps: ['contradiction'],
    target: 'claude-sonnet-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You're the docs maintenance agent for the acme-sdk repo. When a public API changes, update the matching pages under docs/ and fix any broken code samples there.

      Never modify files outside docs/.

      Keep each docs page's existing structure; only touch the sections the API change affects.

      For every change you make, also add a line to CHANGELOG.md in the repo root. The CHANGELOG rule is newer than the docs-only rule and wins where they clash.
    `,
    checks: [
      qualified(
        /(never|do not|don't|must not|no)\b[^.\n]{0,30}\b(modify|modif|change|edit|touch|write)\w*[^.\n]{0,30}\boutside\b/i,
        /CHANGELOG/,
        'the docs-only rule no longer stands without its CHANGELOG exception',
      ),
      keep('CHANGELOG.md'),
      keep('docs/'),
      keep('acme-sdk'),
      keep(/existing structure/i, "keeps each page's existing structure"),
      keep(/code samples?/i, 'keeps fixing broken code samples'),
      avoid(BRACKETED_QUESTION, 'asks no question: the draft says which rule wins', '[Which rule wins?]'),
      cites(['talk-contradictions', 'fable-exception-in-rule']),
    ],
    reference: {
      analysis:
        'The docs-only rule and the CHANGELOG rule clashed; the draft says the CHANGELOG rule wins, so the docs-only rule now names CHANGELOG.md as its one exception.',
      prompt: block`
        You maintain the documentation of the acme-sdk repo. When a public API changes, update the matching pages under docs/ and fix any broken code samples in them. Keep each page's existing structure and change only the sections the API change affects.

        Change only files under docs/, with one exception: for every change you make, add a line to CHANGELOG.md in the repo root.

        Once the docs are updated, stop and report what you changed; mention anything else you noticed at the end instead of changing it.
      `,
      rationale: [
        ['talk-contradictions', 'Folded the newer CHANGELOG rule into the docs-only rule as its exception, as the draft says it wins.'],
        ['sonnet-stay-in-scope', 'Asked the model to stop once the docs are updated and to mention other findings instead of acting on them.'],
      ],
    },
    pitfalls: [
      {
        name: 'clean wording that keeps both rules side by side',
        prompt: block`
          You maintain the documentation of the acme-sdk repo. When a public API changes, update the matching pages under docs/, fix any broken code samples, and keep each page's existing structure.

          Never modify files outside docs/. For every change you make, also add a line to CHANGELOG.md in the repo root.
        `,
        fails: ['the docs-only rule no longer stands without its CHANGELOG exception'],
      },
    ],
  },

  {
    id: 'agent-boosters-haiku-search',
    category: 'multi-step-agent',
    title: 'Search agent with a scratchpad, "verify three times" and "don\'t overthink" at once',
    traps: ['boosters', 'rule-interplay'],
    target: 'claude-haiku-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are a research assistant with a web search tool. The user will ask about EU AI Act obligations for their product, mostly about Article 50 transparency duties and the dates they apply from.

      Before answering, write out your reasoning inside <scratchpad> tags and think step by step. Verify each fact three times. Answer directly and don't overthink it.

      Cite the official source (eur-lex.europa.eu) for every obligation you mention.
    `,
    checks: [
      drop(/scratchpad/i, 'drops the scratchpad'),
      drop(/step by step/i, 'drops "think step by step"'),
      drop(/three times/i, 'drops "verify each fact three times"'),
      drop(/answer directly|overthink/i, 'drops "answer directly and don\'t overthink it"'),
      keep('EU AI Act'),
      keep('Article 50'),
      keep('eur-lex.europa.eu'),
      keep(/transparency/i, 'keeps the transparency duties'),
      keep(/search/i, 'keeps the search tool'),
      add(
        /\[current date\]|\[today'?s date\]|\{\{\s*(current_|today_?)?date\s*\}\}|today'?s date|current date/i,
        "gives the model today's date",
      ),
      add(
        /(may|might|could) have changed|changed since|since (your|its|the model'?s) training|out of date|outdated/i,
        'says obligations and dates may have changed since training',
      ),
      analysisSays(MENTIONS_EFFORT, 'analysis says the effort setting controls how much the model thinks'),
      cites(['haiku-search-date']),
      cites(['talk-try-harder-lines', 'haiku-no-think-less']),
    ],
    reference: {
      analysis:
        'Removed the scratchpad, "think step by step", verify-three-times and "answer directly" lines; the effort setting, not the prompt, controls how much the model thinks. Added a [current date] placeholder for your app to fill once per conversation, and a note that the rules may have changed since training.',
      prompt: block`
        You are a research assistant with a web search tool. Users ask what the EU AI Act requires of their product, mostly about the Article 50 transparency duties and the dates those duties apply from.

        Obligations, deadlines and guidance under the Act may have changed since your training, so search for them before you answer, even when you feel sure. Cite the official source (eur-lex.europa.eu) for every obligation you mention.

        Today's date: [current date]
      `,
      rationale: [
        ['haiku-search-date', "Added today's date as a placeholder after the fixed instructions, and a note to search for rules and dates that may have changed."],
        ['talk-try-harder-lines', 'Removed the scratchpad, "think step by step" and verify-three-times lines.'],
        ['haiku-no-think-less', 'Removed "answer directly and don\'t overthink it"; it does not stop the model from thinking.'],
      ],
    },
  },

  {
    id: 'agent-multiapp-details-zh',
    category: 'multi-step-agent',
    title: 'Cross-app reporting task packed with report names, links, addresses and a threshold',
    traps: ['details'],
    target: 'claude-opus-5-5',
    lang: 'zh',
    expect: 'preserve',
    draft: block`
      帮我把 Q3 的客户续约情况整理一下。数据在 Salesforce 的报表 "Q3 Renewals – APAC" 里，还有一部分在这个表格：https://docs.google.com/spreadsheets/d/1AbC_example_9xYz/edit#gid=0 （第二个 sheet，叫"手工补录"）。只看续约金额 ≥ ¥200,000 的客户。整理好以后，发邮件给 lena.wu@example.com，抄送 finance-apac@example.com，标题用「Q3 APAC 大客户续约汇总」。截止时间是 2026 年 12 月 5 日。注意别动 Salesforce 里的任何记录，财务正在做季度审计。
    `,
    checks: [
      keep('Q3 Renewals – APAC'),
      keep('https://docs.google.com/spreadsheets/d/1AbC_example_9xYz/edit#gid=0'),
      keep('手工补录'),
      keep('¥200,000'),
      keep('lena.wu@example.com'),
      keep('finance-apac@example.com'),
      keep('Q3 APAC 大客户续约汇总'),
      keep('2026 年 12 月 5 日'),
      keep(/Salesforce/),
      keep(/审计/, 'keeps why Salesforce must not be touched (the audit)'),
    ],
    reference: {
      analysis: '把数据来源、筛选条件和交付要求分开列出，所有名称、链接、邮箱、金额和日期原样保留。',
      prompt: block`
        整理 Q3 的客户续约情况，只看续约金额不低于 ¥200,000 的客户。

        数据来源：
        - Salesforce 报表 "Q3 Renewals – APAC"
        - 表格 https://docs.google.com/spreadsheets/d/1AbC_example_9xYz/edit#gid=0 的第二个 sheet「手工补录」

        Salesforce 只读：不要修改其中任何记录，财务正在做季度审计。

        整理好后发邮件给 lena.wu@example.com，抄送 finance-apac@example.com，标题为「Q3 APAC 大客户续约汇总」。截止时间是 2026 年 12 月 5 日。
      `,
      rationale: [['refiner-edit', '把数据来源、筛选条件和交付要求分开列出。']],
    },
    pitfalls: [
      {
        name: 'concise summary that paraphrases the specifics',
        prompt: block`
          整理 Q3 APAC 续约金额 20 万元以上的客户，数据来自 Salesforce 续约报表和手工补录表格。完成后发邮件给 Lena 并抄送财务团队，12 月 5 日前完成。不要修改 Salesforce 记录。
        `,
        fails: [
          'keeps "¥200,000"',
          'keeps "lena.wu@example.com"',
          'keeps "https://docs.google.com/spreadsheets/d/1AbC_example_9xYz/edit#gid=0"',
          'keeps why Salesforce must not be touched (the audit)',
        ],
      },
    ],
  },
];
