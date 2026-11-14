$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\server\app.py'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

if ($c -notmatch '@app\.head') {
  $anchor = '@app.get("/api/audio/{track_id}")'
  $head = @'
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


'@
  $c = $c.Replace($anchor, $head + $anchor)
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  "已加 HEAD 支持"
} else {
  "已有 HEAD"
}
& python -c "import ast;ast.parse(open(r'D:\DSH\work\music\server\app.py',encoding='utf-8').read());print('app.py OK')"
