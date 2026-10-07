#!/usr/bin/env node
// 抓取信源：读取下面列出的 RSS/Atom，保留最近 72 小时的条目，并抓原文前一段正文，
// 写到 feeds/latest.json。由 GitHub Actions 每天定时运行（.github/workflows/fetch-feeds.yml），
// 定时任务生成日报时直接读这个文件，不用自己一个个去打开网站。
// 不依赖第三方包，需要 Node.js 18 以上（自带 fetch）。
'use strict';
const fs = require('fs');
const path = require('path');

const FEEDS = [
  // AI · 一手
  ['ai', 'a16z', 'https://www.a16z.news/feed'],
  ['ai', 'OpenAI', 'https://openai.com/news/rss.xml'],
  ['ai', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml'],
  ['ai', 'Google AI', 'https://blog.google/technology/ai/rss/'],
  ['ai', 'Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['ai', 'Epoch AI', 'https://epochai.substack.com/feed'],
  ['ai', 'Sequoia', 'https://www.sequoiacap.com/feed/'],
  // AI · 研究者
  ['ai', 'One Useful Thing', 'https://www.oneusefulthing.org/feed'],
  ['ai', 'Import AI', 'https://importai.substack.com/feed'],
  ['ai', 'Simon Willison', 'https://simonwillison.net/atom/everything/'],
  ['ai', 'Latent Space', 'https://www.latent.space/feed'],
  ['ai', 'Interconnects', 'https://www.interconnects.ai/feed'],
  ['ai', 'Benedict Evans', 'https://www.ben-evans.com/benedictevans/?format=rss'],
  // AI · 中文精选
  ['ai', 'BestBlogs 每日早报', 'https://www.bestblogs.dev/zh/feeds/rss/daily-brief'],
  ['ai', 'AIHOT', 'https://aihot.news/rss'],
  ['ai', '宝玉', 'https://baoyu.io/feed.xml'],
  // 仓储物流 · 一手
  ['wh', '大福（日文）', 'https://www.daifuku.com/jp/rss_all.xml'],
  ['wh', 'Daifuku', 'https://www.daifuku.com/rss_all.xml'],
  ['wh', 'Symbotic IR', 'https://ir.symbotic.com/rss/news-releases.xml'],
  ['wh', 'Symbotic', 'https://www.symbotic.com/feed/'],
  ['wh', 'Interact Analysis', 'https://www.interactanalysis.com/feed/'],
  ['wh', 'Georgia Tech SCL', 'https://www.scl.gatech.edu/rss.xml'],
  ['wh', '国家统计局', 'https://www.stats.gov.cn/sj/zxfb/rss.xml'],
  // 仓储物流 · 行业媒体
  ['wh', 'Automated Warehouse', 'https://www.automatedwarehouseonline.com/feed/'],
  ['wh', 'The Robot Report 物流', 'https://www.therobotreport.com/category/markets-industries/logistics-warehousing-asrs/feed/'],
  ['wh', 'Logistics Viewpoints', 'https://logisticsviewpoints.com/feed/'],
  ['wh', 'DC Velocity', 'https://www.dcvelocity.com/rss'],
  ['wh', 'MH&L', 'https://www.mhlnews.com/__rss/website-scheduled-content.xml?input=%7B%22sectionAlias%22%3A%22home%22%7D'],
  ['wh', 'Supply Chain 24/7 自动化', 'https://feeds.feedburner.com/sc247/rss/automation'],
  ['wh', 'Locus Robotics', 'https://locusrobotics.com/feed/'],
  ['wh', 'Supply Chain Dive', 'https://www.supplychaindive.com/feeds/news/'],
  ['wh', 'Robotics & Automation News', 'https://roboticsandautomationnews.com/feed/'],
  ['wh', '36氪快讯', 'https://36kr.com/feed-newsflash'],
];

const HOURS = 72;
const UA = 'Mozilla/5.0 (compatible; info-hub-feed-reader/1.0; +https://github.com/fjzh632346-cmd/info-hub)';
const OUT = path.join(__dirname, '..', 'feeds', 'latest.json');

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function text(html) {
  return decode(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function link(block) {
  const l = tag(block, 'link');
  if (l && !/^\s*</.test(l)) return decode(l).trim();
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? decode(alt[1]).trim() : '';
}

async function get(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function isoDate(s) {
  const t = Date.parse(s);
  return isNaN(t) ? '' : new Date(t).toISOString();
}

function parse(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    return {
      title: text(tag(b, 'title')),
      url: link(b),
      published: isoDate(decode(date).trim()),
      description: text(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content')).slice(0, 600),
    };
  }).filter(x => x.title && x.url);
}

async function excerpt(url) {
  try {
    const html = await get(url, 15000);
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<header[\s\S]*?<\/header>/gi, ' ');
    const paras = (body.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(text).filter(p => p.length > 40);
    return paras.join('\n').slice(0, 2500);
  } catch (e) { return ''; }
}

async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
}

// AIHOT（aihot.news，卡兹克团队）的精选接口：它已经从大量 AI 资讯里挑过一遍，
// 作为日报和周报 AI 部分的补充材料。按其说明，个人非商业使用免费。
const AIHOT = {
  latest24h: 'https://aihot.news/api/v1/agent/latest?window=24h&limit=30',
  latest7d: 'https://aihot.news/api/v1/agent/latest?window=7d&limit=30',
  hot: 'https://aihot.news/api/v1/agent/hot',
  daily: 'https://aihot.news/api/v1/agent/daily',
  weekly: 'https://aihot.news/api/v1/agent/weekly',
};
async function fetchAihot() {
  const out = { fetchedAt: new Date().toISOString(), note: '来自 aihot.news 公开接口（默认精选池），个人非商业使用', endpoints: {} };
  for (const [name, url] of Object.entries(AIHOT)) {
    try {
      const body = await get(url, 20000);
      let data; try { data = JSON.parse(body); } catch (e) { data = body.slice(0, 200000); }
      out.endpoints[name] = { url, ok: true, data };
    } catch (e) {
      out.endpoints[name] = { url, ok: false, error: String(e.message || e).slice(0, 160) };
    }
  }
  fs.writeFileSync(path.join(path.dirname(OUT), 'aihot.json'), JSON.stringify(out, null, 1));
  const ok = Object.values(out.endpoints).filter(x => x.ok).length;
  console.log(`AIHOT：${ok}/${Object.keys(AIHOT).length} 个接口成功`);
}

(async () => {
  const since = Date.now() - HOURS * 3600 * 1000;
  const status = [];
  const items = [];
  await pool(FEEDS, 6, async ([group, source, feed]) => {
    try {
      const all = parse(await get(feed));
      const recent = all.filter(x => x.published && Date.parse(x.published) >= since);
      recent.forEach(x => items.push(Object.assign({ group, source }, x)));
      status.push({ source, feed, ok: true, total: all.length, recent: recent.length });
    } catch (e) {
      status.push({ source, feed, ok: false, error: String(e.message || e).slice(0, 120) });
    }
  });
  items.sort((a, b) => b.published.localeCompare(a.published));
  // 36氪快讯条目多且短，不抓正文
  await pool(items, 6, async it => { it.excerpt = it.source === '36氪快讯' ? '' : await excerpt(it.url); });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), hours: HOURS, status, items }, null, 1));
  await fetchAihot();
  const bad = status.filter(s => !s.ok).length;
  console.log(`共 ${FEEDS.length} 个信源，失败 ${bad} 个；最近 ${HOURS} 小时条目 ${items.length} 条`);
})();
