const test = require('node:test');
const assert = require('node:assert/strict');
const { detectorStatus, normalizeExternalResult, callExternalDetector, mergeDetection, runAIDetection } = require('../src/aiDetectorApi');
const { analyzeAIWriting } = require('../src/aiStyleDetector');

test('未配置外部服务时状态为本地模式', () => {
  const status = detectorStatus({ endpoint: '', token: '', model: '' });
  assert.equal(status.configured, false);
  assert.equal(status.mode, 'local-only');
});

test('兼容外部检测常见分数字段和0到1概率', () => {
  const result = normalizeExternalResult({ data: { ai_probability: .82, confidence: .9, reasons: ['句式均匀'], suggestions: ['调整句长'], segments: [{ probability: .7, text: '测试片段' }] } });
  assert.equal(result.score, 82);
  assert.equal(result.confidence, '90%');
  assert.equal(result.spans[0].score, 70);
  assert.equal(result.advice[0], '调整句长');
});

test('外部API请求携带鉴权且不泄露令牌到结果', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ score: 76, confidence: .8, advice: ['人工复核'] }) };
  };
  const result = await callExternalDetector('这是一段用于检测的中文小说正文。'.repeat(20), { endpoint: 'https://detector.example/v1/check', token: 'secret-token', model: 'detector-v1', fetch });
  assert.equal(request.url, 'https://detector.example/v1/check');
  assert.equal(request.options.headers.authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(request.options.body).content_type, 'novel');
  assert.equal(result.score, 76);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('外部不可用时自动降级到本地检测', async () => {
  const result = await runAIDetection('普通小说正文。'.repeat(30), { callExternal: async () => { throw Object.assign(new Error('未配置'), { code: 'AI_DETECTOR_UNAVAILABLE' }); } });
  assert.equal(result.mode, 'local');
  assert.match(result.warning, /本地/);
});

test('本地与外部结果融合并保留外部建议', async () => {
  const text = '当然！以下是续写内容。希望这对你有帮助。'.repeat(12);
  const result = await runAIDetection(text, { callExternal: async () => ({ score: 88, confidence: '90%', reasons: ['模型概率特征'], advice: ['重写高风险段落'], spans: [], sampling: {} }) });
  assert.equal(result.mode, 'hybrid');
  assert.equal(result.external.score, 88);
  assert.ok(result.prioritizedAdvice.some(x => x.signalId === 'external-api'));
  assert.ok(result.score >= Math.min(analyzeAIWriting(text).score, 88));
});

test('外部返回明确 0 分保留为 0', () => {
  const result = normalizeExternalResult({ data: { score: 0, confidence: .5 } });
  assert.equal(result.score, 0);
});

test('外部返回缺少分数字段时告警并抛错（由上层降级）', () => {
  const originalWarn = console.warn;
  let warned = false;
  console.warn = (msg) => { if (String(msg).includes('缺少分数字段')) warned = true; };
  try {
    assert.throws(() => normalizeExternalResult({ data: { confidence: .5 } }), /没有返回有效分数/);
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warned, '缺少分数字段时应打印告警');
});

test('可要求外部检测必须成功', async () => {
  await assert.rejects(() => runAIDetection('普通小说正文。'.repeat(20), { requireExternal: true, callExternal: async () => { throw new Error('外部失败'); } }), /外部失败/);
});

test('发送外部检测前对正文脱敏（不泄露PII）', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ score: 50 }) };
  };
  const text = '主角留下联系方式：手机13800138000，邮箱test@example.com，身份证110101199003071234。'.repeat(3);
  await callExternalDetector(text, { endpoint: 'https://detector.example/v1/check', token: 't', model: 'm', fetch });
  const body = JSON.parse(request.options.body);
  assert.doesNotMatch(body.text, /13800138000/);
  assert.doesNotMatch(body.text, /test@example\.com/);
  assert.doesNotMatch(body.text, /110101199003071234/);
  assert.match(body.text, /已脱敏/);
});

test('降级 warning 不泄露外部端点信息', async () => {
  const result = await runAIDetection('普通小说正文。'.repeat(30), { callExternal: async () => { throw new Error('fetch failed: https://secret-detector.example/v1/check'); } });
  assert.equal(result.mode, 'local');
  assert.doesNotMatch(result.warning, /secret-detector\.example/);
});
