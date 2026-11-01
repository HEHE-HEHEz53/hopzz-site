/* ============================================================
   Hopzz · 个人主页脚本
   - 深色/浅色主题切换（记忆在浏览器本地）
   - 导航滚动样式 + 元素进场动画
   - 从 /api 拉取服务器状态与硬件温湿度，定时刷新
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- 1. 主题切换 ---------------- */
  const THEME_KEY = "hopzz-theme";
  const html = document.documentElement;

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") html.dataset.theme = saved;
  } catch (_) {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }

  $("#themeToggle")?.addEventListener("click", () => {
    const next = html.dataset.theme === "light" ? "dark" : "light";
    html.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (_) {}
  });

  /* ---------------- 2. 导航吸顶 ---------------- */
  const nav = $("#nav");
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle("is-stuck", window.scrollY > 12);
  };
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
          setTimeout(() => entry.target.classList.add("is-in"), i * 70);
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

  /* ---------------- 5. 通用请求 ---------------- */
  const API = "/api";

  async function api(path, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(API + path, {
        ...options,
        signal: ctrl.signal,
        headers: { Accept: "application/json", ...(options.headers || {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- 6. 格式化工具 ---------------- */
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

  function setBar(barEl, percent) {
    if (!barEl) return;
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    barEl.style.width = p.toFixed(1) + "%";
    barEl.classList.toggle("is-high", p >= 80);
  }

  /* ---------------- 7. 实时数据 ---------------- */
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
      if (el.uptime) el.uptime.textContent = fmtUptime(d.uptime_seconds);

      if (el.cpuVal) el.cpuVal.textContent = `${Math.round(d.cpu_percent)}%`;
      setBar(el.cpuBar, d.cpu_percent);

      if (el.memVal) el.memVal.textContent = `${Math.round(d.mem_percent)}%`;
      setBar(el.memBar, d.mem_percent);

      if (el.diskVal) el.diskVal.textContent = `${Math.round(d.disk_percent)}%`;
      setBar(el.diskBar, d.disk_percent);

      if (el.liveFoot) {
        const memUsed = fmtBytes(d.mem_used_bytes);
        const memTotal = fmtBytes(d.mem_total_bytes);
        const diskUsed = fmtBytes(d.disk_used_bytes);
        const diskTotal = fmtBytes(d.disk_total_bytes);
        el.liveFoot.textContent =
          `内存 ${memUsed} / ${memTotal} · 磁盘 ${diskUsed} / ${diskTotal} · ` +
          `${d.cpu_count} 核 · 负载 ${Number(d.load1).toFixed(2)} · ` +
          `更新于 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
      }
    } catch (err) {
      if (!alive) return;
      if (el.apiDot) el.apiDot.className = "dot dot--bad";
      if (el.liveFoot) el.liveFoot.textContent = "接口暂时连不上，稍后自动重试…";
    }
  }

  async function refreshTelemetry() {
    try {
      const d = await api("/telemetry/latest");
      if (!alive) return;

      const hasData = d && d.ok && d.latest;
      if (el.sensorDot) el.sensorDot.className = "dot " + (hasData ? "dot--ok" : "");

      if (!hasData) {
        if (el.tempVal) el.tempVal.textContent = "—";
        if (el.humiVal) el.humiVal.textContent = "—";
        if (el.sensorFoot) el.sensorFoot.textContent = "还没有硬件上报数据，接上 ESP32 后这里会实时更新。";
        return;
      }

      const t = d.latest;
      if (el.tempVal) {
        el.tempVal.textContent = Number.isFinite(t.temperature) ? t.temperature.toFixed(1) : "—";
      }
      if (el.humiVal) {
        el.humiVal.textContent = Number.isFinite(t.humidity) ? t.humidity.toFixed(1) : "—";
      }
      if (el.sensorFoot) {
        const when = t.created_at ? new Date(t.created_at.replace(" ", "T") + "Z") : null;
        const whenText = when && !Number.isNaN(when.getTime())
          ? when.toLocaleString("zh-CN", { hour12: false })
          : t.created_at || "";
        el.sensorFoot.textContent = `来自 ${t.device_id || "未知设备"} · ${whenText}`;
      }
    } catch (err) {
      if (!alive) return;
      if (el.sensorDot) el.sensorDot.className = "dot dot--bad";
      if (el.sensorFoot) el.sensorFoot.textContent = "读取传感器数据失败。";
    }
  }

  async function registerVisit() {
    try {
      const d = await api("/visit", { method: "POST" });
      if (alive && el.visitors && Number.isFinite(d.today)) {
        el.visitors.textContent = String(d.today);
      }
    } catch (_) {
      if (el.visitors) el.visitors.textContent = "—";
    }
  }

  /* ---------------- 8. 启动 + 轮询 ---------------- */
  refreshStatus();
  refreshTelemetry();
  registerVisit();

  // 页面在后台时不轮询，省流量也省服务器资源
  const STATUS_MS = 15000;
  const TELE_MS = 20000;
  setInterval(() => {
    if (document.visibilityState === "visible") refreshStatus();
  }, STATUS_MS);
  setInterval(() => {
    if (document.visibilityState === "visible") refreshTelemetry();
  }, TELE_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStatus();
      refreshTelemetry();
    }
  });
})();
