/* ============================================================
   studio.hopzz.top — 前端主逻辑
   原生 JS：无构建、无框架、无外部 CDN、只用系统字体。
   硬约定：
   - 用户数据只用 createElement / textContent 写入，不拼 HTML
   - 所有请求 credentials: 'same-origin'
   - 任何 401 统一回登录页
   - AI 侧栏由 ai.js 暴露的 window.StudioAI.mount(body) 挂载
   ============================================================ */
(function () {
  'use strict';

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
    image: '▧',
    audio: '♫',
    video: '▶',
    text: '≡',
    archive: '❒',
    file: '•',
    dir: '▸'
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
    { key: '', label: '全部' },
    { key: 'music', label: '音乐', icon: '♪' },
    { key: 'lyrics', label: '歌词', icon: '✎' },
    { key: 'art', label: '绘画', icon: '✦' },
    { key: 'code', label: '代码', icon: '⌘' },
    { key: 'video', label: '视频', icon: '▶' },
    { key: 'story', label: '剧情', icon: '❧' },
    { key: 'world', label: '世界观', icon: '◉' },
    { key: 'oc', label: 'OC', icon: '☺' },
    { key: 'other', label: '其他', icon: '⋯' }
  ];

  var TYPE_MAP = {};
  TYPES.forEach(function (t) {
    if (t.key) TYPE_MAP[t.key] = t;
  });

  function typeInfo(key) {
    return TYPE_MAP[key] || { key: key, label: String(key || '其他'), icon: '◇' };
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

  // ================================================================ 状态

  var state = {
    authed: false,
    setupNeeded: false,
    view: 'login',

    allProjects: [],
    projects: [],
    tags: [],
    modules: [],
    filters: { type: '', q: '', tag: '' },

    project: null,
    detailTab: 'edit',
    repoPath: '',
    repoEntries: [],

    saveTimer: null,
    pendingPatch: null,
    saveSeq: 0,
    moduleDefaults: null,

    aiMounted: false
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
      throw new HttpError(0, '网络连接失败');
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
        if (raw) data = { error: raw.slice(0, 300) };
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
      throw new HttpError(0, '网络连接失败');
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
    }, 3200);
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
      text: '×',
      'aria-label': '关闭',
      onclick: function () { close(); }
    });

    var card = h('div', { class: 'modal' + (opts.wide ? ' modal-wide' : '') });
    var head = h('div', { class: 'modal-head' },
      h('h2', { class: 'modal-title', text: opts.title || '' }),
      closeBtn
    );
    var body = h('div', { class: 'modal-body' });
    if (opts.body) body.appendChild(opts.body);
    card.appendChild(head);
    card.appendChild(body);

    if (opts.actions && opts.actions.length) {
      var foot = h('div', { class: 'modal-actions' });
      opts.actions.forEach(function (action) {
        if (action) foot.appendChild(action);
      });
      card.appendChild(foot);
    }

    var overlay = h('div', { class: 'modal-overlay' }, card);
    overlay.addEventListener('click', function (e) {
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
        body: h('div', {}, fieldBox(settings.label || '名称', input)),
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
        setText(errorEl, err.message || '设置失败');
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
      setText(errorEl, err.message || '登录失败');
      $('#login-password').select();
    }
  }

  async function afterLogin() {
    state.authed = true;
    showMain();
    try {
      await loadModules();
    } catch (err) {
      if (err.status === 401) return;
      toast('模块清单加载失败：' + err.message, 'warn');
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
    state.filters = { type: '', q: '', tag: '' };
    closeAllModals();
    closeAI();
    try {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    } catch (err) { /* ignore */ }
    showLogin('login');
    toast('已退出登录', 'info');
  }

  // ================================================================ AI 侧栏

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
          try {
            var aiRoot = document.querySelector(".sai-root");
            if (aiRoot) { aiRoot.classList.add("sai-away"); }
          } catch (err) { /* ignore */ }
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
    // 登出 / 401 后必须允许下次登录重新挂载 AI 小球
    state.aiMounted = false;
  }

  // ================================================================ 路由

  async function route() {
    if (!state.authed) {
      showLogin('login');
      return;
    }
    if (state.pendingPatch) flushSave();

    var hash = location.hash || '';
    var match = hash.match(/^#\/p\/([a-z0-9][a-z0-9-]{2,63})(?:\/(repo))?$/i);
    if (match) {
      await openProject(match[1], match[2] ? 'repo' : 'edit');
      return;
    }
    try {
      if (hash !== '#/wall') history.replaceState(null, '', '#/wall');
    } catch (err) { /* ignore */ }
    await openWall();
  }

  function showView(name) {
    state.view = name;
    var wall = $('#wall-view');
    var detail = $('#detail-view');
    if (wall) wall.hidden = name !== 'wall';
    if (detail) detail.hidden = name !== 'detail';
  }

  // ================================================================ 项目墙

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

  function hasFilters() {
    return !!(state.filters.type || state.filters.q || state.filters.tag);
  }

  function applyFilters(list) {
    var type = state.filters.type;
    var tag = state.filters.tag;
    var query = (state.filters.q || '').toLowerCase();
    return list.filter(function (project) {
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

  async function loadWallList() {
    var params = new URLSearchParams();
    if (state.filters.type) params.set('type', state.filters.type);
    if (state.filters.q) params.set('q', state.filters.q);
    if (state.filters.tag) params.set('tag', state.filters.tag);
    var qs = params.toString();
    if (!qs) {
      state.projects = applyFilters(state.allProjects);
      return;
    }
    var data = await api('/api/projects?' + qs);
    var list = asArray(data, ['projects', 'items', 'list', 'data']);
    // 后端已按 type/q/tag 过滤（q 会搜 fields），直接信任；空结果也保留
    state.projects = list;
  }

  async function openWall() {
    showView('wall');
    state.project = null;
    var detailView = $('#detail-view');
    if (detailView) clear(detailView);
    document.title = 'Hopzz Studio · 创作工作站';
    try {
      await loadAllProjects();
    } catch (err) {
      if (err.status === 401) return;
      toast('项目列表加载失败：' + err.message, 'error');
      return;
    }
    try {
      await loadWallList();
    } catch (err) {
      if (err.status === 401) return;
      state.projects = applyFilters(state.allProjects);
    }
    renderWall();
  }

  function refreshList() {
    loadWallList().then(function () {
      renderWall();
    }).catch(function (err) {
      if (err.status !== 401) toast(err.message || '筛选失败', 'error');
    });
  }

  function renderWall() {
    var wallView = $('#wall-view');
    if (wallView) wallView.hidden = state.view !== 'wall';

    var info = state.filters.type ? typeInfo(state.filters.type) : null;
    var title = '全部项目';
    if (info) title = info.label + '项目';
    else if (state.filters.tag) title = '标签：' + state.filters.tag;
    if (state.filters.q) title = '搜索：' + state.filters.q;
    setText($('#wall-title'), title);
    setText($('#wall-count'), state.projects.length ? '共 ' + state.projects.length + ' 个项目' : '');

    var searchInput = $('#search-input');
    if (searchInput && document.activeElement !== searchInput) {
      searchInput.value = state.filters.q || '';
    }

    renderTypeNav();
    renderTagFilter();
    renderProjectGrid();
  }

  function renderTypeNav() {
    var nav = $('#type-nav');
    if (!nav) return;
    clear(nav);

    var counts = {};
    state.allProjects.forEach(function (project) {
      var key = String(project.type || 'other');
      counts[key] = (counts[key] || 0) + 1;
    });

    TYPES.forEach(function (type) {
      var active = state.filters.type === type.key;
      var btn = h('button', {
        class: 'type-btn' + (active ? ' is-active' : ''),
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onclick: function () {
          state.filters.type = type.key;
          refreshList();
        }
      });
      btn.appendChild(h('span', { class: 'type-icon', text: type.icon || '◇' }));
      btn.appendChild(h('span', { class: 'type-label', text: type.label }));
      var count = type.key ? (counts[type.key] || 0) : state.allProjects.length;
      btn.appendChild(h('span', { class: 'type-count', text: String(count) }));
      nav.appendChild(btn);
    });
  }

  function renderTagFilter() {
    var box = $('#tag-filter');
    if (!box) return;
    clear(box);

    var allChip = h('button', {
      class: 'tag-chip tag-btn' + (!state.filters.tag ? ' is-active' : ''),
      type: 'button',
      text: '全部标签',
      onclick: function () {
        state.filters.tag = '';
        refreshList();
      }
    });
    box.appendChild(allChip);

    state.tags.forEach(function (tag) {
      var active = state.filters.tag === tag;
      var chip = h('button', {
        class: 'tag-chip tag-btn' + (active ? ' is-active' : ''),
        type: 'button',
        text: tag,
        onclick: function () {
          state.filters.tag = state.filters.tag === tag ? '' : tag;
          refreshList();
        }
      });
      box.appendChild(chip);
    });

    if (!state.tags.length) {
      box.appendChild(h('span', { class: 'tag-empty', text: '暂无标签' }));
    }
  }

  function renderProjectGrid() {
    var grid = $('#project-grid');
    var empty = $('#wall-empty');
    if (!grid || !empty) return;
    clear(grid);
    clear(empty);

    if (!state.projects.length) {
      empty.hidden = false;
      empty.appendChild(h('span', { class: 'empty-icon', text: '◇' }));
      empty.appendChild(h('p', {
        class: 'empty-text',
        text: hasFilters() ? '没有符合条件的项目' : '还没有项目，先新建一个吧'
      }));
      if (!hasFilters()) {
        empty.appendChild(h('button', {
          class: 'btn btn-primary',
          type: 'button',
          text: '新建第一个项目',
          onclick: function () { openNewProject(); }
        }));
      }
      return;
    }

    empty.hidden = true;
    state.projects.forEach(function (project) {
      grid.appendChild(projectCard(project));
    });
  }

  function projectCard(project) {
    var info = typeInfo(project.type);
    var name = String(project.name || '未命名项目');
    var card = h('button', {
      class: 'project-card',
      type: 'button',
      'aria-label': name + '，' + info.label + '项目'
    });

    card.appendChild(h('div', { class: 'pc-head' },
      h('span', { class: 'pc-icon', text: info.icon || '◇' }),
      h('span', { class: 'pc-type', text: info.label })
    ));
    card.appendChild(h('h3', { class: 'pc-name', text: name }));

    if (project.summary) {
      var summary = String(project.summary);
      card.appendChild(h('p', {
        class: 'pc-summary',
        text: summary.length > 90 ? summary.slice(0, 90) + '…' : summary
      }));
    }

    var tags = Array.isArray(project.tags) ? project.tags.slice(0, 4) : [];
    if (tags.length) {
      var strip = h('div', { class: 'pc-tags' });
      tags.forEach(function (tag) {
        strip.appendChild(h('span', { class: 'tag-chip tag-chip--mini', text: tag }));
      });
      card.appendChild(strip);
    }

    var moduleCount = Array.isArray(project.modules) ? project.modules.length : 0;
    card.appendChild(h('div', { class: 'pc-foot' },
      h('span', { class: 'pc-modules', text: moduleCount + ' 个模块' }),
      h('span', { class: 'pc-time', text: fmtTime(project.updatedAt || project.createdAt) })
    ));

    card.addEventListener('click', function () {
      location.hash = '#/p/' + encodeURIComponent(project.id);
    });
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

    return { key: key, label: label, types: types, fields: normalizedFields };
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
    var tagsInput = h('input', {
      class: 'input', type: 'text', maxlength: '200',
      placeholder: '用逗号分隔，可留空', autocomplete: 'off'
    });
    var modulesBox = h('div', { class: 'chip-check-list' });
    var errorEl = h('p', { class: 'form-error', role: 'alert' });
    var close = null;

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

      okBtn.disabled = true;
      setText(okBtn, '创建中…');
      try {
        var data = await api('/api/projects', { method: 'POST', json: payload });
        var created = asObject(data, ['project']);
        close();
        toast('项目已创建', 'ok');
        if (created && created.id) {
          location.hash = '#/p/' + encodeURIComponent(created.id);
        } else {
          await openWall();
        }
      } catch (err) {
        okBtn.disabled = false;
        setText(okBtn, '创建项目');
        if (err.status !== 401) setText(errorEl, err.message || '创建失败');
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
      toast('项目打不开：' + err.message, 'error');
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
        if (err.status !== 401) toast('仓库读取失败：' + err.message, 'error');
      });
    }
  }

  function buildDetailHead(project) {
    var info = typeInfo(project.type);

    var backBtn = h('button', {
      class: 'icon-btn back-btn',
      type: 'button',
      text: '←',
      'aria-label': '返回项目墙',
      title: '返回项目墙',
      onclick: async function () {
        try { await flushSave(); } catch (err) { /* ignore */ }
        location.hash = '#/wall';
      }
    });

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

    var badge = h('span', { class: 'type-badge' },
      h('span', { class: 'type-icon', text: info.icon || '◇' }),
      info.label
    );

    var saveStatus = h('span', { class: 'save-status is-saved', id: 'save-status', text: '已保存' });

    var deleteBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      text: '删除项目'
    });
    deleteBtn.addEventListener('click', function () {
      deleteCurrentProject(deleteBtn);
    });

    return h('div', { class: 'detail-head' },
      backBtn,
      h('div', { class: 'detail-title-block' },
        h('div', { class: 'title-row' }, nameInput, badge),
        buildTagStrip(project),
        h('p', {
          class: 'detail-meta',
          text: '更新于 ' + (fmtTime(project.updatedAt) || '—') + ' · ' + project.modules.length + ' 个模块'
        })
      ),
      h('div', { class: 'detail-head-actions' }, saveStatus, deleteBtn)
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
          text: '×',
          'aria-label': '移除标签 ' + tag
        });
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
        if (err.status !== 401) toast('删除失败：' + err.message, 'error');
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
      toast('保存失败：' + err.message, 'error');
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
      // 片段编辑器固定在底部
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
    var wrapper = h('label', { class: 'module-check' + (unknown ? ' is-unknown' : '') },
      checkbox,
      h('span', { class: 'module-check-label', text: label })
    );
    return wrapper;
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
      if (err.status !== 401) toast('模块操作失败：' + err.message, 'error');
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
          text: '×',
          'aria-label': '删除片段',
          title: '删除片段'
        });
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
      text: '＋ 添加片段'
    });
    addBtn.addEventListener('click', function () {
      project.sections.push({ id: newSectionId(), name: '新片段', start: 0, end: 0, notes: '' });
      scheduleSave({ sections: project.sections });
      rerender();
    });

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
      class: 'btn btn-primary btn-sm', type: 'button', text: '↑ 上传文件'
    });
    uploadBtn.addEventListener('click', function () { uploadInput.click(); });
    uploadInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(uploadInput.files || []);
      uploadInput.value = '';
      if (files.length) uploadFiles(files);
    });

    var mkdirBtn = h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '＋ 新建文件夹'
    });
    mkdirBtn.addEventListener('click', function () { onCreateFolder(); });

    var refreshBtn = h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '刷新'
    });
    refreshBtn.addEventListener('click', function () {
      loadRepo(state.repoPath).catch(function (err) {
        if (err.status !== 401) toast('刷新失败：' + err.message, 'error');
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

    var root = h('button', {
      class: 'crumb', type: 'button', text: '仓库根',
      onclick: function () { goRepo(''); }
    });
    nav.appendChild(root);

    var parts = state.repoPath ? state.repoPath.split('/').filter(Boolean) : [];
    var acc = '';
    parts.forEach(function (part) {
      acc = acc ? acc + '/' + part : part;
      var target = acc;
      nav.appendChild(h('span', { class: 'crumb-sep', text: '/' }));
      nav.appendChild(h('button', {
        class: 'crumb', type: 'button', text: part,
        onclick: function () { goRepo(target); }
      }));
    });
  }

  function goRepo(path) {
    loadRepo(path).catch(function (err) {
      if (err.status !== 401) toast('目录读取失败：' + err.message, 'error');
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
          row.insertBefore(h('span', { class: 'repo-icon', text: KIND_ICON.image }), row.firstChild);
        });
        thumb.src = thumbUrl(project.id, entry.path, 96);
        row.appendChild(thumb);
      } else {
        row.appendChild(h('span', {
          class: 'repo-icon',
          text: entry.dir ? KIND_ICON.dir : (KIND_ICON[entry.kind] || KIND_ICON.file)
        }));
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
        var openBtn = h('button', {
          class: 'btn btn-ghost btn-xs', type: 'button', text: '打开',
          onclick: function () { goRepo(entry.path); }
        });
        actions.appendChild(openBtn);
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
        if (err.status !== 401) toast('刷新仓库失败：' + err.message, 'error');
      });
    }).catch(function (err) {
      if (err && err.status !== 401) toast('上传中断：' + err.message, 'error');
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
      if (err.status !== 401) toast('新建文件夹失败：' + err.message, 'error');
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
        if (err.status !== 401) toast('删除失败：' + err.message, 'error');
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
        pre.textContent = '读取失败：' + err.message;
      });
    } else {
      content.appendChild(h('div', { class: 'preview-generic' },
        h('span', { class: 'preview-generic-icon', text: KIND_ICON[kind] || KIND_ICON.file }),
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

    var searchInput = $('#search-input');
    if (searchInput) {
      var searchTimer = null;
      searchInput.addEventListener('input', function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.filters.q = searchInput.value.trim();
          refreshList();
        }, 250);
      });
    }

    window.addEventListener('hashchange', function () {
      route().catch(function (err) {
        if (err && err.status === 401) return;
        toast((err && err.message) || '页面加载失败', 'error');
      });
    });

    var brand = $('#brand-link');
    if (brand) {
      brand.addEventListener('click', function () {
        if (state.pendingPatch) flushSave();
      });
    }
  }

  async function init() {
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
      toast('模块清单加载失败：' + err.message, 'warn');
    }
    await route();
    mountAI();
  }

  init().catch(function (err) {
    if (err && err.status === 401) return;
    toast((err && err.message) || '初始化失败', 'error');
  });
})();
