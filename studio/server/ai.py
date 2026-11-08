"""studio AI 能力：服务商配置、会话、对话、思维导图。

约定：
- API Key 只写不读：任何响应里都不会出现 api_key / apiKey 字段，只返回 hasKey。
- 对话上下文里的项目只能来自 projectIds，且全部经 core.safe_project_path() 校验，
  绝不接受任意路径；文件树只列文件名与大小，不读二进制内容。
- 缺 Key、网络失败等情况一律返回中文提示，不抛 500。
"""

from __future__ import annotations

import functools
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

import core

router = APIRouter()

# ---------------------------------------------------------------- 常量

MAX_CONTEXT_CHARS = 24000       # 项目上下文上限（字符）
MAX_FIELD_CHARS = 2000          # 单个字段截断长度
MAX_TREE_ENTRIES = 200          # 每个项目最多列出的文件数
HISTORY_LIMIT = 20              # 带进模型的历史消息条数
CHAT_TIMEOUT = 120              # 对话请求超时（秒）
TEST_TIMEOUT = 15               # 测试连接超时（秒）
DEFAULT_MAX_TOKENS = 2048
MAX_MESSAGE_CHARS = 8000
MAX_PROJECTS = 20
NEW_SESSION_TITLE = "新会话"

SYSTEM_PROMPT = (
    "你是 Hopzz 工作站（studio.hopzz.top）里的创作助手，始终用简体中文回答。"
    "用户会挑选若干项目，你会收到这些项目的 project.json 摘要（名称/类型/标签/模块/字段/片段）"
    "以及仓库文件树（只有文件名，没有文件内容）。把这些资料当作创作素材：可以讨论、补全、改写、"
    "给结构建议，但不要编造不存在的文件内容；需要看文件全文时，提醒用户在仓库里打开具体文件。"
    "回答简洁直接：先给结论，再给理由或步骤。"
)

BUILTIN_PROVIDERS: list[dict[str, Any]] = [
    {
        "id": "deepseek",
        "label": "DeepSeek",
        "baseUrl": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "needsKey": True,
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "needsKey": True,
    },
    {
        "id": "moonshot",
        "label": "Moonshot",
        "baseUrl": "https://api.moonshot.cn/v1",
        "model": "moonshot-v1-8k",
        "needsKey": True,
    },
    {
        "id": "ollama",
        "label": "本地 Ollama",
        "baseUrl": "http://127.0.0.1:11434/v1",
        "model": "llama3.2",
        "needsKey": False,
    },
]

PROVIDER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
ENV_KEY_NAMES = ("studio_ai_key", "STUDIO_AI_KEY")


class AIError(Exception):
    """业务错误：带中文提示与 HTTP 状态码。"""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _guard(func: Any) -> Any:
    """兜底装饰器：AIError → 中文 JSON，其它异常也绝不 500 冒出来。"""

    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except AIError as exc:
            return _error(exc.message, exc.status)
        except Exception as exc:  # pragma: no cover - 最后一道保险
            return _error(f"AI 服务内部错误：{exc}", 500)

    return wrapper


# ---------------------------------------------------------------- 基础工具

@contextmanager
def _conn():
    """SQLite 连接：成功提交、失败回滚、用完关闭。"""
    conn = core.db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> float:
    return time.time()


def _uid(prefix: str) -> str:
    return f"{prefix}-{time.strftime('%Y%m%d')}-{secrets.token_hex(3)}"


def _error(message: str, status: int = 400, **extra: Any) -> JSONResponse:
    payload: dict[str, Any] = {"ok": False, "error": message}
    payload.update(extra)
    return JSONResponse(payload, status_code=status)


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def _clamp_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, num))


# ---------------------------------------------------------------- 服务商

def _env_key() -> str:
    """服务端环境变量里的单 Key（部署时可以只配一个 Key）。"""
    for name in ENV_KEY_NAMES:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _provider_rows(conn: Any) -> dict[str, dict[str, Any]]:
    rows = conn.execute("SELECT * FROM ai_providers").fetchall()
    return {row["id"]: dict(row) for row in rows}


