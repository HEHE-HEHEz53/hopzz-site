/* music.hopzz.top 播放器逻辑
 * - 音频走短时签名 URL，过期自动重取
 * - 歌词点击跳转 / 自动滚动 / 手动滚动后暂停跟随
 * - 封面取色，让强调色跟着封面走
 */
(function () {
  'use strict';

  var TRACK_ID = (location.pathname.match(/\/player\/([A-Za-z0-9_-]+)/) || [])[1] || '';
  var el = {
    player: document.getElementById('player'),
    cover: document.getElementById('cover'),
    title: document.getElementById('title'),
    artist: document.getElementById('artist'),
    kicker: document.getElementById('kicker'),
    signature: document.getElementById('signature'),
    progress: document.getElementById('progress'),
    fill: document.getElementById('progressFill'),
    thumb: document.getElementById('progressThumb'),
    timeNow: document.getElementById('timeNow'),
    timeTotal: document.getElementById('timeTotal'),
    playBtn: document.getElementById('playBtn'),
    backBtn: document.getElementById('backBtn'),
    fwdBtn: document.getElementById('fwdBtn'),
    muteBtn: document.getElementById('muteBtn'),
    volume: document.getElementById('volume'),
    lyrics: document.getElementById('lyrics'),
    lyricsEmpty: document.getElementById('lyricsEmpty'),
    audio: document.getElementById('audio'),
    spinner: document.getElementById('spinner')
  };

  var state = {
    track: null,
    lines: [],
    activeIndex: -1,
    dragging: false,
    followLyrics: true,
    followTimer: 0,
    seeking: false,
    audioUrl: '',
    lastVol: 82
  };

  function api(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.ok === false) {
          throw new Error((data && (data.detail || data.error)) || ('HTTP ' + res.status));
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

  // ---------------------------------------------------------------- 载入

  function load() {
    if (!TRACK_ID) { showError('地址里缺少曲目编号'); return; }
    Promise.all([api('/api/track/' + TRACK_ID), api('/api/lyrics/' + TRACK_ID)]).then(function (res) {
      state.track = res[0].track;
      state.lines = (res[1].lines || []);
      applyTrack();
      renderLyrics();
      attachAudio();
    }).catch(function (err) {
      showError(err.message || '曲目载入失败');
    });
  }

  function showError(message) {
    if (el.title) el.title.textContent = '暂时无法播放';
    if (el.artist) el.artist.textContent = message;
    if (el.playBtn) el.playBtn.disabled = true;
  }

  function applyTrack() {
    var t = state.track;
    document.title = (t.title || '未命名') + (t.artist ? ' · ' + t.artist : '');
    el.title.textContent = t.title || '未命名曲目';
    el.artist.textContent = t.artist || '';
    if (el.signature) el.signature.textContent = t.artist || 'HEHEz53';
    el.kicker.textContent = t.album ? t.album : 'now playing';

    if (t.hasCover) {
      el.cover.src = '/api/cover/' + TRACK_ID + '?v=' + Date.now();
      el.cover.addEventListener('load', function () { tintFromCover(el.cover); });
    } else {
      el.cover.removeAttribute('src');
      el.cover.style.background = 'linear-gradient(135deg, #d8c7b4, #a98f76)';
    }
  }

  /** 从封面取一个主色，作为强调色 */
  function tintFromCover(img) {
    try {
      var size = 32;
      var canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < data.length; i += 4) {
        var alpha = data[i + 3];
        if (alpha < 200) continue;
        // 跳过接近纯白/纯黑的像素，颜色才有代表性
        var max = Math.max(data[i], data[i + 1], data[i + 2]);
        var min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (max > 236 && min > 226) continue;
        if (max < 26) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      if (!n) return;
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      // 压低饱和、保证在浅纸上可读
      var accent = 'rgb(' + r + ',' + g + ',' + b + ')';
      document.documentElement.style.setProperty('--accent', accent);
      document.documentElement.style.setProperty(
        '--accent-soft',
        'rgba(' + r + ',' + g + ',' + b + ',0.13)'
      );
    } catch (err) {
      /* 跨域或取色失败就保留默认色 */
    }
  }

  // ---------------------------------------------------------------- 音频

  function audioSrc() {
    // 重新申请签名地址（过期后用）
    return api('/api/track/' + TRACK_ID).then(function (res) {
      state.track = res.track;
      return res.track.audioUrl;
    });
  }

  function attachAudio() {
    var audio = el.audio;
    audio.preload = 'metadata';

    audioSrc().then(function (url) {
      state.audioUrl = url;
      audio.src = url;
    });

    audio.addEventListener('loadedmetadata', function () {
      el.timeTotal.textContent = fmt(audio.duration || state.track.duration);
    });

    audio.addEventListener('timeupdate', function () {
      if (!state.dragging) updateProgress(audio.currentTime, audio.duration);
      updateActiveLine(audio.currentTime);
    });

    audio.addEventListener('play', function () {
      el.player.classList.add('is-playing');
      el.playBtn.querySelector('.i-play').hidden = true;
      el.playBtn.querySelector('.i-pause').hidden = false;
      el.playBtn.setAttribute('aria-label', '暂停');
      el.playBtn.title = '暂停';
    });

    audio.addEventListener('pause', function () {
      el.player.classList.remove('is-playing');
      el.playBtn.querySelector('.i-play').hidden = false;
      el.playBtn.querySelector('.i-pause').hidden = true;
      el.playBtn.setAttribute('aria-label', '播放');
      el.playBtn.title = '播放';
    });

    audio.addEventListener('waiting', function () { el.spinner.hidden = false; });
    audio.addEventListener('playing', function () { el.spinner.hidden = true; });
    audio.addEventListener('canplay', function () { el.spinner.hidden = true; });

    audio.addEventListener('ended', function () {
      el.spinner.hidden = true;
      updateProgress(0, audio.duration);
    });

    audio.addEventListener('error', function () {
      el.spinner.hidden = true;
      // 链接过期（403）时重取一次
      if (audio.error && (audio.error.code === 4 || audio.error.code === 2)) {
        audioSrc().then(function (url) {
          var wasPlaying = !audio.paused;
          state.audioUrl = url;
          audio.src = url;
          if (wasPlaying) audio.play().catch(function () {});
        }).catch(function () {});
      }
    });

    audio.volume = (parseInt(el.volume.value, 10) || 82) / 100;
  }

  function togglePlay() {
    var audio = el.audio;
    if (audio.paused) {
      el.spinner.hidden = false;
      audio.play().catch(function () { el.spinner.hidden = true; });
    } else {
      audio.pause();
    }
  }

  function seekTo(seconds) {
    var audio = el.audio;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    var next = Math.max(0, Math.min(audio.duration - 0.05, seconds));
    audio.currentTime = next;
    updateProgress(next, audio.duration);
  }

  // ---------------------------------------------------------------- 进度条

  function updateProgress(current, duration) {
    var ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
    el.fill.style.width = (ratio * 100).toFixed(2) + '%';
    el.thumb.style.left = (ratio * 100).toFixed(2) + '%';
    el.timeNow.textContent = fmt(current);
    if (duration > 0) el.timeTotal.textContent = fmt(duration);
    el.progress.setAttribute('aria-valuenow', Math.round(ratio * 100));
  }

  function ratioFromEvent(event) {
    var rect = el.progress.getBoundingClientRect();
    var x = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }

  function bindProgress() {
    var audio = el.audio;

    function preview(event) {
      var ratio = ratioFromEvent(event);
      var duration = audio.duration || state.track.duration || 0;
      el.fill.style.width = (ratio * 100).toFixed(2) + '%';
      el.thumb.style.left = (ratio * 100).toFixed(2) + '%';
      el.timeNow.textContent = fmt(ratio * duration);
      return ratio;
    }

    el.progress.addEventListener('pointerdown', function (event) {
      state.dragging = true;
      el.progress.setPointerCapture(event.pointerId);
      preview(event);
    });

    el.progress.addEventListener('pointermove', function (event) {
      if (!state.dragging) return;
      preview(event);
    });

    el.progress.addEventListener('pointerup', function (event) {
      if (!state.dragging) return;
      var ratio = preview(event);
      state.dragging = false;
      var duration = audio.duration || state.track.duration || 0;
      seekTo(ratio * duration);
    });

    el.progress.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 15 : 5;
      if (event.key === 'ArrowRight') { seekTo(audio.currentTime + step); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { seekTo(audio.currentTime - step); event.preventDefault(); }
      if (event.key === 'Home') { seekTo(0); event.preventDefault(); }
    });
  }

  // ---------------------------------------------------------------- 歌词

  function renderLyrics() {
    el.lyrics.textContent = '';
    if (!state.lines.length) {
      el.lyricsEmpty.hidden = false;
      el.lyrics.appendChild(el.lyricsEmpty);
      return;
    }
    var frag = document.createDocumentFragment();
    state.lines.forEach(function (line, index) {
      var p = document.createElement('p');
      p.className = 'line';
      p.dataset.time = String(line.time);
      p.dataset.index = String(index);
      p.textContent = line.text || '·';
      p.setAttribute('role', 'button');
      p.setAttribute('tabindex', '0');
      p.title = '跳到 ' + fmt(line.time);
      p.addEventListener('click', function () { jumpToLine(index); });
      p.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          jumpToLine(index);
        }
      });
      frag.appendChild(p);
    });
    el.lyrics.appendChild(frag);
  }

  function jumpToLine(index) {
    var line = state.lines[index];
    if (!line) return;
    seekTo(line.time);
    setActive(index, true);
    if (el.audio.paused) el.audio.play().catch(function () {});
  }

  function setActive(index, forceScroll) {
    if (index === state.activeIndex && !forceScroll) return;
    var nodes = el.lyrics.querySelectorAll('.line');
    if (state.activeIndex >= 0 && nodes[state.activeIndex]) {
      nodes[state.activeIndex].classList.remove('is-active');
    }
    state.activeIndex = index;
    if (index < 0 || !nodes[index]) return;
    nodes.forEach(function (node, i) {
      node.classList.toggle('is-near', Math.abs(i - index) === 1);
    });
    nodes[index].classList.add('is-active');
    if (state.followLyrics) centerLine(nodes[index]);
  }

  function centerLine(node) {
    var box = el.lyrics;
    var target = node.offsetTop - box.clientHeight * 0.42 + node.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function updateActiveLine(currentTime) {
    if (!state.lines.length) return;
    var index = -1;
    for (var i = 0; i < state.lines.length; i++) {
      if (currentTime + 0.18 >= state.lines[i].time) index = i;
      else break;
    }
    setActive(index, false);
  }

  function bindLyricsScroll() {
    el.lyrics.addEventListener('wheel', pauseFollow, { passive: true });
    el.lyrics.addEventListener('touchmove', pauseFollow, { passive: true });
    el.lyrics.addEventListener('pointerdown', pauseFollow);
  }

  function pauseFollow() {
    state.followLyrics = false;
    if (state.followTimer) clearTimeout(state.followTimer);
    state.followTimer = setTimeout(function () {
      state.followLyrics = true;
      var nodes = el.lyrics.querySelectorAll('.line');
      if (state.activeIndex >= 0 && nodes[state.activeIndex]) centerLine(nodes[state.activeIndex]);
    }, 4000);
  }

  // ---------------------------------------------------------------- 事件绑定

  function bindControls() {
    el.playBtn.addEventListener('click', togglePlay);

    el.backBtn.addEventListener('click', function () {
      seekTo(el.audio.currentTime - 10);
    });
    el.fwdBtn.addEventListener('click', function () {
      seekTo(el.audio.currentTime + 10);
    });

    el.volume.addEventListener('input', function () {
      var value = (parseInt(el.volume.value, 10) || 0) / 100;
      el.audio.volume = value;
      el.audio.muted = value === 0;
      if (value > 0) state.lastVol = parseInt(el.volume.value, 10);
    });

    el.muteBtn.addEventListener('click', function () {
      if (el.audio.muted || el.audio.volume === 0) {
        el.audio.muted = false;
        el.audio.volume = (state.lastVol || 82) / 100;
        el.volume.value = String(state.lastVol || 82);
      } else {
        state.lastVol = parseInt(el.volume.value, 10) || 82;
        el.audio.muted = true;
        el.volume.value = '0';
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      if (event.key === 'ArrowRight') seekTo(el.audio.currentTime + 5);
      if (event.key === 'ArrowLeft') seekTo(el.audio.currentTime - 5);
    });

    // 防下载：禁右键 / 禁拖拽（不能防住专业手段，只是增加门槛）
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
    document.addEventListener('dragstart', function (event) {
      event.preventDefault();
    });
  }

  function boot() {
    if (!el.player) return;
    bindControls();
    bindProgress();
    bindLyricsScroll();
    load();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
