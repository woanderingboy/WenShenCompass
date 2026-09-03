'use strict';

const { mean } = require('./util');

/**
 * 篇幅（字数）检测模块（叶子安全）。
 *
 * 背景：本项目的使用者既会粘贴「单个章节」，也会粘贴「多章全文」，
 * 而小说规范是单章 2000–4000 字。因此本模块把「判定单元」抽象出来：
 *   - 逐章分析（chapterAnalysis）→ 单元是「本章」
 *   - 多章全文（≥2 章）          → 单元是「平均单章」
 *   - 单篇无章节标题              → 单元是「全文」
 *
 * 依赖约束：本模块只依赖 ./util（叶子模块），绝不 require
 * analyzer / commercialQuality / chapterAnalyzer，以免形成循环依赖。
 * 全部导出均为纯函数，便于单测。
 */

/** 单章目标字数区间（含端点）：2000–4000 字。 */
const LENGTH_TARGET = { min: 2000, max: 4000 };

/** 空文本阈值：字符数为 0 时单列 empty 档，不参与达标差值计算之外的判定。 */
const LENGTH_EMPTY = 0;

/** 「严重偏短」上界（不含）：非空且低于该值即 far-short。 */
const FAR_SHORT_CEILING = 1000;

/** 「偏长」上界（含）：超过目标上限但不超过该值即 long。 */
const LONG_CEILING = 6000;

/** 汇总时判定为「多章」的最少章节数：达到该值改用平均单章字数作为判定单元。 */
const MULTI_CHAPTER_MIN = 2;

/**
 * 商业质量扣分的最小单元字数：低于该值由已有的 chapter-underdeveloped 负责，
 * 本模块的长度检查不重复扣分，避免同一处「过短」被惩罚两次。
 */
const LENGTH_GUARD_MIN_CHARS = 900;

/** 判定单元前缀：逐章 / 多章平均 / 单篇全文。 */
const UNIT_LABEL = { chapter: '本章', average: '平均单章', whole: '全文' };

/**
 * 篇幅档位表（数据驱动，新增档位只需在此追加一项）。
 *
 * test 按数组顺序自上而下匹配，因此顺序即优先级：
 *   empty → far-short → short → ok → long → far-long（兜底）
 *
 * @type {Array<{status: string, label: string, level: string, points: number,
 *               test: (chars: number, target: {min: number, max: number}) => boolean,
 *               reason: (chars: number, target: {min: number, max: number}) => string,
 *               advice: (chars: number, target: {min: number, max: number}) => string,
 *               suggest: (deviation: number, chars: number, target: {min: number, max: number}) => string}>}
 */
