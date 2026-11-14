const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9341',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cp9','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9341/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : (r.result && r.result.exceptionDetails ? 'ERR:' + r.result.exceptionDetails.text : null); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(4000);
  console.log('DBG1', JSON.stringify(await ev('window.__dbg && window.__dbg()')));
  await ev("document.getElementById('audio').currentTime = 120");
  await sleep(1200);
  console.log('DBG2', JSON.stringify(await ev('window.__dbg && window.__dbg()')));
  console.log('ACTIVE', await ev("document.querySelectorAll('.line.is-active').length"));
  console.log('T', await ev("document.getElementById('audio').currentTime"));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });