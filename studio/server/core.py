"""工作室核心：鉴权、数据库、存储、路径安全、项目读写。

这个文件是 studio 后端的公共底座，其它模块（projects/media/ai）都从这里取东西。
不要在这里塞业务路由。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, Request

# ---------------------------------------------------------------- 环境

ROOT = Path(os.getenv("STUDIO_ROOT", "/srv/files/工作站")).resolve()
DB_PATH = Path(os.getenv("DB_PATH", "/opt/hopzz-studio/data/studio.db"))
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/opt/hopzz-studio/static"))
INITIAL_PASSWORD = os.getenv("STUDIO_PASSWORD", "")
COOKIE_SECRET = os.getenv("COOKIE_SECRET", "")

COOKIE_NAME = "hopzz_studio"
COOKIE_MAX_AGE = 30 * 24 * 3600
MAX_ATTEMPTS = 5
LOCK_SECONDS = 600
MIN_PASSWORD_LEN = 6

# 允许的媒体扩展名（预览用）
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg", ".ico"}
AUDIO_EXT = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".mid", ".midi"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi"}
TEXT_EXT = {".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".log",
            ".py", ".js", ".ts", ".css", ".html", ".c", ".h", ".cpp", ".java",
            ".sh", ".ini", ".toml", ".xml", ".srt", ".lrc"}
ARCHIVE_EXT = {".zip", ".7z", ".rar", ".tar", ".gz", ".flp", ".als", ".logicx", ".psd", ".ai", ".blend", ".kra"}

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")


def ensure_dirs() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- 数据库

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_ids TEXT NOT NULL DEFAULT '[]',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id, id);
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0
);
"""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    ensure_dirs()
    with db() as conn:
        conn.executescript(SCHEMA)
        if not meta_get(conn, "pwd_hash") and INITIAL_PASSWORD:
            meta_set(conn, "pwd_hash", hash_password(INITIAL_PASSWORD))
        if not meta_get(conn, "pwd_ver"):
            meta_set(conn, "pwd_ver", "1")


def meta_get(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def meta_set(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


# ---------------------------------------------------------------- 密码

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return f"pbkdf2_sha256$200000${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters))
        return hmac.compare_digest(dk.hex(), digest)
    except Exception:
        return False


def current_pwd_version() -> int:
    with db() as conn:
        return int(meta_get(conn, "pwd_ver", "1") or 1)


def get_stored_hash() -> str:
    with db() as conn:
        return meta_get(conn, "pwd_hash", "") or ""


# ---------------------------------------------------------------- 登录限制

def check_login_allowed() -> int:
    """返回剩余锁定秒数，0 表示可以尝试。"""
    with db() as conn:
        locked_until = int(meta_get(conn, "locked_until", "0") or 0)
    return max(0, locked_until - int(time.time()))


def register_failure() -> tuple[int, int]:
    with db() as conn:
        count = int(meta_get(conn, "fail_count", "0") or 0) + 1
        meta_set(conn, "fail_count", str(count))
        if count >= MAX_ATTEMPTS:
            meta_set(conn, "locked_until", str(int(time.time()) + LOCK_SECONDS))
            meta_set(conn, "fail_count", "0")
            return count, LOCK_SECONDS
    return count, 0


def register_success() -> None:
    with db() as conn:
        meta_set(conn, "fail_count", "0")
        meta_set(conn, "locked_until", "0")


# ---------------------------------------------------------------- cookie

def sign_session(expires: int, version: int) -> str:
    payload = f"ok:{expires}:{version}"
    mac = hmac.new(COOKIE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{version}.{mac}"


def verify_session(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        expires_s, version_s, mac = value.split(".", 2)
        expires = int(expires_s)
        version = int(version_s)
    except Exception:
        return False
    if expires < int(time.time()):
        return False
    expected = hmac.new(
        COOKIE_SECRET.encode(), f"ok:{expires}:{version}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(mac, expected):
        return False
    return version == current_pwd_version()


def request_is_https(request: Request) -> bool:
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if proto:
        return proto == "https"
    return request.url.scheme == "https"


def set_login_cookie(resp: Any, request: Optional[Request] = None) -> None:
    expires = int(time.time()) + COOKIE_MAX_AGE
    resp.set_cookie(
        key=COOKIE_NAME,
        value=sign_session(expires, current_pwd_version()),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=request_is_https(request) if request is not None else True,
        samesite="lax",
        path="/",
    )


def require_auth(request: Request) -> None:
    if not verify_session(request.cookies.get(COOKIE_NAME)):
        raise HTTPException(status_code=401, detail="unauthorized")


# ---------------------------------------------------------------- 路径安全

def safe_project_path(project_id: str, rel: str = "") -> Path:
    """把 (项目ID, 相对路径) 解析成真实路径，越界直接 400。"""
    if not SLUG_RE.match(project_id or ""):
        raise HTTPException(status_code=400, detail="bad project id")
    base = (ROOT / project_id).resolve()
    if ROOT not in base.parents and base != ROOT:
        raise HTTPException(status_code=400, detail="bad path")
    target = (base / rel.lstrip("/")).resolve() if rel else base
    if target != base and base not in target.parents:
        raise HTTPException(status_code=400, detail="path escape")
    return target


def safe_name(name: str) -> str:
    name = (name or "").strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    if name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="bad name")
    return name[:180]


# ---------------------------------------------------------------- 项目

PROJECT_FILE = "project.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_project_id() -> str:
    return "p-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(3)


def read_project(project_id: str) -> dict[str, Any]:
    p = safe_project_path(project_id) / PROJECT_FILE
    if not p.exists():
        raise HTTPException(status_code=404, detail="project not found")
    return json.loads(p.read_text(encoding="utf-8"))


def write_project(project_id: str, data: dict[str, Any]) -> None:
    base = safe_project_path(project_id)
    base.mkdir(parents=True, exist_ok=True)
    data["updatedAt"] = now_iso()
    tmp = base / (PROJECT_FILE + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(base / PROJECT_FILE)


def list_project_ids() -> list[str]:
    if not ROOT.exists():
        return []
    out = []
    for d in sorted(ROOT.iterdir()):
        if d.is_dir() and SLUG_RE.match(d.name) and (d / PROJECT_FILE).exists():
            out.append(d.name)
    return out


def media_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in VIDEO_EXT:
        return "video"
    if ext in TEXT_EXT:
        return "text"
    if ext in ARCHIVE_EXT:
        return "archive"
    return "file"


def human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"
