/**
 * dsh-web-relay —— 把 DSH Harness 搬到你手机上
 * ============================================
 *
 * 和上一版的区别：这一版**不再自建会话**，而是直接读写 DSH Harness 自己
 * 的会话存储 —— 手机上看到的就是电脑上真实的项目、会话、历史记录。
 *
 * 用到的 Harness 服务：
 *   sessionController  : list() 真实会话列表 / page() 历史 / prompt() 发消息 / inspect()
 *   workspaceRegistry  : 工作区（项目）
 *   agentPresets       : 模式（preset）
 *   sessionController.modelCatalog() : 模型
 *   pluginManager      : 已安装插件
 *
 * 通信是「插件主动外连」，家里不需要公网 IP。
 */

import Schema from '@deepseek-ai/schemastery';

export const name = 'web-relay';

const VERSION = '2.2.0';
const TAG = `[web-relay@${VERSION}]`;

export const Config = Schema.object({
  connectString: Schema.string()
    .default('')
    .description(
      '连接字符串：在网页「设置 → 连接参数」里复制那一大串粘到这里即可；填了它就不必再填下面的分项'
    ),
  serverUrl: Schema.string()
    .default('wss://ai.hopzz.top/agent-ws')
    .description('中继服务器地址（WebSocket）'),
  agentToken: Schema.string().default('').description('插件令牌（在网页设置里能看到）'),
  maxReconnectMs: Schema.natural().default(30000).description('断线重连最大间隔（毫秒）'),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function apply(ctx, config) {
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  let socket = null;
  let stopped = false;
  let attempts = 0;
  let reconnectTimer = null;
  let pingTimer = null;

  // ------------------------------------------------------------ 服务访问
  function svc(name) {
    try {
      return ctx.get(name);
    } catch {
      return undefined;
    }
  }

  function blocksText(content) {
    if (!Array.isArray(content)) return '';
    const parts = [];
    for (const b of content) {
      if (b && b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    }
    return parts.join('\n').trim();
  }

  // ------------------------------------------------------------ 会话列表
  function pickTitle(summary) {
    const v = summary?.projections?.values ?? {};
    const keys = ['title', 'session/title', 'conversation/title', 'sessionTitle'];
    for (const k of keys) {
      const val = v[k];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return '';
  }

  async function readWorkspaces() {
    const registry = svc('workspaceRegistry');
    if (!registry) return [];
    try {
      const list = registry.list() ?? [];
      return list.map((w) => ({
        id: String(w.id ?? ''),
        title: String(w.title ?? w.name ?? w.path ?? '未命名项目'),
        path: String(w.path ?? w.directory ?? ''),
      }));
    } catch (err) {
      warn('workspaceRegistry 读取失败:', err?.message ?? err);
      return [];
    }
  }

  function workspaceFor(cwd, workspaces) {
    if (!cwd) return '';
    let best = null;
    for (const w of workspaces) {
      if (!w.path) continue;
      const p = w.path.replace(/[\\/]+$/, '').toLowerCase();
      const c = cwd.replace(/[\\/]+$/, '').toLowerCase();
      if (c === p || c.startsWith(p + '\\') || c.startsWith(p + '/')) {
        if (!best || p.length > best.path.length) best = w;
      }
    }
    return best ? best.id : '';
  }

  /** 没有归属工作区时，用 cwd 的最后两段当分组名，避免全堆到「未归属」 */
  function fallbackGroup(cwd) {
    if (!cwd) return { key: 'unknown', title: '未归属' };
    const parts = String(cwd).split(/[\\/]+/).filter(Boolean);
    const tail = parts.slice(-2).join('/');
    return { key: `cwd:${cwd.toLowerCase()}`, title: tail || String(cwd) };
  }

  async function readSessions(workspaces) {
    const sc = svc('sessionController');
    if (!sc) return [];
    const ac = new AbortController();
    try {
      const value = await sc.list({}, ac.signal);
      const items = value?.items ?? [];
      const out = [];
      for (const s of items) {
        if (s.origin === 'subagent') continue;        // 子代理会话不在侧栏显示
        if (s.parentSessionId) continue;              // 分叉出来的子会话也不显示
        const cwd = String(s.cwd ?? '');
        const workspaceId = workspaceFor(cwd, workspaces);
        const fallback = workspaceId ? null : fallbackGroup(cwd);
        out.push({
          id: String(s.sessionId),
          title: pickTitle(s) || (cwd ? cwd.split(/[\\/]/).pop() : '新会话'),
          cwd,
          workspaceId,
          groupKey: workspaceId || (fallback ? fallback.key : 'unknown'),
          groupTitle: workspaceId ? '' : (fallback ? fallback.title : '未归属'),
          updatedAt: Number(s.updatedAt ?? 0),
          running: Boolean(s.running),
          blank: Boolean(s.blank),
          preset: String(s.projections?.values?.agentPreset ?? ''),
          permissions: String(s.projections?.values?.permissions?.currentValue ?? ''),
          model: (() => {
            const m = s.projections?.values?.modelSelection?.lastUsed
              ?? s.projections?.values?.modelSelection?.next;
            return m && m.provider && m.model ? { provider: String(m.provider), model: String(m.model) } : null;
          })(),
          agentAvailable: Boolean(s.agentAvailable),
          seq: Number(s.projections?.asOfSeq ?? -1),
        });
      }
      out.sort((a, b) => b.updatedAt - a.updatedAt);
      return out;
    } catch (err) {
      warn('sessionController.list 失败:', err?.message ?? err);
      return [];
    }
  }

  // ------------------------------------------------------------ 历史
  // DSH 会把「运行时上下文」「系统提醒」等注入内容也记成 user/message，
  // 这些不是用户真正说的话，历史里要过滤掉。
  const INJECTED_PREFIXES = [
    'Current runtime context',
    '<system-reminder>',
    'Time sampled while preparing',
    'The following skills are available',
  ];

  function isInjected(text) {
    const t = text.replace(/^\s+/, '');
    return INJECTED_PREFIXES.some((p) => t.startsWith(p));
  }

  async function readHistory(sessionId) {
    const sc = svc('sessionController');
    if (!sc) throw new Error('sessionController 不可用');
    const sessions = await readSessions(await readWorkspaces());
    const meta = sessions.find((s) => s.id === sessionId);
    const throughSeq = meta && meta.seq >= 0 ? meta.seq : undefined;

    const ac = new AbortController();
    const request = {
      address: { kind: 'session', sessionId },
      ...(throughSeq !== undefined ? { throughSeq } : {}),
      maxMessages: 80,
    };
    const page = await sc.page(request, ac.signal);
    const records = page?.records ?? [];
    const messages = [];
    for (const record of records) {
      if (!record || record.type !== 'event') continue;
      const ev = record.event;
      if (!ev) continue;
      if (ev.type === 'user/message') {
        const text = blocksText(ev.data?.content ?? ev.data?.message?.content);
        if (text && !isInjected(text)) messages.push({ role: 'user', text, ts: ev.time ?? 0 });
      } else if (ev.type === 'assistant/message') {
        const text = blocksText(ev.data?.message?.content);
        if (text) messages.push({ role: 'assistant', text, ts: ev.time ?? 0 });
      } else if (ev.type === 'tool/call') {
        const nm = ev.data?.name;
        if (nm) messages.push({ role: 'tool', text: String(nm), ts: ev.time ?? 0 });
      }
    }
    return { sessionId, messages, hasMore: Boolean(page?.hasMore) };
  }

  // ------------------------------------------------------------ 发消息
  async function lastSeqOf(sessionId) {
    const sc = svc('sessionController');
    try {
      const insp = await sc.inspect(sessionId);
      const events = insp?.events ?? [];
      let max = -1;
      for (const ev of events) if (typeof ev.seq === 'number' && ev.seq > max) max = ev.seq;
      return max;
    } catch {
      return -1;
    }
  }

  async function waitForTurnEnd(sessionId, sinceSeq, timeoutMs = 300000) {
    const sc = svc('sessionController');
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(1200);
      try {
        const insp = await sc.inspect(sessionId);
        const events = insp?.events ?? [];
        let ended = false;
        let errorText = '';
        let text = '';
        for (const ev of events) {
          if (typeof ev.seq === 'number' && ev.seq <= sinceSeq) continue;
          if (ev.type === 'assistant/message') {
            const t = blocksText(ev.data?.message?.content);
            if (t) text = t;
          } else if (ev.type === 'turn/end') {
            ended = true;
            const reason = ev.data?.reason;
            if (reason && reason.kind === 'error') {
              const d = reason.error ?? reason.failure ?? {};
              errorText = String(d.message ?? '模型调用失败');
            }
          }
        }
        if (ended) return { text, errorText };
      } catch {
        /* 会话可能正在写入，下次再试 */
      }
    }
    return { text: '', errorText: '等待回答超时' };
  }

  async function sendPrompt(sessionId, text) {
    const sc = svc('sessionController');
    if (!sc) throw new Error('sessionController 不可用');

    const sinceSeq = await lastSeqOf(sessionId);
    send({ type: 'ev', kind: 'typing', sessionId, on: true });

    const requestId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ac = new AbortController();
    await sc.prompt(
      {
        requestId,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: 'Asia/Shanghai',
      },
      ac.signal
    );

    const result = await waitForTurnEnd(sessionId, sinceSeq);
    send({ type: 'ev', kind: 'typing', sessionId, on: false });

    if (result.text) {
      send({ type: 'ev', kind: 'assistant', sessionId, text: result.text });
    } else {
      send({
        type: 'ev',
        kind: 'assistant',
        sessionId,
        text: result.errorText ? `（出错了：${result.errorText}）` : '（这一轮没有产出文字回答）',
      });
    }
    return { ok: true };
  }

  // ------------------------------------------------------------ 运行时信息
  async function readInfo() {
    const info = { model: null, presets: [], plugins: [], bundles: [] };

    const sc = svc('sessionController');
    if (sc) {
      try {
        const catalog = await sc.modelCatalog();
        const def = catalog?.default;
        if (def && def.provider && def.model) {
          info.model = { provider: String(def.provider), model: String(def.model) };
        }
        info.modelGroups = (catalog?.groups ?? []).map((g) => ({
          id: String(g.id ?? ''),
          name: String(g.name ?? g.id ?? ''),
          models: (g.models ?? []).map((m) => ({ id: String(m.id ?? ''), name: String(m.name ?? m.id ?? '') })),
        }));
      } catch (err) {
        warn('modelCatalog 失败:', err?.message ?? err);
      }
    }

    const presets = svc('agentPresets');
    if (presets) {
      try {
        const list = await presets.list();
        info.presets = (list ?? []).map((p) => ({
          id: String(p.id ?? ''),
          name: String(p.name ?? p.title ?? p.id ?? ''),
          description: String(p.description ?? ''),
        }));
      } catch (err) {
        warn('agentPresets.list 失败:', err?.message ?? err);
      }
    }

    const pm = svc('pluginManager');
    if (pm) {
      try {
        const bundles = (await pm.listBundles()) ?? [];
        info.bundles = bundles.map((b) => ({
          name: String(b.name ?? b.id ?? ''),
          version: String(b.version ?? ''),
          enabled: b.enabled !== false,
        }));
        info.bundles.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
      } catch (err) {
        warn('listBundles 失败:', err?.message ?? err);
      }
    }

    return info;
  }

  // ------------------------------------------------------------ 新建会话
  async function createSession(payload) {
    const sc = svc('sessionController');
    if (!sc) throw new Error('sessionController 不可用');
    const request = {};
    if (payload?.workspaceId) request.workspaceId = String(payload.workspaceId);
    if (payload?.cwd) request.cwd = String(payload.cwd);
    if (payload?.preset) request.agentPreset = String(payload.preset);
    const created = await sc.create(request);
    return { sessionId: String(created?.sessionId ?? ''), agentPreset: String(created?.agentPreset ?? '') };
  }

  // ------------------------------------------------------------ 切换模型 / 模式 / 插件
  async function setModel(payload) {
    const sc = svc('sessionController');
    if (!sc) throw new Error('sessionController 不可用');
    const sessionId = String(payload?.sessionId ?? '');
    const provider = String(payload?.provider ?? '');
    const model = String(payload?.model ?? '');
    if (!sessionId || !provider || !model) throw new Error('缺少 sessionId / provider / model');
    const request = { sessionId, provider, model };
    if (payload?.reasoningEffort) request.reasoningEffort = String(payload.reasoningEffort);
    const value = await sc.selectModel(request);
    return {
      sessionId,
      selected: value?.selected ?? { provider, model },
    };
  }

  async function setPreset(payload) {
    const sc = svc('sessionController');
    const presets = svc('agentPresets');
    if (!sc || !presets) throw new Error('sessionController / agentPresets 不可用');
    const sessionId = String(payload?.sessionId ?? '');
    const preset = String(payload?.preset ?? '');
    if (!sessionId || !preset) throw new Error('缺少 sessionId / preset');

    const resolved = await sc.resolveAgent(sessionId);
    if (!resolved || resolved.error) {
      const code = resolved?.error?.code ?? 'session/unavailable';
      throw new Error(`会话不可用（${code}），可能正在运行，稍后再试`);
    }
    const chosen = await presets.select(resolved.agent, preset);
    return { sessionId, preset: String(chosen ?? preset) };
  }

  async function setBundle(payload) {
    const pm = svc('pluginManager');
    if (!pm) throw new Error('pluginManager 不可用');
    const name = String(payload?.name ?? '');
    const enabled = Boolean(payload?.enabled);
    if (!name) throw new Error('缺少插件名');

    const result = await pm.setBundleEnabled(name, enabled);
    const normalized = {};
    if (result && typeof result === 'object') {
      for (const k of ['application', 'changed', 'warnings', 'nextStep', 'restartRequired']) {
        if (result[k] !== undefined) normalized[k] = result[k];
      }
    }
    return { name, enabled, result: normalized };
  }

  // ------------------------------------------------------------ 请求分发
  async function handleRequest(request) {
    const { id, action, payload } = request;
    try {
      let data;
      switch (action) {
        case 'snapshot': {
          const workspaces = await readWorkspaces();
          const sessions = await readSessions(workspaces);
          const info = await readInfo();
          data = { workspaces, sessions, info };
          break;
        }
        case 'history':
          data = await readHistory(String(payload?.sessionId ?? ''));
          break;
        case 'send':
          data = await sendPrompt(String(payload?.sessionId ?? ''), String(payload?.text ?? ''));
          break;
        case 'create':
          data = await createSession(payload);
          break;
        case 'setModel':
          data = await setModel(payload);
          break;
        case 'setPreset':
          data = await setPreset(payload);
          break;
        case 'setBundle':
          data = await setBundle(payload);
          break;
        case 'info':
          data = await readInfo();
          break;
        case 'debug': {
          const sc = svc('sessionController');
          const value = sc ? await sc.list({}, new AbortController().signal) : null;
          data = {
            sampleSession: value?.items?.[0] ?? null,
            workspaces: await readWorkspaces(),
          };
          break;
        }
        default:
          throw new Error(`未知操作：${action}`);
      }
      send({ type: 'res', id, data });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warn(`${action} 失败:`, detail);
      send({ type: 'res', id, error: detail });
    }
  }

  // ------------------------------------------------------------ 连接
  function send(payload) {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    attempts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(attempts, 5), config.maxReconnectMs);
    log(`${Math.round(delay / 1000)}s 后重连（第 ${attempts} 次）`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // ------------------------------------------------------------ 连接字符串
  /**
   * 网页「设置 → 连接参数」里给的那一大串：whale1.<base64url(json)>
   * json = {"v":1,"url":"wss://.../agent-ws","token":"..."}
   * 填了就优先用它，不用再分别填地址和令牌。
   */
  function parseConnectString(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const matched = /^whale1\.([A-Za-z0-9_-]+)$/.exec(text);
    if (!matched) {
      warn('连接字符串格式不对，应以 whale1. 开头');
      return null;
    }
    try {
      let b64 = matched[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const obj = JSON.parse(json);
      if (!obj || typeof obj.url !== 'string' || !obj.url) return null;
      return {
        serverUrl: obj.url,
        agentToken: typeof obj.token === 'string' ? obj.token : '',
      };
    } catch (err) {
      warn('连接字符串解析失败:', err?.message ?? err);
      return null;
    }
  }

  /** 实际生效的连接配置：连接字符串优先，其次分项配置 */
  function effectiveConnection() {
    const parsed = parseConnectString(config.connectString);
    if (parsed) {
      return { ...parsed, source: 'connectString' };
    }
    return {
      serverUrl: config.serverUrl,
      agentToken: config.agentToken,
      source: 'fields',
    };
  }

  function connect() {
    if (stopped) return;
    const conn = effectiveConnection();
    if (!conn.agentToken) {
      warn('没有配置令牌（也没填连接字符串），插件不会连接');
      return;
    }

    const url = `${conn.serverUrl}?token=${encodeURIComponent(conn.agentToken)}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      warn('创建连接失败:', err?.message ?? err);
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.addEventListener('open', () => {
      attempts = 0;
      log('已连接', conn.serverUrl, `（配置来源：${conn.source}）`);
      send({ type: 'hello', version: VERSION });
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: 'ping' }), 30000);
    });

    ws.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data.type === 'req') {
        void handleRequest(data);
      }
    });

    ws.addEventListener('close', (event) => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (socket === ws) socket = null;
      if (stopped) return;
      log(`连接断开（code=${event.code}）`);
      scheduleReconnect();
    });

    ws.addEventListener('error', () => warn('连接出错'));
  }

  connect();

  ctx.effect(() => () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    try {
      socket?.close();
    } catch {
      /* 忽略 */
    }
  });
}
