# opcpay 赞助接入（hopzz.top）

一人付（opcpay）在本站的接入。收款走支付宝，本站不经手任何支付信息。

- 服务：`opcpay-bridge`（Node 18+，只监听 `127.0.0.1:8102`）
- 调用方：`hopzz-api`（FastAPI，`/opt/hopzz-api`）里的 `/api/sponsor/*`
- 上游：`https://ai6666.com/opcpay/api/pay/v1`（SDK `opcpay@0.3.4`）
- 前端：`hopzz.top` 的「04 赞助」区块

```
浏览器  ──/api/sponsor/*──▶  hopzz-api (127.0.0.1:8000)
                                  │  业务编号先落 sqlite，再发起写请求
                                  ▼
                          opcpay-bridge (127.0.0.1:8102)   ← Key 只在这里
                                  │
                                  ▼
                        https://ai6666.com/opcpay/api/pay/v1
```

API Key **只**存在服务器 `/opt/opcpay-bridge/.env`（`600`，属主 `www-data`），
不进仓库、不进前端、不进日志；Python 侧和浏览器都接触不到 Key。

---

## 1. 目录

| 路径 | 作用 |
| --- | --- |
| `server.mjs` | 桥服务：对 SDK 的薄封装，5 个业务路由 + 2 个恢复查询 + `/health` |
| `opcpay-bridge.service` | systemd 单元（`User=www-data`，加固项已开） |
| `install.sh` | 服务器安装脚本（幂等，不会覆盖已有 `.env`） |
| `.env.example` | 环境变量样例（不含真实值） |
| `scripts/readonly-query.mjs` | 只读核对：只调 `capabilities()` / `product()` |
| `tests/test_sponsor_flow.py` | 假桥 + 临时库的端到端自检（不发真实请求、不花钱） |

主站侧改动：`deploy/api/main.py`（`/api/sponsor/*`）、`deploy/site/*`（赞助区块）。

---

## 2. 上游真实返回（只读实测，原样记录）

采集时间：**2026-11-08**，命令：`node scripts/readonly-query.mjs`
（`capabilities()` + `product()`，未做任何写操作。）

### 2.1 `GET /capabilities`

```json
{
  "api_version": "1.1",
  "capabilities": {
    "automatic_renewal": false,
    "bills": false,
    "consumption": true,
    "consumption_list": true,
    "consumption_reversal": false,
    "entitlement_monitoring": true,
    "entitlement_query": true,
    "purchase_entry": true,
    "purchase_request_list": true,
    "purchase_request_query": true,
    "refund": false,
    "refund_query": false,
    "transaction_list": false,
    "transaction_query": false,
    "webhooks": true
  },
  "limitations": [
    "购买入口请求不代表已付款订单；权益通知不代表单笔支付成功通知。",
    "权益后台监测只覆盖已生成购买入口的用户，持续24小时；其他变化由 /access 查询触发。",
    "交易、退款和账单能力等待即刻收平台提供对应接口及授权。"
  ],
  "provider_configured": true,
  "webhook_events": [
    "entitlement.observed",
    "entitlement.updated",
    "consumption.succeeded",
    "consumption.failed"
  ]
}
```

**未开放**（`false`，前端一律不展示、不当作可用能力）：
`transaction_query`、`transaction_list`、`refund`、`refund_query`、`bills`、
`automatic_renewal`、`consumption_reversal`。

### 2.2 `GET /product`

```json
{
  "billing_mode": "QUANTITY",
  "capability_status": "ENABLED",
  "charging_options": [
    {
      "billing_mode": "QUANTITY",
      "currency": "CNY",
      "display_name": "普通赞助",
      "entitlement_rule": "QUOTA",
      "plan_id": "PI0806000213853169",
      "price": "6.00",
      "price_version": 1,
      "quota_amount": 50,
      "quota_unit": "COUNT",
      "sku_id": "S0806000213861213"
    },
    {
      "billing_mode": "QUANTITY",
      "currency": "CNY",
      "display_name": "赞助",
      "entitlement_rule": "QUOTA",
      "plan_id": "PI0806000213853170",
      "price": "1.00",
      "price_version": 1,
      "quota_amount": 100,
      "quota_unit": "COUNT",
      "sku_id": "S0806000213861214"
    },
    {
      "billing_mode": "QUANTITY",
      "currency": "CNY",
      "display_name": "特别666的赞助",
      "entitlement_rule": "QUOTA",
      "plan_id": "PI0806000213853171",
      "price": "10.00",
      "price_version": 1,
      "quota_amount": 10,
      "quota_unit": "COUNT",
      "sku_id": "S0806000213861215"
    },
    {
      "billing_mode": "QUANTITY",
      "currency": "CNY",
      "display_name": "测试",
      "entitlement_rule": "QUOTA",
      "plan_id": "PI0806000213853172",
      "price": "1000.00",
      "price_version": 1,
      "quota_amount": 1,
      "quota_unit": "COUNT",
      "sku_id": "S0806000213861216"
    }
  ],
  "product_icon_url": "https://ai6666.com/media/products/native/0c94ea889553461b015cbb104fa1bc8e8ce494adc8cf99acfc337e07eff233d6.png",
  "product_name": "HEHEz53赞助",
  "quota_unit": "COUNT",
  "status_version": "1"
}
```

