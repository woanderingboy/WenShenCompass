const { scan } = require('./analyzer');
const { analyzeAIWriting } = require('./aiStyleDetector');
const { analyzeCommercialQuality } = require('./commercialQuality');
const { classifyLength } = require('./lengthGuard');
const { LEVEL_WEIGHT, CHAPTER_HEADING } = require('./util');

function splitChapters(text, options = {}) {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const matches = [...source.matchAll(CHAPTER_HEADING)];
  if (matches.length >= 2) {
    const preface = source.slice(0, matches[0].index).trim();
    const chapters = matches.map((match, index) => {
      const end = matches[index + 1]?.index ?? source.length;
      const content = source.slice(match.index + match[0].length, end).trim();
      return { index: index + 1, title: match[0].trim(), content, chars: content.replace(/\s/g, '').length, source: 'heading' };
    });
    if (preface) chapters.unshift({ index: 0, title: '序章/卷首内容', content: preface, chars: preface.replace(/\s/g, '').length, source: 'preface' });
    return chapters;
  }

  const chunkSize = Math.max(1000, Number(options.chunkSize) || 5000);
  const paragraphs = source.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs.length ? paragraphs : [source]) {
    if (current && current.length + paragraph.length > chunkSize) {
      chunks.push(current); current = paragraph;
    } else current += `${current ? '\n\n' : ''}${paragraph}`;
  }
  if (current) chunks.push(current);
  if (chunks.length === 1 && source.length > chunkSize) {
    chunks.length = 0;
    for (let i = 0; i < source.length; i += chunkSize) chunks.push(source.slice(i, i + chunkSize));
  }
  return chunks.map((content, index) => ({ index: index + 1, title: `自动分段 ${index + 1}`, content, chars: content.replace(/\s/g, '').length, source: 'chunk' }));
}

/**
 * 轻量单章分析：只做规则扫描（scan）与商业成熟度诊断（analyzeCommercialQuality），
 * 不跑完整 analyzeNovel、不跑推荐评审（recommendationReview）、不算全平台投稿准备度区间。
 *
 * 逐章分析场景下，每章无需重复计算平台画像与推荐评审，使用本函数可显著降低开销，
 * 同时保留逐章风险热区所需的 issues / commercialQuality / counts 最小信息。
 *
 * @param {object} input 分析输入，含 title / intro / text / chapterAnalysis
 * @returns {{issues: object[], commercialQuality: object, counts: object}} 最小分析产物
 */
function scanOnly(input) {
  const title = String(input.title || '').trim();
  const intro = String(input.intro || '').trim();
  const body = String(input.text || '').trim();
  const complete = `${title}\n${intro}\n${body}`;
  const commercialQuality = analyzeCommercialQuality({ title, intro, text: body, chapterAnalysis: Boolean(input.chapterAnalysis) });
  const issues = [
    ...scan(complete),
    ...commercialQuality.findings.map(x => ({ ...x, origin: 'commercialQuality', match: x.evidence, excerpt: x.evidence }))
  ].sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.level]++;

  return { issues, commercialQuality, counts };
}

