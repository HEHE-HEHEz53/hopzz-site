/* 测试桩：模拟后端接口，记录所有 fetch 调用 */
(function () {
  'use strict';
  window.__calls = [];
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push('ERROR ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    var text = reason && (reason.stack || reason.message) ? (reason.stack || reason.message) : String(reason);
    window.__errors.push('REJECT ' + text);
  });

  var MODULES = {
    ok: true,
    modules: {
      meta: { label: '基本信息', types: ['*'], fields: [{ key: 'status', label: '状态', type: 'select', options: [{ value: '构思', label: '构思' }] }, { key: 'progress', label: '进度', type: 'number' }] },
      audio: { label: '编曲参数', types: ['music'], fields: [{ key: 'bpm', label: 'BPM', type: 'number' }] },
      lyrics: { label: '歌词', types: ['music', 'lyrics'], fields: [{ key: 'lyrics', label: '歌词正文', type: 'textarea', rows: 14, mono: true }] },
      chords: { label: '和弦进行', types: ['music'], fields: [{ key: 'chords', label: '和弦', type: 'textarea' }] },
      sections: { label: '片段 / 段落', types: ['music', 'video', 'story'], fields: [] },
      shots: { label: '镜头标记', types: ['video'], fields: [] },
      script: { label: '分镜脚本', types: ['video'], fields: [] },
      palette: { label: '配色', types: ['art', 'oc'], fields: [] },
      outline: { label: '大纲', types: ['story', 'world'], fields: [] },
      characters: { label: '角色', types: ['story', 'world', 'oc'], fields: [] },
      worldbuilding: { label: '世界观设定', types: ['world'], fields: [] },
      timeline: { label: '时间线', types: ['story', 'world'], fields: [] },
      code: { label: '代码片段', types: ['code'], fields: [] },
      notes: { label: '笔记', types: ['*'], fields: [] },
      references: { label: '参考资料', types: ['*'], fields: [] }
    },
    defaults: {
      music: ['meta', 'audio', 'lyrics', 'chords', 'sections'],
      lyrics: ['meta', 'lyrics'],
      art: ['meta', 'palette'],
      code: ['meta', 'code'],
      video: ['meta', 'sections', 'shots', 'script'],
      story: ['meta', 'outline', 'sections', 'characters'],
      world: ['meta', 'outline', 'worldbuilding', 'characters', 'timeline'],
      oc: ['meta', 'palette', 'characters'],
      other: ['meta', 'notes']
    }
  };

  function jsonResponse(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  window.fetch = function (url, init) {
    var method = (init && init.method) || 'GET';
    var body = init && init.body ? String(init.body) : '';
    window.__calls.push(method + ' ' + url + (body ? ' BODY=' + body : ''));
    var u = String(url);
    if (u.indexOf('/api/setup-state') === 0) return jsonResponse({ ok: true, needsSetup: false });
    if (u.indexOf('/api/me') === 0) return jsonResponse({ ok: true, authed: true });
    if (u.indexOf('/api/modules') === 0) return jsonResponse(MODULES);
    if (u.indexOf('/api/projects') === 0 && method === 'GET') return jsonResponse({ ok: true, projects: [] });
    if (u.indexOf('/api/projects') === 0 && method === 'POST') {
      var payload;
      try { payload = JSON.parse(body); } catch (e) { payload = { __parseError: body }; }
      return jsonResponse({
        ok: true,
        project: {
          id: 'p-20261108-probe',
          name: payload.name || '',
          type: payload.type || 'other',
          createdAt: '2026-11-08T09:00:00Z',
          updatedAt: '2026-11-08T09:00:00Z',
          tags: payload.tags || [],
          summary: '',
          modules: payload.modules || ['meta'],
          fields: {},
          sections: []
        }
      });
    }
    return jsonResponse({ ok: true });
  };
})();
