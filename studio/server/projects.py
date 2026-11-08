"""项目 CRUD、模块系统、字段校验、仓库树。

由 app.py 用 ``app.include_router(router, dependencies=[Depends(require_auth)])``
挂载，所以这里：

* 不写鉴权依赖（统一在 app.py 上）；
* 不写 prefix，所有路由都是完整的 ``/api/...`` 路径；
* 所有文件路径都经 ``core.safe_project_path()`` / ``core.safe_name()``，越界 400；
* 错误统一为 HTTP 状态码 + ``{"ok": false, "error": "中文原因"}``。

数据模型见 ARCHITECTURE.md「项目数据模型」。
"""

from __future__ import annotations

import json
import math
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

import core

router = APIRouter(tags=["projects"])

# ---------------------------------------------------------------- 错误响应
#
# app.py 的装配是 Lead 的，不能改；这里在 import 阶段给 FastAPI 实例挂一个
# ApiError 的异常处理器，把业务错误统一成 {"ok": false, "error": "..."}。
# 如果本模块被独立 import（没经过 app.py），自动退回 FastAPI 默认的
# {"detail": "..."}，功能不受影响。


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

PROJECT_FILE = core.PROJECT_FILE
MAX_NAME_LEN = 120
MAX_TAGS = 30
MAX_TAG_LEN = 32
MAX_MODULES = 50
MAX_FIELDS = 200
MAX_FIELD_TEXT = 200_000
MAX_SECTIONS = 500

TYPES: list[str] = [
    "music",
    "lyrics",
    "art",
    "code",
    "video",
    "story",
    "world",
    "oc",
    "other",
]

TYPE_LABELS: dict[str, str] = {
    "music": "音乐",
    "lyrics": "歌词",
    "art": "绘画",
    "code": "代码",
    "video": "视频",
    "story": "剧情",
    "world": "世界观",
    "oc": "OC",
    "other": "其他",
}

STATUS_OPTIONS: list[dict[str, str]] = [
    {"value": "构思", "label": "构思"},
    {"value": "进行中", "label": "进行中"},
    {"value": "完成", "label": "完成"},
    {"value": "搁置", "label": "搁置"},
]

# ---------------------------------------------------------------- 模块系统
#
# 每个模块：
#   label  —— 中文名
#   types  —— 适用的项目类型，"*" 表示所有类型
#   fields —— 表单字段描述，前端按 type 渲染
#
# fields[].type 只允许：text | textarea | number | select | tags | date | url
# select 必须带 options: [{"value": ..., "label": ...}]

