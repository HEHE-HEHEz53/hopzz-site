"""music.hopzz.top —— 单曲在线播放器。

设计要点
- 音频不放在静态目录，只能通过「短时签名 URL」访问，链接过期即失效
- 播放地址带 HMAC 签名 + 过期时间，前端每次加载都重新申请
- 支持 HTTP Range（拖动进度、边下边播）
- 歌词 LRC 服务端解析成 JSON，前端只负责渲染与高亮

目录结构：/srv/music/<track_id>/{track.json, audio.mp3, lyrics.lrc, cover.jpg}
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

APP_NAME = "hopzz-music"
VERSION = "1.0.0"

ROOT = Path(os.getenv("MUSIC_ROOT", "/srv/music")).resolve()
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/opt/hopzz-music/static"))
SIGN_SECRET = os.getenv("SIGN_SECRET", "")
TOKEN_TTL = int(os.getenv("TOKEN_TTL", "7200"))  # 2 小时
MAX_RANGE_CHUNK = 1024 * 1024

TRACK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

app = FastAPI(title="Hopzz Music", version=VERSION, docs_url=None, redoc_url=None)


# ---------------------------------------------------------------- 工具

def sign_audio(track_id: str, exp: int) -> str:
    payload = f"{track_id}:{exp}"
    return hmac.new(SIGN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def verify_audio(track_id: str, exp: int, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(sig, sign_audio(track_id, exp))


def track_dir(track_id: str) -> Path:
    if not TRACK_ID_RE.match(track_id or ""):
        raise HTTPException(status_code=404, detail="not found")
    path = (ROOT / track_id).resolve()
    if ROOT not in path.parents:
        raise HTTPException(status_code=404, detail="not found")
    if not path.is_dir():
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


def parse_lrc(text: str) -> dict[str, Any]:
    """LRC → {meta:{...}, lines:[{time, text}]}"""
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
            seconds = int(mm) * 60 + float(ss)
            lines.append({"time": round(seconds, 2), "text": body})
    lines.sort(key=lambda item: item["time"])
    # 同一时间点去重
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
    load_track(track_id)  # 不存在直接 404
    page = STATIC_DIR / "player.html"
    if not page.is_file():
        return HTMLResponse("<h1>播放器页面缺失</h1>", status_code=500)
    return HTMLResponse(page.read_text(encoding="utf-8"))


@app.get("/")
def index() -> Any:
    tracks = []
    if ROOT.is_dir():
        for entry in sorted(ROOT.iterdir()):
            if entry.is_dir() and (entry / "track.json").is_file():
                try:
                    data = json.loads((entry / "track.json").read_text(encoding="utf-8"))
                except Exception:
                    continue
                tracks.append({
                    "id": entry.name,
                    "title": data.get("title") or entry.name,
                    "artist": data.get("artist") or "",
                })
    page = STATIC_DIR / "index.html"
    if page.is_file():
        return HTMLResponse(page.read_text(encoding="utf-8"))
    return JSONResponse({"ok": True, "app": APP_NAME, "version": VERSION, "tracks": tracks})


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "app": APP_NAME, "version": VERSION}


# ---------------------------------------------------------------- 数据接口

@app.get("/api/track/{track_id}")
def api_track(track_id: str) -> Any:
    data = load_track(track_id)
    base = track_dir(track_id)
    exp = int(time.time()) + TOKEN_TTL
    sig = sign_audio(track_id, exp)
    return {
        "ok": True,
        "track": {
            "id": track_id,
            "title": data.get("title") or "",
            "artist": data.get("artist") or "",
            "album": data.get("album") or "",
            "duration": data.get("duration") or 0,
            "hasCover": (base / "cover.jpg").is_file(),
            "hasLyrics": (base / "lyrics.lrc").is_file(),
            "audioUrl": f"/api/audio/{track_id}?exp={exp}&sig={sig}",
            "expiresIn": TOKEN_TTL,
        },
    }


@app.get("/api/lyrics/{track_id}")
def api_lyrics(track_id: str) -> Any:
    base = track_dir(track_id)
    lrc = base / "lyrics.lrc"
    if not lrc.is_file():
        return {"ok": True, "meta": {}, "lines": []}
    return {"ok": True, **parse_lrc(lrc.read_text(encoding="utf-8"))}


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
    return FileResponse(
        str(cover),
        media_type="image/jpeg" if cover.suffix.lower() in (".jpg", ".jpeg") else "image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _range_response(path: Path, request: Request, mime: str) -> Response:
    size = path.stat().st_size
    range_header = (request.headers.get("range") or "").strip()
    headers_base = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
    }

    if not range_header:
        return FileResponse(str(path), media_type=mime, headers=headers_base)

    match = re.match(r"bytes=(\d*)-(\d*)", range_header)
    if not match:
        raise HTTPException(status_code=416, detail="bad range")
    start_raw, end_raw = match.group(1), match.group(2)
    if start_raw == "" and end_raw == "":
        raise HTTPException(status_code=416, detail="bad range")
    if start_raw == "":
        length = int(end_raw)
        start = max(0, size - length)
        end = size - 1
    else:
        start = int(start_raw)
        end = int(end_raw) if end_raw else min(start + MAX_RANGE_CHUNK - 1, size - 1)
    if start >= size or start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{size}", **headers_base},
        )
    end = min(end, size - 1)
    length = end - start + 1
    with path.open("rb") as fh:
        fh.seek(start)
        chunk = fh.read(length)
    return Response(
        content=chunk,
        status_code=206,
        media_type=mime,
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
            **headers_base,
        },
    )


@app.head("/api/audio/{track_id}")
def api_audio_head(track_id: str, exp: int = Query(...), sig: str = Query(...)) -> Any:
    """HEAD：让浏览器先拿到大小与 Range 支持信息。"""
    if not verify_audio(track_id, exp, sig):
        raise HTTPException(status_code=403, detail="链接已过期，请刷新页面")
    base = track_dir(track_id)
    audio = base / "audio.mp3"
    if not audio.is_file():
        raise HTTPException(status_code=404, detail="audio missing")
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(audio.stat().st_size),
            "Content-Type": "audio/mpeg",
            "Content-Disposition": "inline",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )

@app.get("/api/audio/{track_id}")
def api_audio(track_id: str, request: Request, exp: int = Query(...), sig: str = Query(...)) -> Any:
    if not verify_audio(track_id, exp, sig):
        raise HTTPException(status_code=403, detail="链接已过期，请刷新页面")
    base = track_dir(track_id)
    audio = base / "audio.mp3"
    if not audio.is_file():
        for name in ("audio.m4a", "audio.ogg", "audio.wav"):
            if (base / name).is_file():
                audio = base / name
                break
    if not audio.is_file():
        raise HTTPException(status_code=404, detail="audio missing")
    return _range_response(audio, request, "audio/mpeg")


if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
