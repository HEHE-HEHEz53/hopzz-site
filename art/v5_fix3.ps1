$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = @{ plink = $false; save = $false; route = $false; guard = $false }

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  if ($l -match 'const bundledPlink = join\(HERE') {
    $out.Add('      const isWinPlat = process.platform === "win32";')
    $out.Add('      const plinkCandidates = [' )
    $out.Add('        join(HERE, "bin", "win32", "plink.exe"),' )
    $out.Add('        join(HERE, "bin", "plink.exe"),' )
    $out.Add('        runtimeSettings.plinkPath,' )
    $out.Add('      ].filter(Boolean);' )
    $out.Add('      const pscpCandidates = [' )
    $out.Add('        join(HERE, "bin", "win32", "pscp.exe"),' )
    $out.Add('        join(HERE, "bin", "pscp.exe"),' )
    $out.Add('        runtimeSettings.pscpPath,' )
    $out.Add('      ].filter(Boolean);' )
    $out.Add('      const plink = isWinPlat ? findTool("plink.exe", plinkCandidates) : "";')
    $out.Add('      const pscp = isWinPlat ? findTool("pscp.exe", pscpCandidates) : "";')
    $done.plink = $true
    $skip = 0
    for ($k = $i + 1; $k -lt [Math]::Min($i + 8, $lines.Count); $k++) {
      if ($lines[$k] -match 'const (bundledPscp|isWinPlat|plink|pscp) =') { $skip++ }
    }
    $i = $i + $skip
    continue
  }

  if ($l -match 'const hasPutty = ') {
    $out.Add('      const hasPutty = !!(isWinPlat && plink && pscp);')
    $out.Add('')
    $out.Add('      if (isWinPlat && !hasPutty) {')
    $out.Add('        logText += "方式: 密码登录（Windows）\n\n";')
    $out.Add('        logText += "找不到 plink.exe / pscp.exe，Windows 自带 ssh 无法用密码登录。\n";')
    $out.Add('        logText += "解决办法（任选其一）：\n";')
    $out.Add('        logText += "  1. 用 ssh-keygen 生成密钥并上传服务器，改用「SSH 配置」模式；\n";')
    $out.Add('        logText += "  2. 装一个 PuTTY，把 plink.exe 所在目录填到设置里的 PuTTY 路径；\n";')
    $out.Add('        logText += "  3. 目标就是本机时改用「本机直装」（自动生效）。\n";')
    $out.Add('        if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }')
    $out.Add('        return { ok: false, message: "Windows 缺少 plink/pscp，密码模式无法使用", log: logText };')
    $out.Add('      }')
    $done.guard = $true
    continue
  }

  if ($l -match 'writeFileSync\(SETTINGS_FILE') {
    $out.Add($l)
    $out.Add('      if (process.platform !== "win32") {')
    $out.Add('        try { chmodSync(SETTINGS_FILE, 0o600); } catch {}')
    $out.Add('      }')
    $done.save = $true
    continue
  }

  if ($l -match 'async function handleRoute\(req, res\) \{') {
    $out.Add($l)
    $out.Add('    const hostHeader = String((req.headers && req.headers.host) || "").split(":")[0].toLowerCase();')
    $out.Add('    const allowedHosts = ["127.0.0.1", "localhost", "[::1]", "::1", ""];')
    $out.Add('    if (allowedHosts.indexOf(hostHeader) === -1) {')
    $out.Add('      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });')
    $out.Add('      res.end(JSON.stringify({ ok: false, error: "forbidden host" }));')
    $out.Add('      return;')
    $out.Add('    }')
    $out.Add('    const fetchSite = String((req.headers && req.headers["sec-fetch-site"]) || "").toLowerCase();')
    $out.Add('    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {')
    $out.Add('      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });')
    $out.Add('      res.end(JSON.stringify({ ok: false, error: "forbidden origin" }));')
    $out.Add('      return;')
    $out.Add('    }')
    $done.route = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"plink: $($done.plink)  guard: $($done.guard)  save: $($done.save)  route: $($done.route)"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
