/* 项目分享面板 v2
 * - 开启 / 关闭 /ll/{slug} 公开链接，权限「仅浏览 / 可修改」
 * - 新增「同时发布到主页作品」开关：POST/DELETE/GET /api/projects/{id}/publish
 *   发布后固定只读（view），作品会出现在 hopzz.top 作品列表。
 *
 * 对外暴露 window.StudioShare.open(project, opts)。
 * 弹窗 / 提示 / 图标复用 app.js 暴露的 window.StudioUI，不重复实现。
 */
(function () {
  'use strict';
  if (window.StudioShare) return;

  var SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;

  function ui() {
    return window.StudioUI || null;
  }

  function errorText(err) {
    if (err && err.message) return String(err.message);
    return '请求失败';
  }

  function jsonRequest(path, options) {
    var api = ui().api;
    return api(path, options);
  }

  function projectSlugGuess(project) {
    var settings = ui().getSettings();
    var prefix = String(settings.sharePrefix || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    var base = String(project.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    var slug = (prefix + base).slice(0, 48);
    if (!SLUG_RE.test(slug)) {
      slug = ('work-' + Date.now().toString(36)).slice(0, 48);
    }
    return slug;
  }

  function open(project, opts) {
    var UI = ui();
    if (!UI || !project || !project.id) {
      window.alert('分享面板没有加载，请刷新页面重试');
      return;
    }
    var options = opts || {};
    var settings = UI.getSettings();
    var h = UI.h;
    var icon = UI.icon;

    var state = {
      enabled: false,
      slug: '',
      mode: 'view',
      url: '',
      published: false,
      publishAt: '',
      publishSlug: '',
      busy: false
    };

    var slugInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '48',
      placeholder: '例如 my-song（小写字母 / 数字 / - / _）'
    });
    var modeView = h('input', { type: 'radio', name: 'share-mode', value: 'view' });
    var modeEdit = h('input', { type: 'radio', name: 'share-mode', value: 'edit' });
    var statusEl = h('p', { class: 'share-status', role: 'status' });
    var linkRow = h('div', { class: 'share-link-row', hidden: true });

    var publishBadge = h('span', { class: 'publish-badge', hidden: true },
      icon('check', 'ico-sm'), h('span', { text: '已发布到 hopzz.top 作品' }));
    var publishHint = h('p', {
      class: 'publish-hint',
      text: '发布后会出现在 https://hopzz.top 的作品列表里，只读：自动使用分享链接、权限固定为「仅浏览」。'
    });
    var publishSwitch = h('input', { type: 'checkbox', 'aria-label': '同时发布到主页作品' });
    var publishSwitchLabel = h('label', { class: 'switch' },
      publishSwitch,
      h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' }))
    );

    var publishBox = h('div', { class: 'publish-box' },
      h('div', { class: 'publish-row' },
        h('div', {},
          h('div', { class: 'publish-title' }, icon('works', 'ico-sm'),
            h('span', { text: '同时发布到主页作品' })),
          publishHint
        ),
        publishSwitchLabel
      ),
      publishBadge
    );

    function currentMode() {
      return modeEdit.checked ? 'edit' : 'view';
    }

    function updateModeAvailability() {
      // 发布的作品是只读的：固定 view，禁止切到 edit
      modeEdit.disabled = state.published;
      if (state.published) {
        modeView.checked = true;
        modeEdit.checked = false;
      }
      publishSwitch.checked = state.published;
      publishBadge.hidden = !state.published;
      if (state.published) {
        publishHint.textContent = '已发布：主站作品列表只读展示，公开链接固定为「仅浏览」。取消发布后可改回「可修改」。';
      } else {
        publishHint.textContent = '发布后会出现在 https://hopzz.top 的作品列表里，只读：自动使用分享链接、权限固定为「仅浏览」。';
      }
    }

    function renderLink() {
      while (linkRow.firstChild) linkRow.removeChild(linkRow.firstChild);
      if (!state.url || !state.enabled) {
        linkRow.hidden = true;
        return;
      }
      linkRow.hidden = false;
      var full = location.origin + state.url;
      var urlInput = h('input', {
        class: 'input share-url', type: 'text', readonly: true, value: full
      });
      var copyBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('share', 'ico-sm'), h('span', { text: '复制' }));
      copyBtn.addEventListener('click', function () {
        copyText(full).then(function () {
          UI.toast('已复制链接', 'ok');
        });
      });
      var openBtn = h('a', {
        class: 'btn btn-ghost btn-sm', href: full, target: '_blank', rel: 'noopener'
      }, icon('external', 'ico-sm'), h('span', { text: '打开' }));
      linkRow.appendChild(urlInput);
      linkRow.appendChild(copyBtn);
      linkRow.appendChild(openBtn);
    }

    function applyShare(share) {
      var info = share || {};
      state.enabled = !!info.enabled;
      state.slug = info.slug || state.slug || '';
      state.mode = info.mode || state.mode || 'view';
      state.url = info.url || (state.enabled && state.slug ? '/ll/' + state.slug : '');
      slugInput.value = state.slug;
      modeView.checked = state.mode !== 'edit';
      modeEdit.checked = state.mode === 'edit';
      renderLink();
      updateModeAvailability();
    }

    function applyPublish(pub) {
      var info = pub || {};
      state.published = !!info.enabled;
      state.publishAt = info.at || state.publishAt || '';
      state.publishSlug = info.slug || state.publishSlug || '';
      updateModeAvailability();
      refreshActionButtons();
    }

    function setStatus(text) {
      statusEl.textContent = text || '';
    }

    function refreshActionButtons() {
      if (saveBtn) {
        saveBtn.disabled = state.busy;
        saveBtn.textContent = state.enabled ? '保存修改' : '开启链接';
      }
      if (disableBtn) {
        disableBtn.hidden = !state.enabled || state.busy;
      }
    }

    function load() {
      setStatus('读取中…');
      Promise.all([
        jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/share'),
        jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/publish')
      ]).then(function (results) {
        applyShare(results[0].share);
        applyPublish(results[1].publish);
        if (!slugInput.value) {
          slugInput.value = state.slug || projectSlugGuess(project);
        }
        setStatus(state.enabled ? '链接已开启' : '链接未开启');
        refreshActionButtons();
      }).catch(function (err) {
        setStatus('读取失败：' + errorText(err));
      });
    }

    function saveShare(enable) {
      if (state.busy) return;
      var slug = String(slugInput.value || '').trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        setStatus('链接名只能用 2-48 位小写字母、数字、- 或 _，且以字母或数字开头');
        slugInput.focus();
        return;
      }
      var mode = state.published ? 'view' : currentMode();
      state.busy = true;
      refreshActionButtons();
      setStatus('保存中…');

      var method;
      var body;
      if (state.enabled) {
        method = 'PATCH';
        body = { slug: slug, mode: mode };
        if (enable === true) body.enabled = true;
      } else {
        method = 'POST';
        body = { slug: slug, mode: mode };
      }

      jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/share', {
        method: method,
        json: body
      }).then(function (data) {
        state.busy = false;
        var share = data.share || {};
        share.enabled = true;
        applyShare(share);
        if (!share.url) state.url = '/ll/' + (share.slug || slug);
        renderLink();
        setStatus(state.published ? '已保存（发布中的作品固定只读）' : '已保存');
        UI.toast('分享设置已保存', 'ok');
        refreshActionButtons();
        notifyChanged();
      }).catch(function (err) {
        state.busy = false;
        refreshActionButtons();
        setStatus('保存失败：' + errorText(err));
      });
    }

    function disableShare() {
      if (state.busy) return;
      state.busy = true;
      refreshActionButtons();
      setStatus('关闭中…');
      jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/share', {
        method: 'DELETE'
      }).then(function () {
        state.busy = false;
        state.enabled = false;
        state.url = '';
        renderLink();
        setStatus('链接已关闭');
        UI.toast('链接已关闭', 'ok');
        refreshActionButtons();
        notifyChanged();
      }).catch(function (err) {
        state.busy = false;
        refreshActionButtons();
        setStatus('关闭失败：' + errorText(err));
      });
    }

    function togglePublish(on) {
      if (state.busy) {
        publishSwitch.checked = state.published;
        return;
      }
      state.busy = true;
      publishSwitch.disabled = true;
      setStatus(on ? '正在发布…' : '正在取消发布…');
      var request;
      if (on) {
        var slug = String(slugInput.value || '').trim().toLowerCase();
        var payload = {};
        if (SLUG_RE.test(slug)) payload.slug = slug;
        request = jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/publish', {
          method: 'POST',
          json: payload
        });
      } else {
        request = jsonRequest('/api/projects/' + encodeURIComponent(project.id) + '/publish', {
          method: 'DELETE'
        });
      }
      request.then(function (data) {
        state.busy = false;
        publishSwitch.disabled = false;
        var pub = data.publish || {};
        if (on) {
          // 发布接口会同时把分享设为 view + enabled
          state.enabled = true;
          state.mode = 'view';
          state.slug = pub.slug || state.slug;
          state.url = data.url || ('/ll/' + state.slug);
          slugInput.value = state.slug;
          modeView.checked = true;
          modeEdit.checked = false;
          applyShare({
            enabled: true,
            slug: state.slug,
            mode: 'view',
            url: state.url
          });
          setStatus('已发布到 hopzz.top 作品（只读）');
          UI.toast('已发布到主页作品', 'ok');
        } else {
          applyPublish({ enabled: false, slug: pub.slug || state.publishSlug });
          setStatus('已取消发布，分享链接仍可单独使用');
          UI.toast('已取消发布', 'ok');
        }
        applyPublish(Object.assign({}, pub, { enabled: on }));
        renderLink();
        refreshActionButtons();
        notifyChanged();
      }).catch(function (err) {
        state.busy = false;
        publishSwitch.disabled = false;
        publishSwitch.checked = state.published;
        setStatus((on ? '发布失败：' : '取消发布失败：') + errorText(err));
      });
    }

    function notifyChanged() {
      if (typeof options.onChanged !== 'function') return;
      try {
        options.onChanged({
          share: { enabled: state.enabled, slug: state.slug, mode: state.mode, url: state.url },
          publish: { enabled: state.published, slug: state.publishSlug, at: state.publishAt }
        });
      } catch (err) { /* ignore */ }
    }

    publishSwitch.addEventListener('change', function () {
      togglePublish(publishSwitch.checked);
    });
    modeView.addEventListener('change', function () {
      setStatus('');
    });
    modeEdit.addEventListener('change', function () {
      setStatus('');
    });

    // ---- 弹窗 ----
    var disableBtn = h('button', { class: 'btn btn-ghost', type: 'button', text: '关闭链接', hidden: true });
    disableBtn.addEventListener('click', disableShare);
    var saveBtn = h('button', { class: 'btn btn-primary', type: 'button', text: '开启链接' });
    saveBtn.addEventListener('click', function () {
      saveShare(false);
    });
    var cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', text: '关闭面板' });

    var body = h('div', {},
      h('label', { class: 'field' },
        h('span', { class: 'field-label', text: '链接名' }),
        slugInput,
        h('span', { class: 'field-hint', text: '链接地址：' + location.origin + '/ll/<链接名>' })
      ),
      h('div', { class: 'field' },
        h('span', { class: 'field-label', text: '权限' }),
        h('label', { class: 'radio-row' }, modeView, h('span', { text: '仅浏览（只能看和下载）' })),
        h('label', { class: 'radio-row' }, modeEdit, h('span', { text: '可修改（能上传、改内容）' }))
      ),
      linkRow,
      publishBox,
      statusEl
    );

    var close = UI.openModal({
      title: '分享「' + (project.name || '未命名项目') + '」',
      sub: '开启后会生成一个公开链接，任何人拿到链接都能打开。发布到主页作品时固定只读。',
      body: body,
      actions: [disableBtn, cancelBtn, saveBtn],
      onClose: function () {
        if (typeof options.onClose === 'function') options.onClose();
      }
    });

    cancelBtn.addEventListener('click', function () {
      if (close) close();
    });

    refreshActionButtons();
    load();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  window.StudioShare = { open: open };
})();
