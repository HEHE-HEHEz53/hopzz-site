$ErrorActionPreference = 'Stop'

# ---------- 1. 后端：二维码允许 alipays:// 深链 ----------
$f = 'D:\DSH\work\deploy\api\main.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$old = @'
    if not data.startswith("https://"):
        raise HTTPException(status_code=400, detail="只支持 https 链接")
'@
$new = @'
    # 支付宝深链（alipays://）也要能生成二维码，不能只放 https
    allowed_prefixes = ("https://", "http://", "alipays://", "alipayqr://", "weixin://")
    if not data.startswith(allowed_prefixes):
        raise HTTPException(status_code=400, detail="不支持的链接类型")
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] 二维码接口放开深链" }
else { "  [SKIP] 未匹配 https 校验" }
[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
& python -c "import ast;ast.parse(open(r'D:\DSH\work\deploy\api\main.py',encoding='utf-8').read());print('main.py OK')"

# ---------- 2. 前端：优先用返回的二维码图，其次自己生成 ----------
$jf = 'D:\DSH\work\deploy\site\assets\app.js'
$j = [System.IO.File]::ReadAllText($jf, [System.Text.Encoding]::UTF8)
$old2 = '    qrImg.src = "/api/sponsor/qr?data=" + encodeURIComponent(url);'
$new2 = @'
    // 优先用上游返回的二维码图；没有就用服务端把深链渲染成 PNG
    var qrSource = data && data.purchase_qr_code
      ? String(data.purchase_qr_code)
      : "/api/sponsor/qr?data=" + encodeURIComponent(url);
    qrImg.onerror = function () {
      qrImg.removeAttribute("src");
      var note = document.getElementById("payQrFallback");
      if (note) { note.hidden = false; }
    };
    qrImg.onload = function () {
      var note = document.getElementById("payQrFallback");
      if (note) { note.hidden = true; }
    };
    qrImg.src = qrSource;
'@
if ($j.Contains($old2)) { $j = $j.Replace($old2, $new2); "  [OK] 前端二维码逻辑" }
else { "  [SKIP] 前端二维码行未匹配" }

# 兜底提示元素：在二维码容器后加一行
$html = 'D:\DSH\work\deploy\site\index.html'
$h = [System.IO.File]::ReadAllText($html, [System.Text.Encoding]::UTF8)
if ($h -notmatch 'payQrFallback') {
  $h = $h.Replace(@'
      <div class="pay-qr">
        <img id="payQr" alt="支付二维码" width="220" height="220" />
      </div>
'@, @'
      <div class="pay-qr">
        <img id="payQr" alt="支付二维码" width="220" height="220" />
      </div>
      <p class="pay-qr-fallback" id="payQrFallback" hidden>二维码没显示出来，请直接用下面的按钮打开支付宝。</p>
'@)
  [System.IO.File]::WriteAllText($html, $h, (New-Object System.Text.UTF8Encoding $false))
  "  [OK] 兜底提示"
}

[System.IO.File]::WriteAllText($jf, $j, (New-Object System.Text.UTF8Encoding $false))
& 'D:\IT\nodejs\node.exe' --check $jf 2>&1 | Out-String
"app.js EXIT=$LASTEXITCODE"
