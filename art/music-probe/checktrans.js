// 检查桌面端翻译是否渲染
const { spawn } = require('node:child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const child = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9336',
  '--user-data-dir=D:\\DSH\\work\\shots\\music\\cp4','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 60; i++) { await sleep(300);
    try { const list = await (await fetch('http://127.0.0.1:9336/json')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(4000);
  await ev("document.getElementById('transBtn').click()");
  await sleep(600);
  console.log(JSON.stringify(await ev(`(() => {
    const app = document.getElementById('app');
    const zh = document.querySelectorAll('.line .zh');
    let visible = 0;
    zh.forEach(n => { const b = n.getBoundingClientRect(); if (b.height > 0) visible++; });
    return {
      showTrans: app.classList.contains('show-trans'),
      zhCount: zh.length,
      visible,
      firstZh: zh[0] ? zh[0].textContent : null,
      firstZhDisplay: zh[0] ? getComputedStyle(zh[0]).display : null,
      firstZhRect: zh[0] ? Math.round(zh[0].getBoundingClientRect().height) : 0
    };
  })()`), null, 2));
  ws.close(); child.kill();
})().catch(e => { console.error(e); child.kill(); });
