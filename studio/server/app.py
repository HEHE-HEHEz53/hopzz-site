"""studio.hopzz.top 后端装配。

只做：初始化、鉴权路由、静态资源、挂载子路由（projects / media / ai）。
业务逻辑不要写在这里。
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import core
from core import (
    COOKIE_NAME,
    MIN_PASSWORD_LEN,
    check_login_allowed,
    db,
    get_stored_hash,
    hash_password,
    meta_get,
    meta_set,
    register_failure,
    register_success,
    require_auth,
    set_login_cookie,
    verify_password,
)

APP_NAME = "studio"
VERSION = "0.1.0"

app = FastAPI(title="Hopzz Studio", version=VERSION, docs_url=None, redoc_url=None)

core.init_db()


# ---------------------------------------------------------------- 鉴权

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "app": APP_NAME, "version": VERSION}


@app.get("/api/setup-state")
def setup_state() -> dict[str, Any]:
    return {"ok": True, "needsSetup": get_stored_hash() == ""}


@app.post("/api/setup")
async def setup(request: Request) -> Any:
    if get_stored_hash():
        return JSONResponse({"ok": False, "error": "已经设置过密码"}, status_code=400)
    body = await request.json()
    password = str(body.get("password") or "")
    if len(password) < MIN_PASSWORD_LEN:
        return JSONResponse({"ok": False, "error": f"密码至少 {MIN_PASSWORD_LEN} 位"}, status_code=400)
    with db() as conn:
        meta_set(conn, "pwd_hash", hash_password(password))
        meta_set(conn, "pwd_ver", str(int(meta_get(conn, "pwd_ver", "1") or 1) + 1))
    resp = JSONResponse({"ok": True})
    set_login_cookie(resp, request)
    return resp


@app.post("/api/login")
async def login(request: Request) -> Any:
    wait = check_login_allowed()
    if wait:
        return JSONResponse({"ok": False, "error": f"尝试过多，{wait} 秒后再试"}, status_code=429)
    body = await request.json()
    password = str(body.get("password") or "")
    stored = get_stored_hash()
    if not stored:
        return JSONResponse({"ok": False, "error": "还没有设置密码", "needsSetup": True}, status_code=400)
    if not verify_password(password, stored):
        count, locked = register_failure()
        if locked:
            return JSONResponse({"ok": False, "error": f"尝试过多，{locked} 秒后再试"}, status_code=429)
        return JSONResponse({"ok": False, "error": "密码不对"}, status_code=401)
    register_success()
    resp = JSONResponse({"ok": True})
    set_login_cookie(resp, request)
    return resp


@app.post("/api/logout")
def logout() -> Any:
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@app.get("/api/me")
def me(request: Request) -> Any:
    return {"ok": True, "authed": core.verify_session(request.cookies.get(COOKIE_NAME))}


@app.post("/api/password")
async def change_password(request: Request, _: None = Depends(require_auth)) -> Any:
    body = await request.json()
    old = str(body.get("oldPassword") or "")
    new = str(body.get("newPassword") or "")
    if not verify_password(old, get_stored_hash()):
        return JSONResponse({"ok": False, "error": "原密码不对"}, status_code=401)
    if len(new) < MIN_PASSWORD_LEN:
        return JSONResponse({"ok": False, "error": f"新密码至少 {MIN_PASSWORD_LEN} 位"}, status_code=400)
    with db() as conn:
        meta_set(conn, "pwd_hash", hash_password(new))
        meta_set(conn, "pwd_ver", str(int(meta_get(conn, "pwd_ver", "1") or 1) + 1))
    resp = JSONResponse({"ok": True})
    set_login_cookie(resp, request)
    return resp


# ---------------------------------------------------------------- 子路由

def _mount_routers() -> None:
    for mod_name, attr in (("projects", "router"), ("media", "router"), ("ai", "router")):
        try:
            mod = __import__(mod_name)
        except ModuleNotFoundError:
            continue
        router = getattr(mod, attr, None)
        if router is not None:
            app.include_router(router, dependencies=[Depends(require_auth)])


_mount_routers()


# ---------------------------------------------------------------- 静态

STATIC = core.STATIC_DIR
if STATIC.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
def index() -> Any:
    index_file = STATIC / "index.html"
    if not index_file.exists():
        return JSONResponse({"ok": False, "error": "static/index.html 缺失"}, status_code=500)
    return FileResponse(str(index_file))


@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> Any:
    if full_path.startswith("api/"):
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    index_file = STATIC / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return Response(status_code=404)