MODULES: dict[str, dict[str, Any]] = {
    "meta": {
        "label": "基本信息",
        "types": ["*"],
        "fields": [
            {"key": "status", "label": "状态", "type": "select", "options": STATUS_OPTIONS},
            {"key": "progress", "label": "进度（0-100）", "type": "number", "placeholder": "0"},
            {"key": "deadline", "label": "截止日期", "type": "date"},
            {"key": "mood", "label": "情绪 / 氛围", "type": "text", "placeholder": "克制、冰冷"},
        ],
    },
    "audio": {
        "label": "编曲参数",
        "types": ["music"],
        "fields": [
            {"key": "bpm", "label": "BPM", "type": "number", "placeholder": "128"},
            {"key": "key", "label": "调性", "type": "text", "placeholder": "A minor"},
            {"key": "style", "label": "风格", "type": "text", "placeholder": "future bass"},
            {"key": "duration", "label": "时长", "type": "text", "placeholder": "3:42"},
        ],
    },
    "lyrics": {
        "label": "歌词",
        "types": ["music", "lyrics"],
        "fields": [
            {"key": "lyrics", "label": "歌词正文", "type": "textarea", "rows": 14,
             "mono": True, "placeholder": "……"},
        ],
    },
    "chords": {
        "label": "和弦进行",
        "types": ["music"],
        "ui": "chord-board",
        "fields": [
            {"key": "chords", "label": "和弦", "type": "textarea", "rows": 8,
             "mono": True, "placeholder": "[Verse] Am F C G"},
        ],
    },
    "piano-roll": {
        "label": "MIDI 钢琴卷帘",
        "types": ["music"],
        "ui": "piano-roll",
        "fields": [],
    },
    "finish": {
        "label": "完成 / 发布",
        "types": ["*"],
        "ui": "finish-board",
        "fields": [],
    },
    "sections": {
        "label": "片段 / 段落",
        "types": ["music", "video", "story"],
        "ui": "section-timeline",
        "fields": [],
    },
    "shots": {
        "label": "镜头标记",
        "types": ["video"],
        "ui": "shot-list",
        "fields": [
            {"key": "shots", "label": "镜头列表", "type": "textarea", "rows": 8,
             "mono": True, "placeholder": "01 00:00-00:12 俯拍海面"},
        ],
    },
    "script": {
        "label": "分镜脚本",
        "types": ["video"],
        "fields": [
            {"key": "script", "label": "脚本", "type": "textarea", "rows": 12,
             "mono": True},
        ],
    },
    "palette": {
        "label": "配色",
        "types": ["art", "oc"],
        "ui": "palette-swatches",
        "fields": [
            {"key": "colors", "label": "色值（每行一个）", "type": "textarea",
             "rows": 6, "mono": True, "placeholder": "#0b1220"},
            {"key": "paletteNote", "label": "配色说明", "type": "text"},
        ],
    },
    "outline": {
        "label": "大纲",
        "types": ["story", "world"],
        "ui": "outline-tree",
        "fields": [
            {"key": "outline", "label": "大纲", "type": "textarea", "rows": 12},
        ],
    },
    "characters": {
        "label": "角色",
        "types": ["story", "world", "oc"],
        "fields": [
            {"key": "characters", "label": "角色设定", "type": "textarea", "rows": 10},
        ],
    },
    "worldbuilding": {
        "label": "世界观设定",
        "types": ["world"],
        "fields": [
            {"key": "setting", "label": "设定", "type": "textarea", "rows": 10},
        ],
    },
    "timeline": {
        "label": "时间线",
        "types": ["story", "world"],
        "ui": "timeline-track",
        "fields": [
            {"key": "timeline", "label": "时间线", "type": "textarea", "rows": 8},
        ],
    },
    "code": {
        "label": "代码片段",
        "types": ["code"],
        "fields": [
            {"key": "language", "label": "语言", "type": "text", "placeholder": "python"},
            {"key": "code", "label": "代码", "type": "textarea", "rows": 16, "mono": True},
        ],
    },
    "notes": {
        "label": "笔记",
        "types": ["*"],
        "fields": [
            {"key": "notes", "label": "笔记", "type": "textarea", "rows": 10},
        ],
    },
    "references": {
        "label": "参考资料",
        "types": ["*"],
        "fields": [
            {"key": "references", "label": "参考 / 链接", "type": "textarea",
             "rows": 6, "mono": True},
            {"key": "sourceUrl", "label": "主链接", "type": "url"},
        ],
    },
}

# 新建项目时默认启用的模块（按类型），前端也可用 /api/modules 的 defaults
DEFAULT_MODULES: dict[str, list[str]] = {
    "music": ["meta", "audio", "piano-roll", "lyrics", "chords", "sections", "finish"],
    "lyrics": ["meta", "lyrics"],
    "art": ["meta", "palette"],
    "code": ["meta", "code"],
    "video": ["meta", "sections", "shots", "script"],
    "story": ["meta", "outline", "sections", "characters"],
    "world": ["meta", "outline", "worldbuilding", "characters", "timeline"],
    "oc": ["meta", "palette", "characters"],
    "other": ["meta", "notes"],
}


# ---------------------------------------------------------------- 小工具


def _fail(status: int, message: str) -> None:
    """统一抛中文业务错误（响应体 {"ok": false, "error": ...}）。"""
    raise ApiError(status, message)


def _type_label(project_type: str) -> str:
    return TYPE_LABELS.get(project_type, project_type or "其他")


def _safe_base(project_id: str) -> Path:
    """项目根目录，非法 ID → 400（中文错误）。"""
    try:
        return core.safe_project_path(project_id)
    except HTTPException:
        _fail(400, "项目 ID 不合法")


def _safe_path(project_id: str, rel: str = "") -> Path:
    """项目内相对路径，越界 → 400（中文错误）。"""
    try:
        return core.safe_project_path(project_id, rel)
    except HTTPException:
        _fail(400, "路径不合法（不允许 .. 或越出项目目录）")


