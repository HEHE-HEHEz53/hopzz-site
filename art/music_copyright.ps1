$ErrorActionPreference = 'Stop'
$dir = 'D:\DSH\work\music\static'

# ---------- 1. player.js：补 state.objectUrl + 文件头版权 ----------
$jf = Join-Path $dir 'player.js'
$j = [System.IO.File]::ReadAllText($jf, [System.Text.Encoding]::UTF8)
if ($j -notmatch 'state = \{[\s\S]*objectUrl') {
  $j = $j.Replace("    audioUrl: '',", "    audioUrl: '',`n    objectUrl: '',")
  "  [OK] state.objectUrl"
}
if ($j -notmatch '© 2026') {
  $header = @'
/*!
 * music.hopzz.top 播放器
 * © 2026 贺嘉（HEHEz53 / Hopzz）. 保留所有权利。
 * 本文件受版权保护，未经书面许可不得复制、再分发或用于商业用途。
 * 作品：不器用なピアノ（AI 生成，已取得商业授权）
 */
'@
  $j = $header + "`n" + $j
  "  [OK] player.js 版权头"
}
[System.IO.File]::WriteAllText($jf, $j, (New-Object System.Text.UTF8Encoding $false))

# ---------- 2. player.css：版权头 ----------
$cf = Join-Path $dir 'player.css'
$c = [System.IO.File]::ReadAllText($cf, [System.Text.Encoding]::UTF8)
if ($c -notmatch '© 2026') {
  $c = "/*!`n * music.hopzz.top 播放器样式`n * © 2026 贺嘉（HEHEz53 / Hopzz）. 保留所有权利。`n */`n`n" + $c
  [System.IO.File]::WriteAllText($cf, $c, (New-Object System.Text.UTF8Encoding $false))
  "  [OK] player.css 版权头"
}

# ---------- 3. player.html：版权注释 + meta + 可见版权行 ----------
$hf = Join-Path $dir 'player.html'
$h = [System.IO.File]::ReadAllText($hf, [System.Text.Encoding]::UTF8)
if ($h -notmatch '© 2026') {
  $h = $h.Replace('<!doctype html>', @'
<!doctype html>
<!--
  不器用なピアノ · 在线播放器
  © 2026 贺嘉（HEHEz53 / Hopzz）. 保留所有权利。
  本作品由 AI 生成并取得商业授权，仅授权在 music.hopzz.top 在线收听；
  未经书面许可，不得下载、转载、二次分发或用于任何商业用途。
  版权声明另见 /api/credits 与 /static/copyright.txt
-->
'@)
  $h = $h.Replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="noindex, nofollow">' + "`n" + '  <meta name="copyright" content="© 2026 HEHEz53. All rights reserved.">' + "`n" + '  <meta name="author" content="HEHEz53">')
  # 展开歌词视图底部加一行小版权
  $h = $h.Replace('    <!-- 完整歌词 -->', "    <p class=`"copyright-line`" id=`"copyrightLine`">© 2026 HEHEz53 · 仅供在线收听</p>`n`n    <!-- 完整歌词 -->")
  "  [OK] player.html 版权声明"
}
[System.IO.File]::WriteAllText($hf, $h, (New-Object System.Text.UTF8Encoding $false))

# ---------- 4. 版权行样式（仅在展开的歌词页显示） ----------
$cc = [System.IO.File]::ReadAllText($cf, [System.Text.Encoding]::UTF8)
if ($cc -notmatch '\.copyright-line') {
  $cc = $cc.TrimEnd() + @'

/* 版权行：只在展开歌词时显示在底部 */
.copyright-line {
  display: none;
  margin: 0;
  padding: 6px 0 2px;
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  opacity: 0.75;
  grid-column: 1 / -1;
  grid-row: 2;
}
@media (max-width: 899px) {
  .app.is-expanded .copyright-line { display: block; }
}
@media (min-width: 900px) {
  .copyright-line { display: block; }
}
'@
  [System.IO.File]::WriteAllText($cf, $cc, (New-Object System.Text.UTF8Encoding $false))
  "  [OK] 版权行样式"
}

"=== 校验 ==="
& 'D:\IT\nodejs\node.exe' --check $jf 2>&1 | Out-String
"  player.js EXIT=$LASTEXITCODE"
Select-String -Path $hf -Pattern '© 2026|name="copyright"|copyrightLine' | ForEach-Object { "  html:$($_.LineNumber): $($_.Line.Trim())" }
