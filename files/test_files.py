#!/usr/bin/env python3
"""鲸鱼娘网盘 API 自检：鉴权 / 网盘模式门禁 / 改密码 / 上传下载 / 文件夹 / 移动 / 删除"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.getenv("FILES_BASE", "https://f.hopzz.top")
PWD = os.getenv("FILE_PASSWORD", "")
OK = FAIL = 0


def check(name, cond, detail=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  [OK]   {name} {detail}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {detail}")


class C:
    def __init__(self):
        import http.cookiejar
        import ssl

        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )

    def req(self, method, path, body=None, raw=None, headers=None):
        data = None
        hdrs = dict(headers or {})
        if body is not None:
            data = json.dumps(body).encode()
            hdrs["Content-Type"] = "application/json"
        elif raw is not None:
            data = raw
        r = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
        try:
            with self.op.open(r, timeout=60) as resp:
                ctype = resp.headers.get("Content-Type", "")
                payload = resp.read()
                if "json" in ctype:
                    return resp.status, json.loads(payload.decode() or "{}")
                return resp.status, payload
        except urllib.error.HTTPError as e:
            payload = e.read()
            try:
                return e.code, json.loads(payload.decode() or "{}")
            except Exception:
                return e.code, payload

    def upload(self, path, files):
        """files: [(filename, bytes)]"""
        boundary = "----dsh" + uuid.uuid4().hex
        parts = []
        for name, content in files:
            parts.append(f"--{boundary}\r\n".encode())
            parts.append(
                f'Content-Disposition: form-data; name="files"; filename="{name}"\r\n'.encode()
            )
            parts.append(b"Content-Type: application/octet-stream\r\n\r\n")
            parts.append(content)
            parts.append(b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        body = b"".join(parts)
        return self.req(
            "POST",
            path,
            raw=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )


c = C()
print("=== 1. 鉴权 ===")
check("未登录访问列表被拒", c.req("GET", "/api/list?path=/")[0] == 401)
status, body = c.req("POST", "/api/login", {"password": PWD})
check("正确密码登录", status == 200, f"HTTP {status}")
check("登录后能列根目录", c.req("GET", "/api/list?path=/")[0] == 200)

print("\n=== 2. 改密码门禁（必须在网盘模式）===")
status, body = c.req("POST", "/api/password", {"old_password": PWD, "new_password": "abcdefgh"})
check("未进网盘就改密码 → 403", status == 403, f"HTTP {status} {body.get('error')}")

status, body = c.req("POST", "/api/enter-netdisk")
check("进入网盘模式", status == 200 and body.get("ok"), f"HTTP {status}")

print("\n=== 3. 快速上传 ===")
sample = b"hello whale " + str(time.time()).encode()
status, body = c.upload("/api/quick-upload", [("quick-test.txt", sample)])
check("快速上传成功", status == 200 and body.get("uploaded"), f"HTTP {status}")
check("落到「快速上传」目录", body.get("dir") == "/快速上传", str(body.get("dir")))

print("\n=== 4. 网盘：文件夹 / 上传 / 列表 / 移动 / 下载 / 删除 ===")
folder = "test-" + uuid.uuid4().hex[:6]
status, body = c.req("POST", "/api/mkdir", {"path": "/", "name": folder})
check("新建文件夹", status == 200, f"HTTP {status}")

content = b"file in folder\n"
status, body = c.upload(f"/api/upload?path=/{urllib.parse.quote(folder)}", [("a.txt", content)])
check("上传到子文件夹", status == 200 and body.get("uploaded"), f"HTTP {status}")

status, body = c.req("GET", f"/api/list?path=/{urllib.parse.quote(folder)}")
names = [e["name"] for e in body.get("entries", [])]
check("子文件夹里有 a.txt", "a.txt" in names, str(names))

status, body = c.req("POST", "/api/move", {"path": f"/{folder}/a.txt", "to": "/"})
check("把文件移到根目录", status == 200, f"HTTP {status}")

status, body = c.req("GET", "/api/list?path=/")
names = [e["name"] for e in body.get("entries", [])]
check("根目录出现 a.txt", "a.txt" in names)

status, payload = c.req("GET", f"/api/download?path=/{urllib.parse.quote('a.txt')}")
check("下载内容正确", status == 200 and payload == content, f"HTTP {status}")

status, body = c.req("DELETE", f"/api/entry?path=/{urllib.parse.quote('a.txt')}")
check("删除文件", status == 200, f"HTTP {status}")

status, body = c.req("DELETE", f"/api/entry?path=/{urllib.parse.quote(folder)}")
check("删除文件夹", status == 200, f"HTTP {status}")

print("\n=== 5. 路径穿越防护 ===")
status, _ = c.req("GET", "/api/list?path=/../../etc")
check("拒绝 ../ 穿越", status in (400, 404), f"HTTP {status}")

print("\n=== 6. 改密码（在网盘模式内）===")
newpwd = "Tmp" + uuid.uuid4().hex[:8]
status, body = c.req("POST", "/api/password", {"old_password": "wrong-old", "new_password": newpwd})
check("原密码错被拒", status == 401 and isinstance(body.get("remaining"), int),
      f"HTTP {status} remaining={body.get('remaining')}")

status, body = c.req("POST", "/api/password", {"old_password": PWD, "new_password": "abc"})
check("新密码太短被拒", status == 400, f"HTTP {status}")

status, body = c.req("POST", "/api/password", {"old_password": PWD, "new_password": newpwd})
check("网盘内改密码成功", status == 200, f"HTTP {status}")

c2 = C()
check("旧密码失效", c2.req("POST", "/api/login", {"password": PWD})[0] == 401)
check("新密码可登录", c2.req("POST", "/api/login", {"password": newpwd})[0] == 200)

# 改回去
c2.req("POST", "/api/enter-netdisk")
status, _ = c2.req("POST", "/api/password", {"old_password": newpwd, "new_password": PWD})
check("改回原密码", status == 200, f"HTTP {status}")

print(f"\n结果：通过 {OK} 项，失败 {FAIL} 项")
sys.exit(0 if FAIL == 0 else 1)
