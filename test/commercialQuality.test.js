const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeCommercialQuality } = require('../src/commercialQuality');
const { analyzeNovel } = require('../src/analyzer');

const fixturePath = path.join(__dirname, 'fixtures', '白鹭归河.txt');

test('白鹭归河不再因零合规命中自动获得高基准通过率', () => {
  const text = fs.readFileSync(fixturePath, 'utf8');
  const input = { title: '白鹭归河', intro: '失踪十年的弟弟借河灯召回姐姐，二人追查旧水闸事故和小镇秘密。', text, platforms: ['fanqie','qidian','jjwxc','qimao','zongheng'] };
  const report = analyzeNovel(input);
  assert.ok(report.commercialQuality.score < 85, `成熟度异常偏高：${report.commercialQuality.score}`);
  assert.ok(report.commercialQuality.findings.some(x => x.id === 'chapter-underdeveloped'));
  assert.ok(report.commercialQuality.findings.some(x => x.id === 'clue-object-dense'));
  assert.ok(report.platforms.every(x => x.confidence === '低'));
  assert.ok(report.platforms.every(x => x.center < 79), `仍沿用旧高基准：${report.platforms.map(x => x.center)}`);
  assert.ok(report.platforms.every(x => x.estimateBasis.includes('不等同于平台真实审核通过率')));
});

test('章节展开不足和解释密集产生具体建议', () => {
  const text = Array.from({ length: 5 }, (_, i) => `第${i+1}章 线索\n十年前的事故原来还有真相，因为账本和证据都在钥匙下面。`).join('\n');
  const result = analyzeCommercialQuality({ title: '旧案', intro: '姐姐寻找失踪的弟弟，并调查一场被掩盖的事故。', text });
  assert.ok(result.findings.length >= 2);
  assert.ok(result.findings.every(x => x.reason && x.advice && x.evidence));
});

test('无规则风险与内容成熟度保持分层', () => {
  const text = `第一章\n${'雨后，林川去码头找一封旧信。'.repeat(30)}\n第二章\n${'他拿到钥匙，又从照片中发现十年前的秘密。'.repeat(30)}\n第三章\n${'证据公开后，旧案重新调查。'.repeat(30)}`;
  const report = analyzeNovel({ title: '旧信', intro: '林川回乡追查旧案，却发现父亲留下的证据正被人寻找。', text, platforms: ['fanqie'] });
  assert.ok(report.commercialQuality);
  assert.ok(report.issues.some(x => x.category === 'quality'));
  assert.match(report.summary.disclaimer, /合规预审与投稿成熟度已分开展示/);
});

test('analyzeCommercialQuality 透传 lengthTarget，篇幅越界判定随区间变化', () => {
  const text = '字'.repeat(2500);

  const inRange = analyzeCommercialQuality({ title: '测试', intro: '', text, chapterAnalysis: true, lengthTarget: { min: 1500, max: 3000 } });
  assert.equal(inRange.findings.filter(x => x.id === 'chapter-length-out-of-range').length, 0, '2500 在 1500–3000 内，不触发越界扣分');

  const outOfRange = analyzeCommercialQuality({ title: '测试', intro: '', text, chapterAnalysis: true, lengthTarget: { min: 3000, max: 6000 } });
  const oor = outOfRange.findings.filter(x => x.id === 'chapter-length-out-of-range');
  assert.equal(oor.length, 1, '2500<3000 触发越界扣分');
  assert.equal(oor[0].level, 'low', 'short 档 level=low');
  assert.match(oor[0].evidence, /3000/);
  assert.match(oor[0].evidence, /6000/);
});
