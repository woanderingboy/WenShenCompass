const form = document.querySelector('#auditForm');
const text = document.querySelector('#text');
const results = document.querySelector('#results');
let lastReport = null;

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const levelName = { critical: '致命风险', high: '高风险', medium: '中风险', low: '低风险' };

text.addEventListener('input', () => document.querySelector('#wordCount').textContent = `${text.value.replace(/\s/g, '').length} 字`);
document.querySelector('#txtFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { e.target.value = ''; return alert('当前版本仅支持20MB以内的TXT文件。'); }
  try {
    text.value = await file.text();
    text.dispatchEvent(new Event('input'));
    document.querySelector('#fileStatus').textContent = `已读取：${file.name} · ${(file.size / 1024).toFixed(1)}KB`;
    if (!document.querySelector('#title').value) document.querySelector('#title').value = file.name.replace(/\.txt$/i, '');
  } catch { alert('文件读取失败，请确认是UTF-8编码的TXT文件。'); }
});
document.querySelector('#chapterFilter').addEventListener('change', e => renderChapters(lastReport?.chapterReport, e.target.value));
document.querySelector('#demoBtn').addEventListener('click', () => {
  document.querySelector('#title').value = '第七码头的来信';
  document.querySelector('#genre').value = '悬疑';
  document.querySelector('#intro').value = '失踪十年的父亲寄来一封信，让林川在午夜前往已经废弃的第七码头。';
  text.value = `雨落在第七码头生锈的顶棚上。林川握着那封没有邮戳的信，信纸上只有父亲的笔迹：午夜十二点，带上旧怀表，一个人来。\n\n十年前，父亲就是在这里失踪的。警方只找到一只沾着海水的皮鞋。母亲说他死了，林川却始终不信。\n\n“你还是来了。”仓库后传来一个沙哑的声音。\n\n林川回头，看见守夜人老周提着灯。他的眼底闪过一丝复杂，嘴角勾起一抹弧度。“有人花钱让我把你留到天亮。”\n\n铁门忽然合拢。空气仿佛凝固了。林川没有后退，他按下怀表的暗扣，一张微型照片落入掌心。照片中，父亲站在七码头的钟楼前，身后还有一个本不该出现的人。\n\n作为一个AI，以下是续写内容：林川意识到真相就在钟楼里。\n\n夜风穿过空旷的站台，他握紧那张没有署名的车票。\n夜风穿过空旷的站台，他握紧那张没有署名的车票。`;
  text.dispatchEvent(new Event('input'));
});

document.querySelector('#backBtn').addEventListener('click', () => { results.classList.add('hidden'); document.querySelector('.workspace').classList.remove('hidden'); scrollTo({ top: 220, behavior: 'smooth' }); });
document.querySelector('#riskFilter').addEventListener('change', e => renderIssues(lastReport?.issues || [], e.target.value));

form.addEventListener('submit', async e => {
  e.preventDefault();
  const platforms = [...document.querySelectorAll('[name=platform]:checked')].map(x => x.value);
  if (!platforms.length) return alert('请至少选择一个目标平台。');
  const button = document.querySelector('#submitBtn');
  button.disabled = true; button.querySelector('span').textContent = '正在分析文本…';
  try {
    const reviewMode = document.querySelector('[name=reviewMode]:checked').value;
    const chapterMode = document.querySelector('#chapterMode').checked;
    const recommendationMode = document.querySelector('#recommendationMode').checked;
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: document.querySelector('#title').value, genre: document.querySelector('#genre').value, provenance: document.querySelector('#provenance').value, intro: document.querySelector('#intro').value, text: text.value, platforms, reviewMode, chapterMode, recommendationMode }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    lastReport = data; renderReport(data);
    document.querySelector('.workspace').classList.add('hidden'); results.classList.remove('hidden');
    scrollTo({ top: results.offsetTop - 80, behavior: 'smooth' });
  } catch (error) { alert(error.message || '检测失败，请稍后重试。'); }
  finally { button.disabled = false; button.querySelector('span').textContent = '开始模拟审核'; }
});

