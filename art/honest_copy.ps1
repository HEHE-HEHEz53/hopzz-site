$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\deploy\site\index.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$before = $c

function Swap([string]$old, [string]$new, [string]$label) {
    if ($script:c.Contains($old)) {
        $script:c = $script:c.Replace($old, $new)
        "  [OK]   $label"
    } else {
        "  [SKIP] $label（没匹配到）"
    }
}

# ---------- 首屏：去掉「自己一行一行搭的」和「接了传感器」----------
Swap @'
        <p class="hero__lead reveal">
            会一点前端和 Python，还在慢慢学。这个站是自己一行一行搭起来的，
            也接了几个传感器——做得不算好，但都是真的。
          </p>
'@ @'
        <p class="hero__lead reveal">
            还在学写代码，会的很有限。这个站是 DeepSeek 的鲸鱼娘一行一行搭起来的，
            我负责说要什么、以及挑毛病。
          </p>
'@ '首屏介绍'

# ---------- 首屏小标签 ----------
Swap '鲸鱼娘在线 · 个人站' 'Hopzz · 个人站' '首屏标签'

# ---------- 关于：lead ----------
Swap @'
          <p class="about__lead">
            我是 HEHE，一个还在学写代码的人。大部分东西都是一边查资料、一边试错做出来的，
            能让它跑起来就已经挺开心了。
          </p>
'@ @'
          <p class="about__lead">
            我是 HEHE，还在学写代码，大部分时候都在查资料和试错。
          </p>
'@ '关于·开头'

# ---------- 关于：第二段（硬件还没买）----------
Swap @'
          <p>
            最近在折腾的，是让网页能看见现实里的事情：服务器还剩多少内存、房间里的温度湿度。
            做得慢，但每弄通一小块都会记下来。
          </p>
'@ @'
          <p>
            最近想做的，是让网页能看见现实里的事情：服务器还剩多少内存、房间的温度湿度。
            硬件还没买，先把网页这边弄好。
          </p>
'@ '关于·第二段'

# ---------- 关于：第三段（承认站不是我写的）----------
Swap @'
          <p>
            这个站没有用前端框架，样式是一行一行改的。好看的地方多半是运气，
            难看的地方是我还没学会。
          </p>
'@ @'
          <p>
            所以这个站不是我写的，是鲸鱼娘写的。我做的是：说清想要什么，看出来哪里不对就让她改。
          </p>
'@ '关于·第三段'

# ---------- 去掉上一轮加的重复句子 ----------
Swap @'
          <p>
            站是 DeepSeek 的鲸鱼娘帮忙搭起来的，我负责说想要什么、以及看着它慢慢变好看。
          </p>
'@ '' '关于·去掉重复句'

# ---------- 作品卡片一 ----------
Swap 'Nginx + FastAPI + SQLite，样式和排版是自己一行一行改的。' 'Nginx + FastAPI + SQLite，样式和排版也是鲸鱼娘一行一行写的。' '作品卡片一'

# ---------- 页脚：恢复原句 + 明确署名 ----------
Swap '<p>© <span id="year">2026</span> HEHEz53 · 本站由 <strong>DeepSeek（鲸鱼娘）</strong> 搭建</p>' '<p>© <span id="year">2026</span> HEHEz53 · 鲸鱼娘吃完白饭后搭建的网站</p>' '页脚·主行'
Swap '<p class="foot__domain">鲸鱼娘吃完白饭后做的网站 · hopzz.top</p>' '<p class="foot__domain">由 DeepSeek（鲸鱼娘）搭建 · hopzz.top</p>' '页脚·副行'

if ($c -ne $before) {
    [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
    "已写入"
}

# ---------- 校验 ----------
"`n=== 校验 ==="
"  自己一行一行 / 一行一行搭 : " + ([regex]::Matches($c, '自己一行一行|一行一行搭')).Count
"  鲸鱼娘写完/写的           : " + ([regex]::Matches($c, '鲸鱼娘一行一行|鲸鱼娘写的')).Count
"  吃完白饭后搭建的网站      : " + ([regex]::Matches($c, '鲸鱼娘吃完白饭后搭建的网站')).Count
"  DeepSeek（鲸鱼娘）        : " + ([regex]::Matches($c, 'DeepSeek（鲸鱼娘）')).Count
"  接了传感器                : " + ([regex]::Matches($c, '接了.*传感器')).Count
