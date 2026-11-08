#!/usr/bin/env node
/**
 * opcpay-bridge —— 一人付（opcpay）的本地薄封装服务
 * =====================================================================
 * 只监听 127.0.0.1:8102，只服务于同机上的 hopzz-api（FastAPI）。
 *
 * 设计原则：
 *   1. 薄封装：每个路由只做「参数校验 → 调 SDK → 原样返回 JSON」，不缓存业务状态。
 *      （幂等、业务编号落库、权益判定都在 Python 主站后端 /opt/hopzz-api 里做。）
 *   2. API Key 只从环境变量 /opt/opcpay-bridge/.env 读取；
 *      不出现在响应、日志、错误信息、命令行里。本文件不含任何 Key。
 *   3. 只暴露只读查询 + 两个写入口（purchase / consume），
 *      交易/退款/账单等「能力未开放」的接口一律不封装（SDK 也只会返回 501）。
 *   4. 日志只记方法、路径、状态码、耗时；不记请求体、不记响应体、不记 Key。
 *
 * 启动：systemctl start opcpay-bridge
 * 探活：curl -s http://127.0.0.1:8102/health
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { opcpay } from 'opcpay';

/* ---------------------------------------------------------------- 配置 */
const ENV_FILE = process.env.OPCPAY_ENV_FILE || '/opt/opcpay-bridge/.env';
const HOST = '127.0.0.1';
const PORT = Number(process.env.OPCPAY_BRIDGE_PORT || 8102);
const MAX_BODY = 16 * 1024; // opcpay 接口规定 JSON 正文最多 16 KiB

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

const envLoaded = loadEnvFile(ENV_FILE);
if (!process.env.opcpay_api_key) {
  console.error(
    `[bridge] 启动失败：没有读到 opcpay_api_key（环境变量为空，${ENV_FILE} 不存在或未配置）`
  );
  process.exit(1);
}
if (process.env.opcpay_api_key.length < 20) {
  console.error('[bridge] 启动失败：opcpay_api_key 长度异常');
  process.exit(1);
}

const pay = new opcpay();

/* ---------------------------------------------------------------- 工具 */
/** 把可能漏出来的凭证字样抹掉，再返回给调用方 / 写日志 */
const KEY_RE = /yrp_(live|test)_[0-9a-fA-F]+/g;
function scrub(text) {
  if (typeof text !== 'string') return text;
  return text.replace(KEY_RE, 'yrp_$1_<REDACTED>').replace(/Bearer\s+\S+/gi, 'Bearer <REDACTED>');
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function fail(res, status, message, extra = {}) {
  json(res, status, { ok: false, error: scrub(message), ...extra });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体超过 16 KiB'), { httpStatus: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('请求体必须是单个 JSON 对象'), { httpStatus: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { httpStatus: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* 校验规则来自 opcpay OpenAPI：user_id / idempotency_key 1–128 字符、无首尾空白 */
function checkId(value, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value !== value.trim()) {
    throw Object.assign(new Error(`${name} 必须是 1–128 字符且不含首尾空白的字符串`), {
      httpStatus: 400,
    });
  }
  return value;
}

function checkReason(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || !value.trim()) {
    throw Object.assign(new Error('reason 必须是 1–256 字符且不能全为空白'), { httpStatus: 400 });
  }
  return value;
}

function checkAmount(value) {
  if (!Number.isInteger(value) || value < 1 || value > 99999999) {
    throw Object.assign(new Error('amount 必须是 1–99999999 的 JSON 整数'), { httpStatus: 400 });
  }
  return value;
}

/** 统一的错误映射：SDK 抛的 opcpayError 原样透出状态与错误码 */
function sendError(res, err) {
  if (err && typeof err.status === 'number' && err.status >= 400) {
    return json(res, err.status, {
      ok: false,
      error: scrub(err.message || '上游返回错误'),
      error_code: err.code || 'UNKNOWN',
      request_id: err.requestId || null,
      retryable: err.retryable === true,
    });
  }
  const status = typeof err?.httpStatus === 'number' ? err.httpStatus : 502;
  fail(res, status, err?.message || '桥服务内部错误', {
    error_code: status === 502 ? 'BRIDGE_UPSTREAM_ERROR' : 'INVALID_ARGUMENT',
    retryable: status === 502,
  });
}

