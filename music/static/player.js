/*!
 * music.hopzz.top 播放器
 * © 2026 贺嘉（HEHEz53 / Hopzz）. 保留所有权利。
 * 本文件受版权保护，未经书面许可不得复制、再分发或用于商业用途。
 * 作品：不器用なピアノ（AI 生成，已取得商业授权）
 */
/* music.hopzz.top 播放器 v2
 * 桌面：左封面右歌词；手机：封面 + 两行歌词预览，上滑展开全屏歌词（顶栏小封面）
 */
(function () {
  'use strict';

  var TRACK_ID = (location.pathname.match(/\/player\/([A-Za-z0-9_-]+)/) || [])[1] || '';
  var STORE_KEY = 'hopzz.music.prefs.v1';

  function $(id) { return document.getElementById(id); }

  var app = $('app');
  var el = {
    app: app,
    cover: $('cover'),
    topbarCover: $('topbarCover'),
    title: $('title'),
    artist: $('artist'),
    topbarTitle: $('topbarTitle'),
    topbarArtist: $('topbarArtist'),
    mini: $('mini'),
    mini1: $('miniLine1'),
    mini2: $('miniLine2'),
    lyrics: $('lyrics'),
    lyricsInner: $('lyricsInner'),
    progress: $('progress'),
    fill: $('progressFill'),
    thumb: $('progressThumb'),
    timeNow: $('timeNow'),
    timeTotal: $('timeTotal'),
    playBtn: $('playBtn'),
    backBtn: $('backBtn'),
    fwdBtn: $('fwdBtn'),
    muteBtn: $('muteBtn'),
    volumeWrap: $('volumeWrap'),
    volume: $('volume'),
    moreBtn: $('moreBtn'),
    menu: $('menu'),
    transBtn: $('transBtn'),
    transSwitch: $('transSwitch'),
    speeds: $('speeds'),
    collapseBtn: $('collapseBtn'),
    audio: $('audio'),
    wash: $('wash')
  };

  var state = {
    track: null,
    lines: [],
    translation: [],
    active: -1,
    dragging: false,
    follow: true,
    followTimer: 0,
    expanded: false,
    showTrans: false,
    rate: 1,
    lastVolume: 85,
    audioUrl: '',
    refreshLock: false
  };

  // ---------------------------------------------------------------- 偏好

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var prefs = JSON.parse(raw);
      state.showTrans = !!prefs.showTrans;
      state.rate = Number(prefs.rate) || 1;
      if (typeof prefs.volume === 'number') state.lastVolume = prefs.volume;
    } catch (err) { /* ignore */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        showTrans: state.showTrans,
        rate: state.rate,
        volume: parseInt(el.volume.value, 10) || state.lastVolume
      }));
    } catch (err) { /* ignore */ }
  }

  // ---------------------------------------------------------------- 网络

  function api(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.ok === false) {
          var detail = data && (data.detail || data.error);
          throw new Error(detail || ('HTTP ' + res.status));
        }
        return data;
      });
    });
  }

  function fmt(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** 申请短时签名地址（2 分钟）。
   *  该地址还必须带页面会话 Cookie 且由播放页发起才会返回音频。 */
  function fetchAudioUrl() {
    return api('/api/track/' + TRACK_ID).then(function (res) {
      state.track = res.track;
      return res.track.audioUrl;
    });
  }

  // ---------------------------------------------------------------- 载入

  function boot() {
    if (!TRACK_ID) {
      showFatal('曲目不存在');
      return;
    }
    loadPrefs();

    Promise.all([api('/api/track/' + TRACK_ID), api('/api/lyrics/' + TRACK_ID)])
      .then(function (res) {
        state.track = res[0].track;
        state.lines = res[1].lines || [];
        state.translation = res[1].translation || [];
        applyTrack();
        renderLyrics();
        applyPrefs();
        bindEvents();
        attachAudio(state.track.audioUrl);
      })
      .catch(function (err) {
        showFatal(err.message || '载入失败');
      });
  }

  function showFatal(message) {
    if (el.title) el.title.textContent = '无法播放';
    if (el.artist) el.artist.textContent = message;
    if (el.playBtn) el.playBtn.disabled = true;
  }

  function applyTrack() {
    var t = state.track;
    document.title = (t.title || '未命名') + (t.artist ? ' — ' + t.artist : '');
    el.title.textContent = t.title || '未命名';
    el.artist.textContent = t.artist || '';
    el.topbarTitle.textContent = t.title || '未命名';
    el.topbarArtist.textContent = t.artist || '';

    if (t.hasCover) {
      el.cover.addEventListener('load', function () { tintFrom(el.cover); }, { once: true });
      el.cover.src = '/api/cover/' + TRACK_ID;
      el.topbarCover.src = '/api/cover/' + TRACK_ID;
    } else {
      el.cover.style.background = 'linear-gradient(140deg, #e7ded3, #c9b9a6)';
    }
    if (t.duration) el.timeTotal.textContent = fmt(t.duration);
  }

  /** 封面取色 → 页面柔光与强调色 */
  function tintFrom(img) {
    try {
      var size = 24;
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d', { willReadFrequently: false });
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        var max = Math.max(data[i], data[i + 1], data[i + 2]);
        var min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (max > 240 && min > 232) continue;  // 近白跳过
        if (max < 24) continue;                // 近黑跳过
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      if (!n) return;
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      var root = document.documentElement.style;
      root.setProperty('--accent', 'rgb(' + r + ',' + g + ',' + b + ')');
      root.setProperty('--accent-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.13)');
    } catch (err) { /* 取色失败保持默认 */ }
  }

  function applyPrefs() {
    var audio = el.audio;
    audio.playbackRate = state.rate;
    var vol = Math.min(100, Math.max(0, state.lastVolume));
    el.volume.value = String(vol);
    audio.volume = vol / 100;
    setTranslation(state.showTrans);
    el.speeds.querySelectorAll('.speed').forEach(function (btn) {
      btn.classList.toggle('is-on', Number(btn.dataset.rate) === state.rate);
    });
  }

  // ---------------------------------------------------------------- 歌词

  function renderLyrics() {
    el.lyricsInner.textContent = '';
    if (!state.lines.length) {
      var empty = document.createElement('p');
      empty.className = 'lyrics-empty';
      empty.textContent = '暂无歌词';
      el.lyricsInner.appendChild(empty);
      updateMini(-1);
      return;
    }
    var frag = document.createDocumentFragment();
    state.lines.forEach(function (line, index) {
      var row = document.createElement('p');
      row.className = 'line';
      row.dataset.index = String(index);
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      var ja = document.createElement('span');
      ja.className = 'ja';
      ja.textContent = line.text || '·';
      row.appendChild(ja);

      var zh = document.createElement('span');
      zh.className = 'zh';
      zh.textContent = state.translation[index] ? state.translation[index].text : '';
      if (!zh.textContent) zh.style.display = 'none';
      row.appendChild(zh);

      row.addEventListener('click', function () { jump(index); });
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jump(index); }
      });
      frag.appendChild(row);
    });
    el.lyricsInner.appendChild(frag);
    updateMini(-1);
  }

  function setTranslation(on) {
    state.showTrans = !!on;
    app.classList.toggle('show-trans', state.showTrans);
    el.transSwitch.classList.toggle('is-on', state.showTrans);
    el.transBtn.setAttribute('aria-checked', state.showTrans ? 'true' : 'false');
    if (!state.translation.length) {
      el.transBtn.disabled = true;
      el.transBtn.title = '暂无翻译';
    }
    savePrefs();
  }

  function jump(index) {
    var line = state.lines[index];
    if (!line) return;
    seekTo(line.time);
    setActive(index, true);
    if (el.audio.paused) el.audio.play().catch(function () {});
  }

  function setActive(index, forceScroll) {
    if (index === state.active && !forceScroll) {
      updateMini(index);
      return;
    }
    var rows = el.lyricsInner.querySelectorAll('.line');
    if (state.active >= 0 && rows[state.active]) {
      rows[state.active].classList.remove('is-active');
    }
    state.active = index;
    rows.forEach(function (row, i) {
      row.classList.toggle('is-near', Math.abs(i - index) === 1);
    });
    if (index >= 0 && rows[index]) {
      rows[index].classList.add('is-active');
      if (state.follow) centerRow(rows[index]);
    }
    updateMini(index);
  }

  function centerRow(row) {
    var box = el.lyricsInner;
    var target = row.offsetTop - box.clientHeight * 0.38;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  /** 换行时让文字从下方滑入（手机两行歌词的动态效果） */
  function swapLine(node, text) {
    if (!node || node.textContent === text) return;
    node.classList.add('is-entering');
    node.textContent = text;
    void node.offsetHeight; // 强制回流：先落到偏移态
    requestAnimationFrame(function () {
      node.classList.remove('is-entering');
    });
  }

  function updateMini(index) {
    if (!el.mini1) return;
    var playing = index >= 0;
    var first = playing ? state.lines[index] : (state.lines[0] || null);
    var second = playing ? state.lines[index + 1] : (state.lines[1] || null);
    swapLine(el.mini1, first ? first.text : '');
    el.mini1.classList.toggle('is-active', playing);
    swapLine(el.mini2, second ? second.text : '');
  }

  function updateActiveFromTime(time) {
    if (!state.lines.length) return;
    var index = -1;
    for (var i = 0; i < state.lines.length; i++) {
      if (time + 0.2 >= state.lines[i].time) index = i;
      else break;
    }
    setActive(index, false);
  }

  // ---------------------------------------------------------------- 音频

  function attachAudio(url) {
    var audio = el.audio;
    state.audioUrl = url;
    audio.src = url;
    audio.playbackRate = state.rate;
    app.classList.remove('is-loading');

    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration) && audio.duration > 0) {
        el.timeTotal.textContent = fmt(audio.duration);
      }
      app.classList.remove('is-loading');
    });

    audio.addEventListener('timeupdate', function () {
      if (!state.dragging) paintProgress(audio.currentTime, audio.duration);
      updateActiveFromTime(audio.currentTime);
    });

    audio.addEventListener('play', function () {
      app.classList.add('is-playing');
      el.playBtn.setAttribute('aria-label', '暂停');
    });

    audio.addEventListener('pause', function () {
      app.classList.remove('is-playing');
      el.playBtn.setAttribute('aria-label', '播放');
    });

    audio.addEventListener('waiting', function () { app.classList.add('is-loading'); });
    audio.addEventListener('playing', function () { app.classList.remove('is-loading'); });
    audio.addEventListener('canplay', function () { app.classList.remove('is-loading'); });

    audio.addEventListener('ended', function () {
      app.classList.remove('is-loading');
      paintProgress(0, audio.duration);
      setActive(-1, false);
    });

    audio.addEventListener('error', function () {
      app.classList.remove('is-loading');
      // 签名过期：静默换新地址，保留进度与播放状态
      if (audio.error && (audio.error.code === 2 || audio.error.code === 4)) {
        refreshSource();
      }
    });
  }

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

  function togglePlay() {
    var audio = el.audio;
    if (audio.paused) {
      app.classList.add('is-loading');
      audio.play().catch(function () { app.classList.remove('is-loading'); });
    } else {
      audio.pause();
    }
  }

  function seekTo(seconds) {
    var audio = el.audio;
    var duration = audio.duration;
    if (!isFinite(duration) || duration <= 0) return;
    var next = Math.max(0, Math.min(duration - 0.05, seconds));
    audio.currentTime = next;
    paintProgress(next, duration);
  }

  // ---------------------------------------------------------------- 进度

  function paintProgress(current, duration) {
    var ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
    el.fill.style.width = (ratio * 100).toFixed(2) + '%';
    el.thumb.style.left = (ratio * 100).toFixed(2) + '%';
    el.timeNow.textContent = fmt(current);
    if (duration > 0) el.timeTotal.textContent = fmt(duration);
    el.progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  function ratioFrom(clientX) {
    var rect = el.progress.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  // ---------------------------------------------------------------- 展开 / 收起

  function expand() {
    if (state.expanded) return;
    state.expanded = true;
    app.classList.add('is-expanded');
    var rows = el.lyricsInner.querySelectorAll('.line');
    if (state.active >= 0 && rows[state.active]) {
      requestAnimationFrame(function () { centerRow(rows[state.active]); });
    }
  }

  function collapse() {
    if (!state.expanded) return;
    state.expanded = false;
    app.classList.remove('is-expanded');
  }

  // ---------------------------------------------------------------- 事件

  function bindEvents() {
    el.playBtn.addEventListener('click', togglePlay);
    el.backBtn.addEventListener('click', function () { seekTo(el.audio.currentTime - 10); });
    el.fwdBtn.addEventListener('click', function () { seekTo(el.audio.currentTime + 10); });
    el.collapseBtn.addEventListener('click', collapse);

    // 进度条：指针拖拽
    el.progress.addEventListener('pointerdown', function (event) {
      state.dragging = true;
      el.progress.setPointerCapture(event.pointerId);
      preview(event.clientX);
    });
    el.progress.addEventListener('pointermove', function (event) {
      if (!state.dragging) return;
      preview(event.clientX);
    });
    el.progress.addEventListener('pointerup', function (event) {
      if (!state.dragging) return;
      var ratio = preview(event.clientX);
      state.dragging = false;
      var duration = el.audio.duration || 0;
      seekTo(ratio * duration);
    });
    el.progress.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 15 : 5;
      if (event.key === 'ArrowRight') { seekTo(el.audio.currentTime + step); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { seekTo(el.audio.currentTime - step); event.preventDefault(); }
    });

    function preview(clientX) {
      var ratio = ratioFrom(clientX);
      var duration = el.audio.duration || (state.track && state.track.duration) || 0;
      el.fill.style.width = (ratio * 100).toFixed(2) + '%';
      el.thumb.style.left = (ratio * 100).toFixed(2) + '%';
      el.timeNow.textContent = fmt(ratio * duration);
      return ratio;
    }

    // 音量
    el.volume.addEventListener('input', function () {
      var value = parseInt(el.volume.value, 10) || 0;
      el.audio.volume = value / 100;
      el.audio.muted = value === 0;
      el.volumeWrap.classList.toggle('is-muted', value === 0);
      if (value > 0) state.lastVolume = value;
      savePrefs();
    });

    el.muteBtn.addEventListener('click', function () {
      var muted = el.audio.muted || el.audio.volume === 0;
      if (muted) {
        var vol = state.lastVolume || 85;
        el.audio.muted = false;
        el.audio.volume = vol / 100;
        el.volume.value = String(vol);
        el.volumeWrap.classList.remove('is-muted');
      } else {
        state.lastVolume = parseInt(el.volume.value, 10) || 85;
        el.audio.muted = true;
        el.volume.value = '0';
        el.volumeWrap.classList.add('is-muted');
      }
      savePrefs();
    });

    // 更多菜单
    el.moreBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = el.menu.hidden;
      el.menu.hidden = !open;
      el.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (event) {
      if (el.menu.hidden) return;
      if (el.menu.contains(event.target) || el.moreBtn.contains(event.target)) return;
      el.menu.hidden = true;
      el.moreBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !el.menu.hidden) {
        el.menu.hidden = true;
        el.moreBtn.setAttribute('aria-expanded', 'false');
      }
    });

    el.transBtn.addEventListener('click', function () { setTranslation(!state.showTrans); });

    el.speeds.addEventListener('click', function (event) {
      var btn = event.target.closest('.speed');
      if (!btn) return;
      state.rate = Number(btn.dataset.rate) || 1;
      el.audio.playbackRate = state.rate;
      el.speeds.querySelectorAll('.speed').forEach(function (item) {
        item.classList.toggle('is-on', item === btn);
      });
      savePrefs();
    });

    // 歌词滚动：手动浏览后暂停跟随
    el.lyricsInner.addEventListener('wheel', pauseFollow, { passive: true });
    el.lyricsInner.addEventListener('touchmove', pauseFollow, { passive: true });

    // 手机手势：上滑展开 / 下滑收起
    bindGestures();

    // 键盘
    document.addEventListener('keydown', function (event) {
      if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      else if (event.key === 'ArrowRight') seekTo(el.audio.currentTime + 5);
      else if (event.key === 'ArrowLeft') seekTo(el.audio.currentTime - 5);
    });

    // 防下载：只屏蔽播放器内的右键与长按
    app.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    app.addEventListener('dragstart', function (event) { event.preventDefault(); });
  }

  function pauseFollow() {
    state.follow = false;
    if (state.followTimer) clearTimeout(state.followTimer);
    state.followTimer = setTimeout(function () {
      state.follow = true;
      var rows = el.lyricsInner.querySelectorAll('.line');
      if (state.active >= 0 && rows[state.active]) centerRow(rows[state.active]);
    }, 4000);
  }

  function bindGestures() {
    var startY = 0;
    var startX = 0;
    var tracking = false;

    function onStart(event) {
      if (!event.touches || event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      tracking = true;
    }

    function onEnd(event) {
      if (!tracking) return;
      tracking = false;
      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      var dy = touch.clientY - startY;
      var dx = touch.clientX - startX;
      if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx) * 1.2) return;

      if (!state.expanded && dy < 0) {
        expand();
      } else if (state.expanded && dy > 0 && el.lyricsInner.scrollTop <= 4) {
        collapse();
      }
    }

    el.stage = $('stage');
    ['stage', 'mini'].forEach(function (key) {
      var node = $(key);
      if (!node) return;
      node.addEventListener('touchstart', onStart, { passive: true });
      node.addEventListener('touchend', onEnd, { passive: true });
    });
    el.lyricsInner.addEventListener('touchstart', onStart, { passive: true });
    el.lyricsInner.addEventListener('touchend', onEnd, { passive: true });

    // 点击两行歌词也能展开
    el.mini.addEventListener('click', expand);
    el.mini.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(); }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

  // 移动端视口高度（地址栏收起时不跳动）
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      document.documentElement.style.setProperty('--vh', window.visualViewport.height + 'px');
    });
  }
})();
