const { PLATFORM_PROFILES } = require('./platforms');
const { redact } = require('./util');

const ROLES = [
  {
    id: 'safety', name: '内容安全初审员', focus: '判断内容安全、现实伤害、未成年人、教程可操作性，并区分角色台词、作者立场和剧情批判。'
  },
  {
    id: 'editor', name: '平台责任编辑', focus: '判断题材适配、标题简介、开篇冲突、叙事节奏、人物目标、原创表达与投稿完成度。'
  },
  {
    id: 'quality', name: 'AI文本质量审核员', focus: '判断提示词残留、机械重复、人物口吻趋同、因果断裂、设定矛盾、模板化表达和疑似注水。'
  }
];

const LEVELS = new Set(['critical', 'high', 'medium', 'low']);
const VERDICTS = new Set(['较可能通过', '建议修改后提交', '高概率退回', '建议人工复核']);

function makeReviewPacket(input, ruleReport, maxChars = 18000) {
  const body = redact(input.text);
  const opening = body.slice(0, Math.floor(maxChars * .55));
  const ending = body.length > opening.length ? body.slice(-Math.floor(maxChars * .2)) : '';
  const evidence = ruleReport.issues.slice(0, 12).map(x => ({ category: x.category, level: x.level, label: x.label, excerpt: redact(x.excerpt) }));
  const text = ending ? `${opening}\n\n[中间内容因长度省略]\n\n${ending}` : opening;
  return {
    work: { title: redact(input.title), genre: input.genre, intro: redact(input.intro), text, originalLength: body.length, truncated: body.length > text.length },
    targetPlatforms: (input.platforms || []).map(id => ({ id, name: PLATFORM_PROFILES[id]?.name || id, profile: PLATFORM_PROFILES[id]?.note || '' })),
    ruleEvidence: evidence
  };
}

function rolePrompt(role, packet) {
  return `你是“${role.name}”，正在模拟中文网络小说平台的真人审稿流程。你的职责是：${role.focus}

必须遵守：
1. 这是模拟审稿，不得声称掌握平台内部词库或保证过审。
2. 区分叙述者、作者立场、角色台词、反派行为和受批判情节；关键词出现本身不等于违规。
3. 判断内容是否具有鼓励性、可操作性、现实伤害、受众风险和上下文缓解因素。
4. 每项问题必须引用输入中真实存在的短片段，不得杜撰原文。
5. 不重写危险方法，不补充违法细节。
6. 只输出JSON，不要Markdown，不要解释JSON以外的内容。

输出结构：
{
  "role":"${role.id}",
  "verdict":"较可能通过|建议修改后提交|高概率退回|建议人工复核",
  "confidence":0到1的小数,
  "summary":"不超过100字",
  "findings":[{"level":"critical|high|medium|low","category":"风险分类","quote":"不超过80字原文","context":"角色台词/叙述/作者声明/不确定","reason":"结合上下文的理由","advice":"低改动建议","needsHuman":true或false}],
  "strengths":["最多3项优点"],
  "uncertainties":["信息不足或需人工确认之处"]
}

审稿材料：
${JSON.stringify(packet)}`;
}

function normalizeReview(raw, role) {
  const data = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw;
  const findings = Array.isArray(data.findings) ? data.findings.slice(0, 10).map((x, i) => ({
    id: `${role.id}-${i}`,
    level: LEVELS.has(x.level) ? x.level : 'medium',
    category: String(x.category || '上下文风险').slice(0, 30),
    quote: String(x.quote || '').slice(0, 100),
    context: String(x.context || '不确定').slice(0, 30),
    reason: String(x.reason || '').slice(0, 260),
    advice: String(x.advice || '').slice(0, 260),
    needsHuman: Boolean(x.needsHuman)
  })).filter(x => x.reason) : [];
  return {
    role: role.id, name: role.name,
    verdict: VERDICTS.has(data.verdict) ? data.verdict : '建议人工复核',
    confidence: Math.max(0, Math.min(1, Number(data.confidence) || .5)),
    summary: String(data.summary || '').slice(0, 160), findings,
    strengths: Array.isArray(data.strengths) ? data.strengths.slice(0, 3).map(String) : [],
    uncertainties: Array.isArray(data.uncertainties) ? data.uncertainties.slice(0, 5).map(String) : []
  };
}

