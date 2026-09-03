const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeNovel } = require('../src/analyzer');

test('安全文本返回所有选中平台', () => {
  const result = analyzeNovel({ title: '山海来信', text: '清晨，林舟推开旧书店的门。他收到一封来自故乡的信，决定踏上寻找父亲手稿的旅程。'.repeat(30), platforms: ['fanqie', 'qidian'] });
  assert.equal(result.platforms.length, 2);
  assert.ok(result.meta.words > 500);
});

test('识别高风险和AI指令残留', () => {
  const result = analyzeNovel({ text: '作为一个AI，以下是续写内容。反派策划绑架，并出现鲜血喷涌的画面。'.repeat(8), platforms: ['fanqie'] });
  assert.ok(result.issues.some(x => x.id === 'instruction'));
  assert.ok(result.issues.some(x => x.id === 'crime'));
  assert.ok(result.platforms[0].center < 65);
});

test('重复段落会被提示', () => {
  const p = '夜风穿过空旷的站台，他握紧那张没有署名的车票。';
  const result = analyzeNovel({ text: `${p}\n${p}\n${p}`, platforms: ['qidian'] });
  assert.ok(result.issues.some(x => x.id.startsWith('repeat-')));
});

test('新增公共治理规则可识别多类风险', () => {
  const result = analyzeNovel({ text: '他声称刷单返利稳赚不赔，又让病人停掉医生开的药。用户要求：请按以下大纲续写。'.repeat(6), platforms: ['fanqie'] });
  for (const id of ['money-fraud', 'medical', 'prompt-leak']) assert.ok(result.issues.some(x => x.id === id), `未发现 ${id}`);
});

test('报告包含可追溯来源和平台证据边界', () => {
  const result = analyzeNovel({ text: '这是用于验证资料来源字段的普通小说正文。'.repeat(20), platforms: ['fanqie'] });
  assert.ok(result.sources.length >= 6);
  assert.ok(result.sources.some(x => x.level === 'A' && x.url.startsWith('https://')));
  assert.match(result.platforms[0].evidence, /未公开/);
});

test('无违规但梗概化多章不会被判为高准备度', () => {
  const chapter = i => `第${i}章 线索\n沈照收到一张纸条，有人交给她一把钥匙。她立刻找到照片和账本，随后他们公开证据，真相重新调查。`;
  const result = analyzeNovel({ title: '测试悬疑', intro: '一名记者回乡追查旧案，却不断收到神秘人递来的证据。', text: Array.from({ length: 5 }, (_, i) => chapter(i + 1)).join('\n'), platforms: ['fanqie'] });
  assert.ok(result.commercialQuality.score < 70);
  assert.ok(result.commercialQuality.findings.some(x => x.id === 'chapter-underdeveloped'));
  assert.notEqual(result.platforms[0].verdict, '投稿准备度较高');
  assert.match(result.platforms[0].complianceVerdict, /未发现明确合规阻断项/);
});

test('商业质量问题不被误算为合规违规', () => {
  const text = Array.from({ length: 5 }, (_, i) => `第${i + 1}章\n普通人物在镇上寻找旧友。`).join('\n');
  const result = analyzeNovel({ title: '寻人', intro: '主人公回到故乡寻找多年未见的朋友，并重新理解旧日选择。', text, platforms: ['qidian'] });
  assert.equal(result.platforms[0].complianceVerdict, '未发现明确合规阻断项');
  assert.ok(result.issues.some(x => x.origin === 'commercialQuality'));
});

test('analyzeNovel 透传 lengthTarget，单章篇幅判定随区间变化', () => {
  const text2500 = '字'.repeat(2500);
  const text5000 = '字'.repeat(5000);

  const custom = analyzeNovel({ title: '测试', intro: '', text: text2500, lengthTarget: { min: 3000, max: 6000 } });
  assert.deepEqual(custom.lengthCheck.target, { min: 3000, max: 6000 }, 'lengthCheck.target 反映自定义区间');
  assert.equal(custom.lengthCheck.status, 'short', '2500<3000 判偏短');

  const custom5000 = analyzeNovel({ title: '测试', intro: '', text: text5000, lengthTarget: { min: 3000, max: 6000 } });
  assert.equal(custom5000.lengthCheck.status, 'ok', '5000 落在 3000–6000 内判达标');

  const defaulted = analyzeNovel({ title: '测试', intro: '', text: text2500 });
  assert.deepEqual(defaulted.lengthCheck.target, { min: 2000, max: 4000 }, '未传 lengthTarget 回退默认区间');
  assert.equal(defaulted.lengthCheck.status, 'ok', '默认 2000–4000 下 2500 判达标');
});