### 2.3 解读

| 项目 | 真实值 |
| --- | --- |
| 商品名 | `HEHEz53赞助` |
| 收费状态 | `capability_status = ENABLED`（允许新增购买） |
| 收费模式 | `billing_mode = QUANTITY`（次数包），`quota_unit = COUNT` |
| 权益规则 | `entitlement_rule = QUOTA`：每次购买**增加**次数，用掉时须 `consume` 核销 |

| 档位 | sku_id | 价格 | 购买增加的次数 |
| --- | --- | --- | --- |
| 赞助 | `S0806000213861214` | `1.00` CNY | 100 |
| 普通赞助 | `S0806000213861213` | `6.00` CNY | 50 |
| 特别666的赞助 | `S0806000213861215` | `10.00` CNY | 10 |
| 测试 | `S0806000213861216` | `1000.00` CNY | 1 |

> 价格和数量全部来自上游，页面不写死任何金额。
> 上面四档的「价格 / 次数」比例是商户在一人付控制台里配置的**真实配置**，本站原样读取，不替用户改。

**关于「测试」档（¥1000）**：它是控制台里的测试商品，公开页面上不适合出现。
处理方式是**不改代码硬过滤名字**，而是在服务器 `hopzz-api` 的 `.env` 里精确排除这个 SKU：

```ini
SPONSOR_HIDDEN_SKUS=S0806000213861216
```

前端于是只显示三档（¥1.00 / ¥6.00 / ¥10.00），服务端也会拒绝为该 SKU 创建购买入口。
**建议**：确认后到一人付控制台把「测试」档下架或删除，然后把这行配置去掉。

---

## 3. 各收费模式怎么用（按官方文档）

当前项目是 `QUANTITY`，走第三条；前两条是给以后改收费模式时留的说明。

| 模式 | 判断开放的依据 |
| --- | --- |
| `ONE_TIME`（买断）/ `ONE_TIME_DURATION`（时长） | `/access` 返回 `access_granted=true` **且** `decision=ALLOW`；`DENY` 不可新建购买入口 |
| `QUANTITY`（次数 `COUNT` / 积分 `POINT`） | `/access` 返回 `remaining`；**余额足够不代表交付**，必须正式 `consume`，只有 `status=SUCCEEDED` + `confirmed=true` 且请求号/数量/单位一致才交付 |

永远不成立的等价关系：

- `purchase` 返回 `READY` ≠ 已付款（只是入口有效）
- 打开支付宝 / 扫码 / 从支付宝回跳 ≠ 已付款
- 余额够 ≠ 已核销 / 可交付

付款成功后**只能**通过 `/access` 确认权益变化。

---

## 4. 桥服务接口（`127.0.0.1:8102`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 探活（不含任何凭证） |
| GET | `/capabilities` | 只读：接口能力 |
| GET | `/product` | 只读：套餐与收费状态 |
| GET | `/access?userId=` | 只读：权益 / 剩余额度 |
| GET | `/purchase/query?userId=&idempotencyKey=` | 只读：恢复原购买入口记录 |
| GET | `/consumption?userId=&idempotencyKey=` | 只读：恢复原核销记录 |
| POST | `/purchase` | 写：`{userId, idempotencyKey, skuId?, callbackURL?}` |
| POST | `/consume` | 写：`{userId, idempotencyKey, amount, reason}` |

约定：

- 响应统一 `{ok:true, data}` / `{ok:false, error, error_code, request_id, retryable}`；
- 上游错误码与 HTTP 状态原样透出（`409 PURCHASE_ENTRY_EXPIRED`、`409 IDEMPOTENCY_CONFLICT` 等由上层处理）；
- 只接受本机来源，绑定 `127.0.0.1`；请求体上限 16 KiB；
- 日志只记「方法 / 路径 / 状态码 / 耗时」，不记请求体和响应体；
- 错误信息、日志、响应都会把 `yrp_live_*` 抹成 `<REDACTED>`。

