const AI_ADVICE = {
  assistant: '删除“以下是续写内容”“希望对你有帮助”等对话残留，并检查前后段是否还保留了回答式口吻。',
  prompt: '删除提示词、字数要求和系统指令；不要只删标签，应人工重写与指令相邻的两到三段。',
  cliche: '逐处替换为角色专属动作、具体环境反应或有因果作用的细节，避免批量同义替换。',
  connective: '删除不承担转折作用的连接词，用动作、时间变化或人物反应直接衔接场景。',
  grand: '删掉抽象拔高，改写为可见的行为、后果或场景变化，让意义由情节呈现。',
  vague: '补充具体来源或改成角色的主观判断；虚构叙事中避免无来源的权威口吻。',
  'generic-emotion': '把通用心理词换成角色特有的身体反应、选择和未说出口的话。',
  'ngram-repeat': '合并重复信息，保留一次最有效的表达；让相邻段落分别承担动作、信息或情绪推进。',
  'sentence-uniform': '打破整齐句式：关键动作使用短句，观察和回忆允许长句，并穿插停顿或对话。',
  'paragraph-uniform': '按场景节奏而不是固定字数分段；转折处缩短，信息密集处适当展开。',
  'opening-repeat': '调整重复句首，交替使用动作、环境、对话和人物感知切入，但不要机械轮换。',
  dash: '仅保留真正表示插入或突转的破折号，其余改用句号、逗号或直接拆句。',
  'lexical-low': '检查高频动词、情绪词和称谓，补充符合场景的具体名词与动作，不建议简单堆砌生僻同义词。'
};

const AI_PHRASE_GROUPS = [
  { id: 'assistant', label: '助手对话残留', weight: 22, re: /(当然[！!]|希望这对你有帮助|如果你需要.{0,16}我可以|以下是.{0,16}(续写|内容|正文)|作为一个AI|请告诉我|您说得完全正确)/gi },
  { id: 'prompt', label: '提示词或生成参数残留', weight: 25, re: /(用户要求[：:]|请按以下.{0,12}(大纲|要求)|字数要求[：:]?\d+|不要解释直接输出|system prompt|<\|system\|>)/gi },
  { id: 'cliche', label: '网文模板短语', weight: 5, re: /(命运的齿轮开始转动|嘴角勾起一抹弧度|眼底闪过一丝|空气仿佛凝固|说时迟那时快|不由得倒吸一口凉气|一股暖流涌上心头|时间仿佛静止)/g },
  { id: 'connective', label: '连接词模板化', weight: 3, re: /(与此同时|然而|此外|值得注意的是|总而言之|综上所述|不可否认的是|更重要的是)/g },
  { id: 'grand', label: '泛化拔高表达', weight: 4, re: /(标志着.{0,16}(转折|时刻|开始)|彰显了.{0,18}(意义|重要性)|不仅仅是.{0,22}更是|这不仅是.{0,22}也是|时代的浪潮|命运的交响曲|历史的长河)/g },
  { id: 'vague', label: '模糊权威归因', weight: 4, re: /(专家认为|研究表明|有观点认为|业内人士指出|相关数据显示|众所周知)/g },
  { id: 'generic-emotion', label: '通用情绪动作', weight: 3, re: /(心中五味杂陈|百感交集|眼神中充满了复杂的情绪|内心掀起惊涛骇浪|心头猛地一颤)/g }
];

const { clamp, mean, std } = require('./util');

function cleanText(text) { return String(text || '').replace(/第[零〇一二三四五六七八九十百千万两\d]+[章节卷回部篇][^\n]*/g, '').replace(/\s+/g, ' ').trim(); }
function sampleLongText(text, maxChars = 240000) {
  const source = String(text || '');
  // 边界处理：正文长度不超过采样上限时整段送检，不做窗口切片。sampled=false 且 coverage=1 表示完整覆盖，
  // 窗口切片逻辑只在 source.length > maxChars 分支处理，避免等于上限时出现 0 长度窗口。
  if (source.length <= maxChars) return { text: source, originalChars: source.length, sampledChars: source.length, sampled: false, coverage: 1 };
  const windows = 24;
  const size = Math.floor(maxChars / windows);
  const parts = [];
  for (let i = 0; i < windows; i++) {
    const start = Math.floor(i * (source.length - size) / (windows - 1));
    parts.push(source.slice(start, start + size));
  }
  const sampledText = parts.join('\n');
  return { text: sampledText, originalChars: source.length, sampledChars: sampledText.length, sampled: true, coverage: Math.max(1, Math.round(sampledText.length / source.length * 100)) };
}
function sentencesOf(text) { return cleanText(text).split(/[。！？!?；;]/).map(x => x.trim()).filter(x => x.length >= 2); }
function countPatterns(text) {
  return AI_PHRASE_GROUPS.map(group => {
    group.re.lastIndex = 0;
    const matches = [...text.matchAll(group.re)].slice(0, 20).map(x => x[0]);
    return { id: group.id, label: group.label, weight: group.weight, count: matches.length, samples: [...new Set(matches)].slice(0, 4) };
  }).filter(x => x.count);
}

