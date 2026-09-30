#!/usr/bin/env node
/**
 * Visual check without Playwright: drives the system Chrome over the DevTools Protocol using
 * Node's built-in WebSocket. For each width it loads the page, scrolls through it so the
 * scroll-triggered animations run for real, then captures every section and a full-page image.
 *
 *   node scripts/cdp-shots.mjs [--widths 1440,1200,810,390] [--url http://localhost:5173/] [--out docs/visual-diff]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const WIDTHS = arg('widths', '1440,1200,810,390').split(',').map(Number);
const URL = arg('url', 'http://localhost:5173/');
const OUT = resolve(arg('out', 'docs/visual-diff'));
const PREFIX = arg('prefix', '');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SECTIONS = arg('sections', '#hero-section,#service-section,#about-us,#why-us,#process,#projects,#reviews,#areas-we-serve,#blogs,#faq,#cta,footer').split(',');
const LOGIN = process.argv.includes('--login'); // sign in to /admin first (credentials from backend/.env)
const BEFORE = arg('before', ''); // JS to run after load (e.g. open the chatbot) before capturing
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=D:/.tmp/chrome-cdp',
  'about:blank',
]);

let ws;
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const n = ++id;
    const timer = setTimeout(() => pending.delete(n) && rej(new Error(`CDP timeout: ${method}`)), 30000);
    pending.set(n, { res: (v) => (clearTimeout(timer), res(v)), rej: (e) => (clearTimeout(timer), rej(e)) });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) {
            const p = pending.get(d.id);
            pending.delete(d.id);
            d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
          }
        };
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools not reachable');
}

async function shot(file, full = false) {
  const params = { format: 'png' };
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 16000), scale: 0.5 };
  }
  const { data } = await send('Page.captureScreenshot', params);
  writeFileSync(file, Buffer.from(data, 'base64'));
}

try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  if (LOGIN) {
    const { readFileSync } = await import('node:fs');
    const envText = readFileSync(resolve('backend/.env'), 'utf8');
    const get = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1];
    await send('Page.navigate', { url: new globalThis.URL('/admin', URL).href });
    await sleep(1500);
    await evaluate(`fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email: ${JSON.stringify(get('ADMIN_EMAIL'))}, password: ${JSON.stringify(get('ADMIN_PASSWORD'))} }) }).then(r => r.status)`);
  }
  for (const w of WIDTHS) {
    const h = w <= 390 ? 844 : 900;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 390 });
    await send('Page.navigate', { url: URL });
    await sleep(3500);
    if (BEFORE) {
      await evaluate(BEFORE);
      await sleep(2500);
    }
    // Scroll through slowly so whileInView / scroll-linked animations run.
    await evaluate(`(async () => { const s = Math.floor(innerHeight * 0.6); for (let y = 0; y < document.documentElement.scrollHeight; y += s) { scrollTo(0, y); await new Promise(r => setTimeout(r, 180)); } scrollTo(0, 0); })()`);
    await sleep(1200);
    for (const sel of SECTIONS) {
      const found = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; scrollTo(0, el.getBoundingClientRect().top + scrollY - (${JSON.stringify(sel)} === '#hero-section' ? 0 : 0)); return true; })()`);
      if (!found) {
        console.warn(`[${w}] missing ${sel}`);
        continue;
      }
      await sleep(1400);
      await shot(`${OUT}/${PREFIX}${w}-${sel.replace(/[#.]/g, '')}.png`);
    }
    await evaluate('scrollTo(0,0)');
    await sleep(600);
    await shot(`${OUT}/${PREFIX}${w}-full.png`, true);
    console.log(`captured @${w}`);
  }
} finally {
  try {
    await send('Browser.close');
  } catch {
    chrome.kill();
  }
}
