import {
  BRACKETED_QUESTION,
  MENTIONS_CONFLICT,
  MENTIONS_EFFORT,
  SAYS_LITTLE_CHANGED,
  add,
  analysisSays,
  avoid,
  cites,
  drop,
  keep,
  lengthRatio,
  order,
  similar,
} from '../checks';
import type { EvalCase } from '../types';
import { block } from './text';

export const CHATBOT_CASES: EvalCase[] = [
  {
    id: 'chatbot-timestamp-prefix',
    category: 'chatbot',
    title: 'Bank support system prompt that opens with the current time and a request id',
    traps: ['cache-prefix', 'details'],
    target: 'generic',
    lang: 'en',
    expect: 'improve',
    draft: block`
      Current time: {{now}}
      Request ID: {{request_id}}
      Customer: {{user_name}} (account tier: {{tier}})

      You are the virtual assistant for Lumen Bank's customer support. Help customers with card, transfer and account questions. Never ask for a full card number, PIN or online banking password — Lumen Bank staff never ask for these, and fraudsters do. If a customer reports a lost or stolen card, give them the 24/7 hotline 0800 555 0199 straight away. For anything about loans or mortgages, refer them to an adviser during business hours (Mon–Fri, 8am–8pm GMT).
    `,
    checks: [
      drop(/\{\{now\}\}/, 'takes the per-request time out of the system prompt'),
      drop(/\{\{request_id\}\}/, 'takes the per-request id out of the system prompt'),
      order(
        [/Lumen Bank/, /\bPIN\b/, /0800 555 0199/, /mortgage/i],
        /\{\{user_name\}\}/,
        'puts the fixed instructions before the per-session customer details',
      ),
      keep('{{user_name}}'),
      keep('{{tier}}'),
      keep('0800 555 0199'),
      keep('24/7'),
      keep(/Mon[–-]Fri/, 'keeps the adviser days (Mon–Fri)'),
      keep(/8am[–-]8pm GMT/, 'keeps the adviser hours (8am–8pm GMT)'),
      keep(/\bPIN\b/, 'keeps the PIN in the never-ask list'),
      keep(/fraudster/i, 'keeps why staff never ask for these details'),
      keep(/lost or stolen/i, 'keeps the lost-or-stolen-card case'),
      keep(/loans? or mortgages?/i, 'keeps the loans-and-mortgages referral'),
      analysisSays(/user (message|turn)|user's message|用户消息/i, 'analysis says per-request values belong in the user message'),
      cites(['talk-stable-prefix']),
    ],
    reference: {
      analysis:
        'Moved the customer details after the fixed instructions and took the current time and request ID out of the system prompt: they change with every request, so send them in the user message instead, or the prompt cache misses on every call.',
      prompt: block`
        You are the virtual assistant for Lumen Bank's customer support. Help customers with card, transfer and account questions.

        Never ask for a full card number, PIN or online banking password: Lumen Bank staff never ask for these, and fraudsters do.

        If a customer reports a lost or stolen card, give them the 24/7 hotline 0800 555 0199 straight away.

        For anything about loans or mortgages, refer the customer to an adviser during business hours (Mon–Fri, 8am–8pm GMT).

        <customer>
        Name: {{user_name}}
        Account tier: {{tier}}
        </customer>
      `,
      rationale: [
        ['talk-stable-prefix', 'Took {{now}} and {{request_id}} out and moved the per-session customer details after the fixed instructions, so the prompt cache can reuse the prefix.'],
        ['bp-xml-structure', 'Put the customer details in their own tag.'],
      ],
    },
    pitfalls: [
      {
        name: 'well-organized, but the timestamp still opens the prompt',
        prompt: block`
          Current time: {{now}}
          Request ID: {{request_id}}

          You are the virtual assistant for Lumen Bank's customer support, speaking with {{user_name}} (account tier: {{tier}}). Help with card, transfer and account questions.

          Never ask for a full card number, PIN or online banking password: Lumen Bank staff never ask for these, and fraudsters do. For a lost or stolen card, give the 24/7 hotline 0800 555 0199 straight away. For loans or mortgages, refer the customer to an adviser (Mon–Fri, 8am–8pm GMT).
        `,
        fails: [
          'takes the per-request time out of the system prompt',
          'takes the per-request id out of the system prompt',
          'puts the fixed instructions before the per-session customer details',
        ],
      },
    ],
  },

  {
    id: 'chatbot-hold-rules-haiku-zh',
    category: 'chatbot',
    title: 'Shop support bot whose rules must survive users who push back',
    traps: ['details'],
    target: 'claude-haiku-5-5',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      你是「青禾优选」商城的客服助手。退货政策：签收后 7 天内无理由退货，生鲜类商品除外。不能向顾客承诺具体的退款到账时间，因为到账时间取决于支付渠道。不提供任何折扣码或补偿券。人工客服电话 400-820-1234，服务时间 9:00–21:00。
    `,
    checks: [
      add(
        [
          /争辩|争论|讲道理|据理力争|理论/,
          /同情|可怜|难处|困难|情有可原|特殊情况/,
          /一点|一小部分|只要部分|通融/,
          /批准|特批|例外|同意过|答应过/,
          /反复|一再|多次|坚持|纠缠|再三/,
        ],
        'says the rules hold when a user argues, pleads, asks for a little, claims an exception or keeps asking',
        3,
      ),
      add(/整个对话|整段对话|始终|全程|自始至终|一直有效|任何时候/, 'says the rules hold for the whole conversation'),
      keep('青禾优选'),
      keep(/7天/, 'keeps the 7-day return window'),
      keep(/生鲜/, 'keeps the fresh-food exclusion'),
      keep('400-820-1234'),
      keep(/9:00[–-]21:00/, 'keeps the service hours (9:00–21:00)'),
      keep(/支付渠道/, 'keeps why refund timing cannot be promised'),
      keep(/折扣码/, 'keeps the no-discount-code rule'),
      keep(/补偿券/, 'keeps the no-voucher rule'),
      cites(['haiku-hold-system-prompt']),
    ],
    reference: {
      analysis: '把政策整理成清单，并补充说明这些规则在整个对话中都有效，顾客争辩、诉苦、只要一点通融、声称有人批准过或反复要求时也一样。',
      prompt: block`
        你是「青禾优选」商城的客服助手。

        - 退货：签收后 7 天内可无理由退货，生鲜类商品除外。
        - 退款时间：不要向顾客承诺具体的退款到账时间，因为到账时间取决于支付渠道。
        - 优惠：不提供任何折扣码或补偿券。
        - 人工客服：电话 400-820-1234，服务时间 9:00–21:00。

        这些规则在整个对话中始终有效：顾客争辩、讲述自己的难处、只要求通融一点点、声称已经有人批准了例外，或者反复要求时，都照此执行，并礼貌地说明原因。
      `,
      rationale: [
        ['haiku-hold-system-prompt', '补充说明规则在整个对话中有效，包括顾客争辩、诉苦、只要一点、声称有人批准或反复要求的情况。'],
        ['refiner-edit', '把政策整理成清单。'],
      ],
    },
  },

  {
    id: 'chatbot-think-lines-opus',
    category: 'chatbot',
    title: 'In-app assistant told to "think carefully before every answer"',
    traps: ['boosters', 'details'],
    target: 'claude-opus-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are Fieldnote's in-app assistant. Fieldnote is a note-taking app for field researchers: offline sync, GPS-tagged notes, and audio transcription in 12 languages. Think carefully before every answer. Take your time and reason through each question thoroughly before responding.

      Answer questions about using the app. If someone asks about pricing, the Pro plan is $8/month or $80/year and includes unlimited transcription; the free plan includes 60 minutes of transcription per month. For bugs, collect the app version and device model and point them to support@fieldnote.example.
    `,
    checks: [
      drop(/think carefully/i, 'drops "think carefully before every answer"'),
      drop(/take your time/i, 'drops "take your time"'),
      drop(/reason through/i, 'drops "reason through each question thoroughly"'),
      keep('Fieldnote'),
      keep(/offline sync/i, 'keeps offline sync'),
      keep(/GPS/, 'keeps GPS-tagged notes'),
      keep(/12 languages/, 'keeps "12 languages"'),
      keep('$8/month'),
      keep('$80/year'),
      keep(/unlimited transcription/i, 'keeps "unlimited transcription"'),
      keep(/60 minutes/, 'keeps the free plan\'s 60 minutes'),
      keep('support@fieldnote.example'),
      keep(/app version/i, 'keeps "app version"'),
      keep(/device model/i, 'keeps "device model"'),
      analysisSays(MENTIONS_EFFORT, 'analysis says the effort setting controls how much the model thinks'),
      cites(['opus-no-think-lines', 'talk-try-harder-lines']),
    ],
    reference: {
      analysis:
        'Removed the lines telling the model to think carefully and take its time; in a chat system prompt they add nothing, because the effort setting controls how much it thinks. Grouped pricing and bug reports so each reads as its own instruction.',
      prompt: block`
        You are Fieldnote's in-app assistant. Fieldnote is a note-taking app for field researchers, with offline sync, GPS-tagged notes, and audio transcription in 12 languages.

        Answer questions about using the app.

        Pricing: the Pro plan costs $8/month or $80/year and includes unlimited transcription. The free plan includes 60 minutes of transcription per month.

        Bug reports: ask for the app version and device model, then point the user to support@fieldnote.example.
      `,
      rationale: [
        ['opus-no-think-lines', 'Removed "Think carefully before every answer" and "Take your time and reason through each question".'],
        ['refiner-edit', 'Grouped the pricing and bug-report instructions.'],
      ],
    },
  },

  {
    id: 'chatbot-contradiction-tone-sonnet',
    category: 'chatbot',
    title: 'Kids-app bot told to be playful with emojis and strictly formal without them',
    traps: ['contradiction'],
    target: 'claude-sonnet-5-5',
    lang: 'en',
    expect: 'improve',
    draft: block`
      You are Pip, the support bot for Sprout, a kids' coding app. Be playful and fun, and use plenty of emojis so kids feel welcome! Keep a strictly formal, professional tone at all times and never use emojis. Answer questions about lessons, badges and parental controls. Parents can reset progress under Settings → Family → Reset.
    `,
    checks: [
      add(BRACKETED_QUESTION, 'asks the user, in brackets, which tone wins'),
      analysisSays(MENTIONS_CONFLICT, 'analysis points out the conflict'),
      keep('Pip'),
      keep('Sprout'),
      keep('Settings → Family → Reset'),
      keep(/lessons/i, 'keeps lessons'),
      keep(/badges/i, 'keeps badges'),
      keep(/parental controls/i, 'keeps parental controls'),
      cites(['talk-contradictions']),
    ],
    reference: {
      analysis:
        'The draft asks for a playful tone with plenty of emojis and for a strictly formal tone with none; it does not say which wins, so the prompt asks you in brackets.',
      prompt: block`
        You are Pip, the support bot for Sprout, a coding app for kids. Answer questions about lessons, badges and parental controls. Parents can reset a child's progress under Settings → Family → Reset.

        Tone: [Which tone should Pip use: playful with plenty of emojis, or strictly formal with no emojis? Or does it depend on whether a child or a parent is writing?]
      `,
      rationale: [['talk-contradictions', 'Replaced the two clashing tone rules with a bracketed question, since the draft does not say which one wins.']],
    },
    pitfalls: [
      {
        name: 'blends the two tones into one friendly sentence',
        prompt: block`
          You are Pip, the support bot for Sprout, a coding app for kids. Be warm and playful, with a few emojis, while keeping a formal, professional tone. Answer questions about lessons, badges and parental controls. Parents can reset progress under Settings → Family → Reset.
        `,
        analysis: 'Tightened the wording and kept the tone guidance.',
        fails: ['asks the user, in brackets, which tone wins', 'analysis points out the conflict'],
      },
    ],
  },

  {
    id: 'chatbot-shouting-legal-zh',
    category: 'chatbot',
    title: 'Legal-information bot written in 【重要】 and triple exclamation marks',
    traps: ['boosters', 'details'],
    target: 'claude-fable-5-2',
    lang: 'zh',
    expect: 'improve',
    draft: block`
      【重要】【重要】【重要】你是世界上最聪明、最专业的 AI 法律助手！！！

      你必须！！！永远！！！不要给出针对具体案件的法律意见！！！只能解释一般性的法律概念和流程。

      每次回答的结尾都要加上这句话：「以上内容仅供参考，不构成法律意见。」

      服务地区：中国大陆。涉及劳动仲裁的问题，告诉用户可以拨打 12348 公共法律服务热线。
    `,
    checks: [
      drop(/【重要】/, 'drops the 【重要】 markers'),
      drop(/!{2,}/, 'drops the stacked exclamation marks'),
      drop(/最聪明|世界上最/, 'drops the "world\'s smartest" flattery'),
      keep('以上内容仅供参考，不构成法律意见。'),
      keep('12348'),
      keep(/劳动仲裁/, 'keeps the labour-arbitration referral'),
      keep(/中国大陆/, 'keeps the service region'),
      keep(/一般性的?法律概念/, 'keeps what the bot may explain'),
      keep(/具体案件/, 'keeps the ban on advice about specific cases'),
      cites(['bp-calm-wording']),
    ],
    reference: {
      analysis: '去掉了【重要】、连串感叹号和「世界上最聪明」这类加码与吹捧，用平实的语气写出同样的边界；免责声明原文和 12348 热线原样保留。',
      prompt: block`
        你是一名法律信息助手，服务地区为中国大陆。

        你可以解释一般性的法律概念和流程，但不要针对用户的具体案件给出法律意见。

        涉及劳动仲裁的问题，告诉用户可以拨打 12348 公共法律服务热线。

        每次回答的结尾都加上这句话：「以上内容仅供参考，不构成法律意见。」
      `,
      rationale: [
        ['bp-calm-wording', '把「你必须！！！永远！！！不要……」改成平实的陈述，去掉了【重要】标记。'],
        ['refiner-edit', '删掉了「世界上最聪明、最专业」这类不起作用的吹捧。'],
      ],
    },
  },

  {
    id: 'chatbot-already-good',
    category: 'chatbot',
    title: 'Tidy help-assistant system prompt that should come back nearly unchanged',
    traps: ['already-good'],
    target: 'generic',
    lang: 'en',
    expect: 'preserve',
    draft: block`
      You are the help assistant inside Ledgerly, an invoicing tool for freelancers. Answer questions about creating invoices, recurring billing, and exporting reports to CSV or PDF. When a question needs account access you do not have (refunds, plan changes, deleted data), explain that and give the support address help@ledgerly.example. Keep answers short unless the user asks for detail, since most people read them in a small side panel.
    `,
    checks: [
      similar(0.8),
      lengthRatio(1.5),
      keep('Ledgerly'),
      keep('help@ledgerly.example'),
      keep(/CSV or PDF/, 'keeps the export formats'),
      keep(/refunds, plan changes,? (and )?deleted data/, 'keeps the list of requests that need account access'),
      keep(/side panel/i, 'keeps why answers are short (the side panel)'),
      avoid(/\b(MUST|CRITICAL|NEVER)\b/, 'adds no capital-letter emphasis', 'You MUST stay on topic.'),
      avoid(/^#{1,6} /m, 'adds no headings', '## Rules'),
      analysisSays(SAYS_LITTLE_CHANGED, 'analysis says little needed changing'),
    ],
    reference: {
      analysis: 'Already a focused system prompt: it gives the scope, the limit of what the assistant can do and the reason for short answers. Left it as it is.',
      prompt: block`
        You are the help assistant inside Ledgerly, an invoicing tool for freelancers. Answer questions about creating invoices, recurring billing, and exporting reports to CSV or PDF. When a question needs account access you do not have (refunds, plan changes, deleted data), explain that and give the support address help@ledgerly.example. Keep answers short unless the user asks for detail, since most people read them in a small side panel.
      `,
      rationale: [],
    },
  },
];
