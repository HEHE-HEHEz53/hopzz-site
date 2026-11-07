$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

function Rep($old, $new, $label) {
  if ($script:c.Contains($old)) { $script:c = $script:c.Replace($old, $new); "  [OK]   $label" }
  else { "  [SKIP] $label" }
}

# ============ 1) 新增工具查找 / 地址校验（放在 isLocalTarget 前）============
$helper = @'
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

'@
$c = $c.Replace("  /** 目标是不是本机（DSH 所在机器）", $helper + "  /** 目标是不是本机（DSH 所在机器）")

# ============ 2) 密码登录分支：重写工具解析 ============
$oldBlock = @'
      // 优先用插件自带的 PuTTY（Windows 系统 ssh 不支持 SSH_ASKPASS，密码登录只能用 plink）
      const bundledPlink = join(HERE, 'bin', 'win32', 'plink.exe');
      const bundledPscp = join(HERE, 'bin', 'win32', 'pscp.exe');
      const isWinPlat = process.platform === 'win32';
      const plink = isWinPlat && existsSync(bundledPlink) ? bundledPlink : (runtimeSettings.plinkPath || 'plink');
      const pscp = isWinPlat && existsSync(bundledPscp) ? bundledPscp : (runtimeSettings.pscpPath || 'pscp');
      // PuTTY 只有显式填了完整路径才用；否则一律用系统自带 OpenSSH（Win/Linux/macOS 都有）
      const hasPutty = isWinPlat && existsSync(plink) && existsSync(pscp);

      logText += `方式: 密码登录 ${remote}:${port}（${hasPutty ? 'PuTTY' : 'Windows 自带 OpenSSH'}）\n\n`;

      let runRemote;
      let runCopy;

      if (hasPutty) {
        logText += '1) 获取服务器主机指纹…\n';
        const fp = await ensureHostKey(host, port, user);
        logText += fp ? `   指纹 ${fp}\n\n` : '   没拿到指纹，继续\n\n';
        const keyArg = fp ? ['-hostkey', fp] : [];
        runRemote = (cmd) =>
          runCommand(plink, ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host, cmd], 300000);
        runCopy = () =>
          runCommand(pscp, ['-batch', '-P', String(port), '-pw', password, ...keyArg, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000);
      } else {
'@
$newBlock = @'
      const isWinPlat = process.platform === 'win32';
      // Windows：ssh 不支持 SSH_ASKPASS，密码登录只能用 PuTTY(plink/pscp)
      // 依次找：插件自带 → 设置里填的路径 → PATH 里的 plink
      const plinkCandidates = [
        join(HERE, 'bin', 'win32', 'plink.exe'),
        join(HERE, 'bin', 'plink.exe'),
        runtimeSettings.plinkPath,
      ].filter(Boolean);
      const pscpCandidates = [
        join(HERE, 'bin', 'win32', 'pscp.exe'),
        join(HERE, 'bin', 'pscp.exe'),
        runtimeSettings.pscpPath,
      ].filter(Boolean);
      const plink = isWinPlat ? findTool('plink.exe', plinkCandidates) : '';
      const pscp = isWinPlat ? findTool('pscp.exe', pscpCandidates) : '';
      const hasPutty = !!(isWinPlat && plink && pscp);

      if (isWinPlat && !hasPutty) {
        logText += '方式: 密码登录（Windows）\n\n';
        logText += '找不到 plink.exe / pscp.exe，Windows 自带 ssh 无法用密码登录。\n';
        logText += '解决办法（任选其一）：\n';
        logText += '  1. 换成「SSH 配置」模式：先用 ssh-keygen 生成密钥并 ssh-copy-id 到服务器；\n';
        logText += '  2. 在设置里把「PuTTY 路径」填成真实的 plink.exe / pscp.exe 所在目录；\n';
        logText += '  3. 装一个 PuTTY 后点「保存并重连」再部署。\n';
        if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
        return { ok: false, message: 'Windows 缺少 plink/pscp，密码模式无法使用', log: logText };
      }

      logText += `方式: 密码登录 ${remote}:${port}（${hasPutty ? 'PuTTY: ' + plink : 'OpenSSH'}）\n\n`;

      let runRemote;
      let runCopy;

      if (hasPutty) {
        logText += '1) 获取服务器主机指纹…\n';
        const fp = await ensureHostKey(host, port, user);
        logText += fp ? `   指纹 ${fp}\n\n` : '   没拿到指纹，继续\n\n';
        const keyArg = fp ? ['-hostkey', fp] : [];
        runRemote = (cmd) =>
          runCommand(plink, ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host, cmd], 300000);
        runCopy = () =>
          runCommand(pscp, ['-batch', '-P', String(port), '-pw', password, ...keyArg, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000);
      } else {
'@
Rep $oldBlock $newBlock 'Windows 密码分支改用 findTool 解析 plink'

# ============ 3) 部署地址校验（防命令注入）============
$oldAddr = "    const usePassword = !!runtimeSettings.deployHost && !!runtimeSettings.deployPassword;"
$newAddr = @'
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
'@
Rep $oldAddr $newAddr '地址白名单校验'

# ============ 4) settings.json 权限收紧 ============
$oldSave = @'
    try {
      writeFileSync(SETTINGS_FILE, JSON.stringify(runtimeSettings, null, 2), 'utf8');
    } catch (err) {
'@
$newSave = @'
    try {
      writeFileSync(SETTINGS_FILE, JSON.stringify(runtimeSettings, null, 2), 'utf8');
      if (process.platform !== 'win32') {
        try { chmodSync(SETTINGS_FILE, 0o600); } catch {}
      }
    } catch (err) {
'@
Rep $oldSave $newSave 'settings.json 权限 600'

# ============ 5) 本地接口加 Host 校验（防外部/跨站访问）============
$oldRoute = @'
  async function handleRoute(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
'@
$newRoute = @'
  async function handleRoute(req, res) {
    // 只接受本机访问：DSH 的 Web 服务虽然只监听 127.0.0.1，
    // 但同一台机器上的其它进程/恶意页面不应该拿到令牌与部署能力。
    const hostHeader = String(req.headers?.host || '').split(':')[0].toLowerCase();
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
    if (hostHeader && !allowedHosts.has(hostHeader)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden host' }));
      return;
    }
    const site = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
    if (site && site !== 'same-origin' && site !== 'none') {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden origin' }));
      return;
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1');
'@
Rep $oldRoute $newRoute '本地接口 Host / Sec-Fetch-Site 校验'

# ============ 6) 版本号 5.0.0 ============
$c = $c.Replace("const VERSION = '2.10.0';", "const VERSION = '5.0.0';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 index.js" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

# ============ 7) package.json → 5.0.0 ============
$pf = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($pf, [System.Text.Encoding]::UTF8)
$pc = $pc.Replace('"version": "2.10.0"', '"version": "5.0.0"')
[System.IO.File]::WriteAllText($pf, $pc, (New-Object System.Text.UTF8Encoding $false))
& 'D:\IT\nodejs\node.exe' -e "const p=require('D:/DSH/work/plugin/dsh-web-relay/package.json');console.log('package.json:',p.version)"