def _active_provider_id(conn: Any) -> str:
    """默认服务商：库里的 is_default → 第一个配了 Key 的内置服务商 → DeepSeek。"""
    row = conn.execute(
        "SELECT id FROM ai_providers WHERE is_default = 1 ORDER BY id LIMIT 1"
    ).fetchone()
    if row:
        return str(row["id"])
    rows = _provider_rows(conn)
    env = _env_key()
    for item in BUILTIN_PROVIDERS:
        stored = rows.get(item["id"])
        if stored and str(stored.get("api_key") or "").strip():
            return item["id"]
        if item["id"] == "deepseek" and env:
            return item["id"]
    return BUILTIN_PROVIDERS[0]["id"]


def _provider_payload(conn: Any) -> list[dict[str, Any]]:
    """服务商列表：内置项 + 库里保存的覆盖值，key 只折算成 hasKey。"""
    rows = _provider_rows(conn)
    active_id = _active_provider_id(conn)
    env = _env_key()
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for builtin in BUILTIN_PROVIDERS:
        pid = builtin["id"]
        stored = rows.get(pid) or {}
        db_key = str(stored.get("api_key") or "").strip()
        items.append(
            {
                "id": pid,
                "label": str(stored.get("label") or builtin["label"]),
                "baseUrl": str(stored.get("base_url") or builtin["baseUrl"]),
                "model": str(stored.get("model") or builtin["model"]),
                "needsKey": bool(builtin["needsKey"]),
                "hasKey": bool(db_key) or (pid == active_id and bool(env)),
                "isDefault": pid == active_id,
                "builtin": True,
                "source": "db" if stored else "default",
            }
        )
        seen.add(pid)

    for pid, stored in rows.items():
        if pid in seen:
            continue
        db_key = str(stored.get("api_key") or "").strip()
        items.append(
            {
                "id": pid,
                "label": str(stored.get("label") or pid),
                "baseUrl": str(stored.get("base_url") or ""),
                "model": str(stored.get("model") or ""),
                "needsKey": True,
                "hasKey": bool(db_key) or (pid == active_id and bool(env)),
                "isDefault": pid == active_id,
                "builtin": False,
                "source": "db",
            }
        )
    return items


def _providers_impl() -> dict[str, Any]:
    with _conn() as conn:
        providers = _provider_payload(conn)
        active_id = _active_provider_id(conn)
    return {
        "ok": True,
        "providers": providers,
        "activeId": active_id,
        "hasKey": any(item["hasKey"] for item in providers),
    }


def _resolve_provider(conn: Any, provider_id: Optional[str] = None) -> dict[str, Any]:
    """解析出真正用于请求的服务商（含明文 Key，只在服务端内存里用）。"""
    providers = {item["id"]: item for item in _provider_payload(conn)}
    active_id = _active_provider_id(conn)
    pid = (provider_id or "").strip() or active_id
    info = providers.get(pid)
    if info is None:
        raise AIError(f"未知的 AI 服务商：{pid}，请先在「AI 设置」里保存", 400)

    row = conn.execute("SELECT api_key FROM ai_providers WHERE id = ?", (pid,)).fetchone()
    key = str(row["api_key"] or "").strip() if row else ""
    if not key and pid == active_id:
        key = _env_key()

    label = info["label"]
    if info["needsKey"] and not key:
        raise AIError(
            f"{label} 还没有配置 API Key。请打开「AI 设置」填写，"
            "或在服务端设置环境变量 studio_ai_key",
            400,
        )
    base_url = str(info.get("baseUrl") or "").strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise AIError(f"{label} 的接口地址无效，必须以 http:// 或 https:// 开头", 400)
    model = str(info.get("model") or "").strip()
    if not model:
        raise AIError(f"{label} 还没有配置模型名称", 400)

    return {
        "id": pid,
        "label": label,
        "baseUrl": base_url,
        "model": model,
        "key": key,
    }


