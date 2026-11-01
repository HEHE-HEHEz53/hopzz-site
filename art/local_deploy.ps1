$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# 1) 引入 networkInterfaces
$c = $c.Replace(
  "import { tmpdir } from 'node:os';",
  "import { tmpdir, networkInterfaces } from 'node:os';"
)

# 2) 新增 isLocalTarget（放在 downloadFile 之前）
$helper = @'
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
'@
$c = $c.Replace("  /** 用 Node 自带 fetch 下载文件 */", $helper)

# 3) 在 usePassword 判断之前插入本机直装分支
$marker = '    let logText = sourceNote + `目标地址: ${addr}\n\n`;'
if (-not $c.Contains($marker)) { throw '找不到 logText 标记' }

$localBlock = @'
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
        message: step.code === 0 ? '部署完成：' + addr : '安装脚本返回失败（可能是权限问题，需要 root）',
        log: logText,
      };
    }
'@
$c = $c.Replace($marker, $localBlock)

# 4) 版本
$c = $c.Replace("const VERSION = '2.9.2';", "const VERSION = '2.9.3';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
Select-String -Path $f -Pattern 'isLocalTarget|本机直装|const VERSION' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
