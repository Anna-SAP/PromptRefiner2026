import {
  MENTIONS_EFFORT,
  SAYS_LITTLE_CHANGED,
  add,
  analysisSays,
  avoid,
  cites,
  drop,
  keep,
  lengthRatio,
  qualified,
  sameSentence,
  similar,
} from '../checks';
import type { EvalCase } from '../types';
import { block } from './text';

/** "Finish the whole task before reporting back", in the ways a prompt can say it. */
const FINISHES_TASK =
  /carry (the |this )?(whole |entire )?(task|work|fix|it|everything) through|finish (everything|all|the (whole |entire )?(task|job|work|fix))|until (everything|all|the (whole |entire )?(task|work|job|fix)|it is|it's)\b|before (reporting|you report|reporting back|coming back)|work through (them|it|these|those|ordinary|any|errors|obstacles)|keep (going|working) until|直到[^。\n]{0,12}(完成|做完|结束)|全部(完成|做完)|做完[^。\n]{0,8}(再|后)[^。\n]{0,4}(汇报|报告|回复)|完成(全部|所有|整个)|(自行|自己)(处理|解决|排查)/i;

export const CODING_CASES: EvalCase[] = [
  {
    id: 'coding-flaky-test-details',
    category: 'coding-agent',
    title: 'Rambling bug report whose identifiers, numbers and reasons are easy to lose',
    traps: ['details'],
    target: 'claude-fable-5-2',
    lang: 'en',
    expect: 'improve',
    draft: block`
      hey so our billing service has been flaky, can you look at it? it's in services/billing. the test that keeps failing is \`proration.spec.ts > handles mid-cycle downgrade\` and it fails with "Expected 1450 to equal 1449", maybe 1 in 5 runs on CI. I think it's a rounding thing in prorateInvoice() in src/proration/calculate.ts but not sure. ticket is BILL-2291 if you need context. you can run the tests with \`pnpm --filter billing test\`. please don't change the signature of prorateInvoice because the mobile app calls it directly and we can't ship a mobile release this month. oh and we're on Node 20.11, don't upgrade anything. thanks!!
    `,
    checks: [
      keep('services/billing'),
      keep('proration.spec.ts > handles mid-cycle downgrade'),
      keep('Expected 1450 to equal 1449'),
      keep('src/proration/calculate.ts'),
      keep('prorateInvoice'),
      keep('BILL-2291'),
      keep('pnpm --filter billing test'),
      keep('Node 20.11'),
      keep(/\b1 in 5\b|one (run )?in five|1 out of 5|one out of five|20 ?%/i, 'keeps the failure rate (1 in 5 runs)'),
      keep(/mobile app/i, 'keeps why the signature is fixed (the mobile app calls it)'),
      keep(/upgrad/i, 'keeps "do not upgrade anything"'),
      add(FINISHES_TASK, 'asks the model to carry the fix through before reporting back'),
      cites(['fable-finish-task']),
    ],
    reference: {
      analysis:
        'Collected the scattered details into one brief, kept every identifier and the reason the signature cannot change, and added an instruction to finish the fix before reporting back.',
      prompt: block`
        Fix the intermittent test failure in the billing service (services/billing).

        The failing test is \`proration.spec.ts > handles mid-cycle downgrade\`. On CI it fails in roughly 1 in 5 runs with "Expected 1450 to equal 1449". The cause may be rounding in \`prorateInvoice()\` in \`src/proration/calculate.ts\`, but that is unconfirmed, so find the actual cause before changing code. Ticket BILL-2291 has background. Run the tests with \`pnpm --filter billing test\`.

        Constraints:
        - Keep the signature of \`prorateInvoice()\` as it is: the mobile app calls it directly, and no mobile release can ship this month.
        - Stay on Node 20.11 and do not upgrade any dependencies.

        Carry the fix through before reporting back, and work through ordinary obstacles such as failing commands or confusing output yourself. Stop early only if the fix would need the signature to change, or another decision that is mine to make. In your report, explain the cause and what you changed.
      `,
      rationale: [
        ['fable-finish-task', 'Added that the model should finish the fix and handle ordinary obstacles itself before reporting back, since this is multi-step work with tools.'],
        ['bp-give-reason', 'Kept the reason the signature cannot change next to the constraint.'],
        ['refiner-edit', 'Gathered the scattered details into one brief and dropped the greeting and sign-off.'],
      ],
    },
    pitfalls: [
      {
        name: 'tidy rewrite that generalizes the specifics away',
        prompt: block`
          Investigate and fix the flaky proration test in the billing service. The failure looks like a rounding issue in the proration logic, so confirm the cause first.

          Do not change the public function signature, because the mobile app depends on it, and do not upgrade dependencies.

          Carry the fix through before reporting back, and explain the cause and the change.
        `,
        fails: [
          'keeps "BILL-2291"',
          'keeps "pnpm --filter billing test"',
          'keeps "Expected 1450 to equal 1449"',
          'keeps "Node 20.11"',
          'keeps "src/proration/calculate.ts"',
        ],
      },
    ],
  },

  {
    id: 'coding-boosters-sonnet',
    category: 'coding-agent',
    title: 'Coding task wrapped in "think step by step", triple-checking and shouted MUSTs',
    traps: ['boosters'],
    target: 'claude-sonnet-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are a world-class senior backend engineer with 20 years of experience. Take a deep breath and think step by step.

      Task: add rate limiting to the POST /api/login route in server/routes/auth.ts. Use the express-rate-limit package that's already in package.json. Limit: 5 attempts per 15 minutes per IP. When the limit is hit, return HTTP 429 with the JSON body {"error": "too_many_attempts"}.

      CRITICAL: You MUST ALWAYS write tests!!! Double-check your work at every step and be maximally thorough. Verify everything three times before you answer.
    `,
    checks: [
      drop(/step by step/i, 'drops "think step by step"'),
      drop(/deep breath/i, 'drops "take a deep breath"'),
      drop(/double-check/i, 'drops "double-check your work"'),
      drop(/maximally thorough/i, 'drops "be maximally thorough"'),
      drop(/three times/i, 'drops "verify everything three times"'),
      drop(/\b(CRITICAL|MUST|ALWAYS)\b/, 'drops the capital-letter emphasis'),
      drop(/!{2,}/, 'drops the stacked exclamation marks'),
      keep('POST /api/login'),
      keep('server/routes/auth.ts'),
      keep('express-rate-limit'),
      keep(/\b5\b[^.\n]{0,25}\b15 minutes\b/, 'keeps the limit: 5 attempts per 15 minutes'),
      keep(/per IP/i, 'keeps "per IP"'),
      keep('429'),
      keep('"too_many_attempts"'),
      keep(/(write|add)[^.\n]{0,25}tests?/i, 'still asks for tests'),
      add(
        /\brun (the |its |your )?(project'?s )?(tests?|test suite|type-?check\w*|build)\b/i,
        'asks for a real check (tests, type-check or build) before the change is reported done',
      ),
      analysisSays(MENTIONS_EFFORT, 'analysis says the effort setting controls how much the model thinks'),
      cites(['talk-try-harder-lines']),
      cites(['sonnet-verify-code']),
    ],
    reference: {
      analysis:
        'Removed the "think step by step", deep-breath, double-check and verify-three-times lines and the capital-letter emphasis; the effort setting, not the wording of the prompt, controls how much the model thinks. Kept the full spec and asked for a real check before the change is reported done.',
      prompt: block`
        You are a backend engineer working in an Express codebase.

        Add rate limiting to the \`POST /api/login\` route in \`server/routes/auth.ts\`, using the \`express-rate-limit\` package that is already in package.json. Allow 5 attempts per 15 minutes per IP. When a client goes over the limit, respond with HTTP 429 and the JSON body \`{"error": "too_many_attempts"}\`.

        Write tests for the new limit.

        Keep going until the rate limiting and its tests are both done. Before you report the change as done, run the project's tests and type-checker to exercise it, and say which check you could not run and why.
      `,
      rationale: [
        ['talk-try-harder-lines', 'Removed "think step by step", "take a deep breath" and the double-check and verify-three-times rituals, which spend tokens on current models.'],
        ['bp-calm-wording', 'Rewrote "CRITICAL: You MUST ALWAYS write tests!!!" as a plain request for tests.'],
        ['sonnet-verify-code', 'Asked for the tests and type-checker to be run before the change is reported done.'],
        ['sonnet-finish-task', 'Asked the model to keep going until the limit and its tests are both done.'],
      ],
    },
  },

  {
    id: 'coding-exception-rule-zh',
    category: 'coding-agent',
    title: 'Ban on pushing to main whose exception sits three paragraphs later',
    traps: ['boosters', 'details'],
    target: 'claude-fable-5-2',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      帮我在 feat/export-csv 分支上把订单导出功能做完：后端接口 GET /api/orders/export 要支持按日期范围筛选（参数 from、to，格式 YYYY-MM-DD），导出的 CSV 第一行是表头，金额保留两位小数。

      绝对不要 push 到 main 分支！！！

      提交前跑一下 make lint 和 make test。

      对了，如果我在 PR 里回复了 LGTM，你就可以自己合并到 main。
    `,
    checks: [
      keep('feat/export-csv'),
      keep('GET /api/orders/export'),
      keep('YYYY-MM-DD'),
      keep(/from[^\n]{0,6}to/, 'keeps the from / to parameters'),
      keep(/表头/, 'keeps the header row'),
      keep(/两位小数/, 'keeps two decimal places'),
      keep('make lint'),
      keep('make test'),
      qualified(
        /(不要|不得|禁止|别|不能|不可|切勿|严禁|never|do not|don't)[^。;!?\n]{0,20}(push|推送|合并|merge)[^。;!?\n]{0,20}main/i,
        /LGTM/,
        'every ban on pushing to main states its LGTM exception in the same sentence',
      ),
      sameSentence([/main/, /LGTM/], 'the LGTM exception is still tied to main'),
      drop(/!{2,}/, 'drops the stacked exclamation marks'),
      drop(/绝对/, 'drops the "绝对" emphasis'),
      cites(['fable-exception-in-rule']),
    ],
    reference: {
      analysis: '把写在末尾的 LGTM 例外并进了「不要 push 到 main」这条规则本身，去掉了「绝对」和连串感叹号，并补了一句把功能做完再汇报。',
      prompt: block`
        在 feat/export-csv 分支上完成订单导出功能：

        - 后端接口 GET /api/orders/export 支持按日期范围筛选，参数为 from 和 to，格式 YYYY-MM-DD。
        - 导出的 CSV 第一行是表头，金额保留两位小数。

        提交前运行 make lint 和 make test。

        在我于 PR 里回复 LGTM 之前，不要 push 到 main；收到 LGTM 后，你可以自己把分支合并到 main。

        把功能做完再汇报：遇到报错、测试失败这类常见问题，自己排查解决；只有需要我做决定时才停下来问我。
      `,
      rationale: [
        ['fable-exception-in-rule', '把「收到 LGTM 后可以合并」这个例外写进了禁止 push 到 main 的同一句里。'],
        ['bp-calm-wording', '去掉了「绝对」和三个感叹号，用平实的语气陈述这条规则。'],
        ['fable-finish-task', '补充了把功能做完再汇报、自行处理常见问题的要求。'],
      ],
    },
    pitfalls: [
      {
        name: 'calm wording, but the ban and its exception still live apart',
        prompt: block`
          在 feat/export-csv 分支上完成订单导出功能：后端接口 GET /api/orders/export 支持按日期范围筛选（参数 from、to，格式 YYYY-MM-DD），导出的 CSV 第一行是表头，金额保留两位小数。

          不要 push 到 main 分支。

          提交前运行 make lint 和 make test。如果我在 PR 里回复了 LGTM，你可以自己合并到 main。
        `,
        fails: ['every ban on pushing to main states its LGTM exception in the same sentence'],
      },
    ],
  },

  {
    id: 'coding-frontend-opus-zh',
    category: 'coding-agent',
    title: 'Landing page that asks for "no AI look" without saying what that means',
    traps: ['details'],
    target: 'claude-opus-5-5',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      帮我做一个 Tidewater 的产品落地页，用 Next.js 15 + Tailwind。Tidewater 是给小型船队用的燃油管理 SaaS。页面要有：首屏（标题 + 一句话卖点 + "预约演示"按钮）、三个功能卡片（实时油耗监控、航线优化、月度报表）、客户评价、价格（Starter $49/月，Fleet $199/月）、页脚。主色用 #0F766E。不要做成那种 AI 味很重的通用设计。
    `,
    checks: [
      keep('Tidewater'),
      keep('Next.js 15'),
      keep('Tailwind'),
      keep(/燃油管理/, 'keeps what the product is (fuel management)'),
      keep('预约演示'),
      keep('实时油耗监控'),
      keep('航线优化'),
      keep('月度报表'),
      keep(/客户评价/, 'keeps the testimonials section'),
      keep('$49'),
      keep('$199'),
      keep('#0F766E'),
      add(
        [/米色|米白|奶油|off-white|cream/i, /斜体|italic/i, /01\s*\/\s*02|编号/, /等宽|monospace/i, /胶囊|pill/i],
        'names at least three of the design defaults to avoid',
        3,
      ),
      cites(['opus-frontend-patterns']),
    ],
    reference: {
      analysis: '把「不要 AI 味很重的通用设计」换成了具体要避开的默认样式，页面结构整理成清单，名称、价格和色值原样保留。',
      prompt: block`
        为 Tidewater 做一个产品落地页，技术栈用 Next.js 15 + Tailwind。Tidewater 是面向小型船队的燃油管理 SaaS。

        页面包含：
        - 首屏：标题、一句话卖点和"预约演示"按钮
        - 三张功能卡片：实时油耗监控、航线优化、月度报表
        - 客户评价
        - 价格：Starter $49/月，Fleet $199/月
        - 页脚

        主色使用 #0F766E。

        视觉上要有辨识度，避开这些常见的默认做法：米色或米白背景、标题里用斜体强调词、"01 / 02 / 03" 式的编号小节标签、等宽字体标签，以及胶囊形按钮。
      `,
      rationale: [
        ['opus-frontend-patterns', '把笼统的「不要 AI 味」换成了具体要避开的默认样式。'],
        ['refiner-edit', '把页面各部分整理成清单，信息原样保留。'],
      ],
    },
  },

  {
    id: 'coding-review-already-good',
    category: 'coding-agent',
    title: 'Focused code-review request that should come back nearly unchanged',
    traps: ['already-good', 'details'],
    target: 'generic',
    lang: 'en',
    expect: 'preserve',
    draft: block`
      Review the diff below for concurrency bugs only. Style and formatting are handled by our linter (ruff), so skip those. For each issue, give the line number, why it is a bug, and the smallest fix. If you find no concurrency bugs, say so plainly.

      <diff>
      @@ -41,7 +41,9 @@ class TokenCache:
           def get(self, key):
      -        with self._lock:
      -            return self._data.get(key)
      +        if key in self._data:
      +            return self._data[key]
      +        with self._lock:
      +            return self._data.get(key)
      </diff>
    `,
    checks: [
      similar(0.8),
      lengthRatio(1.5),
      keep('ruff'),
      keep('if key in self._data:'),
      keep('return self._data[key]'),
      keep('with self._lock:'),
      keep(/concurrency/i, 'keeps the concurrency-only scope'),
      keep(/line number/i, 'keeps "line number"'),
      keep(/smallest|minimal/i, 'keeps "the smallest fix"'),
      avoid(/severity|priority/i, 'adds no severity or priority ratings', 'Rate each issue by severity.'),
      analysisSays(SAYS_LITTLE_CHANGED, 'analysis says little needed changing'),
    ],
    reference: {
      analysis:
        'The draft is already focused: it sets the scope, says what to skip and why, and describes each finding. Left it as it is.',
      prompt: block`
        Review the diff below for concurrency bugs only. Style and formatting are handled by our linter (ruff), so skip those. For each issue, give the line number, why it is a bug, and the smallest fix. If you find no concurrency bugs, say so plainly.

        <diff>
        @@ -41,7 +41,9 @@ class TokenCache:
             def get(self, key):
        -        with self._lock:
        -            return self._data.get(key)
        +        if key in self._data:
        +            return self._data[key]
        +        with self._lock:
        +            return self._data.get(key)
        </diff>
      `,
      rationale: [],
    },
  },
];
