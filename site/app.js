/* 信息库 · 早报版式。读取 /api/all，按分区展示；收藏与笔记存在服务器上，已读记录存在本机浏览器。
   数据格式见 SCHEMA.md（第 2 版：精读/速览、Skill 打分、考研与实习），旧格式的数据也能显示。 */
(function () {
  'use strict';

  var D = null, byId = {}, saved = {}, auth = false, pass = '';
  var skillFilter = '全部', futureFilter = '全部';
  var $main = document.getElementById('main'), $zones = document.getElementById('zones');
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var SKILL_CATS = ['网页设计', '视频', '图片编辑', '照片艺术', 'PPT', '写作', '研究', '编程', '其他'];
  var FUTURE_TYPES = ['考研', '实习', '校招', '宣讲会', '趋势'];
  var KIND = { prompt: '提示词', news: '资讯', opinion: '观点' };
  var EXAM_DATE = '2027-12-25'; // 考研初试一般在 12 月下旬的周六，按往年规律估算

  try { pass = localStorage.getItem('infohub-pass') || ''; } catch (e) {}
  var readSet = {};
  try { readSet = JSON.parse(localStorage.getItem('infohub-read') || '{}') || {}; } catch (e) {}

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function url(u) { return /^https?:\/\//.test(u || '') ? u : '#'; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dot(d) { return d ? d.slice(5).replace('-', '.') : ''; }
  function cnDate(d, noWeek) { var x = new Date(d + 'T00:00:00'); return (x.getMonth() + 1) + '月' + x.getDate() + '日' + (noWeek ? '' : ' ' + WEEK[x.getDay()]); }
  function bjToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()); }
  function daysUntil(d) { return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(bjToday() + 'T00:00:00Z')) / 86400000); }
  function isDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ''); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function isRead(id) { return !!readSet[id]; }
  function markRead(id) {
    if (!id || readSet[id]) return; readSet[id] = 1;
    try { localStorage.setItem('infohub-read', JSON.stringify(readSet)); } catch (e) {}
  }
  function reg(e) { byId[e.id] = e; return e; }

  // ---------- 接口 ----------
  function api(path, body) {
    var h = { 'Content-Type': 'application/json' };
    if (pass) h['X-Pass'] = pass;
    return fetch(path, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) {
          var p = window.prompt('收藏和笔记需要网站密码：');
          if (!p) throw new Error('cancel');
          pass = p; try { localStorage.setItem('infohub-pass', p); } catch (e) {}
          return api(path, body);
        }
        return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('请求失败 ' + r.status)); return j; });
      });
  }
  function snap(e) { var s = {}; Object.keys(e).forEach(function (k) { if (k !== 'html') s[k] = e[k]; }); return s; }
  function toggleSave(e) {
    var on = !!saved[e.id];
    return api('/api/saved', on ? { action: 'remove', id: e.id } : { id: e.id, snapshot: snap(e) })
      .then(function (r) { saved = r.saved || saved; return !on; });
  }
  function saveNote(e, note) { return api('/api/saved', { id: e.id, note: note, snapshot: snap(e) }).then(function (r) { saved = r.saved || saved; }); }

  // ---------- 数据整理 ----------
  function ident(prefix, date, i) { return prefix + '-' + date + '-' + pad(i + 1); }
  function sectionItems(prefix, date, s) {
    var items = s.items || [];
    var v2 = items.some(function (it) { return 'pick' in it; });
    return items.map(function (it, i) {
      return reg(Object.assign({}, it, { id: ident(prefix, date, i), date: date, zone: s.key, pick: v2 ? !!it.pick : true, legacy: !v2 }));
    });
  }
  function dailySection(d, key) {
    var s = (d.sections || []).filter(function (x) { return x.key === key; })[0];
    return s ? sectionItems(key.toUpperCase(), d.date, s) : [];
  }
  function weeklyReading(w, key) {
    var s = (w.reading || []).filter(function (x) { return x.key === key; })[0];
    return s ? sectionItems('W' + key.toUpperCase(), w.date, s) : [];
  }
  function xItems(x) {
    return (x.items || []).map(function (it, i) {
      return reg(Object.assign({}, it, { id: ident('X', x.date, i), date: x.date, zone: 'x', title: it.author || it.handle, source: it.handle, summary: it.textZh }));
    });
  }
  function skillsAll() {
    var seen = {}, out = [];
    function add(s) { var k = s.url || s.id; if (seen[k]) return; seen[k] = 1; out.push(reg(s)); }
    (D.weeklies || []).forEach(function (w) {
      (w.skills || []).forEach(function (s, i) { add(Object.assign({}, s, { id: ident('SK', w.date, i), date: w.date, title: s.name, zone: 'sk' })); });
    });
    (D.x || []).forEach(function (x) {
      (x.items || []).forEach(function (it, i) {
        if (it.kind !== 'prompt') return;
        add(Object.assign({}, it, {
          id: ident('X', x.date, i), date: x.date, zone: 'sk', name: (it.author || it.handle) + ' 的提示词', title: (it.author || it.handle) + ' 的提示词',
          category: SKILL_CATS.indexOf(it.category) >= 0 ? it.category : '其他', what: it.textZh, fromX: true
        }));
      });
    });
    return out.sort(function (a, b) {
      var sa = typeof a.score === 'number' ? a.score : -1, sb = typeof b.score === 'number' ? b.score : -1;
      return sb - sa || (a.date < b.date ? 1 : -1);
    });
  }
  function futureOf(w) {
    if (w.future) return w.future.map(function (f, i) { return reg(Object.assign({}, f, { id: ident('FU', w.date, i), date: w.date, zone: 'fu', source: f.org })); });
    var out = [];
    (w.kaoyan || []).forEach(function (k, i) { out.push(reg(Object.assign({}, k, { id: ident('KY', w.date, i), date: w.date, zone: 'fu', type: '考研' }))); });
    (w.jobs || []).forEach(function (j, i) {
      out.push(reg({
        id: ident('JB', w.date, i), date: w.date, zone: 'fu', type: /校招/.test(j.role) ? '校招' : (/趋势/.test(j.company) ? '趋势' : '实习'),
        title: j.company + '｜' + j.role, org: j.company, source: j.company, city: j.city || '', deadline: j.deadline, summary: j.summary, why: j.forWhom, url: j.url, tags: []
      }));
    });
    return out;
  }
  function latest(key) { return (D[key] || [])[0]; }

  // ---------- 片段 ----------
  function tags(e) {
    return (e.tags || []).map(function (t) { return '<span class="tag' + (t === '新模型' ? ' new' : '') + '">' + esc(t) + '</span>'; }).join('') +
      (e.vendorClaim ? '<span class="tag vendor">厂商说法</span>' : '');
  }
  function links(e, extra) {
    var s = saved[e.id];
    return '<div class="links"><a class="go" href="' + esc(url(e.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">看原文</a>' + (extra || '') +
      '<button type="button" data-act="save"' + (s ? ' class="on"' : '') + '>' + (s ? '已收藏' : '收藏') + '</button>' +
      '<button type="button" data-act="note">' + (s && s.note ? '改笔记' : '写笔记') + '</button></div>' +
      (s && s.note ? '<p class="note">' + esc(s.note) + '</p>' : '');
  }
  function due(d) {
    if (!isDate(d)) return '';
    var n = daysUntil(d);
    return '<span class="due' + (n <= 7 ? ' urgent' : '') + '">' + (n >= 0 ? '还有 <b>' + n + '</b> 天截止' : '已截止') + '</span>';
  }
  function pickHTML(e) {
    return '<article class="pick' + (isRead(e.id) ? ' read' : '') + '" data-id="' + esc(e.id) + '" id="e-' + esc(e.id) + '">' +
      '<h3><a href="' + esc(url(e.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(e.title) + '</a></h3>' +
      '<p class="by"><span>' + esc(e.source || '') + '</span>' + (e.published ? '<span>' + esc(e.published) + '</span>' : '') +
        (e.readMinutes ? '<span class="mins">约 ' + esc(e.readMinutes) + ' 分钟</span>' : '') + tags(e) + '</p>' +
      (e.summary ? '<p>' + esc(e.summary) + '</p>' : '') +
      (e.takeaways && e.takeaways.length ? '<ul class="take">' + e.takeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      (e.why ? '<p class="why"><b>' + (e.legacy ? '为什么值得看' : '为什么值得你读') + '</b>' + esc(e.why) + '</p>' : '') +
      links(e) + '</article>';
  }
  function briefsHTML(list) {
    if (!list.length) return '';
    return '<p class="sub">速览 · ' + list.length + ' 条，有兴趣自己点开</p><ul class="briefs">' + list.map(function (e) {
      return '<li class="brief' + (isRead(e.id) ? ' read' : '') + '" data-id="' + esc(e.id) + '"><span class="src">' + esc(e.source || '') + '</span>' +
        '<div><a class="t" href="' + esc(url(e.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(e.title) + '</a> ' + tags(e) +
        '<br><span class="s">' + esc(e.summary || '') + '</span></div></li>';
    }).join('') + '</ul>';
  }
  function readingBlock(items) {
    var picks = items.filter(function (e) { return e.pick; }), rest = items.filter(function (e) { return !e.pick; });
    var legacy = items.length && items[0].legacy;
    return (picks.length ? (legacy ? '' : '<p class="sub">精读 · ' + picks.length + ' 篇</p>') + picks.map(pickHTML).join('') : '') + briefsHTML(rest);
  }
  function minutesOf(items) { return items.reduce(function (s, e) { return s + (e.pick && e.readMinutes ? +e.readMinutes : 0); }, 0); }
  function sec(title, count, body, opts) {
    opts = opts || {};
    return '<section class="sec"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><div class="label">' + esc(title) +
      (count !== null && count !== undefined ? '<span>' + esc(count) + '</span>' : '') + (opts.more || '') + '</div><div class="body">' + body + '</div></section>';
  }
  function tweetHTML(e) {
    return '<article class="tweet" data-id="' + esc(e.id) + '"><p class="who"><b>' + esc(e.author || e.handle) + '</b><span>' + esc(e.handle || '') +
      (e.metrics ? ' · ' + esc(e.metrics) : '') + '</span><span class="tag">' + esc(KIND[e.kind] || e.kind) + '</span>' +
      (e.category && e.kind === 'prompt' ? '<span class="tag">' + esc(e.category) + '</span>' : '') + '</p>' +
      '<p class="clip">' + esc(e.summary) + '</p>' +
      links(e, e.kind === 'prompt' ? '<a href="#/skills">提示词在 Skill 库</a>' : '') + '</article>';
  }

  // ---------- 页面：今日 ----------
  function memo() {
    var w = latest('weeklies'), fut = w ? futureOf(w) : [];
    var soon = fut.filter(function (f) { return isDate(f.deadline) && daysUntil(f.deadline) >= 0 && f.type !== '考研'; })
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; }).slice(0, 2);
    var row = w && w.models && (w.models.table || []).filter(function (r) { return /代码/.test(r.use); })[0];
    return sec('备忘', '每天都在', '<ul class="briefs">' +
      '<li class="brief"><span class="src">考研初试</span><div>距 2027 年 12 月初试约 <b class="n" style="font-size:20px">' + daysUntil(EXAM_DATE) + '</b> 天（按往年 12 月下旬估算）</div></li>' +
      soon.map(function (f) { return '<li class="brief"><span class="src">' + esc(f.type) + '截止</span><div><a class="t" href="#/future">' + esc(f.title) + '</a> ' + due(f.deadline) + '</div></li>'; }).join('') +
      (row ? '<li class="brief"><span class="src">写代码首选</span><div>' + esc(row.picks.join('、')) + ' <a href="#/models">看完整模型表</a></div></li>' : '') +
      '</ul>');
  }
  function viewToday(d) {
    var isToday = !d;
    d = d || latest('dailies');
    if (!d) return '<div class="mast"><p class="day word">今天</p><div class="meta">日报还没生成</div><h1>每天早上 7:51 自动生成。</h1></div>';
    var ai = dailySection(d, 'ai'), wh = dailySection(d, 'wh');
    var picks = ai.concat(wh).filter(function (e) { return e.pick && !e.legacy; });
    var x = (D.x || []).filter(function (f) { return f.date <= d.date; })[0];
    var xs = x && (isToday || x.date === d.date) ? xItems(x) : [];
    var h = '<header class="mast"><p class="day">' + esc(dot(d.date)) + '</p><div class="meta"><b>' + esc(cnDate(d.date)) + '</b><br>' +
      (picks.length ? '精读 ' + picks.length + ' 篇，约 ' + minutesOf(picks) + ' 分钟；速览 ' + (ai.length + wh.length - picks.length) + ' 条' : '共 ' + (ai.length + wh.length) + ' 条') + '</div>' +
      '<h1>' + esc(d.headline || '') + '</h1>' +
      (isToday && d.date < bjToday() ? '<p class="note-bar">今天（' + esc(cnDate(bjToday(), true)) + '）的日报还没生成，下面是最近一期。每天 7:51 更新。</p>' : '') + '</header>';
    if (ai.length) h += sec('AI', ai.length + ' 条', readingBlock(ai), { id: 's-ai', more: '<a href="#/ai">往期 AI</a>' });
    if (wh.length) h += sec('仓储物流', wh.length + ' 条', readingBlock(wh), { id: 's-wh', more: '<a href="#/wh">往期仓储</a>' });
    if (xs.length) h += sec('X 精选', dot(x.date) + ' 晚', xs.map(tweetHTML).join(''), { id: 's-x' });
    if (isToday) h += memo();
    if (d.notes && d.notes.length) h += '<p class="foot">备注：' + esc(d.notes.join('；')) + '</p>';
    return h;
  }

  // ---------- 页面：AI / 仓储（按天） ----------
  function viewZone(key, name) {
    var days = (D.dailies || []).slice(0, 14);
    var h = '<header class="mast wordy"><p class="day word">' + esc(name) + '</p><div class="meta"><b>最近 ' + days.length + ' 天</b><br>最新一天展开全部，往前只列精读</div></header>';
    days.forEach(function (d, i) {
      var items = dailySection(d, key);
      if (!items.length) return;
      var body = i === 0 ? readingBlock(items) : items.filter(function (e) { return e.pick; }).map(pickHTML).join('') +
        '<p class="sub"><a href="#/d/' + esc(d.date) + '">这一天还有 ' + items.filter(function (e) { return !e.pick; }).length + ' 条速览</a></p>';
      h += sec(cnDate(d.date), items.length + ' 条', body);
    });
    return h;
  }

  function viewX() {
    var list = (D.x || []).slice(0, 7);
    var h = '<header class="mast wordy"><p class="day word">X 精选</p><div class="meta"><b>每晚 20:53 更新</b><br>需要你的电脑开着、Claude 桌面端在运行</div></header>';
    if (!list.length) return h + '<p class="empty">还没有 X 精选。</p>';
    list.forEach(function (x) { var xs = xItems(x); h += sec(cnDate(x.date), xs.length + ' 条', xs.map(tweetHTML).join('')); });
    return h;
  }

  // ---------- 页面：本周精读 ----------
  function viewWeek(w) {
    w = w || latest('weeklies');
    if (!w) return '<p class="empty">还没有周报，每周日 8:46 生成。</p>';
    var ai = weeklyReading(w, 'ai'), wh = weeklyReading(w, 'wh');
    var h = '<header class="mast"><p class="day">' + esc(dot(w.date)) + '</p><div class="meta"><b>' + esc(cnDate(w.date)) + ' 周报</b><br>每周日 8:46 更新</div><h1>' + esc(w.headline || '') + '</h1></header>';
    if (ai.length || wh.length) {
      if (ai.length) h += sec('本周 AI', ai.length + ' 条', readingBlock(ai));
      if (wh.length) h += sec('本周仓储物流', wh.length + ' 条', readingBlock(wh));
    } else {
      h += sec('本周精读', null, '<p class="empty" style="padding:0">这一期周报是旧格式，还没有"本周精读"。从下一期（周日）开始会有。</p>');
    }
    var sk = skillsAll().filter(function (s) { return s.date === w.date && !s.fromX; }).slice(0, 5);
    h += sec('本期 Skill', '前 ' + sk.length + ' 名', sk.map(cardHTML).join('') + '<p class="sub"><a href="#/skills">去 Skill 库看全部</a></p>');
    h += sec('还有', null, '<ul class="briefs"><li class="brief"><span class="src">模型</span><div><a class="t" href="#/models">本周模型怎么选</a></div></li>' +
      '<li class="brief"><span class="src">考研与实习</span><div><a class="t" href="#/future">方向对比表和北京的实习</a></div></li></ul>');
    if (w.notes && w.notes.length) h += '<p class="foot">备注：' + esc(w.notes.join('；')) + '</p>';
    return h;
  }

  // ---------- 页面：模型 ----------
  function viewModels() {
    var w = latest('weeklies');
    if (!w || !w.models) return '<p class="empty">还没有模型数据。</p>';
    var rows = w.models.table || [];
    var h = '<header class="mast wordy"><p class="day word">模型怎么选</p><div class="meta"><b>' + esc(cnDate(w.date, true)) + ' 周报</b><br>每行都写了依据和数据日期</div>' +
      '<p class="lead">"数据日期"超过 30 天的标红，说明这一行的依据可能已经过时。</p></header>';
    var table = '<div class="tbl"><table><thead><tr><th>用途</th><th>推荐（发布日期）</th><th>依据</th><th>数据日期</th></tr></thead><tbody>' + rows.map(function (r) {
      var age = isDate(r.asOf) ? -daysUntil(r.asOf) : null;
      return '<tr><td class="u">' + esc(r.use) + '</td><td>' + (r.picks || []).map(function (p, i) {
        var rel = r.released && r.released[i]; return '<span class="pk">' + esc(p) + (rel ? '<small>' + esc(rel) + '</small>' : '') + '</span>';
      }).join('') + '</td><td class="b">' + esc(r.basis || '') + (r.link ? ' <a href="' + esc(url(r.link)) + '" target="_blank" rel="noopener noreferrer">来源</a>' : '') + '</td>' +
        '<td class="d' + (age !== null && age > 30 ? ' stale' : '') + '">' + esc(r.asOf || '未注明') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    h += sec('按用途', rows.length + ' 行', table);
    var news = ((w.models.news) || []).map(function (it, i) { return reg(Object.assign({}, it, { id: ident('MD', w.date, i), date: w.date, legacy: true })); });
    if (news.length) h += sec('本周模型动态', news.length + ' 条', news.map(pickHTML).join(''));
    return h;
  }

  // ---------- 页面：Skill 库 ----------
  function cardHTML(s) {
    var sc = typeof s.score === 'number' ? s.score : null;
    var h = '<article class="card" data-id="' + esc(s.id) + '"><div class="score' + (sc === null ? ' na' : sc >= 80 ? ' hi' : '') + '"><b>' + (sc === null ? '—' : sc) + '</b><small>' + (sc === null ? '未评分' : '适合度') + '</small></div><div>' +
      '<h3><a href="' + esc(url(s.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(s.name || s.title) + '</a></h3>' +
      '<p class="by"><span class="tag">' + esc(s.category || '其他') + '</span><span>' + esc(s.author || s.handle || '') + '</span>' +
        (s.stars ? '<span>' + esc(s.stars) + ' 星</span>' : '') + (s.metrics ? '<span>' + esc(s.metrics) + '</span>' : '') + '<span>' + esc(cnDate(s.date, true)) + '收录</span></p>' +
      (s.scoreWhy ? '<p class="scorewhy"><b>为什么是这个分</b>' + esc(s.scoreWhy) + '</p>' : '') +
      (s.what ? '<p class="' + (s.fromX ? 'clip' : '') + '">' + esc(s.what) + '</p>' : '');
    if (s.scene || (s.howto && s.howto.length)) {
      h += '<dl class="how">' + (s.scene ? '<dt>适合</dt><dd>' + esc(s.scene) + '</dd>' : '') +
        (s.howto && s.howto.length ? '<dt>怎么用</dt><dd><ol>' + s.howto.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></dd>' : '') + '</dl>';
    }
    if (s.demo) {
      var src = '/' + String(s.demo).replace(/^\/+/, '');
      h += '<div class="demo"><div class="demo-bar"><span>用这个 Skill 做的示例网站</span><a href="' + esc(src) + '" target="_blank" rel="noopener">打开完整网站</a></div>' +
        '<div class="demo-frame"><iframe src="' + esc(src) + '" title="示例网站预览" loading="lazy" sandbox="allow-scripts" tabindex="-1"></iframe></div></div>';
    }
    if (s.images && s.images.length) {
      h += '<div class="shots">' + s.images.slice(0, 4).map(function (src) {
        return '<a href="' + esc(url(s.url)) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(url(src)) + '" alt="原作者的效果图" loading="lazy" referrerpolicy="no-referrer"></a>';
      }).join('') + '</div>';
    }
    if (s.prompt) {
      h += '<div class="prompt"><div class="prompt-bar"><span>提示词原文</span><span>' + (s.promptZh ? '<button type="button" data-act="lang">看中文</button>' : '') +
        '<button type="button" data-act="expand">展开</button><button type="button" data-act="copy">复制原文</button></span></div><pre>' + esc(s.prompt) + '</pre></div>';
    }
    return h + links(s, s.video ? '<a href="' + esc(url(s.video)) + '" target="_blank" rel="noopener noreferrer">看成片</a>' : '') + '</div></article>';
  }
  function viewSkills() {
    var all = skillsAll();
    var shown = skillFilter === '全部' ? all : all.filter(function (s) { return s.category === skillFilter; });
    var cats = ['全部'].concat(SKILL_CATS).filter(function (c) { return c === '全部' || all.some(function (s) { return s.category === c; }) || ['视频', '图片编辑', 'PPT'].indexOf(c) >= 0; });
    var h = '<header class="mast wordy"><p class="day word">Skill 库</p><div class="meta"><b>共 ' + all.length + ' 个</b><br>历次周报和 X 精选里的 Skill、提示词，按适合你的程度从高到低</div>' +
      '<p class="lead">适合度是生成周报时按"你用得上的频率、上手难度、效果、和你方向的相关性"打的分，只是参考。早期收录的没有评分，排在后面。</p></header>';
    h += '<div style="margin-top:22px" class="filters" role="group" aria-label="按类别筛选">' + cats.map(function (c) {
      var n = c === '全部' ? all.length : all.filter(function (s) { return s.category === c; }).length;
      return '<button type="button" data-skill="' + esc(c) + '" aria-pressed="' + (c === skillFilter) + '">' + esc(c) + '<span>' + n + '</span></button>';
    }).join('') + '</div>';
    h += shown.length ? shown.map(cardHTML).join('') : '<p class="empty">这一类暂时还没有收录，下一期周报会补。</p>';
    return h;
  }

  // ---------- 页面：考研与实习 ----------
  function dir(r) {
    var p = (r.program || '') + (r.college || '');
    if (/物流/.test(p)) return '物流工程与管理';
    if (/管理科学/.test(p)) return '管理科学与工程';
    return '机械 / 机器人';
  }
  function viewFuture() {
    var w = latest('weeklies');
    if (!w) return '<p class="empty">还没有周报。</p>';
    var fut = futureOf(w), table = w.kaoyanTable || [];
    var h = '<header class="mast"><p class="day">' + daysUntil(EXAM_DATE) + '</p><div class="meta"><b>天，距 2027 年 12 月考研初试</b><br>按往年 12 月下旬估算，以研招网公告为准</div>' +
      '<p class="lead">上半部分是三个候选方向在目标院校的对比，每周核对一次；下半部分是本周的考研消息和北京的实习、校招。</p></header>';
    if (table.length) {
      var groups = {};
      table.forEach(function (r) { (groups[dir(r)] = groups[dir(r)] || []).push(r); });
      Object.keys(groups).forEach(function (g) {
        h += sec(g, groups[g].length + ' 所', '<div class="kt">' + groups[g].map(function (r) {
          return '<article><h4>' + esc(r.school) + '<span class="deg">' + esc(r.degree) + '</span></h4><p class="prog">' + esc([r.college, r.program].filter(Boolean).join(' · ')) + '</p>' +
            '<dl><dt>初试</dt><dd>' + esc(r.exam || '未查到') + '</dd><dt>招生</dt><dd>' + esc(r.quota || '未查到') + '</dd><dt>复试线</dt><dd>' + esc(r.line || '未查到') + '</dd></dl>' +
            '<p class="fit">' + esc(r.fit || '') + '</p><p class="src"><a href="' + esc(url(r.url)) + '" target="_blank" rel="noopener noreferrer">原始出处</a>' + (r.checked ? '　核对于 ' + esc(r.checked) : '') + '</p></article>';
        }).join('') + '</div>');
      });
    } else {
      h += sec('方向对比', null, '<p class="empty" style="padding:0">对比表会在下一期周报里生成（三个方向 × 北理工这一档的院校）。</p>');
    }
    var types = ['全部'].concat(FUTURE_TYPES.filter(function (t) { return fut.some(function (f) { return f.type === t; }); }));
    var shown = futureFilter === '全部' ? fut : fut.filter(function (f) { return f.type === futureFilter; });
    shown = shown.slice().sort(function (a, b) {
      var da = isDate(a.deadline) ? a.deadline : '9999', db = isDate(b.deadline) ? b.deadline : '9999'; return da < db ? -1 : da > db ? 1 : 0;
    });
    var body = '<div class="filters" role="group" aria-label="按类型筛选">' + types.map(function (t) {
      var n = t === '全部' ? fut.length : fut.filter(function (f) { return f.type === t; }).length;
      return '<button type="button" data-future="' + esc(t) + '" aria-pressed="' + (t === futureFilter) + '">' + esc(t) + '<span>' + n + '</span></button>';
    }).join('') + '</div>' + shown.map(function (f) {
      return '<article class="pick" data-id="' + esc(f.id) + '"><h3><a href="' + esc(url(f.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(f.title) + '</a></h3>' +
        '<p class="by"><span class="tag">' + esc(f.type) + '</span>' + (f.city ? '<span>' + esc(f.city) + '</span>' : '') + (f.org ? '<span>' + esc(f.org) + '</span>' : '') +
        due(f.deadline) + (f.deadline === '未注明' ? '<span>截止日期未注明</span>' : '') + tags(f) + '</p>' +
        (f.summary ? '<p>' + esc(f.summary) + '</p>' : '') + (f.why ? '<p class="why"><b>对你意味着什么</b>' + esc(f.why) + '</p>' : '') + links(f) + '</article>';
    }).join('');
    h += sec('本周消息', esc(cnDate(w.date, true)) + '周报', fut.length ? body : '<p class="empty" style="padding:0">本周没有符合条件的消息。</p>');
    if (!w.future) h += '<p class="foot">这一期是旧格式：实习没有按城市筛选。从下一期开始只收北京或可远程的。</p>';
    return h;
  }

  // ---------- 往期、收藏、搜索 ----------
  function viewHistory() {
    var rows = [];
    (D.dailies || []).forEach(function (d) { rows.push({ date: d.date, k: '日报', href: '#/d/' + d.date, t: d.headline }); });
    (D.weeklies || []).forEach(function (w) { rows.push({ date: w.date, k: '周报', href: '#/w/' + w.date, t: w.headline }); });
    (D.x || []).forEach(function (x) { rows.push({ date: x.date, k: 'X 精选', href: '#/x', t: (x.items || []).length + ' 条' }); });
    rows.sort(function (a, b) { return a.date === b.date ? (a.k < b.k ? -1 : 1) : (a.date < b.date ? 1 : -1); });
    return '<header class="mast wordy"><p class="day word">往期</p><div class="meta"><b>共 ' + rows.length + ' 期</b></div></header>' +
      sec('全部', null, '<ul class="hist">' + rows.map(function (r) {
        return '<li><a href="' + r.href + '"><span class="d">' + esc(r.date) + '</span><span class="k">' + esc(r.k) + '</span><span>' + esc(r.t || '') + '</span></a></li>';
      }).join('') + '</ul>');
  }
  function viewSaved() {
    var ids = Object.keys(saved).sort(function (a, b) { return saved[a].savedAt < saved[b].savedAt ? 1 : -1; });
    var body = ids.length ? ids.map(function (id) {
      var s = reg(Object.assign({ title: id }, saved[id].snapshot || {}, { id: id }));
      return s.zone === 'sk' || s.prompt || s.howto ? cardHTML(s) : pickHTML(s);
    }).join('') : '<p class="empty" style="padding:0">还没有收藏。看到有用的点"收藏"，或者"写笔记"。</p>';
    return '<header class="mast"><p class="day">' + ids.length + '</p><div class="meta"><b>收藏与笔记</b><br>存在你的服务器上，换设备也在</div></header>' + sec('按收藏时间', null, body);
  }
  function viewSearch(q) {
    var k = q.trim().toLowerCase(), all = [];
    (D.dailies || []).forEach(function (d) { all = all.concat(dailySection(d, 'ai'), dailySection(d, 'wh')); });
    (D.weeklies || []).forEach(function (w) { all = all.concat(weeklyReading(w, 'ai'), weeklyReading(w, 'wh'), futureOf(w)); });
    function hit(e) { return [e.title, e.summary, e.why, e.source, e.what, e.prompt, e.promptZh, (e.takeaways || []).join(' ')].join(' ').toLowerCase().indexOf(k) >= 0; }
    var a = all.filter(hit), b = skillsAll().filter(hit);
    var h = '<header class="mast wordy"><p class="day word">搜索</p><div class="meta"><b>"' + esc(q) + '"</b><br>找到 ' + (a.length + b.length) + ' 条</div></header>';
    if (a.length) h += sec('资讯', a.length + ' 条', a.map(pickHTML).join(''));
    if (b.length) h += sec('Skill 与提示词', b.length + ' 个', b.map(cardHTML).join(''));
    return h;
  }

  // ---------- 导航 ----------
  var ZONES = [
    ['', '今日'], ['ai', 'AI'], ['wh', '仓储物流'], ['x', 'X 精选'], '|',
    ['week', '本周精读'], ['models', '模型怎么选'], ['skills', 'Skill 库'], ['future', '考研与实习'], '|',
    ['history', '往期'], ['saved', '收藏']
  ];
  function counts() {
    var d = latest('dailies'), w = latest('weeklies'), x = latest('x'), c = {};
    byId = {};
    if (d) {
      var ai = dailySection(d, 'ai'), wh = dailySection(d, 'wh');
      c[''] = ai.concat(wh).filter(function (e) { return e.pick && !e.legacy; }).length || ai.length + wh.length;
      c.ai = ai.length; c.wh = wh.length;
      c['unread'] = ai.concat(wh).filter(function (e) { return !isRead(e.id); }).length;
    }
    if (x) c.x = (x.items || []).length;
    if (w) { c.week = weeklyReading(w, 'ai').concat(weeklyReading(w, 'wh')).filter(function (e) { return e.pick; }).length || null; c.future = futureOf(w).length; }
    c.skills = skillsAll().length;
    c.saved = Object.keys(saved).length;
    return c;
  }
  function renderNav(cur) {
    var c = counts();
    $zones.innerHTML = ZONES.map(function (z) {
      if (z === '|') return '<span class="gap" aria-hidden="true"></span>';
      var n = c[z[0]];
      return '<a href="#/' + z[0] + '"' + (cur === z[0] ? ' aria-current="page"' : '') + '>' + z[1] + (n ? '<span class="c' + (z[0] === '' && c.unread ? ' new' : '') + '">' + n + '</span>' : '') + '</a>';
    }).join('');
    var on = $zones.querySelector('[aria-current]');
    if (on && on.scrollIntoView && window.innerWidth < 860) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function route(keepScroll) {
    if (!D) return;
    var y = window.scrollY;
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var k = parts[0] || '', html, cur = k;
    byId = {};
    if (k === '') html = viewToday();
    else if (k === 'ai') html = viewZone('ai', 'AI');
    else if (k === 'wh') html = viewZone('wh', '仓储物流');
    else if (k === 'x') html = viewX();
    else if (k === 'week') html = viewWeek();
    else if (k === 'models') html = viewModels();
    else if (k === 'skills') html = viewSkills();
    else if (k === 'future') html = viewFuture();
    else if (k === 'history') html = viewHistory();
    else if (k === 'saved') html = viewSaved();
    else if (k === 'd') { html = viewToday((D.dailies || []).filter(function (d) { return d.date === parts[1]; })[0] || null); cur = 'history'; }
    else if (k === 'w') { html = viewWeek((D.weeklies || []).filter(function (w) { return w.date === parts[1]; })[0]); cur = 'history'; }
    else if (k === 'search') { html = viewSearch(decodeURIComponent(parts.slice(1).join('/'))); cur = null; }
    else if (/^e-/.test(k)) return;
    else html = '<p class="empty">没有这个页面。<a href="#/">回到今日</a></p>';
    var registry = byId;
    renderNav(cur);
    byId = Object.assign({}, byId, registry);
    $main.innerHTML = html;
    window.scrollTo(0, keepScroll ? y : 0);
  }

  // ---------- 交互 ----------
  $main.addEventListener('click', function (ev) {
    var t;
    if ((t = ev.target.closest('[data-skill]'))) { skillFilter = t.getAttribute('data-skill'); return route(true); }
    if ((t = ev.target.closest('[data-future]'))) { futureFilter = t.getAttribute('data-future'); return route(true); }
    if ((t = ev.target.closest('.clip'))) { t.classList.remove('clip'); return; }
    var a = ev.target.closest('[data-act]'); if (!a) return;
    var card = a.closest('[data-id]'), e = card && byId[card.getAttribute('data-id')], act = a.getAttribute('data-act');
    if (!e) return;
    if (act === 'open') { markRead(e.id); card.classList.add('read'); return; }
    if (act === 'save') toggleSave(e).then(function (on) { toast(on ? '已收藏' : '已取消收藏'); route(true); }).catch(function (x) { if (x.message !== 'cancel') toast(x.message); });
    if (act === 'note') {
      if (card.querySelector('.note-edit')) return;
      var box = document.createElement('div'); box.className = 'note-edit';
      box.innerHTML = '<textarea aria-label="笔记" placeholder="写下想法、待办或疑问">' + esc((saved[e.id] || {}).note || '') + '</textarea>' +
        '<div class="links"><button type="button" data-act="note-cancel">取消</button><button type="button" data-act="note-save" class="on">保存笔记</button></div>';
      a.closest('.links').after(box); box.querySelector('textarea').focus();
    }
    if (act === 'note-cancel') a.closest('.note-edit').remove();
    if (act === 'note-save') saveNote(e, a.closest('.note-edit').querySelector('textarea').value).then(function () { toast('笔记已保存，也已加入收藏'); route(true); }).catch(function (x) { if (x.message !== 'cancel') toast(x.message); });
    if (act === 'copy') (navigator.clipboard ? navigator.clipboard.writeText(e.prompt) : Promise.reject()).then(function () { toast('已复制提示词原文'); }, function () { toast('复制失败，请手动选中复制'); });
    if (act === 'expand') { var pre = card.querySelector('pre'); a.textContent = pre.classList.toggle('open') ? '收起' : '展开'; }
    if (act === 'lang') { var p2 = card.querySelector('pre'), zh = a.textContent === '看中文'; p2.textContent = zh ? e.promptZh : e.prompt; a.textContent = zh ? '看原文' : '看中文'; card.querySelector('.prompt-bar span').textContent = zh ? '提示词中文翻译' : '提示词原文'; }
  });
  document.addEventListener('error', function (ev) {
    var img = ev.target; if (!img || img.tagName !== 'IMG' || !img.closest('.shots')) return;
    var g = img.closest('.shots'); img.parentNode.remove();
    if (!g.children.length) g.outerHTML = '<p class="shots-fail">效果图加载不出来（图在 X 或国外站点上，可能需要代理），点"看原文"去原帖看。</p>';
  }, true);
  document.getElementById('searchForm').addEventListener('submit', function (ev) {
    ev.preventDefault(); var q = document.getElementById('q').value.trim(); if (q) location.hash = '#/search/' + encodeURIComponent(q);
  });
  window.addEventListener('hashchange', function () { route(false); });

  (function () {
    var o = {}; new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    document.getElementById('today').textContent = o.month + '月' + o.day + '日 ' + o.weekday;
  })();

  api('/api/all').then(function (d) {
    D = d; auth = d.auth !== false;
    return (!auth || pass) ? api('/api/saved').then(function (s) { saved = s || {}; }).catch(function () {}) : null;
  }).then(function () { route(false); }).catch(function (e) {
    $main.innerHTML = '<p class="empty">读取失败：' + esc(e.message) + '。检查服务器上的程序是否在运行：systemctl status info-hub</p>';
  });
})();
