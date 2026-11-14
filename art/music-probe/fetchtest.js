// 在页面上下文中手动执行拉流，定位卡点
const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9339',
  '--user-data-dir=D:\\DSH\\work\\shots\\music\\cp7','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 80; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9339/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise, timeout: 60000 });
    if (r.result && r.result.exceptionDetails) return { ERROR: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(4000);

  console.log('COOKIE?', await ev("document.cookie || '(js 读不到 httpOnly 是正常的)'"));
  console.log('TRACK', JSON.stringify(await ev(`fetch('/api/track/3f62b628-b19c-43b5-852f-11d58a5190e4',{credentials:'same-origin'}).then(r=>r.json()).then(d=>d.track.stream)`, true)));

  console.log('FETCH 结果', JSON.stringify(await ev(`(async () => {
    const t = await fetch('/api/track/3f62b628-b19c-43b5-852f-11d58a5190e4',{credentials:'same-origin'}).then(r=>r.json());
    const s = t.track.stream;
    const t0 = performance.now();
    const res = await fetch(s.url, { credentials:'same-origin', cache:'no-store',
      headers: { 'X-Music-Token': s.token, 'X-Music-Exp': String(s.exp) } });
    const status = res.status;
    const keyHex = res.headers.get('X-Stream-Key');
    const buf = await res.arrayBuffer();
    return { status, bytes: buf.byteLength, ms: Math.round(performance.now()-t0), hasKey: !!keyHex };
  })()`, true)));

  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
