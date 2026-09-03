const { clamp, mean, std, CHAPTER_HEADING } = require('./util');

function chaptersOf(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const matches = [...source.matchAll(CHAPTER_HEADING)];
  if (matches.length < 2) return [{ title: '全文', content: source, chars: source.replace(/\s/g, '').length }];
  return matches.map((match, index) => {
    const end = matches[index + 1]?.index ?? source.length;
    const content = source.slice(match.index + match[0].length, end).trim();
    return { title: match[0].trim(), content, chars: content.replace(/\s/g, '').length };
  });
}

function addFinding(findings, finding) { findings.push({ category: 'quality', level: 'low', count: 1, ...finding }); }

function analyzeCommercialQuality(input) {
  const title = String(input.title || '').trim();
  const intro = String(input.intro || '').trim();
  const text = String(input.text || '').trim();
  const chapters = chaptersOf(text);
  const findings = [];
  let score = 100;

  const chapterLengths = chapters.map(x => x.chars).filter(Boolean);
  const averageChapterChars = mean(chapterLengths);
  const chars = text.replace(/\s/g, '').length;
  const dialogueMarks = (text.match(/[“”「」]/g) || []).length;
  const dialogueDensity = dialogueMarks / Math.max(1, text.length);
  const exposition = (text.match(/(十年前|原来|他说|因为|当年|这些年|事故|记录|证据|真相)/g) || []).length;
  const expositionDensity = exposition * 1000 / Math.max(1, text.length);
  const obstacleTerms = (text.match(/(但是|却|没想到|阻止|失败|代价|失去|拒绝|犹豫|选择|来不及|不能)/g) || []).length;
  const resolutionTerms = (text.match(/(证据|真相|重新立案|作证|公开|找到|回来|没有受伤)/g) || []).length;
  const endings = chapters.map(ch => ch.content.trim().split(/\n+/).filter(Boolean).slice(-2).join('')).filter(Boolean);
  const suspenseEndings = endings.filter(x => /[？?]|(突然|原来|就在|声音|是谁|不在|来了|停住|中断|只有一次)/.test(x)).length;
  const clueObjects = ['钥匙','照片','纸条','录音带','账本','铁筒','存储卡','结构图','值班记录'];
  const clueHits = clueObjects.filter(x => text.includes(x));
  const lengthCv = averageChapterChars ? std(chapterLengths) / averageChapterChars : 0;
  const deliveredClues = (text.match(/(交给|递给|取出|掏出|藏着|装着|找到|摸到|收到|寄到|正好能|就在.{0,8}(里面|下面|后面))/g) || []).length;
  const investigationActions = (text.match(/(核对|验证|试探|调查|走访|推断|排除|复盘|设局|跟踪|查阅|比对|质疑)/g) || []).length;
  const anonymousOpposition = (text.match(/(有人|他们|几个人|追来的人|外面的人|不希望.{0,8}的人)/g) || []).length;
  const oppositionIntent = (text.match(/(威胁|勒索|灭口|争夺|阻止|报复|掩盖|栽赃|控制|逼迫)/g) || []).length;

  // 成熟度扣分项改为数据驱动：每条检查声明 id、命中判定 test(ctx) 与条目构造 build(ctx)。
  // 阈值、level、label、evidence/reason/advice 文案与重构前逐字一致，仅组织方式变化，分数结果不变。
  const qualityContext = {
    title, intro, text, input, chapters, chapterLengths, averageChapterChars, chars,
    dialogueDensity, expositionDensity, obstacleTerms, resolutionTerms,
    suspenseEndings, clueHits, lengthCv, deliveredClues, investigationActions,
    anonymousOpposition, oppositionIntent
  };

  const QUALITY_CHECKS = [
    {
      id: 'chapter-underdeveloped',
      test: (ctx) => ctx.input.chapterAnalysis && ctx.chars < 900,
      build: (ctx) => {
        const level = ctx.chars < 550 ? 'medium' : 'low';
        const points = ctx.chars < 550 ? 22 : 14;
        return { category: 'quality', level, label: '章节展开不足', points, evidence: `本章${ctx.chars}字`, reason: '本章篇幅较短，人物目标、阻力、选择和后果可能尚未形成完整场景。', advice: '围绕本章核心冲突补足行动阻力、人物选择及结果，避免只用解释和新线索推进。' };
      }
    },
    {
      id: 'chapter-underdeveloped',
      test: (ctx) => ctx.chapters.length >= 3 && ctx.averageChapterChars < 900,
      build: (ctx) => {
        const level = ctx.averageChapterChars < 550 ? 'medium' : 'low';
        const points = ctx.averageChapterChars < 550 ? 22 : 14;
        return { category: 'quality', level, label: '章节展开不足', points, evidence: `共${ctx.chapters.length}章，平均每章${Math.round(ctx.averageChapterChars)}字`, reason: '章节过短时，线索、冲突和人物选择容易停留在梗概层，不能仅凭无违规判定为成熟投稿稿件。', advice: '扩充关键行动的阻力、人物选择和后果，不要只增加环境描写或重复心理活动。' };
      }
    },
    {
      id: 'sample-too-short',
      test: (ctx) => ctx.text.length < 6000 && ctx.chapters.length >= 4,
      build: (ctx) => ({ category: 'quality', label: '长篇判断样本不足', points: 8, evidence: `${ctx.chapters.length}章合计${ctx.chars}字`, reason: '多章作品总量较短，难以判断长线设定、人物弧光和连载稳定性。', advice: '投稿长篇前至少补充完整开篇单元，并把当前结果标为样章预审而非全书通过率。' })
    },
    {
      id: 'interaction-low-v2',
      test: (ctx) => ctx.text.length > 1500 && ctx.dialogueDensity < .018,
      build: (ctx) => ({ category: 'quality', label: '人物即时互动不足', points: 8, evidence: `对话标记密度${(ctx.dialogueDensity * 1000).toFixed(1)}/千字`, reason: '较多信息由叙述直接交代，人物关系和冲突可能缺少现场感。', advice: '把关键解释放入有目标冲突的对话和行动中，避免为了增加对话而加入无效寒暄。' })
    },
    {
      id: 'exposition-dense',
      test: (ctx) => ctx.text.length > 1500 && ctx.expositionDensity > 11,
      build: (ctx) => ({ category: 'quality', label: '解释性信息偏密', points: 10, evidence: `解释性线索约${ctx.expositionDensity.toFixed(1)}处/千字`, reason: '背景、真相和证据词密集出现，可能形成连续说明或快速解谜，削弱读者参与推断的空间。', advice: '拆分一次性说明，用误判、现场证据、人物隐瞒和后续验证分批兑现信息。' })
    },
    {
      id: 'resolution-easy',
      test: (ctx) => ctx.chapters.length >= 3 && ctx.resolutionTerms > ctx.obstacleTerms * 1.3 && ctx.resolutionTerms >= 8,
      build: (ctx) => ({ category: 'quality', label: '解谜兑现快于阻力累积', points: 10, evidence: `解决/揭示词${ctx.resolutionTerms}处，阻力/代价词${ctx.obstacleTerms}处`, reason: '线索和解决方案出现较快，主角获得答案的成本偏低，容易呈现剧情梗概感。', advice: '增加会改变人物计划的失败、证据冲突或道德选择，并让一次错误判断产生后果。' })
    },
    {
      id: 'hook-uniform',
      test: (ctx) => ctx.chapters.length >= 4 && ctx.suspenseEndings / ctx.chapters.length >= .8,
      build: (ctx) => ({ category: 'quality', label: '章节钩子模式偏统一', points: 7, evidence: `${ctx.suspenseEndings}/${ctx.chapters.length}章以突发或疑问式悬念收尾`, reason: '每章都用相似的突发揭示收尾，会显得结构过度工整，降低真实节奏变化。', advice: '交替使用决定、代价、关系变化、信息反转和安静余波收尾，让钩子服务当前章节结果。' })
    },
    {
      id: 'clue-object-dense',
      test: (ctx) => ctx.text.length < 5000 && ctx.clueHits.length >= 7,
      build: (ctx) => ({ category: 'quality', label: '道具线索投放过密', points: 9, evidence: ctx.clueHits.join('、'), reason: '短篇幅内连续出现多个功能性道具，剧情可能依靠“拿到下一个线索”推进，人物主动推理空间不足。', advice: '合并作用相近的线索，让一个核心道具经历发现、误读和再解释，而不是不断新增道具。' })
    },
    {
      id: 'title-weak',
      test: (ctx) => !ctx.input.chapterAnalysis && (!ctx.title || ctx.title.length < 2),
      build: (ctx) => ({ category: 'metadata', label: '书名信息不足', points: 8, evidence: ctx.title || '未填写', reason: '书名缺失或过短，无法表达题材和记忆点。', advice: '使用核心意象、人物目标或主要矛盾形成可识别书名。' })
    },
    {
      id: 'intro-thin',
      test: (ctx) => !ctx.input.chapterAnalysis && ctx.intro.length < 35,
      build: (ctx) => ({ category: 'metadata', label: '简介卖点不足', points: 8, evidence: `简介${ctx.intro.length}字`, reason: '简介过短时，人物目标、阻力和差异化卖点可能不清楚。', advice: '用“人物处境—必须完成的目标—主要阻力或代价”组织简介。' })
    },
    {
      id: 'chapter-length-uniform',
      test: (ctx) => ctx.chapters.length >= 4 && ctx.averageChapterChars > 250 && ctx.lengthCv < .09,
      build: (ctx) => ({ category: 'quality', label: '章节体量过度整齐', points: 6, evidence: `章节字数变异系数${ctx.lengthCv.toFixed(2)}（越接近0越整齐）`, reason: '多章篇幅几乎等长，且每章都承担相近的信息量时，可能呈现按提纲定额展开的机械感。单凭等长不能判断AI创作，但应检查节奏是否被固定字数支配。', advice: '按本章冲突是否完成决定篇幅；重要选择和后果充分展开，过渡章则及时收束，不必追求每章等长。' })
    },
    {
      id: 'clue-delivery-chain',
      test: (ctx) => ctx.chapters.length >= 3 && ctx.text.length < 8000 && ctx.deliveredClues >= 9 && ctx.deliveredClues > ctx.investigationActions * 2.2,
      build: (ctx) => ({ category: 'quality', label: '线索获取过于便利', points: 9, evidence: `线索被交付/发现约${ctx.deliveredClues}次，主动查证词约${ctx.investigationActions}次`, reason: '关键答案多由他人递交、容器开出或恰好发现，主角的判断、验证和承担风险不足，容易产生“作者在发线索”的推进感。', advice: '至少把一条关键线索改成主角主动设问、验证并付出代价后获得；安排一次误读或伪线索改变原计划。' })
    },
    {
      id: 'opposition-vague',
      test: (ctx) => ctx.text.length > 1800 && ctx.anonymousOpposition >= 6 && ctx.oppositionIntent < 4,
      build: (ctx) => ({ category: 'quality', label: '反方力量过于抽象', points: 7, evidence: `匿名反方指代约${ctx.anonymousOpposition}次，明确动机/行动词约${ctx.oppositionIntent}次`, reason: '“有人”“他们”持续制造压力，却缺少可识别人物、具体目标和决策逻辑，冲突容易只剩功能性追赶。', advice: '明确一名核心对手及其必须阻止主角的现实代价，让其至少做出一次改变局势的主动选择。' })
    }
  ];

  for (const check of QUALITY_CHECKS) {
    if (!check.test(qualityContext)) continue;
    const finding = check.build(qualityContext);
    score -= finding.points;
    addFinding(findings, { id: check.id, ...finding });
  }

  const maturity = score >= 85 ? '较成熟' : score >= 70 ? '基本可读，建议优化' : score >= 55 ? '样稿感明显' : '需要结构性修改';
  const readiness = score >= 85 ? '可进入人工投稿复核' : score >= 70 ? '建议小修后复核' : score >= 55 ? '建议重点修改后再投' : '暂不建议按成熟长篇投稿';
  return {
    score: Math.round(clamp(score)), maturity, readiness, findings: findings.sort((a, b) => b.points - a.points),
    metrics: { chapters: chapters.length, totalChars: text.replace(/\s/g, '').length, averageChapterChars: Math.round(averageChapterChars), chapterLengthCv: Number(lengthCv.toFixed(2)), dialogueDensity: Number(dialogueDensity.toFixed(4)), expositionDensity: Number(expositionDensity.toFixed(1)), obstacleTerms, resolutionTerms },
    limits: '质量诊断用于识别样稿成熟度、节奏和商业表达问题，不代表平台签约、推荐或读者留存结果。'
  };
}

module.exports = { analyzeCommercialQuality, chaptersOf };
