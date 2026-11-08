$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$didPatch = $false
$didDefault = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  # 1) PATCH：在 "if \"fields\" in body:" 前插入 modulesData 合并
  if (-not $didPatch -and $l.Trim() -eq 'if "fields" in body:') {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + 'if "modulesData" in body:')
    $out.Add($indent + '    incoming_data = _clean_modules_data(body.get("modulesData"))')
    $out.Add($indent + '    if body.get("replaceModulesData"):')
    $out.Add($indent + '        data["modulesData"] = incoming_data')
    $out.Add($indent + '    else:')
    $out.Add($indent + '        merged_data = dict(data.get("modulesData") or {})')
    $out.Add($indent + '        for key, value in incoming_data.items():')
    $out.Add($indent + '            if value is None:')
    $out.Add($indent + '                merged_data.pop(key, None)')
    $out.Add($indent + '            else:')
    $out.Add($indent + '                merged_data[key] = value')
    $out.Add($indent + '        data["modulesData"] = merged_data')
    $didPatch = $true
    $out.Add($l)
    continue
  }

  # 2) _load 里补默认：sections 检查之后加 modulesData
  if (-not $didDefault -and $l.Trim() -eq 'if not isinstance(data.get("sections"), list):') {
    $out.Add($l)
    # 复制下一行到下一行（sections 的赋值），然后插默认
    if ($i + 1 -lt $lines.Count) {
      $next = $lines[$i + 1]
      $out.Add($next)
      $indent = ($l -replace '^(\s*).*', '$1')
      $out.Add($indent + 'if not isinstance(data.get("modulesData"), dict):')
      $out.Add($indent + '    data["modulesData"] = {}')
      $i = $i + 1
    }
    $didDefault = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"PATCH 插入: $didPatch   _load 默认: $didDefault"
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
Select-String -Path $f -Pattern 'modulesData' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