def _clean_rel(raw: Any) -> str:
    """把用户传来的相对路径规整成 posix 形式（不负责越界校验）。"""
    rel = str(raw or "").replace("\\", "/").strip()
    rel = re.sub(r"/{2,}", "/", rel)
    return rel.strip("/")


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _clean_display(raw: Any, label: str, limit: int = MAX_NAME_LEN) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]", "", str(raw if raw is not None else "")).strip()
    if not text:
        _fail(400, f"{label}不能为空")
    if len(text) > limit:
        _fail(400, f"{label}最多 {limit} 个字符")
    return text


def _clean_summary(raw: Any) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]", " ", str(raw if raw is not None else "")).strip()
    if len(text) > 4000:
        _fail(400, "简介最多 4000 个字符")
    return text


def _clean_type(raw: Any) -> str:
    project_type = str(raw or "").strip().lower()
    if not project_type:
        _fail(400, "请选择项目类型")
    if project_type not in TYPES:
        _fail(400, f"未知项目类型「{project_type}」，可选：{'、'.join(TYPES)}")
    return project_type


def _clean_tags(raw: Any) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        parts: list[Any] = re.split(r"[,，;；\s]+", raw)
    elif isinstance(raw, list):
        parts = raw
    else:
        _fail(400, "标签必须是数组或逗号分隔的字符串")
    tags: list[str] = []
    for item in parts:
        tag = re.sub(r"[\x00-\x1f\x7f]", "", str(item if item is not None else "")).strip()
        if not tag:
            continue
        if len(tag) > MAX_TAG_LEN:
            _fail(400, f"单个标签最多 {MAX_TAG_LEN} 个字符")
        if tag not in tags:
            tags.append(tag)
    if len(tags) > MAX_TAGS:
        _fail(400, f"标签最多 {MAX_TAGS} 个")
    return tags


def _valid_field_value(value: Any, depth: int = 0) -> bool:
    if value is None or isinstance(value, bool):
        return True
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, str):
        return len(value) <= MAX_FIELD_TEXT
    if depth >= 2:
        return False
    if isinstance(value, list):
        return len(value) <= 500 and all(_valid_field_value(v, depth + 1) for v in value)
    if isinstance(value, dict):
        return len(value) <= 100 and all(
            isinstance(k, str) and _valid_field_value(v, depth + 1) for k, v in value.items()
        )
    return False


