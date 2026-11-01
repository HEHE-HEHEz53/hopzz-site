$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)

# 第 278 行（1-based）是 if (usePassword) {，第 335 行是它的收尾 }（336 是注释）
$start = 277      # 0-based
$end = 334        # 0-based：到 "    }" 之前一行，即保留 335 行前的空行
# 确认边界
"起点行: " + $lines[$start].Trim()
"结束行(前): " + $lines[$end].Trim()
"结束行: " + $lines[$end+1].Trim()

$block = @'
    if (usePassword) {
      const host = runtimeSettings.deployHost;
      const port = Number(runtimeSettings.deployPort) || 22;
      const user = runtimeSettings.deployUser || 'root';
      const password = runtimeSettings.deployPassword;
      const remote = `${user}@${host}`;
      const plink = runtimeSettings.plinkPath || 'plink.exe';
      const pscp = runtimeSettings.pscpPath || 'pscp.exe';
      const hasPutty = existsSync(plink) && existsSync(pscp);

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
'@

$new = @()
$new += $lines[0..($start-1)]
$new += ($block -split "`r?`n")
$new += $lines[($end+1)..($lines.Count-1)]
[System.IO.File]::WriteAllLines($f, $new, (New-Object System.Text.UTF8Encoding $false))
"已替换第 $($start+1)-$($end+1) 行"

& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
"=== 关键点检查 ==="
foreach($k in @('hasPutty','makeAskpass','SSH_ASKPASS_REQUIRE','install_chat.sh ${addr}','const VERSION')){
  $n = (Select-String -Path $f -Pattern ([regex]::Escape($k)) -AllMatches | ForEach-Object { $_.Matches.Count } | Measure-Object -Sum).Sum
  "  {0,-24} {1}" -f $k, $n
}