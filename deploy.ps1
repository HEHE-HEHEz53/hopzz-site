# =====================================================================
#  deploy.ps1 —— 把本地修改一键发布到服务器
#
#  用法（在本机 PowerShell 里）：
#      powershell -ExecutionPolicy Bypass -File D:\DSH\work\deploy.ps1
#
#  它做三件事：
#      1. 把 deploy\site\ 同步到服务器 /var/www/hopzz.top/   （改网页内容后跑这个）
#      2. 把 deploy\api\  同步到服务器 /opt/hopzz-api/app/   （改后端代码后跑这个）
#      3. 后端代码有变化时自动重启服务
#
#  注意：只会覆盖同名文件，不会删除服务器上你没有同步的文件。
# =====================================================================
$ErrorActionPreference = 'Stop'

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg   = Join-Path $here '.ssh\config'
$site  = Join-Path $here 'deploy\site'
$api   = Join-Path $here 'deploy\api'
$vps   = 'vps'

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Invoke-Remote($cmd) { & ssh -F $cfg $vps $cmd; if ($LASTEXITCODE -ne 0) { throw "远端命令失败：$cmd" } }

if (-not (Test-Path $cfg)) { throw "找不到 SSH 配置：$cfg" }

# ---------------------------------------------------------------- 1. 静态站
Say '1/3 上传网页文件'
& scp -F $cfg -r "$site" "${vps}:/tmp/deploy-site"
if ($LASTEXITCODE -ne 0) { throw '上传网页文件失败' }
Invoke-Remote "rsync -a /tmp/deploy-site/ /var/www/hopzz.top/ && chown -R www-data:www-data /var/www/hopzz.top && rm -rf /tmp/deploy-site && echo '   网页文件已更新'"

# ---------------------------------------------------------------- 2. 后端
Say '2/3 上传后端代码'
& scp -F $cfg -r "$api" "${vps}:/tmp/deploy-api"
if ($LASTEXITCODE -ne 0) { throw '上传后端代码失败' }
Invoke-Remote "rsync -a /tmp/deploy-api/ /opt/hopzz-api/app/ && touch /opt/hopzz-api/app/__init__.py && rm -rf /tmp/deploy-api && echo '   后端代码已更新'"

# ---------------------------------------------------------------- 3. 重启
Say '3/3 重启后端并验证'
Invoke-Remote "systemctl restart hopzz-api && sleep 2 && systemctl is-active hopzz-api && curl -fsS --max-time 5 http://127.0.0.1:8000/api/health"

Say '完成'
Write-Host '   网站：https://hopzz.top' -ForegroundColor Green
Write-Host '   （网页是静态文件，改完刷新浏览器即可；浏览器有缓存就按 Ctrl+F5 强刷）' -ForegroundColor DarkGray
