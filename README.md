# 文审罗盘（WenShen Compass）

> 中文网络小说「投稿前体检」工具。完全本地运行，零第三方运行时依赖，不上传、不保存原稿。
> 提供分层合规预审、投稿成熟度评估、AI 写作风格检测、逐章风险热区，以及独立的「真人阅读推荐价值」审核（R0–R3）。

本 README 面向**接手维护或二次开发的工程师 / AI Agent**，描述架构、模块职责、API 契约、数据流与扩展点。读完即可在不依赖原作者的情况下继续开发。

---

## 1. 这是什么

文审罗盘是一个 Node.js 原生实现（仅用内置模块 `node:http` / `node:fs`）的 Web 应用：

- 前端：纯静态 HTML/CSS/JS（无框架、无构建步骤）。
- 后端：单文件 HTTP 服务 `server.js`，提供静态资源与 4 个 JSON API。
- 检测引擎：`src/` 下一组纯函数模块，**不依赖任何 npm 包**，可在 Node 中直接 `require` 复用，也可被测试单独调用。

设计原则：

1. **可解释优先**：所有判断都返回「规则 + 命中原文片段 + 理由 + 修改建议」，不输出黑箱结论。
2. **合规与质量分层**：内容安全、版权、AI 质量、元数据、叙事质量分别打分，绝不把「没违规」等同于「写得好 / 值得推荐」。
3. **不冒充平台**：所有平台通过率都是**未校准的冷启动区间估计**，明确标注低置信度，不声称掌握平台内部词库。
4. **优雅降级**：外部 AI 检测服务、审稿大模型未配置或不可用时，自动回退到本地可解释检测 / 离线角色模拟，并在报告中显式标注。

---

## 2. 快速开始

环境要求：**Node.js >= 20**（用到 `node --test`、`fetch`、`AbortController`、正则 `v` 标志等）。

```bash
# 无需 npm install（项目零运行时依赖）
npm start          # 等价于 node server.js，默认端口 4173
# 浏览器打开 http://localhost:4173

npm test           # 运行 node --test，当前 60+ 个用例全部通过
PORT=8080 npm start # 自定义端口
```

> 说明：仓库不含 `node_modules/`，也不需要它。`.gitignore` 已忽略 `node_modules/`、日志与 `.DS_Store`。

---

## 3. 目录结构

```
wenshen-compass/
├── package.json            # name/scripts/engines，无 dependencies
├── server.js               # HTTP 服务：静态资源 + /api/analyze + /api/ai-detection(+status) + /api/platforms
├── public/                 # 前端（纯静态，无构建）
│   ├── index.html          # 表单与报告页骨架
│   ├── app.js              # 表单提交、TXT 导入、报告渲染（fetch /api/analyze）；LENGTH_TARGET_MIN 等为 lengthGuard 镜像常量（改档位须同步）
│   └── styles.css          # 样式
├── src/                    # 检测引擎（纯函数，可独立 require）
│   ├── analyzer.js         # 主引擎：规则库 + 平台画像 + 合规扫描 + 投稿准备度区间 + 顶层 lengthCheck
│   ├── aiStyleDetector.js  # 本地可解释 AI 写作风格检测（短语/重复/节奏/多样性/分段热区）
│   ├── aiDetectorApi.js    # 外部 AI 检测服务适配层（通用 JSON 协议）+ 本地/外部融合 + 降级
│   ├── chapterAnalyzer.js  # 章节切分（标题正则 / 自动分段）与逐章风险评分、热区排序；每章挂 lengthCheck
│   ├── commercialQuality.js# 内容成熟度：章节展开、互动密度、解释密度、线索便利度、阻力/兑现比…（含 chapter-length-out-of-range）
│   ├── recommendationReview.js # 真人阅读推荐审核：作者声音、手法覆盖、记忆资产、悬念断档、跳读、R0–R3
│   ├── aiReviewer.js       # 三角色模拟真人审稿（安全初审/责编/AI质量）+ 大模型适配 + 离线兜底
│   ├── util.js             # 叶子工具模块：clamp / mean / std / redact / LEVEL_WEIGHT / CHAPTER_HEADING（不依赖其它 src 模块）
│   ├── platforms.js        # 叶子模块：PLATFORM_PROFILES 平台主数据（不依赖其它 src 模块）
│   └── lengthGuard.js      # 字数（篇幅）检测：LENGTH_BANDS / classifyLength / summarizeLength / buildLengthReport（仅依赖 util.js）
├── test/                   # node --test 用例（9 个测试文件 + fixtures/，60+ 用例，随包分发，当前全绿）
│   ├── analyzer.test.js / aiStyleDetector.test.js / aiDetectorApi.test.js
│   ├── chapterAnalyzer.test.js / commercialQuality.test.js / recommendationReview.test.js
│   ├── aiReviewer.test.js / util.test.js / server.test.js
│   └── fixtures/           # 测试夹具（样章《白鹭归河》），随包分发，测试自包含
└── docs/
    ├── 检测机制与资料来源.md
    └── AI创作检测研究依据与边界.md
```

