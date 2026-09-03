'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  LENGTH_TARGET, LENGTH_EMPTY, FAR_SHORT_CEILING, LONG_CEILING,
  MULTI_CHAPTER_MIN, LENGTH_GUARD_MIN_CHARS, UNIT_LABEL, LENGTH_BANDS,
  classifyLength, summarizeLength, buildLengthReport, lengthPointsOf
} = require('../src/lengthGuard');
const { analyzeNovel } = require('../src/analyzer');

// ---------- 1. classifyLength 边界值逐档断言 ----------
test('classifyLength 边界值逐档断言（9 个分界点）', () => {
  const cases = [
    { chars: 0, status: 'empty', label: '未输入正文', level: 'medium', points: 0 },
    { chars: 999, status: 'far-short', label: '严重偏短', level: 'medium', points: 8 },
    { chars: 1000, status: 'short', label: '偏短', level: 'low', points: 5 },
    { chars: 1999, status: 'short', label: '偏短', level: 'low', points: 5 },
    { chars: 2000, status: 'ok', label: '达标', level: 'ok', points: 0 },
    { chars: 4000, status: 'ok', label: '达标', level: 'ok', points: 0 },
    { chars: 4001, status: 'long', label: '偏长', level: 'low', points: 5 },
    { chars: 6000, status: 'long', label: '偏长', level: 'low', points: 5 },
    { chars: 6001, status: 'far-long', label: '严重偏长', level: 'medium', points: 8 }
  ];
  for (const c of cases) {
    const r = classifyLength(c.chars);
    assert.equal(r.status, c.status, `chars=${c.chars} status 应为 ${c.status}`);
    assert.equal(r.label, c.label, `chars=${c.chars} label 应为 ${c.label}`);
    assert.equal(r.level, c.level, `chars=${c.chars} level 应为 ${c.level}`);
    assert.equal(lengthPointsOf(r.status), c.points, `档位 ${r.status} 扣分应为 ${c.points}`);
    assert.deepEqual(r.target, LENGTH_TARGET, `chars=${c.chars} 默认 target 应为 LENGTH_TARGET`);
  }
});

// ---------- 2. deviation 计算 ----------
test('classifyLength deviation 计算（不足缺口/超出溢出/达标为0）', () => {
  assert.equal(classifyLength(800).deviation, 1200, '800 不足 2000，缺口 1200');
  assert.equal(classifyLength(5000).deviation, 1000, '5000 超出 4000，溢出 1000');
  assert.equal(classifyLength(2500).deviation, 0, '2500 在达标区间内，deviation 为 0');
  assert.equal(classifyLength(2000).deviation, 0, '区间下界 deviation 为 0');
  assert.equal(classifyLength(4000).deviation, 0, '区间上界 deviation 为 0');
});

// ---------- 3. summarizeLength 多章汇总 ----------
test('summarizeLength 多章汇总（平均单章为判定单元）', () => {
  const r = summarizeLength([1500, 4000, 8000]);
  assert.equal(r.unit, UNIT_LABEL.average);
  assert.equal(r.unit, '平均单章');
  assert.equal(r.count, 3);
  assert.equal(r.total, 13500);
  assert.equal(r.averageChars, 4500);
  assert.equal(r.min, 1500);
  assert.equal(r.max, 8000);
  assert.equal(r.inRange, 1, '仅 4000 达标');
  assert.equal(r.outOfRange, 2);
  assert.equal(r.status, 'long', '平均 4500 偏长');
  assert.equal(r.label, '偏长');
});

// ---------- 4. summarizeLength 空数组安全回退 ----------
test('summarizeLength 空数组安全回退', () => {
  const r = summarizeLength([]);
  assert.equal(r.unit, '平均单章');
  assert.equal(r.count, 0);
  assert.equal(r.total, 0);
  assert.equal(r.averageChars, 0);
  assert.equal(r.min, 0);
  assert.equal(r.max, 0);
  assert.equal(r.inRange, 0);
  assert.equal(r.outOfRange, 0);
});

