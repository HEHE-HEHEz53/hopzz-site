#!/bin/bash
# 导入一首曲子到 /srv/music/<track_id>/
set -euo pipefail
TRACK_ID="${1:?用法: import_track.sh <track_id> <mp3> <lrc> <cover> <title> <artist> <album>}"
MP3="$2"; LRC="$3"; COVER="$4"; TITLE="$5"; ARTIST="$6"; ALBUM="$7"
DEST="/srv/music/$TRACK_ID"

mkdir -p "$DEST"
cp "$MP3" "$DEST/audio.mp3"
[ -f "$LRC" ] && cp "$LRC" "$DEST/lyrics.lrc"
[ -f "$COVER" ] && cp "$COVER" "$DEST/cover.jpg"

# 时长：优先 ffprobe，没有就留 0（前端用音频自身时长）
DUR=0
if command -v ffprobe >/dev/null 2>&1; then
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DEST/audio.mp3" 2>/dev/null | cut -d. -f1 || echo 0)
fi

python3 - "$DEST" "$TRACK_ID" "$TITLE" "$ARTIST" "$ALBUM" "$DUR" <<'PY'
import json, sys, pathlib
dest, tid, title, artist, album, dur = sys.argv[1:7]
pathlib.Path(dest, 'track.json').write_text(json.dumps({
    "id": tid, "title": title, "artist": artist, "album": album,
    "duration": int(float(dur or 0)),
}, ensure_ascii=False, indent=2), encoding='utf-8')
print("  track.json 写好，时长:", dur, "秒")
PY

chown -R www-data:www-data "$DEST"
chmod 755 "$DEST"
chmod 644 "$DEST"/* 2>/dev/null || true
ls -lh "$DEST" | sed 's/^/  /'
