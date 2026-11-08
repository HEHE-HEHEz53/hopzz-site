$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = @{ create = $false; patch = $false; load = $false }

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]
  $trim = $l.Trim()

  # 1) create：modulesData 行后加 cover
  if (-not $done.create -and $trim -eq '"modulesData": _clean_modules_data(body.get("modulesData")),') {
    $out.Add($l)
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + '"cover": _clean_cover(body.get("cover")),')
    $done.create = $true
    continue
  }

  # 2) patch：modulesData 块前加 cover
  if (-not $done.patch -and $trim -eq 'if "modulesData" in body:') {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + 'if "cover" in body:')
    $out.Add($indent + '    data["cover"] = _clean_cover(body.get("cover"))')
    $done.patch = $true
    $out.Add($l)
    continue
  }

  # 3) _load：modulesData 默认后加 cover 默认
  if (-not $done.load -and $trim -eq 'data["modulesData"] = {}') {
    $out.Add($l)
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + 'if not isinstance(data.get("cover"), str):')
    $out.Add($indent + '    data["cover"] = ""')
    $done.load = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"create:$($done.create) patch:$($done.patch) load:$($done.load)"
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
Select-String -Path $f -Pattern '_clean_cover\(|data\["cover"\]' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