def _save_provider_impl(body: dict[str, Any]) -> dict[str, Any]:
    pid = str(body.get("id") or "").strip()
    if not pid or not PROVIDER_ID_RE.match(pid):
        raise AIError("服务商 id 不合法（只允许小写字母、数字、- 和 _）", 400)

    builtin = next((item for item in BUILTIN_PROVIDERS if item["id"] == pid), None)
    label = str(body.get("label") or (builtin or {}).get("label") or pid).strip()[:60]
    base_url = str(
        body.get("baseUrl") or body.get("base_url") or (builtin or {}).get("baseUrl") or ""
    ).strip()
    model = str(body.get("model") or (builtin or {}).get("model") or "").strip()

    if not base_url.startswith(("http://", "https://")):
        raise AIError("接口地址必须以 http:// 或 https:// 开头", 400)
    if len(base_url) > 300:
        raise AIError("接口地址太长了（上限 300 字符）", 400)
    if not model:
        raise AIError("模型名称不能为空", 400)
    if len(model) > 120:
        raise AIError("模型名称太长了（上限 120 字符）", 400)

    raw_key = body.get("apiKey", body.get("api_key"))
    key_value = raw_key.strip() if isinstance(raw_key, str) else ""
    if len(key_value) > 400:
        raise AIError("API Key 太长了（上限 400 字符）", 400)
    clear_key = _truthy(body.get("clearKey") or body.get("clear_key"))
    make_default = _truthy(body.get("isDefault") or body.get("default"))

    with _conn() as conn:
        existing = conn.execute("SELECT * FROM ai_providers WHERE id = ?", (pid,)).fetchone()
        if existing:
            stored_key = "" if clear_key else str(existing["api_key"] or "")
            if key_value:
                stored_key = key_value
            conn.execute(
                "UPDATE ai_providers SET label = ?, base_url = ?, model = ?, api_key = ? WHERE id = ?",
                (label, base_url, model, stored_key, pid),
            )
        else:
            stored_key = "" if clear_key else key_value
            conn.execute(
                "INSERT INTO ai_providers(id, label, base_url, model, api_key, is_default) "
                "VALUES(?, ?, ?, ?, ?, 0)",
                (pid, label, base_url, model, stored_key),
            )
        if make_default:
            conn.execute("UPDATE ai_providers SET is_default = 0")
            conn.execute("UPDATE ai_providers SET is_default = 1 WHERE id = ?", (pid,))

        providers = _provider_payload(conn)
        active_id = _active_provider_id(conn)

    chosen = next((item for item in providers if item["id"] == pid), None)
    return {
        "ok": True,
        "provider": chosen,
        "providers": providers,
        "activeId": active_id,
    }


# ---------------------------------------------------------------- HTTP 调用

def _extract_error(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    err = data.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or err.get("code") or "")[:300]
    if isinstance(err, str):
        return err[:300]
    if data.get("message"):
        return str(data["message"])[:300]
    return ""


def _sanitize(text: str, key: str) -> str:
    """错误信息里绝不能带出 API Key 原文。"""
    if key and key in text:
        return text.replace(key, "***")
    return text


def _http_error_message(exc: urllib.error.HTTPError) -> str:
    detail = ""
    try:
        raw = exc.read().decode("utf-8", "replace")
        try:
            detail = _extract_error(json.loads(raw)) or raw[:300]
        except Exception:
            detail = raw[:300]
    except Exception:
        detail = ""
    if exc.code == 401:
        return "API Key 无效或已过期（HTTP 401），请到「AI 设置」重新填写"
    if exc.code == 403:
        return f"没有访问权限（HTTP 403）：{detail or '服务商拒绝访问'}"
    if exc.code == 404:
        return f"接口地址不存在（HTTP 404），请检查接口地址是否包含 /v1：{detail or '未找到接口'}"
    if exc.code == 429:
        return "请求太频繁或额度不足（HTTP 429），稍后再试"
    if exc.code == 400:
        return f"服务商返回参数错误（HTTP 400）：{detail or '请检查模型名称'}"
    return f"AI 服务返回 HTTP {exc.code}：{detail or '没有详细信息'}"


def _post_json(url: str, payload: dict[str, Any], key: str, timeout: int) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    request_obj = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request_obj, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raise AIError(_sanitize(_http_error_message(exc), key), 400)
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise AIError(f"连不上 AI 服务：{reason}。请检查接口地址或服务器网络", 400)
    except TimeoutError:
        raise AIError("AI 服务响应超时，请稍后重试", 400)
    except OSError as exc:
        raise AIError(f"网络错误：{exc}", 400)

    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        raise AIError("AI 服务返回的不是 JSON，请检查接口地址是否正确", 400)
    if not isinstance(data, dict):
        raise AIError("AI 服务返回格式异常，请检查接口地址是否正确", 400)
    return data


