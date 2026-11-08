"""项目公开浏览链接（分享）。

- 管理接口（需登录）：/api/projects/{id}/share  GET / POST / PATCH / DELETE
- 公开接口（无需登录）：/ll/{slug} 以及 /ll/{slug}/api/*

权限只有两种：
  view  —— 只看（能浏览目录、预览/下载文件、读取项目字段）
  edit  —— 可修改（在上述基础上能上传、建目录、删文件、改字段）
链接可以随时关闭（enabled=false），关闭后 /ll/{slug} 返回 404。
"""

from __future__ import annotations

import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

import core

router = APIRouter()   # 需要登录
public = APIRouter()   # 公开

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,47}$")
MODES = ("view", "edit")
MAX_PUBLIC_UPLOAD = 2 * 1024 * 1024 * 1024


# ---------------------------------------------------------------- 存储

def _read(pid: str) -> dict[str, Any]:
    return core.read_project(pid)


def _write(pid: str, data: dict[str, Any]) -> None:
    core.write_project(pid, data)


def _share_of(data: dict[str, Any]) -> dict[str, Any]:
    share = data.get("share")
    return share if isinstance(share, dict) else {}


def _find_by_slug(slug: str) -> Optional[tuple[str, dict[str, Any]]]:
    for pid in core.list_project_ids():
        try:
            data = _read(pid)
        except Exception:
            continue
        share = _share_of(data)
        if share.get("slug") == slug and share.get("enabled"):
            return pid, data
    return None


def _slug_taken(slug: str, except_pid: str = "") -> bool:
    found = _find_by_slug(slug)
    return bool(found and found[0] != except_pid)


def _require_share(pid: str) -> dict[str, Any]:
    share = _share_of(_read(pid))
    if not share.get("slug") or not share.get("enabled"):
        raise HTTPException(status_code=400, detail="这个项目还没有开启浏览链接")
    return share


# ---------------------------------------------------------------- 管理接口

@router.get("/api/projects/{project_id}/share")
def get_share(project_id: str) -> Any:
    data = _read(project_id)
    share = _share_of(data)
    return {
        "ok": True,
        "share": {
            "enabled": bool(share.get("enabled")),
            "slug": share.get("slug", ""),
            "mode": share.get("mode", "view"),
            "url": f"/ll/{share.get('slug')}" if share.get("slug") and share.get("enabled") else "",
            "updatedAt": share.get("updatedAt", ""),
        },
    }


@router.post("/api/projects/{project_id}/share")
def enable_share(project_id: str, body: dict = Body(default={})) -> Any:
    data = _read(project_id)
    slug = str(body.get("slug") or "").strip().lower()
    mode = str(body.get("mode") or "view").strip().lower()
    if mode not in MODES:
        raise HTTPException(status_code=400, detail="权限只能是 view 或 edit")
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="链接名只能用 2-48 位小写字母、数字、- 或 _，且以字母或数字开头")
    if _slug_taken(slug, project_id):
        raise HTTPException(status_code=409, detail="这个链接名已经被别的项目用了")
    data["share"] = {"slug": slug, "mode": mode, "enabled": True, "updatedAt": core.now_iso()}
    _write(project_id, data)
    return {"ok": True, "share": data["share"], "url": f"/ll/{slug}"}


@router.patch("/api/projects/{project_id}/share")
def update_share(project_id: str, body: dict = Body(default={})) -> Any:
    data = _read(project_id)
    share = _share_of(data)
    if "slug" in body:
        slug = str(body.get("slug") or "").strip().lower()
        if not SLUG_RE.match(slug):
            raise HTTPException(status_code=400, detail="链接名格式不对")
        if _slug_taken(slug, project_id):
            raise HTTPException(status_code=409, detail="这个链接名已经被别的项目用了")
        share["slug"] = slug
    if "mode" in body:
        mode = str(body.get("mode") or "").strip().lower()
        if mode not in MODES:
            raise HTTPException(status_code=400, detail="权限只能是 view 或 edit")
        share["mode"] = mode
    if "enabled" in body:
        share["enabled"] = bool(body.get("enabled"))
    share["updatedAt"] = core.now_iso()
    data["share"] = share
    _write(project_id, data)
    return {"ok": True, "share": share}


