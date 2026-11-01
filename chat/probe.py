#!/usr/bin/env python3
"""探针：向插件发一个请求，精简打印结果。"""
import asyncio
import http.cookiejar
import json
import os
import ssl
import sys
import urllib.request

BASE = os.getenv("CHAT_BASE", "https://chat.hopzz.top")
PWD = os.getenv("CHAT_PASSWORD", "")
ACTION = sys.argv[1] if len(sys.argv) > 1 else "debug"
if ACTION == "history":
    PAYLOAD = {"sessionId": sys.argv[2]} if len(sys.argv) > 2 else {}
else:
    PAYLOAD = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}


def login() -> str:
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    )
    req = urllib.request.Request(
        BASE + "/api/login",
        data=json.dumps({"password": PWD}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with op.open(req, timeout=15) as r:
        print("login:", r.status)
    return "; ".join(f"{c.name}={c.value}" for c in jar)


def show(data, depth=0, maxitems=12):
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                if isinstance(v, list):
                    print("  " * depth + f"{k}: [{len(v)} 项]")
                    for item in v[:maxitems]:
                        print("  " * (depth + 1) + json.dumps(item, ensure_ascii=False)[:300])
                else:
                    print("  " * depth + f"{k}:")
                    show(v, depth + 1)
            else:
                print("  " * depth + f"{k}: {json.dumps(v, ensure_ascii=False)[:200]}")
    else:
        print(json.dumps(data, ensure_ascii=False)[:500])


async def main():
    import websockets

    cookie = login()
    url = BASE.replace("https://", "wss://") + "/ws"
    async with websockets.connect(url, additional_headers={"Cookie": cookie}) as ws:
        await ws.send(json.dumps({"type": "req", "id": "p1", "action": ACTION, "payload": PAYLOAD}))
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=180)
            data = json.loads(raw)
            if data.get("type") == "ev":
                print("ev:", json.dumps(data, ensure_ascii=False)[:200])
                continue
            if data.get("type") == "res" and data.get("id") == "p1":
                print("\n===== 结果 =====")
                if data.get("error"):
                    print("ERROR:", data["error"])
                else:
                    show(data.get("data"))
                return


asyncio.run(main())
