$ErrorActionPreference = 'Stop'

# ---------- 1. index.html：支付弹窗 + 作品列表容器 ----------
$f = 'D:\DSH\work\deploy\site\index.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$modal = @'
  <!-- ===== 支付弹窗：手机点按钮，电脑扫二维码 ===== -->
  <div class="pay-layer" id="payLayer" hidden>
    <div class="pay-backdrop" id="payBackdrop"></div>
    <div class="pay-card" role="dialog" aria-modal="true" aria-labelledby="payTitle">
      <button class="pay-close" id="payClose" type="button" aria-label="关闭">×</button>
      <p class="pay-kicker">Support</p>
      <h3 class="pay-title" id="payTitle">扫码或点击支付</h3>
      <p class="pay-plan" id="payPlan"></p>
      <div class="pay-qr">
        <img id="payQr" alt="支付二维码" width="220" height="220" />
      </div>
      <a class="btn btn--primary pay-open" id="payOpen" target="_blank" rel="noopener noreferrer">打开支付宝支付</a>
      <p class="pay-note">手机点上面的按钮，电脑扫二维码。付款完成后回到本页点「刷新权益」。</p>
      <button class="linkbtn pay-refresh" id="payRefresh" type="button">已支付，刷新权益</button>
    </div>
  </div>

'@
if ($c -notmatch 'id="payLayer"') {
  $c = $c.Replace('  <footer class="foot">', $modal + '  <footer class="foot">')
  "  [OK] 插入支付弹窗"
}

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "index.html 已更新" }

# ---------- 2. style.css：作品卡片 + 支付弹窗 ----------
$sf = 'D:\DSH\work\deploy\site\assets\style.css'
$s = [System.IO.File]::ReadAllText($sf, [System.Text.Encoding]::UTF8)
if ($s -notmatch '\.pay-layer') {
  $s = $s.TrimEnd() + @'

/* ===================== 作品列表（由 /api/works 渲染） ===================== */
.works__empty {
  text-align: center;
  opacity: .55;
  font-size: 15px;
  padding: 28px 0;
}
.work--item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  border-radius: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  transition: transform .35s ease, box-shadow .35s ease, border-color .35s ease;
}
.work--item:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--ink) 24%, transparent);
  box-shadow: 0 18px 40px rgba(20, 40, 60, .12);
}
.work__cover {
  aspect-ratio: 4 / 3;
  background: linear-gradient(135deg, color-mix(in srgb, var(--ink) 8%, transparent), color-mix(in srgb, var(--ink) 3%, transparent));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.work__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.work__cover-icon {
  font-size: 34px;
  opacity: .35;
}
.work__body {
  padding: 4px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.work__name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.work__summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.work__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  opacity: .6;
}
.work__tag {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
}

/* ===================== 支付弹窗 ===================== */
.pay-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.pay-layer[hidden] { display: none; }
.pay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(12, 26, 40, .55);
  backdrop-filter: blur(6px);
}
.pay-card {
  position: relative;
  width: min(420px, 100%);
  border-radius: 20px;
  padding: 26px 24px 22px;
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
  box-shadow: 0 30px 70px rgba(10, 30, 50, .28);
  text-align: center;
}
.pay-close {
  position: absolute;
  top: 12px;
  right: 14px;
  border: 0;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  opacity: .5;
}
.pay-close:hover { opacity: .9; }
.pay-kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  opacity: .45;
}
.pay-title { margin: 6px 0 4px; font-size: 18px; font-weight: 600; }
.pay-plan { margin: 0 0 16px; font-size: 14px; opacity: .75; }
.pay-qr {
  display: flex;
  justify-content: center;
  padding: 12px;
  border-radius: 14px;
  background: #fff;
  width: fit-content;
  margin: 0 auto 16px;
}
.pay-qr img { display: block; width: 220px; height: 220px; }
.pay-open { width: 100%; }
.pay-note {
  margin: 12px 0 6px;
  font-size: 12px;
  line-height: 1.6;
  opacity: .6;
}
.pay-refresh { font-size: 13px; }
'@
  [System.IO.File]::WriteAllText($sf, $s, (New-Object System.Text.UTF8Encoding $false))
  "  [OK] 样式已追加"
} else { "  样式已存在" }
