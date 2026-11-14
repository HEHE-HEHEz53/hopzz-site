// CDP 截图 + 布局检查
// 用法: node shot.js <url> <width> <height> <outfile> [expand]
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const outFile = process.argv[5];
const doExpand = process.argv[6] === 'expand';

const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9334',
  '--user-data-dir=D:\\DSH\\work\\shots\\music\\chrome-profile2',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const list = await (await fetch('http://127.0.0.1:9334/json')).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* retry */ }
  }
  if (!target) { console.log('no devtools'); child.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 700
  });
  await send('Page.navigate', { url });
  await sleep(3800);

  const action = process.argv[6] || '';
  if (action) {
    const steps = [];
    if (action.includes('trans')) steps.push("document.getElementById('transBtn').click()");
    if (action.includes('expand')) steps.push("document.getElementById('app').classList.add('is-expanded')");
    if (action.includes('mid')) steps.push("document.querySelectorAll('.line')[11].click()");
    for (const step of steps) {
      await send('Runtime.evaluate', { expression: step });
      await sleep(400);
    }
    await sleep(900);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (shot.result && shot.result.data) {
    fs.writeFileSync(outFile, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', outFile, fs.statSync(outFile).size, 'bytes');
  } else {
    console.log('screenshot failed', JSON.stringify(shot).slice(0, 200));
  }

  ws.close();
  child.kill();
}

main().catch((e) => { console.error(e); child.kill(); process.exit(1); });
