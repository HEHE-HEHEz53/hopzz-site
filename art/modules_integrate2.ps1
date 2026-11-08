$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$doneList = $false
$doneAudio = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]
  $t = $l.Trim()

  # 1) list_modules 返回体补 ui
  if (-not $doneList -and $t -eq '"fields": list(spec.get("fields") or []),') {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($l)
    $out.Add($indent + '"ui": spec.get("ui") or "",')
    $doneList = $true
    continue
  }

  # 2) audio 模块补 ui=audio-upload（定位到 "audio": { 块内 types 行之后）
  if (-not $doneAudio -and $t -eq '"label": "编曲参数",') {
    $out.Add($l)
    # 下一行应是 types
    $next = $lines[$i + 1]
    $out.Add($next)
    $indent = ($next -replace '^(\s*).*', '$1')
    $out.Add($indent + '"ui": "audio-upload",')
    $i = $i + 1
    $doneAudio = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"list_modules ui: $doneList   audio ui: $doneAudio"
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
Select-String -Path $f -Pattern 'spec.get\("ui"\)|audio-upload' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
