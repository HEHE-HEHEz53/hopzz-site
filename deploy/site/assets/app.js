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
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(API + path, {
        ...options,
        signal: ctrl.signal,
        headers: { Accept: "application/json", ...(options.headers || {}) },
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
    }
  });
})();
