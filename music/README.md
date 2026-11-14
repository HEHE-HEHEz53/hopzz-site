# music.hopzz.top · 单曲在线播放器

极简播放器：封面 / 进度 / 歌词（点击跳转、滚动浏览、自动高亮）。

## 地址

```
https://music.hopzz.top/player/<曲目ID>/
```

现有曲目：

| 曲目 | ID |
| --- | --- |
| 不器用なピアノ | `3f62b628-b19c-43b5-852f-11d58a5190e4` |

## 加一首新歌

服务器上执行：

```bash
# 1. 准备三个文件：音频、歌词、封面
bash /root/music-deploy/import_track.sh \
  <新曲目ID> /tmp/song.mp3 /tmp/song.lrc /tmp/cover.jpg \
  '歌名' '作者' '专辑'
```

`<曲目ID>` 建议用 UUID，出现在网址里。

或者手动摆文件：

```
/srv/music/<曲目ID>/
  audio.mp3     成品音频（m4a/ogg/wav 也认）
  lyrics.lrc    歌词（可选）
  cover.jpg     封面（可选，jpg/png/webp）
  track.json    {"id":"…","title":"…","artist":"…","album":"…","duration":220}
```

然后 `chown -R www-data:www-data /srv/music/<曲目ID>`。

## 设计

| 项 | 处理 |
| --- | --- |
| 音频地址 | **不暴露静态路径**，只能通过 `/api/audio/<id>?exp=&sig=` 访问；签名 2 小时过期，过期后前端自动重取 |
| 拖动播放 | 支持 HTTP Range（206），边下边播 |
| 防止下载 | 签名短链 + `Content-Disposition: inline` + `no-store` + 禁用右键/拖拽；<br>**说明：任何在线播放都无法 100% 禁止下载，这里只是提高门槛** |
| 歌词 | LRC 服务端解析成 JSON；点击任意一句跳转；滚轮/触摸浏览后 4 秒恢复自动跟随 |
| 配色 | 从封面取主色，自动设置强调色（取不到就用默认茶色） |
| 移动端 | 单列布局，封面居中，歌词区可滚动 |

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/player/<id>/` | 播放页 |
| GET | `/` | 曲目列表（无人访问时返回 JSON） |
| GET | `/api/track/<id>` | 曲目信息 + 签名音频地址 |
| GET | `/api/lyrics/<id>` | 解析后的歌词 |
| GET | `/api/cover/<id>` | 封面图 |
| GET/HEAD | `/api/audio/<id>?exp=&sig=` | 音频流（Range） |
| GET | `/api/health` | 健康检查 |

## 部署

```bash
bash music/install_music.sh
```

- 服务：`hopzz-music`（systemd，uvicorn 127.0.0.1:8104，用户 www-data）
- 目录：`/opt/hopzz-music`，曲库 `/srv/music`
- 证书：Let's Encrypt，自动续期

## 版权

曲目由用户使用 AI 生成并取得商业授权（授权文件另行保存），仅用于本站在线收听。
