const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeNovel } = require('../src/analyzer');
const { recommendationReview, rankFromSignals } = require('../src/recommendationReview');

const chapters = [
  '第一章 灰雪\n林莞握着红绳走进骨阶，听见系统通报。她没有后退，反而把白蜡烛放在门口。',
  '第二章 筷子\n郑阿婆留了两双筷子。林莞煮粥，林渡在门外停了很久，最后只把糖纸压在碗底。',
  '第三章 选择\n魔神站在灰雪里。林莞发现第128次的记录，拒绝替林渡做决定，转身去找证据。',
  '第四章 日光\n周元把鸡腿拍进饭盒。林渡没有解释，只吃完了鸡腿，林莞把乐高放到窗边。'
].join('\n');

test('真人推荐审核独立于合规，并识别作者化写作资产', () => {
  const report = analyzeNovel({ title: '灰蓝现实', intro: '妹妹发现系统要她杀死的魔神是哥哥。', text: chapters, platforms: ['fanqie'] });
  assert.ok(report.recommendationReview);
  assert.ok(/^R[0-3]$/.test(report.recommendationReview.rank));
  assert.ok(report.recommendationReview.strengths.length > 0);
  assert.ok(report.recommendationReview.memoryAssets.assets.length > 0);
  assert.ok(Array.isArray(report.recommendationReview.craft.mood));
});

test('纯剧情概述不会被误判为高推荐价值', () => {
  const text = Array.from({ length: 6 }, (_, i) => `第${i + 1}章\n主角收到线索，随后找到证据，最终公开真相并离开。`).join('\n');
  const result = recommendationReview({ text });
  assert.notEqual(result.rank, 'R3');
  assert.ok(result.findings.some(x => x.id === 'plot-summary' || x.id === 'emotion-declared'));
  assert.ok(result.readerDropoff.length > 0);
});

test('推荐模式可关闭，避免把推荐诊断混入基础扫描', () => {
  const result = analyzeNovel({ text: '普通小说正文。'.repeat(30), recommendationMode: false });
  assert.equal(result.recommendationReview, null);
});

test('rankFromSignals 边界与评级阈值一致', () => {
  assert.equal(rankFromSignals({ methodCount: 3, highFindings: 1, textLength: 5000, chaptersLength: 5 }), 'R3');
  assert.equal(rankFromSignals({ methodCount: 2, highFindings: 3, textLength: 5000, chaptersLength: 5 }), 'R2');
  assert.equal(rankFromSignals({ methodCount: 1, highFindings: 9, textLength: 5000, chaptersLength: 5 }), 'R1');
  assert.equal(rankFromSignals({ methodCount: 0, highFindings: 0, textLength: 5000, chaptersLength: 5 }), 'R0');
  // 小样本强制 R1：正文过短或章节不足时，无论方法覆盖多高都降级。
  assert.equal(rankFromSignals({ methodCount: 3, highFindings: 0, textLength: 100, chaptersLength: 3 }), 'R1');
  assert.equal(rankFromSignals({ methodCount: 3, highFindings: 0, textLength: 9000, chaptersLength: 1 }), 'R1');
});