def _extract_reply(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = [
                str(item.get("text") or "")
                for item in content
                if isinstance(item, dict)
            ]
            return "".join(parts).strip()
    if isinstance(first.get("text"), str):
        return first["text"].strip()
    return ""


def _extract_delta(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0] if isinstance(choices[0], dict) else {}
    delta = first.get("delta")
    if not isinstance(delta, dict):
        return ""
    content = delta.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text") or "") for item in content if isinstance(item, dict)
        )
    return ""


def _chat_once(
    provider: dict[str, Any],
    messages: list[dict[str, Any]],
    max_tokens: int,
    temperature: float,
) -> tuple[str, dict[str, Any]]:
    url = provider["baseUrl"] + "/chat/completions"
    payload: dict[str, Any] = {
        "model": provider["model"],
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = _post_json(url, payload, provider["key"], CHAT_TIMEOUT)
    reply = _extract_reply(data)
    if not reply:
        raise AIError("AI 返回了空内容，请换个说法或检查模型名称", 400)
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return reply, usage


def _sse(payload: dict[str, Any]) -> str:
    return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


def _stream_chat(
    provider: dict[str, Any],
    messages: list[dict[str, Any]],
    session_id: str,
    max_tokens: int,
    temperature: float,
):
    """流式回复：边收边推 SSE，最后落库。"""
    url = provider["baseUrl"] + "/chat/completions"
    payload = {
        "model": provider["model"],
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if provider["key"]:
        headers["Authorization"] = f"Bearer {provider['key']}"
    request_obj = urllib.request.Request(url, data=body, headers=headers, method="POST")

    parts: list[str] = []
    try:
        with urllib.request.urlopen(request_obj, timeout=CHAT_TIMEOUT) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                except Exception:
                    continue
                if isinstance(obj, dict) and obj.get("error"):
                    yield _sse({"ok": False, "error": _extract_error(obj) or "AI 返回错误"})
                    return
                piece = _extract_delta(obj)
                if piece:
                    parts.append(piece)
                    yield _sse({"ok": True, "delta": piece})
    except urllib.error.HTTPError as exc:
        yield _sse({"ok": False, "error": _sanitize(_http_error_message(exc), provider["key"])})
        return
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        yield _sse({"ok": False, "error": f"连不上 AI 服务：{reason}"})
        return
    except Exception as exc:
        yield _sse({"ok": False, "error": f"AI 服务连接中断：{exc}"})
        return

    reply = "".join(parts).strip()
    if not reply:
        yield _sse({"ok": False, "error": "AI 返回了空内容，请重试"})
        return

    message_id: Optional[int] = None
    try:
        with _conn() as conn:
            message_id = _add_message(conn, session_id, "assistant", reply)
    except Exception:
        message_id = None
    yield _sse(
        {
            "ok": True,
            "done": True,
            "sessionId": session_id,
            "messageId": message_id,
            "reply": reply,
        }
    )


# ---------------------------------------------------------------- 会话

def _parse_project_ids(raw: Any) -> list[str]:
    ids: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str) and item.strip():
                ids.append(item.strip())
    elif isinstance(raw, str) and raw.strip():
        ids = [piece.strip() for piece in raw.split(",") if piece.strip()]
    ordered: list[str] = []
    for pid in ids:
        if pid not in ordered:
            ordered.append(pid)
    return ordered


def _validate_project_ids(raw: Any) -> list[str]:
    """只允许当前仓库里真实存在的项目 id；任何路径式输入直接拒绝。"""
    ids = _parse_project_ids(raw)
    if len(ids) > MAX_PROJECTS:
        raise AIError(f"一次最多附加 {MAX_PROJECTS} 个项目", 400)
    known = set(core.list_project_ids())
    for pid in ids:
        if pid not in known:
            raise AIError(f"项目不可访问：{pid}（只能读取自己仓库里的项目）", 400)
    return ids


def _session_payload(row: Any, message_count: Optional[int] = None) -> dict[str, Any]:
    try:
        project_ids = json.loads(row["project_ids"] or "[]")
    except Exception:
        project_ids = []
    if not isinstance(project_ids, list):
        project_ids = []
    return {
        "id": str(row["id"]),
        "title": str(row["title"] or NEW_SESSION_TITLE),
        "projectIds": [str(item) for item in project_ids if isinstance(item, str)],
        "createdAt": float(row["created_at"] or 0),
        "updatedAt": float(row["updated_at"] or 0),
        "messageCount": int(message_count if message_count is not None else 0),
    }


def _load_session(conn: Any, session_id: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM ai_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise AIError("会话不存在或已被删除", 404)
    count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM ai_messages WHERE session_id = ?", (session_id,)
    ).fetchone()
    count = int(count_row["c"]) if count_row else 0
    return _session_payload(row, count)


def _get_or_create_session(
    conn: Any, raw_id: Any, project_ids: list[str]
) -> dict[str, Any]:
    session_id = str(raw_id or "").strip()
    if session_id:
        session = _load_session(conn, session_id)
        if project_ids:
            conn.execute(
                "UPDATE ai_sessions SET project_ids = ? WHERE id = ?",
                (json.dumps(project_ids, ensure_ascii=False), session_id),
            )
            session["projectIds"] = project_ids
        return session

    now = _now()
    session_id = _uid("s")
    conn.execute(
        "INSERT INTO ai_sessions(id, title, project_ids, created_at, updated_at) "
        "VALUES(?, ?, ?, ?, ?)",
        (
            session_id,
            NEW_SESSION_TITLE,
            json.dumps(project_ids, ensure_ascii=False),
            now,
            now,
        ),
    )
    return {
        "id": session_id,
        "title": NEW_SESSION_TITLE,
        "projectIds": project_ids,
        "createdAt": now,
        "updatedAt": now,
        "messageCount": 0,
    }


def _add_message(conn: Any, session_id: str, role: str, content: str) -> int:
    now = _now()
    cur = conn.execute(
        "INSERT INTO ai_messages(session_id, role, content, created_at) VALUES(?, ?, ?, ?)",
        (session_id, role, content, now),
    )
    conn.execute("UPDATE ai_sessions SET updated_at = ? WHERE id = ?", (now, session_id))
    return int(cur.lastrowid)


def _history(conn: Any, session_id: str, limit: int = HISTORY_LIMIT) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT role, content FROM ai_messages WHERE session_id = ? "
        "AND role IN ('user', 'assistant') ORDER BY id DESC LIMIT ?",
        (session_id, limit),
    ).fetchall()
    return [
        {"role": str(row["role"]), "content": str(row["content"])} for row in reversed(rows)
    ]


