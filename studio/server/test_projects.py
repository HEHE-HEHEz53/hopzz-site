"""studio 后端主流程自检：项目 CRUD + 模块 + 仓库 + 上传/预览/Range/缩略图/元数据。

直接跑（不需要 pytest）：

    cd /opt/hopzz-studio/server && python3 test_projects.py

测试使用临时目录（临时 STUDIO_ROOT / DB_PATH），不会碰 /srv/files/工作站。
"""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# Windows 控制台默认 GBK，直接输出中文/✓ 会 UnicodeEncodeError；服务器 UTF-8 不受影响。
try:  # pragma: no cover - 仅本地调试用
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ---- 必须赶在 import core / app 之前设置环境变量 -------------------------
_TMP = Path(tempfile.mkdtemp(prefix="studio-test-"))
os.environ["STUDIO_ROOT"] = str(_TMP / "root")
os.environ["DB_PATH"] = str(_TMP / "studio.db")
os.environ["STATIC_DIR"] = str(_TMP / "static")
os.environ["COOKIE_SECRET"] = "test-cookie-secret"
os.environ.pop("STUDIO_PASSWORD", None)  # 走 /api/setup 流程

import core  # noqa: E402
import app as app_module  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

try:
    from PIL import Image  # noqa: E402

    HAS_PIL = True
except Exception:  # pragma: no cover
    HAS_PIL = False

PASSWORD = "test1234"
PASSED = 0
FAILED: list[str] = []


def check(condition: object, message: str) -> None:
    global PASSED
    if condition:
        PASSED += 1
        print(f"  ✓ {message}")
    else:
        FAILED.append(message)
        raise AssertionError(message)


def error_body(response, message: str, status: int = 400) -> None:
    """POST/PATCH 校验失败：HTTP 400 + {"ok": false, "error": "中文原因"}。"""
    check(response.status_code == status, f"{message}：状态码 {status}（实际 {response.status_code}）")
    try:
        payload = response.json()
    except ValueError:
        raise AssertionError(f"{message}：响应不是 JSON：{response.text[:200]}")
    check(payload.get("ok") is False, f"{message}：ok 为 false")
    check(isinstance(payload.get("error"), str) and payload["error"].strip() != "",
          f"{message}：带中文 error（{payload.get('error')}）")


def ok_body(response, message: str) -> dict:
    check(response.status_code == 200, f"{message}：状态码 200（实际 {response.status_code}）")
    try:
        payload = response.json()
    except ValueError:
        raise AssertionError(f"{message}：响应不是 JSON：{response.text[:200]}")
    check(payload.get("ok") is True, f"{message}：ok 为 true")
    return payload


# 没有 Pillow 时的兜底：1x1 PNG（上传/缩略图用例仍可跑，缩略图断言自动跳过）
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def png_bytes(width: int = 64, height: int = 48) -> bytes:
    if not HAS_PIL:  # pragma: no cover - 只在没装 Pillow 的机器上走
        return PNG_1PX
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (18, 52, 86)).save(buffer, "PNG")
    return buffer.getvalue()


def wav_bytes(seconds: int = 1) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(8000)
        handle.writeframes(b"\x00\x00" * 8000 * seconds)
    return buffer.getvalue()


