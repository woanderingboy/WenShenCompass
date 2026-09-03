const { chaptersOf } = require('./commercialQuality');
const { clamp } = require('./util');

const LEVEL_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function count(text, re) { return (String(text || '').match(re) || []).length; }
function excerpt(text, re) {
  const match = String(text || '').match(re);
  if (!match) return '';
  const index = match.index || 0;
  return clean(text.slice(Math.max(0, index - 22), index + match[0].length + 46));
}
function sentenceList(text) { return String(text || '').split(/[。！？!?]/).map(clean).filter(x => x.length >= 6); }

/**
 * 根据真人推荐价值的信号计算 R0–R3 等级（纯函数，便于单测）。
 * 逻辑与内联版本逐位一致：方法覆盖越高、高危发现越少，等级越高；
 * 正文过短（<1800 字）或章节数不足（<2）时强制降级为 R1，避免小样本误判。
 * @param {{methodCount:number, highFindings:number, textLength:number, chaptersLength:number}} signals
 * @returns {'R0'|'R1'|'R2'|'R3'}
 */
function rankFromSignals({ methodCount, highFindings, textLength, chaptersLength }) {
  let rank = methodCount >= 3 && highFindings <= 1 ? 'R3'
    : methodCount >= 2 && highFindings <= 3 ? 'R2'
    : methodCount >= 1 ? 'R1'
    : 'R0';
  if (textLength < 1800 || chaptersLength < 2) rank = 'R1';
  return rank;
}

const MOTIF_PATTERNS = [
  { id: 'object', label: '物件叙事', re: /(红绳|蜡烛|糖纸|筷子|鸡腿|乐高|信纸|地图|照片)/g },
  { id: 'contrast', label: '极端处境与日常反差', re: /(魔神|系统|副本|骨阶|末日)[^。！？]{0,35}(粥|鸡腿|早饭|薄荷|乐高|筷子|门缝)/g },
  { id: 'subtext', label: '潜台词/未说出口', re: /(没说|没有回答|想说.{0,12}(没|不)|咽回|停了半拍|没再问|不承认|不否认)/g },
  { id: 'sensory', label: '感官落地', re: /(闻见|听见|摸到|凉|温|焦|灰雪|油香|水声|灯光)/g }
];

function detectVoice(text, chapters) {
  const all = [];
  const notA = count(text, /不是[^。！？\n]{0,24}[，,。；;]\s*(?:是|而是)/g);
  if (notA >= 8) all.push({ id: 'template-contrast', level: 'medium', label: '对照句式偏密', evidence: `“不是A，是B”类句式约${notA}处`, reason: '对照句式是有效修辞，但密集出现会让叙述节拍趋同。', advice: '保留关键节点，其余改用动作、停顿或具体判断呈现反差。' });

  const objectHits = count(text, /(红绳|蜡烛|糖纸|筷子|鸡腿|乐高)/g);
  const genericAction = count(text, /(攥紧|喉结动|肩膀抖|后颈.{0,5}(烫|发热)|垂眼|指节发白)/g);
  if (genericAction >= 12) all.push({ id: 'fixed-action', level: 'medium', label: '功能性动作库固化', evidence: `常见情绪动作约${genericAction}处`, reason: '同一组身体反应反复承担紧张、悲伤和确认等不同情绪，可能削弱人物差异。', advice: '保留核心意象动作，把部分反应改成具体选择、失误、生活动作或对话停顿。' });
  if (objectHits >= 5) all.push({ id: 'motif-asset', level: 'low', label: '核心物件形成记忆资产', evidence: `红绳、蜡烛、糖纸等物件出现约${objectHits}处`, reason: '物件不只装载线索，还在关系变化中反复改变意义，具备作者化表达潜力。', advice: '保留物件递进，但每次出现都应新增信息或改变关系，避免只作装饰。', positive: true });
  const motifs = MOTIF_PATTERNS.map(x => ({ ...x, count: count(text, x.re) })).filter(x => x.count);
  const active = motifs.filter(x => x.count >= 3).length;
  if (active >= 3) all.push({ id: 'voice-profile', level: 'low', label: '叙述声音具有稳定方向', evidence: motifs.map(x => `${x.label}${x.count}处`).join('；'), reason: '文本持续通过物件、反差、潜台词和感官细节组织情绪，而非只依赖事件播报。', advice: '后续章节继续保持“规则压力—日常物件—人物选择”的表达链，减少抽象总结。', positive: true });

  const chapterOpenings = chapters.map(x => clean(x.content).slice(0, 18)).filter(Boolean);
  const sameOpen = chapterOpenings.filter((x, i) => i && x.slice(0, 4) === chapterOpenings[i - 1].slice(0, 4)).length;
  if (chapters.length >= 4 && sameOpen >= 2) all.push({ id: 'chapter-voice-flat', level: 'low', label: '章节开场节拍相近', evidence: `${sameOpen}处相邻章节使用相似开场方式`, reason: '章节都从相近的环境或状态切入时，读者会感觉结构被固定模板牵引。', advice: '交替使用动作、对话、物件、结果或异常作为开场，但以场景需要为准。' });
  return all;
}

