#!/usr/bin/env node
// 信息站服务端：展示网页 + 读取数据 + 收藏笔记 + 定时从 GitHub 拉取更新。
// 不依赖任何第三方包，Node.js 12 以上即可运行。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..');                 // 仓库目录（git pull 的地方）
const HOME = process.env.INFOHUB_HOME || path.resolve(REPO, '..'); // 配置和收藏放在仓库外面
const CONFIG_FILE = path.join(HOME, 'config.json');
const SAVED_FILE = path.join(HOME, 'saved.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
const config = Object.assign({ port: 8800, password: '', pullMinutes: 30 }, readJSON(CONFIG_FILE, {}));

// ---------- 从 GitHub 拉取更新 ----------
const sync = { lastTry: null, lastOk: null, ok: null, message: '尚未同步', commit: '' };

function git(args, timeout) {
  return new Promise(resolve => {
    execFile('git', ['-C', REPO].concat(args), { timeout: timeout || 120000 }, (error, stdout, stderr) => {
      resolve({ error, out: String(stdout || '').trim(), err: String(stderr || '').trim() });
    });
  });
}

let pulling = false;
async function pull() {
  if (pulling) return sync;
  pulling = true;
  sync.lastTry = new Date().toISOString();
  let r = await git(['pull', '--ff-only', '--quiet'], 120000);
  if (r.error) {
    // 网络偶尔不通，隔 20 秒再试一次
    await new Promise(res => setTimeout(res, 20000));
    r = await git(['pull', '--ff-only', '--quiet'], 120000);
  }
  if (r.error) {
    sync.ok = false;
    sync.message = '从 GitHub 拉取失败：' + (r.err || r.error.message).slice(0, 300);
  } else {
    sync.ok = true;
    sync.lastOk = sync.lastTry;
    sync.message = '已是最新';
  }
  const c = await git(['log', '-1', '--format=%h %ci'], 10000);
  sync.commit = c.out;
  pulling = false;
  return sync;
}

// ---------- 读取数据 ----------
function loadDir(dir) {
  const full = path.join(REPO, 'data', dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort().reverse()
    .map(n => readJSON(path.join(full, n), null))
    .filter(Boolean);
}

// ---------- 收藏与笔记 ----------
function checkPass(req) {
  const given = String(req.headers['x-pass'] || '');
  if (!config.password) return false;
  const a = Buffer.from(given), b = Buffer.from(config.password);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 200000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function saveSaved(saved) {
  const tmp = SAVED_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(saved, null, 2));
  fs.renameSync(tmp, SAVED_FILE);
}

// ---------- HTTP ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-cache' }, headers || {}));
  res.end(body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj), { 'Content-Type': TYPES['.json'] }); }

function serveFile(res, base, rel, extraHeaders) {
  const file = path.resolve(base, '.' + path.sep + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'forbidden');
  fs.stat(file, (e, st) => {
    if (e) return send(res, 404, '找不到这个页面');
    const target = st.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (e2, buf) => {
      if (e2) return send(res, 404, '找不到这个页面');
      send(res, 200, buf, Object.assign({ 'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream' }, extraHeaders || {}));
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/all' && req.method === 'GET') {
      return json(res, 200, { dailies: loadDir('daily'), weeklies: loadDir('weekly'), x: loadDir('x'), sync });
    }
    if (p === '/api/status') return json(res, 200, sync);
    if (p === '/api/login' && req.method === 'POST') {
      return checkPass(req) ? json(res, 200, { ok: true }) : json(res, 401, { error: '密码不对' });
    }
    if (p === '/api/saved') {
      if (!checkPass(req)) return json(res, 401, { error: '需要密码' });
      const saved = readJSON(SAVED_FILE, {});
      if (req.method === 'GET') return json(res, 200, saved);
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.id || typeof b.id !== 'string' || b.id.length > 200) return json(res, 400, { error: '缺少 id' });
        if (b.action === 'remove') delete saved[b.id];
        else {
          const prev = saved[b.id] || { savedAt: new Date().toISOString() };
          saved[b.id] = {
            savedAt: prev.savedAt,
            note: typeof b.note === 'string' ? b.note.slice(0, 5000) : (prev.note || ''),
            snapshot: b.snapshot || prev.snapshot || null
          };
        }
        saveSaved(saved);
        return json(res, 200, { ok: true, saved });
      }
    }
    if (p === '/api/sync' && req.method === 'POST') {
      if (!checkPass(req)) return json(res, 401, { error: '需要密码' });
      return json(res, 200, await pull());
    }
    if (p.startsWith('/demos/')) {
      // 示例网站放进沙箱，读不到本站的密码和收藏
      return serveFile(res, path.join(REPO, 'demos'), p.slice('/demos/'.length),
        { 'Content-Security-Policy': 'sandbox allow-scripts allow-popups' });
    }
    if (p.startsWith('/fonts/') || p === '/app.js' || p === '/style.css' || p === '/favicon.svg') {
      return serveFile(res, path.join(REPO, 'site'), p.slice(1));
    }
    if (req.method === 'GET') return serveFile(res, path.join(REPO, 'site'), 'index.html');
    send(res, 404, 'not found');
  } catch (e) {
    json(res, 500, { error: '服务器出错：' + e.message });
  }
});

server.listen(config.port, () => {
  console.log(`信息站已启动：端口 ${config.port}，仓库 ${REPO}`);
  pull();
  setInterval(pull, Math.max(5, Number(config.pullMinutes) || 30) * 60 * 1000);
});