def _clean_fields(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        _fail(400, "fields 必须是 JSON 对象")
    if len(raw) > MAX_FIELDS:
        _fail(400, f"字段最多 {MAX_FIELDS} 个")
    out: dict[str, Any] = {}
    for key, value in raw.items():
        name = str(key or "").strip()
        if not name or len(name) > 64:
            _fail(400, "字段名不合法（1-64 个字符）")
        if not _valid_field_value(value):
            _fail(400, f"字段「{name}」的值类型不支持（只允许文本/数字/布尔/列表/对象）")
        out[name] = value
    return out


def _clean_time_value(raw: Any, default: float = 0.0) -> float | int:
    try:
        num = float(raw)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(num):
        return default
    return int(num) if num.is_integer() else round(num, 3)


def _clean_cover(raw: Any) -> str:
    """项目封面：项目目录里的相对图片路径。"""
    if raw is None:
        return ""
    value = str(raw).strip().replace("\\", "/").lstrip("/")
    if not value:
        return ""
    if ".." in value.split("/"):
        _fail(400, "封面路径不合法")
    if len(value) > 300:
        _fail(400, "封面路径太长")
    allowed = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp")
    if not value.lower().endswith(allowed):
        _fail(400, "封面必须是图片文件（jpg/png/webp/gif/avif/bmp）")
    return value


def _clean_modules_data(raw: Any) -> dict[str, Any]:
    """结构化模块数据：{moduleId: 任意 JSON}，单模块上限 512 KB。"""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        _fail(400, "modulesData 必须是对象")
    result: dict[str, Any] = {}
    for key, value in list(raw.items())[:60]:
        if not isinstance(key, str) or not key.strip():
            _fail(400, "modulesData 的键必须是非空字符串")
        try:
            size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
        except (TypeError, ValueError):
            _fail(400, "模块 " + str(key) + " 的数据不是合法 JSON")
        if size > 512 * 1024:
            _fail(400, "模块 " + str(key) + " 的数据超过 512KB")
        result[key.strip()] = value
    return result


def _clean_sections(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        _fail(400, "sections 必须是数组")
    if len(raw) > MAX_SECTIONS:
        _fail(400, f"片段最多 {MAX_SECTIONS} 个")
    out: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            _fail(400, f"第 {index + 1} 个片段格式不对")
        sec_id = re.sub(r"[^A-Za-z0-9_-]", "", str(item.get("id") or ""))[:40]
        if not sec_id:
            sec_id = f"sec{index + 1}"
        out.append({
            "id": sec_id,
            "name": _clean_display(item.get("name") or f"片段{index + 1}", "片段名称", 120),
            "start": _clean_time_value(item.get("start")),
            "end": _clean_time_value(item.get("end")),
            "notes": str(item.get("notes") or "")[:2000],
        })
    return out


def _module_applies(module_id: str, project_type: str) -> bool:
    spec = MODULES.get(module_id)
    if not spec:
        return False
    allowed = spec.get("types") or ["*"]
    return "*" in allowed or project_type in allowed


def _clean_modules(raw: Any, project_type: str) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        _fail(400, "modules 必须是数组")
    if len(raw) > MAX_MODULES:
        _fail(400, f"模块最多 {MAX_MODULES} 个")
    modules: list[str] = []
    for item in raw:
        module_id = str(item if item is not None else "").strip()
        if not module_id:
            _fail(400, "模块 ID 不能为空")
        spec = MODULES.get(module_id)
        if not spec:
            _fail(400, f"未知模块「{module_id}」")
        if not _module_applies(module_id, project_type):
            names = "、".join(
                TYPE_LABELS.get(t, t) for t in (spec.get("types") or []) if t != "*"
            )
            label = spec.get("label") or module_id
            _fail(400, f"模块「{label}」不适用于{_type_label(project_type)}项目（仅限 {names}）")
        if module_id not in modules:
            modules.append(module_id)
    return modules


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


def _load(project_id: str) -> dict[str, Any]:
    """读取 project.json 并补齐缺省键；不存在 → 404。"""
    base = _safe_base(project_id)
    meta_path = base / PROJECT_FILE
    if not meta_path.is_file():
        _fail(404, "项目不存在")
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _fail(500, "项目元数据读取失败或已损坏")
    if not isinstance(data, dict):
        _fail(500, "项目元数据格式不对")
    data.setdefault("id", project_id)
    data.setdefault("name", str(data.get("id") or project_id))
    data.setdefault("type", "other")
    data.setdefault("createdAt", "")
    data.setdefault("updatedAt", data.get("createdAt") or "")
    data.setdefault("summary", "")
    if not isinstance(data.get("tags"), list):
        data["tags"] = []
    if not isinstance(data.get("modules"), list):
        data["modules"] = []
    if not isinstance(data.get("fields"), dict):
        data["fields"] = {}
    if not isinstance(data.get("sections"), list):
        data["sections"] = []
    if not isinstance(data.get("modulesData"), dict):
        data["modulesData"] = {}
    if not isinstance(data.get("cover"), str):
        data["cover"] = ""
    return data


def _save(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    try:
        core.write_project(project_id, data)
    except OSError:
        _fail(500, "项目元数据写入失败（磁盘权限或空间问题）")
    return data


def _new_project_id() -> str:
    for _ in range(8):
        candidate = core.new_project_id()
        try:
            exists = _safe_path(candidate).exists()
        except HTTPException:
            continue
        if not exists:
            return candidate
    _fail(500, "项目 ID 分配失败，请重试")


# ---------------------------------------------------------------- 模块清单


@router.get("/api/modules")
def list_modules() -> dict[str, Any]:
    """全部模块定义（按模块 ID 组成的对象）+ 项目类型清单 + 各类型默认模块。"""
    modules = {
        module_id: {
            "label": spec.get("label") or module_id,
            "types": list(spec.get("types") or ["*"]),
            "fields": list(spec.get("fields") or []),
        }
        for module_id, spec in MODULES.items()
    }
    return {
        "ok": True,
        "modules": modules,
        "types": [{"id": t, "label": TYPE_LABELS[t]} for t in TYPES],
        "defaults": {t: list(m) for t, m in DEFAULT_MODULES.items()},
    }


# ---------------------------------------------------------------- 项目列表


@router.get("/api/projects")
def list_projects(
    project_type: str = Query("", alias="type"),
    q: str = Query(""),
    tag: str = Query(""),
) -> dict[str, Any]:
    """项目列表，支持 ?type= / ?q= / ?tag= 过滤，按更新时间倒序。"""
    want_type = project_type.strip().lower()
    keyword = q.strip().lower()
    want_tag = tag.strip().lower()

    projects: list[dict[str, Any]] = []
    for project_id in core.list_project_ids():
        try:
            data = _load(project_id)
        except HTTPException:
            # 单个项目损坏不影响整张墙
            continue
        if want_type and want_type not in ("all", "*") and data.get("type") != want_type:
            continue
        if want_tag and want_tag not in [str(t).lower() for t in data.get("tags") or []]:
            continue
        if keyword:
            haystack = " ".join([
                str(data.get("name") or ""),
                str(data.get("summary") or ""),
                " ".join(str(t) for t in data.get("tags") or []),
                json.dumps(data.get("fields") or {}, ensure_ascii=False),
            ]).lower()
            if keyword not in haystack:
                continue
        projects.append(data)

    projects.sort(
        key=lambda p: (str(p.get("updatedAt") or ""), str(p.get("name") or "")),
        reverse=True,
    )
    return {"ok": True, "projects": projects, "total": len(projects)}


# ---------------------------------------------------------------- 新建项目


@router.post("/api/projects")
async def create_project(request: Request) -> dict[str, Any]:
    """新建项目：{name, type, modules?, tags?, summary?, fields?, sections?}"""
    body = await _json_body(request)

    name = _clean_display(body.get("name"), "项目名称")
    project_type = _clean_type(body.get("type"))

    modules_raw = body.get("modules")
    if isinstance(modules_raw, list) and modules_raw:
        modules = _clean_modules(modules_raw, project_type)
        if _module_applies("meta", project_type) and "meta" not in modules:
            modules.insert(0, "meta")
    else:
        modules = list(DEFAULT_MODULES.get(project_type, ["meta"]))

    project_id = _new_project_id()
    base = _safe_path(project_id)
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError:
        _fail(500, "项目目录创建失败（磁盘权限或空间问题）")

    data: dict[str, Any] = {
        "id": project_id,
        "name": name,
        "type": project_type,
        "createdAt": core.now_iso(),
        "updatedAt": core.now_iso(),
        "tags": _clean_tags(body.get("tags")),
        "summary": _clean_summary(body.get("summary")),
        "modules": modules,
        "fields": _clean_fields(body.get("fields")),
        "modulesData": _clean_modules_data(body.get("modulesData")),
        "cover": _clean_cover(body.get("cover")),
        "sections": _clean_sections(body.get("sections")),
    }
    _save(project_id, data)
    return {"ok": True, "project": _load(project_id)}


# ---------------------------------------------------------------- 项目详情


@router.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    return {"ok": True, "project": _load(project_id)}


@router.patch("/api/projects/{project_id}")
async def update_project(project_id: str, request: Request) -> dict[str, Any]:
    """部分更新项目。

    可更新：name / type / tags / summary / modules / fields / sections。
    fields 默认是「按 key 合并」，传 ``"replaceFields": true`` 则整体替换；
    合并时某个 key 的值为 ``null`` 表示删除该字段。
    改 type 时会把不再适用的模块从 modules 里剔除（fields 不动）。
    """
    data = _load(project_id)
    body = await _json_body(request)

    if "name" in body:
        data["name"] = _clean_display(body.get("name"), "项目名称")
    if "summary" in body:
        data["summary"] = _clean_summary(body.get("summary"))
    if "tags" in body:
        data["tags"] = _clean_tags(body.get("tags"))
    if "sections" in body:
        data["sections"] = _clean_sections(body.get("sections"))
    if "type" in body:
        project_type = _clean_type(body.get("type"))
        data["type"] = project_type
        data["modules"] = [
            m for m in data.get("modules") or [] if _module_applies(str(m), project_type)
        ]
    if "modules" in body:
        data["modules"] = _clean_modules(body.get("modules"), str(data.get("type") or "other"))
    if "cover" in body:
        data["cover"] = _clean_cover(body.get("cover"))
    if "modulesData" in body:
        incoming_data = _clean_modules_data(body.get("modulesData"))
        if body.get("replaceModulesData"):
            data["modulesData"] = incoming_data
        else:
            merged_data = dict(data.get("modulesData") or {})
            for key, value in incoming_data.items():
                if value is None:
                    merged_data.pop(key, None)
                else:
                    merged_data[key] = value
            data["modulesData"] = merged_data
    if "fields" in body:
        incoming = _clean_fields(body.get("fields"))
        if body.get("replaceFields"):
            data["fields"] = incoming
        else:
            merged = dict(data.get("fields") or {})
            for key, value in incoming.items():
                if value is None:
                    merged.pop(key, None)
                else:
                    merged[key] = value
            data["fields"] = merged

    _save(project_id, data)
    return {"ok": True, "project": _load(project_id)}


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> dict[str, Any]:
    """删除整个项目目录（不可恢复）。"""
    base = _safe_base(project_id)
    if not (base / PROJECT_FILE).is_file():
        _fail(404, "项目不存在")
    try:
        shutil.rmtree(base)
    except OSError:
        _fail(500, "删除项目失败（文件被占用或权限不足）")
    return {"ok": True, "id": project_id}


# ---------------------------------------------------------------- 模块增删


@router.post("/api/projects/{project_id}/modules")
async def add_module(project_id: str, request: Request) -> dict[str, Any]:
    """给项目加模块：{module}。只改 modules 数组，不动 fields。"""
    body = await _json_body(request)
    module_id = str(
        body.get("module") or body.get("moduleId") or body.get("id") or ""
    ).strip()
    if not module_id:
        _fail(400, "缺少 module 参数")
    spec = MODULES.get(module_id)
    if not spec:
        _fail(400, f"未知模块「{module_id}」")

    data = _load(project_id)
    project_type = str(data.get("type") or "other")
    if not _module_applies(module_id, project_type):
        names = "、".join(TYPE_LABELS.get(t, t) for t in spec.get("types") or [] if t != "*")
        _fail(400, f"模块「{spec.get('label') or module_id}」不适用于{_type_label(project_type)}项目（仅限 {names}）")

    modules = [str(m) for m in data.get("modules") or []]
    if module_id not in modules:
        modules.append(module_id)
    data["modules"] = modules
    _save(project_id, data)
    return {"ok": True, "modules": modules, "project": _load(project_id)}


@router.delete("/api/projects/{project_id}/modules/{module_id}")
def remove_module(project_id: str, module_id: str) -> dict[str, Any]:
    """移除模块：只改 modules 数组，已填 fields 保留。"""
    if module_id not in MODULES:
        _fail(400, f"未知模块「{module_id}」")
    data = _load(project_id)
    modules = [str(m) for m in data.get("modules") or [] if str(m) != module_id]
    data["modules"] = modules
    _save(project_id, data)
    return {"ok": True, "modules": modules, "project": _load(project_id)}


# ---------------------------------------------------------------- 仓库树


@router.get("/api/projects/{project_id}/tree")
def project_tree(project_id: str, path: str = Query("")) -> dict[str, Any]:
    """列出项目内某个目录（不递归），前端按需展开。"""
    _load(project_id)
    rel = _clean_rel(path)
    target = _safe_path(project_id, rel)
    if not target.exists():
        _fail(404, "路径不存在")
    if not target.is_dir():
        _fail(400, "这不是文件夹")

    base = _safe_base(project_id)
    entries: list[dict[str, Any]] = []
    try:
        children = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        _fail(500, "目录读取失败")

    for child in children:
        name = child.name
        if name == PROJECT_FILE + ".tmp":
            continue
        try:
            stat = child.stat()
        except OSError:
            continue
        is_dir = child.is_dir()
        item: dict[str, Any] = {
            "name": name,
            "path": child.relative_to(base).as_posix(),
            "type": "dir" if is_dir else "file",
            "mtime": _iso(stat.st_mtime),
        }
        if not is_dir:
            item.update({
                "size": stat.st_size,
                "sizeText": core.human_size(stat.st_size),
                "kind": core.media_kind(child),
                "ext": child.suffix.lower(),
            })
        entries.append(item)

    entries.sort(key=lambda e: (e["type"] != "dir", str(e["name"]).lower()))

    crumbs: list[dict[str, str]] = [{"name": "根目录", "path": ""}]
    if rel:
        acc: list[str] = []
        for part in rel.split("/"):
            if not part:
                continue
            acc.append(part)
            crumbs.append({"name": part, "path": "/".join(acc)})

    parent = ""
    if rel:
        parts = rel.split("/")
        parent = "/".join(parts[:-1])

    return {
        "ok": True,
        "path": rel,
        "parent": parent,
        "breadcrumbs": crumbs,
        "entries": entries,
    }
