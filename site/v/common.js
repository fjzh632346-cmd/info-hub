/* 三个备选版式共用的数据层：读取 /api/all，整理成统一的条目列表；收藏、笔记、已读。
   没有日报/周报时用 sample.json 补位，补位条目带 sample: true，页面上要标出"示例"。 */
(function () {
  'use strict';
  var IH = window.IH = {};
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  IH.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  IH.safeUrl = function (u) { return /^https?:\/\//.test(u || '') ? u : '#'; };
  IH.cnDate = function (date, withWeek) {
    var d = new Date(date + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日' + (withWeek === false ? '' : ' ' + WEEK[d.getDay()]);
  };
  IH.dot = function (date) { return date ? date.slice(5).replace('-', '.') : ''; };
  IH.daysUntil = function (date) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((new Date(date + 'T00:00:00') - now) / 86400000);
  };
  // 考研初试一般在 12 月下旬的周六，按往年规律估算 2027 年为 12 月 25 日
  IH.EXAM_DATE = '2027-12-25';

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function mmdd(date) { return date.slice(5, 7) + date.slice(8, 10); }
  function id(prefix, date, i) { return prefix + '-' + date + '-' + pad(i + 1); }
  function code(prefix, date, i) { return prefix + '-' + mmdd(date) + '-' + pad(i + 1); }

  IH.ZONES = {
    ai: { name: 'AI', long: 'AI' },
    wh: { name: '仓储物流', long: '仓储物流自动化' },
    x: { name: 'X 精选', long: 'X 晚间精选' },
    md: { name: '模型动态', long: '本周模型动态' },
    sk: { name: 'Skill 与提示词', long: 'Skill 与提示词' },
    ky: { name: '考研', long: '考研动态' },
    jb: { name: '就业实习', long: '就业与实习' }
  };
  var KIND = { prompt: '提示词', news: '资讯', opinion: '观点' };

  function fromItem(zone, prefix, date, it, i, extra) {
    return Object.assign({
      id: id(prefix, date, i), code: code(prefix, date, i), zone: zone, date: date,
      title: it.title, url: it.url, source: it.source, published: it.published,
      summary: it.summary, why: it.why, whyLabel: '为什么值得看', tags: it.tags || [], vendorClaim: !!it.vendorClaim
    }, extra || {});
  }

  function dailyItems(d, sample) {
    var out = [];
    (d.sections || []).forEach(function (s) {
      var z = s.key === 'wh' ? 'wh' : 'ai';
      (s.items || []).forEach(function (it, i) { out.push(fromItem(z, z.toUpperCase(), d.date, it, i, { sample: sample })); });
    });
    return out;
  }
  function weeklyItems(w, sample) {
    var out = [];
    ((w.models || {}).news || []).forEach(function (it, i) { out.push(fromItem('md', 'MD', w.date, it, i, { sample: sample })); });
    (w.kaoyan || []).forEach(function (it, i) { out.push(fromItem('ky', 'KY', w.date, it, i, { sample: sample, whyLabel: '对你意味着什么' })); });
    (w.jobs || []).forEach(function (j, i) {
      out.push({
        id: id('JB', w.date, i), code: code('JB', w.date, i), zone: 'jb', date: w.date, sample: sample,
        title: j.company + '｜' + j.role, url: j.url, source: j.company, company: j.company, role: j.role,
        summary: j.summary, why: j.forWhom, whyLabel: '适合谁', deadline: j.deadline, tags: []
      });
    });
    (w.skills || []).forEach(function (s, i) {
      out.push(Object.assign({}, s, {
        id: id('SK', w.date, i), code: code('SK', w.date, i), zone: 'sk', date: w.date, sample: sample,
        title: s.name, summary: s.what, source: s.author, tags: []
      }));
    });
    return out;
  }
  function xItems(x) {
    return (x.items || []).map(function (it, i) {
      return {
        id: id('X', x.date, i), code: code('X', x.date, i), zone: 'x', date: x.date, kind: it.kind,
        title: it.author || it.handle || 'X', author: it.author, handle: it.handle, url: it.url,
        source: it.handle, published: it.posted, summary: it.textZh, metrics: it.metrics,
        category: it.category, prompt: it.prompt, promptZh: it.promptZh, images: it.images || [],
        tags: [KIND[it.kind] || it.kind]
      };
    });
  }
  // X 里的提示词也算进 Skill 与提示词
  IH.asSkill = function (e) {
    return Object.assign({}, e, { name: (e.author || e.handle) + ' 的提示词', what: e.summary });
  };

  // ---------- 读取 ----------
  IH.load = function () {
    return fetch('/api/all', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      IH.data = data;
      IH.auth = data.auth !== false;
      var needSample = !(data.dailies || []).length || !(data.weeklies || []).length;
      return (needSample ? fetch('../sample.json').then(function (r) { return r.json(); }) : Promise.resolve(null))
        .then(function (sample) {
          var daily = (data.dailies || [])[0], weekly = (data.weeklies || [])[0], x = (data.x || [])[0];
          var sampleDaily = !daily && sample, sampleWeekly = !weekly && sample;
          if (sampleDaily) daily = sample.daily;
          if (sampleWeekly) weekly = sample.weekly;
          var t = {
            daily: daily, weekly: weekly, x: x,
            sampleDaily: !!sampleDaily, sampleWeekly: !!sampleWeekly,
            today: [].concat(daily ? dailyItems(daily, !!sampleDaily) : [], x ? xItems(x) : []),
            week: weekly ? weeklyItems(weekly, !!sampleWeekly) : [],
            sync: data.sync
          };
          t.skills = t.week.filter(function (e) { return e.zone === 'sk'; })
            .concat(t.today.filter(function (e) { return e.zone === 'x' && e.kind === 'prompt'; }).map(IH.asSkill));
          t.all = t.today.concat(t.week);
          IH.t = t;
          return IH.loadSaved().then(function () { return t; });
        });
    });
  };

  // ---------- 已读 ----------
  var read = {};
  try { read = JSON.parse(localStorage.getItem('infohub-read') || '{}') || {}; } catch (e) {}
  IH.isRead = function (id) { return !!read[id]; };
  IH.markRead = function (id) {
    if (read[id]) return;
    read[id] = 1;
    try { localStorage.setItem('infohub-read', JSON.stringify(read)); } catch (e) {}
  };

  // ---------- 收藏与笔记（和现在的网站共用同一份） ----------
  IH.saved = {};
  var pass = '';
  try { pass = localStorage.getItem('infohub-pass') || ''; } catch (e) {}
  function api(path, body) {
    var h = { 'Content-Type': 'application/json' };
    if (pass) h['X-Pass'] = pass;
    return fetch(path, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) {
          var p = window.prompt('收藏和笔记需要网站密码：');
          if (!p) throw new Error('cancel');
          pass = p; try { localStorage.setItem('infohub-pass', p); } catch (e) {}
          return api(path, body);
        }
        return r.json();
      });
  }
  IH.loadSaved = function () {
    if (IH.auth && !pass) return Promise.resolve();
    return api('/api/saved').then(function (s) { IH.saved = s || {}; }).catch(function () {});
  };
  function snap(e) { var s = Object.assign({}, e); delete s.sample; return s; }
  IH.toggleSave = function (e) {
    var on = !!IH.saved[e.id];
    return api('/api/saved', on ? { action: 'remove', id: e.id } : { id: e.id, snapshot: snap(e) })
      .then(function (r) { IH.saved = r.saved || IH.saved; return !on; });
  };
  IH.saveNote = function (e, note) {
    return api('/api/saved', { id: e.id, note: note, snapshot: snap(e) }).then(function (r) { IH.saved = r.saved || IH.saved; });
  };

  // ---------- 提示 ----------
  IH.toast = function (msg) {
    var t = document.getElementById('ih-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ih-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(IH.toast.t); IH.toast.t = setTimeout(function () { t.className = ''; }, 2000);
  };
  IH.copy = function (text) {
    return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { IH.toast('已复制'); }, function () { IH.toast('复制失败，请手动选中复制'); });
  };

  // ---------- 版式切换条 ----------
  IH.switcher = function (current) {
    var el = document.createElement('nav');
    el.className = 'ih-switch'; el.setAttribute('aria-label', '切换版式');
    el.innerHTML = [['a', 'A 分拣台'], ['b', 'B 早报'], ['c', 'C 看板'], ['', '现版']].map(function (v) {
      var href = v[0] ? '/v/' + v[0] + '/' : '/';
      return '<a href="' + href + '"' + (v[0] === current ? ' aria-current="page"' : '') + '>' + v[1] + '</a>';
    }).join('');
    document.body.appendChild(el);
  };
})();
