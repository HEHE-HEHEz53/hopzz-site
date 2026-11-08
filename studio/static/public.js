/* 公开分享页：https://studio.hopzz.top/ll/{slug}
 * 只读模式：浏览目录、预览/下载文件、查看项目字段
 * 可修改模式：额外支持上传、新建文件夹、删除文件、编辑字段
 */
(function () {
  'use strict';

  var SLUG = (location.pathname.match(/^\/ll\/([^/]+)/) || [])[1] || '';
  var BASE = '/ll/' + SLUG;
  var state = { info: null, path: '', entries: [], editable: false, saving: false };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === undefined || val === null) return;
        if (key === 'class') el.className = val;
        else if (key === 'text') el.textContent = val;
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
        else el.setAttribute(key, val);
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
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) throw new Error(data.error || data.detail || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  function fileUrl(path, download) {
    return BASE + '/api/file?path=' + encodeURIComponent(path) + (download ? '&download=1' : '');
  }

  function toast(msg) {
    var host = document.getElementById('toast-root');
    if (!host) return;
    var box = h('div', { class: 'toast', text: msg });
    host.appendChild(box);
    setTimeout(function () { box.remove(); }, 2400);
  }

  // ---------------------------------------------------------------- 头部

  function renderHead() {
    var info = state.info;
    var head = document.getElementById('pub-head');
    head.textContent = '';
    head.appendChild(h('div', { class: 'pub-brand' }, [
      h('strong', { text: info.name || '未命名项目' }),
      h('span', { class: 'type-badge', text: typeLabel(info.type) })
    ]));
    head.appendChild(h('div', { class: 'pub-meta' }, [
      h('span', { class: 'pub-mode ' + (state.editable ? 'is-edit' : 'is-view'), text: state.editable ? '可修改' : '仅浏览' }),
      h('span', { text: '更新于 ' + (info.updatedAt || '—') })
    ]));
    if (info.summary) head.appendChild(h('p', { class: 'pub-summary', text: info.summary }));
  }

  function typeLabel(type) {
    var map = {
      music: '音乐', lyrics: '歌词', art: '绘画', code: '代码', video: '视频',
      story: '剧情', world: '世界观', oc: 'OC', other: '其他'
    };
    return map[type] || '其他';
  }

  // ---------------------------------------------------------------- 字段

  function renderFields() {
    var info = state.info;
    var host = document.getElementById('pub-fields');
    host.textContent = '';
    var fields = info.fields || {};
    var keys = Object.keys(fields);
    var box = h('div', { class: 'pub-fields' });
    if (!keys.length) {
      box.appendChild(h('p', { class: 'empty-hint', text: '这个项目还没有填写内容。' }));
    }
    keys.forEach(function (key) {
      var value = fields[key];
      if (value === null || value === undefined || value === '') return;
      var text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      var row = h('div', { class: 'pub-field' }, [
        h('span', { class: 'pub-field-key', text: key })
      ]);
      if (state.editable) {
        var ta = h('textarea', { class: 'input pub-field-input', rows: '4', value: text });
        ta.addEventListener('change', function () {
          var next = {};
          next[key] = ta.value;
          api(BASE + '/api/project', { method: 'PATCH', body: { fields: next } })
            .then(function () { toast('已保存'); })
            .catch(function (err) { toast('保存失败：' + err.message); });
        });
        row.appendChild(ta);
      } else {
        row.appendChild(h('pre', { class: 'pub-field-value', text: text }));
      }
      box.appendChild(row);
    });
    host.appendChild(box);

    var sections = info.sections || [];
    if (sections.length) {
      var secBox = h('div', { class: 'pub-sections' }, [h('h3', { text: '片段' })]);
      sections.forEach(function (sec) {
        secBox.appendChild(h('div', { class: 'pub-section' }, [
          h('strong', { text: sec.name || '未命名' }),
          h('span', { text: ' ' + (sec.start || 0) + ' – ' + (sec.end || 0) }),
          sec.notes ? h('p', { class: 'pub-section-notes', text: sec.notes }) : null
        ]));
      });
      host.appendChild(secBox);
    }
  }

  // ---------------------------------------------------------------- 仓库

  function renderTree() {
    var host = document.getElementById('pub-tree');
    host.textContent = '';
    var bar = h('div', { class: 'pub-tree-bar' }, [
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '↑ 上一级', onclick: goUp }),
      h('span', { class: 'pub-path', text: '/' + state.path })
    ]);
    if (state.editable) {
      var uploadInput = h('input', { type: 'file', multiple: 'multiple', class: 'pub-upload' });
      uploadInput.addEventListener('change', function () {
        if (!uploadInput.files || !uploadInput.files.length) return;
        var form = new FormData();
        Array.prototype.forEach.call(uploadInput.files, function (f) { form.append('files', f); });
        api(BASE + '/api/upload?path=' + encodeURIComponent(state.path), { method: 'POST', body: form })
          .then(function (res) {
            toast('已上传 ' + (res.uploaded || []).length + ' 个文件');
            loadTree();
          })
          .catch(function (err) { toast('上传失败：' + err.message); });
      });
      var newDir = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '新建文件夹' });
      newDir.addEventListener('click', function () {
        var name = window.prompt('文件夹名称');
        if (!name) return;
        var rel = state.path ? state.path + '/' + name : name;
        api(BASE + '/api/mkdir', { method: 'POST', body: { path: rel } })
          .then(function () { loadTree(); })
          .catch(function (err) { toast('创建失败：' + err.message); });
      });
      bar.appendChild(uploadInput);
      bar.appendChild(newDir);
    }
    host.appendChild(bar);

    var list = h('div', { class: 'pub-list' });
    state.entries.forEach(function (entry) {
      var row = h('div', { class: 'pub-row' }, [
        h('span', { class: 'pub-name', text: (entry.type === 'dir' ? '📁 ' : '📄 ') + entry.name }),
        h('span', { class: 'pub-size', text: entry.type === 'dir' ? '' : (entry.sizeText || '') })
      ]);
      if (entry.type === 'dir') {
        row.classList.add('is-dir');
        row.addEventListener('click', function () { state.path = entry.path; loadTree(); });
      } else {
        row.addEventListener('click', function () { preview(entry); });
        row.appendChild(h('a', {
          class: 'btn btn-ghost btn-sm', href: fileUrl(entry.path, true), text: '下载'
        }));
        if (state.editable) {
          var del = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '删除' });
          del.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (!window.confirm('删除 ' + entry.name + '？')) return;
            api(BASE + '/api/file?path=' + encodeURIComponent(entry.path), { method: 'DELETE' })
              .then(function () { loadTree(); })
              .catch(function (err) { toast('删除失败：' + err.message); });
          });
          row.appendChild(del);
        }
      }
      list.appendChild(row);
    });
    if (!state.entries.length) list.appendChild(h('p', { class: 'empty-hint', text: '这个目录是空的。' }));
    host.appendChild(list);
  }

  function goUp() {
    if (!state.path) return;
    var parts = state.path.split('/');
    parts.pop();
    state.path = parts.join('/');
    loadTree();
  }

  function preview(entry) {
    var box = document.getElementById('pub-preview');
    box.textContent = '';
    box.hidden = false;
    box.appendChild(h('div', { class: 'pub-preview-head' }, [
      h('strong', { text: entry.name }),
      h('button', { class: 'icon-btn', type: 'button', text: '×', onclick: function () { box.hidden = true; box.textContent = ''; } })
    ]));
    var kind = entry.kind || 'file';
    if (kind === 'image') {
      box.appendChild(h('img', { class: 'pub-preview-img', src: fileUrl(entry.path), alt: entry.name, loading: 'lazy' }));
    } else if (kind === 'audio') {
      box.appendChild(h('audio', { controls: 'controls', src: fileUrl(entry.path) }));
    } else if (kind === 'video') {
      box.appendChild(h('video', { controls: 'controls', src: fileUrl(entry.path), class: 'pub-preview-video' }));
    } else if (kind === 'text') {
      var pre = h('pre', { class: 'pub-preview-text', text: '加载中…' });
      box.appendChild(pre);
      fetch(fileUrl(entry.path)).then(function (r) { return r.text(); }).then(function (t) {
        pre.textContent = t.slice(0, 200000);
      }).catch(function () { pre.textContent = '读取失败'; });
    } else {
      box.appendChild(h('p', { class: 'empty-hint', text: '这个文件不支持在线预览，可以下载后查看。' }));
    }
  }

  // ---------------------------------------------------------------- 加载

  function loadInfo() {
    return api(BASE + '/api/info').then(function (data) {
      state.info = data.project || {};
      state.editable = !!data.editable;
      renderHead();
      renderFields();
      var s = state.info;
      if (s.name) document.title = s.name + ' · Hopzz Studio';
    }).catch(function (err) {
      document.getElementById('pub-root').textContent = '';
      document.getElementById('pub-root').appendChild(h('p', { class: 'pub-error', text: '链接不可用：' + err.message }));
    });
  }

  function loadTree() {
    return api(BASE + '/api/tree?path=' + encodeURIComponent(state.path)).then(function (data) {
      state.entries = data.entries || [];
      renderTree();
    }).catch(function (err) {
      toast('目录读取失败：' + err.message);
    });
  }

  function boot() {
    loadInfo().then(function () {
      if (state.info) loadTree();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
