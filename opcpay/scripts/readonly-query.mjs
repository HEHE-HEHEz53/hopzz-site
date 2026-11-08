#!/usr/bin/env node
/*
 * 只读查询脚本 —— 只调 capabilities() 与 product()
 *
 * 不创建购买入口、不查询权益、不核销、不写任何数据。
 * 用途：部署后核对「商户实际配置的收费模式 / SKU / 价格 / 数量」。
 *
 * 用法（Key 只从环境变量或 .env 文件读取，绝不写在命令行里）：
 *   node scripts/readonly-query.mjs
 *   OPCPAY_ENV_FILE=/path/to/.env node scripts/readonly-query.mjs
 *
 * 输出为原样 JSON；脚本不会打印 Key。
 */
import { readFileSync } from 'node:fs';
import { opcpay } from 'opcpay';

const ENV_FILE = process.env.OPCPAY_ENV_FILE || '/opt/opcpay-bridge/.env';

function loadEnvFile(path) {
  if (process.env.opcpay_api_key) return 'env';
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
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
  return process.env.opcpay_api_key ? path : null;
}

const source = loadEnvFile(ENV_FILE);
if (!process.env.opcpay_api_key) {
  console.error(JSON.stringify({ ok: false, error: `找不到 opcpay_api_key（已尝试 ${ENV_FILE}）` }));
  process.exit(1);
}

const pay = new opcpay();

function scrub(value) {
  // 极端兜底：万一上游把凭证字段透传回来，也不让它出现在本脚本输出里
  const text = JSON.stringify(value, null, 2);
  return text.replace(/yrp_live_[0-9a-f]+/g, 'yrp_live_<REDACTED>');
}

const out = { key_source: source === 'env' ? 'environment' : source, ok: true };

try {
  out.capabilities = await pay.capabilities();
} catch (err) {
  out.ok = false;
  out.capabilities_error = {
    message: err.message,
    status: err.status ?? null,
    code: err.code ?? null,
    request_id: err.requestId ?? null,
  };
}

try {
  out.product = await pay.product();
} catch (err) {
  out.ok = false;
  out.product_error = {
    message: err.message,
    status: err.status ?? null,
    code: err.code ?? null,
    request_id: err.requestId ?? null,
  };
}

console.log(scrub(out));
if (!out.ok) process.exitCode = 2;
