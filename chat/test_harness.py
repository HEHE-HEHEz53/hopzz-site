#!/usr/bin/env python3
"""验证 Harness 镜像流程：snapshot → create → send → history"""
import asyncio
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.request

BASE = os.getenv("CHAT_BASE", "https://chat.hopzz.top")
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


def login():
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
        assert r.status == 200
    return "; ".join(f"{c.name}={c.value}" for c in jar)


class Session:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0

    async def call(self, action, payload=None, timeout=240):
        self.n += 1
        rid = f"t{self.n}"
        await self.ws.send(json.dumps({"type": "req", "id": rid, "action": action, "payload": payload or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = await asyncio.wait_for(self.ws.recv(), timeout=max(1, deadline - time.time()))
            data = json.loads(raw)
            if data.get("type") == "ev":
                print(f"     ev: {data.get('kind')} session={str(data.get('sessionId'))[:18]}")
                continue
            if data.get("type") == "res" and data.get("id") == rid:
                if data.get("error"):
                    raise RuntimeError(data["error"])
                return data.get("data")
        raise TimeoutError(action)


async def main():
    import websockets

    cookie = login()
    url = BASE.replace("https://", "wss://") + "/ws"
    async with websockets.connect(url, additional_headers={"Cookie": cookie}) as raw_ws:
        s = Session(raw_ws)

        print("=== 1. snapshot（真实 Harness 数据）===")
        snap = await s.call("snapshot")
        ws_list = snap.get("workspaces") or []
        sessions = snap.get("sessions") or []
        info = snap.get("info") or {}
        check("拿到工作区列表", len(ws_list) > 0, f"{len(ws_list)} 个")
        check("拿到会话列表", len(sessions) > 0, f"{len(sessions)} 个")
        check("拿到模型信息", bool(info.get("model")), str(info.get("model")))
        check("拿到模式列表", len(info.get("presets") or []) > 0, f"{len(info.get('presets'))} 个")
        check("拿到插件列表", len(info.get("bundles") or []) > 0, f"{len(info.get('bundles'))} 个")

        print("  工作区：", [w["title"] for w in ws_list])
        print("  前 5 个会话：")
        for x in sessions[:5]:
            print(f"     - {x['title'][:28]!r} 项目={x['workspaceId'][:8] or '(无)'} 运行中={x['running']} 模式={x['preset']}")

        # 历史：挑一个非空会话
        target = next((x for x in sessions if not x["blank"]), None)
        if target:
            print(f"\n=== 2. history（{target['title'][:20]}）===")
            hist = await s.call("history", {"sessionId": target["id"]})
            msgs = hist.get("messages") or []
            check("读到历史消息", len(msgs) > 0, f"{len(msgs)} 条")
            for m in msgs[:6]:
                print(f"     [{m['role']}] {m['text'][:60]!r}")

        print("\n=== 3. create（新建真实会话）===")
        created = await s.call("create", {"cwd": r"D:\DSH\work"})
        new_id = created.get("sessionId")
        check("新建会话返回 id", bool(new_id), new_id or "")
        print(f"     新会话：{new_id}")

        print("\n=== 4. send（往新会话发消息）===")
        t0 = time.time()
        await s.call("send", {"sessionId": new_id, "text": "只回答两个字：收到"})
        print(f"     耗时 {time.time() - t0:.1f}s")

        print("\n=== 5. history（新会话应有 2 条）===")
        hist2 = await s.call("history", {"sessionId": new_id})
        msgs2 = hist2.get("messages") or []
        check("新会话有问答记录", len(msgs2) >= 2, f"{len(msgs2)} 条")
        for m in msgs2:
            print(f"     [{m['role']}] {m['text'][:80]!r}")

    print(f"\n结果：通过 {OK} 项，失败 {FAIL} 项")
    return 0 if FAIL == 0 else 1


sys.exit(asyncio.run(main()))
