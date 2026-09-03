const { PLATFORM_PROFILES } = require('./platforms');

const PUBLIC_SOURCES = [
  { title: '《网络信息内容生态治理规定》', authority: '国家互联网信息办公室', level: 'A', url: 'https://www.gov.cn/zhengce/zhengceku/2020-11/25/content_5564110.htm', covers: '违法和不良信息、低俗暴力、歧视、谣言等内容治理基础分类' },
  { title: '《生成式人工智能服务管理暂行办法》', authority: '国家网信办等七部门', level: 'A', url: 'https://www.gov.cn/zhengce/zhengceku/202307/content_6891752.htm', covers: '生成内容安全、知识产权、个人信息与服务责任' },
  { title: '《人工智能生成合成内容标识办法》', authority: '国家网信办等四部门', level: 'A', url: 'https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm', covers: 'AI生成合成内容显式及隐式标识要求' },
  { title: '番茄小说官方网站', authority: '平台公开页面', level: 'B', url: 'https://fanqienovel.com/', covers: '平台定位与公开题材信息；具体内部审核尺度未公开' },
  { title: '阅文作家专区/起点中文网', authority: '平台公开页面', level: 'B', url: 'https://write.qq.com/', covers: '原创作品发布入口与平台定位；具体内部审核尺度未公开' },
  { title: '晋江文学城官方网站', authority: '平台公开页面', level: 'B', url: 'https://www.jjwxc.net/', covers: '原创作品及题材体系；具体内部审核尺度未公开' }
];