function renderReport(data) {
  document.querySelector('#reportTitle').textContent = `《${data.meta.title}》审核结果`;
  const best = data.platforms[0];
  document.querySelector('#summaryCards').innerHTML = `<div class="summary-card main"><small>综合建议</small><strong>${escapeHtml(best?.verdict || '完成检测')}</strong></div>${[['致命',data.summary.counts.critical],['高风险',data.summary.counts.high],['中风险',data.summary.counts.medium],['低风险',data.summary.counts.low]].map(([k,v])=>`<div class="summary-card"><small>${k}</small><strong>${v}</strong></div>`).join('')}`;
  document.querySelector('#platformResults').innerHTML = data.platforms.map(p => `<div class="platform-row"><div class="platform-name"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.verdict)} · 成熟度${p.qualityScore}</small><small>${escapeHtml(p.complianceVerdict || '')}</small></div><div class="bar"><i style="width:${p.center}%"></i></div><div class="range">${p.low}%—${p.high}%<small>估计置信度：${p.confidence}</small></div><div class="platform-factors">${p.topFactors.map(x => `<small>${escapeHtml(x)}</small>`).join('')}<em>${escapeHtml(p.estimateBasis)}</em></div></div>`).join('');
  document.querySelector('#categoryScores').innerHTML = Object.entries(data.categoryScores).map(([id,score]) => `<div class="score-row"><header><span>${escapeHtml(data.categoryNames[id])}</span><b>${score}</b></header><div class="bar"><i style="width:${score}%"></i></div></div>`).join('');
  document.querySelector('#riskFilter').value = 'all'; renderIssues(data.issues, 'all');
  renderRecommendation(data.recommendationReview);
  renderAIStyle(data.aiStyleReport);
  document.querySelector('#chapterFilter').value = 'all'; renderChapters(data.chapterReport, 'all');
  renderHumanReview(data.humanReview);
  document.querySelector('#sourceList').innerHTML = data.sources.map(source => `<a class="source-item" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer"><span class="source-level">${escapeHtml(source.level)}级</span><span><b>${escapeHtml(source.title)}</b><small>${escapeHtml(source.authority)} · ${escapeHtml(source.covers)}</small></span><i>↗</i></a>`).join('');
  document.querySelector('#disclaimer').textContent = `${data.summary.disclaimer} · ${data.meta.model} · 分析字数 ${data.meta.words}`;
}

function renderRecommendation(report) {
  const section = document.querySelector('#recommendationSection');
  if (!section) return;
  if (!report) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.querySelector('#recommendationRank').textContent = `${report.rank} · ${report.status}`;
  document.querySelector('#recommendationStatus').textContent = report.status;
  document.querySelector('#recommendationAdvice').textContent = report.recommendation;
  document.querySelector('#recommendationConfidence').textContent = `估计置信度：${report.confidence}`;
  document.querySelector('#methodCoverage').textContent = `写作手法覆盖 ${report.craft.methodCoverage}/4`;
  document.querySelector('#recommendationStrengths').innerHTML = report.strengths.length ? report.strengths.map(x => `<article class="recommendation-item positive"><b>${escapeHtml(x.label)}</b><p>${escapeHtml(x.reason)}</p><small>${escapeHtml(x.evidence)}</small></article>`).join('') : '<div class="empty">尚未识别出稳定的作者化写作资产</div>';
  document.querySelector('#recommendationFindings').innerHTML = report.findings.length ? report.findings.map(x => `<article class="recommendation-item"><b>${escapeHtml(x.label)}</b><p>${escapeHtml(x.reason)}</p><small>${escapeHtml(x.evidence)}</small><footer>优化：${escapeHtml(x.advice)}</footer></article>`).join('') : '<div class="review-clean">未发现明显真人阅读阻碍</div>';
  document.querySelector('#memoryAssets').innerHTML = report.memoryAssets.assets.length ? report.memoryAssets.assets.map(x => `<div class="asset-row"><b>${escapeHtml(x.label)}</b><span>${x.count}处</span><small>${escapeHtml(x.evidence)}</small></div>`).join('') : '<div class="empty">尚未识别出稳定记忆资产</div>';
  document.querySelector('#suspenseLines').innerHTML = report.suspense.lines.length ? report.suspense.lines.map(x => `<div class="asset-row"><b>${escapeHtml(x.name)}</b><span class="${x.status === '可能断档' ? 'warning-text' : ''}">${escapeHtml(x.status)}</span><small>首次第${x.firstMention}章 · 最后第${x.lastMention}章 · 共${x.mentions}次</small></div>`).join('') : '<div class="empty">未识别出可追踪的长线悬念</div>';
  document.querySelector('#moodCurve').innerHTML = report.craft.mood.map((x, i) => `<span title="第${i + 1}章">${escapeHtml(x)}</span>`).join('');
  document.querySelector('#dropoffList').innerHTML = report.readerDropoff.length ? report.readerDropoff.map(x => `<div><b>${escapeHtml(x.title)}</b><span>风险${escapeHtml(x.band)} · ${x.score}</span><small>${escapeHtml(x.reason)}</small></div>`).join('') : '<div class="review-clean">未发现明显章节跳读信号</div>';
  document.querySelector('#recommendationLimits').textContent = report.limits;
}