/* ---------------------------------------------------------------- 路由 */
const routes = {
  'GET /health': async () => ({
    ok: true,
    service: 'opcpay-bridge',
    upstream: 'https://ai6666.com/opcpay/api/pay/v1',
    time: new Date().toISOString(),
  }),

  // 只读：接口能力
  'GET /capabilities': async () => ({ ok: true, data: await pay.capabilities() }),

  // 只读：套餐与收费状态
  'GET /product': async () => ({ ok: true, data: await pay.product() }),

  // 只读：某用户权益 / 额度
  'GET /access': async (url) => {
    const userId = checkId(url.searchParams.get('userId'), 'userId');
    return { ok: true, data: await pay.access(userId) };
  },

  // 只读：恢复原购买入口（不是支付宝逐笔支付状态）
  'GET /purchase/query': async (url) => {
    const userId = checkId(url.searchParams.get('userId'), 'userId');
    const key = checkId(url.searchParams.get('idempotencyKey'), 'idempotencyKey');
    return { ok: true, data: await pay.purchaseQuery(userId, key) };
  },

  // 只读：恢复原核销记录
  'GET /consumption': async (url) => {
    const userId = checkId(url.searchParams.get('userId'), 'userId');
    const key = checkId(url.searchParams.get('idempotencyKey'), 'idempotencyKey');
    return { ok: true, data: await pay.consumption(userId, key) };
  },

  // 写：创建购买入口（不代表已付款）
  'POST /purchase': async (_url, body) => {
    const userId = checkId(body.userId, 'userId');
    const idempotencyKey = checkId(body.idempotencyKey, 'idempotencyKey');
    let skuId;
    if (body.skuId !== undefined && body.skuId !== null && body.skuId !== '') {
      skuId = checkId(body.skuId, 'skuId');
    }
    let callbackURL;
    if (body.callbackURL) {
      callbackURL = String(body.callbackURL);
      let parsed;
      try {
        parsed = new URL(callbackURL);
      } catch {
        throw Object.assign(new Error('callbackURL 不是合法 URL'), { httpStatus: 400 });
      }
      if (parsed.protocol !== 'https:' || callbackURL.length > 512) {
        throw Object.assign(new Error('callbackURL 必须是不超过 512 字节的 HTTPS URL'), {
          httpStatus: 400,
        });
      }
    }
    return { ok: true, data: await pay.purchase({ userId, idempotencyKey, skuId, callbackURL }) };
  },

  // 写：正式核销（只有 SUCCEEDED + confirmed 才等价于交付成功）
  'POST /consume': async (_url, body) => {
    const userId = checkId(body.userId, 'userId');
    const idempotencyKey = checkId(body.idempotencyKey, 'idempotencyKey');
    const amount = checkAmount(body.amount);
    const reason = checkReason(body.reason);
    return { ok: true, data: await pay.consume({ userId, idempotencyKey, amount, reason }) };
  },
};

/* ---------------------------------------------------------------- 服务 */
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const routeKey = `${req.method} ${url.pathname}`;

  // 防御：即便误改了监听地址，也只接受本机来源
  const remote = req.socket.remoteAddress || '';
  if (!(remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
    json(res, 403, { ok: false, error: '只接受本机请求' });
    return;
  }

  const handler = routes[routeKey];
  if (!handler) {
    json(res, 404, { ok: false, error: `没有这个接口：${routeKey}` });
    return;
  }

  try {
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const result = await handler(url, body);
    json(res, 200, result);
  } catch (err) {
    sendError(res, err);
  } finally {
    // 只记路由与状态码，不记请求体/响应体（里面可能含用户权益信息）
    console.log(
      `[bridge] ${req.method} ${url.pathname} -> ${res.statusCode} ${Date.now() - started}ms`
    );
  }
});

server.headersTimeout = 15000;
server.requestTimeout = 90000;
server.keepAliveTimeout = 5000;

server.listen(PORT, HOST, () => {
  console.log(
    `[bridge] 已启动 http://${HOST}:${PORT}（env: ${process.env.OPCPAY_ENV_FILE || ENV_FILE}，已加载: ${envLoaded}）`
  );
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[bridge] 收到 ${sig}，正在退出`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
  });
}