---

## 4. 架构与数据流

```
浏览器 (public/app.js)
   │  POST /api/analyze   { title, genre, intro, text, platforms[],
   │                        provenance, chapterMode, recommendationMode, reviewMode }
   ▼
server.js
   │
   ├─► analyzer.analyzeNovel(input)
   │       ├─ scan()                  规则库 RULES（安全/版权/AI/元数据）
   │       ├─ repetitionIssues()      段落机械重复
   │       ├─ qualityIssues()         长句/对话密度
   │       ├─ commercialQuality.analyzeCommercialQuality()  成熟度 findings + score
   │       ├─ recommendationReview.recommendationReview()   R0–R3（可关）
   │       └─ PLATFORM_PROFILES       各平台冷启动通过区间 + 合规判定
   │
   ├─► aiDetectorApi.runAIDetection(intro+text)
   │       ├─ aiStyleDetector.analyzeAIWriting()  本地可解释分（始终运行）
   │       └─ callExternalDetector()  可选外部服务；失败降级；provenance 漏检告警
   │
   ├─► (可选) chapterAnalyzer.analyzeChapters(input)   逐章风险/AI/成熟度 + 热区
   │
   └─► (可选, reviewMode='humanlike') aiReviewer.runHumanLikeReview(input, report)
           ├─ callModel() × 3 角色    可选 Chat Completions 大模型
           └─ localFallback()         未配置/失败时离线角色模拟
   ▼
聚合为一个 JSON 报告返回前端渲染。
```

关键约定：

- **正文最少 20 字**，否则 API 返回 400。
- 请求体上限 **25MB**（`server.js` 中 `body.length > 25_000_000` 即断开）。
- 所有面向用户的字符串均为中文；分数统一为 0–100。

---

## 5. HTTP API

### `POST /api/analyze`

主审核接口。请求体（JSON）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 作品名（影响元数据评分） |
| `genre` | string | 题材（都市/玄幻/悬疑/…） |
| `intro` | string | 简介（<35 字会提示卖点不足） |
| `text` | string | **正文，必填，≥20 字**；可含多章 |
| `platforms` | string[] | 平台 id：`fanqie`/`qidian`/`jjwxc`/`qimao`/`zongheng`；缺省=全部 |
| `provenance` | string | `unknown`/`human`/`ai-assisted`/`known-ai` 创作来源声明 |
| `chapterMode` | boolean | 是否逐章分析 |
| `recommendationMode` | boolean | `false` 时关闭真人推荐审核 |
| `reviewMode` | string | `rules`（仅规则）或 `humanlike`（加三角色审稿） |

响应（节选）：`meta`、`summary`、`platforms[]`、`issues[]`、`categoryScores`、`commercialQuality`、`recommendationReview`、`aiStyleReport`、`chapterReport?`、`humanReview?`、`sources[]`。

### `POST /api/ai-detection`

独立 AI 写作风格检测。请求：`{ "text": "...", "requireExternal": false }`。
`requireExternal=false`（默认）时外部服务不可用会降级为本地检测；`true` 时未配置/失败返回 503。

