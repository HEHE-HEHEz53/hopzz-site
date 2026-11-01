$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# 1) 增加 node:os / mkdirSync
$c = $c.Replace(
  "import { readFileSync, writeFileSync, existsSync } from 'node:fs';",
  "import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';`nimport { tmpdir } from 'node:os';"
)

# 2) 默认值清空（不再预填我的路径/主机）
$c = $c.Replace("    sshConfigPath: 'D:\\\\DSH\\\\work\\\\.ssh\\\\config',", "    sshConfigPath: '',")
$c = $c.Replace("    sshTarget: 'vps',", "    sshTarget: '',")
$c = $c.Replace("    repoPath: 'D:\\\\DSH\\\\work',", "    repoPath: '',")
$c = $c.Replace("    plinkPath: 'D:\\\\app\\\\putty\\\\plink.exe',", "    plinkPath: 'plink.exe',")
$c = $c.Replace("    pscpPath: 'D:\\\\app\\\\putty\\\\pscp.exe',", "    pscpPath: 'pscp.exe',")
$c = $c.Replace(
  "    deployDomain: '',",
  "    deployDomain: '',`n    sourceUrl: 'https://hopzz.top/dl/chat-src.tar.gz',"
)

# 3) deployWebui：没有本地 chat 目录就自动下载源码
$oldHead = @'
  async function deployWebui() {
    const repo = runtimeSettings.repoPath || 'D:\\DSH\\work';
    const domain = runtimeSettings.deployDomain || 'ai.hopzz.top';
    const chatDir = join(repo, 'chat');
    if (!existsSync(chatDir)) {
      return { ok: false, message: '找不到 chat 目录：' + chatDir, log: '' };
    }
'@
$newHead = @'
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
        sourceNote = '源码来源：在线下载\n';
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
'@
if ($c.Contains($oldHead)) { $c = $c.Replace($oldHead, $newHead); "  [OK] deployWebui 增加自动下载源码" }
else { "  [FAIL] deployWebui 头部未匹配" }

# 4) 部署调用里把 domain 换成 addr
$c = $c.Replace('let logText = `仓库: ${repo}\n目标域名: ${domain}\n\n`;', 'let logText = sourceNote + `目标地址: ${addr}\n\n`;')
$c = $c.Replace('`bash /root/chat-deploy/install_chat.sh ${domain}`', '`bash /root/chat-deploy/install_chat.sh ${addr}`')
$c = $c.Replace("message: step3.code === 0 ? '部署完成：https://' + domain : '安装脚本返回失败，看下面日志',", "message: step3.code === 0 ? '部署完成：' + addr : '安装脚本返回失败，看下面日志',")

# 5) 版本号
$c = $c.Replace("const VERSION = '2.5.0';", "const VERSION = '2.6.0';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 index.js" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

# 6) client.js：去掉灰色预填提示
$g = 'D:\DSH\work\plugin\dsh-web-relay\client.js'
$d = [System.IO.File]::ReadAllText($g, [System.Text.Encoding]::UTF8)
$d = $d.Replace("placeholder: '64.83.20.24',", "placeholder: '',")
$d = $d.Replace("placeholder: 'root',", "placeholder: '',")
$d = $d.Replace("placeholder: 'ai.hopzz.top（要解析到这台服务器）',", "placeholder: '域名，或 IP:端口，例如 1.2.3.4:8888',")
$d = $d.Replace("placeholder: 'wss://ai.hopzz.top/agent-ws',", "placeholder: '',")
$d = $d.Replace("placeholder: 'D:\\\\DSH\\\\work\\\\.ssh\\\\config',", "placeholder: '',")
$d = $d.Replace("placeholder: 'vps',", "placeholder: '',")
$d = $d.Replace("placeholder: '64 位十六进制',", "placeholder: '',")
$d = $d.Replace("'服务器 IP'", "'服务器地址'")
[System.IO.File]::WriteAllText($g, $d, (New-Object System.Text.UTF8Encoding $false))
& 'D:\IT\nodejs\node.exe' --check $g 2>&1 | Out-String
"client.js EXIT=$LASTEXITCODE"
