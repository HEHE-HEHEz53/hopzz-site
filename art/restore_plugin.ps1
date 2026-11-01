$ErrorActionPreference = 'Stop'
Set-Location 'D:\DSH\work'
$dir = 'D:\DSH\work\plugin\dsh-web-relay'

Write-Host "=== 1. 从 git 恢复被删的源码 ===" -ForegroundColor Cyan
& git checkout 4fce76b -- plugin/dsh-web-relay 2>&1 | Out-String
Get-ChildItem $dir -File | Select-Object Name,Length | Format-Table -AutoSize | Out-String

Write-Host "=== 2. 补齐不入库的两个文件（cordis.patch.yml 含令牌 / settings.json 含连接串）===" -ForegroundColor Cyan
$patch = @'
- insert:
    - id: web-relay
      name: '@local/dsh-web-relay'
      config:
        connectString: ''
        serverUrl: 'wss://ai.hopzz.top/agent-ws'
        agentToken: '763bf0673f9599433fa319307167fc8a5f2ba433cba47b0daeef301d7d083dc5'
        maxReconnectMs: 30000
'@
[System.IO.File]::WriteAllText("$dir\cordis.patch.yml", $patch, (New-Object System.Text.UTF8Encoding $false))

$settings = @'
{
  "mode": "string",
  "connectString": "whale1.eyJ2IjoxLCJ1cmwiOiJ3c3M6Ly9haS5ob3B6ei50b3AvYWdlbnQtd3MiLCJ0b2tlbiI6Ijc2M2JmMDY3M2Y5NTk5NDMzZmEzMTkzMDcxNjdmYzhhNWYyYmE0MzNjYmE0N2IwZGFlZWYzMDFkN2QwODNkYzUifQ",
  "serverUrl": "",
  "agentToken": "",
  "maxReconnectMs": 30000,
  "sshConfigPath": "D:\\DSH\\work\\.ssh\\config",
  "sshTarget": "vps",
  "repoPath": "D:\\DSH\\work",
  "deployHost": "64.83.20.24",
  "deployPort": 22,
  "deployUser": "root",
  "deployPassword": "",
  "deployDomain": "ai.hopzz.top",
  "plinkPath": "D:\\app\\putty\\plink.exe",
  "pscpPath": "D:\\app\\putty\\pscp.exe"
}
'@
[System.IO.File]::WriteAllText("$dir\settings.json", $settings, (New-Object System.Text.UTF8Encoding $false))

Write-Host "=== 3. 检查关键文件 ===" -ForegroundColor Cyan
$need = @('index.js','client.js','package.json','cordis.patch.yml','settings.json','icon.png','locale\zh.json')
foreach ($f in $need) {
  $p = Join-Path $dir $f
  "{0,-26} {1}" -f $f, $(if (Test-Path $p) { 'OK  ' + (Get-Item $p).Length + ' 字节' } else { '缺失' })
}
"`n=== 4. 版本与关键功能 ==="
Select-String -Path "$dir\index.js" -Pattern "const VERSION =|export const inject|case 'installPlugin'" | ForEach-Object { "  " + $_.Line.Trim() }
& 'D:\IT\nodejs\node.exe' --check "$dir\index.js" 2>&1 | Out-String
"index.js 语法 EXIT=$LASTEXITCODE"
& 'D:\IT\nodejs\node.exe' --check "$dir\client.js" 2>&1 | Out-String
"client.js 语法 EXIT=$LASTEXITCODE"
