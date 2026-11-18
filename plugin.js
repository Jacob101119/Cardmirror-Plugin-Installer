// SpeechDrop Upload - CardMirror plugin (v0.21.0)
//
// v0.21.0: button locations and drag-to-upload.
//  - Locations: removed "After the ribbon button named below" (and its text
//    setting), "End of the ribbon" and the top-left / top-right floating spots.
//    The default is "Bottom left: right of Send / Receive"; "Bottom left: left of
//    Dropzone" puts the button first in the pill row (the other pills slide over).
//    A location saved by an older build (e.g. Hidden) is reset once. With "Hidden",
//    opening the panel (hotkey or command) centers it over the document.
//  - Drag a heading (pocket, hat or block) or a card (grab its tag) onto the SpeechDrop button, from the
//    document or an outline list, and it uploads that heading and what's under it,
//    after the naming box, to your current room. CardMirror's own drag is
//    pointer-based (not HTML5 drag-and-drop), so the plugin follows the pointer
//    itself, then cancels CardMirror's drag so the heading isn't also moved. The
//    button gets a solid blue outline while a heading is held over it.
//  - The naming box now stays open after you press Upload: its Upload button turns
//    green ("Uploaded") or red ("Failed - try again", with the reason under it) and
//    the box closes only when you close it (X or Esc). The SpeechDrop logo also
//    flashes green or red for a few seconds.
//
// v0.18.0: new button location, "Bottom left: right of Send / Receive". It
// puts the SpeechDrop button in CardMirror's bottom-left pill tray (the row
// holding the Dropzone, Send and Receive pills), at the far right, styled like
// the pills. Pick it in the panel's Settings (gear) or CardMirror's
// Settings -> Plugins. If the tray isn't on screen it uses the default spot.
//
// v0.17.0: every upload (Upload Current Doc, Upload Selection, Upload Heading,
// Browse, and the hotkey commands) first pops a "Name This Upload" box over the
// panel, pre-filled with the current name. Press Upload (or Enter) to send it;
// the gray X (or Esc) cancels. Selection/doc content is captured before the box
// opens, so typing in it can't change what gets uploaded.
//
// v0.16.1: Title Case for every button, panel heading and command name
// ("Upload Current Doc", "Upload Selection", "Upload Heading", "Leave Room", ...).
//
// v0.16.0: the upload buttons are now a 2x2 grid with a fourth button, "Browse",
// that opens your file picker and uploads the file you choose as-is. "Upload
// heading" now drills down: hover a pocket and press Tab to see its hats, hover
// a hat and press Tab to see its blocks; Esc steps back one level.
//
// v0.15.0: "Add heading" (pick a pocket from your doc and upload just that
// section); optional dark blue (#000222) panel in dark mode; shorter status
// messages; more detail in the debug log (uploads, polling errors, stacks).
//
// v0.14.0: red "Leave room" button; link icon next to the room code (opens the
// room in your browser); "Create a room" (name required, max 60 chars); new
// settings (room history, recent-room count, copy link on create, ...).
//
// UI: a SpeechDrop button in the ribbon opens a panel (room name, docs in the
// room, upload current doc, leave room). Room listing is stubbed (demo data).
//
// Commands:
//   "SpeechDrop: open panel"                 -> toggles the panel
//   "Upload current document to SpeechDrop"  -> asks for a room code, then uploads
//   "Upload to last SpeechDrop room"         -> reuses the previous room code
//
// SpeechDrop facts this is built on (from yunyu/SpeechDrop):
//   - POST /:roomid/upload, multipart; the server takes the first file part.
//   - Uploads are sent as .docx (SpeechDrop accepts Word documents).
//   - All POSTs sit behind a signed double-submit CSRF handler (vert.x CSRFHandler).
//   - Success sets an X-Uploaded-File-Index response header.
//   - Failures come back as: no_file, bad_type, too_large.
//
// UNVERIFIED (see the notes next to each function):
//   1. The .docx is rebuilt from the live editor (lossy: no images, simplified styles).
//   2. Token: read from SpeechDrop's XSRF-TOKEN cookie via a hidden iframe.
//   3. Cross-origin fetch from the editor window may be blocked by CORS.