function extractJson(value) {
  const clean = String(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回有效JSON');
  return clean.slice(start, end + 1);
}

async function callModel(prompt, options = {}) {
  const endpoint = options.endpoint || process.env.REVIEW_MODEL_ENDPOINT;
  const token = options.token || process.env.REVIEW_MODEL_TOKEN;
  const model = options.model || process.env.REVIEW_MODEL_NAME;
  if (!endpoint || !model) throw Object.assign(new Error('尚未连接审稿模型'), { code: 'MODEL_UNAVAILABLE' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 90000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ model, temperature: .15, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) throw new Error(`审稿模型请求失败（${response.status}）`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? data.output_text ?? data.content;
  } finally { clearTimeout(timer); }
}

function localFallback(ruleReport) {
  const high = ruleReport.summary.counts.critical + ruleReport.summary.counts.high;
  const human = ruleReport.issues.some(x => ['critical', 'high'].includes(x.level));
  const profiles = [
    { ...ROLES[0], categories: ['safety'] },
    { ...ROLES[1], categories: ['metadata', 'copyright', 'quality'] },
    { ...ROLES[2], categories: ['ai', 'quality'] }
  ];
  return profiles.map(role => {
    const items = ruleReport.issues.filter(x => role.categories.includes(x.category)).slice(0, 4);
    return { role: role.id, name: role.name, verdict: human && role.id === 'safety' ? '建议人工复核' : high ? '建议修改后提交' : '较可能通过', confidence: .35, summary: items.length ? `依据规则初筛发现${items.length}项需关注内容；当前为离线模拟意见。` : '规则初筛未发现该角色职责内的明显问题。', findings: items.map((x, i) => ({ id: `${role.id}-local-${i}`, level: x.level, category: x.label, quote: x.excerpt, context: '待模型判断', reason: x.reason, advice: x.advice, needsHuman: ['critical', 'high'].includes(x.level) })), strengths: [], uncertainties: ['未连接大模型，无法完成角色立场、叙事语境和因果关系的深度判断。'] };
  });
}

function adjudicate(reviews, ruleReport) {
  const order = { '较可能通过': 0, '建议修改后提交': 1, '建议人工复核': 2, '高概率退回': 3 };
  const votes = reviews.map(x => order[x.verdict] ?? 2);
  const disagreement = Math.max(...votes) - Math.min(...votes);
  const mandatory = ruleReport.issues.some(x => x.level === 'critical') || reviews.some(x => x.findings.some(f => f.needsHuman && ['critical', 'high'].includes(f.level)));
  const verdict = mandatory || disagreement >= 2 ? '建议人工复核' : reviews.sort((a, b) => order[b.verdict] - order[a.verdict])[Math.floor(reviews.length / 2)].verdict;
  return {
    verdict,
    agreement: disagreement === 0 ? '一致' : disagreement === 1 ? '基本一致' : '分歧明显',
    confidence: mandatory ? '中' : disagreement === 0 ? '较高' : '较低',
    needsHuman: mandatory || disagreement >= 2,
    reason: mandatory ? '存在高敏感问题或审核员明确建议人工复核。' : disagreement >= 2 ? '不同审核角色的结论存在明显分歧。' : '根据三名独立审核角色的多数意见汇总。'
  };
}

async function runHumanLikeReview(input, ruleReport, options = {}) {
  const packet = makeReviewPacket(input, ruleReport, options.maxChars);
  let reviews, mode = 'ai', warning = '';
  try {
    reviews = await Promise.all(ROLES.map(async role => normalizeReview(await (options.callModel || callModel)(rolePrompt(role, packet), options), role)));
  } catch (error) {
    if (options.requireAI) throw error;
    // 安全红线：原始错误只写服务端日志，回前端的 warning 不得携带模型端点/内部细节。
    console.error('模型审稿失败，已降级为离线模拟：', error);
    mode = 'offline'; warning = error.code === 'MODEL_UNAVAILABLE' ? '尚未连接审稿模型，当前展示离线角色模拟结果。' : '模型审稿暂不可用，已降级为离线模拟。';
    reviews = localFallback(ruleReport);
  }
  return { mode, warning, packet: { truncated: packet.work.truncated, reviewedChars: packet.work.text.length, originalChars: packet.work.originalLength }, reviews, adjudication: adjudicate([...reviews], ruleReport) };
}

module.exports = { runHumanLikeReview, makeReviewPacket, normalizeReview, adjudicate, redact, ROLES };
