// 抓 JS 异常与 console
const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9338',
  '--autoplay-policy=no-user-gesture-required','--user-data-dir=D:\\DSH\\work\\shots\\music\\cp6','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9338/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(12000);

  console.log('STATE', JSON.stringify(await ev(`(() => {
    const a = document.getElementById('audio');
    return { src: a.src ? a.src.slice(0, 30) : '', dur: Math.round(a.duration || 0), loading: document.getElementById('app').classList.contains('is-loading'), title: document.getElementById('title').textContent };
  })()`), null, 2));

  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => (e.params.exceptionDetails.exception && (e.params.exceptionDetails.exception.description || e.params.exceptionDetails.exception.value)) || e.params.exceptionDetails.text);
  const logs = events.filter(e => e.method === 'Log.entryAdded').map(e => e.params.entry.level + ': ' + e.params.entry.text);
  console.log('EXCEPTIONS', JSON.stringify(errors, null, 2));
  console.log('LOGS', JSON.stringify(logs.slice(-12), null, 2));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
