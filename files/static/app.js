/* ============================================================
 * 鲸鱼娘网盘 — 纯静态前端逻辑
 * 原生 JS（IIFE，严格模式），无框架、无外部依赖。
 * 所有服务端 / 用户文本一律通过 textContent 写入，避免 XSS。
 * ============================================================ */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var MODAL_ANIM_MS = 200;
  var TOAST_MS = 3200;
  var PWD_SUCCESS_CLOSE_MS = 1100;

  /* ================= DOM ================= */
  var root = document.documentElement;

  var loginView = document.getElementById('loginView');
  var loginForm = document.getElementById('loginForm');
  var passwordInput = document.getElementById('password');
  var loginError = document.getElementById('loginError');
  var loginBtn = document.getElementById('loginBtn');

  var homeView = document.getElementById('homeView');
  var quickEntry = document.getElementById('quickEntry');
  var filesEntry = document.getElementById('filesEntry');
  var homeLogout = document.getElementById('homeLogout');

  var quickView = document.getElementById('quickView');
  var quickBack = document.getElementById('quickBack');
  var dropZone = document.getElementById('dropZone');
  var quickInput = document.getElementById('quickInput');
  var uploadList = document.getElementById('uploadList');
  var quickSummary = document.getElementById('quickSummary');
  var quickDone = document.getElementById('quickDone');
  var quickAgain = document.getElementById('quickAgain');
  var quickToFiles = document.getElementById('quickToFiles');

  var filesView = document.getElementById('filesView');
  var filesBack = document.getElementById('filesBack');
  var uploadBtn = document.getElementById('uploadBtn');
  var mkdirBtn = document.getElementById('mkdirBtn');
  var settingsBtn = document.getElementById('settingsBtn');
  var breadcrumb = document.getElementById('breadcrumb');
  var entryList = document.getElementById('entryList');
  var emptyDir = document.getElementById('emptyDir');
  var filesLoading = document.getElementById('filesLoading');
  var totalLine = document.getElementById('totalLine');
  var fileInput = document.getElementById('fileInput');
  var uploadStatus = document.getElementById('uploadStatus');
  var uploadStatusText = document.getElementById('uploadStatusText');
  var uploadStatusBar = document.getElementById('uploadStatusBar');

  var mkdirModal = document.getElementById('mkdirModal');
  var mkdirForm = document.getElementById('mkdirForm');
  var mkdirInput = document.getElementById('mkdirInput');
  var mkdirError = document.getElementById('mkdirError');
  var mkdirCancel = document.getElementById('mkdirCancel');
  var mkdirCreate = document.getElementById('mkdirCreate');

  var moveModal = document.getElementById('moveModal');
  var moveTitle = document.getElementById('moveTitle');
  var moveSub = document.getElementById('moveSub');
  var moveList = document.getElementById('moveList');
  var moveError = document.getElementById('moveError');
  var moveCancel = document.getElementById('moveCancel');
  var moveConfirm = document.getElementById('moveConfirm');

  var confirmModal = document.getElementById('confirmModal');
  var confirmTitle = document.getElementById('confirmTitle');
  var confirmMessage = document.getElementById('confirmMessage');
  var confirmCancel = document.getElementById('confirmCancel');
  var confirmOk = document.getElementById('confirmOk');

  var settingsModal = document.getElementById('settingsModal');
  var settingsClose = document.getElementById('settingsClose');
  var passwordForm = document.getElementById('passwordForm');
  var oldPasswordInput = document.getElementById('oldPassword');
  var newPasswordInput = document.getElementById('newPassword');
  var confirmPasswordInput = document.getElementById('confirmPassword');
  var passwordError = document.getElementById('passwordError');
  var passwordSuccess = document.getElementById('passwordSuccess');
  var passwordCancel = document.getElementById('passwordCancel');
  var passwordSubmit = document.getElementById('passwordSubmit');

  var toastHost = document.getElementById('toastHost');

  /* ================= 状态 ================= */
  var state = {
    view: 'boot',
    loginBusy: false,
    loginLocked: false,
    loginLockTimer: 0,

    netdiskEntered: false,
    enteringNetdisk: false,

    path: '/',
    entries: [],
    loading: false,
    loadFailed: false,

    quickItems: [],
    quickUploading: 0,
    quickDir: '/快速上传',

    uploadingFiles: false,
    uploadStatusTimer: 0,

    moveEntry: null,
    moveFrom: '/',
    moveTarget: '',
    confirmAction: null,

    mkdirBusy: false,
    pwdBusy: false,
    pwdLocked: false,
    pwdLockTimer: 0,
    pwdSuccess: false,
    pwdCloseTimer: 0
  };

  var activeXhrs = new Set();

  /* ================= 工具 ================= */
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function readJson(res) {
    try {
      return res.json();
    } catch (err) {
      return Promise.resolve(null);
    }
  }

  function showToast(message) {
    var text = typeof message === 'string' ? message : String(message || '');
    if (!text) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    toastHost.appendChild(el);
    while (toastHost.children.length > 2) toastHost.removeChild(toastHost.firstChild);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, TOAST_MS);
  }

  function clearToasts() {
    while (toastHost.firstChild) toastHost.removeChild(toastHost.firstChild);
  }

  function normalizePath(path) {
    var value = typeof path === 'string' ? path.trim() : '';
    if (!value) return '/';
    if (value.charAt(0) !== '/') value = '/' + value;
    value = value.replace(/\/+/g, '/');
    if (value.length > 1) value = value.replace(/\/+$/, '');
    return value || '/';
  }

  function joinPath(base, name) {
    var dir = normalizePath(base);
    if (dir === '/') return '/' + name;
    return dir + '/' + name;
  }

  function formatSize(bytes) {
    var size = Number(bytes);
    if (!isFinite(size) || size < 0) return '—';
    if (size < 1024) return size + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var value = size / 1024;
    var index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value = value / 1024;
      index += 1;
    }
    var text = value >= 10 ? String(Math.round(value)) : value.toFixed(1);
    return text + ' ' + units[index];
  }

  function formatTime(seconds) {
    var value = Number(seconds);
    if (!isFinite(value) || value <= 0) return '';
    var date = new Date(value * 1000);
    if (isNaN(date.getTime())) return '';
    var now = new Date();
    var time = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    var sameDay = date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) return time;
    var dateText = pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    if (date.getFullYear() === now.getFullYear()) return dateText + ' ' + time;
    return date.getFullYear() + '-' + dateText;
  }

  function formatCountdown(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
  }

  function abortUploads() {
    activeXhrs.forEach(function (xhr) {
      try {
        xhr.abort();
      } catch (err) {
        /* ignore */
      }
    });
    activeXhrs.clear();
  }

  /* ================= 网络 ================= */
  async function apiJson(url, method, body, options) {
    var opts = options || {};
    var config = {
      method: method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined && body !== null) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    }

    var res = await fetch(url, config);
    var data = await readJson(res);

    if (res.status === 401 && !opts.allow401) {
      sessionExpired();
      var authError = new Error('登录已过期');
      authError.auth = true;
      throw authError;
    }

    return { res: res, data: data || {} };
  }

  function expectOk(result, fallback) {
    if (!result || !result.res || !result.res.ok || !result.data || result.data.ok !== true) {
      var message = result && result.data && result.data.error
        ? String(result.data.error)
        : (fallback || '操作失败');
      var error = new Error(message);
      error.status = result && result.res ? result.res.status : 0;
      error.data = result ? result.data : null;
      throw error;
    }
    return result.data;
  }

  function uploadFileXhr(url, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      activeXhrs.add(xhr);

      function cleanup() {
        activeXhrs.delete(xhr);
      }

      xhr.open('POST', url, true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = function (event) {
        if (onProgress && event.lengthComputable && event.total > 0) {
          onProgress(Math.min(1, event.loaded / event.total));
        }
      };

      xhr.onload = function () {
        cleanup();
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data && data.ok) {
          resolve(data);
          return;
        }
        if (xhr.status === 401) {
          var authError = new Error('登录已过期');
          authError.auth = true;
          reject(authError);
          return;
        }
        reject(new Error(data && data.error ? String(data.error) : '上传失败（HTTP ' + xhr.status + '）'));
      };

      xhr.onerror = function () {
        cleanup();
        reject(new Error('网络错误，上传失败'));
      };

      xhr.onabort = function () {
        cleanup();
        var abortError = new Error('已取消');
        abortError.aborted = true;
        reject(abortError);
      };

      var form = new FormData();
      form.append('files', file, file.name || 'file');
      xhr.send(form);
    });
  }

  /* ================= 视图 ================= */
  function setView(name) {
    state.view = name;
    loginView.hidden = name !== 'login';
    homeView.hidden = name !== 'home';
    quickView.hidden = name !== 'quick';
    filesView.hidden = name !== 'files';
  }

  function enterHome() {
    closeAllModals();
    setView('home');
  }

  function enterQuick() {
    closeAllModals();
    setView('quick');
    updateQuickDone();
  }

  async function enterFiles(targetPath) {
    if (state.enteringNetdisk) return;
    state.enteringNetdisk = true;
    try {
      var result = await apiJson('/api/enter-netdisk', 'POST', {});
      expectOk(result, '无法进入网盘');
      state.netdiskEntered = true;
      setView('files');
      await loadDirectory(targetPath || '/');
    } catch (err) {
      if (!err.auth) showToast(err.message || '无法进入网盘');
    } finally {
      state.enteringNetdisk = false;
    }
  }

  /* ================= 登录 ================= */
  function setLoginError(message) {
    if (!message) {
      loginError.hidden = true;
      loginError.textContent = '';
      return;
    }
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function setLoginBusy(busy) {
    state.loginBusy = busy;
    loginBtn.disabled = busy || state.loginLocked;
    if (busy) loginBtn.textContent = '验证中…';
    else if (!state.loginLocked) loginBtn.textContent = '进入';
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
        setLoginError('');
        loginBtn.disabled = false;
        loginBtn.textContent = '进入';
        return;
      }
      setLoginError('尝试次数过多，已锁定，请在 ' + Math.ceil(remaining / 60) + ' 分钟后重试');
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
      setLoginError('请输入密码');
      passwordInput.focus();
      return;
    }

    setLoginBusy(true);
    setLoginError('');

    try {
      var res = await fetch('/api/login', {
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
        setLoginBusy(false);
        enterHome();
        return;
      }

      if (res.status === 401) {
        setLoginBusy(false);
        var remaining = data && typeof data.remaining === 'number' ? data.remaining : null;
        setLoginError(remaining !== null && remaining > 0
          ? '密码不对，还能试 ' + remaining + ' 次'
          : '密码不对');
        passwordInput.value = '';
        passwordInput.focus();
      } else if (res.status === 429) {
        setLoginBusy(false);
        var retryAfter = data && typeof data.retry_after === 'number' ? data.retry_after : 60;
        passwordInput.value = '';
        startLoginLockout(retryAfter);
      } else {
        setLoginBusy(false);
        setLoginError(data && data.error ? String(data.error) : '登录失败，请稍后重试');
      }
    } catch (err) {
      setLoginBusy(false);
      setLoginError('网络错误，请检查连接');
    }
  }

  function resetClientState() {
    abortUploads();

    state.loginBusy = false;
    if (state.loginLockTimer) {
      window.clearInterval(state.loginLockTimer);
      state.loginLockTimer = 0;
    }
    state.loginLocked = false;

    state.netdiskEntered = false;
    state.enteringNetdisk = false;
    state.path = '/';
    state.entries = [];
    state.loading = false;
    state.loadFailed = false;
    state.quickItems = [];
    state.quickUploading = 0;
    state.quickDir = '/快速上传';
    state.uploadingFiles = false;
    state.moveEntry = null;
    state.moveFrom = '/';
    state.moveTarget = '';
    state.confirmAction = null;
    state.mkdirBusy = false;
    state.pwdBusy = false;
    state.pwdSuccess = false;
    stopPwdLockout();

    entryList.textContent = '';
    emptyDir.hidden = true;
    filesLoading.hidden = true;
    totalLine.textContent = '共 0 项';
    uploadList.textContent = '';
    quickDone.hidden = true;
    quickSummary.hidden = true;
    uploadStatus.hidden = true;
    uploadBtn.disabled = false;
    setMkdirError('');
    setMoveError('');
    clearToasts();

    closeAllModals();
  }

  function showLogin(message) {
    resetClientState();
    setView('login');
    passwordInput.value = '';
    setLoginError(message || '');
    loginBtn.disabled = false;
    loginBtn.textContent = '进入';
    window.setTimeout(function () {
      if (state.view === 'login') passwordInput.focus();
    }, 80);
  }

  function sessionExpired() {
    if (state.view === 'login') return;
    showLogin('登录已过期，请重新登录');
  }

  async function logout() {
    abortUploads();
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    } catch (err) {
      /* 即使请求失败也回到密码页 */
    }
    showLogin('');
  }

  /* ================= 快速上传 ================= */
  function createQuickItem(file) {
    var item = {
      file: file,
      name: file && file.name ? file.name : '未命名文件',
      progress: 0,
      status: 'pending',
      error: ''
    };

    var row = document.createElement('div');
    row.className = 'upload-item';

    var head = document.createElement('div');
    head.className = 'upload-row';

    var name = document.createElement('span');
    name.className = 'upload-name';
    name.textContent = item.name;
    name.setAttribute('title', item.name);
    head.appendChild(name);

    var status = document.createElement('span');
    status.className = 'upload-state';
    status.textContent = '上传中';
    head.appendChild(status);

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry-btn';
    retry.textContent = '重试';
    retry.hidden = true;
    retry.addEventListener('click', function () {
      startQuickUpload(item);
    });
    head.appendChild(retry);

    var bar = document.createElement('div');
    bar.className = 'upload-bar';
    var fill = document.createElement('span');
    bar.appendChild(fill);

    row.appendChild(head);
    row.appendChild(bar);
    uploadList.appendChild(row);

    item.el = row;
    item.stateEl = status;
    item.retryEl = retry;
    item.barEl = fill;
    return item;
  }

  function updateQuickItem(item) {
    if (!item || !item.el) return;
    item.el.classList.toggle('is-done', item.status === 'done');
    item.el.classList.toggle('is-failed', item.status === 'failed');
    item.stateEl.className = 'upload-state';
    item.stateEl.textContent = item.status === 'done' ? '完成'
      : (item.status === 'failed' ? '失败' : '上传中');
    item.stateEl.setAttribute('title', item.error || '');
    item.barEl.style.width = Math.round((item.status === 'done' ? 1 : item.progress) * 100) + '%';
    item.retryEl.hidden = item.status !== 'failed';
  }

  function updateQuickDone() {
    var total = state.quickItems.length;
    if (!total) {
      quickDone.hidden = true;
      quickSummary.hidden = true;
      return;
    }

    var uploading = 0;
    var failed = 0;
    for (var i = 0; i < state.quickItems.length; i++) {
      var status = state.quickItems[i].status;
      if (status === 'uploading') uploading += 1;
      else if (status === 'failed') failed += 1;
    }

    if (uploading > 0) {
      quickDone.hidden = true;
      quickSummary.hidden = true;
      return;
    }

    if (failed > 0) {
      quickDone.hidden = true;
      quickSummary.textContent = failed + ' 个文件上传失败，可点击「重试」重新上传';
      quickSummary.hidden = false;
      return;
    }

    quickSummary.hidden = true;
    quickDone.hidden = false;
  }

  function startQuickUpload(item) {
    if (!item || item.status === 'uploading') return;

    item.status = 'uploading';
    item.progress = 0;
    item.error = '';
    updateQuickItem(item);
    state.quickUploading += 1;

    uploadFileXhr('/api/quick-upload', item.file, function (progress) {
      item.progress = progress;
      updateQuickItem(item);
    }).then(function (data) {
      item.status = 'done';
      item.progress = 1;
      if (data && typeof data.dir === 'string' && data.dir) {
        state.quickDir = normalizePath(data.dir);
      }
    }).catch(function (err) {
      item.status = 'failed';
      if (err && err.auth) {
        item.error = '登录已过期';
        sessionExpired();
        return;
      }
      if (err && err.aborted) {
        item.error = '已取消';
        return;
      }
      item.error = err && err.message ? err.message : '上传失败';
    }).then(function () {
      state.quickUploading = Math.max(0, state.quickUploading - 1);
      updateQuickItem(item);
      updateQuickDone();
    });
  }

  function handleQuickFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    quickDone.hidden = true;
    quickSummary.hidden = true;

    for (var i = 0; i < files.length; i++) {
      var item = createQuickItem(files[i]);
      state.quickItems.push(item);
      updateQuickItem(item);
      startQuickUpload(item);
    }
    updateQuickDone();
  }

  function clearQuickList() {
    state.quickItems = [];
    state.quickUploading = 0;
    uploadList.textContent = '';
    quickDone.hidden = true;
    quickSummary.hidden = true;
  }

  /* ================= 网盘：目录 ================= */
  function normalizeEntries(raw) {
    var list = [];
    if (!Array.isArray(raw)) return list;
    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i];
      if (!entry || typeof entry !== 'object') continue;
      var name = typeof entry.name === 'string' ? entry.name : '';
      if (!name) continue;
      list.push({
        name: name,
        type: entry.type === 'dir' ? 'dir' : 'file',
        size: Number(entry.size) || 0,
        mtime: Number(entry.mtime) || 0
      });
    }
    list.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      try {
        return a.name.localeCompare(b.name, 'zh');
      } catch (err) {
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      }
    });
    return list;
  }

  async function loadDirectory(targetPath) {
    var path = normalizePath(targetPath);
    state.loading = true;
    state.loadFailed = false;
    filesLoading.hidden = false;
    emptyDir.hidden = true;

    try {
      var result = await apiJson('/api/list?path=' + encodeURIComponent(path));
      var data = expectOk(result, '读取目录失败');
      state.path = normalizePath(data.path || path);
      state.entries = normalizeEntries(data.entries);
    } catch (err) {
      state.loading = false;
      filesLoading.hidden = true;
      if (err.auth) return;
      showToast(err.message || '读取目录失败');
      state.entries = [];
      state.loadFailed = true;
    }

    state.loading = false;
    filesLoading.hidden = true;
    renderBreadcrumb();
    renderEntries();
    updateTotal();
  }

  function updateTotal() {
    var files = 0;
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].type === 'file') files += 1;
    }
    var text = '共 ' + state.entries.length + ' 项';
    if (files > 0) text += ' · 文件 ' + files + ' 个';
    totalLine.textContent = text;
  }

  function renderBreadcrumb() {
    breadcrumb.textContent = '';

    function addCrumb(label, path, isCurrent) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'crumb' + (isCurrent ? ' is-current' : '');
      button.textContent = label;
      button.setAttribute('title', path);
      button.addEventListener('click', function () {
        if (state.loading) return;
        loadDirectory(path);
      });
      breadcrumb.appendChild(button);
    }

    addCrumb('根目录', '/', state.path === '/');

    if (state.path !== '/') {
      var segments = state.path.split('/').filter(Boolean);
      var current = '';
      for (var i = 0; i < segments.length; i++) {
        current += '/' + segments[i];
        var sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '/';
        breadcrumb.appendChild(sep);
        addCrumb(segments[i], current, i === segments.length - 1);
      }
    }

    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
  }

  function renderEntries() {
    entryList.textContent = '';

    if (!state.entries.length) {
      emptyDir.hidden = state.loadFailed;
      return;
    }
    emptyDir.hidden = true;

    for (var i = 0; i < state.entries.length; i++) {
      entryList.appendChild(buildEntryRow(state.entries[i]));
    }
  }

  function buildEntryRow(entry) {
    var row = document.createElement('div');
    row.className = 'entry-row';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    var icon = document.createElement('span');
    icon.className = 'entry-icon ' + (entry.type === 'dir' ? 'is-dir' : 'is-file');
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);

    var info = document.createElement('div');
    info.className = 'entry-info';

    var name = document.createElement('span');
    name.className = 'entry-name';
    name.textContent = entry.name;
    name.setAttribute('title', entry.name);
    info.appendChild(name);

    var meta = document.createElement('span');
    meta.className = 'entry-meta';
    var timeText = formatTime(entry.mtime);
    if (entry.type === 'dir') {
      meta.textContent = timeText ? '文件夹 · ' + timeText : '文件夹';
    } else {
      meta.textContent = formatSize(entry.size) + (timeText ? ' · ' + timeText : '');
    }
    info.appendChild(meta);
    row.appendChild(info);

    var actions = document.createElement('div');
    actions.className = 'entry-actions';

    var moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'row-btn';
    moveBtn.textContent = '移动';
    moveBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      openMove(entry);
    });
    actions.appendChild(moveBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn is-danger';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      openDeleteConfirm(entry);
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);

    function activate() {
      if (entry.type === 'dir') loadDirectory(joinPath(state.path, entry.name));
      else downloadEntry(entry);
    }

    row.addEventListener('click', activate);
    row.addEventListener('keydown', function (event) {
      if (event.target !== row) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });

    return row;
  }

  function downloadEntry(entry) {
    var url = '/api/download?path=' + encodeURIComponent(joinPath(state.path, entry.name));
    var link = document.createElement('a');
    link.href = url;
    link.download = entry.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ================= 弹窗基础 ================= */
  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    window.requestAnimationFrame(function () {
      modal.classList.add('is-open');
    });
  }

  function closeModal(modal) {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    window.setTimeout(function () {
      if (!modal.classList.contains('is-open')) modal.hidden = true;
    }, MODAL_ANIM_MS);
  }

  function closeAllModals() {
    [mkdirModal, moveModal, confirmModal, settingsModal].forEach(function (modal) {
      modal.classList.remove('is-open');
      modal.hidden = true;
    });
    state.confirmAction = null;
    stopPwdLockout();
    if (state.pwdCloseTimer) {
      window.clearTimeout(state.pwdCloseTimer);
      state.pwdCloseTimer = 0;
    }
    if (state.uploadStatusTimer) {
      window.clearTimeout(state.uploadStatusTimer);
      state.uploadStatusTimer = 0;
    }
    state.pwdBusy = false;
  }

  function setMkdirError(message) {
    if (!message) {
      mkdirError.hidden = true;
      mkdirError.textContent = '';
      return;
    }
    mkdirError.textContent = message;
    mkdirError.hidden = false;
  }

  function setMoveError(message) {
    if (!message) {
      moveError.hidden = true;
      moveError.textContent = '';
      return;
    }
    moveError.textContent = message;
    moveError.hidden = false;
  }

  /* ================= 新建文件夹 ================= */
  function openMkdir() {
    if (state.view !== 'files') return;
    mkdirInput.value = '';
    setMkdirError('');
    state.mkdirBusy = false;
    mkdirCreate.disabled = false;
    openModal(mkdirModal);
    window.setTimeout(function () {
      if (!mkdirModal.hidden) mkdirInput.focus();
    }, 80);
  }

  async function onCreateFolder(event) {
    event.preventDefault();
    if (state.mkdirBusy) return;

    var name = mkdirInput.value.trim();
    if (!name) {
      setMkdirError('请输入文件夹名称');
      mkdirInput.focus();
      return;
    }
    if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) {
      setMkdirError('名称不能包含斜杠');
      mkdirInput.focus();
      return;
    }

    state.mkdirBusy = true;
    mkdirCreate.disabled = true;
    setMkdirError('');
    var currentPath = state.path;

    try {
      var result = await apiJson('/api/mkdir', 'POST', { path: currentPath, name: name });
      expectOk(result, '新建文件夹失败');
      closeModal(mkdirModal);
      showToast('已新建文件夹');
      if (state.view === 'files' && state.path === currentPath) {
        await loadDirectory(currentPath);
      }
    } catch (err) {
      if (!err.auth) setMkdirError(err.message || '新建文件夹失败');
    } finally {
      state.mkdirBusy = false;
      mkdirCreate.disabled = false;
    }
  }

  /* ================= 移动 ================= */
  async function openMove(entry) {
    if (state.view !== 'files') return;
    state.moveEntry = entry;
    state.moveFrom = state.path;
    state.moveTarget = '';
    setMoveError('');
    moveTitle.textContent = '移动';
    moveSub.textContent = '把「' + entry.name + '」移动到：';
    moveList.textContent = '';
    moveConfirm.disabled = true;

    var loading = document.createElement('p');
    loading.className = 'modal-sub';
    loading.textContent = '正在读取文件夹…';
    moveList.appendChild(loading);
    openModal(moveModal);

    try {
      var result = await apiJson('/api/folders');
      var data = expectOk(result, '读取文件夹失败');
      renderMoveFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (err) {
      moveList.textContent = '';
      if (err.auth) return;
      setMoveError(err.message || '读取文件夹失败');
    }
  }

  function renderMoveFolders(folders) {
    moveList.textContent = '';

    var seen = Object.create(null);
    var normalized = [];
    for (var i = 0; i < folders.length; i++) {
      if (typeof folders[i] !== 'string') continue;
      var path = normalizePath(folders[i]);
      if (seen[path]) continue;
      seen[path] = true;
      normalized.push(path);
    }
    if (!seen['/']) normalized.unshift('/');

    for (var j = 0; j < normalized.length; j++) {
      (function (path) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'move-option';
        button.textContent = path === '/' ? '根目录' : path;
        button.setAttribute('title', path);
        button.addEventListener('click', function () {
          var options = moveList.querySelectorAll('.move-option');
          for (var k = 0; k < options.length; k++) options[k].classList.remove('is-selected');
          button.classList.add('is-selected');
          state.moveTarget = path;
          moveConfirm.disabled = false;
        });
        moveList.appendChild(button);
      })(normalized[j]);
    }
  }

  async function onMoveConfirm() {
    if (!state.moveEntry || !state.moveTarget) return;
    var entry = state.moveEntry;
    var target = state.moveTarget;
    var fromPath = state.moveFrom;
    moveConfirm.disabled = true;
    setMoveError('');

    try {
      var result = await apiJson('/api/move', 'POST', {
        path: joinPath(fromPath, entry.name),
        to: target
      });
      expectOk(result, '移动失败');
      closeModal(moveModal);
      state.moveEntry = null;
      showToast('已移动');
      if (state.view === 'files' && state.path === fromPath) {
        await loadDirectory(fromPath);
      }
    } catch (err) {
      if (!err.auth) setMoveError(err.message || '移动失败');
      moveConfirm.disabled = false;
    }
  }

  /* ================= 删除确认 ================= */
  function openConfirm(options) {
    state.confirmAction = options && options.onConfirm ? options.onConfirm : null;
    confirmTitle.textContent = options && options.title ? options.title : '确认';
    confirmMessage.textContent = options && options.message ? options.message : '';
    confirmOk.textContent = options && options.okText ? options.okText : '确定';
    openModal(confirmModal);
  }

  function onConfirmOk() {
    var action = state.confirmAction;
    state.confirmAction = null;
    closeModal(confirmModal);
    if (action) {
      try {
        action();
      } catch (err) {
        showToast('操作失败');
      }
    }
  }

  function closeConfirmModal() {
    state.confirmAction = null;
    closeModal(confirmModal);
  }

  function openDeleteConfirm(entry) {
    var fromPath = state.path;
    openConfirm({
      title: '删除？',
      message: '「' + entry.name + '」将被删除，此操作不可撤销。',
      okText: '删除',
      onConfirm: async function () {
        try {
          var result = await apiJson(
            '/api/entry?path=' + encodeURIComponent(joinPath(fromPath, entry.name)),
            'DELETE'
          );
          expectOk(result, '删除失败');
          showToast('已删除');
          if (state.view === 'files' && state.path === fromPath) {
            await loadDirectory(fromPath);
          }
        } catch (err) {
          if (!err.auth) showToast(err.message || '删除失败');
        }
      }
    });
  }

  /* ================= 网盘上传 ================= */
  function setUploadStatus(text, percent) {
    uploadStatusText.textContent = text;
    uploadStatusBar.style.width = Math.max(0, Math.min(1, percent)) * 100 + '%';
  }

  async function uploadFilesSequential(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (state.uploadingFiles) {
      showToast('正在上传，请稍候');
      return;
    }

    var targetPath = state.path;
    state.uploadingFiles = true;
    uploadBtn.disabled = true;
    if (state.uploadStatusTimer) {
      window.clearTimeout(state.uploadStatusTimer);
      state.uploadStatusTimer = 0;
    }
    uploadStatus.hidden = false;
    setUploadStatus('上传中…', 0);

    var failedNames = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var label = '正在上传 ' + (i + 1) + '/' + files.length;
      setUploadStatus(label, i / files.length);

      try {
        await uploadFileXhr(
          '/api/upload?path=' + encodeURIComponent(targetPath),
          file,
          function (progress) {
            setUploadStatus(label, (i + progress) / files.length);
          }
        );
      } catch (err) {
        if (err && err.auth) {
          state.uploadingFiles = false;
          uploadBtn.disabled = false;
          uploadStatus.hidden = true;
          sessionExpired();
          return;
        }
        if (!(err && err.aborted)) failedNames.push(file.name || '未命名文件');
      }
    }

    state.uploadingFiles = false;
    uploadBtn.disabled = false;
    setUploadStatus('上传完成', 1);

    state.uploadStatusTimer = window.setTimeout(function () {
      state.uploadStatusTimer = 0;
      uploadStatus.hidden = true;
    }, 900);

    if (state.view === 'files' && state.path === targetPath) {
      await loadDirectory(targetPath);
    }

    if (failedNames.length) {
      showToast(failedNames.length + ' 个文件上传失败：' + failedNames.join('、'));
    } else {
      showToast('上传完成');
    }
  }

  /* ================= 设置 / 修改密码 ================= */
  function setPwdError(message) {
    if (!message) {
      passwordError.hidden = true;
      passwordError.textContent = '';
      return;
    }
    passwordError.textContent = message;
    passwordError.hidden = false;
  }

  function setPwdSuccess() {
    passwordError.hidden = true;
    passwordError.textContent = '';
    passwordSuccess.hidden = false;
  }

  function stopPwdLockout() {
    if (state.pwdLockTimer) {
      window.clearInterval(state.pwdLockTimer);
      state.pwdLockTimer = 0;
    }
    state.pwdLocked = false;
  }

  function setPwdSubmitBusy(busy) {
    passwordSubmit.disabled = !!busy || state.pwdLocked;
    passwordSubmit.textContent = busy ? '提交中…' : '保存';
  }

  function startPwdLockout(seconds) {
    stopPwdLockout();
    state.pwdLocked = true;
    var until = Date.now() + Math.max(1, seconds || 60) * 1000;
    passwordSubmit.disabled = true;

    var tick = function () {
      var remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        stopPwdLockout();
        passwordSubmit.disabled = false;
        passwordSubmit.textContent = '保存';
        setPwdError('');
        return;
      }
      setPwdError('尝试次数过多，已锁定，请在 ' + Math.ceil(remaining / 60) +
        ' 分钟后重试（' + formatCountdown(remaining) + '）');
      passwordSubmit.disabled = true;
    };

    tick();
    state.pwdLockTimer = window.setInterval(tick, 1000);
  }

  function resetPasswordForm() {
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    passwordSuccess.hidden = true;
    setPwdError('');
    stopPwdLockout();
    state.pwdBusy = false;
    state.pwdSuccess = false;
    setPwdSubmitBusy(false);
  }

  function openSettings() {
    if (state.view !== 'files') return;
    resetPasswordForm();
    openModal(settingsModal);
    window.setTimeout(function () {
      if (!settingsModal.hidden) oldPasswordInput.focus();
    }, 80);
  }

  function closeSettings() {
    closeModal(settingsModal);
    stopPwdLockout();
    state.pwdBusy = false;
    state.pwdSuccess = false;
    setPwdSubmitBusy(false);
    if (state.pwdCloseTimer) {
      window.clearTimeout(state.pwdCloseTimer);
      state.pwdCloseTimer = 0;
    }
  }

  async function onPasswordSubmit(event) {
    event.preventDefault();
    if (state.pwdBusy || state.pwdLocked || state.pwdSuccess) return;

    passwordSuccess.hidden = true;
    setPwdError('');

    var oldPwd = oldPasswordInput.value;
    var newPwd = newPasswordInput.value;
    var confirmPwd = confirmPasswordInput.value;

    if (!oldPwd) {
      setPwdError('请输入原密码');
      oldPasswordInput.focus();
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('新密码至少 6 位');
      newPasswordInput.focus();
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致');
      confirmPasswordInput.focus();
      return;
    }

    state.pwdBusy = true;
    setPwdSubmitBusy(true);

    try {
      var result = await apiJson('/api/password', 'POST', {
        old_password: oldPwd,
        new_password: newPwd
      }, { allow401: true });
      var data = result.data || {};

      if (result.res.ok && data.ok === true) {
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        state.pwdSuccess = true;
        state.pwdBusy = false;
        setPwdSuccess();
        passwordSubmit.disabled = true;
        passwordSubmit.textContent = '保存';
        if (state.pwdCloseTimer) window.clearTimeout(state.pwdCloseTimer);
        state.pwdCloseTimer = window.setTimeout(function () {
          state.pwdCloseTimer = 0;
          if (state.pwdSuccess) closeSettings();
        }, PWD_SUCCESS_CLOSE_MS);
        return;
      }

      if (result.res.status === 401) {
        var remaining = typeof data.remaining === 'number' ? data.remaining : null;
        setPwdError(remaining !== null ? '原密码不对（还能试 ' + remaining + ' 次）' : '原密码不对');
        oldPasswordInput.value = '';
        oldPasswordInput.focus();
      } else if (result.res.status === 429) {
        var retryAfter = typeof data.retry_after === 'number' ? data.retry_after : 60;
        startPwdLockout(retryAfter);
      } else if (result.res.status === 403) {
        setPwdError('请先进入网盘');
      } else if (result.res.status === 400) {
        setPwdError(data.error ? String(data.error) : '新密码不符合要求');
      } else {
        setPwdError(data.error ? String(data.error) : '修改失败，请稍后重试');
      }
    } catch (err) {
      if (!err.auth) setPwdError('网络错误，请检查连接');
    } finally {
      state.pwdBusy = false;
      if (!state.pwdLocked && !state.pwdSuccess) setPwdSubmitBusy(false);
    }
  }

  /* ================= 移动端视口 ================= */
  function setupViewport() {
    var vv = window.visualViewport;
    var rafId = 0;

    function apply() {
      rafId = 0;
      var height = Math.round(vv ? vv.height : window.innerHeight);
      var offset = Math.round(vv ? vv.offsetTop : 0);
      root.style.setProperty('--app-height', height + 'px');
      root.style.setProperty('--app-offset', offset + 'px');
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
    homeLogout.addEventListener('click', logout);

    quickEntry.addEventListener('click', enterQuick);
    filesEntry.addEventListener('click', function () {
      enterFiles('/');
    });

    quickBack.addEventListener('click', enterHome);
    quickAgain.addEventListener('click', function () {
      clearQuickList();
      quickInput.value = '';
      quickInput.click();
    });
    quickToFiles.addEventListener('click', function () {
      enterFiles(state.quickDir || '/快速上传');
    });

    dropZone.addEventListener('click', function () {
      quickInput.click();
    });
    dropZone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        quickInput.click();
      }
    });
    quickInput.addEventListener('change', function () {
      handleQuickFiles(quickInput.files);
      quickInput.value = '';
    });

    dropZone.addEventListener('dragenter', function (event) {
      event.preventDefault();
      dropZone.classList.add('is-dragover');
    });
    dropZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      dropZone.classList.add('is-dragover');
    });
    dropZone.addEventListener('dragleave', function (event) {
      if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragover');
    });

    document.addEventListener('dragover', function (event) {
      event.preventDefault();
    });
    document.addEventListener('drop', function (event) {
      event.preventDefault();
      if (state.view !== 'quick') return;
      dropZone.classList.remove('is-dragover');
      var files = event.dataTransfer ? event.dataTransfer.files : null;
      if (files && files.length) handleQuickFiles(files);
    });

    filesBack.addEventListener('click', enterHome);
    uploadBtn.addEventListener('click', function () {
      if (state.uploadingFiles) {
        showToast('正在上传，请稍候');
        return;
      }
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      uploadFilesSequential(fileInput.files);
      fileInput.value = '';
    });
    mkdirBtn.addEventListener('click', openMkdir);
    settingsBtn.addEventListener('click', openSettings);

    mkdirForm.addEventListener('submit', onCreateFolder);
    mkdirCancel.addEventListener('click', function () {
      closeModal(mkdirModal);
    });

    moveConfirm.addEventListener('click', onMoveConfirm);
    moveCancel.addEventListener('click', function () {
      closeModal(moveModal);
    });

    confirmOk.addEventListener('click', onConfirmOk);
    confirmCancel.addEventListener('click', closeConfirmModal);

    settingsClose.addEventListener('click', closeSettings);
    passwordCancel.addEventListener('click', closeSettings);
    passwordForm.addEventListener('submit', onPasswordSubmit);

    [mkdirModal, moveModal, confirmModal, settingsModal].forEach(function (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target !== modal) return;
        if (modal === settingsModal) closeSettings();
        else if (modal === confirmModal) closeConfirmModal();
        else closeModal(modal);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!settingsModal.hidden) { closeSettings(); return; }
      if (!confirmModal.hidden) { closeConfirmModal(); return; }
      if (!moveModal.hidden) { closeModal(moveModal); return; }
      if (!mkdirModal.hidden) { closeModal(mkdirModal); }
    });
  }

  /* ================= 启动 ================= */
  async function boot() {
    setupViewport();
    bindEvents();

    try {
      var res = await fetch('/api/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        enterHome();
      } else {
        showLogin('');
      }
    } catch (err) {
      showLogin('');
    }
  }

  boot();
})();
