$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---- 1. 跨平台 askpass（Windows 用 .cmd，其他系统用 .sh）----
$oldAsk = @'
  function makeAskpass(password) {
    const dir = join(tmpdir(), 'hopzz-ask-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'askpass.cmd');
    const safe = String(password).replace(/([&<>|^%])/g, '^$1');
    writeFileSync(file, '@echo off\r\necho ' + safe + '\r\n', 'utf8');
    return { file, dir };
  }
'@
$newAsk = @'
  function makeAskpass(password) {
    const dir = join(tmpdir(), 'hopzz-ask-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const isWin = process.platform === 'win32';
    const file = join(dir, isWin ? 'askpass.cmd' : 'askpass.sh');
    const raw = String(password);
    if (isWin) {
      // cmd：转义特殊字符
      const safe = raw.replace(/([&<>|^%])/g, '^$1');
      writeFileSync(file, '@echo off\r\necho ' + safe + '\r\n', 'utf8');
    } else {
      // POSIX：单引号包裹，内部单引号用 '\'' 转义
      const safe = raw.replace(/'/g, "'\\''");
      writeFileSync(file, "#!/bin/sh\nprintf '%s\\n' '" + safe + "'\n", 'utf8');
      try { chmodSync(file, 0o700); } catch {}
    }
    return { file, dir, isWin };
  }
'@
if ($c.Contains($oldAsk)) { $c = $c.Replace($oldAsk, $newAsk); "  [OK] askpass 跨平台" }
else { "  [SKIP] askpass 未匹配" }

# ---- 2. resolveBin 跨平台：只在 Windows 才补 System32\OpenSSH ----
$oldRes = @'
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
'@
$newRes = @'
  function resolveBin(name) {
    // 先看 PATH（各系统通用）；Windows 上再补 System32\OpenSSH
    if (process.platform === 'win32') {
      const sys = 'C:\\Windows\\System32\\OpenSSH\\' + name + '.exe';
      if (existsSync(sys)) return sys;
      return name + '.exe';
    }
    return name;
  }
'@
if ($c.Contains($oldRes)) { $c = $c.Replace($oldRes, $newRes); "  [OK] resolveBin 跨平台" }
else { "  [SKIP] resolveBin 未匹配" }

# ---- 3. 引入 chmodSync ----
$c = $c.Replace(
  "import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';",
  "import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, chmodSync } from 'node:fs';"
)

# ---- 4. PuTTY 只认显式路径；默认走 OpenSSH ----
$c = $c.Replace(
  "      const hasPutty = existsSync(plink) && existsSync(pscp);",
  "      // PuTTY 只有显式填了完整路径才用；否则一律用系统自带 OpenSSH（Win/Linux/macOS 都有）`n      const hasPutty = existsSync(plink) && existsSync(pscp);"
)

# ---- 5. 版本 ----
$c = $c.Replace("const VERSION = '2.7.0';", "const VERSION = '2.8.0';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

$p2 = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($p2,[System.Text.Encoding]::UTF8).Replace('"version": "2.7.0"','"version": "2.8.0"')
[System.IO.File]::WriteAllText($p2, $pc, (New-Object System.Text.UTF8Encoding $false))
"版本 -> 2.8.0"

"=== 检查还有没有写死的 Windows 路径 ==="
$hard = Select-String -Path $f -Pattern 'C:\\\\Windows|D:\\\\app|D:\\\\DSH' -ErrorAction SilentlyContinue
if ($hard) { $hard | ForEach-Object { "  !! $($_.LineNumber): $($_.Line.Trim())" } } else { "  OK：无写死路径" }
