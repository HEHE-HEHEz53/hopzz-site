#!/usr/bin/env python3
"""
端到端测试：模拟手机浏览器登录并给 AI 发一条消息，等它回答。
用法（在服务器上）：
    set -a; . /opt/hopzz-chat/.env; set +a
    /opt/hopzz-chat/venv/bin/python /root/test_chat.py "你好，一句话介绍你自己"
"""
import asyncio
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.request

BASE = os.getenv("CHAT_BASE", "https://chat.hopzz.top")
PASSWORD = os.getenv("CHAT_PASSWORD", "")
TEXT = sys.argv[1] if len(sys.argv) > 1 else "你好，用一句话介绍你自己"
TIMEOUT = float(os.getenv("CHAT_TIMEOUT", "180"))


def login() -> str:
    jar = http.cookiejar.CookieJar()
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ctx),
    )
    body = json.dumps({"password": PASSWORD}).encode()
    req = urllib.request.Request(
        BASE + "/api/login", data=body, headers={"Content-Type": "application/json"}
    )
    with opener.open(req, timeout=15) as resp:
        print(f"[login] HTTP {resp.status} {resp.read().decode(errors='replace')}")
    cookie = "; ".join(f"{c.name}={c.value}" for c in jar)
    if not cookie:
        raise SystemExit("[login] 没拿到 cookie，登录失败")
    return cookie


async def main() -> None:
    import websockets

    cookie = login()
    url = BASE.replace("https://", "wss://").replace("http://", "ws://") + "/ws"
    print(f"[ws] 连接 {url}")
    async with websockets.connect(url, additional_headers={"Cookie": cookie}) as ws:
        await ws.send(json.dumps({"type": "send", "text": TEXT}))
        print(f"[send] {TEXT}")
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(1, deadline - time.time()))
            except asyncio.TimeoutError:
                break
            data = json.loads(raw)
            kind = data.get("type")
            if kind == "message":
                role = data.get("role")
                text = (data.get("text") or "").strip()
                print(f"[message:{role}] {text[:500]}")
                if role == "assistant":
                    print("\n===== 端到端通过：收到了 AI 的回答 =====")
                    return
            elif kind == "agent_status":
                print(f"[status] 电脑端 {data.get('state')}")
            elif kind == "typing":
                print(f"[typing] {data.get('on')}")
            elif kind == "error":
                print(f"[error] {data.get('message')}")
    print("\n===== 超时：没有等到回答 =====")
    raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
