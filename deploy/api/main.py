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

import json
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------- 配置
DB_PATH = Path(os.getenv("DB_PATH", "/opt/hopzz-api/data/hopzz.db"))
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "").strip()
MAX_HISTORY = 500

# 一人付（opcpay）本地桥服务。API Key 只存在 /opt/opcpay-bridge/.env，
# 本进程（以及任何响应、日志）都不接触 Key。
BRIDGE_URL = os.getenv("BRIDGE_URL", "http://127.0.0.1:8102").rstrip("/")
# 回跳地址：一人付要求 HTTPS 且与项目登记的官网域名一致，不确定就留空（不传该参数）。
SPONSOR_CALLBACK_URL = os.getenv("SPONSOR_CALLBACK_URL", "").strip()
# 匿名赞助者 ID 的 Cookie：服务端生成，客户端不能指定 user_id。
UID_COOKIE = "hopzz_uid"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") != "0"
UID_PATTERN = re.compile(r"^u_[0-9a-f]{32}$")
ACTION_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,64}$")
PRODUCT_TTL = 60.0  # 套餐缓存秒数，减少上游调用（上游限流 120 次/分钟/凭证）
CAPABILITIES_TTL = 300.0
ACCESS_TTL = 15.0

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

-- 赞助：购买意图。业务编号(idempotency_key)在调用上游【之前】写入，
-- 之后的重试沿用同一行、同一编号、同一参数。
CREATE TABLE IF NOT EXISTS sponsor_purchase (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL,
    action_id       TEXT    NOT NULL,
    idempotency_key TEXT    NOT NULL UNIQUE,
    sku_id          TEXT    NOT NULL,
    callback_url    TEXT,
    status          TEXT    NOT NULL,
    purchase_url    TEXT,
    purchase_qr_code TEXT,
    expire_time     TEXT,
    reason_code     TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE(user_id, action_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_purchase_user ON sponsor_purchase(user_id);

-- 赞助：额度核销意图。同样的规则：先落库再调用，重试不换号。
CREATE TABLE IF NOT EXISTS sponsor_consume (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL,
    action_id       TEXT    NOT NULL,
    idempotency_key TEXT    NOT NULL UNIQUE,
    amount          INTEGER NOT NULL,
    reason          TEXT    NOT NULL,
    status          TEXT    NOT NULL,
    confirmed       INTEGER NOT NULL DEFAULT 0,
    delivered       INTEGER NOT NULL DEFAULT 0,
    quota_unit      TEXT,
    consumed        INTEGER,
    reason_code     TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE(user_id, action_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_consume_user ON sponsor_consume(user_id);
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


# ================================================================ 赞助（一人付 opcpay）
#
# 架构：浏览器 → /api/sponsor/*（本文件）→ 127.0.0.1:8102（Node 桥）→ opcpay
# 本文件里没有任何 API Key，也读不到 Key；Key 只在 /opt/opcpay-bridge/.env。
#
# 硬规则：
#   1. user_id 由服务端决定（签名 Cookie 里的匿名稳定 ID），不接受客户端传入。
#   2. 业务编号在调用上游【之前】写入 sqlite；重试沿用同一编号、同一参数。
#   3. 购买入口（READY / 回跳 / 扫码）都不算付款成功；付款后靠 /access 判定。
#   4. 额度核销只有 status=SUCCEEDED 且 confirmed=true 且编号/数量/单位一致才交付。

UID_SECRET_PATH = Path(os.getenv("UID_SECRET_PATH", str(DB_PATH.parent / ".uid_secret")))
SPONSOR_CONSUME_REASON = "hopzz.top 赞助额度核销"
# 控制台里的测试商品不放到公开页面上（用 SKU id 精确排除，不按名字猜）。
SPONSOR_HIDDEN_SKUS = {
    item.strip() for item in os.getenv("SPONSOR_HIDDEN_SKUS", "").split(",") if item.strip()
}
PUBLIC_OPTION_FIELDS = (
    "sku_id",
    "display_name",
    "billing_mode",
    "price",
    "currency",
    "entitlement_rule",
    "quota_unit",
    "quota_amount",
    "duration_period",
)


class BridgeError(Exception):
    """本地桥服务不可用，或上游返回了不可直接透传的错误。"""

    def __init__(self, message: str, status: int = 502, code: str = "BRIDGE_ERROR") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def _uid_secret() -> bytes:
    """Cookie 签名密钥：进程重启后仍能认出同一个匿名赞助者。"""
    env_secret = os.getenv("UID_SECRET", "").strip()
    if env_secret:
        return env_secret.encode("utf-8")
    try:
        existing = UID_SECRET_PATH.read_bytes().strip()
        if len(existing) >= 16:
            return existing
    except OSError:
        pass
    candidate = secrets.token_bytes(32)
    try:
        UID_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
        UID_SECRET_PATH.write_bytes(candidate)
        os.chmod(UID_SECRET_PATH, 0o600)
        # 2 个 worker 可能同时首次创建，以文件里最终的内容为准
        return UID_SECRET_PATH.read_bytes().strip() or candidate
    except OSError:
        return candidate


UID_SECRET = _uid_secret()


def _sign_uid(uid: str) -> str:
    import hashlib
    import hmac

    mac = hmac.new(UID_SECRET, uid.encode("utf-8"), hashlib.sha256).hexdigest()[:16]
    return f"{uid}.{mac}"


def _verify_uid(raw: Optional[str]) -> Optional[str]:
    import hashlib
    import hmac

    if not raw or "." not in raw:
        return None
    uid, _, mac = raw.rpartition(".")
    if not UID_PATTERN.match(uid) or len(mac) != 16:
        return None
    expected = hmac.new(UID_SECRET, uid.encode("utf-8"), hashlib.sha256).hexdigest()[:16]
    return uid if hmac.compare_digest(mac, expected) else None


def ensure_user_id(request: Request, response: Response) -> str:
    """从签名 Cookie 取匿名稳定 ID；没有/被篡改就新发一个。绝不读请求体里的 user_id。"""
    uid = _verify_uid(request.cookies.get(UID_COOKIE))
    if uid is None:
        uid = "u_" + secrets.token_hex(16)
    response.set_cookie(
        UID_COOKIE,
        _sign_uid(uid),
        max_age=31536000,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    return uid


# ---------------------------------------------------------------- 桥服务客户端
def _bridge_call(request: urllib.request.Request, timeout: float) -> tuple[int, dict[str, Any]]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read()
            try:
                body = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                raise BridgeError("桥服务返回了非 JSON 响应") from None
            if not isinstance(body, dict):
                raise BridgeError("桥服务返回了非对象 JSON")
            return int(resp.status), body
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        body.setdefault("error", f"桥服务返回 HTTP {exc.code}")
        body.setdefault("error_code", "BAD_BRIDGE_RESPONSE")
        return int(exc.code), body
    except urllib.error.URLError as exc:
        raise BridgeError(f"连不上本地桥服务：{exc.reason}") from exc
    except (TimeoutError, OSError) as exc:
        raise BridgeError(f"本地桥服务超时或读写失败：{exc}") from exc


def bridge_get(
    path: str, params: Optional[dict[str, str]] = None, timeout: float = 20.0
) -> tuple[int, dict[str, Any]]:
    url = BRIDGE_URL + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    return _bridge_call(req, timeout)


def bridge_post(
    path: str, payload: dict[str, Any], timeout: float = 40.0
) -> tuple[int, dict[str, Any]]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BRIDGE_URL + path,
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    return _bridge_call(req, timeout)


def bridge_data(
    path: str,
    payload: Optional[dict[str, Any]] = None,
    params: Optional[dict[str, str]] = None,
    timeout: float = 20.0,
) -> dict[str, Any]:
    if payload is None:
        status, body = bridge_get(path, params, timeout)
    else:
        status, body = bridge_post(path, payload, timeout)
    if status == 200 and body.get("ok") is True:
        data = body.get("data")
        return data if isinstance(data, dict) else {}
    raise BridgeError(
        str(body.get("error") or f"桥服务返回 HTTP {status}"),
        status=status,
        code=str(body.get("error_code") or "BRIDGE_ERROR"),
    )


# ---------------------------------------------------------------- 短缓存（保护上游限流）
_cache_lock = threading.Lock()
_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl: float, producer: Any) -> Any:
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = producer()
    with _cache_lock:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[key] = (now + ttl, value)
    return value


def sponsor_product() -> dict[str, Any]:
    return _cached("product", PRODUCT_TTL, lambda: bridge_data("/product"))


def sponsor_capabilities() -> dict[str, Any]:
    return _cached("capabilities", CAPABILITIES_TTL, lambda: bridge_data("/capabilities"))


def sponsor_access(user_id: str) -> dict[str, Any]:
    return _cached(
        "access:" + user_id,
        ACCESS_TTL,
        lambda: bridge_data("/access", params={"userId": user_id}),
    )


def public_option(option: dict[str, Any]) -> dict[str, Any]:
    return {
        key: option[key]
        for key in PUBLIC_OPTION_FIELDS
        if key in option and option[key] is not None
    }


def find_charging_option(product: dict[str, Any], sku_id: str) -> Optional[dict[str, Any]]:
    for option in product.get("charging_options") or []:
        if isinstance(option, dict) and option.get("sku_id") == sku_id:
            return option
    return None


def access_is_open(access: dict[str, Any]) -> bool:
    """买断/时长只看 decision=ALLOW；次数/积分还要有剩余额度（够不够另说）。"""
    if access.get("access_granted") is not True:
        return False
    if access.get("decision") == "ALLOW":
        return True
    if access.get("requires_consumption") is True:
        try:
            return int(access.get("remaining") or 0) > 0
        except (TypeError, ValueError):
            return False
    return False


# ---------------------------------------------------------------- 购买意图落库
def _ensure_purchase_row(user_id: str, action_id: str, sku_id: str) -> tuple[sqlite3.Row, bool]:
    """返回 (行, 是否新建)。新行在调上游之前提交，编号随即固定。"""
    stamp = now_utc()
    with closing(get_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM sponsor_purchase WHERE user_id = ? AND action_id = ?",
            (user_id, action_id),
        ).fetchone()
        if row is not None:
            conn.rollback()
            return row, False
        conn.execute(
            "INSERT INTO sponsor_purchase("
            " user_id, action_id, idempotency_key, sku_id, callback_url,"
            " status, attempts, created_at, updated_at"
            ") VALUES(?,?,?,?,?,?,0,?,?)",
            (
                user_id,
                action_id,
                "pur_" + secrets.token_hex(16),
                sku_id,
                SPONSOR_CALLBACK_URL or None,
                "CREATED",
                stamp,
                stamp,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM sponsor_purchase WHERE user_id = ? AND action_id = ?",
            (user_id, action_id),
        ).fetchone()
    return row, True


def _update_purchase(row_id: int, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = now_utc()
    assignments = ", ".join(f"{name} = ?" for name in fields)
    with closing(get_db()) as conn:
        conn.execute(
            f"UPDATE sponsor_purchase SET attempts = attempts + 1, {assignments} WHERE id = ?",
            (*fields.values(), row_id),
        )
        conn.commit()


def _ensure_consume_row(user_id: str, action_id: str, amount: int) -> tuple[sqlite3.Row, bool]:
    stamp = now_utc()
    with closing(get_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM sponsor_consume WHERE user_id = ? AND action_id = ?",
            (user_id, action_id),
        ).fetchone()
        if row is not None:
            conn.rollback()
            return row, False
        conn.execute(
            "INSERT INTO sponsor_consume("
            " user_id, action_id, idempotency_key, amount, reason, status, attempts,"
            " created_at, updated_at"
            ") VALUES(?,?,?,?,?,?,0,?,?)",
            (
                user_id,
                action_id,
                "use_" + secrets.token_hex(16),
                amount,
                SPONSOR_CONSUME_REASON,
                "CREATED",
                stamp,
                stamp,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM sponsor_consume WHERE user_id = ? AND action_id = ?",
            (user_id, action_id),
        ).fetchone()
    return row, True


def _update_consume(row_id: int, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = now_utc()
    assignments = ", ".join(f"{name} = ?" for name in fields)
    with closing(get_db()) as conn:
        conn.execute(
            f"UPDATE sponsor_consume SET attempts = attempts + 1, {assignments} WHERE id = ?",
            (*fields.values(), row_id),
        )
        conn.commit()


# ---------------------------------------------------------------- 赞助接口
class SponsorPurchaseIn(BaseModel):
    sku_id: str = Field(..., min_length=1, max_length=128)
    action_id: str = Field(..., min_length=8, max_length=64)


class SponsorConsumeIn(BaseModel):
    action_id: str = Field(..., min_length=8, max_length=64)
    amount: int = Field(default=1, ge=1, le=99999999)


@app.get("/api/sponsor/product")
def sponsor_product_route() -> dict[str, Any]:
    """套餐列表。只展示 /product 真实返回的档位，不编造价格。"""
    try:
        product = sponsor_product()
        caps = sponsor_capabilities()
    except BridgeError as exc:
        return {
            "ok": False,
            "purchase_available": False,
            "plans": [],
            "message": f"赞助服务暂时不可用：{exc}",
            "error_code": exc.code,
        }

    plans = [
        public_option(option)
        for option in (product.get("charging_options") or [])
        if isinstance(option, dict)
        and option.get("sku_id")
        and option.get("sku_id") not in SPONSOR_HIDDEN_SKUS
    ]
    plans.sort(key=lambda item: float(item.get("price") or 0))

    capability_flags = caps.get("capabilities") or {}
    return {
        "ok": True,
        "purchase_available": product.get("capability_status") == "ENABLED"
        and bool(capability_flags.get("purchase_entry")),
        "capability_status": product.get("capability_status"),
        "product_name": product.get("product_name"),
        "product_icon_url": product.get("product_icon_url"),
        "billing_mode": product.get("billing_mode"),
        "quota_unit": product.get("quota_unit"),
        "plans": plans,
        # 只把前端要用的能力位透出去，别的一律不展示
        "capabilities": {
            "purchase_entry": bool(capability_flags.get("purchase_entry")),
            "entitlement_query": bool(capability_flags.get("entitlement_query")),
            "consumption": bool(capability_flags.get("consumption")),
        },
    }


@app.get("/api/sponsor/access")
def sponsor_access_route(request: Request, response: Response) -> dict[str, Any]:
    """当前匿名赞助者的权益。只有 access_granted 且 ALLOW（额度模式为有剩余）才算开放。"""
    user_id = ensure_user_id(request, response)
    response.headers["Cache-Control"] = "no-store"
    try:
        access = sponsor_access(user_id)
    except BridgeError as exc:
        return {
            "ok": False,
            "allowed": False,
            "message": f"查询权益失败：{exc}",
            "error_code": exc.code,
        }
    return {"ok": True, "allowed": access_is_open(access), "access": access}


@app.post("/api/sponsor/purchase")
def sponsor_purchase_route(
    payload: SponsorPurchaseIn, request: Request, response: Response
) -> dict[str, Any]:
    """创建购买入口。返回的 purchase_url 只是入口，不代表已付款。"""
    user_id = ensure_user_id(request, response)
    response.headers["Cache-Control"] = "no-store"
    if not ACTION_PATTERN.match(payload.action_id):
        raise HTTPException(status_code=400, detail="action_id 格式不对")

    try:
        product = sponsor_product()
    except BridgeError as exc:
        raise HTTPException(status_code=503, detail=f"读取套餐失败：{exc}") from exc

    if product.get("capability_status") != "ENABLED":
        return {
            "ok": False,
            "status": "UNAVAILABLE",
            "message": "赞助入口当前未开放。",
        }

    option = find_charging_option(product, payload.sku_id)
    if option is None or payload.sku_id in SPONSOR_HIDDEN_SKUS:
        raise HTTPException(status_code=400, detail="这个套餐不存在或已下架，刷新页面再看看")

    row, _created = _ensure_purchase_row(user_id, payload.action_id, payload.sku_id)
    if row["sku_id"] != payload.sku_id:
        raise HTTPException(status_code=409, detail="同一次操作不能更换套餐，请刷新页面重新发起")

    if row["status"] in ("EXPIRED", "FAILED"):
        return {
            "ok": False,
            "status": row["status"],
            "message": "这次购买入口已经失效，重新点一次购买就好。",
            "reason_code": row["reason_code"],
        }

    request_body: dict[str, Any] = {
        "userId": user_id,
        "idempotencyKey": row["idempotency_key"],
        "skuId": row["sku_id"],
    }
    if row["callback_url"]:
        request_body["callbackURL"] = row["callback_url"]

    try:
        status_code, body = bridge_post("/purchase", request_body)
    except BridgeError as exc:
        _update_purchase(row["id"], status="UNKNOWN", reason_code="BRIDGE_UNAVAILABLE")
        return {
            "ok": False,
            "status": "UNKNOWN",
            "message": "支付服务暂时联系不上，稍后用同一次操作重试即可，不会重复下单。",
            "error_code": exc.code,
        }

    data = body.get("data") if isinstance(body, dict) else None

    if status_code == 200 and isinstance(data, dict):
        upstream_status = str(data.get("status") or "UNKNOWN")
        if upstream_status == "READY" and data.get("purchase_url"):
            _update_purchase(
                row["id"],
                status="READY",
                purchase_url=str(data.get("purchase_url")),
                purchase_qr_code=str(data["purchase_qr_code"])
                if data.get("purchase_qr_code")
                else None,
                expire_time=str(data["expire_time"]) if data.get("expire_time") else None,
                reason_code=None,
            )
            return {
                "ok": True,
                "status": "READY",
                "purchase_url": str(data["purchase_url"]),
                "purchase_qr_code": data.get("purchase_qr_code"),
                "expire_time": data.get("expire_time"),
                "plan": public_option(option),
                "note": "这只是支付入口。付款完成后回到本页，按「查询权益」确认。",
            }
        if upstream_status == "UNKNOWN":
            _update_purchase(row["id"], status="UNKNOWN")
            return {
                "ok": False,
                "status": "UNKNOWN",
                "message": "支付入口结果待确认，稍后再点一次（还是这一次操作）。",
            }
        _update_purchase(
            row["id"], status="FAILED", reason_code=str(data.get("reason_code") or "FAILED")
        )
        return {
            "ok": False,
            "status": "FAILED",
            "message": "上游没有创建购买入口，这次没有产生任何扣款。",
            "reason_code": data.get("reason_code"),
            "upstream_message": data.get("message"),
        }

    error_code = str((body or {}).get("error_code") or "PURCHASE_ERROR")
    retryable = bool((body or {}).get("retryable"))
    if error_code == "PURCHASE_ENTRY_EXPIRED":
        _update_purchase(row["id"], status="EXPIRED", reason_code=error_code)
        return {
            "ok": False,
            "status": "EXPIRED",
            "message": "旧的购买入口已过期，重新点一次购买就好。",
            "error_code": error_code,
        }
    if error_code == "IDEMPOTENCY_CONFLICT":
        _update_purchase(row["id"], status="FAILED", reason_code=error_code)
        return {
            "ok": False,
            "status": "FAILED",
            "message": "这次操作编号和已有记录冲突，请刷新页面重新发起。",
            "error_code": error_code,
        }
    return {
        "ok": False,
        "status": "ERROR",
        "message": str((body or {}).get("error") or "上游返回错误"),
        "error_code": error_code,
        "retryable": retryable,
    }


@app.post("/api/sponsor/consume")
def sponsor_consume_route(
    payload: SponsorConsumeIn, request: Request, response: Response
) -> dict[str, Any]:
    """核销次数/积分。仅当上游 SUCCEEDED + confirmed 且编号/数量/单位一致才 delivered=true。

    当前主站没有需要消耗额度的付费功能，所以前端没有调用这个接口；
    保留它是为了以后有付费功能时直接接入这套幂等/确认规则。
    """
    user_id = ensure_user_id(request, response)
    response.headers["Cache-Control"] = "no-store"
    if not ACTION_PATTERN.match(payload.action_id):
        raise HTTPException(status_code=400, detail="action_id 格式不对")

    try:
        product = sponsor_product()
    except BridgeError as exc:
        raise HTTPException(status_code=503, detail=f"读取套餐失败：{exc}") from exc

    quota_unit = product.get("quota_unit")
    if quota_unit == "COUNT" and payload.amount != 1:
        raise HTTPException(status_code=422, detail="次数套餐每次只能核销 1 次")

    row, _created = _ensure_consume_row(user_id, payload.action_id, payload.amount)
    if int(row["amount"]) != payload.amount:
        raise HTTPException(status_code=409, detail="同一次操作不能改变核销数量")

    if int(row["delivered"]) == 1:
        return {
            "ok": True,
            "delivered": True,
            "status": row["status"],
            "message": "这次核销之前已经确认过，直接复用原结果。",
        }
    if row["status"] == "FAILED" and not int(row["confirmed"]):
        return {
            "ok": False,
            "delivered": False,
            "status": "FAILED",
            "message": "这次核销已明确失败，没有扣减；需要重新发起一次操作。",
            "reason_code": row["reason_code"],
        }

    try:
        status_code, body = bridge_post(
            "/consume",
            {
                "userId": user_id,
                "idempotencyKey": row["idempotency_key"],
                "amount": int(row["amount"]),
                "reason": row["reason"],
            },
        )
    except BridgeError as exc:
        _update_consume(row["id"], status="UNKNOWN")
        return {
            "ok": False,
            "delivered": False,
            "status": "UNKNOWN",
            "message": "核销结果未知，不要换号；稍后用同一次操作重试。",
            "error_code": exc.code,
        }

    data = body.get("data") if isinstance(body, dict) else None
    if status_code == 200 and isinstance(data, dict):
        upstream_status = str(data.get("status") or "UNKNOWN")
        confirmed = data.get("confirmed") is True
        consumed = data.get("consumed")
        unit = data.get("quota_unit")
        delivered = (
            upstream_status == "SUCCEEDED"
            and confirmed
            and consumed == int(row["amount"])
            and (quota_unit is None or unit == quota_unit)
        )
        _update_consume(
            row["id"],
            status=upstream_status,
            confirmed=1 if confirmed else 0,
            delivered=1 if delivered else 0,
            quota_unit=str(unit) if unit else None,
            consumed=int(consumed) if isinstance(consumed, int) else None,
            reason_code=str(data.get("reason_code") or "") or None,
        )
        if delivered:
            return {
                "ok": True,
                "delivered": True,
                "status": upstream_status,
                "remaining": data.get("remaining"),
                "message": "核销已确认，可以交付。",
            }
        return {
            "ok": False,
            "delivered": False,
            "status": upstream_status,
            "message": "核销尚未确认，先不交付；用同一次操作重试。",
            "reason_code": data.get("reason_code"),
        }

    error_code = str((body or {}).get("error_code") or "CONSUME_ERROR")
    return {
        "ok": False,
        "delivered": False,
        "status": "FAILED",
        "message": str((body or {}).get("error") or "上游返回错误"),
        "error_code": error_code,
        "retryable": bool((body or {}).get("retryable")),
    }


# 供 `python -m app.main` 直接调试用
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
