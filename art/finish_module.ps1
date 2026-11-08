$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\studio\server\projects.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---------- 1. 新增 finish（完成/发布）模块 ----------
if ($c -notmatch '"finish":') {
  $anchor = '    "sections": {'
  $finish = @'
    "finish": {
        "label": "完成 / 发布",
        "types": ["*"],
        "ui": "finish-board",
        "fields": [],
    },
    "sections": {
'@
  $c = $c.Replace($anchor, $finish)
  "  [OK] 新增 finish 模块"
}

# ---------- 2. music 默认带 finish ----------
$c = $c.Replace(
  '"music": ["meta", "audio", "piano-roll", "lyrics", "chords", "sections"],',
  '"music": ["meta", "audio", "piano-roll", "lyrics", "chords", "sections", "finish"],'
)

# ---------- 3. 项目封面 cover 字段 ----------
$oldCreate = @'
        "modulesData": _clean_modules_data(body.get("modulesData")),
        "sections": _clean_sections(body.get("sections")),
    }
'@
$newCreate = @'
        "modulesData": _clean_modules_data(body.get("modulesData")),
        "cover": _clean_cover(body.get("cover")),
        "sections": _clean_sections(body.get("sections")),
    }
'@
if ($c.Contains($oldCreate)) { $c = $c.Replace($oldCreate, $newCreate); "  [OK] create 支持 cover" }
else { "  [SKIP] create anchor" }

# PATCH 允许 cover
$oldPatch = @'
      if "modulesData" in body:
'@
$newPatch = @'
      if "cover" in body:
          data["cover"] = _clean_cover(body.get("cover"))
      if "modulesData" in body:
'@
if ($c.Contains($oldPatch)) { $c = $c.Replace($oldPatch, $newPatch); "  [OK] PATCH 支持 cover" }
else { "  [SKIP] patch anchor" }

# 清洗函数 + 默认值
$helper = @'
def _clean_cover(raw: Any) -> str:
    """项目封面：项目目录里的相对路径，只允许常见图片扩展名。"""
    if raw is None:
        return ""
    value = str(raw).strip().replace("\\", "/").lstrip("/")
    if not value:
        return ""
    if ".." in value.split("/"):
        _fail(400, "封面路径不合法")
    if len(value) > 300:
        _fail(400, "封面路径太长")
    allowed = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp")
    if not value.lower().endswith(allowed):
        _fail(400, "封面必须是图片文件（jpg/png/webp/gif/avif/bmp）")
    return value


def _clean_modules_data(raw: Any) -> dict[str, Any]:
'@
if ($c -notmatch 'def _clean_cover') {
  $c = $c.Replace('def _clean_modules_data(raw: Any) -> dict[str, Any]:', $helper)
  "  [OK] 增加 _clean_cover"
}

# _load 默认 cover
$oldDefault = @'
    if not isinstance(data.get("modulesData"), dict):
        data["modulesData"] = {}
'@
$newDefault = @'
    if not isinstance(data.get("modulesData"), dict):
        data["modulesData"] = {}
    if not isinstance(data.get("cover"), str):
        data["cover"] = ""
'@
if ($c.Contains($oldDefault)) { $c = $c.Replace($oldDefault, $newDefault); "  [OK] _load 默认 cover" }
else { "  [SKIP] _load 默认锚点" }

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 projects.py" }
& python -c "import ast;ast.parse(open(r'D:\DSH\work\studio\server\projects.py',encoding='utf-8').read());print('projects.py OK')"
Select-String -Path $f -Pattern '_clean_cover|"finish"' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