function detectCraft(text, chapters) {
  const findings = [];
  const dialogue = count(text, /[“”「」]/g) / Math.max(1, text.length) * 1000;
  const directExplain = count(text, /(她忽然明白|他忽然懂了|这意味着|也就是说|她知道|他知道|原来如此)/g);
  const sensory = count(text, /(闻见|听见|摸到|油香|水声|灯光|灰雪|凉|温)/g);
  const action = count(text, /(走|抬|放|拿|递|推|挡|停|转身|打开|关上|坐下|站起)/g);
  const explainRatio = directExplain / Math.max(1, Math.round(text.length / 1000));
  if (dialogue < 8 && text.length > 3000) findings.push({ id: 'interaction-low', level: 'medium', label: '现场互动偏少', evidence: `对话密度约${dialogue.toFixed(1)}处/千字`, reason: '较多信息由旁白直接说明，人物关系的现场摩擦可能不足。', advice: '把关键解释改成有目标的问答、拒答、试探或行动冲突，不要为了增加对话而加入寒暄。' });
  if (explainRatio > 2.4) findings.push({ id: 'emotion-declared', level: 'medium', label: '情绪解释多于情绪呈现', evidence: `“明白/懂/知道/意味着”类总结约${directExplain}处`, reason: '动作后立即解释意义，可能压缩读者自行感受和推断的空间。', advice: '对关键段落做一次删解释测试：保留动作或物件反应，删去重复的意义总结。' });
  if (sensory >= 8 && action >= 16) findings.push({ id: 'scene-embodied', level: 'low', label: '场景具有进入感', evidence: `感官细节约${sensory}处，动作动词约${action}处`, reason: '文本较多让空间、声音、温度和动作参与叙事，不只是汇报剧情。', advice: '继续让环境改变人物选择；避免在已经成立的现场感后再补一层抽象拔高。', positive: true });
  const synopsisTerms = count(text, /(随后|接着|然后|很快|立刻|最终|于是)/g);
  if (synopsisTerms >= Math.max(12, Math.round(text.length / 700))) findings.push({ id: 'plot-summary', level: 'medium', label: '剧情概述感偏强', evidence: `“随后/然后/立刻/最终”等推进词约${synopsisTerms}处`, reason: '连续使用概述连接词会让事件像提纲一样跳过过程，降低真人阅读的现场感。', advice: '把其中至少两处改成完整场景：让人物做选择、遭遇阻力，并承担具体后果。' });
  return findings;
}

function detectMemoryAssets(text, chapters) {
  const assets = [];
  const patterns = [
    { label: '核心物件', re: /(红绳|白蜡烛|糖纸|筷子|鸡腿|乐高)/g },
    { label: '关系动作', re: /(挡刀|递给|放在门口|叫哥|不敢碰|并肩|跟在.{0,8}身后)/g },
    { label: '反常规则', re: /(第128次|换她出去|系统认了|已被标的亲手斩杀|查无此人)/g }
  ];
  for (const p of patterns) {
    const n = count(text, p.re);
    if (n) assets.push({ label: p.label, count: n, evidence: excerpt(text, p.re) });
  }
  const distinct = assets.filter(x => x.count >= 2).length;
  return { assets, strength: distinct >= 2 ? '有明确记忆资产' : '记忆资产偏少', evidence: assets.map(x => `${x.label}${x.count}处`).join('；') || '未识别出稳定记忆资产' };
}

function moodOf(chapter) {
  const t = chapter.content;
  const weights = { 惊: /(突然|睁开|震颤|异样|通报|发现)/g, 疑: /(为什么|谁在|不知道|观测|异常|秘密)/g, 痛: /(死|疼|血|失去|反噬|哭)/g, 暖: /(粥|鸡腿|蜡烛|薄荷|家|笑|哥哥|哥)/g, 怒: /(杀|恨|拒绝|控制|不让|兜不住)/g, 松: /(早饭|日光|普通|慢慢|安静)/g };
  const scores = Object.fromEntries(Object.entries(weights).map(([k, re]) => [k, count(t, re)]));
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || '平';
}

function detectMood(chapters) {
  const moods = chapters.map(moodOf);
  const runs = [];
  for (let i = 1; i < moods.length; i++) if (moods[i] === moods[i - 1]) runs.push({ index: i, mood: moods[i] });
  const findings = [];
  if (runs.length >= Math.max(3, chapters.length * .45)) findings.push({ id: 'mood-flat', level: 'low', label: '章节情绪色调偏单一', evidence: moods.join(' → '), reason: '连续章节承担相近情绪时，真人读者可能出现情绪疲劳。', advice: '在高强度段落之间安排有效呼吸，或用日常、反差和关系变化调节情绪，不必每章都升级危机。' });
  return { moods, findings };
}

