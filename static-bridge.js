/* ===== 静态版桥接层（GitHub Pages 用） =====
 *
 * 服务端的 server.js 提供了四样东西：
 *   1) socket.io              实时同步 + 在线状态 + 保存
 *   2) GET /api/trip-config   行程级配置（地图源、城市、搜索中心）
 *   3) GET /api/place/status  搜索服务是否可用
 *   4) GET /api/place/search  地点搜索
 *
 * 静态页没有后端，本文件在浏览器里把这几样补上：
 *   · 地点搜索 → 浏览器直连谷歌 Places API (New)（Key 按「网站来源」限制，可公开）
 *   · 数据同步 → GitHub Contents API 读写你自己的私有仓库（令牌只存本机浏览器）
 *
 * 目的：前端 app.js 一行都不用改 —— io() 和 /api/* 都被本文件接管。
 * 加载顺序必须是：site-config.js → static-bridge.js → app.js
 */
(function () {
  'use strict';

  var CFG = window.TRIP_SITE_CONFIG || {};
  var REAL_FETCH = window.fetch ? window.fetch.bind(window) : null;

  var K_TOKEN = 'trip_gh_token';     // 数据仓库令牌（只授权那一个私有仓库）
  var K_REPO  = 'trip_gh_repo';      // 数据仓库 用户名/仓库名
  var K_GKEY  = 'trip_google_key';   // 浏览器专用谷歌 Key（可覆盖 site-config.js）
  var K_DATA  = 'trip_data_cache';   // 行程数据本机副本

  var ls = {
    get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function token()    { return ls.get(K_TOKEN).trim(); }
  function repo()     { return (ls.get(K_REPO) || CFG.dataRepo || '').trim().replace(/^\/+|\/+$/g, ''); }
  function gkey()     { return (ls.get(K_GKEY) || CFG.googleKey || '').trim(); }
  function dataPath() { return CFG.dataPath || 'data.json'; }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  // ===== 底部状态灯（复用页脚那个「在线状态」位置）=====
  function setStatus(text, kind) {
    var t = document.getElementById('presence-text');
    var d = document.getElementById('presence-dot');
    if (t) t.textContent = text;
    if (d) d.classList.toggle('online', kind === 'ok');
  }

  // ===== base64（UTF-8 安全：中文必须走 TextEncoder，否则 btoa 直接抛错）=====
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b) {
    var bin = atob(String(b).replace(/[\r\n\s]/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ===== GitHub 数据层 =====
  var dataSha = '';            // 当前云端文件版本，PUT 时必须带对，否则 409
  var pendingSave = null;
  var lastJSON = '';

  function ghHeaders(extra) {
    var h = {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function contentsUrl() {
    return 'https://api.github.com/repos/' + repo() + '/contents/' + dataPath();
  }

  async function loadSeed() {
    try {
      var r = await REAL_FETCH('data.json', { cache: 'no-cache' });
      if (r && r.ok) return await r.json();
    } catch (e) {}
    return null;
  }

  async function refreshSha() {
    try {
      var r = await REAL_FETCH(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
      if (r.status === 200) { var d = await r.json(); dataSha = d.sha || ''; return true; }
      if (r.status === 404) { dataSha = ''; return true; }
    } catch (e) {}
    return false;
  }

  async function loadState() {
    if (token() && repo()) {
      try {
        var r = await REAL_FETCH(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
        if (r.status === 200) {
          var d = await r.json();
          dataSha = d.sha || '';
          var st = JSON.parse(b64decode(d.content));
          ls.set(K_DATA, JSON.stringify(st));
          setStatus('已连接云端 · ' + fmtTime(new Date()), 'ok');
          return st;
        }
        if (r.status === 404) {
          // 仓库是空的：用本机缓存/打包数据起步，等第一次保存时创建文件
          setStatus('云端还没有数据文件，首次保存会自动创建', 'ok');
          dataSha = '';
          var cached0 = safeParse(ls.get(K_DATA));
          return cached0 || await loadSeed();
        }
        setStatus('读云端失败（HTTP ' + r.status + '），先用本机数据', 'warn');
        console.warn('GitHub read failed', r.status, await r.text());
      } catch (e) {
        setStatus('连不上 GitHub，先用本机数据', 'warn');
        console.warn(e);
      }
    }
    var cached = safeParse(ls.get(K_DATA));
    if (cached) return cached;
    return await loadSeed();
  }

  function scheduleSave(st) {
    lastJSON = JSON.stringify(st);
    ls.set(K_DATA, lastJSON);        // 先落本机：没网/没令牌也不丢改动
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = setTimeout(function () { pendingSave = null; pushToCloud(lastJSON); }, 900);
  }

  async function pushToCloud(json) {
    if (!token() || !repo()) {
      setStatus('改动只存在本机（点页脚 ☁️ 云端同步 开启）', 'warn');
      return;
    }
    setStatus('保存中…', 'warn');
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var payload = {
          message: 'update trip data ' + new Date().toISOString(),
          content: b64encode(json)
        };
        if (dataSha) payload.sha = dataSha;      // 首次创建时不能带 sha
        var r = await REAL_FETCH(contentsUrl(), {
          method: 'PUT',
          headers: ghHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
          keepalive: true                          // 关页面时也尽量把这次写完
        });
        if (r.status === 200 || r.status === 201) {
          var d = await r.json();
          dataSha = (d.content && d.content.sha) || dataSha;
          setStatus('已保存到云端 · ' + fmtTime(new Date()), 'ok');
          return;
        }
        if (r.status === 409 || r.status === 422) {
          // 版本对不上（云端被别人改过）：取回最新 sha 再写一次，最后一次写入胜出
          if (await refreshSha()) continue;
        }
        var msg = r.status === 401 || r.status === 403
          ? '令牌无效或权限不足（需要该仓库 Contents: Read and write）'
          : 'HTTP ' + r.status;
        setStatus('保存失败：' + msg, 'warn');
        console.warn('GitHub write failed', r.status, await r.text());
        return;
      } catch (e) {
        setStatus('保存失败：连不上 GitHub', 'warn');
        console.warn(e);
        return;
      }
    }
  }

  window.addEventListener('beforeunload', function () {
    if (!pendingSave) return;
    clearTimeout(pendingSave);
    pendingSave = null;
    pushToCloud(lastJSON);
  });

  // ===== socket.io 替身 =====
  var handlers = {};
  function fire(ev, arg) {
    (handlers[ev] || []).slice().forEach(function (f) {
      try { f(arg); } catch (e) { console.error(e); }
    });
  }
  var socketApi = {
    on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return socketApi; },
    off: function (ev, fn) {
      if (handlers[ev]) handlers[ev] = handlers[ev].filter(function (f) { return f !== fn; });
      return socketApi;
    },
    emit: function (ev, payload) {
      if (ev === 'update') scheduleSave(payload);
      // 'rename' 在静态版无意义（没有别的浏览器在看在线状态），忽略
      return socketApi;
    },
    disconnect: function () {},
    connected: true
  };

  var booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    fire('connect');
    var st = await loadState();
    if (!st) { setStatus('没有读到行程数据', 'warn'); return; }
    fire('state', st);
    // 没配令牌 = 这台设备读不到私有仓库里的最新行程（配置只存本机，换设备要重填）
    if (!token() || !repo()) {
      setStatus(
        token()
          ? '本机存储中（点 ☁️ 云端同步 可跨设备）'
          : '这台设备还没填令牌，看到的是本机数据 → 点 ☁️ 云端同步 填一次',
        'warn'
      );
    }
  }
  window.io = function () { setTimeout(boot, 0); return socketApi; };

  // ===== /api/* 拦截 =====
  function jsonResponse(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function tripConfigPayload() {
    var c = CFG.searchCenter || {};
    return {
      mapProvider: CFG.mapProvider === 'amap' ? 'amap' : 'google',
      cityName: CFG.cityName || '',
      searchCenter: [Number(c.lng) || 0, Number(c.lat) || 0],
      amapKeyConfigured: false,
      googlePlacesKeyConfigured: !!gkey()
    };
  }
  function placeStatusPayload() {
    return { ok: true, enabled: !!gkey(), source: gkey() ? 'google' : 'none' };
  }

  function districtOf(p) {
    var comps = p.addressComponents || [];
    var want = ['administrative_area_level_2', 'locality', 'administrative_area_level_1'];
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < comps.length; j++) {
        if ((comps[j].types || []).indexOf(want[i]) >= 0) {
          return comps[j].longText || comps[j].shortText || '';
        }
      }
    }
    return '';
  }

  // 浏览器直连谷歌 Places API (New)。
  // 用新版而不是旧版 Text Search：旧版要求所有 place 字段都开、且新项目默认只开新版接口。
  async function searchPlaces(kw) {
    var key = gkey();
    if (!key) return { ok: false, reason: 'nokey' };
    var q = String(kw || '').trim();
    if (!q) return { ok: true, results: [], hint: 'no-local-match', source: 'google' };

    var body = { textQuery: q, languageCode: 'zh-CN', maxResultCount: 12 };
    var c = CFG.searchCenter || {};
    if (c.lat && c.lng) {
      // locationBias 只是「偏向」，不会把范围外的结果全砍掉
      // （曼谷+清迈跨城 650km，所以半径给到上限 50km 之外仍靠文本相关度兜底）
      body.locationBias = { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 50000 } };
    }

    var r;
    try {
      r = await REAL_FETCH('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.addressComponents'
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      // 请求根本没发出去：多半是当前网络到不了谷歌（国内不挂梯子就是这样）
      if (typeof window.toast === 'function') window.toast('搜索需要能访问谷歌的网络，换个网络再试');
      console.warn('places unreachable', e);
      return { ok: false, reason: 'network' };
    }

    if (!r.ok) {
      var txt = '';
      try { txt = await r.text(); } catch (e) {}
      console.warn('places api', r.status, txt);
      if (typeof window.toast === 'function') {
        if (r.status === 403) {
          window.toast('谷歌拒绝了这个 Key：请确认它的「网站限制」是 ' + location.origin + '/*');
        } else {
          window.toast('谷歌搜索出错（HTTP ' + r.status + '）');
        }
      }
      return { ok: false, reason: 'google' };
    }

    var d = await r.json();
    var out = (d.places || []).map(function (p) {
      var loc = p.location || {};
      return {
        name: (p.displayName && p.displayName.text) || '',
        address: p.formattedAddress || '',
        district: districtOf(p),
        lng: loc.longitude,
        lat: loc.latitude
      };
    }).filter(function (p) {
      return p.name && typeof p.lng === 'number' && typeof p.lat === 'number';
    });

    if (!out.length) return { ok: true, results: [], hint: 'no-local-match', source: 'google' };
    return { ok: true, results: out.slice(0, 12), source: 'google' };
  }

  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    if (url) {
      var path = '';
      try { path = new URL(url, location.href).pathname; } catch (e) { path = url.split('?')[0]; }
      if (path === '/api/trip-config') return Promise.resolve(jsonResponse(tripConfigPayload()));
      if (path === '/api/place/status') return Promise.resolve(jsonResponse(placeStatusPayload()));
      if (path === '/api/place/search') {
        var q = '';
        try { q = new URL(url, location.href).searchParams.get('q') || ''; } catch (e) {}
        return searchPlaces(q).then(
          function (d) { return jsonResponse(d); },
          function (e) { console.warn(e); return jsonResponse({ ok: false, reason: 'error' }); }
        );
      }
    }
    return REAL_FETCH ? REAL_FETCH(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  // ===== 云端同步设置弹窗 =====
  function initCloudUI() {
    var mask = document.getElementById('cloud-mask');
    var btn = document.getElementById('btn-cloud');
    if (!mask || !btn) return;
    var elRepo = document.getElementById('c-repo');
    var elTok = document.getElementById('c-token');
    var elKey = document.getElementById('c-gkey');
    var elState = document.getElementById('c-state');

    function open() {
      elRepo.value = repo();
      elTok.value = token();
      elKey.value = gkey();
      elState.textContent = (token() && repo())
        ? '当前：云端同步已开启'
        : '当前：数据只存在这台设备';
      mask.classList.add('show');
    }
    function close() { mask.classList.remove('show'); }

    btn.addEventListener('click', open);
    document.getElementById('cloud-close').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });

    document.getElementById('btn-save-cloud').addEventListener('click', async function () {
      var tk = elTok.value.trim();
      var rp = elRepo.value.trim().replace(/^\/+|\/+$/g, '');
      var gk = elKey.value.trim();

      ls.set(K_REPO, rp);
      ls.set(K_GKEY, gk);
      if (tk) ls.set(K_TOKEN, tk); else ls.del(K_TOKEN);

      // 谷歌 Key 可能刚填上：让 app.js 重新探一次「搜索是否可用」
      if (typeof window.checkPlaceSearchEnabled === 'function') window.checkPlaceSearchEnabled();

      if (!tk || !rp) {
        elState.textContent = '已保存。未填令牌 → 数据只存在这台设备（换设备看不到改动）。';
        setStatus('本机存储中（点 ☁️ 云端同步 可跨设备）', 'warn');
        return;
      }

      elState.textContent = '正在测试连接…';
      try {
        var r = await REAL_FETCH(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
        if (r.status === 200) {
          var d = await r.json();
          dataSha = d.sha || '';
          var st = JSON.parse(b64decode(d.content));
          ls.set(K_DATA, JSON.stringify(st));
          elState.textContent = '连接成功，已读到云端数据。';
          setStatus('已连接云端 · ' + fmtTime(new Date()), 'ok');
          fire('state', st);
          close();
          return;
        }
        if (r.status === 404) {
          dataSha = '';
          elState.textContent = '连接成功。云端还没有数据文件，下次保存会自动创建。';
          setStatus('云端已连接（首次保存会创建数据文件）', 'ok');
          close();
          return;
        }
        if (r.status === 401 || r.status === 403) {
          elState.textContent = '令牌被拒（HTTP ' + r.status + '）：确认它只授权了 ' + rp
            + '、且 Contents 权限是 Read and write、没有过期。';
        } else {
          elState.textContent = '连接失败 HTTP ' + r.status;
        }
      } catch (e) {
        elState.textContent = '连不上 GitHub：' + ((e && e.message) || e);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudUI);
  } else {
    initCloudUI();
  }
})();
