$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\music\static\player.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

function Rep($old, $new, $label) {
  if ($script:c.Contains($old)) { $script:c = $script:c.Replace($old, $new); "  [OK]   $label" }
  else { "  [SKIP] $label" }
}

# 1) 拉流：请求头 + 会话 Cookie + 异或还原 → blob URL
$oldFetch = @'
  function fetchAudioUrl() {
    return api('/api/track/' + TRACK_ID).then(function (res) {
      state.track = res.track;
      return res.track.audioUrl;
    });
  }
'@
$newFetch = @'
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
Rep $oldFetch $newFetch '拉流改为令牌+请求头+blob'

# 2) boot 里改为先拉流再挂载
Rep "        attachAudio(state.track.audioUrl);" "        app.classList.add('is-loading');
        fetchStreamUrl()
          .then(function (url) { attachAudio(url); })
          .catch(function (err) {
            app.classList.remove('is-loading');
            showFatal(err.message || '音频加载失败');
          });" 'boot 改为 fetchStreamUrl'

# 3) attachAudio：url 已是 blob
Rep @'
  function attachAudio(url) {
    var audio = el.audio;
    state.audioUrl = url;
    audio.src = url;
    audio.playbackRate = state.rate;
'@ @'
  function attachAudio(url) {
    var audio = el.audio;
    state.audioUrl = url;
    audio.src = url;
    audio.playbackRate = state.rate;
    app.classList.remove('is-loading');
'@ 'attachAudio 挂 blob'

# 4) refreshSource：重新拉流并保留进度
Rep @'
  function refreshSource() {
    if (state.refreshLock) return;
    state.refreshLock = true;
    var audio = el.audio;
    var at = audio.currentTime;
    var wasPlaying = !audio.paused;
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
  }
'@ @'
  function refreshSource() {
    if (state.refreshLock) return;
    state.refreshLock = true;
    var audio = el.audio;
    var at = audio.currentTime;
    var wasPlaying = !audio.paused;
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
  }
'@ 'refreshSource 重新拉流'

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
"已写入 player.js"
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"player.js EXIT=$LASTEXITCODE"
