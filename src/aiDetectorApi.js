const { analyzeAIWriting, sampleLongText } = require('./aiStyleDetector');
const { clamp, redact } = require('./util');

function detectorConfig(options = {}) {
  return {
    endpoint: options.endpoint || process.env.AI_DETECTOR_ENDPOINT || '',
    token: options.token || process.env.AI_DETECTOR_TOKEN || '',
    model: options.model || process.env.AI_DETECTOR_MODEL || '',
    timeout: Number(options.timeout || process.env.AI_DETECTOR_TIMEOUT || 60000),
    maxChars: Number(options.maxChars || process.env.AI_DETECTOR_MAX_CHARS || 120000)
  };
}

function detectorStatus(options = {}) {
  const config = detectorConfig(options);
  return {
    configured: Boolean(config.endpoint),
    mode: config.endpoint ? 'external-ready' : 'local-only',
    endpointConfigured: Boolean(config.endpoint),
    tokenConfigured: Boolean(config.token),
    modelConfigured: Boolean(config.model),
    maxChars: config.maxChars
  };
}

function normalizeScore(value) {
  let score = Number(value);
  if (!Number.isFinite(score)) throw new Error('外部AI检测服务没有返回有效分数');
  if (score >= 0 && score <= 1) score *= 100;
  return Math.round(clamp(score));
}

function normalizeExternalResult(raw) {
  const data = raw?.data?.result || raw?.result || raw?.data || raw || {};
  // 区分「字段完全缺失」与「明确返回 0」：缺失时分数字段为 undefined（?? 链取不到），记告警后交由 normalizeScore 按现有逻辑抛错（由上层降级）；
  // 明确返回 0 时 scoreValue 为 0（非 nullish），下方 normalizeScore 会正常保留 0，不告警。
  const scoreValue = data.score ?? data.ai_score ?? data.aiProbability ?? data.ai_probability ?? data.probability;
  if (scoreValue === undefined) console.warn('外部AI检测返回缺少分数字段');
  const score = normalizeScore(scoreValue);
  const confidenceRaw = data.confidence;
  const confidence = typeof confidenceRaw === 'number'
    ? (confidenceRaw <= 1 ? `${Math.round(confidenceRaw * 100)}%` : `${Math.round(confidenceRaw)}%`)
    : String(confidenceRaw || '服务未说明');
  const spans = Array.isArray(data.spans || data.segments) ? (data.spans || data.segments).slice(0, 30).map((x, index) => ({
    index: index + 1,
    start: Number(x.start) || 0,
    end: Number(x.end) || 0,
    score: normalizeScore(x.score ?? x.ai_score ?? x.probability ?? 0),
    excerpt: String(x.text || x.excerpt || '').slice(0, 160)
  })) : [];
  const reasons = Array.isArray(data.reasons || data.signals) ? (data.reasons || data.signals).slice(0, 10).map(String) : [];
  const advice = Array.isArray(data.advice || data.suggestions) ? (data.advice || data.suggestions).slice(0, 10).map(String) : [];
  return { score, confidence, label: String(data.label || data.verdict || ''), reasons, advice, spans, providerRequestId: String(raw?.request_id || data.request_id || '') };
}

async function callExternalDetector(text, options = {}) {
  const config = detectorConfig(options);
  if (!config.endpoint) throw Object.assign(new Error('尚未配置外部AI检测服务'), { code: 'AI_DETECTOR_UNAVAILABLE' });
  const sampling = sampleLongText(text, config.maxChars);
  // 隐私红线：正文离开本机前必须完成手机号/证件号/邮箱脱敏。
  const safeText = redact(sampling.text);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);
  try {
    const response = await (options.fetch || fetch)(config.endpoint, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
      body: JSON.stringify({ model: config.model || undefined, text: safeText, language: 'zh', content_type: 'novel', return_segments: true })
    });
    if (!response.ok) throw new Error(`外部AI检测请求失败（${response.status}）`);
    const normalized = normalizeExternalResult(await response.json());
    return { ...normalized, sampling: { originalChars: sampling.originalChars, submittedChars: sampling.sampledChars, sampled: sampling.sampled, coverage: sampling.coverage } };
  } finally { clearTimeout(timer); }
}

function mergeDetection(local, external) {
  const score = Math.round(local.score * .45 + external.score * .55);
  const band = score >= 65 ? '较高AI辅助风险' : score >= 38 ? '中等AI辅助风险' : score >= 18 ? '轻微AI风格信号' : '未发现明显AI风格信号';
  const externalAdvice = external.advice.map((advice, index) => ({ priority: local.prioritizedAdvice.length + index + 1, signalId: 'external-api', title: '外部检测服务建议', advice, evidence: external.reasons.join('、') || '外部检测服务返回' }));
  return {
    ...local, score, band, mode: 'hybrid', external,
    prioritizedAdvice: [...local.prioritizedAdvice, ...externalAdvice].slice(0, 10),
    recommendation: `本地可解释检测${local.score}分，外部检测服务${external.score}分，融合结果${score}分。请结合两套证据和人工复核判断。`,
    warning: '正文已按配置发送至外部AI检测服务（发送前已完成手机号/证件号/邮箱脱敏）；融合分数不是作者身份或AI生成概率证明。'
  };
}

async function runAIDetection(text, options = {}) {
  const local = analyzeAIWriting(text);
  try {
    const external = await (options.callExternal || callExternalDetector)(text, options);
    return mergeDetection(local, external);
  } catch (error) {
    if (options.requireExternal) throw error;
    // 安全红线：原始错误只写服务端日志，回前端的 warning 不得携带外部端点/内部细节。
    console.error('外部AI检测失败，已降级为本地检测：', error);
    return { ...local, mode: 'local', external: null, warning: error.code === 'AI_DETECTOR_UNAVAILABLE' ? '未配置外部AI检测服务，当前使用本地可解释检测。' : '外部AI检测暂不可用，已降级为本地检测。' };
  }
}

module.exports = { detectorConfig, detectorStatus, normalizeExternalResult, callExternalDetector, mergeDetection, runAIDetection };
