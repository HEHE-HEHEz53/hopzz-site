$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\deploy\site\assets\app.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# 1) 购买成功：不直接跳转，先开自建支付页
$old = @'
          purchaseActionId = null;
          setStatus("已打开支付入口。付款完成后回到本页，点「刷新权益」确认。");
          showManualLinks(d);
          window.location.href = d.purchase_url;
'@
$new = @'
          purchaseActionId = null;
          setStatus("已生成支付入口。付款完成后回到本页，点「刷新权益」确认。");
          showManualLinks(d);
          if (typeof window.openHopzzPay === "function") {
            window.openHopzzPay(d, plan);
          } else {
            window.location.href = d.purchase_url;
          }
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] 购买后改为开自建支付页" } else { "  [SKIP] 购买分支未匹配" }

# 2) 追加：作品列表 + 支付弹窗
$extra = @'

/* =====================================================================
 * 作品列表（读 /api/works，由 studio 的「发布」开关驱动）
 * ===================================================================== */
(function () {
  var grid = document.getElementById("worksGrid");
  var empty = document.getElementById("worksEmpty");
  if (!grid) return;

  var TYPE_LABEL = {
    music: "音乐", lyrics: "歌词", art: "绘画", code: "代码",
    video: "视频", story: "剧情", world: "世界观", oc: "OC", other: "其他"
  };
  var TYPE_ICON = {
    music: "♪", lyrics: "✎", art: "✦", code: "⌘",
    video: "▶", story: "❧", world: "◉", oc: "☺", other: "⋯"
  };

  fetch("/api/works", { credentials: "same-origin" })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var works = (data && Array.isArray(data.works)) ? data.works : [];
      if (!works.length) {
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      var frag = document.createDocumentFragment();
      works.forEach(function (item) { frag.appendChild(buildCard(item)); });
      grid.replaceChildren(frag);
    })
    .catch(function () {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "作品列表读取失败，稍后再试。";
      }
    });

  function buildCard(item) {
    var card = document.createElement("a");
    card.className = "work work--item";
    card.href = item.url || "#work";
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    var cover = document.createElement("div");
    cover.className = "work__cover";
    if (item.cover) {
      var img = document.createElement("img");
      img.src = item.cover;
      img.alt = item.name || "";
      img.loading = "lazy";
      cover.appendChild(img);
    } else {
      var icon = document.createElement("span");
      icon.className = "work__cover-icon";
      icon.textContent = TYPE_ICON[item.type] || "◇";
      cover.appendChild(icon);
    }

    var body = document.createElement("div");
    body.className = "work__body";

    var name = document.createElement("h3");
    name.className = "work__name";
    name.textContent = item.name || "未命名";
    body.appendChild(name);

    if (item.summary) {
      var summary = document.createElement("p");
      summary.className = "work__summary";
      summary.textContent = item.summary;
      body.appendChild(summary);
    }

    var meta = document.createElement("div");
    meta.className = "work__meta";
    var type = document.createElement("span");
    type.textContent = TYPE_LABEL[item.type] || "其他";
    meta.appendChild(type);
    (item.tags || []).slice(0, 3).forEach(function (tag) {
      var chip = document.createElement("span");
      chip.className = "work__tag";
      chip.textContent = "#" + tag;
      meta.appendChild(chip);
    });
    body.appendChild(meta);

    card.append(cover, body);
    return card;
  }
})();

/* =====================================================================
 * 自建支付页：手机点按钮跳转，电脑直接扫二维码
 * ===================================================================== */
(function () {
  var layer = document.getElementById("payLayer");
  if (!layer) return;
  var qrImg = document.getElementById("payQr");
  var openLink = document.getElementById("payOpen");
  var planEl = document.getElementById("payPlan");
  var closeBtn = document.getElementById("payClose");
  var backdrop = document.getElementById("payBackdrop");
  var refreshBtn = document.getElementById("payRefresh");

  function close() {
    layer.hidden = true;
    planEl.textContent = "";
    qrImg.removeAttribute("src");
    openLink.removeAttribute("href");
  }

  window.openHopzzPay = function (data, plan) {
    var url = data && data.purchase_url;
    if (!url) return;
    var name = (plan && (plan.display_name || plan.name)) || "赞助";
    var price = plan && plan.price !== undefined ? "¥" + plan.price : "";
    planEl.textContent = price ? name + " · " + price : name;
    openLink.href = url;
    qrImg.src = "/api/sponsor/qr?data=" + encodeURIComponent(url);
    layer.hidden = false;
    if (closeBtn) closeBtn.focus();
  };

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !layer.hidden) close();
  });
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      var btn = document.getElementById("accessRefresh");
      if (btn) btn.click();
      close();
    });
  }
})();
'@
$c = $c.TrimEnd() + $extra
[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
"已写入 app.js"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"app.js EXIT=$LASTEXITCODE"
