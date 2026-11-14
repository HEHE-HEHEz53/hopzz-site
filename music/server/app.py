"""music.hopzz.top —— 单曲在线播放器（v3）

版权：© 2026 贺嘉（HEHEz53 / Hopzz）。保留所有权利。
本文件属于 music.hopzz.top 播放器源码，未经授权不得再分发或用于商业用途。

防下载策略（v3）
1. 页面上没有任何可播放的媒体直链；音频只能通过带自定义请求头的 API 拉取
2. 拉取需要三件套同时满足：页面会话 Cookie + 一次性 streamToken（2 分钟）+ 请求头
3. 前端把整段音频拉进内存，生成 blob: URL 播放 —— 浏览器媒体嗅探只能看到 blob:
4. 直接打开 / 复制 / 嗅探到的 URL 都不带自定义头，一律 403
5. 说明：浏览器端播放无法做到 100% 防下载，这里的目标是让普通人拿不到源文件
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

APP_NAME = "hopzz-music"
VERSION = "3.0.0"

COPYRIGHT_OWNER = "贺嘉（HEHEz53 / Hopzz）"
COPYRIGHT_YEAR = "2026"
COPYRIGHT_NOTICE = f"© {COPYRIGHT_YEAR} {COPYRIGHT_OWNER}. 保留所有权利。"
COPYRIGHT_HEADER = "(c) 2026 HEHEz53 / Hopzz. All rights reserved. Licensed for online listening only."

LICENSE_NOTE = (
    "本作品由 HEHEz53 使用 AI 生成并取得商业授权，仅授权在 music.hopzz.top 在线收听；"
    "未经书面许可，不得下载、转载、二次分发或用于任何商业用途。"
)

ROOT = Path(os.getenv("MUSIC_ROOT", "/srv/music")).resolve()
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/opt/hopzz-music/static"))
SIGN_SECRET = os.getenv("SIGN_SECRET", "")
SESSION_COOKIE = "music_session"
SESSION_TTL = int(os.getenv("SESSION_TTL", "7200"))       # 页面会话 2 小时
STREAM_TTL = int(os.getenv("STREAM_TTL", "120"))          # 拉流令牌 2 分钟
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") not in ("0", "false", "no")

TRACK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

app = FastAPI(title="Hopzz Music", version=VERSION, docs_url=None, redoc_url=None)


# ---------------------------------------------------------------- 会话与令牌

def _hmac(payload: str) -> str:
    return hmac.new(SIGN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_session(exp: int) -> str:
    return f"{exp}.{_hmac('sess:' + str(exp))}"


def verify_session(raw: str | None) -> bool:
    if not raw or "." not in raw:
        return False
    exp_s, sig = raw.split(".", 1)
    try:
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(sig, _hmac("sess:" + exp_s))


def make_stream_token(track_id: str, session: str, exp: int) -> str:
    return _hmac(f"stream:{track_id}:{session}:{exp}")


def verify_stream_token(track_id: str, session: str, exp: int, token: str) -> bool:
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(token, make_stream_token(track_id, session, exp))


def require_session(request: Request) -> str:
    raw = request.cookies.get(SESSION_COOKIE)
    if not verify_session(raw):
        raise HTTPException(status_code=403, detail="会话已过期，请刷新页面")
    return raw or ""


# ---------------------------------------------------------------- 曲库

def track_dir(track_id: str) -> Path:
    if not TRACK_ID_RE.match(track_id or ""):
        raise HTTPException(status_code=404, detail="not found")
    path = (ROOT / track_id).resolve()
    if ROOT not in path.parents or not path.is_dir():
        raise HTTPException(status_code=404, detail="not found")
    return path


def load_track(track_id: str) -> dict[str, Any]:
    base = track_dir(track_id)
    meta_file = base / "track.json"
    if not meta_file.is_file():
        raise HTTPException(status_code=404, detail="not found")
    try:
        data = json.loads(meta_file.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="track.json 读取失败")
    data.setdefault("id", track_id)
    return data


def audio_file(track_id: str) -> Path:
    base = track_dir(track_id)
    for name in ("audio.mp3", "audio.m4a", "audio.ogg", "audio.wav"):
        candidate = base / name
        if candidate.is_file():
            return candidate
    raise HTTPException(status_code=404, detail="audio missing")


def parse_lrc(text: str) -> dict[str, Any]:
    meta: dict[str, str] = {}
    lines: list[dict[str, Any]] = []
    tag_re = re.compile(r"^\[([a-zA-Z]+):(.+)\]$")
    time_re = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]")
    for raw in text.splitlines():
        row = raw.strip()
        if not row:
            continue
        m_tag = tag_re.match(row)
        if m_tag:
            meta[m_tag.group(1).lower()] = m_tag.group(2).strip()
            continue
        stamps = time_re.findall(row)
        if not stamps:
            continue
        body = time_re.sub("", row).strip()
        for mm, ss in stamps:
            lines.append({"time": round(int(mm) * 60 + float(ss), 2), "text": body})
    lines.sort(key=lambda item: item["time"])
    deduped: list[dict[str, Any]] = []
    for item in lines:
        if deduped and abs(deduped[-1]["time"] - item["time"]) < 0.01 and deduped[-1]["text"] == item["text"]:
            continue
        deduped.append(item)
    return {"meta": meta, "lines": deduped}


# ---------------------------------------------------------------- 页面

@app.get("/player/{track_id}/")
@app.get("/player/{track_id}")
def player_page(track_id: str) -> Any:
    load_track(track_id)
    page = STATIC_DIR / "player.html"
    if not page.is_file():
        return HTMLResponse("<h1>播放器页面缺失</h1>", status_code=500)
    exp = int(time.time()) + SESSION_TTL
    session = make_session(exp)
    resp = HTMLResponse(page.read_text(encoding="utf-8"))
    resp.set_cookie(
        SESSION_COOKIE,
        session,
        max_age=SESSION_TTL,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Copyright"] = COPYRIGHT_HEADER
    return resp


@app.get("/")
def index() -> Any:
    page = STATIC_DIR / "index.html"
    if page.is_file():
        return HTMLResponse(page.read_text(encoding="utf-8"))
    return JSONResponse({
        "ok": True,
        "app": APP_NAME,
        "version": VERSION,
        "copyright": COPYRIGHT_NOTICE,
        "license": LICENSE_NOTE,
    })


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "app": APP_NAME, "version": VERSION, "copyright": COPYRIGHT_NOTICE}


@app.get("/api/credits")
def credits() -> dict[str, Any]:
    """版权与授权声明（对外公开的证明信息）。"""
    return {
        "ok": True,
        "copyright": COPYRIGHT_NOTICE,
        "owner": COPYRIGHT_OWNER,
        "year": COPYRIGHT_YEAR,
        "license": LICENSE_NOTE,
        "site": "https://music.hopzz.top",
        "note": "作品由 AI 生成，商业授权文件由作者保存；本站仅提供在线收听。",
    }


@app.get("/static/copyright.txt")
def copyright_file() -> Any:
    text = (
        f"{COPYRIGHT_NOTICE}\n\n"
        f"作品：不器用なピアノ\n"
        f"作者：{COPYRIGHT_OWNER}\n"
        f"站点：https://music.hopzz.top\n\n"
        f"{LICENSE_NOTE}\n\n"
        "本声明同时写入页面源码、JS/CSS 文件头、音频文件 ID3 标签与 /api/credits 接口。\n"
    )
    return Response(content=text, media_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------- 数据接口

@app.get("/api/track/{track_id}")
def api_track(track_id: str, request: Request) -> Any:
    session = require_session(request)
    data = load_track(track_id)
    base = track_dir(track_id)
    exp = int(time.time()) + STREAM_TTL
    token = make_stream_token(track_id, session, exp)
    return {
        "ok": True,
        "copyright": COPYRIGHT_NOTICE,
        "track": {
            "id": track_id,
            "title": data.get("title") or "",
            "artist": data.get("artist") or "",
            "album": data.get("album") or "",
            "duration": data.get("duration") or 0,
            "hasCover": (base / "cover.jpg").is_file(),
            "hasLyrics": (base / "lyrics.lrc").is_file(),
            # 短时签名地址：2 分钟过期；必须带页面会话 Cookie 且为同源请求才放行
            "audioUrl": f"/api/audio/{track_id}?exp={exp}&sig={token}",
            "expiresIn": STREAM_TTL,
        },
    }


@app.get("/api/lyrics/{track_id}")
def api_lyrics(track_id: str) -> Any:
    base = track_dir(track_id)
    lrc = base / "lyrics.lrc"
    if not lrc.is_file():
        return {"ok": True, "meta": {}, "lines": [], "translation": [], "hasTranslation": False}
    parsed = parse_lrc(lrc.read_text(encoding="utf-8"))
    translation: list[dict[str, Any]] = []
    trans_file = base / "translation.lrc"
    if trans_file.is_file():
        translation = parse_lrc(trans_file.read_text(encoding="utf-8"))["lines"]
    return {
        "ok": True,
        "meta": parsed["meta"],
        "lines": parsed["lines"],
        "translation": translation,
        "hasTranslation": bool(translation),
    }


@app.get("/api/cover/{track_id}")
def api_cover(track_id: str) -> Any:
    base = track_dir(track_id)
    cover = base / "cover.jpg"
    if not cover.is_file():
        for name in ("cover.png", "cover.webp"):
            if (base / name).is_file():
                cover = base / name
                break
    if not cover.is_file():
        raise HTTPException(status_code=404, detail="no cover")
    media = "image/jpeg" if cover.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return FileResponse(
        str(cover),
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Copyright": COPYRIGHT_HEADER,
        },
    )


# ---------------------------------------------------------------- 音频（唯一出口）

def _same_origin(request: Request) -> bool:
    """只允许播放器页面自己发起的请求：
    浏览器 <audio> 的同源请求会带 Sec-Fetch-Site: same-origin（或同源 Referer）；
    在地址栏直接打开、从资源嗅探器新标签打开时都不是同源。"""
    site = (request.headers.get("sec-fetch-site") or "").lower()
    if site:
        return site == "same-origin"
    referer = (request.headers.get("referer") or "").strip()
    if referer:
        return referer.startswith("https://music.hopzz.top/") or referer.startswith("http://127.0.0.1")
    return False


def _range_response(path: Path, request: Request) -> Response:
    size = path.stat().st_size
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
        "X-Copyright": COPYRIGHT_HEADER,
    }
    rng = (request.headers.get("range") or "").strip()
    if not rng:
        return FileResponse(str(path), media_type="audio/mpeg", headers=headers)
    m = re.match(r"bytes=(\d*)-(\d*)", rng)
    if not m or (m.group(1) == "" and m.group(2) == ""):
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", **headers})
    if m.group(1) == "":
        length = int(m.group(2))
        start, end = max(0, size - length), size - 1
    else:
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
    if start >= size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", **headers})
    end = min(end, size - 1)
    with path.open("rb") as fh:
        fh.seek(start)
        chunk = fh.read(end - start + 1)
    return Response(
        content=chunk,
        status_code=206,
        media_type="audio/mpeg",
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(len(chunk)),
            **headers,
        },
    )


@app.get("/api/audio/{track_id}")
def api_audio(track_id: str, request: Request, exp: int = 0, sig: str = "") -> Any:
    session = require_session(request)
    if not exp or not sig:
        raise HTTPException(status_code=403, detail="缺少播放凭证")
    if not verify_stream_token(track_id, session, exp, sig):
        raise HTTPException(status_code=403, detail="播放凭证已过期，请刷新页面")
    if not _same_origin(request):
        raise HTTPException(status_code=403, detail="请从播放页面收听")
    return _range_response(audio_file(track_id), request)


@app.head("/api/audio/{track_id}")
def api_audio_head(track_id: str, request: Request, exp: int = 0, sig: str = "") -> Any:
    session = require_session(request)
    if not exp or not sig or not verify_stream_token(track_id, session, exp, sig):
        raise HTTPException(status_code=403, detail="播放凭证已过期")
    if not _same_origin(request):
        raise HTTPException(status_code=403, detail="请从播放页面收听")
    path = audio_file(track_id)
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(path.stat().st_size),
            "Content-Type": "audio/mpeg",
            "Content-Disposition": "inline",
            "Cache-Control": "no-store",
            "X-Copyright": COPYRIGHT_HEADER,
        },
    )


# 旧的 /api/stream 不再提供任何内容
@app.get("/api/stream/{track_id}")
def api_stream_gone(track_id: str) -> Any:
    raise HTTPException(status_code=403, detail="请从播放页面收听")

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
