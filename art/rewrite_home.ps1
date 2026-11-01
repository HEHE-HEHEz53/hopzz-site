$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\deploy\site\index.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

function Rep([string]$pattern, [string]$replacement, [switch]$Regex) {
    $script:c2 = if ($Regex) {
        [regex]::Replace($script:c2, $pattern, $replacement)
    } else {
        $script:c2.Replace($pattern, $replacement)
    }
}

$c2 = $c

# ---------- 1. 站名 / 标题 ----------
Rep 'Hopzz 的个人主页 —— 写网站、折腾硬件，顺便把服务器和家里的温湿度放到网页上。' 'HEHE 的个人主页 —— 一些还在学的东西，和几件做出来的小事。'
Rep '<title>Hopzz · 个人主页</title>' '<title>HEHE · 个人主页</title>'
Rep '<span class="brand__name">Hopzz</span>' '<span class="brand__name">HEHE</span>'
Rep '<h1 class="hero__title reveal">你好，我是<br /><span class="grad">Hopzz</span></h1>' '<h1 class="hero__title reveal">你好，我是<br /><span class="grad">HEHE</span></h1>'

# ---------- 2. 首屏介绍：降调 ----------
Rep '(?s)<p class="hero__lead reveal">.*?</p>' @'
<p class="hero__lead reveal">
            会一点前端和 Python，还在慢慢学。这个站是自己一行一行搭起来的，
            也接了几个传感器——做得不算好，但都是真的。
          </p>
'@ -Regex

Rep '<a class="btn btn--ghost" href="#contact">联系我</a>' '<a class="btn btn--ghost" href="#contact">写邮件</a>'

# ---------- 3. 关于 ----------
Rep '(?s)<p class="about__lead">.*?</p>' @'
<p class="about__lead">
            我是 HEHE，一个还在学写代码的人。大部分东西都是一边查资料、一边试错做出来的，
            能让它跑起来就已经挺开心了。
          </p>
'@ -Regex

Rep '(?s)<p>\s*最近在做的事，是让网站真正「感知」现实世界.*?</p>' @'
<p>
            最近在折腾的，是让网页能看见现实里的事情：服务器还剩多少内存、房间里的温度湿度。
            做得慢，但每弄通一小块都会记下来。
          </p>
'@ -Regex

Rep '(?s)<p>\s*这个站没有用任何前端框架.*?</p>' @'
<p>
            这个站没有用前端框架，样式是一行一行改的。好看的地方多半是运气，
            难看的地方是我还没学会。
          </p>
'@ -Regex

Rep '<p class="about__sign">— Hopzz，写于 2026 年的某个凌晨</p>' '<p class="about__sign">— HEHE</p>'

# ---------- 4. 小卡片 ----------
Rep '<dd>中国 · 远程</dd>' '<dd>中国</dd>'
Rep '<dd>个人站 + IoT 小项目</dd>' '<dd>边学边做</dd>'
Rep '<dd>VS Code · Linux · Git</dd>' '<dd>记事本 · 终端 · 一点点 Python</dd>'
Rep '<span class="badge">可接新项目</span>' '<span class="badge">社恐 · 回复慢</span>'

# ---------- 5. 作品描述稍微降调 ----------
Rep 'Nginx + FastAPI + SQLite，从零手写的样式与排版，没有用任何前端框架。' 'Nginx + FastAPI + SQLite，样式和排版是自己一行一行改的。'

# ---------- 6. 联系：不主动邀请 ----------
Rep '(?s)<div class="contact__text">.*?</div>' @'
<div class="contact__text">
            <h3 class="contact__lead">不太会聊天，也不常看消息。</h3>
            <p class="contact__note">有事写信就好，看到会回，可能不快。</p>
          </div>
'@ -Regex

Rep '<a class="btn btn--ghost" href="https://qm.qq.com/q/Woby5zUzuu" target="_blank" rel="noopener noreferrer">加我 QQ</a>' '<a class="btn btn--ghost" href="https://qm.qq.com/q/Woby5zUzuu" target="_blank" rel="noopener noreferrer">QQ</a>'
Rep '<a class="btn btn--ghost" id="repoLink" href="#" data-pending="1">GitHub 仓库</a>' '<a class="btn btn--ghost" id="repoLink" href="#" data-pending="1">代码仓库</a>'

