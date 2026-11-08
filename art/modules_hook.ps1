$ErrorActionPreference = 'Stop'

# ---------- 1. app.js：有 ui 的模块改用图形编辑器 ----------
$f = 'D:\DSH\work\studio\static\app.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$done = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]

  if (-not $done -and $l.Trim() -eq "if (key === 'sections') {") {
    $indent = ($l -replace '^(\s*).*', '$1')
    $out.Add($indent + '// 该模块声明了图形编辑器（如钢琴卷帘、和弦板）时，交给 StudioModules 渲染')
    $out.Add($indent + 'if (def && def.ui && window.StudioModules &&')
    $out.Add($indent + '    typeof window.StudioModules.has === "function" &&')
    $out.Add($indent + '    window.StudioModules.has(def.ui)) {')
    $out.Add($indent + '  var customHost = h("div", { class: "module-custom" });')
    $out.Add($indent + '  var initial = (project.modulesData && project.modulesData[key]) || {};')
    $out.Add($indent + '  try {')
    $out.Add($indent + '    window.StudioModules.render(customHost, {')
    $out.Add($indent + '      projectId: project.id,')
    $out.Add($indent + '      moduleId: key,')
    $out.Add($indent + '      ui: def.ui,')
    $out.Add($indent + '      spec: def,')
    $out.Add($indent + '      data: initial,')
    $out.Add($indent + '      onSave: function (next) {')
    $out.Add($indent + '        if (!project.modulesData) project.modulesData = {};')
    $out.Add($indent + '        project.modulesData[key] = next;')
    $out.Add($indent + '        var patch = { modulesData: {} };')
    $out.Add($indent + '        patch.modulesData[key] = next;')
    $out.Add($indent + '        scheduleSave(patch);')
    $out.Add($indent + '      }')
    $out.Add($indent + '    });')
    $out.Add($indent + '    section.appendChild(customHost);')
    $out.Add($indent + '    return section;')
    $out.Add($indent + '  } catch (err) {')
    $out.Add($indent + '    section.appendChild(h("p", { class: "hint", text: "图形编辑器加载失败：" + (err && err.message ? err.message : err) }));')
    $out.Add($indent + '  }')
    $out.Add($indent + '}')
    $out.Add('')
    $done = $true
    $out.Add($l)
    continue
  }

  $out.Add($l)
}

[System.IO.File]::WriteAllLines($f, $out, (New-Object System.Text.UTF8Encoding $false))
"插入图形编辑器 hook: $done"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"app.js EXIT=$LASTEXITCODE"

# ---------- 2. index.html：引入 modules.js ----------
$html = 'D:\DSH\work\studio\static\index.html'
$h = [System.IO.File]::ReadAllText($html, [System.Text.Encoding]::UTF8)
if ($h -notmatch 'modules\.js') {
  $h = $h.Replace('<script src="/static/app.js?v=2" defer></script>', '<script src="/static/modules.js?v=1" defer></script>' + "`n  " + '<script src="/static/app.js?v=2" defer></script>')
  [System.IO.File]::WriteAllText($html, $h, (New-Object System.Text.UTF8Encoding $false))
  "  [OK] index.html 引入 modules.js"
} else { "  已引入" }
Select-String -Path $html -Pattern 'script src' | ForEach-Object { "  $($_.Line.Trim())" }