const RULES = [
  { id: 'crime', category: 'safety', level: 'high', label: '违法行为呈现', re: /(制毒|贩毒|绑架|洗钱|制造炸弹|入室抢劫)/g, reason: '涉及违法犯罪内容；若包含赞美、鼓励或可操作步骤，审核风险会显著上升。', advice: '弱化实施细节，明确负面后果与叙事批判立场。' },
  { id: 'sexual', category: 'safety', level: 'critical', label: '色情低俗风险', re: /(强奸|迷奸|裸贷|未成年.{0,8}(性|开房)|性侵)/g, reason: '涉及高敏感性或未成年人相关不当内容。', advice: '删除露骨描写，不消费受害者，必要情节采用克制转述并强调保护立场。' },
  { id: 'selfharm', category: 'safety', level: 'high', label: '自伤自杀风险', re: /(自杀|割腕|跳楼|服毒)/g, reason: '出现自伤或自杀表达，细节化、浪漫化描写可能造成高风险。', advice: '避免方法细节和浪漫化表达，补充干预、求助与负面后果。' },
  { id: 'violence', category: 'safety', level: 'medium', label: '血腥暴力描写', re: /(鲜血喷涌|肢解|挖眼|剥皮|尸块|血肉模糊)/g, reason: '描写可能过于血腥或感官刺激。', advice: '减少感官细节，转为结果性、克制性的叙述。' },
  { id: 'gambling', category: 'safety', level: 'medium', label: '赌博相关内容', re: /(网赌|赌博|下注|赌场|出千)/g, reason: '涉及赌博行为，若有引导、获利宣传或方法描述，风险更高。', advice: '避免获利诱导和操作方式，清楚呈现危害与代价。' },
  { id: 'instruction', category: 'ai', level: 'high', label: 'AI指令残留', re: /(作为一个AI|以下是.{0,12}(续写|生成)|希望以上内容|如果你需要.{0,10}我可以)/gi, reason: '正文中疑似残留生成指令或助手话术。', advice: '删除元话语，将内容改写为自然叙事。' },
  { id: 'cliche', category: 'ai', level: 'low', label: '模板化表达', re: /(命运的齿轮开始转动|嘴角勾起一抹弧度|眼底闪过一丝|空气仿佛凝固了|说时迟那时快)/g, reason: '高频模板句可能削弱原创感和人物辨识度。', advice: '用角色特有动作、感官和场景细节替代通用套话。' },
  { id: 'copyright', category: 'copyright', level: 'high', label: '知名作品元素风险', re: /(霍格沃茨|斗气化马|武魂殿|史莱克学院|花果山美猴王)/g, reason: '出现辨识度较高的既有作品元素，可能涉及同人或版权边界。', advice: '确认授权和同人规则；商业原创作品建议重构专名、设定与情节组合。' },
  { id: 'promo', category: 'metadata', level: 'medium', label: '营销承诺风险', re: /(全网第一|史上最强|百分百真实|保证看哭|不看后悔|震惊全网)/g, reason: '夸张或绝对化营销措辞可能影响书名、简介审核与读者信任。', advice: '用明确的冲突、人物目标和差异化卖点替代夸张承诺。' },
  { id: 'privacy', category: 'safety', level: 'high', label: '个人信息风险', re: /(?:1[3-9]\d{9}|\d{17}[\dXx])/g, reason: '文本疑似包含真实手机号或身份号码。', advice: '改用虚构、掩码信息，避免暴露个人隐私。' },
  { id: 'extremism', category: 'safety', level: 'critical', label: '极端主义与恐怖内容', re: /(宣扬恐怖主义|加入恐怖组织|极端主义万岁|恐怖袭击教程)/g, reason: '涉及恐怖主义、极端主义的宣扬、招募或教程化表达，属于高优先级内容安全风险。', advice: '删除宣扬、招募和操作细节；必要反派情节应采用明确批判立场并弱化可复制信息。' },
  { id: 'hate', category: 'safety', level: 'high', label: '群体歧视与仇恨', re: /(某族人都该死|某种族天生低等|残疾人都是废物|女性天生愚蠢)/g, reason: '对民族、种族、性别、残障等群体进行贬损或煽动仇恨，存在明显内容治理风险。', advice: '删除群体化贬损；若用于塑造反派，应通过叙事后果和其他人物回应清楚否定该立场。' },
  { id: 'rumor', category: 'safety', level: 'high', label: '现实谣言与不实指控', re: /(内部绝密消息|官方都不敢说|某医院故意害死|某公司投毒|未经证实的真相)/g, reason: '对现实机构、企业或事件作出未经证实的严重指控，可能引发谣言、名誉和现实伤害风险。', advice: '改为明确虚构设定，避免可识别现实主体；事实性描述应核验来源并使用审慎措辞。' },
  { id: 'danger', category: 'safety', level: 'high', label: '危险行为教程化', re: /(详细步骤如下|具体配方是|绕过监控的方法|如何自制炸药|只需按以下步骤)/g, reason: '疑似提供危险、违法行为的可执行步骤。单纯出现情节与可操作教程应区别处理。', advice: '删除配方、剂量、步骤和规避侦查信息，仅保留不可复制的情节结果。' },
  { id: 'minor-harm', category: 'safety', level: 'critical', label: '未成年人伤害与性化', re: /(小学生.{0,12}(开房|裸照|性交易)|未满十四岁.{0,12}(性|怀孕)|诱骗未成年.{0,8}(裸照|见面))/g, reason: '涉及未成年人性化、诱骗或严重侵害内容，需要最高优先级人工复核。', advice: '删除性化和猎奇细节，以保护受害者为中心；确有剧情必要时采用克制转述和明确谴责。' },
  { id: 'drug-praise', category: 'safety', level: 'high', label: '毒品美化或诱导', re: /(吸毒很酷|毒品让人快乐|尝一口不会上瘾|贩毒发财)/g, reason: '对毒品使用或交易进行美化、诱导或获利宣传。', advice: '删除诱导性表达，明确危害、法律后果和人物付出的代价。' },
  { id: 'medical', category: 'safety', level: 'medium', label: '高风险医疗信息', re: /(停掉医生开的药|偏方包治百病|无需就医|保证治愈癌症|药量加倍)/g, reason: '可能构成误导性医疗建议或鼓励危险行为。', advice: '避免诊断、剂量和治愈承诺；标注虚构性，并建议现实中咨询专业人员。' },
  { id: 'ai-label', category: 'ai', level: 'medium', label: 'AI生成内容标识提示', re: /(AI生成|人工智能生成|模型生成|AI续写)/gi, reason: '作品自述包含AI生成信息。公开发布时需结合平台入口及现行标识要求核验是否需要显式标识。', advice: '保留创作过程记录，并在发布前查看目标平台最新AI内容声明或标识入口；不要虚假声明纯人工。' },
  { id: 'prompt-leak', category: 'ai', level: 'high', label: '提示词或系统信息残留', re: /(<\|system\|>|system prompt|用户要求：|请按以下大纲续写|字数要求：\d+|不要解释直接输出)/gi, reason: '正文中疑似包含提示词、角色指令或生成参数，属于明显的编辑疏漏。', advice: '删除提示词及参数，对相邻段落进行人工重写并检查衔接。' },
  { id: 'contact-promo', category: 'metadata', level: 'medium', label: '站外引流信息', re: /(加微信|关注公众号|QQ群[：:]?\d+|私聊领取|VX[：:]?[a-zA-Z0-9_-]+)/gi, reason: '正文或简介疑似包含站外联系方式、导流或交易信息，可能触发平台运营规则。', advice: '删除联系方式和站外引流话术，使用平台允许的作者互动渠道。' },
  { id: 'money-fraud', category: 'safety', level: 'high', label: '诈骗与非法获利诱导', re: /(稳赚不赔|刷单返利|代刷流水|提供银行卡走账|高额回报零风险)/g, reason: '出现诈骗、跑分或非法获利诱导表达。', advice: '删除招募和操作细节；剧情呈现应明确其违法性、受害后果与惩处。' }
];

