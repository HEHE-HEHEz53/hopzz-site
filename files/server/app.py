"""
鲸鱼娘网盘 —— 密码保护的文件收发站
=================================

域名 f.hopzz.top
  - 快速上传：文件直接落进「快速上传」文件夹，紧急情况下最少的点击
  - 网盘模式：浏览 / 上传 / 下载 / 新建文件夹 / 移动 / 删除

只给一个人用，所以鉴权就是一个密码 + 签名 cookie。
"""

from __future__ import annotations

import hashlib
import hmac
import os
import shutil
import secrets
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------- 配置
ROOT = Path(os.getenv("ROOT_DIR", "/srv/files")).resolve()
DB_PATH = Path(os.getenv("DB_PATH", "/opt/hopzz-files/data/files.db"))
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/opt/hopzz-files/static"))
INITIAL_PASSWORD = os.getenv("FILE_PASSWORD", "")
COOKIE_SECRET = os.getenv("COOKIE_SECRET", "")

COOKIE_NAME = "hopzz_files"
ND_COOKIE_NAME = "hopzz_files_nd"   # 只有「进入网盘」之后才发，改密码要用它
COOKIE_MAX_AGE = 30 * 24 * 3600
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "5"))
LOCK_SECONDS = int(os.getenv("LOCK_SECONDS", "600"))
MIN_PASSWORD_LEN = 6
QUICK_DIR = "快速上传"
CHUNK = 1024 * 1024

if not INITIAL_PASSWORD or not COOKIE_SECRET:
    raise RuntimeError("必须设置 FILE_PASSWORD / COOKIE_SECRET")

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


