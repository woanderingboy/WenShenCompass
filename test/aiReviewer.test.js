const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeNovel } = require('../src/analyzer');
const { runHumanLikeReview, makeReviewPacket, normalizeReview, adjudicate, redact, ROLES } = require('../src/aiReviewer');

test('送审材料自动脱敏并限制长文长度', () => {
  const input = { title: '测试', text: `联系13812345678。${'这是小说正文。'.repeat(5000)}`, platforms: ['fanqie'] };
  const report = analyzeNovel(input);
  const packet = makeReviewPacket(input, report, 3000);
  assert.doesNotMatch(packet.work.text, /13812345678/);
  assert.match(packet.work.text, /手机号已脱敏/);
  assert.equal(packet.work.truncated, true);
  assert.ok(packet.work.text.length <= 3000);
});

test('模型结构化结果被规范化', () => {
  const review = normalizeReview('```json\n{"verdict":"建议修改后提交","confidence":2,"summary":"测试","findings":[{"level":"wrong","category":"语境","quote":"原文","reason":"需要结合上下文","advice":"修改","needsHuman":true}]}\n```', ROLES[0]);
  assert.equal(review.confidence, 1);
  assert.equal(review.findings[0].level, 'medium');
  assert.equal(review.findings[0].needsHuman, true);
});

test('三角色模型审稿并行汇总', async () => {
  let calls = 0;
  const fakeModel = async prompt => {
    calls++;
    const role = prompt.includes('内容安全初审员') ? 'safety' : prompt.includes('平台责任编辑') ? 'editor' : 'quality';
    return JSON.stringify({ role, verdict: '建议修改后提交', confidence: .78, summary: '存在可优化项', findings: [], strengths: ['冲突明确'], uncertainties: [] });
  };
  const input = { text: '反派提出绑架计划，但主角立即报警，反派最终受到惩罚。'.repeat(20), platforms: ['fanqie'] };
  const result = await runHumanLikeReview(input, analyzeNovel(input), { callModel: fakeModel });
  assert.equal(calls, 3);
  assert.equal(result.mode, 'ai');
  assert.equal(result.reviews.length, 3);
  assert.equal(result.adjudication.agreement, '一致');
});

test('模型不可用时自动降级且明确告知', async () => {
  const input = { text: '这是一段普通小说正文。'.repeat(30), platforms: ['qidian'] };
  const result = await runHumanLikeReview(input, analyzeNovel(input), { callModel: async () => { throw new Error('连接失败'); } });
  assert.equal(result.mode, 'offline');
  assert.match(result.warning, /降级/);
  assert.equal(result.reviews.length, 3);
});

test('明显分歧进入人工复核', () => {
  const reviews = ['较可能通过', '建议修改后提交', '高概率退回'].map((verdict, i) => ({ verdict, findings: [], confidence: .7, role: String(i) }));
  const report = analyzeNovel({ text: '普通小说内容。'.repeat(20), platforms: ['fanqie'] });
  const result = adjudicate(reviews, report);
  assert.equal(result.verdict, '建议人工复核');
  assert.equal(result.needsHuman, true);
});

test('邮箱和证件号码也会脱敏', () => {
  const value = redact('邮箱test@example.com，证件110101199001011234');
  assert.doesNotMatch(value, /test@example.com|110101199001011234/);
});

test('降级 warning 不泄露模型端点信息', async () => {
  const input = { text: '这是一段普通小说正文。'.repeat(30), platforms: ['qidian'] };
  const result = await runHumanLikeReview(input, analyzeNovel(input), { callModel: async () => { throw new Error('request to https://secret-model.example/v1/chat/completions failed'); } });
  assert.equal(result.mode, 'offline');
  assert.doesNotMatch(result.warning, /secret-model\.example/);
});
