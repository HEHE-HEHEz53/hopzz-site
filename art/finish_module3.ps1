$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$addedHelpers = $false
$fixedLoad = $false

$helpers = @(
'    def _clean_cover(raw: Any) -> str:',
'        """项目封面：项目目录里的相对图片路径。"""',
'        if raw is None:',
'            return ""',
'        value = str(raw).strip().replace("\\", "/").lstrip("/")',
'        if not value:',
'            return ""',
'        if ".." in value.split("/"):',
'            _fail(400, "封面路径不合法")',
'        if len(value) > 300:',
'            _fail(400, "封面路径太长")',
'        allowed = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp")',
'        if not value.lower().endswith(allowed):',
'            _fail(400, "封面必须是图片文件（jpg/png/webp/gif/avif/bmp）")',
'        return value',
'',
'',
'    def _clean_modules_data(raw: Any) -> dict[str, Any]:',
'        """结构化模块数据：{moduleId: 任意 JSON}，单模块上限 512 KB。"""',
'        if raw is None:',
'            return {}',
'        if not isinstance(raw, dict):',
'            _fail(400, "modulesData 必须是对象")',
'        out_data: dict[str, Any] = {}',
'        for key, value in list(raw.items())[:60]:',
'            if not isinstance(key, str) or not key.strip():',
'                _fail(400, "modulesData 的键必须是非空字符串")',
'            try:',
'                size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))',
'            except (TypeError, ValueError):',
'                _fail(400, "模块 " + str(key) + " 的数据不是合法 JSON")',
'            if size > 512 * 1024:',
'                _fail(400, "模块 " + str(key) + " 的数据超过 512KB")',
'            out_data[key.strip()] = value',
'        return out_data',
'',
''
)

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  # 1) 在 _clean_sections 前插入两个嵌套 helper（4 空格缩进）
  if (-not $addedHelpers -and $l -match '^\s{4}def _clean_sections\(') {
    foreach ($h in $helpers) { $out.Add($h) }
    $addedHelpers = $true
    $out.Add($l)
    continue
  }

  # 2) 修正 _load 里 cover 默认的缩进（原来被嵌进 modulesData 的 if 里）
  if ($l -match '^\s{8}if not isinstance\(data\.get\("cover"\), str\):') {
    $out.Add('    if not isinstance(data.get("cover"), str):')
    $out.Add('        data["cover"] = ""')
    $i = $i + 1  # 跳过原来的下一行赋值
    $fixedLoad = $true
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"helpers: $addedHelpers   修 cover 缩进: $fixedLoad"
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
Select-String -Path $f -Pattern 'def _clean_cover|def _clean_modules_data|data\["cover"\] = ""' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
