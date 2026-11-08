/* ============================================================
   Hopzz · 个人主页脚本
   - 深色 / 浅色主题切换（记忆在浏览器本地）
   - 导航滚动样式、元素进场动画
   - 从 /api 拉取服务器状态与硬件温湿度，定时刷新
   - 所有服务端文本一律用 textContent 写入，防止 XSS
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- 1. 主题切换 ---------------- */
  const THEME_KEY = "hopzz-theme";
  const themeBtn = $("#themeToggle");
  const themeMeta = $('meta[name="theme-color"]');

  function applyTheme(theme, persist) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;

    if (themeMeta) themeMeta.setAttribute("content", next === "dark" ? "#08213f" : "#f7fbfc");

    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(next === "dark"));
      themeBtn.setAttribute("aria-label", next === "dark" ? "切换到浅色主题" : "切换到深色主题");
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) {
        /* 隐私模式下 localStorage 可能不可用，忽略 */
      }
    }
  }

  // 页面 <head> 里的内联脚本已经恢复过主题，这里同步按钮状态
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light", false);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
  }

  /* ---------------- 2. 导航吸顶 ---------------- */
  const nav = $("#nav");
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle("is-stuck", window.scrollY > 12);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------- 3. 进场动画 ---------------- */
  const reveals = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (!entry.isIntersecting) return;
          // 同一批元素错开一点，看起来更自然
          window.setTimeout(() => entry.target.classList.add("is-in"), i * 70);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------------- 4. 页脚年份 ---------------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------------- 5. 待填链接（GitHub 等） ---------------- */
  document.querySelectorAll("a[data-pending]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.getAttribute("data-pending") === "1") event.preventDefault();
    });
  });

  /* ---------------- 6. 通用请求 ---------------- */
  const API = "/api";

  async function api(path, options = {}) {
    const { timeout = 8000, ...init } = options;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(API + path, {
        ...init,
        signal: ctrl.signal,
        headers: { Accept: "application/json", ...(init.headers || {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  /* ---------------- 7. 格式化工具 ---------------- */
  function fmtUptime(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d} 天 ${h} 时`;
    if (h > 0) return `${h} 时 ${m} 分`;
    return `${m} 分钟`;
  }

  function fmtBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
  }

  function fmtPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n)}%` : "—";
  }

  function setBar(barEl, percent) {
    if (!barEl) return;
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    barEl.style.width = p.toFixed(1) + "%";
    barEl.classList.toggle("is-high", p >= 85);
  }

  function parseTime(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim().replace(" ", "T");
    const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw + "Z";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /* ---------------- 8. 实时数据 ---------------- */
  const el = {
    uptime: $("#statUptime"),
    visitors: $("#statVisitors"),
    apiDot: $("#apiDot"),
    sensorDot: $("#sensorDot"),
    cpuVal: $("#cpuVal"),
    cpuBar: $("#cpuBar"),
    memVal: $("#memVal"),
    memBar: $("#memBar"),
    diskVal: $("#diskVal"),
    diskBar: $("#diskBar"),
    liveFoot: $("#liveFoot"),
    tempVal: $("#tempVal"),
    humiVal: $("#humiVal"),
    sensorFoot: $("#sensorFoot"),
  };

  let alive = true;
  window.addEventListener("beforeunload", () => {
    alive = false;
  });

  async function refreshStatus() {
    try {
      const d = await api("/status");
      if (!alive) return;

      if (el.apiDot) el.apiDot.className = "dot dot--ok";
      if (el.uptime) el.uptime.textContent = fmtUptime(Number(d.uptime_seconds));

      if (el.cpuVal) el.cpuVal.textContent = fmtPercent(d.cpu_percent);
      setBar(el.cpuBar, d.cpu_percent);

      if (el.memVal) el.memVal.textContent = fmtPercent(d.mem_percent);
      setBar(el.memBar, d.mem_percent);

      if (el.diskVal) el.diskVal.textContent = fmtPercent(d.disk_percent);
      setBar(el.diskBar, d.disk_percent);

      if (el.liveFoot) {
        const memUsed = fmtBytes(Number(d.mem_used_bytes));
        const memTotal = fmtBytes(Number(d.mem_total_bytes));
        const diskUsed = fmtBytes(Number(d.disk_used_bytes));
        const diskTotal = fmtBytes(Number(d.disk_total_bytes));
        const cores = Number.isFinite(Number(d.cpu_count)) ? `${d.cpu_count} 核` : "— 核";
        const load = Number.isFinite(Number(d.load1)) ? Number(d.load1).toFixed(2) : "—";
        const updated = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        el.liveFoot.textContent =
          `内存 ${memUsed} / ${memTotal} · 磁盘 ${diskUsed} / ${diskTotal} · ` +
          `${cores} · 负载 ${load} · 更新于 ${updated}`;
      }
    } catch (_) {
      if (!alive) return;
      if (el.apiDot) el.apiDot.className = "dot dot--bad";
      if (el.liveFoot) el.liveFoot.textContent = "接口暂时连不上，稍后自动重试…";
    }
  }

  async function refreshTelemetry() {
    try {
      const d = await api("/telemetry/latest");
      if (!alive) return;

      const latest = d && d.ok ? d.latest : null;
      if (el.sensorDot) el.sensorDot.className = "dot " + (latest ? "dot--ok" : "");

      if (!latest) {
        if (el.tempVal) el.tempVal.textContent = "—";
        if (el.humiVal) el.humiVal.textContent = "—";
        if (el.sensorFoot) {
          el.sensorFoot.textContent = "还没有硬件上报数据，接上 ESP32 后这里会实时更新。";
        }
        return;
      }

      const temp = Number(latest.temperature);
      const humi = Number(latest.humidity);
      if (el.tempVal) el.tempVal.textContent = Number.isFinite(temp) ? temp.toFixed(1) : "—";
      if (el.humiVal) el.humiVal.textContent = Number.isFinite(humi) ? humi.toFixed(1) : "—";

      if (el.sensorFoot) {
        const when = parseTime(latest.created_at);
        const whenText = when
          ? when.toLocaleString("zh-CN", { hour12: false })
          : typeof latest.created_at === "string"
            ? latest.created_at
            : "时间未知";
        const device = typeof latest.device_id === "string" && latest.device_id ? latest.device_id : "未知设备";
        el.sensorFoot.textContent = `来自 ${device} · ${whenText}`;
      }
    } catch (_) {
      if (!alive) return;
      if (el.sensorDot) el.sensorDot.className = "dot dot--bad";
      if (el.sensorFoot) el.sensorFoot.textContent = "读取传感器数据失败。";
    }
  }

  async function registerVisit() {
    try {
      const d = await api("/visit", { method: "POST" });
      if (!alive) return;
      if (el.visitors) {
        el.visitors.textContent = Number.isFinite(Number(d.today)) ? String(d.today) : "—";
      }
    } catch (_) {
      if (el.visitors) el.visitors.textContent = "—";
    }
  }

  /* ---------------- 9. 启动 + 轮询 ---------------- */
  refreshStatus();
  refreshTelemetry();
  registerVisit();

  const STATUS_MS = 15000;
  const TELE_MS = 20000;

  // 页面在后台时不轮询，省流量也省服务器资源
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshStatus();
  }, STATUS_MS);

  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshTelemetry();
  }, TELE_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStatus();
      refreshTelemetry();
      // 从支付宝切回来时重新查一次权益；这不算「付款成功」，只是重新问服务端
      refreshAccess();
    }
  });

  /* ================================================================
     10. 赞助（一人付 opcpay）
     - 只渲染服务端 /api/sponsor/product 真实返回的套餐，价格不写死在页面里
     - 点套餐 → /api/sponsor/purchase 换 purchase_url → 跳支付宝
     - 回跳 / 扫码 / READY 都只是入口，一律不当作付款成功
     - 付款结果只认 /api/sponsor/access 的返回
     ================================================================ */
  const sponsorEl = {
    plans: $("#plans"),
    status: $("#sponsorStatus"),
    manual: $("#sponsorManual"),
    refresh: $("#accessRefresh"),
  };

  let purchaseActionId = null; // 同一次购买意图的重试编号；服务端据此复用同一业务编号
  let purchaseBusy = false;

  function makeActionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    let out = "act-";
    for (let i = 0; i < 4; i += 1) {
      out += Math.random().toString(36).slice(2, 10);
    }
    return out.slice(0, 40);
  }

  function setStatus(text) {
    if (sponsorEl.status) sponsorEl.status.textContent = text || "";
  }

  function setPlansHint(text) {
    if (!sponsorEl.plans) return;
    const p = document.createElement("p");
    p.className = "sponsor__hint";
    p.textContent = text;
    sponsorEl.plans.replaceChildren(p);
  }

  function clearManual() {
    if (sponsorEl.manual) {
      sponsorEl.manual.replaceChildren();
      sponsorEl.manual.hidden = true;
    }
  }

  function buildPlan(plan) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "plan";

    const name = document.createElement("span");
    name.className = "plan__name";
    name.textContent = plan.display_name || "赞助";

    const price = document.createElement("span");
    price.className = "plan__price";
    const symbol = document.createElement("small");
    symbol.textContent = plan.currency === "CNY" || !plan.currency ? "¥" : "";
    const amount = document.createElement("span");
    amount.textContent = String(plan.price ?? "");
    price.append(symbol, amount);

    btn.append(name, price);
    btn.addEventListener("click", () => startPurchase(plan));
    return btn;
  }

  async function loadSponsorProduct() {
    if (!sponsorEl.plans) return;
    try {
      const d = await api("/sponsor/product");
      if (!d || d.ok !== true) {
        setPlansHint((d && d.message) || "赞助暂时不可用。");
        return;
      }
      if (!d.purchase_available) {
        setPlansHint("赞助暂未开放。");
        return;
      }
      const plans = Array.isArray(d.plans) ? d.plans : [];
      if (plans.length === 0) {
        setPlansHint("还没有可赞助的套餐。");
        return;
      }
      const frag = document.createDocumentFragment();
      plans.forEach((plan) => {
        if (plan && plan.sku_id) frag.append(buildPlan(plan));
      });
      sponsorEl.plans.replaceChildren(frag);
    } catch (_) {
      setPlansHint("套餐读取失败，稍后刷新页面再试。");
    }
  }

  function showManualLinks(d) {
    if (!sponsorEl.manual) return;
    const frag = document.createDocumentFragment();

    const open = document.createElement("a");
    open.className = "btn btn--ghost";
    open.href = d.purchase_url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "重新打开支付页";

    const qr = document.createElement("a");
    qr.className = "linkbtn";
    qr.target = "_blank";
    qr.rel = "noopener noreferrer";
    qr.textContent = "扫码支付页";
    if (d.purchase_qr_code) {
      qr.href = d.purchase_qr_code;
    } else {
      qr.removeAttribute("href");
    }

    frag.append(open);
    if (d.purchase_qr_code) frag.append(qr);

    if (typeof d.expire_time === "string" && d.expire_time) {
      const when = document.createElement("p");
      when.className = "sponsor__manual-note";
      when.textContent = `入口有效期至 ${d.expire_time}（仅入口，不代表已付款）。`;
      frag.append(when);
    }

    sponsorEl.manual.replaceChildren(frag);
    sponsorEl.manual.hidden = false;
  }

  async function startPurchase(plan) {
    if (purchaseBusy) return;
    purchaseBusy = true;
    const buttons = sponsorEl.plans ? sponsorEl.plans.querySelectorAll(".plan") : [];
    buttons.forEach((b) => {
      b.disabled = true;
      b.classList.add("is-busy");
    });

    if (!purchaseActionId) purchaseActionId = makeActionId();
    setStatus("正在创建支付入口…");

    try {
      const d = await api("/sponsor/purchase", {
        method: "POST",
        timeout: 45000,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: plan.sku_id, action_id: purchaseActionId }),
      });

      if (d && d.ok === true && d.purchase_url) {
        // 到这里只代表「入口创建成功」，不代表已付款
        purchaseActionId = null;
        setStatus("已打开支付入口。付款完成后回到本页，点「刷新权益」确认。");
        showManualLinks(d);
        if (typeof window.openHopzzPay === "function") {
          window.openHopzzPay(d, plan);
        } else {
          window.location.href = d.purchase_url;
        }
      } else {
        const state = d && d.status;
        if (state === "EXPIRED" || state === "FAILED") purchaseActionId = null;
        setStatus((d && d.message) || "没能创建支付入口，稍后再试。");
      }
    } catch (_) {
      // 超时/断网：保留 purchaseActionId，下次点击沿用同一次操作，不会重复下单
      setStatus("网络或服务暂时不可用。再点一次会沿用同一次操作。");
    } finally {
      purchaseBusy = false;
      buttons.forEach((b) => {
        b.disabled = false;
        b.classList.remove("is-busy");
      });
    }
  }

  async function refreshAccess() {
    if (!sponsorEl.status) return;
    try {
      const d = await api("/sponsor/access");
      if (!d || d.ok !== true) {
        setStatus((d && d.message) || "权益查询失败。");
        return;
      }
      const access = d.access || {};
      const total = Number(access.total);
      const remaining = Number(access.remaining);
      if (Number.isFinite(total) && total > 0) {
        setStatus(
          Number.isFinite(remaining)
            ? `已记录赞助：共 ${total} 次，剩余 ${remaining} 次。`
            : "已记录赞助。"
        );
      } else if (d.allowed === true) {
        setStatus("权益已生效。");
      } else {
        setStatus("还没有赞助记录。");
      }
    } catch (_) {
      setStatus("权益查询失败，稍后再试。");
    }
  }

  if (sponsorEl.plans) {
    loadSponsorProduct();
    refreshAccess();
    if (sponsorEl.refresh) {
      sponsorEl.refresh.addEventListener("click", () => {
        setStatus("正在查询权益…");
        refreshAccess();
      });
    }
  }
})();
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
