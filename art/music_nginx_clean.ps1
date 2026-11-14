$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\nginx\music.hopzz.top.conf'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
# 去掉与上游重复的响应头（重复会下发两次）
$c = $c.Replace('    add_header X-Content-Type-Options nosniff always;' + "`r`n", '')
$c = $c.Replace('    add_header X-Content-Type-Options nosniff always;' + "`n", '')
$c = $c.Replace('    # 音频不允许被当成下载文件' + "`r`n" + '    add_header Content-Disposition "inline" always;' + "`r`n", '')
[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
"nginx 配置已去除重复头"
Select-String -Path $f -Pattern 'add_header' | ForEach-Object { "  $($_.LineNumber): $($_.Line.Trim())" }
