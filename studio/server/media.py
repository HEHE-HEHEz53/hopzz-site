"""上传 / 下载 / 预览 / 缩略图 / Range / 媒体元数据 / 建目录。

由 app.py 用 ``app.include_router(router, dependencies=[Depends(require_auth)])``
挂载，所以这里不写鉴权、不写 prefix，路由路径都是完整的 ``/api/...``。

约束：
* 所有文件路径都经 ``core.safe_project_path()`` / ``core.safe_name()``，越界 400；
* 上传上限 2 GB / 文件；
* Range 自己实现（Starlette 的 FileResponse 不支持 Range，音乐/视频要能拖动）；
* 不引入新依赖：Pillow 只用来做缩略图，ffprobe 是可选外部命令；
* 错误统一为 HTTP 状态码 + ``{"ok": false, "error": "中文原因"}``。
"""

from __future__ import annotations

import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

import core

try:  # Pillow 由安装脚本提供；缺失时接口给中文提示而不是堆栈
    from PIL import Image, ImageOps

    HAS_PIL = True
except Exception:  # pragma: no cover - 环境问题
    HAS_PIL = False

router = APIRouter(tags=["media"])


# ---------------------------------------------------------------- 错误响应
#
# 与 projects.py 同样的做法：import 阶段给 app 挂 ApiError 处理器，
# 让业务错误统一返回 {"ok": false, "error": "..."}。独立 import 时退回默认
# 的 {"detail": ...}，功能不受影响。


class ApiError(HTTPException):
    """业务错误：中文 error 字段 + 明确 HTTP 状态码。"""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.message = message


async def _api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"ok": False, "error": exc.message}, status_code=exc.status_code)


def _install_error_handler() -> None:
    """找到 app.py 里创建的 FastAPI 实例，挂上 ApiError 处理器。

    支持 ``uvicorn app:app``（模块名 app）和 ``python app.py``
    （模块名 __main__）两种启动方式；找不到就静默跳过（不影响功能）。
    """
    for module_name in ("app", "__main__"):
        module = sys.modules.get(module_name)
        fastapi_app = getattr(module, "app", None) if module is not None else None
        if fastapi_app is None:
            continue
        try:
            handlers = getattr(fastapi_app, "exception_handlers", None)
            if handlers is not None and ApiError not in handlers:
                fastapi_app.add_exception_handler(ApiError, _api_error_handler)
        except Exception:  # pragma: no cover - 装配异常时不影响业务
            continue


_install_error_handler()


# ---------------------------------------------------------------- 常量

MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB / 文件
MAX_FILES_PER_REQUEST = 100
UPLOAD_CHUNK = 1024 * 1024
FILE_CHUNK = 256 * 1024
DEFAULT_THUMB = 512
MAX_THUMB = 1600
THUMB_CACHE = Path(tempfile.gettempdir()) / "hopzz-studio-thumbs"
FFPROBE = shutil.which("ffprobe")


# ---------------------------------------------------------------- 小工具


def _fail(status: int, message: str) -> None:
    """统一抛中文业务错误（响应体 {"ok": false, "error": ...}）。"""
    raise ApiError(status, message)


def _safe_base(project_id: str) -> Path:
    try:
        return core.safe_project_path(project_id)
    except HTTPException:
        _fail(400, "项目 ID 不合法")


def _safe_path(project_id: str, rel: str = "") -> Path:
    try:
        return core.safe_project_path(project_id, rel)
    except HTTPException:
        _fail(400, "路径不合法（不允许 .. 或越出项目目录）")


def _clean_rel(raw: Any) -> str:
    rel = str(raw or "").replace("\\", "/").strip()
    rel = re.sub(r"/{2,}", "/", rel)
    return rel.strip("/")


def _ensure_project(project_id: str) -> dict[str, Any]:
    """确认项目存在（project.json 可读），否则 404。"""
    base = _safe_base(project_id)
    meta_path = base / core.PROJECT_FILE
    if not meta_path.is_file():
        _fail(404, "项目不存在")
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _fail(500, "项目元数据读取失败或已损坏")
    return data if isinstance(data, dict) else {}