### `GET /api/ai-detection/status`

返回外部检测服务配置状态（`configured` / `mode` / 各凭据是否就绪 / `maxChars`），不泄露令牌。

### `GET /api/platforms`

返回全部可选平台的主数据（不含严格系数等内部画像，仅暴露 id 与展示名），供前端动态生成平台多选：

```json
{ "platforms": [ { "id": "fanqie", "name": "番茄小说" }, { "id": "qidian", "name": "起点中文网" }, ... ] }
```

与 `/api/ai-detection/status` 一样属于无副作用的只读元信息接口；前端 `public/index.html` 的平台 checkbox 即来源于此，新增平台须同步在 `src/platforms.js` 的 `PLATFORM_PROFILES` 中登记。

---

## 6. 可选外部服务（环境变量）

所有外部集成都**可选**；不配置时系统完整可用，仅报告标注为本地/离线。

外部 AI 检测服务（`aiDetectorApi.js`，通用 JSON 适配）：

```bash
export AI_DETECTOR_ENDPOINT="https://你的检测服务/v1/detect"  # 唯一必填
export AI_DETECTOR_TOKEN="..."      # Bearer 令牌（仅服务端发送，不回传前端）
export AI_DETECTOR_MODEL="..."
export AI_DETECTOR_TIMEOUT=60000    # 毫秒
export AI_DETECTOR_MAX_CHARS=120000 # 超长文本均匀采样上限
```

请求发送字段：`text`、`language:"zh"`、`content_type:"novel"`、`return_segments:true`、可选 `model`。
兼容返回分数字段：`score` / `ai_score` / `aiProbability` / `ai_probability` / `probability`（0–1 自动 ×100），以及 `spans|segments`、`reasons|signals`、`advice|suggestions`。融合权重：本地 0.45 + 外部 0.55。

审稿大模型（`aiReviewer.js`，兼容 Chat Completions）：

```bash
export REVIEW_MODEL_ENDPOINT="https://你的模型服务/v1/chat/completions"
export REVIEW_MODEL_NAME="..."
export REVIEW_MODEL_TOKEN="..."
npm start
```

三角色各自独立调用，`temperature: 0.15`，要求返回 `response_format: json_object`。长文送审前会脱敏（手机号/证件号/邮箱）并只取开篇 55% + 结尾 20%。

> 安全：令牌仅在服务端通过 Authorization 头发送，绝不写入前端或仓库；`.gitignore` 已忽略依赖与日志。

---

## 7. 各检测模块在做什么

- **`analyzer.js`**
  - `RULES`：21 条正则规则，覆盖违法犯罪、色情、自伤、血腥、赌博、极端主义、仇恨、谣言、危险教程、未成年人侵害、毒品、医疗误导、AI 指令/提示词残留、模板句、版权元素、营销承诺、隐私、站外引流、诈骗等。每条含 `level`（critical/high/medium/low）、命中片段 `excerpt`、理由与建议。
  - `PLATFORM_PROFILES`：5 个平台的基准分与各维度严格系数；产出**冷启动通过区间** `[low, center, high]`，置信度恒为「低」，并附带依据说明与公开来源。
  - `PUBLIC_SOURCES`：法规与平台公开页面引用（生态治理规定、生成式 AI 办法、AI 标识办法等）。

- **`aiStyleDetector.js`**：本地可解释 AI 风格分。检测助手话术/提示词残留、网文模板短语、连接词、泛化拔高、4-gram 重复、句长/段长均匀度（变异系数）、句首重复、破折号密度、用字多样性，并按 ~800 字窗口产出**分段风险热区**。超长文本用 24 窗均匀采样并报告覆盖率。**明确声明：分数是风格相似度，不是作者身份或生成概率证明。**

- **`chapterAnalyzer.js`**：章节切分（中文/数字/英文「第X章」标题正则；无标题时按 ~5000 字自动分段，序章并入）。逐章输出合规风险分、成熟度分、AI 风格分与综合排序分，并给出风险热区 `hotspots` 与汇总统计；默认上限 2000 章。