// ---------- 5. buildLengthReport 单篇（无章节）→ 全文，按 bodyChars 判定 ----------
test('buildLengthReport 单篇（无章节）→ unit=全文，按 bodyChars 判定', () => {
  const r = buildLengthReport([], 3000);
  assert.equal(r.unit, '全文');
  assert.equal(r.status, 'ok');
  assert.equal(r.chars, 3000);
  assert.equal(r.totalChars, 3000);
  assert.equal(r.inRangeChapters, 1);
  assert.equal(r.outOfRangeChapters, 0);
  assert.equal(r.perChapter, undefined, '单篇不附 perChapter');
});

// ---------- 6. buildLengthReport 单篇偏短 → outOfRange=1 ----------
test('buildLengthReport 单篇偏短 → unit=全文，outOfRange=1', () => {
  const r = buildLengthReport([], 500);
  assert.equal(r.unit, '全文');
  assert.equal(r.status, 'far-short', '500<1000 严重偏短');
  assert.equal(r.totalChars, 500);
  assert.equal(r.inRangeChapters, 0);
  assert.equal(r.outOfRangeChapters, 1);
});

// ---------- 7. buildLengthReport 单章（<2章）→ 全文单元，不附 perChapter ----------
test('buildLengthReport 单章（<2章）→ unit=全文，不附 perChapter', () => {
  const r = buildLengthReport([{ title: '第一章', chars: 2500 }], 2500);
  assert.equal(r.unit, '全文');
  assert.equal(r.status, 'ok');
  assert.equal(r.totalChars, 2500);
  assert.equal(r.inRangeChapters, 1);
  assert.equal(r.outOfRangeChapters, 0);
  assert.equal(r.perChapter, undefined);
});

// ---------- 8. buildLengthReport 多章 → 平均单章 + perChapter 明细 ----------
test('buildLengthReport 多章 → unit=平均单章，附 perChapter 与达标统计', () => {
  const r = buildLengthReport(
    [{ title: '第一章', chars: 1500 }, { title: '第二章', chars: 4000 }],
    5500
  );
  assert.equal(r.unit, '平均单章');
  assert.equal(r.status, 'ok', '平均 2750 达标');
  assert.equal(r.totalChars, 5500);
  assert.equal(r.inRangeChapters, 1);
  assert.equal(r.outOfRangeChapters, 1);
  assert.ok(Array.isArray(r.perChapter), '多章应附 perChapter');
  assert.equal(r.perChapter.length, 2);
  assert.deepEqual(r.perChapter[0], { index: 1, title: '第一章', chars: 1500, status: 'short' });
  assert.deepEqual(r.perChapter[1], { index: 2, title: '第二章', chars: 4000, status: 'ok' });
});

// ---------- 9. buildLengthReport 多章全偏短 → 状态一致且均 outOfRange ----------
test('buildLengthReport 多章全偏短 → perChapter 状态一致且均 outOfRange', () => {
  const r = buildLengthReport(
    [{ title: '第一章', chars: 500 }, { title: '第二章', chars: 800 }],
    1300
  );
  assert.equal(r.unit, '平均单章');
  assert.equal(r.chars, 650, '报告 chars 即平均单章字数');
  assert.equal(r.status, 'far-short', '平均 650 严重偏短');
  assert.equal(r.inRangeChapters, 0);
  assert.equal(r.outOfRangeChapters, 2);
  assert.deepEqual(r.perChapter.map(x => x.status), ['far-short', 'far-short']);
});

// ---------- 10. 900 下限防重复扣分（analyzeNovel 集成） ----------
test('极短章（<900字）只触发 chapter-underdeveloped，不重复触发 chapter-length-out-of-range', () => {
  const text = '林舟推开旧书店的门，收到一封来自故乡的信。'; // <900 字
  const result = analyzeNovel({ chapterAnalysis: true, title: '第一章 测试', intro: '', text });
  const findings = result.commercialQuality.findings;
  const underdeveloped = findings.filter(x => x.id === 'chapter-underdeveloped');
  const lengthOOR = findings.filter(x => x.id === 'chapter-length-out-of-range');
  assert.equal(underdeveloped.length, 1, 'chapter-underdeveloped 应恰好出现一次');
  assert.equal(lengthOOR.length, 0, '极短章不应触发 chapter-length-out-of-range（900 下限防护，避免对同一处过短重复扣分）');
  // 同一处「过短」不应被两个篇幅类扣分项叠加
  const lengthPenaltyIds = findings.filter(x => x.id === 'chapter-length-out-of-range' || x.id === 'chapter-underdeveloped').map(x => x.id);
  assert.equal(lengthPenaltyIds.length, 1, '过短处只应被一个篇幅类扣分项命中');
});

