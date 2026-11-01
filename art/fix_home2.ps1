$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\deploy\site\index.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# ---------- 1. 站点名恢复为 Hopzz（人名仍是 HEHE）----------
$c = $c.Replace('<title>HEHE · 个人主页</title>', '<title>Hopzz · 个人主页</title>')
$c = $c.Replace(
  'HEHE 的个人主页 —— 一些还在学的东西，和几件做出来的小事。',
  'Hopzz · 个人主页 —— 一些还在学的东西，和几件做出来的小事。'
)
$c = $c.Replace('<span class="brand__name">HEHE</span>', '<span class="brand__name">Hopzz</span>')

# ---------- 2. 页脚：全称 + 那句玩笑 ----------
$c = $c.Replace(
  '<p>© <span id="year">2026</span> HEHE · 一行一行手写的</p>',
  '<p>© <span id="year">2026</span> HEHEz53 · 鲸鱼娘吃完白饭后做的网站</p>'
)

# ---------- 3. 背景：两端都固定 ----------
$fixedStyle = @'
  <!-- 插画背景层：电脑端和手机端都固定，像壁纸一样不动 -->
  <style id="artBackground">
    html {
      background-image: url("assets/bg-desktop.jpg");
      background-position: center center;
      background-size: cover;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }
    /* 半透明纸色蒙版，保证文字可读 */
    body {
      background-color: color-mix(in srgb, var(--paper) 84%, transparent);
    }
    html[data-theme="dark"] body {
      background-color: color-mix(in srgb, var(--paper) 88%, transparent);
    }
    @media (max-width: 860px) {
      html {
        background-image: url("assets/bg-mobile.jpg");
        background-position: center 24%;
        background-attachment: fixed;
      }
      body {
        background-color: color-mix(in srgb, var(--paper) 78%, transparent);
      }
      html[data-theme="dark"] body {
        background-color: color-mix(in srgb, var(--paper) 84%, transparent);
      }
    }
    /* 超宽屏让插画集中在右侧，左边留白 */
    @media (min-width: 1600px) {
      html { background-position: 72% center; }
    }
  </style>
'@

$c2 = [regex]::Replace($c, '(?s)<style id="artBackground">.*?</style>', [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    return $fixedStyle.TrimEnd()
})
if ($c2 -eq $c -and $c -notmatch 'background-attachment: fixed') {
    $c2 = $c.Replace('</head>', $fixedStyle + '</head>')
}
$c = $c2

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))

# ---------- 校验 ----------
"=== 校验 ==="
foreach ($k in @('Hopzz', 'HEHE', 'HEHEz53', '鲸鱼娘吃完白饭后做的网站', 'background-attachment: fixed', '随页面一起滚动')) {
    "  {0,-26} {1}" -f $k, ([regex]::Matches($c, [regex]::Escape($k))).Count
}
"=== title / 页脚 ==="
Select-String -Path $f -Pattern '<title>|HEHEz53 ·|brand__name' | ForEach-Object { "  $($_.Line.Trim())" }
