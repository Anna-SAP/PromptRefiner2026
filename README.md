# Prompt Refiner 2026 · 提示词精炼

把一段粗糙的想法，精炼成一条聚焦、现代的提示词。由 **Anthropic Claude Fable 5.2** 驱动。

本项目是 [WorkRemix-Prompt-Refiner](https://github.com/Anna-SAP/WorkRemix-Prompt-Refiner-) 的重构版：底层模型从 Google Gemini 迁移到 Anthropic Claude，保留了原应用的全部核心体验，并对架构做了现代化改造。

## 在线使用

**<https://anna-sap.github.io/PromptRefiner2026/>**

在线版是纯静态页面，没有后端。首次使用时点击右上角 **Add API Key**，填入你自己的 [Anthropic API Key](https://console.anthropic.com/settings/keys) 即可：

- Key 只保存在你的浏览器里，只会发送给 Anthropic API，费用计入你自己的 Anthropic 账户。
- 默认关闭标签页即清除；勾选「Remember on this device」才会长期保存。公用电脑请不要勾选。
- 仓库和构建产物中不包含任何 Key。页面带有内容安全策略（CSP），只允许连接 `api.anthropic.com`。

## 两种运行方式

| | 在线版（GitHub Pages） | 自托管（本仓库的 Express 服务） |
| --- | --- | --- |
| 后端 | 无，浏览器直连 Anthropic API | Express 代理 |
| API Key | 每位用户在页面中填写自己的 | 服务端 `.env` 中配置一个，用户无需填写 |
| 适合 | 个人使用、公开分享 | 团队内部共用一个 Key |

两种方式共用同一套请求构建、元提示词和输出解析代码（`shared/`），行为一致。

## 本地运行（自托管模式）

需要 Node.js 20.12 或更高版本，以及一个 [Anthropic API Key](https://console.anthropic.com/)。

```bash
npm install
```

```bash
cp .env.example .env
```

在 `.env` 里填入 `ANTHROPIC_API_KEY`，然后启动：

```bash
npm run dev
```

打开 <http://localhost:3000>。API Key 只存在于服务端，不会发送到浏览器。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式：单进程，Express + Vite 热更新，服务端代码改动自动重启 |
| `npm run build` | 构建前端到 `dist/` |
| `npm start` | 生产模式：先 `npm run build`，再用它提供服务 |
| `npm run build:pages` | 构建在线版（纯静态、浏览器直连）到 `dist/` |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 单元测试（输出解析器、rationale 解析、会话引用、规则目录、请求校验、历史记录的存储与迁移），以及评测的自检（见下文「评测」） |
| `npm run eval` | 离线评测：不需要 Key、不调用 API，逐条输出黄金用例的结果和原因 |
| `npm run eval:live` | 在线评测：用真实模型精炼每条黄金用例并逐条判定（需要 `ANTHROPIC_API_KEY`，每条用例一次付费请求） |
| `npm run check:links` | 联网检查规则目录里每条文档链接：页面可访问，且存在对应章节锚点和标题 |
| `npm run check:quotes -- <转录文件>` | 逐字核对视频来源的引文：每段引文都必须出现在转录中所注时间段内（转录文件不在仓库里，需自备） |

## 功能

- **提示词精炼**：流式输出，分为「Analysis（改了什么）」和「Refined Prompt（可直接复制）」两部分，下方另有只供核对的「Why these changes」。
- **目标模型**：选择精炼后的提示词要交给哪个模型——Claude Fable 5.2 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Generic（通用）。选定后，元提示词换用该模型官方 prompting 指南里的规则（见下文「按目标模型区分的规则」），不只是换个标签。它与页头的「Powered by …」（执行精炼的模型）是两回事。
- **改动依据（rationale）**：每处改动列出四项——改了什么、依据哪条规则、来源（官方文档的章节链接，或视频的时间段链接加转录原话）、适用哪个模型。这一块只在界面上显示，「Copy Prompt」和「Copy Full Text」都不包含它。
- **用量与缓存命中**：每次精炼完成后，结果下方显示本次输入、输出的 token 数，以及输入中有多少是从提示词缓存读取的。元提示词对同一目标模型的每次请求都相同，所以连续精炼时应当大部分命中缓存；缓存读取按普通输入价格的一小部分计费。历史记录不保存这一行。
- **多模态图片**：点击选择、粘贴或拖拽图片作为参考。过大的图片会在浏览器内自动缩小到 2000px 以内。
- **引用之前的优化会话**（可选）：点击输入框下方的「Add Reference Session」，从历史记录中勾选一条或多条（最多 5 条）之前的优化会话作为基础。精炼时，所选会话的原始输入、Analysis 和 Refined Prompt 会连同本次新输入（文本和图片）一起交给模型，由它综合给出一份完整的最终提示词。新输入可以是新的草稿，也可以只是一句修改说明（如「改成表格输出」）；新输入与之前的会话冲突时以新输入为准，较晚的会话优先于较早的。「Why these changes」和推理摘要不会传给模型。仍然需要有新的文本或图片才能精炼。所选会话合计上限 100,000 字符。
- **历史记录**：保存在浏览器本地的 IndexedDB 里，只在本机，不上传服务器。**没有条数上限**：每一次精炼都会保留，直到你自己删除或清空。历史面板和「Add Reference Session」每次列出最新的 50 条，点按钮可继续加载更早的记录；搜索覆盖全部记录。支持单条删除、清空、导出与导入 JSON（导入同样不截断）。引用了之前会话的记录会标注「Built on N earlier session(s)」，重新打开时会恢复仍然存在的引用。第一次保存后，应用会向浏览器申请持久存储，以免磁盘紧张时被浏览器自动清理（Chrome 和 Safari 自行决定，Firefox 会询问一次）。如果浏览器不允许存储或空间不足，结果下方和历史面板会明确提示：没能保存的记录保留到关闭标签页为止，可以先导出，下一次精炼时会再试着保存。
- **思考过程摘要**：Claude 思考时实时显示推理摘要，等待不再是空白。
- **思考深度**：Quick / Balanced / Deep 三档，对应 Claude 的 `effort` 参数（low / medium / high）。Deep（high）是 Anthropic 对 Claude Fable 5.2 的官方推荐起点；Balanced（medium）仍是本工具的日常默认。effort 决定 Claude 思考多少，不改变结果的长度。选择器下方会显示当前档位的一句说明，鼠标悬停或键盘聚焦到其他档位时可预览其说明。
- **随时停止**：生成中可中断，服务端会同步取消对 Claude 的请求，不再继续计费。
- 快捷键 `Ctrl/⌘ + Enter` 提交。

## 相比原版的变化

**模型层**

- `@google/genai` → `@anthropic-ai/sdk`，默认模型 `claude-fable-5-2`。
- 图片使用 Claude 原生的 `image` 内容块，放在文本之前；系统提示词使用顶层 `system` 字段并启用提示词缓存。
- 使用自适应思考（`thinking: { type: "adaptive", display: "summarized" }`），不再传 `temperature`（新模型不接受采样参数）。
- 默认启用服务端拒答回退（`fallbacks: "default"`）：若安全分类器误判拒绝了请求，API 会在同一次调用内改由 Anthropic 推荐的模型完成。

**元提示词（Meta-Prompt）**

针对 Claude 重写，见 [shared/prompt.ts](shared/prompt.ts)。保留了原版「少限制、高聚焦」的理念，并做了这些调整：

- 明确「你是在改写提示词，不是在执行它」，避免模型直接回答草稿里的任务。
- 每条规则都带上原因，而不是用大写强调；不凭空添加字数、格式等用户没提的要求。
- 说明如何处理图片：下游模型可能看不到图片，所以把任务依赖的细节写进提示词。
- 输出改用 `<analysis>` / `<refined_prompt>` 标签，而不是 Markdown 代码块。这样即使精炼后的提示词本身包含代码块，也不会被截断。

**按目标模型区分的规则**

元提示词由两部分组成：所有请求共用的基础部分，以及随目标模型变化的 `<target_model>` 部分。后者的规则来自两类出处，逐条登记在 [shared/rules.ts](shared/rules.ts)：Anthropic 官方文档（每条带文档、章节和锚点），以及 Anthropic 工程师 Lance Martin 的演讲（每条带转录时间段和逐字原话，见下文「来自演讲的规则」）。各目标模型的官方规则来源：

| 目标模型 | 规则来源 |
| --- | --- |
| Claude Fable 5.2 | [Prompting Claude Fable 5.2](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2) + 通用最佳实践 |
| Claude Opus 5.5 | [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) + 通用最佳实践 |
| Claude Sonnet 5.5 | [Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5) + 通用最佳实践 |
| Claude Haiku 5.5 | [Prompting Claude Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5) + 通用最佳实践 |
| Generic（通用） | 仅 [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |

- 每个目标都包含两条规则：**做完整个任务再汇报**（普通障碍自行处理，只在不可逆操作或需要用户决定时停下），以及**审批类规则把例外写进同一句**（不只写 NEVER）。前者在每份指南里各有对应章节；后者只有 Fable 5.2 指南写明，对其他目标是作为本工具自己的规则套用的，界面上会注明这一点。
- 模型在 `<rationale>` 里只引用规则 id，来源和链接由应用从 `rules.ts` 查出后显示。模型不写链接，所以界面上出现的链接只可能是 `rules.ts` 里登记过的；引用了未登记 id 的条目会显示「无来源」。
- 没有官方规则可依的改动（例如删掉寒暄）标为 `refiner-edit`，界面上明确写「不来自 Anthropic 指南」。
- `<rationale>` 由 [shared/parseRationale.ts](shared/parseRationale.ts) 先从回答末尾切下，剩余部分原样交给原有的 `parseRefineOutput`，所以 `<analysis>` / `<refined_prompt>` 的解析行为不变。历史记录仍只保存模型的原始回答，字段没有变化。
- 指南会修订。改动 `rules.ts` 后，或隔一段时间，运行 `npm run check:links` 复查链接。

**来自演讲的规则**

来源是 [Your Old Prompts Are Making Claude Worse](https://www.youtube.com/watch?v=ys6YQ2yfBpM)（Lance Martin, Anthropic，AI Engineer 2026 年 10 月）。核心观点：提示词会像代码一样积累「债务」，为旧模型写的加码句和互相矛盾的规则在前沿模型上会增加成本、甚至降低质量；提示词缓存是严格的前缀匹配；评分提示词要用能稳定复现的判据。这四条规则不针对某个模型，所有目标模型都会用到，排在该模型自己的规则之后：

| 规则 id | 做什么 | 视频出处（转录时间） | 对应的官方文档 |
| --- | --- | --- | --- |
| `talk-try-harder-lines` | 删掉为旧模型写的「多想、多查」句：`think step by step`、`double-check your work` 这类验证仪式、`be maximally thorough` 这类加码、规定思考步骤或草稿区。任务本身要求的检查（如报告前跑测试）和其他规则明确要加的句子保留；在 Analysis 里说明控制思考量的是 effort 设置 | 01:00–02:20、04:50–05:00 | Prompting best practices › Overthinking and excessive thoroughness |
| `talk-contradictions` | 草稿里互相矛盾的指令不再原样并存：草稿能看出谁优先就留那条，各有适用情形就写清何时用哪条；看不出就在提示词里放一个方括号问题，并在 Analysis 里指出 | 02:30–02:40、05:00 | 无，仅有演讲 |
| `talk-stable-prefix` | 会被应用反复发送的 system prompt，按变化频率排序：对所有请求都相同的内容在前，按项目或会话固定的内容（用户名、会话开始日期）在后；每次请求都变的值（当前时间、请求 id、轮次计数）移出 system prompt，并在 Analysis 里说明应放进用户消息 | 06:10–06:20、07:00–07:11、07:50 | Prompt caching › Structuring your prompt；What invalidates the cache |
| `talk-grader-checks` | 评分 / 评审 / LLM-as-judge 类提示词里没定义各档含义的分数（如「1 到 10 分打分」），改成逐项的通过 / 不通过判据；比较两个输出的保留为二选一；草稿已逐档定义的量表保留 | 31:00–31:11、31:50、34:00–34:10 | Define success criteria and build evaluations › Tips for LLM-based grading |

- 每条演讲来源在界面上显示为「演讲标题 › 时间段」，链接跳到 YouTube 对应秒数，下方附转录原话。原话照抄自动转录，识别错误也原样保留，这样才能逐字核对；`npm run check:quotes -- <转录文件>` 会检查每段原话都出现在所注时间段的转录行里。
- 边界也写进了规则备注，界面上可见：演讲认为 5.5 代模型已不需要这些加码句，而这些句子大约从 Claude Opus 4.5 起开始失去作用，演讲者自己说这条线并不精确（50:00–50:10）；对 Haiku 是否还需要少量加码，演讲者也不确定（50:30–50:40）。72% 的降本数字来自修正内部基准测试框架的缓存用法，不是改写提示词的效果。官方评测文档也接受细则清楚的 1–5 分量表，所以 `talk-grader-checks` 只替换没定义档位的量表。
- 规则之间不能互相打架（这本身就是演讲的观点之一）：`talk-try-harder-lines` 不会删掉 Sonnet 5.5 指南要求的「Think the problem through before you answer.」和编码规则要求的真实检查；Haiku 5.5 的日期规则改为「在会话开始时填一次，放在不变的指令之后」，与 `talk-stable-prefix` 一致。单元测试锁住了这几处。
- 同一处改动有多条规则可依据时，元提示词要求引用最贴近目标模型的那条（例如面向 Opus 5.5 的聊天提示词里删除「think carefully」时引用 `opus-no-think-lines`）。

**架构**

- 目录拆分为 `src/`（前端）、`server/`（后端）、`shared/`（两端共用的协议类型与输出解析器）。
- Tailwind 从 CDN 运行时改为 v4 构建时编译，去掉了 importmap 和外部脚本依赖。
- 状态逻辑抽成 Hooks：`useRefine`、`useHistory`、`useImageAttachments`。
- 流式渲染按动画帧合并更新，长输出不再逐 token 触发重渲染。
- 服务端校验请求（图片格式、大小、数量），并把上游错误翻译成可操作的提示（未配置 Key、限流、模型不可用等）。
- 开发服务器默认只监听 `127.0.0.1`，避免把带 Key 的接口暴露到局域网。

历史记录沿用原来的字段，旧版保存的 Markdown 格式记录仍能正确显示。之前保存在 `localStorage`（键名 `prompt_refiner_history`）里的记录，会在新版第一次打开时原样迁移到 IndexedDB：id、时间、`basedOn` 引用都不变。逐条读回核对一致后才删除旧副本；迁移失败时旧副本原地保留，下次打开再试。

## 评测

`eval/` 是一套针对精炼器本身的评测：判断一次精炼有没有让提示词**变好**，而不是只看输出读起来顺不顺。它只读取 `shared/` 的代码，不改变精炼行为、元提示词、规则和界面。

### 怎样算"变好"

每条用例是一份用户可能粘贴进来的草稿，加上一组确定性的检查（字符串和正则匹配，不用另一个模型打分，结果可复现）。检查分四类：

| 类别 | 含义 | 例子 |
| --- | --- | --- |
| improve | 精炼修好了草稿的问题。**原样不动的草稿必然不通过这类检查**——这由自检保证，所以通过它们说明提示词确实改进了，而不是换了个说法 | 删掉 "think step by step"；未定义档位的 1–10 分改成通过 / 不通过；自相矛盾且草稿没说谁优先时，用方括号问题交给用户 |
| keep | 没丢东西，也没加用户没要的东西 | 路径、工单号、金额、引语原样保留；不凭空加字数限制；语言与草稿一致；"本来就很好"的草稿基本不变 |
| explain | Analysis 和 rationale 说清了改了什么、依据哪条规则 | 删加码句时说明思考量由 effort 控制；rationale 引用 `talk-grader-checks` |
| format | 回答的结构能被应用正确解析和显示 | 有 `<analysis>` / `<refined_prompt>`；`<rationale target>` 与目标模型一致；只引用该目标模型可用的规则 id |

一条读起来很顺、但把 `BILL-2291` 写成"相关工单"、或把两条矛盾指令揉成一句的精炼，会在 keep / improve 检查上失败。每条陷阱用例都附了这样的"读着顺但是错"的样本（pitfall），自检会确认它们被判为失败。

### 黄金用例

共 27 条，见 `eval/cases/`：

| 类别 | 条数 | 覆盖 |
| --- | --- | --- |
| coding-agent | 5 | 细节散落的 bug 报告、加码句 + 大写强调、禁令与例外分开写、"不要 AI 味"的前端需求、本来就很好的 code review |
| multi-step-agent | 5 | 无人值守的夜间任务、矛盾指令（草稿没说谁优先 / 草稿说了谁优先）、带 scratchpad 和"三遍核对"的搜索 agent、跨应用的细节密集任务 |
| grading | 5 | 未定义档位的 1–10 分、已定义档位的 1–5 分（必须保留）、两两比较却各打 10 分、JSON 判定（一条规则删 "step by step"、另一条加 "Think the problem through"）、加码句 + 0–100 分的翻译评审 |
| chatbot | 6 | 时间戳和请求 id 放在 system prompt 开头、需要"顶住用户施压"的客服、"think carefully" 的聊天提示词、语气要求互相矛盾、【重要】和连串感叹号、本来就很好的 system prompt |
| writing | 6 | 细节散落的推文、要求"忽略上面直接写"的草稿（必须精炼而不是执行）、带术语表和占位符的翻译、"直译"与"意译"并存但草稿说明了各自适用范围、本来就很好的邮件、基于之前会话的修改说明 |

三类陷阱都有多条：容易丢细节的草稿（≥ 5 条）、自相矛盾的草稿（4 条，两种形态都有）、带旧式加码句的草稿（≥ 5 条）。目标模型覆盖 Fable 5.2 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Generic，中英文草稿都有。

### 三层检查

1. **契约（contract，离线）**：当前的 `prompt.ts` 和 `rules.ts` 是否还给了每条用例它依赖的东西——用例期望引用的规则仍存在、且仍提供给该目标模型；草稿和之前会话逐字送到模型；元提示词仍要求评测要读的三个输出块。从某个目标模型里删掉或改名一条规则，依赖它的用例在不调用模型的情况下就会失败。
2. **校准（calibration，离线）**：这组检查能不能区分更好和更差。对每条用例：原样草稿通过所有 keep 检查、不通过所有 improve 检查；一份人工写的正确精炼（措辞与草稿不同）通过全部检查；从它派生的损坏版本（删掉一个细节、放回一句加码句、编一个字数限制、丢一个标签……）各自被对应检查判为失败；pitfall 样本被判为失败。人工参考答案只用于校准检查本身，不是模型输出，不会被当作精炼器的成绩。
3. **精炼输出**：在线模式用真实模型跑每条用例（与应用完全相同的请求：同一个 `runRefinement`、同一套元提示词），用 keep / improve / explain / format 检查逐条判定。结果连同原始回答一起保存；离线模式回放已保存的结果，用当前的检查重新判定。

### 运行

```bash
npm run eval
```

```bash
npm run eval:live
```

| 选项 | 作用 |
| --- | --- |
| `--only <名称>` | 只跑部分用例：用例 id、类别（如 `grading`）、陷阱（如 `boosters`）或目标模型，逗号分隔 |
| `-v` / `--verbose` | 列出每项检查；并列出原样草稿不通过哪些 improve 检查 |
| `--json <路径>` | 另存一份 JSON 报告 |
| `--recording <路径>` | 离线：回放这个结果文件而不是 `eval/baseline.json`；在线：与它比较 |
| `--strict` | 离线：把"过期"结果（见下）也算作失败 |
| `--save-baseline` | 在线：把本次结果合并进 `eval/baseline.json` |
| `--repeat <n>` | 在线：每条用例跑 n 次，看结果是否稳定（模型输出有随机性） |
| `--concurrency <n>` / `--model <id>` / `--effort <档位>` | 在线：并发数、精炼模型、思考深度（默认取 `REFINER_MODEL` / `REFINER_EFFORT`，否则用应用默认值） |

在线模式和服务端一样从环境变量或 `.env` 读取 `ANTHROPIC_API_KEY`。评测代码不读取、不打印、不保存 Key 的值；控制台输出和结果文件都会先经过脱敏，测试覆盖了这一点。

每条用例输出一行状态，失败时下面逐项列出未通过的检查和原因：

| 状态 | 含义 |
| --- | --- |
| `PASS` | 精炼输出通过全部检查（`--repeat` 时每次都通过） |
| `FAIL` | 契约或校准出了问题，或精炼输出有检查未通过；原因逐条列出 |
| `STALE` | 回放的结果录制于 `prompt.ts` / `rules.ts`（或精炼模型、effort、用例草稿）改动之前，不能说明当前版本的表现；下面会写明改了什么 |
| `OK` | 没有可判定的精炼输出（尚未录制），只跑了契约和校准，且都通过 |

在线模式还会与基线比较，标出 `REGRESSION`（基线通过、现在失败）和 `fixed`。退出码：有失败为 1（`--strict` 时过期也算），用法错误或缺少 Key 为 2，否则为 0。

### 改了 `prompt.ts` 或 `rules.ts` 之后

1. `npm test`：契约和校准是测试的一部分。删掉或改名一条用例依赖的规则、改坏输出格式，会在这里失败。
2. `npm run eval`：回放基线。元提示词变了，所有录制结果都会标成 `STALE`，并写明哪些规则被增删改；同时单独列出直接检验被改规则的用例，建议先重跑这些。
3. `npm run eval:live`（或 `-- --only <这些用例>`）：用真实模型重跑并与基线比较，看是否出现 `REGRESSION`。
4. 确认结果后，`npm run eval:live -- --save-baseline` 更新基线并提交 `eval/baseline.json`。

仓库里还没有 `eval/baseline.json`：录制需要 API Key 和付费调用，第一次请运行 `npm run eval:live -- --save-baseline`。在此之前，`npm run eval` 只能给出契约和校准的结果。`eval/results/` 存放每次在线运行的结果，已加入 `.gitignore`。

### 局限

- 检查是规则匹配，不是语义理解。措辞特别的正确精炼可能被误判失败；这种情况应修正检查（`eval/checks.ts` 的模式或用例里的检查），不应为了迁就结果去改用例的预期。
- 模型输出有随机性，单次失败可能是偶发的；用 `--repeat 3` 看稳定性。
- 评测只覆盖文本草稿，没有图片输入的用例。

### 添加用例

在 `eval/cases/` 对应类别的文件里加一条：草稿、目标模型、语言、检查，以及一份人工写的参考精炼（`reference`）。陷阱用例最好再加一个"读着顺但是错"的 pitfall。`npm test` 会校验新用例：要保留的细节确实在草稿里、要删的句子确实在草稿里、原样草稿不通过 improve 检查、参考精炼通过全部检查、每个损坏版本都被抓到。

## 自动构建与部署

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 负责：

- **合并到 `main`**：类型检查 → 测试 → 构建在线版 → 检查产物中没有 API Key → 发布到 GitHub Pages。
- **Pull Request**：执行同样的检查和构建，但不发布。

每次构建都会把构建时刻写入页面：页头右侧显示 `built on 2026-11-10 15:38 UTC+8`（窄屏时显示在页面底部），`index.html` 里也有一条 `<meta name="build-time">`。时间在 `vite build` 运行时生成，固定按 UTC+8 显示，与访问者所在时区无关。

工作流不需要任何 Secret。仓库的 Pages 来源需设置为 **GitHub Actions**（Settings → Pages → Build and deployment → Source）。

## 配置（自托管模式）

全部通过环境变量（或 `.env`）设置，见 [.env.example](.env.example)。`.env` 已被 `.gitignore` 排除，请勿提交。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | 必填 |
| `REFINER_MODEL` | `claude-fable-5-2` | 例如换成 `claude-opus-5-5` 以降低成本 |
| `REFINER_EFFORT` | `medium` | 浏览器未选择时的默认思考深度 |
| `REFINER_MAX_TOKENS` | `64000` | 单次请求的输出上限（思考 + 回答） |
| `REFINER_FALLBACKS` | `default` | 设为 `off` 关闭拒答回退 |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | 生产模式下 `HOST` 默认为 `0.0.0.0` |

## 使用 Claude Fable 5.2 的注意事项

- **数据保留**：Fable 5.2 要求组织启用 30 天数据保留，零数据保留（ZDR）的组织会收到 400 错误。遇到这种情况可把 `REFINER_MODEL` 改为 `claude-opus-5-5`。
- **响应时间**：模型始终会先思考。Deep（high）是官方推荐起点，但明显更慢；日常使用默认的 Balanced（medium）即可。
- **拒答回退的可用范围**：`fallbacks` 仅在 Claude API、Claude Platform on AWS 和 Google Cloud（Anthropic 托管）上可用。通过 Bedrock、Vertex AI 或 Foundry 接入时，请设置 `REFINER_FALLBACKS=off`。

## 目录结构

```
shared/           服务端与浏览器共用
  prompt.ts       元提示词（基础部分 + 按目标模型生成的规则部分）与用户消息的构建
  rules.ts        规则目录：每条规则的文本、来源（文档章节锚点，或演讲时间段与原话）、适用模型；各目标模型用哪些规则
  refine.ts       调用 Claude Messages API 的唯一入口（流式）
  protocol.ts     请求、事件类型与限制
  validate.ts     请求校验
  errors.ts       SDK 错误到用户提示的映射
  parseOutput.ts  把模型输出解析为 analysis + prompt（支持流式与旧格式）
  parseRationale.ts  把 <rationale> 块从回答末尾切下并解析为逐条改动（只用于界面显示）
  references.ts   把历史记录里的一次会话转成可供后续精炼引用的内容（草稿 + analysis + prompt）
  defaults.ts     默认模型、思考深度、目标模型、输出上限
server/           自托管模式
  index.ts        Express 启动；开发时挂载 Vite，生产时提供 dist/
  refine.ts       POST /api/refine：以 SSE 流式返回
  config.ts       环境变量
src/
  App.tsx
  components/     Header、HistorySidebar、ImageUploader、ReferencePicker、ReferenceChips、RefineOutput、RationalePanel、TargetSelect、EffortSelect、ApiKeyDialog
  hooks/          useRefine、useHistory、useImageAttachments、useApiKey、useAppConfig、useCopy
  lib/
    refineClient.ts   按构建模式选择传输方式；自托管模式的 SSE 客户端
    directClient.ts   在线版：浏览器直连 Anthropic API
    apiKey.ts         在线版：用户 Key 的本地存取
    mode.ts           构建模式开关
    images.ts         图片压缩
    sessionLabel.ts   历史会话在列表中的日期与标题显示
    historyStore.ts   历史记录的本地存储（IndexedDB，无上限）、从 localStorage 的迁移、多个标签页之间的同步
eval/             评测（只读取 shared/，不改变精炼行为）
  cases/          黄金用例，按类别分文件；每条含草稿、检查和人工参考精炼
  checks.ts       检查的定义与判定（keep / improve / explain / format）
  contract.ts     离线检查：prompt.ts 和 rules.ts 是否仍提供用例依赖的规则与输出格式
  calibrate.ts    离线检查：每条用例的检查能否区分更好和更差的精炼
  live.ts         通过 shared/refine.ts 用真实模型精炼用例
  fingerprint.ts  元提示词指纹，用于判断录制结果是否过期
  judge.ts / report.ts / run.ts / cli.ts   判定、报告与命令行入口
scripts/
  check-rule-links.ts   联网检查 rules.ts 里的文档链接和章节锚点
  check-talk-quotes.ts  对照演讲转录逐字核对 rules.ts 里的引文和时间段
.github/workflows/deploy.yml   构建并发布到 GitHub Pages
```
