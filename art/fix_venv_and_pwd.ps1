$ErrorActionPreference = 'Stop'

# ========== A. install_chat.sh：修复坏掉的 venv ==========
$f = 'D:\DSH\work\chat\install_chat.sh'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$old = @'
if [[ ! -x "$APP/venv/bin/python" ]]; then
  if ! python3 -m venv "$APP/venv" >/dev/null 2>&1; then
'@
$new = @'
# venv 存在但不可用（没有 pip / ensurepip）也要重建
if [[ -x "$APP/venv/bin/python" ]] && ! "$APP/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "现有的 venv 不可用（缺 pip），重建中…"
  rm -rf "$APP/venv"
fi

if [[ ! -x "$APP/venv/bin/python" ]]; then
  if ! python3 -m venv "$APP/venv" >/dev/null 2>&1; then
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] venv 可用性检测" } else { "  [SKIP] venv 检测未匹配" }

$old2 = @'
if [[ -x "$APP/venv/bin/pip" ]]; then
'@
$new2 = @'
# 补齐 pip（有些环境 venv 建出来不自带 pip）
if ! "$APP/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  "$APP/venv/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true
fi
if ! "$APP/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "pip 仍不可用，改用系统 pip（--break-system-packages）"
  apt-get -y install python3-pip >/dev/null 2>&1 || true
  PIPFLAGS="--break-system-packages"
fi

if [[ -x "$APP/venv/bin/pip" ]]; then
'@
if ($c.Contains($old2)) { $c = $c.Replace($old2, $new2); "  [OK] pip 兜底" } else { "  [SKIP] pip 块未匹配" }

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 install_chat.sh" }

# ========== B. index.js：支持清除已保存密码 ==========
$idx = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$i = [System.IO.File]::ReadAllText($idx, [System.Text.Encoding]::UTF8)
$oldI = "        if (typeof body.deployPassword === 'string' && body.deployPassword !== '') patch.deployPassword = body.deployPassword;"
$newI = @'
        if (body.clearDeployPassword === true) patch.deployPassword = '';
        if (typeof body.deployPassword === 'string' && body.deployPassword !== '') patch.deployPassword = body.deployPassword;
'@
if ($i.Contains($oldI)) { $i = $i.Replace($oldI, $newI); "  [OK] 后端支持清除密码" } else { "  [SKIP] 后端点未匹配" }
$i = $i.Replace("const VERSION = '2.9.6';", "const VERSION = '2.9.7';")
[System.IO.File]::WriteAllText($idx, $i, (New-Object System.Text.UTF8Encoding $false))

# ========== C. client.js：密码状态行 + 清除按钮 ==========
$cl = 'D:\DSH\work\plugin\dsh-web-relay\client.js'
$d = [System.IO.File]::ReadAllText($cl, [System.Text.Encoding]::UTF8)
$origD = $d

# 1) 加 clearPwd 回调（放在 save 回调之后）
$anchor = "      const field = (label, value, onChange, placeholder, type) =>"
$clearFn = @'
      const clearPwd = useCallback(async () => {
        setMsg(null);
        try {
          await call('/general', { method: 'POST', body: JSON.stringify({ clearDeployPassword: true }) });
          setMsg({ ok: true, text: '已清除保存的密码' });
          props.onChanged && props.onChanged();
        } catch (err) {
          setMsg({ ok: false, text: String(err.message || err) });
        }
      }, [props]);

      const field = (label, value, onChange, placeholder, type) =>
'@
if ($d.Contains($anchor)) { $d = $d.Replace($anchor, $clearFn); "  [OK] 增加 clearPwd" } else { "  [SKIP] field 锚点未匹配" }

# 2) 在密码字段后插入状态行
$pwdLine = "        field('密码', password, setPassword, '', 'password'),"
$statusBlock = @'
        field('密码', password, setPassword, '', 'password'),
        h(
          'div',
          { style: { ...styles.row, justifyContent: 'flex-start', gap: '10px', marginTop: '-6px' } },
          h(
            'span',
            { style: styles.hint },
            st.hasDeployPassword ? '✓ 密码已保存（留空则继续使用）' : '尚未保存密码'
          ),
          st.hasDeployPassword
            ? h(
                'span',
                {
                  style: { ...styles.hint, textDecoration: 'underline', cursor: 'pointer' },
                  onClick: clearPwd,
                },
                '清除密码'
              )
            : null
        ),
'@
if ($d.Contains($pwdLine)) { $d = $d.Replace($pwdLine, $statusBlock); "  [OK] 增加密码状态行" } else { "  [SKIP] 密码字段未匹配" }

if ($d -ne $origD) { [System.IO.File]::WriteAllText($cl, $d, (New-Object System.Text.UTF8Encoding $false)); "已写入 client.js" }

"=== 语法检查 ==="
& 'D:\IT\nodejs\node.exe' --check $idx 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"
& 'D:\IT\nodejs\node.exe' --check $cl 2>&1 | Out-String
"client.js EXIT=$LASTEXITCODE"
$pf = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($pf, [System.Text.Encoding]::UTF8).Replace('"version": "2.9.6"', '"version": "2.9.7"')
[System.IO.File]::WriteAllText($pf, $pc, (New-Object System.Text.UTF8Encoding $false))
"package.json -> 2.9.7"
