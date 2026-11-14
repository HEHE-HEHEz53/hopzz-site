const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9335',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cp3','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 60; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9335/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (method, params) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(4200);

  const out = {};
  out.lines = await evaluate("document.querySelectorAll('.line').length");
  out.mini = await evaluate("[document.getElementById('miniLine1').textContent, document.getElementById('miniLine2').textContent]");

  // 点击第 5 行歌词 → 应 seek
  await evaluate("document.querySelectorAll('.line')[4].click()");
  await sleep(900);
  out.seek = await evaluate("({ t: document.getElementById('audio').currentTime, want: 33.94, playing: !document.getElementById('audio').paused, loading: document.getElementById('app').classList.contains('is-loading') })");

  // 打开更多菜单 → 菜单可见
  await evaluate("document.getElementById('moreBtn').click()");
  await sleep(300);
  out.menuOpen = await evaluate("!document.getElementById('menu').hidden");

  // 打开翻译
  await evaluate("document.getElementById('transBtn').click()");
  await sleep(300);
  out.translation = await evaluate("({ on: document.getElementById('app').classList.contains('show-trans'), zhVisible: getComputedStyle(document.querySelector('.line .zh')).display !== 'none', zhText: document.querySelector('.line .zh').textContent })");

  // 切换倍速
  await evaluate("document.querySelector('.speed[data-rate=\"1.25\"]').click()");
  await sleep(200);
  out.rate = await evaluate("document.getElementById('audio').playbackRate");

  // 展开歌词
  await evaluate("document.getElementById('mini').click()");
  await sleep(500);
  out.expanded = await evaluate("({ cls: document.getElementById('app').classList.contains('is-expanded'), topbar: getComputedStyle(document.getElementById('topbar')).display, lyrics: getComputedStyle(document.getElementById('lyrics')).display, stage: getComputedStyle(document.getElementById('stage')).display })");

  // 收起
  await evaluate("document.getElementById('collapseBtn').click()");
  await sleep(300);
  out.collapsed = await evaluate("document.getElementById('app').classList.contains('is-expanded')");

  // 播放
  await evaluate("document.getElementById('playBtn').click()");
  await sleep(1200);
  out.play = await evaluate("({ playing: !document.getElementById('audio').paused, cls: document.getElementById('app').classList.contains('is-playing'), t: document.getElementById('audio').currentTime })");

  console.log(JSON.stringify(out, null, 2));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });