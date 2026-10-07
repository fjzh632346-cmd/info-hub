#!/usr/bin/env node
// 检查 data/ 下的 JSON 是否符合 SCHEMA.md。用法：node scripts/validate.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errors = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SKILL_CATS = ['网页设计', '视频', '图片编辑', '照片艺术', 'PPT', '写作', '研究', '编程', '其他'];
const FUTURE_TYPES = ['考研', '实习', '校招', '宣讲会', '趋势'];

function err(file, msg) { errors.push(`${file}: ${msg}`); }
function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isUrl(v) { return isStr(v) && /^https?:\/\//.test(v); }

// strict=true 用于新格式（精读/速览）；旧数据只检查基本字段
function checkItem(file, where, it, strict) {
  if (!it || typeof it !== 'object') return err(file, `${where} 不是对象`);
  for (const k of ['title', 'source', 'summary']) if (!isStr(it[k])) err(file, `${where}.${k} 缺失`);
  if (!isUrl(it.url)) err(file, `${where}.url 不是有效链接`);
  if (it.tags && !Array.isArray(it.tags)) err(file, `${where}.tags 必须是数组`);
  if (!strict) { if (!isStr(it.why)) err(file, `${where}.why 缺失`); return; }
  if (it.pick) {
    if (!isStr(it.why)) err(file, `${where} 精读必须有 why`);
    if (!Array.isArray(it.takeaways) || it.takeaways.length < 2) err(file, `${where} 精读必须有 2–4 条 takeaways`);
    if (!(it.readMinutes > 0)) err(file, `${where} 精读必须有 readMinutes`);
  }
}
function checkSection(file, where, s) {
  if (!['ai', 'wh'].includes(s.key)) err(file, `${where}.key 只能是 ai 或 wh`);
  const items = s.items || [];
  const strict = items.some(it => 'pick' in it);
  items.forEach((it, j) => checkItem(file, `${where}.items[${j}]`, it, strict));
  if (strict) {
    const picks = items.filter(it => it.pick).length;
    if (items.length >= 3 && (picks < 1 || picks > 4)) err(file, `${where} 精读应为 3–4 条（内容不够时可少），现在是 ${picks} 条`);
    const firstBrief = items.findIndex(it => !it.pick);
    if (firstBrief >= 0 && items.slice(firstBrief).some(it => it.pick)) err(file, `${where} 精读要排在速览前面`);
  }
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
  if ((s.category === '照片艺术' || s.category === '图片编辑') && !isStr(s.prompt)) err(file, `${where} ${s.category}类必须有 prompt`);
  if ('score' in s && !(typeof s.score === 'number' && s.score >= 0 && s.score <= 100)) err(file, `${where}.score 应为 0–100 的数字`);
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
  d.sections.forEach((s, i) => checkSection(file, `sections[${i}]`, s));
});

each('weekly', (file, w) => {
  if (w.type !== 'weekly') err(file, 'type 应为 weekly');
  const m = w.models || {};
  (m.news || []).forEach((it, j) => checkItem(file, `models.news[${j}]`, it));
  const v2 = 'future' in w || 'reading' in w;
  (m.table || []).forEach((r, j) => {
    if (!isStr(r.use) || !Array.isArray(r.picks)) err(file, `models.table[${j}] 需要 use 和 picks`);
    if (v2 && !DATE.test(r.asOf || '')) err(file, `models.table[${j}].asOf 应为榜单数据日期 YYYY-MM-DD`);
  });
  (w.reading || []).forEach((s, i) => checkSection(file, `reading[${i}]`, s));
  (w.skills || []).forEach((s, j) => checkSkill(file, `skills[${j}]`, s));
  if (v2) {
    const sc = (w.skills || []).map(s => s.score);
    if (sc.some(x => typeof x !== 'number')) err(file, 'skills 每项都要有 score');
    else if (sc.some((x, i) => i && x > sc[i - 1])) err(file, 'skills 要按 score 从高到低排列');
  }
  (w.future || []).forEach((f, j) => {
    const where = `future[${j}]`;
    if (!FUTURE_TYPES.includes(f.type)) err(file, `${where}.type 取值无效：${f.type}`);
    for (const k of ['title', 'summary', 'why']) if (!isStr(f[k])) err(file, `${where}.${k} 缺失`);
    if (!isUrl(f.url)) err(file, `${where}.url 不是有效链接`);
    if (['实习', '校招', '宣讲会'].includes(f.type) && !isStr(f.city)) err(file, `${where}.city 缺失`);
    if (f.deadline && f.deadline !== '未注明' && !DATE.test(f.deadline)) err(file, `${where}.deadline 应为 YYYY-MM-DD 或 未注明`);
  });
  (w.kaoyanTable || []).forEach((r, j) => {
    for (const k of ['school', 'program', 'degree', 'fit']) if (!isStr(r[k])) err(file, `kaoyanTable[${j}].${k} 缺失`);
    if (!isUrl(r.url)) err(file, `kaoyanTable[${j}].url 不是有效链接`);
  });
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
    if (it.category && !SKILL_CATS.includes(it.category)) err(file, `items[${j}].category 取值无效：${it.category}`);
  });
});

if (errors.length) {
  console.error('校验失败：\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('校验通过');
