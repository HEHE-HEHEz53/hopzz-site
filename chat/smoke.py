#!/usr/bin/env python3
"""快速冒烟测试：登录 + 兼容接口 + 对话接口"""
import http.cookiejar, json, os, ssl, urllib.error, urllib.request

BASE = os.getenv("CHAT_BASE", "https://chat.hopzz.top")
PWD = os.getenv("CHAT_PASSWORD", "")
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar),
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
)


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with opener.open(r, timeout=20) as resp:
            return resp.status, resp.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


print("GET  /            ->", req("GET", "/")[0])
print("GET  /api/me      ->", req("GET", "/api/me")[0])
print("POST /api/login   ->", req("POST", "/api/login", {"password": PWD})[0])
print("GET  /api/me      ->", req("GET", "/api/me")[0])
print("GET  /api/conversations        ->", req("GET", "/api/conversations")[0])
print("GET  /api/history (兼容旧前端) ->", req("GET", "/api/history")[0])
print("GET  /api/history 内容 ->", req("GET", "/api/history")[1])
