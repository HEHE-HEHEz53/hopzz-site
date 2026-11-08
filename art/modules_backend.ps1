$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---------- 1. 模块加 ui 字段（图形编辑器标识） ----------
function AddUI([string]$moduleId, [string]$ui) {
  $pattern = '("' + $moduleId + '": \{\r?\n\s*"label": "[^"]*",\r?\n\s*"types": \[[^\]]*\],)'
  $replacement = '$1' + "`r`n        `"ui`": `"$ui`","
  if ($script:c -match $pattern) {
    $script:c = [regex]::Replace($script:c, $pattern, $replacement, 1)
    "  [OK] $moduleId -> ui=$ui"
  } else {
    "  [SKIP] $moduleId 未匹配"
  }
}

AddUI 'chords' 'chord-board'
AddUI 'sections' 'section-timeline'
AddUI 'palette' 'palette-swatches'
AddUI 'outline' 'outline-tree'
AddUI 'shots' 'shot-list'
AddUI 'timeline' 'timeline-track'

# ---------- 2. 新增 piano-roll 模块（MIDI 钢琴卷帘） ----------
if ($c -notmatch '"piano-roll"') {
  $anchor = '    "sections": {'
  $piano = @'
    "piano-roll": {
        "label": "MIDI 钢琴卷帘",
        "types": ["music"],
        "ui": "piano-roll",
        "fields": [],
    },
    "sections": {
'@
  if ($c.Contains($anchor)) {
    $c = $c.Replace($anchor, $piano)
    "  [OK] 新增 piano-roll 模块"
  } else { "  [SKIP] piano-roll 锚点未找到" }
}

# ---------- 3. modulesData：结构化模块数据 ----------
$oldCreate = @'
        "fields": _clean_fields(body.get("fields")),
        "sections": _clean_sections(body.get("sections")),
    }
'@
$newCreate = @'
        "fields": _clean_fields(body.get("fields")),
        "modulesData": _clean_modules_data(body.get("modulesData")),
        "sections": _clean_sections(body.get("sections")),
    }
'@
if ($c.Contains($oldCreate)) { $c = $c.Replace($oldCreate, $newCreate); "  [OK] create 支持 modulesData" }
else { "  [SKIP] create 锚点" }

# 清洗函数：插在 _clean_sections 之前
$helper = @'
def _clean_modules_data(raw: Any) -> dict[str, Any]:
    """结构化模块数据：{moduleId: {任意 JSON}}，单模块上限 512 KB。"""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        _fail(400, "modulesData 必须是对象")
    out: dict[str, Any] = {}
    for key, value in list(raw.items())[:60]:
        if not isinstance(key, str) or not key.strip():
            _fail(400, "modulesData 的键必须是非空字符串")
        try:
            size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
        except (TypeError, ValueError):
            _fail(400, f"模块 {key} 的数据不是合法 JSON")
        if size > 512 * 1024:
            _fail(400, f"模块 {key} 的数据超过 512KB")
        out[key.strip()] = value
    return out


def _clean_sections(raw: Any) -> list[dict[str, Any]]:
'@
if ($c -notmatch '_clean_modules_data') {
  $c = $c.Replace('def _clean_sections(raw: Any) -> list[dict[str, Any]]:', $helper)
  "  [OK] 增加 _clean_modules_data"
}

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 projects.py" }
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
"=== ui 标记确认 ==="
Select-String -Path $f -Pattern '"ui": "' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
Select-String -Path $f -Pattern 'modulesData' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
