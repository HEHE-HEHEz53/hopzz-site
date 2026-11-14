const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9343',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cpb','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9343/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : (r.result && r.result.exceptionDetails ? 'ERR:' + r.result.exceptionDetails.text : null); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(6000);

  // 等音频可播放后开始播放
  await ev("document.getElementById('playBtn').click()");
  await sleep(4000);
  console.log('playing', await ev("!document.getElementById('audio').paused"));
  console.log('t', await ev("Math.round(document.getElementById('audio').currentTime)"));

  // 跳到有歌词的位置
  await ev("document.getElementById('audio').currentTime = 100");
  await sleep(4000);
  console.log('t2', await ev("Math.round(document.getElementById('audio').currentTime)"));
  console.log('activeLine', await ev("(document.querySelector('.line.is-active') || {}).textContent || '(none)'"));
  console.log('mini1', await ev("document.getElementById('miniLine1').textContent"));
  console.log('scroll', await ev("Math.round(document.getElementById('lyricsInner').scrollTop)"));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
