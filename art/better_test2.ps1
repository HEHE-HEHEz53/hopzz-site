$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)

$start = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match 'function testConnection\(') { $start = $i; break }
}
if ($start -lt 0) { throw '找不到 testConnection 起始行' }

$end = -1
for ($j = $start + 1; $j -lt $lines.Count; $j++) {
  if ($lines[$j] -eq '  }') { $end = $j; break }
}
if ($end -lt 0) { throw '找不到 testConnection 结束行' }
"替换行范围: $($start+1) - $($end+1)"

$new = @'
  /** 测试连接：分步报告，便于定位是地址、网络还是令牌的问题 */
  async function testConnection() {
    const conn = effectiveConnection();
    if (!conn.agentToken) {
      return { ok: false, message: '还没有配置令牌' };
    }
    const url = conn.serverUrl;
    const httpBase = url.replace(/^ws/, 'http').replace(/\/agent-ws.*$/, '');
    const detail = ['地址: ' + url, '令牌: ' + conn.agentToken.slice(0, 8) + '…（共 ' + conn.agentToken.length + ' 位）'];

    try {
      const res = await fetch(httpBase + '/api/setup-state', { signal: AbortSignal.timeout(8000) });
      detail.push('HTTP 探测: ' + res.status + (res.ok ? ' 可达' : ' 异常'));
      if (!res.ok) {
        return { ok: false, message: '服务器返回 ' + res.status + '，地址可能不对', log: detail.join('\n') };
      }
    } catch (err) {
      detail.push('HTTP 探测失败: ' + String(err && err.message ? err.message : err));
      return { ok: false, message: '连不上服务器的 HTTP 端口（地址/端口错，或服务没跑）', log: detail.join('\n') };
    }

    return await new Promise((resolve) => {
      let done = false;
      let probe = null;
      const finish = (ok, message) => {
        if (done) return;
        done = true;
        try {
          if (probe) probe.close();
        } catch (e) {
          /* 忽略 */
        }
        resolve({ ok: ok, message: message, log: detail.join('\n') });
      };
      const timer = setTimeout(() => finish(false, 'WebSocket 握手超时（8 秒）'), 8000);
      try {
        probe = new WebSocket(url + '?token=' + encodeURIComponent(conn.agentToken));
      } catch (err) {
        clearTimeout(timer);
        detail.push('构造 WebSocket 失败: ' + String(err && err.message ? err.message : err));
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
        detail.push('WebSocket 关闭: code=' + ev.code + ' reason=' + (ev.reason || '(空)'));
        finish(false, '服务器主动断开（多半是令牌不对）');
      });
    });
  }
'@

$out = @()
$out += $lines[0..($start - 1)]
$out += ($new -split "`r?`n")
$out += $lines[($end + 1)..($lines.Count - 1)]
$text = ($out -join "`r`n").Replace("const VERSION = '2.9.8';", "const VERSION = '2.9.9';")
[System.IO.File]::WriteAllText($f, $text, (New-Object System.Text.UTF8Encoding $false))

& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
Select-String -Path $f -Pattern 'const VERSION|HTTP 探测|WebSocket 关闭' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }

$pf = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($pf, [System.Text.Encoding]::UTF8).Replace('"version": "2.9.8"', '"version": "2.9.9"')
[System.IO.File]::WriteAllText($pf, $pc, (New-Object System.Text.UTF8Encoding $false))
"package.json -> 2.9.9"
