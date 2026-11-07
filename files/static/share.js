/* ============================================================
 * HEHE网盘 — 分享落地页
 * 链接形如 https://yun.hopzz.top/gx/<后缀>
 * 原生 JS，无框架；所有服务端文本都通过 textContent 写入
 * ============================================================ */
(function () {
  'use strict';

  var TOKEN = '';
  var state = { name: '', path: '/', entries: [], busy: false, previewEntry: null };

  var loadingEl = document.getElementById('shareLoading');
  var errorView = document.getElementById('shareErrorView');
  var errorText = document.getElementById('shareErrorText');
  var codeForm = document.getElementById('shareCodeForm');
  var nameEl = document.getElementById('shareName');
  var codeInput = document.getElementById('shareCodeInput');
  var codeError = document.getElementById('shareCodeError');
  var codeBtn = document.getElementById('shareCodeBtn');
  var browser = document.getElementById('shareBrowser');
  var browserName = document.getElementById('shareBrowserName');
  var breadcrumb = document.getElementById('shareBreadcrumb');
  var entryList = document.getElementById('shareEntryList');
  var emptyEl = document.getElementById('shareEmpty');

  var previewModal = document.getElementById('previewModal');
  var previewTitle = document.getElementById('previewTitle');
  var previewImg = document.getElementById('previewImg');
  var previewClose = document.getElementById('previewClose');
  var previewDone = document.getElementById('previewDone');
  var previewDownload = document.getElementById('previewDownload');

  var IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|ico|avif)$/i;

  /* ---------------- 工具 ---------------- */
  function readJson(res) {
    return res.json().catch(function () {
      return {};
    });
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

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
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

  function setCodeError(message) {
    if (!message) {
      codeError.hidden = true;
      codeError.textContent = '';
      return;
    }
    codeError.textContent = message;
    codeError.hidden = false;
  }

  function tokenFromPath() {
    var match = /^\/(?:gx|s)\/([^/]+)\/?$/.exec(window.location.pathname);
    return match ? decodeURIComponent(match[1]) : '';
  }

  /* ---------------- 视图切换 ---------------- */
  function showError(text) {
    loadingEl.hidden = true;
    codeForm.hidden = true;
    browser.hidden = true;
    errorView.hidden = false;
    errorText.textContent = text;
  }

  function showCodeForm() {
    loadingEl.hidden = true;
    errorView.hidden = true;
    browser.hidden = true;
    codeForm.hidden = false;
    nameEl.textContent = state.name || '分享';
    codeInput.value = '';
    setCodeError('');
    codeBtn.disabled = false;
    codeBtn.textContent = '打开';
    window.setTimeout(function () {
      if (!codeForm.hidden) codeInput.focus();
    }, 80);
  }

  function showBrowser() {
    loadingEl.hidden = true;
    errorView.hidden = true;
    codeForm.hidden = true;
    browser.hidden = false;
    browserName.textContent = state.name || '分享';
  }

  /* ---------------- 接口 ---------------- */
  async function apiGet(url) {
    var res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    return { res: res, data: await readJson(res) };
  }

  async function apiPost(url, body) {
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return { res: res, data: await readJson(res) };
  }

  /* ---------------- 打开分享 ---------------- */
  async function boot() {
    TOKEN = tokenFromPath();
    if (!TOKEN) {
      showError('链接不完整，请向分享者重新索取');
      return;
    }

    try {
      var info = await apiGet('/api/share/info?token=' + encodeURIComponent(TOKEN));
      if (!info.res.ok || !info.data || info.data.ok !== true) {
        showError((info.data && info.data.error) || '分享不存在或已被取消');
        return;
      }
      state.name = info.data.name || '';
      document.title = (state.name ? state.name + ' · ' : '') + 'HEHE网盘';
      if (info.data.unlocked) {
        showBrowser();
        await loadEntries('/');
      } else {
        showCodeForm();
      }
    } catch (err) {
      showError('网络错误，请稍后重试');
    }
  }

  async function onVerifySubmit(event) {
    event.preventDefault();
    if (state.busy) return;

    var code = codeInput.value.trim();
    if (!code) {
      setCodeError('请输入共享码');
      codeInput.focus();
      return;
    }

    state.busy = true;
    codeBtn.disabled = true;
    codeBtn.textContent = '验证中…';
    setCodeError('');

    try {
      var result = await apiPost('/api/share/verify', { token: TOKEN, code: code });
      if (result.res.ok && result.data && result.data.ok === true) {
        showBrowser();
        await loadEntries('/');
        return;
      }

      if (result.res.status === 429) {
        var retry = result.data && result.data.retry_after ? Number(result.data.retry_after) : 60;
        setCodeError('尝试次数过多，请 ' + Math.ceil(retry / 60) + ' 分钟后再试');
      } else if (result.res.status === 401) {
        var remaining = result.data && typeof result.data.remaining === 'number'
          ? result.data.remaining : null;
        setCodeError(remaining !== null && remaining > 0
          ? '共享码不对，还能试 ' + remaining + ' 次'
          : '共享码不对');
        codeInput.value = '';
        codeInput.focus();
      } else if (result.res.status === 404 || result.res.status === 410) {
        showError((result.data && result.data.error) || '分享已失效');
        return;
      } else {
        setCodeError((result.data && result.data.error) || '验证失败，请稍后重试');
      }
    } catch (err) {
      setCodeError('网络错误，请检查连接');
    } finally {
      state.busy = false;
      codeBtn.disabled = false;
      codeBtn.textContent = '打开';
    }
  }

  /* ---------------- 目录 ---------------- */
  async function loadEntries(path) {
    var target = normalizePath(path);
    emptyEl.hidden = true;
    try {
      var result = await apiGet(
        '/api/share/entries?token=' + encodeURIComponent(TOKEN) +
        '&path=' + encodeURIComponent(target)
      );
      if (result.res.status === 403) {
        showCodeForm();
        return;
      }
      if (!result.res.ok || !result.data || result.data.ok !== true) {
        showError((result.data && result.data.error) || '读取失败');
        return;
      }
      state.path = normalizePath(result.data.path || target);
      state.entries = Array.isArray(result.data.entries) ? result.data.entries : [];
      renderBreadcrumb();
      renderEntries();
    } catch (err) {
      showError('网络错误，请稍后重试');
    }
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
        loadEntries(path);
      });
      breadcrumb.appendChild(button);
    }

    addCrumb(state.name || '根目录', '/', state.path === '/');

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
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    for (var i = 0; i < state.entries.length; i++) {
      entryList.appendChild(buildRow(state.entries[i]));
    }
  }

  function buildRow(entry) {
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

    if (entry.type === 'file') {
      var downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'row-btn';
      downloadBtn.textContent = '下载';
      downloadBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        downloadEntry(entry);
      });
      actions.appendChild(downloadBtn);
    }

    row.appendChild(actions);

    function activate() {
      if (entry.type === 'dir') loadEntries(joinPath(state.path, entry.name));
      else if (IMAGE_EXT.test(entry.name)) openPreview(entry);
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
    var url = '/api/share/download?token=' + encodeURIComponent(TOKEN) +
      '&path=' + encodeURIComponent(joinPath(state.path, entry.name));
    var link = document.createElement('a');
    link.href = url;
    link.download = entry.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ---------------- 图片预览 ---------------- */
  function openModal(el) {
    el.hidden = false;
    window.requestAnimationFrame(function () {
      el.classList.add('is-open');
    });
  }

  function closeModal(el) {
    el.classList.remove('is-open');
    window.setTimeout(function () {
      if (!el.classList.contains('is-open')) el.hidden = true;
    }, 200);
  }

  function openPreview(entry) {
    state.previewEntry = entry;
    previewTitle.textContent = entry.name;
    previewTitle.setAttribute('title', entry.name);
    previewImg.src = '/api/share/preview?token=' + encodeURIComponent(TOKEN) +
      '&path=' + encodeURIComponent(joinPath(state.path, entry.name));
    previewImg.alt = entry.name;
    openModal(previewModal);
  }

  function closePreview() {
    closeModal(previewModal);
    previewImg.removeAttribute('src');
    state.previewEntry = null;
  }

  /* ---------------- 绑定 ---------------- */
  codeForm.addEventListener('submit', onVerifySubmit);
  previewClose.addEventListener('click', closePreview);
  previewDone.addEventListener('click', closePreview);
  previewDownload.addEventListener('click', function () {
    if (state.previewEntry) downloadEntry(state.previewEntry);
  });
  previewModal.addEventListener('click', function (event) {
    if (event.target === previewModal) closePreview();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !previewModal.hidden) closePreview();
  });

  boot();
})();
