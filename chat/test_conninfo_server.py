#!/usr/bin/env python3
"""用服务器自己的密钥签一个合法 cookie，验证 /api/conninfo（不改任何人的密码）"""
import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
import urllib.request

env = {}
for line in open("/opt/hopzz-chat/.env", encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v

secret = env["COOKIE_SECRET"]
conn = sqlite3.connect("/opt/hopzz-chat/data/chat.db")
ver = int(conn.execute("SELECT value FROM meta WHERE key='pwd_ver'").fetchone()[0])
expires = int(time.time()) + 3600
payload = f"ok:{expires}:{ver}"
mac = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
cookie = f"{expires}.{ver}.{mac}"

req = urllib.request.Request(
    "https://ai.hopzz.top/api/conninfo",
    headers={"Cookie": f"hopzz_chat={cookie}", "User-Agent": "dsh-test"},
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        status = r.status
        data = json.loads(r.read().decode())
except urllib.error.HTTPError as e:
    status = e.code
    data = json.loads(e.read().decode() or "{}")

print(f"conninfo HTTP {status}")
print(json.dumps(data, ensure_ascii=False, indent=2)[:900])

if data.get("ok"):
    cs = data["connectString"]
    body = cs.split(".", 1)[1]
    padded = body + "=" * (-len(body) % 4)
    obj = json.loads(base64.urlsafe_b64decode(padded).decode())
    print("\n连接字符串解出来的内容：")
    print(json.dumps(obj, ensure_ascii=False, indent=2))
    ok = obj.get("url") == data.get("serverUrl") and obj.get("token") == data.get("agentToken")
    print("\n一致性:", "OK" if ok else "不一致")