function detectSuspense(text, chapters) {
  const lines = [];
  const known = [
    { name: '身份/关系', re: /(是谁|哥哥|魔神|林渡|不记得)/g },
    { name: '规则漏洞', re: /(第128次|归零|系统|条款|异常|观测)/g },
    { name: '现实威胁', re: /(照片|匿名|风险|偷拍|守门人)/g }
  ];
  for (const item of known) {
    const hits = chapters.map((c, i) => count(c.content, item.re) ? i + 1 : 0).filter(Boolean);
    if (hits.length) {
      const gap = chapters.length - hits[hits.length - 1];
      lines.push({ name: item.name, firstMention: hits[0], lastMention: hits[hits.length - 1], gap, status: gap >= 10 ? '可能断档' : '持续', mentions: hits.length });
    }
  }
  const findings = lines.filter(x => x.gap >= 10).map(x => ({ id: `suspense-gap-${x.name}`, level: 'medium', label: `${x.name}线索间隔偏长`, evidence: `第${x.firstMention}章埋设，最后在第${x.lastMention}章提及，间隔${x.gap}章`, reason: '读者可能遗忘悬念，回收时需要重新建立上下文。', advice: '在中间用一个轻量物件、异常细节或人物反应提醒，不必提前揭示答案。' }));
  return { lines, findings };
}

function readerDropoff(chapters, craftFindings, voiceFindings) {
  const risks = chapters.map((ch, i) => {
    const t = ch.content;
    const explanation = count(t, /(原来|也就是说|她知道|他知道|这意味着|随后|然后)/g);
    const dialogue = count(t, /[“”「」]/g);
    const action = count(t, /(走|抬|放|拿|递|推|挡|停|转身|打开|关上)/g);
    let score = 0;
    if (ch.chars > 1800 && dialogue < 8) score += 22;
    if (explanation >= 8) score += 18;
    if (action < 5 && ch.chars > 700) score += 18;
    if (i && ch.content.slice(0, 30) === chapters[i - 1].content.slice(0, 30)) score += 10;
    return { index: ch.index, title: ch.title, score: clamp(score), band: score >= 35 ? '高' : score >= 18 ? '中' : '低', reason: score >= 35 ? '可能出现跳读：解释密集或现场动作不足。' : score >= 18 ? '存在局部跳读风险。' : '未发现明显脱落信号。' };
  });
  return risks.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

function recommendationReview(input, options = {}) {
  const text = String(input.text || '').trim();
  const chapters = chaptersOf(text);
  const voiceFindings = detectVoice(text, chapters);
  const craftFindings = detectCraft(text, chapters);
  const memory = detectMemoryAssets(text, chapters);
  const mood = detectMood(chapters);
  const suspense = detectSuspense(text, chapters);
  const dropoff = readerDropoff(chapters, craftFindings, voiceFindings);
  const allFindings = [...voiceFindings, ...craftFindings, ...mood.findings, ...suspense.findings];
  const positives = allFindings.filter(x => x.positive);
  const material = memory.assets.filter(x => x.count >= 2).length;
  const methodCount = [voiceFindings.some(x => x.id === 'motif-asset'), voiceFindings.some(x => x.id === 'voice-profile'), craftFindings.some(x => x.id === 'scene-embodied'), material >= 2].filter(Boolean).length;
  const highFindings = allFindings.filter(x => LEVEL_ORDER[x.level] >= 2).length;
  const rank = rankFromSignals({ methodCount, highFindings, textLength: text.length, chaptersLength: chapters.length });
  const status = { R0: '仅通过审核', R1: '基础可读性', R2: '具备真人推荐价值', R3: '具备重点推荐潜力' }[rank];
  const recommendation = rank === 'R3' ? '可进入重点人工抽样，优先观察评论分歧和记忆回访。' : rank === 'R2' ? '可进入精准标签小流量推荐，重点观察开篇完成率与中段跳读。' : rank === 'R1' ? '建议先做小流量测试，不宜依据单一分数扩大推荐。' : '暂不建议主动推荐，先补足场景、人物声音和记忆资产。';
  return {
    rank, status, recommendation,
    scope: options.scope || (chapters.length >= 2 ? '多章真人阅读价值诊断' : '单章/样稿真人阅读价值诊断'),
    confidence: text.length >= 5000 && chapters.length >= 3 ? '中' : '低',
    strengths: positives.slice(0, 5).map(x => ({ label: x.label, evidence: x.evidence, reason: x.reason })),
    findings: allFindings.filter(x => !x.positive).sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]).slice(0, 12),
    memoryAssets: memory,
    craft: { sceneFunctions: { plot: '推进情节', character: '建立人物', information: '传递信息', atmosphere: '调节呼吸', theme: '深化主题' }, methodCoverage: methodCount, mood: mood.moods, moodFindings: mood.findings },
    suspense,
    readerDropoff: dropoff,
    limits: '真人推荐价值是可解释的阅读体验估计，不是平台推荐保证、留存预测或作者能力鉴定。最好结合匿名冷读、24小时记忆回访和评论分歧测试。'
  };
}

module.exports = { recommendationReview, rankFromSignals, detectVoice, detectCraft, detectMemoryAssets, detectMood, detectSuspense, readerDropoff };