def main() -> None:
    client = TestClient(app_module.app)

    # ---------------------------------------------------------------- 鉴权
    print("\n[1] 鉴权 / 健康检查")
    check(client.get("/api/health").status_code == 200, "健康检查 200")
    state = client.get("/api/setup-state").json()
    check(state.get("needsSetup") is True, "首次启动 needsSetup=true")
    check(client.get("/api/projects").status_code == 401, "未登录访问 /api/projects 返回 401")
    setup = client.post("/api/setup", json={"password": PASSWORD})
    check(setup.status_code == 200 and setup.json().get("ok") is True, "首次设置密码成功")
    check(client.get("/api/projects").status_code == 200, "登录后 /api/projects 可访问")

    # ---------------------------------------------------------------- 模块清单
    print("\n[2] 模块清单 /api/modules")
    payload = ok_body(client.get("/api/modules"), "GET /api/modules")
    modules = payload.get("modules")
    check(isinstance(modules, dict), "modules 是对象（按模块 ID 索引）")
    for module_id in ("meta", "lyrics", "chords", "sections", "palette", "outline", "code"):
        check(module_id in modules, f"包含模块 {module_id}")
    allowed_field_types = {"text", "textarea", "number", "select", "tags", "date", "url"}
    select_field = None
    for module_id, spec in modules.items():
        check(isinstance(spec.get("label"), str) and spec["label"], f"{module_id} 有 label")
        check(isinstance(spec.get("types"), list) and spec["types"], f"{module_id} 有 types")
        for field in spec.get("fields") or []:
            check(isinstance(field.get("key"), str) and field["key"], f"{module_id} 字段有 key")
            check(field.get("type") in allowed_field_types,
                  f"{module_id}.{field.get('key')} 字段类型合法（{field.get('type')}）")
            if field.get("type") == "select":
                select_field = field
                options = field.get("options")
                check(isinstance(options, list) and options, f"{module_id}.{field['key']} select 有 options")
                check(all(isinstance(o, dict) and "value" in o and "label" in o for o in options),
                      f"{module_id}.{field['key']} options 为 {{value,label}} 结构")
    check(select_field is not None, "至少有一个 select 字段")

    # ---------------------------------------------------------------- 建项目
    print("\n[3] 新建项目")
    body = ok_body(
        client.post("/api/projects", json={"name": "鲸落", "type": "music", "tags": ["电子", "女声"]}),
        "POST /api/projects",
    )
    project = body["project"]
    project_id = project["id"]
    check(project_id.startswith("p-"), f"项目 ID 形如 p-…（{project_id}）")
    check(project["name"] == "鲸落" and project["type"] == "music", "名称/类型正确")
    check(project["tags"] == ["电子", "女声"], "标签正确")
    check("meta" in project["modules"] and "lyrics" in project["modules"], "音乐项目默认含 meta/lyrics")
    check(project["createdAt"].endswith("Z") and project["updatedAt"].endswith("Z"), "时间戳为 ISO UTC")
    base_url = f"/api/projects/{project_id}"
    check((core.ROOT / project_id / "project.json").is_file(), "project.json 已落盘")
    check((core.ROOT / project_id).is_dir(), "项目目录已创建")

    error_body(
        client.post("/api/projects", json={"name": "x", "type": "nope"}),
        "未知项目类型",
    )
    error_body(client.post("/api/projects", json={"name": "  ", "type": "music"}), "空项目名")
    error_body(
        client.post("/api/projects", json={"name": "x", "type": "lyrics", "modules": ["shots"]}),
        "类型不匹配的模块被拒绝",
    )

    # ---------------------------------------------------------------- 详情 / 更新
    print("\n[4] 项目详情与 PATCH")
    detail = ok_body(client.get(base_url), "GET 项目详情")
    check(detail["project"]["id"] == project_id, "详情 id 一致")

    patch = ok_body(
        client.patch(base_url, json={
            "name": "鲸落（改）",
            "tags": ["电子", "女声", "未来低音"],
            "fields": {"bpm": 128, "lyrics": "第一行\n第二行", "chords": "Am F C G"},
        }),
        "PATCH 项目（合并 fields）",
    )
    fields = patch["project"]["fields"]
    check(patch["project"]["name"] == "鲸落（改）", "PATCH 名称生效")
    check(fields.get("bpm") == 128 and "第一行" in fields.get("lyrics", ""), "PATCH fields 生效")
    check(patch["project"]["updatedAt"] >= project["updatedAt"], "updatedAt 已刷新")

    merged = ok_body(client.patch(base_url, json={"fields": {"key": "A minor"}}), "PATCH 部分字段合并")
    check(merged["project"]["fields"].get("bpm") == 128, "合并不会丢已有字段")
    check(merged["project"]["fields"].get("key") == "A minor", "新字段写入")
    cleared = ok_body(client.patch(base_url, json={"fields": {"key": None}}), "PATCH fields 置 null 删除")
    check("key" not in cleared["project"]["fields"], "null 删除字段")
    error_body(client.patch(base_url, json={"name": "   "}), "PATCH 空名称被拒绝")
    error_body(client.patch(base_url, json={"fields": "不是对象"}), "PATCH fields 类型错误被拒绝")

    # ---------------------------------------------------------------- 列表 / 过滤
    print("\n[5] 项目列表与过滤")
    listing = ok_body(client.get("/api/projects"), "GET /api/projects")
    check(listing["total"] >= 1 and listing["projects"][0]["id"] == project_id, "列表含新项目且按更新时间倒序")
    first = listing["projects"][0]
    for key in ("id", "name", "type", "tags", "summary", "modules", "createdAt", "updatedAt"):
        check(key in first, f"列表项包含 {key}")
    check(ok_body(client.get("/api/projects?type=music"), "type 过滤")["total"] == 1, "type=music 命中")
    check(ok_body(client.get("/api/projects?type=code"), "type 过滤")["total"] == 0, "type=code 不命中")
    check(ok_body(client.get("/api/projects?q=鲸落"), "q 搜索")["total"] == 1, "q 搜索命中名称")
    check(ok_body(client.get("/api/projects?q=不存在的词"), "q 搜索")["total"] == 0, "q 搜索未命中")
    check(ok_body(client.get("/api/projects?tag=女声"), "tag 过滤")["total"] == 1, "tag 命中")
    check(ok_body(client.get("/api/projects?tag=古典"), "tag 过滤")["total"] == 0, "tag 未命中")

    # ---------------------------------------------------------------- 模块增删
    print("\n[6] 模块增删")
    error_body(
        client.post(f"{base_url}/modules", json={"module": "shots"}),
        "音乐项目加视频模块被拒绝",
    )
    added = ok_body(client.post(f"{base_url}/modules", json={"module": "notes"}), "加模块 notes")
    check("notes" in added["modules"] and "notes" in added["project"]["modules"], "notes 已加入")
    ok_body(client.post(f"{base_url}/modules", json={"module": "notes"}), "重复加模块幂等")
    check(added["project"]["fields"].get("bpm") == 128, "加模块不动 fields")
    removed = ok_body(client.delete(f"{base_url}/modules/chords"), "移除模块 chords")
    check("chords" not in removed["modules"], "chords 已移除")
    check(removed["project"]["fields"].get("chords") == "Am F C G", "移除模块保留已填字段")
    error_body(client.delete(f"{base_url}/modules/nope"), "移除未知模块被拒绝")

    # ---------------------------------------------------------------- 仓库：mkdir / upload / tree
    print("\n[7] 仓库：新建文件夹 / 上传 / 树")
    made = ok_body(client.post(f"{base_url}/mkdir", json={"path": "assets", "name": "音频"}), "新建文件夹")
    check(made["path"] == "assets/音频" and made["created"] is True, "文件夹路径正确")
    again = ok_body(client.post(f"{base_url}/mkdir", json={"path": "assets/音频"}), "重复建文件夹")
    check(again["created"] is False, "已存在时 created=false")
    error_body(client.post(f"{base_url}/mkdir", json={"path": "../逃逸"}), "mkdir 路径逃逸被拒绝")

    files_payload = [
        ("files", ("a.txt", b"hello world", "text/plain")),
        ("files", ("pic.png", png_bytes(), "image/png")),
        ("files", ("song.wav", wav_bytes(), "audio/wav")),
    ]
    up = ok_body(
        client.post(f"{base_url}/upload?path=assets/音频", files=files_payload),
        "multipart 上传 3 个文件",
    )
    check(up["count"] == 3 and not up["failed"], "3 个文件全部上传成功")
    kinds = {item["name"]: item["kind"] for item in up["uploaded"]}
    check(kinds.get("a.txt") == "text", "txt → kind=text")
    check(kinds.get("pic.png") == "image", "png → kind=image")
    check(kinds.get("song.wav") == "audio", "wav → kind=audio")
    check(all(item.get("size", 0) > 0 for item in up["uploaded"]), "上传项带 size")
    for item in up["uploaded"]:
        check(item["path"].startswith("assets/音频/"), f"上传项 path 正确（{item['path']}）")

    single = ok_body(
        client.post(f"{base_url}/upload?path=assets/音频", files={"file": ("c.txt", b"ccc", "text/plain")}),
        "字段名 file 兜底上传",
    )
    check(single["count"] == 1 and single["uploaded"][0]["name"] == "c.txt", "file 字段兜底生效")

    no_overwrite = ok_body(
        client.post(f"{base_url}/upload?path=assets/音频&overwrite=0",
                    files={"files": ("c.txt", b"new", "text/plain")}),
        "overwrite=0 时同名文件不覆盖",
    )
    check(no_overwrite["count"] == 0 and no_overwrite["failed"], "overwrite=0 进入 failed")

    form_path = ok_body(
        client.post(f"{base_url}/upload", data={"path": "assets/音频"},
                    files=[("files", ("d.txt", b"d", "text/plain"))]),
        "兼容 multipart 表单里的 path",
    )
    check(form_path["uploaded"][0]["path"] == "assets/音频/d.txt", "表单 path 兜底生效")
    ok_body(client.delete(f"{base_url}/file?path=assets/音频/d.txt"), "清理 d.txt")

    error_body(client.post(f"{base_url}/upload?path=../逃逸", files={"files": ("x.txt", b"x")}),
               "上传路径逃逸被拒绝")
    error_body(client.post("/api/projects/p-19990101-abcdef/upload",
                           files={"files": ("x.txt", b"x")}), "上传到不存在项目 404", status=404)

    root_tree = ok_body(client.get(f"{base_url}/tree"), "GET 仓库树（根）")
    check(root_tree["path"] == "", "根目录 path 为空")
    names = {entry["name"] for entry in root_tree["entries"]}
    check("assets" in names and "project.json" in names, "根目录含 assets / project.json")
    assets_entry = next(e for e in root_tree["entries"] if e["name"] == "assets")
    check(assets_entry["type"] == "dir", "assets 是 dir")

    sub_tree = ok_body(client.get(f"{base_url}/tree?path=assets/音频"), "GET 仓库树（子目录）")
    check(sub_tree["path"] == "assets/音频", "子目录 path 正确")
    check(len(sub_tree["entries"]) == 4, "子目录 4 个文件")
    file_entry = next(e for e in sub_tree["entries"] if e["name"] == "a.txt")
    check(file_entry["type"] == "file", "文件 type=file")
    check(file_entry["kind"] == "text" and isinstance(file_entry["size"], int), "文件项带 kind/size")
    check(file_entry["mtime"].endswith("Z"), "文件项带 ISO mtime")
    error_body(client.get(f"{base_url}/tree?path=../逃逸"), "树路径逃逸被拒绝")
    error_body(client.get(f"{base_url}/tree?path=不存在"), "不存在的目录 404", status=404)

    # ---------------------------------------------------------------- 下载 / Range
    print("\n[8] 下载与 HTTP Range")
    full = client.get(f"{base_url}/file?path=assets/音频/a.txt")
    check(full.status_code == 200 and full.content == b"hello world", "完整下载内容正确")
    check(full.headers.get("accept-ranges") == "bytes", "响应带 Accept-Ranges: bytes")
    check("inline" in full.headers.get("content-disposition", ""), "默认 inline")

    partial = client.get(f"{base_url}/file?path=assets/音频/a.txt", headers={"Range": "bytes=0-4"})
    check(partial.status_code == 206, "Range 请求返回 206")
    check(partial.content == b"hello", "Range 0-4 内容正确")
    check(partial.headers.get("content-range") == "bytes 0-4/11", "Content-Range 头正确")

    suffix = client.get(f"{base_url}/file?path=assets/音频/a.txt", headers={"Range": "bytes=-5"})
    check(suffix.status_code == 206 and suffix.content == b"world", "后缀 Range bytes=-5 正确")

    open_range = client.get(f"{base_url}/file?path=assets/音频/a.txt", headers={"Range": "bytes=6-"})
    check(open_range.status_code == 206 and open_range.content == b"world", "开放区间 bytes=6- 正确")

    invalid = client.get(f"{base_url}/file?path=assets/音频/a.txt", headers={"Range": "bytes=500-600"})
    check(invalid.status_code == 416, "越界 Range 返回 416")

    download = client.get(f"{base_url}/file?path=assets/音频/a.txt&download=1")
    check("attachment" in download.headers.get("content-disposition", ""), "download=1 返回 attachment")

    error_body(client.get(f"{base_url}/file?path=../../etc/passwd"), "文件路径逃逸被拒绝")
    error_body(client.get(f"{base_url}/file?path=assets"), "目录不能当文件读")
    error_body(client.get(f"{base_url}/file?path=不存在.txt"), "不存在文件 404", status=404)

    # ---------------------------------------------------------------- 缩略图 / 元数据
    print("\n[9] 缩略图与媒体元数据")
    if HAS_PIL:
        thumb = client.get(f"{base_url}/thumb?path=assets/音频/pic.png&size=32")
        check(thumb.status_code == 200 and thumb.headers.get("content-type") == "image/jpeg",
              "缩略图返回 JPEG")
        check(thumb.content.startswith(b"\xff\xd8"), "缩略图是有效 JPEG 数据")
        with Image.open(io.BytesIO(thumb.content)) as thumb_img:
            check(max(thumb_img.size) <= 32, f"缩略图最长边 ≤32（{thumb_img.size}）")
        error_body(client.get(f"{base_url}/thumb?path=assets/音频/a.txt"), "非图片不能生成缩略图")
    else:  # pragma: no cover
        print("  - 跳过：本机没有 Pillow")

    meta = ok_body(client.get(f"/api/media/meta?project={project_id}&path=assets/音频/pic.png"),
                   "GET /api/media/meta（图片）")
    image_meta = meta["meta"]
    check(image_meta["kind"] == "image" and image_meta["size"] > 0, "图片元数据 kind/size")
    if HAS_PIL:
        check(image_meta["image"]["width"] == 64 and image_meta["image"]["height"] == 48,
              "图片宽高正确")
    audio_meta = ok_body(client.get(f"/api/media/meta?project={project_id}&path=assets/音频/song.wav"),
                         "GET /api/media/meta（音频）")["meta"]
    check(audio_meta["kind"] == "audio", "音频元数据 kind=audio")
    check("duration" in audio_meta or audio_meta.get("note"), "有 ffprobe 给时长，否则给说明")
    error_body(client.get(f"/api/media/meta?path=assets/音频/a.txt"), "meta 缺 project 被拒绝")
    error_body(client.get(f"/api/media/meta?project={project_id}&path=../x"), "meta 路径逃逸被拒绝")

    # ---------------------------------------------------------------- 删除文件
    print("\n[10] 删除文件")
    ok_body(client.delete(f"{base_url}/file?path=assets/音频/c.txt"), "删除文件 c.txt")
    check(client.get(f"{base_url}/file?path=assets/音频/c.txt").status_code == 404, "删除后 404")
    error_body(client.delete(f"{base_url}/file?path="), "不能删除项目根目录")
    error_body(client.delete(f"{base_url}/file?path=project.json"), "不能删除 project.json")
    error_body(client.delete(f"{base_url}/file?path=assets"), "非空目录需 recursive=1")
    ok_body(client.delete(f"{base_url}/file?path=assets&recursive=1"), "recursive=1 删除目录")
    check(client.get(f"{base_url}/tree?path=assets").status_code == 404, "目录删除后不存在")

    # ---------------------------------------------------------------- 删除项目
    print("\n[11] 删除项目")
    ok_body(client.delete(base_url), "DELETE 项目")
    check(client.get(base_url).status_code == 404, "项目删除后详情 404")
    check(not (core.ROOT / project_id).exists(), "项目目录已从磁盘移除")
    check(ok_body(client.get("/api/projects"), "删除后列表")["total"] == 0, "列表已空")

    # ---------------------------------------------------------------- 未登录兜底
    print("\n[12] 未登录兜底")
    anonymous = TestClient(app_module.app)
    check(anonymous.get("/api/projects").status_code == 401, "匿名访问仍 401")
    check(anonymous.get(f"/api/projects/{project_id}").status_code == 401, "匿名访问项目 401")


def run() -> int:
    try:
        main()
    except AssertionError as exc:
        print(f"\n✗ 失败：{exc}")
        return 1
    finally:
        shutil.rmtree(_TMP, ignore_errors=True)
    print(f"\n全部通过：{PASSED} 项断言。")
    return 0


if __name__ == "__main__":
    sys.exit(run())