// ---------- 11. 交叉校验 LENGTH_GUARD_MIN_CHARS 与档位扣分一致性 ----------
test('交叉校验 LENGTH_GUARD_MIN_CHARS=900 且档位扣分与 LENGTH_BANDS 一致', () => {
  assert.equal(LENGTH_GUARD_MIN_CHARS, 900);
  assert.equal(LENGTH_TARGET.min, 2000);
  assert.equal(LENGTH_TARGET.max, 4000);
  assert.equal(FAR_SHORT_CEILING, 1000);
  assert.equal(LONG_CEILING, 6000);
  assert.equal(MULTI_CHAPTER_MIN, 2);
  const seen = [];
  for (const band of LENGTH_BANDS) {
    assert.equal(lengthPointsOf(band.status), band.points, `lengthPointsOf(${band.status}) 应与 LENGTH_BANDS 定义一致`);
    assert.ok(!seen.includes(band.status), `档位 status 应唯一: ${band.status}`);
    seen.push(band.status);
  }
  assert.equal(lengthPointsOf('not-a-status'), 0, '未知档位不扣分');
  assert.deepEqual(seen, ['empty', 'far-short', 'short', 'ok', 'long', 'far-long'], '档位顺序应稳定');
});

// ---------- 12. normalizeChars 行为（经 classifyLength 间接验证） ----------
test('normalizeChars 经 classifyLength 间接验证（非数字/负数/小数→非负整数）', () => {
  assert.equal(classifyLength(-5).chars, 0, '负数归一为 0');
  assert.equal(classifyLength(-5).status, 'empty');
  assert.equal(classifyLength('abc').chars, 0, '非数字归一为 0');
  assert.equal(classifyLength(NaN).chars, 0);
  assert.equal(classifyLength(null).chars, 0);
  assert.equal(classifyLength(undefined).chars, 0);
  assert.equal(classifyLength(12.7).chars, 13, '小数四舍五入');
  assert.equal(classifyLength(12.7).status, 'far-short');
  assert.equal(classifyLength(1999.4).chars, 1999);
  assert.equal(classifyLength(1999.6).chars, 2000, '进位后达标');
  assert.equal(classifyLength(1999.6).status, 'ok');
});

// ---------- 13. normalizeTarget 默认回退与自定义生效（经 classifyLength 间接验证） ----------
// 注意：far-short 档位由全局常量 FAR_SHORT_CEILING=1000 锚定，与自定义 target.min 无关；
// 因此自定义 target 的演示取值均 >= 1000，避免落入全局严重偏短档。
test('normalizeTarget 默认回退 LENGTH_TARGET，自定义 target 生效', () => {
  const def = classifyLength(1500);
  assert.deepEqual(def.target, { min: 2000, max: 4000 }, '默认 target 回退 LENGTH_TARGET');
  assert.equal(def.status, 'short', '默认 target min=2000，1500<2000 判偏短');

  const custom = classifyLength(1500, { min: 1000, max: 3000 });
  assert.deepEqual(custom.target, { min: 1000, max: 3000 });
  assert.equal(custom.status, 'ok', '自定义 target 生效（处于区间内）');

  const custom2 = classifyLength(1500, { min: 2000, max: 5000 });
  assert.deepEqual(custom2.target, { min: 2000, max: 5000 });
  assert.equal(custom2.status, 'short');
  assert.equal(custom2.deviation, 500, '自定义 target 缺口 500');

  const custom3 = classifyLength(7000, { min: 500, max: 1000 });
  assert.equal(custom3.target.max, 1000);
  assert.equal(custom3.status, 'far-long', '超出 long 上限(6000) 判严重偏长');
  assert.equal(custom3.deviation, 6000, '自定义 target 溢出 6000');

  const reversed = classifyLength(3000, { min: 5000, max: 1000 });
  assert.deepEqual(reversed.target, { min: 5000, max: 5000 }, 'min>max 时取 max(min,max)');
  assert.equal(reversed.status, 'short');
});