- **`commercialQuality.js`**：成熟度 100 分起扣。检查章节展开不足、样本过短、对话密度、解释性信息密度、解谜兑现快于阻力、章尾钩子模式化、道具线索过密、书名/简介缺失、章节体量过度整齐、线索获取过于便利、反方力量抽象等。

- **`recommendationReview.js`**：独立于合规的「真人推荐价值」。评估作者声音（对照句式密度、功能性动作固化、核心物件资产）、写作手法（场景进入感、情绪呈现 vs 解释、剧情概述感）、记忆资产（核心物件/关系动作/反常规则）、章节情绪曲线与疲劳、长线悬念（身份/规则漏洞/现实威胁）断档、潜在跳读章节，最终给 **R0–R3**：
  - R0 仅通过审核；R1 基础可读性；R2 具备真人推荐价值；R3 具备重点推荐潜力。

- **`aiReviewer.js`**：三个角色（内容安全初审员、平台责任编辑、AI 文本质量审核员）各自产出 verdict/findings/strengths/uncertainties，再由 `adjudicate()` 汇总多数意见、检测分歧与强制人工复核。无大模型时 `localFallback()` 用规则证据生成离线模拟意见。

- **`lengthGuard.js`**：纯字数（篇幅）检测，对应单章规范 **2000–4000 字**（常量 `LENGTH_TARGET`）。本模块为依赖图叶子，只 `require('./util')`，绝不引用 analyzer / commercialQuality / chapterAnalyzer，避免循环依赖；全部导出为纯函数，便于单测。

  - **判定单元抽象**：使用者既会贴单章也会贴多章全文，故按场景切换判定单元：
    - 逐章分析（chapterMode）→ 单元是「本章」；
    - 多章全文（章节数 ≥ `MULTI_CHAPTER_MIN`=2）→ 单元是「平均单章字数」；
    - 单篇无标题 → 单元是「全文」。
  - **档位表**（数组 `LENGTH_BANDS` 自上而下匹配，顺序即优先级；`level` 即商业质量扣分档，`points` 即扣分数）：

    | 状态 status | 含义 | 字数条件 | level | 扣分 points |
    | --- | --- | --- | --- | --- |
    | `empty` | 未输入正文 | `= 0` | medium | 0 |
    | `far-short` | 严重偏短 | `< 1000` | medium | 8 |
    | `short` | 偏短 | `1000–1999` | low | 5 |
    | `ok` | 达标 | `2000–4000` | ok | 0 |
    | `long` | 偏长 | `4001–6000` | low | 5 |
    | `far-long` | 严重偏长 | `> 6000` | medium | 8 |

  - **900 字下限防重复扣分**：已有 `commercialQuality.js` 的 `chapter-underdeveloped`（`< 900` 字）罚「章节展开不足」，故本模块的 `chapter-length-out-of-range` 以 `LENGTH_GUARD_MIN_CHARS = 900` 为下限，仅对 ≥900 字但仍不在 2000–4000 区间者扣分，避免同一处「过短」被惩罚两次。
  - **集成点**：
    - `src/lengthGuard.js` 的 `buildLengthReport(chapters, bodyChars, target)` 生成整份篇幅结论；
    - `analyzer.js` 顶层报告返回 `lengthCheck`；
    - `chapterAnalyzer.js` 每章挂 `lengthCheck`，汇总 `summary` 含 `chaptersInRange` / `chaptersOutOfRange`；
    - `commercialQuality.js` 的 `chapter-length-out-of-range` 检查项消费档位扣分；
    - 前端 `public/`：实时字数计数器、`app.js` 结果区「篇幅检测」卡片、章节字数徽标。
    - 注意：`public/app.js` 中的 `LENGTH_TARGET_MIN` 等常量是本模块的**镜像**，改档位时 `src/lengthGuard.js` 与 `public/app.js` 必须同步（`app.js` 已有注释标注）。

---

## 8. 测试

```bash
npm test      # node --test，test/ 下 9 个测试文件 + fixtures、60+ 个用例，随包分发，当前全绿
```