function analyzeChapters(input, options = {}) {
  const chapters = splitChapters(input.text, options);
  const maxChapters = Math.max(1, Number(options.maxChapters) || 2000);
  const analyzed = chapters.slice(0, maxChapters).map(chapter => {
    // 逐章使用轻量 scanOnly：显式关闭逐章推荐评审，不重复计算全平台区间。
    const scanned = scanOnly({ chapterAnalysis: true, title: chapter.title, intro: '', text: chapter.content });
    const aiStyle = analyzeAIWriting(chapter.content);
    const policyIssues = scanned.issues.filter(issue => issue.origin !== 'commercialQuality' && !['quality', 'metadata'].includes(issue.category));
    const qualityIssues = scanned.issues.filter(issue => issue.origin === 'commercialQuality' || ['quality', 'metadata'].includes(issue.category));
    const riskScore = policyIssues.reduce((sum, issue) => sum + (LEVEL_WEIGHT[issue.level] || 0), 0);
    const qualityRiskScore = qualityIssues.reduce((sum, issue) => sum + (LEVEL_WEIGHT[issue.level] || 0), 0);
    const combinedRiskScore = Math.round(Math.min(100, riskScore * .65 + qualityRiskScore * .45 + aiStyle.score * .55));
    return {
      index: chapter.index, title: chapter.title, chars: chapter.chars, source: chapter.source,
      // 本章篇幅档位（目标区间 2000–4000 字），供风险地图与汇总统计复用。
      lengthCheck: classifyLength(chapter.chars),
      riskScore, qualityRiskScore, qualityScore: scanned.commercialQuality.score, qualityReadiness: scanned.commercialQuality.readiness, combinedRiskScore, aiScore: aiStyle.score, aiBand: aiStyle.band, aiConfidence: aiStyle.confidence,
      verdict: riskScore >= 40 ? '高风险' : riskScore >= 15 ? '建议修改' : riskScore > 0 ? '轻微风险' : '暂未发现明显合规风险',
      counts: scanned.counts,
      issues: policyIssues.slice(0, 6).map(({ id, category, level, label, excerpt, reason, advice }) => ({ id, category, level, label, excerpt, reason, advice })),
      qualityIssues: qualityIssues.slice(0, 4).map(({ id, category, level, label, excerpt, reason, advice }) => ({ id, category, level, label, excerpt, reason, advice })),
      aiSignals: aiStyle.signals.slice(0, 5), aiAdvice: aiStyle.prioritizedAdvice.slice(0, 4)
    };
  });
  const ranked = [...analyzed].sort((a, b) => b.combinedRiskScore - a.combinedRiskScore);
  const hotspots = ranked.filter(x => x.combinedRiskScore > 0).slice(0, 15);
  const totalChars = chapters.reduce((sum, x) => sum + x.chars, 0);
  // 篇幅达标统计：status 为 ok 即落在 2000–4000 字目标区间内。
  const chaptersInRange = analyzed.filter(x => x.lengthCheck.status === 'ok').length;
  return {
    mode: chapters.some(x => x.source === 'heading') ? '章节标题切分' : '按长度自动分段',
    totalChapters: chapters.length, analyzedChapters: analyzed.length, omittedChapters: Math.max(0, chapters.length - analyzed.length), totalChars,
    coverage: chapters.length ? Math.round(analyzed.length / chapters.length * 100) : 0,
    chapters: analyzed, hotspots,
    summary: {
      riskyChapters: analyzed.filter(x => x.riskScore > 0).length,
      highRiskChapters: analyzed.filter(x => x.riskScore >= 40).length,
      aiSignalChapters: analyzed.filter(x => x.aiScore >= 18).length,
      highAIChapters: analyzed.filter(x => x.aiScore >= 65).length,
      averageAIScore: analyzed.length ? Math.round(analyzed.reduce((sum, x) => sum + x.aiScore, 0) / analyzed.length) : 0,
      averageQualityScore: analyzed.length ? Math.round(analyzed.reduce((sum, x) => sum + x.qualityScore, 0) / analyzed.length) : 0,
      chaptersInRange,
      chaptersOutOfRange: analyzed.length - chaptersInRange,
      topChapter: hotspots[0]?.title || '无'
    }
  };
}

function selectReviewChapters(chapterReport, limit = 8) {
  const chapters = chapterReport.chapters;
  if (!chapters.length) return [];
  const selected = new Map();
  chapters.slice(0, 3).forEach(x => selected.set(x.index, x));
  chapters.slice(-1).forEach(x => selected.set(x.index, x));
  chapterReport.hotspots.forEach(x => { if (selected.size < limit) selected.set(x.index, x); });
  return [...selected.values()].slice(0, limit);
}

module.exports = { splitChapters, scanOnly, analyzeChapters, selectReviewChapters };