function renderAIStyle(report) {
  const section = document.querySelector('#aiStyleSection');
  if (!report) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.querySelector('#aiScore').textContent = report.score;
  document.querySelector('#aiBand').textContent = report.band;
  document.querySelector('#aiRecommendation').textContent = `${report.recommendation}${report.warning ? ` ${report.warning}` : ''}${report.provenanceNotice ? ` ${report.provenanceNotice}` : ''}`;
  document.querySelector('#aiConfidence').textContent = `${report.mode === 'hybrid' ? '本地+外部API' : '本地检测'} · 置信度：${report.confidence}`;
  document.querySelector('#aiSignals').innerHTML = report.signals.length ? report.signals.map(s => `<article><header><b>${escapeHtml(s.label)}</b><span>+${s.points}</span></header><p>${escapeHtml(s.explanation)}</p><small>${escapeHtml(s.evidence)}</small><footer>优化：${escapeHtml(s.advice || '建议人工复核该特征。')}</footer></article>`).join('') : '<div class="review-clean">没有发现达到报告阈值的AI风格信号</div>';
  document.querySelector('#aiAdvice').innerHTML = report.prioritizedAdvice?.length ? `<h4>优先优化清单</h4><ol>${report.prioritizedAdvice.map(x => `<li><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.advice)}</p><small>参考证据：${escapeHtml(x.evidence)}</small></li>`).join('')}</ol>` : '';
  document.querySelector('#aiSegments').innerHTML = report.segments.length ? report.segments.map(s => `<div title="第${s.index}段：${escapeHtml(s.excerpt)}"><i style="height:${Math.max(4,s.score)}%"></i><small>${s.index}</small></div>`).join('') : '<span class="muted">文本过短，无法生成分段波动。</span>';
  document.querySelector('#aiLimits').textContent = report.limits;
}

function renderChapters(report, filter = 'all') {
  const section = document.querySelector('#chapterSection');
  if (!report) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.querySelector('#chapterSummary').textContent = `${report.mode} · 共${report.totalChapters}章/段 · 已分析${report.analyzedChapters}章/段 · 覆盖率${report.coverage}%${report.omittedChapters ? ` · ${report.omittedChapters}章未分析` : ''}`;
  document.querySelector('#chapterHotspots').innerHTML = `<span>合规风险章节 ${report.summary.riskyChapters}</span><span>高合规风险 ${report.summary.highRiskChapters}</span><span>AI风格信号章节 ${report.summary.aiSignalChapters}</span><span>高AI风格风险 ${report.summary.highAIChapters}</span><span>平均AI风险分 ${report.summary.averageAIScore}</span><span>平均内容成熟度 ${report.summary.averageQualityScore}</span><span>最高综合风险：${escapeHtml(report.summary.topChapter)}</span>`;
  const chapters = filter === 'risk' ? report.chapters.filter(x => x.riskScore > 0 || x.aiScore >= 18) : filter === 'high' ? report.chapters.filter(x => x.riskScore >= 40 || x.aiScore >= 65) : report.chapters;
  document.querySelector('#chapterList').innerHTML = chapters.length ? chapters.map(ch => `<details class="chapter-row" data-risk="${ch.combinedRiskScore}"><summary><span><b>${escapeHtml(ch.title)}</b><small>${ch.chars}字 · 合规${ch.riskScore}分 · 成熟度${ch.qualityScore}分 · AI风格${ch.aiScore}分（${escapeHtml(ch.aiConfidence)}置信度）</small></span><i style="width:${Math.min(100, ch.combinedRiskScore)}%"></i><strong>${ch.combinedRiskScore}</strong></summary>${ch.issues.length || ch.qualityIssues?.length || ch.aiSignals.length ? `<div class="chapter-issues">${ch.issues.map(x => `<article><em>${levelName[x.level]} · ${escapeHtml(x.label)}</em><q>${escapeHtml(x.excerpt)}</q><p>${escapeHtml(x.reason)}</p><small>优化：${escapeHtml(x.advice)}</small></article>`).join('')}${(ch.qualityIssues || []).map(x => `<article><em>内容成熟度 · ${escapeHtml(x.label)}</em><q>${escapeHtml(x.excerpt)}</q><p>${escapeHtml(x.reason)}</p><small>优化：${escapeHtml(x.advice)}</small></article>`).join('')}${ch.aiSignals.map(x => `<article class="ai-chapter-issue"><em>AI风格 · ${escapeHtml(x.label)}（+${x.points}）</em><q>${escapeHtml(x.evidence)}</q><p>${escapeHtml(x.explanation)}</p><small>优化：${escapeHtml(x.advice || '结合上下文进行人工改写。')}</small></article>`).join('')}</div>` : '<div class="review-clean">本章暂未发现明显合规、成熟度或AI风格风险</div>'}</details>`).join('') : '<div class="empty">该筛选范围内没有章节</div>';
}

