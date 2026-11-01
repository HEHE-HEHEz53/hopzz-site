$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---------- 1. 去掉 schemastery 导入（这是崩溃根因）----------
$oldImport = "import Schema from '@deepseek-ai/schemastery';"
if ($c.Contains($oldImport)) {
  $c = $c.Replace($oldImport, "// 不再依赖 @deepseek-ai/schemastery：插件是软链接安装，Node 从真实路径解析，找不到 DSH 内部包。")
  "  [OK] 去掉 schemastery 导入"
} else { "  [SKIP] 没有 schemastery 导入" }

# ---------- 2. 去掉 Config 导出（改为运行时默认值）----------
$configPattern = '(?s)export const Config = Schema\.object\(\{.*?\n\}\);\n'
if ($c -match $configPattern) {
  $c = [regex]::Replace($c, $configPattern, "", 1)
  "  [OK] 去掉 Config 导出"
} else { "  [SKIP] 没找到 Config 块" }

# ---------- 3. apply 里给 config 兜底 ----------
$oldApply = 'export function apply(ctx, config) {'
if ($c.Contains($oldApply)) {
  $c = $c.Replace($oldApply, "export function apply(ctx, config = {}) {`n  config = config || {};")
  "  [OK] apply 增加 config 兜底"
} else { "  [SKIP] 没找到 apply" }

if ($c -ne $orig) {
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  "已写入"
}

"`n=== 语法检查 ==="
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"EXIT=$LASTEXITCODE"

"`n=== 还剩哪些 import ==="
Select-String -Path $f -Pattern '^import ' | ForEach-Object { "  " + $_.Line.Trim() }
"`n=== 是否还引用 Schema / @deepseek-ai ==="
$left = Select-String -Path $f -Pattern 'Schema|@deepseek-ai' -ErrorAction SilentlyContinue
if ($left) { $left | ForEach-Object { "  !! $($_.LineNumber): $($_.Line.Trim())" } } else { "  OK：无残留" }