const LENGTH_BANDS = [
  {
    status: 'empty',
    label: '未输入正文',
    level: 'medium',
    points: 0,
    test: (chars) => chars <= LENGTH_EMPTY,
    reason: () => '未检测到正文内容，无法判断篇幅是否达到单章要求。',
    advice: () => '先粘贴需要检测的单章或多章正文，再查看篇幅诊断。',
    suggest: (deviation, chars, target) => `尚未检测到正文，建议先粘贴需要检测的内容（目标区间 ${target.min}–${target.max} 字）。`
  },
  {
    status: 'far-short',
    label: '严重偏短',
    level: 'medium',
    points: 8,
    test: (chars) => chars < FAR_SHORT_CEILING,
    reason: (chars, target) => `当前 ${chars} 字，明显低于 ${target.min}–${target.max} 字的目标区间，单章可能无法完成一个完整的冲突回合。`,
    advice: () => '补足人物目标、阻力、选择和结果，让本章形成一个完整场景，而不是情节概述。',
    suggest: (deviation) => `还差 ${deviation} 字达标，建议先补一整个场景单元：目标—阻力—选择—后果，把概述改成可看见的行动。`
  },
  {
    status: 'short',
    label: '偏短',
    level: 'low',
    points: 5,
    test: (chars, target) => chars < target.min,
    reason: (chars, target) => `当前 ${chars} 字，低于目标区间下限 ${target.min} 字，关键行动的阻力、选择和后果可能展开不足。`,
    advice: () => '在本章核心冲突上增加一个阻力回合，并写清人物选择与后果。',
    suggest: (deviation) => `还差 ${deviation} 字达标，建议补一个完整的冲突回合（阻力—选择—后果）。`
  },
  {
    status: 'ok',
    label: '达标',
    level: 'ok',
    points: 0,
    test: (chars, target) => chars <= target.max,
    reason: (chars, target) => `当前 ${chars} 字，处于 ${target.min}–${target.max} 字的目标区间内。`,
    advice: () => '无需为字数增删；按本章冲突是否完成决定最终篇幅。',
    suggest: () => '字数已在目标区间内，保持当前篇幅即可。'
  },
  {
    status: 'long',
    label: '偏长',
    level: 'low',
    points: 5,
    test: (chars, target) => chars <= Math.max(target.max, LONG_CEILING),
    reason: (chars, target) => `当前 ${chars} 字，高于目标区间上限 ${target.max} 字，可能混入与本章核心冲突无关的支线或描写。`,
    advice: () => '删减与本章核心冲突无关的环境、背景与重复心理描写。',
    suggest: (deviation) => `超出 ${deviation} 字，建议删减与本章核心冲突无关的描写，或把支线移到下一章。`
  },
  {
    status: 'far-long',
    label: '严重偏长',
    level: 'medium',
    points: 8,
    test: () => true,
    reason: (chars, target) => `当前 ${chars} 字，明显高于目标区间上限 ${target.max} 字，一章内可能塞入了多个完整场景或独立冲突。`,
    advice: () => '按场景边界拆分章节，让每章只完成一个主要冲突回合。',
    suggest: (deviation) => `超出 ${deviation} 字，建议按场景拆成两章，或删减与本章核心冲突无关的描写。`
  }
];

/**
 * 把任意入参归一化为非负整数字符数。
 * @param {*} value 原始字数入参
 * @returns {number} 非负整数
 */
