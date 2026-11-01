"""
Hopzz 个人主页后端 API
=====================

职责（刻意保持很轻）：
  1. /api/status            —— 服务器实时负载（直接读 /proc，不装第三方监控）
  2. /api/visit             —— 当天访问计数
  3. /api/telemetry         —— 硬件（ESP32）上报温湿度
  4. /api/telemetry/latest  —— 前端读取最新一条
  5. /api/telemetry/history —— 历史数据

运行：uvicorn app.main:app --host 127.0.0.1 --port 8000
由 systemd 托管，nginx 反向代理到 127.0.0.1:8000。
"""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------- 配置
DB_PATH = Path(os.getenv("DB_PATH", "/opt/hopzz-api/data/hopzz.db"))
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "").strip()
MAX_HISTORY = 500

# ---------------------------------------------------------------- 数据库
SCHEMA = """
CREATE TABLE IF NOT EXISTS telemetry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL,
    temperature REAL,
    humidity    REAL,
    extra       TEXT,
    created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry(created_at DESC);

CREATE TABLE IF NOT EXISTS visits (
    day   TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);
"""


def get_db() -> sqlite3.Connection:
    """每次请求开一个短连接，避免多 worker 下共享连接的坑。"""
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(get_db()) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


# ---------------------------------------------------------------- 应用
app = FastAPI(
    title="Hopzz API",
    version="1.0.0",
    description="个人主页的轻量后端：服务器状态 + 硬件遥测。",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# 同源部署其实不需要 CORS；留着是为了以后拆分前端时不用改后端。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


# ---------------------------------------------------------------- 工具函数
def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _read_meminfo() -> tuple[int, int]:
    """返回 (总内存字节, 已用内存字节)。已用 = 总 - 可用。"""
    total = available = 0
    with open("/proc/meminfo", "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("MemTotal:"):
                total = int(line.split()[1]) * 1024
            elif line.startswith("MemAvailable:"):
                available = int(line.split()[1]) * 1024
    used = max(total - available, 0)
    return total, used


def _read_uptime() -> float:
    with open("/proc/uptime", "r", encoding="utf-8") as fh:
        return float(fh.read().split()[0])


def _disk() -> tuple[int, int]:
    st = os.statvfs("/")
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    return total, max(total - free, 0)


# ---------------------------------------------------------------- 模型
class TelemetryIn(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=64)
    temperature: Optional[float] = Field(None, ge=-100, le=200)
    humidity: Optional[float] = Field(None, ge=0, le=100)
    extra: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------- 接口
@app.get("/api/health")
def health() -> dict[str, Any]:
    """给监控 / 探活用。"""
    return {"ok": True, "service": "hopzz-api", "time": now_utc()}


@app.get("/api/status")
def status() -> dict[str, Any]:
    """服务器实时状态。数值全部现算，不缓存。"""
    cpu_count = os.cpu_count() or 1
    try:
        load1, _, _ = os.getloadavg()
    except OSError:
        load1 = 0.0

    mem_total, mem_used = _read_meminfo()
    disk_total, disk_used = _disk()

    return {
        "hostname": os.uname().nodename,
        "uptime_seconds": _read_uptime(),
        "cpu_count": cpu_count,
        "load1": round(load1, 2),
        # 1 分钟负载 / 核数，换算成"占用率"直觉值
        "cpu_percent": round(min(load1 / cpu_count * 100, 100), 1),
        "mem_total_bytes": mem_total,
        "mem_used_bytes": mem_used,
        "mem_percent": round(mem_used / mem_total * 100, 1) if mem_total else 0.0,
        "disk_total_bytes": disk_total,
        "disk_used_bytes": disk_used,
        "disk_percent": round(disk_used / disk_total * 100, 1) if disk_total else 0.0,
        "time": now_utc(),
    }


@app.post("/api/visit")
def visit() -> dict[str, Any]:
    """当天访问 +1。前端每次打开页面调用一次。"""
    day = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    with closing(get_db()) as conn:
        conn.execute(
            "INSERT INTO visits(day, count) VALUES(?, 1) "
            "ON CONFLICT(day) DO UPDATE SET count = count + 1",
            (day,),
        )
        conn.commit()
        row = conn.execute("SELECT count FROM visits WHERE day = ?", (day,)).fetchone()
    return {"ok": True, "day": day, "today": int(row["count"]) if row else 1}


@app.post("/api/telemetry")
def create_telemetry(
    payload: TelemetryIn,
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
) -> dict[str, Any]:
    """硬件上报入口。必须带 X-Device-Token，防止被人乱写数据。"""
    if not DEVICE_TOKEN:
        raise HTTPException(status_code=500, detail="服务器未配置 DEVICE_TOKEN")
    if x_device_token != DEVICE_TOKEN:
        raise HTTPException(status_code=401, detail="设备令牌无效")

    if payload.temperature is None and payload.humidity is None and not payload.extra:
        raise HTTPException(status_code=422, detail="至少需要 temperature / humidity / extra 之一")

    created = now_utc()
    import json

    with closing(get_db()) as conn:
        conn.execute(
            "INSERT INTO telemetry(device_id, temperature, humidity, extra, created_at) "
            "VALUES(?,?,?,?,?)",
            (
                payload.device_id,
                payload.temperature,
                payload.humidity,
                json.dumps(payload.extra, ensure_ascii=False) if payload.extra else None,
                created,
            ),
        )
        conn.commit()

    return {"ok": True, "created_at": created}


@app.get("/api/telemetry/latest")
def latest_telemetry() -> dict[str, Any]:
    """前端用：最新一条读数。没有数据时 latest 为 null。"""
    with closing(get_db()) as conn:
        row = conn.execute(
            "SELECT device_id, temperature, humidity, extra, created_at "
            "FROM telemetry ORDER BY id DESC LIMIT 1"
        ).fetchone()

    if row is None:
        return {"ok": True, "latest": None}

    return {
        "ok": True,
        "latest": {
            "device_id": row["device_id"],
            "temperature": row["temperature"],
            "humidity": row["humidity"],
            "extra": row["extra"],
            "created_at": row["created_at"],
        },
    }


@app.get("/api/telemetry/history")
def telemetry_history(limit: int = Query(default=50, ge=1, le=MAX_HISTORY)) -> dict[str, Any]:
    """历史数据，按时间倒序。"""
    with closing(get_db()) as conn:
        rows = conn.execute(
            "SELECT device_id, temperature, humidity, created_at "
            "FROM telemetry ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()

    return {
        "ok": True,
        "count": len(rows),
        "items": [dict(r) for r in rows],
    }


# 供 `python -m app.main` 直接调试用
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