# ---------- 7. 页脚 ----------
Rep '<p>© <span id="year">2026</span> Hopzz · 用 Nginx + FastAPI 手搓</p>' '<p>© <span id="year">2026</span> HEHE · 一行一行手写的</p>'

# ---------- 8. 背景：改成随页面滚动 ----------
$oldStyle = @'
  <!-- 插画背景层：电脑端用横版，手机用竖版，整体半透明 -->
  <style id="artBackground">
    html {
      background-image: url("assets/bg-desktop.jpg");
      background-position: center center;
      background-size: cover;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }
    /* 给内容垫一层半透明纸色，保证文字可读 */
    body {
      background-color: color-mix(in srgb, var(--paper) 84%, transparent);
    }
    html[data-theme="dark"] body {
      background-color: color-mix(in srgb, var(--paper) 88%, transparent);
    }
    @media (max-width: 860px) {
      html {
        background-image: url("assets/bg-mobile.jpg");
        background-position: center 22%;
        background-attachment: scroll;
      }
      body {
        background-color: color-mix(in srgb, var(--paper) 78%, transparent);
      }
      html[data-theme="dark"] body {
        background-color: color-mix(in srgb, var(--paper) 84%, transparent);
      }
    }
    /* 极宽屏时让插画集中在右侧，左侧更干净 */
    @media (min-width: 1600px) {
      html { background-position: 72% center; }
    }
  </style>
'@

$newStyle = @'
  <!-- 插画背景层：随页面一起滚动（不是固定的） -->
  <style id="artBackground">
    html {
      background-color: var(--paper);
    }
    /*
      背景放在 body 上：body 的高度等于整篇内容的高度，所以图片会跟着内容一起滚。
      第一层是半透明纸色蒙版（画在图片上方），第二层才是插画。
    */
    body {
      background-image:
        linear-gradient(180deg,
          rgba(247, 251, 252, 0.88) 0%,
          rgba(247, 251, 252, 0.80) 38%,
          rgba(247, 251, 252, 0.90) 100%),
        url("assets/bg-desktop.jpg");
      background-size: 100% 100%, auto 100vh;
      background-position: center top, center top;
      background-repeat: no-repeat, repeat-y;
      background-attachment: scroll, scroll;
    }
    html[data-theme="dark"] body {
      background-image:
        linear-gradient(180deg,
          rgba(8, 26, 52, 0.90) 0%,
          rgba(8, 26, 52, 0.84) 38%,
          rgba(8, 26, 52, 0.92) 100%),
        url("assets/bg-desktop.jpg");
    }
    @media (max-width: 860px) {
      body {
        background-image:
          linear-gradient(180deg,
            rgba(247, 251, 252, 0.85) 0%,
            rgba(247, 251, 252, 0.78) 38%,
            rgba(247, 251, 252, 0.90) 100%),
          url("assets/bg-mobile.jpg");
        background-size: 100% 100%, auto 100vh;
        background-position: center top, center top;
      }
      html[data-theme="dark"] body {
        background-image:
          linear-gradient(180deg,
            rgba(8, 26, 52, 0.89) 0%,
            rgba(8, 26, 52, 0.83) 38%,
            rgba(8, 26, 52, 0.92) 100%),
          url("assets/bg-mobile.jpg");
      }
    }
  </style>
'@

if ($c2.Contains($oldStyle)) {
    $c2 = $c2.Replace($oldStyle, $newStyle)
    '背景样式：已替换为滚动版'
} elseif ($c2 -notmatch '随页面一起滚动') {
    # 兜底：按 </head> 前插入
    $c2 = $c2.Replace('</head>', $newStyle + "</head>")
    '背景样式：重新注入'
} else {
    '背景样式：已是滚动版'
}

[System.IO.File]::WriteAllText($f, $c2, (New-Object System.Text.UTF8Encoding $false))

"=== 残留检查 ==="
foreach ($k in @('Hopzz', '全栈', '可接新项目', '直接找我', '加我 QQ')) {
    $n = ([regex]::Matches($c2, [regex]::Escape($k))).Count
    "  {0,-10} {1}" -f $k, $n
}
"=== 新文案抽查 ==="
foreach ($k in @('HEHE', '还在学写代码', '社恐', '不常看消息', '随页面一起滚动')) {
    "  {0,-14} {1}" -f $k, ([regex]::Matches($c2, [regex]::Escape($k))).Count
}
