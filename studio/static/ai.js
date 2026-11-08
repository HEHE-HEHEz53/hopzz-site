/* studio AI 侧栏：右下角小球 + 会话侧栏 + 项目附加 + 思维导图。
 *
 * 对外只暴露 window.StudioAI = { mount, open, close }，不污染其它全局名字。
 * 所有用户/模型文本一律 textContent，绝不使用 innerHTML。
 */
(function () {
  'use strict';

  if (window.StudioAI) {
    return;
  }

  var AI_API = '/api/ai';
  var PROJECT_API = '/api/projects';
  var MARKMAP_CDN = 'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18';
  var NEW_SESSION_TITLE = '新会话';

  var CSS = [
    '.sai-root{--sai-bg:#0b1016;--sai-panel:#101821;--sai-soft:#152230;--sai-line:rgba(127,227,212,.16);',
    '--sai-line-strong:rgba(127,227,212,.34);--sai-text:#e6f1f4;--sai-dim:#8aa0ad;--sai-accent:#7fe3d4;',
    '--sai-accent2:#5ec8e5;--sai-danger:#ff8b8b;position:fixed;right:0;bottom:0;width:0;height:0;',
    'z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",',
    '"Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--sai-text);}',
    '.sai-root *{box-sizing:border-box;}',
    '.sai-ball{position:fixed;right:22px;bottom:22px;width:48px;height:48px;padding:0;border:1px solid var(--sai-line-strong);',
    'border-radius:50%;background:linear-gradient(145deg,#123040,#0d1a24);color:var(--sai-accent);font-size:22px;',
    'line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 6px rgba(127,227,212,.05);',
    'transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease;z-index:2147483002;}',
    '.sai-ball:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 8px rgba(127,227,212,.08);}',
    '.sai-root.sai-open .sai-ball{opacity:0;pointer-events:none;transform:scale(.8);}',
    '.sai-root.sai-away .sai-ball{display:none;}',
    '.sai-panel{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;display:flex;flex-direction:column;',
    'background:var(--sai-panel);border-left:1px solid var(--sai-line);box-shadow:-18px 0 48px rgba(0,0,0,.45);',
    'transform:translateX(102%);transition:transform .24s ease;overflow:hidden;z-index:2147483001;}',
    '.sai-root.sai-open .sai-panel{transform:translateX(0);}',
    '.sai-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;',
    'border-bottom:1px solid var(--sai-line);background:linear-gradient(180deg,rgba(127,227,212,.06),transparent);}',
    '.sai-titles{min-width:0;}',
    '.sai-title{font-size:14px;font-weight:600;letter-spacing:.04em;}',
    '.sai-sub{font-size:11px;color:var(--sai-dim);margin-top:2px;white-space:nowrap;overflow:hidden;',
    'text-overflow:ellipsis;max-width:170px;}',
    '.sai-head-acts{display:flex;align-items:center;gap:4px;flex-shrink:0;}',
    '.sai-icon-btn{appearance:none;border:1px solid transparent;background:transparent;color:var(--sai-dim);',
    'font-size:12px;padding:5px 7px;border-radius:8px;cursor:pointer;}',
    '.sai-icon-btn:hover{color:var(--sai-accent);background:rgba(127,227,212,.08);border-color:var(--sai-line);}',
    '.sai-chat{display:flex;flex-direction:column;flex:1;min-height:0;}',
    '.sai-sec{border-bottom:1px solid var(--sai-line);padding:8px 12px;flex-shrink:0;}',
    '.sai-sec-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 2px;}',
    '.sai-sec-title{font-size:11px;color:var(--sai-dim);letter-spacing:.08em;}',
    '.sai-link-btn{appearance:none;border:0;background:transparent;color:var(--sai-accent);font-size:11px;',
    'padding:2px 4px;cursor:pointer;border-radius:6px;}',
    '.sai-link-btn:hover{background:rgba(127,227,212,.1);}',
    '.sai-sessions{max-height:120px;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column;gap:3px;}',
    '.sai-sess{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:8px;cursor:pointer;',
    'border:1px solid transparent;}',
    '.sai-sess:hover{background:rgba(127,227,212,.07);}',
    '.sai-sess-on{background:rgba(94,200,229,.14);border-color:var(--sai-line-strong);}',
    '.sai-sess-title{flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sai-sess-acts{display:flex;gap:2px;opacity:0;transition:opacity .15s ease;flex-shrink:0;}',
    '.sai-sess:hover .sai-sess-acts,.sai-sess-on .sai-sess-acts{opacity:1;}',
    '.sai-mini{appearance:none;border:0;background:transparent;color:var(--sai-dim);font-size:11px;',
    'padding:1px 4px;border-radius:5px;cursor:pointer;}',
    '.sai-mini:hover{color:var(--sai-accent);background:rgba(127,227,212,.1);}',
    '.sai-mini-danger:hover{color:var(--sai-danger);background:rgba(255,139,139,.1);}',
    '.sai-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}',
    '.sai-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;border-radius:99px;',
    'border:1px solid var(--sai-line);background:rgba(94,200,229,.12);font-size:11px;color:var(--sai-text);max-width:100%;}',
    '.sai-chip-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;}',
    '.sai-chip-x{appearance:none;border:0;background:transparent;color:var(--sai-dim);cursor:pointer;',
    'font-size:13px;line-height:1;padding:0 3px;border-radius:50%;}',
    '.sai-chip-x:hover{color:var(--sai-danger);}',
    '.sai-picker{margin-top:6px;max-height:168px;overflow-y:auto;border:1px solid var(--sai-line);',
    'border-radius:10px;background:rgba(7,13,19,.6);padding:4px;}',
    '.sai-pick-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;',
    'font-size:12px;cursor:pointer;}',
    '.sai-pick-row:hover{background:rgba(127,227,212,.07);}',
    '.sai-pick-row input{accent-color:#5ec8e5;margin:0;}',
    '.sai-pick-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sai-pick-type{font-size:10px;color:var(--sai-dim);}',
    '.sai-picker-note{padding:8px;font-size:11px;color:var(--sai-dim);}',
    '.sai-msgs{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;',
    'background:radial-gradient(120% 60% at 100% 0,rgba(94,200,229,.05),transparent 60%),var(--sai-bg);}',
    '.sai-empty{margin:auto;max-width:240px;text-align:center;font-size:12px;line-height:1.8;color:var(--sai-dim);',
    'white-space:pre-line;}',
    '.sai-msg{display:flex;flex-direction:column;gap:3px;max-width:100%;}',
    '.sai-user{align-items:flex-end;}',
    '.sai-bot{align-items:flex-start;}',
    '.sai-who{font-size:10px;color:var(--sai-dim);padding:0 4px;}',
    '.sai-bubble{max-width:86%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.65;',
    'white-space:pre-wrap;word-break:break-word;background:var(--sai-soft);border:1px solid var(--sai-line);}',
    '.sai-user .sai-bubble{background:rgba(94,200,229,.2);border-color:rgba(94,200,229,.38);',
    'border-bottom-right-radius:4px;}',
    '.sai-bot .sai-bubble{border-bottom-left-radius:4px;}',
    '.sai-pending .sai-bubble{color:var(--sai-dim);font-style:italic;}',
    '.sai-note{font-size:11px;line-height:1.6;padding:6px 9px;border-radius:8px;border:1px dashed var(--sai-line);',
    'color:var(--sai-dim);white-space:pre-wrap;}',
    '.sai-note-err{color:var(--sai-danger);border-color:rgba(255,139,139,.4);background:rgba(255,139,139,.06);}',
    '.sai-compose{flex-shrink:0;border-top:1px solid var(--sai-line);padding:8px 12px 12px;',
    'background:rgba(9,15,21,.85);}',
    '.sai-status{min-height:16px;font-size:11px;color:var(--sai-dim);padding:0 2px 4px;white-space:pre-wrap;}',
    '.sai-status-err{color:var(--sai-danger);}',
    '.sai-input{width:100%;resize:none;min-height:40px;max-height:132px;padding:9px 11px;border-radius:10px;',
    'border:1px solid var(--sai-line);background:#0a131b;color:var(--sai-text);font-size:13px;line-height:1.55;',
    'font-family:inherit;outline:none;}',
    '.sai-input:focus{border-color:var(--sai-line-strong);box-shadow:0 0 0 3px rgba(127,227,212,.08);}',
    '.sai-send-row{display:flex;justify-content:flex-end;gap:8px;margin-top:7px;}',
    '.sai-send{appearance:none;border:0;border-radius:9px;padding:7px 20px;cursor:pointer;font-size:13px;',
    'font-weight:600;color:#04222a;background:linear-gradient(135deg,#7fe3d4,#5ec8e5);}',
    '.sai-send:disabled{opacity:.55;cursor:default;}',
    '.sai-page{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--sai-panel);z-index:2;}',
    '.sai-page-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;',
    'border-bottom:1px solid var(--sai-line);}',
    '.sai-page-title{font-size:13px;font-weight:600;letter-spacing:.04em;}',
    '.sai-page-status{min-height:16px;font-size:11px;color:var(--sai-dim);padding:6px 14px 0;white-space:pre-wrap;}',
    '.sai-page-status.sai-status-err,.sai-status-err{color:var(--sai-danger);}',
    '.sai-map-body{flex:1;min-height:0;overflow:auto;padding:10px;background:var(--sai-bg);}',
    '.sai-map-body .markmap{width:100%;height:100%;min-height:420px;}',
    '.sai-map-body .markmap svg{width:100%;height:100%;}',
    '.sai-markdown{margin:0;padding:12px;border:1px solid var(--sai-line);border-radius:10px;background:#0a131b;',
    'font-size:12px;line-height:1.7;color:var(--sai-text);white-space:pre-wrap;word-break:break-word;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
    '.sai-cfg-body{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 20px;display:flex;flex-direction:column;gap:10px;}',
    '.sai-provider-list{display:flex;flex-direction:column;gap:6px;}',
    '.sai-provider{appearance:none;text-align:left;border:1px solid var(--sai-line);border-radius:10px;',
    'background:rgba(7,13,19,.6);padding:8px 10px;cursor:pointer;color:var(--sai-text);font-family:inherit;}',
    '.sai-provider:hover{border-color:var(--sai-line-strong);}',
    '.sai-provider-on{border-color:var(--sai-line-strong);background:rgba(94,200,229,.1);}',
    '.sai-provider-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;font-weight:600;}',
    '.sai-provider-sub{font-size:10px;color:var(--sai-dim);margin-top:3px;word-break:break-all;}',
    '.sai-badge{font-size:9px;font-weight:400;padding:1px 6px;border-radius:99px;border:1px solid var(--sai-line);}',
    '.sai-badge-ok{color:#9df5d7;border-color:rgba(127,227,212,.45);background:rgba(127,227,212,.1);}',
    '.sai-badge-no{color:var(--sai-dim);}',
    '.sai-badge-def{color:#a9ddff;border-color:rgba(94,200,229,.4);}',
    '.sai-form{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--sai-line);padding-top:10px;}',
    '.sai-label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--sai-dim);}',
    '.sai-field{border:1px solid var(--sai-line);border-radius:8px;background:#0a131b;color:var(--sai-text);',
    'font-size:12px;padding:7px 9px;outline:none;font-family:inherit;}',
    '.sai-field:focus{border-color:var(--sai-line-strong);}',
    '.sai-check{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--sai-dim);cursor:pointer;}',
    '.sai-check input{accent-color:#5ec8e5;margin:0;}',
    '.sai-primary{appearance:none;border:1px solid var(--sai-line-strong);border-radius:9px;padding:7px 12px;',
    'background:rgba(127,227,212,.14);color:var(--sai-accent);font-size:12px;font-weight:600;cursor:pointer;}',
    '.sai-primary:hover{background:rgba(127,227,212,.22);}',
    '.sai-hint{font-size:10px;line-height:1.6;color:var(--sai-dim);}',
    '.sai-hidden{display:none !important;}',
    '@media (max-width:640px){.sai-panel{width:100vw;border-left:0;}.sai-ball{right:16px;bottom:16px;}',
    '.sai-sess-acts{opacity:1;}.sai-msgs{padding-bottom:16px;}}'
  ].join('');

  var state = {
    built: false,
    mounted: false,
    open: false,
    loaded: false,
    loading: false,
    sending: false,
    providers: [],
    activeId: '',
    sessions: [],
    sessionId: null,
    messages: [],
    projects: [],
    projectIds: [],
    page: 'chat',
    settingsProviderId: '',
    markmapText: '',
    markmapPromise: null,
    keyHintShown: false
  };

  var refs = {};

  // ------------------------------------------------------------ DOM 工具

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) {
      node.className = cls;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function button(cls, text, title) {
    var node = make('button', cls, text);
    node.type = 'button';
    if (title) {
      node.title = title;
    }
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function show(node, visible) {
    if (!node) {
      return;
    }
    if (visible) {
      node.classList.remove('sai-hidden');
    } else {
      node.classList.add('sai-hidden');
    }
  }

  function findProvider(id) {
    for (var i = 0; i < state.providers.length; i += 1) {
      if (state.providers[i].id === id) {
        return state.providers[i];
      }
    }
    return null;
  }

  function findProject(id) {
    for (var i = 0; i < state.projects.length; i += 1) {
      if (state.projects[i].id === id) {
        return state.projects[i];
      }
    }
    return null;
  }

  function activeProvider() {
    var item = findProvider(state.activeId);
    if (item) {
      return item;
    }
    for (var i = 0; i < state.providers.length; i += 1) {
      if (state.providers[i].isDefault) {
        return state.providers[i];
      }
    }
    return state.providers.length ? state.providers[0] : null;
  }

  function setStatus(text, isError) {
    if (!refs.status) {
      return;
    }
    refs.status.textContent = text || '';
    if (isError) {
      refs.status.classList.add('sai-status-err');
    } else {
      refs.status.classList.remove('sai-status-err');
    }
  }

  function setCfgStatus(text, isError) {
    if (!refs.cfgStatus) {
      return;
    }
    refs.cfgStatus.textContent = text || '';
    if (isError) {
      refs.cfgStatus.classList.add('sai-status-err');
    } else {
      refs.cfgStatus.classList.remove('sai-status-err');
    }
  }

  function setMapStatus(text, isError) {
    if (!refs.mapStatus) {
      return;
    }
    refs.mapStatus.textContent = text || '';
    if (isError) {
      refs.mapStatus.classList.add('sai-status-err');
    } else {
      refs.mapStatus.classList.remove('sai-status-err');
    }
  }

  function friendlyError(err) {
    if (err && err.message) {
      return String(err.message);
    }
    return '请求失败，请稍后再试';
  }

  function handleError(err) {
    if (err && err.unauthorized) {
      setStatus('登录已过期，请刷新页面重新登录', true);
      return;
    }
    setStatus(friendlyError(err), true);
  }

  function scrollBottom() {
    if (refs.msgs) {
      refs.msgs.scrollTop = refs.msgs.scrollHeight;
    }
  }

  // ------------------------------------------------------------ 请求

  function request(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(AI_API + path, init).then(function (resp) {
      return resp.json().catch(function () {
        return {};
      }).then(function (data) {
        if (resp.status === 401) {
          var authErr = new Error('登录已过期，请刷新页面重新登录');
          authErr.unauthorized = true;
          throw authErr;
        }
        if (!resp.ok || (data && data.ok === false)) {
          var message = data && (data.error || data.detail);
          throw new Error(message ? String(message) : '请求失败（HTTP ' + resp.status + '）');
        }
        return data || {};
      });
    }, function () {
      throw new Error('网络连不上服务器，请检查网络后重试');
    });
  }

  function fetchProjects() {
    return fetch(PROJECT_API, { credentials: 'same-origin' }).then(function (resp) {
      if (resp.status === 401) {
        var authErr = new Error('登录已过期，请刷新页面重新登录');
        authErr.unauthorized = true;
        throw authErr;
      }
      return resp.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!resp.ok) {
          throw new Error('项目列表加载失败（HTTP ' + resp.status + '）');
        }
        return data || {};
      });
    });
  }

  function normalizeProjects(data) {
    var list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (data && Array.isArray(data.projects)) {
      list = data.projects;
    } else if (data && Array.isArray(data.items)) {
      list = data.items;
    }
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item || typeof item !== 'object') {
        continue;
      }
      var id = item.id || item.projectId || item.slug;
      if (!id) {
        continue;
      }
      out.push({
        id: String(id),
        name: String(item.name || item.title || id),
        type: String(item.type || item.kind || '')
      });
    }
    return out;
  }

  // ------------------------------------------------------------ 数据加载

  function refreshProviders() {
    return request('/providers').then(function (data) {
      state.providers = Array.isArray(data.providers) ? data.providers : [];
      state.activeId = String(data.activeId || '');
      updateHeader();
      if (state.page === 'settings') {
        renderSettings();
      }
      var hasKey = false;
      for (var i = 0; i < state.providers.length; i += 1) {
        if (state.providers[i].hasKey) {
          hasKey = true;
          break;
        }
      }
      if (!hasKey && !state.keyHintShown) {
        state.keyHintShown = true;
        appendNote('还没配置 AI Key：点右上角「设置」填一个（DeepSeek / OpenAI / Moonshot），聊天和思维导图才能用。');
      }
    });
  }

  function refreshSessions() {
    return request('/sessions').then(function (data) {
      state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      if (state.sessionId) {
        var stillThere = false;
        for (var i = 0; i < state.sessions.length; i += 1) {
          if (state.sessions[i].id === state.sessionId) {
            stillThere = true;
            break;
          }
        }
        if (!stillThere) {
          state.sessionId = null;
        }
      }
      renderSessions();
    });
  }

  function refreshProjects() {
    return fetchProjects().then(function (data) {
      state.projects = normalizeProjects(data);
      renderProjectChips();
      renderProjectPicker();
    }).catch(function (err) {
      if (err && err.unauthorized) {
        handleError(err);
      }
      if (refs.picker) {
        clear(refs.picker);
        refs.pickerNote = make('div', 'sai-picker-note', '项目列表加载失败，点「刷新」重试。');
        refs.picker.appendChild(refs.pickerNote);
      }
    });
  }

  function ensureLoaded() {
    if (state.loading) {
      return state.promise || Promise.resolve();
    }
    if (state.loaded) {
      return Promise.resolve();
    }
    state.loading = true;
    state.promise = Promise.all([
      refreshProviders(),
      refreshSessions(),
      refreshProjects()
    ]).then(function () {
      if (!state.sessionId && state.sessions.length) {
        return selectSession(state.sessions[0].id);
      }
      renderMessages();
      return null;
    }).catch(function (err) {
      handleError(err);
    }).then(function () {
      state.loading = false;
      state.loaded = true;
    });
    return state.promise;
  }

  // ------------------------------------------------------------ 渲染

  function updateHeader() {
    if (!refs.sub) {
      return;
    }
    var item = activeProvider();
    if (!item) {
      refs.sub.textContent = '未配置服务商';
      return;
    }
    refs.sub.textContent = item.label + ' · ' + (item.model || '未设置模型');
  }

  function renderSessions() {
    if (!refs.sessions) {
      return;
    }
    clear(refs.sessions);
    if (!state.sessions.length) {
      refs.sessions.appendChild(make('div', 'sai-picker-note', '还没有会话，点右上角「新会话」。'));
      return;
    }
    for (var i = 0; i < state.sessions.length; i += 1) {
      (function (session) {
        var row = make('div', 'sai-sess');
        if (session.id === state.sessionId) {
          row.classList.add('sai-sess-on');
        }
        var title = make('span', 'sai-sess-title', session.title || NEW_SESSION_TITLE);
        title.title = session.title || NEW_SESSION_TITLE;
        var acts = make('div', 'sai-sess-acts');
        var renameBtn = button('sai-mini', '改', '重命名会话');
        var deleteBtn = button('sai-mini sai-mini-danger', '删', '删除会话');
        renameBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          renameSession(session);
        });
        deleteBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          deleteSession(session);
        });
        acts.appendChild(renameBtn);
        acts.appendChild(deleteBtn);
        row.appendChild(title);
        row.appendChild(acts);
        row.addEventListener('click', function () {
          if (session.id !== state.sessionId) {
            selectSession(session.id);
          }
        });
        refs.sessions.appendChild(row);
      }(state.sessions[i]));
    }
  }

  function addMessageNode(message) {
    var row = make('div', 'sai-msg ' + (message.role === 'user' ? 'sai-user' : 'sai-bot'));
    row.appendChild(make('div', 'sai-who', message.role === 'user' ? '我' : 'AI'));
    var bubble = make('div', 'sai-bubble', message.content || '');
    row.appendChild(bubble);
    refs.msgs.appendChild(row);
    return row;
  }

  function renderMessages() {
    if (!refs.msgs) {
      return;
    }
    clear(refs.msgs);
    if (!state.messages.length) {
      refs.msgs.appendChild(make('div', 'sai-empty', '选个项目，聊点什么。\n（Enter 发送，Shift+Enter 换行）'));
      return;
    }
    for (var i = 0; i < state.messages.length; i += 1) {
      addMessageNode(state.messages[i]);
    }
    scrollBottom();
  }

  function appendMessage(message) {
    var placeholder = refs.msgs.querySelector('.sai-empty');
    if (placeholder) {
      placeholder.parentNode.removeChild(placeholder);
    }
    state.messages.push(message);
    addMessageNode(message);
    scrollBottom();
  }

  function appendNote(text, isError) {
    if (!refs.msgs) {
      return;
    }
    var placeholder = refs.msgs.querySelector('.sai-empty');
    if (placeholder) {
      placeholder.parentNode.removeChild(placeholder);
    }
    var note = make('div', 'sai-note' + (isError ? ' sai-note-err' : ''), text);
    refs.msgs.appendChild(note);
    scrollBottom();
  }

  function appendPending() {
    var row = make('div', 'sai-msg sai-bot sai-pending');
    row.appendChild(make('div', 'sai-who', 'AI'));
    row.appendChild(make('div', 'sai-bubble', '正在思考…'));
    refs.msgs.appendChild(row);
    scrollBottom();
    return row;
  }

  function renderProjectChips() {
    if (!refs.chips) {
      return;
    }
    clear(refs.chips);
    if (!state.projectIds.length) {
      refs.chips.appendChild(make('span', 'sai-hint', '未附加项目（AI 只能读你选中的项目）'));
      return;
    }
    for (var i = 0; i < state.projectIds.length; i += 1) {
      (function (pid) {
        var project = findProject(pid);
        var chip = make('span', 'sai-chip');
        var name = make('span', 'sai-chip-name', project ? project.name : pid);
        var removeBtn = button('sai-chip-x', '×', '移除这个项目');
        removeBtn.setAttribute('aria-label', '移除项目 ' + (project ? project.name : pid));
        removeBtn.addEventListener('click', function () {
          toggleProject(pid, false);
        });
        chip.appendChild(name);
        chip.appendChild(removeBtn);
        refs.chips.appendChild(chip);
      }(state.projectIds[i]));
    }
  }

  function renderProjectPicker() {
    if (!refs.picker) {
      return;
    }
    clear(refs.picker);
    refs.pickerNote = null;
    if (!state.projects.length) {
      refs.pickerNote = make('div', 'sai-picker-note', '还没有项目，先在主界面新建一个项目。');
      refs.picker.appendChild(refs.pickerNote);
      return;
    }
    for (var i = 0; i < state.projects.length; i += 1) {
      (function (project) {
        var row = make('label', 'sai-pick-row');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = state.projectIds.indexOf(project.id) !== -1;
        box.addEventListener('change', function () {
          toggleProject(project.id, box.checked);
        });
        var name = make('span', 'sai-pick-name', project.name);
        var type = make('span', 'sai-pick-type', project.type || '');
        row.appendChild(box);
        row.appendChild(name);
        row.appendChild(type);
        refs.picker.appendChild(row);
      }(state.projects[i]));
    }
  }

  function renderSettings() {
    if (!refs.providerList) {
      return;
    }
    clear(refs.providerList);
    if (!state.providers.length) {
      refs.providerList.appendChild(make('div', 'sai-picker-note', '服务商列表加载失败，请点「刷新」重试。'));
      return;
    }
    if (!findProvider(state.settingsProviderId)) {
      var current = activeProvider();
      state.settingsProviderId = current ? current.id : state.providers[0].id;
    }
    for (var i = 0; i < state.providers.length; i += 1) {
      (function (provider) {
        var row = make('button', 'sai-provider' + (provider.id === state.settingsProviderId ? ' sai-provider-on' : ''));
        row.type = 'button';
        var top = make('div', 'sai-provider-top');
        top.appendChild(make('span', '', provider.label || provider.id));
        top.appendChild(make('span', 'sai-badge ' + (provider.hasKey ? 'sai-badge-ok' : 'sai-badge-no'),
          provider.hasKey ? '已配置 Key' : '未配置 Key'));
        if (provider.isDefault) {
          top.appendChild(make('span', 'sai-badge sai-badge-def', '默认'));
        }
        var sub = make('div', 'sai-provider-sub', (provider.model || '未设置模型') + ' · ' + (provider.baseUrl || ''));
        row.appendChild(top);
        row.appendChild(sub);
        row.addEventListener('click', function () {
          selectSettingsProvider(provider.id);
        });
        refs.providerList.appendChild(row);
      }(state.providers[i]));
    }
    var editing = findProvider(state.settingsProviderId);
    if (editing) {
      refs.fBase.value = editing.baseUrl || '';
      refs.fModel.value = editing.model || '';
      refs.fKey.value = '';
      refs.fKey.placeholder = editing.hasKey ? '已配置（留空则不修改）' : '填写 API Key';
      refs.fDefault.checked = !!editing.isDefault;
    }
  }

  // ------------------------------------------------------------ 动作

  function selectSettingsProvider(providerId) {
    state.settingsProviderId = providerId;
    renderSettings();
    setCfgStatus('');
  }

  function toggleProject(projectId, enabled) {
    var index = state.projectIds.indexOf(projectId);
    if (enabled && index === -1) {
      state.projectIds.push(projectId);
    } else if (!enabled && index !== -1) {
      state.projectIds.splice(index, 1);
    }
    renderProjectChips();
    renderProjectPicker();
    if (state.sessionId) {
      request('/sessions/' + encodeURIComponent(state.sessionId), {
        method: 'PATCH',
        body: { projectIds: state.projectIds.slice() }
      }).catch(function (err) {
        handleError(err);
      });
    }
  }

  function createSession() {
    return request('/sessions', {
      method: 'POST',
      body: { projectIds: state.projectIds.slice() }
    }).then(function (data) {
      var session = data.session || {};
      if (!session.id) {
        throw new Error('新建会话失败');
      }
      state.sessionId = String(session.id);
      state.messages = [];
      state.sessions.unshift({
        id: session.id,
        title: session.title || NEW_SESSION_TITLE,
        projectIds: session.projectIds || state.projectIds.slice(),
        createdAt: session.createdAt || 0,
        updatedAt: session.updatedAt || 0,
        messageCount: 0
      });
      renderSessions();
      renderMessages();
      setStatus('');
      setPage('chat');
      if (refs.input) {
        refs.input.focus();
      }
      return session;
    }).catch(function (err) {
      handleError(err);
      return null;
    });
  }

  function selectSession(sessionId) {
    state.sessionId = String(sessionId);
    renderSessions();
    return request('/sessions/' + encodeURIComponent(sessionId)).then(function (data) {
      var session = data.session || {};
      state.messages = Array.isArray(data.messages) ? data.messages : [];
      if (Array.isArray(session.projectIds)) {
        state.projectIds = session.projectIds.slice();
        renderProjectChips();
        renderProjectPicker();
      }
      renderMessages();
      setStatus('');
      setPage('chat');
    }).catch(function (err) {
      handleError(err);
    });
  }

  function renameSession(session) {
    var next = window.prompt('会话名称', session.title || NEW_SESSION_TITLE);
    if (next === null) {
      return;
    }
    var title = String(next).trim();
    if (!title) {
      return;
    }
    request('/sessions/' + encodeURIComponent(session.id), {
      method: 'PATCH',
      body: { title: title }
    }).then(function () {
      return refreshSessions();
    }).catch(function (err) {
      handleError(err);
    });
  }

  function deleteSession(session) {
    if (!window.confirm('删除会话「' + (session.title || NEW_SESSION_TITLE) + '」？消息会一起删除。')) {
      return;
    }
    request('/sessions/' + encodeURIComponent(session.id), { method: 'DELETE' }).then(function () {
      if (state.sessionId === session.id) {
        state.sessionId = null;
        state.messages = [];
        renderMessages();
      }
      return refreshSessions().then(function () {
        if (!state.sessionId && state.sessions.length) {
          return selectSession(state.sessions[0].id);
        }
        return null;
      });
    }).catch(function (err) {
      handleError(err);
    });
  }

  function sendMessage() {
    if (state.sending) {
      return;
    }
    var text = (refs.input.value || '').trim();
    if (!text) {
      return;
    }
    var start = state.sessionId
      ? Promise.resolve()
      : createSession().then(function (session) {
        return session && state.sessionId ? null : Promise.reject(new Error('会话创建失败'));
      });
    start.then(function () {
      if (!state.sessionId) {
        return null;
      }
      state.sending = true;
      refs.send.disabled = true;
      refs.send.textContent = '发送中…';
      refs.input.value = '';
      setStatus('');
      appendMessage({ role: 'user', content: text, createdAt: Date.now() / 1000 });
      var pending = appendPending();
      return request('/chat', {
        method: 'POST',
        body: {
          sessionId: state.sessionId,
          message: text,
          projectIds: state.projectIds.slice()
        }
      }).then(function (data) {
        if (pending.parentNode) {
          pending.parentNode.removeChild(pending);
        }
        appendMessage({
          role: 'assistant',
          content: String(data.reply || ''),
          createdAt: Date.now() / 1000
        });
        if (data.session && data.session.title) {
          refreshSessions().catch(function () {});
        }
      }).catch(function (err) {
        if (pending.parentNode) {
          pending.parentNode.removeChild(pending);
        }
        appendNote(friendlyError(err), true);
        if (err && err.unauthorized) {
          handleError(err);
        }
      });
    }).catch(function (err) {
      appendNote(friendlyError(err), true);
    }).then(function () {
      state.sending = false;
      refs.send.disabled = false;
      refs.send.textContent = '发送';
    });
  }

  // ------------------------------------------------------------ 思维导图

  function loadMarkmap() {
    if (window.markmap && window.markmap.autoLoader) {
      return Promise.resolve(true);
    }
    if (state.markmapPromise) {
      return state.markmapPromise;
    }
    state.markmapPromise = new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) {
          return;
        }
        settled = true;
        resolve(!!(window.markmap && window.markmap.autoLoader));
      }
      var script = document.createElement('script');
      script.src = MARKMAP_CDN;
      script.async = true;
      script.onload = finish;
      script.onerror = finish;
      document.head.appendChild(script);
      window.setTimeout(finish, 8000);
    }).then(function (ok) {
      if (!ok) {
        state.markmapPromise = null;
      }
      return ok;
    });
    return state.markmapPromise;
  }

  function renderMarkmap(container, markdown) {
    return loadMarkmap().then(function (loaded) {
      clear(container);
      if (loaded) {
        var wrap = make('div', 'markmap');
        var template = document.createElement('script');
        template.type = 'text/template';
        template.textContent = markdown;
        wrap.appendChild(template);
        container.appendChild(wrap);
        var rendered = false;
        try {
          window.markmap.autoLoader.renderAll();
          rendered = true;
        } catch (err) {
          rendered = false;
        }
        if (rendered) {
          return new Promise(function (resolve) {
            window.setTimeout(function () {
              if (wrap.querySelector('svg')) {
                resolve(true);
                return;
              }
              clear(container);
              container.appendChild(make('pre', 'sai-markdown', markdown));
              resolve(false);
            }, 700);
          });
        }
      }
      clear(container);
      container.appendChild(make('pre', 'sai-markdown', markdown));
      return false;
    });
  }

  function generateMap() {
    if (!state.sessionId) {
      setStatus('先建个会话并聊几句，再生成思维导图');
      return;
    }
    setPage('map');
    state.markmapText = '';
    clear(refs.mapBody);
    refs.mapBody.appendChild(make('div', 'sai-picker-note', '正在生成思维导图…'));
    setMapStatus('正在让 AI 整理当前会话…');
    request('/mindmap', {
      method: 'POST',
      body: { sessionId: state.sessionId }
    }).then(function (data) {
      state.markmapText = String(data.markmap || '');
      if (!state.markmapText) {
        throw new Error('AI 没有返回导图内容，请重试');
      }
      return renderMarkmap(refs.mapBody, state.markmapText).then(function (rendered) {
        if (rendered) {
          setMapStatus('拖动可平移，滚轮缩放；点「复制」拿 Markdown 原文');
        } else {
          setMapStatus('markmap 加载失败，已退化为 Markdown 原文（可复制）');
        }
      });
    }).catch(function (err) {
      clear(refs.mapBody);
      refs.mapBody.appendChild(make('div', 'sai-picker-note', friendlyError(err)));
      setMapStatus(friendlyError(err), true);
      if (err && err.unauthorized) {
        handleError(err);
      }
    });
  }

  function copyMarkdown() {
    var text = state.markmapText || '';
    if (!text) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setMapStatus('已复制 Markdown');
      }).catch(function () {
        setMapStatus('复制失败，请手动选中文本复制', true);
      });
      return;
    }
    setMapStatus('当前浏览器不支持自动复制，请手动选中文本复制');
  }

  // ------------------------------------------------------------ 服务商设置

  function saveProviderAndTest() {
    var providerId = state.settingsProviderId;
    if (!providerId) {
      setCfgStatus('先选择一个服务商', true);
      return;
    }
    var payload = {
      id: providerId,
      baseUrl: (refs.fBase.value || '').trim(),
      model: (refs.fModel.value || '').trim(),
      isDefault: !!refs.fDefault.checked
    };
    var key = (refs.fKey.value || '').trim();
    if (key) {
      payload.apiKey = key;
    }
    refs.fKey.value = '';
    setCfgStatus('保存中…');
    request('/providers', { method: 'POST', body: payload }).then(function (data) {
      state.providers = Array.isArray(data.providers) ? data.providers : state.providers;
      state.activeId = String(data.activeId || state.activeId);
      updateHeader();
      renderSettings();
      setCfgStatus('已保存，正在测试连接…');
      return request('/providers/' + encodeURIComponent(providerId) + '/test', { method: 'POST' })
        .then(function (result) {
          setCfgStatus(result.message || '连接正常');
        }).catch(function (err) {
          setCfgStatus('已保存，但测试失败：' + friendlyError(err), true);
          if (err && err.unauthorized) {
            handleError(err);
          }
        });
    }).catch(function (err) {
      setCfgStatus(friendlyError(err), true);
      if (err && err.unauthorized) {
        handleError(err);
      }
    });
  }

  // ------------------------------------------------------------ 页面切换

  function setPage(page) {
    state.page = page;
    show(refs.chat, page === 'chat');
    show(refs.mapPage, page === 'map');
    show(refs.cfgPage, page === 'settings');
    if (page === 'settings') {
      renderSettings();
    }
    if (page === 'chat') {
      setStatus('');
    }
  }

  // ------------------------------------------------------------ 构建 DOM

  function ensureBuilt() {
    if (state.built) {
      return true;
    }
    if (!document.body) {
      return false;
    }
    if (!document.getElementById('sai-style')) {
      var style = document.createElement('style');
      style.id = 'sai-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    var root = make('div', 'sai-root sai-away');
    root.id = 'studio-ai-root';

    // 小球
    var ball = button('sai-ball', '🐋', '打开 AI 助手');
    ball.setAttribute('aria-label', '打开 AI 助手');
    ball.addEventListener('click', function () {
      if (state.open) {
        closePanel();
      } else {
        openPanel();
      }
    });

    // 面板
    var panel = make('aside', 'sai-panel');
    panel.setAttribute('aria-hidden', 'true');

    var head = make('div', 'sai-head');
    var titles = make('div', 'sai-titles');
    var title = make('div', 'sai-title', 'AI 助手');
    var sub = make('div', 'sai-sub', '正在加载…');
    titles.appendChild(title);
    titles.appendChild(sub);
    var headActs = make('div', 'sai-head-acts');
    var btnNew = button('sai-icon-btn', '新会话', '新建会话');
    var btnMap = button('sai-icon-btn', '导图', '把当前会话生成思维导图');
    var btnCfg = button('sai-icon-btn', '设置', 'AI 服务商设置');
    var btnClose = button('sai-icon-btn', '收起', '收起面板');
    headActs.appendChild(btnNew);
    headActs.appendChild(btnMap);
    headActs.appendChild(btnCfg);
    headActs.appendChild(btnClose);
    head.appendChild(titles);
    head.appendChild(headActs);

    // 会话列表
    var sessionsSec = make('div', 'sai-sec');
    var sessionsHead = make('div', 'sai-sec-head');
    sessionsHead.appendChild(make('span', 'sai-sec-title', '会话'));
    var btnRefresh = button('sai-link-btn', '刷新', '重新加载服务商、会话和项目');
    sessionsHead.appendChild(btnRefresh);
    var sessions = make('div', 'sai-sessions');
    sessionsSec.appendChild(sessionsHead);
    sessionsSec.appendChild(sessions);

    // 附加项目
    var projectSec = make('div', 'sai-sec');
    var projectHead = make('div', 'sai-sec-head');
    projectHead.appendChild(make('span', 'sai-sec-title', '附加项目'));
    var btnPick = button('sai-link-btn', '选择', '选择要附加给 AI 的项目');
    projectHead.appendChild(btnPick);
    var chips = make('div', 'sai-chips');
    var picker = make('div', 'sai-picker sai-hidden');
    projectSec.appendChild(projectHead);
    projectSec.appendChild(chips);
    projectSec.appendChild(picker);

    // 消息区
    var msgs = make('div', 'sai-msgs');
    msgs.setAttribute('role', 'log');
    msgs.setAttribute('aria-live', 'polite');

    // 输入区
    var compose = make('div', 'sai-compose');
    var status = make('div', 'sai-status');
    status.setAttribute('aria-live', 'polite');
    var input = document.createElement('textarea');
    input.className = 'sai-input';
    input.rows = 1;
    input.placeholder = '说点什么…（Enter 发送，Shift+Enter 换行）';
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        sendMessage();
      }
    });
    var sendRow = make('div', 'sai-send-row');
    var sendBtn = button('sai-send', '发送');
    sendRow.appendChild(sendBtn);
    compose.appendChild(status);
    compose.appendChild(input);
    compose.appendChild(sendRow);

    var chat = make('div', 'sai-chat');
    chat.appendChild(sessionsSec);
    chat.appendChild(projectSec);
    chat.appendChild(msgs);
    chat.appendChild(compose);

    // 导图页
    var mapPage = make('div', 'sai-page sai-hidden');
    var mapHead = make('div', 'sai-page-head');
    var mapBack = button('sai-link-btn', '← 返回');
    var mapTitle = make('span', 'sai-page-title', '思维导图');
    var mapCopy = button('sai-link-btn', '复制 Markdown');
    mapHead.appendChild(mapBack);
    mapHead.appendChild(mapTitle);
    mapHead.appendChild(mapCopy);
    var mapStatus = make('div', 'sai-page-status');
    var mapBody = make('div', 'sai-map-body');
    mapPage.appendChild(mapHead);
    mapPage.appendChild(mapStatus);
    mapPage.appendChild(mapBody);

    // 设置页
    var cfgPage = make('div', 'sai-page sai-hidden');
    var cfgHead = make('div', 'sai-page-head');
    var cfgBack = button('sai-link-btn', '← 返回');
    var cfgTitle = make('span', 'sai-page-title', 'AI 设置');
    cfgHead.appendChild(cfgBack);
    cfgHead.appendChild(cfgTitle);
    var cfgBody = make('div', 'sai-cfg-body');
    var providerList = make('div', 'sai-provider-list');
    var form = make('div', 'sai-form');
    var baseLabel = make('label', 'sai-label', '接口地址');
    var fBase = document.createElement('input');
    fBase.className = 'sai-field';
    fBase.type = 'url';
    fBase.placeholder = 'https://api.deepseek.com/v1';
    baseLabel.appendChild(fBase);
    var modelLabel = make('label', 'sai-label', '模型名称');
    var fModel = document.createElement('input');
    fModel.className = 'sai-field';
    fModel.type = 'text';
    fModel.placeholder = 'deepseek-chat';
    modelLabel.appendChild(fModel);
    var keyLabel = make('label', 'sai-label', 'API Key（只存服务端，不会回显）');
    var fKey = document.createElement('input');
    fKey.className = 'sai-field';
    fKey.type = 'password';
    fKey.autocomplete = 'off';
    keyLabel.appendChild(fKey);
    var fDefaultWrap = make('label', 'sai-check');
    var fDefault = document.createElement('input');
    fDefault.type = 'checkbox';
    fDefaultWrap.appendChild(fDefault);
    fDefaultWrap.appendChild(make('span', '', '设为默认服务商'));
    var saveBtn = button('sai-primary', '保存并测试');
    var cfgStatus = make('div', 'sai-status');
    var cfgHint = make('div', 'sai-hint',
      'Key 只保存在服务器数据库里；也可以用服务器环境变量 studio_ai_key 提供。' +
      'OpenAI 兼容接口：地址填到 /v1 为止。');
    form.appendChild(baseLabel);
    form.appendChild(modelLabel);
    form.appendChild(keyLabel);
    form.appendChild(fDefaultWrap);
    form.appendChild(saveBtn);
    form.appendChild(cfgStatus);
    form.appendChild(cfgHint);
    cfgBody.appendChild(providerList);
    cfgBody.appendChild(form);
    cfgPage.appendChild(cfgHead);
    cfgPage.appendChild(cfgBody);

    panel.appendChild(head);
    panel.appendChild(chat);
    panel.appendChild(mapPage);
    panel.appendChild(cfgPage);
    root.appendChild(ball);
    root.appendChild(panel);
    document.body.appendChild(root);

    refs.root = root;
    refs.ball = ball;
    refs.panel = panel;
    refs.sub = sub;
    refs.sessions = sessions;
    refs.chips = chips;
    refs.picker = picker;
    refs.msgs = msgs;
    refs.status = status;
    refs.input = input;
    refs.send = sendBtn;
    refs.chat = chat;
    refs.mapPage = mapPage;
    refs.mapBody = mapBody;
    refs.mapStatus = mapStatus;
    refs.cfgPage = cfgPage;
    refs.providerList = providerList;
    refs.cfgStatus = cfgStatus;
    refs.fBase = fBase;
    refs.fModel = fModel;
    refs.fKey = fKey;
    refs.fDefault = fDefault;

    // 事件
    btnNew.addEventListener('click', function () {
      createSession();
    });
    btnMap.addEventListener('click', function () {
      generateMap();
    });
    btnCfg.addEventListener('click', function () {
      setPage('settings');
    });
    btnClose.addEventListener('click', closePanel);
    btnRefresh.addEventListener('click', function () {
      state.loaded = false;
      setStatus('正在刷新…');
      Promise.all([refreshProviders(), refreshSessions(), refreshProjects()]).then(function () {
        setStatus('');
      }).catch(function (err) {
        handleError(err);
      });
    });
    btnPick.addEventListener('click', function () {
      picker.classList.toggle('sai-hidden');
    });
    sendBtn.addEventListener('click', sendMessage);
    mapBack.addEventListener('click', function () {
      setPage('chat');
    });
    mapCopy.addEventListener('click', copyMarkdown);
    cfgBack.addEventListener('click', function () {
      setPage('chat');
    });
    saveBtn.addEventListener('click', saveProviderAndTest);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.open) {
        closePanel();
      }
    });

    renderMessages();
    state.built = true;
    return true;
  }

  // ------------------------------------------------------------ 对外接口

  function mount(target) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () {
        mount(target);
      });
      return window.StudioAI;
    }
    if (!ensureBuilt()) {
      return window.StudioAI;
    }
    var host = target && target.nodeType === 1 ? target : document.body;
    if (refs.root.parentNode !== host) {
      host.appendChild(refs.root);
    }
    refs.root.classList.remove('sai-away');
    state.mounted = true;
    return window.StudioAI;
  }

  function openPanel() {
    if (!mount(document.body)) {
      return;
    }
    state.open = true;
    refs.root.classList.add('sai-open');
    refs.panel.setAttribute('aria-hidden', 'false');
    setPage('chat');
    ensureLoaded();
    window.setTimeout(function () {
      if (refs.input) {
        refs.input.focus();
      }
    }, 80);
  }

  function closePanel() {
    state.open = false;
    if (refs.root) {
      refs.root.classList.remove('sai-open');
      refs.panel.setAttribute('aria-hidden', 'true');
    }
  }

  window.StudioAI = {
    mount: mount,
    open: openPanel,
    close: closePanel
  };

  // 页面就绪后先把 DOM 挂好（小球暂时隐藏，避免出现在登录页）；
  // app.js 登录成功后调用 mount() 才显示小球。
  function autoAttach() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', autoAttach);
      return;
    }
    if (!ensureBuilt()) {
      return;
    }
    if (refs.root.parentNode !== document.body) {
      document.body.appendChild(refs.root);
    }
  }

  autoAttach();
}());