测试覆盖：规则命中与脱敏、平台画像、AI 风格信号、外部检测适配与融合/降级、章节切分（含 120+ 章长篇）、成熟度扣分、R0–R3 评级与「纯剧情概述不得高判」、三角色审稿汇总、字数（篇幅）档位与判定单元等。
**新增检测逻辑时，请同步在 `test/` 增加用例**，保持 `npm test` 全绿。

> 对齐说明：本节用例数（60+）、§3 目录结构与 §5 API 清单均已与当前代码核对一致（`node --test` 全绿）；`lengthGuard` 相关用例由 QA 并行补充，随包分发后总数以实际运行 `npm test` 为准。

---

## 9. 如何扩展（给接手 Agent 的指南）

- **加一条合规规则**：在 `analyzer.js` 的 `RULES` 数组追加 `{ id, category, level, label, re, reason, advice }`。`category` 取 `safety|copyright|ai|metadata|quality`，`level` 取 `critical|high|medium|low`。正则用 `g` 标志；命中片段与计数自动生成。
- **加一个平台画像**：在 `PLATFORM_PROFILES` 加 `{ name, base, strict:{safety,copyright,ai,metadata,quality}, note, evidence }`，前端平台多选与 `public/index.html` 同步加一个 checkbox。
- **加一个成熟度/推荐信号**：分别在 `commercialQuality.js`（`findings` + 扣分）或 `recommendationReview.js`（`detectVoice/detectCraft/...`）追加；正向资产用 `positive: true`，并在测试里固化「不该误判」的反例。
- **加一条字数档位**：在 `src/lengthGuard.js` 的 `LENGTH_BANDS` 数组按 `empty → far-short → short → ok → long → far-long` 的顺序追加（或修改）一项 `{ status, label, level, points, test, reason, advice, suggest }`；`test` 自上而下匹配，顺序即优先级。同时**必须同步**更新前端 `public/app.js` 中对应的镜像常量（如 `LENGTH_TARGET_MIN` / `LENGTH_TARGET_MAX` / 各档阈值），其顶部注释已标注「与 lengthGuard.js 保持一致」。新增判定逻辑时同步在 `test/` 补 `lengthGuard` 相关用例。
- **接一个新的外部检测/模型供应商**：只需让其返回兼容 JSON（见第 6 节字段），或在 `aiDetectorApi.normalizeExternalResult` / `aiReviewer.callModel` 中增加字段映射；不要把令牌写进前端。
- **改前端**：`public/` 为纯静态，报告渲染集中在 `public/app.js` 的 `renderReport / renderRecommendation / renderAIStyle / renderChapters / renderHumanReview`。新增后端字段后，在对应 render 函数消费即可。

### 给 AI Agent 的交接提示

1. 本项目**无构建、无依赖**，改完直接 `npm test` 验证，再 `npm start` 手测。
2. 所有结论必须可解释：任何新判定都要带「命中证据 + 理由 + 可执行建议」，并保留免责声明（区间非官方通过率、AI 分非身份证明）。
3. 不要把合规、成熟度、推荐价值三者混为一谈；R 级推荐审核必须能在「零合规命中」时仍判低（见测试「白鹭归河」用例）。
4. 外部服务不可用时必须降级且显式标注，不得让网络故障导致主审核失败。
5. 中文输出；分数 0–100；面向作者的建议要具体、低改动量，避免空泛。

---

## 10. 边界与免责

- 平台通过区间为**未校准估计**，不代表任何平台官方审核结果，不保证过审、签约或推荐。
- AI 风格分仅反映文本中与常见模型输出相似的**可解释特征**，不能证明作者身份；类型化网文、统一编辑风格、翻译/非母语写作都可能误判，人工改写也会显著改变分数。
- 送大模型/外部检测前会做脱敏与采样，但如涉及敏感原稿，请自行评估数据出境与第三方服务条款。

> 依据与研究背景见 `docs/检测机制与资料来源.md` 与 `docs/AI创作检测研究依据与边界.md`。