def meta_get(conn, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def meta_set(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


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


def current_pwd_version() -> int:
    with closing(db()) as conn:
        return int(meta_get(conn, "pwd_ver", "1") or "1")


def get_stored_hash() -> str:
    with closing(db()) as conn:
        return meta_get(conn, "pwd_hash", "") or ""


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


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / QUICK_DIR).mkdir(exist_ok=True)
    with closing(db()) as conn:
        conn.executescript(SCHEMA)
        if not meta_get(conn, "pwd_hash"):
            meta_set(conn, "pwd_hash", hash_password(INITIAL_PASSWORD))
            meta_set(conn, "pwd_ver", "1")
            print("[files] 已从环境变量初始化网盘密码", flush=True)
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


# ---- 网盘模式凭证：进入网盘才发 ----
def sign_netdisk(expires: int, version: int) -> str:
    payload = f"nd:{expires}:{version}"
    mac = hmac.new(COOKIE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{mac}"


def has_netdisk(request: Request) -> bool:
    value = request.cookies.get(ND_COOKIE_NAME)
    if not value or value.count(".") != 1:
        return False
    head, mac = value.split(".")
    try:
        expires = int(head)
    except ValueError:
        return False
    if expires < int(time.time()):
        return False
    expected = hmac.new(
        COOKIE_SECRET.encode(),
        f"nd:{expires}:{current_pwd_version()}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, mac)


def set_netdisk_cookie(resp: JSONResponse) -> None:
    expires = int(time.time()) + COOKIE_MAX_AGE
    resp.set_cookie(
        key=ND_COOKIE_NAME,
        value=sign_netdisk(expires, current_pwd_version()),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


def require_auth(request: Request) -> None:
    if not verify_session(request.cookies.get(COOKIE_NAME)):
        raise HTTPException(status_code=401, detail="未登录")


# ---------------------------------------------------------------- 路径安全
def norm_rel(rel: str) -> str:
    """把前端传来的路径规范成 /a/b 形式，拒绝 .. """
    rel = (rel or "/").replace("\\", "/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise HTTPException(status_code=400, detail="非法路径")
    if any(part in (".git",) for part in parts):
        raise HTTPException(status_code=400, detail="非法路径")
    return "/" + "/".join(parts)


def abs_path(rel: str) -> Path:
    rel = norm_rel(rel)
    target = (ROOT / rel.lstrip("/")).resolve()
    base = str(ROOT)
    if target != ROOT and not str(target).startswith(base + os.sep):
        raise HTTPException(status_code=400, detail="越界路径")
    return target


def rel_of(path: Path) -> str:
    return "/" + path.relative_to(ROOT).as_posix().strip("/")


def unique_path(dest: Path) -> Path:
    """同名文件自动加 (1)(2)"""
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    for i in range(1, 1000):
        candidate = dest.with_name(f"{stem} ({i}){suffix}")
        if not candidate.exists():
            return candidate
    return dest.with_name(f"{stem} ({secrets.token_hex(3)}){suffix}")


# ---------------------------------------------------------------- 应用
app = FastAPI(title="鲸鱼娘网盘", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def _startup() -> None:
    init_db()


# ---------------------------------------------------------------- 鉴权接口
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
        remaining, lock = register_failure()
        if lock > 0:
            return JSONResponse(
                {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": lock},
                status_code=429,
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
    resp.delete_cookie(ND_COOKIE_NAME, path="/")
    return resp


@app.post("/api/enter-netdisk")
def enter_netdisk(request: Request) -> Any:
    """进入网盘模式：发一个额外的凭证，改密码必须要它。"""
    require_auth(request)
    resp = JSONResponse({"ok": True})
    set_netdisk_cookie(resp)
    return resp


@app.post("/api/password")
async def change_password(request: Request) -> Any:
    """改密码：必须在网盘模式里（有 nd 凭证）才能改。"""
    require_auth(request)
    if not has_netdisk(request):
        return JSONResponse(
            {"ok": False, "error": "只有进入网盘后才能修改密码"}, status_code=403
        )

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

    old_password = str(body.get("old_password", ""))
    new_password = str(body.get("new_password", ""))

    if len(new_password) < MIN_PASSWORD_LEN:
        return JSONResponse(
            {"ok": False, "error": f"新密码至少 {MIN_PASSWORD_LEN} 位"}, status_code=400
        )

    if not verify_password(old_password, get_stored_hash()):
        remaining, lock = register_failure()
        if lock > 0:
            return JSONResponse(
                {"ok": False, "error": "尝试次数过多，已锁定", "retry_after": lock},
                status_code=429,
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
    print("[files] 网盘密码已修改", flush=True)

    # 密码版本变了，旧 cookie 全失效；给当前这个浏览器换新的两张
    resp = JSONResponse({"ok": True})
    set_login_cookie(resp)
    set_netdisk_cookie(resp)
    return resp


# ---------------------------------------------------------------- 浏览与操作
@app.get("/api/list")
def api_list(request: Request, path: str = "/") -> Any:
    require_auth(request)
    target = abs_path(path)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="不是文件夹")

    entries: list[dict[str, Any]] = []
    with os.scandir(target) as it:
        for entry in it:
            if entry.name.startswith("."):
                continue
            try:
                stat = entry.stat()
            except OSError:
                continue
            if entry.is_dir():
                entries.append({"name": entry.name, "type": "dir"})
            else:
                entries.append(
                    {
                        "name": entry.name,
                        "type": "file",
                        "size": stat.st_size,
                        "mtime": int(stat.st_mtime),
                    }
                )

    entries.sort(key=lambda e: (0 if e["type"] == "dir" else 1, e["name"].lower()))
    return {"ok": True, "path": norm_rel(path), "entries": entries}


@app.get("/api/folders")
def api_folders(request: Request) -> Any:
    require_auth(request)
    folders = ["/"]
    for dirpath, dirnames, _ in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for name in dirnames:
            full = Path(dirpath) / name
            folders.append(rel_of(full))
    folders = sorted(set(folders))
    return {"ok": True, "folders": folders}


@app.post("/api/mkdir")
async def api_mkdir(request: Request) -> Any:
    require_auth(request)
    body = await request.json()
    name = str(body.get("name", "")).strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise HTTPException(status_code=400, detail="文件夹名不合法")
    parent = abs_path(str(body.get("path", "/")))
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="父目录不存在")
    target = parent / name
    if target.exists():
        raise HTTPException(status_code=400, detail="同名文件或文件夹已存在")
    target.mkdir()
    return {"ok": True}


@app.post("/api/move")
async def api_move(request: Request) -> Any:
    require_auth(request)
    body = await request.json()
    src = abs_path(str(body.get("path", "")))
    dst_dir = abs_path(str(body.get("to", "/")))
    if not src.exists():
        raise HTTPException(status_code=404, detail="源不存在")
    if src == ROOT:
        raise HTTPException(status_code=400, detail="不能移动根目录")
    if not dst_dir.is_dir():
        raise HTTPException(status_code=400, detail="目标不是文件夹")
    if dst_dir == src or str(dst_dir).startswith(str(src) + os.sep):
        raise HTTPException(status_code=400, detail="不能移动到自身里面")
    if src.parent == dst_dir:
        return {"ok": True}
    target = unique_path(dst_dir / src.name)
    shutil.move(str(src), str(target))
    return {"ok": True}


@app.delete("/api/entry")
def api_delete(request: Request, path: str) -> Any:
    require_auth(request)
    target = abs_path(path)
    if target == ROOT:
        raise HTTPException(status_code=400, detail="不能删除根目录")
    if not target.exists():
        raise HTTPException(status_code=404, detail="不存在")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"ok": True}


@app.get("/api/download")
def api_download(request: Request, path: str) -> Any:
    require_auth(request)
    target = abs_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream",
    )


async def _save_uploads(files: list[UploadFile], target_dir: Path) -> list[dict[str, Any]]:
    saved: list[dict[str, Any]] = []
    for upload in files:
        raw_name = Path(upload.filename or "unnamed").name
        if not raw_name or raw_name in (".", ".."):
            continue
        dest = unique_path(target_dir / raw_name)
        size = 0
        tmp = dest.with_name(dest.name + ".part")
        try:
            with open(tmp, "wb") as fh:
                while True:
                    chunk = await upload.read(CHUNK)
                    if not chunk:
                        break
                    fh.write(chunk)
                    size += len(chunk)
            os.replace(tmp, dest)
            saved.append({"name": dest.name, "size": size})
        finally:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            await upload.close()
    return saved


@app.post("/api/upload")
async def api_upload(
    request: Request, path: str = "/", files: list[UploadFile] = File(...)
) -> Any:
    require_auth(request)
    target_dir = abs_path(path)
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="目标不是文件夹")
    saved = await _save_uploads(files, target_dir)
    return {"ok": True, "uploaded": saved}


@app.post("/api/quick-upload")
async def api_quick_upload(
    request: Request, files: list[UploadFile] = File(...)
) -> Any:
    require_auth(request)
    target_dir = ROOT / QUICK_DIR
    target_dir.mkdir(exist_ok=True)
    saved = await _save_uploads(files, target_dir)
    return {"ok": True, "uploaded": saved, "dir": f"/{QUICK_DIR}"}


@app.get("/api/health")
def health() -> Any:
    return {"ok": True, "service": "hopzz-files"}


# ---------------------------------------------------------------- 静态页
@app.get("/")
def index() -> Any:
    page = STATIC_DIR / "index.html"
    if not page.exists():
        return JSONResponse({"ok": False, "error": "前端未安装"}, status_code=500)
    return FileResponse(page, media_type="text/html; charset=utf-8")


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
