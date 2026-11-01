$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

function Rep($old, $new, $label) {
  if ($script:c.Contains($old)) {
    $script:c = $script:c.Replace($old, $new)
    "  [OK]   $label"
  } else {
    "  [SKIP] $label"
  }
}

# ---------- A. 默认设置增加部署参数 ----------
Rep @'
    sshTarget: 'vps',
    repoPath: 'D:\\DSH\\work',
  };
'@ @'
    sshTarget: 'vps',
    repoPath: 'D:\\DSH\\work',
    // 一键部署用：填了这些就用密码登录，不依赖本机 SSH 配置
    deployHost: '',
    deployPort: 22,
    deployUser: 'root',
    deployPassword: '',
    deployDomain: '',
    plinkPath: 'D:\\app\\putty\\plink.exe',
    pscpPath: 'D:\\app\\putty\\pscp.exe',
  };
'@ 'SETTINGS_DEFAULTS 增加部署参数'

# ---------- B. status 返回部署参数 ----------
Rep @'
      sshTarget: runtimeSettings.sshTarget || '',
      repoPath: runtimeSettings.repoPath || '',
    };
'@ @'
      sshTarget: runtimeSettings.sshTarget || '',
      repoPath: runtimeSettings.repoPath || '',
      deployHost: runtimeSettings.deployHost || '',
      deployPort: runtimeSettings.deployPort || 22,
      deployUser: runtimeSettings.deployUser || 'root',
      deployDomain: runtimeSettings.deployDomain || '',
      hasDeployPassword: !!runtimeSettings.deployPassword,
      plinkPath: runtimeSettings.plinkPath || '',
    };
'@ 'statusPayload 返回部署参数'

# ---------- C. /general 接收部署参数 ----------
Rep @'
        if (typeof body.repoPath === 'string' && body.repoPath.trim()) patch.repoPath = body.repoPath.trim();
'@ @'
        if (typeof body.repoPath === 'string' && body.repoPath.trim()) patch.repoPath = body.repoPath.trim();
        if (typeof body.deployHost === 'string') patch.deployHost = body.deployHost.trim();
        if (body.deployPort !== undefined) {
          const p = Number(body.deployPort);
          patch.deployPort = Number.isFinite(p) && p > 0 && p < 65536 ? p : 22;
        }
        if (typeof body.deployUser === 'string' && body.deployUser.trim()) patch.deployUser = body.deployUser.trim();
        if (typeof body.deployPassword === 'string' && body.deployPassword !== '') patch.deployPassword = body.deployPassword;
        if (typeof body.deployDomain === 'string') patch.deployDomain = body.deployDomain.trim();
        if (typeof body.plinkPath === 'string' && body.plinkPath.trim()) patch.plinkPath = body.plinkPath.trim();
'@ '/general 接收部署参数'

# ---------- D. 重写 deployWebui（支持密码登录） ----------
$newDeploy = @'
  /** 用 plink 的报错信息拿到主机指纹（第一次连接时用） */
  async function ensureHostKey(host, port, user) {
    const plink = runtimeSettings.plinkPath || 'D:\\app\\putty\\plink.exe';
    const probe = await runCommand(
      plink,
      ['-batch', '-P', String(port), '-l', user || 'root', '-pw', 'precheck', host, 'echo ok'],
      30000
    );
    const matched = /SHA256:[A-Za-z0-9+/=]+/.exec(probe.out || '');
    return matched ? matched[0] : '';
  }

  async function deployWebui() {
    const repo = runtimeSettings.repoPath || 'D:\\DSH\\work';
    const domain = runtimeSettings.deployDomain || 'ai.hopzz.top';
    const chatDir = join(repo, 'chat');
    if (!existsSync(chatDir)) {
      return { ok: false, message: '找不到 chat 目录：' + chatDir, log: '' };
    }

    let logText = `仓库: ${repo}\n目标域名: ${domain}\n\n`;
    const usePassword = !!runtimeSettings.deployHost && !!runtimeSettings.deployPassword;

    if (usePassword) {
      // ---------- 密码登录模式（plink / pscp）----------
      const host = runtimeSettings.deployHost;
      const port = Number(runtimeSettings.deployPort) || 22;
      const user = runtimeSettings.deployUser || 'root';
      const password = runtimeSettings.deployPassword;
      const plink = runtimeSettings.plinkPath || 'D:\\app\\putty\\plink.exe';
      const pscp = runtimeSettings.pscpPath || 'D:\\app\\putty\\pscp.exe';
      const remote = `${user}@${host}`;

      logText += `方式: 密码登录 ${remote}:${port}\n\n`;

      if (!existsSync(plink)) {
        return { ok: false, message: '找不到 plink：' + plink + '（在常规设置里改）', log: logText };
      }

      logText += '1) 获取服务器主机指纹…\n';
      const fp = await ensureHostKey(host, port, user);
      logText += fp ? `   指纹 ${fp}\n\n` : '   没拿到指纹，继续（可能失败）\n\n';
      const keyArg = fp ? ['-hostkey', fp] : [];

      logText += '2) 清理旧目录…\n';
      const step1 = await runCommand(
        plink,
        ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host, 'rm -rf /root/chat-deploy'],
        60000
      );
      logText += (step1.out || '') + '\n';
      if (step1.code !== 0) {
        return { ok: false, message: 'SSH 登录失败：检查 IP / 端口 / 用户名 / 密码是否正确，以及服务器是否放行该端口', log: logText };
      }

      logText += '3) 上传 chat/ 目录…\n';
      const step2 = await runCommand(
        pscp,
        ['-batch', '-P', String(port), '-pw', password, ...keyArg, '-r', chatDir, `${remote}:/root/chat-deploy`],
        300000
      );
      logText += (step2.out || '') + '\n';
      if (step2.code !== 0) {
        return { ok: false, message: '上传失败', log: logText };
      }

      logText += `4) 执行安装脚本（域名 ${domain}）…\n`;
      const step3 = await runCommand(
        plink,
        ['-batch', '-P', String(port), '-l', user, '-pw', password, ...keyArg, host,
          `bash /root/chat-deploy/install_chat.sh ${domain}`],
        300000
      );
      logText += (step3.out || '') + '\n';
      return {
        ok: step3.code === 0,
        message: step3.code === 0 ? '部署完成：https://' + domain : '安装脚本返回失败，看下面日志',
        log: logText,
      };
    }

    // ---------- SSH 配置模式（本机已配好密钥）----------
    const cfgPath = runtimeSettings.sshConfigPath || 'D:\\DSH\\work\\.ssh\\config';
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
      ['-F', cfgPath, target, `bash /root/chat-deploy/install_chat.sh ${domain}`],
      300000
    );
    logText += `$ ssh "bash install_chat.sh ${domain}"\n${step3.out}\n`;
    return {
      ok: step3.code === 0,
      message: step3.code === 0 ? '部署完成：https://' + domain : '安装脚本返回失败，看下面日志',
      log: logText,
    };
  }
'@

$pattern = '(?s)  async function deployWebui\(\) \{.*?\n  \}\n'
if ($c -match $pattern) {
  $c = [regex]::Replace($c, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{
    param($m) return $newDeploy
  }, 1)
  "  [OK]   重写 deployWebui（支持密码登录）"
} else {
  "  [FAIL] 没匹配到 deployWebui"
}

if ($c -ne $orig) {
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  "已写入"
}

"`n=== 语法检查 ==="
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"EXIT=$LASTEXITCODE"
