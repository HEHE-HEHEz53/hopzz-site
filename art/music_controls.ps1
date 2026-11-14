$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\static\player.css'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  if (-not $done -and $l.Trim() -eq '.controls { justify-content: space-between; padding: 0 clamp(6px, 6vw, 40px); }') {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + '/* 手机端：三个主控严格居中，「更多」固定右侧 */')
    $out.Add($indent + '.controls {')
    $out.Add($indent + '  justify-content: center;')
    $out.Add($indent + '  gap: clamp(26px, 11vw, 52px);')
    $out.Add($indent + '  padding: 0;')
    $out.Add($indent + '}')
    $out.Add($indent + '#moreBtn {')
    $out.Add($indent + '  position: absolute;')
    $out.Add($indent + '  right: 0;')
    $out.Add($indent + '  top: 50%;')
    $out.Add($indent + '  transform: translateY(-50%);')
    $out.Add($indent + '}')
    $out.Add($indent + '.progress { height: 26px; }')
    $out.Add($indent + '.progress-thumb { opacity: 1; }')
    # 跳过后面两行旧规则
    $skip = 0
    for ($k = $i + 1; $k -lt [Math]::Min($i + 4, $lines.Count); $k++) {
      if ($lines[$k] -match '^\.controls \.icon-btn#moreBtn|^\.controls::after') { $skip++ }
    }
    $i = $i + $skip
    $done = $true
    continue
  }
  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"替换旧规则: $done"
Select-String -Path $f -Pattern '::after \{ content: ""; width: 42px|justify-content: center;|#moreBtn \{' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
