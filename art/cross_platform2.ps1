$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# ---- A. 清掉写死的 Windows 默认路径 ----
$c = $c.Replace("'D:\\DSH\\work\\.ssh\\config'", "''")
$c = $c.Replace("'D:\\DSH\\work'", "''")
$c = $c.Replace("'D:\\app\\putty\\plink.exe'", "'plink.exe'")
$c = $c.Replace("'D:\\app\\putty\\pscp.exe'", "'pscp.exe'")

# ---- B. 按行替换 makeAskpass / resolveBin 两个函数 ----
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)

function ReplaceFunc([string[]]$arr, [string]$sig, [string[]]$replacement) {
  $start = -1
  for ($i = 0; $i -lt $arr.Count; $i++) {
    if ($arr[$i].Trim() -eq $sig) { $start = $i; break }
  }
  if ($start -lt 0) { return @{ ok = $false; lines = $arr } }
  # 找到函数结束（缩进 2 空格的 }）
  $end = -1
  for ($j = $start + 1; $j -lt $arr.Count; $j++) {
    if ($arr[$j] -eq '  }') { $end = $j; break }
  }
  if ($end -lt 0) { return @{ ok = $false; lines = $arr } }
  $out = @()
  $out += $arr[0..($start - 1)]
  $out += $replacement
  $out += $arr[($end + 1)..($arr.Count - 1)]
  return @{ ok = $true; lines = $out }
}

$newAsk = @(
'  function makeAskpass(password) {'
'    const dir = join(tmpdir(), ''hopzz-ask-'' + Date.now());'
'    mkdirSync(dir, { recursive: true });'
'    const isWin = process.platform === ''win32'';'
'    const file = join(dir, isWin ? ''askpass.cmd'' : ''askpass.sh'');'
'    const raw = String(password);'
'    if (isWin) {'
'      const safe = raw.replace(/([&<>|^%])/g, ''^$1'');'
'      writeFileSync(file, ''@echo off\r\necho '' + safe + ''\r\n'', ''utf8'');'
'    } else {'
'      const safe = raw.replace(/''/g, "''" + "\\\\" + "''''");'
'      writeFileSync(file, "#!/bin/sh\nprintf ''%s\\n'' " + "''" + safe + "''" + "\n", ''utf8'');'
'      try { chmodSync(file, 0o700); } catch {}'
'    }'
'    return { file, dir };'
'  }'
)

$newRes = @(
'  function resolveBin(name) {'
'    if (process.platform === ''win32'') {'
'      const sys = ''C:\\Windows\\System32\\OpenSSH\\'' + name + ''.exe'';'
'      if (existsSync(sys)) return sys;'
'      return name + ''.exe'';'
'    }'
'    return name;'
'  }'
)

$a = ReplaceFunc $lines 'function makeAskpass(password) {' $newAsk
if ($a.ok) { $lines = $a.lines; "  [OK] makeAskpass 已跨平台" } else { "  [FAIL] makeAskpass" }

$b = ReplaceFunc $lines 'function resolveBin(name) {' $newRes
if ($b.ok) { $lines = $b.lines; "  [OK] resolveBin 已跨平台" } else { "  [FAIL] resolveBin" }

[System.IO.File]::WriteAllLines($f, $lines, (New-Object System.Text.UTF8Encoding $false))
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

"=== 残留写死路径 ==="
$hard = Select-String -Path $f -Pattern "D:\\\\app|D:\\\\DSH" -ErrorAction SilentlyContinue
if ($hard) { $hard | ForEach-Object { "  !! $($_.LineNumber): $($_.Line.Trim())" } } else { "  OK 无" }
"=== 跨平台标记 ==="
foreach ($k in @('process.platform', 'chmodSync', 'askpass.sh', "plink.exe'")) {
  $n = ([regex]::Matches($c, [regex]::Escape($k))).Count
  "  {0,-20} {1}" -f $k, $n
}
