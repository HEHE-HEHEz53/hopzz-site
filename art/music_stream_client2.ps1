$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\static\player.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

function Rep($old, $new, $label) {
  if ($script:c.Contains($old)) { $script:c = $script:c.Replace($old, $new); "  [OK]   $label" }
  else { "  [SKIP] $label" }
}

# 1) 拉流函数改回签名 URL（流式，支持拖动）
$oldFetch = @'
  /** 拉取整段音频：带一次性令牌请求头 + 会话 Cookie，还原异或后生成 blob URL。
   *  页面上不会出现任何可直接播放/下载的地址。 */
  function fetchStreamUrl() {
    return api('/api/track/' + TRACK_ID).then(function (res) {
      state.track = res.track;
      var stream = res.track.stream || {};
      return fetch(stream.url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'X-Music-Token': stream.token || '',
          'X-Music-Exp': String(stream.exp || '')
        }
      }).then(function (response) {
        if (!response.ok) {
          throw new Error(response.status === 403 ? '播放凭证已过期' : ('HTTP ' + response.status));
        }
        var keyHex = response.headers.get('X-Stream-Key') || '';
        return response.arrayBuffer().then(function (buffer) {
          var bytes = new Uint8Array(buffer);
          if (keyHex && keyHex.length >= 2) {
            var key = new Uint8Array(keyHex.length / 2);
            for (var i = 0; i < key.length; i++) {
              key[i] = parseInt(keyHex.substr(i * 2, 2), 16);
            }
            for (var j = 0; j < bytes.length; j++) {
              bytes[j] = bytes[j] ^ key[j % key.length];
            }
          }
          if (state.objectUrl) {
            try { URL.revokeObjectURL(state.objectUrl); } catch (err) { /* ignore */ }
          }
          var blob = new Blob([bytes], { type: 'audio/mpeg' });
          state.objectUrl = URL.createObjectURL(blob);
          return state.objectUrl;
        });
      });
    });
  }
'@
$newFetch = @'
  /** 申请短时签名地址（2 分钟）。
   *  该地址还必须带页面会话 Cookie 且由播放页发起才会返回音频。 */
  function fetchAudioUrl() {
    return api('/api/track/' + TRACK_ID).then(function (res) {
      state.track = res.track;
      return res.track.audioUrl;
    });
  }
'@
Rep $oldFetch $newFetch '拉流改回签名 URL'

# 2) boot 改回直接挂载
$oldBoot = @'
        app.classList.add('is-loading');
        fetchStreamUrl()
          .then(function (url) { attachAudio(url); })
          .catch(function (err) {
            app.classList.remove('is-loading');
            showFatal(err.message || '音频加载失败');
          });
'@
$newBoot = @'
        attachAudio(state.track.audioUrl);
'@
Rep $oldBoot $newBoot 'boot 直接挂签名地址'

# 3) refreshSource 改回签名地址
$oldRefresh = @'
    app.classList.add('is-loading');
    fetchStreamUrl()
      .then(function (url) {
        state.audioUrl = url;
        audio.src = url;
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = at; } catch (err) { /* ignore */ }
          if (wasPlaying) audio.play().catch(function () {});
        });
      })
      .catch(function () { /* 下次播放再试 */ })
      .then(function () { state.refreshLock = false; app.classList.remove('is-loading'); });
'@
$newRefresh = @'
    fetchAudioUrl()
      .then(function (url) {
        state.audioUrl = url;
        audio.src = url;
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = at; } catch (err) { /* ignore */ }
          if (wasPlaying) audio.play().catch(function () {});
        });
      })
      .catch(function () { /* 下次播放再试 */ })
      .then(function () { state.refreshLock = false; });
'@
Rep $oldRefresh $newRefresh 'refreshSource 改回签名地址'

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
"已写入 player.js"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"player.js EXIT=$LASTEXITCODE"

# ---------- 4. 去掉页面上可见的版权行（只在代码里保留） ----------
$hf = 'D:\DSH\work\music\static\player.html'
$h = [System.IO.File]::ReadAllText($hf, [System.Text.Encoding]::UTF8)
$h = $h.Replace('    <p class="copyright-line" id="copyrightLine">© 2026 HEHEz53 · 仅供在线收听</p>' + "`r`n`r`n", '')
$h = $h.Replace('    <p class="copyright-line" id="copyrightLine">© 2026 HEHEz53 · 仅供在线收听</p>' + "`n`n", '')
[System.IO.File]::WriteAllText($hf, $h, (New-Object System.Text.UTF8Encoding $false))
"页面可见版权行已移除: $(-not ($h -match 'copyrightLine'))"

# CSS 里的版权行样式也去掉
$cf = 'D:\DSH\work\music\static\player.css'
$cc = [System.IO.File]::ReadAllText($cf, [System.Text.Encoding]::UTF8)
$idx = $cc.IndexOf('/* 版权行：只在展开歌词时显示在底部 */')
if ($idx -gt 0) { $cc = $cc.Substring(0, $idx).TrimEnd() + "`n" }
[System.IO.File]::WriteAllText($cf, $cc, (New-Object System.Text.UTF8Encoding $false))
"CSS 版权行样式已移除"
