# studio.hopzz.top 架构与协作契约

## 目标

个人创作工作站：仓库与网盘同一份文件，多类型项目 + 可插拔模块 + 媒体预览 + AI 侧栏。

## 运行时

| 项 | 值 |
|---|---|
| 域名 | `studio.hopzz.top`（已解析到 64.83.20.24） |
| 服务 | `/opt/hopzz-studio`，systemd `hopzz-studio`，uvicorn `127.0.0.1:8103` |
| 运行用户 | `www-data`（必须与 hopzz-files 一致，才能共享文件读写） |
| 源码 | 仓库 `studio/` 目录 |

## 存储（关键约束）

```
/srv/files/工作站/                 ← 唯一真实存储（网盘根目录下）
  <project_id>/
    project.json                   ← 项目元数据（名称/类型/模块/字段）
    assets/…                       ← 附件（音频、图片、视频、文本、脚本）
```

- 网盘（`f.hopzz.top`）里能看到 `工作站/<project_id>/` 下的全部文件
- 工作站「仓库」视图 = 同一个目录，不做复制、不做同步
- 所有路径必须经过 `core.safe_project_path()` 校验，禁止 `..` 与绝对路径
- `project.json` 不进网盘文件列表的「可见附件」统计，但它在目录里是正常文件（用户可见）

## 目录与归属（写作用域，避免互相踩）

| 文件 | 负责人 | 说明 |
|---|---|---|
| `studio/server/core.py` | Lead | 鉴权、DB、存储、路径安全、项目读写 |
| `studio/server/app.py` | Lead | FastAPI 装配、登录/健康路由、挂载子路由 |
| `studio/server/projects.py` | studio-backend | 项目 CRUD、模块系统、字段校验、仓库树 |
| `studio/server/media.py` | studio-backend | 上传/下载/预览/缩略图/范围请求 |
| `studio/server/ai.py` | studio-ai | AI 配置、会话、思维导图 |
| `studio/static/index.html` | studio-frontend | 页面骨架 |
| `studio/static/app.css` | studio-frontend | 样式 |
| `studio/static/app.js` | studio-frontend | 主逻辑（项目、仓库、编辑、预览） |
| `studio/static/ai.js` | studio-ai | AI 侧栏（小球/窗口/会话/导图），只暴露 `window.StudioAI` |
| `deploy/`、`opcpay/` | opcpay-main | 主站改版 + 支付桥 |

## 鉴权

复用网盘/聊天站同款：PBKDF2-SHA256 密码 + HMAC 签名 HttpOnly cookie。

- cookie 名：`hopzz_studio`
- `Secure` 仅在请求为 HTTPS 时设置（`X-Forwarded-Proto`）
- 5 次失败锁 10 分钟
- 所有 `/api/*`（除 `setup-state`/`login`/`health`）都要 `Depends(require_auth)`

## 项目数据模型

`project.json`：

```json
{
  "id": "s-20261108-ab12",
  "name": "鲸落",
  "type": "music",              // music | lyrics | art | code | video | story | world | oc | other
  "createdAt": "2026-11-08T12:00:00Z",
  "updatedAt": "2026-11-08T12:00:00Z",
  "tags": ["电子", "女声"],
  "summary": "",
  "modules": ["meta", "lyrics", "chords", "sections"],
  "fields": {
    "bpm": 128,
    "key": "A minor",
    "style": "future bass",
    "lyrics": "……",
    "chords": "[Verse] Am F C G"
  },
  "sections": [                 // 片段（music/video/story 通用）
    {"id": "sec1", "name": "主歌1", "start": 0, "end": 32, "notes": ""}
  ]
}
```

## 模块系统（可插拔）

模块定义集中在 `projects.py` 的 `MODULES` 字典：