@router.delete("/api/projects/{project_id}/share")
def disable_share(project_id: str) -> Any:
    data = _read(project_id)
    share = _share_of(data)
    share["enabled"] = False
    share["updatedAt"] = core.now_iso()
    data["share"] = share
    _write(project_id, data)
    return {"ok": True, "share": share}


# ---------------------------------------------------------------- 公开接口

def _lookup(slug: str) -> tuple[str, dict[str, Any]]:
    found = _find_by_slug(slug)
    if not found:
        raise HTTPException(status_code=404, detail="链接不存在或已关闭")
    return found


def _can_edit(slug: str) -> bool:
    _, data = _lookup(slug)
    return _share_of(data).get("mode") == "edit"


@public.get("/ll/{slug}")
def public_page(slug: str) -> Any:
    try:
        _lookup(slug)
    except HTTPException:
        html = (
            "<!doctype html><meta charset='utf-8'><title>链接不可用</title>"
            "<body style='background:#0a1f33;color:#dceaf5;font-family:system-ui;"
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
            "<div style='text-align:center'><h1 style='font-size:20px;font-weight:600'>链接不存在或已关闭</h1>"
            "<p style='opacity:.6;font-size:14px'>请向项目主人确认链接是否还有效。</p></div></body>"
        )
        return HTMLResponse(html, status_code=404)
    page = core.STATIC_DIR / "public.html"
    if not page.exists():
        return HTMLResponse("<h1>页面缺失</h1>", status_code=500)
    return HTMLResponse(page.read_text(encoding="utf-8"))


@public.get("/ll/{slug}/api/info")
def public_info(slug: str) -> Any:
    _, data = _lookup(slug)
    share = _share_of(data)
    return {
        "ok": True,
        "project": {
            "name": data.get("name", ""),
            "type": data.get("type", "other"),
            "summary": data.get("summary", ""),
            "tags": data.get("tags", []),
            "modules": data.get("modules", []),
            "fields": data.get("fields", {}),
            "sections": data.get("sections", []),
            "updatedAt": data.get("updatedAt", ""),
        },
        "mode": share.get("mode", "view"),
        "editable": share.get("mode") == "edit",
    }