const { LEVEL_WEIGHT } = require('./util');
const CATEGORY_NAME = { safety: '内容安全', copyright: '版权原创', ai: 'AI文本质量', metadata: '标题与简介', quality: '叙事质量' };
const { analyzeCommercialQuality, chaptersOf } = require('./commercialQuality');
const { buildLengthReport } = require('./lengthGuard');
const { recommendationReview } = require('./recommendationReview');

// 平台冷启动区间与评分计算中的具名常量（避免散落的魔法数字；仅供本文件使用）。
const PENALTY_CAP = 1.6;                 // 单条规则风险对平台惩罚的上限倍数
const PENALTY_STEP = 0.12;               // 同一条规则多命中时，每多一次的惩罚增量
const SHORT_PENALTY_THIN = 7;            // 正文过短（<500 字）的投稿准备度惩罚
const SHORT_PENALTY_MID = 3;             // 正文偏短（<1200 字）的投稿准备度惩罚
const SHORT_PENALTY_THIN_MAX = 500;      // 触发最大短篇惩罚的字数上限
const SHORT_PENALTY_MID_MAX = 1200;      // 触发中等短篇惩罚的字数上限
const COLD_START_OFFSET = 10;            // 冷启动基准相对平台基准的下调量
const QUALITY_CENTER = 75;               // 成熟度分数的中位基准
const QUALITY_GAIN = 0.42;               // 成熟度每偏离中位 1 分对准备度的影响系数
const CENTER_MIN = 5;                    // 平台区间中心的下限
const CENTER_MAX = 90;                   // 平台区间中心的上限
const SPREAD_THRESHOLD = 1000;           // 正文长度阈值，决定区间展幅
const SPREAD_THIN = 12;                  // 短正文的区间展幅
const SPREAD_NORMAL = 10;                // 常规正文的区间展幅
const PLATFORM_SCORE_FLOOR = 2;          // 平台区间下界
const PLATFORM_SCORE_CEIL = 95;          // 平台区间上界
const HIGH_RISK_CENTER = 35;             // 判定「高风险」的中心分阈值
const MODIFY_CENTER = 68;                // 判定「建议修改后提交」的中心分阈值
const COMPLIANCE_PENALTY_THRESHOLD = 20; // 触发「存在合规风险」的惩罚累计阈值

