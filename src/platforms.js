'use strict';

/**
 * 平台画像配置（叶子模块）。
 *
 * 平台主数据集中存放在此，analyzer 与 aiReviewer 仅引用本模块，
 * 不再各自定义 PLATFORM_PROFILES，从而避免平台配置分散与跨模块耦合。
 * 本模块不依赖任何其它 src 子模块，确保它永远是依赖图的叶子，避免循环依赖。
 */
const PLATFORM_PROFILES = {
  fanqie: { name: '番茄小说', base: 79, strict: { safety: 1.15, copyright: 1, ai: 1.05, metadata: 1.1, quality: .9 }, note: '大众阅读平台画像：内容安全、标题简介及开篇节奏采用较高权重。', evidence: '平台公开入口可确认其原创小说与大众免费阅读定位；内部审核尺度未公开。' },
  qidian: { name: '起点中文网', base: 78, strict: { safety: 1, copyright: 1.15, ai: 1, metadata: .85, quality: 1.05 }, note: '长篇类型文学平台画像：原创性、设定一致性及连载质量权重较高。', evidence: '平台公开页面强调原创与首发小说；内部审核模型未公开。' },
  jjwxc: { name: '晋江文学城', base: 77, strict: { safety: 1.1, copyright: 1.1, ai: 1, metadata: 1, quality: 1 }, note: '女性向原创平台画像：题材标签、人物关系与内容边界权重较高。', evidence: '平台公开页面可确认原创内容和细分题材体系；内部审核尺度未公开。' },
  qimao: { name: '七猫中文网', base: 80, strict: { safety: 1.1, copyright: 1, ai: 1.05, metadata: 1, quality: .9 }, note: '大众免费阅读平台画像：内容安全、开篇吸引力与可读性权重较高。', evidence: '平台级具体政策待官方页面持续核验，本画像不冒充官方规则。' },
  zongheng: { name: '纵横中文网', base: 79, strict: { safety: 1, copyright: 1.1, ai: .95, metadata: .9, quality: 1 }, note: '类型文学平台画像：原创表达、叙事完整性和分类匹配权重较高。', evidence: '平台级具体政策待官方页面持续核验，本画像不冒充官方规则。' }
};

module.exports = { PLATFORM_PROFILES };
