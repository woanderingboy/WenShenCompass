const test = require('node:test');
const assert = require('node:assert/strict');
const { splitChapters, analyzeChapters, selectReviewChapters, scanOnly } = require('../src/chapterAnalyzer');

test('识别中文和英文形式章节标题', () => {
  const text = '作品说明。\n\n第一章 雨夜\n普通开篇内容。\n\n第2章 来信\n这里出现绑架计划。\n\nChapter 3 Truth\n故事继续推进。';
  const chapters = splitChapters(text);
  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].source, 'preface');
  assert.match(chapters[2].title, /第2章/);
});

test('没有章节标题时按长度自动分段', () => {
  const text = '这是一个很长的自然段。'.repeat(800);
  const chapters = splitChapters(text, { chunkSize: 1200 });
  assert.ok(chapters.length > 2);
  assert.ok(chapters.every(x => x.source === 'chunk'));
});

test('章节报告定位风险热区', () => {
  const input = { text: '第一章 平静\n清晨他收到一封信。'.repeat(15) + '\n第二章 风险\n作为一个AI，以下是续写内容。他计划绑架对手。'.repeat(10) + '\n第三章 归来\n警察赶到并制止了他。'.repeat(10), platforms: ['fanqie'] };
  const report = analyzeChapters(input);
  assert.ok(report.totalChapters >= 3);
  assert.match(report.summary.topChapter, /第二章/);
  assert.ok(report.hotspots[0].issues.length > 0);
});

test('深度审稿抽样优先开篇结尾和风险章节', () => {
  const text = Array.from({ length: 10 }, (_, i) => `第${i + 1}章 测试\n${i === 6 ? '作为一个AI，以下是续写内容。绑架。' : '普通剧情。'.repeat(40)}`).join('\n');
  const report = analyzeChapters({ text, platforms: ['qidian'] });
  const selected = selectReviewChapters(report, 6);
  assert.ok(selected.some(x => /第1章/.test(x.title)));
  assert.ok(selected.some(x => /第7章/.test(x.title)));
  assert.ok(selected.some(x => /第10章/.test(x.title)));
});

test('长篇逐章返回AI风险、综合分与优化建议', () => {
  const text = [
    `第一章 炊烟\n${'老周推门进院，小禾把潮湿的账本放在桌上。'.repeat(20)}`,
    `第二章 续写\n${'当然！以下是续写内容。与此同时，他的嘴角勾起一抹弧度。希望这对你有帮助。'.repeat(15)}`,
    `第三章 渡口\n${'河面起了雾，渡船靠岸时没有人下船。'.repeat(20)}`
  ].join('\n');
  const report = analyzeChapters({ text, platforms: ['fanqie'] });
  assert.equal(report.totalChapters, 3);
  assert.ok(report.chapters.every(x => Number.isFinite(x.aiScore) && Number.isFinite(x.combinedRiskScore)));
  const suspicious = report.chapters[1];
  assert.ok(suspicious.aiScore >= 65);
  assert.ok(suspicious.aiSignals.length > 0);
  assert.ok(suspicious.aiAdvice.length > 0);
  assert.ok(suspicious.aiAdvice.every(x => x.advice));
  assert.ok(report.summary.aiSignalChapters >= 1);
  assert.ok(report.summary.highAIChapters >= 1);
});

test('支持超过120章的长篇完整章节分析', () => {
  const text = Array.from({ length: 150 }, (_, i) => `第${i + 1}章 测试章节\n这一章记录人物赶路和沿途见闻，细节编号${i + 1}。`).join('\n');
  const report = analyzeChapters({ text, platforms: ['qidian'] });
  assert.equal(report.totalChapters, 150);
  assert.equal(report.analyzedChapters, 150);
  assert.equal(report.coverage, 100);
  assert.equal(report.omittedChapters, 0);
});

test('章节报告分开合规风险和内容成熟度', () => {
  const text = Array.from({ length: 4 }, (_, i) => `第${i + 1}章 测试\n人物收到线索后立即找到答案。`).join('\n');
  const report = analyzeChapters({ text, platforms: ['fanqie'] });
  assert.ok(report.chapters.every(x => x.riskScore === 0));
  assert.ok(report.chapters.every(x => Number.isFinite(x.qualityScore)));
  assert.ok(report.chapters.every(x => Array.isArray(x.qualityIssues)));
  assert.ok(Number.isFinite(report.summary.averageQualityScore));
});

test('scanOnly 仅做轻量扫描且不触发推荐评审', () => {
  const result = scanOnly({ chapterAnalysis: true, title: '第一章 测试', intro: '', text: '作为一个AI，以下是续写内容。绑架。'.repeat(5) });
  assert.ok(Array.isArray(result.issues));
  assert.ok(result.commercialQuality && Number.isFinite(result.commercialQuality.score));
  assert.deepEqual(Object.keys(result.counts).sort(), ['critical', 'high', 'low', 'medium']);
});

test('较长多章样稿逐章分析章节数正确且结构未变', () => {
  const text = Array.from({ length: 8 }, (_, i) => `第${i + 1}章 章节\n${i === 3 ? '作为一个AI，以下是续写内容。绑架。' : '普通剧情推进与人物行动。'.repeat(20)}`).join('\n');
  const report = analyzeChapters({ text, platforms: ['fanqie'] });
  assert.equal(report.totalChapters, 8);
  assert.ok(report.chapters.every(x => Number.isFinite(x.qualityScore)));
  assert.ok(report.chapters.every(x => 'counts' in x));
  assert.ok(report.summary.averageQualityScore >= 0);
});

test('analyzeChapters 透传 lengthTarget，篇幅统计随区间变化', () => {
  const text = '第一章 开篇\n' + '字'.repeat(2500) + '\n第二章 中段\n' + '字'.repeat(800) + '\n第三章 收尾\n' + '字'.repeat(3000);

  const r1 = analyzeChapters({ text, lengthTarget: { min: 1500, max: 3000 } });
  assert.deepEqual(r1.chapters[0].lengthCheck.target, { min: 1500, max: 3000 }, '每章 lengthCheck.target 反映对应区间');
  assert.equal(r1.chapters[0].lengthCheck.status, 'ok', '2500 字章在 1500–3000 内达标');
  assert.equal(r1.summary.chaptersInRange, 2, '1500–3000 下 2500 与 3000 两章达标');

  const r2 = analyzeChapters({ text, lengthTarget: { min: 3000, max: 6000 } });
  assert.deepEqual(r2.chapters[0].lengthCheck.target, { min: 3000, max: 6000 });
  assert.equal(r2.chapters[0].lengthCheck.status, 'short', '同一 2500 字章在 3000–6000 下偏短');
  assert.equal(r2.summary.chaptersInRange, 1, '3000–6000 下仅 3000 字章达标');
});
