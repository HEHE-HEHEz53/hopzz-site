$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$newTest = @'
  /** 测试连接：分步报告，便于定位是地址、网络还是令牌的问题 */
  async function testConnection() {
    const conn = effectiveConnection();
    if (!conn.agentToken) {
      return { ok: false, message: '还没有配置令牌' };
    }
    const url = conn.serverUrl;
    const httpBase = url.replace(/^ws/, 'http').replace(/\/agent-ws.*$/, '');
    const detail = [`地址: ${url}`, `令牌: ${conn.agentToken.slice(0, 8)}…（共 ${conn.agentToken.length} 位）`];

    // 第一步：HTTP 能不能通
    try {
      const res = await fetch(httpBase + '/api/setup-state', { signal: AbortSignal.timeout(8000) });
      detail.push(`HTTP 探测: ${res.status} ${res.ok ? '可达' : '异常'}`);
      if (!res.ok) {
        return { ok: false, message: `服务器返回 ${res.status}，地址可能不对`, log: detail.join('\n') };
      }
    } catch (err) {
      detail.push(`HTTP 探测失败: ${String(err?.message ?? err)}`);
      return {
        ok: false,
        message: '连不上服务器的 HTTP 端口（地址/端口错，或服务没跑）',
        log: detail.join('\n'),
      };
    }

    // 第二步：WebSocket 握手
    return await new Promise((resolve) => {
      let done = false;
      let probe = null;
      const finish = (ok, message) => {
        if (done) return;
        done = true;
        try {
          probe?.close();
        } catch {
          /* 忽略 */
        }
        resolve({ ok, message, log: detail.join('\n') });
      };
      const timer = setTimeout(() => finish(false, 'WebSocket 握手超时（8 秒）'), 8000);
      try {
        probe = new WebSocket(`${url}?token=${encodeURIComponent(conn.agentToken)}`);
      } catch (err) {
        clearTimeout(timer);
        detail.push(`构造 WebSocket 失败: ${String(err?.message ?? err)}`);
        return finish(false, '地址格式不对（要以 ws:// 或 wss:// 开头）');
      }
      probe.addEventListener('open', () => {
        clearTimeout(timer);
        detail.push('WebSocket: 握手成功');
        finish(true, '连接正常');
      });
      probe.addEventListener('error', () => {
        clearTimeout(timer);
        detail.push('WebSocket: error（服务器拒绝、路径不对，或 TLS 不符）');
        finish(false, 'WebSocket 连不上：看下面的明细');
      });
      probe.addEventListener('close', (ev) => {
        clearTimeout(timer);
        detail.push(`WebSocket 关闭: code=${ev.code} reason=${ev.reason || '(空)'}`);
        finish(false, '服务器主动断开（多半是令牌不对）');
      });
    });
  }
'@

$pattern = '(?s)  /\*\* 测试连接[^\n]*\n  async function testConnection\(\) \{.*?\n  \}\n'
if ($c -match $pattern) {
  $c = [regex]::Replace($c, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) return $newTest }, 1)
  "  [OK] 替换 testConnection（带明细）"
} else {
  # 兜底：从 "function testConnection" 到下一个空行前的 } 结束
  $startIdx = $c.IndexOf('  function testConnection() {')
  if ($startIdx -lt 0) { $startIdx = $c.IndexOf('  async function testConnection() {') }
  if ($startIdx -ge 0) {
    $endIdx = $c.IndexOf("`n  }`n", $startIdx)
    if ($endIdx -gt $startIdx) {
      $c = $c.Substring(0, $startIdx) + $newTest + $c.Substring($endIdx + 5)
      "  [OK] 用兜底方式替换 testConnection"
    } else { throw '找不到 testConnection 结束位置' }
  } else { throw '找不到 testConnection' }
}

$c = $c.Replace("const VERSION = '2.9.8';", "const VERSION = '2.9.9';")
if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 index.js" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

# 前端也要把 detail 显示出来
$cl = 'D:\DSH\work\plugin\dsh-web-relay\client.js'
$d = [System.IO.File]::ReadAllText($cl, [System.Text.Encoding]::UTF8)
if ($d.Contains('连接正常') -or $d.Contains('测试连接')) {
  "  client.js 里有测试按钮，检查是否显示 detail"
}
Select-String -Path $cl -Pattern "测试连接|/test" | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" } | Select-Object -First 8

$pf = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($pf, [System.Text.Encoding]::UTF8).Replace('"version": "2.9.8"', '"version": "2.9.9"')
[System.IO.File]::WriteAllText($pf, $pc, (New-Object System.Text.UTF8Encoding $false))
"package.json -> 2.9.9"