def _session_messages(conn: Any, session_id: str, limit: int = 500) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, role, content, created_at FROM ai_messages "
        "WHERE session_id = ? ORDER BY id LIMIT ?",
        (session_id, limit),
    ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "role": str(row["role"]),
            "content": str(row["content"]),
            "createdAt": float(row["created_at"] or 0),
        }
        for row in rows
    ]


# ---------------------------------------------------------------- 项目上下文

def _project_file_tree(base: Path) -> list[str]:
    """只列文件名，不读文件内容；跳过隐藏文件与常见缓存目录。"""
    names: list[str] = []
    try:
        for root_dir, dirnames, filenames in os.walk(str(base)):
            dirnames[:] = sorted(
                name
                for name in dirnames
                if not name.startswith(".") and name not in ("__pycache__", "node_modules")
            )
            rel_root = Path(root_dir).relative_to(base)
            for filename in sorted(filenames):
                if filename.startswith("."):
                    continue
                rel = (rel_root / filename).as_posix()
                if rel.startswith("."):
                    continue
                names.append(rel)
                if len(names) >= MAX_TREE_ENTRIES:
                    return names
    except OSError:
        pass
    return names


def _clip_value(value: Any) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False)
        except Exception:
            text = str(value)
    text = text.strip()
    if len(text) > MAX_FIELD_CHARS:
        text = text[:MAX_FIELD_CHARS] + f"…（已截断，共 {len(text)} 字）"
    return text


