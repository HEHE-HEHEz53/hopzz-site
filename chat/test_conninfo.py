#!/usr/bin/env python3
"""验证：首次设置密码接口 / 连接参数接口 / 连接字符串格式"""
import http.cookiejar
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

BASE = os.getenv("CHAT_BASE", "https://ai.hopzz.top")
PWD = os.getenv("CHAT_PASSWORD", "")
OK = FAIL = 0


def check(name, cond, detail=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  [OK]   {name} {detail}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {detail}")


def make():
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    )

    def req(method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(
            BASE + path, data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with op.open(r, timeout=30) as resp:
                return resp.status, json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw or "{}")
            except Exception:
                return e.code, {"raw": raw}

    return req


fetch = make()

print("=== 1. 首次设置状态（已设过密码的库）===")
status, body = fetch("GET", "/api/setup-state")
check("setup-state 可匿名访问", status == 200, f"HTTP {status}")
check("needsSetup = false（已有密码）", body.get("needsSetup") is False, str(body))

print("\n=== 2. 已设密码时不允许重复设置 ===")
status, body = fetch("POST", "/api/setup", {"password": "abcdefgh"})
check("重复设置被拒 → 409", status == 409, f"HTTP {status} {body.get('error')}")

print("\n=== 3. 登录 + 连接参数 ===")
status, body = fetch("POST", "/api/login", {"password": PWD})
check("登录成功", status == 200, f"HTTP {status}")

status, body = fetch("GET", "/api/conninfo")
check("conninfo 拿到", status == 200 and body.get("ok"), f"HTTP {status}")
if status == 200:
    url = body.get("serverUrl", "")
    token = body.get("agentToken", "")
    cs = body.get("connectString", "")
    print(f"     serverUrl     = {url}")
    print(f"     agentToken    = {token[:8]}...{token[-4:]}（长度 {len(token)}）")
    print(f"     connectString = {cs[:40]}...（长度 {len(cs)}）")
    check("serverUrl 是 wss:// 且以 /agent-ws 结尾",
          url.startswith("wss://") and url.endswith("/agent-ws"))
    check("agentToken 是 64 位十六进制", len(token) == 64 and all(c in "0123456789abcdef" for c in token))
    check("connectString 以 whale1. 开头", cs.startswith("whale1."))

    # 解回来验证内容一致
    import base64
    payload = cs.split(".", 1)[1]
    padded = payload + "=" * (-len(payload) % 4)
    obj = json.loads(base64.urlsafe_b64decode(padded).decode())
    check("连接字符串能解回同样的地址和令牌",
          obj.get("url") == url and obj.get("token") == token, str(obj.get("v")))

print("\n=== 4. 未登录访问 conninfo ===")
status, _ = make()("GET", "/api/conninfo")
check("未登录被拒 → 401", status == 401, f"HTTP {status}")

print(f"\n结果：通过 {OK} 项，失败 {FAIL} 项")
sys.exit(0 if FAIL == 0 else 1)
