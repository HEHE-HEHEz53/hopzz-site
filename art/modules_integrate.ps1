$ErrorActionPreference = 'Stop'

# ---------- 1. 后端：list_modules 返回 ui ----------
$f = 'D:\DSH\work\studio\server\projects.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$old = @'
              "label": spec.get("label") or module_id,
              "types": list(spec.get("types") or ["*"]),
              "fields": list(spec.get("fields") or []),
'@
$new = @'
              "label": spec.get("label") or module_id,
              "types": list(spec.get("types") or ["*"]),
              "fields": list(spec.get("fields") or []),
              "ui": spec.get("ui") or "",
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] list_modules 返回 ui" }
else { "  [SKIP] list_modules 未匹配" }

# audio 模块加 ui
$oldAudio = @'
      "audio": {
          "label": "编曲参数",
          "types": ["music"],
          "fields": [
'@
$newAudio = @'
      "audio": {
          "label": "编曲参数",
          "types": ["music"],
          "ui": "audio-upload",
          "fields": [
'@
if ($c.Contains($oldAudio)) { $c = $c.Replace($oldAudio, $newAudio); "  [OK] audio 模块加 ui=audio-upload" }
else { "  [SKIP] audio 模块未匹配" }

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 projects.py" }
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"

# ---------- 2. app.js：normalizeModule 保留 ui ----------
$af = 'D:\DSH\work\studio\static\app.js'
$lines = [System.IO.File]::ReadAllLines($af, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]
  # 在 normalizeModule 里 return 对象处补 ui
  if (-not $done -and $l -match 'return \{ key: key, label: label, types: types, fields: normalizedFields \};') {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + 'return {')
    $out.Add($indent + '  key: key,')
    $out.Add($indent + '  label: label,')
    $out.Add($indent + '  types: types,')
    $out.Add($indent + '  ui: module.ui ? String(module.ui) : "",')
    $out.Add($indent + '  fields: normalizedFields')
    $out.Add($indent + '};')
    $done = $true
    continue
  }
  $out.Add($l)
}
[System.IO.File]::WriteAllLines($af, $out, (New-Object System.Text.UTF8Encoding $false))
"normalizeModule 补 ui: $done"
& 'D:\IT\nodejs\node.exe' --check $af 2>&1 | Out-String
"app.js EXIT=$LASTEXITCODE"

# ---------- 3. index.html：modules.js 版本号 bump ----------
$html = 'D:\DSH\work\studio\static\index.html'
$h = [System.IO.File]::ReadAllText($html, [System.Text.Encoding]::UTF8)
$h = $h.Replace('/static/modules.js?v=1', '/static/modules.js?v=3')
[System.IO.File]::WriteAllText($html, $h, (New-Object System.Text.UTF8Encoding $false))
"modules.js 版本 -> v3"

"=== 确认 ==="
Select-String -Path 'D:\DSH\work\studio\static\app.js' -Pattern 'ui: module.ui' | ForEach-Object { "  app.js:$($_.LineNumber): $($_.Line.Trim())" }
Select-String -Path $f -Pattern '"ui": ' | ForEach-Object { "  projects.py:$($_.LineNumber): $($_.Line.Trim())" }
