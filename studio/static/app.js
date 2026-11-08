/* ============================================================
   studio.hopzz.top — 前端主逻辑 v2
   原生 JS：无构建、无框架、无外部 CDN、只用系统字体。

   硬约定：
   - 用户数据只用 createElement / textContent 写入，不拼 HTML；
     唯一的 innerHTML 使用点是 paintIcon()，只写入内置静态 SVG 常量。
   - 所有请求 credentials: 'same-origin'
   - 任何 401 统一回登录页
   - AI 弹窗由 ai.js 暴露的 window.StudioAI 提供；分享面板由 share-admin.js 提供
   ============================================================ */
(function () {
  'use strict';

  // ================================================================ 内联图标
  // 24×24 viewBox，stroke 1.6，圆角端点，currentColor —— 全部是静态常量。

  var ICON_SVG = {
    project: '<svg viewBox="0 0 24 24"><path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="m3 12 9 4.5L21 12"/><path d="m3 16.5 9 4.5 9-4.5"/></svg>',
    works: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
    repo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.56 1Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    lyrics: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h10M4 18h7"/></svg>',
    art: '<svg viewBox="0 0 24 24"><path d="M4 20c0-2 1-3.5 2.5-4.5L17.8 5a2.1 2.1 0 0 1 3 3L10.5 18.5C9.5 20 8 21 6 21H4v-1Z"/><path d="m14 7 3 3"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="m9 8-5 4 5 4"/><path d="m15 8 5 4-5 4"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
    story: '<svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>',
    world: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z"/></svg>',
    oc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>',
    other: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="1.3"/><circle cx="12" cy="6" r="1.3"/><circle cx="18" cy="6" r="1.3"/><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/><circle cx="6" cy="18" r="1.3"/><circle cx="12" cy="18" r="1.3"/><circle cx="18" cy="18" r="1.3"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6M14 11v6"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8 12 3.5Z"/><path d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M4 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h10"/></svg>',
    archive: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17 12v3M20 12v2"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z"/></svg>',
    monitor: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 6 3 3"/></svg>',
    drag: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg>',
    map: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2 11 15.5M15.8 7.2 13 15.5M8.5 6h7"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M21 3 10.5 13.5"/><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-2 0-1-.7-1.7-1.7-1.7h-1a2 2 0 0 1 0-4h4.6A4.3 4.3 0 0 0 20 9.2C19.4 5.6 16.1 3 12 3Z"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>'
  };

  // 唯一写入 innerHTML 的地方：只放内置静态 SVG 图标常量，绝不写用户数据。
  function paintIcon(el, name) {
    el.innerHTML = ICON_SVG[name] || ICON_SVG.file;
    return el;
  }

  function icon(name, cls) {
    var el = h('span', { class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    return paintIcon(el, name);
  }

  // ================================================================ DOM 工具

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function appendChildren(el, children) {
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) {
        appendChildren(el, child);
        return;
      }
      if (child instanceof Node) {
        el.appendChild(child);
        return;
      }
      el.appendChild(document.createTextNode(String(child)));
    });
  }

  // h('div', { class: 'x', text: 'hi', onclick: fn }, child1, child2...)
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') {
          el.className = String(value);
          return;
        }
        if (key === 'text') {
          el.textContent = String(value);
          return;
        }
        if (key === 'dataset') {
          Object.keys(value).forEach(function (dataKey) {
            el.dataset[dataKey] = String(value[dataKey]);
          });
          return;
        }
        if (key === 'style') {
          if (typeof value === 'string') {
            el.setAttribute('style', value);
          } else {
            Object.keys(value).forEach(function (styleKey) {
              el.style[styleKey] = String(value[styleKey]);
            });
          }
          return;
        }
        if (key.length > 2 && key.slice(0, 2) === 'on' && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
          return;
        }
        if (key === 'value' || key === 'checked' || key === 'disabled' ||
            key === 'selected' || key === 'indeterminate') {
          el[key] = value;
          return;
        }
        el.setAttribute(key, value === true ? '' : String(value));
      });
    }
    appendChildren(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function setText(el, text) {
    if (el) el.textContent = text === null || text === undefined ? '' : String(text);
  }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function chevronRight() {
    return h('span', { class: 'crumb-sep', text: '/' });
  }

  // ================================================================ 格式化

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    var d;
    if (typeof value === 'number') {
      d = new Date(value < 1e12 ? value * 1000 : value);
    } else {
      var str = String(value).trim();
      if (/^\d+(\.\d+)?$/.test(str)) {
        var num = Number(str);
        d = new Date(num < 1e12 ? num * 1000 : num);
      } else {
        d = new Date(str);
      }
    }
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtTime(value) {
    var d = toDate(value);
    if (!d) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff >= 0 && diff < 45) return '刚刚';
    if (diff >= 0 && diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff >= 0 && diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff >= 0 && diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtDate(value) {
    var d = toDate(value);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fmtSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n = n / 1024;
      i += 1;
    }
    return (i === 0 ? String(Math.round(n)) : n.toFixed(1)) + ' ' + units[i];
  }

  function fmtDuration(value) {
    var total = Number(value);
    if (!isFinite(total) || total <= 0) return '';
    var secs = Math.round(total);
    var hh = Math.floor(secs / 3600);
    var mm = Math.floor((secs % 3600) / 60);
    var ss = secs % 60;
    return hh > 0 ? hh + ':' + pad2(mm) + ':' + pad2(ss) : mm + ':' + pad2(ss);
  }

  function nowClock() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // ================================================================ 媒体类型

  var IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico'];
  var AUDIO_EXT = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.mid', '.midi'];
  var VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi'];
  var TEXT_EXT = ['.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.log',
    '.py', '.js', '.ts', '.css', '.html', '.c', '.h', '.cpp', '.java', '.sh', '.ini',
    '.toml', '.xml', '.srt', '.lrc'];
  var ARCHIVE_EXT = ['.zip', '.7z', '.rar', '.tar', '.gz', '.flp', '.als', '.logicx',
    '.psd', '.ai', '.blend', '.kra'];

  var KIND_BY_EXT = {};
  (function buildKindMap() {
    var groups = { image: IMAGE_EXT, audio: AUDIO_EXT, video: VIDEO_EXT, text: TEXT_EXT, archive: ARCHIVE_EXT };
    Object.keys(groups).forEach(function (kind) {
      groups[kind].forEach(function (ext) {
        KIND_BY_EXT[ext] = kind;
      });
    });
  })();

  var KIND_ICON = {
    image: 'image',
    audio: 'audio',
    video: 'video',
    text: 'text',
    archive: 'archive',
    file: 'file',
    dir: 'folder'
  };

  function extOf(name) {
    var str = String(name || '');
    var idx = str.lastIndexOf('.');
    return idx < 0 ? '' : str.slice(idx).toLowerCase();
  }

  function mediaKind(name) {
    return KIND_BY_EXT[extOf(name)] || 'file';
  }

  // 项目类型
  var TYPES = [
    { key: '', label: '全部', icon: 'layers' },
    { key: 'music', label: '音乐', icon: 'music' },
    { key: 'lyrics', label: '歌词', icon: 'lyrics' },
    { key: 'art', label: '绘画', icon: 'art' },
    { key: 'code', label: '代码', icon: 'code' },
    { key: 'video', label: '视频', icon: 'video' },
    { key: 'story', label: '剧情', icon: 'story' },
    { key: 'world', label: '世界观', icon: 'world' },
    { key: 'oc', label: 'OC', icon: 'oc' },
    { key: 'other', label: '其他', icon: 'other' }
  ];

  var TYPE_MAP = {};
  TYPES.forEach(function (t) {
    if (t.key) TYPE_MAP[t.key] = t;
  });

  function typeInfo(key) {
    return TYPE_MAP[key] || { key: key, label: String(key || '其他'), icon: 'other' };
  }

  // 新建项目时按类型给的默认模块（后端 /api/modules 的 defaults 优先，这里是兜底）
  var DEFAULT_MODULES = {
    music: ['meta', 'audio', 'lyrics', 'chords', 'sections'],
    lyrics: ['meta', 'lyrics'],
    art: ['meta', 'palette'],
    code: ['meta', 'code'],
    video: ['meta', 'sections', 'shots', 'script'],
    story: ['meta', 'outline', 'sections', 'characters'],
    world: ['meta', 'outline', 'worldbuilding', 'characters', 'timeline'],
    oc: ['meta', 'palette', 'characters'],
    other: ['meta', 'notes']
  };

  var NUMERIC_KEYS = ['bpm', 'tempo', 'duration', 'year', 'length', 'start', 'end',
    'fps', 'width', 'height', 'rating', 'track', 'num', 'number', 'count', 'size'];
  var MONO_KEYS = ['lyrics', 'chords', 'code', 'script', 'outline', 'notes', 'lrc', 'content'];
  var SKIP_FIELD_KEYS = ['name', 'summary', 'tags'];

  // ================================================================ 设置（localStorage）

  var SETTINGS_KEY = 'studio.settings.v1';
  var SETTINGS_DEFAULTS = {
    defaultType: 'music',
    pageSize: 12,
    showUpdated: true,
    theme: 'light',
    blur: 'mid',
    motion: true,
    shareMode: 'view',
    sharePrefix: ''
  };

  function loadSettings() {
    var data = {};
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') data = parsed;
      }
    } catch (err) {
      data = {};
    }
    var merged = {};
    Object.keys(SETTINGS_DEFAULTS).forEach(function (key) {
      merged[key] = data[key] === undefined ? SETTINGS_DEFAULTS[key] : data[key];
    });
    return merged;
  }

  function persistSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch || {});
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (err) { /* 隐私模式下写不进去也不影响使用 */ }
  }

  function saveSettings(patch) {
    persistSettings(patch);
    applySettings();
  }

  function resolvedTheme() {
    if (state.settings.theme === 'dark') return 'dark';
    if (state.settings.theme === 'light') return 'light';
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (err) {
      return 'light';
    }
  }

  function applySettings() {
    var root = document.documentElement;
    var theme = resolvedTheme();
    root.dataset.theme = theme;
    root.dataset.blur = state.settings.blur || 'mid';
    root.dataset.motion = state.settings.motion === false ? 'off' : 'on';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#12181e' : '#f6f4ee');
  }

  function updateSetting(key, value, rerender) {
    saveSettings({ [key]: value });
    if (rerender !== false && state.view === 'settings') renderSettingsBody();
  }

  // ================================================================ 状态

  var state = {
    authed: false,
    setupNeeded: false,
    view: 'login',

    settings: loadSettings(),

    allProjects: [],
    projects: [],
    tags: [],
    filters: { q: '', tag: '', type: '' },
    wallLimit: 12,
    worksType: '',
    repoType: '',
    settingsSection: 'general',

    project: null,
    detailTab: 'edit',
    repoPath: '',
    repoEntries: [],
    selectedProjectId: '',

    saveTimer: null,
    pendingPatch: null,
    saveSeq: 0,
    moduleDefaults: null,

    aiMounted: false,
    backendVersion: ''
  };

  // ================================================================ 请求

  function HttpError(status, message, data) {
    this.name = 'HttpError';
    this.status = status;
    this.message = message || '请求失败';
    this.data = data || null;
  }
  HttpError.prototype = Object.create(Error.prototype);
  HttpError.prototype.constructor = HttpError;

  function asObject(data, keys, fallback) {
    if (!data || typeof data !== 'object') return fallback === undefined ? null : fallback;
    var list = keys || [];
    for (var i = 0; i < list.length; i += 1) {
      var candidate = data[list[i]];
      if (candidate && typeof candidate === 'object') return candidate;
    }
    return fallback === undefined ? data : fallback;
  }

  function asArray(data, keys) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      var list = keys || [];
      for (var i = 0; i < list.length; i += 1) {
        if (Array.isArray(data[list[i]])) return data[list[i]];
      }
    }
    return [];
  }

  function serverErrorText(err) {
    var base = err && err.message ? String(err.message) : '请求失败';
    if (err && err.status) return base + '（HTTP ' + err.status + '）';
    return base;
  }

  async function api(path, options) {
    var opts = options || {};
    var allow401 = opts.allow401 === true;
    var json = opts.json;
    delete opts.json;
    delete opts.allow401;

    var init = Object.assign({}, opts);
    init.credentials = 'same-origin';
    init.headers = Object.assign({}, opts.headers || {});
    if (json !== undefined) {
      init.method = init.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(json);
    }

    var res;
    try {
      res = await fetch(path, init);
    } catch (err) {
      throw new HttpError(0, '网络连接失败，请检查网络后重试');
    }

    var contentType = res.headers.get('content-type') || '';
    var data = null;
    if (contentType.indexOf('application/json') >= 0) {
      try {
        data = await res.json();
      } catch (err) {
        data = null;
      }
    } else if (res.status !== 204) {
      try {
        var raw = await res.text();
        if (raw) data = { error: raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) };
      } catch (err) {
        data = null;
      }
    }

    if (res.status === 401) {
      if (allow401) {
        throw new HttpError(401, (data && (data.error || data.detail)) || '密码不对', data);
      }
      handleUnauthorized();
      throw new HttpError(401, '登录已过期', data);
    }

    if (!res.ok) {
      var message = (data && (data.error || data.detail)) || ('请求失败（' + res.status + '）');
      if (typeof message !== 'string') {
        try { message = JSON.stringify(message); } catch (err) { message = '请求失败（' + res.status + '）'; }
      }
      throw new HttpError(res.status, String(message), data);
    }

    if (data && data.ok === false) {
      throw new HttpError(res.status || 400, String(data.error || data.detail || '操作失败'), data);
    }

    return data;
  }

  async function fetchText(url) {
    var res;
    try {
      res = await fetch(url, { credentials: 'same-origin' });
    } catch (err) {
      throw new HttpError(0, '网络连接失败，请检查网络后重试');
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new HttpError(401, '登录已过期');
    }
    if (!res.ok) throw new HttpError(res.status, '读取失败（' + res.status + '）');
    return await res.text();
  }

  function handleUnauthorized() {
    if (state.view === 'login' && !state.authed) return;
    state.authed = false;
    state.project = null;
    state.pendingPatch = null;
    state.saveSeq += 1;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    closeAllModals();
    closeAI();
    showLogin('login');
    toast('登录已过期，请重新登录', 'warn');
  }

  function projectUrl(id, suffix) {
    return '/api/projects/' + encodeURIComponent(id) + (suffix || '');
  }

  function fileUrl(projectId, path) {
    return projectUrl(projectId, '/file') + '?path=' + encodeURIComponent(path);
  }

  function downloadUrl(projectId, path) {
    return fileUrl(projectId, path) + '&download=1';
  }

  function thumbUrl(projectId, path, size) {
    var url = projectUrl(projectId, '/thumb') + '?path=' + encodeURIComponent(path);
    if (size) url += '&size=' + encodeURIComponent(String(size));
    return url;
  }

  // ================================================================ 提示 / 弹窗

  function toast(message, kind) {
    var root = $('#toast-root');
    if (!root) return;
    var el = h('div', { class: 'toast toast-' + (kind || 'info'), role: 'status', text: message });
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 3600);
  }

  var activeModal = null;

  function openModal(opts) {
    var root = $('#modal-root');
    if (!root) return function () {};

    if (activeModal) {
      try { activeModal.close(); } catch (err) { /* ignore */ }
    }

    root.hidden = false;
    clear(root);

    var onKey = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    var closeBtn = h('button', {
      class: 'icon-btn modal-close',
      type: 'button',
      'aria-label': '关闭'
    }, icon('close'));
    closeBtn.addEventListener('click', function () { close(); });

    var card = h('div', { class: 'modal' + (opts.wide ? ' modal-wide' : '') });
    var head = h('div', { class: 'modal-head' },
      h('h2', { class: 'modal-title', text: opts.title || '' }),
      closeBtn
    );
    var body = h('div', { class: 'modal-body' });
    if (opts.body) body.appendChild(opts.body);
    card.appendChild(head);
    if (opts.sub) card.appendChild(h('p', { class: 'modal-sub', text: opts.sub }));
    card.appendChild(body);

    if (opts.actions && opts.actions.length) {
      var foot = h('div', { class: 'modal-actions' });
      opts.actions.forEach(function (action) {
        if (action) foot.appendChild(action);
      });
      card.appendChild(foot);
    }

    var overlay = h('div', { class: 'modal-overlay' }, card);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });
    root.appendChild(overlay);
    document.addEventListener('keydown', onKey);

    function close() {
      if (!activeModal || activeModal.close !== close) return;
      activeModal = null;
      root.hidden = true;
      clear(root);
      document.removeEventListener('keydown', onKey);
      if (typeof opts.onClose === 'function') {
        try { opts.onClose(); } catch (err) { /* ignore */ }
      }
    }

    activeModal = { close: close };

    var focusable = card.querySelector('input, textarea, select') || card.querySelector('button');
    if (focusable && focusable.focus) {
      setTimeout(function () {
        try { focusable.focus(); } catch (err) { /* ignore */ }
      }, 40);
    }

    return close;
  }

  function closeAllModals() {
    if (activeModal) {
      try { activeModal.close(); } catch (err) { /* ignore */ }
    }
    var root = $('#modal-root');
    if (root) {
      root.hidden = true;
      clear(root);
    }
  }

  function confirmDialog(opts) {
    var settings = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      var close = null;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      function act(value) {
        finish(value);
        if (close) close();
      }
      var cancelBtn = h('button', {
        class: 'btn btn-ghost', type: 'button', text: settings.cancelText || '取消',
        onclick: function () { act(false); }
      });
      var okBtn = h('button', {
        class: 'btn ' + (settings.danger ? 'btn-danger' : 'btn-primary'),
        type: 'button',
        text: settings.confirmText || '确定',
        onclick: function () { act(true); }
      });
      var body = h('div', { class: 'confirm-body' },
        h('p', { class: 'confirm-message', text: settings.message || '' })
      );
      close = openModal({
        title: settings.title || '确认',
        body: body,
        actions: [cancelBtn, okBtn],
        onClose: function () { finish(false); }
      });
    });
  }

  function promptDialog(opts) {
    var settings = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      var close = null;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var input = h('input', {
        class: 'input',
        type: 'text',
        maxlength: '120',
        placeholder: settings.placeholder || ''
      });
      if (settings.value) input.value = String(settings.value);

      var cancelBtn = h('button', {
        class: 'btn btn-ghost', type: 'button', text: '取消',
        onclick: function () { finish(null); if (close) close(); }
      });
      var okBtn = h('button', {
        class: 'btn btn-primary', type: 'button', text: settings.confirmText || '确定',
        onclick: function () { finish(input.value); if (close) close(); }
      });

      close = openModal({
        title: settings.title || '输入',
        body: h('div', {}, fieldBox(settings.label || '名称', input, settings.hint)),
        actions: [cancelBtn, okBtn],
        onClose: function () { finish(null); }
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(input.value);
          if (close) close();
        }
      });
    });
  }

  function fieldBox(label, control, hint) {
    var box = h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }));
    box.appendChild(control);
    if (hint) box.appendChild(h('span', { class: 'field-hint', text: hint }));
    return box;
  }

  function attachAutoGrow(textarea) {
    var resize = function () {
      textarea.style.height = 'auto';
      var next = Math.min(440, Math.max(96, textarea.scrollHeight + 4));
      textarea.style.height = next + 'px';
    };
    textarea.addEventListener('input', resize);
    setTimeout(resize, 0);
    requestAnimationFrame(resize);
  }

  function valueToText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }

  // ================================================================ 登录 / 启动

  function showLogin(mode) {
    state.authed = false;
    state.setupNeeded = mode === 'setup';
    state.view = 'login';
    hideAI();
    $('#main-view').hidden = true;
    $('#login-view').hidden = false;
    setText($('#login-subtitle'), mode === 'setup' ? '第一次使用，先设置一个密码' : '输入密码进入创作工作站');
    $('#login-confirm-wrap').hidden = mode !== 'setup';
    $('#login-confirm').required = mode === 'setup';
    setText($('#login-submit'), mode === 'setup' ? '设置密码并进入' : '进入工作室');
    setText($('#login-error'), '');
    $('#login-password').value = '';
    $('#login-confirm').value = '';
    document.title = 'Hopzz Studio · 登录';
    setTimeout(function () {
      try { $('#login-password').focus(); } catch (err) { /* ignore */ }
    }, 60);
  }

  function showMain() {
    $('#login-view').hidden = true;
    $('#main-view').hidden = false;
    document.title = 'Hopzz Studio · 创作工作站';
    mountAI();
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    var password = $('#login-password').value;
    var errorEl = $('#login-error');
    setText(errorEl, '');

    if (state.setupNeeded) {
      var confirmValue = $('#login-confirm').value;
      if (password.length < 6) {
        setText(errorEl, '密码至少 6 位');
        return;
      }
      if (password !== confirmValue) {
        setText(errorEl, '两次输入的密码不一致');
        return;
      }
      var setupBtn = $('#login-submit');
      setupBtn.disabled = true;
      try {
        await api('/api/setup', { method: 'POST', json: { password: password }, allow401: true });
        setupBtn.disabled = false;
        await afterLogin();
      } catch (err) {
        setupBtn.disabled = false;
        setText(errorEl, serverErrorText(err));
      }
      return;
    }

    var loginBtn = $('#login-submit');
    loginBtn.disabled = true;
    try {
      await api('/api/login', { method: 'POST', json: { password: password }, allow401: true });
      loginBtn.disabled = false;
      await afterLogin();
    } catch (err) {
      loginBtn.disabled = false;
      if (err.data && err.data.needsSetup) {
        showLogin('setup');
        return;
      }
      setText(errorEl, serverErrorText(err));
      try { $('#login-password').select(); } catch (e) { /* ignore */ }
    }
  }

  async function afterLogin() {
    state.authed = true;
    showMain();
    try {
      await loadModules();
    } catch (err) {
      if (err.status === 401) return;
      toast('模块清单加载失败：' + serverErrorText(err), 'warn');
    }
    await route();
    mountAI();
  }

  async function onLogout() {
    if (state.pendingPatch) {
      try { await flushSave(); } catch (err) { /* ignore */ }
    }
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (err) {
      /* 退出接口失败也照常回登录页 */
    }
    state.authed = false;
    state.project = null;
    state.allProjects = [];
    state.projects = [];
    state.tags = [];
    state.filters = { q: '', tag: '', type: '' };
    closeAllModals();
    closeAI();
    try {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    } catch (err) { /* ignore */ }
    showLogin('login');
    toast('已退出登录', 'info');
  }

  // ================================================================ AI 弹窗

  function mountAI() {
    if (state.aiMounted) return;
    var attempts = 0;
    function attempt() {
      attempts += 1;
      var ai = window.StudioAI;
      if (ai && typeof ai.mount === 'function') {
        try {
          ai.mount(document.body);
          state.aiMounted = true;
          return;
        } catch (err) {
          state.aiMounted = false;
          if (attempts < 25) setTimeout(attempt, 300);
          return;
        }
      }
      if (attempts < 25) setTimeout(attempt, 200);
    }
    attempt();
  }

  function closeAI() {
    try {
      if (window.StudioAI && typeof window.StudioAI.close === 'function') {
        window.StudioAI.close();
      }
    } catch (err) { /* ignore */ }
    state.aiMounted = false;
  }

  // 登录页不显示 AI 小球（登出 / 未登录时调用）
  function hideAI() {
    try {
      var ai = window.StudioAI;
      if (ai && typeof ai.hide === 'function') ai.hide();
      else if (ai && typeof ai.close === 'function') ai.close();
    } catch (err) { /* ignore */ }
    state.aiMounted = false;
  }

  function openAISettings() {
    var ai = window.StudioAI;
    if (ai && typeof ai.openSettings === 'function') {
      ai.openSettings();
      return;
    }
    if (ai && typeof ai.open === 'function') {
      ai.open();
      toast('AI 面板已打开，点右上角「设置」配置服务商', 'info');
      return;
    }
    toast('AI 模块没有加载', 'warn');
  }

  // ================================================================ 路由 / 导航

  var NAV_ITEMS = [
    { key: 'wall', label: '项目', icon: 'project' },
    { key: 'works', label: '作品', icon: 'works' },
    { key: 'repo', label: '仓库', icon: 'repo' },
    { key: 'settings', label: '设置', icon: 'settings' }
  ];

  var SETTINGS_SECTIONS = [
    { key: 'general', label: '常规', icon: 'settings' },
    { key: 'appearance', label: '外观', icon: 'palette' },
    { key: 'ai', label: 'AI', icon: 'ai' },
    { key: 'share', label: '分享', icon: 'share' },
    { key: 'account', label: '账户', icon: 'oc' },
    { key: 'about', label: '关于', icon: 'info' }
  ];

  function parseRoute() {
    var hash = location.hash || '';
    var detail = hash.match(/^#\/p\/([a-z0-9][a-z0-9-]{2,63})(?:\/(repo))?$/i);
    if (detail) return { name: 'detail', id: detail[1], tab: detail[2] ? 'repo' : 'edit' };
    if (hash.indexOf('#/works') === 0) return { name: 'works' };
    if (hash.indexOf('#/repo') === 0) return { name: 'repo' };
    if (hash.indexOf('#/settings') === 0) return { name: 'settings' };
    return { name: 'wall' };
  }

  function renderPrimaryNav() {
    var nav = $('#primary-nav');
    if (!nav) return;
    clear(nav);
    NAV_ITEMS.forEach(function (item) {
      var active = state.view === item.key ||
        (item.key === 'wall' && state.view === 'detail');
      var btn = h('button', {
        class: 'nav-link' + (active ? ' is-active' : ''),
        type: 'button',
        'aria-current': active ? 'page' : null,
        onclick: function () { go(item.key); }
      });
      btn.appendChild(icon(item.icon));
      btn.appendChild(h('span', { class: 'nav-label', text: item.label }));
      nav.appendChild(btn);
    });
  }

  function renderSubNav() {
    var nav = $('#subnav');
    if (!nav) return;
    clear(nav);

    if (state.view === 'detail' || state.view === 'login') {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;

    if (state.view === 'settings') {
      SETTINGS_SECTIONS.forEach(function (section) {
        var active = state.settingsSection === section.key;
        var btn = h('button', {
          class: 'subnav-btn' + (active ? ' is-active' : ''),
          type: 'button',
          'aria-pressed': active ? 'true' : 'false',
          onclick: function () {
            state.settingsSection = section.key;
            renderSubNav();
            renderSettingsBody();
          }
        });
        btn.appendChild(icon(section.icon, 'ico-sm'));
        btn.appendChild(h('span', { text: section.label }));
        nav.appendChild(btn);
      });
      return;
    }

    var typeKey = state.view === 'wall' ? state.filters.type
      : (state.view === 'works' ? state.worksType : state.repoType);
    var source = state.view === 'works' ? publishedProjects() : state.allProjects;
    var counts = countTypes(source);

    TYPES.forEach(function (type) {
      var active = typeKey === type.key;
      var btn = h('button', {
        class: 'subnav-btn' + (active ? ' is-active' : ''),
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onclick: function () {
          if (state.view === 'wall') {
            state.filters.type = type.key;
            state.wallLimit = state.settings.pageSize;
            applyWallFilters();
            renderSubNav();
            renderProjectGrid();
          } else if (state.view === 'works') {
            state.worksType = type.key;
            renderSubNav();
            renderWorks();
          } else {
            state.repoType = type.key;
            renderSubNav();
            renderRepoList();
          }
        }
      });
      btn.appendChild(icon(type.icon, 'ico-sm'));
      btn.appendChild(h('span', { text: type.label }));
      var count = type.key ? (counts[type.key] || 0) : source.length;
      btn.appendChild(h('span', { class: 'subnav-count', text: String(count) }));
      nav.appendChild(btn);
    });
  }

  function countTypes(list) {
    var counts = {};
    list.forEach(function (project) {
      var key = String(project.type || 'other');
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function go(viewKey) {
    if (viewKey === 'wall') {
      location.hash = '#/wall';
    } else if (viewKey === 'works') {
      location.hash = '#/works';
    } else if (viewKey === 'repo') {
      location.hash = '#/repo';
    } else if (viewKey === 'settings') {
      location.hash = '#/settings';
    } else {
      return;
    }
    if (state.pendingPatch) flushSave();
  }

  function showView(name) {
    state.view = name;
    var target = name === 'repo' ? 'repo-list' : name;
    ['wall', 'works', 'repo-list', 'settings', 'detail'].forEach(function (key) {
      var el = $('#' + key + '-view');
      if (el) el.hidden = key !== target;
    });
    renderPrimaryNav();
    renderSubNav();
  }

  async function route() {
    if (!state.authed) {
      showLogin('login');
      return;
    }
    if (state.pendingPatch) flushSave();

    var target = parseRoute();
    if (target.name === 'detail') {
      await openProject(target.id, target.tab);
      return;
    }
    if (target.name === 'works') {
      await openWorks();
      return;
    }
    if (target.name === 'repo') {
      await openRepoList();
      return;
    }
    if (target.name === 'settings') {
      await openSettings();
      return;
    }
    await openWall();
  }

  async function loadAllProjects() {
    var data = await api('/api/projects');
    var list = asArray(data, ['projects', 'items', 'list', 'data']);
    state.allProjects = list.filter(function (item) {
      return item && typeof item === 'object';
    });
    state.tags = collectTags(state.allProjects);
  }

  function collectTags(projects) {
    var seen = {};
    projects.forEach(function (project) {
      var tags = Array.isArray(project.tags) ? project.tags : [];
      tags.forEach(function (tag) {
        var key = String(tag);
        if (key) seen[key] = (seen[key] || 0) + 1;
      });
    });
    return Object.keys(seen).sort(function (a, b) {
      if (seen[a] !== seen[b]) return seen[b] - seen[a];
      return a.localeCompare(b, 'zh-Hans-CN');
    });
  }

  function publishedProjects() {
    return state.allProjects.filter(function (project) {
      return project && project.publish && project.publish.enabled === true;
    });
  }

  // ================================================================ 项目墙

  function applyWallFilters() {
    var type = state.filters.type;
    var tag = state.filters.tag;
    var query = (state.filters.q || '').toLowerCase();
    state.projects = state.allProjects.filter(function (project) {
      if (type && String(project.type || 'other') !== type) return false;
      if (tag) {
        var tags = Array.isArray(project.tags) ? project.tags : [];
        if (tags.indexOf(tag) < 0) return false;
      }
      if (query) {
        var parts = [project.name, project.summary];
        if (Array.isArray(project.tags)) parts = parts.concat(project.tags);
        var haystack = parts.filter(Boolean).join(' ').toLowerCase();
        if (haystack.indexOf(query) < 0) return false;
      }
      return true;
    });
  }

  async function openWall() {
    showView('wall');
    state.project = null;
    document.title = 'Hopzz Studio · 创作工作站';
    try {
      await loadAllProjects();
    } catch (err) {
      if (err.status === 401) return;
      renderWallError(err);
      return;
    }
    state.wallLimit = state.settings.pageSize;
    applyWallFilters();
    renderSubNav();
    renderTagFilter();
    renderWallHead();
    renderProjectGrid();
  }

  function renderWallError(err) {
    var grid = $('#project-grid');
    var empty = $('#wall-empty');
    if (grid) clear(grid);
    if (!empty) return;
    clear(empty);
    empty.hidden = false;
    empty.appendChild(h('span', { class: 'empty-icon' }, icon('alert')));
    empty.appendChild(h('p', { class: 'empty-text', text: '项目列表加载失败' }));
    empty.appendChild(h('p', { class: 'empty-sub', text: serverErrorText(err) }));
    empty.appendChild(h('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: '重试',
      onclick: function () { route(); }
    }));
  }

  function renderTagFilter() {
    var box = $('#tag-filter');
    if (!box) return;
    clear(box);
    if (!state.tags.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var allChip = h('button', {
      class: 'tag-chip tag-btn' + (!state.filters.tag ? ' is-active' : ''),
      type: 'button',
      text: '全部标签',
      onclick: function () {
        state.filters.tag = '';
        state.wallLimit = state.settings.pageSize;
        applyWallFilters();
        renderTagFilter();
        renderWallHead();
        renderProjectGrid();
      }
    });
    box.appendChild(allChip);

    state.tags.forEach(function (tag) {
      var active = state.filters.tag === tag;
      box.appendChild(h('button', {
        class: 'tag-chip tag-btn' + (active ? ' is-active' : ''),
        type: 'button',
        text: tag,
        onclick: function () {
          state.filters.tag = state.filters.tag === tag ? '' : tag;
          state.wallLimit = state.settings.pageSize;
          applyWallFilters();
          renderTagFilter();
          renderWallHead();
          renderProjectGrid();
        }
      }));
    });
  }

  function renderWallHead() {
    var info = state.filters.type ? typeInfo(state.filters.type) : null;
    var title = '全部项目';
    if (info) title = info.label + '项目';
    if (state.filters.tag) title = '标签：' + state.filters.tag;
    if (state.filters.q) title = '搜索：' + state.filters.q;
    setText($('#wall-count'), state.projects.length ? title + ' · 共 ' + state.projects.length + ' 个' : title);

    var searchInput = $('#search-input');
    if (searchInput && document.activeElement !== searchInput) {
      searchInput.value = state.filters.q || '';
    }
  }

  function renderProjectGrid() {
    var grid = $('#project-grid');
    var empty = $('#wall-empty');
    var loadMore = $('#load-more-btn');
    if (!grid || !empty) return;
    clear(grid);
    clear(empty);
    empty.hidden = true;

    if (!state.projects.length) {
      renderEmptyState(empty, {
        iconName: 'project',
        text: hasWallFilters() ? '没有符合条件的项目' : '还没有项目',
        sub: hasWallFilters() ? '换个类型或清空搜索再试试。' : '新建第一个项目，内容和文件都会保存在网盘里。',
        actionText: hasWallFilters() ? '清空筛选' : '新建第一个项目',
        action: function () {
          if (hasWallFilters()) {
            state.filters = { q: '', tag: '', type: '' };
            applyWallFilters();
            renderSubNav();
            renderTagFilter();
            renderWallHead();
            renderProjectGrid();
          } else {
            openNewProject();
          }
        }
      });
      if (loadMore) loadMore.hidden = true;
      return;
    }

    var limit = Math.max(1, Number(state.settings.pageSize) || 12);
    var shown = Math.min(state.wallLimit || limit, state.projects.length);
    state.projects.slice(0, shown).forEach(function (project) {
      grid.appendChild(projectCard(project, { showPublish: true }));
    });
    if (loadMore) {
      loadMore.hidden = state.projects.length <= shown;
      loadMore.onclick = function () {
        state.wallLimit = shown + limit;
        renderProjectGrid();
      };
    }
  }

  function hasWallFilters() {
    return !!(state.filters.type || state.filters.q || state.filters.tag);
  }

  function renderEmptyState(box, opts) {
    box.hidden = false;
    box.appendChild(h('span', { class: 'empty-icon' }, icon(opts.iconName || 'project')));
    box.appendChild(h('p', { class: 'empty-text', text: opts.text || '这里还是空的' }));
    if (opts.sub) box.appendChild(h('p', { class: 'empty-sub', text: opts.sub }));
    if (opts.actionText && opts.action) {
      box.appendChild(h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: opts.actionText,
        onclick: opts.action
      }));
    }
  }

  function coverPathOf(project) {
    var fields = project && project.fields && typeof project.fields === 'object' ? project.fields : {};
    var candidates = [project.cover, project.thumbnail, fields.cover, fields.thumbnail, fields.thumb];
    var exts = IMAGE_EXT;
    for (var i = 0; i < candidates.length; i += 1) {
      var value = candidates[i];
      if (typeof value === 'string' && value.trim()) {
        var ext = extOf(value);
        if (exts.indexOf(ext) >= 0) return value.trim();
      }
    }
    return '';
  }

  function projectCard(project, opts) {
    var options = opts || {};
    var info = typeInfo(project.type);
    var name = String(project.name || '未命名项目');
    var card = h('article', {
      class: 'project-card',
      role: 'button',
      tabindex: '0',
      'aria-label': name + '，' + info.label + '项目'
    });

    var coverPath = coverPathOf(project);
    var cover = h('div', { class: 'pc-cover' }, icon(info.icon || 'other'));
    if (coverPath) {
      var img = h('img', { alt: '', loading: 'lazy' });
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.removeChild(img);
      });
      img.src = thumbUrl(project.id, coverPath, 640);
      cover.appendChild(img);
    }
    if (options.showPublish && project.publish && project.publish.enabled) {
      cover.appendChild(h('span', { class: 'pc-cover-badge' }, icon('check', 'ico-sm'), '已发布'));
    }
    card.appendChild(cover);

    var body = h('div', { class: 'pc-body' });
    var head = h('div', { class: 'pc-head' });
    head.appendChild(icon(info.icon, 'ico-sm'));
    head.appendChild(h('span', { text: info.label }));
    body.appendChild(head);
    body.appendChild(h('h3', { class: 'pc-name', text: name }));

    if (project.summary) {
      var summary = String(project.summary);
      body.appendChild(h('p', { class: 'pc-summary', text: summary }));
    }

    var tags = Array.isArray(project.tags) ? project.tags.slice(0, 4) : [];
    if (tags.length) {
      var strip = h('div', { class: 'pc-tags' });
      tags.forEach(function (tag) {
        strip.appendChild(h('span', { class: 'tag-chip tag-chip--mini', text: tag }));
      });
      body.appendChild(strip);
    }

    if (state.settings.showUpdated !== false || options.showPublishDate) {
      var moduleCount = Array.isArray(project.modules) ? project.modules.length : 0;
      var leftText = options.showPublishDate && project.publish
        ? '发布于 ' + (fmtDate(project.publish.at) || '—')
        : moduleCount + ' 个模块';
      body.appendChild(h('div', { class: 'pc-foot' },
        h('span', { class: 'pc-modules', text: leftText }),
        h('span', { class: 'pc-time', text: fmtTime(project.updatedAt || project.createdAt) || '—' })
      ));
    }
    card.appendChild(body);

    function open() {
      location.hash = '#/p/' + encodeURIComponent(project.id);
    }
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    return card;
  }

  // ================================================================ 作品 / 仓库列表

  async function openWorks() {
    showView('works');
    state.project = null;
    document.title = '作品 · Hopzz Studio';
    try {
      await loadAllProjects();
    } catch (err) {
      if (err.status === 401) return;
      toast('作品列表加载失败：' + serverErrorText(err), 'error');
      return;
    }
    renderSubNav();
    renderWorks();
  }

  function renderWorks() {
    var grid = $('#works-grid');
    var empty = $('#works-empty');
    if (!grid || !empty) return;
    clear(grid);
    clear(empty);
    empty.hidden = true;

    var list = publishedProjects();
    if (state.worksType) {
      list = list.filter(function (project) {
        return String(project.type || 'other') === state.worksType;
      });
    }
    list = list.slice().sort(function (a, b) {
      var at = (a.publish && a.publish.at) || a.updatedAt || '';
      var bt = (b.publish && b.publish.at) || b.updatedAt || '';
      return String(bt).localeCompare(String(at));
    });

    setText($('#works-view .page-desc'), '已发布到 hopzz.top 的只读作品 · 共 ' + list.length + ' 个');

    if (!list.length) {
      renderEmptyState(empty, {
        iconName: 'works',
        text: '还没有发布的作品',
        sub: '打开一个项目 → 右上角「分享」→ 打开「同时发布到主页作品」，就会出现在这里。'
      });
      return;
    }

    list.forEach(function (project) {
      grid.appendChild(projectCard(project, { showPublish: false, showPublishDate: true }));
    });
  }

  async function openRepoList() {
    showView('repo');
    state.project = null;
    document.title = '仓库 · Hopzz Studio';
    try {
      await loadAllProjects();
    } catch (err) {
      if (err.status === 401) return;
      toast('仓库列表加载失败：' + serverErrorText(err), 'error');
      return;
    }
    renderSubNav();
    renderRepoList();
  }

  function renderRepoList() {
    var listBox = $('#repo-list');
    var empty = $('#repo-list-empty');
    if (!listBox || !empty) return;
    clear(listBox);
    clear(empty);
    empty.hidden = true;

    var list = state.allProjects.slice();
    if (state.repoType) {
      list = list.filter(function (project) {
        return String(project.type || 'other') === state.repoType;
      });
    }
    list.sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    if (!list.length) {
      renderEmptyState(empty, {
        iconName: 'repo',
        text: state.repoType ? '这个类型还没有项目' : '还没有仓库',
        sub: '每个项目自带一个仓库目录，新建项目后就能上传文件了。',
        actionText: '新建项目',
        action: function () { openNewProject(); }
      });
      return;
    }

    list.forEach(function (project) {
      var info = typeInfo(project.type);
      var item = h('div', { class: 'repo-item' },
        icon('folder'),
        h('div', { class: 'repo-item-main' },
          h('div', { class: 'repo-item-name', text: String(project.name || '未命名项目') }),
          h('div', {
            class: 'repo-item-meta',
            text: info.label + ' · 工作站/' + project.id + '/ · 更新于 ' + (fmtTime(project.updatedAt) || '—')
          })
        ),
        h('div', { class: 'repo-item-actions' },
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '打开项目',
            onclick: function () { location.hash = '#/p/' + encodeURIComponent(project.id); }
          }),
          h('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '浏览文件',
            onclick: function () { location.hash = '#/p/' + encodeURIComponent(project.id) + '/repo'; }
          })
        )
      );
      listBox.appendChild(item);
    });
  }

  // ================================================================ 设置页

  async function openSettings() {
    showView('settings');
    state.project = null;
    document.title = '设置 · Hopzz Studio';
    if (!state.allProjects.length) {
      loadAllProjects().catch(function () { /* 设置页不依赖项目列表 */ });
    }
    renderSettingsBody();
    loadBackendVersion();
  }

  function loadBackendVersion() {
    if (state.backendVersion) return;
    api('/api/health').then(function (data) {
      state.backendVersion = (data && data.version) ? String(data.version) : '';
      if (state.view === 'settings' && state.settingsSection === 'about') renderSettingsBody();
    }).catch(function () { /* ignore */ });
  }

  function renderSettingsBody() {
    var host = $('#settings-body');
    if (!host) return;
    clear(host);
    var section = state.settingsSection;
    if (section === 'general') host.appendChild(settingsGeneral());
    else if (section === 'appearance') host.appendChild(settingsAppearance());
    else if (section === 'ai') host.appendChild(settingsAI());
    else if (section === 'share') host.appendChild(settingsShare());
    else if (section === 'account') host.appendChild(settingsAccount());
    else host.appendChild(settingsAbout());
  }

  function settingsCard(title, desc, iconName) {
    var card = h('section', { class: 'settings-card' },
      h('h2', {}, icon(iconName || 'settings'), h('span', { text: title }))
    );
    if (desc) card.appendChild(h('p', { class: 'settings-card-desc', text: desc }));
    return card;
  }

  function settingsRow(label, hint, control) {
    return h('div', { class: 'settings-row' },
      h('div', { class: 'settings-row-text' },
        h('div', { class: 'settings-row-label', text: label }),
        hint ? h('div', { class: 'settings-row-hint', text: hint }) : null
      ),
      h('div', { class: 'settings-control' }, control)
    );
  }

  function switchControl(checked, onChange) {
    var input = h('input', { type: 'checkbox', checked: checked, 'aria-label': '开关' });
    var label = h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })));
    input.addEventListener('change', function () { onChange(input.checked); });
    return label;
  }

  function segmented(options, value, onPick) {
    var box = h('div', { class: 'segmented' });
    options.forEach(function (option) {
      var active = option.value === value;
      var btn = h('button', {
        class: 'seg-btn' + (active ? ' is-active' : ''),
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        text: option.label,
        onclick: function () { onPick(option.value); }
      });
      box.appendChild(btn);
    });
    return box;
  }

  function settingsGeneral() {
    var card = settingsCard('常规', '新建项目与项目墙的默认行为。', 'settings');

    var typeSelect = h('select', { class: 'input' });
    TYPES.forEach(function (type) {
      if (!type.key) return;
      typeSelect.appendChild(h('option', {
        value: type.key, text: type.label,
        selected: state.settings.defaultType === type.key
      }));
    });
    typeSelect.value = state.settings.defaultType;
    typeSelect.addEventListener('change', function () {
      updateSetting('defaultType', typeSelect.value, false);
      toast('默认项目类型已保存', 'ok');
    });
    card.appendChild(settingsRow('默认项目类型', '新建项目弹窗里默认选中的类型。', typeSelect));

    var sizeSelect = h('select', { class: 'input' });
    [6, 9, 12, 18, 24].forEach(function (size) {
      sizeSelect.appendChild(h('option', {
        value: String(size), text: size + ' 张',
        selected: Number(state.settings.pageSize) === size
      }));
    });
    sizeSelect.value = String(state.settings.pageSize);
    sizeSelect.addEventListener('change', function () {
      updateSetting('pageSize', Number(sizeSelect.value) || 12, false);
      state.wallLimit = Number(sizeSelect.value) || 12;
      if (state.view === 'wall') renderProjectGrid();
      toast('每页卡片数已保存', 'ok');
    });
    card.appendChild(settingsRow('每页卡片数', '项目墙一次显示多少张卡片，底部可「加载更多」。', sizeSelect));

    card.appendChild(settingsRow('显示更新时间', '项目卡片底部显示最近更新时间。',
      switchControl(state.settings.showUpdated !== false, function (checked) {
        updateSetting('showUpdated', checked, false);
        if (state.view === 'wall') renderProjectGrid();
        toast(checked ? '已显示更新时间' : '已隐藏更新时间', 'ok');
      })));

    return card;
  }

  function settingsAppearance() {
    var card = settingsCard('外观', '主题、毛玻璃与动态效果。', 'palette');

    card.appendChild(settingsRow('主题', '默认跟随系统；也可以固定在浅色或深色。',
      segmented([
        { value: 'light', label: '浅色' },
        { value: 'dark', label: '深色' },
        { value: 'system', label: '跟随系统' }
      ], state.settings.theme, function (value) {
        updateSetting('theme', value);
        toast('主题已切换', 'ok');
      })));

    card.appendChild(settingsRow('毛玻璃强度', '卡片背后的模糊程度。',
      segmented([
        { value: 'low', label: '低' },
        { value: 'mid', label: '中' },
        { value: 'high', label: '高' }
      ], state.settings.blur, function (value) {
        updateSetting('blur', value);
        toast('毛玻璃强度已调整', 'ok');
      })));

    card.appendChild(settingsRow('动态效果', '卡片上浮与背景光斑漂移；关闭后完全静止。',
      switchControl(state.settings.motion !== false, function (checked) {
        updateSetting('motion', checked);
        toast(checked ? '已开启动态效果' : '已关闭动态效果', 'ok');
      })));

    return card;
  }

  function settingsAI() {
    var card = settingsCard('AI', 'AI 助手是右下角小球打开浮窗，服务商与 Key 在 AI 设置里配置。', 'ai');

    card.appendChild(settingsRow('AI 服务商', 'DeepSeek / OpenAI / Moonshot 等 OpenAI 兼容接口。',
      h('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: '打开 AI 设置',
        onclick: openAISettings
      })));

    card.appendChild(h('div', {
      class: 'settings-note',
      text: 'Key 只保存在服务端数据库（或环境变量 studio_ai_key），页面不会回显；AI 只能读取你在会话里附加的项目。'
    }));

    return card;
  }

  function settingsShare() {
    var card = settingsCard('分享', '新建分享链接时的默认值，只影响本机浏览器。', 'share');

    card.appendChild(settingsRow('默认权限', '仅浏览只能看和下载；可修改还能上传、改字段。',
      segmented([
        { value: 'view', label: '仅浏览' },
        { value: 'edit', label: '可修改' }
      ], state.settings.shareMode, function (value) {
        updateSetting('shareMode', value, false);
        toast('默认权限已保存', 'ok');
      })));

    var prefixInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '24',
      placeholder: '例如 hopzz-',
      value: state.settings.sharePrefix || ''
    });
    prefixInput.addEventListener('change', function () {
      var value = String(prefixInput.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      prefixInput.value = value;
      updateSetting('sharePrefix', value, false);
      toast('默认链接名前缀已保存', 'ok');
    });
    card.appendChild(settingsRow('默认链接名前缀', '新建分享链接时自动带上的前缀（小写字母/数字/-/_）。', prefixInput));

    card.appendChild(h('div', {
      class: 'settings-note',
      text: '发布的作品会出现在 https://hopzz.top 的作品列表里，只读：发布时会自动把分享权限设为「仅浏览」并开启链接。'
    }));

    return card;
  }

  function settingsAccount() {
    var card = settingsCard('账户', '修改访问密码，或退出当前登录。', 'oc');

    var oldInput = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: '当前密码' });
    var newInput = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: '新密码（至少 6 位）' });
    var confirmInput = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: '再输入一次新密码' });
    var errorEl = h('p', { class: 'form-error', role: 'alert' });
    var submitBtn = h('button', { class: 'btn btn-primary', type: 'button', text: '修改密码' });

    submitBtn.addEventListener('click', async function () {
      setText(errorEl, '');
      var oldPwd = oldInput.value;
      var newPwd = newInput.value;
      if (!oldPwd) { setText(errorEl, '请输入当前密码'); oldInput.focus(); return; }
      if (newPwd.length < 6) { setText(errorEl, '新密码至少 6 位'); newInput.focus(); return; }
      if (newPwd !== confirmInput.value) { setText(errorEl, '两次输入的新密码不一致'); confirmInput.focus(); return; }
      submitBtn.disabled = true;
      setText(submitBtn, '修改中…');
      try {
        await api('/api/password', { method: 'POST', json: { oldPassword: oldPwd, newPassword: newPwd } });
        oldInput.value = '';
        newInput.value = '';
        confirmInput.value = '';
        toast('密码已修改，下次用新密码登录', 'ok');
      } catch (err) {
        if (err.status !== 401) setText(errorEl, serverErrorText(err));
      } finally {
        submitBtn.disabled = false;
        setText(submitBtn, '修改密码');
      }
    });

    var form = h('div', { class: 'settings-form' },
      fieldBox('当前密码', oldInput),
      fieldBox('新密码', newInput),
      fieldBox('确认新密码', confirmInput),
      errorEl,
      h('div', { class: 'settings-actions' }, submitBtn)
    );
    card.appendChild(form);

    card.appendChild(settingsRow('退出登录', '清除本机登录状态，回到登录页。',
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '退出登录',
        onclick: function () { onLogout(); }
      })));

    return card;
  }

  function settingsAbout() {
    var card = settingsCard('关于', 'Hopzz Studio · 个人创作工作站。', 'info');
    var rows = h('div', { class: 'about-list' });

    rows.appendChild(h('div', { class: 'about-row' }, icon('info', 'ico-sm'),
      h('span', { text: '前端版本 v2.0.0' })));
    rows.appendChild(h('div', { class: 'about-row' }, icon('layers', 'ico-sm'),
      h('span', { text: '后端版本 ' + (state.backendVersion ? 'v' + state.backendVersion : '读取中…') })));
    rows.appendChild(h('div', { class: 'about-row' }, icon('external', 'ico-sm'),
      h('a', { href: 'https://hopzz.top', target: '_blank', rel: 'noopener', text: 'https://hopzz.top' })));
    rows.appendChild(h('div', { class: 'about-row' }, icon('code', 'ico-sm'),
      h('a', {
        href: 'https://github.com/HEHE-HEHEz53/hopzz-site',
        target: '_blank', rel: 'noopener',
        text: 'GitHub 仓库：HEHE-HEHEz53/hopzz-site'
      })));
    rows.appendChild(h('div', { class: 'about-row' }, icon('repo', 'ico-sm'),
      h('span', { text: '存储：/srv/files/工作站/<项目 ID>/（与网盘同一份文件）' })));

    card.appendChild(rows);
    card.appendChild(h('div', {
      class: 'settings-note',
      text: '分享出去的公开链接形如 /ll/<链接名>，随时可以在项目详情里关闭。'
    }));
    return card;
  }

  // ================================================================ 模块清单

  async function loadModules() {
    var data = await api('/api/modules');
    state.modules = normalizeModules(data);
    state.moduleDefaults = (data && data.defaults && typeof data.defaults === 'object')
      ? data.defaults : null;
  }

  function normalizeModules(data) {
    var raw = data;
    if (data && typeof data === 'object' && data.modules && typeof data.modules === 'object') {
      raw = data.modules;
    }
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      list = Object.keys(raw).map(function (key) {
        var value = raw[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.assign({ key: key }, value);
        }
        return { key: key, label: String(value || key) };
      });
    }
    return list.map(normalizeModule).filter(Boolean);
  }

  function normalizeModule(module) {
    if (!module || typeof module !== 'object') return null;
    var key = String(module.key || module.id || module.name || '');
    if (!key) return null;
    var label = String(module.label || module.title || module.name || key);
    var types = module.types || module.type || ['*'];
    if (typeof types === 'string') types = [types];
    if (!Array.isArray(types) || !types.length) types = ['*'];
    types = types.map(String);

    var fields = module.fields;
    var normalizedFields = [];
    if (Array.isArray(fields)) {
      normalizedFields = fields.map(normalizeField).filter(Boolean);
    } else if (fields && typeof fields === 'object') {
      normalizedFields = Object.keys(fields).map(function (fieldKey) {
        var value = fields[fieldKey];
        return normalizeField(Object.assign(
          { key: fieldKey },
          value && typeof value === 'object' ? value : { label: String(value || fieldKey) }
        ));
      }).filter(Boolean);
    }

    return {
      key: key,
      label: label,
      types: types,
      ui: module.ui ? String(module.ui) : "",
      fields: normalizedFields
    };
  }

  function normalizeField(field) {
    if (typeof field === 'string') {
      return { key: field, label: field, type: guessFieldType(field), options: [] };
    }
    if (!field || typeof field !== 'object') return null;
    var key = String(field.key || field.name || field.id || '');
    if (!key) return null;
    var type = String(field.type || field.input || field.widget || '').toLowerCase();
    if (!type) type = guessFieldType(key);
    if (type === 'string') type = 'text';

    var options = [];
    if (Array.isArray(field.options)) {
      options = field.options.map(function (option) {
        if (option && typeof option === 'object') {
          var value = option.value !== undefined ? option.value
            : (option.key !== undefined ? option.key : option.label);
          var label = option.label !== undefined ? option.label
            : (option.text !== undefined ? option.text : value);
          return { value: String(value), label: String(label) };
        }
        return { value: String(option), label: String(option) };
      });
    }

    return {
      key: key,
      label: String(field.label || field.title || key),
      type: type,
      options: options,
      rows: Number(field.rows) || 0,
      hint: String(field.hint || field.placeholder || ''),
      mono: field.mono === true
    };
  }

  function guessFieldType(key) {
    var lower = String(key).toLowerCase();
    if (NUMERIC_KEYS.indexOf(lower) >= 0) return 'number';
    if (lower === 'tags' || lower === 'tag') return 'tags';
    if (MONO_KEYS.indexOf(lower) >= 0) return 'textarea';
    if (lower === 'url' || lower === 'link' || lower === 'href') return 'url';
    if (lower === 'date' || lower === 'day') return 'date';
    return 'text';
  }

  function availableModulesFor(type) {
    return state.modules.filter(function (module) {
      return module.types.indexOf('*') >= 0 || module.types.indexOf(type) >= 0;
    });
  }

  function moduleDef(key) {
    for (var i = 0; i < state.modules.length; i += 1) {
      if (state.modules[i].key === key) return state.modules[i];
    }
    return null;
  }

  function moduleLabel(key) {
    var def = moduleDef(key);
    return def ? def.label : String(key);
  }

  function defaultModulesFor(type) {
    var available = availableModulesFor(type).map(function (module) { return module.key; });
    var preferred = (state.moduleDefaults && Array.isArray(state.moduleDefaults[type]))
      ? state.moduleDefaults[type]
      : (DEFAULT_MODULES[type] || ['meta']);
    var picked = preferred.filter(function (key) { return available.indexOf(key) >= 0; });
    if (!picked.length) {
      if (available.indexOf('meta') >= 0) picked = ['meta'];
      else if (available.length) picked = [available[0]];
    }
    return picked;
  }

  // ================================================================ 新建项目

  function openNewProject() {
    var nameInput = h('input', {
      class: 'input', type: 'text', maxlength: '80',
      placeholder: '例如：鲸落', autocomplete: 'off'
    });
    var typeSelect = h('select', { class: 'input' });
    TYPES.forEach(function (type) {
      if (!type.key) return;
      typeSelect.appendChild(h('option', { value: type.key, text: type.label }));
    });
    typeSelect.value = TYPE_MAP[state.settings.defaultType] ? state.settings.defaultType : 'music';

    var tagsInput = h('input', {
      class: 'input', type: 'text', maxlength: '200',
      placeholder: '用逗号分隔，可留空', autocomplete: 'off'
    });
    var modulesBox = h('div', { class: 'chip-check-list' });
    var errorEl = h('p', { class: 'form-error', role: 'alert' });
    var close = null;
    var submitting = false;

    function refreshModules() {
      clear(modulesBox);
      var available = availableModulesFor(typeSelect.value);
      if (!available.length) {
        modulesBox.appendChild(h('p', {
          class: 'hint',
          text: '模块清单未加载，项目建好后可以在详情页再添加模块。'
        }));
        return;
      }
      var defaults = defaultModulesFor(typeSelect.value);
      available.forEach(function (module) {
        var checkbox = h('input', {
          type: 'checkbox',
          value: module.key,
          checked: defaults.indexOf(module.key) >= 0
        });
        modulesBox.appendChild(h('label', { class: 'chip-check' },
          checkbox,
          h('span', { text: module.label })
        ));
      });
    }

    typeSelect.addEventListener('change', refreshModules);
    refreshModules();

    var cancelBtn = h('button', {
      class: 'btn btn-ghost', type: 'button', text: '取消',
      onclick: function () { if (close) close(); }
    });
    var okBtn = h('button', {
      class: 'btn btn-primary', type: 'button', text: '创建项目'
    });

    close = openModal({
      title: '新建项目',
      body: h('div', {},
        fieldBox('名称', nameInput),
        fieldBox('类型', typeSelect),
        fieldBox('标签', tagsInput, '逗号分隔，例如：电子，女声'),
        fieldBox('初始模块', modulesBox),
        errorEl
      ),
      actions: [cancelBtn, okBtn]
    });

    okBtn.addEventListener('click', async function () {
      if (submitting) return;
      var name = nameInput.value.trim();
      setText(errorEl, '');
      if (!name) {
        setText(errorEl, '项目名称不能为空');
        nameInput.focus();
        return;
      }
      var checked = Array.prototype.slice.call(
        modulesBox.querySelectorAll('input[type="checkbox"]:checked')
      ).map(function (checkbox) {
        return checkbox.value;
      });
      var tags = tagsInput.value.split(/[,，]/).map(function (tag) {
        return tag.trim();
      }).filter(Boolean);

      var payload = { name: name, type: typeSelect.value, tags: tags };
      if (checked.length) payload.modules = checked;

      submitting = true;
      okBtn.disabled = true;
      setText(okBtn, '创建中…');
      try {
        var data = await api('/api/projects', { method: 'POST', json: payload });
        var created = asObject(data, ['project']);
        close();
        toast('项目已创建', 'ok');
        if (created && created.id) {
          state.wallLimit = state.settings.pageSize;
          location.hash = '#/p/' + encodeURIComponent(created.id);
        } else {
          await openWall();
        }
      } catch (err) {
        submitting = false;
        okBtn.disabled = false;
        setText(okBtn, '创建项目');
        if (err.status === 401) return;
        // 把服务端返回的真实错误显示在弹窗里，并滚到可见位置
        var message = '创建失败：' + serverErrorText(err);
        if (err.status === 404 && /not found/i.test(String(err.message || ''))) {
          message += ' · 请求没有到达创建接口，请检查网关 / 部署配置';
        }
        setText(errorEl, message);
        if (errorEl.setAttribute) errorEl.setAttribute('data-error', '1');
        try {
          if (errorEl.scrollIntoView) errorEl.scrollIntoView({ block: 'nearest' });
        } catch (e) { /* ignore */ }
      }
    });

    setTimeout(function () {
      try { nameInput.focus(); } catch (err) { /* ignore */ }
    }, 80);
  }

  // ================================================================ 项目详情

  function normalizeProject(project) {
    if (!project || typeof project !== 'object') return null;
    project.name = String(project.name || '未命名项目');
    project.type = String(project.type || 'other');
    project.tags = Array.isArray(project.tags) ? project.tags.map(String) : [];
    project.modules = Array.isArray(project.modules) ? project.modules.map(String) : [];
    project.fields = (project.fields && typeof project.fields === 'object' && !Array.isArray(project.fields))
      ? project.fields : {};
    project.sections = Array.isArray(project.sections) ? project.sections.map(function (section) {
      var item = Object.assign({}, section);
      item.id = String(item.id || newSectionId());
      return item;
    }) : [];
    return project;
  }

  function newSectionId() {
    return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  async function openProject(id, tab) {
    showView('detail');
    state.detailTab = tab === 'repo' ? 'repo' : 'edit';
    state.repoPath = '';
    var detailView = $('#detail-view');
    if (detailView) {
      clear(detailView);
      detailView.appendChild(h('p', { class: 'hint', text: '读取中…' }));
    }
    try {
      var data = await api(projectUrl(id));
      state.project = normalizeProject(asObject(data, ['project']));
      if (!state.project || !state.project.id) throw new HttpError(404, '项目数据异常');
    } catch (err) {
      if (err.status === 401) return;
      toast('项目打不开：' + serverErrorText(err), 'error');
      location.hash = '#/wall';
      return;
    }
    renderDetail();
  }

  function renderDetail() {
    var view = $('#detail-view');
    if (!view) return;
    var project = state.project;
    if (!project) {
      clear(view);
      return;
    }
    clear(view);
    view.appendChild(buildDetailHead(project));
    view.appendChild(buildDetailTabs(project));
    var body = h('div', { class: 'detail-body' });
    if (state.detailTab === 'repo') {
      body.appendChild(buildRepoView());
    } else {
      body.appendChild(buildEditorView(project));
    }
    view.appendChild(body);
    document.title = project.name + ' · Hopzz Studio';

    if (state.detailTab === 'repo') {
      loadRepo(state.repoPath).catch(function (err) {
        if (err.status !== 401) toast('仓库读取失败：' + serverErrorText(err), 'error');
      });
    }
  }

  function buildDetailHead(project) {
    var info = typeInfo(project.type);

    var backBtn = h('button', {
      class: 'icon-btn back-btn',
      type: 'button',
      'aria-label': '返回项目墙',
      title: '返回项目墙',
      onclick: async function () {
        try { await flushSave(); } catch (err) { /* ignore */ }
        location.hash = '#/wall';
      }
    }, icon('back'));

    var nameInput = h('input', {
      class: 'title-input',
      type: 'text',
      value: project.name,
      maxlength: '80',
      'aria-label': '项目名称'
    });
    nameInput.addEventListener('input', function () {
      project.name = nameInput.value;
      document.title = (project.name || '未命名项目') + ' · Hopzz Studio';
      scheduleSave({ name: project.name });
    });
    nameInput.addEventListener('blur', function () {
      if (!nameInput.value.trim()) {
        project.name = '未命名项目';
        nameInput.value = project.name;
        scheduleSave({ name: project.name });
      }
    });

    var badge = h('span', { class: 'type-badge' }, icon(info.icon, 'ico-sm'), info.label);
    var published = project.publish && project.publish.enabled === true;
    var publishedBadge = published
      ? h('span', { class: 'published-badge' }, icon('check', 'ico-sm'), '已发布到 hopzz.top')
      : null;

    var saveStatus = h('span', { class: 'save-status is-saved', id: 'save-status', text: '已保存' });

    var shareBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onclick: function () {
        if (window.StudioShare && typeof window.StudioShare.open === 'function') {
          window.StudioShare.open(project, {
            onChanged: function (info2) {
              if (info2 && info2.publish) {
                project.publish = info2.publish;
              }
              renderDetail();
            }
          });
        } else {
          toast('分享面板没有加载', 'warn');
        }
      }
    }, icon('share', 'ico-sm'), h('span', { text: '分享' }));

    var deleteBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onclick: function () { deleteCurrentProject(deleteBtn); }
    }, icon('trash', 'ico-sm'), h('span', { text: '删除项目' }));

    return h('div', { class: 'detail-head' },
      backBtn,
      h('div', { class: 'detail-title-block' },
        h('div', { class: 'title-row' }, nameInput, badge, publishedBadge),
        buildTagStrip(project),
        h('p', {
          class: 'detail-meta',
          text: '更新于 ' + (fmtTime(project.updatedAt) || '—') + ' · ' + project.modules.length + ' 个模块' +
            (published ? ' · 公开链接 /ll/' + (project.publish.slug || '') : '')
        })
      ),
      h('div', { class: 'detail-head-actions' }, saveStatus, shareBtn, deleteBtn)
    );
  }

  function buildTagStrip(project) {
    var box = h('div', { class: 'tag-strip' });

    function rerender(focusInput) {
      clear(box);
      project.tags.forEach(function (tag) {
        var chip = h('span', { class: 'tag-chip tag-chip--removable' },
          h('span', { text: tag })
        );
        var removeBtn = h('button', {
          class: 'tag-remove',
          type: 'button',
          'aria-label': '移除标签 ' + tag
        }, icon('close', 'ico-sm'));
        removeBtn.addEventListener('click', function () {
          project.tags = project.tags.filter(function (item) { return item !== tag; });
          scheduleSave({ tags: project.tags });
          rerender(false);
        });
        chip.appendChild(removeBtn);
        box.appendChild(chip);
      });

      var input = h('input', {
        class: 'tag-add-input',
        type: 'text',
        maxlength: '24',
        placeholder: '+ 标签',
        'aria-label': '添加标签'
      });

      function commit() {
        var raw = input.value.trim();
        if (!raw) return false;
        var parts = raw.split(/[,，]/).map(function (part) {
          return part.trim();
        }).filter(Boolean);
        var changed = false;
        parts.forEach(function (part) {
          if (project.tags.indexOf(part) < 0) {
            project.tags.push(part);
            changed = true;
          }
        });
        input.value = '';
        if (changed) {
          scheduleSave({ tags: project.tags });
          rerender(true);
        }
        return changed;
      }

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      });
      input.addEventListener('blur', function () {
        commit();
      });
      box.appendChild(input);

      if (focusInput) {
        setTimeout(function () {
          try { input.focus(); } catch (err) { /* ignore */ }
        }, 0);
      }
    }

    rerender(false);
    return box;
  }

  function buildDetailTabs(project) {
    var container = h('div', { class: 'detail-tabs' });
    function tab(key, label) {
      return h('button', {
        class: 'tab-btn' + (state.detailTab === key ? ' is-active' : ''),
        type: 'button',
        text: label,
        'aria-pressed': state.detailTab === key ? 'true' : 'false',
        onclick: async function () {
          if (state.detailTab === key) return;
          try { await flushSave(); } catch (err) { /* ignore */ }
          state.detailTab = key;
          renderDetail();
        }
      });
    }
    container.appendChild(tab('edit', '编辑'));
    container.appendChild(tab('repo', '仓库'));
    return container;
  }

  function deleteCurrentProject(btn) {
    var project = state.project;
    if (!project) return;
    confirmDialog({
      title: '删除项目',
      message: '确定删除「' + project.name + '」吗？项目目录和里面的文件会一起删除，无法恢复。',
      danger: true,
      confirmText: '删除'
    }).then(async function (ok) {
      if (!ok) return;
      btn.disabled = true;
      try {
        await api(projectUrl(project.id), { method: 'DELETE' });
        toast('项目已删除', 'ok');
        state.project = null;
        location.hash = '#/wall';
      } catch (err) {
        btn.disabled = false;
        if (err.status !== 401) toast('删除失败：' + serverErrorText(err), 'error');
      }
    });
  }

  // ---------------------------------------------------------------- 自动保存

  function setSaveStatus(kind, text) {
    var el = $('#save-status');
    if (!el) return;
    el.className = 'save-status is-' + kind;
    el.textContent = text;
  }

  function scheduleSave(patch) {
    if (!state.project || !patch) return;
    state.pendingPatch = Object.assign(state.pendingPatch || {}, patch);
    setSaveStatus('saving', '未保存');
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      flushSave();
    }, 700);
  }

  async function flushSave() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    var project = state.project;
    var patch = state.pendingPatch;
    if (!project || !patch) return;
    state.pendingPatch = null;
    state.saveSeq += 1;
    var seq = state.saveSeq;
    setSaveStatus('saving', '保存中…');
    try {
      var data = await api(projectUrl(project.id), { method: 'PATCH', json: patch });
      if (seq !== state.saveSeq) return;
      var updated = asObject(data, ['project'], null);
      if (updated && updated.updatedAt) {
        project.updatedAt = updated.updatedAt;
        var metaEl = $('.detail-meta');
        if (metaEl) {
          setText(metaEl, '更新于 ' + (fmtTime(updated.updatedAt) || '—') + ' · ' + project.modules.length + ' 个模块');
        }
      }
      if (state.pendingPatch) setSaveStatus('saving', '未保存');
      else setSaveStatus('saved', '已保存 ' + nowClock());
    } catch (err) {
      if (err.status === 401) return;
      state.pendingPatch = Object.assign({}, patch, state.pendingPatch || {});
      setSaveStatus('error', '保存失败');
      toast('保存失败：' + serverErrorText(err), 'error');
    }
  }

  // ---------------------------------------------------------------- 编辑视图

  function buildEditorView(project) {
    var layout = h('div', { class: 'editor-layout' });
    layout.appendChild(buildModulePanel(project));

    var forms = h('div', { class: 'module-forms' });
    forms.appendChild(buildSummaryPanel(project));

    if (!project.modules.length) {
      forms.appendChild(h('p', { class: 'hint', text: '还没有启用模块，从左侧勾选添加。' }));
    } else {
      var ordered = project.modules.filter(function (key) { return key !== 'sections'; });
      if (project.modules.indexOf('sections') >= 0) ordered.push('sections');
      ordered.forEach(function (key) {
        forms.appendChild(buildModuleSection(project, key));
      });
    }
    layout.appendChild(forms);
    return layout;
  }

  function buildModulePanel(project) {
    var panel = h('aside', { class: 'module-panel' });
    panel.appendChild(h('h2', { class: 'panel-title', text: '模块' }));
    var list = h('div', { class: 'module-list' });
    var available = availableModulesFor(project.type);
    var knownKeys = [];

    if (!available.length) {
      list.appendChild(h('p', {
        class: 'hint',
        text: state.modules.length ? '该类型没有可用模块。' : '模块清单未加载，仅可管理已启用模块。'
      }));
    }

    available.forEach(function (module) {
      knownKeys.push(module.key);
      list.appendChild(buildModuleCheck(project, module.key, module.label, project.modules.indexOf(module.key) >= 0));
    });

    project.modules.forEach(function (key) {
      if (knownKeys.indexOf(key) >= 0) return;
      list.appendChild(buildModuleCheck(project, key, moduleLabel(key), true, true));
    });

    panel.appendChild(list);
    return panel;
  }

  function buildModuleCheck(project, key, label, checked, unknown) {
    var checkbox = h('input', {
      type: 'checkbox',
      checked: checked,
      'aria-label': label
    });
    checkbox.addEventListener('change', function () {
      toggleModule(project, key, checkbox.checked, checkbox);
    });
    return h('label', { class: 'module-check' + (unknown ? ' is-unknown' : '') },
      checkbox,
      h('span', { class: 'module-check-label', text: label })
    );
  }

  async function toggleModule(project, key, enabled, checkbox) {
    checkbox.disabled = true;
    try {
      await flushSave();
      if (enabled) {
        await api(projectUrl(project.id, '/modules'), { method: 'POST', json: { module: key } });
        if (project.modules.indexOf(key) < 0) project.modules.push(key);
        toast('已添加模块：' + moduleLabel(key), 'ok');
      } else {
        await api(projectUrl(project.id, '/modules/' + encodeURIComponent(key)), { method: 'DELETE' });
        project.modules = project.modules.filter(function (item) { return item !== key; });
        toast('已移除模块：' + moduleLabel(key), 'ok');
      }
      renderDetail();
    } catch (err) {
      checkbox.disabled = false;
      checkbox.checked = !enabled;
      if (err.status !== 401) toast('模块操作失败：' + serverErrorText(err), 'error');
    }
  }

  function buildSummaryPanel(project) {
    var panel = h('section', { class: 'module-section meta-panel' });
    panel.appendChild(h('h2', { class: 'module-title', text: '概要' }));

    var summary = h('textarea', {
      class: 'input textarea',
      rows: '3',
      maxlength: '2000',
      placeholder: '一句话简介，会显示在项目卡片上'
    });
    summary.value = project.summary || '';
    summary.addEventListener('input', function () {
      project.summary = summary.value;
      scheduleSave({ summary: project.summary });
    });
    attachAutoGrow(summary);

    panel.appendChild(fieldBox('摘要', summary));
    return panel;
  }

  function buildModuleSection(project, key) {
    var def = moduleDef(key);
    var section = h('section', { class: 'module-section' });
    section.appendChild(h('h2', { class: 'module-title', text: def ? def.label : moduleLabel(key) }));

    // 该模块声明了图形编辑器（如钢琴卷帘、和弦板）时，交给 StudioModules 渲染
    if (def && def.ui && window.StudioModules &&
        typeof window.StudioModules.has === "function" &&
        window.StudioModules.has(def.ui)) {
      var customHost = h("div", { class: "module-custom" });
      var initial = (project.modulesData && project.modulesData[key]) || {};
      try {
        window.StudioModules.render(customHost, {
          projectId: project.id,
          moduleId: key,
          ui: def.ui,
          spec: def,
          data: initial,
          onSave: function (next) {
            if (!project.modulesData) project.modulesData = {};
            project.modulesData[key] = next;
            var patch = { modulesData: {} };
            patch.modulesData[key] = next;
            scheduleSave(patch);
          }
        });
        section.appendChild(customHost);
        return section;
      } catch (err) {
        section.appendChild(h("p", { class: "hint", text: "图形编辑器加载失败：" + (err && err.message ? err.message : err) }));
      }
    }

    if (key === 'sections') {
      section.appendChild(buildSectionsEditor(project));
      return section;
    }

    if (!def) {
      var fallback = [{
        key: key,
        label: moduleLabel(key),
        type: 'textarea',
        options: [],
        rows: 4,
        hint: ''
      }];
      fallback.forEach(function (field) {
        section.appendChild(buildFieldControl(project, field));
      });
      return section;
    }

    var fields = def.fields.filter(function (field) {
      return SKIP_FIELD_KEYS.indexOf(field.key) < 0;
    });

    if (!fields.length) {
      section.appendChild(h('p', { class: 'hint', text: '该模块暂时没有可编辑字段。' }));
      return section;
    }

    fields.forEach(function (field) {
      section.appendChild(buildFieldControl(project, field));
    });
    return section;
  }

  function buildFieldControl(project, field) {
    var key = field.key;
    var current = project.fields[key];
    var type = field.type || guessFieldType(key);

    if (type === 'string') type = 'text';
    // 后端把长文本显式标成 textarea；只有缺失类型时按 key 猜。
    // 不要用 key 去覆盖显式类型（例如 duration 是 text 的 "3:42"）。
    if (type === 'text' && MONO_KEYS.indexOf(String(key).toLowerCase()) >= 0) {
      type = 'textarea';
    }

    if (type === 'checkbox' || type === 'boolean' || type === 'bool') {
      var checkbox = h('input', {
        type: 'checkbox',
        checked: current === true || current === 'true' || current === 1
      });
      checkbox.addEventListener('change', function () {
        project.fields[key] = checkbox.checked;
        scheduleSave({ fields: project.fields });
      });
      return h('label', { class: 'field field-check' },
        checkbox,
        h('span', { class: 'field-label', text: field.label })
      );
    }

    if (type === 'number') {
      var numberInput = h('input', {
        class: 'input input-number',
        type: 'number',
        step: 'any',
        placeholder: field.hint || ''
      });
      if (current !== null && current !== undefined && current !== '') {
        numberInput.value = String(current);
      }
      numberInput.addEventListener('input', function () {
        var raw = numberInput.value;
        project.fields[key] = raw === '' ? '' : Number(raw);
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, numberInput, field.hint);
    }

    if (type === 'select') {
      var select = h('select', { class: 'input' });
      select.appendChild(h('option', { value: '', text: '— 未选择 —' }));
      field.options.forEach(function (option) {
        select.appendChild(h('option', { value: option.value, text: option.label }));
      });
      select.value = current === null || current === undefined ? '' : String(current);
      select.addEventListener('change', function () {
        project.fields[key] = select.value;
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, select, field.hint);
    }

    if (type === 'tags') {
      var tagsInput = h('input', {
        class: 'input',
        type: 'text',
        placeholder: field.hint || '用逗号分隔'
      });
      tagsInput.value = Array.isArray(current) ? current.join('，') : (current === null || current === undefined ? '' : String(current));
      tagsInput.addEventListener('input', function () {
        var parts = tagsInput.value.split(/[,，]/).map(function (part) {
          return part.trim();
        }).filter(Boolean);
        project.fields[key] = parts;
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, tagsInput, field.hint);
    }

    if (type === 'date') {
      var dateInput = h('input', { class: 'input', type: 'date' });
      if (current) dateInput.value = String(current).slice(0, 10);
      dateInput.addEventListener('input', function () {
        project.fields[key] = dateInput.value;
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, dateInput, field.hint);
    }

    if (type === 'url') {
      var urlInput = h('input', { class: 'input', type: 'url', placeholder: 'https://' });
      if (current !== null && current !== undefined) urlInput.value = String(current);
      urlInput.addEventListener('input', function () {
        project.fields[key] = urlInput.value;
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, urlInput, field.hint);
    }

    if (type === 'text') {
      var textInput = h('input', { class: 'input', type: 'text', placeholder: field.hint || '' });
      if (current !== null && current !== undefined) textInput.value = String(current);
      textInput.addEventListener('input', function () {
        project.fields[key] = textInput.value;
        scheduleSave({ fields: project.fields });
      });
      return fieldBox(field.label, textInput, field.hint);
    }

    var textarea = h('textarea', {
      class: 'input textarea' + ((field.mono || MONO_KEYS.indexOf(String(key).toLowerCase()) >= 0) ? ' mono' : ''),
      rows: String(field.rows || 6),
      placeholder: field.hint || ''
    });
    textarea.value = valueToText(current);
    textarea.addEventListener('input', function () {
      project.fields[key] = textarea.value;
      scheduleSave({ fields: project.fields });
    });
    attachAutoGrow(textarea);
    return fieldBox(field.label, textarea, field.hint);
  }

  // ---------------------------------------------------------------- 片段编辑

  function buildSectionsEditor(project) {
    var editor = h('div', { class: 'sections-editor' });
    var list = h('div', { class: 'sections-list' });

    function rerender() {
      clear(list);
      if (!project.sections.length) {
        list.appendChild(h('p', { class: 'hint', text: '还没有片段。片段可以标记主歌、副歌、镜头等时间段。' }));
        return;
      }
      project.sections.forEach(function (section, index) {
        var nameInput = h('input', {
          class: 'input input-sm sec-name',
          type: 'text',
          value: String(section.name || ''),
          placeholder: '名称',
          'aria-label': '片段名称'
        });
        nameInput.addEventListener('input', function () {
          section.name = nameInput.value;
          scheduleSave({ sections: project.sections });
        });

        var startInput = h('input', {
          class: 'input input-sm sec-start',
          type: 'number',
          step: 'any',
          value: section.start === null || section.start === undefined ? '' : String(section.start),
          placeholder: '开始秒',
          'aria-label': '开始时间（秒）'
        });
        startInput.addEventListener('input', function () {
          section.start = startInput.value === '' ? null : Number(startInput.value);
          scheduleSave({ sections: project.sections });
        });

        var endInput = h('input', {
          class: 'input input-sm sec-end',
          type: 'number',
          step: 'any',
          value: section.end === null || section.end === undefined ? '' : String(section.end),
          placeholder: '结束秒',
          'aria-label': '结束时间（秒）'
        });
        endInput.addEventListener('input', function () {
          section.end = endInput.value === '' ? null : Number(endInput.value);
          scheduleSave({ sections: project.sections });
        });

        var notesInput = h('input', {
          class: 'input input-sm sec-notes',
          type: 'text',
          value: String(section.notes || ''),
          placeholder: '备注',
          'aria-label': '片段备注'
        });
        notesInput.addEventListener('input', function () {
          section.notes = notesInput.value;
          scheduleSave({ sections: project.sections });
        });

        var removeBtn = h('button', {
          class: 'icon-btn danger sec-del',
          type: 'button',
          'aria-label': '删除片段',
          title: '删除片段'
        }, icon('close', 'ico-sm'));
        removeBtn.addEventListener('click', function () {
          project.sections.splice(index, 1);
          scheduleSave({ sections: project.sections });
          rerender();
        });

        list.appendChild(h('div', { class: 'section-row' },
          nameInput, startInput, endInput, notesInput, removeBtn
        ));
      });
    }

    var addBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onclick: function () {
        project.sections.push({ id: newSectionId(), name: '新片段', start: 0, end: 0, notes: '' });
        scheduleSave({ sections: project.sections });
        rerender();
      }
    }, icon('plus', 'ico-sm'), h('span', { text: '添加片段' }));

    rerender();
    editor.appendChild(h('div', { class: 'sections-head' },
      h('span', { class: 'field-label', text: '片段 / 段落' }),
      addBtn
    ));
    editor.appendChild(list);
    return editor;
  }

  // ================================================================ 仓库

  function buildRepoView() {
    var crumbs = h('nav', { class: 'breadcrumbs', id: 'repo-crumbs', 'aria-label': '仓库路径' });
    var uploadInput = h('input', {
      type: 'file',
      multiple: true,
      class: 'visually-hidden',
      'aria-hidden': 'true',
      tabindex: '-1'
    });
    var uploadBtn = h('button', {
      class: 'btn btn-primary btn-sm', type: 'button'
    }, icon('upload', 'ico-sm'), h('span', { text: '上传文件' }));
    uploadBtn.addEventListener('click', function () { uploadInput.click(); });
    uploadInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(uploadInput.files || []);
      uploadInput.value = '';
      if (files.length) uploadFiles(files);
    });

    var mkdirBtn = h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button'
    }, icon('plus', 'ico-sm'), h('span', { text: '新建文件夹' }));
    mkdirBtn.addEventListener('click', function () { onCreateFolder(); });

    var refreshBtn = h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button'
    }, icon('refresh', 'ico-sm'), h('span', { text: '刷新' }));
    refreshBtn.addEventListener('click', function () {
      loadRepo(state.repoPath).catch(function (err) {
        if (err.status !== 401) toast('刷新失败：' + serverErrorText(err), 'error');
      });
    });

    var toolbar = h('div', { class: 'repo-toolbar' },
      crumbs,
      h('div', { class: 'repo-actions' }, uploadBtn, mkdirBtn, refreshBtn, uploadInput)
    );

    var uploadList = h('div', { class: 'upload-list', id: 'upload-list' });
    var tree = h('div', { class: 'repo-tree', id: 'repo-tree' },
      h('p', { class: 'hint', text: '读取中…' })
    );

    return h('div', { class: 'repo-view' }, toolbar, uploadList, tree);
  }

  function normalizeEntries(entries, basePath) {
    var result = [];
    entries.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var name = String(entry.name || entry.filename || '');
      if (!name) return;
      var isDir = entry.type === 'dir' || entry.type === 'directory' || entry.type === 'folder' ||
        entry.isDir === true || entry.is_dir === true;
      var path = entry.path
        ? String(entry.path).replace(/^\/+/, '')
        : (basePath ? basePath + '/' + name : name);
      var kind = String(entry.kind || '');
      if (!kind || kind === 'dir') kind = isDir ? 'dir' : mediaKind(name);
      result.push({
        name: name,
        path: path,
        dir: isDir,
        kind: kind,
        size: Number(entry.size) || 0,
        mtime: entry.mtime || entry.modifiedAt || entry.modified || ''
      });
    });
    result.sort(function (a, b) {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return result;
  }

  async function loadRepo(path) {
    var project = state.project;
    if (!project) return;
    state.repoPath = String(path || '').replace(/^\/+|\/+$/g, '');
    renderBreadcrumbs();

    var tree = $('#repo-tree');
    if (tree) {
      clear(tree);
      tree.appendChild(h('p', { class: 'hint', text: '读取中…' }));
    }

    var qs = state.repoPath ? '?path=' + encodeURIComponent(state.repoPath) : '';
    var data = await api(projectUrl(project.id, '/tree') + qs);
    var entries = asArray(data, ['entries', 'items', 'files', 'list', 'tree']);
    state.repoEntries = normalizeEntries(entries, state.repoPath);
    renderBreadcrumbs();
    renderRepoTree();
  }

  function renderBreadcrumbs() {
    var nav = $('#repo-crumbs');
    if (!nav) return;
    clear(nav);

    nav.appendChild(h('button', {
      class: 'crumb', type: 'button', text: '仓库根',
      onclick: function () { goRepo(''); }
    }));

    var parts = state.repoPath ? state.repoPath.split('/').filter(Boolean) : [];
    var acc = '';
    parts.forEach(function (part) {
      acc = acc ? acc + '/' + part : part;
      var target = acc;
      nav.appendChild(chevronRight());
      nav.appendChild(h('button', {
        class: 'crumb', type: 'button', text: part,
        onclick: function () { goRepo(target); }
      }));
    });
  }

  function goRepo(path) {
    loadRepo(path).catch(function (err) {
      if (err.status !== 401) toast('目录读取失败：' + serverErrorText(err), 'error');
    });
  }

  function renderRepoTree() {
    var tree = $('#repo-tree');
    var project = state.project;
    if (!tree || !project) return;
    clear(tree);

    if (!state.repoEntries.length) {
      tree.appendChild(h('p', {
        class: 'hint',
        text: state.repoPath ? '这个文件夹是空的。' : '项目目录还是空的，上传文件或新建文件夹吧。'
      }));
      return;
    }

    state.repoEntries.forEach(function (entry) {
      var row = h('div', { class: 'repo-row' + (entry.dir ? ' is-dir' : '') });

      if (!entry.dir && entry.kind === 'image') {
        var thumb = h('img', { class: 'repo-thumb', alt: '', loading: 'lazy' });
        thumb.addEventListener('error', function () {
          if (thumb.parentNode) thumb.parentNode.removeChild(thumb);
          row.insertBefore(h('span', { class: 'repo-icon' }, icon('image')), row.firstChild);
        });
        thumb.src = thumbUrl(project.id, entry.path, 96);
        row.appendChild(thumb);
      } else {
        row.appendChild(h('span', {
          class: 'repo-icon'
        }, icon(entry.dir ? KIND_ICON.dir : (KIND_ICON[entry.kind] || KIND_ICON.file))));
      }

      var nameBtn = h('button', {
        class: 'repo-name',
        type: 'button',
        text: entry.name,
        title: entry.name
      });
      nameBtn.addEventListener('click', function () {
        if (entry.dir) goRepo(entry.path);
        else openPreview(entry);
      });
      row.appendChild(nameBtn);

      row.appendChild(h('span', {
        class: 'repo-size',
        text: entry.dir ? '文件夹' : fmtSize(entry.size)
      }));
      row.appendChild(h('span', { class: 'repo-time', text: fmtTime(entry.mtime) }));

      var actions = h('div', { class: 'repo-row-actions' });
      if (entry.dir) {
        actions.appendChild(h('button', {
          class: 'btn btn-ghost btn-xs', type: 'button', text: '打开',
          onclick: function () { goRepo(entry.path); }
        }));
      } else {
        actions.appendChild(h('a', {
          class: 'btn btn-ghost btn-xs',
          href: downloadUrl(project.id, entry.path),
          download: entry.name,
          text: '下载'
        }));
        var deleteBtn = h('button', {
          class: 'btn btn-danger btn-xs', type: 'button', text: '删除'
        });
        deleteBtn.addEventListener('click', function () {
          deleteRepoEntry(entry, deleteBtn);
        });
        actions.appendChild(deleteBtn);
      }
      row.appendChild(actions);
      tree.appendChild(row);
    });
  }

  function uploadFiles(files) {
    var project = state.project;
    if (!project) return Promise.resolve();
    var uploadList = $('#upload-list');
    if (uploadList) clear(uploadList);

    var okCount = 0;
    var failedNames = [];
    var chain = Promise.resolve();

    files.forEach(function (file) {
      chain = chain.then(function () {
        var row = h('div', { class: 'upload-row' });
        var nameEl = h('span', { class: 'upload-name', text: file.name });
        var fill = h('span', { class: 'upload-fill' });
        var bar = h('span', { class: 'upload-bar' }, fill);
        var pct = h('span', { class: 'upload-pct', text: '0%' });
        row.appendChild(nameEl);
        row.appendChild(bar);
        row.appendChild(pct);
        if (uploadList) uploadList.appendChild(row);

        return uploadOne(project, file, function (ratio) {
          var percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
          fill.style.width = percent + '%';
          setText(pct, percent + '%');
        }).then(function (result) {
          var data = result && result.data ? result.data : null;
          if (data && data.ok === false) {
            throw new HttpError(400, data.error || '上传失败');
          }
          if (data && Array.isArray(data.failed) && data.failed.length && !(Array.isArray(data.uploaded) && data.uploaded.length)) {
            throw new HttpError(400, (data.failed[0] && (data.failed[0].error || data.failed[0].name)) || '上传失败');
          }
          okCount += 1;
          row.classList.add('is-done');
          fill.style.width = '100%';
          setText(pct, '完成');
        }).catch(function (err) {
          row.classList.add('is-error');
          setText(pct, '失败');
          failedNames.push(file.name);
          if (err && err.status === 401) throw err;
        });
      });
    });

    return chain.then(function () {
      if (okCount) toast('已上传 ' + okCount + ' 个文件', 'ok');
      if (failedNames.length) {
        var shown = failedNames.slice(0, 3).join('、');
        toast('有 ' + failedNames.length + ' 个文件上传失败：' + shown, 'error');
      }
      setTimeout(function () {
        if (uploadList) clear(uploadList);
      }, 2600);
      return loadRepo(state.repoPath).catch(function (err) {
        if (err.status !== 401) toast('刷新仓库失败：' + serverErrorText(err), 'error');
      });
    }).catch(function (err) {
      if (err && err.status !== 401) toast('上传中断：' + serverErrorText(err), 'error');
    });
  }

  function uploadOne(project, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var qs = state.repoPath ? '?path=' + encodeURIComponent(state.repoPath) : '';
      xhr.open('POST', projectUrl(project.id, '/upload') + qs);
      xhr.withCredentials = true;
      xhr.responseType = 'text';

      xhr.upload.addEventListener('progress', function (event) {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      });

      xhr.addEventListener('load', function () {
        if (xhr.status === 401) {
          handleUnauthorized();
          reject(new HttpError(401, '登录已过期'));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          var data = null;
          try {
            data = JSON.parse(xhr.responseText || 'null');
          } catch (err) {
            data = null;
          }
          resolve({ data: data });
          return;
        }
        var message = '上传失败（' + xhr.status + '）';
        try {
          var parsed = JSON.parse(xhr.responseText || '{}');
          if (parsed && (parsed.error || parsed.detail)) message = String(parsed.error || parsed.detail);
        } catch (err) { /* ignore */ }
        reject(new HttpError(xhr.status, message));
      });

      xhr.addEventListener('error', function () {
        reject(new HttpError(0, '网络错误'));
      });
      xhr.addEventListener('abort', function () {
        reject(new HttpError(0, '已取消'));
      });

      var form = new FormData();
      form.append('files', file, file.name);
      xhr.send(form);
    });
  }

  async function onCreateFolder() {
    var project = state.project;
    if (!project) return;
    var name = await promptDialog({
      title: '新建文件夹',
      label: '文件夹名称',
      placeholder: '例如：素材'
    });
    if (name === null) return;
    var clean = String(name).trim().replace(/[\\/]+/g, '-');
    if (!clean) {
      toast('文件夹名称不能为空', 'warn');
      return;
    }
    var fullPath = state.repoPath ? state.repoPath + '/' + clean : clean;
    try {
      // 后端 mkdir：JSON {"path": "assets/音频"} 是完整相对路径；
      // 若同时传 name，后端会再拼一次，所以这里只传 path。
      await api(projectUrl(project.id, '/mkdir'), {
        method: 'POST',
        json: { path: fullPath }
      });
      toast('文件夹已创建', 'ok');
      await loadRepo(state.repoPath);
    } catch (err) {
      if (err.status !== 401) toast('新建文件夹失败：' + serverErrorText(err), 'error');
    }
  }

  function deleteRepoEntry(entry, btn) {
    var project = state.project;
    if (!project) return;
    confirmDialog({
      title: '删除文件',
      message: '确定删除「' + entry.name + '」吗？删除后无法恢复。',
      danger: true,
      confirmText: '删除'
    }).then(async function (ok) {
      if (!ok) return;
      btn.disabled = true;
      try {
        await api(projectUrl(project.id, '/file') + '?path=' + encodeURIComponent(entry.path), {
          method: 'DELETE'
        });
        toast('已删除 ' + entry.name, 'ok');
        await loadRepo(state.repoPath);
      } catch (err) {
        btn.disabled = false;
        if (err.status !== 401) toast('删除失败：' + serverErrorText(err), 'error');
      }
    });
  }

  // ================================================================ 预览

  function openPreview(entry) {
    var project = state.project;
    if (!project) return;
    var kind = entry.kind || mediaKind(entry.name);
    var url = fileUrl(project.id, entry.path);
    var content = h('div', { class: 'preview' });
    var infoEl = h('p', {
      class: 'preview-hint hint',
      text: (entry.dir ? '文件夹' : fmtSize(entry.size)) + (entry.mtime ? ' · ' + fmtTime(entry.mtime) : '')
    });

    if (kind === 'image') {
      var img = h('img', { class: 'preview-img', alt: entry.name });
      var loadedFull = false;
      function loadFull() {
        if (loadedFull) return;
        loadedFull = true;
        img.src = url;
      }
      img.addEventListener('load', loadFull);
      img.addEventListener('error', loadFull);
      img.src = thumbUrl(project.id, entry.path, 1280);
      content.appendChild(img);
    } else if (kind === 'audio') {
      content.appendChild(h('audio', {
        class: 'preview-audio',
        controls: true,
        preload: 'metadata',
        src: url
      }));
    } else if (kind === 'video') {
      content.appendChild(h('video', {
        class: 'preview-video',
        controls: true,
        preload: 'metadata',
        src: url
      }));
    } else if (kind === 'text') {
      var pre = h('pre', { class: 'preview-text', text: '读取中…' });
      content.appendChild(pre);
      fetchText(url).then(function (text) {
        var limit = 200000;
        if (text.length > limit) {
          pre.textContent = text.slice(0, limit) + '\n\n…（已截断，文件共 ' + text.length + ' 字符）';
        } else {
          pre.textContent = text || '（空文件）';
        }
      }).catch(function (err) {
        if (err.status === 401) return;
        pre.textContent = '读取失败：' + serverErrorText(err);
      });
    } else {
      content.appendChild(h('div', { class: 'preview-generic' },
        h('span', { class: 'preview-generic-icon' }, icon(KIND_ICON[kind] || 'file')),
        h('p', { class: 'hint', text: '该类型不支持在线预览，请下载后查看。' })
      ));
    }

    var body = h('div', {}, content, infoEl);
    var downloadBtn = h('a', {
      class: 'btn btn-primary btn-sm',
      href: downloadUrl(project.id, entry.path),
      download: entry.name,
      text: '下载文件'
    });

    openModal({
      title: entry.name,
      body: body,
      actions: [downloadBtn],
      wide: kind === 'image' || kind === 'video'
    });

    api('/api/media/meta?project=' + encodeURIComponent(project.id) +
        '&path=' + encodeURIComponent(entry.path)).then(function (data) {
      var meta = asObject(data, ['meta'], data);
      if (!meta || typeof meta !== 'object') return;
      var parts = [];
      if (meta.image && meta.image.width && meta.image.height) {
        parts.push(meta.image.width + '×' + meta.image.height);
      }
      if (meta.video && meta.video.width && meta.video.height) {
        parts.push(meta.video.width + '×' + meta.video.height);
      }
      if (meta.durationText) {
        parts.push(String(meta.durationText));
      } else if (meta.duration) {
        var duration = fmtDuration(meta.duration);
        if (duration) parts.push(duration);
      }
      if (meta.video && meta.video.codec) parts.push(String(meta.video.codec));
      else if (meta.audio && meta.audio.codec) parts.push(String(meta.audio.codec));
      if (meta.mime) parts.push(String(meta.mime));
      if (meta.lines !== undefined && meta.lines !== null) parts.push(meta.lines + ' 行');
      if (meta.chars !== undefined && meta.chars !== null) parts.push(meta.chars + ' 字符');
      if (parts.length) infoEl.textContent += ' · ' + parts.join(' · ');
    }).catch(function () {
      /* 媒体元数据是锦上添花，失败忽略 */
    });
  }

  // ================================================================ 事件 / 启动

  function bindEvents() {
    var loginForm = $('#login-form');
    if (loginForm) loginForm.addEventListener('submit', onLoginSubmit);

    var newBtn = $('#new-project-btn');
    if (newBtn) newBtn.addEventListener('click', function () { openNewProject(); });

    var logoutBtn = $('#logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { onLogout(); });

    var brand = $('#brand-link');
    if (brand) {
      brand.addEventListener('click', function () {
        if (state.pendingPatch) flushSave();
      });
    }

    var searchInput = $('#search-input');
    if (searchInput) {
      var searchTimer = null;
      searchInput.addEventListener('input', function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.filters.q = searchInput.value.trim();
          state.wallLimit = state.settings.pageSize;
          applyWallFilters();
          renderWallHead();
          renderProjectGrid();
        }, 220);
      });
    }

    window.addEventListener('hashchange', function () {
      route().catch(function (err) {
        if (err && err.status === 401) return;
        toast((err && err.message) || '页面加载失败', 'error');
      });
    });

    // 系统主题变化时，跟随系统模式要实时切换
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (state.settings.theme === 'system') applySettings();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (err) { /* ignore */ }
  }

  function fillStaticIcons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
      paintIcon(el, el.getAttribute('data-icon'));
      el.removeAttribute('data-icon');
    });
  }

  async function init() {
    applySettings();
    fillStaticIcons();
    var brandMark = $('#brand-mark');
    if (brandMark) brandMark.appendChild(icon('layers', 'ico-lg'));
    var loginBrandMark = $('#login-brand-mark');
    if (loginBrandMark) loginBrandMark.appendChild(icon('layers', 'ico-lg'));
    renderPrimaryNav();
    bindEvents();

    try {
      var setupState = await api('/api/setup-state');
      if (setupState && setupState.needsSetup === true) {
        showLogin('setup');
        return;
      }
    } catch (err) {
      /* 接口不可用时按普通登录处理 */
    }

    var authed = false;
    try {
      var me = await api('/api/me');
      authed = !!(me && me.authed === true);
    } catch (err) {
      authed = false;
    }

    if (!authed) {
      showLogin('login');
      return;
    }

    state.authed = true;
    showMain();
    try {
      await loadModules();
    } catch (err) {
      if (err.status === 401) return;
      toast('模块清单加载失败：' + serverErrorText(err), 'warn');
    }
    await route();
    mountAI();
  }

  init().catch(function (err) {
    if (err && err.status === 401) return;
    toast((err && err.message) || '初始化失败', 'error');
  });

  // ================================================================ 对外接口（share-admin.js 复用）
  window.StudioUI = {
    h: h,
    icon: icon,
    toast: toast,
    openModal: openModal,
    closeAllModals: closeAllModals,
    confirm: confirmDialog,
    prompt: promptDialog,
    fieldBox: fieldBox,
    getSettings: function () { return Object.assign({}, state.settings); },
    getProject: function () { return state.project; },
    api: api,
    serverErrorText: serverErrorText
  };
})();
