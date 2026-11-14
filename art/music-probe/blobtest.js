// 验证 blob 播放链路（无直链）
const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9337',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cp5','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9337/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(9000);  // 等 5MB 拉完 + 还原

  const out = {};
  out.src = await ev("document.getElementById('audio').src.slice(0, 24)");
  out.isBlob = await ev("document.getElementById('audio').src.startsWith('blob:')");
  out.duration = await ev("Math.round(document.getElementById('audio').duration || 0)");
  out.loading = await ev("document.getElementById('app').classList.contains('is-loading')");
  out.fatal = await ev("document.getElementById('title').textContent");

  await ev("document.getElementById('playBtn').click()");
  await sleep(1600);
  out.playing = await ev("!document.getElementById('audio').paused");
  out.currentTime = await ev("Math.round(document.getElementById('audio').currentTime * 10) / 10");

  // 暂停在 30 秒后跳转，验证 seek 正常
  await ev("document.getElementById('audio').currentTime = 30");
  await sleep(400);
  out.seekTime = await ev("Math.round(document.getElementById('audio').currentTime)");
  out.activeLyric = await ev("(document.querySelector('.line.is-active')||{}).textContent || ''");

  // 版权信息
  out.copyrightVisible = await ev("document.getElementById('copyrightLine').textContent");

  console.log(JSON.stringify(out, null, 2));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
