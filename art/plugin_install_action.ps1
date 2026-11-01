$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---------- 1. switch 里加两个 action ----------
$old = @'
        case 'setBundle':
          data = await setBundle(payload);
          break;
'@
$new = @'
        case 'setBundle':
          data = await setBundle(payload);
          break;
        case 'installPlugin':
          data = await installPlugin(payload);
          break;
        case 'removePlugin':
          data = await removePlugin(payload);
          break;
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] switch 增加 installPlugin/removePlugin" }
else { "  [FAIL] 没找到 setBundle case" }

# ---------- 2. 在 setBundle 函数后加实现 ----------
$anchor = @'
    return { name, enabled, result: normalized };
  }
'@
$impl = @'
    return { name, enabled, result: normalized };
  }

  // ------------------------------------------------------------ 从网页装/卸插件
  function pickChangeResult(result) {
    const out = {};
    if (result && typeof result === 'object') {
      for (const k of ['application', 'changed', 'warnings', 'nextStep', 'restartRequired', 'error']) {
        if (result[k] !== undefined) out[k] = result[k];
      }
    }
    return out;
  }

  async function installPlugin(payload) {
    const pm = svc('pluginManager');
    if (!pm) throw new Error('pluginManager 不可用');
    const spec = String(payload?.spec ?? '').trim();
    if (!spec) throw new Error('请填写要安装的插件名或地址');

    const result = await pm.installBundle(spec);
    const normalized = pickChangeResult(result);
    const failed = normalized.application === 'failed' || normalized.error;
    return {
      spec,
      ok: !failed,
      message: failed
        ? '安装失败：' + (normalized.error?.code ?? normalized.application ?? 'unknown')
        : normalized.application === 'applied'
          ? '已安装并生效'
          : '已安装（' + (normalized.application ?? '待生效') + '，可能需要重启 DSH）',
      result: normalized,
    };
  }

  async function removePlugin(payload) {
    const pm = svc('pluginManager');
    if (!pm) throw new Error('pluginManager 不可用');
    const name = String(payload?.name ?? '').trim();
    if (!name) throw new Error('缺少插件名');
    if (name === '@local/dsh-web-relay') {
      throw new Error('不能卸载本页面自己用的插件（会直接断线）');
    }

    const result = await pm.removeBundle(name);
    const normalized = pickChangeResult(result);
    return {
      name,
      ok: normalized.application !== 'failed',
      message: normalized.application === 'failed' ? '卸载失败' : '已卸载',
      result: normalized,
    };
  }
'@
if ($c.Contains($anchor)) { $c = $c.Replace($anchor, $impl); "  [OK] 增加 installPlugin/removePlugin 实现" }
else { "  [FAIL] 没找到 setBundle 函数结尾" }

if ($c -ne $orig) {
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  "已写入"
}

"`n=== 语法检查 ==="
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"EXIT=$LASTEXITCODE"
