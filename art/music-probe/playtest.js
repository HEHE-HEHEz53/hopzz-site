// 验证真实浏览器播放链路
const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9340',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cp8','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9340/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(5000);

  const out = {};
  out.srcPrefix = await ev("(document.getElementById('audio').src || '').slice(0, 46)");
  out.duration = await ev("Math.round(document.getElementById('audio').duration || 0)");
  out.loading = await ev("document.getElementById('app').classList.contains('is-loading')");

  await ev("document.getElementById('playBtn').click()");
  await sleep(1800);
  out.playing = await ev("!document.getElementById('audio').paused");
  out.currentTime = await ev("Math.round(document.getElementById('audio').currentTime * 10) / 10");
  out.activeLyric = await ev("(document.querySelector('.line.is-active') || {}).textContent || ''");

  // 拖动到 100 秒
  await ev("document.getElementById('progress').dispatchEvent(new PointerEvent('pointerdown',{clientX:200,pointerId:1,bubbles:true})); document.getElementById('progress').dispatchEvent(new PointerEvent('pointerup',{clientX:200,pointerId:1,bubbles:true}))");
  await sleep(1200);
  out.afterSeek = await ev("Math.round(document.getElementById('audio').currentTime)");
  out.lyricAfterSeek = await ev("(document.querySelector('.line.is-active') || {}).textContent || ''");

  out.lines = await ev("document.querySelectorAll('.line').length");
  out.anyActive = await ev("document.querySelectorAll('.line.is-active').length");
  out.lyricsScroll = await ev("document.getElementById('lyricsInner').scrollTop");
  out.exceptions = errs;
  console.log(JSON.stringify(out, null, 2));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