function excerpt(text, index, length) {
  const start = Math.max(0, index - 28), end = Math.min(text.length, index + length + 38);
  return `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

function repetitionIssues(text) {
  const paras = text.split(/\n+/).map(x => x.trim()).filter(x => x.length >= 12);
  const counts = new Map();
  for (const p of paras) counts.set(p, (counts.get(p) || 0) + 1);
  const repeated = [...counts.entries()].filter(([, count]) => count > 1).slice(0, 3);
  return repeated.map(([p, count], i) => ({ id: `repeat-${i}`, category: 'ai', level: 'medium', label: '段落机械重复', match: p.slice(0, 36), excerpt: p.slice(0, 100), count, reason: `相同或高度一致的段落重复出现${count}次，可能被视为注水或生成异常。`, advice: '合并重复信息，让每个段落承担新的动作、信息或情绪推进。' }));
}

function qualityIssues(text) {
  const issues = [];
  const sentences = text.split(/[。！？!?]/).map(x => x.trim()).filter(Boolean);
  const dialogueCount = (text.match(/[“”「」]/g) || []).length;
  if (text.length > 500 && sentences.length && text.length / sentences.length > 62) issues.push({ id: 'long-sentence', category: 'quality', level: 'medium', label: '长句密度偏高', match: '全篇统计', excerpt: '平均句子长度偏高，移动端阅读可能较吃力。', count: 1, reason: '过长句会降低网文阅读节奏，也容易造成指代和逻辑不清。', advice: '拆分复句，每句优先表达一个动作或信息点。' });
  if (text.length > 800 && dialogueCount / text.length < .006) issues.push({ id: 'dialogue-low', category: 'quality', level: 'low', label: '场景互动偏少', match: '全篇统计', excerpt: '较长篇幅内人物对话和即时互动较少。', count: 1, reason: '连续概述可能使开篇显得平缓，削弱人物存在感。', advice: '在关键冲突中加入有目标、有潜台词的对话或即时动作。' });
  return issues;
}

function scan(text) {
  const issues = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    const matches = [];
    while ((m = rule.re.exec(text)) && matches.length < 5) {
      matches.push({ value: m[0], index: m.index });
      if (m[0].length === 0) rule.re.lastIndex++;
    }
    // 只映射规则需要的展示字段，不要把规则里的正则对象（re）带进 issue。
    if (matches.length) issues.push({ id: rule.id, category: rule.category, level: rule.level, label: rule.label, reason: rule.reason, advice: rule.advice, match: matches[0].value, excerpt: excerpt(text, matches[0].index, matches[0].value.length), count: matches.length });
  }
  return [...issues, ...repetitionIssues(text), ...qualityIssues(text)];
}

function analyzeNovel(input) {
  const title = String(input.title || '').trim();
  const intro = String(input.intro || '').trim();
  const body = String(input.text || '').trim();
  const complete = `${title}\n${intro}\n${body}`;
  // 分层关系：顶层 issues 是「规则层」（含 safety/ai/quality 等命中），commercialQuality.findings 是「成熟度层」。
  // 两层对同一段文本的成熟度结论会重叠（例如「章节展开不足」既作为 findings 出现，也以 quality 类 issue 呈现）——这是设计内的，
  // 前端应分别渲染，不要按 id 去重合并，否则会把两份结论误当成一条。
  const commercialQuality = analyzeCommercialQuality({ title, intro, text: body, chapterAnalysis: Boolean(input.chapterAnalysis), lengthTarget: input.lengthTarget });
  const recommendation = input.recommendationMode === false ? null : recommendationReview({ title, intro, text: body, genre: input.genre });
  const issues = [...scan(complete), ...commercialQuality.findings.map(x => ({ ...x, origin: 'commercialQuality', match: x.evidence, excerpt: x.evidence }))].sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
  const selected = Array.isArray(input.platforms) && input.platforms.length ? input.platforms : Object.keys(PLATFORM_PROFILES);
  const platforms = selected.filter(id => PLATFORM_PROFILES[id]).map(id => {
    const profile = PLATFORM_PROFILES[id];
    const policyIssues = issues.filter(issue => issue.origin !== 'commercialQuality' && issue.category !== 'quality');
    const policyPenalty = policyIssues.reduce((sum, issue) => sum + LEVEL_WEIGHT[issue.level] * (profile.strict[issue.category] || 1) * Math.min(PENALTY_CAP, 1 + (issue.count - 1) * PENALTY_STEP), 0);
    const shortPenalty = body.length < SHORT_PENALTY_THIN_MAX ? SHORT_PENALTY_THIN : body.length < SHORT_PENALTY_MID_MAX ? SHORT_PENALTY_MID : 0;
    const coldStartBase = profile.base - COLD_START_OFFSET;
    const qualityAdjustment = (commercialQuality.score - QUALITY_CENTER) * QUALITY_GAIN * (profile.strict.quality || 1);
    const center = Math.max(CENTER_MIN, Math.min(CENTER_MAX, Math.round(coldStartBase + qualityAdjustment - policyPenalty - shortPenalty)));
    const spread = body.length < SPREAD_THRESHOLD ? SPREAD_THIN : SPREAD_NORMAL;
    const low = Math.max(PLATFORM_SCORE_FLOOR, center - spread), high = Math.min(PLATFORM_SCORE_CEIL, center + spread);
    const criticalPolicy = policyIssues.some(x => x.level === 'critical');
    const verdict = criticalPolicy || center < HIGH_RISK_CENTER ? '高风险，建议人工复核' : center < MODIFY_CENTER ? '建议修改后提交' : '投稿准备度较高';
    const complianceVerdict = criticalPolicy ? '存在明确高危合规信号' : policyPenalty >= COMPLIANCE_PENALTY_THRESHOLD ? '存在合规风险，建议复核' : '未发现明确合规阻断项';
    const topFactors = [
      ...policyIssues.slice(0, 3).map(x => `规则风险：${x.label}`),
      ...(commercialQuality.findings.slice(0, 3).map(x => `成熟度：${x.label}`))
    ].slice(0, 5);
    if (!topFactors.length) topFactors.push('未发现明确规则风险', `样稿成熟度${commercialQuality.score}分`);
    return { id, name: profile.name, low, high, center, verdict, complianceVerdict, confidence: '低', note: profile.note, evidence: profile.evidence, qualityScore: commercialQuality.score, topFactors, estimateBasis: '综合投稿准备度冷启动区间；不等同于平台真实审核通过率' };
  }).sort((a, b) => b.center - a.center);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.level]++;
  const categoryScores = Object.fromEntries(Object.keys(CATEGORY_NAME).map(cat => {
    const cost = issues.filter(x => x.category === cat).reduce((s, x) => s + LEVEL_WEIGHT[x.level], 0);
    return [cat, Math.max(0, 100 - cost * 2)];
  }));
  const clean = issues.length === 0;
  // 篇幅检测：多章（≥2章）以平均单章字数判定并附逐章明细，否则以正文字符数判定。
  // 章节切分复用 commercialQuality 的 chaptersOf，与 metrics.chapters 口径一致；
  // 此处不能 require chapterAnalyzer（它反向依赖本文件，会形成循环依赖）。
  const lengthCheck = buildLengthReport(chaptersOf(body), commercialQuality.metrics.totalChars, input.lengthTarget);
  return {
    meta: { title: title || '未命名作品', genre: input.genre || '未选择', words: complete.replace(/\s/g, '').length, analyzedAt: new Date().toISOString(), model: '分层规则模拟 v0.2' },
    summary: { counts, issueCount: issues.length, headline: clean ? '暂未发现明显规则风险' : `发现 ${issues.length} 类待处理问题`, disclaimer: '合规预审与投稿成熟度已分开展示；区间是未校准的投稿准备度估计，不是平台官方通过率，也不代表签约、推荐或变现结论。' },
    platforms, issues, commercialQuality, lengthCheck, recommendationReview: recommendation, categoryScores, categoryNames: CATEGORY_NAME, sources: PUBLIC_SOURCES
  };
}

module.exports = { analyzeNovel, scan, PLATFORM_PROFILES, PUBLIC_SOURCES };
