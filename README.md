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
| `npm test` | 单元测试（输出解析器、请求校验） |

## 功能

- **提示词精炼**：流式输出，分为「Analysis（改了什么）」和「Refined Prompt（可直接复制）」两部分。
- **多模态图片**：点击选择、粘贴或拖拽图片作为参考。过大的图片会在浏览器内自动缩小到 2000px 以内。
- **历史记录**：保存在浏览器 `localStorage`，最多 50 条；支持搜索、单条删除、清空、导出与导入 JSON。
- **思考过程摘要**：Claude 思考时实时显示推理摘要，等待不再是空白。
- **思考深度**：Quick / Balanced / Deep 三档，对应 Claude 的 `effort` 参数（low / medium / high）。
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

**架构**

- 目录拆分为 `src/`（前端）、`server/`（后端）、`shared/`（两端共用的协议类型与输出解析器）。
- Tailwind 从 CDN 运行时改为 v4 构建时编译，去掉了 importmap 和外部脚本依赖。
- 状态逻辑抽成 Hooks：`useRefine`、`useHistory`、`useImageAttachments`。
- 流式渲染按动画帧合并更新，长输出不再逐 token 触发重渲染。
- 服务端校验请求（图片格式、大小、数量），并把上游错误翻译成可操作的提示（未配置 Key、限流、模型不可用等）。
- 开发服务器默认只监听 `127.0.0.1`，避免把带 Key 的接口暴露到局域网。

历史记录沿用原来的 `localStorage` 键名和字段，旧版保存的 Markdown 格式记录仍能正确显示。

## 自动构建与部署

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 负责：

- **合并到 `main`**：类型检查 → 测试 → 构建在线版 → 检查产物中没有 API Key → 发布到 GitHub Pages。
- **Pull Request**：执行同样的检查和构建，但不发布。

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
- **响应时间**：模型始终会先思考。Deep 档位明显更慢，日常使用 Balanced 即可。
- **拒答回退的可用范围**：`fallbacks` 仅在 Claude API、Claude Platform on AWS 和 Google Cloud（Anthropic 托管）上可用。通过 Bedrock、Vertex AI 或 Foundry 接入时，请设置 `REFINER_FALLBACKS=off`。

## 目录结构

```
shared/           服务端与浏览器共用
  prompt.ts       元提示词与用户消息的构建
  refine.ts       调用 Claude Messages API 的唯一入口（流式）
  protocol.ts     请求、事件类型与限制
  validate.ts     请求校验
  errors.ts       SDK 错误到用户提示的映射
  parseOutput.ts  把模型输出解析为 analysis + prompt（支持流式与旧格式）
  defaults.ts     默认模型、思考深度、输出上限
server/           自托管模式
  index.ts        Express 启动；开发时挂载 Vite，生产时提供 dist/
  refine.ts       POST /api/refine：以 SSE 流式返回
  config.ts       环境变量
src/
  App.tsx
  components/     Header、HistorySidebar、ImageUploader、RefineOutput、EffortSelect、ApiKeyDialog
  hooks/          useRefine、useHistory、useImageAttachments、useApiKey、useAppConfig、useCopy
  lib/
    refineClient.ts   按构建模式选择传输方式；自托管模式的 SSE 客户端
    directClient.ts   在线版：浏览器直连 Anthropic API
    apiKey.ts         在线版：用户 Key 的本地存取
    mode.ts           构建模式开关
    images.ts         图片压缩
.github/workflows/deploy.yml   构建并发布到 GitHub Pages
```
