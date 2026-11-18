// CardMirror Plugin Manager - UI-only build (v0.1.0)
// Load via Settings -> Plugins -> "Load plugin from file..." then run
// "Open Plugin Manager" from the command palette.
//
// Network/download/license logic is intentionally NOT wired yet. Everything
// that will later talk to Cloudflare is isolated in the `backend` object near
// the top, so phase 2 only has to replace those functions.
(function () {
  'use strict';

  var PLUGIN_ID = 'plugin-manager';
  var SPEECHDROP_ICON = 'data:image/png;base64,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';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  var CONFIG = {
    // Phase 2: the catalog + download API on your Cloudflare Worker.
    LICENSING_WORKER: 'https://cardmirror-licensing.jacob-w-scherrer-cloudfare.workers.dev',
    MAX_BUNDLE_BYTES: 5 * 1024 * 1024, // same cap CardMirror's own installer uses
    TIMEOUT_MS: 20000,
  };

  // Local fallback catalog. In phase 2, backend.getCatalog() fetches this from
  // Cloudflare (D1/R2) so new plugins appear without touching this file.
  var LOCAL_CATALOG = [
    {
      id: 'speechdrop-pro',
      name: 'Speechdrop Plugin',
      description: 'Drop cards straight into your speech doc with one keystroke, with smart ordering and instant undo.',
      tier: 'premium',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#7c3aed', '#c026d3'],
      icon: 'bolt',
      image: SPEECHDROP_ICON,
    },
    {
      id: 'card-search',
      name: 'Card Search',
      description: 'Search every card across your open documents and jump to the source in a click.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#0891b2', '#2563eb'],
      icon: 'search',
    },
  ];

  // ---------------------------------------------------------------------------
  // Local persistence + bundle loader
  //
  // CardMirror's plugin API has no way to write into its plugin folder, so
  // downloaded plugins are kept in localStorage and executed by this manager
  // every launch (see bootInstalledBundles at the bottom). Plugins are
  // full-trust anyway, so this runs with the same access as a normal plugin.
  // ---------------------------------------------------------------------------
  var LS = 'cm-plugin-manager:';
  function lsGet(k, d) {
    try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  var loadedThisSession = (window.__cmPluginManagerLoaded = window.__cmPluginManagerLoaded || {});

  // Runs a downloaded bundle. Returns 'live' (registered now) or 'restart'
  // (this id already ran this session, so the new code applies next launch).
  function runBundle(id, code) {
    if (loadedThisSession[id]) return 'restart';
    try {
      new Function(code + '\n//# sourceURL=cardmirror-plugin-' + id + '.js')();
    } catch (e1) {
      if (e1 && /Content Security Policy|unsafe-eval|EvalError/i.test(String(e1.message || e1) + e1.name)) {
        // eval blocked: try a Blob <script> instead
        var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return new Promise(function (resolve, reject) {
          var el = document.createElement('script');
          el.src = url;
          el.onload = function () { el.remove(); URL.revokeObjectURL(url); loadedThisSession[id] = true; resolve('live'); };
          el.onerror = function () {
            el.remove(); URL.revokeObjectURL(url);
            var err = new Error('CardMirror blocked the plugin from running.'); err.code = 'blocked'; reject(err);
          };
          document.head.appendChild(el);
        });
      }
      throw e1;
    }
    loadedThisSession[id] = true;
    return 'live';
  }

  function bootInstalledBundles() {
    var bundles = lsGet('bundles', {});
    Object.keys(bundles).forEach(function (id) {
      try {
        var r = runBundle(id, bundles[id].code);
        if (r && r.catch) r.catch(function (e) { console.warn('[plugin-manager] failed to load ' + id, e); });
      } catch (e) { console.warn('[plugin-manager] failed to load ' + id, e); }
    });
  }

  // ---------------------------------------------------------------------------
  // Backend (talks to the Cloudflare Worker)
  // ---------------------------------------------------------------------------
  var ID_RE = /^[a-z0-9][a-z0-9-]*$/;
  var BASE = CONFIG.LICENSING_WORKER.replace(/\/+$/, '');

  function httpError(status, bodyText) {
    var t = String(bodyText || '').toLowerCase();
    var code =
      /expir/.test(t) ? 'expired' :
      /revok/.test(t) ? 'revoked' :
      /bound|another device|different device|device mismatch|device limit/.test(t) ? 'bound' :
      /invalid|not found|unknown|no such|unauthor/.test(t) ? 'invalid' :
      status === 429 ? 'rate' :
      status >= 500 ? 'server' :
      (status === 401 || status === 403 || status === 404) ? 'invalid' : 'server';
    var e = new Error('HTTP ' + status); e.code = code; e.status = status; return e;
  }

  function request(path, opts) {
    opts = opts || {};
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, CONFIG.TIMEOUT_MS);
    return fetch(BASE + path, Object.assign({ signal: ctl.signal, cache: 'no-store' }, opts)).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (text) {
        if (!res.ok) throw httpError(res.status, text);
        return { res: res, text: text };
      });
    }, function () {
      clearTimeout(timer);
      var e = new Error('network'); e.code = 'network'; throw e;
    });
  }

  function validateBundle(code) {
    if (typeof code !== 'string' || !code.trim()) throw Object.assign(new Error('Empty download.'), { code: 'server' });
    if (code.length > CONFIG.MAX_BUNDLE_BYTES) throw Object.assign(new Error('Plugin file is too large.'), { code: 'server' });
    if (code.indexOf('__registerCardMirrorPlugin') < 0) throw Object.assign(new Error('Download is not a CardMirror plugin.'), { code: 'server' });
    return code;
  }

  function cleanCatalog(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) {
      return r && ID_RE.test(String(r.id)) && r.name && (r.tier === 'free' || r.tier === 'premium') && r.version;
    }).map(function (r) {
      var local = LOCAL_CATALOG.filter(function (p) { return p.id === r.id; })[0] || {};
      return {
        id: r.id, name: String(r.name), description: String(r.description || local.description || ''),
        tier: r.tier, version: String(r.version), author: String(r.author || local.author || ''),
        // visuals stay local: remote image URLs aren't trusted or guaranteed to load
        accent: local.accent, icon: local.icon, image: local.image,
      };
    });
  }

  var backend = {
    // -> { list, offline }
    getCatalog: function (fresh) {
      return request(fresh ? '/catalog?fresh=1&t=' + Date.now() : '/catalog').then(function (r) {
        var list = cleanCatalog((JSON.parse(r.text) || {}).plugins);
        if (!list.length) throw new Error('empty catalog');
        lsSet('catalog', list);
        return { list: list, offline: false };
      }).catch(function () {
        return { list: lsGet('catalog', null) || LOCAL_CATALOG, offline: true };
      });
    },

    // Free plugins: no license, straight from the catalog/distribution API.
    installFree: function (plugin) {
      if (!ID_RE.test(plugin.id)) return Promise.reject(new Error('Bad plugin id'));
      return request('/plugins/' + encodeURIComponent(plugin.id) + '/download').then(function (r) {
        return { version: r.res.headers.get('X-Plugin-Version') || plugin.version, code: validateBundle(r.text) };
      });
    },

    // ---- Premium (UNVERIFIED PROTOCOL) ------------------------------------
    // The exact /activate and /download field names haven't been confirmed
    // against the Worker source. The body below sends common aliases so it
    // works with the likely names; once confirmed, trim it to the real ones.
    _body: function (plugin, key, deviceId) {
      return JSON.stringify({
        licenseKey: key, license_key: key, key: key,
        productId: plugin.id, product_id: plugin.id, product: plugin.id,
        deviceId: deviceId, device_id: deviceId,
      });
    },
    activate: function (plugin, licenseKey, deviceId) {
      if (!licenseKey) return Promise.reject(Object.assign(new Error('Enter a license key.'), { code: 'invalid' }));
      return request('/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: backend._body(plugin, licenseKey, deviceId),
      });
    },
    installPremium: function (plugin, deviceId, licenseKey) {
      return request('/download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: backend._body(plugin, licenseKey, deviceId),
      }).then(function (r) {
        var code = r.text, version = r.res.headers.get('X-Plugin-Version') || plugin.version;
        if (/json/i.test(r.res.headers.get('Content-Type') || '') || /^\s*\{/.test(code)) {
          var j = JSON.parse(code);
          code = j.plugin || j.code || j.content || j.file || j.data || j.body || '';
          version = j.version || version;
        }
        return { version: version, code: validateBundle(code) };
      });
    },

    checkUpdate: function (plugin) {
      return backend.getCatalog(true).then(function (c) {
        if (c.offline) throw Object.assign(new Error('offline'), { code: 'network' });
        var hit = c.list.filter(function (p) { return p.id === plugin.id; })[0];
        return { latest: hit ? hit.version : plugin.version };
      });
    },
  };

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  var ICONS = {
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    puzzle: '<path d="M10 4a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H7a1 1 0 0 1-1-1v-3H5a2 2 0 1 1 0-4h1V6a1 1 0 0 1 1-1h3V4z"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 3 3"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9m0-5v5h5M4 13a8 8 0 0 0 14 4l2-2m0 5v-5h-5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8"/>',
    alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  };
  function icon(name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.puzzle) + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------------------
  // Styles (rendered inside a shadow root so they can't leak into the editor)
  // ---------------------------------------------------------------------------
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.scrim{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
    '  background:rgba(8,10,15,.55);backdrop-filter:blur(3px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  --bg:#ffffff;--bg2:#f5f6f8;--bg3:#eceef2;--fg:#14171f;--muted:#68707f;--line:#e2e5eb;--brand:#27272a;--brand-fg:#fff;',
    '  --ok:#15803d;--okbg:#dcfce7;--warn:#b45309;--warnbg:#fef3c7;--bad:#b91c1c;--badbg:#fee2e2;--shadow:0 24px 70px rgba(0,0,0,.35)}',
    '@media (prefers-color-scheme:dark){.scrim{--bg:#171a21;--bg2:#1e222b;--bg3:#272c37;--fg:#eceef3;--muted:#98a1b3;--line:#2c313d;',
    '  --brand:#e4e4e7;--brand-fg:#18181b;--ok:#4ade80;--okbg:#14301f;--warn:#fbbf24;--warnbg:#33260c;--bad:#f87171;--badbg:#391517}}',
    '.win{width:min(860px,94vw);height:min(640px,90vh);background:var(--bg);color:var(--fg);border:1px solid var(--line);',
    '  border-radius:16px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}',
    '.win.enter{animation:pop .16s ease-out}',
    '@keyframes pop{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}',
    'header{display:flex;align-items:center;gap:12px;padding:16px 20px 0}',
    '.logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#3f3f46,#71717a)}',
    'h1{font-size:17px;margin:0;font-weight:650;letter-spacing:-.01em}',
    '.sub{font-size:12px;color:var(--muted);margin-top:1px}',
    '.grow{flex:1}',
    'button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}',
    '.iconbtn{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;color:var(--muted)}',
    '.iconbtn:hover{background:var(--bg3);color:var(--fg)}',
    '.bar{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line)}',
    '.tabs{display:flex;gap:4px;background:var(--bg2);padding:3px;border-radius:10px}',
    '.tab{padding:6px 14px;border-radius:8px;font-size:13px;font-weight:550;color:var(--muted);display:flex;gap:6px;align-items:center}',
    '.tab.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12)}',
    '.pill{font-size:11px;background:var(--bg3);color:var(--fg);border-radius:99px;padding:0 6px;line-height:16px}',
    '.search{flex:1;display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:0 10px;color:var(--muted)}',
    '.search:focus-within{border-color:var(--brand)}',
    '.search input{flex:1;border:0;outline:0;background:none;color:var(--fg);font:inherit;font-size:13px;padding:8px 0}',
    '.chip{font-size:12px;padding:5px 11px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}',
    '.chip.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}',
    '.body{flex:1;overflow:auto;padding:20px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}',
    '.card{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--bg);display:flex;flex-direction:column;gap:12px;transition:box-shadow .15s,border-color .15s}',
    '.card:hover{box-shadow:0 6px 22px rgba(0,0,0,.09);border-color:color-mix(in srgb,var(--brand) 35%,var(--line))}',
    '.row{display:flex;gap:12px;align-items:flex-start}',
    '.tile{flex:none;width:48px;height:48px;border-radius:12px;display:grid;place-items:center;color:#fff}',
    '.name{font-weight:650;font-size:15px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.meta{font-size:12px;color:var(--muted);margin-top:2px}',
    '.desc{font-size:13px;line-height:1.5;color:var(--muted);flex:1}',
    '.tag{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:6px}',
    '.tag.free{background:var(--okbg);color:var(--ok)}',
    '.tag.premium{background:var(--warnbg);color:var(--warn)}',
    '.foot{display:flex;align-items:center;gap:8px}',
    '.status{font-size:12px;display:flex;align-items:center;gap:5px;color:var(--muted)}',
    '.status.ok{color:var(--ok)} .status.warn{color:var(--warn)} .status.bad{color:var(--bad)}',
    '.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:9px;font-size:13px;font-weight:600;border:1px solid var(--line);background:var(--bg2)}',
    '.btn:hover{background:var(--bg3)}',
    '.btn.primary{background:var(--brand);color:var(--brand-fg);border-color:transparent}',
    '.btn.primary:hover{filter:brightness(1.08)}',
    '.btn.danger{color:var(--bad)}',
    '.btn[disabled]{opacity:.6;cursor:default;pointer-events:none}',
    '.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}',
    '.list{display:flex;flex-direction:column;gap:10px}',
    '.item{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:14px 16px}',
    '.item .tile{width:42px;height:42px;border-radius:11px}',
    '.item .info{flex:1;min-width:0}',
    '.acts{display:flex;gap:8px;align-items:center}',
    '.empty{text-align:center;color:var(--muted);padding:60px 20px}',
    '.empty .big{width:56px;height:56px;border-radius:16px;background:var(--bg2);display:grid;place-items:center;margin:0 auto 14px}',
    '.empty b{display:block;color:var(--fg);font-size:15px;margin-bottom:4px}',
    '.banner{margin:0 0 16px;padding:10px 14px;border-radius:10px;background:var(--warnbg);color:var(--warn);font-size:12.5px;display:flex;gap:8px;align-items:center}',
    '.skel{height:150px;border-radius:14px;background:linear-gradient(90deg,var(--bg2),var(--bg3),var(--bg2));background-size:200% 100%;animation:sh 1.2s infinite}',
    '@keyframes sh{to{background-position:-200% 0}}',
    '.modalscrim{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:5}',
    '.modal{width:min(420px,90%);background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow)}',
    '.modal.enter{animation:pop .14s ease-out}',
    '.modal h2{margin:0 0 4px;font-size:16px}',
    '.modal p{margin:0 0 14px;font-size:13px;color:var(--muted);line-height:1.5}',
    '.field{display:block;font-size:12px;font-weight:600;margin-bottom:6px}',
    '.input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);font:inherit;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;outline:0}',
    '.input:focus{border-color:var(--brand)}',
    '.err{margin-top:10px;padding:9px 12px;border-radius:9px;background:var(--badbg);color:var(--bad);font-size:12.5px;display:flex;gap:7px;align-items:center}',
    '.mfoot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
    '.hint{font-size:11.5px;color:var(--muted);margin-top:8px}',
    '.toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:9px 16px;border-radius:10px;font-size:13px;box-shadow:var(--shadow);z-index:9;display:flex;gap:8px;align-items:center}',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Plugin logic
  // ---------------------------------------------------------------------------
  var host = null; // current open instance

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function cmpVer(a, b) {
    var pa = String(a).split(/[.-]/).map(Number), pb = String(b).split(/[.-]/).map(Number);
    for (var i = 0; i < 3; i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function openManager(api) {
    if (host) { host.remove(); host = null; }

    var state = {
      view: 'browse', query: '',
      catalog: null, loadError: null,
      busy: {},            // id -> 'installing' | 'updating' | 'removing'
      checking: {},        // id -> true while an update check runs
      latest: {},          // id -> newest version found by a check
      checked: {},         // id -> 'ok' | 'error' after a check
      modal: null,         // { plugin, error, loading, key }
      toast: null,
    };

    // Small records are kept in both the host's plugin storage and localStorage.
    function sget(k, d) {
      var v = lsGet(k, undefined);
      if (v === undefined) { try { v = api.storage.get(k); } catch (e) {} }
      return v == null ? d : v;
    }
    function sset(k, v) { lsSet(k, v); try { api.storage.set(k, v); } catch (e) {} }
    function installed() { return sget('installed', {}); }
    function setInstalled(v) { sset('installed', v); }
    function deviceId() {
      var id = sget('deviceId', null);
      if (!id) { id = uuid(); sset('deviceId', id); } // generated once, persisted, never regenerated
      return id;
    }
    function licenses() { return sget('licenses', {}); }

    // Persist + run a downloaded bundle, then record it as installed.
    function applyInstall(p, r, extra) {
      return Promise.resolve(runBundle(p.id, r.code)).then(function (mode) {
        var bundles = lsGet('bundles', {});
        bundles[p.id] = { code: r.code, version: r.version };
        if (!lsSet('bundles', bundles)) throw Object.assign(new Error('Not enough local storage to save this plugin.'), { code: 'storage' });
        var m = installed();
        m[p.id] = Object.assign({}, m[p.id] || {}, extra || {}, { version: r.version, installedAt: Date.now(), needsRestart: mode === 'restart' });
        setInstalled(m);
        return mode;
      });
    }

    host = document.createElement('div');
    var root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);

    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (host) host.remove();
      host = null;
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (state.modal) { state.modal = null; render(); } else close();
      }
    }
    document.addEventListener('keydown', onKey, true);

    function toast(msg) {
      state.toast = msg; render();
      setTimeout(function () { if (state.toast === msg) { state.toast = null; render(); } }, 2600);
    }

    // ---- actions ----
    function startInstall(p) {
      if (p.tier === 'premium') { state.modal = { plugin: p, error: null, loading: false, key: '', fresh: true }; render(); return; }
      state.busy[p.id] = 'installing'; render();
      backend.installFree(p).then(function (r) { return applyInstall(p, r); }).then(function (mode) {
        delete state.busy[p.id]; toast(p.name + (mode === 'restart' ? ' installed \u2014 restart CardMirror to activate' : ' installed')); render();
      }).catch(function (e) { delete state.busy[p.id]; toast('Install failed: ' + errorMessage(e)); render(); });
    }

    function submitLicense() {
      var mo = state.modal; if (!mo || mo.loading) return;
      var input = root.querySelector('#lic');
      mo.key = input ? input.value.trim() : mo.key;
      mo.loading = true; mo.error = null; render();
      var p = mo.plugin, dev = deviceId();
      var key = mo.key;
      backend.activate(p, key, dev).then(function () {
        return backend.installPremium(p, dev, key);
      }).then(function (r) {
        var ls = licenses(); ls[p.id] = key; sset('licenses', ls);
        return applyInstall(p, r, { license: { status: 'active', hint: '\u2022\u2022\u2022\u2022 ' + key.slice(-4) } });
      }).then(function (mode) {
        state.modal = null; toast(p.name + (mode === 'restart' ? ' installed \u2014 restart CardMirror to activate' : ' installed')); render();
      }).catch(function (e) {
        mo.loading = false; mo.error = errorMessage(e); render();
      });
    }

    function errorMessage(e) {
      var map = {
        invalid: 'That license key isn\u2019t valid.',
        expired: 'This license has expired.',
        revoked: 'This license has been revoked.',
        bound: 'This license is already activated on another device.',
        network: 'Couldn\u2019t reach the plugin server. Check your connection and try again.',
        server: 'The plugin server had a problem. Please try again in a moment.',
        rate: 'Too many requests. Please wait a minute and try again.',
        blocked: 'CardMirror blocked this plugin from running.',
        storage: 'Not enough local storage to save this plugin.',
      };
      return map[e.code] || e.message || 'Something went wrong.';
    }

    function startUpdate(p) {
      state.busy[p.id] = 'updating'; render();
      var rec = installed()[p.id] || {};
      p = Object.assign({}, p, { version: latestFor(p) });
      var run;
      if (p.tier === 'premium') {
        var key = licenses()[p.id];
        run = key ? backend.installPremium(p, deviceId(), key)
                  : Promise.reject(Object.assign(new Error('No saved license'), { code: 'invalid' }));
      } else run = backend.installFree(p);
      run.then(function (r) { return applyInstall(p, r); }).then(function (mode) {
        delete state.busy[p.id]; delete state.latest[p.id]; state.checked[p.id] = 'ok';
        toast(p.name + ' updated to ' + p.version + (mode === 'restart' ? ' \u2014 restart CardMirror to apply' : '')); render();
      }).catch(function (e) {
        delete state.busy[p.id];
        if (p.tier === 'premium' && (e.code === 'expired' || e.code === 'revoked' || e.code === 'invalid' || e.code === 'bound')) {
          var m = installed(); if (m[p.id]) { m[p.id].license = Object.assign({}, m[p.id].license, { status: e.code }); setInstalled(m); }
        }
        toast('Update failed: ' + errorMessage(e)); render();
      });
    }

    function uninstall(p) {
      state.busy[p.id] = 'removing'; render();
      var bundles = lsGet('bundles', {}); delete bundles[p.id]; lsSet('bundles', bundles);
      var m = installed(); delete m[p.id]; setInstalled(m);
      var ls = licenses(); delete ls[p.id]; sset('licenses', ls);
      delete state.latest[p.id]; delete state.checked[p.id];
      delay(300).then(function () {
        delete state.busy[p.id];
        toast(p.name + ' uninstalled' + (loadedThisSession[p.id] ? ' \u2014 fully removed after restart' : '')); render();
      });
    }

    function latestFor(p) { return state.latest[p.id] || p.version; }
    function hasUpdate(p, rec) { return !!rec && cmpVer(latestFor(p), rec.version) > 0; }

    function checkOne(id) {
      var p = byId(id), rec = installed()[id];
      if (!p || !rec || state.checking[id]) return Promise.resolve(null);
      state.checking[id] = true; render();
      return backend.checkUpdate(p, rec.version).then(function (r) {
        state.latest[id] = r.latest; state.checked[id] = 'ok';
        delete state.checking[id];
        return cmpVer(r.latest, rec.version) > 0;
      }).catch(function () {
        state.checked[id] = 'error'; delete state.checking[id]; return null;
      });
    }
    function checkUpdatesFor(id) {
      checkOne(id).then(function (found) {
        var p = byId(id);
        if (found === null) toast('Couldn\u2019t check ' + (p ? p.name : id) + ' for updates');
        else toast(found ? 'Update available for ' + p.name : p.name + ' is up to date');
        render();
      });
    }
    function checkAll() {
      var ids = Object.keys(installed()).filter(function (id) { return byId(id) && !state.checking[id]; });
      if (!ids.length) return;
      Promise.all(ids.map(checkOne)).then(function (res) {
        var n = res.filter(function (x) { return x === true; }).length;
        var failed = res.filter(function (x) { return x === null; }).length;
        toast(failed === ids.length ? 'Couldn\u2019t check for updates'
          : n ? n + (n === 1 ? ' update available' : ' updates available') : 'Everything is up to date');
        render();
      });
    }

    // ---- view helpers ----
    function byId(id) { return (state.catalog || []).filter(function (p) { return p.id === id; })[0]; }
    function tile(p, size) {
      if (p.image) {
        var px = (size || 24) >= 24 && !size ? 48 : 0;
        return '<div class="tile" style="background:none"><img src="' + p.image + '" alt="" style="width:100%;height:100%;border-radius:inherit;display:block"></div>';
      }
      var a = p.accent || ['#52525b', '#a1a1aa'];
      return '<div class="tile" style="background:linear-gradient(135deg,' + esc(a[0]) + ',' + esc(a[1]) + ')">' + icon(p.icon || 'puzzle', size || 24) + '</div>';
    }
    function tierTag(p) { return '<span class="tag ' + esc(p.tier) + '">' + (p.tier === 'premium' ? 'Premium' : 'Free') + '</span>'; }
    function spinner() { return '<span class="spin" style="display:inline-flex">' + icon('refresh', 14) + '</span>'; }

    function card(p) {
      var rec = installed()[p.id], busy = state.busy[p.id], hasUpd = hasUpdate(p, rec);
      var action;
      if (busy === 'installing' || busy === 'updating') action = '<button class="btn primary" disabled>' + spinner() + (busy === 'installing' ? 'Installing\u2026' : 'Updating\u2026') + '</button>';
      else if (rec && hasUpd) action = '<button class="btn primary" data-act="update" data-id="' + esc(p.id) + '">' + icon('refresh', 14) + 'Update</button>';
      else if (rec) action = '<button class="btn" disabled>' + icon('check', 14) + 'Installed</button>';
      else action = '<button class="btn primary" data-act="install" data-id="' + esc(p.id) + '">' + icon(p.tier === 'premium' ? 'key' : 'download', 14) + (p.tier === 'premium' ? 'Install\u2026' : 'Install') + '</button>';
      var status = rec
        ? '<span class="status ok">' + icon('check', 13) + 'Installed v' + esc(rec.version) + '</span>'
        : '<span class="status">Not installed</span>';
      return '<div class="card"><div class="row">' + tile(p) +
        '<div><div class="name">' + esc(p.name) + tierTag(p) + '</div><div class="meta">v' + esc(p.version) + ' \u00b7 ' + esc(p.author || '') + '</div></div></div>' +
        '<div class="desc">' + esc(p.description) + '</div>' +
        '<div class="foot">' + status + '<span class="grow"></span>' + action + '</div></div>';
    }

    function browseView() {
      if (state.loadError) return '<div class="empty"><div class="big">' + icon('alert', 24) + '</div><b>Couldn\u2019t load the catalog</b>' + esc(state.loadError) + '</div>';
      if (!state.catalog) return '<div class="grid"><div class="skel"></div><div class="skel"></div></div>';
      var q = state.query.toLowerCase();
      var list = state.catalog.filter(function (p) {
        return !q || (p.name + ' ' + p.description).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) return '<div class="empty"><div class="big">' + icon('search', 24) + '</div><b>No plugins found</b>Try a different search.</div>';
      return '<div class="grid">' + list.map(card).join('') + '</div>';
    }

    function installedView() {
      var m = installed(), ids = Object.keys(m);
      if (!ids.length) return '<div class="empty"><div class="big">' + icon('box', 24) + '</div><b>Nothing installed yet</b>Browse the marketplace to add your first plugin.</div>';
      return '<div class="list">' + ids.map(function (id) {
        var p = byId(id) || { id: id, name: id, tier: 'free', version: m[id].version, description: '' };
        var rec = m[id], busy = state.busy[id], hasUpd = hasUpdate(p, rec), checking = state.checking[id];
        var lic = '';
        if (p.tier === 'premium') {
          var l = rec.license || {};
          lic = l.status === 'active'
            ? '<span class="status ok">' + icon('key', 13) + 'License active ' + esc(l.hint || '') + '</span>'
            : '<span class="status bad">' + icon('lock', 13) + (l.status === 'expired' ? 'License expired' : l.status === 'revoked' ? 'License revoked' : l.status === 'bound' ? 'License bound to another device' : 'License needed') + '</span>';
        }
        var upd = checking ? '<span class="status">' + spinner() + 'Checking for updates\u2026</span>'
          : hasUpd ? '<span class="status warn">' + icon('refresh', 13) + 'Update available: v' + esc(latestFor(p)) + '</span>'
          : state.checked[id] === 'error' ? '<span class="status bad">' + icon('alert', 13) + 'Couldn\u2019t check for updates</span>'
          : state.checked[id] === 'ok' ? '<span class="status ok">' + icon('check', 13) + 'Up to date</span>'
          : '<span class="status">Not checked yet</span>';
        var acts = busy
          ? '<button class="btn" disabled>' + spinner() + (busy === 'removing' ? 'Removing\u2026' : 'Updating\u2026') + '</button>'
          : (hasUpd ? '<button class="btn primary" data-act="update" data-id="' + esc(id) + '">' + icon('download', 14) + 'Install update</button>'
              : '<button class="btn" data-act="check" data-id="' + esc(id) + '"' + (checking ? ' disabled' : '') + '>' + icon('refresh', 14) + 'Check for updates</button>') +
            '<button class="btn danger" data-act="uninstall" data-id="' + esc(id) + '">' + icon('trash', 14) + 'Uninstall</button>';
        return '<div class="item">' + tile(p, 22) +
          '<div class="info"><div class="name">' + esc(p.name) + tierTag(p) + '</div>' +
          '<div class="meta">Installed v' + esc(rec.version) + (rec.needsRestart && loadedThisSession[id] ? ' \u00b7 restart CardMirror to apply' : '') + '</div>' +
          '<div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">' + upd + lic + '</div></div>' +
          '<div class="acts">' + acts + '</div></div>';
      }).join('') + '</div>';
    }

    function modalView() {
      var mo = state.modal; if (!mo) return '';
      var p = mo.plugin;
      return '<div class="modalscrim" data-act="modal-bg"><div class="modal' + (mo.fresh ? ' enter' : '') + '">' +
        '<div class="row" style="align-items:center;margin-bottom:14px">' + tile(p, 22).replace('width:48px', '') + '<div><h2>Activate ' + esc(p.name) + '</h2></div></div>' +
        '<p>Enter your license key to unlock this premium plugin. Your license is saved on this device so you won\u2019t need to enter it again.</p>' +
        '<label class="field" for="lic">License key</label>' +
        '<input id="lic" class="input" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" value="' + esc(mo.key) + '"' + (mo.loading ? ' disabled' : '') + '>' +
        (mo.error ? '<div class="err">' + icon('alert', 15) + esc(mo.error) + '</div>' : '') +
        '<div class="hint">Licenses are bound to one device. Need to move it? Contact the plugin author for a reset.</div>' +
        '<div class="mfoot"><button class="btn" data-act="modal-cancel"' + (mo.loading ? ' disabled' : '') + '>Cancel</button>' +
        '<button class="btn primary" data-act="modal-submit"' + (mo.loading ? ' disabled' : '') + '>' + (mo.loading ? spinner() + 'Activating\u2026' : 'Activate &amp; install') + '</button></div>' +
        '</div></div>';
    }

    // ---- render ----
    var firstRender = true;
    function render() {
      var focused = root.activeElement && root.activeElement.id;
      var caret = focused === 'q' ? root.activeElement.selectionStart : null;
      var count = Object.keys(installed()).length;
      var body = state.view === 'browse' ? browseView() : installedView();

      root.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="scrim" data-act="bg"><div class="win' + (firstRender ? ' enter' : '') + '" role="dialog" aria-label="Plugin Manager">' +
        '<header><div class="logo">' + icon('store', 18) + '</div>' +
        '<div><h1>Plugin Manager</h1><div class="sub">Browse, install and manage CardMirror plugins</div></div>' +
        '<span class="grow"></span><button class="iconbtn" data-act="close" aria-label="Close">' + icon('x', 18) + '</button></header>' +
        '<div class="bar"><div class="tabs">' +
        '<button class="tab ' + (state.view === 'browse' ? 'on' : '') + '" data-act="tab" data-v="browse">' + icon('store', 14) + 'Browse</button>' +
        '<button class="tab ' + (state.view === 'installed' ? 'on' : '') + '" data-act="tab" data-v="installed">' + icon('box', 14) + 'Installed' + (count ? '<span class="pill">' + count + '</span>' : '') + '</button></div>' +
        (state.view === 'browse'
          ? '<div class="search">' + icon('search', 15) + '<input id="q" placeholder="Search plugins\u2026" value="' + esc(state.query) + '"></div>' 
          : '<span class="grow"></span><button class="btn" data-act="check-all"' +
            (Object.keys(state.checking).length || !Object.keys(installed()).length ? ' disabled' : '') + '>' +
            (Object.keys(state.checking).length ? spinner() : icon('refresh', 14)) + 'Check all for updates</button>') +
        '</div><div class="body">' +
        (state.offline ? '<div class="banner">' + icon('alert', 15) + 'Couldn\u2019t reach the plugin server \u2014 showing the last saved catalog. Installing needs a connection.</div>' : '') +
        body + '</div>' + modalView() +
        (state.toast ? '<div class="toast">' + icon('check', 15) + esc(state.toast) + '</div>' : '') +
        '</div></div>';

      firstRender = false; if (state.modal) state.modal.fresh = false;
      if (focused === 'q') { var el = root.querySelector('#q'); if (el) { el.focus(); el.setSelectionRange(caret, caret); } }
      if (state.modal && !state.modal.loading) { var l = root.querySelector('#lic'); if (l) { l.focus(); l.setSelectionRange(l.value.length, l.value.length); } }
    }

    // ---- events (delegated) ----
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
      if (act === 'bg') { if (e.target === t) close(); return; }
      if (act === 'modal-bg') { if (e.target === t && !state.modal.loading) { state.modal = null; render(); } return; }
      if (act === 'close') close();
      else if (act === 'tab') { state.view = t.getAttribute('data-v'); render(); }
      else if (act === 'install') startInstall(byId(id));
      else if (act === 'check') checkUpdatesFor(id);
      else if (act === 'check-all') checkAll();
      else if (act === 'update') startUpdate(byId(id) || { id: id });
      else if (act === 'uninstall') uninstall(byId(id) || { id: id, name: id });
      else if (act === 'modal-cancel') { state.modal = null; render(); }
      else if (act === 'modal-submit') submitLicense();
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'q') { state.query = e.target.value; render(); }
      if (e.target.id === 'lic' && state.modal) state.modal.key = e.target.value;
    });
    root.addEventListener('keydown', function (e) {
      e.stopPropagation(); // keep editor hotkeys from firing while typing here
      if (e.key === 'Enter' && e.target.id === 'lic') submitLicense();
    });
    root.addEventListener('keyup', function (e) { e.stopPropagation(); });
    root.addEventListener('keypress', function (e) { e.stopPropagation(); });

    render();
    backend.getCatalog().then(function (c) { state.catalog = c.list; state.offline = c.offline; render(); })
      .catch(function (e) { state.loadError = e.message || 'Unknown error'; render(); });
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  window.__registerCardMirrorPlugin && window.__registerCardMirrorPlugin({
    id: PLUGIN_ID,
    name: 'Plugin Manager',
    apiVersion: 1,
    commands: [
      {
        id: PLUGIN_ID + '.open',
        label: 'Open Plugin Manager',
        keywords: ['plugins', 'marketplace', 'install', 'store', 'extensions'],
        defaultKey: null,
        run: function (api) { openManager(api); },
      },
    ],
  });

  // Re-run every plugin installed through the manager (after our own
  // registration, so the manager always loads first).
  bootInstalledBundles();
})();
