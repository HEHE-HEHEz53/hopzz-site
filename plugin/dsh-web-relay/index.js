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

// 不再依赖 @deepseek-ai/schemastery：插件是软链接安装，Node 从真实路径解析，找不到 DSH 内部包。
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const name = 'web-relay';

// 关键：声明依赖 webServer，Cordis 会等 Web 服务就绪后再调用 apply。
// 否则插件启动太早，ctx.get('webServer') 拿到 undefined，设置面板接口就全 404。
export const inject = ['webServer'];

const VERSION = '5.0.1';
const TAG = `[web-relay@${VERSION}]`;

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = join(HERE, 'settings.json');


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function apply(ctx, config = {}) {
  config = config || {};
  // 启动自检：万一后面抛错，也能知道 apply 走到这里了
  writeBootInfo({ version: VERSION, stage: 'apply-start', at: new Date().toISOString(), routes: [], error: '' });
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  let socket = null;
  let stopped = false;
  let attempts = 0;
  let reconnectTimer = null;
  let pingTimer = null;

  // ------------------------------------------------------------ 设置存储
  const SETTINGS_DEFAULTS = {
    mode: '',
    connectString: '',
    serverUrl: '',
    agentToken: '',
    maxReconnectMs: 0,
    sshConfigPath: '',
    sshTarget: '',
    repoPath: '',
    // 一键部署用：填了这些就用密码登录，不依赖本机 SSH 配置
    deployHost: '',
    deployPort: 22,
    deployUser: 'root',
    deployPassword: '',
    deployDomain: '',
    sourceUrl: 'https://hopzz.top/dl/chat-src.tar.gz',
    plinkPath: 'plink.exe',
    pscpPath: 'pscp.exe',
  };

  function loadSettings() {
    try {
      if (!existsSync(SETTINGS_FILE)) return { ...SETTINGS_DEFAULTS };
      const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
      return { ...SETTINGS_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch (err) {
      warn('读取 settings.json 失败:', err?.message ?? err);
      return { ...SETTINGS_DEFAULTS };
    }
  }

  let runtimeSettings = loadSettings();

  function saveSettings(patch) {
    runtimeSettings = { ...runtimeSettings, ...patch };
    try {
      writeFileSync(SETTINGS_FILE, JSON.stringify(runtimeSettings, null, 2), 'utf8');
      if (process.platform !== "win32") {
        try { chmodSync(SETTINGS_FILE, 0o600); } catch {}
      }
    } catch (err) {
      throw new Error('写入 settings.json 失败：' + (err?.message ?? err));
    }
  }

  function restartConnection() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const old = socket;
    socket = null;
    try {
      old?.close();
    } catch {
      /* 忽略 */
    }
    attempts = 0;
    connect();
  }

  function isConnected() {
    return !!(socket && socket.readyState === 1);
  }

  function statusPayload() {
    const conn = effectiveConnection();
    return {
      ok: true,
      version: VERSION,
      connected: isConnected(),
      mode: runtimeSettings.mode || (runtimeSettings.connectString ? 'string' : 'fields'),
      connectString: runtimeSettings.connectString || '',
      serverUrl: runtimeSettings.serverUrl || config.serverUrl || '',
      agentToken: runtimeSettings.agentToken || config.agentToken || '',
      effectiveUrl: conn.serverUrl,
      source: conn.source,
      maxReconnectMs: runtimeSettings.maxReconnectMs || config.maxReconnectMs || 30000,
      sshConfigPath: runtimeSettings.sshConfigPath || '',
      sshTarget: runtimeSettings.sshTarget || '',
      repoPath: runtimeSettings.repoPath || '',
      deployHost: runtimeSettings.deployHost || '',
      deployPort: runtimeSettings.deployPort || 22,
      deployUser: runtimeSettings.deployUser || 'root',
      deployDomain: runtimeSettings.deployDomain || '',
      hasDeployPassword: !!runtimeSettings.deployPassword,
      plinkPath: runtimeSettings.plinkPath || '',
    };
  }

  // ------------------------------------------------------------ 一键部署
  function runCommand(cmd, args, timeoutMs = 180000) {
    return new Promise((resolve) => {
      let out = '';
      let child;
      try {
        child = spawn(cmd, args, { windowsHide: true });
      } catch (err) {
        return resolve({ code: -1, out: String(err?.message ?? err) });
      }
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* 忽略 */
        }
        resolve({ code: -1, out: out + '\n[超时，已终止]' });
      }, timeoutMs);
      const collect = (d) => {
        if (out.length < 400000) out += d.toString();
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: -1, out: out + '\n' + String(err?.message ?? err) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out });
      });
    });
  }

  /** 用 plink 的报错信息拿到主机指纹（第一次连接时用） */
  /** 用 plink 探测主机指纹（plink 在 -batch 下会打印指纹后放弃连接，正好用它） */
  async function ensureHostKey(plinkPath, host, port, user) {
    if (!plinkPath) return "";
    const probe = await runCommand(
      plinkPath,
      ["-batch", "-P", String(port), "-l", user || "root", "-pw", "precheck", host, "echo ok"],
      30000
    );
    const text = probe.out || "";
    // 形如: SHA256:wCHU...Mg3o  也兼容 ssh-ed25519 2048 SHA256:xxx 这种整行
    const m = /SHA256:[A-Za-z0-9+/=]+/.exec(text);
    return m ? m[0] : "";
  }

  /** 生成 SSH_ASKPASS 帮助脚本，用 Windows 自带 OpenSSH 做密码登录（不需要 PuTTY） */
  function makeAskpass(password) {
    const dir = join(tmpdir(), 'hopzz-ask-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const isWin = process.platform === 'win32';
    const file = join(dir, isWin ? 'askpass.cmd' : 'askpass.sh');
    const raw = String(password);
    if (isWin) {
      const safe = raw.replace(/([&<>|^%])/g, '^$1');
      writeFileSync(file, '@echo off\r\necho ' + safe + '\r\n', 'utf8');
    } else {
      const safe = raw.replace(/'/g, "'" + "\\\\" + "''");
      writeFileSync(file, "#!/bin/sh\nprintf '%s\\n' " + "'" + safe + "'" + "\n", 'utf8');
      try { chmodSync(file, 0o700); } catch {}
    }
    return { file, dir };
  }

  function sshEnv(askpass) {
    return {
      SSH_ASKPASS: askpass.file,
      SSH_ASKPASS_REQUIRE: 'force',
      DISPLAY: ':0',
    };
  }

  function resolveBin(name) {
    if (process.platform === 'win32') {
      const sys = 'C:\\Windows\\System32\\OpenSSH\\' + name + '.exe';
      if (existsSync(sys)) return sys;
      return name + '.exe';
    }
    return name;
  }

  /** 在 PATH 里找可执行文件（跨平台） */
  function findTool(name, extraPaths) {
    const list = [name];
    if (process.platform === 'win32') list.push(name + '.exe');
    for (const p of extraPaths || []) {
      if (p && existsSync(p)) return p;
    }
    for (const dir of (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
      if (!dir) continue;
      for (const n of list) {
        const full = join(dir, n);
        try {
          if (existsSync(full)) return full;
        } catch {
          /* 忽略 */
        }
      }
    }
    return '';
  }

  /** 部署地址白名单校验：只允许域名 / IPv4 / IPv6 方括号 + 端口，杜绝命令注入 */
  function isValidDeployAddr(addr) {
    const a = String(addr || '').trim();
    if (!a || a.length > 253) return false;
    if (a.startsWith('-')) return false;
    return /^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:\d{1,5})?$/.test(a);
  }
  /** 目标是不是本机（DSH 所在机器）：是的话不用 SSH，直接本机执行安装脚本 */
  function isLocalTarget(host) {
    const h = String(host || '').trim().toLowerCase();
    if (!h) return false;
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
    try {
      const nets = networkInterfaces();
      for (const list of Object.values(nets)) {
        for (const item of list || []) {
          if (item && item.address && item.address.toLowerCase() === h) return true;
        }
      }
    } catch {
      /* 忽略 */
    }
    return false;
  }

  /** 用 Node 自带 fetch 下载文件 */
  async function downloadFile(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('下载失败 HTTP ' + res.status);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }

  /** 没有本地源码时，自动下载带 chat/ 目录的源码包并解压 */
  async function fetchSourceBundle() {
    const url = runtimeSettings.sourceUrl || 'https://hopzz.top/dl/chat-src.tar.gz';
    const temp = join(tmpdir(), 'hopzz-src-' + Date.now());
    mkdirSync(temp, { recursive: true });
    const tgz = join(temp, 'src.tar.gz');
    await downloadFile(url, tgz);
    const unpacked = await runCommand('tar', ['-xzf', tgz, '-C', temp], 120000);
    if (unpacked.code !== 0) throw new Error('解压源码包失败：' + (unpacked.out || ''));
    return { dir: join(temp, 'chat'), temp };
  }

  async function deployWebui() {
    const addr = (runtimeSettings.deployDomain || '').trim();
    if (!addr) {
      return { ok: false, message: '请先填写「访问地址」（域名，或 IP:端口，例如 1.2.3.4:8888）', log: '' };
    }

    let chatDir = '';
    let tempDir = '';
    const repo = (runtimeSettings.repoPath || '').trim();
    if (repo) {
      const candidate = join(repo, 'chat');
      if (existsSync(candidate)) chatDir = candidate;
    }
    let sourceNote = '';
    if (!chatDir) {
      try {
        const fetched = await fetchSourceBundle();
        chatDir = fetched.dir;
        tempDir = fetched.temp;
        sourceNote = '源码来源：在线下载（' + (fetched.source || '') + '\n';
      } catch (err) {
        return {
          ok: false,
          message: '本机没有源码，下载也失败：' + String(err?.message ?? err),
          log: '请检查网络，或在设置里填「本地仓库路径」。',
        };
      }
    } else {
      sourceNote = '源码来源：本地仓库\n';
    }
    if (!existsSync(chatDir)) {
      return { ok: false, message: '源码包里没有 chat 目录', log: '' };
    }

    let logText = sourceNote + `目标地址: ${addr}\n\n`;

    // ---------- 本机部署：DSH 就跑在这台机器上，直接本地执行，不需要 SSH ----------
    const targetHost = (runtimeSettings.deployHost || '').split(':')[0];
    if (process.platform !== 'win32' && isLocalTarget(targetHost)) {
      logText += '方式: 本机直装（不需要 SSH / 密码）\n\n';
      logText += '1) 执行安装脚本…\n';
      const scriptPath = join(chatDir, 'install_chat.sh');
      const step = await runCommand('bash', [scriptPath, addr], 600000);
      logText += (step.out || '') + '\n';
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
      return {
        ok: step.code === 0,
        message: step.code === 0 ? '部署完成：' + addr : '安装脚本返回失败，请看下面的日志',
        log: logText,
      };
    }
    if (!isValidDeployAddr(addr)) {
      return {
        ok: false,
        message: '访问地址不合法：只允许 域名 / IP / IP:端口（不要带引号、空格或其他符号）',
        log: '收到: ' + addr,
      };
    }

    const rawHost = String(runtimeSettings.deployHost || '').split(':')[0];
    if (rawHost && !isValidDeployAddr(rawHost)) {
      return { ok: false, message: '服务器地址不合法', log: '收到: ' + rawHost };
    }

    const usePassword = !!runtimeSettings.deployHost && !!runtimeSettings.deployPassword;

    if (usePassword) {
      const host = runtimeSettings.deployHost;
      const port = Number(runtimeSettings.deployPort) || 22;
      const user = runtimeSettings.deployUser || 'root';
      const password = runtimeSettings.deployPassword;
      const remote = `${user}@${host}`;
      // 优先用插件自带的 PuTTY（Windows 系统 ssh 不支持 SSH_ASKPASS，密码登录只能用 plink）
      const isWinPlat = process.platform === "win32";
      const plinkCandidates = [
        join(HERE, "bin", "win32", "plink.exe"),
        join(HERE, "bin", "plink.exe"),
        runtimeSettings.plinkPath,
      ].filter(Boolean);
      const pscpCandidates = [
        join(HERE, "bin", "win32", "pscp.exe"),
        join(HERE, "bin", "pscp.exe"),
        runtimeSettings.pscpPath,
      ].filter(Boolean);
      const plink = isWinPlat ? findTool("plink.exe", plinkCandidates) : "";
      const pscp = isWinPlat ? findTool("pscp.exe", pscpCandidates) : "";
      // PuTTY 只有显式填了完整路径才用；否则一律用系统自带 OpenSSH（Win/Linux/macOS 都有）
      const hasPutty = !!(isWinPlat && plink && pscp);

      if (isWinPlat && !hasPutty) {
        logText += "方式: 密码登录（Windows）\n\n";
        logText += "找不到 plink.exe / pscp.exe，Windows 自带 ssh 无法用密码登录。\n";
        logText += "解决办法（任选其一）：\n";
        logText += "  1. 用 ssh-keygen 生成密钥并上传服务器，改用「SSH 配置」模式；\n";
        logText += "  2. 装一个 PuTTY，把 plink.exe 所在目录填到设置里的 PuTTY 路径；\n";
        logText += "  3. 目标就是本机时改用「本机直装」（自动生效）。\n";
        if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
        return { ok: false, message: "Windows 缺少 plink/pscp，密码模式无法使用", log: logText };
      }

      logText += `方式: 密码登录 ${remote}:${port}（${hasPutty ? 'PuTTY' : 'Windows 自带 OpenSSH'}）\n\n`;

      let runRemote;
      let runCopy;

      if (hasPutty) {
        logText += '1) 获取服务器主机指纹…\n';
        const fp = await ensureHostKey(plink, host, port, user);
          if (!fp) {
            logText += "   拿不到主机指纹，无法在批处理模式下继续。\n";
            logText += "   请先在命令行手动执行一次下面这条命令（会询问是否信任主机，输入 y 回车）：\n";
            logText += '     "' + plink + '" -P ' + port + ' -l ' + user + ' ' + host + ' exit\n';
            if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
            return { ok: false, message: "拿不到服务器主机指纹，请先手动信任一次主机密钥", log: logText };
          }
          logText += "   指纹 " + fp + "\n\n";
          const keyArg = ["-hostkey", fp];
        runRemote = (cmd) =>
          runCommand(plink, ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host, cmd], 300000);
        runCopy = () =>
          runCommand(pscp, ['-batch', '-P', String(port), '-pw', password, ...keyArg, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000);
      } else {
        const askpass = makeAskpass(password);
        const env = sshEnv(askpass);
        const sshExe = resolveBin('ssh');
        const scpExe = resolveBin('scp');
        const common = [
          '-o', 'StrictHostKeyChecking=accept-new',
          '-o', 'UserKnownHostsFile=' + join(askpass.dir, 'known_hosts'),
          '-p', String(port),
          remote,
        ];
        runRemote = (cmd) => runCommand(sshExe, [...common, cmd], 300000, env);
        runCopy = () => runCommand(scpExe, [...common, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000, env);
        logText += '1) 使用 OpenSSH（首次连接自动信任主机指纹）\n\n';
      }

      logText += '2) 清理旧目录…\n';
      const step1 = await runRemote('rm -rf /root/chat-deploy');
      logText += (step1.out || '') + '\n';
      if (step1.code !== 0) {
        return {
          ok: false,
          message: 'SSH 登录失败：检查 IP / 端口 / 用户名 / 密码，以及服务器防火墙是否放行该端口',
          log: logText,
        };
      }

      logText += '3) 上传 chat/ 目录…\n';
      const step2 = await runCopy();
      logText += (step2.out || '') + '\n';
      if (step2.code !== 0) return { ok: false, message: '上传失败', log: logText };

      logText += `4) 执行安装脚本（地址 ${addr}）…\n`;
      const step3 = await runRemote(`bash /root/chat-deploy/install_chat.sh ${addr}`);
      logText += (step3.out || '') + '\n';
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
      return {
        ok: step3.code === 0,
        message: step3.code === 0 ? '部署完成：' + addr : '安装脚本返回失败，看下面日志',
        log: logText,
      };
    }
    // ---------- SSH 配置模式（本机已配好密钥）----------
    const cfgPath = runtimeSettings.sshConfigPath || '';
    const target = runtimeSettings.sshTarget || 'vps';
    if (!existsSync(cfgPath)) {
      return {
        ok: false,
        message: '没有可用的部署方式：要么在下面填服务器 IP + root 密码，要么把 SSH 配置路径填对',
        log: '',
      };
    }
    logText += `方式: SSH 配置 ${cfgPath}（${target}）\n\n`;

    const step1 = await runCommand('ssh', ['-F', cfgPath, target, 'rm -rf /root/chat-deploy'], 60000);
    logText += `$ ssh "rm -rf /root/chat-deploy"\n${step1.out}\n`;
    if (step1.code !== 0) {
      return { ok: false, message: 'SSH 配置模式连不上：改成填 IP + 密码会更省事', log: logText };
    }

    const step2 = await runCommand(
      'scp',
      ['-F', cfgPath, '-r', chatDir, `${target}:/root/chat-deploy`],
      300000
    );
    logText += `$ scp -r chat\n${step2.out}\n`;
    if (step2.code !== 0) return { ok: false, message: '上传失败', log: logText };

    const step3 = await runCommand(
      'ssh',
      ['-F', cfgPath, target, `bash /root/chat-deploy/install_chat.sh ${addr}`],
      300000
    );
    logText += `$ ssh "bash install_chat.sh ${domain}"\n${step3.out}\n`;
    return {
      ok: step3.code === 0,
      message: step3.code === 0 ? '部署完成：' + addr : '安装脚本返回失败，看下面日志',
      log: logText,
    };
  }
  // ------------------------------------------------------------ 测试连接
  /** 测试连接：分步报告，便于定位是地址、网络还是令牌的问题 */
  async function testConnection() {
    const conn = effectiveConnection();
    if (!conn.agentToken) {
      return { ok: false, message: '还没有配置令牌' };
    }
    const url = conn.serverUrl;
    const httpBase = url.replace(/^ws/, 'http').replace(/\/agent-ws.*$/, '');
    const detail = ['地址: ' + url, '令牌: ' + conn.agentToken.slice(0, 8) + '…（共 ' + conn.agentToken.length + ' 位）'];

    try {
      const res = await fetch(httpBase + '/api/setup-state', { signal: AbortSignal.timeout(8000) });
      detail.push('HTTP 探测: ' + res.status + (res.ok ? ' 可达' : ' 异常'));
      if (!res.ok) {
        return { ok: false, message: '服务器返回 ' + res.status + '，地址可能不对', log: detail.join('\n') };
      }
    } catch (err) {
      detail.push('HTTP 探测失败: ' + String(err && err.message ? err.message : err));
      return { ok: false, message: '连不上服务器的 HTTP 端口（地址/端口错，或服务没跑）', log: detail.join('\n') };
    }

    return await new Promise((resolve) => {
      let done = false;
      let probe = null;
      const finish = (ok, message) => {
        if (done) return;
        done = true;
        try {
          if (probe) probe.close();
        } catch (e) {
          /* 忽略 */
        }
        resolve({ ok: ok, message: message, log: detail.join('\n') });
      };
      const timer = setTimeout(() => finish(false, 'WebSocket 握手超时（8 秒）'), 8000);
      try {
        probe = new WebSocket(url + '?token=' + encodeURIComponent(conn.agentToken));
      } catch (err) {
        clearTimeout(timer);
        detail.push('构造 WebSocket 失败: ' + String(err && err.message ? err.message : err));
        return finish(false, '地址格式不对（要以 ws:// 或 wss:// 开头）');
      }
      probe.addEventListener('open', () => {
        clearTimeout(timer);
        detail.push('WebSocket: 握手成功');
        finish(true, '连接正常');
      });
      probe.addEventListener('error', () => {
        clearTimeout(timer);
        detail.push('WebSocket: error（服务器拒绝、路径不对，或 TLS 不符）');
        finish(false, 'WebSocket 连不上：看下面的明细');
      });
      probe.addEventListener('close', (ev) => {
        clearTimeout(timer);
        detail.push('WebSocket 关闭: code=' + ev.code + ' reason=' + (ev.reason || '(空)'));
        finish(false, '服务器主动断开（多半是令牌不对）');
      });
    });
  }

  // ------------------------------------------------------------ 设置面板的 HTTP 接口
  async function handleRoute(req, res) {
    const hostHeader = String((req.headers && req.headers.host) || "").split(":")[0].toLowerCase();
    const allowedHosts = ["127.0.0.1", "localhost", "[::1]", "::1", ""];
    if (allowedHosts.indexOf(hostHeader) === -1) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "forbidden host" }));
      return;
    }
    const fetchSite = String((req.headers && req.headers["sec-fetch-site"]) || "").toLowerCase();
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "forbidden origin" }));
      return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    const reply = (status, obj) => {
      try {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(obj));
      } catch {
        /* 连接可能已断 */
      }
    };

    const readJson = async () => {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_000_000) break;
        chunks.push(chunk);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return {};
      }
    };

    try {
      if (pathname === '/web-relay/api/status') {
        return reply(200, statusPayload());
      }

      if (pathname === '/web-relay/api/settings' && req.method === 'POST') {
        const body = await readJson();
        const mode = body.mode === 'fields' ? 'fields' : 'string';
        if (mode === 'string') {
          const cs = String(body.connectString || '').trim();
          if (!cs) throw new Error('连接字符串不能为空');
          if (!parseConnectString(cs)) throw new Error('连接字符串格式不对（应以 whale1. 开头）');
          saveSettings({ mode, connectString: cs });
        } else {
          const sUrl = String(body.serverUrl || '').trim();
          const sTok = String(body.agentToken || '').trim();
          if (!/^wss?:\/\//.test(sUrl)) throw new Error('服务器地址要以 ws:// 或 wss:// 开头');
          if (!sTok) throw new Error('令牌不能为空');
          saveSettings({ mode, serverUrl: sUrl, agentToken: sTok });
        }
        restartConnection();
        return reply(200, { ok: true, message: '已保存，正在重连…' });
      }

      if (pathname === '/web-relay/api/general' && req.method === 'POST') {
        const body = await readJson();
        const patch = {};
        if (body.maxReconnectMs !== undefined) {
          const ms = Number(body.maxReconnectMs);
          patch.maxReconnectMs = Number.isFinite(ms) && ms >= 1000 ? Math.min(ms, 300000) : 30000;
        }
        if (typeof body.sshConfigPath === 'string') patch.sshConfigPath = body.sshConfigPath.trim();
        if (typeof body.sshTarget === 'string') patch.sshTarget = body.sshTarget.trim();
        if (typeof body.repoPath === 'string' && body.repoPath.trim()) patch.repoPath = body.repoPath.trim();
        if (typeof body.deployHost === 'string') patch.deployHost = body.deployHost.trim();
        if (body.deployPort !== undefined) {
          const p = Number(body.deployPort);
          patch.deployPort = Number.isFinite(p) && p > 0 && p < 65536 ? p : 22;
        }
        if (typeof body.deployUser === 'string' && body.deployUser.trim()) patch.deployUser = body.deployUser.trim();
        if (body.clearDeployPassword === true) patch.deployPassword = '';
        if (typeof body.deployPassword === 'string' && body.deployPassword !== '') patch.deployPassword = body.deployPassword;
        if (typeof body.deployDomain === 'string') patch.deployDomain = body.deployDomain.trim();
        if (typeof body.plinkPath === 'string' && body.plinkPath.trim()) patch.plinkPath = body.plinkPath.trim();
        saveSettings(patch);
        return reply(200, { ok: true, message: '已保存' });
      }

      if (pathname === '/web-relay/api/test' && req.method === 'POST') {
        const result = await testConnection();
        return reply(200, result);
      }

      if (pathname === '/web-relay/api/deploy' && req.method === 'POST') {
        const result = await deployWebui();
        return reply(200, result);
      }

      return reply(404, { ok: false, error: '未知接口' });
    } catch (err) {
      warn('设置接口出错:', err?.message ?? err);
      return reply(400, { ok: false, error: String(err?.message ?? err) });
    }
  }

  function registerRoutes() {
    const info = { version: VERSION, at: new Date().toISOString(), routes: [], error: '' };
    let web;
    try {
      web = ctx.get('webServer');
    } catch (err) {
      web = undefined;
      info.error = 'ctx.get(webServer) 抛错: ' + String(err?.message ?? err);
    }
    info.hasWebServer = !!web;
    info.hasRegister = !!(web && typeof web.register === 'function');

    if (!web || typeof web.register !== 'function') {
      warn('webServer 不可用，设置面板的数据接口没有注册');
      writeBootInfo(info);
      return;
    }

    // 同时注册 prefix 和每个精确路径：任意一种生效面板就能用
    const paths = [
      '/web-relay/api/status',
      '/web-relay/api/settings',
      '/web-relay/api/general',
      '/web-relay/api/test',
      '/web-relay/api/deploy',
    ];

    try {
      const disposePrefix = web.register({
        kind: 'prefix',
        path: '/web-relay/api',
        handler: handleRoute,
      });
      info.routes.push('prefix:/web-relay/api');
      if (typeof ctx.effect === 'function') ctx.effect(() => disposePrefix);
    } catch (err) {
      info.error += ' prefix 注册失败: ' + String(err?.message ?? err) + ';';
    }

    for (const p of paths) {
      try {
        const dispose = web.register({ kind: 'exact', path: p, handler: handleRoute });
        info.routes.push('exact:' + p);
        if (typeof ctx.effect === 'function') ctx.effect(() => dispose);
      } catch (err) {
        info.error += ` ${p} 注册失败: ` + String(err?.message ?? err) + ';';
      }
    }

    writeBootInfo(info);
    log('设置面板接口已注册：' + info.routes.join(', '));
  }

  function writeBootInfo(info) {
    try {
      writeFileSync(join(HERE, 'boot.json'), JSON.stringify(info, null, 2), 'utf8');
    } catch (err) {
      warn('写 boot.json 失败:', err?.message ?? err);
    }
  }

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

  // ------------------------------------------------------------ 从网页装/卸插件
  function pickChangeResult(result) {
    const out = {};
    if (result && typeof result === 'object') {
      for (const k of ['application', 'changed', 'warnings', 'nextStep', 'restartRequired', 'error']) {
        if (result[k] !== undefined) out[k] = result[k];
      }
    }
    return out;
  }

  async function installPlugin(payload) {
    const pm = svc('pluginManager');
    if (!pm) throw new Error('pluginManager 不可用');
    const spec = String(payload?.spec ?? '').trim();
    if (!spec) throw new Error('请填写要安装的插件名或地址');

    const result = await pm.installBundle(spec);
    const normalized = pickChangeResult(result);
    const failed = normalized.application === 'failed' || normalized.error;
    return {
      spec,
      ok: !failed,
      message: failed
        ? '安装失败：' + (normalized.error?.code ?? normalized.application ?? 'unknown')
        : normalized.application === 'applied'
          ? '已安装并生效'
          : '已安装（' + (normalized.application ?? '待生效') + '，可能需要重启 DSH）',
      result: normalized,
    };
  }

  async function removePlugin(payload) {
    const pm = svc('pluginManager');
    if (!pm) throw new Error('pluginManager 不可用');
    const name = String(payload?.name ?? '').trim();
    if (!name) throw new Error('缺少插件名');
    if (name === '@local/dsh-web-relay') {
      throw new Error('不能卸载本页面自己用的插件（会直接断线）');
    }

    const result = await pm.removeBundle(name);
    const normalized = pickChangeResult(result);
    return {
      name,
      ok: normalized.application !== 'failed',
      message: normalized.application === 'failed' ? '卸载失败' : '已卸载',
      result: normalized,
    };
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
        case 'installPlugin':
          data = await installPlugin(payload);
          break;
        case 'removePlugin':
          data = await removePlugin(payload);
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
    const maxMs = runtimeSettings.maxReconnectMs || config.maxReconnectMs || 30000;
    const delay = Math.min(1000 * 2 ** Math.min(attempts, 5), maxMs);
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

  /** 实际生效的连接配置：设置面板 > settings.json > 插件 Config > 默认值 */
  function effectiveConnection() {
    const s = runtimeSettings;
    const cs = String(s.connectString || '').trim();
    const parsed = parseConnectString(cs);
    if (parsed) return { ...parsed, source: 'connectString' };
    if (s.serverUrl && s.agentToken) {
      return { serverUrl: String(s.serverUrl), agentToken: String(s.agentToken), source: 'fields' };
    }
    return { serverUrl: config.serverUrl, agentToken: config.agentToken, source: 'config' };
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

  registerRoutes();
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
