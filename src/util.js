'use strict';

/**
 * 通用工具与共享常量（叶子模块）。
 *
 * 本模块不依赖任何 src 子模块，确保它永远是依赖图的“叶子”，
 * 从而避免循环依赖。它只收敛纯函数与无业务逻辑共享常量：
 *   - clamp / mean / std：数值统计辅助（原散落在 aiStyleDetector / commercialQuality / aiDetectorApi）
 *   - redact：隐私脱敏（原在 aiReviewer）
 *   - LEVEL_WEIGHT：风险等级权重（合并 analyzer.WEIGHT 与 chapterAnalyzer.LEVEL_COST）
 *   - CHAPTER_HEADING：章节标题正则（原在 chapterAnalyzer / commercialQuality）
 */

/** 章节标题识别正则（带 g/i/m 标志，供 String.matchAll 复用）。 */
const CHAPTER_HEADING = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章节卷回部篇]|chapter\s*\d+)[^\n]{0,50}$/gim;

/** 风险等级权重：critical/high/medium/low，统一用于合规扣分与逐章风险累计。 */
const LEVEL_WEIGHT = { critical: 25, high: 14, medium: 7, low: 3 };

/**
 * 将数值限制在 [low, high] 区间。
 * @param {number} value 待裁剪数值
 * @param {number} [low=0] 下界
 * @param {number} [high=100] 上界
 * @returns {number} 裁剪后的数值
 */
function clamp(value, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

/**
 * 计算数组算术平均值，空数组返回 0。
 * @param {number[]} values 数值数组
 * @returns {number} 平均值
 */
function mean(values) {
  return values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
}

/**
 * 计算数组总体标准差，空数组返回 0。
 * @param {number[]} values 数值数组
 * @returns {number} 标准差
 */
function std(values) {
  const average = mean(values);
  return values.length ? Math.sqrt(mean(values.map(x => (x - average) ** 2))) : 0;
}

/**
 * 对文本做隐私脱敏：手机号、身份证号、邮箱替换为占位符。
 * 该函数用于正文离开本机（送审/外部检测）前的脱敏红线，逻辑保持一致。
 * @param {string} text 待脱敏文本
 * @returns {string} 脱敏后文本
 */
function redact(text) {
  return String(text || '')
    .replace(/1[3-9]\d{9}/g, '[手机号已脱敏]')
    .replace(/\d{17}[\dXx]/g, '[身份号码已脱敏]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已脱敏]');
}

module.exports = { CHAPTER_HEADING, LEVEL_WEIGHT, clamp, mean, std, redact };
