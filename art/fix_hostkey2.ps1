$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\index.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$old = @'
          logText += '1) 获取服务器主机指纹…\n';
          const fp = await ensureHostKey(plink, host, port, user);
          logText += fp ? `   指纹 ${fp}\n\n` : '   没拿到指纹，继续\n\n';
          const keyArg = fp ? ['-hostkey', fp] : [];
'@
$new = @'
          logText += '1) 获取服务器主机指纹…\n';
          const fp = await ensureHostKey(plink, host, port, user);
          if (!fp) {
            logText += '   拿不到主机指纹，无法在批处理模式下继续。\n';
            logText += '   请先在命令行手动执行一次下面的命令，之后再点部署：\n';
            logText += `     "${plink}" -P ${port} -l ${user} ${host} exit\n`;
            logText += '   （它会询问是否信任主机，输入 y 回车即可）\n';
            if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
            return { ok: false, message: '拿不到服务器主机指纹，请先手动信任一次主机密钥', log: logText };
          }
          logText += `   指纹 ${fp}\n\n`;
          const keyArg = ['-hostkey', fp];
'@
if ($c.Contains($old)) { $c = $c.Replace($old, $new); "  [OK] 无指纹时给出明确指引" }
else { "  [SKIP] 指纹调用块未匹配" }

$c = $c.Replace("const VERSION = '5.0.0';", "const VERSION = '5.0.1';")

if ($c -ne $orig) { [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false)); "已写入" }
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"index.js EXIT=$LASTEXITCODE"

$pf = 'D:\DSH\work\plugin\dsh-web-relay\package.json'
$pc = [System.IO.File]::ReadAllText($pf, [System.Text.Encoding]::UTF8).Replace('"version": "5.0.0"', '"version": "5.0.1"')
[System.IO.File]::WriteAllText($pf, $pc, (New-Object System.Text.UTF8Encoding $false))
& 'D:\IT\nodejs\node.exe' -e "const p=require('D:/DSH/work/plugin/dsh-web-relay/package.json');console.log('package.json:',p.version)"