```python
MODULES = {
  "meta":     {"label": "基本信息", "types": ["*"], "fields": [...]},
  "lyrics":   {"label": "歌词",       "types": ["music", "lyrics"]},
  "chords":   {"label": "和弦进行",   "types": ["music"]},
  "sections": {"label": "片段/段落",  "types": ["music", "video", "story"]},
  "shots":    {"label": "镜头标记",   "types": ["video"]},
  "palette":  {"label": "配色",       "types": ["art", "oc"]},
  "outline":  {"label": "大纲",       "types": ["story", "world"]},
  "code":     {"label": "代码片段",   "types": ["code"]},
  ...
}
```

- `GET /api/modules` 返回全部模块及其适用类型
- 项目只能添加 `types` 匹配的模块
- 添加/移除模块只改 `modules` 数组，不动已填 `fields`

## API 契约（前端按此实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/setup-state` | `{needsSetup: bool}` |
| POST | `/api/login` | `{password}` → cookie |
| POST | `/api/logout` | |
| GET | `/api/me` | 当前登录态 |
| POST | `/api/password` | 改密码 |
| GET | `/api/projects?type=&q=&tag=` | 项目列表 |
| POST | `/api/projects` | 新建 `{name,type,modules?,tags?}` |
| GET/PATCH/DELETE | `/api/projects/{id}` | 详情/更新/删除 |
| POST | `/api/projects/{id}/modules` | `{module}` 添加 |
| DELETE | `/api/projects/{id}/modules/{module}` | 移除 |
| GET | `/api/projects/{id}/tree?path=` | 仓库树 |
| POST | `/api/projects/{id}/mkdir` | 新建文件夹 |
| POST | `/api/projects/{id}/upload` | 上传（multipart，支持多文件） |
| GET | `/api/projects/{id}/file?path=` | 下载/预览（支持 Range） |
| GET | `/api/projects/{id}/thumb?path=` | 图片缩略图 |
| DELETE | `/api/projects/{id}/file?path=` | 删除文件 |
| GET | `/api/media/meta?project=&path=` | 媒体元数据（尺寸/时长/编码） |
| GET | `/api/modules` | 模块清单 |
| GET/POST | `/api/ai/config` | AI 配置（Key 只写不回显） |
| GET/POST | `/api/ai/sessions` | 会话列表/新建 |
| GET/PATCH/DELETE | `/api/ai/sessions/{id}` | 会话内容/改名/删除 |
| POST | `/api/ai/chat` | `{sessionId, message, projectIds[]}` → 流式或 JSON |
| POST | `/api/ai/mindmap` | `{sessionId}` → markdown/mindmap 结构 |

## 安全约束

1. 所有文件路径经 `core.safe_project_path()`，越界返回 400
2. 上传大小上限 2 GB，文件名去控制字符
3. AI Key 只存服务端（DB 或 env `studio_ai_key`），接口只返回 `hasKey: true`
4. AI 只允许读取 `projectIds` 指定的项目，拒绝任意路径
5. 不允许执行用户上传的代码

## 部署

```bash
# 服务器上
bash /opt/hopzz-studio/install_studio.sh
```

nginx：`deploy/nginx/studio.hopzz.top.conf`（反代 8103，WebSocket 支持，`client_max_body_size 0`）
证书：`certbot certonly --webroot -w /var/www/certbot -d studio.hopzz.top`
## 分享链接（/ll/{slug}）

每个项目可开启一条公开浏览链接，随时可关，权限两档：

| 模式 | 能力 |
| --- | --- |
| `view`（仅浏览） | 看项目字段、浏览目录、预览/下载文件 |
| `edit`（可修改） | 上述 + 上传、新建文件夹、删文件、改字段 |

- 存在 `project.json` 的 `share: { slug, mode, enabled, updatedAt }`
- 管理（需登录）：`GET/POST/PATCH/DELETE /api/projects/{id}/share`
- 公开（无需登录）：`GET /ll/{slug}`、`/ll/{slug}/api/{info,tree,file,upload,mkdir,project}`
- 关闭后 `/ll/{slug}` 与全部公开接口返回 404
- `project.json` 不出现在公开目录树里；公开接口不能修改 share 设置本身