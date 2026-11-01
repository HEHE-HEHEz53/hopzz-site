$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# 1) runCommand 支持 env
$c = $c.Replace(
  "  function runCommand(cmd, args, timeoutMs = 180000) {`n    return new Promise((resolve) => {`n      let out = '';`n      let child;`n      try {`n        child = spawn(cmd, args, { windowsHide: true });",
  "  function runCommand(cmd, args, timeoutMs = 180000, extraEnv) {`n    return new Promise((resolve) => {`n      let out = '';`n      let child;`n      try {`n        child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, ...(extraEnv || {}) } });"
)

# 2) 新增 OpenSSH 密码登录辅助（放在 downloadFile 之前）
$helper = @'
  /** 生成 SSH_ASKPASS 帮助脚本，用 Windows 自带 OpenSSH 做密码登录（不需要 PuTTY） */
  function makeAskpass(password) {
    const dir = join(tmpdir(), 'hopzz-ask-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'askpass.cmd');
    const safe = String(password).replace(/([&<>|^%])/g, '^$1');
    writeFileSync(file, '@echo off\r\necho ' + safe + '\r\n', 'utf8');
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
    // Windows 自带 OpenSSH 路径
    const candidates = [
      'C:\\Windows\\System32\\OpenSSH\\' + name + '.exe',
      name,
    ];
    for (const p of candidates) {
      if (p === name) return name; // 交给 PATH
      if (existsSync(p)) return p;
    }
    return name;
  }

  /** 用 Node 自带 fetch 下载文件 */
'@
$c = $c.Replace("  /** 用 Node 自带 fetch 下载文件 */", $helper)

# 3) 替换密码登录分支：优先 plink，没有就用 OpenSSH
$newBlock = @'
    if (usePassword) {
      const host = runtimeSettings.deployHost;
      const port = Number(runtimeSettings.deployPort) || 22;
      const user = runtimeSettings.deployUser || 'root';
      const password = runtimeSettings.deployPassword;
      const remote = `${user}@${host}`;
      const plink = runtimeSettings.plinkPath || 'plink.exe';
      const pscp = runtimeSettings.pscpPath || 'pscp.exe';
      const hasPlink = existsSync(plink) && existsSync(pscp);

      logText += `方式: 密码登录 ${remote}:${port}（${hasPlink ? 'PuTTY plink' : 'Windows 自带 OpenSSH'}）\n\n`;

      let runRemote;
      let runCopy;

      if (hasPlink) {
        logText += '1) 获取服务器主机指纹…\n';
        const fp = await ensureHostKey(host, port, user);
        logText += fp ? `   指纹 ${fp}\n\n` : '   没拿到指纹，继续\n\n';
        const keyArg = fp ? ['-hostkey', fp] : [];
        runRemote = (cmd) =>
          runCommand(plink, ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host, cmd], 300000);
        runCopy = () =>
          runCommand(pscp, ['-batch', '-P', String(port), '-pw', password, ...keyArg, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000);
      } else {
        const askpass = makeAskpass(password);
        const env = sshEnv(askpass);
        const sshExe = resolveBin('ssh');
        const scpExe = resolveBin('scp');
        const base = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + join(askpass.dir, 'known_hosts'), '-p', String(port), remote];
        runRemote = (cmd) => runCommand(sshExe, [...base, cmd], 300000, env);
        runCopy = () => runCommand(scpExe, [...base, '-r', chatDir, `${remote}:/root/chat-deploy`], 300000, env);
        logText += '1) 使用 OpenSSH（首次连接自动信任主机指纹）\n\n';
      }

      logText += '2) 清理旧目录…\n';
      const step1 = await runRemote('rm -rf /root/chat-deploy');
      logText += (step1.out || '') + '\n';
      if (step1.code !== 0) {
        return { ok: false, message: 'SSH 登录失败：检查 IP / 端口 / 用户名 / 密码，以及服务器防火墙是否放行该端口', log: logText };
      }

      logText += '3) 上传 chat/ 目录…\n';
      const step2 = await runCopy();
      logText += (step2.out || '') + '\n';
      if (step2.code !== 0) return { ok: false, message: '上传失败', log: logText };

      logText += `4) 执行安装脚本（地址 ${addr}）…\n`;
      const step3 = await runRemote(`bash /root/chat-deploy/install_chat.sh ${addr}`);
      logText += (step3.out || '') + '\n';
      if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
      return {
        ok: step3.code === 0,
        message: step3.code === 0 ? '部署完成：' + addr : '安装脚本返回失败，看下面日志',
        log: logText,
      };
    }

'@
$pattern = '(?s)    if \(usePassword\) \{.*?\n    \}\n'
if ($c -match $pattern) {
  $c = [regex]::Replace($c, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) return $newBlock }, 1)
  "  [OK] 替换密码登录分支（plink 或 OpenSSH）"
} else {
  "  [FAIL] 没匹配到 usePassword 分支"
}

$c = $c.Replace("const VERSION = '2.6.0';", "const VERSION = '2.7.0';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
$p2 = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($p2,[System.Text.Encoding]::UTF8).Replace('"version": "2.6.0"','"version": "2.7.0"')
[System.IO.File]::WriteAllText($p2, $pc, (New-Object System.Text.UTF8Encoding $false))
"package.json 版本已改"
