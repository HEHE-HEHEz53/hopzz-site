$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = @{ fn = $false; call = $false }

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  # 替换整个 ensureHostKey：接收 plink 路径，并从各种输出里提指纹
  if ($l -match 'async function ensureHostKey\(host, port, user\) \{') {
    $out.Add('  /** 用 plink 探测主机指纹（plink 在 -batch 下会打印指纹后放弃连接，正好用它） */')
    $out.Add('  async function ensureHostKey(plinkPath, host, port, user) {')
    $out.Add('    if (!plinkPath) return "";')
    $out.Add('    const probe = await runCommand(')
    $out.Add('      plinkPath,')
    $out.Add('      ["-batch", "-P", String(port), "-l", user || "root", "-pw", "precheck", host, "echo ok"],')
    $out.Add('      30000')
    $out.Add('    );')
    $out.Add('    const text = probe.out || "";')
    $out.Add('    // 形如: SHA256:wCHU...Mg3o  也兼容 ssh-ed25519 2048 SHA256:xxx 这种整行')
    $out.Add('    const m = /SHA256:[A-Za-z0-9+/=]+/.exec(text);')
    $out.Add('    return m ? m[0] : "";')
    $out.Add('  }')
    $done.fn = $true
    # 跳过旧的函数体直到闭合大括号
    $depth = 1
    for ($k = $i + 1; $k -lt $lines.Count; $k++) {
      if ($lines[$k] -match '^\s*$') { continue }
      if ($lines[$k] -match '^\s{2}\}') { $i = $k; break }
    }
    continue
  }

  if ($l -match 'const fp = await ensureHostKey\(') {
    $out.Add('        const fp = await ensureHostKey(plink, host, port, user);')
    $done.call = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"ensureHostKey 重写: $($done.fn)   调用处: $($done.call)"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
Select-String -Path $f -Pattern 'function ensureHostKey|await ensureHostKey' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