function ngramRepetition(text, n = 4) {
  const chars = [...cleanText(text).replace(/[，。！？、：“”‘’；,.!?\-—]/g, '')];
  if (chars.length < n * 5) return { ratio: 0, repeated: [] };
  const counts = new Map();
  for (let i = 0; i <= chars.length - n; i++) {
    const gram = chars.slice(i, i + n).join('');
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]);
  const excess = repeated.reduce((sum, [, count]) => sum + count - 2, 0);
  return { ratio: excess / Math.max(1, chars.length - n + 1), repeated: repeated.slice(0, 6).map(([gram, count]) => ({ gram, count })) };
}

function sentenceUniformity(sentences) {
  const lengths = sentences.map(x => [...x].length);
  const avg = mean(lengths), deviation = std(lengths);
  const cv = avg ? deviation / avg : 1;
  return { average: avg, deviation, cv, suspicious: sentences.length >= 12 && cv < .34 };
}

function openingRepetition(sentences) {
  const openings = sentences.map(x => [...x].slice(0, 3).join('')).filter(x => x.length === 3);
  const counts = new Map();
  openings.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  return { opening: top[0], count: top[1], ratio: openings.length ? top[1] / openings.length : 0 };
}

function paragraphUniformity(text) {
  const paragraphs = String(text).split(/\n+/).map(x => x.trim()).filter(x => x.length >= 15);
  const lengths = paragraphs.map(x => [...x].length);
  const avg = mean(lengths), cv = avg ? std(lengths) / avg : 1;
  return { count: paragraphs.length, average: avg, cv, suspicious: paragraphs.length >= 8 && cv < .28 };
}

function punctuationProfile(text) {
  const length = Math.max(1, cleanText(text).length);
  const dash = (text.match(/[—–]/g) || []).length;
  const colon = (text.match(/[：:]/g) || []).length;
  const quote = (text.match(/[“”「」]/g) || []).length;
  return { dash, colon, quote, dashPerK: dash * 1000 / length, colonPerK: colon * 1000 / length };
}

function vocabularyProfile(text) {
  const chars = [...cleanText(text).replace(/[\p{P}\p{S}\d\s]/gu, '')];
  const unique = new Set(chars).size;
  const windows = [];
  for (let i = 0; i < chars.length; i += 300) {
    const w = chars.slice(i, i + 300); if (w.length >= 100) windows.push(new Set(w).size / w.length);
  }
  return { uniqueRatio: chars.length ? unique / chars.length : 0, windowDiversity: mean(windows), chars: chars.length };
}

function segmentScores(text, windowSize = 800) {
  const clean = String(text || '');
  const segments = [];
  for (let i = 0; i < clean.length; i += windowSize) {
    const part = clean.slice(i, i + windowSize);
    if (part.trim().length < 120) continue;
    const patterns = countPatterns(part);
    const repetition = ngramRepetition(part);
    const uniformity = sentenceUniformity(sentencesOf(part));
    let score = patterns.reduce((sum, x) => sum + x.weight * Math.min(3, x.count), 0);
    score += clamp(repetition.ratio * 300, 0, 22);
    if (uniformity.suspicious) score += 8;
    segments.push({ index: segments.length + 1, start: i, end: Math.min(clean.length, i + windowSize), score: Math.round(clamp(score)), excerpt: cleanText(part).slice(0, 90), signals: patterns.map(x => x.label) });
  }
  return segments;
}