@public.get("/ll/{slug}/api/tree")
def public_tree(slug: str, path: str = "") -> Any:
    pid, _ = _lookup(slug)
    base = core.safe_project_path(pid)
    target = core.safe_project_path(pid, path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="目录不存在")
    entries = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if item.name == core.PROJECT_FILE:
            continue
        rel = str(item.relative_to(base)).replace("\\", "/")
        if item.is_dir():
            entries.append({"name": item.name, "path": rel, "type": "dir"})
        else:
            st = item.stat()
            entries.append({
                "name": item.name,
                "path": rel,
                "type": "file",
                "size": st.st_size,
                "sizeText": core.human_size(st.st_size),
                "kind": core.media_kind(item),
                "mtime": core.datetime.fromtimestamp(st.st_mtime, core.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })
    parent = str(Path(path).parent).replace("\\", "/") if path else ""
    if parent == ".":
        parent = ""
    return {"ok": True, "path": path, "parent": parent, "entries": entries}


def _iter_file(path: Path, start: int, end: int, chunk: int = 256 * 1024):
    with path.open("rb") as fh:
        fh.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = fh.read(min(chunk, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


@public.get("/ll/{slug}/api/file")
def public_file(slug: str, path: str = "", download: int = 0) -> Any:
    pid, _ = _lookup(slug)
    target = core.safe_project_path(pid, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    kind = core.media_kind(target)
    mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if kind == "text":
        mime = "text/plain; charset=utf-8"
    name = target.name
    headers = {"Accept-Ranges": "bytes"}
    if download:
        headers["Content-Disposition"] = "attachment; filename*=UTF-8''" + __import__("urllib.parse").parse.quote(name)
    return FileResponse(str(target), media_type=mime, headers=headers, filename=None)


@public.post("/ll/{slug}/api/upload")
async def public_upload(
    slug: str,
    request: Request,
    path: str = "",
) -> Any:
    if not _can_edit(slug):
        raise HTTPException(status_code=403, detail="这个链接是只读的")
    pid, _ = _lookup(slug)
    base = core.safe_project_path(pid, path)
    base.mkdir(parents=True, exist_ok=True)
    form = await request.form()
    uploaded, failed = [], []
    for field in ("files", "file"):
        for item in form.getlist(field):
            if not hasattr(item, "filename"):
                continue
            name = core.safe_name(item.filename or "unnamed")
            data = await item.read()
            if len(data) > MAX_PUBLIC_UPLOAD:
                failed.append({"name": name, "error": "文件超过 2GB"})
                continue
            dest = core.safe_project_path(pid, str(Path(path) / name).replace("\\", "/"))
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            uploaded.append({"name": name, "path": str(dest.relative_to(core.safe_project_path(pid))).replace("\\", "/"), "size": len(data)})
    return {"ok": True, "uploaded": uploaded, "failed": failed}


@public.post("/ll/{slug}/api/mkdir")
def public_mkdir(slug: str, body: dict = Body(default={})) -> Any:
    if not _can_edit(slug):
        raise HTTPException(status_code=403, detail="这个链接是只读的")
    pid, _ = _lookup(slug)
    rel = str(body.get("path") or "").strip().strip("/")
    if not rel:
        raise HTTPException(status_code=400, detail="缺少路径")
    for part in rel.split("/"):
        core.safe_name(part)
    target = core.safe_project_path(pid, rel)
    created = not target.exists()
    target.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": rel, "created": created}


@public.delete("/ll/{slug}/api/file")
def public_delete(slug: str, path: str = "") -> Any:
    if not _can_edit(slug):
        raise HTTPException(status_code=403, detail="这个链接是只读的")
    pid, _ = _lookup(slug)
    target = core.safe_project_path(pid, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="不存在")
    if target.is_dir():
        try:
            target.rmdir()
        except OSError:
            raise HTTPException(status_code=400, detail="目录不是空的")
    else:
        target.unlink()
    return {"ok": True}


@public.patch("/ll/{slug}/api/project")
def public_patch(slug: str, body: dict = Body(default={})) -> Any:
    if not _can_edit(slug):
        raise HTTPException(status_code=403, detail="这个链接是只读的")
    pid, data = _lookup(slug)
    allowed = {"name", "summary", "tags", "fields", "sections"}
    for key in allowed:
        if key in body:
            data[key] = body[key]
    data.pop("share", None)  # 不能通过公开链接改分享设置
    _write(pid, data)
    return {"ok": True, "project": {"name": data.get("name"), "fields": data.get("fields", {}), "sections": data.get("sections", [])}}
# ---------------------------------------------------------------- 发布到主站作品列表

@router.post("/api/projects/{project_id}/publish")
def publish_project(project_id: str, body: dict = Body(default={})) -> Any:
    """把项目提交到主站 hopzz.top 的作品列表（只读展示，跳到 /ll/{slug}）。"""
    data = _read(project_id)
    share = _share_of(data)
    slug = str(body.get("slug") or share.get("slug") or "").strip().lower()
    if not slug:
        slug = project_id  # 项目 id 本身符合 slug 规则
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="链接名格式不对")
    if _slug_taken(slug, project_id):
        raise HTTPException(status_code=409, detail="这个链接名已经被别的项目用了")
    data["share"] = {"slug": slug, "mode": "view", "enabled": True, "updatedAt": core.now_iso()}
    data["publish"] = {"enabled": True, "at": core.now_iso(), "slug": slug}
    _write(project_id, data)
    return {"ok": True, "publish": data["publish"], "url": f"/ll/{slug}"}


@router.delete("/api/projects/{project_id}/publish")
def unpublish_project(project_id: str) -> Any:
    data = _read(project_id)
    publish = data.get("publish") or {}
    publish["enabled"] = False
    publish["at"] = core.now_iso()
    data["publish"] = publish
    _write(project_id, data)
    return {"ok": True, "publish": publish}


@router.get("/api/projects/{project_id}/publish")
def get_publish(project_id: str) -> Any:
    data = _read(project_id)
    publish = data.get("publish") or {}
    share = _share_of(data)
    return {
        "ok": True,
        "publish": {
            "enabled": bool(publish.get("enabled")),
            "slug": publish.get("slug") or share.get("slug", ""),
            "at": publish.get("at", ""),
        },
    }