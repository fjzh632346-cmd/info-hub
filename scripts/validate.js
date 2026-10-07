#!/usr/bin/env node
// 检查 data/ 下的 JSON 是否符合 SCHEMA.md。用法：node scripts/validate.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errors = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SKILL_CATS = ['网页设计', '照片艺术', '写作', 'PPT', '研究', '其他'];

function err(file, msg) { errors.push(`${file}: ${msg}`); }
function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isUrl(v) { return isStr(v) && /^https?:\/\//.test(v); }

function checkItem(file, where, it) {
  if (!it || typeof it !== 'object') return err(file, `${where} 不是对象`);
  for (const k of ['title', 'source', 'summary', 'why']) if (!isStr(it[k])) err(file, `${where}.${k} 缺失`);
  if (!isUrl(it.url)) err(file, `${where}.url 不是有效链接`);
  if (it.tags && !Array.isArray(it.tags)) err(file, `${where}.tags 必须是数组`);
}

function checkSkill(file, where, s) {
  for (const k of ['name', 'what', 'scene']) if (!isStr(s[k])) err(file, `${where}.${k} 缺失`);
  if (!SKILL_CATS.includes(s.category)) err(file, `${where}.category 取值无效：${s.category}`);
  if (!isUrl(s.url)) err(file, `${where}.url 不是有效链接`);
  if (s.howto && !Array.isArray(s.howto)) err(file, `${where}.howto 必须是数组`);
  if (s.category === '网页设计') {
    if (!isStr(s.demo)) err(file, `${where} 网页设计类必须有 demo`);
    else if (!fs.existsSync(path.join(ROOT, s.demo))) err(file, `${where}.demo 文件不存在：${s.demo}`);
  }
  if (s.category === '照片艺术' && !isStr(s.prompt)) err(file, `${where} 照片艺术类必须有 prompt`);
  if (s.images && !Array.isArray(s.images)) err(file, `${where}.images 必须是数组`);
}

function each(dir, fn) {
  const full = path.join(ROOT, 'data', dir);
  if (!fs.existsSync(full)) return;
  for (const name of fs.readdirSync(full)) {
    if (!name.endsWith('.json')) continue;
    const file = `data/${dir}/${name}`;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(full, name), 'utf8')); }
    catch (e) { err(file, `JSON 格式错误：${e.message}`); continue; }
    if (!DATE.test(doc.date || '')) err(file, 'date 格式应为 YYYY-MM-DD');
    if (name !== `${doc.date}.json`) err(file, '文件名必须等于 date');
    fn(file, doc);
  }
}

each('daily', (file, d) => {
  if (d.type !== 'daily') err(file, 'type 应为 daily');
  if (!Array.isArray(d.sections)) return err(file, 'sections 缺失');
  d.sections.forEach((s, i) => {
    if (!['ai', 'wh'].includes(s.key)) err(file, `sections[${i}].key 只能是 ai 或 wh`);
    (s.items || []).forEach((it, j) => checkItem(file, `sections[${i}].items[${j}]`, it));
  });
});

each('weekly', (file, w) => {
  if (w.type !== 'weekly') err(file, 'type 应为 weekly');
  const m = w.models || {};
  (m.news || []).forEach((it, j) => checkItem(file, `models.news[${j}]`, it));
  (m.table || []).forEach((r, j) => {
    if (!isStr(r.use) || !Array.isArray(r.picks)) err(file, `models.table[${j}] 需要 use 和 picks`);
  });
  (w.skills || []).forEach((s, j) => checkSkill(file, `skills[${j}]`, s));
  (w.kaoyan || []).forEach((it, j) => checkItem(file, `kaoyan[${j}]`, it));
  (w.jobs || []).forEach((jb, j) => {
    if (!isStr(jb.company) || !isStr(jb.role)) err(file, `jobs[${j}] 需要 company 和 role`);
    if (!isUrl(jb.url)) err(file, `jobs[${j}].url 不是有效链接`);
  });
});

each('x', (file, x) => {
  if (x.type !== 'x') err(file, 'type 应为 x');
  (x.items || []).forEach((it, j) => {
    if (!['prompt', 'news', 'opinion'].includes(it.kind)) err(file, `items[${j}].kind 取值无效`);
    if (!isUrl(it.url)) err(file, `items[${j}].url 不是有效链接`);
    if (!isStr(it.textZh)) err(file, `items[${j}].textZh 缺失`);
    if (it.kind === 'prompt' && !isStr(it.prompt)) err(file, `items[${j}] 提示词类必须有 prompt`);
  });
});

if (errors.length) {
  console.error('校验失败：\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('校验通过');
