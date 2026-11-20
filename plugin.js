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
  var PM_VERSION = '0.1.33'; // kept in sync with cardmirror-plugin.json by the release workflow

  // Self-update: if a newer copy of this manager was downloaded on an earlier
  // launch (see selfUpdateCheck), run that copy instead of this file. The
  // flag stops the newer copy from doing the same check again.
  // A copy that fails to start (or never confirms it started, see
  // confirmSelfBoot) is dropped after SELF_MAX_BOOTS tries, its version is
  // remembered as bad so it isn't downloaded again, and this file runs.
  var SELF_KEY = 'cm-plugin-manager:self', SELF_BAD_KEY = 'cm-plugin-manager:selfBad', SELF_MAX_BOOTS = 3;
  if (!window.__cmPluginManagerSelfBoot) {
    var selfCopy = null;
    var dropSelf = function (version) {
      try { localStorage.removeItem(SELF_KEY); localStorage.setItem(SELF_BAD_KEY, JSON.stringify(version)); } catch (e) {}
    };
    try { selfCopy = JSON.parse(localStorage.getItem(SELF_KEY) || 'null'); } catch (e) {}
    if (selfCopy && typeof selfCopy.code === 'string' && cmpVer(selfCopy.version, PM_VERSION) > 0 && (selfCopy.boots || 0) >= SELF_MAX_BOOTS) {
      dropSelf(selfCopy.version);
      window.__cmPluginManagerSelfBoot = { from: PM_VERSION, to: selfCopy.version, failed: 'did not start after ' + SELF_MAX_BOOTS + ' tries' };
    } else if (selfCopy && typeof selfCopy.code === 'string' && cmpVer(selfCopy.version, PM_VERSION) > 0) {
      selfCopy.boots = (selfCopy.boots || 0) + 1;
      try { localStorage.setItem(SELF_KEY, JSON.stringify(selfCopy)); } catch (e) {}
      window.__cmPluginManagerSelfBoot = { from: PM_VERSION, to: selfCopy.version };
      try {
        new Function(selfCopy.code + '\n//# sourceURL=cardmirror-plugin-manager-' + selfCopy.version + '.js')();
        return; // the newer copy is now running; skip the rest of this file
      } catch (e) {
        // Broken download: forget it and carry on with this file's version.
        dropSelf(selfCopy.version);
        window.__cmPluginManagerSelfBoot = { from: PM_VERSION, to: selfCopy.version, failed: String(e && e.message || e) };
      }
    } else if (selfCopy) {
      // The file on disk is the same or newer than the saved copy.
      try { localStorage.removeItem(SELF_KEY); } catch (e) {}
    }
  }
  var SPEECHDROP_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAABPlBMVEUAAAAAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNkAdNn///8QfdwchN4Fd9r6/P78/f/v9v3s9fzd7PoWgN0Ketv3+/611/QykOHg7/vN5PjC3vahzPE8leLZ6/lXpOZTouZMnuRDmeM3kuG52fWp0fKmzvJKnOQsjOAlid/o8vzk8PvG4PeTxe+Kv+6EvO19uex4tutrr+lcpufz+P3U6Pm92/Wx1fSu0/OcyfCOwe50tOpvsepgqOjx9/2Yx/Bkq+g+r1PmAAAAM3RSTlMACcj80qoFApA9J868XPOLa1E3F9d0ELF+Lxvbnpti+IJE7OnAId+2tEnkVv7ElB+iFQ28rOB6AAAF0UlEQVR42sXbh14aQRAG8Lk7ei9SFXs3/dsDBUHQaGLXxGiMptmSvP8LRNJkf3A6B8vl/wI37M3Ozt4uZIsnGfDPhWPZaMGdCel60DVwyxXU9VDGPeTLxsJz/kBSI/W8eX84OzQ5bYDh0fzjZ6PD/ikPKaEFFqKTEXRhRH8ynNOoF95AbGYEPTEmU7kuh8KT8E1AiUhhTCO7kql5KDQ++pTsCDwxoNgjd8JLTOkC+mI2z8u8+AT6JBJj5OPzDPpIn6IHJCbQV5H4/cMfM9BvUY0seXxwQMYyAq8Pjpi1iiAGh/gs8s+AUxY6zr8JOGYk0CEBMnCQqz0N4nBUqq3+j8NRRoBkBThM98jrLxw3Rq2ewHGTUv9jwLbi1of13U9vyysr5cqrl18uzw6KsCVHd1Kwp7T9/ZVo97b+YacErgL945mGHdX3b4Wlb3vnJlhG0ndFGDaYlyvifivrG+AI018+8L2uCIblD4yECP2rwhPgql0IpnU86FHadhEwXwquDfBLQYz9/DXB9Qrg9wUz4Cl9FmwfwDDtpSZtBDwngm2xCo68rRTYWRJsX8EyR01h8LQn4Nrx2dZGY2d78/qkvipaHYBllJqiYNkWssppUa6PW8fL4o+jElhmqCkElj0h2aui3Zuz3V/v6T14xptZ6ImAw1yUnn8CC9XrNbFUBFOSiPJgeS3/ftyjcQWuBBH5wXIsWpRNqBHmTwKpCDHeMX8aZMEiTbMGFHET0RBYllrrXAmK6EQ0CY6aaLEKVcaJaBocprzUKaORxwCDPAJvoUyekuCR6pAJVXLctVCeBVtQxc+tQ/JauA9V4jQHnkup33gDRcLsbmBT7gRKUCPF7khNuR/6oiiCLGXBVBeSzyZUiFIUTJtCtroNBQo0BK62/fB+ET1zkxtcm+3N93HPIcxSBmy7nTbCh+hJiEJgK1ZEB5+30IPHpINve1F0snxWQ7eCtgLAucXmqHxSRHdcFIQd54tWm8G9HXTDRS7Ysl0RVnY3YN8ADcCe4kthabcBuwZpAHZdrQgrSxdV2DPdRQAofhWWPv6ALYPkQhc23glLX6qQsAKwb9s6FVYPwTdAQXRpZ90qF8oNsLlIR9eqp0eio8ohZMwA7Cu9ftf5LZhgClIIvWl8XeqUiWDSKYNeHe53COE1eELkRu/e1NtXSPZnqiGocNDWr52DxU0+KFFbF7J3YBmiLBS5WRKSIjh8FIMq50JyA44shaGM/BaOwZGiOShT/SY1B+AYJj/UuZQmIjjiFIA6G9KSBI4xSkKdmtSmgiNHmgF1yqIFOJ4SzUOdSmtzBo4XRI+hTGnR7re8CBE9gzJvpK84YAgS0SiUObP9Jc1NRMNQZs32yWGUfWCxCStWhyo7YBgmoilwiOVr86EMqEh1qAQGP/vgtPk1ZO+gdN/zl0WrC3Dk6ZbODOBWeX3ThMTyXkEDDBEv+wbN3f7z3futKiCrtbXnX8ERIuJOAyFZrZ/8OGgUzVrNLDY2T+tte6TFQ3BEqSnHDoDvFCxxatIM5QG8LIFlin6ZVB3AJxMsEx7+NSZbzy+Cp0DETgI742+CKU6/aRGFASy9L4ErSU28w9OP3OHfAJtOf43hQebVMufyzo8S+IbpL20cDBvfj8R9FutbsMNI0j+j4Dm83rcYiKP9GxP2uOnO1COw1XZuTr/X15Yr5du8+FY+WqtfXB0UYZ+fWrjhOJeHWiTguAXH71XLBjWS5CNwlJH4T3f7rW/4azocNJ+mNlMR8Kh/Ac7fr09RR1E4JOOljrQMHBFMkwVtFgxqny/TfOi72TTdZ2EEfWWkPHS/gAt9NJ+gB2kpA31i+NLEEdDRF4MJYvKMTUI514JGNuQKSrPRcPs9ZFM6HDKghh5LUlfSY75p9GiiEE/29q/zuezMOLoSCUXjav6B7k0mwqNunR1HJOiODvvzXlJNy+f88ea//4fcs6HHwaBrYPDWgMsV1EMz7iHfaGo4PpZ7+oJs+AmL6E+vfgkySAAAAABJRU5ErkJggg==';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  var CONFIG = {
    // The catalog + download API on your Cloudflare Worker. Servers are tried
    // in order; the first one that answers is remembered for next time.
    //
    // School web filters (GoGuardian, Securly, Lightspeed, Fortinet, ...) very
    // often block every *.workers.dev address, because that domain is used by
    // a lot of proxy/"unblocker" sites. The most reliable fix is to give the
    // Worker a custom domain in Cloudflare (Worker -> Settings -> Domains &
    // Routes -> Add custom domain, e.g. plugins.yourdomain.com) and put that
    // URL FIRST in this list. Keep workers.dev as the fallback.
    //
    // Download providers, in order of preference. A new computer starts with
    // the first one; whichever answers is remembered and used first from then
    // on (see providerOrder). Licensing (codes, paid downloads) only works on
    // the provider marked licensing: true.
    //   type 'worker':      REST paths (/catalog, /plugins/<id>/download, ...)
    //   type 'apps-script': ?action=catalog / ?action=download&id=<id>;
    //                       catalog + free downloads only, errors are HTTP 200
    //                       with { error }, and it has daily quotas.
    PROVIDERS: [
      // postFallback: when a filter redirects GETs to a sign-in page (Securly
      // does this), ask for the catalog/downloads with POST instead.
      { id: 'cloudflare', name: 'Cloudflare', type: 'worker', licensing: true, postFallback: true,
        base: 'https://cardmirror-licensing.jacob-w-scherrer-cloudfare.workers.dev' },
      { id: 'vercel', name: 'Vercel', type: 'worker',
        base: 'https://cardmirror-vercel-downloads.vercel.app' },
      { id: 'apps-script', name: 'Google Apps Script', type: 'apps-script',
        base: 'https://script.google.com/macros/s/AKfycbyc7MVjwoykoCim1hN-wMTHWABtmLn0LggEFTN_Kt2PRn9VnjxyIa7g4vx3t6usDT1W1g/exec' },
    ],
    // While a backup is the remembered provider, Cloudflare gets one try first
    // at most this often, so a network that unblocks it moves back to it.
    PREFERRED_RECHECK_MS: 24 * 60 * 60 * 1000,
    // After Apps Script reports a quota/rate limit, skip it for this long.
    APPS_SCRIPT_QUOTA_COOLDOWN_MS: 30 * 60 * 1000,
    APPS_SCRIPT_BUSY_COOLDOWN_MS: 60 * 1000,
    // One code unlocks the whole store. Where people buy it:
    STORE_URL: 'https://cardmirror-plugin-storefront.pages.dev/#plugins', // where people buy a code
    STORE_PASS_ID: 'all-access', // product_id the licensing Worker uses for the store code // after Cloudflare fails, try the backup first for this long
    // Usage ping + feedback (the CardMirror-Plugin-Admin Worker).
    ADMIN_API: 'https://cardmirror-plugin-admin.jacob-w-scherrer-cloudfare.workers.dev',
    USAGE_PING: true,              // anonymous check-in, at most every 12h
    PING_EVERY_MS: 12 * 60 * 60 * 1000,
    // Where the manager looks for newer copies of itself (GitHub releases).
    SELF_UPDATE: {
      manifest: 'https://raw.githubusercontent.com/Jacob101119/Cardmirror-Plugin-Installer/main/cardmirror-plugin.json',
      code: 'https://raw.githubusercontent.com/Jacob101119/Cardmirror-Plugin-Installer/v{version}/plugin.js',
    },
    AUTO_UPDATE_DELAY_MS: 6000,    // wait after startup before background updates
    MAX_BUNDLE_BYTES: 5 * 1024 * 1024, // same cap CardMirror's own installer uses
    TIMEOUT_MS: 20000,
    LOG_MAX: 300, // entries kept in the diagnostics log
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
      accent: ['#e4e4e7', '#d4d4d8'],
      iconColor: '#111111',
      icon: 'search',
      openCommand: 'cardmirror-heading-search.open', // "Heading Search: Open (standalone window)"
    },
    {
      id: 'quick-files',
      name: 'QuickFiles',
      description: 'Pin files for quick and easy access from within CardMirror.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#71717a', '#3f3f46'],
      iconColor: '#ffffff',
      icon: 'pin',
      openCommand: 'pinned-files.openPanel', // "QuickFiles: Open Panel"
    },
    {
      id: 'themes',
      name: 'Themes',
      description: 'Customize CardMirror’s appearance with additional themes and seasonal styles.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#f97316', '#db2777'],
      iconColor: '#ffffff',
      icon: 'brush',
      openCommand: 'cardmirror-themes.picker', // "Themes: Choose theme…"
    },
    {
      id: 'round-dashboard',
      name: 'Round Dashboard',
      description: 'A dedicated dashboard for managing and viewing debate rounds.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#0b1220', '#1e293b'],
      iconColor: '#22d3ee',
      icon: 'gauge',
      openCommand: 'cardmirror-round-dashboard.open', // "Round Dashboard: Open Dashboard"
    },
    {
      id: 'judge-dashboard',
      name: 'Judge Dashboard',
      description: 'A dedicated dashboard for judges to organize rounds, manage ballots, and access judge-specific tools.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#1e3a8a', '#172554'],
      iconColor: '#ffffff',
      icon: 'gavel',
      openCommand: 'cardmirror-judge-dashboard.open', // "Judge Dashboard: Open Dashboard"
    },
    {
      id: 'todo-list',
      name: 'TODO List',
      description: 'A task management plugin for creating, organizing, tracking, and completing tasks directly in Cardmirror.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#10b981', '#047857'],
      iconColor: '#ffffff',
      icon: 'checklist',
      openCommand: 'cardmirror-todo.openList', // "TODO: Open List"
    },
    {
      id: 'shrink-cites',
      name: 'Shrink Cites',
      description: 'Shrink cite paragraphs to keep cards clean and readable.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#f59e0b', '#b45309'],
      iconColor: '#ffffff',
      icon: 'quote',
      openCommand: 'cardmirror-shrink-cites.open-panel', // "Shrink Cites: Open Panel"
    },
    {
      id: 'ribbon-manager',
      name: 'Ribbon Manager',
      description: 'Customize your CardMirror ribbon by choosing exactly which buttons appear and which stay hidden.',
      tier: 'free',
      version: '1.0.0',
      author: 'Jacob Scherrer',
      accent: ['#6366f1', '#4338ca'],
      iconColor: '#ffffff',
      icon: 'sliders',
      openCommand: 'cardmirror-ribbon-manager.openPanel', // "Ribbon Manager: Open Panel"
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

  // ----------------------------------------------------------------------------
  // Diagnostics log
  //
  // Kept in localStorage (survives restarts) and mirrored to the console.
  // Users never see it; it's attached to feedback only when they tick
  // "Include a log". License keys and request bodies are never logged.
  // ---------------------------------------------------------------------------
  var logBuf = lsGet('log', []);
  if (!Array.isArray(logBuf)) logBuf = [];
  var logSaveTimer = null;

  function log(level, event, data) {
    var entry = { t: new Date().toISOString(), level: level, event: event };
    if (data !== undefined) entry.data = data;
    logBuf.push(entry);
    if (logBuf.length > CONFIG.LOG_MAX) logBuf.splice(0, logBuf.length - CONFIG.LOG_MAX);
    if (!logSaveTimer) logSaveTimer = setTimeout(function () { logSaveTimer = null; lsSet('log', logBuf); }, 250);
    try {
      var fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn.call(console, '[plugin-manager] ' + event, data === undefined ? '' : data);
    } catch (e) {}
  }

  function errInfo(e) {
    if (!e) return { error: String(e) };
    var o = { name: e.name, message: e.message, code: e.code };
    if (e.status) o.status = e.status;
    if (e.detail) o.detail = e.detail;
    return o;
  }

  function safeJson(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  function envInfo() {
    var evalOk, lsOk, tz;
    try { evalOk = new Function('return 1')() === 1; } catch (e) { evalOk = false; }
    try { localStorage.setItem(LS + 'probe', '1'); localStorage.removeItem(LS + 'probe'); lsOk = true; } catch (e) { lsOk = false; }
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    var bytes = 0;
    try { bytes = (localStorage.getItem(LS + 'bundles') || '').length; } catch (e) {}
    return {
      managerVersion: PM_VERSION,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      online: navigator.onLine,
      origin: location.origin,
      protocol: location.protocol,
      language: navigator.language,
      timeZone: tz,
      providers: CONFIG.PROVIDERS.map(function (p) { return p.id + ' ' + p.base; }),
      providerState: lsGet('providers', null),
      evalAllowed: evalOk,
      localStorageWritable: lsOk,
      savedBundleChars: bytes,
      hostApiPresent: !!window.__registerCardMirrorPlugin,
    };
  }

  function diagText() {
    var lines = [
      'CardMirror Plugin Manager diagnostics',
      'Generated: ' + new Date().toISOString(),
      'Environment: ' + JSON.stringify(envInfo(), null, 2),
      '',
      'Log (' + logBuf.length + ' entries, oldest first):',
    ];
    logBuf.forEach(function (e) {
      lines.push(e.t + ' ' + String(e.level).toUpperCase() + ' ' + e.event + (e.data !== undefined ? ' ' + safeJson(e.data) : ''));
    });
    return lines.join('\n');
  }

  var loadedThisSession = (window.__cmPluginManagerLoaded = window.__cmPluginManagerLoaded || {});

  // Runs a downloaded bundle. Returns 'live' (registered now) or 'restart'
  // (this id already ran this session, so the new code applies next launch).
  var runningBundleId = null; // catalog id of the bundle currently executing

  function runBundle(id, code) {
    if (loadedThisSession[id]) { log('info', 'bundle.run.deferred', { id: id, reason: 'already ran this session' }); return 'restart'; }
    try {
      runningBundleId = id;
      try { new Function(code + '\n//# sourceURL=cardmirror-plugin-' + id + '.js')(); }
      finally { runningBundleId = null; }
    } catch (e1) {
      if (e1 && /Content Security Policy|unsafe-eval|EvalError/i.test(String(e1.message || e1) + e1.name)) {
        // eval blocked: try a Blob <script> instead
        log('warn', 'bundle.run.evalBlocked', { id: id, error: errInfo(e1) });
        var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return new Promise(function (resolve, reject) {
          var el = document.createElement('script');
          el.src = url;
          el.onload = function () { runningBundleId = null; el.remove(); URL.revokeObjectURL(url); loadedThisSession[id] = true; log('info', 'bundle.run.ok', { id: id, via: 'blob-script' }); resolve('live'); };
          el.onerror = function () {
            runningBundleId = null; el.remove(); URL.revokeObjectURL(url);
            log('error', 'bundle.run.blocked', { id: id, via: 'blob-script' });
            var err = new Error('CardMirror blocked the plugin from running.'); err.code = 'blocked'; reject(err);
          };
          runningBundleId = id;
          document.head.appendChild(el);
        });
      }
      log('error', 'bundle.run.threw', { id: id, error: errInfo(e1), stack: String(e1 && e1.stack || '').slice(0, 600) });
      throw e1;
    }
    loadedThisSession[id] = true;
    log('info', 'bundle.run.ok', { id: id, via: 'eval' });
    return 'live';
  }

  // ---------------------------------------------------------------------------
  // Command registry
  //
  // Wraps CardMirror's register function so the manager learns each plugin's
  // commands. Clicking an installed plugin's tile then runs its "open" command.
  //
  // CardMirror creates each plugin's API object privately and only passes it
  // to a command when CardMirror itself runs that command (palette, shortcut).
  // Registration returns nothing. So:
  //  - whenever CardMirror runs any of a plugin's commands, we keep the real
  //    API it passed and use it from then on;
  //  - until then, we build a stand-in that matches CardMirror's own API for
  //    that plugin (storage and settings live in localStorage
  //    "plugin:<id>", the same place CardMirror keeps them).
  // ---------------------------------------------------------------------------
  var commandRegistry = (window.__cmPluginCommandRegistry = window.__cmPluginCommandRegistry || {});
  var pluginInfo = (window.__cmPluginInfo = window.__cmPluginInfo || {}); // pluginId -> { def, api, standIn }

  // ---------------------------------------------------------------------------
  // Saved-data protection
  //
  // At startup CardMirror deletes localStorage "plugin:<id>" for every plugin
  // that isn't in ITS installed list. Plugins installed through this manager
  // aren't in that list, so their settings (e.g. Themes colors, QuickFiles
  // pins) were wiped on every launch. We keep a copy of each managed plugin's
  // data under our own key and put it back before the plugin loads.
  // ---------------------------------------------------------------------------
  var BACKUP_PREFIX = LS + 'data:';

  function managedPlugins() { return lsGet('pluginIds', {}); } // catalog id -> CardMirror plugin id

  function rememberManagedPlugin(catalogId, pid) {
    var m = managedPlugins();
    if (m[catalogId] === pid) return;
    m[catalogId] = pid; lsSet('pluginIds', m);
    log('info', 'dataGuard.tracking', { id: catalogId, plugin: pid });
  }

  function backupPluginData() {
    var m = managedPlugins();
    Object.keys(m).forEach(function (cid) {
      var pid = m[cid];
      try {
        var cur = localStorage.getItem('plugin:' + pid);
        if (cur == null) return; // never replace a good copy with "nothing"
        if (localStorage.getItem(BACKUP_PREFIX + pid) !== cur) localStorage.setItem(BACKUP_PREFIX + pid, cur);
      } catch (e) {}
    });
  }

  // Runs before any managed plugin loads.
  function restorePluginData() {
    var m = managedPlugins(), restored = [];
    Object.keys(m).forEach(function (cid) {
      var pid = m[cid];
      try {
        if (localStorage.getItem('plugin:' + pid) != null) return;
        var saved = localStorage.getItem(BACKUP_PREFIX + pid);
        if (saved == null) return;
        localStorage.setItem('plugin:' + pid, saved);
        restored.push(pid);
      } catch (e) { log('warn', 'dataGuard.restoreFailed', { plugin: pid, error: errInfo(e) }); }
    });
    if (restored.length) log('info', 'dataGuard.restored', { plugins: restored });
  }

  // Forget a plugin's data when it's uninstalled through the manager.
  function forgetManagedPlugin(catalogId) {
    var m = managedPlugins(), pid = m[catalogId];
    if (!pid) return;
    delete m[catalogId]; lsSet('pluginIds', m);
    try { localStorage.removeItem(BACKUP_PREFIX + pid); localStorage.removeItem('plugin:' + pid); } catch (e) {}
  }

  function startDataGuard() {
    if (window.__cmPluginManagerDataGuard) return;
    window.__cmPluginManagerDataGuard = true;
    setInterval(backupPluginData, 2000);
    window.addEventListener('pagehide', backupPluginData);
    window.addEventListener('beforeunload', backupPluginData);
    window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('plugin:') === 0) backupPluginData(); });
  }

  function hookRegister() {
    var orig = window.__registerCardMirrorPlugin;
    if (typeof orig !== 'function' || orig.__cmManagerHook) return;
    var hooked = function (def) {
      try {
        var pid = def && String(def.id);
        if (pid && runningBundleId) rememberManagedPlugin(runningBundleId, pid);
        if (pid) {
          var info = pluginInfo[pid] = pluginInfo[pid] || { def: def, api: null, standIn: null };
          info.def = def;
          (Array.isArray(def.commands) ? def.commands : []).forEach(function (c) {
            if (!c || !c.id || typeof c.run !== 'function') return;
            var run = c.run;
            c.run = function (api) {
              if (api && typeof api === 'object' && api !== info.standIn) {
                if (!info.api) log('info', 'registry.realApi', { plugin: pid });
                info.api = api;
              }
              return run.apply(this, arguments);
            };
            commandRegistry[c.id] = { run: c.run, label: c.label, plugin: pid };
          });
        }
      } catch (e) { log('warn', 'registry.hookFailed', { plugin: def && def.id, error: errInfo(e) }); }
      var ret = orig.apply(this, arguments);
      if (ret && typeof ret === 'object' && def && pluginInfo[def.id]) pluginInfo[def.id].api = ret;
      return ret;
    };
    hooked.__cmManagerHook = true;
    try { window.__registerCardMirrorPlugin = hooked; } catch (e) { log('warn', 'registry.unavailable', errInfo(e)); }
  }

  // Same rules CardMirror uses to read a declared setting.
  function settingValue(decl, v) {
    switch (decl.type) {
      case 'boolean': return typeof v === 'boolean' ? v : decl.default;
      case 'text': case 'multiline': return typeof v === 'string' ? v : decl.default;
      case 'number': return typeof v === 'number' && isFinite(v) ? v : decl.default;
      case 'select': return typeof v === 'string' && (decl.options || []).indexOf(v) >= 0 ? v : decl.default;
      default: return v === undefined ? decl.default : v;
    }
  }

  // Stand-in for CardMirror's per-plugin API (mirrors CardMirror 1.17's).
  function makeStandInApi(pid) {
    var key = 'plugin:' + pid;
    var bag = function () { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } };
    var decls = function () { var d = pluginInfo[pid] && pluginInfo[pid].def; return d && Array.isArray(d.settings) ? d.settings : []; };
    var base = lastApi && typeof lastApi === 'object' ? lastApi : {};
    var api = {
      appVersion: base.appVersion,
      showToast: function (msg) {
        var s = '[' + pid + '] ' + String(msg);
        // The manager's own toast is the closest thing to CardMirror's.
        if (typeof base.showToast === 'function') { try { base.showToast(String(msg)); return; } catch (e) {} }
        console.info(s);
      },
      storage: {
        get: function (k) { return bag()[k]; },
        set: function (k, v) { var b = bag(); b[k] = v; try { localStorage.setItem(key, JSON.stringify(b)); } catch (e) {} },
      },
      settings: {
        get: function (k) {
          var decl = decls().filter(function (s) { return s && s.key === k; })[0];
          if (!decl) return undefined;
          var raw = bag().__settings;
          return settingValue(decl, raw && typeof raw === 'object' ? raw[k] : undefined);
        },
        // CardMirror's change notifications are private, so watch the stored
        // values instead and report keys that changed.
        onChanged: function (cb) {
          var last = JSON.stringify(bag().__settings || {});
          var t = setInterval(function () {
            var cur = bag().__settings || {}, s = JSON.stringify(cur);
            if (s === last) return;
            var prev = {}; try { prev = JSON.parse(last); } catch (e) {}
            last = s;
            Object.keys(Object.assign({}, prev, cur)).forEach(function (k) {
              if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k])) { try { cb(k, cur[k]); } catch (e) {} }
            });
          }, 1000);
          return function () { clearInterval(t); };
        },
      },
    };
    // Doc-related helpers aren't tied to a plugin; borrow them when available.
    ['extractSelection', 'jumpToSource', 'flowApps', 'flowPost', 'docInfo'].forEach(function (n) {
      if (typeof base[n] === 'function') api[n] = base[n].bind(base);
    });
    return api;
  }

  function apiFor(pid) {
    var info = pluginInfo[pid];
    if (!info) return null;
    if (info.api) return info.api;
    return info.standIn || (info.standIn = makeStandInApi(pid));
  }

  // Runs another plugin's command. Returns false if it isn't loaded.
  function runPluginCommand(commandId, onFail) {
    var en = commandRegistry[commandId];
    if (!en) { log('warn', 'openPlugin.notRegistered', { command: commandId }); return false; }
    var info = pluginInfo[en.plugin] || {};
    log('info', 'openPlugin.run', { command: commandId, api: info.api ? 'real' : 'stand-in' });
    Promise.resolve().then(function () { return en.run(apiFor(en.plugin)); }).catch(function (e) {
      log('error', 'openPlugin.failed', { command: commandId, api: info.api ? 'real' : 'stand-in', error: errInfo(e), stack: String(e && e.stack || '').slice(0, 500) });
      if (onFail) onFail(e);
    });
    return true;
  }

  function bootInstalledBundles() {
    var bundles = lsGet('bundles', {});
    Object.keys(bundles).forEach(function (id) {
      try {
        var r = runBundle(id, bundles[id].code);
        if (r && r.catch) r.catch(function (e) { log('warn', 'boot.bundle.failed', { id: id, error: errInfo(e) }); });
      } catch (e) { log('warn', 'boot.bundle.failed', { id: id, error: errInfo(e) }); }
    });
  }

  // ---------------------------------------------------------------------------
  // Backend (talks to the Cloudflare Worker)
  // ---------------------------------------------------------------------------
  var ID_RE = /^[a-z0-9][a-z0-9-]*$/;
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return ''; } }

  // Filter redirects carry device/session tokens in the query string; keep only
  // the parts useful for debugging so the log is safe to share.
  function redactUrl(u) {
    try {
      var p = new URL(u), keep = ['categoryid', 'reason', 'policyid'];
      var q = keep.filter(function (k) { return p.searchParams.get(k) != null; })
        .map(function (k) { return k + '=' + p.searchParams.get(k); }).join('&');
      return p.origin + p.pathname + (q ? '?' + q + ' (other params removed)' : '');
    } catch (e) { return '(unparseable url)'; }
  }

  function isLoginRedirect(res) {
    return !!res.redirected && /login|signin|sign-in|sso|auth/i.test(new URL(res.url, 'https://x/').pathname);
  }

  // Words that show up on school/corporate web-filter block pages.
  var BLOCK_RE = /goguardian|securly|lightspeed|fortiguard|fortinet|iboss|umbrella|opendns|zscaler|contentkeeper|smoothwall|linewize|netsweeper|blocksi|deledao|cisco|palo ?alto|sophos|barracuda|web ?filter|access denied|has been blocked|site blocked|blocked by|not allowed/i;

  function httpError(status, bodyText) {
    var t = String(bodyText || '').toLowerCase();
    var code =
      /expir/.test(t) ? 'expired' :
      /revok/.test(t) ? 'revoked' :
      /different product/.test(t) ? 'wrongproduct' :
      /bound|another device|different device|device mismatch|device limit/.test(t) ? 'bound' :
      /invalid|not found|unknown|no such|unauthor/.test(t) ? 'invalid' :
      status === 429 ? 'rate' :
      status >= 500 ? 'server' :
      (status === 401 || status === 403 || status === 404) ? 'invalid' : 'server';
    var e = new Error('HTTP ' + status); e.code = code; e.status = status; return e;
  }

  function connError(code, detail) {
    var e = new Error(code); e.code = code; e.detail = detail; return e;
  }
  function isConnErr(e) { return !!e && (e.code === 'network' || e.code === 'timeout' || e.code === 'filtered'); }

  // ----- Download providers -----------------------------------------------
  // Cloudflare -> Vercel -> Google Apps Script by default. The last one that
  // worked on this computer is tried first next time, so a network that
  // blocks Cloudflare doesn't wait on it for every request.
  var PROVIDERS = CONFIG.PROVIDERS.map(function (p) {
    return Object.assign({}, p, { base: String(p.base || '').replace(/\/+$/, '') });
  }).filter(function (p) { return p.base; });
  var DEFAULT_PROVIDER = PROVIDERS[0];
  var LICENSING_PROVIDER = PROVIDERS.filter(function (p) { return p.licensing; })[0] || DEFAULT_PROVIDER;
  function providerById(id) { return PROVIDERS.filter(function (p) { return p.id === id; })[0] || null; }

  // Saved per computer (localStorage 'providers'):
  //   preferred      id of the last provider that answered (none = new computer)
  //   failedAt       { id: time of its last connection/server failure }
  //   cooldownUntil  { id: skip until } after an Apps Script quota/rate limit
  //   postFirst      { id: true } when GETs are filtered here but POSTs work
  function providerState() {
    var st = lsGet('providers', null);
    if (!st || typeof st !== 'object') st = {};
    if (!st.failedAt || typeof st.failedAt !== 'object') st.failedAt = {};
    if (!st.cooldownUntil || typeof st.cooldownUntil !== 'object') st.cooldownUntil = {};
    if (!st.postFirst || typeof st.postFirst !== 'object') st.postFirst = {};
    if (st.preferred && !providerById(st.preferred)) st.preferred = null;
    return st;
  }
  function saveProviderState(st) { lsSet('providers', st); }
  try { localStorage.removeItem(LS + 'primaryDownUntil'); } catch (e) {} // replaced by 'providers'

  // Remembered provider first, then the rest in default order. While a backup
  // is remembered, the default (Cloudflare) still gets one try first at most
  // once per PREFERRED_RECHECK_MS, so the computer moves back when it can.
  function providerOrder() {
    var st = providerState();
    var pref = providerById(st.preferred) || DEFAULT_PROVIDER;
    var order = [pref].concat(PROVIDERS.filter(function (p) { return p !== pref; }));
    if (pref !== DEFAULT_PROVIDER && Date.now() - (st.failedAt[DEFAULT_PROVIDER.id] || 0) > CONFIG.PREFERRED_RECHECK_MS) {
      order = [DEFAULT_PROVIDER].concat(order.filter(function (p) { return p !== DEFAULT_PROVIDER; }));
    }
    return order;
  }

  // The URL for a REST-style path on a provider, or null if it can't serve it.
  // Apps Script has no path routing and only serves the catalog, free
  // downloads and the manager's own updates.
  function providerUrl(p, path) {
    if (p.type !== 'apps-script') return p.base + path;
    var bare = path.split('?')[0], m;
    if (bare === '/catalog') return p.base + '?action=catalog'; // no fresh=1: protects its quota (5-min cache there)
    if ((m = bare.match(/^\/plugins\/([^/?]+)\/download$/))) return p.base + '?action=download&id=' + m[1];
    if (bare === '/manager') return p.base + '?action=manager';
    return null;
  }

  // Apps Script answers HTTP 200 even for errors: JSON { error } from the
  // script, or an HTML page when Google refuses to run it (quota, too many
  // at once, execution time). Returns an Error to throw, or null if fine.
  function appsScriptError(text, looksHtml) {
    var head = String(text || '').slice(0, 5000), kind = null, j = null;
    if (/^\s*\{/.test(head)) { try { j = JSON.parse(text); } catch (e) {} }
    if (j && typeof j.error === 'string') kind = j.error;
    else if (looksHtml) {
      if (/too many simultaneous invocations/i.test(head)) kind = 'busy';
      else if (/service invoked too many times|quota|bandwidth|rate limit|too many requests/i.test(head)) kind = 'quota';
      else if (/exceeded maximum execution time/i.test(head)) kind = 'timeout';
    }
    if (!kind) return null;
    var e;
    if (kind === 'quota' || kind === 'busy') {
      e = new Error(kind === 'quota' ? 'Apps Script quota reached' : 'Apps Script busy (too many requests at once)');
      e.code = 'rate'; e.status = 429; e.providerLimit = kind;
      e.cooldownMs = kind === 'quota' ? CONFIG.APPS_SCRIPT_QUOTA_COOLDOWN_MS : CONFIG.APPS_SCRIPT_BUSY_COOLDOWN_MS;
    } else if (kind === 'timeout') {
      e = connError('timeout', { appsScript: 'execution time exceeded' });
    } else if (kind === 'not_found' || kind === 'license_required') {
      e = new Error('Apps Script: ' + kind); e.code = 'invalid'; e.status = 404; // GET 404 -> next provider
    } else {
      e = new Error('Apps Script: ' + kind); e.code = 'server'; e.status = 502;
    }
    e.appsScriptError = kind;
    return e;
  }

  // Apps Script limits simultaneous runs, so its requests go one at a time.
  var appsScriptQueue = Promise.resolve(), appsScriptPending = 0;
  function appsScriptSerial(fn, info) {
    if (appsScriptPending) log('info', 'provider.queued', Object.assign({ provider: 'apps-script', ahead: appsScriptPending }, info));
    appsScriptPending++;
    var run = appsScriptQueue.then(fn, fn);
    var settle = function () { appsScriptPending--; };
    appsScriptQueue = run.then(settle, settle);
    return run;
  }

  // One fetch to one provider, with detailed logging of what came back.
  function fetchOnce(provider, path, opts, note) {
    var url = providerUrl(provider, path), method = opts.method || 'GET', t0 = Date.now(), timedOut = false;
    var ctl = new AbortController();
    var timer = setTimeout(function () { timedOut = true; ctl.abort(); }, CONFIG.TIMEOUT_MS);
    var reqCt = opts.headers && opts.headers['Content-Type'];
    log('info', 'request.start', { provider: provider.id, method: method, url: url, contentType: reqCt, note: note });
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal, cache: 'no-store' })).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(timer);
        var ct = res.headers.get('Content-Type') || '';
        var info = {
          provider: provider.id, method: method, url: url, status: res.status, ms: Date.now() - t0, type: res.type,
          contentType: ct, chars: text.length,
        };
        if (res.redirected) { info.redirected = true; info.finalUrl = redactUrl(res.url); }
        // The servers only ever return JSON or JavaScript. An HTML page means
        // something between us and them (usually a web filter) answered,
        // or, for Apps Script, Google refusing to run the script.
        var looksHtml = /text\/html/i.test(ct) || /^\s*<(!doctype|html|head|body)/i.test(text);
        if (looksHtml || !res.ok) info.bodySnippet = text.slice(0, looksHtml ? 300 : 500);
        if (provider.type === 'apps-script') {
          var ge = appsScriptError(text, looksHtml);
          if (ge) {
            info.appsScriptError = ge.appsScriptError;
            if (!info.bodySnippet) info.bodySnippet = text.slice(0, 200);
            log(ge.providerLimit ? 'warn' : 'error', ge.providerLimit ? 'provider.rateLimited' : 'request.appsScriptError', info);
            ge.detail = info; throw ge;
          }
        }
        if (looksHtml) {
          var m = text.match(BLOCK_RE);
          info.filterHint = m ? m[0] : null;
          info.filterLogin = isLoginRedirect(res);
          log('error', 'request.blockPage', info);
          throw connError('filtered', info);
        }
        if (!res.ok) {
          log('error', 'request.httpError', info);
          var he = httpError(res.status, text); he.detail = info; throw he;
        }
        log('info', 'request.ok', info);
        return { res: res, text: text };
      }, function (err) {
        clearTimeout(timer);
        var d = { provider: provider.id, method: method, url: url, status: res.status, ms: Date.now() - t0, stage: 'reading body', errName: err && err.name, errMessage: err && err.message, timedOut: timedOut };
        log('error', timedOut ? 'request.timeout' : 'request.failed', d);
        throw connError(timedOut ? 'timeout' : 'network', d);
      });
    }, function (err) {
      clearTimeout(timer);
      // fetch() rejecting means DNS failure, connection refused/reset, TLS
      // failure (e.g. school SSL inspection), a CORS rejection, or a timeout.
      var d = {
        provider: provider.id, method: method, url: url, ms: Date.now() - t0, stage: 'connecting',
        errName: err && err.name, errMessage: err && err.message, timedOut: timedOut, online: navigator.onLine,
      };
      log('error', timedOut ? 'request.timeout' : 'request.failed', d);
      throw connError(timedOut ? 'timeout' : 'network', d);
    });
  }
  function fetchVia(provider, path, opts, note) {
    if (provider.type !== 'apps-script') return fetchOnce(provider, path, opts, note);
    return appsScriptSerial(function () { return fetchOnce(provider, path, opts, note); }, { path: path });
  }

  // JSON POSTs make the browser send a CORS "preflight" OPTIONS request first,
  // which some school proxies block. text/plain is a "simple" request with no
  // preflight; Workers' request.json() parses the body either way.
  function simpleVariant(opts) {
    var h = opts.headers || {};
    if (!opts.method || opts.method === 'GET' || !/json/i.test(h['Content-Type'] || '')) return null;
    return Object.assign({}, opts, { headers: Object.assign({}, h, { 'Content-Type': 'text/plain;charset=UTF-8' }) });
  }

  // Tries each provider in turn. Per provider: the request, then one quick
  // retry for a plain network failure, then (for JSON POSTs) a no-preflight
  // retry. Worth trying the next provider for: no connection, a filter page,
  // a server error, a rate/quota limit, or (for GETs) a provider that doesn't
  // know this plugin. Each provider is tried at most once per request.
  function shouldTryNextServer(e, opts) {
    if (isConnErr(e)) return true;
    if (e && (e.status >= 500 || e.providerLimit)) return true;
    return !!e && e.status === 404 && (!opts.method || opts.method === 'GET');
  }

  // opts.primaryOnly: licensing calls, which only the licensing provider
  // (Cloudflare) can answer.
  function request(path, opts) {
    opts = opts || {};
    var licensing = !!opts.primaryOnly;
    var fetchOpts = Object.assign({}, opts); delete fetchOpts.primaryOnly;
    opts = fetchOpts;

    var st = providerState(), now = Date.now();
    var order = licensing ? [LICENSING_PROVIDER] : providerOrder();
    if (!licensing && st.preferred && order[0].id !== st.preferred) {
      log('info', 'provider.recheck', { provider: order[0].id, preferred: st.preferred, path: path, note: 'trying the default provider again (at most once a day)' });
    }
    var candidates = order.filter(function (p) {
      if (!providerUrl(p, path)) return false; // e.g. Apps Script can't do licensing
      if (p.type === 'apps-script' && opts.method && opts.method !== 'GET') return false;
      var until = st.cooldownUntil[p.id] || 0;
      if (until > now) {
        log('info', 'provider.skipped', { provider: p.id, path: path, reason: 'rate/quota limit cooldown', until: new Date(until).toISOString() });
        return false;
      }
      return true;
    });
    var i = 0, lastErr = null, tried = [];

    function succeeded(p) {
      return function (r) {
        var s = providerState(), prev = s.preferred || null;
        delete s.failedAt[p.id]; delete s.cooldownUntil[p.id];
        if (prev !== p.id) {
          s.preferred = p.id;
          log('info', 'provider.preferenceChanged', { from: prev || '(none yet, new computer)', to: p.id, path: path });
        }
        saveProviderState(s);
        log('info', 'provider.succeeded', { provider: p.id, path: path, tried: tried.slice(), fallbackUsed: tried.length > 1 });
        r.provider = p.id;
        return r;
      };
    }
    function noteFailure(p, e) {
      var s = providerState();
      if (isConnErr(e) || (e && (e.status >= 500 || e.providerLimit))) s.failedAt[p.id] = Date.now();
      if (e && e.cooldownMs) {
        s.cooldownUntil[p.id] = Date.now() + e.cooldownMs;
        log('warn', 'provider.cooldown', { provider: p.id, reason: e.providerLimit, minutes: Math.round(e.cooldownMs / 60000) });
      }
      saveProviderState(s);
    }

    // Filters such as Securly redirect GETs from CardMirror to their sign-in
    // page but let POSTs through. Providers with postFallback answer the same
    // paths over POST; once that works here, POST goes first next time.
    var isGet = !opts.method || opts.method === 'GET';
    function postVariant() {
      return Object.assign({}, opts, {
        method: 'POST', body: '{}',
        headers: Object.assign({}, opts.headers, { 'Content-Type': 'text/plain;charset=UTF-8' }), // no CORS preflight
      });
    }
    function setPostFirst(p, on) {
      var s = providerState();
      if (!!s.postFirst[p.id] === on) return;
      if (on) s.postFirst[p.id] = true; else delete s.postFirst[p.id];
      saveProviderState(s);
      log('info', 'provider.postMode', { provider: p.id, postFirst: on });
    }
    function tryProvider(p) {
      var canPost = isGet && !!p.postFallback;
      var viaPost = function (note) {
        return fetchVia(p, path, postVariant(), note).then(function (r) { setPostFirst(p, true); return r; }).then(succeeded(p));
      };
      if (canPost && providerState().postFirst[p.id]) {
        return viaPost('POST first (GET is filtered on this network)').catch(function (e) {
          lastErr = e;
          // POST not supported (old server) or not getting through: back to GET.
          if (!(e && (e.status === 404 || e.status === 405 || isConnErr(e)))) throw e;
          setPostFirst(p, false);
          return getAttempt(p);
        });
      }
      var a = getAttempt(p);
      if (canPost) {
        a = a.catch(function (e) {
          lastErr = e;
          if (!e || e.code !== 'filtered') throw e;
          log('info', 'provider.postRetry', { provider: p.id, path: path, reason: 'GET was redirected by a filter' });
          return viaPost('retry as POST (GET was filtered)');
        });
      }
      return a;
    }
    function getAttempt(p) {
      var attempt = fetchVia(p, path, opts).then(succeeded(p));
      attempt = attempt.catch(function (e) {
        lastErr = e;
        if (!e || e.code !== 'network') throw e;
        return delay(700).then(function () { return fetchVia(p, path, opts, 'retry'); }).then(succeeded(p));
      });
      var simple = simpleVariant(opts);
      if (simple) {
        attempt = attempt.catch(function (e) {
          lastErr = e;
          if (!isConnErr(e)) throw e;
          return fetchVia(p, path, simple, 'retry without CORS preflight').then(succeeded(p));
        });
      }
      return attempt;
    }

    function next() {
      if (i >= candidates.length) {
        log('error', 'provider.allFailed', { path: path, tried: tried, last: errInfo(lastErr) });
        return Promise.reject(lastErr || connError('network', { path: path, reason: 'no provider available' }));
      }
      var p = candidates[i++];
      tried.push(p.id);
      log('info', 'provider.attempt', { provider: p.id, path: path, position: i + ' of ' + candidates.length });
      return tryProvider(p).catch(function (e) {
        lastErr = e;
        var hop = shouldTryNextServer(e, opts);
        noteFailure(p, e);
        var nextP = hop ? candidates[i] : null;
        log('warn', 'provider.failed', {
          provider: p.id, path: path, code: e && e.code, status: e && e.status, message: e && e.message,
          appsScriptError: e && e.appsScriptError, fallbackTo: nextP ? nextP.id : null,
        });
        if (!hop) throw e; // a real answer (bad key, revoked, ...): don't hop providers
        if (nextP) log('info', 'provider.fallback', { from: p.id, to: nextP.id, path: path });
        return next();
      });
    }
    return next();
  }

  function validateBundle(code) {
    var bad = function (msg) {
      log('error', 'bundle.invalid', { reason: msg, chars: typeof code === 'string' ? code.length : typeof code, start: String(code || '').slice(0, 200) });
      return Object.assign(new Error(msg), { code: 'server' });
    };
    if (typeof code !== 'string' || !code.trim()) throw bad('Empty download.');
    if (code.length > CONFIG.MAX_BUNDLE_BYTES) throw bad('Plugin file is too large.');
    if (code.indexOf('__registerCardMirrorPlugin') < 0) throw bad('Download is not a CardMirror plugin.');
    return code;
  }

  // Tile visuals a plugin may supply from the Worker catalog (accent: [c1, c2],
  // iconColor, icon). Validated so a bad catalog entry can't inject markup.
  var COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
  function remoteVisuals(r) {
    var v = {};
    if (Array.isArray(r.accent) && r.accent.length === 2 && COLOR_RE.test(String(r.accent[0])) && COLOR_RE.test(String(r.accent[1]))) {
      v.accent = [String(r.accent[0]), String(r.accent[1])];
    }
    if (r.iconColor && COLOR_RE.test(String(r.iconColor))) v.iconColor = String(r.iconColor);
    if (r.icon && Object.prototype.hasOwnProperty.call(ICONS, String(r.icon))) v.icon = String(r.icon);
    return v;
  }

  function cleanCatalog(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) {
      return r && ID_RE.test(String(r.id)) && r.name && (r.tier === 'free' || r.tier === 'premium') && r.version;
    }).map(function (r) {
      var local = LOCAL_CATALOG.filter(function (p) { return p.id === r.id; })[0] || {};
      var remote = remoteVisuals(r);
      return {
        id: r.id, name: String(r.name), description: String(r.description || local.description || ''),
        tier: r.tier, version: String(r.version), author: String(r.author || local.author || ''),
        // Local visuals win when this file has them; otherwise the Worker's
        // validated colors/icon are used, so new plugins look right with no
        // edit here. Remote image URLs are never used (not trusted/guaranteed).
        accent: local.accent || remote.accent, iconColor: local.iconColor || remote.iconColor,
        icon: local.icon || remote.icon, image: local.image, openCommand: local.openCommand,
      };
    });
  }

  var backend = {
    // -> { list, offline }
    getCatalog: function (fresh) {
      return request(fresh ? '/catalog?fresh=1&t=' + Date.now() : '/catalog').then(function (r) {
        var j = null;
        try { j = JSON.parse(r.text); } catch (e) { throw Object.assign(new Error('Catalog was not valid JSON'), { code: 'server' }); }
        var list = cleanCatalog((j || {}).plugins);
        if (!list.length) throw new Error('empty catalog');
        // Backups (Vercel, Apps Script) only list free plugins. Keep paid ones
        // from the last full catalog (or the built-in list) so they don't vanish.
        if (r.provider !== LICENSING_PROVIDER.id) {
          var have = {}; list.forEach(function (p) { have[p.id] = 1; });
          (lsGet('catalog', null) || LOCAL_CATALOG).forEach(function (p) {
            if (p && p.tier === 'premium' && !have[p.id]) list.push(p);
          });
        }
        lsSet('catalog', list);
        return { list: list, offline: false };
      }).catch(function (err) {
        var cached = lsGet('catalog', null);
        log('warn', 'catalog.failed', { error: errInfo(err), fallback: cached ? 'saved catalog' : 'built-in list' });
        return { list: cached || LOCAL_CATALOG, offline: true, error: err };
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
        license: key, licenseKey: key, license_key: key, key: key,
        productId: plugin.id, product_id: plugin.id, product: plugin.id,
        deviceId: deviceId, device_id: deviceId,
      });
    },
    activate: function (plugin, licenseKey, deviceId) {
      if (!licenseKey) return Promise.reject(Object.assign(new Error('Enter a license key.'), { code: 'invalid' }));
      return request('/activate', {
        primaryOnly: true,
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: backend._body(plugin, licenseKey, deviceId),
      });
    },
    // Link the store code to this device (also checks it's a valid code).
    linkCode: function (code, deviceId) {
      return backend.activate({ id: CONFIG.STORE_PASS_ID }, code, deviceId);
    },
    // Free the code from this device so it can be used on another computer.
    unlinkCode: function (code, deviceId) {
      return request('/deactivate', {
        primaryOnly: true,
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license: code, device_id: deviceId }),
      });
    },
    installPremium: function (plugin, deviceId, licenseKey) {
      return request('/download', {
        primaryOnly: true,
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

  // Plain fetch helpers for servers other than the plugin server.
  function fetchWithTimeout(url, opts, ms) {
    var ctl = new AbortController(), timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctl.abort(); }, ms);
    return fetch(url, Object.assign({ cache: 'no-store', signal: ctl.signal }, opts)).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(timer);
        if (/text\/html/i.test(res.headers.get('Content-Type') || '') && !/\.html?$/.test(url)) {
          var m = text.match(BLOCK_RE);
          throw connError('filtered', { url: url, status: res.status, filterHint: m ? m[0] : null, finalUrl: res.redirected ? redactUrl(res.url) : undefined });
        }
        return { res: res, text: text };
      });
    }, function (err) {
      clearTimeout(timer);
      throw connError(timedOut ? 'timeout' : 'network', { url: url, errName: err && err.name, errMessage: err && err.message });
    });
  }
  function fetchText(url, ms) {
    return fetchWithTimeout(url, {}, ms).then(function (r) {
      if (!r.res.ok) throw Object.assign(new Error('HTTP ' + r.res.status), { code: 'server', status: r.res.status });
      return r.text;
    });
  }
  // text/plain body = no CORS preflight; the Worker parses it as JSON.
  function postJson(url, body) {
    return fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) }, 15000)
      .then(function (r) {
        var j = null; try { j = JSON.parse(r.text); } catch (e) {}
        if (!r.res.ok) throw Object.assign(new Error('HTTP ' + r.res.status), { code: 'server', status: r.res.status, serverMessage: j && j.error });
        return j || {};
      });
  }

  // ---------------------------------------------------------------------------
  // Background jobs, run once a few seconds after CardMirror starts
  // ---------------------------------------------------------------------------
  function bgDeviceId() {
    var id = lsGet('deviceId', null);
    if (!id) { id = uuid(); lsSet('deviceId', id); }
    return id;
  }

  // Anonymous check-in so the admin dashboard can count users.
  function usagePing() {
    if (!CONFIG.USAGE_PING || !CONFIG.ADMIN_API) return Promise.resolve();
    if (Date.now() - lsGet('lastPing', 0) < CONFIG.PING_EVERY_MS) return Promise.resolve();
    var inst = lsGet('installed', {});
    return postJson(CONFIG.ADMIN_API + '/api/public/ping', {
      deviceId: bgDeviceId(), managerVersion: PM_VERSION, platform: navigator.platform,
      plugins: Object.keys(inst).map(function (id) { return { id: id, version: inst[id].version }; }),
    }).then(function () {
      lsSet('lastPing', Date.now()); log('info', 'usage.ping.ok');
    }, function (e) { log('warn', 'usage.ping.failed', errInfo(e)); });
  }

  // Download newer versions of installed plugins. Each plugin already ran
  // this session, so the new code takes effect on the next launch.
  // Settings -> Auto Updates (on by default). Covers installed plugins; the
  // Plugin Manager itself always keeps itself up to date.
  function autoUpdatesOn() { return lsGet('autoUpdates', true) !== false; }

  // An installed plugin needs updating when its version differs from the
  // live catalog's. "Differs", not just "older": plugins installed while the
  // catalog couldn't load were recorded with a placeholder 1.0.0, which is
  // higher than the real versions and would otherwise never update.
  function needsUpdate(catalogVersion, rec) {
    return !!rec && !!catalogVersion && cmpVer(catalogVersion, rec.version) !== 0;
  }

  // Shared with an open panel so the two never update the same plugin at
  // once, and the panel redraws when the background job finishes one.
  var bgUpdating = {};
  var onBgUpdate = null;
  function notifyBg() { if (onBgUpdate) { try { onBgUpdate(); } catch (e) {} } }

  function autoUpdatePlugins() {
    if (!autoUpdatesOn()) { log('info', 'autoUpdate.off', { reason: 'Auto Updates is turned off in Settings' }); return Promise.resolve(); }
    var inst = lsGet('installed', {}), ids = Object.keys(inst);
    if (!ids.length) return Promise.resolve();
    return backend.getCatalog(true).then(function (c) {
      if (c.offline) { log('warn', 'autoUpdate.skipped', { reason: 'catalog unavailable' }); return; }
      var due = c.list.filter(function (p) { return needsUpdate(p.version, inst[p.id]); });
      log('info', 'autoUpdate.check', { installed: ids.length, due: due.map(function (p) { return p.id + '@' + p.version; }) });
      return due.reduce(function (chain, p) {
        return chain.then(function () {
          if (bgUpdating[p.id] === 'panel') return; // the open panel is already updating it
          bgUpdating[p.id] = 'bg'; notifyBg();
          var key = lsGet('storeKey', null) || lsGet('licenses', {})[p.id];
          var run = p.tier !== 'premium' ? backend.installFree(p)
            : key ? backend.installPremium(p, bgDeviceId(), key)
            : Promise.reject(Object.assign(new Error('No saved license'), { code: 'invalid' }));
          return run.then(function (r) {
            var bundles = lsGet('bundles', {});
            bundles[p.id] = { code: r.code, version: r.version };
            if (!lsSet('bundles', bundles)) throw Object.assign(new Error('Not enough local storage.'), { code: 'storage' });
            var m = lsGet('installed', {});
            m[p.id] = Object.assign({}, m[p.id], { version: r.version, updatedAt: Date.now(), needsRestart: !!loadedThisSession[p.id], autoUpdated: true });
            lsSet('installed', m);
            log('info', 'autoUpdate.ok', { id: p.id, version: r.version });
          }).catch(function (e) {
            log('warn', 'autoUpdate.failed', { id: p.id, error: errInfo(e) });
            if (p.tier === 'premium' && /^(expired|revoked|invalid|wrongproduct|bound)$/.test(e.code || '')) {
              var m = lsGet('installed', {});
              if (m[p.id]) { m[p.id].license = Object.assign({}, m[p.id].license, { status: e.code }); lsSet('installed', m); }
            }
          }).then(function () { delete bgUpdating[p.id]; notifyBg(); });
        });
      }, Promise.resolve());
    });
  }

  // Download a newer Plugin Manager (GitHub releases; Apps Script as a
  // fallback for networks that block GitHub). It's saved locally and started
  // by the check at the top of this file on the next launch, with no prompt.
  // Plugin data and settings live in their own keys and are left untouched.
  var selfSources = [
    {
      id: 'github',
      latest: function () {
        return fetchText(CONFIG.SELF_UPDATE.manifest + '?t=' + Date.now(), 15000).then(function (t) { return (JSON.parse(t) || {}).version; });
      },
      code: function (v) { return fetchText(CONFIG.SELF_UPDATE.code.replace('{version}', v), 20000); },
    },
    {
      id: 'apps-script',
      latest: function () {
        return selfViaAppsScript('/manager').then(function (r) { return (JSON.parse(r.text) || {}).version; });
      },
      code: function () { return selfViaAppsScript('/plugins/plugin-manager/download').then(function (r) { return r.text; }); },
    },
  ];
  function selfViaAppsScript(path) {
    var p = PROVIDERS.filter(function (x) { return x.type === 'apps-script'; })[0];
    if (!p) return Promise.reject(new Error('No Apps Script provider configured'));
    var until = providerState().cooldownUntil[p.id] || 0;
    if (until > Date.now()) return Promise.reject(Object.assign(new Error('Apps Script cooling down after a quota limit'), { code: 'rate' }));
    return fetchVia(p, path, {}).catch(function (e) {
      if (e && e.cooldownMs) {
        var st = providerState(); st.cooldownUntil[p.id] = Date.now() + e.cooldownMs; saveProviderState(st);
      }
      throw e;
    });
  }

  // Preferred: update the manager the same way Settings -> Plugins -> "Check
  // for updates" does, through CardMirror's own installer. That replaces the
  // installed files, so Settings shows the new version and nothing else is
  // needed. Resolves true when the installed copy is now current (updated, or
  // already up to date); false when it can't be used (e.g. the manager was
  // loaded from a file, not installed from GitHub) so the copy-in-storage
  // path below runs instead.
  var INSTALLER_REPO_RE = /(^|\/)cardmirror-plugin-installer$/i;
  function hostSelfUpdate() {
    var api = window.electronAPI;
    if (!api || typeof api.pluginList !== 'function' || typeof api.pluginCheckUpdate !== 'function' ||
        typeof api.pluginInstallInspect !== 'function' || typeof api.pluginInstallCommit !== 'function') {
      log('info', 'selfUpdate.host.unavailable', { reason: 'CardMirror plugin installer API not present' });
      return Promise.resolve(false);
    }
    return Promise.resolve(api.pluginList()).then(function (list) {
      var me = (Array.isArray(list) ? list : []).filter(function (p) {
        return p && (INSTALLER_REPO_RE.test(String(p.repo || '')) || p.id === 'plugin-installer');
      })[0];
      if (!me || !me.repo) {
        log('info', 'selfUpdate.host.notInstalled', { reason: me ? 'installed without a GitHub repo' : 'not in CardMirror\u2019s plugin list' });
        return false;
      }
      return Promise.resolve(api.pluginCheckUpdate(me.id, me.repo)).then(function (res) {
        if (!res || !res.ok) {
          log('warn', 'selfUpdate.host.checkFailed', { installed: me.version, error: res && res.error });
          return false;
        }
        if (!res.hasUpdate) {
          log('info', 'selfUpdate.host.current', { installed: res.current, latest: res.latest, running: PM_VERSION });
          return true;
        }
        if (res.latest === lsGet('selfBad', null)) {
          log('warn', 'selfUpdate.skipped', { version: res.latest, reason: 'this version failed to start before; waiting for a newer one' });
          return true;
        }
        log('info', 'selfUpdate.host.downloading', { from: res.current, to: res.latest });
        return Promise.resolve(api.pluginInstallInspect(me.repo)).then(function (ins) {
          if (!ins || !ins.ok) throw new Error((ins && ins.error) || 'inspect failed');
          if (ins.plugin && ins.plugin.id && ins.plugin.id !== me.id) {
            if (typeof api.pluginInstallDiscard === 'function') api.pluginInstallDiscard(ins.pending);
            throw new Error('release id ' + ins.plugin.id + ' does not match installed id ' + me.id);
          }
          return api.pluginInstallCommit(ins.pending);
        }).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || 'install failed');
          log('info', 'selfUpdate.host.installed', { from: res.current, to: res.latest, note: 'runs on next launch; Settings now shows the new version' });
          // The installed files are now the newest; a copy kept in storage
          // from the older update path isn't needed any more.
          var saved = lsGet('self', null);
          if (saved && cmpVer(saved.version, res.latest) <= 0) { try { localStorage.removeItem(SELF_KEY); } catch (e) {} }
          return true;
        }).catch(function (e) {
          log('warn', 'selfUpdate.host.failed', { from: res.current, to: res.latest, error: errInfo(e) });
          return false;
        });
      });
    }).catch(function (e) {
      log('warn', 'selfUpdate.host.failed', errInfo(e));
      return false;
    });
  }

  function selfUpdateCheck() {
    return hostSelfUpdate().then(function (done) {
      return done ? undefined : storageSelfUpdate();
    }, storageSelfUpdate);
  }

  function storageSelfUpdate() {
    if (!CONFIG.SELF_UPDATE || !CONFIG.SELF_UPDATE.manifest) return Promise.resolve();
    var bad = lsGet('selfBad', null);
    var i = 0;
    function trySource() {
      if (i >= selfSources.length) { log('warn', 'selfUpdate.failed', { reason: 'no update source reachable' }); return Promise.resolve(); }
      var src = selfSources[i++];
      log('info', 'selfUpdate.check', { source: src.id, running: PM_VERSION });
      return src.latest().then(function (latest) {
        var v = String(latest || '');
        if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('Bad version in manifest: ' + v);
        if (cmpVer(v, PM_VERSION) <= 0) { log('info', 'selfUpdate.current', { source: src.id, running: PM_VERSION, latest: v }); return; }
        if (v === bad) { log('warn', 'selfUpdate.skipped', { version: v, reason: 'this version failed to start before; waiting for a newer one' }); return; }
        var saved = lsGet('self', null);
        if (saved && saved.version === v) { log('info', 'selfUpdate.pending', { version: v, note: 'applies on next launch' }); return; }
        log('info', 'selfUpdate.downloading', { source: src.id, from: PM_VERSION, to: v });
        return src.code(v).then(function (code) {
          code = String(code || '');
          if (code.length > CONFIG.MAX_BUNDLE_BYTES) throw new Error('Downloaded manager is too large.');
          if (code.indexOf('__registerCardMirrorPlugin') < 0 || code.indexOf("PM_VERSION = '" + v + "'") < 0) {
            throw new Error('Downloaded manager failed checks (wrong file or version).');
          }
          try { new Function(code); } catch (e) { throw new Error('Downloaded manager has a syntax error: ' + e.message); } // compile only
          if (!lsSet('self', { version: v, code: code, savedAt: Date.now(), source: src.id, boots: 0 })) throw new Error('Not enough local storage.');
          log('info', 'selfUpdate.saved', { source: src.id, from: PM_VERSION, to: v, chars: code.length, note: 'applies on next launch' });
        });
      }).catch(function (e) {
        log('warn', 'selfUpdate.sourceFailed', { source: src.id, error: errInfo(e), next: selfSources[i] ? selfSources[i].id : null });
        return trySource();
      });
    }
    return trySource().catch(function (e) { log('warn', 'selfUpdate.crashed', errInfo(e)); });
  }

  // Runs in the newer copy once it has registered: it started fine, so reset
  // the failed-start counter checked at the top of the file.
  function confirmSelfBoot() {
    var sb = window.__cmPluginManagerSelfBoot;
    if (!sb || sb.failed || sb.to !== PM_VERSION) return;
    var copy = lsGet('self', null);
    if (copy && copy.version === PM_VERSION && copy.boots) { copy.boots = 0; lsSet('self', copy); }
    log('info', 'selfUpdate.running', { from: sb.from, to: PM_VERSION });
  }

  function runBackgroundJobs() {
    if (window.__cmPluginManagerBgStarted) return;
    window.__cmPluginManagerBgStarted = true;
    // The manager checks for its own update right away on every launch; plugin
    // updates wait a few seconds so startup isn't slowed. Nothing here can
    // stop CardMirror from starting: every job catches its own errors.
    setTimeout(function () {
      try { selfUpdateCheck(); } catch (e) { log('warn', 'selfUpdate.crashed', errInfo(e)); }
    }, 1500);
    setTimeout(function () {
      try {
        usagePing();
        autoUpdatePlugins().catch(function (e) { log('warn', 'autoUpdate.crashed', errInfo(e)); });
      } catch (e) { log('warn', 'autoUpdate.crashed', errInfo(e)); }
    }, CONFIG.AUTO_UPDATE_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  var ICONS = {
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/>',
    file: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4zM14 3v4h4"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
    pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 4H7l3-4-1-6z"/>',
    // Three rows of a circle + a thick rounded line; the top circle is checked.
    checklist: '<circle cx="4" cy="4.5" r="2.7" stroke-width="1.6"/><path d="m2.7 4.6.85.85 1.75-1.75" stroke-width="1.4"/>' +
      '<circle cx="4" cy="12" r="2.7" stroke-width="1.6"/><circle cx="4" cy="19.5" r="2.7" stroke-width="1.6"/>' +
      '<path d="M9.8 4.5h12M9.8 12h12M9.8 19.5h12" stroke-width="2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    // Opening and closing quotation marks.
    quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>' +
      '<path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
    // Three horizontal sliders stacked, each with its knob in a different spot.
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    gavel: '<path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/>',
    gauge: '<path d="M5.64 20.36A9 9 0 1 1 20.65 11.52" stroke-width="2.8"/><path d="M20.65 11.52A9 9 0 0 1 18.36 20.36" stroke-width="2.8" opacity=".35"/><path d="M12 14l6.6-1.9" stroke-width="1.8"/><circle cx="12" cy="14" r="2.1" fill="currentColor" stroke="none"/>',
    brush: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
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
    // Colors come from CardMirror's own theme variables (--pmd-c-*), so the
    // panel matches the editor: its light/dark mode and any Themes-plugin
    // theme. The values after each comma are CardMirror's defaults, used only
    // if a variable is missing.
    '.scrim{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
    '  background:var(--pmd-c-overlay,rgba(0,0,0,.4));backdrop-filter:blur(3px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  --bg:var(--pmd-c-bg,#fff);--bg2:var(--pmd-c-bg-soft,#f7f7f8);--bg3:var(--pmd-c-hover,#ebebeb);',
    '  --fg:var(--pmd-c-text,#222);--muted:var(--pmd-c-text-muted,#666);--line:var(--pmd-c-divider,#e0e0e0);',
    '  --brand:var(--pmd-c-accent,#2563eb);--brand-fg:var(--pmd-c-text-on-accent,#fff);',
    '  --ok:var(--pmd-c-success,#16a34a);--warn:var(--pmd-c-warning,#b45309);--bad:var(--pmd-c-error,#b00020);',
    '  --okbg:color-mix(in srgb,var(--ok) 14%,var(--bg));--warnbg:color-mix(in srgb,var(--warn) 14%,var(--bg));--badbg:color-mix(in srgb,var(--bad) 13%,var(--bg));',
    '  --shadow:0 24px 70px rgba(0,0,0,.35)}',
    '.win{width:min(860px,94vw);height:min(640px,90vh);background:var(--bg);color:var(--fg);border:1px solid var(--line);',
    '  border-radius:16px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}',
    '.win.enter{animation:pop .16s ease-out}',
    // No text highlighting in the panel; typing fields still select normally.
    '.scrim{-webkit-user-select:none;user-select:none}',
    'input,textarea,select{-webkit-user-select:text;user-select:text}',
    '@keyframes pop{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}',
    'header{display:flex;align-items:center;gap:12px;padding:16px 20px 0}',
    '.logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#3f3f46,#71717a)}',
    'h1{font-size:24px;margin:0;font-weight:700;letter-spacing:-.02em}',
    'h1 .ver{margin-left:8px;font-size:12px;font-weight:500;letter-spacing:0;color:var(--muted);vertical-align:middle}',
    '.sub{font-size:12.5px;color:var(--muted);margin-top:2px}',
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
    '.openable{cursor:pointer}',
    '.item.openable:hover{border-color:color-mix(in srgb,var(--brand) 35%,var(--line))}',
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
    '.fbchk{display:flex;gap:9px;align-items:flex-start;margin-top:14px;font-size:12.5px;line-height:1.45;cursor:pointer}',
    '.fbchk input{margin:2px 0 0;accent-color:var(--brand);flex:none}',
    '.fbchk .muted{color:var(--muted)}',
    '.input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);font:inherit;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;outline:0}',
    '.input:focus{border-color:var(--brand)}',
    '.err{margin-top:10px;padding:9px 12px;border-radius:9px;background:var(--badbg);color:var(--bad);font-size:12.5px;display:flex;gap:7px;align-items:center}',
    '.mfoot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
    '.hint{font-size:11.5px;color:var(--muted);margin-top:8px}',
    '.hint a,footer a{color:inherit;text-decoration:underline}',
    '.hint a:hover,footer a:hover{color:var(--fg)}',
    'footer{flex:none;padding:10px 20px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);display:grid;grid-template-columns:1fr auto 1fr;align-items:center}',
    'footer .mid{text-align:center}',
    '.tog{justify-self:end;display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:11px}',
    '.tog:hover{color:var(--fg)}',
    '.sw{width:28px;height:16px;border-radius:99px;background:var(--bg3);border:1px solid var(--line);position:relative;transition:background .15s}',
    '.sw::after{content:"";position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--muted);transition:transform .15s,background .15s}',
    '.tog.on .sw{background:var(--fg)}',
    '.tog.on .sw::after{transform:translateX(12px);background:var(--bg)}',
    '.linkbtn{justify-self:start;font-size:11px;color:var(--muted);text-decoration:underline}',
    '.linkbtn:hover{color:var(--fg)}',
    '.modal.wide{width:min(720px,94%)}',
    '.toast.bad svg{color:#f87171}',
    '.gate{max-width:420px;margin:28px auto 0;text-align:center}',
    '.gate .big{width:56px;height:56px;border-radius:16px;background:var(--bg2);display:grid;place-items:center;margin:0 auto 14px}',
    '.gate h2{margin:0 0 6px;font-size:18px}',
    '.gate p{margin:0 0 18px;font-size:13px;color:var(--muted);line-height:1.5}',
    '.gate .input{text-align:center;font-size:16px}',
    '.gate .wide{width:100%;justify-content:center;margin-top:12px;padding:10px 13px}',
    '.gate .err{text-align:left}',
    '.set{max-width:600px}',
    '.set-sec{border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px}',
    '.set-sec h3{margin:0 0 4px;font-size:14px}',
    '.set-sec p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}',
    '.set-sec.danger h3{color:var(--bad)}',
    '.set-row{display:flex;align-items:center;justify-content:space-between;gap:18px}',
    '.tog.big{flex:none;cursor:pointer}',
    '.tog.big .sw{width:40px;height:22px}',
    '.tog.big .sw::after{top:2px;left:2px;width:16px;height:16px}',
    '.tog.big.on .sw{background:var(--brand);border-color:var(--brand)}',
    '.tog.big.on .sw::after{transform:translateX(18px);background:var(--brand-fg)}',
    '.codebox{display:flex;gap:8px;align-items:center;margin-top:12px}',
    '.codebox code{flex:1;font-size:15px;letter-spacing:.08em;padding:9px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;word-break:normal}',
    '.warnbox{margin-top:12px;padding:12px 14px;border-radius:10px;background:var(--badbg);color:var(--bad);font-size:12.5px;line-height:1.5}',
    '.set-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}',
    '.btn.danger.solid{background:var(--bad);color:#fff;border-color:transparent}',
    '.input.plain{font-family:inherit;letter-spacing:normal;font-size:13px}',
    'textarea.input{resize:vertical;min-height:96px;line-height:1.45}',
    '.steps{margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.6}',
    '.steps li{margin-bottom:8px}',
    '.steps .btn{margin:4px 6px 0 0;padding:4px 10px;font-size:12px;text-decoration:none;color:var(--fg)}',
    'code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}',
    '.toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:9px 16px;border-radius:10px;font-size:13px;box-shadow:var(--shadow);z-index:9;display:flex;gap:8px;align-items:center}',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Plugin logic
  // ---------------------------------------------------------------------------
  var host = null; // current open instance
  var closeOpenManager = null; // close() of the open panel, if any

  // When the user closes the CardMirror window, CardMirror asks the page to
  // confirm unsaved work (its Save / Don't Save box). Close the manager so it
  // isn't covering that box. CardMirror's own handler still runs as usual.
  function hookWindowClose() {
    if (window.__cmPluginManagerCloseHook) return;
    var eapi = window.electronAPI;
    if (!eapi || typeof eapi.onCloseRequest !== 'function') { log('info', 'closeHook.unavailable'); return; }
    try {
      eapi.onCloseRequest(function () {
        backupPluginData();
        if (closeOpenManager) { log('info', 'closeHook.closedManager'); closeOpenManager(); }
      });
      window.__cmPluginManagerCloseHook = true;
    } catch (e) { log('warn', 'closeHook.failed', errInfo(e)); }
  }

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

  // ---------------------------------------------------------------------------
  // Floating button (bottom-left). Can be turned off from the panel footer.
  // ---------------------------------------------------------------------------
  var fabHost = null, lastApi = null;
  function fabEnabled() { return lsGet('fab', true) !== false; }
  function stubApi() { return { storage: { get: function () {}, set: function () {} } }; }

  function removeFab() { if (fabHost) { fabHost.remove(); fabHost = null; } }
  function refreshFab() {
    // shown only when enabled and the panel is closed
    if (!fabEnabled() || host) { removeFab(); return; }
    if (fabHost || !document.body) return;
    fabHost = document.createElement('div');
    var r = fabHost.attachShadow({ mode: 'open' });
    r.innerHTML = '<style>' +
      ':host{all:initial}' +
      '.fab{-webkit-user-select:none;user-select:none;position:fixed;left:16px;bottom:16px;z-index:2147482000;display:flex;align-items:center;gap:8px;height:40px;padding:0 15px 0 12px;' +
      'border-radius:99px;border:1px solid var(--pmd-c-border,#c8c8c8);background:var(--pmd-c-bg,#fff);color:var(--pmd-c-text,#222);font:600 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2);transition:transform .12s,box-shadow .12s}' +
      '.fab:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.26)}' +
      '.fab:hover{background:var(--pmd-c-hover,#ebebeb)}' +
      '</style><button class="fab" aria-label="Open Plugin Manager" title="Open Plugin Manager">' + icon('store', 16) + 'Plugins</button>';
    r.querySelector('.fab').addEventListener('click', function () { openManager(lastApi || stubApi()); });
    document.body.appendChild(fabHost);
  }

  function openManager(api) {
    api = api || lastApi || stubApi();
    lastApi = api;
    removeFab(); // hidden while the panel is open
    if (host) { host.remove(); host = null; }

    var state = {
      view: 'browse', query: '',
      catalog: null, loadError: null,
      busy: {},            // id -> 'installing' | 'updating' | 'removing'
      checking: {},        // id -> true while an update check runs
      latest: {},          // id -> newest version found by a check
      checked: {},         // id -> 'ok' | 'error' after a check
      gate: { code: '', loading: false, error: null }, // code entry screen
      unlink: { confirm: false, busy: false, show: false }, // Settings
      browserDl: null,     // { plugin, reason, error, loading } browser-download fallback
      toast: null,
      autoFailed: {},      // id -> true: Auto Updates failed once this panel session (no retry loop)
    };
    log('info', 'panel.open', { version: PM_VERSION });

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
    function licenses() { return sget('licenses', {}); } // older per-plugin keys
    // One key for the whole store. Older per-plugin keys still work for
    // their own plugin.
    function storeKey() { return sget('storeKey', null); }
    function setStoreKey(k) { sset('storeKey', k); }
    // Accepts the code typed any way (lowercase, spaces, no dashes).
    function normalizeCode(v) {
      var raw = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return raw.length === 16 ? raw.match(/.{4}/g).join('-') : String(v || '').trim().toUpperCase();
    }
    function maskCode(k) { return String(k || '').replace(/[A-Z0-9](?=[A-Z0-9-]*-[A-Z0-9]{4}$)/g, '\u2022'); }
    var LICENSE_CODES = { invalid: 1, wrongproduct: 1, expired: 1, revoked: 1, bound: 1 };

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
      closeOpenManager = null;
      onBgUpdate = null;
      document.removeEventListener('keydown', onKey, true);
      if (host) host.remove();
      host = null;
      refreshFab();
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (state.feedback) { if (!state.feedback.sending) { state.feedback = null; render(); } }
        else if (state.browserDl) { if (!state.browserDl.loading) { state.browserDl = null; render(); } }
        else if (state.unlink.confirm && !state.unlink.busy) { state.unlink.confirm = false; render(); }
        else close();
      }
    }
    document.addEventListener('keydown', onKey, true);
    closeOpenManager = close;

    // bad = true shows an X instead of a check (for failures).
    function toast(msg, bad) {
      state.toast = msg; state.toastBad = !!bad; render();
      setTimeout(function () { if (state.toast === msg) { state.toast = null; render(); } }, 2600);
    }

    // ---- browser-download fallback ----
    // When CardMirror itself can't reach the server (e.g. a school filter wants
    // a browser sign-in), the user's web browser may still be let through. We
    // open the download link there, the user saves the file, and imports it.
    // Free plugins only: premium downloads need a POST with the license key.
    function downloadUrl(p) {
      var path = '/plugins/' + encodeURIComponent(p.id) + '/download';
      var prov = providerOrder().filter(function (x) { return providerUrl(x, path); })[0];
      return providerUrl(prov, path);
    }

    function openBrowserDl(p, e) {
      var reason = !e ? null
        : e.code === 'filtered' ? 'blocked by ' + ((e.detail && e.detail.filterHint) || 'a web filter')
        : e.code === 'timeout' ? 'it timed out' : 'no connection';
      log('info', 'browserDl.offer', { id: p.id, reason: reason });
      state.browserDl = { plugin: p, reason: reason, error: null, loading: false, fresh: true };
      render();
    }

    function copyText(text, okMsg) {
      var fail = function () { toast('Couldn’t copy — select the link and copy it manually', true); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fail);
      else fail();
    }

    function importFromFile(file) {
      var b = state.browserDl; if (!b || !file || b.loading) return;
      var p = b.plugin;
      log('info', 'import.start', { id: p.id, fileName: file.name, size: file.size, type: file.type });
      if (file.size > CONFIG.MAX_BUNDLE_BYTES) { b.error = 'That file is too large to be a plugin.'; render(); return; }
      b.loading = true; b.error = null; render();
      var read = file.text ? file.text() : new Promise(function (res, rej) {
        var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { rej(fr.error); }; fr.readAsText(file);
      });
      read.then(function (text) {
        var code;
        try { code = validateBundle(text); } catch (ve) {
          var looksHtml = /^\s*<(!doctype|html|head|body)/i.test(text);
          var m = looksHtml ? text.match(BLOCK_RE) : null;
          throw Object.assign(new Error(looksHtml
            ? 'That file is a web page' + (m ? ' from ' + m[0] : '') + ', not the plugin. The browser was probably blocked too.'
            : 'That file isn’t a CardMirror plugin. Make sure you saved the page that opened from the download link.'), { code: 'import' });
        }
        return applyInstall(p, { code: code, version: p.version }, { source: 'browser-import' });
      }).then(function (mode) {
        log('info', 'import.ok', { id: p.id, version: p.version, mode: mode });
        state.browserDl = null; delete state.latest[p.id]; state.checked[p.id] = 'ok';
        toast(p.name + (mode === 'restart' ? ' installed — restart CardMirror to activate' : ' installed')); render();
      }).catch(function (e) {
        log('error', 'import.failed', { id: p.id, error: errInfo(e) });
        if (state.browserDl) { state.browserDl.loading = false; state.browserDl.error = e.code === 'import' ? e.message : errorMessage(e); }
        render();
      });
    }

    function browserDlView() {
      var b = state.browserDl; if (!b) return '';
      var p = b.plugin, url = downloadUrl(p), dis = b.loading ? ' disabled' : '';
      return '<div class="modalscrim" data-act="bd-bg"><div class="modal' + (b.fresh ? ' enter' : '') + '">' +
        '<h2>Get ' + esc(p.name) + ' through your browser</h2>' +
        '<p>CardMirror couldn’t reach the plugin server' + (b.reason ? ' (' + esc(b.reason) + ')' : '') +
        '. Your web browser may still be allowed through, so you can download the plugin there and bring the file in here.</p>' +
        '<ol class="steps">' +
        '<li>Open the download in your browser:<br>' +
        '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-act="bd-open">' + icon('download', 13) + 'Open in browser</a>' +
        '<button class="btn" data-act="bd-copy">Copy link</button></li>' +
        '<li>When the code shows up, save it with <b>Ctrl+S</b> (<b>⌘S</b> on a Mac).</li>' +
        '<li>Choose that saved file below.</li></ol>' +
        '<div class="hint">If the browser shows a sign-in or “blocked” page instead of code, sign in to your school account there and try again. If it’s still blocked, the school has blocked this site for your account too; ask IT to allow <code>' + esc(hostOf(url)) + '</code>.</div>' +
        (b.error ? '<div class="err">' + icon('alert', 15) + esc(b.error) + '</div>' : '') +
        '<input type="file" id="bdfile" style="display:none">' +
        '<div class="mfoot"><button class="btn" data-act="bd-cancel"' + dis + '>Cancel</button>' +
        '<button class="btn primary" data-act="bd-pick"' + dis + '>' + (b.loading ? spinner() + 'Installing…' : icon('file', 14) + 'Choose file…') + '</button></div>' +
        '</div></div>';
    }

    // ---- actions ----
    function openPlugin(p) {
      if (!p || !p.openCommand) return;
      // Close first so the plugin's own window isn't hidden behind this one.
      if (commandRegistry[p.openCommand]) {
        close();
        runPluginCommand(p.openCommand, function (e) {
          var msg = p.name + ' couldn’t open: ' + ((e && e.message) || 'unknown error') + '. Try it from the command palette.';
          try { if (lastApi && typeof lastApi.showToast === 'function') lastApi.showToast(msg); else console.warn(msg); } catch (x) {}
        });
        return;
      }
      var rec = installed()[p.id] || {};
      toast(loadedThisSession[p.id] || rec.needsRestart
        ? p.name + ' isn\u2019t ready yet \u2014 restart CardMirror, then try again'
        : 'Couldn\u2019t open ' + p.name + ' \u2014 restart CardMirror, then try again', true);
    }

    // Plugins served behind the code: activate it for this plugin on this
    // device, then download with it.
    function premiumInstall(p, key) {
      var dev = deviceId();
      return backend.activate(p, key, dev).then(function () {
        log('info', 'license.activated', { id: p.id });
        return backend.installPremium(p, dev, key);
      }).then(function (r) { return applyInstall(p, r); });
    }

    function startInstall(p) {
      if (!storeKey()) { state.view = 'gate'; render(); return; }
      if (p.tier === 'premium') {
        state.busy[p.id] = 'installing'; render();
        log('info', 'install.start', { id: p.id, tier: 'premium', version: p.version });
        premiumInstall(p, storeKey()).then(function (mode) {
          log('info', 'install.ok', { id: p.id, mode: mode });
          delete state.busy[p.id]; toast(p.name + (mode === 'restart' ? ' installed \u2014 restart CardMirror to activate' : ' installed')); render();
        }).catch(function (e) {
          log('error', 'install.failed', { id: p.id, tier: 'premium', error: errInfo(e) });
          delete state.busy[p.id];
          toast('Install failed: ' + errorMessage(e) + (LICENSE_CODES[e.code] ? ' Check your code in Settings.' : ''), true); render();
        });
        return;
      }
      state.busy[p.id] = 'installing'; render();
      log('info', 'install.start', { id: p.id, tier: 'free', version: p.version });
      backend.installFree(p).then(function (r) { return applyInstall(p, r); }).then(function (mode) {
        log('info', 'install.ok', { id: p.id, mode: mode });
        delete state.busy[p.id]; toast(p.name + (mode === 'restart' ? ' installed \u2014 restart CardMirror to activate' : ' installed')); render();
      }).catch(function (e) {
        log('error', 'install.failed', { id: p.id, error: errInfo(e) });
        delete state.busy[p.id];
        if (isConnErr(e)) { openBrowserDl(p, e); return; }
        toast('Install failed: ' + errorMessage(e), true); render();
      });
    }

    // ---- the store code ----
    function submitCode() {
      var g = state.gate; if (g.loading) return;
      var input = root.querySelector('#code');
      var code = normalizeCode(input ? input.value : g.code);
      g.code = code; g.error = null;
      if (!code) { g.error = 'Enter your code.'; render(); return; }
      g.loading = true; render();
      log('info', 'code.link.start', { chars: code.length });
      backend.linkCode(code, deviceId()).then(function () {
        setStoreKey(code); sset('codeLinkedAt', Date.now());
        log('info', 'code.linked');
        state.gate = { code: '', loading: false, error: null };
        state.view = 'browse';
        toast('Code linked to this computer'); render();
      }).catch(function (e) {
        log('error', 'code.link.failed', errInfo(e));
        g.loading = false;
        g.error = e.code === 'wrongproduct'
          ? 'That\u2019s a single-plugin key, not a CardMirror Plugins code.'
          : errorMessage(e);
        render();
      });
    }

    // Unlink the code from this device and uninstall every plugin.
    function unlinkAndUninstall() {
      var u = state.unlink; if (u.busy) return;
      var code = storeKey(); u.busy = true; render();
      var ids = Object.keys(installed());
      log('info', 'code.unlink.start', { plugins: ids.length });
      var serverDone = code
        ? backend.unlinkCode(code, deviceId()).then(function () { return true; }, function (e) {
            log('warn', 'code.unlink.serverFailed', errInfo(e));
            // Already linked elsewhere / unknown: nothing to free here.
            return !isConnErr(e) && e.status !== 500;
          })
        : Promise.resolve(true);
      serverDone.then(function (freed) {
        ids.forEach(function (id) { forgetManagedPlugin(id); });
        lsSet('bundles', {}); setInstalled({});
        sset('licenses', {}); setStoreKey(null); sset('codeLinkedAt', null);
        state.latest = {}; state.checked = {}; state.busy = {};
        state.unlink = { confirm: false, busy: false };
        state.view = 'gate';
        log('info', 'code.unlinked', { uninstalled: ids.length, serverFreed: freed });
        toast(freed
          ? 'Code unlinked' + (ids.length ? ' \u00b7 ' + ids.length + ' plugin' + (ids.length === 1 ? '' : 's') + ' uninstalled (restart CardMirror to finish)' : '')
          : 'Removed from this computer, but the server couldn\u2019t be reached \u2014 contact the developer to free your code', !freed);
        render();
      });
    }

    function errorMessage(e) {
      var map = {
        invalid: 'That code isn\u2019t valid.',
        wrongproduct: 'Your code doesn\u2019t include this plugin.',
        expired: 'This code has expired.',
        revoked: 'This code has been turned off.',
        bound: 'This code is already linked to another computer. Unlink it there (Settings), or contact the developer.',
        network: 'Couldn\u2019t reach the plugin server. Check your connection. If it keeps happening, use Send feedback (bottom-left) with the log included.',
        timeout: 'The plugin server took too long to answer. Please try again.',
        filtered: 'This network seems to be blocking the plugin server (a web filter answered instead).',
        server: 'The plugin server had a problem. Please try again in a moment.',
        rate: 'The plugin server is busy right now. Please wait a minute and try again.',
        blocked: 'CardMirror blocked this plugin from running.',
        storage: 'Not enough local storage to save this plugin.',
      };
      if (e.code === 'filtered' && e.detail) {
        return 'This network’s web filter' + (e.detail.filterHint ? ' (' + e.detail.filterHint + ')' : '') +
          (e.detail.filterLogin ? ' wants a sign-in before CardMirror can reach the plugin server' : ' is blocking the plugin server') +
          '. Ask IT to allow it, or install on another network.';
      }
      return map[e.code] || e.message || 'Something went wrong.';
    }

    // auto = started by Auto Updates: on failure, log and show a small
    // message instead of opening the browser-download dialog.
    function startUpdate(p, auto) {
      if (state.busy[p.id] || bgUpdating[p.id]) return Promise.resolve();
      bgUpdating[p.id] = 'panel';
      state.busy[p.id] = 'updating'; render();
      var rec = installed()[p.id] || {};
      p = Object.assign({}, p, { version: latestFor(p) });
      var run;
      if (p.tier === 'premium') {
        var key = storeKey() || licenses()[p.id];
        run = key ? backend.installPremium(p, deviceId(), key)
                  : Promise.reject(Object.assign(new Error('No saved license'), { code: 'invalid' }));
      } else run = backend.installFree(p);
      log('info', 'update.start', { id: p.id, to: p.version, from: rec.version, auto: !!auto });
      return run.then(function (r) { return applyInstall(p, r); }).then(function (mode) {
        delete bgUpdating[p.id];
        log('info', 'update.ok', { id: p.id, mode: mode, auto: !!auto });
        delete state.busy[p.id]; delete state.latest[p.id]; state.checked[p.id] = 'ok';
        toast(p.name + ' updated to ' + p.version + (mode === 'restart' ? ' \u2014 restart CardMirror to apply' : '')); render();
      }).catch(function (e) {
        delete bgUpdating[p.id];
        log('error', 'update.failed', { id: p.id, error: errInfo(e), auto: !!auto });
        delete state.busy[p.id];
        if (auto) { state.autoFailed[p.id] = true; toast('Couldn\u2019t update ' + p.name + ': ' + errorMessage(e), true); render(); return; }
        if (p.tier !== 'premium' && isConnErr(e)) { openBrowserDl(p, e); return; }
        if (p.tier === 'premium' && LICENSE_CODES[e.code]) {
          var m = installed(); if (m[p.id]) { m[p.id].license = Object.assign({}, m[p.id].license, { status: e.code }); setInstalled(m); }
        }
        toast('Update failed: ' + errorMessage(e), true); render();
      });
    }

    function uninstall(p) {
      state.busy[p.id] = 'removing'; render();
      forgetManagedPlugin(p.id);
      var bundles = lsGet('bundles', {}); delete bundles[p.id]; lsSet('bundles', bundles);
      var m = installed(); delete m[p.id]; setInstalled(m);
      var ls = licenses(); delete ls[p.id]; sset('licenses', ls); // the store key stays
      delete state.latest[p.id]; delete state.checked[p.id];
      delay(300).then(function () {
        delete state.busy[p.id];
        toast(p.name + ' uninstalled' + (loadedThisSession[p.id] ? ' \u2014 fully removed after restart' : '')); render();
      });
    }

    function latestFor(p) { return state.latest[p.id] || p.version; }
    function hasUpdate(p, rec) {
      // An offline (built-in) catalog has placeholder versions: only "newer" counts.
      return state.offline ? !!rec && cmpVer(latestFor(p), rec.version) > 0 : needsUpdate(latestFor(p), rec);
    }

    // Auto Updates: install whatever the panel shows as out of date, one at
    // a time (covers releases published after CardMirror started, and the
    // panel opening before the launch check finished).
    var autoRunning = false;
    function runAutoUpdates() {
      if (autoRunning || !autoUpdatesOn() || state.offline || !state.catalog || !host) return;
      var m = installed();
      var due = state.catalog.filter(function (p) {
        return hasUpdate(p, m[p.id]) && !state.busy[p.id] && !bgUpdating[p.id] && !state.autoFailed[p.id];
      });
      if (!due.length) return;
      autoRunning = true;
      log('info', 'autoUpdate.panel', { due: due.map(function (p) { return p.id + '@' + latestFor(p); }) });
      due.reduce(function (chain, p) {
        return chain.then(function () { return host ? startUpdate(p, true) : null; });
      }, Promise.resolve()).then(function () { autoRunning = false; }, function () { autoRunning = false; });
    }

    function checkOne(id) {
      var p = byId(id), rec = installed()[id];
      if (!p || !rec || state.checking[id]) return Promise.resolve(null);
      state.checking[id] = true; render();
      return backend.checkUpdate(p, rec.version).then(function (r) {
        state.latest[id] = r.latest; state.checked[id] = 'ok';
        delete state.checking[id];
        return needsUpdate(r.latest, rec);
      }).catch(function (e) {
        log('warn', 'update.check.failed', { id: id, error: errInfo(e) });
        state.checked[id] = 'error'; delete state.checking[id]; return null;
      });
    }
    function checkUpdatesFor(id) {
      checkOne(id).then(function (found) {
        var p = byId(id);
        if (found === null) toast('Couldn\u2019t check ' + (p ? p.name : id) + ' for updates', true);
        else toast(found ? 'Update available for ' + p.name : p.name + ' is up to date');
        render();
      });
    }
    // One fresh catalog fetch: refreshes the Browse list (new plugins show up)
    // and the newest version of everything installed.
    function checkAll() {
      if (state.checkingAll) return;
      state.checkingAll = true; render();
      var before = (state.catalog || []).map(function (p) { return p.id; });
      backend.getCatalog(true).then(function (c) {
        state.checkingAll = false;
        if (c.offline) { toast('Couldn\u2019t check for updates', true); render(); return; }
        state.catalog = c.list; state.offline = false; state.loadError = null;
        var m = installed(), n = 0;
        Object.keys(m).forEach(function (id) {
          var p = byId(id); if (!p) return;
          state.latest[id] = p.version; state.checked[id] = 'ok';
          if (needsUpdate(p.version, m[id])) n++;
        });
        var added = c.list.filter(function (p) { return before.indexOf(p.id) < 0; }).length;
        log('info', 'update.checkAll', { updates: n, newPlugins: added });
        var auto = n && autoUpdatesOn();
        if (auto) state.autoFailed = {}; // a manual check retries ones that failed
        toast((n ? (auto ? 'Updating ' + n + (n === 1 ? ' plugin' : ' plugins') + '\u2026' : n + (n === 1 ? ' update available' : ' updates available')) : 'Everything is up to date') +
          (added ? ' \u00b7 ' + added + ' new plugin' + (added === 1 ? '' : 's') : ''));
        render();
        if (auto) runAutoUpdates();
      });
    }

    // ---- feedback ----
    function openFeedback() {
      state.feedback = { kind: 'idea', message: '', email: '', includeLog: true, sending: false, error: null, fresh: true };
      render();
      var t = root.querySelector('#fbmsg'); if (t) t.focus();
    }
    function feedbackPlugins() {
      var m = installed();
      return Object.keys(m).map(function (id) { return { id: id, version: m[id].version }; });
    }
    function mailtoFeedback(f) {
      var body = f.message + '\n\n---\nType: ' + f.kind + '\nManager v' + PM_VERSION + ' on ' + navigator.platform +
        '\nPlugins: ' + feedbackPlugins().map(function (p) { return p.id + '@' + p.version; }).join(', ');
      return 'mailto:jacobscardmirrorplugins@gmail.com?subject=' + encodeURIComponent('[CardMirror ' + f.kind + '] Feedback') +
        '&body=' + encodeURIComponent(body.slice(0, 1500));
    }
    function sendFeedback() {
      var f = state.feedback; if (!f || f.sending) return;
      f.message = (f.message || '').trim(); f.email = (f.email || '').trim();
      if (f.message.length < 3) { f.error = 'Please write a little more.'; render(); return; }
      f.sending = true; f.error = null; f.offerMail = false; render();
      postJson(CONFIG.ADMIN_API + '/api/public/feedback', {
        kind: f.kind, message: f.message, email: f.email, deviceId: deviceId(),
        managerVersion: PM_VERSION, platform: navigator.platform, plugins: feedbackPlugins(),
        // Emailed to the developer as an attachment; never shown here.
        log: f.includeLog ? diagText().slice(-200000) : undefined,
      }).then(function () {
        log('info', 'feedback.sent', { kind: f.kind, chars: f.message.length, withLog: !!f.includeLog });
        state.feedback = null; toast('Thanks! Your feedback was sent.'); render();
      }, function (e) {
        log('error', 'feedback.failed', errInfo(e));
        if (!state.feedback) return;
        f.sending = false;
        f.error = e.serverMessage || (isConnErr(e) ? 'Couldn\u2019t reach the feedback server (it may be blocked on this network).' : 'Couldn\u2019t send feedback.');
        f.offerMail = !e.serverMessage;
        render();
      });
    }
    function feedbackView() {
      var f = state.feedback; if (!f) return '';
      var dis = f.sending ? ' disabled' : '';
      var opt = function (v, label) { return '<option value="' + v + '"' + (f.kind === v ? ' selected' : '') + '>' + label + '</option>'; };
      return '<div class="modalscrim" data-act="fb-bg"><div class="modal' + (f.fresh ? ' enter' : '') + '">' +
        '<h2>Send feedback</h2>' +
        '<p>Found a bug or have an idea? This goes straight to the developer.</p>' +
        '<label class="field" for="fbkind">Type</label>' +
        '<select id="fbkind" class="input plain"' + dis + '>' + opt('idea', 'Idea / request') + opt('bug', 'Bug') + opt('other', 'Other') + '</select>' +
        '<label class="field" for="fbmsg" style="margin-top:12px">Message</label>' +
        '<textarea id="fbmsg" class="input plain" rows="5" maxlength="4000" placeholder="What happened, or what would you like?"' + dis + '>' + esc(f.message) + '</textarea>' +
        '<label class="field" for="fbemail" style="margin-top:12px">Your email (optional, for a reply)</label>' +
        '<input id="fbemail" class="input plain" type="email" placeholder="you@example.com" value="' + esc(f.email) + '"' + dis + '>' +
        '<label class="fbchk"><input id="fblog" type="checkbox"' + (f.includeLog ? ' checked' : '') + dis + '>' +
          '<span>Include a log to help fix problems <span class="muted">(technical info about this app\u2019s connections; no codes or personal files)</span></span></label>' +
        (f.error ? '<div class="err">' + icon('alert', 15) + '<span>' + esc(f.error) +
          (f.offerMail ? ' <a href="' + esc(mailtoFeedback(f)) + '" style="color:inherit">Email it instead</a>.' : '') + '</span></div>' : '') +
        '<div class="mfoot"><button class="btn" data-act="fb-cancel"' + dis + '>Cancel</button>' +
        '<button class="btn primary" data-act="fb-send"' + dis + '>' + (f.sending ? spinner() + 'Sending\u2026' : 'Send') + '</button></div>' +
        '</div></div>';
    }

    // ---- view helpers ----
    function byId(id) { return (state.catalog || []).filter(function (p) { return p.id === id; })[0]; }
    function tile(p, size) {
      if (p.image) {
        var px = (size || 24) >= 24 && !size ? 48 : 0;
        return '<div class="tile" style="background:none"><img src="' + p.image + '" alt="" style="width:100%;height:100%;border-radius:inherit;display:block"></div>';
      }
      var a = p.accent || ['#52525b', '#a1a1aa'];
      return '<div class="tile" style="background:linear-gradient(135deg,' + esc(a[0]) + ',' + esc(a[1]) + ')' + (p.iconColor ? ';color:' + esc(p.iconColor) : '') + '">' + icon(p.icon || 'puzzle', size || 24) + '</div>';
    }
    function spinner() { return '<span class="spin" style="display:inline-flex">' + icon('refresh', 14) + '</span>'; }

    function card(p) {
      var rec = installed()[p.id], busy = state.busy[p.id] || (bgUpdating[p.id] ? 'updating' : null), hasUpd = hasUpdate(p, rec);
      var action;
      if (busy === 'installing' || busy === 'updating') action = '<button class="btn primary" disabled>' + spinner() + (busy === 'installing' ? 'Installing\u2026' : 'Updating\u2026') + '</button>';
      else if (rec && hasUpd) action = '<button class="btn primary" data-act="update" data-id="' + esc(p.id) + '">' + icon('refresh', 14) + 'Update</button>';
      else if (rec) action = '<button class="btn" disabled>' + icon('check', 14) + 'Installed</button>';
      else action = '<button class="btn primary" data-act="install" data-id="' + esc(p.id) + '">' + icon('download', 14) + 'Install</button>';
      var status = rec
        ? '<span class="status ok">' + icon('check', 13) + 'Installed v' + esc(rec.version) + (p.openCommand ? ' \u00b7 click to open' : '') + '</span>'
        : '<span class="status">Not installed</span>';
      var openable = rec && p.openCommand && !busy;
      return '<div class="card' + (openable ? ' openable' : '') + '"' +
        (openable ? ' data-act="open-plugin" data-id="' + esc(p.id) + '" title="Open ' + esc(p.name) + '"' : '') + '><div class="row">' + tile(p) +
        '<div><div class="name">' + esc(p.name) + '</div><div class="meta">v' + esc(p.version) + ' \u00b7 ' + esc(p.author || '') + '</div></div></div>' +
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
        var rec = m[id], busy = state.busy[id] || (bgUpdating[id] ? 'updating' : null), hasUpd = hasUpdate(p, rec), checking = state.checking[id];
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
        var openable = p.openCommand && !busy;
        return '<div class="item' + (openable ? ' openable' : '') + '"' +
          (openable ? ' data-act="open-plugin" data-id="' + esc(id) + '" title="Open ' + esc(p.name) + '"' : '') + '>' + tile(p, 22) +
          '<div class="info"><div class="name">' + esc(p.name) + '</div>' +
          '<div class="meta">Installed v' + esc(rec.version) + (rec.needsRestart && loadedThisSession[id] ? ' \u00b7 restart CardMirror to apply' : '') + '</div>' +
          '<div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">' + upd + '</div></div>' +
          '<div class="acts">' + acts + '</div></div>';
      }).join('') + '</div>';
    }

    function storeLink(label) {
      return CONFIG.STORE_URL
        ? '<a href="' + esc(CONFIG.STORE_URL) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
        : '<a href="mailto:jacobscardmirrorplugins@gmail.com?subject=' + encodeURIComponent('CardMirror Plugins code') + '">' + label + '</a>';
    }

    // Shown until a code is linked: the store stays hidden behind it.
    function gateView() {
      var g = state.gate, dis = g.loading ? ' disabled' : '';
      return '<div class="gate"><div class="big">' + icon('key', 26) + '</div>' +
        '<h2>Enter your CardMirror Plugins code</h2>' +
        '<p>One code unlocks every plugin in the store. It\u2019s saved on this computer, so you only enter it once.</p>' +
        '<input id="code" class="input" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" value="' + esc(g.code) + '"' + dis + '>' +
        (g.error ? '<div class="err">' + icon('alert', 15) + '<span>' + esc(g.error) + '</span></div>' : '') +
        '<button class="btn primary wide" data-act="code-submit"' + dis + '>' + (g.loading ? spinner() + 'Checking\u2026' : 'Unlock plugins') + '</button>' +
        '<div class="hint" style="margin-top:14px">Don\u2019t have a code? ' + storeLink('Get one here') + '.</div>' +
        '<div class="hint">A code works on one computer at a time. To move it, unlink it in Settings on the old computer.</div>' +
        '</div>';
    }

    function settingsView() {
      var code = storeKey(), u = state.unlink, n = Object.keys(installed()).length;
      var linkedAt = sget('codeLinkedAt', null);
      var codeSec = '<div class="set-sec"><h3>Your code</h3>' +
        '<p>Linked to this computer' + (linkedAt ? ' since ' + esc(new Date(linkedAt).toLocaleDateString()) : '') + '. It unlocks every plugin in the store.</p>' +
        '<div class="codebox"><code>' + esc(u.show ? code : maskCode(code)) + '</code>' +
        '<button class="btn" data-act="code-show">' + (u.show ? 'Hide' : 'Show') + '</button>' +
        '<button class="btn" data-act="code-copy">Copy</button></div></div>';
      var unlinkSec = '<div class="set-sec danger"><h3>Unlink code from this computer</h3>' +
        '<p>Frees your code so you can use it on another computer.</p>' +
        (u.confirm
          ? '<div class="warnbox"><b>This will uninstall all ' + n + ' plugin' + (n === 1 ? '' : 's') + ' from this computer</b> and remove your code. ' +
            'Their saved settings are deleted too. You can link the code again later on this or another computer.</div>' +
            '<div class="set-actions"><button class="btn" data-act="unlink-cancel"' + (u.busy ? ' disabled' : '') + '>Cancel</button>' +
            '<button class="btn danger solid" data-act="unlink-confirm"' + (u.busy ? ' disabled' : '') + '>' + (u.busy ? spinner() + 'Unlinking\u2026' : 'Unlink & uninstall all') + '</button></div>'
          : '<div class="set-actions"><button class="btn danger" data-act="unlink-start">' + icon('trash', 14) + 'Unlink\u2026</button></div>') +
        '</div>';
      var on = autoUpdatesOn();
      var autoSec = '<div class="set-sec"><div class="set-row"><div><h3>Auto Updates</h3>' +
        '<p>' + (on ? 'Installed plugins update themselves when a new version is out. Changes apply after restarting CardMirror.'
                    : 'Off. Use \u201cCheck for updates\u201d and the Update buttons to update plugins yourself.') + '</p></div>' +
        '<button class="tog big' + (on ? ' on' : '') + '" data-act="autoupd-toggle" role="switch" aria-checked="' + on + '" aria-label="Auto Updates">' +
        '<span class="sw"></span></button></div></div>';
      return '<div class="set">' + autoSec + codeSec + unlinkSec + '</div>';
    }

    // ---- render ----
    var firstRender = true;
    var KEEP_FOCUS = { q: 1, fbmsg: 1, fbemail: 1, code: 1 };
    var renderedView = null;
    function render() {
      // Redrawing replaces the list, which would jump back to the top; keep
      // the scroll position unless the user switched tabs.
      var oldBody = root.querySelector('.body');
      var keepScroll = oldBody && renderedView === state.view ? oldBody.scrollTop : 0;
      var focused = root.activeElement && root.activeElement.id;
      var caret = null;
      try { caret = KEEP_FOCUS[focused] ? root.activeElement.selectionStart : null; } catch (e) {}
      var count = Object.keys(installed()).length;
      var gated = !storeKey();
      if (gated) state.view = 'gate';
      else if (state.view === 'gate') state.view = 'browse';
      var body = gated ? gateView() : state.view === 'settings' ? settingsView() : state.view === 'browse' ? browseView() : installedView();
      var bar = gated ? '' : '<div class="bar"><div class="tabs">' +
        '<button class="tab ' + (state.view === 'browse' ? 'on' : '') + '" data-act="tab" data-v="browse">' + icon('store', 14) + 'Browse</button>' +
        '<button class="tab ' + (state.view === 'installed' ? 'on' : '') + '" data-act="tab" data-v="installed">' + icon('box', 14) + 'Installed' + (count ? '<span class="pill">' + count + '</span>' : '') + '</button>' +
        '<button class="tab ' + (state.view === 'settings' ? 'on' : '') + '" data-act="tab" data-v="settings">' + icon('gear', 14) + 'Settings</button></div>' +
        (state.view === 'settings' ? '' : state.view === 'browse'
          ? '<div class="search">' + icon('search', 15) + '<input id="q" placeholder="Search plugins\u2026" value="' + esc(state.query) + '"></div>' +
            '<button class="btn" data-act="check-all"' + (state.checkingAll ? ' disabled' : '') + '>' +
            (state.checkingAll ? spinner() : icon('refresh', 14)) + 'Check for updates</button>'
          : '<span class="grow"></span><button class="btn" data-act="check-all"' +
            (state.checkingAll || Object.keys(state.checking).length || !Object.keys(installed()).length ? ' disabled' : '') + '>' +
            (state.checkingAll || Object.keys(state.checking).length ? spinner() : icon('refresh', 14)) + 'Check all for updates</button>') +
        '</div>';

      root.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="scrim" data-act="bg"><div class="win' + (firstRender ? ' enter' : '') + '" role="dialog" aria-label="Plugin Manager">' +
        '<header>' +
        '<div><h1>Plugin Manager<span class="ver">v' + esc(PM_VERSION) + '</span></h1><div class="sub">Browse, install and manage CardMirror plugins</div></div>' +
        '<span class="grow"></span><button class="iconbtn" data-act="close" aria-label="Close">' + icon('x', 18) + '</button></header>' +
        bar +
        '<div class="body">' +
        (state.offline && !gated && state.view !== 'settings' ? '<div class="banner">' + icon('alert', 15) + '<span>Couldn\u2019t reach the plugin server \u2014 showing the last saved catalog. Installing needs a connection. ' +
          'If this keeps happening, <button class="linkbtn" style="color:inherit;font-size:inherit" data-act="feedback">contact the developer</button>.</span></div>' : '') +
        body + '</div>' +
        '<footer><span style="display:flex;gap:14px"><button class="linkbtn" data-act="feedback">Send feedback</button>' +
          '</span><span class="mid">Contact developer \u2013 <a href="mailto:jacobscardmirrorplugins@gmail.com">jacobscardmirrorplugins@gmail.com</a></span>' +
        '<button class="tog ' + (fabEnabled() ? 'on' : '') + '" data-act="fab-toggle" role="switch" aria-checked="' + fabEnabled() + '">Floating button<span class="sw"></span></button></footer>' +
        browserDlView() + feedbackView() +
        (state.toast ? '<div class="toast' + (state.toastBad ? ' bad' : '') + '">' + icon(state.toastBad ? 'x' : 'check', 15) + esc(state.toast) + '</div>' : '') +
        '</div></div>';

      var wasFirst = firstRender;
      firstRender = false; if (state.browserDl) state.browserDl.fresh = false; if (state.feedback) state.feedback.fresh = false;
      renderedView = state.view;
      var nb = root.querySelector('.body'); if (nb && keepScroll) nb.scrollTop = keepScroll;
      if (KEEP_FOCUS[focused]) {
        var el = root.querySelector('#' + focused);
        if (el && !el.disabled) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (e) {} }
      }
      if (gated && wasFirst) { var ci = root.querySelector('#code'); if (ci) ci.focus(); }
    }

    // ---- events (delegated) ----
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
      if (act === 'bg') { if (e.target === t) close(); return; }
      if (act === 'code-submit') { submitCode(); return; }
      if (act === 'code-show') { state.unlink.show = !state.unlink.show; render(); return; }
      if (act === 'code-copy') { copyText(storeKey() || '', 'Code copied'); return; }
      if (act === 'unlink-start') { state.unlink.confirm = true; render(); return; }
      if (act === 'unlink-cancel') { state.unlink.confirm = false; render(); return; }
      if (act === 'unlink-confirm') { unlinkAndUninstall(); return; }
      if (act === 'bd-bg') { if (e.target === t && !state.browserDl.loading) { state.browserDl = null; render(); } return; }
      if (act === 'bd-cancel') { state.browserDl = null; render(); return; }
      if (act === 'bd-open') { log('info', 'browserDl.open', { id: state.browserDl && state.browserDl.plugin.id }); return; } // link opens itself
      if (act === 'bd-copy') { if (state.browserDl) copyText(downloadUrl(state.browserDl.plugin), 'Link copied — paste it into your browser'); return; }
      if (act === 'bd-pick') { var fi = root.querySelector('#bdfile'); if (fi) fi.click(); return; }
      if (act === 'feedback') { openFeedback(); return; }
      if (act === 'fb-bg') { if (e.target === t && !state.feedback.sending) { state.feedback = null; render(); } return; }
      if (act === 'fb-cancel') { state.feedback = null; render(); return; }
      if (act === 'fb-send') { sendFeedback(); return; }
      if (act === 'close') close();
      else if (act === 'tab') { state.view = t.getAttribute('data-v'); state.unlink.confirm = false; render(); }
      else if (act === 'install') startInstall(byId(id));
      else if (act === 'open-plugin') openPlugin(byId(id));
      else if (act === 'autoupd-toggle') {
        var au = !autoUpdatesOn(); lsSet('autoUpdates', au); try { api.storage.set('autoUpdates', au); } catch (e2) {}
        log('info', 'autoUpdate.setting', { on: au });
        if (au) { state.autoFailed = {}; runAutoUpdates(); }
        render(); toast(au ? 'Auto Updates on' : 'Auto Updates off');
      }
      else if (act === 'fab-toggle') {
        var on = !fabEnabled(); sset('fab', on); render();
        toast(on ? 'Floating button on' : 'Floating button off \u2014 open from the command palette');
      }
      else if (act === 'check') checkUpdatesFor(id);
      else if (act === 'check-all') checkAll();
      else if (act === 'update') startUpdate(byId(id) || { id: id });
      else if (act === 'uninstall') uninstall(byId(id) || { id: id, name: id });
    });
    root.addEventListener('change', function (e) {
      if (e.target.id === 'bdfile' && e.target.files && e.target.files[0]) importFromFile(e.target.files[0]);
      if (e.target.id === 'fbkind' && state.feedback) state.feedback.kind = e.target.value;
      if (e.target.id === 'fblog' && state.feedback) state.feedback.includeLog = e.target.checked;
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'fbmsg' && state.feedback) state.feedback.message = e.target.value;
      if (e.target.id === 'fbemail' && state.feedback) state.feedback.email = e.target.value;
      if (e.target.id === 'q') { state.query = e.target.value; render(); }
      if (e.target.id === 'code') state.gate.code = e.target.value;
    });
    root.addEventListener('keydown', function (e) {
      e.stopPropagation(); // keep editor hotkeys from firing while typing here
      if (e.key === 'Enter' && e.target.id === 'code') submitCode();
    });
    root.addEventListener('keyup', function (e) { e.stopPropagation(); });
    root.addEventListener('keypress', function (e) { e.stopPropagation(); });

    render();
    // Redraw when the background job updates something; then catch anything left.
    onBgUpdate = function () { if (host) { render(); runAutoUpdates(); } };
    backend.getCatalog().then(function (c) { state.catalog = c.list; state.offline = c.offline; render(); runAutoUpdates(); })
      .catch(function (e) { log('error', 'catalog.crashed', errInfo(e)); state.loadError = e.message || 'Unknown error'; render(); });
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
        run: function (api) { lastApi = api; openManager(api); },
      },
    ],
  });

  log('info', 'boot', {
    version: PM_VERSION, registered: !!window.__registerCardMirrorPlugin,
    online: navigator.onLine, origin: location.origin, userAgent: navigator.userAgent,
    selfBoot: window.__cmPluginManagerSelfBoot || null,
  });
  confirmSelfBoot();

  // Re-run every plugin installed through the manager (after our own
  // registration, so the manager always loads first).
  restorePluginData();
  hookRegister();
  hookWindowClose();
  bootInstalledBundles();
  backupPluginData();
  startDataGuard();

  // Usage ping, plugin auto-updates, manager self-update (all silent).
  runBackgroundJobs();

  // Floating button once the page is ready
  if (document.body) refreshFab();
  else document.addEventListener('DOMContentLoaded', refreshFab);
})();