function analyzeAIWriting(text) {
  const sampling = sampleLongText(text);
  const source = sampling.text;
  const sentences = sentencesOf(source);
  const patterns = countPatterns(source);
  const repetition = ngramRepetition(source);
  const sentence = sentenceUniformity(sentences);
  const opening = openingRepetition(sentences);
  const paragraph = paragraphUniformity(source);
  const punctuation = punctuationProfile(source);
  const vocabulary = vocabularyProfile(source);
  const segments = segmentScores(source);
  const signals = [];
  let score = 0;

  for (const p of patterns) {
    const points = p.weight * Math.min(3, p.count);
    score += points;
    signals.push({ id: p.id, label: p.label, level: p.weight >= 20 ? 'high' : p.count >= 3 ? 'medium' : 'low', points, evidence: p.samples.join('、'), explanation: `${p.label}出现${p.count}次。`, advice: AI_ADVICE[p.id] });
  }
  if (repetition.ratio > .018) { const points = Math.round(clamp(repetition.ratio * 350, 5, 24)); score += points; signals.push({ id: 'ngram-repeat', label: '局部短语重复偏高', level: points >= 14 ? 'medium' : 'low', points, evidence: repetition.repeated.map(x => `${x.gram}×${x.count}`).join('、'), explanation: '四字片段重复密度偏高，可能来自模板续写、注水或刻意回环。', advice: AI_ADVICE['ngram-repeat'] }); }
  if (sentence.suspicious) { score += 8; signals.push({ id: 'sentence-uniform', label: '句长过于均匀', level: 'low', points: 8, evidence: `平均${sentence.average.toFixed(1)}字，变异系数${sentence.cv.toFixed(2)}`, explanation: '连续句子长度变化较小；机器生成文本有时表现出较平滑的节奏。', advice: AI_ADVICE['sentence-uniform'] }); }
  if (paragraph.suspicious) { score += 7; signals.push({ id: 'paragraph-uniform', label: '段落长度过于整齐', level: 'low', points: 7, evidence: `平均${paragraph.average.toFixed(1)}字，变异系数${paragraph.cv.toFixed(2)}`, explanation: '段落长度过度规整可能反映模板化组织，但也可能是作者刻意控制。', advice: AI_ADVICE['paragraph-uniform'] }); }
  if (opening.ratio > .2 && opening.count >= 4) { score += 7; signals.push({ id: 'opening-repeat', label: '句首结构重复', level: 'low', points: 7, evidence: `“${opening.opening}…”占${Math.round(opening.ratio * 100)}%`, explanation: '多个句子使用相同开头，可能存在机械续写。', advice: AI_ADVICE['opening-repeat'] }); }
  if (punctuation.dashPerK > 8) { score += 5; signals.push({ id: 'dash', label: '破折号密度偏高', level: 'low', points: 5, evidence: `每千字${punctuation.dashPerK.toFixed(1)}个`, explanation: '破折号高频是部分模型输出的风格信号，不构成来源证明。', advice: AI_ADVICE.dash }); }
  if (vocabulary.chars > 500 && vocabulary.windowDiversity < .34) { score += 6; signals.push({ id: 'lexical-low', label: '局部用字多样性偏低', level: 'low', points: 6, evidence: `窗口多样性${vocabulary.windowDiversity.toFixed(2)}`, explanation: '局部词汇选择较集中，可能来自模板复用，也可能与题材和作者风格有关。', advice: AI_ADVICE['lexical-low'] }); }

  const explicit = signals.some(x => ['assistant', 'prompt'].includes(x.id));
  const weakOnly = signals.length && signals.every(x => x.level === 'low');
  score = Math.round(clamp(score));
  const band = explicit || score >= 65 ? '较高AI辅助风险' : score >= 38 ? '中等AI辅助风险' : score >= 18 ? '轻微AI风格信号' : '未发现明显AI风格信号';
  const confidence = explicit ? '较高' : source.length < 800 ? '低' : weakOnly ? '低' : source.length >= 2500 ? '中' : '较低';
  const prioritizedAdvice = signals.sort((a, b) => b.points - a.points).slice(0, 6).map((signal, index) => ({ priority: index + 1, signalId: signal.id, title: signal.label, advice: signal.advice, evidence: signal.evidence }));
  return {
    score, band, confidence, signals, segments, prioritizedAdvice, sampling: { originalChars: sampling.originalChars, sampledChars: sampling.sampledChars, sampled: sampling.sampled, coverage: sampling.coverage },
    metrics: { chars: cleanText(source).length, sentence, paragraph, opening, repetition, punctuation, vocabulary },
    limits: '该结果仅表示文本中出现了与常见模型输出相似的可解释特征，不能证明作者使用了AI。短文本、类型化网文、统一编辑风格、翻译文本和非母语写作都可能被误判；人工改写也可能显著降低检测率。',
    recommendation: explicit ? '优先删除助手话术或提示词残留，并人工检查相邻段落。' : score >= 38 ? '建议结合创作过程记录、版本历史和人工复核判断，不要仅凭分数拒稿。' : '不建议据此认定文本来源；继续检查内容质量、原创性和平台规则。'
  };
}

module.exports = { analyzeAIWriting, countPatterns, ngramRepetition, sentenceUniformity, segmentScores, sampleLongText };
