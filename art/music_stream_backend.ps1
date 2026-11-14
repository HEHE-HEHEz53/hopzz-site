$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\server\app.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# ---------- 1. /api/track 恢复返回可流式播放的签名地址（短时） ----------
$oldTrack = @'
            # 不再返回可播放 URL，只给一次性拉流令牌
            "stream": {
                "url": f"/api/stream/{track_id}",
                "token": token,
                "exp": exp,
                "ttl": STREAM_TTL,
            },
'@
$newTrack = @'
            # 短时签名地址：2 分钟过期；必须带页面会话 Cookie 且为同源请求才放行
            "audioUrl": f"/api/audio/{track_id}?exp={exp}&sig={token}",
            "expiresIn": STREAM_TTL,
'@
if ($c.Contains($oldTrack)) { $c = $c.Replace($oldTrack, $newTrack); "  [OK] track 返回签名地址" }

# ---------- 2. 用流式+同源校验替换整段混淆返回 ----------
$start = $c.IndexOf('# ---------------------------------------------------------------- 音频（唯一出口）')
$end = $c.IndexOf('if STATIC_DIR.is_dir():')
if ($start -gt 0 -and $end -gt $start) {
  $newAudio = @'
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


'@
  $c = $c.Substring(0, $start) + $newAudio + $c.Substring($end)
  "  [OK] 音频改为流式 + 同源校验"
}

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
& python -c "import ast;ast.parse(open(r'D:\DSH\work\music\server\app.py',encoding='utf-8').read());print('app.py OK')"
Select-String -Path $f -Pattern '@app\.(get|head)\("/api/(audio|stream)' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
