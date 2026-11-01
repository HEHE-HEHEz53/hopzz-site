$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\chat\install_chat.sh'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

# ---- A. 纯 IP 地址 → ipport 模式（默认 8888）----
$oldMode = @'
if [[ "$ADDR" == *:* ]]; then
  MODE="ipport"
  LISTEN_PORT="${ADDR##*:}"
  HOST_ONLY="${ADDR%%:*}"
else
  MODE="domain"
  LISTEN_PORT="443"
  HOST_ONLY="$ADDR"
fi
'@
$newMode = @'
if [[ "$ADDR" == *:* ]]; then
  # IP:端口 或 域名:端口 → 纯 HTTP
  MODE="ipport"
  LISTEN_PORT="${ADDR##*:}"
  HOST_ONLY="${ADDR%%:*}"
elif [[ "$ADDR" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  # 只填了 IP（没端口）→ 默认 8888 端口，纯 HTTP，不申请证书
  MODE="ipport"
  LISTEN_PORT="8888"
  HOST_ONLY="$ADDR"
else
  MODE="domain"
  LISTEN_PORT="443"
  HOST_ONLY="$ADDR"
fi
'@
if ($c.Contains($oldMode)) { $c = $c.Replace($oldMode, $newMode); "  [OK] 纯 IP 自动按 IP:8888 处理" }
else { "  [SKIP] 模式判断未匹配" }

# ---- B. Python 依赖：自动装 python3-venv，失败退回系统 Python ----
$oldPy = @'
step "3. Python 依赖"
[[ -x "$APP/venv/bin/python" ]] || python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install --quiet --upgrade pip
"$APP/venv/bin/pip" install --quiet fastapi uvicorn "websockets>=12"
'@
$newPy = @'
step "3. Python 依赖"
# ensurepip（python3-venv 包）在 Debian 上是可选的，必须先补上
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  echo "缺少 python3-venv，尝试自动安装…"
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get -y install python3-venv python3-pip >/dev/null 2>&1 || true
fi

if [[ ! -x "$APP/venv/bin/python" ]]; then
  if ! python3 -m venv "$APP/venv" >/dev/null 2>&1; then
    echo "venv 创建失败，改用系统 Python 兼容模式"
    rm -rf "$APP/venv"
    mkdir -p "$APP/venv/bin"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python3"
    PIPFLAGS="--break-system-packages"
  fi
fi

if [[ -x "$APP/venv/bin/pip" ]]; then
  "$APP/venv/bin/pip" install --quiet --upgrade pip
  "$APP/venv/bin/pip" install --quiet fastapi uvicorn "websockets>=12"
else
  "$APP/venv/bin/python" -m pip install --quiet ${PIPFLAGS:-} --upgrade pip >/dev/null 2>&1 || true
  "$APP/venv/bin/python" -m pip install --quiet ${PIPFLAGS:-} fastapi uvicorn "websockets>=12" || {
    apt-get -y install python3-pip >/dev/null 2>&1 || true
    "$APP/venv/bin/python" -m pip install --quiet ${PIPFLAGS:-} fastapi uvicorn "websockets>=12"
  }
fi
'@
if ($c.Contains($oldPy)) { $c = $c.Replace($oldPy, $newPy); "  [OK] Python 依赖自动兜底" }
else { "  [SKIP] Python 依赖块未匹配" }

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入 install_chat.sh" }
"=== 语法检查 ==="
& 'C:\Program Files\Git\bin\bash.exe' -n $f 2>&1 | Out-String
"bash -n EXIT=$LASTEXITCODE"
