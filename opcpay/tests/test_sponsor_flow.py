#!/usr/bin/env python3
"""
赞助接口流程自检（不碰真实一人付、不花钱）
=========================================

做法：
  1. 在 127.0.0.1:8103 起一个「假桥服务」，按脚本返回各种上游状态；
  2. 用 /opt/hopzz-api/venv 起一个独立的 uvicorn（端口 8011，临时 sqlite），
     让它把 BRIDGE_URL 指到假桥；
  3. 只通过 HTTP 打新加的 /api/sponsor/* 路由，断言幂等与交付规则。

覆盖：
  - 套餐只透出真实字段，隐藏测试档，能力位只给三项
  - 客户端伪造 user_id 无效，userId 由服务端 Cookie 决定
  - 购买：业务编号先落库；同一 action_id 重试沿用同一编号，只建一行
  - 购买：UNKNOWN 后重试用同一编号拿到 READY
  - 购买：入口过期（PURCHASE_ENTRY_EXPIRED）后必须换新意图
  - 核销：SUCCEEDED + confirmed 且数量/单位一致才算交付
  - 核销：PROCESSING / 未确认 / 数量不符 都不交付
  - 核销：已确认的重试直接复用结果，不重复调上游
  - 权益：remaining=0 不算开放，>0 才算

用法（在服务器上）：
    /opt/hopzz-api/venv/bin/python opcpay/tests/test_sponsor_flow.py
可选环境变量：
    HOPZZ_APP_DIR  默认 /opt/hopzz-api/app
    HOPZZ_VENV    默认 /opt/hopzz-api/venv
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.environ.get("HOPZZ_APP_DIR", "/opt/hopzz-api/app")
VENV = os.environ.get("HOPZZ_VENV", "/opt/hopzz-api/venv")
HIDDEN_SKU = "SKU-HIDDEN-TEST"

passed = 0
failed = 0
log: list[str] = []


def check(condition: bool, label: str) -> bool:
    global passed, failed
    if condition:
        passed += 1
        log.append(f"  PASS  {label}")
    else:
        failed += 1
        log.append(f"  FAIL  {label}")
    return bool(condition)


def pick_port() -> int:
    """找一个当前空闲的本机端口（用 0 让系统选，再放掉）。"""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


# ---------------------------------------------------------------- 假桥
class FakeBridge(BaseHTTPRequestHandler):
    """按 plan 里的队列返回响应；队列只剩一个时一直重复最后一个。"""

    plan: dict[str, list[tuple[int, dict]]] = {}
    calls: list[dict] = []
    lock = threading.Lock()

    def log_message(self, *args):  # 静音
        pass

    def _handle(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {"__bad_json__": raw.decode("utf-8", "replace")}
        with FakeBridge.lock:
            FakeBridge.calls.append(
                {
                    "method": method,
                    "path": parsed.path,
                    "query": urllib.parse.parse_qs(parsed.query),
                    "body": body,
                }
            )
            queue = FakeBridge.plan.get(parsed.path)
            if queue:
                # 队列里有多个时逐个消费，只剩一个时一直重复它
                item = queue.pop(0) if len(queue) > 1 else queue[0]
            else:
                item = None
        if item is None:
            status, payload = 404, {
                "ok": False,
                "error": "假桥没有为这个路径准备响应",
                "error_code": "NO_PLAN",
            }
        elif isinstance(item, tuple):
            status, payload = item  # (HTTP 状态码, 响应体)
        else:
            status, payload = 200, item  # 只写了响应体，默认 200
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        self._handle("GET")

    def do_POST(self) -> None:
        self._handle("POST")


def calls_for(path: str) -> list[dict]:
    with FakeBridge.lock:
        return [call for call in FakeBridge.calls if call["path"] == path]


# ---------------------------------------------------------------- HTTP 客户端
class Client:
    def __init__(self, base: str) -> None:
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def request(self, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            self.base + path, data=data, headers=headers, method=method
        )
        try:
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read() or b"{}")

    def get(self, path: str) -> tuple[int, dict]:
        return self.request("GET", path)

    def post(self, path: str, payload: dict) -> tuple[int, dict]:
        return self.request("POST", path, payload)


# ---------------------------------------------------------------- 测试数据
PRODUCT = {
    "ok": True,
    "data": {
        "capability_status": "ENABLED",
        "product_name": "HEHEz53赞助",
        "billing_mode": "QUANTITY",
        "quota_unit": "COUNT",
        "charging_options": [
            {
                "sku_id": "SKU-B",
                "plan_id": "PLAN-B",
                "display_name": "普通赞助",
                "billing_mode": "QUANTITY",
                "price": "6.00",
                "currency": "CNY",
                "price_version": 1,
                "entitlement_rule": "QUOTA",
                "quota_unit": "COUNT",
                "quota_amount": 50,
            },
            {
                "sku_id": "SKU-A",
                "plan_id": "PLAN-A",
                "display_name": "赞助",
                "billing_mode": "QUANTITY",
                "price": "1.00",
                "currency": "CNY",
                "price_version": 1,
                "entitlement_rule": "QUOTA",
                "quota_unit": "COUNT",
                "quota_amount": 100,
            },
            {
                "sku_id": HIDDEN_SKU,
                "plan_id": "PLAN-H",
                "display_name": "测试",
                "billing_mode": "QUANTITY",
                "price": "1000.00",
                "currency": "CNY",
                "price_version": 1,
                "entitlement_rule": "QUOTA",
                "quota_unit": "COUNT",
                "quota_amount": 1,
            },
        ],
    },
}

CAPABILITIES = {
    "ok": True,
    "data": {
        "api_version": "1.1",
        "provider_configured": True,
        "capabilities": {
            "purchase_entry": True,
            "entitlement_query": True,
            "consumption": True,
            "transaction_query": False,
            "refund": False,
            "bills": False,
        },
    },
}


def access_payload(remaining: int) -> dict:
    return {
        "ok": True,
        "data": {
            "access_granted": remaining > 0,
            "requires_consumption": True,
            "quota_unit": "COUNT",
            "total": max(remaining, 0),
            "used": 0,
            "remaining": remaining,
            "as_of_time": "2026-11-08 10:00:00",
        },
    }


READY = {
    "ok": True,
    "data": {
        "status": "READY",
        "idempotency_key": "pur-from-fake",
        "purchase_url": "alipays://platformapi/startapp?appId=FAKE",
        "purchase_qr_code": "https://mobilecodec.alipay.com/show.htm?code=FAKE",
        "expire_time": "2026-11-09 23:59:59",
    },
}

UNKNOWN = {"ok": True, "data": {"status": "UNKNOWN", "confirmed": False}}


def consume_payload(status: str, confirmed: bool, consumed: int, unit: str = "COUNT") -> dict:
    return {
        "ok": True,
        "data": {
            "status": status,
            "confirmed": confirmed,
            "consume_status": status,
            "idempotency_key": "use-from-fake",
            "quota_unit": unit,
            "consumed": consumed,
            "remaining": 4,
        },
    }


# ---------------------------------------------------------------- 启动
def wait_http(url: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:  # noqa: BLE001 - 启动期什么错都可能
            time.sleep(0.25)
    return False


def main() -> int:
    if not os.path.isdir(APP_DIR):
        print(f"找不到应用目录：{APP_DIR}（用 HOPZZ_APP_DIR 指定）")
        return 2
    app_port = pick_port()

    tmpdir = tempfile.mkdtemp(prefix="hopzz-sponsor-test-")
    db_path = os.path.join(tmpdir, "test.db")
    bridge_thread = None
    app_proc = None
    try:
        # ---- 假桥（端口交给系统分配，避免撞上服务器上别人的服务）
        FakeBridge.plan = {
            "/product": [PRODUCT],
            "/capabilities": [CAPABILITIES],
            "/access": [access_payload(0)],
            "/purchase": [READY],
            "/consume": [consume_payload("SUCCEEDED", True, 1)],
        }
        srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeBridge)
        bridge_port = int(srv.server_address[1])
        bridge_thread = threading.Thread(target=srv.serve_forever, daemon=True)
        bridge_thread.start()

        # ---- 独立 uvicorn（临时库、指向假桥）
        env = dict(os.environ)
        env.update(
            {
                "BRIDGE_URL": f"http://127.0.0.1:{bridge_port}",
                "DB_PATH": db_path,
                "UID_SECRET_PATH": os.path.join(tmpdir, ".uid_secret"),
                "COOKIE_SECURE": "0",
                "SPONSOR_HIDDEN_SKUS": HIDDEN_SKU,
                "DEVICE_TOKEN": "test-token",
            }
        )
        app_proc = subprocess.Popen(
            [
                os.path.join(VENV, "bin", "uvicorn"),
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(app_port),
                "--workers",
                "1",
                "--log-level",
                "warning",
            ],
            cwd=APP_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{app_port}"
        if not wait_http(base + "/api/health"):
            print("应用没起来：")
            print((app_proc.stderr.read() or b"").decode("utf-8", "replace")[-2000:])
            return 2

        client = Client(base)

        # ================================================ 1. 套餐与能力位
        print("\n[1] 套餐：只透出真实字段 / 隐藏测试档 / 能力位只给三项")
        status, product = client.get("/api/sponsor/product")
        check(status == 200 and product.get("ok") is True, "product 返回 200 且 ok")
        plans = product.get("plans") or []
        check([p["sku_id"] for p in plans] == ["SKU-A", "SKU-B"], "只返回未隐藏的两档且按价格升序")
        check(all(p["sku_id"] != HIDDEN_SKU for p in plans), "测试档被 SPONSOR_HIDDEN_SKUS 隐藏")
        check(plans and plans[0]["price"] == "1.00", "价格来自上游原样透传，不是写死的")
        check(
            set((product.get("capabilities") or {}).keys())
            == {"purchase_entry", "entitlement_query", "consumption"},
            "能力位只透出已验证的三项，未开放能力不出现",
        )
        check(product.get("purchase_available") is True, "purchase_available=true（capability=ENABLED）")

        # ================================================ 2. user_id 来源
        print("\n[2] 用户 ID：由服务端 Cookie 决定，客户端传不进来")
        FakeBridge.plan["/purchase"] = [READY]
        action_a = "11111111-1111-4111-8111-111111111111"
        status, resp = client.post(
            "/api/sponsor/purchase",
            {"sku_id": "SKU-A", "action_id": action_a, "user_id": "attacker-chosen"},
        )
        first_calls = calls_for("/purchase")
        check(status == 200 and resp.get("ok") is True, "购买入口创建成功")
        check(len(first_calls) == 1, "上游 purchase 只被调一次")
        upstream_user = first_calls[0]["body"].get("userId") if first_calls else None
        check(
            isinstance(upstream_user, str)
            and upstream_user.startswith("u_")
            and len(upstream_user) == 34,
            "上游收到的 userId 是服务端生成的匿名 ID",
        )
        check(upstream_user != "attacker-chosen", "客户端伪造的 user_id 被忽略")
        check(resp.get("purchase_url") == READY["data"]["purchase_url"], "purchase_url 原样返回给前端")

        # ================================================ 3. 同一 action_id 幂等
        print("\n[3] 幂等：同一 action_id 重试沿用同一业务编号，只落一行")
        key_first = first_calls[0]["body"]["idempotencyKey"] if first_calls else None
        status, resp2 = client.post(
            "/api/sponsor/purchase", {"sku_id": "SKU-A", "action_id": action_a}
        )
        all_calls = calls_for("/purchase")
        keys = [call["body"].get("idempotencyKey") for call in all_calls]
        check(status == 200 and resp2.get("ok") is True, "重试仍然拿到入口")
        check(len(set(keys)) == 1 and keys[0] == key_first, "两次请求使用同一个 idempotency_key")
        with sqlite3.connect(db_path) as con:
            rows = con.execute("SELECT COUNT(*) FROM sponsor_purchase").fetchone()[0]
            key_rows = con.execute(
                "SELECT COUNT(*) FROM sponsor_purchase WHERE idempotency_key = ?", (key_first,)
            ).fetchone()[0]
        check(rows == 1, "库里只有一行购买意图（没重复建单）")
        check(key_rows == 1, "业务编号唯一")

        # ================================================ 4. UNKNOWN 后重试
        print("\n[4] 购买返回 UNKNOWN 后重试：同一编号拿到 READY")
        FakeBridge.calls.clear()
        FakeBridge.plan["/purchase"] = [UNKNOWN, READY]
        action_b = "22222222-2222-4222-8222-222222222222"
        status, r1 = client.post(
            "/api/sponsor/purchase", {"sku_id": "SKU-A", "action_id": action_b}
        )
        check(status == 200 and r1.get("ok") is False and r1.get("status") == "UNKNOWN", "第一次返回 UNKNOWN（不算成功）")
        status, r2 = client.post(
            "/api/sponsor/purchase", {"sku_id": "SKU-A", "action_id": action_b}
        )
        check(status == 200 and r2.get("ok") is True, "重试拿到了 READY 入口")
        keys_b = [c["body"].get("idempotencyKey") for c in calls_for("/purchase")]
        check(len(keys_b) == 2 and len(set(keys_b)) == 1, "UNKNOWN 重试不换号")

        # ================================================ 5. 入口过期
        print("\n[5] 购买入口过期：明确失败并要求换新意图")
        FakeBridge.calls.clear()
        FakeBridge.plan["/purchase"] = [
            (
                409,
                {
                    "ok": False,
                    "error": "原 READY 入口已过期",
                    "error_code": "PURCHASE_ENTRY_EXPIRED",
                    "retryable": False,
                },
            )
        ]
        action_c = "33333333-3333-4333-8333-333333333333"
        status, r3 = client.post(
            "/api/sponsor/purchase", {"sku_id": "SKU-A", "action_id": action_c}
        )
        check(status == 200 and r3.get("status") == "EXPIRED", "过期被标成 EXPIRED")
        FakeBridge.plan["/purchase"] = [READY]
        action_c2 = "33333333-3333-4333-8333-333333333334"
        status, r4 = client.post(
            "/api/sponsor/purchase", {"sku_id": "SKU-A", "action_id": action_c2}
        )
        keys_c = [c["body"].get("idempotencyKey") for c in calls_for("/purchase")]
        check(status == 200 and r4.get("ok") is True, "换新 action_id 后可以重新创建入口")
        check(len(keys_c) == 2 and len(set(keys_c)) == 2, "过期后用的是新业务编号")

        # ================================================ 6. 核销交付规则
        print("\n[6] 核销：只有 SUCCEEDED + confirmed + 数量/单位一致才交付")
        consume_cases = [
            (consume_payload("SUCCEEDED", True, 1), True, "SUCCEEDED+confirmed 且数量一致 -> 交付"),
            (consume_payload("PROCESSING", False, 0), False, "PROCESSING -> 不交付"),
            (consume_payload("SUCCEEDED", False, 1), False, "SUCCEEDED 但未 confirmed -> 不交付"),
            (consume_payload("SUCCEEDED", True, 2), False, "数量与请求不一致 -> 不交付"),
            (consume_payload("SUCCEEDED", True, 1, unit="POINT"), False, "单位不一致 -> 不交付"),
        ]
        for index, (payload, expected, label) in enumerate(consume_cases):
            FakeBridge.plan["/consume"] = [payload]
            action_id = f"44444444-4444-4444-8444-44444444444{index}"
            status, body = client.post(
                "/api/sponsor/consume", {"action_id": action_id, "amount": 1}
            )
            check(status == 200 and body.get("delivered") is expected, label)

        print("\n[7] 核销：已确认后重试直接复用，不重复扣")
        FakeBridge.calls.clear()
        FakeBridge.plan["/consume"] = [consume_payload("SUCCEEDED", True, 1)]
        action_ok = "55555555-5555-4555-8555-555555555555"
        client.post("/api/sponsor/consume", {"action_id": action_ok, "amount": 1})
        status, again = client.post("/api/sponsor/consume", {"action_id": action_ok, "amount": 1})
        check(status == 200 and again.get("delivered") is True, "重试仍返回 delivered=true")
        check(len(calls_for("/consume")) == 1, "第二次请求没有再打到上游（复用已确认结果）")

        # ================================================ 8. 权益判定
        print("\n[8] 权益：remaining=0 不算开放，>0 才算")
        FakeBridge.plan["/access"] = [access_payload(0)]
        status, acc0 = client.get("/api/sponsor/access")
        check(acc0.get("allowed") is False, "remaining=0 -> allowed=false")
        FakeBridge.plan["/access"] = [access_payload(5)]
        # access 有 15s 缓存，换一个新 Cookie 就是新的 user_id
        client2 = Client(base)
        status, acc5 = client2.get("/api/sponsor/access")
        check(acc5.get("allowed") is True, "remaining>0 -> allowed=true")

        # ================================================ 9. 伪造 Cookie
        print("\n[9] 伪造 Cookie：签名不对就换新身份")
        forged = "u_" + "a" * 32 + ".0123456789abcdef"
        req = urllib.request.Request(
            base + "/api/sponsor/access", headers={"Cookie": f"hopzz_uid={forged}"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            set_cookie = resp.headers.get("set-cookie") or ""
        check("hopzz_uid=" in set_cookie.lower() and forged not in set_cookie, "伪造 Cookie 被拒并重发新 ID")

        print("\n[10] 形状：购买响应不带任何凭证字段")
        status, prod = client.get("/api/sponsor/product")
        blob = json.dumps(prod, ensure_ascii=False)
        check("yrp_" not in blob and "Bearer" not in blob, "响应里没有 Key / Bearer")
    finally:
        if app_proc is not None:
            app_proc.terminate()
            try:
                app_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app_proc.kill()
        if bridge_thread is not None:
            pass
        shutil.rmtree(tmpdir, ignore_errors=True)

    print("\n".join(log))
    print(f"\n结果：{passed} 通过，{failed} 失败")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
