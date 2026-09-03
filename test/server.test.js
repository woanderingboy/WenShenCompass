const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const server = require('../server');

/**
 * 发起一次 GET 请求并收集完整响应（含响应头）。
 * @param {number} port 监听端口
 * @param {string} rawPath 原始请求路径（不做编码处理，用于测试畸形编码与穿越）
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: rawPath }, res => {
      const headers = res.headers;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, headers, body }));
    });
    request.on('error', reject);
  });
}

/**
 * 发起一次 JSON POST 请求。
 * @param {number} port 监听端口
 * @param {string} rawPath 请求路径
 * @param {object} payload 请求体（会被 JSON 序列化）
 * @returns {Promise<{status: number, body: string}>}
 */
function post(port, rawPath, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('畸形百分号编码路径返回400且服务不崩溃', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const malformed = await get(port, '/%zz');
    assert.equal(malformed.status, 400);
    assert.match(malformed.body, /请求路径无效/);

    const normal = await get(port, '/');
    assert.equal(normal.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('GET /api/platforms 返回全部平台 id 与名称', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { status, body } = await get(port, '/api/platforms');
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.equal(data.platforms.length, 5);
    const ids = data.platforms.map(p => p.id).sort();
    assert.deepEqual(ids, ['fanqie', 'jjwxc', 'qidian', 'qimao', 'zongheng'].sort());
    assert.ok(data.platforms.every(p => typeof p.name === 'string' && p.name.length > 0));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('静态资源与 JSON 响应均带 x-content-type-options: nosniff', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const root = await get(port, '/');
    assert.equal(root.headers['x-content-type-options'], 'nosniff');
    const platforms = await get(port, '/api/platforms');
    assert.equal(platforms.headers['x-content-type-options'], 'nosniff');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('路径穿越被 403 拦截', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const traversal = await get(port, '/../package.json');
    assert.equal(traversal.status, 403);
    assert.match(traversal.body, /禁止访问/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('POST /api/analyze 文本非字符串返回 400', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const numText = await post(port, '/api/analyze', { text: 12345 });
    assert.equal(numText.status, 400);
    const objText = await post(port, '/api/analyze', { text: { a: 1 } });
    assert.equal(objText.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('POST /api/analyze 透传 lengthTarget，响应 lengthCheck.target 反映自定义区间', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { status, body } = await post(port, '/api/analyze', {
      title: '测试', intro: '简介', text: '林舟收到故乡来信，决定寻找父亲留下的手稿。'.repeat(30), lengthTarget: { min: 3000, max: 6000 }
    });
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.deepEqual(data.lengthCheck.target, { min: 3000, max: 6000 }, '响应 body.lengthCheck.target 反映自定义区间（端到端印证）');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