async def _json_body(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        _fail(400, "请求体不是合法的 JSON")
    if not isinstance(data, dict):
        _fail(400, "请求体必须是 JSON 对象")
    return data


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_upload_name(raw: Any) -> str:
    try:
        return core.safe_name(str(raw or ""))
    except HTTPException:
        _fail(400, "文件名不合法（去掉控制字符后为空）")


def _content_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in core.TEXT_EXT:  # 含 .html/.xml，一律按纯文本回，避免同源脚本执行
        return "text/plain; charset=utf-8"
    if ext == ".svg":
        return "image/svg+xml"
    guessed = mimetypes.guess_type(path.name)[0]
    if guessed:
        if guessed.startswith("text/"):
            return guessed + "; charset=utf-8"
        return guessed
    return "application/octet-stream"


def _content_disposition(name: str, as_attachment: bool) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", name) or "file"
    quoted = urllib.parse.quote(name, safe="")
    kind = "attachment" if as_attachment else "inline"
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


def _extra_headers(path: Path) -> dict[str, str]:
    headers = {"X-Content-Type-Options": "nosniff"}
    if path.suffix.lower() == ".svg":
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    return headers


def _parse_range(header: str, size: int) -> Optional[tuple[int, int]]:
    """解析单段 Range，返回闭区间 (start, end)；不合法或越界返回 None。"""
    text = (header or "").strip()
    if not text.lower().startswith("bytes=") or size <= 0:
        return None
    spec = text[6:].split(",")[0].strip()
    if not spec:
        return None
    if spec.startswith("-"):  # bytes=-500
        try:
            suffix = int(spec[1:])
        except ValueError:
            return None
        if suffix <= 0:
            return None
        return max(0, size - suffix), size - 1
    if "-" not in spec:
        return None
    start_s, end_s = spec.split("-", 1)
    try:
        start = int(start_s) if start_s.strip() else 0
    except ValueError:
        return None
    if start < 0 or start >= size:
        return None
    end = size - 1
    if end_s.strip():
        try:
            end = int(end_s.strip())
        except ValueError:
            return None
        if end < start:
            return None
        end = min(end, size - 1)
    return start, end


def _iter_file(path: Path, start: int, length: int) -> Iterator[bytes]:
    if length <= 0:
        return
    try:
        handle = open(path, "rb")
    except OSError:
        return
    with handle:
        try:
            handle.seek(start)
        except OSError:
            return
        remaining = length
        while remaining > 0:
            try:
                data = handle.read(min(FILE_CHUNK, remaining))
            except OSError:
                return
            if not data:
                return
            remaining -= len(data)
            yield data


def _duration_text(seconds: float) -> str:
    total = int(round(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _probe_media(path: Path) -> Optional[dict[str, Any]]:
    """可选：ffprobe 存在时读取时长/编码/分辨率；不存在返回 None。"""
    if not FFPROBE:
        return None
    cmd = [
        FFPROBE, "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=10, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0 or not proc.stdout:
        return None
    try:
        data = json.loads(proc.stdout.decode("utf-8", "ignore") or "{}")
    except ValueError:
        return None
    result: dict[str, Any] = {}
    fmt = data.get("format") or {}
    try:
        duration = float(fmt.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    if duration > 0:
        result["duration"] = round(duration, 3)
        result["durationText"] = _duration_text(duration)
    try:
        bitrate = int(fmt.get("bit_rate") or 0)
    except (TypeError, ValueError):
        bitrate = 0
    if bitrate > 0:
        result["bitrate"] = bitrate
    for stream in data.get("streams") or []:
        codec_type = stream.get("codec_type")
        if codec_type == "audio" and "audio" not in result:
            result["audio"] = {
                "codec": stream.get("codec_name"),
                "sampleRate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
            }
        elif codec_type == "video" and "video" not in result:
            result["video"] = {
                "codec": stream.get("codec_name"),
                "width": stream.get("width"),
                "height": stream.get("height"),
            }
    return result or None


# ---------------------------------------------------------------- 上传


async def _write_upload(upload: UploadFile, dest: Path, name: str) -> int:
    """流式写盘（先写临时文件再原子替换），返回字节数。"""
    tmp: Optional[Path] = None
    fd = -1
    size = 0
    try:
        fd, tmp_name = tempfile.mkstemp(prefix=".upload-", dir=str(dest.parent))
        tmp = Path(tmp_name)
        with os.fdopen(fd, "wb") as handle:
            fd = -1
            while True:
                chunk = await upload.read(UPLOAD_CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    _fail(413, f"文件「{name}」超过 2 GB 上限")
                handle.write(chunk)
        os.replace(tmp, dest)
        tmp = None
        return size
    except OSError:
        _fail(500, f"写入文件失败：{name}（磁盘权限或空间问题）")


@router.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: str,
    request: Request,
    files: list[UploadFile] = File(default=[]),
    file: list[UploadFile] = File(default=[]),
    path: str = Query(""),
    overwrite: bool = Query(True),
) -> dict[str, Any]:
    """上传一个或多个文件。

    调用：``POST /api/projects/{id}/upload?path=<相对目录，可空>``，
    multipart 字段名 ``files``（可多个）；兼容字段名 ``file``（只取第一个）。

    返回：``{"ok": true, "uploaded": [{name, path, size, kind}], "failed": [...]}``
    单个文件失败不中断整批，原因在 failed 里（中文）。
    """
    _ensure_project(project_id)

    upload_list: list[UploadFile] = [up for up in list(files or []) if up is not None]
    if not upload_list:  # 兜底：兼容单数字段名 file，取第一个
        upload_list = [up for up in list(file or [])[:1] if up is not None]
    if not upload_list:
        _fail(400, "没有收到文件")

    dir_rel = _clean_rel(path)
    if not dir_rel:  # 兼容把 path 放在 multipart 表单里的调用方
        try:
            form = await request.form()
            dir_rel = _clean_rel(form.get("path") or form.get("dir") or "")
        except Exception:
            dir_rel = ""

    if len(upload_list) > MAX_FILES_PER_REQUEST:
        _fail(400, f"一次最多上传 {MAX_FILES_PER_REQUEST} 个文件")

    dir_path = _safe_path(project_id, dir_rel) if dir_rel else _safe_base(project_id)
    if dir_path.exists() and not dir_path.is_dir():
        _fail(400, "上传目标不是文件夹")
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
    except OSError:
        _fail(500, "创建上传目录失败（磁盘权限或空间问题）")

    uploaded: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []

    for upload in upload_list:
        display_name = str(upload.filename or "")
        try:
            name = _safe_upload_name(display_name)
            rel_file = f"{dir_rel}/{name}" if dir_rel else name
            dest = _safe_path(project_id, rel_file)
            if dest.exists() and dest.is_dir():
                _fail(400, f"同名文件夹已存在：{name}")
            if dest.exists() and not overwrite:
                failed.append({"name": name, "error": "同名文件已存在（未覆盖）"})
                continue

            declared_size = getattr(upload, "size", None)
            if isinstance(declared_size, int) and declared_size > MAX_UPLOAD_BYTES:
                _fail(413, f"文件「{name}」超过 2 GB 上限")

            size = await _write_upload(upload, dest, name)
            try:
                stat = dest.stat()
            except OSError:
                stat = None
            uploaded.append({
                "name": name,
                "path": rel_file,
                "size": size,
                "sizeText": core.human_size(size),
                "kind": core.media_kind(dest),
                "mime": _content_type(dest),
                "mtime": _iso(stat.st_mtime) if stat else "",
            })
        except HTTPException as exc:  # ApiError 也是 HTTPException
            failed.append({"name": display_name or "未命名文件", "error": str(exc.detail)})
        finally:
            try:
                await upload.close()
            except Exception:  # pragma: no cover - 关闭失败无所谓
                pass

    return {
        "ok": True,
        "dir": dir_rel,
        "uploaded": uploaded,
        "failed": failed,
        "count": len(uploaded),
    }


# ---------------------------------------------------------------- 下载 / 预览（Range）


@router.get("/api/projects/{project_id}/file")
def get_file(
    project_id: str,
    request: Request,
    path: str = Query("", description="项目内相对路径"),
    download: int = Query(0, description="1 = 作为附件下载"),
) -> Response:
    """读取项目内文件，支持单段 HTTP Range（206），音乐/视频可拖动进度。"""
    _ensure_project(project_id)
    rel = _clean_rel(path)
    if not rel:
        _fail(400, "缺少 path 参数")
    target = _safe_path(project_id, rel)
    if not target.exists():
        _fail(404, "文件不存在")
    if target.is_dir():
        _fail(400, "这是一个文件夹，不能直接读取")
    try:
        stat = target.stat()
    except OSError:
        _fail(500, "文件状态读取失败")
    size = stat.st_size
    etag = f"\"{size:x}-{int(stat.st_mtime)}\""
    range_header = request.headers.get("range") or ""

    if not range_header and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "private, max-age=60"})

    if range_header:
        parsed = _parse_range(range_header, size)
        if parsed is None:
            return Response(
                status_code=416,
                headers={
                    "Content-Range": f"bytes */{size}",
                    "Accept-Ranges": "bytes",
                    "X-Content-Type-Options": "nosniff",
                },
            )
        start, end = parsed
        status_code = 206
    else:
        start, end = 0, size - 1
        status_code = 200

    length = max(0, end - start + 1)
    headers = {
        "Content-Length": str(length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": _content_disposition(target.name, bool(download)),
        "Cache-Control": "private, max-age=60",
        "ETag": etag,
    }
    headers.update(_extra_headers(target))
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"

    return StreamingResponse(
        _iter_file(target, start, length),
        status_code=status_code,
        media_type=_content_type(target),
        headers=headers,
    )


# ---------------------------------------------------------------- 缩略图


def _thumb_cache_path(target: Path, px: int) -> Path:
    stat = target.stat()
    key = f"{target}|{stat.st_size}|{stat.st_mtime_ns}|{px}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    THUMB_CACHE.mkdir(parents=True, exist_ok=True)
    return THUMB_CACHE / f"{digest}.jpg"


@router.get("/api/projects/{project_id}/thumb")
def project_thumb(
    project_id: str,
    path: str = Query("", description="项目内图片路径"),
    size: int = Query(0, description="缩略图最长边，默认 512，最大 1600"),
) -> Response:
    """图片缩略图（Pillow，JPEG）；SVG 直接回原图，Pillow 解不开的格式回退原图。"""
    _ensure_project(project_id)
    rel = _clean_rel(path)
    if not rel:
        _fail(400, "缺少 path 参数")
    target = _safe_path(project_id, rel)
    if not target.exists():
        _fail(404, "文件不存在")
    if not target.is_file():
        _fail(400, "这不是文件")
    if target.suffix.lower() not in core.IMAGE_EXT:
        _fail(400, "这个文件不是图片，无法生成缩略图")

    px = size if size > 0 else DEFAULT_THUMB
    px = max(16, min(int(px), MAX_THUMB))

    if target.suffix.lower() == ".svg":
        return FileResponse(
            str(target),
            media_type="image/svg+xml",
            headers={"Cache-Control": "private, max-age=86400", **_extra_headers(target)},
        )

    if not HAS_PIL:
        _fail(500, "服务器缺少 Pillow，无法生成缩略图")

    try:
        cache = _thumb_cache_path(target, px)
    except OSError:
        cache = None
    if cache is not None and cache.is_file():
        try:
            return Response(
                content=cache.read_bytes(),
                media_type="image/jpeg",
                headers={"Cache-Control": "private, max-age=86400", "ETag": f"\"{cache.stem[:16]}\""},
            )
        except OSError:
            pass

    try:
        with Image.open(target) as image:
            try:
                image.seek(0)  # 动图取第一帧
            except Exception:
                pass
            frame = ImageOps.exif_transpose(image)
            if frame.mode in ("RGBA", "LA", "P"):
                frame = frame.convert("RGBA")
                background = Image.new("RGB", frame.size, (12, 18, 30))
                background.paste(frame, mask=frame.split()[-1])
                rgb = background
            else:
                rgb = frame.convert("RGB")
            resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
            rgb.thumbnail((px, px), resample)
            buffer = io.BytesIO()
            rgb.save(buffer, "JPEG", quality=82, optimize=True)
            data = buffer.getvalue()
    except Exception:
        # avif/ico 等 Pillow 不支持的格式：直接把原图给浏览器
        return FileResponse(
            str(target),
            media_type=_content_type(target),
            headers={"Cache-Control": "private, max-age=3600", **_extra_headers(target)},
        )

    if cache is not None:
        try:
            cache.write_bytes(data)
        except OSError:
            pass
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


# ---------------------------------------------------------------- 新建文件夹


@router.post("/api/projects/{project_id}/mkdir")
async def make_dir(
    project_id: str,
    request: Request,
    path: str = Query(""),
    name: str = Query(""),
) -> dict[str, Any]:
    """新建文件夹。

    JSON 体支持两种写法：``{"path": "assets/音频"}``（完整相对路径）
    或 ``{"path": "assets", "name": "音频"}``；也接受同名 query 参数。
    """
    _ensure_project(project_id)
    body = await _json_body(request)

    target_rel = _clean_rel(body.get("path") or path or "")
    extra = str(body.get("name") or name or "").strip()
    if extra:
        target_rel = _clean_rel(f"{target_rel}/{extra}" if target_rel else extra)
    if not target_rel:
        _fail(400, "缺少文件夹路径")

    target = _safe_path(project_id, target_rel)
    if target.exists():
        if target.is_dir():
            return {"ok": True, "path": target_rel, "name": target.name, "created": False}
        _fail(400, "同名文件已存在，不能再建文件夹")
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError:
        _fail(500, "创建文件夹失败（磁盘权限或空间问题）")
    return {"ok": True, "path": target_rel, "name": target.name, "created": True}


# ---------------------------------------------------------------- 删除


@router.delete("/api/projects/{project_id}/file")
def delete_file(
    project_id: str,
    path: str = Query(""),
    recursive: int = Query(0),
) -> dict[str, Any]:
    """删除项目内文件；目录默认只能删空的，``recursive=1`` 时递归删除。"""
    _ensure_project(project_id)
    base = _safe_base(project_id)
    rel = _clean_rel(path)
    if not rel:
        _fail(400, "不能删除项目根目录")
    target = _safe_path(project_id, rel)
    if target == base:
        _fail(400, "不能删除项目根目录")
    if not target.exists():
        _fail(404, "文件不存在")
    if target.name == core.PROJECT_FILE:
        _fail(400, "不能删除 project.json（项目元数据）")

    try:
        if target.is_dir():
            has_children = any(target.iterdir())
            if has_children and not recursive:
                _fail(400, "文件夹不为空，请先清空，或带 recursive=1 递归删除")
            shutil.rmtree(target)
        else:
            target.unlink()
    except OSError:
        _fail(500, "删除失败（文件被占用或权限不足）")
    return {"ok": True, "path": rel, "name": target.name}


# ---------------------------------------------------------------- 媒体元数据


@router.get("/api/media/meta")
def media_meta(
    project: str = Query("", description="项目 ID"),
    path: str = Query("", description="项目内相对路径"),
) -> dict[str, Any]:
    """媒体元数据：大小 / 类型 / MIME；图片给尺寸，音视频有 ffprobe 就给时长编码。"""
    project_id = str(project or "").strip()
    if not project_id:
        _fail(400, "缺少项目 ID")
    _ensure_project(project_id)
    rel = _clean_rel(path)
    if not rel:
        _fail(400, "缺少 path 参数")
    target = _safe_path(project_id, rel)
    if not target.exists():
        _fail(404, "文件不存在")

    try:
        stat = target.stat()
    except OSError:
        _fail(500, "文件状态读取失败")

    is_dir = target.is_dir()
    kind = "dir" if is_dir else core.media_kind(target)
    meta: dict[str, Any] = {
        "project": project_id,
        "path": rel,
        "name": target.name,
        "kind": kind,
        "ext": target.suffix.lower(),
        "size": stat.st_size,
        "sizeText": core.human_size(stat.st_size),
        "mtime": _iso(stat.st_mtime),
        "mime": "inode/directory" if is_dir else _content_type(target),
        "ffprobe": bool(FFPROBE),
    }

    if kind == "image" and HAS_PIL:
        try:
            with Image.open(target) as image:
                meta["image"] = {
                    "width": image.width,
                    "height": image.height,
                    "format": image.format,
                    "mode": image.mode,
                    "animated": bool(getattr(image, "is_animated", False)),
                }
        except Exception:
            meta["image"] = None

    if kind in ("audio", "video"):
        probed = _probe_media(target)
        if probed:
            meta.update(probed)
            meta["probed"] = True
        else:
            meta["probed"] = False
            if not FFPROBE:
                meta["note"] = "服务器未安装 ffprobe，只返回大小与 MIME"

    if kind == "text" and stat.st_size <= 8 * 1024 * 1024:
        try:
            raw = target.read_bytes()
            meta["lines"] = raw.count(b"\n") + (0 if raw.endswith(b"\n") or not raw else 1)
            meta["chars"] = len(raw.decode("utf-8", "ignore"))
        except OSError:
            pass

    return {"ok": True, "meta": meta}