function renderHumanReview(review) {
  const section = document.querySelector('#humanReviewSection');
  if (!review) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.querySelector('#reviewModeTag').textContent = review.mode === 'ai' ? '大模型独立审稿' : '离线角色模拟';
  document.querySelector('#reviewStatus').textContent = review.warning || `已审阅 ${review.packet.reviewedChars} 字${review.packet.truncated ? '，长文已抽取开篇与结尾' : ''}。`;
  const a = review.adjudication;
  document.querySelector('#adjudication').innerHTML = `<div><small>复审汇总结论</small><strong>${escapeHtml(a.verdict)}</strong></div><p>${escapeHtml(a.reason)}</p><span>意见${escapeHtml(a.agreement)} · 置信度${escapeHtml(a.confidence)}${a.needsHuman ? ' · 需要人工确认' : ''}</span>`;
  document.querySelector('#reviewerCards').innerHTML = review.reviews.map(r => `<article class="reviewer"><header><span>${escapeHtml(r.name.slice(0,1))}</span><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.verdict)} · ${Math.round(r.confidence * 100)}%</small></div></header><p>${escapeHtml(r.summary)}</p>${r.findings.length ? `<details><summary>查看 ${r.findings.length} 项审稿意见</summary>${r.findings.map(f => `<div class="review-finding"><em>${levelName[f.level]} · ${escapeHtml(f.category)}</em>${f.quote ? `<q>${escapeHtml(f.quote)}</q>` : ''}<p>${escapeHtml(f.reason)}</p><small>建议：${escapeHtml(f.advice)}</small></div>`).join('')}</details>` : '<div class="review-clean">职责范围内暂未发现明显问题</div>'}${r.uncertainties.length ? `<footer>待确认：${escapeHtml(r.uncertainties.join('；'))}</footer>` : ''}</article>`).join('');
}

function renderIssues(issues, filter) {
  const shown = filter === 'all' ? issues : issues.filter(x => x.level === filter);
  document.querySelector('#issueList').innerHTML = shown.length ? shown.map(x => `<article class="issue" data-level="${x.level}"><div class="issue-head"><b>${escapeHtml(x.label)}</b><span class="level">${levelName[x.level]}${x.count > 1 ? ` · ${x.count}处` : ''}</span></div><div class="quote">"${escapeHtml(x.excerpt)}"</div><p><strong>判断依据：</strong>${escapeHtml(x.reason)}</p><p><strong>优化建议：</strong>${escapeHtml(x.advice)}</p></article>`).join('') : '<div class="empty">✓ 该范围内暂未发现问题</div>';
}

// 动态渲染目标平台复选框：数据来自后端 /api/platforms，避免前端硬编码。
// 默认选中 fanqie / qidian / jjwxc，与原硬编码默认一致；接口异常时回退到内置五平台结构。
const DEFAULT_PLATFORMS = ['fanqie', 'qidian', 'jjwxc'];
const FALLBACK_PLATFORMS = [['fanqie', '番茄小说'], ['qidian', '起点中文网'], ['jjwxc', '晋江文学城'], ['qimao', '七猫中文网'], ['zongheng', '纵横中文网']];

function renderPlatformOptions(platforms) {
  const container = document.querySelector('#platformList');
  if (!container) return;
  container.innerHTML = platforms.map(({ id, name }) => `<label><input type="checkbox" name="platform" value="${escapeHtml(id)}"${DEFAULT_PLATFORMS.includes(id) ? ' checked' : ''}><span>${escapeHtml(name)}</span></label>`).join('');
}

function loadPlatforms() {
  fetch('/api/platforms')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error('平台列表加载失败'))))
    .then(data => renderPlatformOptions(data.platforms || FALLBACK_PLATFORMS.map(([id, name]) => ({ id, name }))))
    .catch(() => renderPlatformOptions(FALLBACK_PLATFORMS.map(([id, name]) => ({ id, name }))));
}

loadPlatforms();
