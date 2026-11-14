// 用 Chrome DevTools Protocol 检查播放器布局与运行时错误
// 用法: node probe.js <url> <width> <height>
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);

const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9333',
  `--window-size=${width},${height}`,
  '--user-data-dir=D:\\DSH\\work\\shots\\music\\chrome-profile',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json')).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* not ready */ }
  }
  if (!target) { console.log('无法连接 DevTools'); child.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 700
  });
  await send('Page.navigate', { url });
  await sleep(3500);

  const expr = `(() => {
    const q = (s) => document.querySelector(s);
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const app = q('#app'), cover = q('.cover-wrap'), stage = q('#stage');
    const mini = q('#mini'), lyrics = q('#lyrics');
    return {
      viewport: [innerWidth, innerHeight],
      docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
      appRect: r(app), stageRect: r(stage), coverRect: r(cover),
      miniRect: r(mini), lyricsDisplay: getComputedStyle(q('#lyrics')).display,
      topbarDisplay: getComputedStyle(q('#topbar')).display,
      mini1: q('#miniLine1') ? q('#miniLine1').textContent : null,
      mini2: q('#miniLine2') ? q('#miniLine2').textContent : null,
      title: q('#title') ? q('#title').textContent : null,
      lines: document.querySelectorAll('.line').length,
      playRect: r(q('#playBtn')),
      bottomRect: r(q('.bottom')),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`;

  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(res.result && res.result.result ? res.result.result.value : res, null, 2));

  const errors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails && (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text));
  const logs = events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text);
  console.log('JS_ERRORS', JSON.stringify(errors));
  console.log('LOG_ERRORS', JSON.stringify(logs));

  ws.close();
  child.kill();
}

main().catch((e) => { console.error(e); child.kill(); process.exit(1); });