## 5. 主站接口（`hopzz.top`，`/api/sponsor/*`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sponsor/product` | 套餐 + 能力位（只透出三项能力） |
| GET | `/api/sponsor/access` | 当前赞助者权益，附带 `allowed` |
| POST | `/api/sponsor/purchase` | `{sku_id, action_id}` → `purchase_url` / `purchase_qr_code` |
| POST | `/api/sponsor/consume` | `{action_id, amount}` → `delivered`（当前没有付费功能，前端不调用） |

**用户身份**：`hopzz_uid` Cookie，服务端生成并 HMAC 签名（密钥在 `/opt/hopzz-api/data/.uid_secret`，`600`）。
客户端传 `user_id` 一律被忽略（有测试覆盖）。

**`allowed` 的判定**：`access_granted && (decision == "ALLOW" || requires_consumption && remaining > 0)`。
`QUANTITY` 模式的 `/access` 没有 `decision` 字段，所以次数包按 `remaining > 0` 判断。

**回跳地址**：`SPONSOR_CALLBACK_URL`（默认空 → 不传 `callback_url`）。
一人付要求回跳必须是 HTTPS、且与项目登记的官网域名一致；不确定就留空。
页面不依赖回跳：用户从支付宝切回页面时前端会重新查 `/access`。

---

## 6. 幂等与确认规则（实现了的部分）

购买（`POST /api/sponsor/purchase`）：

1. 前端每次「新的购买意图」生成一个随机 `action_id`；网络重试沿用同一个；
2. 服务端按 `(user_id, action_id)` 查 `sponsor_purchase`；
3. 没有就**先生成 `idempotency_key` 并 INSERT 提交**，再调上游；
4. 有就直接用库里那行的 `idempotency_key` / `sku_id` / `callback_url` 重试，**不换号**；
5. `(user_id, action_id)` 与 `idempotency_key` 都有唯一约束；
6. 上游返回 `UNKNOWN` → 记为 `UNKNOWN`，同一 `action_id` 可继续重试；
7. 上游返回 `409 PURCHASE_ENTRY_EXPIRED` / `IDEMPOTENCY_CONFLICT` → 记为终态，前端换新 `action_id` 才能再买。

核销（`POST /api/sponsor/consume`）：

1. 同样先落 `sponsor_consume`（`use_` 前缀编号）再调上游；
2. `amount` 只能整数；`COUNT` 模式强制 `amount=1`；`reason` 由服务端固定，不接受客户端文本；
3. `delivered=true` 当且仅当 `status=SUCCEEDED` **且** `confirmed=true` **且** `consumed == amount` **且** `quota_unit` 与商品一致；
4. 已 `delivered` 的重试直接复用库里的结果，不再打上游；
5. `PROCESSING` / `UNKNOWN` / 未 `confirmed` → 不交付、不换号。

（`consume` 目前没有业务调用方：主站没有需要消耗额度的付费功能，所以前端不显示「使用」按钮。）

---

## 7. 密钥管理

### 配置

```bash
# 服务器上，只有 root 能做
umask 077
cat > /opt/opcpay-bridge/.env <<'EOF'
opcpay_api_key=
EOF
chown www-data:www-data /opt/opcpay-bridge/.env
chmod 600 /opt/opcpay-bridge/.env
# 把 Key 填进去（建议用编辑器，不要留在 shell history）
systemctl restart opcpay-bridge
curl -s http://127.0.0.1:8102/health
```

`.env` 缺 Key 时桥服务**拒绝启动**并在 journal 里说明，不会带着空 Key 空跑。

### 主 Key 与备用 Key

- **主 Key**：已写入服务器 `/opt/opcpay-bridge/.env`，对外只以 `yrp_live_<REDACTED>` 形式出现过。
- **备用 Key**：由项目所有者另行保管，**不写进本仓库、不写进 README**（硬性要求：密钥只能出现在
  服务器 `.env`）。需要轮换时：

```bash
# 1. 先确认新 Key 可用（只读，不改任何数据）
sed -i 's/^opcpay_api_key=.*/opcpay_api_key=<新Key>/' /opt/opcpay-bridge/.env
systemctl restart opcpay-bridge
node /opt/opcpay-bridge/scripts/readonly-query.mjs   # 能看到真实套餐就说明 Key 有效
```

- 轮换后 `journalctl -u opcpay-bridge` 里不应出现任何 Key 片段；桥服务已做抹除，但请顺手 grep 一次。

