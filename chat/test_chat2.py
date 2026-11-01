#!/usr/bin/env python3
"""
验证新功能：
  A. 多对话 —— 两个对话的上下文必须互相独立
  B. 改密码 —— 原密码校验、长度校验、改完能用新密码登录
  C. 连续 5 次错密码 —— 锁定

用法：
  set -a; . /opt/hopzz-chat/.env; set +a
  /opt/hopzz-chat/venv/bin/python /root/test_chat2.py
结束后请执行 unlock.sh 解锁（脚本会提示）。
"""
import asyncio
import http.cookiejar
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = os.getenv("CHAT_BASE", "https://chat.hopzz.top")
PASSWORD = os.getenv("CHAT_PASSWORD", "")
CTX = ssl.create_default_context()
OK = 0
FAIL = 0


def check(name, cond, detail=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  [OK]   {name} {detail}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {detail}")


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            urllib.request.HTTPSHandler(context=CTX),
        )

    def req(self, method, path, body=None, timeout=25):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(
            BASE + path, data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with self.opener.open(r, timeout=timeout) as resp:
                raw = resp.read().decode() or "{}"
                try:
                    return resp.status, json.loads(raw)
                except json.JSONDecodeError:
                    return resp.status, {"raw": raw}
        except urllib.error.HTTPError as e:
            raw = e.read().decode() or "{}"
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, {"raw": raw}

    def login(self, password):
        return self.req("POST", "/api/login", {"password": password})


async def ask(conv_id, text, cookie):
    """在指定对话里发一条消息，等回答，返回回答文本。"""
    import websockets

    url = BASE.replace("https://", "wss://") + "/ws"
    async with websockets.connect(url, additional_headers={"Cookie": cookie}) as ws:
        await ws.send(json.dumps({"type": "send", "conversation_id": conv_id, "text": text}))
        deadline = time.time() + 200
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(1, deadline - time.time()))
            except asyncio.TimeoutError:
                break
            data = json.loads(raw)
            if data.get("type") != "message":
                continue
            if data.get("role") == "assistant" and data.get("conversation_id") == conv_id:
                return data.get("text", "")
    raise TimeoutError("等回答超时")


async def main():
    c = Client()
    status, body = c.login(PASSWORD)
    check("用正确密码登录", status == 200, f"HTTP {status}")
    if status != 200:
        raise SystemExit("登录失败，后面没法测")

    cookie = "; ".join(f"{j.name}={j.value}" for j in c.jar)

    print("\n=== A. 多对话上下文隔离 ===")
    s1, b1 = c.req("POST", "/api/conversations", {})
    s2, b2 = c.req("POST", "/api/conversations", {})
    check("新建对话 1", s1 == 200 and b1.get("conversation"), f"HTTP {s1}")
    check("新建对话 2", s2 == 200 and b2.get("conversation"), f"HTTP {s2}")
    conv_a = b1["conversation"]["id"]
    conv_b = b2["conversation"]["id"]

    print("  → 对话A：让它记住数字 41")
    reply_a1 = await ask(conv_a, "请记住这个数字：41。只要回复 OK 就行。", cookie)
    print(f"     A 回答: {reply_a1[:80]}")

    print("  → 对话B：问它那个数字（应该不知道）")
    reply_b = await ask(conv_b, "我刚才让你记的数字是多少？不知道就直接说不知道。", cookie)
    print(f"     B 回答: {reply_b[:80]}")
    check("对话B 不知道对话A 的内容（上下文隔离）", "41" not in reply_b)

    print("  → 对话A：再问一次（应该记得）")
    reply_a2 = await ask(conv_a, "我刚才让你记的数字是多少？直接回答数字。", cookie)
    print(f"     A 回答: {reply_a2[:80]}")
    check("对话A 记得自己说过 41", "41" in reply_a2)

    # 历史接口
    s, b = c.req("GET", f"/api/conversations/{conv_a}/messages?limit=50")
    check("对话A 历史接口", s == 200 and len(b.get("messages", [])) >= 4, f"{len(b.get('messages', []))} 条")
    s, b = c.req("GET", f"/api/conversations/{conv_b}/messages?limit=50")
    check("对话B 历史接口", s == 200 and len(b.get("messages", [])) == 2, f"{len(b.get('messages', []))} 条")

    s, b = c.req("GET", "/api/conversations")
    check("对话列表按更新时间倒序", s == 200 and b["conversations"][0]["id"] == conv_a,
          f"首个={b['conversations'][0]['title'] if b.get('conversations') else '空'}")
    check("对话标题自动取自首条消息", b["conversations"][0]["title"].startswith("请记住") or
          any(x["title"].startswith("请记住") for x in b["conversations"]),
          f"标题={[x['title'] for x in b['conversations']]}")

    print("\n=== B. 改密码 ===")
    s, b = c.req("POST", "/api/password", {"old_password": "definitely-wrong", "new_password": "abcdefgh"})
    check("原密码错被拒", s == 401 and b.get("remaining") == 4, f"HTTP {s} remaining={b.get('remaining')}")

    s, b = c.req("POST", "/api/password", {"old_password": PASSWORD, "new_password": "abc"})
    check("新密码太短被拒", s == 400, f"HTTP {s} {b.get('error')}")

    newpwd = "TestPwd-" + str(int(time.time()))[-6:]
    s, b = c.req("POST", "/api/password", {"old_password": PASSWORD, "new_password": newpwd})
    check("改密码成功", s == 200, f"HTTP {s}")

    c2 = Client()
    s, b = c2.login(PASSWORD)
    check("旧密码已失效", s == 401, f"HTTP {s}")
    s, b = c2.login(newpwd)
    check("新密码能登录", s == 200, f"HTTP {s}")

    # 改回去
    s, b = c.req("POST", "/api/password", {"old_password": newpwd, "new_password": PASSWORD})
    check("改回原密码", s == 200, f"HTTP {s}")

    print("\n=== C. 连续 5 次错密码 → 锁定 ===")
    c3 = Client()
    codes = []
    for i in range(5):
        s, b = c3.login("wrong-password-" + str(i))
        codes.append(s)
        print(f"     第 {i+1} 次: HTTP {s} {b.get('error','')} remaining={b.get('remaining')}")
    check("前 4 次返回 401，第 5 次返回 429", codes[:4] == [401, 401, 401, 401] and codes[4] == 429, str(codes))

    s, b = c3.login(PASSWORD)
    check("锁定后即使密码正确也被拒", s == 429, f"HTTP {s} retry_after={b.get('retry_after')}")

    print(f"\n结果：通过 {OK} 项，失败 {FAIL} 项")
    print("!! 现在账号处于锁定状态，跑完请执行 unlock 解锁")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
