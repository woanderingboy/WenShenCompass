const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeAIWriting, ngramRepetition, sentenceUniformity, sampleLongText } = require('../src/aiStyleDetector');

test('明显助手话术和提示词残留触发高风险', () => {
  const text = '当然！以下是续写内容。用户要求：请按以下大纲续写。希望这对你有帮助。'.repeat(10);
  const result = analyzeAIWriting(text);
  assert.ok(result.score >= 65);
  assert.equal(result.band, '较高AI辅助风险');
  assert.ok(result.signals.some(x => x.id === 'assistant'));
  assert.ok(result.signals.some(x => x.id === 'prompt'));
});

test('普通叙事不因偶发连接词被判高风险', () => {
  const actions = ['推开木门','收起晾衣绳','搬回竹筐','擦掉桌上的水','把账本摊开','给炉子添柴','抱起石阶上的猫','关上临街窗户','从柜里取出茶叶','听见巷口的叫卖','把湿鞋放到檐下','检查漏雨的瓦片'];
  const text = actions.map((action, i) => `${i === 5 ? '与此同时，' : ''}老周${action}。院子里还有昨夜留下的积水，小禾站在门边等他开口。`).join('');
  const result = analyzeAIWriting(text);
  assert.ok(result.score < 38, `普通叙事分数过高：${result.score}`);
  assert.notEqual(result.band, '较高AI辅助风险');
});

test('机械重复可被量化并显示证据', () => {
  const text = '他看着窗外，空气仿佛凝固了。'.repeat(60);
  const result = analyzeAIWriting(text);
  assert.ok(result.metrics.repetition.ratio > .018);
  assert.ok(result.signals.some(x => x.id === 'ngram-repeat'));
});

test('短文本置信度保持为低', () => {
  const result = analyzeAIWriting('命运的齿轮开始转动。');
  assert.equal(result.confidence, '低');
  assert.match(result.limits, /不能证明/);
});

test('分段风险可定位混合文本中的可疑区域', () => {
  const normal = ['雨落在瓦片上，陈叔收起晾衣绳。','小禾把账本摊开，发现最后一页少了半角。','门外有人卖豆花，铜勺碰着锅沿。','院里的猫钻到竹筐后，只露出一截尾巴。','老周没说话，低头修那把断齿的木梳。','天亮前，河埠头来了两条没有挂灯的船。'].join('').repeat(8);
  const suspicious = '当然！以下是续写内容。与此同时，嘴角勾起一抹弧度。希望这对你有帮助。'.repeat(30);
  const result = analyzeAIWriting(normal + suspicious);
  assert.ok(result.segments.length >= 2);
  assert.ok(result.segments.at(-1).score > result.segments[0].score, `${result.segments.map(x => x.score)}`);
});

test('统计工具处理空文本', () => {
  assert.equal(ngramRepetition('').ratio, 0);
  assert.equal(sentenceUniformity([]).average, 0);
});

test('每项AI风格信号提供可执行优化建议', () => {
  const result = analyzeAIWriting('当然！以下是续写内容。嘴角勾起一抹弧度。希望这对你有帮助。'.repeat(12));
  assert.ok(result.signals.length > 0);
  assert.ok(result.signals.every(x => typeof x.advice === 'string' && x.advice.length > 8));
  assert.ok(result.prioritizedAdvice.length > 0);
  assert.equal(result.prioritizedAdvice[0].priority, 1);
});

test('未超上限时整段返回且 coverage 表示完整覆盖', () => {
  const sampled = sampleLongText('这是一段未超过采样上限的普通小说正文样例。');
  assert.equal(sampled.sampled, false);
  assert.equal(sampled.coverage, 1);
  assert.equal(sampled.originalChars, sampled.sampledChars);
});

test('超长文本均匀抽样并返回覆盖信息', () => {
  const text = Array.from({ length: 300000 }, (_, i) => i % 997 === 0 ? '异常线索。' : '山').join('');
  const sampled = sampleLongText(text, 24000);
  assert.equal(sampled.sampled, true);
  assert.equal(sampled.originalChars, text.length);
  assert.ok(sampled.sampledChars <= 24100);
  assert.ok(sampled.coverage > 0 && sampled.coverage < 100);
  const report = analyzeAIWriting(text);
  assert.equal(report.sampling.sampled, true);
  assert.equal(report.sampling.originalChars, text.length);
});