### 绝对不要

- 把 Key 写进 `deploy/`、`opcpay/` 下的任何受版本控制的文件；
- 把 Key 贴进前端、日志、截图、聊天记录；
- 在命令行里 `opcpay_api_key=<真实Key> node ...`（会留在 history）。
  只读核对用 `scripts/readonly-query.mjs`，它从 `.env` 读。

`.gitignore` 已忽略 `.env` / `*.env` / `node_modules/`。**`.env.example` 里永远是空值。**

---

## 8. 部署

```bash
# 把本目录传到服务器任意位置后
sudo bash install.sh
```

脚本做的事（幂等）：检查 Node ≥18（不够才装 NodeSource）→ 装到 `/opt/opcpay-bridge`
→ `npm ci`（锁文件固定 `opcpay@0.3.4`）→ 保留已有 `.env` → 安装并启动 systemd
→ `/health` 探活。

部署后核对：

```bash
systemctl status opcpay-bridge
node /opt/opcpay-bridge/scripts/readonly-query.mjs
curl -s http://127.0.0.1:8102/product | head -c 300
```

主站侧：`deploy/api/main.py` 用 `BRIDGE_URL`（默认 `http://127.0.0.1:8102`）访问桥；
`deploy.ps1` 负责把 `deploy/site`、`deploy/api` 同步到服务器并重启 `hopzz-api`。

自检（不发真实请求、不花钱）：

```bash
/opt/hopzz-api/venv/bin/python tests/test_sponsor_flow.py
```

---

## 9. 验证记录

| 项 | 结果 |
| --- | --- |
| `opcpay-bridge` | `active` + `enabled`，只监听 `127.0.0.1:8102` |
| Node | `v18.20.4`（Debian 12 源，满足 ≥18） |
| `/capabilities` | 实测有返回，见第 2.1 节 |
| `/product` | 实测有返回，4 档真实配置，见第 2.2 节 |
| 线上页面 | `https://hopzz.top/#sponsor` 渲染出三档真实套餐（¥1.00 / ¥6.00 / ¥10.00）；无 JS 报错；桌面 1360 与手机 390 均无横向溢出 |
| 幂等/确认 | `tests/test_sponsor_flow.py`：**32 项全过**（含伪造 user_id、同一 action_id 重试只建一行、UNKNOWN 重试不换号、过期换新号、五种核销状态只有一种交付、已确认重试不重复扣、伪造 Cookie 被拒、响应无 Key） |
| 日志 | `journalctl -u opcpay-bridge` 与 `-u hopzz-api` 中 `yrp_` 出现次数均为 **0** |
| 真实付款 | **没有发起过**：未做任何真实付款，也未做任何真实核销（真实核销会消耗用户额度） |

线上 `sponsor_purchase` 表里出现过真实的 `READY` 入口记录（来自真实浏览器点击「赞助」按钮的访问），
每笔一个独立编号；这些都是**入口**，与付款无关，也不构成对账依据。

---

## 10. 未验证 / 未开放

**未验证**（需要花钱或需要真实付款才能验证，本次均未执行）：

1. 真实付款后 `/access` 的数值变化（`total/used/remaining`）。
2. 真实 `consume` 核销（会扣用户额度；没有业务调用方，未执行）。
3. 支付宝回跳 / 扫码在真机上的表现（`callback_url` 默认未启用）。
4. Webhook 验签（`verifyWebhook`）：项目没配通知地址，未接。
5. 支付宝端入口过期时间（`expire_time`）与真实过期行为。

**未开放**（`/capabilities` 为 `false`，不实现、不展示）：

交易查询、交易列表、退款、退款查询、对账账单、自动续费、核销冲正。
这些 SDK 方法会返回 `501 CAPABILITY_NOT_AVAILABLE`，桥服务不封装、前端不出现入口。

---

## 11. 运维注意

- **上游限流**：每凭证 120 次/分钟。主站对 `/product` 缓存 60s、`/capabilities` 缓存 300s、
  `/access` 按用户缓存 15s，正常访问远低于限额。Uvicorn 是 2 worker，缓存各算一份。
- **桥服务重启**不影响幂等：业务编号都在 sqlite 里，重启后用同一编号重试即可。
- **数据库**：`/opt/hopzz-api/data/hopzz.db` 的 `sponsor_purchase` / `sponsor_consume` 两张表。
- **测试档**：记得去一人付控制台把 ¥1000 的「测试」档下架，然后删除 `SPONSOR_HIDDEN_SKUS` 配置。
