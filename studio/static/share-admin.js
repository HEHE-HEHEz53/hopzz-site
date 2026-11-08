/* 项目分享面板：开启/关闭 /ll/{slug}，切换「仅浏览 / 可修改」。
 * 对外暴露 window.StudioShare.open(project) —— app.js 里点「分享」按钮调用。
 */
(function () {
  'use strict';
  if (window.StudioShare) return;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === undefined || val === null) return;
        if (key === 'class') el.className = val;
        else if (key === 'text') el.textContent = val;
        else if (key === 'html') el.innerHTML = val;
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), val);
        } else el.setAttribute(key, val);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function api(path, options) {
    var opts = options || {};
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    }
    opts.credentials = 'same-origin';
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || data.detail || ('HTTP ' + res.status));
        }
        return data;
      });
    });
  }

  function toast(msg) {
    var host = document.getElementById('toast-root');
    if (!host) { window.alert(msg); return; }
    var box = h('div', { class: 'toast', text: msg });
    host.appendChild(box);
    setTimeout(function () { box.remove(); }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    return Promise.resolve();
  }

  function open(project) {
    var root = document.getElementById('modal-root');
    if (!root) { toast('页面缺少弹窗容器'); return; }
    root.hidden = false;
    root.textContent = '';

    var state = { enabled: false, slug: '', mode: 'view', url: '' };
    var slugInput = h('input', {
      class: 'input', type: 'text', maxlength: '48',
      placeholder: '例如 my-song（小写字母/数字/-/_）', value: ''
    });
    var modeView = h('input', { type: 'radio', name: 'share-mode', value: 'view', checked: 'checked' });
    var modeEdit = h('input', { type: 'radio', name: 'share-mode', value: 'edit' });
    var statusEl = h('p', { class: 'share-status', role: 'status' });
    var linkRow = h('div', { class: 'share-link-row', hidden: '' });

    function currentMode() { return modeEdit.checked ? 'edit' : 'view'; }

    function renderLink(url) {
      linkRow.textContent = '';
      if (!url) { linkRow.hidden = true; return; }
      linkRow.hidden = false;
      var full = location.origin + url;
      var input = h('input', { class: 'input share-url', type: 'text', readonly: 'readonly', value: full });
      var copy = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '复制' });
      copy.addEventListener('click', function () {
        copyText(full).then(function () { toast('已复制链接'); });
      });
      var openBtn = h('a', { class: 'btn btn-ghost btn-sm', href: full, target: '_blank', rel: 'noopener', text: '打开' });
      linkRow.appendChild(input);
      linkRow.appendChild(copy);
      linkRow.appendChild(openBtn);
    }

    function load() {
      return api('/api/projects/' + encodeURIComponent(project.id) + '/share').then(function (data) {
        var share = data.share || {};
        state.enabled = !!share.enabled;
        state.slug = share.slug || '';
        state.mode = share.mode || 'view';
        state.url = share.url || '';
        slugInput.value = state.slug;
        modeView.checked = state.mode !== 'edit';
        modeEdit.checked = state.mode === 'edit';
        renderLink(state.url);
        statusEl.textContent = state.enabled ? '链接已开启' : '链接已关闭';
      }).catch(function (err) {
        statusEl.textContent = '读取失败：' + err.message;
      });
    }

    function save(enable) {
      var slug = String(slugInput.value || '').trim().toLowerCase();
      if (!slug) { statusEl.textContent = '请填写链接名'; return; }
      var payload = { slug: slug, mode: currentMode() };
      var req = state.enabled || enable
        ? api('/api/projects/' + encodeURIComponent(project.id) + '/share', {
            method: state.enabled ? 'PATCH' : 'POST',
            body: Object.assign({}, payload, state.enabled && !enable ? { enabled: true } : {})
          })
        : api('/api/projects/' + encodeURIComponent(project.id) + '/share', { method: 'POST', body: payload });
      req.then(function (data) {
        var share = data.share || {};
        state.enabled = !!share.enabled;
        state.slug = share.slug || slug;
        state.mode = share.mode || currentMode();
        state.url = data.url || share.url || ('/ll/' + state.slug);
        renderLink(state.url);
        statusEl.textContent = '已保存';
        toast('分享设置已保存');
      }).catch(function (err) {
        statusEl.textContent = '保存失败：' + err.message;
      });
    }

    function disable() {
      api('/api/projects/' + encodeURIComponent(project.id) + '/share', { method: 'DELETE' })
        .then(function () {
          state.enabled = false;
          state.url = '';
          renderLink('');
          statusEl.textContent = '链接已关闭';
          toast('链接已关闭');
        })
        .catch(function (err) { statusEl.textContent = '关闭失败：' + err.message; });
    }

    var closeBtn = h('button', { class: 'icon-btn modal-close', type: 'button', text: '×', 'aria-label': '关闭' });
    closeBtn.addEventListener('click', function () {
      root.hidden = true;
      root.textContent = '';
    });

    var card = h('div', { class: 'modal-card share-card', role: 'dialog', 'aria-modal': 'true' }, [
      h('div', { class: 'modal-head' }, [
        h('h2', { class: 'modal-title', text: '分享这个项目' }),
        closeBtn
      ]),
      h('p', { class: 'modal-sub', text: '开启后会生成一个公开链接，任何人拿到链接都能打开。只读或可修改由你决定。' }),
      h('label', { class: 'field' }, [
        h('span', { class: 'field-label', text: '链接名' }),
        slugInput,
        h('span', { class: 'field-hint', text: '链接地址：' + location.origin + '/ll/<链接名>' })
      ]),
      h('div', { class: 'field' }, [
        h('span', { class: 'field-label', text: '权限' }),
        h('label', { class: 'radio-row' }, [modeView, h('span', { text: '仅浏览（只能看和下载）' })]),
        h('label', { class: 'radio-row' }, [modeEdit, h('span', { text: '可修改（能上传、改内容）' })])
      ]),
      linkRow,
      statusEl,
      h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn btn-ghost', type: 'button', text: '关闭链接', onclick: disable }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: '保存', onclick: function () { save(state.enabled); } }),
        h('button', { class: 'btn btn-primary', type: 'button', text: '开启 / 更新链接', onclick: function () { save(true); } })
      ])
    ]);

    var backdrop = h('div', { class: 'modal-backdrop' });
    backdrop.addEventListener('click', function () { root.hidden = true; root.textContent = ''; });
    root.appendChild(backdrop);
    root.appendChild(card);
    load();
  }

  window.StudioShare = { open: open };
})();
