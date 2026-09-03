const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, mean, std, redact, LEVEL_WEIGHT, CHAPTER_HEADING } = require('../src/util');

test('clamp 将数值限制在区间内', () => {
  assert.equal(clamp(120, 0, 100), 100);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
  assert.equal(clamp(8, 10, 20), 10); // 低于下界取下限
  assert.equal(clamp(25), 25); // 默认区间 0-100
  assert.equal(clamp(150), 100);
});

test('mean 计算平均值且空数组返回 0', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([]), 0);
  assert.equal(mean([7]), 7);
});

test('std 计算总体标准差且空数组返回 0', () => {
  assert.equal(std([5, 5, 5]), 0); // 常数序列方差为 0
  assert.ok(Math.abs(std([0, 2]) - 1) < 1e-9); // 均值1，方差1，标准差1
  assert.equal(std([]), 0);
});

test('redact 脱敏手机号/证件号/邮箱', () => {
  const value = redact('手机13812345678，证件110101199001011234，邮箱test@example.com');
  assert.doesNotMatch(value, /13812345678/);
  assert.doesNotMatch(value, /110101199001011234/); // 原串被手机号正则打散，故整体消失
  assert.doesNotMatch(value, /test@example\.com/);
  assert.match(value, /手机号已脱敏/);
  assert.match(value, /邮箱已脱敏/);
  assert.equal(redact(undefined), ''); // 非字符串安全处理
});

test('LEVEL_WEIGHT 与既定风险权重一致', () => {
  assert.deepEqual(LEVEL_WEIGHT, { critical: 25, high: 14, medium: 7, low: 3 });
  assert.equal(LEVEL_WEIGHT.critical, 25);
  assert.equal(LEVEL_WEIGHT.high, 14);
  assert.equal(LEVEL_WEIGHT.medium, 7);
  assert.equal(LEVEL_WEIGHT.low, 3);
});

test('CHAPTER_HEADING 仅匹配章节标题行', () => {
  const match = '第一章 雨夜'.match(CHAPTER_HEADING);
  assert.ok(match && match[0] === '第一章 雨夜');
  assert.equal('这是普通正文，没有标题特征'.match(CHAPTER_HEADING), null);
  assert.ok('Chapter 3 Truth'.match(CHAPTER_HEADING));
});
