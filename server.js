const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeNovel } = require('./src/analyzer');
const { runHumanLikeReview } = require('./src/aiReviewer');
const { analyzeChapters } = require('./src/chapterAnalyzer');
const { runAIDetection, detectorStatus } = require('./src/aiDetectorApi');
const { PLATFORM_PROFILES } = require('./src/platforms');

const PORT = Number(process.env.PORT || 4173);
// 以路径分隔符结尾，配合 path.relative 做穿越校验，避免 publicDir 仅作为前缀被绕过。
const publicDir = path.join(__dirname, 'public') + path.sep;
const MAX_BODY_BYTES = 25_000_000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

// 校验入口字段类型与最低长度。返回错误文案表示不通过，null 表示通过。
function validateEntry(input) {
  if (typeof input.text !== 'string') return '请至少输入20个字的正文。';
  if (input.text.trim().length < 20) return '请至少输入20个字的正文。';
  if (input.title !== undefined && typeof input.title !== 'string') return '标题必须为字符串。';
  if (input.intro !== undefined && typeof input.intro !== 'string') return '简介必须为字符串。';
  return null;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/ai-detection/status') {
    return json(res, 200, detectorStatus());
  }

  if (req.method === 'GET' && req.url === '/api/platforms') {
    return json(res, 200, { platforms: Object.keys(PLATFORM_PROFILES).map(id => ({ id, name: PLATFORM_PROFILES[id].name })) });
  }

  if (req.method === 'POST' && req.url === '/api/ai-detection') {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      body += chunk;
      // 用字节数衡量上限，避免多字节字符下 length 低估导致超限。超限即中断连接。
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) { aborted = true; req.destroy(); }
    });
    req.on('end', async () => {
      if (aborted) return; // 已因超限销毁连接，避免重复写头。
      try {
        const input = JSON.parse(body || '{}');
        const error = validateEntry(input);
        if (error) return json(res, 400, { error });
        json(res, 200, await runAIDetection(input.text, { requireExternal: Boolean(input.requireExternal) }));
      } catch (error) { json(res, error.code === 'AI_DETECTOR_UNAVAILABLE' ? 503 : 400, { error: error.message || 'AI检测请求失败。' }); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/analyze') {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) { aborted = true; req.destroy(); }
    });
    req.on('end', async () => {
      if (aborted) return; // 已因超限销毁连接，避免重复写头。
      try {
        const input = JSON.parse(body || '{}');
        const error = validateEntry(input);
        if (error) return json(res, 400, { error });
        const report = analyzeNovel(input);
        report.aiStyleReport = await runAIDetection(`${input.intro || ''}\n${input.text}`);
        const provenance = String(input.provenance || 'unknown');
        report.aiStyleReport.provenance = provenance;
        if (provenance === 'known-ai' && report.aiStyleReport.score < 38) {
          report.aiStyleReport.falseNegativeWarning = '该文本已标注为已知AI生成，但检测分低于中风险阈值：这是检测器漏检，不能把低分解释为纯人工证据。';
          report.aiStyleReport.warning = `${report.aiStyleReport.warning || ''} ${report.aiStyleReport.falseNegativeWarning}`.trim();
        } else if (provenance === 'ai-assisted') {
          report.aiStyleReport.provenanceNotice = '作者已声明使用AI辅助；请重点检查平台披露、内容质量、权利来源和人工编辑程度，而不是尝试隐藏来源。';
        }
        if (input.chapterMode) report.chapterReport = analyzeChapters(input);
        if (input.reviewMode === 'humanlike') report.humanReview = await runHumanLikeReview(input, report);
        json(res, 200, report);
      } catch (error) {
        json(res, 400, { error: error.message || '请求格式不正确。' });
      }
    });
    return;
  }

  let safePath;
  try {
    safePath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return json(res, 400, { error: '请求路径无效' });
  }
  const file = path.normalize(path.join(publicDir, safePath));
  // 用 path.relative 判断目标是否仍落在 publicDir 内：以 '..' 开头或为绝对路径即视为穿越，返回 403。
  const rel = path.relative(publicDir, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return json(res, 403, { error: '禁止访问' });
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, { error: '页面不存在' });
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
});

if (require.main === module) server.listen(PORT, () => console.log(`文审罗盘已启动：http://localhost:${PORT}`));
module.exports = server;
