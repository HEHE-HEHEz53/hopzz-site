$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\deploy\site\index.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# 1) 关于文案
$oldAbout = "          <p>`r`n            做编曲、词曲、绘画、代码和视频。都在学，习惯一边查资料一边做。`r`n          </p>`r`n          <p>`r`n            这个站是 DeepSeek 的鲸鱼娘写的。我负责说要什么，以及挑毛病。`r`n          </p>"
if (-not $c.Contains($oldAbout)) {
  $oldAbout = $oldAbout.Replace("`r`n", "`n")
}
$newAbout = "          <p>`r`n            编曲、词曲、绘画、代码、视频。`r`n          </p>`r`n          <p>`r`n            作品和工作过程都放在这边。`r`n          </p>"
if (-not $c.Contains($oldAbout)) { $newAbout = $newAbout.Replace("`r`n", "`n") }
if ($c.Contains($oldAbout)) { $c = $c.Replace($oldAbout, $newAbout); "  [OK] 关于文案" } else { "  [SKIP] 关于文案" }

# 2) 工具 / 状态
if ($c.Contains('              <dd>终端 · 一点 Python</dd>')) {
  $c = $c.Replace('              <dd>终端 · 一点 Python</dd>', '              <dd>DAW · 画板 · 编辑器</dd>')
  "  [OK] 工具行"
}
$oldStatus = "            <div>`r`n              <dt>状态</dt>`r`n              <dd><span class=`"badge`">社恐 · 回复慢</span></dd>`r`n            </div>"
if (-not $c.Contains($oldStatus)) { $oldStatus = $oldStatus.Replace("`r`n", "`n") }
$newStatus = "            <div>`r`n              <dt>仓库</dt>`r`n              <dd><a class=`"facts__link`" href=`"https://github.com/HEHE-HEHEz53/hopzz-site`" target=`"_blank`" rel=`"noopener noreferrer`">GitHub</a></dd>`r`n            </div>"
if (-not $c.Contains($oldStatus)) { $newStatus = $newStatus.Replace("`r`n", "`n") }
if ($c.Contains($oldStatus)) { $c = $c.Replace($oldStatus, $newStatus); "  [OK] 状态行改为仓库链接" } else { "  [SKIP] 状态行" }

# 3) 作品区改动态
$start = $c.IndexOf('<div class="works works--directions">')
if ($start -gt 0) {
  $endMarker = "`n    </section>"
  $end = $c.IndexOf($endMarker, $start)
  if ($end -gt $start) {
    $newWorks = "      <div class=`"works`" id=`"worksGrid`"></div>`n      <p class=`"works__empty`" id=`"worksEmpty`" hidden>还没有发布的作品。</p>`n"
    $c = $c.Substring(0, $start) + $newWorks + $c.Substring($end + 1)
    "  [OK] 作品区改为动态列表"
  } else { "  [SKIP] 作品区结束标记未找到" }
} else { "  [SKIP] 作品区起点未找到" }

$c = $c.Replace('<h2 class="section__title">作品方向</h2>', '<h2 class="section__title">作品</h2>')
$c = $c.Replace('<p class="section__kicker">Directions</p>', '<p class="section__kicker">Works</p>')
$c = $c.Replace('<p class="section__desc">五个方向，都在学。没有成品的时候，就先写在这里。</p>', '<p class="section__desc">已发布的作品，点开可以看内容和文件。</p>')

# 4) 联系区加 GitHub
$qq = '<a class="btn btn--ghost" href="https://qm.qq.com/q/Woby5zUzuu" target="_blank" rel="noopener noreferrer">QQ</a>'
if ($c.Contains($qq) -and -not $c.Contains('contact-github')) {
  $c = $c.Replace($qq, $qq + "`n          " + '<a class="btn btn--ghost contact-github" href="https://github.com/HEHE-HEHEz53/hopzz-site" target="_blank" rel="noopener noreferrer">GitHub</a>')
  "  [OK] 联系区加 GitHub"
}

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "index.html 已更新" }
"=== 确认 ==="
Select-String -Path $f -Pattern '社恐|都在学|作品方向|worksGrid|GitHub' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