def _project_context(project_id: str) -> str:
    try:
        data = core.read_project(project_id)
    except Exception:
        return ""
    try:
        base = core.safe_project_path(project_id)
    except Exception:
        return ""

    name = str(data.get("name") or project_id)
    lines: list[str] = [f"### 项目：{name}（ID: {project_id}）"]
    lines.append(f"- 类型：{data.get('type') or '未设置'}")
    tags = data.get("tags")
    if isinstance(tags, list) and tags:
        lines.append("- 标签：" + "、".join(str(tag) for tag in tags[:20]))
    summary = str(data.get("summary") or "").strip()
    if summary:
        lines.append("- 简介：" + _clip_value(summary))
    modules = data.get("modules")
    if isinstance(modules, list) and modules:
        lines.append("- 模块：" + "、".join(str(item) for item in modules[:30]))

    fields = data.get("fields")
    if isinstance(fields, dict) and fields:
        lines.append("- 字段：")
        for key in list(fields.keys())[:30]:
            value = _clip_value(fields.get(key))
            if not value:
                continue
            lines.append(f"  - {key}：{value}")

    sections = data.get("sections")
    if isinstance(sections, list) and sections:
        lines.append("- 片段：" + _clip_value(sections[:20]))

    files = _project_file_tree(base)
    if files:
        lines.append("- 仓库文件（只有文件名）：")
        lines.extend(f"  - {name}" for name in files)
        if len(files) >= MAX_TREE_ENTRIES:
            lines.append(f"  - …（超过 {MAX_TREE_ENTRIES} 个文件，已截断）")
    return "\n".join(lines)


def _build_context(project_ids: list[str]) -> str:
    blocks = [_project_context(pid) for pid in project_ids]
    text = "\n\n".join(block for block in blocks if block)
    if len(text) > MAX_CONTEXT_CHARS:
        text = text[:MAX_CONTEXT_CHARS] + "\n…（项目资料过长，已截断）"
    return text


def _system_message(project_ids: list[str]) -> dict[str, Any]:
    content = SYSTEM_PROMPT
    context = _build_context(project_ids)
    if context:
        content += "\n\n## 当前附加的项目资料\n" + context
    return {"role": "system", "content": content}


# ---------------------------------------------------------------- 路由：服务商

@router.get("/api/ai/providers")
@_guard
async def get_providers() -> Any:
    return _providers_impl()


@router.post("/api/ai/providers")
@_guard
async def save_provider(request: Request) -> Any:
    return _save_provider_impl(await _json_body(request))


@router.post("/api/ai/providers/{provider_id}/test")
@_guard
async def test_provider(provider_id: str) -> Any:
    with _conn() as conn:
        provider = _resolve_provider(conn, provider_id)
    started = time.time()
    data = _post_json(
        provider["baseUrl"] + "/chat/completions",
        {
            "model": provider["model"],
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 4,
            "temperature": 0,
        },
        provider["key"],
        TEST_TIMEOUT,
    )
    elapsed = int((time.time() - started) * 1000)
    reply = _extract_reply(data)
    return {
        "ok": True,
        "providerId": provider["id"],
        "latencyMs": elapsed,
        "reply": reply,
        "message": f"{provider['label']} 连接正常（{elapsed} ms）",
    }


@router.get("/api/ai/config")
@_guard
async def get_config() -> Any:
    return _providers_impl()


@router.post("/api/ai/config")
@_guard
async def save_config(request: Request) -> Any:
    body = await _json_body(request)
    default_id = str(body.get("defaultId") or "").strip()
    if default_id and not body.get("id"):
        with _conn() as conn:
            known = {item["id"] for item in _provider_payload(conn)}
            if default_id not in known:
                raise AIError(f"未知的 AI 服务商：{default_id}", 400)
            row = conn.execute(
                "SELECT id FROM ai_providers WHERE id = ?", (default_id,)
            ).fetchone()
            if row is None:
                builtin = next(
                    (item for item in BUILTIN_PROVIDERS if item["id"] == default_id), None
                )
                if builtin is None:
                    raise AIError(f"未知的 AI 服务商：{default_id}", 400)
                conn.execute(
                    "INSERT INTO ai_providers(id, label, base_url, model, api_key, is_default) "
                    "VALUES(?, ?, ?, ?, '', 0)",
                    (default_id, builtin["label"], builtin["baseUrl"], builtin["model"]),
                )
            conn.execute("UPDATE ai_providers SET is_default = 0")
            conn.execute("UPDATE ai_providers SET is_default = 1 WHERE id = ?", (default_id,))
        return _providers_impl()
    return _save_provider_impl(body)