(function () {
  'use strict';

  var PLUGIN_ID = 'speechdrop-upload';
  var LAST_ROOM_KEY = 'lastRoom';
  var WINDOW_ID = Math.random().toString(36).slice(2);
  var LOADED_AT = Date.now();

  // ---- debug log (shared across windows via IndexedDB) ---------------------------
  // Every window's copy of the plugin appends here, so the log shows what ALL
  // windows did. View it with "SpeechDrop: show debug log" (it also pops up
  // automatically a few seconds after Open).
  var memLog = [];
  var logChain = Promise.resolve();

  async function idbAppendLog(line) {
    var db = await idb();
    return new Promise(function (resolve) {
      var tx = db.transaction('kv', 'readwrite');
      var st = tx.objectStore('kv');
      var q = st.get('debuglog');
      q.onsuccess = function () {
        var arr = Array.isArray(q.result) ? q.result : [];
        arr.push(line);
        st.put(arr.slice(-400), 'debuglog');
      };
      tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
    });
  }

  // The "enable-debug-commands" setting turns all troubleshooting/log commands
  // and the shared debug log off. (Commands can't be hidden from the palette,
  // so when off they just say they're disabled.)
  function debugOn() {
    try { return getSetting('enable-debug-commands', true) !== false; }
    catch (e) { return true; }
  }

  function debugGate(api) {
    if (debugOn()) return true;
    try { (api || apiRef).showToast('SpeechDrop: troubleshooting commands are turned off in this plugin\u2019s settings.'); }
    catch (e) { /* ignore */ }
    return false;
  }

  function dlog() {
    var msg = Array.prototype.slice.call(arguments).map(function (a) {
      if (a instanceof Error) return a.message;
      if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(' ');
    try { console.log('[' + PLUGIN_ID + ']', msg); } catch (e) { /* ignore */ }
    if (!debugOn()) return;
    var line = new Date().toISOString().slice(11, 23) + ' [w' + WINDOW_ID.slice(0, 3) + '] ' + msg;
    memLog.push(line);
    if (memLog.length > 200) memLog.shift();
    logChain = logChain.then(function () { return idbAppendLog(line); }).catch(function () { /* ignore */ });
  }

  // Short, loggable description of an error (name, message, top of the stack).
  function errInfo(e) {
    if (!e) return 'unknown error';
    var s = (e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e.message || String(e));
    if (e.stack) s += ' | ' + String(e.stack).split('\n').slice(1, 3).map(function (l) { return l.trim(); }).join(' < ');
    return s.slice(0, 400);
  }

  async function showDebugLog() {
    var old = document.getElementById('sd-debug');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'sd-debug';
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;width:min(680px,92vw);height:50vh;z-index:2147483647;' +
      'background:#111;color:#ddd;border:1px solid #666;border-radius:8px;display:flex;flex-direction:column;' +
      'font:12px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #444;';
    var title = document.createElement('span');
    title.textContent = 'SpeechDrop debug log (all windows)';
    title.style.cssText = 'flex:1;font-weight:600;';
    bar.appendChild(title);
    var ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.style.cssText = 'flex:1;margin:0;border:0;background:#111;color:#ddd;font:11px/1.35 ui-monospace,Consolas,monospace;padding:8px;resize:none;white-space:pre;';

    async function refresh() {
      var lines = null;
      try { lines = await idbGet('debuglog'); } catch (e) { lines = null; }
      if (!Array.isArray(lines)) lines = ['(shared log unavailable; this window only)'].concat(memLog);
      ta.value = lines.join('\n');
      ta.scrollTop = ta.scrollHeight;
    }
    function btn(label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 8px;cursor:pointer;';
      b.addEventListener('click', fn);
      bar.appendChild(b);
    }
    btn('Refresh', refresh);
    btn('Copy', function () {
      ta.select();
      try { navigator.clipboard.writeText(ta.value); } catch (e) { try { document.execCommand('copy'); } catch (e2) { /* ignore */ } }
    });
    btn('Clear', async function () {
      memLog = [];
      try { await idbSet('debuglog', []); } catch (e) { /* ignore */ }
      refresh();
    });
    btn('Close', function () { box.remove(); });
    box.appendChild(bar);
    box.appendChild(ta);
    document.body.appendChild(box);
    await refresh();
  }

  // The plugin API object only reaches us when a command runs, but the ribbon
  // button exists from load. Until a command has run, fall back to localStorage
  // and defaults; useApi() upgrades to the real API (and migrates the room).
  var apiRef = null;

  function useApi(api) {
    if (!api || apiRef === api) return;
    var first = !apiRef;
    apiRef = api;
    if (first) {
      try { dlog('plugin api keys:', Object.keys(api).join(', ')); } catch (e0) { /* ignore */ }
      try {
        ['lastRoom', 'recentRooms', 'prefs', 'roomHistory'].forEach(function (k) {
          var legacy = JSON.parse(localStorage.getItem(PLUGIN_ID + ':' + k));
          if (legacy && !api.storage.get(k)) api.storage.set(k, legacy);
        });
      } catch (e) { /* ignore */ }
      // Start watching the last room (auto-refresh) unless the user already
      // joined or left a room in this session.
      try {
        if (getSetting('reopen-last-room', false) && !watch.userSet && !watch.room) {
          var lr = api.storage.get('lastRoom');
          if (typeof lr === 'string' && lr) watch.room = lr;
        }
      } catch (e) { /* ignore */ }
    }
  }

  // In-panel settings (the gear in the SpeechDrop panel). They live in this
  // plugin's own storage and win over CardMirror's Settings -> Plugins values,
  // so they work even when the host shows no gear for this plugin.
  var PREFS_KEY = 'prefs';

  // Commands are registered once at startup, before the plugin storage is
  // reachable, so the "troubleshooting commands" choice is mirrored into
  // localStorage where the next startup can read it.
  function mirrorDebugFlag(on) {
    try { localStorage.setItem(PLUGIN_ID + ':debugCommands', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }

  function getPref(key) {
    try {
      var o = store(PREFS_KEY);
      if (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    } catch (e) { /* ignore */ }
    return undefined;
  }

  function setPref(key, val) {
    var o = store(PREFS_KEY);
    o = (o && typeof o === 'object') ? Object.assign({}, o) : {};
    if (val === undefined) delete o[key]; else o[key] = val;
    storeSet(PREFS_KEY, o);
    if (key === 'enable-debug-commands') mirrorDebugFlag(val !== false);
  }

  function getSetting(key, fallback) {
    var pv = getPref(key);
    if (pv !== undefined) return pv;
    try {
      if (apiRef) {
        var v = apiRef.settings.get(key);
        if (v !== undefined) return v;
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function store(key) {
    try {
      if (apiRef) return apiRef.storage.get(key);
      return JSON.parse(localStorage.getItem(PLUGIN_ID + ':' + key));
    } catch (e) { return undefined; }
  }

  function storeSet(key, value) {
    try {
      if (apiRef) apiRef.storage.set(key, value);
      else localStorage.setItem(PLUGIN_ID + ':' + key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- helpers

  function baseUrl() {
    return 'https://speechdrop.net';
  }

  function safeName(title, ext) {
    var base = String(title || 'speech')
      .replace(/\.(cmir|docx)$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim() || 'speech';
    return base + '.' + ext;
  }

  var ERROR_TEXT = {
    no_file: 'SpeechDrop got no file.',
    bad_type: 'SpeechDrop rejected the file type.',
    too_large: 'The file is too large for SpeechDrop.',
  };

  // ------------------------------------------------- 1. get the document file
  //
  // CardMirror's plugin API has no "export document" call, but each editor is
  // a ProseMirror view whose root element exposes the live document
  // (root.pmViewDesc.node). We read that, then convert it to a .docx with the
  // small writer below. Pasting/preview in SpeechDrop therefore gets a normal
  // Word file. NOTE: this is a plain, lossy rewrite (images and some Verbatim
  // style details are not carried over), not CardMirror's own exporter.

  var lastEditorRoot = null;
  var lastRoomLog = '';
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    var root = t && t.closest && t.closest('.ProseMirror');
    if (root) lastEditorRoot = root;
  }, true);

  function findEditorRoot() {
    var a = document.activeElement;
    var root = a && a.closest && a.closest('.ProseMirror');
    if (root) return root;
    root = document.querySelector('.ProseMirror.ProseMirror-focused');
    if (root) return root;
    if (lastEditorRoot && lastEditorRoot.isConnected) return lastEditorRoot;
    var all = document.querySelectorAll('.ProseMirror');
    return all.length === 1 ? all[0] : null;
  }

  function readDocJson() {
    var root = findEditorRoot();
    var node = root && root.pmViewDesc && root.pmViewDesc.node;
    if (!node || typeof node.toJSON !== 'function') {
      var err = new Error('Click into the document you want to upload, then run the command again.');
      err.userFacing = true;
      throw err;
    }
    return node.toJSON();
  }

  // Reads just the highlighted part of the document. We map the browser's DOM
  // selection to document positions through ProseMirror's view description
  // (the same pmViewDesc hook readDocJson uses), then slice the doc there. If
  // that mapping isn't available, fall back to the selected plain text.
  function readSelectionJson() {
    var root = findEditorRoot();
    var desc = root && root.pmViewDesc;
    var node = desc && desc.node;
    if (!node || typeof node.toJSON !== 'function') {
      var e1 = new Error('Click into the document you want to upload from, then try again.');
      e1.userFacing = true;
      throw e1;
    }
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed ||
        !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) {
      var e2 = new Error('Highlight some text in the document first.');
      e2.userFacing = true;
      throw e2;
    }

    try {
      if (typeof desc.posFromDOM === 'function' && typeof node.slice === 'function') {
        var a = desc.posFromDOM(sel.anchorNode, sel.anchorOffset, -1);
        var b = desc.posFromDOM(sel.focusNode, sel.focusOffset, -1);
        if (typeof a === 'number' && typeof b === 'number' && a >= 0 && b >= 0 && a !== b) {
          var content = node.slice(Math.min(a, b), Math.max(a, b)).content;
          var arr = content.toJSON();
          if (arr && arr.length) return { type: 'doc', content: arr };
        }
      }
    } catch (err) {
      console.warn('[' + PLUGIN_ID + '] selection mapping failed, using plain text', err);
    }

    var lines = String(sel.toString()).split(/\r?\n+/).filter(function (l) { return l.trim(); });
    if (!lines.length) {
      var e3 = new Error('Highlight some text in the document first.');
      e3.userFacing = true;
      throw e3;
    }
    return {
      type: 'doc',
      content: lines.map(function (l) {
        return { type: 'paragraph', content: [{ type: 'text', text: l }] };
      }),
    };
  }

  // ---- minimal JSON -> .docx writer ---------------------------------------

  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var STYLE_FOR = {
    pocket: 'Heading1', hat: 'Heading2', block: 'Heading3',
    tag: 'Heading4', analytic: 'Analytic', undertag: 'Undertag',
  };
  var HIGHLIGHTS = {
    yellow: 1, green: 1, cyan: 1, magenta: 1, blue: 1, red: 1, darkBlue: 1,
    darkCyan: 1, darkGreen: 1, darkMagenta: 1, darkRed: 1, darkYellow: 1,
    darkGray: 1, lightGray: 1, black: 1,
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function runProps(marks) {
    var p = [];
    (marks || []).forEach(function (m) {
      var t = String(m && m.type || '').toLowerCase();
      var a = (m && m.attrs) || {};
      if (t === 'bold') p.push('<w:b/>');
      else if (t === 'italic') p.push('<w:i/>');
      else if (t === 'strikethrough' || t === 'strike') p.push('<w:strike/>');
      else if (t === 'underline_mark' || t === 'underline_direct' || t === 'underline') p.push('<w:u w:val="single"/>');
      else if (t === 'superscript') p.push('<w:vertAlign w:val="superscript"/>');
      else if (t === 'subscript') p.push('<w:vertAlign w:val="subscript"/>');
      else if (t === 'cite_mark') p.push('<w:b/><w:sz w:val="26"/>');
      else if (t === 'emphasis_mark') p.push('<w:b/><w:u w:val="single"/>');
      else if (t === 'font_size') {
        var hp = Math.round(Number(a.halfPoints));
        if (hp > 0) p.push('<w:sz w:val="' + hp + '"/>');
      } else if (t === 'font_color') {
        var c = String(a.color || '').replace(/[^0-9a-f]/gi, '').slice(0, 6);
        if (c.length === 6) p.push('<w:color w:val="' + c + '"/>');
      } else if (t === 'highlight') {
        if (HIGHLIGHTS[a.color]) p.push('<w:highlight w:val="' + a.color + '"/>');
        else if (!a.color) p.push('<w:highlight w:val="yellow"/>');
      }
    });
    return p.length ? '<w:rPr>' + p.join('') + '</w:rPr>' : '';
  }

  function inlineXml(nodes) {
    var out = '';
    (nodes || []).forEach(function (n) {
      if (!n) return;
      if (n.type === 'text') {
        out += '<w:r>' + runProps(n.marks) + '<w:t xml:space="preserve">' + esc(n.text) + '</w:t></w:r>';
      } else if (n.type === 'hard_break') {
        out += '<w:r><w:br/></w:r>';
      } else if (n.content) {
        out += inlineXml(n.content);
      }
    });
    return out;
  }

  function paraXml(node, style) {
    var pPr = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '';
    return '<w:p>' + pPr + inlineXml(node.content) + '</w:p>';
  }

  function blockXml(node) {
    if (!node || typeof node !== 'object') return '';
    var t = node.type;
    if (STYLE_FOR[t]) return paraXml(node, STYLE_FOR[t]);
    if (t === 'paragraph' || t === 'card_body' || t === 'cite_paragraph') return paraXml(node, null);
    if (t === 'table') {
      var rows = (node.content || []).map(function (row) {
        var cells = (row.content || []).map(function (cell) {
          var inner = (cell.content || []).map(blockXml).join('') || '<w:p/>';
          return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' + inner + '</w:tc>';
        }).join('');
        return '<w:tr>' + cells + '</w:tr>';
      }).join('');
      return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
          return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="808080"/>';
        }).join('') + '</w:tblBorders></w:tblPr>' + rows + '</w:tbl><w:p/>';
    }
    if (t === 'image') return '';
    // card, analytic_unit, doc, and any other container: recurse
    return (node.content || []).map(blockXml).join('');
  }

  var CRC_TABLE = (function () {
    var tbl = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // Stored (uncompressed) zip: simple and valid for .docx.
  function zipStore(files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f[0]);
      var data = enc.encode(f[1]);
      var crc = crc32(data);
      var local = [].concat(
        [0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      chunks.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += local.length + name.length + data.length;
    });
    var centralStart = offset;
    central.forEach(function (e) {
      var rec = [].concat(
        [0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(e.offset)
      );
      chunks.push(new Uint8Array(rec), e.name);
      offset += rec.length + e.name.length;
    });
    var end = [].concat(
      [0x50, 0x4b, 5, 6], u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - centralStart), u32(centralStart), u16(0)
    );
    chunks.push(new Uint8Array(end));
    return new Blob(chunks, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  function styleXml(id, name, basedOn, rpr, ppr) {
    return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/>' +
      (basedOn ? '<w:basedOn w:val="' + basedOn + '"/>' : '') + '<w:qFormat/>' +
      (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '</w:style>';
  }

  function docJsonToDocx(json) {
    var body = blockXml(json) || '<w:p/>';
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var documentXml = head + '<w:document xmlns:w="' + W_NS + '"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
    var stylesXml = head + '<w:styles xmlns:w="' + W_NS + '"><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      styleXml('Heading1', 'heading 1', 'Normal', '<w:b/><w:sz w:val="52"/>', '<w:keepNext/><w:spacing w:before="360"/><w:outlineLvl w:val="0"/>') +
      styleXml('Heading2', 'heading 2', 'Normal', '<w:b/><w:u w:val="double"/><w:sz w:val="44"/>', '<w:keepNext/><w:spacing w:before="360"/><w:outlineLvl w:val="1"/>') +
      styleXml('Heading3', 'heading 3', 'Normal', '<w:b/><w:u w:val="single"/><w:sz w:val="32"/>', '<w:keepNext/><w:spacing w:before="240"/><w:outlineLvl w:val="2"/>') +
      styleXml('Heading4', 'heading 4', 'Normal', '<w:b/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="200"/><w:outlineLvl w:val="3"/>') +
      styleXml('Analytic', 'Analytic', 'Heading4', '', '') +
      styleXml('Undertag', 'Undertag', 'Normal', '<w:b/><w:i/>', '') +
      '</w:styles>';
    var contentTypes = head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    var rels = head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var docRels = head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return zipStore([
      ['[Content_Types].xml', contentTypes],
      ['_rels/.rels', rels],
      ['word/document.xml', documentXml],
      ['word/styles.xml', stylesXml],
      ['word/_rels/document.xml.rels', docRels],
    ]);
  }

  async function getDocumentFile(opts) {
    return docJsonToDocx(opts && opts.json ? opts.json : opts && opts.selection ? readSelectionJson() : readDocJson());
  }

  // --------------------------------------------------------- 2. CSRF token
  //
  // SpeechDrop (confirmed from its own room.js): the server sets a cookie named
  // XSRF-TOKEN when the site loads, and every POST must echo that cookie's value
  // as the form field / header "X-XSRF-TOKEN". The editor page is on a different
  // origin, so document.cookie can't see speechdrop.net's cookie. We load
  // SpeechDrop in a hidden iframe and try to read the cookie from inside it.
  // That only works if the editor window allows cross-origin access (it
  // already allowed the room-page fetch, which is a good sign). If it doesn't,
  // the error below says so, and the fix is a main-process request instead.
  // Tries the ROOM page first (the cookie may only be set there, or scoped to
  // its path), then the site root. Cookie names (never values) are written to
  // the debug log so a failure shows what the iframe could actually see.
  function readTokenFromUrl(url) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
      frame.src = url;
      var timer = setTimeout(function () {
        frame.remove();
        reject(new Error('Timed out loading SpeechDrop to get its token.'));
      }, 15000);
      frame.onload = function () {
        clearTimeout(timer);
        var tries = 0;
        (function look() {
          var cookie;
          try {
            cookie = frame.contentDocument.cookie;
          } catch (e) {
            frame.remove();
            dlog('token: iframe cookie read blocked:', e && e.message);
            reject(new Error("The editor blocked reading SpeechDrop's token cookie (cross-origin)."));
            return;
          }
          var m = /(?:^|;\s*)XSRF-TOKEN=([^;]*)/.exec(cookie || '');
          if (m) {
            frame.remove();
            try { resolve(decodeURIComponent(m[1])); } catch (e) { resolve(m[1]); }
            return;
          }
          if (++tries < 4) { setTimeout(look, 400); return; }
          var names = String(cookie || '').split(';').map(function (s) { return s.split('=')[0].trim(); }).filter(Boolean);
          dlog('token: no XSRF-TOKEN at', url, '| cookie names visible:', names.length ? names.join(', ') : '(none)');
          frame.remove();
          reject(new Error('SpeechDrop did not provide a token cookie.'));
        })();
      };
      document.body.appendChild(frame);
    });
  }

  async function readTokenViaIframe(base, code) {
    var urls = [base + '/' + encodeURIComponent(code), base + '/'];
    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
      try { return await readTokenFromUrl(urls[i]); }
      catch (e) { lastErr = e; if (/blocked/.test(e.message)) break; }
    }
    throw lastErr || new Error('SpeechDrop did not provide a token cookie.');
  }

  async function getCsrfToken(base, code) {
    var res = await fetch(base + '/' + encodeURIComponent(code), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 404) {
      var nf = new Error('Room "' + code + '" not found.');
      nf.userFacing = true;
      throw nf;
    }
    if (!res.ok) throw new Error('Could not open the room page (HTTP ' + res.status + ').');
    // Long shot: some servers also render the token into the page itself.
    try {
      var html = await res.text();
      var m = /name=["']X-XSRF-TOKEN["'][^>]*value=["']([^"']+)["']|value=["']([^"']+)["'][^>]*name=["']X-XSRF-TOKEN["']|<meta[^>]+name=["'](?:csrf-token|xsrf-token)["'][^>]+content=["']([^"']+)["']/i.exec(html);
      var found = m && (m[1] || m[2] || m[3]);
      dlog('token: room page', found ? 'contains a token' : 'has no token in its HTML', '| mentions xsrf/csrf:', /xsrf|csrf/i.test(html));
      if (found) return found;
    } catch (e) { /* ignore */ }
    return readTokenViaIframe(base, code);
  }

  // ------------------------------------------------------------- 3. upload

  async function uploadToRoom(code, opts) {
    var format = 'docx';
    var info = apiRef && apiRef.docInfo();
    var base = baseUrl();

    var blob = opts && opts.file ? opts.file : await getDocumentFile(opts);
    dlog(opts && opts.file ? 'upload: using chosen file,' : 'upload: built .docx,', blob.size, 'bytes');
    var token = await getCsrfToken(base, code);
    dlog('upload: got CSRF token (' + String(token).length + ' chars)');

    var form = new FormData();
    form.append('X-XSRF-TOKEN', token);
    var fileName = safeName((info && info.docTitle) || document.title, format);
    if (opts && opts.selection) fileName = fileName.replace(/\.docx$/, ' (selection).docx');
    if (opts && opts.fileName) fileName = safeName(opts.fileName, format);
    if (opts && opts.file && opts.file.name) fileName = opts.file.name;
    if (opts && opts.chosenName) {
      var ext = format;
      var em = opts.file && opts.file.name ? /\.([A-Za-z0-9]+)$/.exec(opts.file.name) : null;
      if (em) ext = em[1].toLowerCase();
      var typed = String(opts.chosenName).replace(new RegExp('\\.' + ext + '$', 'i'), '');
      fileName = safeName(typed, ext);
    }
    form.append('file', blob, fileName);

    var res = await fetch(base + '/' + encodeURIComponent(code) + '/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { 'X-XSRF-TOKEN': token },
    });

    if (!res.ok) {
      var text = '';
      try { text = (await res.text()).trim(); } catch (e) { /* ignore */ }
      dlog('upload: server replied HTTP', res.status, '| body starts:', text.slice(0, 120).replace(/\s+/g, ' '));
      var key = Object.keys(ERROR_TEXT).filter(function (k) { return text.indexOf(k) !== -1; })[0];
      var msg403 = res.status === 403 ? ' SpeechDrop rejected the token; the cookie was probably not sent along with the upload.' : '';
      var err = new Error(key ? ERROR_TEXT[key] : 'Upload failed (HTTP ' + res.status + ').' + msg403);
      err.userFacing = true;
      throw err;
    }
  }

  function setBusy(v) {
    ui.busy = v;
    if (ui.panel && ui.room) renderPanel();
  }

  async function runUpload(code, opts) {
    var what = opts && opts.label ? opts.label : (opts && opts.selection ? 'selection' : 'document');
    var which = opts && opts.which ? opts.which : (opts && opts.selection ? 'selection' : 'doc');
    var note = opts && opts.quiet ? function (m) { if (ui.panel) setStatus(m); } : notify;
    var raw = String(code || '').trim();
    if (!raw) return;
    code = parseRoomInput(raw);
    if (!code) {
      note("That doesn't look like a room code or link.");
      flash('err', which);
      return;
    }
    if (ui.nameDlg) return;
    opts = Object.assign({}, opts);
    try {
      // Capture the content now: focusing the name box would otherwise drop the
      // editor's selection before the upload reads it.
      if (!opts.file && !opts.json) opts.json = opts.selection ? readSelectionJson() : readDocJson();
    } catch (e) {
      dlog('upload: FAILED |', what, '| room', code, '|', errInfo(e));
      note('SpeechDrop: ' + ((e && e.message) || String(e)));
      flash('err', which);
      return;
    }
    var attempted = false;
    // Runs when the person presses Upload in the name box. The box stays open and
    // its Upload button turns green (uploaded) or red (failed).
    var send = async function (chosen) {
      attempted = true;
      opts.chosenName = chosen;
      ui.room = code;
      if (watch.room !== code) { watch.room = code; watch.seenRoom = ''; }
      watch.userSet = true;
      ui.busyWhich = which;
      ui.flash = null;
      setBusy(true);
      dlog('upload: start |', what, '| room', code);
      note('Uploading ' + what + ' to room ' + code + '...');
      try {
        await uploadToRoom(code, opts);
        storeSet(LAST_ROOM_KEY, code);
        rememberRoom(code, '');
        setBusy(false);
        dlog('upload: OK |', what, '| room', code);
        note('Uploaded ' + what + ' to room ' + code + '.');
        flash('ok', which);
        if (ui.panel) loadRoom();
        return { ok: true };
      } catch (e) {
        var msg = (e && e.message) || String(e);
        if (!(e && e.userFacing) && /Failed to fetch|NetworkError|CORS/i.test(msg)) {
          msg = 'Could not reach SpeechDrop (network or CORS block): ' + msg;
        }
        setBusy(false);
        dlog('upload: FAILED |', what, '| room', code, '|', errInfo(e));
        note('SpeechDrop: ' + msg);
        flash('err', which);
        console.warn('[' + PLUGIN_ID + ']', e);
        return { ok: false, msg: msg };
      }
    };
    await askUploadName(code, opts, send);
    if (!attempted) dlog('upload: cancelled at name box |', what);
  }


  // ------------------------------------------------------- upload-name box
  //
  // Shown before every upload. Sits over the panel (or mid-screen when the
  // panel is closed). Pressing Upload runs send(name) and the box STAYS OPEN: the
  // Upload button turns green (uploaded) or red (failed, press again to retry).
  // It closes only when the person closes it (X or Esc).

  function defaultUploadName(opts) {
    if (opts.file && opts.file.name) return opts.file.name.replace(/\.[^.\/\\]+$/, '');
    if (opts.fileName) return String(opts.fileName).replace(/\.(cmir|docx)$/i, '');
    var info = apiRef && apiRef.docInfo();
    var base = String((info && info.docTitle) || document.title || 'speech')
      .replace(/\.(cmir|docx)$/i, '').trim() || 'speech';
    return opts.selection ? base + ' (selection)' : base;
  }

  function askUploadName(code, opts, send) {
    return new Promise(function (resolve) {
      if (!document.getElementById('sd-name-styles')) {
        var st = document.createElement('style');
        st.id = 'sd-name-styles';
        st.textContent =
          '.sd-nameshade{position:fixed;inset:0;z-index:100000;background:transparent}' +
          '.sd-namebox{position:fixed;z-index:100001;width:260px;box-sizing:border-box;padding:12px 14px 14px;' +
          'background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:10px;' +
          'box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px system-ui,sans-serif}' +
          '.sd-namebox.sd-light{color-scheme:light}' +
          '.sd-namebox.sd-navy{background:#000222;color-scheme:dark}' +
          '.sd-namebox.sd-navy .sd-input{background:#000222}' +
          '.sd-namehead{display:flex;align-items:center;gap:8px;margin-bottom:10px}' +
          '.sd-nametitle{flex:1;font-weight:600;font-size:14px}' +
          '.sd-namex{border:0;background:transparent;color:GrayText;cursor:pointer;font-size:20px;line-height:1;' +
          'padding:0 4px;margin:-4px -4px 0 0;border-radius:6px}' +
          '.sd-namex:hover{color:CanvasText;background:color-mix(in srgb,CanvasText 12%,transparent)}' +
          '.sd-namerow{display:flex;align-items:center;gap:6px;margin-bottom:12px}' +
          '.sd-namerow .sd-input{flex:1;min-width:0;letter-spacing:normal}' +
          '.sd-nameext{color:GrayText;flex:none}' +
          '.sd-namego{width:100%}';
        document.head.appendChild(st);
      }

      var ext = 'docx';
      var em = opts.file && opts.file.name ? /\.([A-Za-z0-9]+)$/.exec(opts.file.name) : null;
      if (em) ext = em[1].toLowerCase();
      var initial = defaultUploadName(opts);

      var shade = el('div', 'sd-nameshade');
      var box = el('div', 'sd-namebox');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Name This Upload');
      var panelEl = ui.panel;
      if (panelEl) {
        box.classList.toggle('sd-light', panelEl.classList.contains('sd-light'));
        box.classList.toggle('sd-navy', panelEl.classList.contains('sd-navy'));
      } else if (getSetting('light-mode', false) === true) {
        box.classList.add('sd-light');
      } else if (getSetting('dark-blue', false) === true) {
        box.classList.add('sd-navy');
      }

      var head = el('div', 'sd-namehead');
      head.appendChild(el('div', 'sd-nametitle', 'Name This Upload'));
      var x = el('button', 'sd-namex', '\u00d7');
      x.type = 'button';
      x.title = 'Cancel (Esc)';
      x.setAttribute('aria-label', 'Cancel upload');
      head.appendChild(x);
      box.appendChild(head);

      var row = el('div', 'sd-namerow');
      var input = el('input', 'sd-input');
      input.type = 'text';
      input.value = initial;
      input.maxLength = 80;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Upload name');
      row.appendChild(input);
      row.appendChild(el('span', 'sd-nameext', '.' + ext));
      box.appendChild(row);

      var go = el('button', 'sd-primary sd-namego', 'Upload');
      go.type = 'button';
      box.appendChild(go);

      shade.appendChild(box);
      document.body.appendChild(shade);

      // Place it over the panel, or mid-screen when the panel is closed.
      var w = 260;
      var left, top;
      if (panelEl && panelEl.isConnected) {
        var r = panelEl.getBoundingClientRect();
        left = r.left + (r.width - w) / 2;
        top = r.top + 48;
      } else {
        left = (window.innerWidth - w) / 2;
        top = window.innerHeight / 3;
      }
      box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, left)) + 'px';
      box.style.top = Math.max(8, Math.min(window.innerHeight - 170, top)) + 'px';

      ui.nameDlg = true;
      function done(value) {
        document.removeEventListener('keydown', onKey, true);
        shade.remove();
        ui.nameDlg = false;
        resolve(value);
      }
      var state = 'idle'; // idle | busy | done
      var errLine = el('div', 'sd-nameext');
      errLine.style.cssText = 'margin-top:8px;font-size:12px;color:#dc2626;white-space:normal;word-break:break-word;display:none';
      box.appendChild(errLine);
      async function submit() {
        if (state !== 'idle') return;
        var v = input.value.trim();
        if (!v) { input.focus(); return; }
        state = 'busy';
        input.disabled = true;
        go.disabled = true;
        go.textContent = 'Uploading\u2026';
        go.style.cssText = '';
        errLine.style.display = 'none';
        var res;
        try { res = await send(v); } catch (e) { res = { ok: false, msg: (e && e.message) || String(e) }; }
        if (res && res.ok) {
          state = 'done';
          go.textContent = 'Uploaded';
          go.style.cssText = 'background:#16a34a;border-color:#16a34a;color:#fff';
          x.title = 'Close (Esc)';
        } else {
          state = 'idle';
          input.disabled = false;
          go.disabled = false;
          go.textContent = 'Failed \u2013 try again';
          go.style.cssText = 'background:#dc2626;border-color:#dc2626;color:#fff';
          errLine.textContent = (res && res.msg) || 'The upload failed.';
          errLine.style.display = '';
        }
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === 'Enter' && box.contains(e.target) && e.target !== x) {
          e.preventDefault(); e.stopPropagation(); void submit();
        }
      }
      document.addEventListener('keydown', onKey, true);
      x.onclick = function () { done(null); };
      go.onclick = function () { void submit(); };
      // Clicking outside the box does nothing (so a stray click can't lose the name).
      shade.addEventListener('mousedown', function (e) { if (e.target === shade) e.preventDefault(); });
      // keep typing in the box from triggering editor hotkeys
      input.addEventListener('keydown', function (e) { e.stopPropagation(); });
      input.focus();
      input.select();
    });
  }

  // --------------------------------------------------------- room-code modal

  function promptForRoom(initial) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(0,0,0,.45);';

      var box = document.createElement('div');
      box.style.cssText =
        'background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:8px;' +
        'padding:16px;width:300px;font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4);';

      var title = document.createElement('div');
      title.textContent = 'Upload to SpeechDrop';
      title.style.cssText = 'font-weight:600;margin-bottom:8px;';

      var input = document.createElement('input');
      input.type = 'text';
      input.value = initial || '';
      input.placeholder = 'Room code or link';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.style.cssText =
        'width:100%;box-sizing:border-box;padding:6px 8px;font:inherit;' +
        'letter-spacing:.1em;margin-bottom:12px;';

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
      var cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      var go = document.createElement('button');
      go.textContent = 'Upload';
      row.appendChild(cancel);
      row.appendChild(go);

      box.appendChild(title);
      box.appendChild(input);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      input.focus();
      input.select();

      function done(value) {
        overlay.remove();
        resolve(value);
      }
      cancel.onclick = function () { done(null); };
      go.onclick = function () { done(input.value.trim() || null); };
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(null); });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') done(input.value.trim() || null);
        else if (e.key === 'Escape') done(null);
      });
    });
  }

  // ======================================================================
  // UI: ribbon button + popover panel
  // ======================================================================
  //
  // The plugin API (v1) has no "add a ribbon button" call, so this injects its
  // own button into the ribbon DOM (best effort) and falls back to a small
  // floating button in the top-right corner if it can't find the ribbon.
  // If the ribbon lookup grabs the wrong element, set RIBBON_SELECTOR below to
  // a CSS selector for the ribbon's button container (find it with devtools).
  //
  // You can ALSO bind the "SpeechDrop: open panel" command to a custom ribbon
  // button (Settings -> ribbon buttons, beta.22+). That's the officially
  // supported route, but it can't show a logo, so the injected button is the
  // main path.

  // The injected "S" button. It is placed right after the ribbon control whose
  // label matches NEIGHBOR_PATTERN; if none is found it is appended to the
  // ribbon, and failing that it floats top-right.
  var SHOW_BUILTIN_BUTTON = true;
  var NEIGHBOR_PATTERN = /paragraph integrity/i;

  // Where the button lives (the "button-location" setting, a dropdown). The
  // option strings double as the stored values, so keep them stable.
  var LOC_TRAY = 'Bottom left: right of Send / Receive (default)';
  var LOC_DEFAULT = LOC_TRAY;
  var LOC_OPTIONS = [
    LOC_TRAY,
    'Bottom left: left of Dropzone',
    'After "Paragraph Integrity"',
    'Floating: bottom right',
    'Floating: bottom left',
    'Hidden (use a hotkey or command)',
  ];
  var LOC_CODES = ['pill-tray', 'pill-tray-left', 'after-pi', 'float-br', 'float-bl', 'hidden'];

  // One-time reset (v0.22.0): a location saved by an older version (e.g. Hidden,
  // picked while testing) would otherwise keep winning over the new default.
  var locMigratedFor = null;
  function migrateLocationDefault() {
    var who = apiRef || 'local';
    if (locMigratedFor === who) return;
    locMigratedFor = who;
    try {
      if (getPref('loc-v') !== 22) {
        setPref('button-location', LOC_TRAY);
        setPref('loc-v', 22);
        try {
          if (apiRef && apiRef.settings && typeof apiRef.settings.set === 'function') apiRef.settings.set('button-location', LOC_TRAY);
        } catch (e2) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  function buttonLocation() {
    migrateLocationDefault();
    var v = getSetting('button-location', LOC_DEFAULT);
    var i = LOC_OPTIONS.indexOf(v);
    return LOC_CODES[i < 0 ? 0 : i];
  }

  // Nudge the button size (px) relative to the neighboring ribbon buttons.
  var SIZE_ADJUST = 0.5;

  var RIBBON_SELECTOR = '';

  var LOGO_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<rect x="1" y="1" width="22" height="22" rx="6" style="fill:var(--sd-color,#2563eb)"/>' +
    '<text x="12" y="17" text-anchor="middle" font-family="system-ui,sans-serif" ' +
    'font-size="15" font-weight="700" fill="#fff">S</text></svg>';

  var DOC_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="flex:none;opacity:.7">' +
    '<path d="M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13" fill="none" stroke="currentColor" ' +
    'stroke-width="1.2" stroke-linejoin="round"/></svg>';

  var LINK_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path ' +
    'd="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  var GEAR_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path ' +
    'd="M13 6.57L14.91 6.9 14.91 9.09 13 9.43 12.55 10.52 13.66 12.11 12.11 13.66 10.52 12.55 9.43 13 9.1 14.91 ' +
    '6.91 14.91 6.57 13 5.48 12.55 3.89 13.66 2.34 12.11 3.45 10.52 3 9.43 1.09 9.1 1.09 6.91 3 6.57 3.45 5.48 ' +
    '2.34 3.89 3.89 2.34 5.48 3.45 6.57 3 6.9 1.09 9.09 1.09 9.43 3 10.52 3.45 12.11 2.34 13.66 3.89 12.55 5.48Z" ' +
    'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

  var CLOCK_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" ' +
    'fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5V8l2.5 1.5" fill="none" ' +
    'stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  var ui = {
    started: false, joining: false, view: '', hPath: [], hScrolls: [], hRestore: null, createBusy: false, createDraft: '', histFilter: '',
    flash: null, busyWhich: '', dirHandle: null, refs: {}, joinDraft: '', openBusy: false, insertBusy: false,
    btn: null, anchor: null, panel: null, statusEl: null, cleanup: null,
    room: '', info: null, loading: false, error: '', status: '', busy: false,
  };

  // Button feedback: the pressed button turns green on success or red on
  // failure, then goes back to blue after a few seconds.
  var flashTimer = null;
  function flash(kind, which) {
    clearTimeout(flashTimer);
    clearFlashClasses();
    ui.flash = { kind: kind, which: which };
    applyFlash();
    // The SpeechDrop button itself turns green (uploaded) or red (failed).
    if (ui.btn) {
      if (ui.btnPrevColor === undefined) ui.btnPrevColor = ui.btn.style.getPropertyValue('--sd-color');
      ui.btn.style.setProperty('--sd-color', kind === 'ok' ? '#16a34a' : '#dc2626');
    }
    flashTimer = setTimeout(function () {
      ui.flash = null;
      clearFlashClasses();
      if (ui.btn) {
        if (ui.btnPrevColor) ui.btn.style.setProperty('--sd-color', ui.btnPrevColor);
        else ui.btn.style.removeProperty('--sd-color');
      }
      ui.btnPrevColor = undefined;
    }, 3500);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Keep the editor's selection/focus when clicking buttons (the upload reads
  // the last-focused editor, and this avoids stealing the caret).
  function keepFocus(n) {
    n.addEventListener('mousedown', function (e) { e.preventDefault(); });
    return n;
  }

  // Remember the last button the user pressed, so a command fired from a custom
  // ribbon button can anchor the panel under that button.
  var lastPress = null;
  document.addEventListener('mousedown', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button, [role="button"]');
    lastPress = b && !(ui.panel && ui.panel.contains(b)) ? { el: b, t: Date.now() } : null;
  }, true);

  function pickAnchor() {
    if (buttonLocation() === 'hidden') return null;
    if (lastPress && Date.now() - lastPress.t < 1500 && lastPress.el.isConnected) {
      var r = lastPress.el.getBoundingClientRect();
      // only trust buttons up in the ribbon area (not command-palette rows etc.)
      if (r.width > 0 && r.bottom < 170) return lastPress.el;
    }
    return ui.btn && ui.btn.isConnected ? ui.btn : null;
  }

  function injectStyles() {
    if (document.getElementById('sd-plugin-styles')) return;
    var s = document.createElement('style');
    s.id = 'sd-plugin-styles';
    s.textContent =
      '.sd-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;' +
      'border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;cursor:pointer;' +
      'padding:0;margin:0 2px;vertical-align:middle;flex:none;box-sizing:border-box}' +
      '.sd-btn svg{transition:none}' +
      '.sd-btn.sd-dragover,.sd-btn.sd-in-tray.sd-dragover{outline:2px solid #2563eb !important;outline-offset:1px !important;border-color:#2563eb !important}' +
      '.sd-btn rect{transition:fill .25s}' +
      '.sd-btn:hover,.sd-btn[aria-expanded="true"]{background:color-mix(in srgb,CanvasText 12%,transparent)}' +
      '.sd-btn.sd-floating{position:fixed;top:auto;bottom:8px;right:8px;z-index:99990;background:Canvas;border-color:GrayText}' +
      '.sd-btn.sd-float-bl{left:8px;right:auto}' +
      '.sd-btn.sd-in-tray{width:30px;height:30px;margin:0;border-radius:6px;' +
      'background:var(--pmd-c-surface-soft,Canvas);border:1px solid var(--pmd-c-border-soft,GrayText);' +
      'box-shadow:0 2px 6px var(--pmd-c-shadow-fade,rgba(0,0,0,.15));pointer-events:auto}' +
      '.sd-panel.sd-light{color-scheme:light}' +
      '.sd-panel.sd-navy{background:#000222;color-scheme:dark}' +
      '.sd-panel.sd-navy .sd-input{background:#000222}' +
      '.sd-panel{position:fixed;z-index:99999;width:300px;max-height:70vh;display:flex;flex-direction:column;' +
      'background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:10px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px system-ui,sans-serif;overflow:hidden}' +
      '.sd-head{padding:12px 14px 10px;display:flex;align-items:flex-start;gap:8px;' +
      'border-bottom:1px solid color-mix(in srgb,CanvasText 15%,transparent)}' +
      '.sd-titles{flex:1;min-width:0}' +
      '.sd-eyebrow{font-size:10px;letter-spacing:.12em;font-weight:700;color:GrayText}' +
      '.sd-room{font-size:16px;font-weight:600;margin-top:2px;word-break:break-all}' +
      '.sd-icon{border:0;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;' +
      'padding:4px 6px;border-radius:6px}' +
      '.sd-icon:hover{background:color-mix(in srgb,CanvasText 12%,transparent)}' +
      '.sd-list{overflow:auto;padding:6px;min-height:72px;flex:1}' +
      '.sd-doc{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px}' +
      '.sd-doc:hover{background:color-mix(in srgb,CanvasText 8%,transparent)}' +
      '.sd-docname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sd-empty{padding:18px 8px;text-align:center;color:GrayText}' +
      '.sd-foot{padding:10px;display:flex;flex-direction:column;gap:8px;' +
      'border-top:1px solid color-mix(in srgb,CanvasText 15%,transparent)}' +
      '.sd-row{display:flex;align-items:center;gap:8px}' +
      '.sd-status{flex:1;min-width:0;font-size:12px;color:GrayText;min-height:16px}' +
      '.sd-primary{padding:7px 10px;border:0;border-radius:6px;background:#2563eb;color:#fff;' +
      'font:inherit;font-weight:600;cursor:pointer}' +
      '.sd-primary:hover{background:#1d4ed8}.sd-primary:disabled{opacity:.6;cursor:default}' +
      '.sd-secondary{padding:7px 10px;border:1px solid #2563eb;border-radius:6px;background:transparent;' +
      'color:#2563eb;font:inherit;font-weight:600;cursor:pointer}' +
      '.sd-secondary:hover{background:color-mix(in srgb,#2563eb 12%,transparent)}.sd-secondary:disabled{opacity:.6;cursor:default}' +
      '.sd-upload>button{transition:background .25s,border-color .25s,color .25s}' +
      '.sd-upload{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sd-upload>button{min-width:0;padding-left:6px;padding-right:6px;' +
      'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sd-link{padding:4px 8px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);' +
      'border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;flex:none}' +
      '.sd-link:hover{background:color-mix(in srgb,CanvasText 10%,transparent)}' +
      '.sd-input{width:100%;box-sizing:border-box;padding:7px 8px;font:inherit;letter-spacing:.08em;' +
      'background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:6px}' +
      '.sd-doc{cursor:pointer}.sd-docname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sd-roomname{font-size:11px;color:GrayText;margin-top:2px;word-break:break-word}' +
      '.sd-mini{flex:none;padding:3px 8px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);' +
      'border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer;' +
      'transition:background .25s,border-color .25s,color .25s}' +
      '.sd-mini:hover{background:color-mix(in srgb,CanvasText 12%,transparent)}' +
      '.sd-recent-h{padding:4px 8px 2px}' +
      '.sd-recent{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}' +
      '.sd-recent:hover{background:color-mix(in srgb,CanvasText 8%,transparent)}' +
      '.sd-recent-text{flex:1;min-width:0}.sd-recent-code{font-weight:600}' +
      '.sd-recent-name{font-size:11px;color:GrayText;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sd-primary,.sd-secondary{transition:background .25s,border-color .25s,color .25s}' +
      '.sd-primary.sd-ok,.sd-secondary.sd-ok,.sd-mini.sd-ok{background:#16a34a;border-color:#16a34a;color:#fff}' +
      '.sd-primary.sd-err,.sd-secondary.sd-err,.sd-mini.sd-err{background:#dc2626;border-color:#dc2626;color:#fff}' +
      '.sd-link.sd-danger{background:#dc2626;border-color:#dc2626;color:#fff;font-weight:600}' +
      '.sd-link.sd-danger:hover{background:#b91c1c;border-color:#b91c1c}' +
      '.sd-coderow{display:flex;align-items:center;gap:6px;margin-top:2px}' +
      '.sd-coderow .sd-room{margin-top:0}' +
      '.sd-linkicon{display:inline-flex;align-items:center;justify-content:center;flex:none;padding:4px;' +
      'border:0;border-radius:5px;background:transparent;color:inherit;opacity:.75;cursor:pointer}' +
      '.sd-linkicon:hover{opacity:1;background:color-mix(in srgb,CanvasText 12%,transparent)}' +
      '.sd-hint{font-size:11px;color:GrayText;text-align:right;margin-top:-4px}' +
      '.sd-recent-meta{font-size:10px;color:GrayText}' +
      '.sd-more{flex:none;font-size:11px;color:GrayText}' +
      '.sd-tabhint{font-size:11px;color:GrayText}' +
      '.sd-set{padding:8px;border-bottom:1px solid color-mix(in srgb,CanvasText 10%,transparent)}' +
      '.sd-setlabel{display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer}' +
      '.sd-setdesc{font-size:11px;color:GrayText;margin-top:3px}';
    document.head.appendChild(s);
  }

  // ---- ribbon button -------------------------------------------------------

  function findRibbon() {
    var sels = RIBBON_SELECTOR ? [RIBBON_SELECTOR] : ['#ribbon', '.ribbon', '[class*="ribbon" i]'];
    for (var i = 0; i < sels.length; i++) {
      var n = null;
      try { n = document.querySelector(sels[i]); } catch (e) { n = null; }
      if (n && !n.closest('button')) {
        // climb to the outermost matching element (the ribbon, not a group in it)
        while (n.parentElement && n.parentElement !== document.body) {
          var m = false;
          try { m = n.parentElement.matches(sels[i]); } catch (e) { m = false; }
          if (!m) break;
          n = n.parentElement;
        }
        return n;
      }
    }
    return null;
  }

  function findNeighbor(pattern) {
    pattern = pattern || NEIGHBOR_PATTERN;
    var nodes = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n === ui.btn || (ui.btn && ui.btn.contains(n)) || (ui.panel && ui.panel.contains(n))) continue;
      var label = (n.getAttribute('title') || '') + ' ' + (n.getAttribute('aria-label') || '') + ' ' +
        (n.textContent || '');
      if (pattern.test(label)) return n;
    }
    return null;
  }

  // The Home / Settings buttons at the end of the ribbon. Returns the first of
  // them (in document order) that shares a container with the last one, so we
  // can insert ourselves just before the group.
  function findEdgeButton(host) {
    var re = /(^|\b)(home|settings?)(\b|$)/i;
    var found = [];
    var nodes = host.querySelectorAll('button, [role="button"], a');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n === ui.btn || (ui.btn && ui.btn.contains(n)) || (ui.panel && ui.panel.contains(n))) continue;
      var label = (n.getAttribute('title') || '') + ' ' + (n.getAttribute('aria-label') || '') + ' ' +
        (n.textContent || '').trim();
      if (label.length < 60 && re.test(label)) found.push(n);
    }
    if (!found.length) return null;
    var last = found[found.length - 1];
    for (var k = 0; k < found.length; k++) {
      if (found[k].parentElement === last.parentElement) return found[k];
    }
    return last;
  }

  function makeButton() {
    var b = el('button', 'sd-btn');
    b.type = 'button';
    b.title = 'SpeechDrop';
    b.setAttribute('aria-label', 'SpeechDrop');
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = LOGO_SVG;
    keepFocus(b);
    b.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    return b;
  }

  // ---- drag a heading onto the button -------------------------------------------
  //
  // CardMirror's drag is pointer-based (pointerdown -> pointermove -> pointerup
  // through its own drag controller), not HTML5 drag-and-drop, so dragover/drop
  // never fire on our button. We watch the pointer ourselves: remember what was
  // pressed, and if the pointer is released over our button after a real drag,
  // upload that heading.

  // Draggable things: headings (pocket, hat, block) and cards (a card's tag drags the
  // whole card; likewise an analytic and its unit).
  var HEAD_TYPES = { pocket: 1, hat: 1, block: 1, tag: 1, analytic: 1, card: 1, analytic_unit: 1 };
  var ptr = null;

  function flattenHeadings(list, out) {
    out = out || [];
    (list || []).forEach(function (it) { out.push(it); flattenHeadings(it.children, out); });
    return out;
  }

  // Climb from a DOM node to the ProseMirror heading/card element that holds it.
  // A tag (or analytic) stands for the card (or analytic unit) around it.
  function headingDomFrom(t) {
    for (var n = t; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      var d = n.pmViewDesc;
      if (d && d.node && d.node.type && HEAD_TYPES[d.node.type.name]) {
        var nm = d.node.type.name;
        if ((nm === 'tag' || nm === 'analytic') && d.parent && d.parent.node && d.parent.node.type &&
            (d.parent.node.type.name === 'card' || d.parent.node.type.name === 'analytic_unit')) {
          d = d.parent;
        }
        return { desc: d, root: n.closest('.ProseMirror') };
      }
    }
    return null;
  }

  // A drag handle usually sits in the gutter beside its heading, not inside it:
  // look just to the right of what was pressed.
  function headingDomNear(t, x, y) {
    var h = headingDomFrom(t);
    if (h) return h;
    var r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
    var yy = r && r.height ? r.top + r.height / 2 : y;
    var xx0 = r && r.width ? r.right : x;
    var offs = [12, 32, 64, 110];
    for (var i = 0; i < offs.length; i++) {
      var hit = document.elementFromPoint(xx0 + offs[i], yy);
      if (hit && !(hit === ui.btn || (ui.btn && ui.btn.contains(hit)))) {
        h = headingDomFrom(hit);
        if (h) return h;
      }
    }
    return null;
  }

  // The section for a dragged heading or card, wherever it sits in the document:
  // a pocket/hat/block owns itself plus the siblings after it up to the next heading
  // of the same or a higher level; a card or analytic unit is just itself.
  function sectionFromDom(h) {
    var doc = h && h.root && h.root.pmViewDesc && h.root.pmViewDesc.node;
    if (!doc || typeof doc.resolve !== 'function') return null;
    var pos = h.desc.posBefore;
    var $p = doc.resolve(pos);
    var container = $p.parent;
    var idx = $p.index();
    var kids = [];
    container.forEach(function (c) { kids.push(c); });
    var me = kids[idx];
    if (!me) return null;
    var rank = HEADING_RANK[me.type.name] || 0;
    var end = idx + 1;
    if (rank) {
      for (end = idx + 1; end < kids.length; end++) {
        var r = HEADING_RANK[kids[end].type.name];
        if (r && r <= rank) break;
      }
    }
    var nodes = kids.slice(idx, end).map(function (c) { return c.toJSON(); });
    dlog('heading drag: dom node', me.type.name, '| siblings taken:', nodes.length);
    return { type: me.type.name, title: pocketTitle(nodes[0]), nodes: nodes };
  }

  function oneLine(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }

  // Outline lists and other non-editor sources: match the pressed row's text to
  // a heading title (exact, case-insensitive).
  function sectionFromTexts(texts) {
    var all = flattenHeadings(collectPockets(readDocJson()));
    for (var i = 0; i < texts.length; i++) {
      var lo = oneLine(texts[i]).toLowerCase();
      if (!lo) continue;
      for (var k = 0; k < all.length; k++) {
        if (oneLine(all[k].title).toLowerCase() === lo) return { type: all[k].type, title: all[k].title, nodes: all[k].nodes };
      }
    }
    return null;
  }

  function pressedTexts(t) {
    var out = [];
    for (var n = t, depth = 0; n && n.nodeType === 1 && depth < 6 && n !== document.body; n = n.parentElement, depth++) {
      var tx = n.textContent;
      if (tx && tx.length < 300) out.push(tx);
    }
    return out;
  }

  function resolveSection(p) {
    var sec = null;
    try {
      if (p.dom) sec = sectionFromDom(p.dom);
      if (!sec) sec = sectionFromTexts(p.texts);
    } catch (e) {
      dlog('heading drag: resolve FAILED |', errInfo(e));
    }
    dlog('heading drag: press on <' + (p.tag || '?') + ' class="' + (p.cls || '') + '"> | dom node:', p.dom ? p.dom.desc.node.type.name : 'none',
      '| texts:', JSON.stringify(p.texts.slice(0, 3).map(function (x) { return oneLine(x).slice(0, 60); })),
      '| resolved:', sec ? sec.type + ' "' + sec.title.slice(0, 60) + '"' : 'none');
    return sec;
  }

  function overBtn(x, y) {
    if (!ui.btn || !ui.btn.isConnected) return false;
    var r = ui.btn.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function endHeadingDrag() {
    ptr = null;
    if (ui.btn) ui.btn.classList.remove('sd-dragover');
  }

  // Ask CardMirror to drop the drag it started, so releasing over our button
  // doesn't also move the heading in the document.
  function cancelHostDrag(e) {
    try {
      var k = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent('keydown', k));
      document.dispatchEvent(new KeyboardEvent('keyup', k));
    } catch (e1) { /* ignore */ }
    try {
      (e.target || document).dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.pointerId || 1, pointerType: e.pointerType || 'mouse', bubbles: true }));
    } catch (e2) { /* ignore */ }
  }

  function dropNotify(msg) {
    if (apiRef) { notify(msg); return; }
    if (!ui.panel) openPanel();
    setStatus(msg);
  }

  function installHeadingDrag() {
    if (installHeadingDrag.done) return;
    installHeadingDrag.done = true;

    window.addEventListener('pointerdown', function (e) {
      endHeadingDrag();
      if (e.button !== 0 || !e.target || e.target.nodeType !== 1) return;
      if (ui.btn && ui.btn.contains(e.target)) return;
      if (ui.panel && ui.panel.contains(e.target)) return;
      var dom = null;
      try { dom = headingDomNear(e.target, e.clientX, e.clientY); } catch (x) { dom = null; }
      ptr = {
        x: e.clientX, y: e.clientY, moved: false, dom: dom, section: null,
        texts: pressedTexts(e.target), tag: e.target.tagName, cls: String(e.target.className && e.target.className.baseVal != null ? e.target.className.baseVal : e.target.className || '').slice(0, 80),
      };
    }, true);

    window.addEventListener('pointermove', function (e) {
      if (!ptr) return;
      if (!ptr.moved) {
        if (Math.abs(e.clientX - ptr.x) + Math.abs(e.clientY - ptr.y) < 8) return;
        ptr.moved = true;
        // Read the heading now, before the drag changes anything.
        ptr.section = resolveSection(ptr);
      }
      if (ui.btn) ui.btn.classList.toggle('sd-dragover', !!ptr.section && overBtn(e.clientX, e.clientY));
    }, true);

    window.addEventListener('pointerup', function (e) {
      var p = ptr;
      endHeadingDrag();
      if (!p || !p.moved || !p.section || !overBtn(e.clientX, e.clientY)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      cancelHostDrag(e);
      var code = ui.room || String(store(LAST_ROOM_KEY) || '');
      if (!code) {
        dropNotify('Join a room first, then drop the heading again.');
        if (!ui.panel) openPanel();
        return;
      }
      var h = p.section;
      runUpload(code, {
        json: { type: 'doc', content: h.nodes },
        which: 'heading',
        quiet: true,
        label: (h.type || 'heading') + ' "' + clipName(h.title) + '"',
        fileName: h.title.slice(0, 80),
      });
    }, true);

    window.addEventListener('pointercancel', endHeadingDrag, true);
    window.addEventListener('blur', endHeadingDrag);
  }

  // Make the button the same size as the ribbon's own buttons.
  function matchSize(ref) {
    if (!ref || !ui.btn) return;
    var r = ref.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    var size = r.width > r.height * 1.6 ? r.height : Math.max(r.width, r.height);
    size = Math.round(size) + SIZE_ADJUST;
    var key = size + '|' + (ref.className || '');
    if (ui.sizeKey === key) return;
    ui.sizeKey = key;
    var cs = window.getComputedStyle(ref);
    ui.btn.style.width = size + 'px';
    ui.btn.style.height = size + 'px';
    ui.btn.style.margin = cs.margin;
    ui.btn.style.borderRadius = cs.borderRadius;
    var icon = ui.btn.querySelector('svg');
    if (icon) {
      var px = Math.max(12, Math.round(size * 0.66));
      icon.setAttribute('width', String(px));
      icon.setAttribute('height', String(px));
    }
  }

  var FLOAT_CLASSES = ['sd-floating', 'sd-float-bl'];

  function setFloat(cls) {
    FLOAT_CLASSES.forEach(function (c) { ui.btn.classList.remove(c); });
    if (cls) {
      ui.btn.classList.add('sd-floating');
      if (cls !== 'sd-floating') ui.btn.classList.add(cls);
    }
  }

  // Undo the size matching done for in-ribbon placement.
  function clearSizing() {
    if (!ui.sizeKey) return;
    ui.sizeKey = null;
    ['width', 'height', 'margin', 'borderRadius'].forEach(function (k) { ui.btn.style[k] = ''; });
    var icon = ui.btn.querySelector('svg');
    if (icon) { icon.setAttribute('width', '18'); icon.setAttribute('height', '18'); }
  }

  function setTray(on) {
    if (ui.btn) ui.btn.classList.toggle('sd-in-tray', !!on);
  }

  function mountFloating(cls) {
    setTray(false);
    setFloat(cls);
    clearSizing();
    if (ui.btn.parentElement !== document.body) document.body.appendChild(ui.btn);
  }

  // Runs at load, every second after (the ribbon can re-render), and right
  // after the location setting changes, so a new choice applies at once.
  function mountButton() {
    injectStyles();
    var loc = buttonLocation();
    if (loc === 'hidden') {
      if (ui.btn && ui.btn.isConnected) ui.btn.remove();
      return;
    }
    if (!ui.btn) ui.btn = makeButton();
    if (loc === 'pill-tray' || loc === 'pill-tray-left') {
      // CardMirror's bottom-left row of pills (Dropzone, Send, Receive). We sit
      // at the far right (or the far left, ahead of Dropzone; the other pills
      // slide over). CardMirror re-appends the Receive pill when it comes back
      // from the home screen, so re-check our spot every pass.
      var tray = document.querySelector('.pmd-pill-tray');
      if (tray) {
        if (loc === 'pill-tray-left') {
          if (ui.btn.parentElement !== tray || tray.firstElementChild !== ui.btn) tray.insertBefore(ui.btn, tray.firstElementChild);
        } else if (ui.btn.parentElement !== tray || tray.lastElementChild !== ui.btn) {
          tray.appendChild(ui.btn);
        }
        setFloat(null);
        clearSizing();
        setTray(true);
        return;
      }
      loc = 'after-pi'; // no tray yet (or none in this window): fall back to the ribbon
    }
    setTray(false);
    if (loc === 'float-br' || loc === 'float-bl') {
      mountFloating(loc === 'float-bl' ? 'sd-float-bl' : 'sd-floating');
      return;
    }
    var neighbor = null;
    if (loc === 'after-pi') neighbor = findNeighbor(NEIGHBOR_PATTERN);
    if (neighbor) {
      if (ui.btn.previousElementSibling !== neighbor) neighbor.insertAdjacentElement('afterend', ui.btn);
      setFloat(null);
      matchSize(neighbor);
      return;
    }
    var host = findRibbon();
    if (host) {
      // Slot in just before CardMirror's own Home / Settings buttons so we
      // never sit on top of them; otherwise append to the ribbon.
      var edge = findEdgeButton(host);
      if (edge) {
        if (ui.btn.nextElementSibling !== edge) edge.insertAdjacentElement('beforebegin', ui.btn);
      } else if (ui.btn.parentElement !== host || ui.btn.nextElementSibling) {
        host.appendChild(ui.btn);
      }
      setFloat(null);
      matchSize(host.querySelector('button:not(.sd-btn)'));
    } else {
      // no ribbon found: float bottom-right so the button is never lost
      mountFloating('sd-floating');
    }
  }

  // Re-place the button and re-anchor an open panel (after a setting change).
  function applyButtonLocation() {
    try { mountButton(); } catch (e) { dlog('button placement failed:', errInfo(e)); }
    if (ui.panel) { ui.anchor = pickAnchor(); positionPanel(); }
  }

  // ---- room input / recent rooms ---------------------------------------------

  var RECENTS_KEY = 'recentRooms';
  var NAME_MAX = 60;

  // Accepts a bare room code or a link such as https://speechdrop.net/ABC123
  // (scheme optional). Returns the code, or null if it doesn't look like one.
  function parseRoomInput(raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return null;
    if (/[\/.:]/.test(v)) {
      var u = null;
      try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : 'https://' + v); } catch (e) { u = null; }
      if (!u) return null;
      var seg = u.pathname.split('/').filter(Boolean)[0];
      if (!seg) return null;
      try { v = decodeURIComponent(seg); } catch (e) { v = seg; }
    }
    return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
  }

  function clipName(n) {
    n = String(n || '').trim();
    return n.length > NAME_MAX ? n.slice(0, NAME_MAX - 1) + '\u2026' : n;
  }

  function clampNum(v, min, max, def) {
    v = Number(v);
    if (!isFinite(v)) return def;
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function maxRecents() { return clampNum(getSetting('recent-rooms-count', 5), 1, 20, 5); }

  function getRecents() {
    var r = store(RECENTS_KEY);
    if (!Array.isArray(r)) return [];
    return r.filter(function (x) { return x && typeof x.code === 'string'; }).slice(0, maxRecents());
  }

  // ---- history of ALL rooms (optional; see the "keep-room-history" setting) ----
  var HISTORY_KEY = 'roomHistory';

  function historyOn() { return getSetting('keep-room-history', true) !== false; }

  function getHistory() {
    var h = store(HISTORY_KEY);
    if (!Array.isArray(h)) return [];
    return h.filter(function (x) { return x && typeof x.code === 'string'; });
  }

  function recordHistory(code, name, docs) {
    if (!historyOn() || !code) return;
    var limit = clampNum(getSetting('history-limit', 200), 10, 2000, 200);
    var list = getHistory();
    var now = Date.now();
    var e = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) { e = list.splice(i, 1)[0]; break; }
    }
    if (!e) e = { code: code, first: now, docs: [] };
    if (name) e.name = String(name).slice(0, 120);
    e.last = now;
    if (docs) {
      var have = {};
      e.docs = (e.docs || []).filter(function (n) { if (have[n]) return false; have[n] = 1; return true; });
      docs.forEach(function (d) {
        var n = String((d && d.name) || d || '');
        if (n && !have[n]) { have[n] = 1; e.docs.push(n); }
      });
      e.docs = e.docs.slice(-200);
    }
    list.unshift(e);
    storeSet(HISTORY_KEY, list.slice(0, limit));
  }

  // Best known name for a room: recents first, then history.
  function nameFor(code) {
    var r = getRecents().filter(function (x) { return x.code === code; })[0];
    if (r && r.name) return r.name;
    var h = getHistory().filter(function (x) { return x.code === code; })[0];
    return (h && h.name) || '';
  }

  function rememberRoom(code, name, docs) {
    var list = getRecents();
    var prev = list.filter(function (r) { return r.code === code; })[0];
    list = list.filter(function (r) { return r.code !== code; });
    list.unshift({ code: code, name: clipName(name || (prev && prev.name) || ''), t: Date.now() });
    storeSet(RECENTS_KEY, list.slice(0, maxRecents()));
    recordHistory(code, name, docs);
  }

  function forgetRoom(code) {
    storeSet(RECENTS_KEY, getRecents().filter(function (r) { return r.code !== code; }));
  }

  // ---- reading a .docx (used by Open / Insert) ------------------------------
  //
  // Small, lossy reader: unzip (DecompressionStream) -> word/document.xml ->
  // CardMirror-style JSON (pocket/hat/block/tag/cards/paragraphs + basic marks).

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  async function inflateRaw(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipEntry(buf, wanted) {
    var d = new Uint8Array(buf);
    var e = -1;
    for (var i = d.length - 22; i >= Math.max(0, d.length - 65557); i--) {
      if (u32(d, i) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error('That file is not a valid .docx.');
    var count = u16(d, e + 10), off = u32(d, e + 16);
    var dec = new TextDecoder();
    for (var n = 0; n < count; n++) {
      if (u32(d, off) !== 0x02014b50) break;
      var method = u16(d, off + 10), csize = u32(d, off + 20);
      var nlen = u16(d, off + 28), xlen = u16(d, off + 30), clen = u16(d, off + 32), lho = u32(d, off + 42);
      var name = dec.decode(d.subarray(off + 46, off + 46 + nlen));
      if (name === wanted) {
        var start = lho + 30 + u16(d, lho + 26) + u16(d, lho + 28);
        var raw = d.subarray(start, start + csize);
        return method === 0 ? raw : inflateRaw(raw);
      }
      off += 46 + nlen + xlen + clen;
    }
    return null;
  }

  var STYLE_TO_NODE = {
    heading1: 'pocket', pocket: 'pocket', heading2: 'hat', hat: 'hat',
    heading3: 'block', block: 'block', heading4: 'tag', tag: 'tag',
    analytic: 'analytic', undertag: 'undertag',
  };
  var CHAR_STYLE_MARK = {
    cite: 'cite_mark', style13ptbold: 'cite_mark',
    underline: 'underline_mark', styleunderline: 'underline_mark',
    emphasis: 'emphasis_mark',
  };

  // Style ids in a .docx can differ from their names (and styles can be based on
  // other styles), so read word/styles.xml and match by id, then by name, then
  // walk up the basedOn chain.
  async function readStyles(buf) {
    var map = {};
    try {
      var xml = await unzipEntry(buf, 'word/styles.xml');
      if (!xml) return map;
      var dom = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
      var list = dom.getElementsByTagNameNS(W_NS, 'style');
      for (var i = 0; i < list.length; i++) {
        var st = list[i];
        var id = st.getAttributeNS(W_NS, 'styleId') || st.getAttribute('w:styleId');
        if (!id) continue;
        var nameEl = firstChildNS(st, 'name'), basedEl = firstChildNS(st, 'basedOn');
        map[id] = { name: nameEl ? wval(nameEl) : '', basedOn: basedEl ? wval(basedEl) : '' };
      }
    } catch (e) { dlog('styles.xml read failed:', e && e.message); }
    return map;
  }

  function resolveStyleKey(id, styles, table) {
    var cur = id, hops = 0;
    while (cur && hops++ < 5) {
      var k = norm(cur);
      if (table[k]) return table[k];
      var st = styles && styles[cur];
      if (!st) return null;
      k = norm(st.name);
      if (table[k]) return table[k];
      cur = st.basedOn;
    }
    return null;
  }

  function newId() {
    return (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      ('h' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  }
  function firstChildNS(node, local) {
    for (var i = 0; i < node.children.length; i++) if (node.children[i].localName === local) return node.children[i];
    return null;
  }
  function wval(n) { return n.getAttributeNS(W_NS, 'val') || n.getAttribute('w:val') || ''; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function collectParas(node, out) {
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i], ln = c.localName;
      if (ln === 'p') out.push(c);
      else if (/^(tbl|tr|tc|sdt|sdtContent)$/.test(ln)) collectParas(c, out);
    }
  }

  function walkRuns(node, fn) {
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i], ln = c.localName;
      if (ln === 'r') fn(c);
      else if (/^(hyperlink|ins|smartTag|sdt|sdtContent|fldSimple|customXml)$/.test(ln)) walkRuns(c, fn);
    }
  }

  function parseRun(r, out, styles) {
    var marks = [];
    var rPr = firstChildNS(r, 'rPr');
    if (rPr) {
      for (var i = 0; i < rPr.children.length; i++) {
        var c = rPr.children[i], ln = c.localName, v = wval(c);
        var off = v === '0' || v === 'false' || v === 'off';
        if (ln === 'b' && !off) marks.push({ type: 'bold' });
        else if (ln === 'i' && !off) marks.push({ type: 'italic' });
        else if (ln === 'strike' && !off) marks.push({ type: 'strikethrough' });
        else if (ln === 'u' && v && v !== 'none') marks.push({ type: 'underline_direct' });
        else if (ln === 'vertAlign' && (v === 'superscript' || v === 'subscript')) marks.push({ type: v });
        else if (ln === 'sz') { var hp = parseInt(v, 10); if (hp > 0) marks.push({ type: 'font_size', attrs: { halfPoints: hp } }); }
        else if (ln === 'color' && /^[0-9a-f]{6}$/i.test(v)) marks.push({ type: 'font_color', attrs: { color: v } });
        else if (ln === 'highlight' && v && v !== 'none') marks.push({ type: 'highlight', attrs: { color: v } });
        else if (ln === 'rStyle') { var m = resolveStyleKey(v, styles, CHAR_STYLE_MARK); if (m) marks.push({ type: m }); }
      }
    }
    var buf = '';
    function flushText() {
      if (!buf) return;
      var n = { type: 'text', text: buf };
      if (marks.length) n.marks = marks;
      out.push(n);
      buf = '';
    }
    for (var j = 0; j < r.children.length; j++) {
      var k = r.children[j], kn = k.localName;
      if (kn === 't') buf += k.textContent;
      else if (kn === 'tab') buf += '\t';
      else if (kn === 'br' || kn === 'cr') { flushText(); out.push({ type: 'hard_break' }); }
    }
    flushText();
  }

  async function docxToJson(buf) {
    var xml = await unzipEntry(buf, 'word/document.xml');
    if (!xml) throw new Error('That .docx has no document body.');
    var dom = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
    var body = dom.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!body) throw new Error('That .docx has no document body.');
    var styles = await readStyles(buf);
    var paras = [];
    collectParas(body, paras);

    var out = [], card = null;
    paras.forEach(function (p) {
      var pPr = firstChildNS(p, 'pPr');
      var ps = pPr && firstChildNS(pPr, 'pStyle');
      var type = ps ? resolveStyleKey(wval(ps), styles, STYLE_TO_NODE) : null;
      var content = [];
      walkRuns(p, function (r) { parseRun(r, content, styles); });
      var hasText = content.some(function (n) { return n.type === 'text' && n.text.trim(); });
      function node(t, withId) {
        var n = { type: t };
        if (withId) n.attrs = { id: newId() };
        if (content.length) n.content = content;
        return n;
      }
      if (type === 'pocket' || type === 'hat' || type === 'block') {
        card = null;
        out.push(node(type, true));
      } else if (type === 'tag') {
        card = { type: 'card', content: [node('tag', true)] };
        out.push(card);
      } else if (type === 'analytic') {
        card = null;
        out.push(node('analytic', true));
      } else if (!hasText) {
        // skip empty paragraphs
      } else if (type === 'undertag') {
        if (card) card.content.push(node('undertag', false)); else out.push(node('paragraph', false));
      } else if (card) {
        var first = content[0];
        var isCite = card.content.length === 1 && first && first.marks &&
          first.marks.some(function (m) { return m.type === 'cite_mark'; });
        card.content.push(node(isCite ? 'cite_paragraph' : 'card_body', false));
      } else {
        out.push(node('paragraph', false));
      }
    });
    return out;
  }

  function inlineHtml(content) {
    var h = '';
    (content || []).forEach(function (n) {
      if (n.type === 'hard_break') { h += '<br>'; return; }
      var t = esc(n.text || '').replace(/\t/g, '&emsp;');
      (n.marks || []).forEach(function (m) {
        if (m.type === 'bold' || m.type === 'cite_mark' || m.type === 'emphasis_mark') t = '<strong>' + t + '</strong>';
        if (m.type === 'italic') t = '<em>' + t + '</em>';
        if (m.type === 'underline_direct' || m.type === 'underline_mark' || m.type === 'emphasis_mark') t = '<u>' + t + '</u>';
        if (m.type === 'strikethrough') t = '<s>' + t + '</s>';
        if (m.type === 'superscript') t = '<sup>' + t + '</sup>';
        if (m.type === 'subscript') t = '<sub>' + t + '</sub>';
        if (m.type === 'highlight') t = '<mark>' + t + '</mark>';
      });
      h += t;
    });
    return h;
  }

  var HTML_TAG = { pocket: 'h1', hat: 'h2', block: 'h3', tag: 'h4', analytic: 'h4' };
  function jsonToHtml(nodes) {
    return (nodes || []).map(function (n) {
      if (n.type === 'card') return jsonToHtml(n.content);
      var tag = HTML_TAG[n.type] || 'p';
      return '<' + tag + '>' + inlineHtml(n.content) + '</' + tag + '>';
    }).join('');
  }
  function jsonToText(nodes) {
    return (nodes || []).map(function (n) {
      if (n.type === 'card') return jsonToText(n.content);
      return (n.content || []).map(function (c) { return c.type === 'hard_break' ? '\n' : (c.text || ''); }).join('');
    }).join('\n');
  }

  // ---- Open / Insert into CardMirror -------------------------------------------
  //
  // UNVERIFIED host hooks (the plugin API has no "open document" / "insert"):
  //  - Open: hands CardMirror the .docx as a synthetic file drop (its own importer
  //    reads it, and the file name becomes the title).
  //  - Insert: finds the editor's ProseMirror view and appends the doc to the end;
  //    if the view can't be found, moves the caret to the end and fires a paste.

  function findView(root) {
    function isView(o) {
      try { return !!o && typeof o === 'object' && o.dom === root && o.state && typeof o.dispatch === 'function'; }
      catch (e) { return false; }
    }
    var first = [];
    try { Object.getOwnPropertyNames(root).forEach(function (k) { try { first.push(root[k]); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
    try { Object.keys(window).slice(0, 600).forEach(function (k) { try { first.push(window[k]); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
    var i, j;
    for (i = 0; i < first.length; i++) if (isView(first[i])) return first[i];
    for (i = 0; i < first.length; i++) {
      var c = first[i];
      if (!c || typeof c !== 'object' || c === window || (typeof Node !== 'undefined' && c instanceof Node)) continue;
      var vals = [];
      try {
        if (c instanceof Map || c instanceof Set) vals = Array.from(c.values ? c.values() : c);
        else if (Array.isArray(c)) vals = c;
        else vals = Object.keys(c).slice(0, 60).map(function (k) { try { return c[k]; } catch (e) { return null; } });
      } catch (e) { vals = []; }
      for (j = 0; j < vals.length; j++) if (isView(vals[j])) return vals[j];
    }
    return null;
  }

  var droppedMarks = {};
  function stripUnknownMarks(schema, nodes) {
    return (nodes || []).map(function (n) {
      var c = {};
      Object.keys(n).forEach(function (k) { c[k] = n[k]; });
      if (c.marks) {
        c.marks = c.marks.filter(function (m) {
          if (schema.marks[m.type]) return true;
          droppedMarks[m.type] = 1;
          return false;
        });
        if (!c.marks.length) delete c.marks;
      }
      if (c.content) c.content = stripUnknownMarks(schema, c.content);
      return c;
    });
  }

  function flattenAnalytics(nodes) {
    return (nodes || []).map(function (n) {
      if (n.type === 'analytic') return { type: 'paragraph', content: n.content };
      return n;
    }).filter(Boolean);
  }

  // Last resort: dissolve cards into plain paragraphs (headings are kept).
  function unwrapCards(nodes) {
    var out = [];
    (nodes || []).forEach(function (n) {
      if (n.type === 'card') {
        (n.content || []).forEach(function (c) {
          out.push(c.type === 'tag' ? c : { type: 'paragraph', content: c.content });
        });
      } else out.push(n);
    });
    return out;
  }

  // Make our JSON fit the live schema: wrap analytics in analytic_unit when the
  // schema has one, and turn node types the schema doesn't know into paragraphs.
  function adaptForSchema(schema, arr) {
    var unknown = {};
    function fix(n) {
      if (!n || n.type === 'text' || n.type === 'hard_break') return n;
      var o = {};
      Object.keys(n).forEach(function (k) { o[k] = n[k]; });
      if (o.content) o.content = o.content.map(fix);
      if (!schema.nodes[o.type]) { unknown[o.type] = 1; o.type = 'paragraph'; delete o.attrs; }
      return o;
    }
    var top = (arr || []).map(fix);
    if (schema.nodes.analytic_unit && schema.nodes.analytic) {
      top = top.map(function (n) {
        return n.type === 'analytic' ? { type: 'analytic_unit', content: [n] } : n;
      });
    }
    var u = Object.keys(unknown);
    if (u.length) dlog('insert: schema has no node type(s):', u.join(', '), '(used paragraph instead)');
    return top;
  }

  function buildFragment(schema, arr) {
    var variants = [
      ['as-is', function () { return arr; }],
      ['flat-analytics', function () { return flattenAnalytics(arr); }],
      ['unwrapped-cards', function () { return unwrapCards(flattenAnalytics(arr)); }],
    ];
    var lastErr = null;
    for (var i = 0; i < variants.length; i++) {
      try {
        var adapted = adaptForSchema(schema, variants[i][1]());
        var doc = schema.nodeFromJSON({ type: 'doc', content: stripUnknownMarks(schema, adapted) });
        doc.check();
        var dm = Object.keys(droppedMarks);
        if (dm.length) dlog('insert: dropped mark type(s) not in schema:', dm.join(', '));
        dlog('insert: built fragment using variant "' + variants[i][0] + '"');
        return doc.content;
      } catch (e) {
        lastErr = e;
        dlog('insert: variant "' + variants[i][0] + '" failed:', String((e && e.message) || e).slice(0, 200));
      }
    }
    throw lastErr || new Error('Could not build the document.');
  }

  function countTypes(frag) {
    var c = {};
    try { frag.descendants(function (n) { c[n.type.name] = (c[n.type.name] || 0) + 1; }); } catch (e) { /* ignore */ }
    return JSON.stringify(c);
  }

  function logSchema(schema) {
    try {
      dlog('schema nodes:', Object.keys(schema.nodes).map(function (n) {
        var sp = schema.nodes[n].spec || {};
        return n + (sp.content ? '{' + sp.content + '}' : '');
      }).join(' | '));
      dlog('schema marks:', Object.keys(schema.marks).join(', '));
    } catch (e) { dlog('schema dump failed:', e && e.message); }
  }

  // ---- serialize with the SCHEMA'S OWN toDOM (so a paste round-trips) ------------
  function renderSpec(spec) {
    if (typeof spec === 'string') return { dom: document.createTextNode(spec) };
    if (spec && spec.nodeType != null) return { dom: spec };
    if (spec && spec.dom && spec.dom.nodeType != null) return { dom: spec.dom, contentDOM: spec.contentDOM };
    var tag = spec[0];
    var sp = tag.indexOf(' ');
    if (sp > 0) tag = tag.slice(sp + 1);
    var dom = document.createElement(tag), contentDOM = null, start = 1;
    var attrs = spec[1];
    if (attrs && typeof attrs === 'object' && attrs.nodeType == null && !Array.isArray(attrs)) {
      start = 2;
      Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) dom.setAttribute(k, attrs[k]); });
    }
    for (var i = start; i < spec.length; i++) {
      var child = spec[i];
      if (child === 0) { contentDOM = dom; break; }
      var r = renderSpec(child);
      dom.appendChild(r.dom);
      if (r.contentDOM) contentDOM = r.contentDOM;
    }
    return { dom: dom, contentDOM: contentDOM };
  }

  function serializeNode(node) {
    if (node.isText) {
      var dom = document.createTextNode(node.text);
      for (var i = node.marks.length - 1; i >= 0; i--) {
        var mspec = node.marks[i].type.spec.toDOM && node.marks[i].type.spec.toDOM(node.marks[i], true);
        if (!mspec) continue;
        var mr = renderSpec(mspec);
        (mr.contentDOM || mr.dom).appendChild(dom);
        dom = mr.dom;
      }
      return dom;
    }
    var spec = node.type.spec.toDOM && node.type.spec.toDOM(node);
    if (!spec) {
      var frag = document.createDocumentFragment();
      node.forEach(function (ch) { frag.appendChild(serializeNode(ch)); });
      return frag;
    }
    var r = renderSpec(spec);
    if (r.contentDOM) node.forEach(function (ch) { r.contentDOM.appendChild(serializeNode(ch)); });
    return r.dom;
  }

  function fragmentToHtml(frag) {
    var box = document.createElement('div');
    frag.forEach(function (n) { box.appendChild(serializeNode(n)); });
    return box.innerHTML;
  }

  function schemaOf(root, view) {
    if (view && view.state && view.state.schema) return view.state.schema;
    var n = root && root.pmViewDesc && root.pmViewDesc.node;
    return n && n.type && n.type.schema ? n.type.schema : null;
  }

  async function insertIntoCurrentDoc(arr) {
    var root = findEditorRoot();
    dlog('insert: editor root', root ? 'found' : 'MISSING', '| roots:', describeRoots());
    if (!root) {
      var err = new Error('Click into the document you want to insert into first.');
      err.userFacing = true;
      throw err;
    }
    var view = findView(root);
    var schema = schemaOf(root, view);
    dlog('insert: findView', view ? 'found' : 'NOT found', '| schema', schema ? 'ok' : 'MISSING');
    if (schema) logSchema(schema);

    if (view && schema) {
      var frag = buildFragment(schema, arr);
      dlog('insert: fragment contents', countTypes(frag));
      var before = view.state.doc.content.size;
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, frag).scrollIntoView());
      dlog('insert: dispatched; doc size', before, '->', view.state.doc.content.size,
        '| doc now', countTypes(view.state.doc.content));
      return 'view';
    }

    root.focus({ preventScroll: true });
    var sel = window.getSelection();
    sel.selectAllChildren(root);
    sel.collapseToEnd();
    await delay(120);
    var dt = new DataTransfer();
    if (schema) {
      var f2 = buildFragment(schema, arr);
      dlog('insert: fragment contents', countTypes(f2));
      dt.setData('text/html', fragmentToHtml(f2));
      dlog('insert: pasting HTML serialized by the editor schema');
    } else {
      dt.setData('text/html', jsonToHtml(arr));
      dlog('insert: pasting generic HTML (no schema available)');
    }
    dt.setData('text/plain', jsonToText(arr));
    root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    dlog('insert: paste event dispatched');
    return 'paste';
  }

  // CardMirror (desktop) opens a dropped file by its path on disk, so a file made
  // in memory is rejected ("try dragging it from a folder"). To give it a real
  // file, we save the doc into a folder you pick once (File System Access API),
  // then drop that on-disk file into CardMirror.

  var idbPromise = null;
  function idb() {
    if (!idbPromise) {
      idbPromise = new Promise(function (resolve, reject) {
        var r = indexedDB.open('speechdrop-plugin', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    }
    return idbPromise;
  }
  async function idbGet(key) {
    var db = await idb();
    return new Promise(function (resolve, reject) {
      var q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = function () { resolve(q.result); };
      q.onerror = function () { reject(q.error); };
    });
  }
  async function idbSet(key, value) {
    var db = await idb();
    return new Promise(function (resolve, reject) {
      var q = db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
      q.onsuccess = function () { resolve(); };
      q.onerror = function () { reject(q.error); };
    });
  }

  // Must be called straight from a click / key press (the folder picker and the
  // permission prompt both need a user gesture). Resolves to null if the folder
  // API isn't available; rejects with AbortError if the user cancels the picker.
  async function getSaveDir(forcePick) {
    if (typeof window.showDirectoryPicker !== 'function') return null;
    var h = forcePick ? null : ui.dirHandle;
    if (!h && !forcePick) {
      try { h = ui.dirHandle = (await idbGet('saveDir')) || null; } catch (e) { h = null; }
    }
    if (h) {
      try {
        var perm = await h.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') return h;
      } catch (e) { /* fall through to the picker */ }
    }
    var picked = await window.showDirectoryPicker({ id: 'speechdrop-docs', mode: 'readwrite' });
    ui.dirHandle = picked;
    try { await idbSet('saveDir', picked); } catch (e) { /* ignore */ }
    return picked;
  }

  async function uniqueName(dir, name) {
    var base = name.replace(/\.docx$/i, '');
    var n = name;
    for (var i = 2; i < 100; i++) {
      try { await dir.getFileHandle(n); } catch (e) { return n; }
      n = base + ' (' + i + ').docx';
    }
    return n;
  }

  // Resolves to { opened, savedIn }. `opened` is only true if we saw CardMirror
  // react (a new editor appeared or the title changed in this window).
  async function openInCardMirror(blob, name, dir) {
    var mime = blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var fname = safeName(name, 'docx');
    var file = null, savedIn = '';
    if (dir) {
      try {
        fname = await uniqueName(dir, fname);
        var fh = await dir.getFileHandle(fname, { create: true });
        var w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        file = await fh.getFile();
        savedIn = dir.name;
      } catch (e) {
        console.warn('[' + PLUGIN_ID + '] could not save to folder', e);
        file = null;
      }
    }
    if (!file) file = new File([blob], fname, { type: mime });

    var rootsBefore = Array.prototype.slice.call(document.querySelectorAll('.ProseMirror'));
    var titleBefore = apiRef && apiRef.docInfo() ? apiRef.docInfo().docTitle : null;
    var dt = new DataTransfer();
    dt.items.add(file);
    var target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) || document.body;
    if (ui.panel && ui.panel.contains(target)) target = document.body;
    ['dragenter', 'dragover', 'drop'].forEach(function (t) {
      target.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await delay(1500);
    var rootsAfter = Array.prototype.slice.call(document.querySelectorAll('.ProseMirror'));
    var titleAfter = apiRef && apiRef.docInfo() ? apiRef.docInfo().docTitle : null;
    var opened = rootsAfter.some(function (r) { return rootsBefore.indexOf(r) === -1; }) || titleAfter !== titleBefore;
    return { opened: opened, savedIn: savedIn };
  }

  // ---- room data (STUBS: swap these for the real SpeechDrop API calls) -----------

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- SpeechDrop: list a room + download a doc (real; plain GETs, no cookie) ----
  //
  // Verified against speechdrop.net: the room page embeds
  //   window.roomConfig = { mediaUrl, roomName, roomId, initialFiles: [{name, ctime}] }
  // and SpeechDrop's own page script downloads file i from
  //   <origin> + mediaUrl + roomId + "/" + i + "/" + encodeURIComponent(name)
  // where i is the file's position in initialFiles (deleted files leave holes,
  // so the original index is kept).

  function fetchWithTimeout(url, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    var opts = { cache: 'no-store' };
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { if (t) clearTimeout(t); return r; },
      function (e) { if (t) clearTimeout(t); throw e; });
  }

  function netError(e) {
    if (e && e.name === 'AbortError') return new Error('SpeechDrop took too long to answer.');
    return new Error('Could not reach SpeechDrop (' + ((e && e.message) || e) + ').');
  }

  // SpeechDrop HTML-escapes the room name before putting it in roomConfig.
  function decodeEntities(v) {
    v = String(v || '');
    if (v.indexOf('&') === -1) return v;
    try { return new DOMParser().parseFromString(v, 'text/html').documentElement.textContent || v; }
    catch (e) { return v; }
  }

  // Expected shape: { name: string, docs: [{ name: string, ... }] }
  async function fetchRoomInfo(code) {
    var res;
    try { res = await fetchWithTimeout(baseUrl() + '/' + encodeURIComponent(code), 15000); }
    catch (e) { throw netError(e); }
    if (res.status === 404) throw new Error('Room "' + code + '" was not found.');
    if (!res.ok) throw new Error('SpeechDrop returned HTTP ' + res.status + '.');
    var html = await res.text();
    var m = html.match(/window\.roomConfig\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
    if (!m) {
      dlog('room', code, ': no roomConfig in page | HTTP', res.status, '| final url', res.url,
        '| redirected', res.redirected, '| html length', html.length);
      throw new Error('Could not read this room (unexpected page).');
    }
    var cfg;
    try { cfg = JSON.parse(m[1]); } catch (e) { throw new Error("Could not read this room's data."); }
    var mediaUrl = String(cfg.mediaUrl || '/media/uploads/');
    if (!/\/$/.test(mediaUrl)) mediaUrl += '/';
    var roomId = String(cfg.roomId || code);
    var docs = [];
    (cfg.initialFiles || []).forEach(function (f, i) {
      if (!f || !f.name) return;
      var url = null;
      try { url = new URL(mediaUrl + roomId + '/' + i + '/' + encodeURIComponent(f.name), baseUrl() + '/').href; }
      catch (e) { url = null; }
      docs.push({ name: String(f.name), index: i, ctime: f.ctime, url: url });
    });
    // log only when the count changes (polling would otherwise fill the log)
    var logKey = code + ':' + docs.length;
    if (logKey !== lastRoomLog) { lastRoomLog = logKey; dlog('room', code, 'has', docs.length, 'file(s)'); }
    return { name: decodeEntities(cfg.roomName), docs: docs, roomId: roomId };
  }

  // Must resolve to a Blob (.docx).
  async function fetchDocFile(code, doc) {
    if (!/\.docx$/i.test(String(doc.name))) {
      throw new Error('Only .docx files can be opened here ("' + doc.name + '").');
    }
    if (!doc.url) throw new Error('No download link for "' + doc.name + '".');
    var res;
    try { res = await fetchWithTimeout(doc.url, 30000); }
    catch (e) { throw netError(e); }
    if (res.status === 404) throw new Error('"' + doc.name + '" is no longer in the room. Reopen the room to refresh.');
    if (!res.ok) throw new Error('SpeechDrop returned HTTP ' + res.status + ' for "' + doc.name + '".');
    var buf = await res.arrayBuffer();
    dlog('downloaded', doc.name, buf.byteLength, 'bytes');
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ---- panel ---------------------------------------------------------------------

  function positionPanel() {
    var p = ui.panel;
    if (!p) return;
    var w = 300;
    if (buttonLocation() === 'hidden') {
      // No button on screen: center the panel over the document.
      var ed = document.querySelector('.ProseMirror.ProseMirror-focused') || document.querySelector('.ProseMirror');
      var er = ed ? ed.getBoundingClientRect() : null;
      var vw = window.innerWidth, vh = window.innerHeight;
      var left = er && er.width > 0 ? Math.max(er.left, 0) : 0;
      var right = er && er.width > 0 ? Math.min(er.right, vw) : vw;
      var cx = (left + right) / 2;
      cx = Math.max(w / 2 + 8, Math.min(vw - w / 2 - 8, cx));
      p.style.left = cx + 'px';
      p.style.top = '50%';
      p.style.bottom = 'auto';
      p.style.transform = 'translate(-50%,-50%)';
      return;
    }
    p.style.transform = '';
    var anchor = ui.anchor && ui.anchor.isConnected ? ui.anchor : null;
    var r = anchor ? anchor.getBoundingClientRect() : null;
    if (r && r.width > 0) {
      p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
      if (r.top > window.innerHeight / 2) {
        // button sits in the lower half (bottom-floating): open the panel upward
        p.style.top = 'auto';
        p.style.bottom = Math.max(8, window.innerHeight - r.top + 6) + 'px';
      } else {
        p.style.bottom = 'auto';
        p.style.top = Math.max(8, r.bottom + 6) + 'px';
      }
    } else {
      p.style.bottom = 'auto';
      p.style.left = Math.max(8, window.innerWidth - w - 12) + 'px';
      p.style.top = '56px';
    }
  }

  function setStatus(msg) {
    ui.status = msg || '';
    if (ui.statusEl) ui.statusEl.textContent = ui.status;
  }

  function notify(msg) {
    if (ui.panel) setStatus(msg);
    else if (apiRef) apiRef.showToast(msg);
  }

  // Remembers each tracked button so colour flashes don't need a re-render.
  function track(which, btn) {
    ui.refs[which] = btn;
    return btn;
  }

  function clearFlashClasses() {
    Object.keys(ui.refs).forEach(function (k) { ui.refs[k].classList.remove('sd-ok', 'sd-err'); });
  }

  function applyFlash() {
    if (!ui.flash) return;
    var b = ui.refs[ui.flash.which];
    if (b) b.classList.add('sd-' + ui.flash.kind);
  }

  function renderJoin(p) {
    var head = el('div', 'sd-head');
    var titles = el('div', 'sd-titles');
    titles.appendChild(el('div', 'sd-eyebrow', 'SPEECHDROP'));
    titles.appendChild(el('div', 'sd-room', 'Join a Room'));
    head.appendChild(titles);
    var hist = keepFocus(el('button', 'sd-icon'));
    hist.type = 'button';
    hist.title = 'Room History';
    hist.innerHTML = CLOCK_SVG;
    hist.onclick = function () { ui.view = 'history'; renderPanel(); };
    head.appendChild(hist);
    var gear = keepFocus(el('button', 'sd-icon'));
    gear.type = 'button';
    gear.title = 'Settings';
    gear.innerHTML = GEAR_SVG;
    gear.onclick = function () { ui.view = 'settings'; renderPanel(); };
    head.appendChild(gear);
    p.appendChild(head);

    var body = el('div', 'sd-foot');
    body.style.borderTop = '0';
    var input = el('input', 'sd-input');
    input.type = 'text';
    input.placeholder = 'Room code or link';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = ui.joinDraft || '';
    input.addEventListener('input', function () { ui.joinDraft = input.value; });
    var go = track('join', keepFocus(el('button', 'sd-primary', 'Join Room')));
    go.type = 'button';
    function submit() { joinRoom(input.value); }
    go.onclick = submit;
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') closePanel();
    });
    var st = el('div', 'sd-status', ui.status);
    ui.statusEl = st;
    body.appendChild(input);
    body.appendChild(go);
    body.appendChild(st);
    p.appendChild(body);

    var cre = el('div', 'sd-foot');
    cre.style.borderTop = '1px solid color-mix(in srgb,CanvasText 15%,transparent)';
    cre.appendChild(el('div', 'sd-eyebrow', 'CREATE A ROOM'));
    var nameIn = el('input', 'sd-input');
    nameIn.type = 'text';
    nameIn.maxLength = NAME_MAX;
    nameIn.placeholder = 'Room name (required)';
    nameIn.autocomplete = 'off';
    nameIn.style.letterSpacing = 'normal';
    nameIn.value = ui.createDraft || '';
    var count = el('div', 'sd-hint', nameIn.value.length + '/' + NAME_MAX);
    nameIn.addEventListener('input', function () {
      ui.createDraft = nameIn.value;
      count.textContent = nameIn.value.length + '/' + NAME_MAX;
    });
    var mk = track('create', keepFocus(el('button', 'sd-secondary', ui.createBusy ? 'Creating\u2026' : 'Create Room')));
    mk.type = 'button';
    mk.disabled = ui.createBusy;
    mk.onclick = function () { createRoom(nameIn.value); };
    nameIn.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') createRoom(nameIn.value);
      else if (e.key === 'Escape') closePanel();
    });
    cre.appendChild(nameIn);
    cre.appendChild(count);
    cre.appendChild(mk);
    p.appendChild(cre);

    var recents = getRecents();
    if (recents.length) {
      var sec = el('div', 'sd-list');
      sec.style.borderTop = '1px solid color-mix(in srgb,CanvasText 15%,transparent)';
      sec.appendChild(el('div', 'sd-eyebrow sd-recent-h', 'RECENT ROOMS'));
      recents.forEach(function (r) {
        var row = keepFocus(el('div', 'sd-recent'));
        row.title = 'Join ' + r.code;
        var txt = el('div', 'sd-recent-text');
        txt.appendChild(el('div', 'sd-recent-code', r.code));
        if (r.name) {
          var nm = el('div', 'sd-recent-name', clipName(r.name));
          nm.title = r.name;
          txt.appendChild(nm);
        }
        var x = keepFocus(el('button', 'sd-icon', '\u00d7'));
        x.type = 'button';
        x.title = 'Remove from recent rooms';
        x.onclick = function (e) { e.stopPropagation(); forgetRoom(r.code); renderPanel(); };
        row.appendChild(txt);
        row.appendChild(x);
        row.addEventListener('click', function () { joinRoom(r.code); });
        sec.appendChild(row);
      });
      p.appendChild(sec);
    }
    applyFlash();
    setTimeout(function () { input.focus(); }, 0);
  }

  function applyTheme() {
    if (!ui.panel) return;
    var light = getSetting('light-mode', false) === true;
    ui.panel.classList.toggle('sd-light', light);
    ui.panel.classList.toggle('sd-navy', !light && getSetting('dark-blue', false) === true);
  }

  function renderPanel() {
    var p = ui.panel;
    if (!p) return;
    applyTheme();
    var oldList = p.querySelector('.sd-list');
    var scroll = oldList ? oldList.scrollTop : 0;
    p.textContent = '';
    ui.statusEl = null;
    ui.refs = {};
    if (ui.view === 'settings') { renderSettings(p); return; }
    if (ui.view === 'history') { renderHistory(p); return; }
    if (ui.view === 'headings' && ui.room) { renderHeadings(p); return; }
    if (!ui.room) { renderJoin(p); return; }

    var head = el('div', 'sd-head');
    var titles = el('div', 'sd-titles');
    titles.appendChild(el('div', 'sd-eyebrow', 'SPEECHDROP'));
    var codeRow = el('div', 'sd-coderow');
    var codeEl = el('div', 'sd-room', ui.room);
    codeEl.style.cursor = 'pointer';
    codeEl.title = 'Click to copy the room code';
    codeEl.onclick = function (e) {
      e.stopPropagation();
      var c = ui.room;
      copyText(c).then(function (ok) { setStatus(ok ? 'Copied code ' + c : 'Could not copy the code.'); });
    };
    codeRow.appendChild(codeEl);
    var linkBtn = keepFocus(el('button', 'sd-linkicon'));
    linkBtn.type = 'button';
    linkBtn.title = 'Open ' + roomUrl(ui.room) + ' in your browser';
    linkBtn.setAttribute('aria-label', 'Open room in browser');
    linkBtn.innerHTML = LINK_SVG;
    linkBtn.onclick = function (e) { e.stopPropagation(); openRoomLink(ui.room); };
    codeRow.appendChild(linkBtn);
    titles.appendChild(codeRow);
    var shownName = (ui.info && ui.info.name) || nameFor(ui.room);
    if (shownName) {
      var rn = el('div', 'sd-roomname', clipName(shownName));
      rn.title = shownName;
      titles.appendChild(rn);
    }
    head.appendChild(titles);
    var histBtn = keepFocus(el('button', 'sd-icon'));
    histBtn.type = 'button';
    histBtn.title = 'Room History';
    histBtn.innerHTML = CLOCK_SVG;
    histBtn.onclick = function () { ui.view = 'history'; renderPanel(); };
    head.appendChild(histBtn);
    var gearBtn = keepFocus(el('button', 'sd-icon'));
    gearBtn.type = 'button';
    gearBtn.title = 'Settings';
    gearBtn.innerHTML = GEAR_SVG;
    gearBtn.onclick = function () { ui.view = 'settings'; renderPanel(); };
    head.appendChild(gearBtn);
    var refresh = keepFocus(el('button', 'sd-icon', '\u21bb'));
    refresh.type = 'button';
    refresh.title = 'Refresh';
    refresh.onclick = loadRoom;
    head.appendChild(refresh);
    p.appendChild(head);

    var list = el('div', 'sd-list');
    if (ui.loading) {
      list.appendChild(el('div', 'sd-empty', 'Loading\u2026'));
    } else if (ui.error) {
      list.appendChild(el('div', 'sd-empty', ui.error));
    } else if (!ui.info || !ui.info.docs.length) {
      list.appendChild(el('div', 'sd-empty', 'No documents in this room yet.'));
    } else {
      ui.info.docs.forEach(function (d, i) {
        var kind = fileKind(d.name);
        var row = keepFocus(el('div', 'sd-doc'));
        var icon = el('span');
        icon.innerHTML = DOC_SVG;
        icon.style.display = 'inline-flex';
        row.appendChild(icon);
        var nameEl = el('span', 'sd-docname', d.name);
        row.appendChild(nameEl);
        if (kind === 'docx') {
          row.title = 'Open "' + d.name + '" as a new document';
          var ins = track('insert:' + i, keepFocus(el('button', 'sd-mini', 'Insert')));
          ins.type = 'button';
          ins.title = 'Insert at the bottom of your current document';
          ins.onclick = function (e) { e.stopPropagation(); insertDoc(d, i); };
          row.appendChild(ins);
          row.addEventListener('click', function () { openDoc(d); });
        } else if (kind === 'pdf') {
          nameEl.style.color = '#dc2626';
          row.title = 'Open "' + d.name + '" in a viewer window (PDFs can’t be inserted into a doc)';
          row.addEventListener('click', function () { openPdf(d); });
        } else {
          // anything else can't be opened or inserted: show it in red
          nameEl.style.color = '#dc2626';
          row.style.cursor = 'default';
          row.title = '"' + d.name + '" is not a .docx or .pdf, so it can’t be opened here.';
          row.addEventListener('click', function () {
            setStatus('Can’t open "' + d.name + '": only .docx and .pdf files are supported.');
          });
        }
        list.appendChild(row);
      });
    }
    p.appendChild(list);
    if (scroll) list.scrollTop = scroll;

    var foot = el('div', 'sd-foot');
    var uploads = el('div', 'sd-upload');
    var up = track('doc', keepFocus(el('button', 'sd-primary',
      ui.busy && ui.busyWhich === 'doc' ? 'Uploading\u2026' : 'Upload Current Doc')));
    up.type = 'button';
    up.disabled = ui.busy;
    up.onclick = function () { runUpload(ui.room); };
    var upSel = track('selection', keepFocus(el('button', 'sd-secondary',
      ui.busy && ui.busyWhich === 'selection' ? 'Uploading\u2026' : 'Upload Selection')));
    upSel.type = 'button';
    upSel.disabled = ui.busy;
    upSel.title = 'Upload only the text currently highlighted';
    upSel.onclick = function () { runUpload(ui.room, { selection: true }); };
    var upH = track('headingBtn', keepFocus(el('button', 'sd-secondary', 'Upload Heading')));
    upH.type = 'button';
    upH.disabled = ui.busy;
    upH.title = 'Pick a pocket, hat or block from your document and upload just that section';
    upH.onclick = openHeadings;
    var upB = track('browse', keepFocus(el('button', 'sd-secondary',
      ui.busy && ui.busyWhich === 'browse' ? 'Uploading\u2026' : 'Browse')));
    upB.type = 'button';
    upB.disabled = ui.busy;
    upB.title = 'Choose a file from your computer and upload it';
    upB.onclick = browseFile;
    uploads.appendChild(up);
    uploads.appendChild(upSel);
    uploads.appendChild(upH);
    uploads.appendChild(upB);
    foot.appendChild(uploads);

    var row = el('div', 'sd-row');
    var st = el('div', 'sd-status', ui.status);
    st.setAttribute('aria-live', 'polite');
    ui.statusEl = st;
    var leave = keepFocus(el('button', 'sd-link sd-danger', 'Leave Room'));
    leave.type = 'button';
    leave.title = 'Leave this room and join a different one';
    leave.onclick = leaveRoom;
    row.appendChild(st);
    row.appendChild(leave);
    foot.appendChild(row);
    p.appendChild(foot);
    applyFlash();
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        var e = new Error('timed out');
        e.name = 'TimeoutError';
        reject(e);
      }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
                   function (e) { clearTimeout(t); reject(e); });
    });
  }

  function downloadBlob(blob, fname) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 10000);
  }

  // Open and Insert have separate busy flags, so a stuck Open can never block
  // Insert (and vice versa).
  // ---- Open = new blank document, then insert ----------------------------------
  //
  // CardMirror has no "new document" call in the plugin API, so createNewDoc()
  // tries, in order: (1) (selector setting removed),
  // (2) a visible control labelled "New" / "New document" / etc., (3) a
  // synthetic Ctrl/Cmd+N. After each attempt it waits for a fresh editor (or a
  // swapped document in the same editor). It never inserts into the old doc.

  function docIsEmpty(root) {
    var n = root && root.pmViewDesc && root.pmViewDesc.node;
    return !!n && String(n.textContent || '') === '';
  }

  function allRoots() {
    return Array.prototype.slice.call(document.querySelectorAll('.ProseMirror'));
  }

  function editorSnapshot() {
    var nodes = new Map();
    allRoots().forEach(function (r) { nodes.set(r, r.pmViewDesc && r.pmViewDesc.node); });
    return { nodes: nodes, title: document.title };
  }

  function describeRoots() {
    return allRoots().map(function (r, i) {
      var n = r.pmViewDesc && r.pmViewDesc.node;
      return '#' + i + '(len=' + (n ? String(n.textContent || '').length : '?') + ',kids=' + (n ? n.childCount : '?') + ')';
    }).join(' ') || '(none)';
  }

  // A new doc is either a brand-new editor, or an existing editor that now
  // holds a different, empty document.
  async function waitForNewEditor(before, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      await delay(150);
      var roots = allRoots();
      for (var i = roots.length - 1; i >= 0; i--) {
        var r = roots[i];
        if (!before.nodes.has(r)) { dlog('wait: new editor appeared in this window'); return r; }
        if (docIsEmpty(r) && r.pmViewDesc && r.pmViewDesc.node !== before.nodes.get(r)) {
          dlog('wait: an editor here now holds a different, empty doc');
          return r;
        }
      }
    }
    dlog('wait: no new editor in THIS window after', ms, 'ms. roots before:', before.nodes.size,
      '| now:', describeRoots(), '| title before/after:', before.title, '/', document.title);
    return null;
  }

  function findNewDocButton() {
    var cands = document.querySelectorAll('button, [role="button"], [role="menuitem"], a, li, .ribbon *');
    var re = /^(\+\s*)?new(\s+(document|doc|file|tab))?$/i;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (ui.panel && ui.panel.contains(c)) continue;
      if (c.children.length > 3) continue;
      var label = [c.getAttribute('aria-label'), c.getAttribute('title'), c.textContent]
        .map(function (t) { return String(t || '').trim(); });
      if (label.some(function (t) { return re.test(t) || /^new (document|doc|file)\b/i.test(t); })) {
        return { el: c, how: 'button "' + label.filter(Boolean)[0] + '"' };
      }
    }
    return null;
  }

  function sendNewDocShortcut() {
    var mac = /Mac|iPhone|iPad/i.test(navigator.platform || '');
    var targets = [];
    var root = findEditorRoot();
    if (root) targets.push(root);
    if (document.activeElement && targets.indexOf(document.activeElement) === -1) targets.push(document.activeElement);
    targets.push(document.body);
    targets.forEach(function (t) {
      ['keydown', 'keyup'].forEach(function (type) {
        t.dispatchEvent(new KeyboardEvent(type, {
          key: 'n', code: 'KeyN', keyCode: 78, which: 78,
          ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true,
        }));
      });
    });
  }

  // ONE attempt only. Firing a second method after a slow first one is what
  // used to create duplicate documents.
  async function createNewDoc() {
    var before = editorSnapshot();
    var btn = findNewDocButton();
    if (btn) {
      dlog('new doc: clicking', btn.how, '<' + btn.el.tagName.toLowerCase() + '>');
      btn.el.click();
    } else {
      dlog('new doc: no New button found; sending Ctrl/Cmd+N');
      sendNewDocShortcut();
    }
    return waitForNewEditor(before, 6000);
  }

  // If we could not see the new editor appear, hold the doc and insert it the
  // moment the user clicks into an empty editor (within a minute).
  var pendingInsert = null;
  document.addEventListener('focusin', function (e) {
    if (!pendingInsert) return;
    var root = e.target && e.target.closest && e.target.closest('.ProseMirror');
    if (!root || !docIsEmpty(root)) return;
    var p = pendingInsert;
    pendingInsert = null;
    if (Date.now() > p.expires) return;
    lastEditorRoot = root;
    setTimeout(function () {
      insertIntoCurrentDoc(p.arr).then(function () {
        scheduleZoomReset(root);
        setStatus('Opened "' + p.name + '" in the new document.');
      }).catch(function (err) {
        setStatus('Could not insert: ' + ((err && err.message) || err));
      });
    }, 60);
  }, true);

  // ---- Handing the doc to a NEW WINDOW -------------------------------------------
  //
  // CardMirror opens new documents in a new window, and a plugin cannot reach
  // another window's editor. But each window loads its own copy of this plugin,
  // and windows share IndexedDB. So the window that clicks Open leaves the
  // parsed doc in a mailbox BEFORE triggering "new", and the copy of this
  // plugin that starts up in the new window picks it up and inserts it.

  async function idbTake(key) {
    var db = await idb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('kv', 'readwrite');
      var store = tx.objectStore('kv');
      var got;
      var q = store.get(key);
      q.onsuccess = function () { got = q.result; if (got !== undefined) store.delete(key); };
      tx.oncomplete = function () { resolve(got); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  var lastHandoffNote = '';
  function handoffNote(msg) {
    if (msg === lastHandoffNote) return; // only log changes, not every poll
    lastHandoffNote = msg;
    dlog('handoff check:', msg);
  }

  async function checkHandoff() {
    var h;
    try { h = await idbGet('handoff'); } catch (e) { handoffNote('cannot read mailbox: ' + (e && e.message)); return false; }
    if (!h) { lastHandoffNote = ''; return false; }
    if (h.from === WINDOW_ID) { handoffNote('mailbox is mine (sender); skipping'); return false; }
    if (Date.now() > h.expires) { handoffNote('mailbox expired'); return false; }
    var focused = document.hasFocus();
    var loadedAfter = LOADED_AT >= h.created - 1000;
    if (!focused && !loadedAfter) { handoffNote('not focused and loaded before the handoff; skipping'); return false; }
    var roots = allRoots();
    var empties = roots.filter(docIsEmpty);
    if (!empties.length) { handoffNote('no empty editor yet. roots: ' + describeRoots()); return false; }
    var cur = findEditorRoot();
    var root = empties.indexOf(cur) >= 0 ? cur : empties[empties.length - 1];
    var taken;
    try { taken = await idbTake('handoff'); } catch (e) { handoffNote('claim failed: ' + (e && e.message)); return false; }
    if (!taken) { handoffNote('someone else claimed it'); return false; }
    dlog('handoff: CLAIMED "' + taken.name + '" (focused=' + focused + ', loadedAfter=' + loadedAfter + ')');
    try { root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    lastEditorRoot = root;
    try {
      await insertIntoCurrentDoc(taken.arr);
      dlog('handoff: inserted "' + taken.name + '" into this window');
      scheduleZoomReset(root);
      if (apiRef) apiRef.showToast('SpeechDrop: opened "' + taken.name + '".');
    } catch (e) {
      dlog('handoff: insert FAILED:', e && e.message);
      if (apiRef) apiRef.showToast('SpeechDrop: could not insert "' + taken.name + '".');
    }
    return true;
  }

  // Polls for ~25s. Runs at load, when another window announces a handoff, and
  // when this window gains focus.
  var handoffTimer = null;
  function startHandoffWatcher() {
    if (handoffTimer) clearInterval(handoffTimer);
    var tries = 0;
    handoffTimer = setInterval(function () {
      tries++;
      checkHandoff().then(function (done) {
        if (done && handoffTimer) { clearInterval(handoffTimer); handoffTimer = null; }
      });
      if (tries > 60 && handoffTimer) { clearInterval(handoffTimer); handoffTimer = null; }
    }, 400);
  }

  var bc = null;
  try {
    bc = new BroadcastChannel('speechdrop-plugin');
    bc.onmessage = function (ev) {
      if (ev && ev.data && ev.data.type === 'handoff') {
        dlog('woken by broadcast from another window');
        startHandoffWatcher();
      }
    };
  } catch (e) { bc = null; }
  window.addEventListener('focus', function () { checkHandoff(); });

  // ---- Reset zoom to 100% after Open ---------------------------------------------
  //
  // UNVERIFIED: the plugin API has no zoom call. This clears any CSS `zoom` on
  // the editor's ancestors. Run "SpeechDrop: log zoom info" if it doesn't take.

  function resetZoomTo100(root) {
    if (!getSetting('open-at-100', true)) return;
    if (!root || !root.isConnected) root = findEditorRoot();
    var acts = [];
    try {
      var n = root;
      while (n && n.nodeType === 1) {
        var z = parseFloat(window.getComputedStyle(n).zoom);
        if (isFinite(z) && Math.abs(z - 1) > 0.01) {
          acts.push('zoom ' + z + ' -> 1 on <' + n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ')[0] : '') + '>');
          n.style.zoom = '1';
        }
        n = n.parentElement;
      }
    } catch (e) { /* ignore */ }
    dlog('zoom reset:', acts.length ? acts.join('; ') : 'nothing to do / no known zoom control');
  }

  // The new window's zoom may be applied a moment after the editor mounts, so
  // try once shortly after and once again a bit later.
  function scheduleZoomReset(root) {
    setTimeout(function () { resetZoomTo100(root); }, 300);
    setTimeout(function () { resetZoomTo100(root); }, 1500);
  }

  // Lists globals CardMirror's desktop shell added to this window (anything a
  // fresh blank frame doesn't have), plus whether Node/Electron are reachable.
  // Names only, no values. Shows whether the host already exposes a way to make
  // cookie-aware web requests.
  function logHostInfo() {
    dlog('host: typeof require=' + typeof window.require + ', process=' + typeof window.process +
      ', electron=' + typeof window.electron + ', ipcRenderer=' + typeof window.ipcRenderer +
      ', location=' + location.protocol + '//' + (location.host || '(none)') +
      ', crossOriginIsolated=' + window.crossOriginIsolated);
    try {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      document.body.appendChild(f);
      var base = {};
      Object.getOwnPropertyNames(f.contentWindow).forEach(function (k) { base[k] = 1; });
      f.remove();
      var extra = Object.getOwnPropertyNames(window).filter(function (k) { return !base[k]; });
      dlog('host: ' + extra.length + ' non-standard globals:', extra.slice(0, 120).join(', '));
      extra.forEach(function (k) {
        var v;
        try { v = window[k]; } catch (e) { return; }
        if (v && (typeof v === 'object' || typeof v === 'function') && !(v instanceof Node) && /bridge|api|electron|cardmirror|host|ipc|desktop/i.test(k)) {
          var keys = [];
          try { keys = Object.keys(v).slice(0, 60); } catch (e) { /* ignore */ }
          dlog('host: window.' + k + ' (' + typeof v + ') keys:', keys.join(', ') || '(none)');
        }
      });
    } catch (e) { dlog('host: scan failed:', e && e.message); }
  }

  // Troubleshooting: what did CardMirror do with our declared settings?
  // Logs the registration result, app version, and the value the host reports
  // for every declared setting. If these show real values, the host knows about
  // the settings and any missing gear is a host/UI matter; if they are
  // undefined, the host ignored the declaration.
  var settingsWatchOn = false;
  function logSettingsInfo(api) {
    var decl = (DEFINITION && DEFINITION.settings) || [];
    dlog('settings: plugin declares', decl.length, 'setting(s):', decl.map(function (d) { return d.key; }).join(', '));
    dlog('settings: window.__registerCardMirrorPlugin is', typeof window.__registerCardMirrorPlugin,
      '| window.__plugins is', typeof window.__plugins);
    if (!api) { dlog('settings: no api object yet (normal: CardMirror only hands the plugin its API when a command runs; run "SpeechDrop: log settings info" to see what the host reports)'); return; }
    dlog('settings: api keys:', Object.keys(api).join(', '), '| appVersion:', api.appVersion);
    if (!api.settings || typeof api.settings.get !== 'function') {
      dlog('settings: api.settings is MISSING (host too old for plugin settings; needs 0.1.0-beta.22+)');
      return;
    }
    var undef = 0;
    decl.forEach(function (d) {
      var v;
      try { v = api.settings.get(d.key); } catch (e) { v = 'ERR ' + e.message; }
      if (v === undefined) undef++;
      dlog('  setting', d.key, '=', JSON.stringify(v), '(' + typeof v + ')');
    });
    dlog('settings:', undef ? undef + ' of ' + decl.length + ' came back undefined: the host did NOT register them'
                            : 'all ' + decl.length + ' registered with the host');
    if (!settingsWatchOn && typeof api.settings.onChanged === 'function') {
      settingsWatchOn = true;
      try { api.settings.onChanged(function (k, v) { dlog('settings: changed', k, '=', JSON.stringify(v)); }); }
      catch (e) { dlog('settings: onChanged failed:', e && e.message); }
    }
    try {
      if (typeof window.__plugins === 'function') {
        var st = window.__plugins('status');
        Promise.resolve(st).then(function (r) { dlog('__plugins(status):', r); }, function (e) { dlog('__plugins(status) failed:', e && e.message); });
      }
    } catch (e) { dlog('__plugins(status) threw:', e && e.message); }
  }

  function logZoomInfo() {
    var root = findEditorRoot();
    dlog('zoom info: devicePixelRatio', window.devicePixelRatio,
      '| visualViewport.scale', window.visualViewport && window.visualViewport.scale,
      '| innerWidth', window.innerWidth, '| root', root ? 'found' : 'MISSING');
    var n = root;
    while (n && n.nodeType === 1) {
      var cs = window.getComputedStyle(n);
      dlog('  ancestor <' + n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') +
        (n.className ? '.' + String(n.className).split(' ').join('.') : '') + '> zoom=' + cs.zoom +
        ' transform=' + cs.transform + ' fontSize=' + cs.fontSize);
      n = n.parentElement;
    }
    var all = document.querySelectorAll('button, span, div, input, select, [role]');
    var found = 0;
    for (var i = 0; i < all.length && found < 15; i++) {
      var e = all[i];
      if (e.children.length > 2) continue;
      var txt = String(e.value || e.textContent || '').trim();
      if (/^\d{2,3}\s*%$/.test(txt)) {
        found++;
        dlog('  percent-looking <' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
          (e.className ? '.' + String(e.className).split(' ').join('.') : '') + '> text="' + txt +
          '" title="' + (e.getAttribute('title') || '') + '" aria-label="' + (e.getAttribute('aria-label') || '') + '"');
      }
    }
    if (!found) dlog('  no element with text like "50%" found');
  }

  // ---- Auto-refresh (polling) ---------------------------------------------------
  //
  // While a room is joined, re-read its page every ~2s. Cheap by design: one
  // small GET at a time (never overlapping), only in the window that has focus,
  // idle (no network) otherwise, and backs off up to 15s after errors. The first
  // read of a room is a silent baseline; any doc that appears after that turns
  // the SpeechDrop logo green for a few seconds.

  var POLL_MS = 2000, POLL_MAX_MS = 15000;
  var watch = { room: '', userSet: false, timer: null, delay: POLL_MS, busy: false, seen: null, seenRoom: '', sig: '', idxKey: null };

  function docKey(d) { return d.index + '|' + d.name; }

  function setBaseline(code, info) {
    watch.seenRoom = code;
    watch.seen = {};
    (info.docs || []).forEach(function (d) { watch.seen[docKey(d)] = 1; });
    watch.sig = infoSig(info);
  }

  function infoSig(info) {
    return (info.name || '') + '#' + (info.docs || []).map(docKey).join('\n');
  }

  // The logo stays green until the panel is opened again (see openPanel).
  function flashLogo() {
    if (!ui.btn || !getSetting('flash-on-new-docs', true)) return;
    ui.btn.style.setProperty('--sd-color', '#16a34a');
  }

  function clearLogoFlash() {
    if (ui.btn) ui.btn.style.removeProperty('--sd-color');
  }

  function schedulePoll(ms) {
    clearTimeout(watch.timer);
    watch.timer = setTimeout(pollTick, ms);
  }

  function handlePolled(code, info) {
    var sig = infoSig(info);
    if (watch.seenRoom !== code || !watch.seen) {
      setBaseline(code, info);
    } else {
      var fresh = info.docs.filter(function (d) { return !watch.seen[docKey(d)]; });
      if (fresh.length) {
        fresh.forEach(function (d) { watch.seen[docKey(d)] = 1; });
        if (!ui.panel) flashLogo(); // panel open = you're already looking at the list
        dlog('poll: new doc(s) in', code + ':', fresh.map(function (d) { return d.name; }).join(', '));
        if (ui.panel && ui.room === code) {
          setStatus(fresh.length === 1 ? 'New: ' + fresh[0].name : fresh.length + ' new documents.');
        }
      }
    }
    // update the open panel only when something actually changed
    if (ui.room === code && !ui.loading && (sig !== watch.sig || ui.error || !ui.info)) {
      ui.info = info;
      ui.error = '';
      rememberRoom(code, info.name, info.docs);
      if (ui.panel) renderPanel();
    }
    watch.sig = sig;
  }

  async function pollTick() {
    watch.timer = null;
    var code = watch.room;
    if (!code || watch.busy || document.hidden || !document.hasFocus() ) {
      schedulePoll(POLL_MS);
      return;
    }
    watch.busy = true;
    try {
      // Cheap check first: GET /:room/index is just the file list as JSON. Only
      // when it changes do we fetch the full room page (which has the download
      // links and room name).
      var key = null;
      try {
        var ires = await fetchWithTimeout(baseUrl() + '/' + encodeURIComponent(code) + '/index', 15000);
        if (ires.ok) key = code + '|' + (await ires.text());
      } catch (e) { key = null; }
      if (key !== null && key === watch.idxKey && watch.seenRoom === code) {
        watch.delay = POLL_MS; // nothing changed
      } else {
        var info = await fetchRoomInfo(code);
        if (watch.room === code) {
          watch.delay = POLL_MS;
          handlePolled(code, info);
          watch.idxKey = key;
        }
      }
    } catch (e) {
      if (watch.delay === POLL_MS) dlog('poll: error for room', code, '|', errInfo(e)); // first error of a streak only
      watch.delay = Math.min(POLL_MAX_MS, watch.delay * 2);
    } finally {
      watch.busy = false;
      schedulePoll(watch.delay);
    }
  }

  window.addEventListener('focus', function () {
    if (watch.room && !watch.busy) { watch.delay = POLL_MS; schedulePoll(0); }
  });

  function fileKind(name) {
    var n = String(name || '').toLowerCase();
    if (/\.docx$/.test(n)) return 'docx';
    if (/\.pdf$/.test(n)) return 'pdf';
    return 'other';
  }

  // UNVERIFIED: shows the PDF in a full-window overlay using the built-in PDF
  // viewer inside an iframe. If the shell has no PDF viewer the frame stays
  // blank; the Download button in the overlay is the fallback.
  function showPdfOverlay(blob, name) {
    var old = document.getElementById('sd-pdf');
    if (old && old._cleanup) old._cleanup();
    var url = URL.createObjectURL(blob);
    var ov = document.createElement('div');
    ov.id = 'sd-pdf';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;' +
      'background:rgba(0,0,0,.6);padding:24px;box-sizing:border-box;font:13px system-ui,sans-serif;';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 10px;background:Canvas;color:CanvasText;' +
      'border-radius:8px 8px 0 0;border-bottom:1px solid GrayText;';
    var title = document.createElement('span');
    title.textContent = name;
    title.style.cssText = 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    function btn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'padding:4px 10px;cursor:pointer;';
      b.addEventListener('click', fn);
      return b;
    }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      URL.revokeObjectURL(url);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    ov._cleanup = close;
    bar.appendChild(title);
    bar.appendChild(btn('Download', function () { downloadBlob(blob, name); }));
    bar.appendChild(btn('Close', close));
    var frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'flex:1;border:0;background:#fff;border-radius:0 0 8px 8px;';
    ov.appendChild(bar);
    ov.appendChild(frame);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
  }

  async function openPdf(d) {
    if (ui.pdfBusy) return;
    ui.pdfBusy = true;
    try {
      if (!d.url) throw new Error('No download link for "' + d.name + '".');
      setStatus('Getting "' + d.name + '"...');
      var res;
      try { res = await fetchWithTimeout(d.url, 30000); }
      catch (e) { throw netError(e); }
      if (!res.ok) throw new Error('SpeechDrop returned HTTP ' + res.status + ' for "' + d.name + '".');
      var blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      // CardMirror blocks window.open (your log showed that), so show the PDF in
      // an in-page viewer instead.
      showPdfOverlay(blob, d.name);
      setStatus('Opened "' + d.name + '".');
      dlog('pdf shown in in-page viewer:', d.name);
    } catch (e) {
      setStatus('Could not open: ' + ((e && e.message) || e));
      dlog('pdf open FAILED:', errInfo(e));
    } finally {
      ui.pdfBusy = false;
    }
  }

  async function openDoc(d) {
    if (ui.openBusy) return;
    ui.openBusy = true;
    pendingInsert = null;
    dlog('OPEN clicked: "' + d.name + '" | roots here:', describeRoots(), '| hasFocus:', document.hasFocus());
    try {
      setStatus('Getting "' + d.name + '"...');
      var blob = await fetchDocFile(ui.room, d);
      var arr = await docxToJson(await blob.arrayBuffer());
      dlog('parsed doc: top-level nodes =', arr.length);
      if (!arr.length) throw new Error('That document is empty.');

      setStatus('Creating a new document...');
      var mailed = false;
      try {
        await idbSet('handoff', { arr: arr, name: d.name, from: WINDOW_ID, created: Date.now(), expires: Date.now() + 60000 });
        mailed = true;
        dlog('mailbox written for other windows');
        if (bc) bc.postMessage({ type: 'handoff' });
      } catch (e) { dlog('could not write mailbox:', e && e.message); }

      var root = await createNewDoc();
      if (!root) {
        pendingInsert = { arr: arr, name: d.name, expires: Date.now() + 60000 };
        dlog('open: new editor not seen in this window | mailed:', mailed,
          '| if the doc stays empty, check the lines above for "handoff"');
        setStatus(mailed
          ? 'Opened a new document - "' + d.name + '" should fill in there.'
          : 'Opened a new document - click into it and "' + d.name + '" will be inserted.');
        return;
      }
      try { await idbTake('handoff'); } catch (e) { /* ignore */ }
      dlog('new doc is in this window; inserting here');

      await delay(200); // let the new editor finish mounting
      try { root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      lastEditorRoot = root;

      var how = await insertIntoCurrentDoc(arr);
      dlog('opened via new doc +', how);
      scheduleZoomReset(root);
      setStatus('Opened "' + d.name + '" in a new document. (Untitled: use Save As to name it.)');
    } catch (e) {
      setStatus('Could not open: ' + ((e && e.message) || e));
      dlog('open FAILED:', errInfo(e));
    } finally {
      ui.openBusy = false;
    }
  }

  async function insertDoc(d, i) {
    if (ui.insertBusy) return;
    ui.insertBusy = true;
    try {
      setStatus('Inserting "' + d.name + '"...');
      var blob = await fetchDocFile(ui.room, d);
      var arr = await docxToJson(await blob.arrayBuffer());
      if (!arr.length) throw new Error('That document is empty.');
      var how = await insertIntoCurrentDoc(arr);
      console.log('[' + PLUGIN_ID + '] inserted via', how);
      setStatus('Inserted "' + d.name + '" at the bottom of your document.');
      flash('ok', 'insert:' + i);
    } catch (e) {
      setStatus('Could not insert: ' + ((e && e.message) || e));
      flash('err', 'insert:' + i);
      dlog('insert: FAILED |', d.name, '|', errInfo(e));
      console.warn('[' + PLUGIN_ID + '] insert failed', e);
    } finally {
      ui.insertBusy = false;
    }
  }

  async function loadRoom() {
    var code = ui.room;
    if (!code) return;
    ui.loading = true;
    ui.error = '';
    renderPanel();
    var info = null, err = '';
    try {
      info = await fetchRoomInfo(code);
    } catch (e) {
      err = (e && e.message) || 'Could not load this room.';
    }
    if (ui.room !== code) return; // user left / switched while loading
    ui.loading = false;
    ui.info = info;
    ui.error = err;
    if (info) { rememberRoom(code, info.name, info.docs); setBaseline(code, info); }
    renderPanel();
  }

  // Validates first: the room is only opened if its page can actually be read.
  // (SpeechDrop redirects unknown rooms to its home page, which has no room
  // data, so a bad code or link fails here instead of opening a broken panel.)
  // Resolves true if the room was opened.
  async function joinRoom(raw) {
    if (ui.joining) return false;
    var code = parseRoomInput(raw);
    if (!code) {
      setStatus('Could not open. Link may be invalid.');
      flash('err', 'join');
      return false;
    }
    ui.joining = true;
    var jb = ui.refs.join;
    if (jb) { jb.disabled = true; jb.textContent = 'Opening\u2026'; }
    setStatus('Opening room\u2026');
    var info = null, err = null;
    try { info = await fetchRoomInfo(code); } catch (e) { err = e; }
    ui.joining = false;
    if (err || !info) {
      var m = err && /^Could not reach SpeechDrop|too long/.test(err.message || '') ? err.message : 'Could not open. Link may be invalid.';
      dlog('join', code, 'failed:', (err && err.message) || 'no info');
      setStatus(m);
      var jb2 = ui.refs.join;
      if (jb2) { jb2.disabled = false; jb2.textContent = 'Join Room'; }
      flash('err', 'join');
      return false;
    }
    ui.joinDraft = '';
    ui.view = '';
    ui.room = code;
    watch.room = code;
    watch.userSet = true;
    ui.info = info;
    ui.error = '';
    ui.loading = false;
    setBaseline(code, info);
    watch.idxKey = null;
    setStatus('');
    storeSet(LAST_ROOM_KEY, code);
    rememberRoom(code, info.name, info.docs);
    renderPanel();
    return true;
  }

  // ---- room link / open in browser ---------------------------------------------

  function roomUrl(code) { return baseUrl() + '/' + encodeURIComponent(code); }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); },
            function () { resolve(legacyCopy(text)); });
          return;
        }
      } catch (e) { /* fall through */ }
      resolve(legacyCopy(text));
    });
  }

  // CardMirror blocks window.open in some builds, so try the system-browser
  // routes first. Returns true if one of them appears to have worked.
  function openExternal(url) {
    try {
      if (typeof window.require === 'function') {
        var sh = window.require('electron').shell;
        if (sh && typeof sh.openExternal === 'function') { sh.openExternal(url); return true; }
      }
    } catch (e) { /* not available */ }
    try {
      var ex = window.electron && window.electron.shell;
      if (ex && typeof ex.openExternal === 'function') { ex.openExternal(url); return true; }
    } catch (e) { /* not available */ }
    try {
      var w = window.open(url, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* ignore */ } return true; }
    } catch (e) { /* blocked */ }
    return false;
  }

  function openRoomLink(code) {
    if (!code) return;
    var url = roomUrl(code);
    if (openExternal(url)) {
      notify('Opened ' + url + ' in your browser.');
      return;
    }
    dlog('open link: no browser route worked for', url);
    copyText(url).then(function (ok) {
      notify(ok ? 'Could not open a browser from here, so the link was copied: ' + url
                : 'Could not open a browser from here. Link: ' + url);
    });
  }

  // ---- create a room ----------------------------------------------------------
  //
  // From SpeechDrop's server source: POST /makeroom with a form field "name"
  // (required, trimmed, 1 to 60 characters) plus the CSRF token. On success the
  // server answers 302 -> /<roomId>; on a bad name it redirects to "/".

  async function createRoomOnServer(name) {
    var base = baseUrl();
    var path = '/makeroom';
    var field = 'name';

    var token = await getCsrfToken(base, '');
    var form = new FormData();
    form.append('X-XSRF-TOKEN', token);
    form.append(field, name);

    var res = await fetch(base + path, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { 'X-XSRF-TOKEN': token },
      redirect: 'follow',
    });
    var text = '';
    try { text = await res.text(); } catch (e) { /* ignore */ }
    dlog('create room: HTTP', res.status, '| url', res.url, '| redirected', res.redirected,
      '| body starts:', text.slice(0, 120).replace(/\s+/g, ' '));

    if (!res.ok) {
      var he = new Error(res.status === 403
        ? 'SpeechDrop rejected the token (HTTP 403).'
        : 'SpeechDrop returned HTTP ' + res.status + ' for ' + path +
          ' while creating the room.');
      he.userFacing = true;
      throw he;
    }

    var code = null;
    try {
      var seg = new URL(res.url).pathname.split('/').filter(Boolean)[0];
      if (res.redirected && seg && seg !== 'makeroom') code = decodeURIComponent(seg);
      else if (res.redirected && !seg) {
        var re = new Error('SpeechDrop rejected the room name (it must be 1 to 60 characters).');
        re.userFacing = true;
        throw re;
      }
    } catch (e) { if (e && e.userFacing) throw e; }
    if (!code) {
      var rm = /"roomId"\s*:\s*"([A-Za-z0-9_-]{1,64})"/.exec(text);
      if (rm) code = rm[1];
    }
    if (!code) {
      try {
        var j = JSON.parse(text);
        var v = j && (j.roomId || j.id || j.room || j.code);
        if (typeof v === 'string') code = v;
      } catch (e) { /* not JSON */ }
    }
    if (!code && /^[A-Za-z0-9_-]{1,64}$/.test(text.trim())) code = text.trim();

    code = code && parseRoomInput(code);
    if (!code) {
      var ce = new Error('SpeechDrop answered, but the new room code could not be read from its reply (see the debug log).');
      ce.userFacing = true;
      throw ce;
    }
    return code;
  }

  async function createRoom(raw) {
    if (ui.createBusy) return;
    var name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (!name) {
      setStatus('Enter a room name first (SpeechDrop requires one, max ' + NAME_MAX + ' characters).');
      flash('err', 'create');
      return;
    }
    ui.createBusy = true;
    var btn = ui.refs.create;
    if (btn) { btn.disabled = true; btn.textContent = 'Creating\u2026'; }
    setStatus('Creating room\u2026');
    try {
      var code = await createRoomOnServer(name);
      ui.createBusy = false;
      ui.createDraft = '';
      await joinRoom(code);
      rememberRoom(code, name);
      var msg = 'Created room ' + code + '.';
      if (getSetting('copy-link-on-create', true)) {
        var ok = await copyText(roomUrl(code));
        if (ok) msg += ' Link copied.';
      }
      notify(msg);
    } catch (e) {
      ui.createBusy = false;
      var m = (e && e.message) || String(e);
      if (!(e && e.userFacing) && /Failed to fetch|NetworkError|CORS/i.test(m)) {
        m = 'Could not reach SpeechDrop (network or CORS block): ' + m;
      }
      dlog('create room failed:', m);
      setStatus('Could not create room: ' + m);
      var b2 = ui.refs.create;
      if (b2) { b2.disabled = false; b2.textContent = 'Create Room'; }
      flash('err', 'create');
    }
  }

  // ---- settings view ----------------------------------------------------------

  function renderSettings(p) {
    var head = el('div', 'sd-head');
    var back = keepFocus(el('button', 'sd-icon', '\u2190'));
    back.type = 'button';
    back.title = 'Back';
    back.onclick = function () { ui.view = ''; renderPanel(); };
    head.appendChild(back);
    var titles = el('div', 'sd-titles');
    titles.appendChild(el('div', 'sd-eyebrow', 'SPEECHDROP'));
    titles.appendChild(el('div', 'sd-room', 'Settings'));
    titles.appendChild(el('div', 'sd-roomname', 'Changes save automatically.'));
    head.appendChild(titles);
    p.appendChild(head);

    var list = el('div', 'sd-list');
    (DEFINITION.settings || []).forEach(function (d) {
      var row = el('div', 'sd-set');
      var cur = getSetting(d.key, d.default);
      if (d.type === 'boolean') {
        var lab = el('label', 'sd-setlabel');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = cur === true;
        cb.onchange = function () { setPref(d.key, cb.checked); if (d.key === 'light-mode' || d.key === 'dark-blue') applyTheme(); };
        lab.appendChild(cb);
        lab.appendChild(el('span', null, d.label));
        row.appendChild(lab);
      } else if (d.type === 'select') {
        row.appendChild(el('div', 'sd-setlabel', d.label));
        var sel = el('select', 'sd-input');
        sel.style.letterSpacing = 'normal';
        sel.style.marginTop = '4px';
        (d.options || []).forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          sel.appendChild(opt);
        });
        sel.value = (d.options || []).indexOf(cur) >= 0 ? cur : d.default;
        sel.onchange = function () {
          setPref(d.key, sel.value);
          if (d.key === 'button-location') applyButtonLocation();
        };
        sel.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Escape') closePanel();
        });
        row.appendChild(sel);
      } else {
        row.appendChild(el('div', 'sd-setlabel', d.label));
        var inp = el('input', 'sd-input');
        inp.type = d.type === 'number' ? 'number' : 'text';
        inp.value = cur == null ? '' : String(cur);
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.style.letterSpacing = 'normal';
        inp.style.marginTop = '4px';
        inp.onchange = function () {
          if (d.type === 'number') {
            var n = Number(inp.value);
            if (inp.value.trim() === '' || !isFinite(n)) { setPref(d.key, undefined); inp.value = String(d.default); }
            else setPref(d.key, n);
          } else {
            setPref(d.key, inp.value.trim());
          }
        };
        inp.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Enter') inp.blur();
          else if (e.key === 'Escape') closePanel();
        });
        row.appendChild(inp);
      }
      if (d.description) row.appendChild(el('div', 'sd-setdesc', d.description));
      list.appendChild(row);
    });
    p.appendChild(list);

    var foot = el('div', 'sd-foot');
    var rst = keepFocus(el('button', 'sd-link sd-danger', 'Reset to Defaults'));
    rst.type = 'button';
    var armed = false;
    rst.onclick = function () {
      if (!armed) {
        armed = true;
        rst.textContent = 'Click Again to Confirm';
        setTimeout(function () { armed = false; if (rst.isConnected) rst.textContent = 'Reset to Defaults'; }, 4000);
        return;
      }
      storeSet(PREFS_KEY, {});
      mirrorDebugFlag(true);
      applyButtonLocation();
      renderPanel();
    };
    foot.appendChild(rst);
    p.appendChild(foot);
  }

  // ---- history view -----------------------------------------------------------

  function renderHistory(p) {
    var head = el('div', 'sd-head');
    var back = keepFocus(el('button', 'sd-icon', '\u2190'));
    back.type = 'button';
    back.title = 'Back';
    back.onclick = function () { ui.view = ''; ui.histFilter = ''; ui.status = ''; renderPanel(); };
    head.appendChild(back);
    var titles = el('div', 'sd-titles');
    titles.appendChild(el('div', 'sd-eyebrow', 'SPEECHDROP'));
    titles.appendChild(el('div', 'sd-room', 'Room History'));
    head.appendChild(titles);
    p.appendChild(head);

    var all = getHistory();

    var fwrap = el('div', 'sd-foot');
    fwrap.style.borderTop = '0';
    fwrap.style.paddingBottom = '0';
    var input = el('input', 'sd-input');
    input.type = 'text';
    input.placeholder = 'Search rooms, names, documents';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.letterSpacing = 'normal';
    input.value = ui.histFilter || '';
    fwrap.appendChild(input);
    var hst = el('div', 'sd-status', ui.status);
    ui.statusEl = hst;
    fwrap.appendChild(hst);
    p.appendChild(fwrap);

    var list = el('div', 'sd-list');
    p.appendChild(list);

    function fillList() {
      list.textContent = '';
      var q = String(ui.histFilter || '').trim().toLowerCase();
      var rows = all.filter(function (e) {
        if (!q) return true;
        return (e.code + ' ' + (e.name || '') + ' ' + (e.docs || []).join(' ')).toLowerCase().indexOf(q) !== -1;
      });
      if (!rows.length) {
        list.appendChild(el('div', 'sd-empty', all.length ? 'No matches.' :
          (historyOn() ? 'No rooms yet. Rooms you join or create will show up here.' :
            'History is off. Turn on \u201cKeep a history of all rooms\u201d in Settings (the gear icon in this panel).')));
        return;
      }
      rows.forEach(function (e) {
        var row = keepFocus(el('div', 'sd-recent'));
        row.title = 'Join ' + e.code;
        var txt = el('div', 'sd-recent-text');
        txt.appendChild(el('div', 'sd-recent-code', e.code));
        if (e.name) {
          var nm = el('div', 'sd-recent-name', clipName(e.name));
          nm.title = e.name;
          txt.appendChild(nm);
        }
        var meta = [];
        if (e.last) meta.push(new Date(e.last).toLocaleDateString());
        if (e.docs && e.docs.length) meta.push(e.docs.length + (e.docs.length === 1 ? ' doc' : ' docs'));
        if (meta.length) txt.appendChild(el('div', 'sd-recent-meta', meta.join(' \u00b7 ')));
        var x = keepFocus(el('button', 'sd-icon', '\u00d7'));
        x.type = 'button';
        x.title = 'Remove from history';
        x.onclick = function (ev) {
          ev.stopPropagation();
          all = all.filter(function (h) { return h.code !== e.code; });
          storeSet(HISTORY_KEY, all);
          fillList();
        };
        row.appendChild(txt);
        row.appendChild(x);
        row.addEventListener('click', function () { joinRoom(e.code); });
        list.appendChild(row);
      });
    }

    input.addEventListener('input', function () { ui.histFilter = input.value; fillList(); });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') closePanel();
    });
    fillList();

    if (all.length) {
      var foot = el('div', 'sd-foot');
      var clr = keepFocus(el('button', 'sd-link sd-danger', 'Clear History'));
      clr.type = 'button';
      var armed = false;
      clr.onclick = function () {
        if (!armed) {
          armed = true;
          clr.textContent = 'Click Again to Confirm';
          setTimeout(function () { armed = false; if (clr.isConnected) clr.textContent = 'Clear History'; }, 4000);
          return;
        }
        storeSet(HISTORY_KEY, []);
        ui.histFilter = '';
        renderPanel();
      };
      foot.appendChild(clr);
      p.appendChild(foot);
    }
  }

  // ---- add a heading (pocket) from the current doc -----------------------------
  //
  // Lists every pocket in the document you're editing; clicking one uploads that
  // pocket and everything under it (up to the next pocket) as its own .docx.

  function nodeText(n) {
    if (!n) return '';
    if (n.type === 'text') return n.text || '';
    if (n.type === 'hard_break') return ' ';
    return (n.content || []).map(nodeText).join('');
  }

  function pocketTitle(n) {
    var c = n.content || [];
    var inline = c.length && (c[0].type === 'text' || c[0].type === 'hard_break');
    var t = (c.length && !inline ? nodeText(c[0]) : nodeText(n)).replace(/\s+/g, ' ').trim();
    return t || '(untitled ' + (n.type || 'heading') + ')';
  }

  // Hats and blocks under a pocket. The outline is flat (pocket, hat, block are
  // siblings), so each item owns everything after it up to the next heading of
  // the same or a higher level.
  var HEADING_RANK = { pocket: 1, hat: 2, block: 3 };

  function buildChildren(nodes, parentRank) {
    var root = { rank: parentRank, children: [] }, stack = [root];
    nodes.forEach(function (n, idx) {
      var rank = n && HEADING_RANK[n.type];
      if (!rank || rank <= parentRank) return;
      while (stack.length > 1 && stack[stack.length - 1].rank >= rank) stack.pop().end = idx;
      var it = { type: n.type, rank: rank, title: pocketTitle(n), start: idx, end: nodes.length, children: [] };
      stack[stack.length - 1].children.push(it);
      stack.push(it);
    });
    (function fin(list) {
      list.forEach(function (it) { it.nodes = nodes.slice(it.start, it.end); fin(it.children); });
    })(root.children);
    return root.children;
  }

  function collectPockets(json) {
    var top = (json && json.content) || [];
    var out = [], cur = null, types = {};
    top.forEach(function (n) {
      if (!n) return;
      types[n.type] = (types[n.type] || 0) + 1;
      if (n.type === 'pocket') {
        cur = { type: 'pocket', title: pocketTitle(n), nodes: [n] };
        out.push(cur);
      } else if (cur) {
        cur.nodes.push(n);
      }
    });
    if (!out.length) {
      // pockets might be nested inside another container: find them anywhere
      (function walk(nodes) {
        (nodes || []).forEach(function (n) {
          if (!n) return;
          if (n.type === 'pocket') out.push({ type: 'pocket', title: pocketTitle(n), nodes: [n] });
          else walk(n.content);
        });
      })(top);
      if (out.length) dlog('headings: pockets were nested; each is uploaded on its own');
    }
    out.forEach(function (pk) { pk.children = pk.nodes.length > 1 ? buildChildren(pk.nodes.slice(1), 1) : []; });
    dlog('headings: top-level types', JSON.stringify(types), '| pockets found:', out.length);
    return out;
  }

  function refreshHeadings() {
    ui.headings = [];
    ui.headingsErr = '';
    try {
      ui.headings = collectPockets(readDocJson());
    } catch (e) {
      ui.headingsErr = (e && e.message) || 'Could not read the document.';
      if (!(e && e.userFacing)) dlog('headings: read FAILED |', errInfo(e));
    }
  }

  function openHeadings() {
    if (!ui.room) { notify('Join a room first.'); return; }
    refreshHeadings();
    ui.hPath = [];
    ui.hScrolls = [];
    ui.hRestore = null;
    ui.view = 'headings';
    ui.status = '';
    renderPanel();
  }

  // ui.hPath is the chain of indexes you've opened (pocket -> hat -> ...).
  // levelInfo() gives the list shown at the current level and its parent item.
  function levelInfo() {
    var items = ui.headings || [], parent = null, path = ui.hPath || [];
    for (var k = 0; k < path.length; k++) {
      var it = items[path[k]];
      if (!it) { ui.hPath = path.slice(0, k); break; }
      parent = it;
      items = it.children || [];
    }
    return { items: items, parent: parent };
  }

  function openHeadingChild(i) {
    var it = levelInfo().items[i];
    if (!it) return;
    if (!it.children || !it.children.length) {
      setStatus('Nothing inside "' + clipName(it.title) + '".');
      return;
    }
    var list = ui.panel && ui.panel.querySelector('.sd-list');
    ui.hScrolls = (ui.hScrolls || []).concat(list ? list.scrollTop : 0);
    ui.hPath = (ui.hPath || []).concat(i);
    ui.status = '';
    renderPanel();
  }

  // One step back up the drill-down. Returns false when already at the top.
  function closeHeadingLevel() {
    if (!ui.hPath || !ui.hPath.length) return false;
    ui.hPath = ui.hPath.slice(0, -1);
    var sc = (ui.hScrolls || []).slice();
    ui.hRestore = sc.length ? sc.pop() : 0;
    ui.hScrolls = sc;
    ui.status = '';
    renderPanel();
    return true;
  }

  // Tab (while hovering a row) opens it; Esc goes back a level. Anything else,
  // and Esc at the top level, falls through to the panel's normal handling.
  function headingKey(e) {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      var row = ui.panel && ui.panel.querySelector('.sd-list .sd-doc[data-hi]:hover');
      if (!row) return false;
      e.preventDefault();
      e.stopPropagation();
      openHeadingChild(parseInt(row.getAttribute('data-hi'), 10));
      return true;
    }
    if (e.key === 'Escape' && ui.hPath && ui.hPath.length) {
      e.preventDefault();
      e.stopPropagation();
      closeHeadingLevel();
      return true;
    }
    return false;
  }

  function addHeading(i) {
    var h = levelInfo().items[i];
    if (!h || ui.busy) return;
    var path = (ui.hPath || []).concat(i);
    // Remember the titles along the path, so a stale list never uploads old text.
    var titles = [], cur = ui.headings || [];
    path.forEach(function (ix) {
      var it = cur[ix];
      titles.push(it ? it.title : '');
      cur = it ? it.children || [] : [];
    });
    var fresh = null;
    try { fresh = collectPockets(readDocJson()); } catch (e) { fresh = null; }
    if (fresh) {
      var level = fresh, newPath = [], m = null;
      for (var k = 0; k < path.length; k++) {
        var ix = level[path[k]] && level[path[k]].title === titles[k] ? path[k] : -1;
        if (ix < 0) {
          for (var j = 0; j < level.length; j++) { if (level[j].title === titles[k]) { ix = j; break; } }
        }
        if (ix < 0) { m = null; break; }
        m = level[ix];
        newPath.push(ix);
        level = m.children || [];
      }
      ui.headings = fresh;
      if (!m) {
        ui.hPath = [];
        ui.hScrolls = [];
        setStatus('That heading changed or was removed. List refreshed.');
        renderPanel();
        return;
      }
      h = m;
      i = newPath[newPath.length - 1];
      ui.hPath = newPath.slice(0, -1);
    }
    runUpload(ui.room, {
      json: { type: 'doc', content: h.nodes },
      which: 'heading:' + (ui.hPath || []).concat(i).join('.'),
      label: (h.type || 'heading') + ' "' + clipName(h.title) + '"',
      fileName: h.title.slice(0, 80),
    });
  }

  function renderHeadings(p) {
    var lv = levelInfo();
    var head = el('div', 'sd-head');
    var back = keepFocus(el('button', 'sd-icon', '←'));
    back.type = 'button';
    back.title = lv.parent ? 'Back up one level (Esc)' : 'Back';
    back.onclick = function () {
      if (closeHeadingLevel()) return;
      ui.view = '';
      ui.status = '';
      renderPanel();
    };
    head.appendChild(back);
    var titles = el('div', 'sd-titles');
    titles.appendChild(el('div', 'sd-eyebrow', 'SPEECHDROP'));
    var ttl = el('div', 'sd-room', lv.parent ? lv.parent.title : 'Upload a Heading');
    if (lv.parent) {
      ttl.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;';
      ttl.title = lv.parent.title;
    }
    titles.appendChild(ttl);
    titles.appendChild(el('div', 'sd-roomname', lv.parent
      ? 'Inside this ' + lv.parent.type + ' \u00b7 room ' + ui.room
      : 'To room ' + ui.room));
    head.appendChild(titles);
    var rf = keepFocus(el('button', 'sd-icon', '↻'));
    rf.type = 'button';
    rf.title = 'Re-read the headings in your document';
    rf.onclick = function () { refreshHeadings(); renderPanel(); };
    head.appendChild(rf);
    p.appendChild(head);

    var list = el('div', 'sd-list');
    var items = lv.items;
    if (ui.headingsErr) {
      list.appendChild(el('div', 'sd-empty', ui.headingsErr));
    } else if (!items.length) {
      list.appendChild(el('div', 'sd-empty', lv.parent ? 'Nothing inside this ' + lv.parent.type + '.' : 'No pockets found in this document.'));
    } else {
      items.forEach(function (h, i) {
        var key = 'heading:' + (ui.hPath || []).concat(i).join('.');
        var kids = (h.children || []).length;
        var row = keepFocus(el('div', 'sd-doc'));
        row.setAttribute('data-hi', String(i));
        row.title = 'Upload "' + h.title + '" to the room' + (kids ? ' (hover and press Tab to look inside)' : '');
        var nm = el('span', 'sd-docname', h.title);
        row.appendChild(nm);
        if (kids) {
          var more = el('span', 'sd-more', kids + ' \u203a');
          more.title = 'Hover and press Tab to open';
          row.appendChild(more);
        }
        var add = track(key, keepFocus(el('button', 'sd-mini',
          ui.busy && ui.busyWhich === key ? 'Uploading…' : 'Upload')));
        add.type = 'button';
        add.disabled = ui.busy;
        add.onclick = function (e) { e.stopPropagation(); addHeading(i); };
        row.appendChild(add);
        row.addEventListener('click', function () { addHeading(i); });
        list.appendChild(row);
      });
    }
    p.appendChild(list);
    if (ui.hRestore != null) { list.scrollTop = ui.hRestore; ui.hRestore = null; }

    var foot = el('div', 'sd-foot');
    var st = el('div', 'sd-status', ui.status);
    st.setAttribute('aria-live', 'polite');
    ui.statusEl = st;
    foot.appendChild(st);
    foot.appendChild(el('div', 'sd-tabhint', 'Hover + Tab to open \u00b7 Esc to go back'));
    p.appendChild(foot);
    applyFlash();
  }

  // Choose a file from disk and upload it as-is (no rebuilding).
  function browseFile() {
    if (ui.busy) return;
    if (!ui.room) { notify('Join a room first.'); return; }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,.pdf';
    input.style.display = 'none';
    function done() { setTimeout(function () { input.remove(); }, 0); }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      done();
      if (!f) return;
      runUpload(ui.room, { file: f, which: 'browse', label: 'file "' + clipName(f.name) + '"' });
    });
    input.addEventListener('cancel', done);
    document.body.appendChild(input);
    input.click();
  }

  function leaveRoom() {
    ui.view = '';
    watch.room = '';
    watch.userSet = true;
    watch.seenRoom = '';
    ui.room = '';
    ui.info = null;
    ui.error = '';
    ui.loading = false;
    setStatus('');
    storeSet(LAST_ROOM_KEY, '');
    renderPanel();
  }

  function openPanel() {
    if (ui.panel) return;
    clearLogoFlash();
    if (SHOW_BUILTIN_BUTTON) mountButton();
    ui.anchor = pickAnchor();
    var p = el('div', 'sd-panel');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'SpeechDrop');
    ui.panel = p;
    if (!ui.started && !ui.room) {
      // Fresh launch: start on the join screen unless the user opted in to resuming.
      ui.room = getSetting('reopen-last-room', false) ? String(store(LAST_ROOM_KEY) || '') : '';
    }
    ui.started = true;
    ui.info = null;
    ui.error = '';
    ui.status = '';
    ui.view = '';
    document.body.appendChild(p);
    if (ui.btn) ui.btn.setAttribute('aria-expanded', 'true');
    positionPanel();
    renderPanel();
    if (ui.room) loadRoom();

    function onDown(e) {
      if (ui.nameDlg) return;
      // clicks on the opening button are left to its own toggle
      if (p.contains(e.target)) return;
      if (ui.anchor && ui.anchor.contains(e.target)) return;
      if (ui.btn && ui.btn.contains(e.target)) return;
      closePanel();
    }
    function onKey(e) {
      if (ui.nameDlg) return;
      if (ui.view === 'headings' && ui.room && headingKey(e)) return;
      if (e.key === 'Escape') closePanel();
    }
    function onResize() { positionPanel(); }
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    ui.cleanup = function () {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }

  function closePanel() {
    if (!ui.panel) return;
    if (ui.cleanup) ui.cleanup();
    ui.cleanup = null;
    ui.panel.remove();
    ui.panel = null;
    ui.statusEl = null;
    ui.anchor = null;
    if (ui.btn) ui.btn.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() { if (ui.panel) closePanel(); else openPanel(); }

  // ------------------------------------------------------------ registration

  // ---- hotkey helpers -----------------------------------------------------------
  // The commands below all have defaultKey: null, so nothing is bound until you
  // assign keys in CardMirror's keybindings (search "SpeechDrop"). They never
  // need the panel to be open.

  function hasEditorSelection() {
    var root = findEditorRoot();
    var sel = window.getSelection();
    return !!(root && sel && sel.rangeCount > 0 && !sel.isCollapsed &&
      root.contains(sel.anchorNode) && root.contains(sel.focusNode));
  }

  // The room a hotkey upload goes to: the open panel's room, else the last one
  // used; only if neither exists does it ask.
  async function roomForQuickUpload(api) {
    var code = ui.room || api.storage.get(LAST_ROOM_KEY);
    if (typeof code === 'string' && code) return code;
    return promptForRoom('');
  }

  var DEFINITION = {
    id: PLUGIN_ID,
    name: 'SpeechDrop Upload',
    apiVersion: 1,
    settings: [
      {
        key: 'button-location',
        label: 'Where the SpeechDrop button goes',
        type: 'select',
        default: LOC_DEFAULT,
        options: LOC_OPTIONS,
        description: 'Moves the button that opens the panel. Hidden removes it (open the panel with a hotkey or the command palette and it appears in the middle of the document).',
      },
      {
        key: 'light-mode',
        label: 'Light mode',
        type: 'boolean',
        default: false,
        description: 'Forces the SpeechDrop panel to use light colors, even if your system or CardMirror is dark.',
      },
      {
        key: 'dark-blue',
        label: 'Dark blue background (#000222)',
        type: 'boolean',
        default: false,
        description: 'Dark mode only: gives the panel a deep blue background. Ignored while Light mode is on.',
      },
      {
        key: 'open-at-100',
        label: 'Reset zoom to 100% after Open',
        type: 'boolean',
        default: true,
        description: 'Best effort: clears any zoom on the editor after a doc is opened.',
      },
      {
        key: 'keep-room-history',
        label: 'Keep a history of all rooms',
        type: 'boolean',
        default: true,
        description: 'Saves every room you join or create, with its document names. Browse it with the clock icon.',
      },
      {
        key: 'history-limit',
        label: 'Max rooms kept in history',
        type: 'number',
        default: 200,
        description: 'Oldest rooms are dropped past this limit (10 to 2000).',
      },
      {
        key: 'recent-rooms-count',
        label: 'Recent rooms shown',
        type: 'number',
        default: 5,
        description: 'How many rooms appear under "Recent rooms" (1 to 20).',
      },
      {
        key: 'reopen-last-room',
        label: 'Reopen my last room when CardMirror starts',
        type: 'boolean',
        default: false,
        description: 'Off = the panel starts on the join screen with no room open.',
      },
      {
        key: 'copy-link-on-create',
        label: 'Copy the room link when I create a room',
        type: 'boolean',
        default: true,
        description: 'Puts the new room\u2019s link on your clipboard.',
      },
      {
        key: 'flash-on-new-docs',
        label: 'Turn the logo green when a new doc arrives',
        type: 'boolean',
        default: true,
        description: 'Applies while the panel is closed and a room is being watched.',
      },
      {
        key: 'enable-debug-commands',
        label: 'Troubleshooting / log commands',
        type: 'boolean',
        default: true,
        description: 'Off = the "SpeechDrop: log ..." and "show debug log" commands are removed and the debug log stops recording. Takes effect after restarting CardMirror.',
      },
    ],
    commands: [
      {
        id: PLUGIN_ID + '.openPanel',
        label: 'SpeechDrop: Open Panel',
        keywords: ['speechdrop', 'panel', 'room', 'docs', 'menu'],
        defaultKey: null,
        run: function (api) {
          console.log('[' + PLUGIN_ID + '] open panel command ran');
          useApi(api);
          togglePanel();
        },
      },
      {
        id: PLUGIN_ID + '.dumpSchema',
        label: 'SpeechDrop: Log Editor Schema (for Troubleshooting)',
        keywords: ['speechdrop', 'schema', 'debug', 'format'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!debugGate(api)) return;
          var root = findEditorRoot();
          var view = root && findView(root);
          var schema = schemaOf(root, view);
          dlog('dump: root', root ? 'found' : 'MISSING', '| findView', view ? 'found' : 'NOT found');
          if (schema) logSchema(schema); else dlog('dump: no schema available');
          showDebugLog();
        },
      },
      {
        id: PLUGIN_ID + '.logHostInfo',
        label: 'SpeechDrop: Log Host Capabilities (for Troubleshooting)',
        keywords: ['speechdrop', 'host', 'electron', 'debug', 'bridge'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!debugGate(api)) return;
          logHostInfo();
          showDebugLog();
        },
      },
      {
        id: PLUGIN_ID + '.logZoomInfo',
        label: 'SpeechDrop: Log Zoom Info (for Troubleshooting)',
        keywords: ['speechdrop', 'zoom', 'debug', '100'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!debugGate(api)) return;
          logZoomInfo();
          showDebugLog();
        },
      },
      {
        id: PLUGIN_ID + '.showDebugLog',
        label: 'SpeechDrop: Show Debug Log',
        keywords: ['speechdrop', 'debug', 'log', 'troubleshoot'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!debugGate(api)) return;
          showDebugLog();
        },
      },
      {
        id: PLUGIN_ID + '.chooseFolder',
        label: 'SpeechDrop: Choose Folder for Opened Docs',
        keywords: ['speechdrop', 'folder', 'save', 'open', 'directory'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          try {
            var dir = await getSaveDir(true);
            if (dir) api.showToast('SpeechDrop: opened docs will be saved in "' + dir.name + '".');
            else api.showToast('SpeechDrop: this environment cannot pick folders.');
          } catch (e) {
            if (!e || e.name !== 'AbortError') api.showToast('SpeechDrop: could not choose a folder.');
          }
        },
      },
      {
        id: PLUGIN_ID + '.logSettingsInfo',
        label: 'SpeechDrop: Log Settings Info (for Troubleshooting)',
        keywords: ['speechdrop', 'settings', 'gear', 'debug', 'log'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!debugGate(api)) return;
          logSettingsInfo(api);
          showDebugLog();
        },
      },
      {
        id: PLUGIN_ID + '.openSettings',
        label: 'SpeechDrop: Settings',
        keywords: ['speechdrop', 'settings', 'options', 'preferences'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!ui.panel) openPanel();
          ui.view = 'settings';
          renderPanel();
        },
      },
      {
        id: PLUGIN_ID + '.showHistory',
        label: 'SpeechDrop: Show Room History',
        keywords: ['speechdrop', 'history', 'rooms', 'past', 'previous'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!ui.panel) openPanel();
          ui.view = 'history';
          renderPanel();
        },
      },
      {
        id: PLUGIN_ID + '.addHeading',
        label: 'Upload Heading (Pocket) to SpeechDrop',
        keywords: ['speechdrop', 'heading', 'pocket', 'upload', 'section', 'room'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          if (!ui.panel) openPanel();
          if (!ui.room) { api.showToast('SpeechDrop: join a room first.'); return; }
          openHeadings();
        },
      },
      {
        id: PLUGIN_ID + '.openRoomInBrowser',
        label: 'SpeechDrop: Open Current Room in Browser',
        keywords: ['speechdrop', 'browser', 'link', 'open', 'room', 'url'],
        defaultKey: null,
        run: function (api) {
          useApi(api);
          var code = ui.room || api.storage.get(LAST_ROOM_KEY);
          if (typeof code !== 'string' || !code) { api.showToast('SpeechDrop: no current room.'); return; }
          if (!openExternal(roomUrl(code))) {
            copyText(roomUrl(code)).then(function () {
              api.showToast('SpeechDrop: could not open a browser; link copied.');
            });
          }
        },
      },
      {
        id: PLUGIN_ID + '.uploadCurrentDoc',
        label: 'Upload Current Document to SpeechDrop',
        keywords: ['speechdrop', 'upload', 'share', 'room', 'send', 'speech'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          if (!api.docInfo()) {
            api.showToast('SpeechDrop: no document is open.');
            return;
          }
          var code = await promptForRoom(api.storage.get(LAST_ROOM_KEY));
          if (code) await runUpload(code);
        },
      },
      {
        id: PLUGIN_ID + '.uploadSelection',
        label: 'Upload Selection to SpeechDrop',
        keywords: ['speechdrop', 'upload', 'selection', 'highlighted', 'room', 'send'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          var code = ui.room || api.storage.get(LAST_ROOM_KEY);
          if (typeof code !== 'string' || !code) code = await promptForRoom('');
          if (code) await runUpload(code, { selection: true });
        },
      },
      {
        id: PLUGIN_ID + '.uploadDocToCurrentRoom',
        label: 'SpeechDrop: Upload Current Document to Current Room (No Prompt)',
        keywords: ['speechdrop', 'upload', 'document', 'whole', 'current', 'room', 'send', 'hotkey'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          if (!api.docInfo()) {
            api.showToast('SpeechDrop: no document is open.');
            return;
          }
          var code = await roomForQuickUpload(api);
          if (code) await runUpload(code);
        },
      },
      {
        id: PLUGIN_ID + '.uploadSelectionOrDoc',
        label: 'SpeechDrop: Upload Selection, or Whole Document if Nothing Is Selected',
        keywords: ['speechdrop', 'upload', 'selection', 'document', 'smart', 'room', 'send', 'hotkey'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          var useSel = hasEditorSelection();
          if (!useSel && !api.docInfo()) {
            api.showToast('SpeechDrop: no document is open.');
            return;
          }
          var code = await roomForQuickUpload(api);
          if (code) await runUpload(code, useSel ? { selection: true } : undefined);
        },
      },
      {
        id: PLUGIN_ID + '.uploadToLastRoom',
        label: 'Upload to Last SpeechDrop Room',
        keywords: ['speechdrop', 'upload', 'again', 'last', 'room'],
        defaultKey: null,
        run: async function (api) {
          useApi(api);
          var last = api.storage.get(LAST_ROOM_KEY);
          if (typeof last !== 'string' || !last) {
            api.showToast('SpeechDrop: no current room. Join one from the SpeechDrop button first.');
            return;
          }
          await runUpload(last);
        },
      },
    ],
  };

  // Troubleshooting commands are left out of the registration when switched off.
  var DEBUG_COMMAND_IDS = ['dumpSchema', 'logHostInfo', 'logZoomInfo', 'showDebugLog', 'logSettingsInfo']
    .map(function (n) { return PLUGIN_ID + '.' + n; });
  try {
    if (localStorage.getItem(PLUGIN_ID + ':debugCommands') === 'off') {
      DEFINITION.commands = DEFINITION.commands.filter(function (c) { return DEBUG_COMMAND_IDS.indexOf(c.id) === -1; });
    }
  } catch (e) { /* keep all commands */ }

  // Optional built-in button (see SHOW_BUILTIN_BUTTON).
  try {
    if (SHOW_BUILTIN_BUTTON) {
      mountButton();
      setInterval(mountButton, 1000); // re-attach if the ribbon re-renders
      installHeadingDrag();
    }
  } catch (e) {
    console.warn('[' + PLUGIN_ID + '] could not mount button', e);
  }

  try { startHandoffWatcher(); } catch (e) { console.warn('[' + PLUGIN_ID + '] handoff watcher failed', e); }

  // Auto-refresh: pick up the last room (localStorage only until a command gives
  // us the real API; useApi() fills it in then) and start polling.
  try {
    var initialRoom = getSetting('reopen-last-room', false) ? store(LAST_ROOM_KEY) : '';
    if (typeof initialRoom === 'string' && initialRoom) watch.room = initialRoom;
    schedulePoll(POLL_MS);
  } catch (e) { console.warn('[' + PLUGIN_ID + '] auto-refresh failed to start', e); }

  dlog('plugin LOADED v0.17.0. window', WINDOW_ID.slice(0, 3), '| title:', document.title, '| roots:', describeRoots(), '| hasFocus:', document.hasFocus());
  var registered = window.__registerCardMirrorPlugin && window.__registerCardMirrorPlugin(DEFINITION);
  if (registered && typeof registered.showToast === 'function') useApi(registered);
  dlog('registered with CardMirror:', registered ? 'yes' : 'no/unknown');
  try { logSettingsInfo(registered || null); } catch (e) { dlog('settings log failed:', e && e.message); }
})();
