$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = @{ guard = $false; keyarg = $false }

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  if ($l -match 'logText \+= fp \?') {
    $out.Add('          if (!fp) {')
    $out.Add('            logText += "   拿不到主机指纹，无法在批处理模式下继续。\n";')
    $out.Add('            logText += "   请先在命令行手动执行一次下面这条命令（会询问是否信任主机，输入 y 回车）：\n";')
    $out.Add('            logText += "     `"" + plink + "`" -P " + port + " -l " + user + " " + host + " exit\n";')
    $out.Add('            if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }')
    $out.Add('            return { ok: false, message: "拿不到服务器主机指纹，请先手动信任一次主机密钥", log: logText };')
    $out.Add('          }')
    $out.Add('          logText += "   指纹 " + fp + "\n\n";')
    $done.guard = $true
    continue
  }

  if ($l -match 'const keyArg = fp \?') {
    $out.Add('          const keyArg = ["-hostkey", fp];')
    $done.keyarg = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"guard: $($done.guard)   keyArg: $($done.keyarg)"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
Select-String -Path $f -Pattern '拿不到主机指纹|const keyArg|const VERSION' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