# ---------------------------------------------------------------- 路由：会话

@router.get("/api/ai/sessions")
@_guard
async def list_sessions() -> Any:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT s.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.session_id = s.id) "
            "AS message_count FROM ai_sessions s ORDER BY s.updated_at DESC LIMIT 200"
        ).fetchall()
        sessions = [
            _session_payload(row, int(row["message_count"] or 0)) for row in rows
        ]
    return {"ok": True, "sessions": sessions}


@router.post("/api/ai/sessions")
@_guard
async def create_session(request: Request) -> Any:
    body = await _json_body(request)
    title = str(body.get("title") or "").strip()[:100] or NEW_SESSION_TITLE
    project_ids = _validate_project_ids(body.get("projectIds"))
    now = _now()
    session_id = _uid("s")
    with _conn() as conn:
        conn.execute(
            "INSERT INTO ai_sessions(id, title, project_ids, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?)",
            (
                session_id,
                title,
                json.dumps(project_ids, ensure_ascii=False),
                now,
                now,
            ),
        )
    return {
        "ok": True,
        "session": {
            "id": session_id,
            "title": title,
            "projectIds": project_ids,
            "createdAt": now,
            "updatedAt": now,
            "messageCount": 0,
        },
    }


@router.get("/api/ai/sessions/{session_id}")
@_guard
async def get_session(session_id: str) -> Any:
    with _conn() as conn:
        session = _load_session(conn, session_id)
        messages = _session_messages(conn, session_id)
    return {"ok": True, "session": session, "messages": messages}


@router.patch("/api/ai/sessions/{session_id}")
@_guard
async def update_session(session_id: str, request: Request) -> Any:
    body = await _json_body(request)
    with _conn() as conn:
        _load_session(conn, session_id)
        if "title" in body:
            title = str(body.get("title") or "").strip()[:100]
            if not title:
                raise AIError("会话名称不能为空", 400)
            conn.execute(
                "UPDATE ai_sessions SET title = ?, updated_at = ? WHERE id = ?",
                (title, _now(), session_id),
            )
        if "projectIds" in body:
            project_ids = _validate_project_ids(body.get("projectIds"))
            conn.execute(
                "UPDATE ai_sessions SET project_ids = ?, updated_at = ? WHERE id = ?",
                (json.dumps(project_ids, ensure_ascii=False), _now(), session_id),
            )
        session = _load_session(conn, session_id)
    return {"ok": True, "session": session}


@router.delete("/api/ai/sessions/{session_id}")
@_guard
async def delete_session(session_id: str) -> Any:
    with _conn() as conn:
        _load_session(conn, session_id)
        conn.execute("DELETE FROM ai_messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM ai_sessions WHERE id = ?", (session_id,))
    return {"ok": True, "sessionId": session_id}


# ---------------------------------------------------------------- 路由：对话