function normalizeChars(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

/**
 * 把任意入参归一化为目标区间对象，缺失字段回落到 LENGTH_TARGET。
 * @param {{min?: number, max?: number}} [target] 目标区间
 * @returns {{min: number, max: number}} 归一化后的目标区间
 */
function normalizeTarget(target) {
  const min = normalizeChars(target && target.min !== undefined ? target.min : LENGTH_TARGET.min);
  const max = normalizeChars(target && target.max !== undefined ? target.max : LENGTH_TARGET.max);
  return { min, max: Math.max(min, max) };
}

/**
 * 计算相对目标区间的偏离字数：不足返回正数缺口，超出返回正数溢出，达标返回 0。
 * @param {number} chars 判定单元字数
 * @param {{min: number, max: number}} target 目标区间
 * @returns {number} 偏离字数（非负）
 */
function deviationOf(chars, target) {
  if (chars < target.min) return target.min - chars;
  if (chars > target.max) return chars - target.max;
  return 0;
}

/**
 * 判定单段文本的篇幅档位。
 *
 * @param {number} chars 判定单元字数（全项目统一口径：text.replace(/\s/g,'').length）
 * @param {{min: number, max: number}} [target=LENGTH_TARGET] 目标字数区间
 * @returns {{chars: number, target: {min: number, max: number}, status: string, label: string,
 *            level: string, reason: string, advice: string, deviation: number, suggestion: string}} 档位判定结果
 */
function classifyLength(chars, target = LENGTH_TARGET) {
  const count = normalizeChars(chars);
  const range = normalizeTarget(target);
  const band = LENGTH_BANDS.find(item => item.test(count, range));
  const deviation = deviationOf(count, range);
  return {
    chars: count,
    target: range,
    status: band.status,
    label: band.label,
    level: band.level,
    reason: band.reason(count, range),
    advice: band.advice(count, range),
    deviation,
    suggestion: band.suggest(deviation, count, range)
  };
}

/**
 * 汇总多章字数：以「平均单章」作为判定单元，同时给出极值、达标章数与总量。
 *
 * @param {number[]} charsList 各章字数数组
 * @param {{min: number, max: number}} [target=LENGTH_TARGET] 目标字数区间
 * @returns {{unit: string, count: number, total: number, averageChars: number, min: number, max: number,
 *            inRange: number, outOfRange: number, chars: number, target: {min: number, max: number},
 *            status: string, label: string, level: string, reason: string, advice: string,
 *            deviation: number, suggestion: string}} 汇总结果
 */
function summarizeLength(charsList, target = LENGTH_TARGET) {
  const list = (Array.isArray(charsList) ? charsList : []).map(normalizeChars);
  const range = normalizeTarget(target);
  const total = list.reduce((sum, x) => sum + x, 0);
  const averageChars = Math.round(mean(list));
  const inRange = list.filter(x => classifyLength(x, range).status === 'ok').length;
  const base = classifyLength(averageChars, range);
  return {
    unit: UNIT_LABEL.average,
    count: list.length,
    total,
    averageChars,
    min: list.length ? Math.min(...list) : 0,
    max: list.length ? Math.max(...list) : 0,
    inRange,
    outOfRange: list.length - inRange,
    ...base
  };
}

/**
 * 生成整份报告的篇幅检测结论。
 *
 * 判定单元规则：章节数达到 MULTI_CHAPTER_MIN 时用平均单章字数（unit 为「平均单章」），
 * 否则用正文字符数（unit 为「全文」）。仅多章场景附带 perChapter 逐章明细。
 *
 * @param {Array<{index?: number, title?: string, chars: number}>} chapters 章节列表
 * @param {number} bodyChars 正文总字符数（非多章场景作为判定单元）
 * @param {{min: number, max: number}} [target=LENGTH_TARGET] 目标字数区间
 * @returns {{unit: string, chars: number, status: string, label: string, level: string,
 *            target: {min: number, max: number}, deviation: number, suggestion: string,
 *            reason: string, advice: string, totalChars: number,
 *            inRangeChapters: number, outOfRangeChapters: number,
 *            perChapter?: Array<{index: number, title: string, chars: number, status: string}>}} 篇幅检测结论
 */
function buildLengthReport(chapters, bodyChars, target = LENGTH_TARGET) {
  const range = normalizeTarget(target);
  const list = Array.isArray(chapters) ? chapters : [];
  const charsList = list.map(chapter => normalizeChars(chapter && chapter.chars));
  const summary = summarizeLength(charsList, range);
  const isMultiChapter = list.length >= MULTI_CHAPTER_MIN;
  const bodyCount = normalizeChars(bodyChars);
  const unit = isMultiChapter ? UNIT_LABEL.average : UNIT_LABEL.whole;
  const base = classifyLength(isMultiChapter ? summary.averageChars : bodyCount, range);
  const inRangeChapters = isMultiChapter ? summary.inRange : (base.status === 'ok' ? 1 : 0);
  const report = {
    unit,
    chars: base.chars,
    status: base.status,
    label: base.label,
    level: base.level,
    target: base.target,
    deviation: base.deviation,
    suggestion: base.suggestion,
    reason: base.reason,
    advice: base.advice,
    totalChars: isMultiChapter ? summary.total : bodyCount,
    inRangeChapters,
    outOfRangeChapters: isMultiChapter ? summary.outOfRange : (base.status === 'ok' ? 0 : 1)
  };
  if (isMultiChapter) {
    report.perChapter = list.map((chapter, index) => ({
      index: chapter && chapter.index !== undefined ? normalizeChars(chapter.index) : index + 1,
      title: (chapter && chapter.title) || `第${index + 1}章`,
      chars: charsList[index],
      status: classifyLength(charsList[index], range).status
    }));
  }
  return report;
}

/**
 * 按档位状态取商业质量扣分（达标档为 0）。
 * @param {string} status 档位状态（empty / far-short / short / ok / long / far-long）
 * @returns {number} 扣分数
 */
function lengthPointsOf(status) {
  const band = LENGTH_BANDS.find(item => item.status === status);
  return band ? band.points : 0;
}

module.exports = {
  LENGTH_TARGET,
  LENGTH_EMPTY,
  FAR_SHORT_CEILING,
  LONG_CEILING,
  MULTI_CHAPTER_MIN,
  LENGTH_GUARD_MIN_CHARS,
  UNIT_LABEL,
  LENGTH_BANDS,
  classifyLength,
  summarizeLength,
  buildLengthReport,
  lengthPointsOf
};
