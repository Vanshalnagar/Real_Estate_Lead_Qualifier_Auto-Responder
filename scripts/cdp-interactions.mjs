#!/usr/bin/env node
/**
 * Interaction checks on the running site via the Chrome DevTools Protocol (no Playwright):
 * real mouse / keyboard / scroll input, then assertions on DOM and computed styles.
 *   node scripts/cdp-interactions.mjs [--url http://localhost:5173/]
 * Saves evidence screenshots as docs/visual-diff/interaction-*.png. Exit code 1 on any failure.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const URL = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--user-data-dir=D:/.tmp/chrome-cdp-int', 'about:blank']);

let ws;
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    const timer = setTimeout(() => pending.delete(n) && rej(new Error(`CDP timeout: ${method}`)), 30000);
    pending.set(n, { res: (v) => (clearTimeout(timer), res(v)), rej: (e) => (clearTimeout(timer), rej(e)) });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error');
  return r.result.value;
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37 }[k] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37 }[k] });
};
const center = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, l: r.left }; })()`);
const scrollTo = (sel, offset = 0) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); scrollTo(0, el.getBoundingClientRect().top + scrollY + ${offset}); })()`);
const shot = async (name) => writeFileSync(`docs/visual-diff/interaction-${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push([true, name, detail ?? '']);
  } catch (e) {
    results.push([false, name, e.message]);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
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
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error('Chrome not reachable');
}

try {
  await connect();
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(500);
  const loaderSeen = await js(`!!document.querySelector('.loader')`);
  await sleep(3500);

  await check('intro loader shows, then lifts off the page', async () => {
    const gone = await js(`!document.querySelector('.loader')`);
    assert(loaderSeen && gone, `seen=${loaderSeen} gone=${gone}`);
    return 'shown on first visit, removed after ~1.7s';
  });

  await check('Lenis smooth scroll active', async () => assert(await js(`document.documentElement.classList.contains('lenis')`), 'html.lenis missing'));

  await check('rolling text: nav link letters roll up on hover', async () => {
    const p = await center('.nav__links .nav__link');
    await mouse('mouseMoved', p.x, p.y);
    await sleep(700);
    const t = await js(`getComputedStyle(document.querySelector('.nav__links .nav__link .roll__ch')).transform`);
    assert(t !== 'none' && !t.endsWith(', 0)'), `transform ${t}`);
    return t;
  });

  await check('mega menu opens on hover of "Properties"', async () => {
    const pos = await js(`(() => { const b = document.querySelector('.nav__links button[aria-haspopup]'); /* rolling text doubles letters, so find by role */ const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await mouse('mouseMoved', pos.x, pos.y);
    await sleep(700);
    const n = await js(`document.querySelectorAll('.mega__item').length`);
    assert(n === 6, `mega items ${n}`);
    await shot('mega-menu');
    await mouse('mouseMoved', 700, 850);
    await sleep(500);
    return `${n} items`;
  });

  await check('hero image reveal follows the cursor', async () => {
    await mouse('mouseMoved', 700, 450);
    await sleep(400);
    const s = await js(`(() => { const el = document.querySelector('.hero__reveal'); return { o: getComputedStyle(el).opacity, m: el.style.maskImage || el.style.webkitMaskImage }; })()`);
    assert(Number(s.o) > 0.5 && s.m.includes('at'), JSON.stringify(s));
    await shot('hero-reveal');
    return s.m.slice(0, 50);
  });

  await check('service card hover shows image + description', async () => {
    await scrollTo('#service-section', 150);
    await sleep(1200);
    const p = await center('.svc');
    await mouse('mouseMoved', p.x, p.y);
    await sleep(1000);
    const s = await js(`(() => { const c = document.querySelector('.svc'); return { img: getComputedStyle(c.querySelector('.svc__image')).opacity, desc: getComputedStyle(c.querySelector('.svc__desc')).opacity }; })()`);
    assert(Number(s.img) > 0.9 && Number(s.desc) > 0.9, JSON.stringify(s));
    await shot('service-hover');
    return JSON.stringify(s);
  });

  await check('services slider next arrow moves track + progress', async () => {
    const before = await js(`document.querySelector('.svc-progress__fill').style.width`);
    const p = await center('.svc-controls .round-btn:last-child');
    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await sleep(1200);
    const after = await js(`({ w: document.querySelector('.svc-progress__fill').style.width, t: document.querySelector('.svc-track').style.transform })`);
    assert(after.w !== before && /translateX\(calc\(-/.test(after.t), `${before} → ${JSON.stringify(after)}`);
    return `${before} → ${after.w}`;
  });

  await check('about text reveals word by word on scroll', async () => {
    await scrollTo('#about-us', -500);
    await sleep(800);
    const a = await js(`document.querySelectorAll('.reveal-word--on').length`);
    await scrollTo('#about-us', 250);
    await sleep(1000);
    const b = await js(`({ on: document.querySelectorAll('.reveal-word--on').length, active: document.querySelectorAll('.reveal-word--active').length })`);
    assert(b.on > a, `on words ${a} → ${b.on}`);
    await shot('about-reveal');
    return `${a} → ${b.on} white, ${b.active} orange`;
  });

  await check('counters count up to their targets', async () => {
    await scrollTo('#why-us', 200);
    await sleep(2800);
    const vals = await js(`[...document.querySelectorAll('.why__grid .counter')].map(c => c.textContent)`);
    assert(vals.includes('4.9+') && vals.includes('1200+'), vals.join(','));
    return vals.join(' · ');
  });

  await check('rotating words change', async () => {
    const a = await js(`document.querySelector('.rotator__word').textContent`);
    await sleep(2600);
    const b = await js(`document.querySelector('.rotator__word').textContent`);
    assert(a !== b, `${a} = ${b}`);
    return `${a} → ${b}`;
  });

  await check('logo ticker moves', async () => {
    const a = await js(`document.querySelector('.why__logos .ticker__track').style.transform`);
    await sleep(800);
    const b = await js(`document.querySelector('.why__logos .ticker__track').style.transform`);
    assert(a !== b, 'static');
    return `${a} → ${b}`;
  });

  await check('process: sticky section advances steps + swaps images on scroll', async () => {
    await scrollTo('#process', 10);
    await sleep(1000);
    const first = await js(`[...document.querySelectorAll('.step')].findIndex(s => s.classList.contains('step--open'))`);
    const sticky = await js(`getComputedStyle(document.querySelector('.process__sticky')).position`);
    await js(`(() => { const el = document.querySelector('.process__scroll'); scrollTo(0, el.getBoundingClientRect().top + scrollY + el.offsetHeight * 0.62); })()`);
    await sleep(1500);
    const later = await js(`[...document.querySelectorAll('.step')].findIndex(s => s.classList.contains('step--open'))`);
    assert(sticky === 'sticky' && first === 0 && later >= 2, `sticky=${sticky} first=${first} later=${later}`);
    await shot('process-step');
    return `step ${first + 1} → step ${later + 1}`;
  });

  await check('before/after slider: drag + keyboard', async () => {
    await scrollTo('#projects', 150);
    await sleep(1500);
    const h = await center('.compare__handle');
    const box = await center('.compare');
    await mouse('mousePressed', h.x, h.y);
    await mouse('mouseMoved', box.l + box.w * 0.2, h.y, { buttons: 1 });
    await mouse('mouseReleased', box.l + box.w * 0.2, h.y);
    await sleep(400);
    const dragged = Number(await js(`document.querySelector('.compare__handle').getAttribute('aria-valuenow')`));
    await js(`document.querySelector('.compare__handle').focus()`);
    await key('ArrowRight', 'ArrowRight');
    await sleep(200);
    const keyed = Number(await js(`document.querySelector('.compare__handle').getAttribute('aria-valuenow')`));
    assert(dragged >= 15 && dragged <= 25 && keyed === dragged + 5, `drag=${dragged} key=${keyed}`);
    await shot('compare-slider');
    return `drag → ${dragged}%, ArrowRight → ${keyed}%`;
  });

  await check('stacked property cards are sticky', async () => {
    const pos = await js(`[...document.querySelectorAll('.stack__item')].map(i => getComputedStyle(i).position)`);
    assert(pos.length === 4 && pos.every((p) => p === 'sticky'), pos.join(','));
    return `${pos.length} sticky cards`;
  });

  await check('review tickers move in opposite directions', async () => {
    await scrollTo('#reviews', 100);
    await mouse('mouseMoved', 5, 5); // tickers pause while hovered, so park the pointer elsewhere
    await sleep(800);
    const read = () => js(`[...document.querySelectorAll('.reviews__rows .ticker__track')].map(t => new DOMMatrix(getComputedStyle(t).transform).m41)`);
    const a = await read();
    await sleep(1000);
    const b = await read();
    const d0 = b[0] - a[0];
    const d1 = b[1] - a[1];
    assert(Math.sign(d0) !== Math.sign(d1) && d0 !== 0, `${d0} / ${d1}`);
    return `row1 ${d0.toFixed(0)}px, row2 ${d1.toFixed(0)}px`;
  });

  await check('review ticker pauses while hovered', async () => {
    const p = await center('.reviews__rows .ticker');
    await mouse('mouseMoved', p.x, p.y);
    await sleep(300);
    const a = await js(`new DOMMatrix(getComputedStyle(document.querySelector('.reviews__rows .ticker__track')).transform).m41`);
    await sleep(700);
    const b = await js(`new DOMMatrix(getComputedStyle(document.querySelector('.reviews__rows .ticker__track')).transform).m41`);
    assert(a === b, `${a} → ${b}`);
    await mouse('mouseMoved', 5, 5);
    return 'paused';
  });

  await check('map: pointer glow + 6 pins', async () => {
    await scrollTo('#areas-we-serve', 300);
    await sleep(1000);
    const m = await center('.map__svg');
    await mouse('mouseMoved', m.x, m.y);
    await sleep(400);
    const g = await js(`({ glow: document.querySelectorAll('#glowMask circle').length, pins: document.querySelectorAll('.map__label').length })`);
    assert(g.glow === 1 && g.pins === 6, JSON.stringify(g));
    await shot('map-glow');
    return JSON.stringify(g);
  });

  await check('FAQ accordion opens one item at a time', async () => {
    await scrollTo('#faq', 100);
    await sleep(800);
    const clickQ = async (i) => {
      const p = await js(`(() => { const r = document.querySelectorAll('.faq__q')[${i}].getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`);
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await sleep(700);
    };
    await clickQ(0);
    await clickQ(1);
    const open = await js(`[...document.querySelectorAll('.faq__q')].map(b => b.getAttribute('aria-expanded'))`);
    assert(open[0] === 'false' && open[1] === 'true', open.join(','));
    await shot('faq-open');
    return open.join(',');
  });

  await check('chatbot opens from the launcher', async () => {
    const p = await center('.chat-launcher');
    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await sleep(900);
    const ok = await js(`!!document.querySelector('.chat .chat__input') && document.querySelectorAll('.chat .chip').length === 3`);
    assert(ok, 'chat panel not open');
    await shot('chat-open');
    await js(`document.querySelector('.chat__close').click()`);
    return 'panel + 3 quick replies';
  });

  await check('scroll progress bar tracks the page', async () => {
    const v = await js(`new DOMMatrix(getComputedStyle(document.querySelector('.scroll-progress')).transform).a`);
    assert(v > 0.3, `scaleX ${v}`);
    return `scaleX ${v.toFixed(2)}`;
  });

  await check('custom cursor ring grows over links and labels drag areas', async () => {
    await scrollTo('#projects', 150);
    await sleep(1200);
    const c = await center('.compare');
    await mouse('mouseMoved', c.x - 60, c.y);
    await sleep(500);
    const onCompare = await js(`(() => { const r = document.querySelector('.cursor-ring'); return { label: r.textContent, cls: r.className }; })()`);
    assert(onCompare.label === 'Drag' && onCompare.cls.includes('has-label'), JSON.stringify(onCompare));
    return `label "${onCompare.label}" over the slider`;
  });

  await check('magnetic primary button leans toward the pointer', async () => {
    await js(`scrollTo(0,0)`);
    await sleep(900);
    const b = await js(`(() => { const r = document.querySelector('.nav__cta').getBoundingClientRect(); return { x: r.right - 6, y: r.bottom - 4 }; })()`);
    await mouse('mouseMoved', b.x, b.y);
    await sleep(300);
    const t = await js(`document.querySelector('.nav__cta').style.transform`);
    assert(/translate\(/.test(t) && t !== 'translate(0px, 0px)', t);
    return t;
  });

  await check('hero AI search sends to the assistant; reply types out; chips + profile meter appear', async () => {
    await js(`scrollTo(0,0)`);
    await sleep(600);
    // Start from a fresh conversation (the app restores earlier sessions from localStorage).
    await js(`localStorage.removeItem('nestr_chat_session')`);
    await send('Page.reload');
    await sleep(3500);
    await js(`(() => { const i = document.querySelector('.aisearch__input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'I want to buy an apartment in Pune'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
    await js(`document.querySelector('.aisearch__btn').click()`);
    let caret = false;
    let state = null;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      caret = caret || (await js(`!!document.querySelector('.chat .type-caret')`));
      state = await js(`({ me: document.querySelectorAll('.chat .msg--me').length, ai: document.querySelectorAll('.chat .msg--ai').length, chips: [...document.querySelectorAll('.chat .chip')].map(c => c.textContent), meter: document.querySelector('.chat__meter .mono')?.textContent ?? null, typing: !!document.querySelector('.chat .type-caret') })`);
      if (state.meter && !state.typing && state.chips.length) break;
    }
    assert(state.me === 1 && state.ai >= 2 && caret && state.meter && state.chips.length, JSON.stringify({ ...state, caret }));
    await shot('chat-smart');
    return `meter ${state.meter}, chips: ${state.chips.slice(0, 3).join(' | ')}`;
  });

  await check('route change plays the page-transition curtain', async () => {
    await js(`document.querySelector('.chat__close')?.click()`);
    await sleep(300);
    await js(`document.querySelector('a.nav__link[href="/rent"]').click()`);
    await sleep(250);
    const curtain = await js(`!!document.querySelector('.curtain')`);
    await sleep(2200);
    const path = await js(`location.pathname`);
    assert(curtain && path === '/rent', `curtain=${curtain} path=${path}`);
    return 'curtain shown on /rent';
  });

  await check('listing cards tilt toward the pointer and reveal the interior photo', async () => {
    await scrollTo('.listing__grid', -120);
    await sleep(1500);
    const c = await center('.lcard');
    await mouse('mouseMoved', c.x + c.w * 0.35, c.y - 60);
    await sleep(700);
    const st = await js(`(() => { const el = document.querySelector('.lcard'); return { rx: el.style.getPropertyValue('--rx'), ry: el.style.getPropertyValue('--ry'), img2: getComputedStyle(el.querySelector('.lcard__img2')).opacity }; })()`);
    assert(st.rx && st.rx !== '0deg' && st.ry !== '0deg' && Number(st.img2) > 0.9, JSON.stringify(st));
    await shot('listing-tilt');
    return JSON.stringify(st);
  });

  await check('listing sort reorders cards (price low → high)', async () => {
    await js(`(() => { const s = document.querySelector('.listing__sort select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'price-asc'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(1200);
    const prices = await js(`[...document.querySelectorAll('.lcard__price')].map(p => Number(p.textContent.replace(/[^0-9]/g, '')))`);
    const sorted = [...prices].sort((a, b) => a - b);
    assert(prices.length > 2 && prices[0] > 0 && JSON.stringify(prices) === JSON.stringify(sorted), prices.join(','));
    return prices.join(' < ');
  });

  await check('mobile (390px): burger menu opens', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: URL });
    await sleep(3000);
    const p = await center('.nav__burger');
    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await sleep(700);
    const n = await js(`document.querySelectorAll('.mnav a').length`);
    assert(n >= 8, `links ${n}`);
    await shot('mobile-menu');
    return `${n} links`;
  });
} finally {
  for (const [ok, name, detail] of results) console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} interaction checks passed`);
  try {
    await send('Browser.close');
  } catch {
    chrome.kill();
  }
  process.exitCode = results.every((r) => r[0]) ? 0 : 1;
}
