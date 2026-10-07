/* 信息库 前端：单页应用，读取 /api/all，按分区展示，收藏与笔记存服务器 */
(function () {
  'use strict';

  var state = { data: null, saved: {}, pass: '', filter: '全部', auth: true };
  try { state.pass = localStorage.getItem('infohub-pass') || ''; } catch (e) {}
  var readSet = {};
  try { readSet = JSON.parse(localStorage.getItem('infohub-read') || '{}') || {}; } catch (e) {}
  function markRead(id) {
    if (!id || readSet[id]) return;
    readSet[id] = 1;
    try { localStorage.setItem('infohub-read', JSON.stringify(readSet)); } catch (e) {}
  }

  var $main = document.getElementById('main');
  var $sync = document.getElementById('sync');
  var $toast = document.getElementById('toast');
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var SKILL_CATS = ['全部', '网页设计', '照片艺术', '写作', 'PPT', '研究', '其他'];

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//.test(u || '') ? u : '#'; }
  function mmdd(date) { return date ? date.slice(5, 7) + date.slice(8, 10) : '0000'; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function cnDate(date) {
    var d = new Date(date + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }
  function toast(msg) {
    $toast.textContent = msg; $toast.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('show'); }, 2200);
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.pass) headers['X-Pass'] = state.pass;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('请求失败 ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }

  // ---------- 库位编码：分区-月日-序号 ----------
  // 收藏用完整 id（带年份），页面上只显示短码
  function code(prefix, date, i) { return prefix + '-' + mmdd(date) + '-' + pad(i + 1); }
  function fullId(prefix, date, i) { return prefix + '-' + date + '-' + pad(i + 1); }

  // ---------- 登录 ----------
  var dlg = document.getElementById('loginDialog');
  var pendingLogin = null;
  function needLogin() {
    return new Promise(function (resolve, reject) {
      if (state.pass || !state.auth) return resolve();
      pendingLogin = { resolve: resolve, reject: reject };
      document.getElementById('loginError').textContent = '';
      document.getElementById('pass').value = '';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }
  document.getElementById('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var p = document.getElementById('pass').value;
    state.pass = p;
    api('/api/login', { method: 'POST' }).then(function () {
      try { localStorage.setItem('infohub-pass', p); } catch (e) {}
      dlg.close();
      return loadSaved();
    }).then(function () {
      if (pendingLogin) { pendingLogin.resolve(); pendingLogin = null; }
    }).catch(function () {
      state.pass = '';
      document.getElementById('loginError').textContent = '密码不对，再试一次。';
    });
  });
  document.getElementById('loginCancel').addEventListener('click', function () {
    dlg.close();
    if (pendingLogin) { pendingLogin.reject(new Error('cancel')); pendingLogin = null; }
  });

  function loadSaved() {
    if (!state.pass && state.auth) return Promise.resolve();
    return api('/api/saved').then(function (s) { state.saved = s || {}; })
      .catch(function (e) { if (e.status === 401) { state.pass = ''; try { localStorage.removeItem('infohub-pass'); } catch (x) {} } });
  }

  // ---------- 条目渲染 ----------
  // entry: { id, code, title, url, source, published, summary, why, whyLabel, tags, vendorClaim, extraMeta }
  function itemHTML(e) {
    var saved = state.saved[e.id];
    var tags = (e.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    if (e.vendorClaim) tags += '<span class="tag vendor">厂商说法</span>';
    var meta = [];
    if (e.source) meta.push('<span>' + esc(e.source) + '</span>');
    if (e.published) meta.push('<span>' + esc(e.published) + '</span>');
    if (e.extraMeta) meta.push(e.extraMeta);
    var read = readSet[e.id];
    return '<article class="item' + (read ? ' is-read' : '') + (e.compact ? ' compact' : '') + '" data-id="' + esc(e.id) + '">' +
        '<h3><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(e.title) + '</a></h3>' +
        '<p class="meta">' + meta.join('') + tags + (read ? '<span class="read-mark">已读</span>' : '') + '<span class="loc" title="条目编号，收藏和搜索时用">' + esc(e.code) + '</span></p>' +
        (e.summary ? '<p class="summary' + (e.compact ? ' clamp' : '') + '">' + esc(e.summary) + '</p>' : '') +
        (e.why ? '<p class="why"><span class="why-label">' + esc(e.whyLabel || '为什么值得看') + '</span>' + esc(e.why) + '</p>' : '') +
        (saved && saved.note ? '<p class="note-text">' + esc(saved.note) + '</p>' : '') +
        actionsHTML(saved, e.url) +
    '</article>';
  }

  function actionsHTML(saved, url) {
    return '<div class="actions">' +
      '<a class="act act-open" href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">看原文</a>' +
      '<button type="button" class="act" data-act="save" aria-pressed="' + (saved ? 'true' : 'false') + '">' + (saved ? '已收藏' : '收藏') + '</button>' +
      '<button type="button" class="act" data-act="note">' + (saved && saved.note ? '改笔记' : '写笔记') + '</button>' +
    '</div>';
  }

  var registry = {}; // id -> 快照，用于收藏
  function reg(e) { registry[e.id] = e; return e; }

  function zone(title, count, body, anchor) {
    return '<section class="zone"' + (anchor ? ' id="z-' + anchor + '"' : '') + '><div class="zone-bar"><h2>' + esc(title) + '</h2><span class="count">' + count + '</span></div>' +
      '<div class="zone-body">' + (body || '<p class="empty">这一期没有内容。</p>') + '</div></section>';
  }

  function itemsFromSection(prefix, date, items, whyLabel) {
    return (items || []).map(function (it, i) {
      return reg({
        id: fullId(prefix, date, i), code: code(prefix, date, i), title: it.title, url: it.url,
        source: it.source, published: it.published, summary: it.summary, why: it.why, whyLabel: whyLabel,
        tags: it.tags, vendorClaim: it.vendorClaim
      });
    });
  }

  // ---------- Skill 与提示词 ----------
  function imagesHTML(imgs, link) {
    if (!imgs || !imgs.length) return '';
    return '<div class="shots">' + imgs.slice(0, 6).map(function (src) {
      return '<a href="' + esc(safeUrl(link || src)) + '" target="_blank" rel="noopener noreferrer">' +
        '<img src="' + esc(safeUrl(src)) + '" alt="效果图" loading="lazy" referrerpolicy="no-referrer"></a>';
    }).join('') + '</div>';
  }
  function promptHTML(prompt, promptZh) {
    if (!prompt) return '';
    return '<div class="prompt" data-prompt-en="' + esc(prompt) + '" data-prompt-zh="' + esc(promptZh || '') + '">' +
      '<div class="prompt-bar"><span>提示词原文</span><span>' +
        (promptZh ? '<button type="button" class="linkbtn" data-act="lang">看中文翻译</button> ' : '') +
        '<button type="button" class="linkbtn" data-act="copy">复制原文</button></span></div>' +
      '<pre class="clamp">' + esc(prompt) + '</pre></div>';
  }
  function demoHTML(demo) {
    if (!demo) return '';
    var src = '/' + demo.replace(/^\/+/, '');
    return '<div class="demo"><div class="demo-bar"><span>用这个 Skill 做的示例网站</span>' +
      '<a href="' + esc(src) + '" target="_blank" rel="noopener">打开完整网站</a></div>' +
      '<div class="demo-frame"><iframe src="' + esc(src) + '" title="示例网站预览" loading="lazy" sandbox="allow-scripts" tabindex="-1"></iframe></div></div>';
  }
  function skillHTML(s) {
    var saved = state.saved[s.id];
    var howto = (s.howto && s.howto.length) ? '<ol>' + s.howto.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ol>' : '';
    var meta = [esc(s.category)];
    if (s.author) meta.push(esc(s.author));
    if (s.stars) meta.push(esc(s.stars) + ' 星');
    if (s.posted) meta.push(esc(s.posted));
    if (s.metrics) meta.push(esc(s.metrics));
    return '<article class="skill" data-id="' + esc(s.id) + '">' +
      '<h3><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer" data-act="open">' + esc(s.name) + '</a></h3>' +
      '<p class="meta">' + meta.map(function (m, i) { return i === 0 ? '<span class="cat">' + m + '</span>' : '<span>' + m + '</span>'; }).join('') + '<span class="loc">' + esc(s.code) + '</span></p>' +
      '<dl>' +
        (s.what ? '<dt>做什么</dt><dd>' + esc(s.what) + '</dd>' : '') +
        (s.scene ? '<dt>适合</dt><dd>' + esc(s.scene) + '</dd>' : '') +
        (howto ? '<dt>怎么用</dt><dd>' + howto + '</dd>' : '') +
      '</dl>' +
      demoHTML(s.demo) + imagesHTML(s.images, s.url) + promptHTML(s.prompt, s.promptZh) +
      (saved && saved.note ? '<p class="note-text">' + esc(saved.note) + '</p>' : '') +
      actionsHTML(saved, s.url) + '</article>';
  }

  function allSkills() {
    var out = [];
    (state.data.weeklies || []).forEach(function (w) {
      (w.skills || []).forEach(function (s, i) {
        out.push(reg(Object.assign({}, s, { id: fullId('SK', w.date, i), code: code('SK', w.date, i), date: w.date, title: s.name })));
      });
    });
    (state.data.x || []).forEach(function (x) {
      (x.items || []).forEach(function (it, i) {
        if (it.kind !== 'prompt') return;
        out.push(reg({
          id: fullId('X', x.date, i), code: code('X', x.date, i), date: x.date,
          name: (it.author || it.handle || 'X') + ' 的提示词', title: (it.author || 'X') + ' 的提示词',
          category: it.category || '其他', author: it.handle, url: it.url, what: it.textZh,
          images: it.images, prompt: it.prompt, promptZh: it.promptZh, posted: it.posted, metrics: it.metrics
        }));
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  // ---------- 页面 ----------
  function viewDaily(d, isToday) {
    var zones = [], html;
    if (d) {
      html = '<header class="masthead"><p class="stamp"><span class="stamp-date">' + esc(d.date.slice(5).replace('-', '.')) + '</span>' +
        '<span class="stamp-sub">' + esc(cnDate(d.date)) + ' 日报</span></p>' +
        '<p class="headline">' + esc(d.headline) + '</p></header>';
      (d.sections || []).forEach(function (s) {
        var prefix = s.key === 'wh' ? 'WH' : 'AI';
        var title = s.title || (s.key === 'wh' ? '仓储物流自动化' : 'AI');
        var items = itemsFromSection(prefix, d.date, s.items);
        zones.push({ key: s.key, title: title, n: items.length, html: zone(title, items.length, items.map(itemHTML).join(''), s.key) });
      });
    } else if (isToday) {
      html = '<header class="masthead"><h1 class="page-title">今天的日报还没生成</h1>' +
        '<p class="page-lead">每天早上 7:51 自动生成，生成后半小时内会出现在这里。先看看下面的 X 精选，或者去<a href="#/week">本周</a>和<a href="#/history">往期</a>。</p></header>';
    } else {
      return '<h1 class="page-title">没有这一期日报</h1><p class="page-lead"><a href="#/history">回到往期列表</a></p>';
    }
    var refDate = d ? d.date : '9999';
    var x = (state.data.x || []).filter(function (f) { return f.date <= refDate; })[0];
    if (x && x.items && x.items.length) {
      var xs = x.items.map(function (it, i) {
        return reg({
          id: fullId('X', x.date, i), code: code('X', x.date, i), compact: true,
          title: it.author || it.handle || 'X',
          url: it.url, source: it.handle || '', published: it.posted, summary: it.textZh,
          tags: [{ prompt: '提示词', news: '资讯', opinion: '观点' }[it.kind] || it.kind]
        });
      });
      var t = 'X 晚间精选 · ' + x.date.slice(5).replace('-', '.');
      zones.push({ key: 'x', title: 'X 精选', n: xs.length, html: zone(t, xs.length, xs.map(itemHTML).join(''), 'x') });
    }
    if (zones.length > 1) {
      html += '<nav class="jump" aria-label="本期分区">' + zones.map(function (z) {
        return '<button type="button" data-jump="z-' + esc(z.key) + '">' + esc(z.title) + '<span>' + z.n + '</span></button>';
      }).join('') + '</nav>';
    }
    html += zones.map(function (z) { return z.html; }).join('');
    if (d && d.notes && d.notes.length) html += '<p class="footnote">备注：' + esc(d.notes.join('；')) + '</p>';
    return html;
  }

  function viewWeekly(w) {
    if (!w) return '<h1 class="page-title">还没有周报</h1><p class="page-lead">每周日早上 8:46 自动生成。</p>';
    var html = '<header class="masthead"><p class="stamp"><span class="stamp-date">' + esc(w.date.slice(5).replace('-', '.')) + '</span>' +
      '<span class="stamp-sub">' + esc(cnDate(w.date)) + ' 周报</span></p>' +
      '<p class="headline">' + esc(w.headline) + '</p></header>';
    var m = w.models || {};
    var news = itemsFromSection('MD', w.date, m.news);
    html += zone('本周模型动态', news.length, news.map(itemHTML).join(''));
    html += tableZone(w);
    var skills = allSkills().filter(function (s) { return s.date === w.date && s.code.indexOf('SK') === 0; });
    html += zone('本周 Skill 与提示词', skills.length, skills.map(skillHTML).join(''));
    var ky = itemsFromSection('KY', w.date, w.kaoyan, '对你意味着什么');
    html += zone('考研动态', ky.length, ky.map(itemHTML).join(''));
    var jb = jobItems(w);
    html += zone('就业与实习', jb.length, jb.map(itemHTML).join(''));
    return html;
  }

  function tableZone(w) {
    var rows = (w && w.models && w.models.table) || [];
    if (!rows.length) return zone('按用途选模型', 0, '');
    var body = '<div class="table-wrap"><table><thead><tr><th scope="col">用途</th><th scope="col">推荐</th><th scope="col">依据</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="use">' + esc(r.use) + '</td><td>' + (r.picks || []).map(function (p) { return '<span class="pick">' + esc(p) + '</span>'; }).join('') + '</td>' +
          '<td class="basis">' + (r.link ? '<a href="' + esc(safeUrl(r.link)) + '" target="_blank" rel="noopener noreferrer">' + esc(r.basis || '来源') + '</a>' : esc(r.basis || '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<section class="zone"><div class="zone-bar"><h2>按用途选模型 · ' + esc(w.date.slice(5)) + ' 更新</h2><span class="count">' + rows.length + '</span></div>' + body + '</section>';
  }

  function jobItems(w) {
    return (w.jobs || []).map(function (j, i) {
      return reg({
        id: fullId('JB', w.date, i), code: code('JB', w.date, i), title: j.company + '｜' + j.role, url: j.url,
        source: j.company, summary: j.summary, why: j.forWhom, whyLabel: '适合谁',
        extraMeta: '<span>截止：' + esc(j.deadline || '未注明') + '</span>'
      });
    });
  }

  function viewModels() {
    var ws = state.data.weeklies || [];
    var html = '<h1 class="page-title">模型怎么选</h1><p class="page-lead">每周日根据第三方榜单和测评更新。点表格里的依据可以看原始来源。</p>';
    html += tableZone(ws[0]);
    var news = [];
    ws.forEach(function (w) { news = news.concat(itemsFromSection('MD', w.date, (w.models || {}).news)); });
    html += zone('模型动态（历次周报）', news.length, news.map(itemHTML).join(''));
    return html;
  }

  function viewSkills() {
    var list = allSkills();
    var f = state.filter;
    var shown = f === '全部' ? list : list.filter(function (s) { return s.category === f; });
    var html = '<h1 class="page-title">Skill 与提示词</h1><p class="page-lead">网页设计类附示例网站，照片艺术类附原作者效果图和完整提示词，可以直接复制去用。</p>' +
      '<div class="filters" role="group" aria-label="按类别筛选">' + SKILL_CATS.map(function (c) {
        var n = c === '全部' ? list.length : list.filter(function (s) { return s.category === c; }).length;
        return '<button type="button" data-filter="' + esc(c) + '" aria-pressed="' + (c === f ? 'true' : 'false') + '">' + esc(c) + ' ' + n + '</button>';
      }).join('') + '</div>';
    html += zone(f, shown.length, shown.map(skillHTML).join(''));
    return html;
  }

  function viewList(title, lead, prefix, key, whyLabel) {
    var all = [];
    (state.data.weeklies || []).forEach(function (w) {
      all = all.concat(key === 'jobs' ? jobItems(w) : itemsFromSection(prefix, w.date, w[key], whyLabel));
    });
    return '<h1 class="page-title">' + esc(title) + '</h1><p class="page-lead">' + esc(lead) + '</p>' + zone(title, all.length, all.map(itemHTML).join(''));
  }

  function viewSaved() {
    if (state.auth && !state.pass) {
      return '<h1 class="page-title">收藏与笔记</h1><p class="page-lead">收藏存在你的服务器上，登录后才能看到。</p><button type="button" class="btn" data-act="login">输入密码</button>';
    }
    var ids = Object.keys(state.saved).sort(function (a, b) { return state.saved[a].savedAt < state.saved[b].savedAt ? 1 : -1; });
    var body = ids.map(function (id) {
      var s = state.saved[id], snap = s.snapshot || { id: id, code: id, title: id };
      snap.id = id; reg(snap);
      return snap.prompt || snap.demo || snap.images ? skillHTML(snap) : itemHTML(snap);
    }).join('');
    return '<h1 class="page-title">收藏与笔记</h1><p class="page-lead">按收藏时间排列，最近的在上面。</p>' + zone('已收藏', ids.length, body);
  }

  function viewHistory() {
    var rows = [];
    (state.data.dailies || []).forEach(function (d) { rows.push({ date: d.date, kind: '日报', href: '#/d/' + d.date, text: d.headline }); });
    (state.data.weeklies || []).forEach(function (w) { rows.push({ date: w.date, kind: '周报', href: '#/w/' + w.date, text: w.headline }); });
    (state.data.x || []).forEach(function (x) { rows.push({ date: x.date, kind: 'X 精选', href: '#/skills', text: (x.items || []).length + ' 条' }); });
    rows.sort(function (a, b) { return a.date === b.date ? (a.kind < b.kind ? -1 : 1) : (a.date < b.date ? 1 : -1); });
    var body = rows.length ? '<ul class="history">' + rows.map(function (r) {
      return '<li><a href="' + r.href + '"><span class="d">' + esc(r.date) + '</span><span class="k">' + esc(r.kind) + '</span><span>' + esc(r.text) + '</span></a></li>';
    }).join('') + '</ul>' : '';
    return '<h1 class="page-title">往期</h1><p class="page-lead">所有日报和周报都存档在这里。</p>' + zone('全部', rows.length, body);
  }

  function viewSearch(q) {
    q = q.trim().toLowerCase();
    var hits = [];
    // 先把所有条目登记一遍
    (state.data.dailies || []).forEach(function (d) {
      (d.sections || []).forEach(function (s) { hits = hits.concat(itemsFromSection(s.key === 'wh' ? 'WH' : 'AI', d.date, s.items)); });
    });
    (state.data.weeklies || []).forEach(function (w) {
      hits = hits.concat(itemsFromSection('MD', w.date, (w.models || {}).news), itemsFromSection('KY', w.date, w.kaoyan, '对你意味着什么'), jobItems(w));
    });
    var skills = allSkills();
    function match(e) {
      return [e.title, e.summary, e.why, e.source, e.what, e.scene, e.prompt, e.promptZh].join(' ').toLowerCase().indexOf(q) >= 0;
    }
    var a = hits.filter(match), b = skills.filter(match);
    return '<h1 class="page-title">搜索：' + esc(q) + '</h1><p class="page-lead">找到 ' + (a.length + b.length) + ' 条。</p>' +
      zone('资讯', a.length, a.map(itemHTML).join('')) + zone('Skill 与提示词', b.length, b.map(skillHTML).join(''));
  }

  // ---------- 路由 ----------
  function route() {
    if (!state.data) return;
    registry = {};
    var h = location.hash.replace(/^#/, '') || '/';
    var parts = h.split('/').filter(Boolean);
    var key = parts[0] || 'today';
    var html;
    if (key === 'today') html = viewDaily((state.data.dailies || [])[0], true);
    else if (key === 'd') html = viewDaily((state.data.dailies || []).filter(function (d) { return d.date === parts[1]; })[0]);
    else if (key === 'week') html = viewWeekly((state.data.weeklies || [])[0]);
    else if (key === 'w') html = viewWeekly((state.data.weeklies || []).filter(function (w) { return w.date === parts[1]; })[0]);
    else if (key === 'models') html = viewModels();
    else if (key === 'skills') html = viewSkills();
    else if (key === 'kaoyan') html = viewList('考研', '研招网和北科大的官方动态，每条都说明对 2027 年 12 月考试意味着什么。', 'KY', 'kaoyan', '对你意味着什么');
    else if (key === 'jobs') html = viewList('就业实习', '优先列大三能投的实习和项目。校内宣讲会请同时留意北科就业网。', 'JB', 'jobs');
    else if (key === 'saved') html = viewSaved();
    else if (key === 'history') html = viewHistory();
    else if (key === 'search') html = viewSearch(decodeURIComponent(parts.slice(1).join('/')));
    else html = '<h1 class="page-title">没有这个页面</h1><p class="page-lead"><a href="#/">回到今日</a></p>';
    $main.innerHTML = html;
    var nav = { d: 'history', w: 'history', search: '' }[key];
    var current = nav === undefined ? key : nav;
    Array.prototype.forEach.call(document.querySelectorAll('.zones a'), function (a) {
      if (a.getAttribute('data-route') === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    enhance();
    window.scrollTo(0, 0);
  }

  // 渲染后处理：长文字折叠、图片失败合并
  function enhance() {
    Array.prototype.forEach.call($main.querySelectorAll('.clamp'), function (el) {
      if (el.scrollHeight <= el.clientHeight + 4) { el.classList.remove('clamp'); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'more'; b.textContent = '展开全文'; b.setAttribute('data-act', 'more');
      b.setAttribute('aria-expanded', 'false');
      el.after(b);
    });
  }
  // 图片加载失败：整组只留一行提示，不留灰块
  document.addEventListener('error', function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== 'IMG' || !img.closest('.shots')) return;
    var grid = img.closest('.shots');
    img.parentNode.classList.add('failed');
    if (grid.querySelectorAll('a:not(.failed)').length === 0) {
      var link = grid.querySelector('a').getAttribute('href');
      grid.outerHTML = '<p class="shots-fail">效果图加载不出来（图片在 X 上，可能需要代理）。<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">去原帖看图</a></p>';
    }
  }, true);

  // ---------- 交互 ----------
  function rerenderKeepScroll() { var y = window.scrollY; route(); window.scrollTo(0, y); }

  $main.addEventListener('click', function (ev) {
    var opener = ev.target.closest('a[data-act="open"]');
    if (opener) {
      var c = opener.closest('[data-id]');
      if (c) { markRead(c.getAttribute('data-id')); c.classList.add('is-read'); }
      return;
    }
    var btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.getAttribute('data-act') === 'more') {
      var target = btn.previousElementSibling;
      var open = target.classList.toggle('open');
      btn.textContent = open ? '收起' : '展开全文';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    var jump = btn.getAttribute('data-jump');
    if (jump) { var z = document.getElementById(jump); if (z) z.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var act = btn.getAttribute('data-act');
    var filter = btn.getAttribute('data-filter');
    if (filter) { state.filter = filter; rerenderKeepScroll(); return; }
    if (act === 'login') { needLogin().then(rerenderKeepScroll).catch(function () {}); return; }
    if (act === 'copy' || act === 'lang') {
      var box = btn.closest('.prompt');
      if (act === 'copy') {
        var text = box.getAttribute('data-prompt-en');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(function () { toast('已复制提示词原文'); })
          .catch(function () { toast('复制失败，请手动选中复制'); });
      } else {
        var pre = box.querySelector('pre');
        var showingZh = btn.textContent === '看原文';
        pre.textContent = showingZh ? box.getAttribute('data-prompt-en') : box.getAttribute('data-prompt-zh');
        box.querySelector('.prompt-bar span').textContent = showingZh ? '提示词原文' : '提示词中文翻译';
        btn.textContent = showingZh ? '看中文翻译' : '看原文';
      }
      return;
    }
    var card = btn.closest('[data-id]');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var entry = registry[id];
    if (act === 'save') {
      needLogin().then(function () {
        var isSaved = !!state.saved[id];
        return api('/api/saved', { method: 'POST', body: isSaved ? { action: 'remove', id: id } : { id: id, snapshot: entry } })
          .then(function (r) { state.saved = r.saved; toast(isSaved ? '已取消收藏' : '已收藏'); rerenderKeepScroll(); });
      }).catch(function (e) { if (e.message !== 'cancel') toast(e.message); });
    }
    if (act === 'note') {
      needLogin().then(function () {
        if (card.querySelector('.note-box')) return;
        var cur = (state.saved[id] && state.saved[id].note) || '';
        var box = document.createElement('div');
        box.className = 'note-box';
        box.innerHTML = '<label class="sr" for="n-' + esc(id) + '">笔记</label><textarea id="n-' + esc(id) + '" placeholder="写下你的想法、待办或疑问">' + esc(cur) + '</textarea>' +
          '<div class="row"><button type="button" class="btn ghost" data-note="cancel">取消</button><button type="button" class="btn" data-note="save">保存笔记</button></div>';
        btn.closest('.actions').after(box);
        box.querySelector('textarea').focus();
        box.addEventListener('click', function (e2) {
          var b = e2.target.closest('button'); if (!b) return;
          e2.stopPropagation();
          if (b.getAttribute('data-note') === 'cancel') { box.remove(); return; }
          api('/api/saved', { method: 'POST', body: { id: id, note: box.querySelector('textarea').value, snapshot: entry } })
            .then(function (r) { state.saved = r.saved; toast('笔记已保存，也已加入收藏'); rerenderKeepScroll(); })
            .catch(function (e) { toast(e.message); });
        });
      }).catch(function (e) { if (e.message !== 'cancel') toast(e.message); });
    }
  });

  document.getElementById('searchForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = document.getElementById('q').value.trim();
    if (q) location.hash = '#/search/' + encodeURIComponent(q);
  });

  function renderSync(s) {
    if (!s) return;
    var when = s.lastOk ? new Date(s.lastOk).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '还没有';
    $sync.innerHTML = (s.ok === false ? '<span class="bad">' + esc(s.message) + '</span><br>' : '') +
      '上次更新：' + esc(when) + '<br><button type="button" id="syncNow">立即同步</button>';
    document.getElementById('syncNow').addEventListener('click', function () {
      needLogin().then(function () {
        toast('正在从 GitHub 拉取……');
        return api('/api/sync', { method: 'POST' });
      }).then(function () { return boot(); }).then(function () { toast('同步完成'); })
        .catch(function (e) { if (e.message !== 'cancel') toast(e.message); });
    });
  }

  function boot() {
    return api('/api/all').then(function (d) {
      state.data = d;
      state.auth = d.auth !== false;
      return loadSaved();
    }).then(function () {
      renderSync(state.data.sync);
      route();
    }).catch(function (e) {
      $main.innerHTML = '<h1 class="page-title">读取失败</h1><p class="page-lead">' + esc(e.message) + '。检查服务器上的程序是否在运行：<code>systemctl status info-hub</code></p>';
    });
  }

  window.addEventListener('hashchange', route);
  boot();
})();