@router.post("/api/ai/chat")
@_guard
async def chat(request: Request) -> Any:
    body = await _json_body(request)
    message = str(body.get("message") or "").strip()
    if not message:
        raise AIError("消息不能为空", 400)
    if len(message) > MAX_MESSAGE_CHARS:
        raise AIError(f"单条消息太长了（上限 {MAX_MESSAGE_CHARS} 字）", 400)

    requested_ids = _validate_project_ids(body.get("projectIds"))
    provider_id = str(body.get("providerId") or "").strip() or None
    max_tokens = _clamp_int(body.get("maxTokens"), DEFAULT_MAX_TOKENS, 64, 8192)
    try:
        temperature = float(body.get("temperature", 0.7))
    except (TypeError, ValueError):
        temperature = 0.7
    temperature = max(0.0, min(2.0, temperature))
    want_stream = _truthy(body.get("stream"))

    with _conn() as conn:
        provider = _resolve_provider(conn, provider_id)
        session = _get_or_create_session(conn, body.get("sessionId"), requested_ids)
        session_id = session["id"]
        effective_ids = requested_ids or session.get("projectIds") or []

        # 首条消息自动给会话起个名字，方便在列表里认出来
        if session.get("messageCount", 0) == 0 and session.get("title") == NEW_SESSION_TITLE:
            title = message.replace("\n", " ").strip()[:24] or NEW_SESSION_TITLE
            conn.execute(
                "UPDATE ai_sessions SET title = ? WHERE id = ?", (title, session_id)
            )

        user_message_id = _add_message(conn, session_id, "user", message)
        history = _history(conn, session_id, HISTORY_LIMIT)
        messages = [_system_message(effective_ids)] + history

    if want_stream:
        return StreamingResponse(
            _stream_chat(provider, messages, session_id, max_tokens, temperature),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    reply, usage = _chat_once(provider, messages, max_tokens, temperature)
    with _conn() as conn:
        assistant_message_id = _add_message(conn, session_id, "assistant", reply)
        session = _load_session(conn, session_id)

    return {
        "ok": True,
        "sessionId": session_id,
        "session": session,
        "userMessageId": user_message_id,
        "messageId": assistant_message_id,
        "reply": reply,
        "provider": provider["id"],
        "model": provider["model"],
        "projectIds": effective_ids,
        "usage": usage,
    }


# ---------------------------------------------------------------- 路由：思维导图

def _strip_code_fence(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if lines:
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _render_conversation(messages: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    total = 0
    for item in messages[-20:]:
        role = "用户" if item.get("role") == "user" else "助手"
        text = str(item.get("content") or "").strip()
        if not text:
            continue
        if len(text) > 800:
            text = text[:800] + "…"
        block = f"{role}：{text}"
        if total + len(block) > 8000:
            break
        blocks.append(block)
        total += len(block)
    return "\n\n".join(blocks)


MINDMAP_SYSTEM = (
    "你是信息整理助手。请把用户提供的对话整理成一张思维导图，"
    "严格使用 Markdown 标题层级：第一行是「# 中心主题」，分支用「## 一级分支」，"
    "更细的用「### 二级分支」；不要使用列表符号，不要输出代码块围栏，不要任何解释文字。"
)


@router.post("/api/ai/mindmap")
@_guard
async def mindmap(request: Request) -> Any:
    body = await _json_body(request)
    session_id = str(body.get("sessionId") or "").strip()
    if not session_id:
        raise AIError("缺少 sessionId", 400)
    provider_id = str(body.get("providerId") or "").strip() or None

    with _conn() as conn:
        session = _load_session(conn, session_id)
        raw_messages = _session_messages(conn, session_id, 100)

    messages = [
        item
        for item in raw_messages
        if item["role"] in ("user", "assistant") and str(item["content"]).strip()
    ]
    if not messages:
        raise AIError("这个会话还没有聊天记录，先聊几句再生成导图", 400)

    with _conn() as conn:
        provider = _resolve_provider(conn, provider_id)

    project_ids = [pid for pid in session.get("projectIds", []) if isinstance(pid, str)]
    context = _build_context(project_ids)
    user_content = ""
    if context:
        user_content += "## 项目资料\n" + context + "\n\n"
    user_content += "## 对话内容\n" + _render_conversation(messages)

    reply, _usage = _chat_once(
        provider,
        [
            {"role": "system", "content": MINDMAP_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        max_tokens=1600,
        temperature=0.3,
    )
    markdown = _strip_code_fence(reply)
    if not markdown:
        raise AIError("模型没有返回可用的导图内容，请重试", 400)
    if not any(line.lstrip().startswith("#") for line in markdown.splitlines()):
        title = str(session.get("title") or "思维导图").strip() or "思维导图"
        markdown = "# " + title + "\n\n" + markdown

    return {
        "ok": True,
        "sessionId": session_id,
        "markmap": markdown,
        "provider": provider["id"],
        "model": provider["model"],
    }
