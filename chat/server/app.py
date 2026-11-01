"""
hopzz chat relay —— 手机网页 ⇄ 家电脑上的 DSH 插件
=================================================

   手机浏览器 ──HTTPS/WSS──> chat.hopzz.top (nginx) ──> 本服务 127.0.0.1:8100
                                                              ▲
                                                              │ 插件主动外连（WSS）
                                            家里的 DSH Harness ┘

这一版是**纯中继**：不自己存对话。手机上看到的项目、会话、历史，
全部来自 DSH Harness 自己的会话存储，由插件现场读出来。

两条 WebSocket：
  /ws        浏览器用（登录 cookie）
  /agent-ws  插件用（令牌）

服务器只负责：鉴权（密码/改密码/错 5 次锁定）、请求转发、结果回传。
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------- 配置
DB_PATH = Path(os.getenv("DB_PATH", "/opt/hopzz-chat/data/chat.db"))
INITIAL_PASSWORD = os.getenv("CHAT_PASSWORD", "")
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "")
COOKIE_SECRET = os.getenv("COOKIE_SECRET", "")
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/opt/hopzz-chat/static"))

COOKIE_NAME = "hopzz_chat"
COOKIE_MAX_AGE = 30 * 24 * 3600
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "5"))
LOCK_SECONDS = int(os.getenv("LOCK_SECONDS", "900"))
MIN_PASSWORD_LEN = 8
REQUEST_TIMEOUT = 330          # 秒：等插件回答的上限
REQUEST_GC_SECONDS = 600       # 秒：太久没回应的请求清掉

if not AGENT_TOKEN or not COOKIE_SECRET or not INITIAL_PASSWORD:
    raise RuntimeError("必须设置 CHAT_PASSWORD / AGENT_TOKEN / COOKIE_SECRET")

# ---------------------------------------------------------------- 数据库（只存鉴权状态）
SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------- 密码
def hash_password(password: str) -> str:
    iterations = 200_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations_s, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations_s)
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except Exception:
        return False


def meta_get(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def meta_set(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def current_pwd_version() -> int:
    with closing(db()) as conn:
        return int(meta_get(conn, "pwd_ver", "1") or "1")


def check_login_allowed() -> int:
    with closing(db()) as conn:
        locked_until = int(meta_get(conn, "locked_until", "0") or "0")
    remaining = locked_until - int(time.time())
    return remaining if remaining > 0 else 0


def register_failure() -> tuple[int, int]:
    with closing(db()) as conn:
        fails = int(meta_get(conn, "fail_count", "0") or "0") + 1
        if fails >= MAX_ATTEMPTS:
            meta_set(conn, "fail_count", "0")
            meta_set(conn, "locked_until", str(int(time.time()) + LOCK_SECONDS))
            conn.commit()
            return 0, LOCK_SECONDS
        meta_set(conn, "fail_count", str(fails))
        conn.commit()
        return MAX_ATTEMPTS - fails, 0


def register_success() -> None:
    with closing(db()) as conn:
        meta_set(conn, "fail_count", "0")
        meta_set(conn, "locked_until", "0")
        conn.commit()


def get_stored_hash() -> str:
    with closing(db()) as conn:
        return meta_get(conn, "pwd_hash", "") or ""


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(db()) as conn:
        conn.executescript(SCHEMA)
        if not meta_get(conn, "pwd_hash"):
            meta_set(conn, "pwd_hash", hash_password(INITIAL_PASSWORD))
            meta_set(conn, "pwd_ver", "1")
            print("[relay] 已从环境变量初始化登录密码", flush=True)
        conn.commit()


# ---------------------------------------------------------------- cookie
def sign_session(expires: int, version: int) -> str:
    payload = f"ok:{expires}:{version}"
    mac = hmac.new(COOKIE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{version}.{mac}"


def verify_session(value: Optional[str]) -> bool:
    if not value or value.count(".") != 2:
        return False
    head, version_s, mac = value.split(".")
    try:
        expires = int(head)
        version = int(version_s)
    except ValueError:
        return False
    if expires < int(time.time()):
        return False
    expected = hmac.new(
        COOKIE_SECRET.encode(), f"ok:{expires}:{version}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, mac):
        return False
    return version == current_pwd_version()


def set_login_cookie(resp: JSONResponse) -> None:
    expires = int(time.time()) + COOKIE_MAX_AGE
    resp.set_cookie(
        key=COOKIE_NAME,
        value=sign_session(expires, current_pwd_version()),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


# ---------------------------------------------------------------- 连接与请求映射
class Hub:
    def __init__(self) -> None:
        self.browsers: set[WebSocket] = set()
        self.agent: Optional[WebSocket] = None
        # server_id -> {"ws": WebSocket, "client_id": str, "ts": float}
        self.pending: dict[str, dict[str, Any]] = {}

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        text = json.dumps(payload, ensure_ascii=False)
        for ws in list(self.browsers):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.browsers.discard(ws)

    async def to_agent(self, payload: dict[str, Any]) -> bool:
        if self.agent is None:
            return False
        try:
            await self.agent.send_text(json.dumps(payload, ensure_ascii=False))
            return True
        except Exception:
            self.agent = None
            return False

    async def agent_status(self) -> None:
        await self.broadcast(
            {"type": "agent_status", "state": "online" if self.agent else "offline"}
        )

    def gc(self) -> None:
        cutoff = time.time() - REQUEST_GC_SECONDS
        for rid in [k for k, v in self.pending.items() if v["ts"] < cutoff]:
            self.pending.pop(rid, None)


hub = Hub()

app = FastAPI(title="hopzz chat relay", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
async def _startup() -> None:
    init_db()

    async def sweeper() -> None:
        while True:
            await asyncio.sleep(60)
            hub.gc()

    asyncio.create_task(sweeper())


# ---------------------------------------------------------------- 静态页
@app.get("/")
def index() -> Any:
    page = STATIC_DIR / "index.html"
    if not page.exists():
        return JSONResponse({"ok": False, "error": "前端未安装"}, status_code=500)
    return FileResponse(page, media_type="text/html; charset=utf-8")


# ---------------------------------------------------------------- 登录 / 密码
@app.get("/api/me")
def me(request: Request) -> Any:
    if verify_session(request.cookies.get(COOKIE_NAME)):
        return {"ok": True}
    return JSONResponse({"ok": False}, status_code=401)


@app.post("/api/login")
async def login(request: Request) -> Any:
    locked = check_login_allowed()
    if locked > 0:
        return JSONResponse(
            {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": locked},
            status_code=429,
        )
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "请求格式错误"}, status_code=400)

    if not verify_password(str(body.get("password", "")), get_stored_hash()):
        await asyncio.sleep(0.6)
        remaining, lock = register_failure()
        if lock > 0:
            return JSONResponse(
                {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": lock}, status_code=429
            )
        return JSONResponse(
            {"ok": False, "error": "密码不对", "remaining": remaining}, status_code=401
        )

    register_success()
    resp = JSONResponse({"ok": True})
    set_login_cookie(resp)
    return resp


@app.post("/api/logout")
def logout() -> Any:
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@app.post("/api/password")
async def change_password(request: Request) -> Any:
    if not verify_session(request.cookies.get(COOKIE_NAME)):
        return JSONResponse({"ok": False, "error": "未登录"}, status_code=401)

    locked = check_login_allowed()
    if locked > 0:
        return JSONResponse(
            {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": locked}, status_code=429
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "请求格式错误"}, status_code=400)

    old_password = str(body.get("old_password", ""))
    new_password = str(body.get("new_password", ""))

    if len(new_password) < MIN_PASSWORD_LEN:
        return JSONResponse(
            {"ok": False, "error": f"新密码至少 {MIN_PASSWORD_LEN} 位"}, status_code=400
        )

    if not verify_password(old_password, get_stored_hash()):
        await asyncio.sleep(0.6)
        remaining, lock = register_failure()
        if lock > 0:
            return JSONResponse(
                {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": lock}, status_code=429
            )
        return JSONResponse(
            {"ok": False, "error": "原密码不对", "remaining": remaining}, status_code=401
        )

    with closing(db()) as conn:
        meta_set(conn, "pwd_hash", hash_password(new_password))
        version = int(meta_get(conn, "pwd_ver", "1") or "1") + 1
        meta_set(conn, "pwd_ver", str(version))
        conn.commit()
    register_success()
    print("[relay] 登录密码已修改，所有旧登录态失效", flush=True)

    resp = JSONResponse({"ok": True})
    set_login_cookie(resp)
    return resp


# ---------------------------------------------------------------- 浏览器 WebSocket
@app.websocket("/ws")
async def browser_ws(websocket: WebSocket) -> None:
    if not verify_session(websocket.cookies.get(COOKIE_NAME)):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    hub.browsers.add(websocket)
    try:
        await websocket.send_text(
            json.dumps({"type": "agent_status", "state": "online" if hub.agent else "offline"})
        )
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("type") != "req":
                continue

            client_id = str(data.get("id") or "")
            action = str(data.get("action") or "")
            if not client_id or not action:
                continue

            if hub.agent is None:
                await websocket.send_text(
                    json.dumps(
                        {"type": "res", "id": client_id, "error": "电脑端未连接，请确认 DSH 正在运行"}
                    )
                )
                continue

            server_id = uuid.uuid4().hex
            hub.pending[server_id] = {
                "ws": websocket,
                "client_id": client_id,
                "ts": time.time(),
            }
            delivered = await hub.to_agent(
                {
                    "type": "req",
                    "id": server_id,
                    "action": action,
                    "payload": data.get("payload") or {},
                }
            )
            if not delivered:
                hub.pending.pop(server_id, None)
                await websocket.send_text(
                    json.dumps({"type": "res", "id": client_id, "error": "转发失败，电脑端刚断开"})
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.browsers.discard(websocket)


# ---------------------------------------------------------------- 插件 WebSocket
@app.websocket("/agent-ws")
async def agent_ws(websocket: WebSocket) -> None:
    auth = websocket.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        token = websocket.query_params.get("token", "")
    if not hmac.compare_digest(token, AGENT_TOKEN):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    hub.agent = websocket
    await hub.agent_status()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            kind = data.get("type")

            if kind == "hello":
                print(f"[relay] 插件已连接，版本 {data.get('version')}", flush=True)

            elif kind == "res":
                entry = hub.pending.pop(str(data.get("id") or ""), None)
                if entry is None:
                    continue
                payload: dict[str, Any] = {"type": "res", "id": entry["client_id"]}
                if data.get("error"):
                    payload["error"] = str(data["error"])
                else:
                    payload["data"] = data.get("data")
                try:
                    await entry["ws"].send_text(json.dumps(payload, ensure_ascii=False))
                except Exception:
                    pass

            elif kind == "ev":
                await hub.broadcast(
                    {
                        "type": "ev",
                        "kind": data.get("kind"),
                        "sessionId": data.get("sessionId"),
                        "text": data.get("text"),
                        "on": data.get("on"),
                    }
                )

            elif kind == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if hub.agent is websocket:
            hub.agent = None
        await hub.agent_status()


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
