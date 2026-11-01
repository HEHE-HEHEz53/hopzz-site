/* ============================================================
 * 鲸鱼娘在线 — 纯静态前端逻辑（二次元主题 · DSH Harness 镜像版）
 * 原生 JS（IIFE，严格模式），无框架、无外部依赖。
 * 所有来自服务端 / 用户的文本一律通过 textContent 写入，避免 XSS。
 * 主通道：WebSocket /ws 上的 req / res / ev 协议。
 * ============================================================ */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var STORAGE_THEME = 'chat.theme';
  var STORAGE_SESSION = 'lastSessionId';
  var BOTTOM_THRESHOLD = 80;  var MAX_RETRY_DELAY = 10000;
  var MAX_INPUT_LINES = 5;
  var MOBILE_QUERY = '(max-width: 767px)';
  var SNAPSHOT_TIMEOUT = 15000;
  var HISTORY_TIMEOUT = 20000;
  var CREATE_TIMEOUT = 30000;
  var RUNTIME_TIMEOUT = 20000;
  var BUNDLE_TIMEOUT = 30000;
  var POLL_INTERVAL = 30000;
  var MODAL_ANIM_MS = 220;
  var FLASH_MS = 1500;
  var PWD_SUCCESS_CLOSE_MS = 1200;
  var BUNDLE_CONFIRM_MS = 4000;
  var BUNDLE_FEEDBACK_MS = 9000;
  var PLUGIN_CONFIRM_MS = 4000;

  /* ================= DOM ================= */
  var root = document.documentElement;
  var metaTheme = document.getElementById('metaTheme');

  var loginView = document.getElementById('loginView');
  var loginForm = document.getElementById('loginForm');
  var passwordInput = document.getElementById('password');
  var loginBtn = document.getElementById('loginBtn');
  var loginError = document.getElementById('loginError');

  var setupView = document.getElementById('setupView');
  var setupForm = document.getElementById('setupForm');
  var setupPasswordInput = document.getElementById('setupPassword');
  var setupConfirmInput = document.getElementById('setupConfirm');
  var setupError = document.getElementById('setupError');
  var setupBtn = document.getElementById('setupBtn');

  var chatView = document.getElementById('chatView');
  var sidebar = document.getElementById('sidebar');
  var sidebarBackdrop = document.getElementById('sidebarBackdrop');
  var sessionList = document.getElementById('sessionList');
  var newSessionBtn = document.getElementById('newSessionBtn');
  var menuBtn = document.getElementById('menuBtn');

  var sessionTitle = document.getElementById('sessionTitle');
  var connDot = document.getElementById('connDot');
  var infoBtn = document.getElementById('infoBtn');
  var settingsBtn = document.getElementById('settingsBtn');
  var themeBtn = document.getElementById('themeBtn');
  var logoutBtn = document.getElementById('logoutBtn');

  var agentBanner = document.getElementById('agentBanner');
  var agentBannerText = document.getElementById('agentBannerText');

  var messagesEl = document.getElementById('messages');
  var messagesInner = document.getElementById('messagesInner');
  var emptyHint = document.getElementById('emptyHint');
  var emptyTitle = document.getElementById('emptyTitle');
  var emptyDesc = document.getElementById('emptyDesc');
  var retryBtn = document.getElementById('retryBtn');
  var jumpBtn = document.getElementById('jumpBtn');

  var inputEl = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var toastHost = document.getElementById('toastHost');

  var infoLayer = document.getElementById('infoLayer');
  var infoBackdrop = document.getElementById('infoBackdrop');
  var infoPanel = document.getElementById('infoPanel');
  var infoCloseBtn = document.getElementById('infoClose');
  var infoSubtitle = document.getElementById('infoSubtitle');
  var infoBody = document.getElementById('infoBody');

  var createModal = document.getElementById('createModal');
  var createBackdrop = document.getElementById('createBackdrop');
  var createCloseBtn = document.getElementById('createClose');
  var projectList = document.getElementById('projectList');
  var createError = document.getElementById('createError');

  var settingsModal = document.getElementById('settingsModal');
  var settingsBackdrop = document.getElementById('settingsBackdrop');
  var settingsCloseBtn = document.getElementById('settingsClose');
  var passwordForm = document.getElementById('passwordForm');
  var oldPasswordInput = document.getElementById('oldPassword');
  var newPasswordInput = document.getElementById('newPassword');
  var confirmPasswordInput = document.getElementById('confirmPassword');
  var passwordError = document.getElementById('passwordError');
  var passwordSuccess = document.getElementById('passwordSuccess');
  var passwordSubmitBtn = document.getElementById('passwordSubmit');
  var passwordCancelBtn = document.getElementById('passwordCancel');

  var connLoading = document.getElementById('connLoading');
  var connItems = document.getElementById('connItems');
  var connError = document.getElementById('connError');
  var connServer = document.getElementById('connServer');
  var connServerCopy = document.getElementById('connServerCopy');
  var connToken = document.getElementById('connToken');
  var connTokenCopy = document.getElementById('connTokenCopy');
  var connTokenToggle = document.getElementById('connTokenToggle');
  var connString = document.getElementById('connString');
  var connStringCopy = document.getElementById('connStringCopy');

  var pluginSpecInput = document.getElementById('pluginSpecInput');
  var pluginInstallBtn = document.getElementById('pluginInstallBtn');
  var pluginInstallResult = document.getElementById('pluginInstallResult');
  var pluginDiagnostic = document.getElementById('pluginDiagnostic');
  var pluginList = document.getElementById('pluginList');
  var pluginEmpty = document.getElementById('pluginEmpty');
  var aboutVersion = document.getElementById('aboutVersion');

  var mobileMedia = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;

  /* ================= 状态 ================= */
  var state = {
    view: 'boot',
    theme: 'dark',

    /* Harness 快照 */
    snapshot: null,
    snapshotLoaded: false,
    snapshotError: '',
    snapshotSeq: 0,
    snapshotRefreshTimer: 0,

    /* 会话选择 / 历史 */
    activeSessionId: '',
    loadedSessionId: '',
    historyToken: 0,
    historyLoading: false,
    historyError: '',
    bufferedAssistant: [],
    lastRendered: null,

    /* 侧栏 / 抽屉 / 弹窗 */
    drawerOpen: false,
    infoOpen: false,
    infoCloseTimer: 0,
    createCloseTimer: 0,
    creatingSession: false,
    flashSessionId: '',
    flashTimer: 0,

    /* 消息 / 输入 */
    stick: true,
    typingSessions: {},
    typingRow: null,
    pendingSends: {},

    /* 运行时操作（模型 / 模式 / 插件） */
    unsupported: { setModel: false, setPreset: false, setBundle: false },
    modelBusy: false,
    modelBusyKey: '',
    presetBusy: false,
    presetBusyKey: '',
    bundleBusy: {},
    bundleConfirm: '',
    bundleConfirmTimer: 0,
    bundleFeedback: {},
    bundleFeedbackTimers: {},

    /* WebSocket */
    ws: null,
    wsOpen: false,
    wsEnabled: false,
    wsAttempts: 0,
    retryTimer: 0,
    everConnected: false,
    agentOnline: null,
    pollTimer: 0,

    /* 登录 / 首启设置 / 改密码 */
    loginBusy: false,
    loginLocked: false,
    loginLockTimer: 0,
    setupBusy: false,
    pwdBusy: false,
    pwdLocked: false,
    pwdLockTimer: 0,
    pwdSuccess: false,
    pwdCloseTimer: 0,

    /* 连接参数 */
    connInfo: null,
    connSeq: 0,
    tokenVisible: false,

    /* 信息面板折叠状态（默认展开模型 / 模式） */
    infoAccordionOpen: {
      '模型': true,
      '模式': true,
      '权限': false,
      '插件': false,
      '项目': false
    },

    /* 插件管理 */
    pluginInstalling: false,
    pluginRemoveBusy: '',
    pluginRemoveConfirm: '',
    pluginRemoveConfirmTimer: 0
  };

  /* 请求 id -> { resolve, reject, timer } */
  var pendingReqs = new Map();
  var reqCounter = 0;

  /* ================= 通用工具 ================= */
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatShortTime(ms) {
    var ts = Number(ms);
    if (!isFinite(ts) || ts <= 0) return '';
    var date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    var diff = Math.round((today - thatDay) / 86400000);
    if (diff <= 0) return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    if (diff === 1) return '昨天';
    return pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function formatCountdown(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
  }

  function readJson(res) {
    try {
      return res.json();
    } catch (err) {
      return Promise.resolve(null);
    }
  }

  function apiJson(url, method, body) {
    var options = {
      method: method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined && body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(url, options);
  }

  function readStoredSessionId() {
    try {
      return window.localStorage.getItem(STORAGE_SESSION) || '';
    } catch (err) {
      return '';
    }
  }

  function storeSessionId(id) {
    try {
      if (id) window.localStorage.setItem(STORAGE_SESSION, id);
      else window.localStorage.removeItem(STORAGE_SESSION);
    } catch (err) {
      /* ignore */
    }
  }

  function isNodeConnected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return document.contains(node);
  }

  /* ================= Toast ================= */
  function showToast(message) {
    var text = typeof message === 'string' ? message : String(message || '');
    if (!text) return;

    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    toastHost.appendChild(el);

    while (toastHost.children.length > 2) {
      toastHost.removeChild(toastHost.firstChild);
    }

    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3600);
  }

  function clearToasts() {
    while (toastHost.firstChild) {
      toastHost.removeChild(toastHost.firstChild);
    }
  }

  /* ================= 主题 ================= */
  function readTheme() {
    try {
      var saved = window.localStorage.getItem(STORAGE_THEME);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (err) {
      /* ignore */
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', state.theme);

    if (metaTheme) {
      metaTheme.setAttribute('content', state.theme === 'light' ? '#f5fefe' : '#0a2e58');
    }
    if (themeBtn) {
      var label = state.theme === 'light' ? '切换到深色模式' : '切换到浅色模式';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.setAttribute('title', label);
    }
    try {
      window.localStorage.setItem(STORAGE_THEME, state.theme);
    } catch (err) {
      /* ignore */
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  /* ================= 视图 / 顶栏 ================= */
  function setView(next) {
    state.view = next;
    loginView.hidden = next !== 'login';
    setupView.hidden = next !== 'setup';
    chatView.hidden = next !== 'chat';
    if (next !== 'chat') {
      closeDrawer();
      closeInfoImmediate();
      closeCreateModalImmediate();
      closeSettingsImmediate();
    }
    updateComposerState();
    updateChatEmptyState();
    updateAgentBanner();
  }

  function updateHeader() {
    var session = findSession(state.activeSessionId);
    var title = session ? (session.title || '未命名会话')
      : (state.activeSessionId ? '会话' : '鲸鱼娘在线');
    sessionTitle.textContent = title;
    sessionTitle.setAttribute('title', title);
    document.title = session ? title + ' · 鲸鱼娘在线' : '鲸鱼娘在线';
  }

  function updateComposerState() {
    var hasText = inputEl.value.trim().length > 0;
    var pendingSend = !!state.pendingSends[state.activeSessionId];
    var blocked = state.view !== 'chat' ||
      !state.activeSessionId ||
      !state.wsOpen ||
      state.agentOnline === false ||
      state.historyLoading ||
      pendingSend;
    sendBtn.disabled = blocked || !hasText;
  }

  /* ================= 登录 ================= */
  function setLoginBusy(busy) {
    state.loginBusy = busy;
    loginBtn.disabled = busy || state.loginLocked;
    if (busy) loginBtn.textContent = '验证中…';
    else if (!state.loginLocked) loginBtn.textContent = '进入';
  }

  function setLoginError(message, isLock) {
    if (!message) {
      loginError.hidden = true;
      loginError.textContent = '';
      loginError.classList.remove('is-lock');
      return;
    }
    loginError.textContent = message;
    loginError.hidden = false;
    loginError.classList.toggle('is-lock', !!isLock);
  }

  function stopLoginLockout() {
    if (state.loginLockTimer) {
      window.clearInterval(state.loginLockTimer);
      state.loginLockTimer = 0;
    }
    state.loginLocked = false;
  }

  function startLoginLockout(seconds) {
    stopLoginLockout();
    state.loginLocked = true;
    var until = Date.now() + Math.max(1, seconds || 60) * 1000;
    loginBtn.disabled = true;

    var tick = function () {
      var remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        stopLoginLockout();
        setLoginError('', false);
        loginBtn.disabled = false;
        loginBtn.textContent = '进入';
        return;
      }
      setLoginError('尝试次数过多，已锁定，请在 ' + Math.ceil(remaining / 60) + ' 分钟后重试', true);
      loginBtn.disabled = true;
      loginBtn.textContent = '已锁定 ' + formatCountdown(remaining);
    };

    tick();
    state.loginLockTimer = window.setInterval(tick, 1000);
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    if (state.loginBusy || state.loginLocked) return;

    var password = passwordInput.value;
    if (!password) {
      setLoginError('请输入密码', false);
      passwordInput.focus();
      return;
    }

    setLoginBusy(true);
    setLoginError('', false);

    try {
      var res = await apiJson('/api/login', 'POST', { password: password });
      if (res.ok) {
        setLoginBusy(false);
        enterApp();
        return;
      }
      var data = await readJson(res);
      if (res.status === 401) {
        setLoginBusy(false);
        var remaining = data && typeof data.remaining === 'number' ? data.remaining : null;
        setLoginError(remaining !== null && remaining > 0
          ? '密码不对，还能试 ' + remaining + ' 次'
          : '密码不对', false);
        passwordInput.value = '';
        passwordInput.focus();
      } else if (res.status === 429) {
        setLoginBusy(false);
        var retryAfter = data && typeof data.retry_after === 'number' ? data.retry_after : 60;
        passwordInput.value = '';
        startLoginLockout(retryAfter);
      } else {
        setLoginBusy(false);
        setLoginError('登录失败，请稍后重试', false);
      }
    } catch (err) {
      setLoginBusy(false);
      setLoginError('网络错误，请检查连接', false);
    }
  }

  function showLogin() {
    closeSocket();
    resetAppUi();
    setView('login');
    clearToasts();
    stopLoginLockout();
    setLoginError('', false);
    passwordInput.value = '';
    state.loginBusy = false;
    loginBtn.disabled = false;
    loginBtn.textContent = '进入';

    window.setTimeout(function () {
      if (state.view === 'login') passwordInput.focus();
    }, 80);
  }

  function expireSession() {
    showLogin();
    setLoginError('登录已过期，请重新输入密码', false);
  }

  /* ================= 首次设置密码 ================= */
  function setSetupError(message) {
    if (!message) {
      setupError.hidden = true;
      setupError.textContent = '';
      return;
    }
    setupError.textContent = message;
    setupError.hidden = false;
  }

  function setSetupBusy(busy) {
    state.setupBusy = busy;
    setupBtn.disabled = busy;
    setupBtn.textContent = busy ? '设置中…' : '设置并进入';
  }

  function showSetup(message) {
    closeSocket();
    resetAppUi();
    setView('setup');
    clearToasts();
    setSetupError(message || '');
    setupPasswordInput.value = '';
    setupConfirmInput.value = '';
    state.setupBusy = false;
    setupBtn.disabled = false;
    setupBtn.textContent = '设置并进入';

    window.setTimeout(function () {
      if (state.view === 'setup') setupPasswordInput.focus();
    }, 80);
  }

  async function onSetupSubmit(event) {
    event.preventDefault();
    if (state.setupBusy) return;

    var password = setupPasswordInput.value;
    var confirm = setupConfirmInput.value;

    if (password.length < 8) {
      setSetupError('密码至少 8 位');
      setupPasswordInput.focus();
      return;
    }
    if (password !== confirm) {
      setSetupError('两次输入的密码不一致');
      setupConfirmInput.focus();
      return;
    }

    setSetupBusy(true);
    setSetupError('');

    try {
      var res = await fetch('/api/setup', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ password: password })
      });
      var data = await readJson(res);

      if (res.ok) {
        setSetupBusy(false);
        enterApp();
        return;
      }

      setSetupBusy(false);
      if (res.status === 409) {
        setSetupError('密码已设置，请登录');
        window.setTimeout(function () {
          if (state.view === 'setup') showLogin();
        }, 1600);
        return;
      }
      if (res.status === 400) {
        setSetupError(data && typeof data.error === 'string' && data.error ? data.error : '密码至少 8 位');
        return;
      }
      setSetupError(data && typeof data.error === 'string' && data.error ? data.error : '设置失败，请稍后重试');
    } catch (err) {
      setSetupBusy(false);
      setSetupError('网络错误，请检查连接');
    }
  }

  /* ================= 数据归一化 ================= */
  function normalizeWorkspaces(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      if (!w || typeof w !== 'object') continue;
      var id = w.id === undefined || w.id === null ? '' : String(w.id);
      if (!id) continue;
      out.push({
        id: id,
        title: typeof w.title === 'string' ? w.title : '',
        path: typeof w.path === 'string' ? w.path : ''
      });
    }
    return out;
  }

  function normalizeSessions(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s || typeof s !== 'object') continue;
      var id = s.id === undefined || s.id === null ? '' : String(s.id);
      if (!id) continue;

      var model = null;
      if (s.model && typeof s.model === 'object' && s.model.provider && s.model.model) {
        model = {
          provider: String(s.model.provider),
          model: String(s.model.model)
        };
      }

      out.push({
        id: id,
        title: typeof s.title === 'string' ? s.title : '',
        cwd: typeof s.cwd === 'string' ? s.cwd : '',
        workspaceId: typeof s.workspaceId === 'string' ? s.workspaceId : '',
        groupKey: typeof s.groupKey === 'string' ? s.groupKey : '',
        groupTitle: typeof s.groupTitle === 'string' ? s.groupTitle : '',
        updatedAt: Number(s.updatedAt) || 0,
        running: s.running === true,
        blank: s.blank === true,
        preset: typeof s.preset === 'string' ? s.preset : '',
        permissions: typeof s.permissions === 'string' ? s.permissions : '',
        model: model,
        agentAvailable: s.agentAvailable !== false
      });
    }
    return out;
  }

  function normalizeInfo(raw) {
    var fallback = { model: null, modelGroups: [], presets: [], bundles: [] };
    if (!raw || typeof raw !== 'object') return fallback;

    var model = null;
    if (raw.model && typeof raw.model === 'object') {
      model = {
        provider: raw.model.provider === undefined ? '' : String(raw.model.provider),
        model: raw.model.model === undefined ? '' : String(raw.model.model)
      };
    }

    var modelGroups = [];
    if (Array.isArray(raw.modelGroups)) {
      for (var i = 0; i < raw.modelGroups.length; i++) {
        var g = raw.modelGroups[i];
        if (!g || typeof g !== 'object') continue;
        var models = [];
        if (Array.isArray(g.models)) {
          for (var j = 0; j < g.models.length; j++) {
            var m = g.models[j];
            if (!m || typeof m !== 'object') continue;
            models.push({
              id: m.id === undefined ? '' : String(m.id),
              name: m.name === undefined ? String(m.id || '') : String(m.name),
              reasoning: m.reasoning === undefined ? null : m.reasoning
            });
          }
        }
        modelGroups.push({
          id: g.id === undefined ? '' : String(g.id),
          name: g.name === undefined ? String(g.id || '') : String(g.name),
          models: models
        });
      }
    }

    var presets = [];
    if (Array.isArray(raw.presets)) {
      for (var k = 0; k < raw.presets.length; k++) {
        var p = raw.presets[k];
        if (!p || typeof p !== 'object') continue;
        presets.push({
          id: p.id === undefined ? '' : String(p.id),
          name: p.name === undefined ? String(p.id || '') : String(p.name),
          description: typeof p.description === 'string' ? p.description : ''
        });
      }
    }

    var bundles = [];
    if (Array.isArray(raw.bundles)) {
      for (var b = 0; b < raw.bundles.length; b++) {
        var bundle = raw.bundles[b];
        if (!bundle || typeof bundle !== 'object') continue;
        var name = bundle.name === undefined ? '' : String(bundle.name);
        if (!name) continue;
        bundles.push({
          name: name,
          version: bundle.version === undefined ? '' : String(bundle.version),
          enabled: bundle.enabled !== false
        });
      }
    }

    return { model: model, modelGroups: modelGroups, presets: presets, bundles: bundles };
  }

  function findSession(id) {
    if (!id || !state.snapshot) return null;
    var sessions = state.snapshot.sessions;
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === id) return sessions[i];
    }
    return null;
  }

  function sortSessions() {
    if (!state.snapshot) return;
    state.snapshot.sessions.sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function shortModelName(modelId) {
    var text = String(modelId || '');
    var slash = text.lastIndexOf('/');
    if (slash >= 0) text = text.slice(slash + 1);
    var dash = text.lastIndexOf('-');
    if (dash >= 0 && dash < text.length - 1) text = text.slice(dash + 1);
    return text;
  }

  function presetLabel(presetId) {
    if (!presetId) return '';
    var info = state.snapshot ? state.snapshot.info : null;
    if (info && Array.isArray(info.presets)) {
      for (var i = 0; i < info.presets.length; i++) {
        if (info.presets[i].id === presetId) return info.presets[i].name || info.presets[i].id;
      }
    }
    return presetId;
  }

  function currentSessionModel() {
    var session = findSession(state.activeSessionId);
    if (session && session.model && session.model.provider && session.model.model) {
      return session.model;
    }
    var info = state.snapshot ? state.snapshot.info : null;
    return info && info.model ? info.model : null;
  }

  function reasoningEffortOf(model) {
    if (!model) return '';
    var reasoning = model.reasoning;
    if (typeof reasoning === 'string' && reasoning) return reasoning;
    if (Array.isArray(reasoning) && reasoning.length) {
      var first = reasoning[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        if (typeof first.id === 'string' && first.id) return first.id;
        if (typeof first.value === 'string' && first.value) return first.value;
      }
    }
    return '';
  }

  function isRelayBundle(name) {
    return typeof name === 'string' &&
      (name === '@local/dsh-web-relay' || name.indexOf('dsh-web-relay') >= 0);
  }

  function isUnknownActionError(message) {
    return typeof message === 'string' && message.indexOf('未知操作') >= 0;
  }

  function markUnsupported(action, message) {
    if (!isUnknownActionError(message)) return false;
    state.unsupported[action] = true;
    showToast('需要重启 DSH 才能使用这个功能');
    if (state.infoOpen) renderInfoPanel();
    return true;
  }

  /* ================= 侧栏：分组会话列表 ================= */
  function buildGroups() {
    var snapshot = state.snapshot;
    var sessions = snapshot && Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
    var workspaces = snapshot && Array.isArray(snapshot.workspaces) ? snapshot.workspaces : [];

    var workspaceMap = {};
    for (var i = 0; i < workspaces.length; i++) workspaceMap[workspaces[i].id] = workspaces[i];

    var groupsByKey = {};
    var order = [];

    for (var j = 0; j < sessions.length; j++) {
      var session = sessions[j];
      var key = '';
      var title = '';
      var path = '';

      if (session.workspaceId) {
        var workspace = workspaceMap[session.workspaceId];
        key = 'ws:' + session.workspaceId;
        if (workspace) {
          title = workspace.title || '未命名项目';
          path = workspace.path || '';
        } else {
          title = session.groupTitle || '未归属';
        }
      } else if (session.groupKey) {
        key = 'gk:' + session.groupKey;
        title = session.groupTitle || session.groupKey;
      } else {
        key = 'unknown';
        title = '未归属';
      }

      if (!groupsByKey[key]) {
        groupsByKey[key] = { key: key, title: title, path: path, sessions: [] };
        order.push(key);
      }
      groupsByKey[key].sessions.push(session);
    }

    /* 有工作区的分组按 workspaces 顺序排在前面，其余按出现顺序，unknown 最后 */
    var result = [];
    var added = {};
    for (var w = 0; w < workspaces.length; w++) {
      var wsKey = 'ws:' + workspaces[w].id;
      if (groupsByKey[wsKey]) {
        result.push(groupsByKey[wsKey]);
        added[wsKey] = true;
      }
    }
    for (var o = 0; o < order.length; o++) {
      var k = order[o];
      if (k === 'unknown' || added[k]) continue;
      result.push(groupsByKey[k]);
      added[k] = true;
    }
    if (groupsByKey.unknown) result.push(groupsByKey.unknown);

    return result;
  }

  function createSessionBadge(text) {
    var badge = document.createElement('span');
    badge.className = 'session-badge';
    badge.textContent = text;
    return badge;
  }

  function buildSessionItem(session) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'session-item';
    button.dataset.id = session.id;
    button.setAttribute('role', 'listitem');
    if (session.id === state.activeSessionId) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'true');
    }
    if (state.flashSessionId === session.id) button.classList.add('is-flash');

    var title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = session.title || '未命名会话';
    button.appendChild(title);

    var meta = document.createElement('span');
    meta.className = 'session-meta';

    var time = document.createElement('span');
    time.className = 'session-time';
    time.textContent = formatShortTime(session.updatedAt);
    meta.appendChild(time);

    if (session.running) {
      var dot = document.createElement('span');
      dot.className = 'running-dot';
      dot.setAttribute('title', '正在运行');
      meta.appendChild(dot);
    }
    button.appendChild(meta);

    var badges = document.createElement('span');
    badges.className = 'session-badges';
    if (session.preset) badges.appendChild(createSessionBadge(session.preset));
    if (session.model && session.model.model) badges.appendChild(createSessionBadge(shortModelName(session.model.model)));
    if (badges.children.length) button.appendChild(badges);

    button.setAttribute('title', session.title || '未命名会话');
    button.addEventListener('click', function () {
      closeDrawer();
      selectSession(session.id);
    });

    return button;
  }

  function renderSidebar() {
    var scrollTop = sessionList.scrollTop;
    sessionList.textContent = '';

    var groups = buildGroups();
    if (!groups.length) {
      var empty = document.createElement('div');
      empty.className = 'session-empty';
      empty.textContent = '去电脑上开一个会话，或点新建';
      sessionList.appendChild(empty);
    } else {
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var groupEl = document.createElement('div');
        groupEl.className = 'session-group';

        var heading = document.createElement('div');
        heading.className = 'session-group-title';
        heading.textContent = group.title;
        if (group.path) heading.setAttribute('title', group.path);
        groupEl.appendChild(heading);

        var items = document.createElement('div');
        items.className = 'session-group-items';
        for (var j = 0; j < group.sessions.length; j++) {
          items.appendChild(buildSessionItem(group.sessions[j]));
        }
        groupEl.appendChild(items);
        sessionList.appendChild(groupEl);
      }
    }

    sessionList.scrollTop = scrollTop;
  }

  function flashSession(sessionId) {
    state.flashSessionId = sessionId;
    renderSidebar();
    if (state.flashTimer) window.clearTimeout(state.flashTimer);
    state.flashTimer = window.setTimeout(function () {
      state.flashTimer = 0;
      if (state.flashSessionId === sessionId) {
        state.flashSessionId = '';
        renderSidebar();
      }
    }, FLASH_MS);
  }

  function bumpSession(sessionId, patch) {
    var session = findSession(sessionId);
    if (!session) return;
    if (patch) {
      for (var key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) session[key] = patch[key];
      }
    }
    session.updatedAt = Date.now();
    sortSessions();
    renderSidebar();
    updateHeader();
    if (state.infoOpen) renderInfoPanel();
  }

  /* ================= 快照 ================= */
  function applySnapshot(data) {
    if (!data || typeof data !== 'object') return;
    state.snapshot = {
      workspaces: normalizeWorkspaces(data.workspaces),
      sessions: normalizeSessions(data.sessions),
      info: normalizeInfo(data.info)
    };
    state.snapshotLoaded = true;
    state.snapshotError = '';
    sortSessions();
    renderSidebar();
    updateHeader();
    if (state.infoOpen) renderInfoPanel();
    if (!settingsModal.hidden) renderPluginList();
    updateAboutVersion();
    updateChatEmptyState();
  }

  async function fetchSnapshot(options) {
    var opts = options || {};
    var seq = ++state.snapshotSeq;
    try {
      var data = await wsRequest('snapshot', {}, { timeoutMs: SNAPSHOT_TIMEOUT });
      if (seq !== state.snapshotSeq) return null;
      applySnapshot(data);
      return data;
    } catch (err) {
      if (seq !== state.snapshotSeq) return null;
      var message = err && err.message ? err.message : '加载会话失败';
      state.snapshotError = message;
      if (message.indexOf('电脑端未连接') >= 0) {
        state.agentOnline = false;
        updateConnDot();
      }
      updateChatEmptyState();
      if (!opts.silent && state.view === 'chat' && message.indexOf('电脑端未连接') < 0) {
        showToast(message);
      }
      return null;
    }
  }

  async function refreshSnapshotOnly() {
    if (state.view !== 'chat' || !state.wsOpen) return;
    try {
      var socket = state.ws;
      var data = await fetchSnapshot({ silent: true });
      if (!data || state.ws !== socket) return;
      await syncSessionSelection('', false);
      updateChatEmptyState();
      updateComposerState();
    } catch (err) {
      /* 静默刷新失败不打扰用户 */
    }
  }

  function scheduleSnapshotRefresh(delay) {
    if (state.snapshotRefreshTimer) window.clearTimeout(state.snapshotRefreshTimer);
    state.snapshotRefreshTimer = window.setTimeout(function () {
      state.snapshotRefreshTimer = 0;
      refreshSnapshotOnly();
    }, delay || 800);
  }

  /* ================= 选择会话 / 历史 ================= */
  async function syncSessionSelection(preferredId, reloadHistory) {
    var sessions = state.snapshot && Array.isArray(state.snapshot.sessions) ? state.snapshot.sessions : [];
    var targetId = '';

    if (preferredId && findSession(preferredId)) targetId = preferredId;
    else if (state.activeSessionId && findSession(state.activeSessionId)) targetId = state.activeSessionId;
    else {
      var stored = readStoredSessionId();
      if (stored && findSession(stored)) targetId = stored;
      else if (sessions.length) targetId = sessions[0].id;
    }

    if (!targetId) {
      state.activeSessionId = '';
      state.loadedSessionId = '';
      state.historyLoading = false;
      state.historyError = '';
      setTyping(false);
      resetMessagesForLoading();
      updateHeader();
      renderSidebar();
      updateComposerState();
      updateChatEmptyState();
      return;
    }

    /* 同一会话正在加载历史时，不要因为快照刷新而重复发起请求 */
    if (targetId === state.activeSessionId && state.historyLoading) {
      updateHeader();
      renderSidebar();
      updateComposerState();
      updateChatEmptyState();
      return;
    }

    /* 同一会话加载失败后，等用户点重试或重连成功再拉，避免快照刷新反复自动重试 */
    if (targetId === state.activeSessionId && !reloadHistory && state.historyError) {
      updateHeader();
      renderSidebar();
      updateComposerState();
      updateChatEmptyState();
      return;
    }

    var reuse = !reloadHistory &&
      targetId === state.activeSessionId &&
      state.loadedSessionId === targetId &&
      !state.historyLoading;

    if (reuse) {
      updateHeader();
      renderSidebar();
      updateComposerState();
      updateChatEmptyState();
      return;
    }

    await selectSession(targetId);
  }

  function resetMessagesForLoading() {
    setTyping(false);
    messagesInner.textContent = '';
    messagesInner.appendChild(emptyHint);
    state.lastRendered = null;
    state.stick = true;
    jumpBtn.hidden = true;
    emptyHint.hidden = false;
  }

  async function selectSession(sessionId) {
    if (!sessionId) return;

    var isSwitch = state.activeSessionId !== sessionId;
    state.activeSessionId = sessionId;
    storeSessionId(sessionId);
    closeDrawer();

    state.historyToken += 1;
    var token = state.historyToken;
    state.historyLoading = true;
    state.historyError = '';
    state.bufferedAssistant = [];
    state.loadedSessionId = '';
    setTyping(false);
    resetMessagesForLoading();
    updateHeader();
    renderSidebar();
    updateComposerState();
    updateChatEmptyState();
    if (state.infoOpen) renderInfoPanel();

    if (isSwitch) {
      inputEl.value = '';
      autosizeInput();
      updateComposerState();
    }

    try {
      var data = await wsRequest('history', { sessionId: sessionId }, { timeoutMs: HISTORY_TIMEOUT });
      if (token !== state.historyToken || state.activeSessionId !== sessionId) return;

      state.historyLoading = false;
      state.loadedSessionId = sessionId;
      renderHistory(data);
      flushBufferedAssistant();
      setTyping(state.typingSessions[sessionId] === true);
      scrollToBottom();
      updateChatEmptyState();
      updateComposerState();
    } catch (err) {
      if (token !== state.historyToken || state.activeSessionId !== sessionId) return;
      state.historyLoading = false;
      state.historyError = err && err.message ? err.message : '加载失败';
      setTyping(false);
      updateChatEmptyState();
      updateComposerState();
      if (state.agentOnline !== false) showToast('聊天记录加载失败：' + state.historyError);
    }
  }

  function renderHistory(data) {
    messagesInner.textContent = '';
    messagesInner.appendChild(emptyHint);
    state.lastRendered = null;

    var messages = data && Array.isArray(data.messages) ? data.messages : [];
    if (messages.length && data.hasMore) {
      var note = document.createElement('div');
      note.className = 'history-note';
      note.textContent = '仅显示最近的记录';
      messagesInner.appendChild(note);
    }

    for (var i = 0; i < messages.length; i++) {
      appendMessage(messages[i]);
    }

    updateChatEmptyState();
  }

  function flushBufferedAssistant() {
    var list = state.bufferedAssistant;
    state.bufferedAssistant = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (state.lastRendered &&
          state.lastRendered.role === 'assistant' &&
          state.lastRendered.text === item.text) {
        continue;
      }
      appendMessage({ role: 'assistant', text: item.text, ts: item.ts });
    }
  }

  /* ================= 消息渲染 ================= */
  function hasMessages() {
    return messagesInner.querySelector('.msg-row, .tool-row') !== null;
  }

  function appendToMessages(node) {
    if (state.typingRow && state.typingRow.parentNode === messagesInner) {
      messagesInner.insertBefore(node, state.typingRow);
    } else {
      messagesInner.appendChild(node);
    }
  }

  function createAvatar() {
    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    var img = document.createElement('img');
    img.className = 'avatar-img';
    img.setAttribute('src', 'avatar.jpg');
    img.setAttribute('alt', '');
    img.setAttribute('draggable', 'false');
    avatar.appendChild(img);
    return avatar;
  }

  function buildMessageRow(role, text, ts) {
    var isUser = role === 'user';

    var row = document.createElement('div');
    row.className = 'msg-row ' + (isUser ? 'msg-user' : 'msg-assistant');

    if (!isUser) row.appendChild(createAvatar());

    var col = document.createElement('div');
    col.className = 'msg-col';

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;      /* 防 XSS：只写文本节点 */
    col.appendChild(bubble);

    var meta = document.createElement('div');
    meta.className = 'msg-meta';

    var time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatShortTime(ts);
    meta.appendChild(time);

    var status = document.createElement('span');
    status.className = 'msg-status';
    status.hidden = true;
    meta.appendChild(status);

    col.appendChild(meta);
    row.appendChild(col);

    return { row: row, bubble: bubble, status: status };
  }

  function appendMessage(message) {
    if (!message || typeof message !== 'object') return null;

    var role = null;
    if (message.role === 'user') role = 'user';
    else if (message.role === 'assistant') role = 'assistant';
    else if (message.role === 'tool') role = 'tool';
    if (!role) return null;

    var text = typeof message.text === 'string' ? message.text : '';
    if (!text) return null;

    var ts = Number(message.ts);
    if (!isFinite(ts) || ts <= 0) ts = Date.now();

    var node;
    if (role === 'tool') {
      node = document.createElement('div');
      node.className = 'tool-row';
      var tag = document.createElement('span');
      tag.className = 'tool-tag';
      tag.textContent = text;
      node.appendChild(tag);
    } else {
      var built = buildMessageRow(role, text, ts);
      node = built.row;
    }

    appendToMessages(node);
    state.lastRendered = { role: role, text: text };
    emptyHint.hidden = true;
    return node;
  }

  function appendOutgoingUser(text) {
    var built = buildMessageRow('user', text, Date.now());
    built.row.classList.add('is-sending');
    built.status.hidden = false;
    built.status.textContent = '发送中…';
    appendToMessages(built.row);
    state.lastRendered = { role: 'user', text: text };
    emptyHint.hidden = true;
    return built;
  }

  /* ================= 空状态 / 离线提示 ================= */
  function updateChatEmptyState() {
    if (hasMessages()) {
      emptyHint.hidden = true;
      return;
    }
    emptyHint.hidden = false;
    retryBtn.hidden = true;

    if (state.historyLoading) {
      emptyTitle.textContent = '正在加载聊天记录…';
      emptyDesc.textContent = '从电脑端读取真实对话';
      return;
    }
    if (!state.wsOpen) {
      emptyTitle.textContent = '正在连接…';
      emptyDesc.textContent = '正在连接你的电脑';
      return;
    }
    if (state.agentOnline === false) {
      emptyTitle.textContent = '电脑端未连接';
      emptyDesc.textContent = '请确认电脑上的 DSH 正在运行';
      retryBtn.hidden = false;
      return;
    }
    if (!state.snapshotLoaded) {
      if (state.snapshotError) {
        emptyTitle.textContent = '加载失败';
        emptyDesc.textContent = state.snapshotError;
        retryBtn.hidden = false;
        return;
      }
      emptyTitle.textContent = '正在加载会话…';
      emptyDesc.textContent = '同步电脑上的项目与会话';
      return;
    }
    if (!state.activeSessionId) {
      emptyTitle.textContent = '还没有会话';
      emptyDesc.textContent = '去电脑上开一个会话，或点新建';
      return;
    }
    if (state.historyError) {
      emptyTitle.textContent = '聊天记录加载失败';
      emptyDesc.textContent = state.historyError;
      retryBtn.hidden = false;
      return;
    }
    emptyTitle.textContent = '还没有消息';
    emptyDesc.textContent = '发一条消息试试';
  }

  function updateAgentBanner() {
    var text = '';
    if (state.wsOpen && state.agentOnline === false) {
      text = '电脑端未连接，请确认电脑上的 DSH 正在运行';
    } else if (!state.wsOpen && state.everConnected && state.view === 'chat') {
      text = '连接已断开，正在重连…';
    }
    if (text) {
      agentBannerText.textContent = text;
      agentBanner.hidden = false;
    } else {
      agentBanner.hidden = true;
    }
  }

  /* ================= 正在输入 ================= */
  function setTyping(on) {
    if (on) {
      if (state.typingRow) return;

      var row = document.createElement('div');
      row.className = 'typing-row';
      row.appendChild(createAvatar());

      var bubble = document.createElement('div');
      bubble.className = 'typing-bubble';

      var dots = document.createElement('span');
      dots.className = 'typing-dots';
      dots.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('i'));

      var label = document.createElement('span');
      label.className = 'typing-label';
      label.textContent = '正在输入…';

      bubble.appendChild(dots);
      bubble.appendChild(label);
      row.appendChild(bubble);

      messagesInner.appendChild(row);
      state.typingRow = row;
      emptyHint.hidden = true;

      if (state.stick) scrollToBottom();
    } else if (state.typingRow) {
      if (state.typingRow.parentNode) {
        state.typingRow.parentNode.removeChild(state.typingRow);
      }
      state.typingRow = null;
      updateChatEmptyState();
    }
  }

  function clearTypingAll() {
    state.typingSessions = {};
    setTyping(false);
  }

  function isNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <= BOTTOM_THRESHOLD;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    state.stick = true;
    jumpBtn.hidden = true;
  }

  function onMessagesScroll() {
    state.stick = isNearBottom();
    jumpBtn.hidden = state.stick || !hasMessages();
  }

  /* ================= 信息面板：基础构件 ================= */
  function createInfoSection(title) {
    var section = document.createElement('section');
    section.className = 'info-section';
    var heading = document.createElement('h3');
    heading.className = 'info-section-title';
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  function createInfoItem(name, sub) {
    var item = document.createElement('div');
    item.className = 'info-item';
    var main = document.createElement('div');
    main.className = 'info-item-main';
    var title = document.createElement('span');
    title.className = 'info-item-name';
    title.textContent = name;
    main.appendChild(title);
    if (sub) {
      var subtitle = document.createElement('span');
      subtitle.className = 'info-item-sub';
      subtitle.textContent = sub;
      main.appendChild(subtitle);
    }
    item.appendChild(main);
    return item;
  }

  function createActionItem(name, sub, onClick, options) {
    var opts = options || {};
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'info-item info-action';
    if (opts.current) button.classList.add('is-current');
    if (opts.busy) button.classList.add('is-busy');

    var main = document.createElement('span');
    main.className = 'info-item-main';

    var title = document.createElement('span');
    title.className = 'info-item-name';
    title.textContent = name;
    main.appendChild(title);

    var subtitleText = opts.busy ? '处理中…' : sub;
    if (subtitleText) {
      var subtitle = document.createElement('span');
      subtitle.className = 'info-item-sub';
      subtitle.textContent = subtitleText;
      main.appendChild(subtitle);
    }
    button.appendChild(main);

    if (opts.current) button.appendChild(createBadge('当前', false));
    else if (opts.busy) button.appendChild(createBadge('处理中…', true));

    if (opts.disabled) button.disabled = true;
    button.addEventListener('click', onClick);
    return button;
  }

  function createInfoEmpty(text) {
    var el = document.createElement('div');
    el.className = 'info-empty';
    el.textContent = text;
    return el;
  }

  function createBadge(text, muted) {
    var el = document.createElement('span');
    el.className = 'info-badge' + (muted ? ' is-muted' : '');
    el.textContent = text;
    return el;
  }

  function createCurrentBox(label, value) {
    var box = document.createElement('div');
    box.className = 'info-current';
    var l = document.createElement('span');
    l.className = 'info-current-label';
    l.textContent = label;
    var v = document.createElement('span');
    v.className = 'info-current-value';
    v.textContent = value;
    box.appendChild(l);
    box.appendChild(v);
    return box;
  }

  function appendInfoNote(section, text) {
    var note = document.createElement('p');
    note.className = 'info-note';
    note.textContent = text;
    section.appendChild(note);
  }

  /* ================= 运行时操作：模型 / 模式 / 插件 ================= */
  function setLocalBundleEnabled(name, enabled) {
    if (!state.snapshot || !state.snapshot.info || !Array.isArray(state.snapshot.info.bundles)) return;
    var bundles = state.snapshot.info.bundles;
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].name === name) {
        bundles[i].enabled = enabled;
        return;
      }
    }
  }

  function clearBundleFeedback(name) {
    if (!state.bundleFeedback[name]) return;
    delete state.bundleFeedback[name];
    if (state.bundleFeedbackTimers[name]) {
      window.clearTimeout(state.bundleFeedbackTimers[name]);
      delete state.bundleFeedbackTimers[name];
    }
  }

  function setBundleFeedback(name, text, kind) {
    state.bundleFeedback[name] = { text: text, kind: kind || '' };
    if (state.bundleFeedbackTimers[name]) window.clearTimeout(state.bundleFeedbackTimers[name]);
    state.bundleFeedbackTimers[name] = window.setTimeout(function () {
      delete state.bundleFeedbackTimers[name];
      delete state.bundleFeedback[name];
      if (state.infoOpen) renderInfoPanel();
    }, BUNDLE_FEEDBACK_MS);
  }

  function bundleFeedbackText(result, targetEnabled) {
    var application = result && typeof result.application === 'string' ? result.application : '';
    var prefix = targetEnabled ? '已启用' : '已关闭';
    var text = prefix;

    if (application === 'applied') text = prefix + '，已即时生效';
    else if (application === 'restart-required') text = prefix + '，需要重启 DSH 后生效';
    else if (application === 'overridden') text = prefix + '，但被更高优先级配置覆盖';
    else if (application === 'failed') text = (targetEnabled ? '启用' : '关闭') + '失败';
    else if (application) text = prefix + '（' + application + '）';

    if (result && result.changed === false) text += '，配置未变化';

    var warnings = result && Array.isArray(result.warnings) ? result.warnings : [];
    if (warnings.length && warnings[0]) {
      text += '：' + String(warnings[0]);
    } else if (result && typeof result.nextStep === 'string' && result.nextStep) {
      text += '：' + result.nextStep;
    }
    return text;
  }

  function bundleFeedbackKind(application) {
    if (application === 'applied') return 'ok';
    if (application === 'failed') return 'error';
    if (application === 'restart-required' || application === 'overridden') return 'warn';
    return '';
  }

  async function refreshRuntimeInfo() {
    await refreshSnapshotOnly();
    if (state.wsOpen && state.activeSessionId) {
      await selectSession(state.activeSessionId);
    }
    if (state.infoOpen) renderInfoPanel();
  }

  async function onModelSelect(provider, modelId, reasoningEffort) {
    if (state.modelBusy) return;
    if (state.unsupported.setModel) {
      showToast('需要重启 DSH 才能使用这个功能');
      return;
    }
    var sessionId = state.activeSessionId;
    if (!sessionId) {
      showToast('先选择一个会话');
      return;
    }

    var current = currentSessionModel();
    if (current && current.provider === provider && current.model === modelId) return;

    state.modelBusy = true;
    state.modelBusyKey = provider + '/' + modelId;
    if (state.infoOpen) renderInfoPanel();

    try {
      var payload = { sessionId: sessionId, provider: provider, model: modelId };
      if (reasoningEffort) payload.reasoningEffort = reasoningEffort;

      var data = await wsRequest('setModel', payload, { timeoutMs: RUNTIME_TIMEOUT });
      var selected = data && data.selected ? data.selected : { provider: provider, model: modelId };
      var providerValue = selected.provider === undefined ? provider : String(selected.provider);
      var modelValue = selected.model === undefined ? modelId : String(selected.model);

      var session = findSession(sessionId);
      if (session) session.model = { provider: providerValue, model: modelValue };

      showToast('模型已切换：' + shortModelName(modelValue));
      await refreshRuntimeInfo();
    } catch (err) {
      var message = err && err.message ? err.message : '切换模型失败';
      if (!markUnsupported('setModel', message)) {
        showToast('切换模型失败：' + message);
      }
    } finally {
      state.modelBusy = false;
      state.modelBusyKey = '';
      if (state.infoOpen) renderInfoPanel();
    }
  }

  async function onPresetSelect(presetId) {
    if (state.presetBusy) return;
    if (state.unsupported.setPreset) {
      showToast('需要重启 DSH 才能使用这个功能');
      return;
    }
    var sessionId = state.activeSessionId;
    if (!sessionId) {
      showToast('先选择一个会话');
      return;
    }

    var session = findSession(sessionId);
    if (session && session.preset === presetId) return;

    state.presetBusy = true;
    state.presetBusyKey = presetId;
    if (state.infoOpen) renderInfoPanel();

    try {
      var data = await wsRequest('setPreset', { sessionId: sessionId, preset: presetId }, { timeoutMs: RUNTIME_TIMEOUT });
      var presetValue = data && data.preset ? String(data.preset) : presetId;
      if (session) session.preset = presetValue;
      showToast('模式已切换：' + presetLabel(presetValue));
      await refreshRuntimeInfo();
    } catch (err) {
      var message = err && err.message ? err.message : '切换模式失败';
      if (markUnsupported('setPreset', message)) {
        /* 需要重启 DSH，控件保持原状态 */
      } else if (message.indexOf('agent-busy') >= 0 ||
                 message.indexOf('busy') >= 0 ||
                 message.indexOf('正在运行') >= 0 ||
                 message.indexOf('会话不可用') >= 0) {
        showToast('这个会话正在运行，稍后再切换');
      } else {
        showToast('切换模式失败：' + message);
      }
    } finally {
      state.presetBusy = false;
      state.presetBusyKey = '';
      if (state.infoOpen) renderInfoPanel();
    }
  }

  async function onBundleToggle(bundle) {
    if (!bundle || state.bundleBusy[bundle.name]) return;
    if (state.unsupported.setBundle) {
      showToast('需要重启 DSH 才能使用这个功能');
      return;
    }

    var isRelay = isRelayBundle(bundle.name);
    var targetEnabled = !bundle.enabled;

    /* 本页面插件：关闭需要二次确认 */
    if (isRelay && !targetEnabled && state.bundleConfirm !== bundle.name) {
      state.bundleConfirm = bundle.name;
      if (state.bundleConfirmTimer) window.clearTimeout(state.bundleConfirmTimer);
      state.bundleConfirmTimer = window.setTimeout(function () {
        state.bundleConfirmTimer = 0;
        state.bundleConfirm = '';
        if (state.infoOpen) renderInfoPanel();
      }, BUNDLE_CONFIRM_MS);
      if (state.infoOpen) renderInfoPanel();
      return;
    }

    state.bundleConfirm = '';
    if (state.bundleConfirmTimer) {
      window.clearTimeout(state.bundleConfirmTimer);
      state.bundleConfirmTimer = 0;
    }

    state.bundleBusy[bundle.name] = true;
    clearBundleFeedback(bundle.name);
    if (state.infoOpen) renderInfoPanel();
    if (!settingsModal.hidden) renderPluginList();

    try {
      var data = await wsRequest('setBundle', {
        name: bundle.name,
        enabled: targetEnabled
      }, { timeoutMs: BUNDLE_TIMEOUT });

      var enabledNow = data && typeof data.enabled === 'boolean' ? data.enabled : targetEnabled;
      setLocalBundleEnabled(bundle.name, enabledNow);

      var result = data && data.result ? data.result : {};
      var text = bundleFeedbackText(result, targetEnabled);
      setBundleFeedback(bundle.name, text, bundleFeedbackKind(result.application));
      showToast(text);

      if (isRelay && !enabledNow) {
        showToast('本页面插件已关闭，页面将无法再收到新消息');
      }
      scheduleSnapshotRefresh(400);
    } catch (err) {
      var message = err && err.message ? err.message : '插件操作失败';
      if (markUnsupported('setBundle', message)) {
        /* 需要重启 DSH：开关保持原状态 */
      } else if (isRelay && !targetEnabled && (message.indexOf('连接') >= 0 || message.indexOf('断开') >= 0)) {
        setLocalBundleEnabled(bundle.name, false);
        setBundleFeedback(bundle.name, '已关闭本页面插件，连接会断开', 'warn');
        showToast('已关闭本页面插件，页面连接会断开');
      } else {
        setBundleFeedback(bundle.name, '操作失败：' + message, 'error');
        showToast('插件操作失败：' + message);
      }
    } finally {
      delete state.bundleBusy[bundle.name];
      if (state.infoOpen) renderInfoPanel();
      if (!settingsModal.hidden) renderPluginList();
    }
  }

  /* ================= 折叠分组 ================= */
  function setAccordionItemOpen(item, open) {
    if (!item) return;
    var head = item.querySelector('.acc-head');
    var panel = item.querySelector('.acc-panel');
    item.classList.toggle('is-open', open);
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function createAccordionHead(label, open) {
    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'acc-head';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');

    var title = document.createElement('span');
    title.className = 'acc-title';
    title.textContent = label;

    var arrow = document.createElement('span');
    arrow.className = 'acc-arrow';
    arrow.setAttribute('aria-hidden', 'true');

    head.appendChild(title);
    head.appendChild(arrow);
    return head;
  }

  function resetSettingsAccordion() {
    var items = settingsModal.querySelectorAll('.acc-item');
    for (var i = 0; i < items.length; i++) {
      setAccordionItemOpen(items[i], items[i].getAttribute('data-acc') === 'conn');
    }
  }

  function setupSettingsAccordion() {
    var items = settingsModal.querySelectorAll('.acc-item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var head = item.querySelector('.acc-head');
        if (!head) return;
        head.addEventListener('click', function () {
          setAccordionItemOpen(item, !item.classList.contains('is-open'));
        });
      })(items[i]);
    }
    resetSettingsAccordion();
  }

  function resetInfoAccordionState() {
    state.infoAccordionOpen = {
      '模型': true,
      '模式': true,
      '权限': false,
      '插件': false,
      '项目': false
    };
  }

  function decorateInfoAccordions() {
    var sections = infoBody.querySelectorAll('.info-section');
    for (var i = 0; i < sections.length; i++) {
      (function (section) {
        if (section.classList.contains('info-accordion')) return;

        var heading = section.querySelector('.info-section-title');
        var title = heading ? heading.textContent : '';
        if (heading && heading.parentNode === section) section.removeChild(heading);

        if (typeof state.infoAccordionOpen[title] !== 'boolean') {
          state.infoAccordionOpen[title] = title === '模型' || title === '模式';
        }
        var open = state.infoAccordionOpen[title];

        var head = createAccordionHead(title, open);
        head.addEventListener('click', function () {
          var next = !section.classList.contains('is-open');
          state.infoAccordionOpen[title] = next;
          setAccordionItemOpen(section, next);
        });

        var panel = document.createElement('div');
        panel.className = 'acc-panel';
        var inner = document.createElement('div');
        inner.className = 'acc-panel-inner';

        while (section.firstChild) inner.appendChild(section.firstChild);
        panel.appendChild(inner);

        var headingWrap = document.createElement('h3');
        headingWrap.className = 'acc-heading';
        headingWrap.appendChild(head);

        section.appendChild(headingWrap);
        section.appendChild(panel);
        section.classList.add('info-accordion');
        setAccordionItemOpen(section, open);
      })(sections[i]);
    }
  }

  function updateAboutVersion() {
    var version = '';
    var bundles = state.snapshot && state.snapshot.info
      ? state.snapshot.info.bundles
      : null;

    if (Array.isArray(bundles)) {
      for (var i = 0; i < bundles.length; i++) {
        if (isRelayBundle(bundles[i].name) && bundles[i].version) {
          version = String(bundles[i].version);
        }
      }
    }
    if (aboutVersion) aboutVersion.textContent = version || '未知';
  }

  /* ================= 信息面板渲染 ================= */
  function renderInfoPanel() {
    var info = state.snapshot ? state.snapshot.info : null;
    var session = findSession(state.activeSessionId);
    var scrollTop = infoBody.scrollTop;

    infoSubtitle.textContent = session ? (session.title || '未命名会话') : '未选择会话';
    infoBody.textContent = '';

    /* 1. 模型（可点击切换） */
    var modelSection = createInfoSection('模型');
    var currentModel = currentSessionModel();
    var modelText = currentModel
      ? (currentModel.provider || '?') + ' / ' + (currentModel.model || '?')
      : '未知';
    modelSection.appendChild(createCurrentBox('当前模型', modelText));
    if (state.unsupported.setModel) {
      appendInfoNote(modelSection, '需要重启 DSH 才能使用这个功能');
    }

    if (info && info.modelGroups.length) {
      for (var i = 0; i < info.modelGroups.length; i++) {
        var group = info.modelGroups[i];
        var groupEl = document.createElement('div');
        groupEl.className = 'info-group';
        var groupName = document.createElement('div');
        groupName.className = 'info-group-name';
        groupName.textContent = group.name || group.id || '未命名';
        groupEl.appendChild(groupName);

        for (var j = 0; j < group.models.length; j++) {
          (function (groupData, modelData) {
            var key = groupData.id + '/' + modelData.id;
            var isCurrent = currentModel &&
              currentModel.provider === groupData.id &&
              currentModel.model === modelData.id;
            var busy = state.modelBusy && state.modelBusyKey === key;
            var item = createActionItem(
              modelData.name || modelData.id || '未命名模型',
              modelData.id || '',
              function () {
                onModelSelect(groupData.id, modelData.id, reasoningEffortOf(modelData));
              },
              {
                current: !!isCurrent,
                busy: busy,
                disabled: state.modelBusy || state.unsupported.setModel || !state.activeSessionId
              }
            );
            groupEl.appendChild(item);
          })(group, group.models[j]);
        }
        modelSection.appendChild(groupEl);
      }
    } else {
      modelSection.appendChild(createInfoEmpty('没有模型信息'));
    }
    infoBody.appendChild(modelSection);

    /* 2. 模式（可点击切换） */
    var presetSection = createInfoSection('模式');
    var presetId = session ? session.preset : '';
    presetSection.appendChild(createCurrentBox('当前模式',
      presetId ? presetLabel(presetId) + (presetLabel(presetId) !== presetId ? '（' + presetId + '）' : '') : '未知'));
    if (state.unsupported.setPreset) {
      appendInfoNote(presetSection, '需要重启 DSH 才能使用这个功能');
    }

    if (info && info.presets.length) {
      for (var p = 0; p < info.presets.length; p++) {
        (function (presetData) {
          var isCurrent = presetData.id === presetId;
          var busy = state.presetBusy && state.presetBusyKey === presetData.id;
          var item = createActionItem(
            presetData.name || presetData.id,
            presetData.description || presetData.id,
            function () { onPresetSelect(presetData.id); },
            {
              current: isCurrent,
              busy: busy,
              disabled: state.presetBusy || state.unsupported.setPreset || !state.activeSessionId
            }
          );
          presetSection.appendChild(item);
        })(info.presets[p]);
      }
    } else {
      presetSection.appendChild(createInfoEmpty('没有模式信息'));
    }
    infoBody.appendChild(presetSection);

    /* 3. 权限（只读） */
    var permissionSection = createInfoSection('权限');
    permissionSection.appendChild(createCurrentBox('当前权限',
      session ? (session.permissions || '未知') : '未选择会话'));
    infoBody.appendChild(permissionSection);

    /* 4. 插件（可开关） */
    var bundleSection = createInfoSection('插件');
    if (info && info.bundles.length) {
      for (var b = 0; b < info.bundles.length; b++) {
        (function (bundle) {
          var isRelay = isRelayBundle(bundle.name);
          var busy = !!state.bundleBusy[bundle.name];
          var armed = isRelay && state.bundleConfirm === bundle.name;
          var feedback = state.bundleFeedback[bundle.name];

          var row = document.createElement('div');
          row.className = 'info-item bundle-item';
          if (!bundle.enabled) row.classList.add('is-disabled');
          if (busy) row.classList.add('is-busy');

          var main = document.createElement('span');
          main.className = 'info-item-main';

          var nameRow = document.createElement('span');
          nameRow.className = 'bundle-name-row';
          var name = document.createElement('span');
          name.className = 'info-item-name';
          name.textContent = bundle.name + (bundle.version ? '@' + bundle.version : '');
          nameRow.appendChild(name);
          if (isRelay) {
            var pageBadge = createBadge('本页面', false);
            pageBadge.classList.add('is-pink');
            nameRow.appendChild(pageBadge);
          }
          main.appendChild(nameRow);

          var subText = '';
          if (busy) subText = '处理中…';
          else if (armed) subText = '再点一次确认关闭';
          else if (feedback) subText = feedback.text;
          else if (isRelay) subText = '本页面插件（关闭后会断线）';

          if (subText) {
            var sub = document.createElement('span');
            sub.className = 'info-item-sub';
            if (feedback && !busy && !armed) {
              sub.classList.add('info-feedback');
              if (feedback.kind) sub.classList.add('is-' + feedback.kind);
            }
            sub.textContent = subText;
            main.appendChild(sub);
          }
          row.appendChild(main);

          var stateWrap = document.createElement('span');
          stateWrap.className = 'bundle-state';

          var toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'switch' + (bundle.enabled ? ' is-on' : '') + (busy ? ' is-busy' : '');
          if (armed) toggle.classList.add('is-confirm');
          toggle.setAttribute('role', 'switch');
          toggle.setAttribute('aria-checked', bundle.enabled ? 'true' : 'false');
          toggle.setAttribute('aria-label', (bundle.enabled ? '关闭 ' : '启用 ') + bundle.name);
          toggle.disabled = busy || state.unsupported.setBundle;
          toggle.addEventListener('click', function () { onBundleToggle(bundle); });
          stateWrap.appendChild(toggle);

          row.appendChild(stateWrap);
          bundleSection.appendChild(row);
        })(info.bundles[b]);
      }
      if (state.unsupported.setBundle) {
        appendInfoNote(bundleSection, '需要重启 DSH 才能使用这个功能');
      }
    } else {
      bundleSection.appendChild(createInfoEmpty('没有插件信息'));
    }
    infoBody.appendChild(bundleSection);

    /* 5. 项目（只读） */
    var workspaceSection = createInfoSection('项目');
    var workspaces = state.snapshot ? state.snapshot.workspaces : [];
    if (workspaces.length) {
      for (var w = 0; w < workspaces.length; w++) {
        var workspace = workspaces[w];
        var workspaceItem = createInfoItem(workspace.title || '未命名项目', workspace.path || '');
        if (session && session.workspaceId && session.workspaceId === workspace.id) {
          workspaceItem.classList.add('is-current');
          workspaceItem.appendChild(createBadge('当前', false));
        }
        workspaceSection.appendChild(workspaceItem);
      }
    } else {
      workspaceSection.appendChild(createInfoEmpty('没有项目信息'));
    }
    infoBody.appendChild(workspaceSection);

    decorateInfoAccordions();
    infoBody.scrollTop = scrollTop;
  }

  /* ================= 抽屉 / 弹窗控制 ================= */
  function isMobileLayout() {
    if (mobileMedia) return mobileMedia.matches;
    return window.innerWidth < 768;
  }

  function openDrawer() {
    if (!isMobileLayout()) return;
    closeInfoImmediate();
    closeCreateModalImmediate();
    closeSettingsImmediate();
    state.drawerOpen = true;
    sidebar.classList.add('is-open');
    sidebarBackdrop.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', '关闭会话列表');
  }

  function closeDrawer() {
    state.drawerOpen = false;
    sidebar.classList.remove('is-open');
    sidebarBackdrop.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', '打开会话列表');
  }

  function toggleDrawer() {
    if (state.drawerOpen) closeDrawer();
    else openDrawer();
  }

  function openInfo() {
    if (state.view !== 'chat') return;
    closeDrawer();
    closeCreateModalImmediate();
    closeSettingsImmediate();
    state.infoOpen = true;
    resetInfoAccordionState();
    renderInfoPanel();
    infoLayer.hidden = false;
    window.requestAnimationFrame(function () {
      infoLayer.classList.add('is-open');
    });
    window.setTimeout(function () {
      if (!infoLayer.hidden) infoCloseBtn.focus();
    }, 80);
    refreshSnapshotOnly();
  }

  function closeInfo() {
    if (infoLayer.hidden) return;
    state.infoOpen = false;
    state.bundleConfirm = '';
    if (state.bundleConfirmTimer) {
      window.clearTimeout(state.bundleConfirmTimer);
      state.bundleConfirmTimer = 0;
    }
    infoLayer.classList.remove('is-open');
    if (state.infoCloseTimer) window.clearTimeout(state.infoCloseTimer);
    state.infoCloseTimer = window.setTimeout(function () {
      state.infoCloseTimer = 0;
      if (!state.infoOpen) {
        infoLayer.hidden = true;
        infoLayer.classList.remove('is-open');
      }
    }, MODAL_ANIM_MS);
  }

  function closeInfoImmediate() {
    if (state.infoCloseTimer) {
      window.clearTimeout(state.infoCloseTimer);
      state.infoCloseTimer = 0;
    }
    state.infoOpen = false;
    state.bundleConfirm = '';
    if (state.bundleConfirmTimer) {
      window.clearTimeout(state.bundleConfirmTimer);
      state.bundleConfirmTimer = 0;
    }
    infoLayer.hidden = true;
    infoLayer.classList.remove('is-open');
  }

  function setCreateError(message) {
    if (!message) {
      createError.hidden = true;
      createError.textContent = '';
      return;
    }
    createError.textContent = message;
    createError.hidden = false;
  }

  function setCreateBusy(busy) {
    var buttons = projectList.querySelectorAll('.project-option');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = !!busy;
  }

  function buildProjectOption(name, path, onClick, isNone) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-option' + (isNone ? ' is-none' : '');

    var label = document.createElement('span');
    label.className = 'project-option-name';
    label.textContent = name;
    button.appendChild(label);

    if (path) {
      var sub = document.createElement('span');
      sub.className = 'project-option-path';
      sub.textContent = path;
      button.appendChild(sub);
    }

    button.addEventListener('click', onClick);
    return button;
  }

  function renderCreateModal() {
    projectList.textContent = '';
    setCreateError('');

    var workspaces = state.snapshot ? state.snapshot.workspaces : [];
    if (!state.snapshotLoaded) {
      var note = document.createElement('p');
      note.className = 'project-empty';
      note.textContent = state.agentOnline === false
        ? '电脑端未连接，读不到项目列表'
        : '正在加载项目列表…';
      projectList.appendChild(note);
    } else if (!workspaces.length) {
      var note2 = document.createElement('p');
      note2.className = 'project-empty';
      note2.textContent = '没有可用的项目，可以直接新建一个不指定项目的会话';
      projectList.appendChild(note2);
    }

    for (var i = 0; i < workspaces.length; i++) {
      (function (workspace) {
        projectList.appendChild(buildProjectOption(
          workspace.title || '未命名项目',
          workspace.path || '',
          function () { createSession({ workspaceId: workspace.id }); },
          false
        ));
      })(workspaces[i]);
    }

    projectList.appendChild(buildProjectOption(
      '不指定项目',
      '在当前默认目录创建',
      function () { createSession({}); },
      true
    ));
  }

  function openCreateModal() {
    if (state.view !== 'chat') return;
    closeDrawer();
    closeInfoImmediate();
    closeSettingsImmediate();
    if (state.createCloseTimer) {
      window.clearTimeout(state.createCloseTimer);
      state.createCloseTimer = 0;
    }
    renderCreateModal();
    createModal.hidden = false;
    window.requestAnimationFrame(function () {
      createModal.classList.add('is-open');
    });
  }

  function closeCreateModal() {
    if (createModal.hidden) return;
    createModal.classList.remove('is-open');
    if (state.createCloseTimer) window.clearTimeout(state.createCloseTimer);
    state.createCloseTimer = window.setTimeout(function () {
      state.createCloseTimer = 0;
      createModal.hidden = true;
      createModal.classList.remove('is-open');
    }, MODAL_ANIM_MS);
  }

  function closeCreateModalImmediate() {
    if (state.createCloseTimer) {
      window.clearTimeout(state.createCloseTimer);
      state.createCloseTimer = 0;
    }
    createModal.hidden = true;
    createModal.classList.remove('is-open');
    state.creatingSession = false;
  }

  async function createSession(payload) {
    if (state.creatingSession) return;
    if (!state.wsOpen) {
      setCreateError('连接未就绪，请稍候再试');
      return;
    }
    state.creatingSession = true;
    setCreateBusy(true);
    setCreateError('');

    try {
      var data = await wsRequest('create', payload || {}, { timeoutMs: CREATE_TIMEOUT });
      var newId = data && typeof data.sessionId === 'string' ? data.sessionId : '';

      state.creatingSession = false;
      setCreateBusy(false);
      closeCreateModal();
      await loadSnapshotAndSelect(newId);
      if (newId) showToast('已新建会话');
    } catch (err) {
      state.creatingSession = false;
      setCreateBusy(false);
      setCreateError(err && err.message ? err.message : '新建会话失败');
    }
  }

  async function loadSnapshotAndSelect(preferredId) {
    var socket = state.ws;
    var data = await fetchSnapshot({ silent: true });
    if (!data || state.ws !== socket) {
      if (preferredId) await selectSession(preferredId);
      return;
    }
    await syncSessionSelection(preferredId || '', true);
  }

  /* ================= 设置（修改密码） ================= */
  function setPasswordSubmitBusy(busy) {
    passwordSubmitBtn.disabled = !!busy || state.pwdLocked;
    passwordSubmitBtn.textContent = busy ? '提交中…' : '保存';
  }

  function showPasswordError(message, isLock) {
    if (!message) {
      passwordError.hidden = true;
      passwordError.textContent = '';
      passwordError.classList.remove('is-lock');
      return;
    }
    passwordError.textContent = message;
    passwordError.hidden = false;
    passwordError.classList.toggle('is-lock', !!isLock);
  }

  function showPasswordSuccess() {
    passwordError.hidden = true;
    passwordError.textContent = '';
    passwordError.classList.remove('is-lock');
    passwordSuccess.hidden = false;
  }

  function stopPasswordLockout() {
    if (state.pwdLockTimer) {
      window.clearInterval(state.pwdLockTimer);
      state.pwdLockTimer = 0;
    }
    state.pwdLocked = false;
  }

  function startPasswordLockout(seconds) {
    stopPasswordLockout();
    state.pwdLocked = true;
    var until = Date.now() + Math.max(1, seconds || 60) * 1000;
    passwordSubmitBtn.disabled = true;

    var tick = function () {
      var remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        stopPasswordLockout();
        passwordSubmitBtn.disabled = false;
        passwordSubmitBtn.textContent = '保存';
        showPasswordError('', false);
        return;
      }
      showPasswordError('尝试次数过多，已锁定，请在 ' + Math.ceil(remaining / 60) +
        ' 分钟后重试（' + formatCountdown(remaining) + '）', true);
      passwordSubmitBtn.disabled = true;
    };

    tick();
    state.pwdLockTimer = window.setInterval(tick, 1000);
  }

  function resetPasswordForm() {
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    passwordSuccess.hidden = true;
    passwordError.hidden = true;
    passwordError.textContent = '';
    passwordError.classList.remove('is-lock');
    stopPasswordLockout();
    state.pwdBusy = false;
    state.pwdSuccess = false;
    setPasswordSubmitBusy(false);
  }

  /* ================= 设置：连接参数 ================= */
  function maskToken(token) {
    var value = typeof token === 'string' ? token : '';
    if (!value) return '';
    if (value.length <= 8) return '••••••';
    return value.slice(0, 4) + '••••••' + value.slice(-3);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.left = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);

      var copied = false;
      try {
        area.select();
        area.setSelectionRange(0, area.value.length);
        copied = document.execCommand && document.execCommand('copy');
      } catch (err) {
        copied = false;
      }
      document.body.removeChild(area);

      if (copied) resolve();
      else reject(new Error('copy failed'));
    });
  }

  function copyText(text) {
    return new Promise(function (resolve, reject) {
      var value = typeof text === 'string' ? text : '';
      if (!value) {
        reject(new Error('empty'));
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(resolve).catch(function () {
          legacyCopy(value).then(resolve, reject);
        });
        return;
      }
      legacyCopy(value).then(resolve, reject);
    });
  }

  function copyWithFeedback(button, value) {
    if (!button || button.disabled) return;
    copyText(value).then(function () {
      button.textContent = '已复制 ✓';
      button.classList.add('is-copied');
      if (button._copyTimer) window.clearTimeout(button._copyTimer);
      button._copyTimer = window.setTimeout(function () {
        button._copyTimer = 0;
        button.textContent = '复制';
        button.classList.remove('is-copied');
      }, 1500);
    }).catch(function () {
      showToast('复制失败，请手动选择复制');
    });
  }

  function resetConnUi() {
    state.connInfo = null;
    state.connSeq += 1;
    state.tokenVisible = false;

    connLoading.hidden = false;
    connItems.hidden = true;
    connError.hidden = true;
    connError.textContent = '';
    connServer.textContent = '';
    connToken.textContent = '';
    connString.textContent = '';
    connTokenToggle.textContent = '显示';
    connTokenToggle.setAttribute('aria-pressed', 'false');
    connTokenToggle.hidden = false;
    connServerCopy.disabled = true;
    connTokenCopy.disabled = true;
    connStringCopy.disabled = true;

    [connServerCopy, connTokenCopy, connStringCopy].forEach(function (button) {
      if (button._copyTimer) {
        window.clearTimeout(button._copyTimer);
        button._copyTimer = 0;
      }
      button.textContent = '复制';
      button.classList.remove('is-copied');
    });
  }

  function renderConnInfo() {
    var info = state.connInfo;
    if (!info) return;

    var token = info.agentToken || '';
    connLoading.hidden = true;
    connItems.hidden = false;
    connError.hidden = true;

    connServer.textContent = info.serverUrl || '';
    connString.textContent = info.connectString || '';
    connToken.textContent = state.tokenVisible ? token : maskToken(token);
    connTokenToggle.textContent = state.tokenVisible ? '隐藏' : '显示';
    connTokenToggle.setAttribute('aria-pressed', state.tokenVisible ? 'true' : 'false');
    connTokenToggle.hidden = !token;

    connServerCopy.disabled = !info.serverUrl;
    connTokenCopy.disabled = !token;
    connStringCopy.disabled = !info.connectString;
  }

  async function loadConnInfo() {
    resetConnUi();
    var seq = state.connSeq;

    try {
      var res = await apiJson('/api/conninfo');
      if (seq !== state.connSeq) return;
      if (res.status === 401) {
        expireSession();
        return;
      }
      var data = await readJson(res);
      if (seq !== state.connSeq) return;
      if (!res.ok || !data || data.ok !== true) {
        throw new Error(data && typeof data.error === 'string' && data.error
          ? data.error
          : '读取连接参数失败');
      }

      state.connInfo = {
        serverUrl: typeof data.serverUrl === 'string' ? data.serverUrl : '',
        agentToken: typeof data.agentToken === 'string' ? data.agentToken : '',
        connectString: typeof data.connectString === 'string' ? data.connectString : ''
      };
      renderConnInfo();
    } catch (err) {
      if (seq !== state.connSeq) return;
      connLoading.hidden = true;
      connItems.hidden = true;
      connError.textContent = err && err.message ? err.message : '读取连接参数失败';
      connError.hidden = false;
    }
  }

  /* ================= 设置：插件管理 ================= */
  function clearPluginResult() {
    pluginInstallResult.hidden = true;
    pluginInstallResult.textContent = '';
    pluginInstallResult.classList.remove('is-ok', 'is-error');
    pluginDiagnostic.hidden = true;
    pluginDiagnostic.textContent = '';
  }

  function showPluginResult(text, kind) {
    pluginInstallResult.textContent = typeof text === 'string' ? text : '';
    pluginInstallResult.classList.toggle('is-ok', kind === 'ok');
    pluginInstallResult.classList.toggle('is-error', kind === 'error');
    pluginInstallResult.hidden = false;
  }

  function showPluginDiagnostic(text) {
    var value = typeof text === 'string' ? text : '';
    if (!value) {
      pluginDiagnostic.hidden = true;
      pluginDiagnostic.textContent = '';
      return;
    }
    pluginDiagnostic.textContent = value;
    pluginDiagnostic.hidden = false;
  }

  function setPluginInstallBusy(busy) {
    state.pluginInstalling = !!busy;
    pluginInstallBtn.disabled = !!busy;
    pluginSpecInput.disabled = !!busy;
    pluginInstallBtn.classList.toggle('is-loading', !!busy);
    pluginInstallBtn.textContent = busy ? '正在安装…' : '安装';
  }

  function clearPluginRemoveConfirm() {
    state.pluginRemoveConfirm = '';
    if (state.pluginRemoveConfirmTimer) {
      window.clearTimeout(state.pluginRemoveConfirmTimer);
      state.pluginRemoveConfirmTimer = 0;
    }
  }

  function pluginResultText(message, result) {
    var text = message || '操作完成';
    var application = result && typeof result.application === 'string' ? result.application : '';
    if (application === 'restart-required') text += '（需要重启 DSH 后生效）';
    else if (application === 'overridden') text += '（被更高优先级配置覆盖）';
    else if (application === 'failed') text += '（失败）';
    return text;
  }

  function pluginDiagnosticText(result) {
    if (!result || typeof result !== 'object') return '';
    if (typeof result.error === 'string') return result.error;
    if (result.error && typeof result.error === 'object' &&
        typeof result.error.diagnostic === 'string') {
      return result.error.diagnostic;
    }
    return '';
  }

  async function reloadPluginSnapshot() {
    if (!state.wsOpen) return;
    await fetchSnapshot({ silent: true });
    if (!settingsModal.hidden) renderPluginList();
  }

  function renderPluginList() {
    pluginList.textContent = '';

    var info = state.snapshot ? state.snapshot.info : null;
    if (!info || !Array.isArray(info.bundles)) {
      pluginEmpty.textContent = state.snapshotLoaded ? '没有插件信息' : '正在读取插件信息…';
      pluginEmpty.hidden = false;
      return;
    }
    if (!info.bundles.length) {
      pluginEmpty.textContent = '还没有安装插件';
      pluginEmpty.hidden = false;
      return;
    }
    pluginEmpty.hidden = true;

    for (var i = 0; i < info.bundles.length; i++) {
      (function (bundle) {
        var isRelay = isRelayBundle(bundle.name);
        var busy = !!state.bundleBusy[bundle.name];
        var removing = state.pluginRemoveBusy === bundle.name;
        var armed = !isRelay && state.pluginRemoveConfirm === bundle.name;

        var row = document.createElement('div');
        row.className = 'plugin-row';
        if (busy || removing) row.classList.add('is-busy');

        var infoEl = document.createElement('div');
        infoEl.className = 'plugin-info';

        var nameRow = document.createElement('div');
        nameRow.className = 'plugin-name-row';

        var name = document.createElement('span');
        name.className = 'plugin-name';
        name.textContent = bundle.name;
        name.setAttribute('title', bundle.name);
        nameRow.appendChild(name);

        if (isRelay) {
          var badge = document.createElement('span');
          badge.className = 'plugin-badge';
          badge.textContent = '本页面';
          nameRow.appendChild(badge);
        }
        infoEl.appendChild(nameRow);

        var version = document.createElement('span');
        version.className = 'plugin-version';
        if (removing) version.textContent = '卸载中…';
        else if (busy) version.textContent = '处理中…';
        else version.textContent = bundle.version ? '版本 ' + bundle.version : '版本未知';
        infoEl.appendChild(version);
        row.appendChild(infoEl);

        var actions = document.createElement('div');
        actions.className = 'plugin-actions';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'switch' + (bundle.enabled ? ' is-on' : '') + (busy ? ' is-busy' : '');
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', bundle.enabled ? 'true' : 'false');
        toggle.setAttribute('aria-label', (bundle.enabled ? '关闭 ' : '启用 ') + bundle.name);
        toggle.disabled = isRelay || busy || !!state.unsupported.setBundle;
        toggle.addEventListener('click', function () {
          onBundleToggle(bundle);
        });
        actions.appendChild(toggle);

        if (!isRelay) {
          var removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'plugin-remove-btn' + (armed ? ' is-confirm' : '');
          removeBtn.textContent = removing ? '卸载中…' : (armed ? '确认卸载？' : '卸载');
          removeBtn.disabled = removing || busy || !!state.pluginRemoveBusy;
          removeBtn.addEventListener('click', function () {
            onRemovePluginClick(bundle);
          });
          actions.appendChild(removeBtn);
        }

        row.appendChild(actions);
        pluginList.appendChild(row);
      })(info.bundles[i]);
    }
  }

  async function onInstallPlugin() {
    if (state.pluginInstalling) return;

    var spec = pluginSpecInput.value.trim();
    if (!spec) {
      showPluginResult('请输入插件包名、git 地址或本地路径', 'error');
      pluginSpecInput.focus();
      return;
    }

    clearPluginResult();
    setPluginInstallBusy(true);

    try {
      var data = await wsRequest('installPlugin', { spec: spec });
      var result = data && data.result && typeof data.result === 'object' ? data.result : {};
      var ok = data && data.ok === true;
      var message = data && typeof data.message === 'string' && data.message
        ? data.message
        : (ok ? '已安装并生效' : '安装失败');

      if (ok) {
        var successText = pluginResultText(message, result);
        showPluginResult(successText, result.application === 'failed' ? 'error' : 'ok');
        showToast(successText);
        pluginSpecInput.value = '';
        setPluginInstallBusy(false);
        await reloadPluginSnapshot();
      } else {
        showPluginResult(message, 'error');
        showPluginDiagnostic(pluginDiagnosticText(result));
      }
    } catch (err) {
      var failMessage = err && err.message ? err.message : '安装失败';
      if (failMessage.indexOf('未知操作') >= 0) {
        failMessage = '需要重启 DSH 才能使用这个功能';
      }
      showPluginResult(failMessage, 'error');
    } finally {
      setPluginInstallBusy(false);
    }
  }

  function onRemovePluginClick(bundle) {
    if (!bundle || state.pluginRemoveBusy) return;
    if (isRelayBundle(bundle.name)) return;

    if (state.pluginRemoveConfirm !== bundle.name) {
      state.pluginRemoveConfirm = bundle.name;
      if (state.pluginRemoveConfirmTimer) {
        window.clearTimeout(state.pluginRemoveConfirmTimer);
      }
      state.pluginRemoveConfirmTimer = window.setTimeout(function () {
        state.pluginRemoveConfirmTimer = 0;
        state.pluginRemoveConfirm = '';
        if (!settingsModal.hidden) renderPluginList();
      }, PLUGIN_CONFIRM_MS);
      renderPluginList();
      return;
    }

    clearPluginRemoveConfirm();
    performRemovePlugin(bundle);
  }

  async function performRemovePlugin(bundle) {
    state.pluginRemoveBusy = bundle.name;
    renderPluginList();

    try {
      var data = await wsRequest('removePlugin', { name: bundle.name });
      var result = data && data.result && typeof data.result === 'object' ? data.result : {};
      var ok = data && data.ok === true;
      var message = data && typeof data.message === 'string' && data.message
        ? data.message
        : (ok ? '已卸载' : '卸载失败');

      if (ok) {
        var text = pluginResultText(message, result);
        showPluginResult(text, result.application === 'failed' ? 'error' : 'ok');
        showToast(text);
        await reloadPluginSnapshot();
      } else {
        showPluginResult(message, 'error');
        showPluginDiagnostic(pluginDiagnosticText(result));
        showToast(message);
      }
    } catch (err) {
      var failMessage = err && err.message ? err.message : '卸载失败';
      if (failMessage.indexOf('未知操作') >= 0) {
        failMessage = '需要重启 DSH 才能使用这个功能';
      }
      showPluginResult(failMessage, 'error');
      showToast(failMessage);
    } finally {
      state.pluginRemoveBusy = '';
      if (!settingsModal.hidden) renderPluginList();
    }
  }

  function openSettings() {
    if (state.view !== 'chat') return;
    closeDrawer();
    closeInfoImmediate();
    closeCreateModalImmediate();
    if (state.pwdCloseTimer) {
      window.clearTimeout(state.pwdCloseTimer);
      state.pwdCloseTimer = 0;
    }
    resetPasswordForm();
    clearPluginRemoveConfirm();
    setPluginInstallBusy(state.pluginInstalling);
    renderPluginList();
    resetSettingsAccordion();
    updateAboutVersion();
    loadConnInfo();
    settingsModal.hidden = false;
    window.requestAnimationFrame(function () {
      settingsModal.classList.add('is-open');
    });
  }

  function closeSettings() {
    if (settingsModal.hidden) return;
    clearPluginRemoveConfirm();
    settingsModal.classList.remove('is-open');
    stopPasswordLockout();
    state.pwdBusy = false;
    setPasswordSubmitBusy(false);
    if (state.pwdCloseTimer) window.clearTimeout(state.pwdCloseTimer);
    state.pwdCloseTimer = window.setTimeout(function () {
      state.pwdCloseTimer = 0;
      settingsModal.hidden = true;
      settingsModal.classList.remove('is-open');
    }, MODAL_ANIM_MS);
    if (state.view === 'chat') settingsBtn.focus();
  }

  function closeSettingsImmediate() {
    clearPluginRemoveConfirm();
    if (state.pwdCloseTimer) {
      window.clearTimeout(state.pwdCloseTimer);
      state.pwdCloseTimer = 0;
    }
    settingsModal.hidden = true;
    settingsModal.classList.remove('is-open');
    stopPasswordLockout();
    state.pwdBusy = false;
    state.pwdSuccess = false;
    setPasswordSubmitBusy(false);
  }

  async function onPasswordSubmit(event) {
    event.preventDefault();
    if (state.pwdBusy || state.pwdLocked || state.pwdSuccess) return;

    passwordSuccess.hidden = true;
    showPasswordError('', false);

    var oldPwd = oldPasswordInput.value;
    var newPwd = newPasswordInput.value;
    var confirmPwd = confirmPasswordInput.value;

    if (!oldPwd) {
      showPasswordError('请输入原密码', false);
      oldPasswordInput.focus();
      return;
    }
    if (newPwd.length < 8) {
      showPasswordError('新密码至少 8 位', false);
      newPasswordInput.focus();
      return;
    }
    if (newPwd !== confirmPwd) {
      showPasswordError('两次输入的新密码不一致', false);
      confirmPasswordInput.focus();
      return;
    }

    state.pwdBusy = true;
    setPasswordSubmitBusy(true);

    try {
      var res = await apiJson('/api/password', 'POST', {
        old_password: oldPwd,
        new_password: newPwd
      });
      var data = await readJson(res);

      if (res.ok) {
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        state.pwdSuccess = true;
        state.pwdBusy = false;
        showPasswordSuccess();
        passwordSubmitBtn.disabled = true;
        passwordSubmitBtn.textContent = '保存';
        window.setTimeout(function () {
          if (!settingsModal.hidden) closeSettings();
        }, PWD_SUCCESS_CLOSE_MS);
        return;
      }

      if (res.status === 401) {
        var remaining = data && typeof data.remaining === 'number' ? data.remaining : null;
        showPasswordError(remaining !== null ? '原密码不对（还能试 ' + remaining + ' 次）' : '原密码不对', false);
        oldPasswordInput.value = '';
        oldPasswordInput.focus();
      } else if (res.status === 429) {
        var retryAfter = data && typeof data.retry_after === 'number' ? data.retry_after : 60;
        startPasswordLockout(retryAfter);
      } else if (res.status === 400) {
        showPasswordError(data && typeof data.error === 'string' && data.error ? data.error : '新密码不符合要求', false);
      } else {
        showPasswordError('修改失败，请稍后重试', false);
      }
    } catch (err) {
      showPasswordError('网络错误，请检查连接', false);
    } finally {
      state.pwdBusy = false;
      if (!state.pwdLocked && !state.pwdSuccess) setPasswordSubmitBusy(false);
    }
  }

  /* ================= 发送 ================= */
  function autosizeInput() {
    if (!inputEl.getClientRects().length) return;

    var style = window.getComputedStyle(inputEl);
    var lineHeight = parseFloat(style.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = 24;
    var paddingTop = parseFloat(style.paddingTop) || 0;
    var paddingBottom = parseFloat(style.paddingBottom) || 0;
    var borderTop = parseFloat(style.borderTopWidth) || 0;
    var borderBottom = parseFloat(style.borderBottomWidth) || 0;
    var maxHeight = lineHeight * MAX_INPUT_LINES + paddingTop + paddingBottom + borderTop + borderBottom;

    inputEl.style.height = 'auto';
    var contentHeight = inputEl.scrollHeight + borderTop + borderBottom;
    var nextHeight = Math.min(contentHeight, maxHeight);

    inputEl.style.height = nextHeight + 'px';
    inputEl.style.overflowY = contentHeight > maxHeight + 1 ? 'auto' : 'hidden';
  }

  function clearPendingSend(pending, success) {
    if (state.pendingSends[pending.sessionId] === pending) {
      delete state.pendingSends[pending.sessionId];
    }

    if (isNodeConnected(pending.node)) {
      pending.node.classList.remove('is-sending');
      if (success) {
        pending.status.hidden = true;
        pending.status.textContent = '';
      } else {
        pending.node.classList.add('is-failed');
        pending.status.hidden = false;
        pending.status.textContent = '未送达';
      }
    }

    state.typingSessions[pending.sessionId] = false;
    if (state.activeSessionId === pending.sessionId) setTyping(false);
    updateComposerState();
  }

  function sendCurrentMessage() {
    if (state.view !== 'chat') return;

    var sessionId = state.activeSessionId;
    if (!sessionId) {
      showToast('还没有会话，先新建一个');
      return;
    }
    if (state.pendingSends[sessionId]) return;
    if (state.historyLoading) return;

    var text = inputEl.value.replace(/\r\n/g, '\n').trim();
    if (!text) return;

    if (!state.wsOpen) {
      showToast('连接中，请稍候…');
      return;
    }
    if (state.agentOnline === false) {
      showToast('电脑端未连接，暂时无法发送');
      return;
    }

    var built = appendOutgoingUser(text);
    inputEl.value = '';
    autosizeInput();
    scrollToBottom();

    var pending = {
      node: built.row,
      status: built.status,
      text: text,
      sessionId: sessionId
    };
    state.pendingSends[sessionId] = pending;
    updateComposerState();
    bumpSession(sessionId, { running: true });

    wsRequest('send', { sessionId: sessionId, text: text }, { timeoutMs: 0 })
      .then(function () {
        clearPendingSend(pending, true);
        bumpSession(sessionId, { running: false });
        scheduleSnapshotRefresh(500);
      })
      .catch(function (err) {
        clearPendingSend(pending, false);
        bumpSession(sessionId, { running: false });
        scheduleSnapshotRefresh(500);
        showToast('发送失败：' + (err && err.message ? err.message : '未知错误'));
      });
  }

  function onInputKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.isComposing || event.keyCode === 229) return;   /* 中文输入法组合中 */
    if (event.shiftKey) return;                               /* Shift+Enter 换行 */
    event.preventDefault();
    sendCurrentMessage();
  }

  /* ================= 连接状态点 / 离线提示 ================= */
  function updateConnDot() {
    var stateName;
    var label;

    if (!state.wsOpen) {
      if (state.wsAttempts >= 3) {
        stateName = 'offline';
        label = '连接已断开';
      } else if (state.everConnected) {
        stateName = 'reconnecting';
        label = '重连中';
      } else {
        stateName = 'connecting';
        label = '连接中';
      }
    } else if (state.agentOnline === false) {
      stateName = 'agent-offline';
      label = '电脑端离线';
    } else {
      stateName = 'online';
      label = '电脑端在线';
    }

    connDot.setAttribute('data-state', stateName);
    connDot.setAttribute('title', label);
    connDot.setAttribute('aria-label', '状态：' + label);
    updateAgentBanner();
  }

  /* ================= WebSocket 请求 / 响应 ================= */
  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function wsRequest(action, payload, options) {
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      var socket = state.ws;
      if (!socket || socket.readyState !== 1) {
        reject(new Error('连接未就绪'));
        return;
      }

      var id = 'r' + (++reqCounter) + '-' + Math.random().toString(36).slice(2, 8);
      var entry = { resolve: resolve, reject: reject, action: action, timer: 0 };

      if (opts.timeoutMs && opts.timeoutMs > 0) {
        entry.timer = window.setTimeout(function () {
          if (pendingReqs.get(id) === entry) {
            pendingReqs.delete(id);
            reject(new Error('请求超时，请稍后重试'));
          }
        }, opts.timeoutMs);
      }

      pendingReqs.set(id, entry);

      try {
        socket.send(JSON.stringify({
          type: 'req',
          id: id,
          action: action,
          payload: payload || {}
        }));
      } catch (err) {
        if (entry.timer) window.clearTimeout(entry.timer);
        pendingReqs.delete(id);
        reject(new Error('发送请求失败'));
      }
    });
  }

  function resolveRequest(data) {
    var id = typeof data.id === 'string' ? data.id : '';
    if (!id) return;
    var entry = pendingReqs.get(id);
    if (!entry) return;
    pendingReqs.delete(id);
    if (entry.timer) window.clearTimeout(entry.timer);

    if (typeof data.error === 'string' && data.error) {
      entry.reject(new Error(data.error));
    } else {
      entry.resolve(data.data || {});
    }
  }

  function rejectAllRequests(message) {
    var entries = [];
    pendingReqs.forEach(function (entry) {
      entries.push(entry);
    });
    pendingReqs.clear();
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].timer) window.clearTimeout(entries[i].timer);
      entries[i].reject(new Error(message));
    }
  }

  /* ================= WebSocket 事件 ================= */
  function onTypingEvent(evt) {
    var sessionId = typeof evt.sessionId === 'string' ? evt.sessionId : '';
    if (!sessionId) return;
    var on = evt.on === true;
    state.typingSessions[sessionId] = on;
    if (sessionId === state.activeSessionId && !state.historyLoading) {
      setTyping(on);
    }
  }

  function onAssistantEvent(evt) {
    var sessionId = typeof evt.sessionId === 'string' ? evt.sessionId : '';
    var text = typeof evt.text === 'string' ? evt.text : '';
    if (!sessionId || !text) return;

    state.typingSessions[sessionId] = false;
    var session = findSession(sessionId);
    if (session) {
      session.running = false;
      session.updatedAt = Date.now();
      if (sessionId === state.activeSessionId) session.blank = false;
      sortSessions();
    }

    if (sessionId === state.activeSessionId) {
      setTyping(false);
      if (state.historyLoading) {
        state.bufferedAssistant.push({ text: text, ts: Date.now() });
      } else {
        appendMessage({ role: 'assistant', text: text, ts: Date.now() });
        if (state.stick) scrollToBottom();
        updateChatEmptyState();
      }
    } else {
      flashSession(sessionId);
    }

    renderSidebar();
    updateHeader();
    scheduleSnapshotRefresh(800);
  }

  function onAgentStatus(online) {
    var was = state.agentOnline;
    state.agentOnline = online;
    updateConnDot();
    updateChatEmptyState();
    updateComposerState();

    if (!online) {
      rejectAllRequests('电脑端连接已断开');
      clearTypingAll();
      if (was !== false && state.view === 'chat' && state.wsOpen) {
        showToast('电脑端连接已断开');
      }
      return;
    }

    if (was === false && state.wsOpen && state.view === 'chat') {
      handleSocketReady();
    }
  }

  function handleSocketData(raw) {
    if (typeof raw !== 'string') return;

    var data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'res') {
      resolveRequest(data);
    } else if (data.type === 'agent_status') {
      onAgentStatus(data.state === 'online');
    } else if (data.type === 'ev') {
      if (data.kind === 'typing') onTypingEvent(data);
      else if (data.kind === 'assistant') onAssistantEvent(data);
    }
  }

  async function handleSocketReady() {
    if (state.view !== 'chat') return;
    try {
      var socket = state.ws;
      var first = !state.snapshotLoaded;
      var data = await fetchSnapshot({ silent: !first });
      if (!data || state.ws !== socket) return;
      await syncSessionSelection('', !first);
      updateChatEmptyState();
      updateComposerState();
    } catch (err) {
      /* 连接波动时静默处理 */
    }
  }

  /* ================= WebSocket 连接管理 ================= */
  function openSocket() {
    state.wsEnabled = true;
    state.wsAttempts = 0;
    state.everConnected = false;
    connectSocket();
  }

  function closeSocket() {
    state.wsEnabled = false;
    if (state.retryTimer) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = 0;
    }
    var socket = state.ws;
    state.ws = null;
    state.wsOpen = false;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch (err) {
        /* ignore */
      }
    }
    state.wsAttempts = 0;
    state.agentOnline = null;
    rejectAllRequests('连接已关闭');
    clearTypingAll();
    updateConnDot();
  }

  function connectSocket() {
    if (!state.wsEnabled) return;

    var current = state.ws;
    if (current && (current.readyState === 0 || current.readyState === 1)) return;

    if (state.retryTimer) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = 0;
    }

    updateConnDot();

    var socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch (err) {
      scheduleReconnect();
      return;
    }

    state.ws = socket;

    socket.onopen = function () {
      if (state.ws !== socket) return;
      state.wsOpen = true;
      state.everConnected = true;
      state.wsAttempts = 0;
      state.agentOnline = null;
      /* 新连接可能已经重启过 DSH，重置“功能不可用”标记 */
      state.unsupported = { setModel: false, setPreset: false, setBundle: false };
      updateConnDot();
      updateChatEmptyState();
      updateComposerState();
      handleSocketReady();
    };

    socket.onmessage = function (event) {
      if (state.ws !== socket) return;
      handleSocketData(event.data);
    };

    socket.onerror = function () {
      /* 之后会触发 onclose，统一处理 */
    };

    socket.onclose = function () {
      if (state.ws !== socket) return;
      state.ws = null;
      state.wsOpen = false;
      state.agentOnline = null;
      rejectAllRequests('连接已断开，正在重连');
      clearTypingAll();
      updateConnDot();
      updateChatEmptyState();
      updateComposerState();

      if (!state.wsEnabled) return;
      state.wsAttempts += 1;
      updateConnDot();
      scheduleReconnect();
      if (state.wsAttempts === 3) checkSession();
    };
  }

  async function checkSession() {
    try {
      var res = await apiJson('/api/me');
      if (!res.ok && state.view === 'chat') expireSession();
    } catch (err) {
      /* 网络本身不通时保持重连 */
    }
  }

  function scheduleReconnect() {
    if (!state.wsEnabled) return;
    if (state.retryTimer) return;

    var base = 500 * Math.pow(2, Math.max(0, state.wsAttempts - 1));
    var delay = Math.min(MAX_RETRY_DELAY, base + Math.floor(Math.random() * 300));
    delay = Math.min(MAX_RETRY_DELAY, delay);

    state.retryTimer = window.setTimeout(function () {
      state.retryTimer = 0;
      connectSocket();
    }, delay);
  }

  /* ================= 应用重置 / 启动 ================= */
  function resetAppUi() {
    state.snapshot = null;
    state.snapshotLoaded = false;
    state.snapshotError = '';
    state.snapshotSeq += 1;
    state.activeSessionId = '';
    state.loadedSessionId = '';
    state.historyToken += 1;
    state.historyLoading = false;
    state.historyError = '';
    state.bufferedAssistant = [];
    state.lastRendered = null;
    state.typingSessions = {};
    state.pendingSends = {};
    state.flashSessionId = '';
    state.setupBusy = false;
    state.unsupported = { setModel: false, setPreset: false, setBundle: false };
    state.modelBusy = false;
    state.modelBusyKey = '';
    state.presetBusy = false;
    state.presetBusyKey = '';
    state.bundleBusy = {};
    state.bundleConfirm = '';
    if (state.bundleConfirmTimer) {
      window.clearTimeout(state.bundleConfirmTimer);
      state.bundleConfirmTimer = 0;
    }
    state.bundleFeedback = {};
    for (var fb in state.bundleFeedbackTimers) {
      if (Object.prototype.hasOwnProperty.call(state.bundleFeedbackTimers, fb)) {
        window.clearTimeout(state.bundleFeedbackTimers[fb]);
      }
    }
    state.bundleFeedbackTimers = {};
    if (state.flashTimer) {
      window.clearTimeout(state.flashTimer);
      state.flashTimer = 0;
    }
    if (state.snapshotRefreshTimer) {
      window.clearTimeout(state.snapshotRefreshTimer);
      state.snapshotRefreshTimer = 0;
    }
    setTyping(false);
    closeDrawer();
    closeInfoImmediate();
    closeCreateModalImmediate();
    closeSettingsImmediate();
    resetConnUi();

    state.pluginInstalling = false;
    state.pluginRemoveBusy = '';
    clearPluginRemoveConfirm();
    setPluginInstallBusy(false);
    clearPluginResult();
    pluginSpecInput.value = '';
    pluginList.textContent = '';
    pluginEmpty.hidden = true;
    resetInfoAccordionState();

    messagesInner.textContent = '';
    messagesInner.appendChild(emptyHint);
    emptyHint.hidden = false;
    state.stick = true;
    jumpBtn.hidden = true;

    inputEl.value = '';
    autosizeInput();

    updateHeader();
    renderSidebar();
    updateChatEmptyState();
    updateComposerState();
    updateAgentBanner();
  }

  function enterApp() {
    resetAppUi();
    setView('chat');
    autosizeInput();
    updateConnDot();
    updateChatEmptyState();
    updateComposerState();
    openSocket();
  }

  function onLogoutClick() {
    if (state.view !== 'chat' || logoutBtn.disabled) return;
    logoutBtn.disabled = true;
    closeSettingsImmediate();

    apiJson('/api/logout', 'POST').catch(function () {
      /* 即使请求失败也回到密码页 */
    }).then(function () {
      logoutBtn.disabled = false;
      showLogin();
    });
  }

  /* ================= 移动端视口（键盘 / 地址栏 / 安全区） ================= */
  function setupViewport() {
    var vv = window.visualViewport;
    var rafId = 0;

    function apply() {
      rafId = 0;
      var height = Math.round(vv ? vv.height : window.innerHeight);
      var offset = Math.round(vv ? vv.offsetTop : 0);
      root.style.setProperty('--app-height', height + 'px');
      root.style.setProperty('--app-offset', offset + 'px');

      if (state.view === 'chat' && state.stick) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function schedule() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(apply);
    }

    if (vv) {
      vv.addEventListener('resize', schedule);
      vv.addEventListener('scroll', schedule);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    apply();
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    loginForm.addEventListener('submit', onLoginSubmit);
    setupForm.addEventListener('submit', onSetupSubmit);
    setupSettingsAccordion();
    themeBtn.addEventListener('click', toggleTheme);
    logoutBtn.addEventListener('click', onLogoutClick);
    infoBtn.addEventListener('click', openInfo);
    settingsBtn.addEventListener('click', openSettings);
    menuBtn.addEventListener('click', toggleDrawer);
    sidebarBackdrop.addEventListener('click', closeDrawer);
    newSessionBtn.addEventListener('click', openCreateModal);
    retryBtn.addEventListener('click', onRetryClick);

    infoCloseBtn.addEventListener('click', closeInfo);
    infoBackdrop.addEventListener('click', closeInfo);
    createCloseBtn.addEventListener('click', closeCreateModal);
    createBackdrop.addEventListener('click', closeCreateModal);
    settingsCloseBtn.addEventListener('click', closeSettings);
    settingsBackdrop.addEventListener('click', closeSettings);
    passwordCancelBtn.addEventListener('click', closeSettings);
    passwordForm.addEventListener('submit', onPasswordSubmit);

    connServerCopy.addEventListener('click', function () {
      if (state.connInfo) copyWithFeedback(connServerCopy, state.connInfo.serverUrl);
    });
    connTokenCopy.addEventListener('click', function () {
      if (state.connInfo) copyWithFeedback(connTokenCopy, state.connInfo.agentToken);
    });
    connStringCopy.addEventListener('click', function () {
      if (state.connInfo) copyWithFeedback(connStringCopy, state.connInfo.connectString);
    });
    connTokenToggle.addEventListener('click', function () {
      state.tokenVisible = !state.tokenVisible;
      renderConnInfo();
    });

    pluginInstallBtn.addEventListener('click', onInstallPlugin);
    pluginSpecInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      onInstallPlugin();
    });

    sendBtn.addEventListener('click', sendCurrentMessage);
    inputEl.addEventListener('input', function () {
      autosizeInput();
      updateComposerState();
    });
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('focus', function () {
      window.setTimeout(function () {
        if (state.view === 'chat' && state.stick) scrollToBottom();
      }, 250);
    });

    messagesEl.addEventListener('scroll', onMessagesScroll, { passive: true });
    jumpBtn.addEventListener('click', scrollToBottom);

    window.addEventListener('resize', function () {
      if (state.view === 'chat') autosizeInput();
    });

    window.addEventListener('online', function () {
      if (state.view !== 'chat') return;
      state.wsAttempts = 0;
      connectSocket();
    });

    window.addEventListener('offline', function () {
      if (state.view !== 'chat') return;
      updateConnDot();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!settingsModal.hidden) { closeSettings(); return; }
      if (!createModal.hidden) { closeCreateModal(); return; }
      if (!infoLayer.hidden) { closeInfo(); return; }
      if (state.drawerOpen) closeDrawer();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (state.view !== 'chat' || !state.wsEnabled) return;

      if (!state.wsOpen) {
        state.wsAttempts = 0;
        connectSocket();
        return;
      }
      if (state.agentOnline !== false) refreshSnapshotOnly();
    });

    if (mobileMedia) {
      var handleMediaChange = function () {
        if (!mobileMedia.matches) closeDrawer();
      };
      if (typeof mobileMedia.addEventListener === 'function') {
        mobileMedia.addEventListener('change', handleMediaChange);
      } else if (typeof mobileMedia.addListener === 'function') {
        mobileMedia.addListener(handleMediaChange);
      }
    }
  }

  function onRetryClick() {
    if (!state.wsOpen) {
      if (state.wsEnabled) {
        state.wsAttempts = 0;
        connectSocket();
      }
      showToast('正在连接…');
      return;
    }
    if (!state.wsEnabled) return;
    handleSocketReady();
  }

  function startPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (state.view !== 'chat' || !state.wsOpen || state.agentOnline === false) return;
      refreshSnapshotOnly();
    }, POLL_INTERVAL);
  }

  /* ================= 启动 ================= */
  async function boot() {
    applyTheme(readTheme());
    bindEvents();
    setupViewport();
    autosizeInput();
    updateConnDot();
    updateChatEmptyState();
    updateComposerState();
    startPolling();

    var needsSetup = false;
    try {
      var setupRes = await fetch('/api/setup-state', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (setupRes.ok) {
        var setupData = await readJson(setupRes);
        if (setupData && setupData.needsSetup === true) needsSetup = true;
      }
    } catch (err) {
      /* 探测失败时回落到正常登录流程 */
    }

    if (needsSetup) {
      showSetup();
      return;
    }

    try {
      var res = await apiJson('/api/me');
      if (res.ok) {
        enterApp();
      } else {
        showLogin();
      }
    } catch (err) {
      showLogin();
    }
  }

  boot();
})();
