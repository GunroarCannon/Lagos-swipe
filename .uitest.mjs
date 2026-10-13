/* Temporary: drive the real game in real Chrome over CDP and check the things a build can't check.
 * node .uitest.mjs   (needs the dev server on :3100 and Chrome installed) */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3100';
const PORT = 9222;
const OUT = 'C:/Users/hmmm/AppData/Local/Temp/ui';
fs.mkdirSync(OUT, { recursive: true });

const ok = [], bad = [], skipped = [];
const check = (name, pass, extra = '') => { (pass ? ok : bad).push(name + (extra ? '  [' + extra + ']' : '')); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  ' + extra : '')); };

class CDP {
  constructor(ws) { this.ws = ws; this.n = 0; this.waiting = new Map(); this.events = []; }
  static async attach(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waiting.has(m.id)) {
        const w = c.waiting.get(m.id); c.waiting.delete(m.id);
        m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      } else c.events.push(m);
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.n;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.waiting.delete(id)) rej(new Error('cdp timeout: ' + method)); }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  }
}

// a clean profile every run: otherwise a look saved last time means it is no longer a first launch
fs.rmSync(OUT + '/profile', { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let cdp;
try {
  // wait for the devtools endpoint
  let list = null;
  for (let i = 0; i < 40 && !list; i++) {
    await sleep(250);
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (e) { /* not up yet */ }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  cdp = await CDP.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');

  await cdp.send('Page.navigate', { url: BASE + '/' });
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await cdp.eval(`!!(window.LS && LS.platform && LS.platform.mode && document.getElementById('splash-go') && !document.getElementById('splash-go').disabled)`)) break;
  }
  console.log('\n-- boot --');
  check('game booted as a guest', await cdp.eval(`LS.platform.mode`) === 'dev', await cdp.eval(`LS.platform.mode`));
  check('every script loaded', await cdp.eval(`['Game','social','customize','showBank','avatarLook','SKINS','HAIRS','portrait','sheet'].every(k => LS[k] || (k==='customize'&&LS.customize))`));

  // ---- first launch: the look screen
  await cdp.eval(`document.getElementById('splash-go').click()`);
  await sleep(700);
  console.log('\n-- the look screen --');
  check('customiser opened on first launch', await cdp.eval(`!document.getElementById('sheet').hidden && !!document.querySelector('.cz')`));
  check('preview is inside a sticky wrapper', await cdp.eval(`!!document.querySelector('.cz-sticky > .cz-preview')`));
  // regression: h(tag.class, { class: … }) used to wipe the class it was built with, leaving every chip,
  // thumbnail and swatch unstyled and no selected state visible anywhere in the customiser
  const styled = await cdp.eval(`(() => {
    const chip = document.querySelector('.cz-body .chip');
    const sel = [...document.querySelectorAll('.cz-body .chip')].find(c => c.classList.contains('on'));
    return { chips: document.querySelectorAll('.cz-body .chip').length,
             chipPad: chip ? getComputedStyle(chip).paddingTop : null,
             chipBorder: chip ? getComputedStyle(chip).borderTopWidth : null,
             anySelected: !!sel, selCls: sel ? sel.className : null };
  })()`);
  check('chips keep the class they were built with', styled.chips > 0 && styled.chipBorder !== '0px',
    `count=${styled.chips} padding=${styled.chipPad} border=${styled.chipBorder}`);
  check('the current choice is marked as selected', styled.anySelected, 'classNames=' + styled.selCls);

  // scroll the sheet hard and see whether the face moved with it
  // The real question: does the face hold still in the viewport as the sheet scrolls? Compare its on-screen
  // position at two different scroll offsets, and confirm it did move while loose at the start.
  const stick = await cdp.eval(`(() => {
    const body = document.querySelector('.sheet-body'), prev = document.querySelector('.cz-preview');
    const at = y => { body.scrollTop = y; return prev.getBoundingClientRect().top; };
    const loose = at(0);
    const a = at(260), b = at(600), d = at(900);
    const maxScroll = body.scrollHeight - body.clientHeight;
    return { loose, a, b, d, maxScroll, scrolled: body.scrollTop, sticky: getComputedStyle(prev.parentElement).position };
  })()`);
  check('the sheet actually scrolls', stick.maxScroll > 400, 'maxScroll=' + Math.round(stick.maxScroll));
  check('preview is position:sticky', stick.sticky === 'sticky', stick.sticky);
  check('preview starts lower down and rises to pin (not pinned at rest)', stick.loose > stick.a,
    `top ${Math.round(stick.loose)} at rest → ${Math.round(stick.a)} pinned`);
  check('preview holds still in the viewport while scrolling',
    Math.abs(stick.a - stick.b) <= 1 && Math.abs(stick.b - stick.d) <= 1,
    `260:${Math.round(stick.a)}  600:${Math.round(stick.b)}  900:${Math.round(stick.d)}`);
  await cdp.shot('1-look-scrolled');
  await cdp.eval(`document.querySelector('.sheet-body').scrollTop = 0`);

  // ---- the photo reader, client side
  console.log('\n-- reading a photo --');
  const img = await fetch('https://i.pravatar.cc/300?img=33', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const avatar = 'data:image/jpeg;base64,' + Buffer.from(await img.arrayBuffer()).toString('base64');
  const look = await cdp.eval(`LS.avatarLook(${JSON.stringify(avatar)})`);
  const havePhoto = !!(look && look.gender);
  if (!havePhoto) {
    // The key is on Gemini's free tier: 20 requests a day for gemini-3-flash, which testing has used up,
    // and flash-lite times out. Reported as a skip, never as a pass.
    console.log('  SKIP  photo reading is unavailable right now (Gemini daily quota / model timeouts)');
    skipped.push('photo reading (Gemini quota exhausted)');
  } else {
    check('LS.avatarLook returns a reading', true, JSON.stringify(look));
    // regression: the reading used to be cached on the profile, so asking twice before saving read the photo
    // twice and could answer differently each time. The same photo must always give the same answer.
    const again = await cdp.eval(`LS.avatarLook(${JSON.stringify(avatar)})`);
    check('the same photo always reads the same', JSON.stringify(again) === JSON.stringify(look),
      `${JSON.stringify(look)} vs ${JSON.stringify(again)}`);
    check('colours are ones the game uses', await cdp.eval(`LS.SKINS.includes(${JSON.stringify(look.skin)}) && LS.HAIRS.includes(${JSON.stringify(look.hair)})`));
  }

  const applied = await cdp.eval(`(() => {
    LS.platform.player.avatar = ${JSON.stringify(avatar)};
    LS.sheet.close();
    LS.customize({ intro: false });
    const before = LS.Game.look ? null : null;
    return { hasPhotoButton: !!document.querySelector('.cz-body .btn') };
  })()`);
  await sleep(400);
  check('the look screen offers the photo button when there is a photo',
    await cdp.eval(`[...document.querySelectorAll('.cz-body button')].some(b => /photo/i.test(b.textContent))`));

  // tap it for real and watch gender + colours land on the working genome
  const matched = await cdp.eval(`(async () => {
    const g0 = LS.sexOf(document.querySelector('.cz-preview canvas') ? 'fem' : 'fem');
    const btn = [...document.querySelectorAll('.cz-body button')].find(b => /photo/i.test(b.textContent));
    btn.click();
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (/Matched|guessed/.test(document.getElementById('toast').textContent || '')) break;
    }
    return document.getElementById('toast').textContent;
  })()`);
  check('tapping the button answers without an error', !!matched && !/couldn.t read/i.test(matched), matched);
  await cdp.shot('2-photo-matched');
  // Switch to Colours to see the swatches, then Save, then check the thing that actually matters: the look
  // that gets stored is the one the photo implied.
  const saved = await cdp.eval(`(async () => {
    const t = [...document.querySelectorAll('.cz-tabs button')].find(b => /Colour/i.test(b.textContent));
    if (t) t.click();
    await new Promise(r => setTimeout(r, 200));
    const swatches = document.querySelectorAll('.swatches').length;
    const on = [...document.querySelectorAll('.swatches .sw.on')].map(s => s.getAttribute('aria-label'));
    const btn = [...document.querySelectorAll('.cz button')].find(b => b.textContent.trim() === 'Save');
    if (!btn) return { error: 'no Save button', swatches, on };
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const g = (LS.Game.look && LS.Game.look.genome) || {};
    return { swatches, on, gender: g.gender, skin: g.skin, hairColor: g.hairColor, looking: (LS.Game.look.bio || {}).looking, sheetClosed: document.getElementById('sheet').hidden };
  })()`);
  check('the Colours tab renders swatches', saved.swatches >= 3, `groups=${saved.swatches} on=${JSON.stringify(saved.on)}`);
  if (havePhoto) {
    check('the photo\'s colours are shown as the selected swatches', saved.on.includes(look.skin) && saved.on.includes(look.hair),
      `selected=${JSON.stringify(saved.on)}`);
    check('saving stores the photo\'s gender', saved.gender === look.gender, `${saved.gender} vs ${look.gender}`);
    check('saving stores the photo\'s skin colour', saved.skin === look.skin, `${saved.skin} vs ${look.skin}`);
    check('saving stores the photo\'s hair colour', saved.hairColor === look.hair, `${saved.hairColor} vs ${look.hair}`);
    check('and the bio now looks for the other one', saved.looking === (look.gender === 'masc' ? 'fem' : 'masc'), saved.looking);
  } else {
    check('saving still produces a complete look', !!saved.skin && !!saved.hairColor && !!saved.gender, JSON.stringify(saved));
  }
  await cdp.shot('2b-colours');

  // ---- the bank
  console.log('\n-- the bank --');
  await cdp.eval(`LS.sheet.close()`);
  // start a life so there is a Wallet stat to trade
  await cdp.eval(`(() => {
    LS.Game.look = LS.Game.look || { genome: LS.playerGenome('x','fem',null), bio: LS.defaultBio(), locks: [] };
    LS.Game.meta = LS.Game.meta || { charms: 1, runs: 0, best: 0, endings: {} };
    LS.Game.init(LS.Game.look, null, LS.Game.meta);
    return true;
  })()`);
  await sleep(300);
  check('a life is running with a Wallet stat', await cdp.eval(`!!(LS.Game.s && typeof LS.Game.s.stats.wallet === 'number')`));

  await cdp.eval(`LS.showBank()`);
  await sleep(900);
  check('the shop sheet opened', await cdp.eval(`!document.getElementById('sheet').hidden && !!document.querySelector('.bank')`));
  check('it shows what you have: naira and charms', await cdp.eval(`/₦/.test(document.querySelector('.stash b')?.textContent || '') && document.querySelectorAll('.stash b').length === 2`),
    await cdp.eval(`document.querySelector('.stash')?.textContent`));
  check('the shop naira is the same number as the HUD', await cdp.eval(`document.querySelector('.bank .stash b').textContent === document.getElementById('hud-money').textContent`),
    await cdp.eval(`document.querySelector('.bank .stash b').textContent + ' vs ' + document.getElementById('hud-money').textContent`));
  const sectionNames = await cdp.eval(`[...document.querySelectorAll('.bank h3')].map(h => h.textContent)`);
  check('it has exactly two things to buy, said plainly', sectionNames.join('|') === 'Lucky charms|Buy naira', sectionNames.join(' | '));
  check('charms can be bought with real money', await cdp.eval(`[...document.querySelectorAll('.bank .pack.real')].some(b => /lucky charms/.test(b.textContent) && /Pay ₦100/.test(b.textContent))`));
  check('naira can be bought with real money', await cdp.eval(`[...document.querySelectorAll('.bank .pack.real')].some(b => /₦50,000 naira/.test(b.textContent) && /Pay ₦200/.test(b.textContent))`));
  check('there is no second currency: no wallet points, no bank, no exchange', await cdp.eval(`!/wallet|in the bank|in-game naira|exchange/i.test(document.querySelector('.bank').textContent)`),
    await cdp.eval(`document.querySelector('.bank').textContent.slice(0, 200)`));
  check('no stale offline message while the server answers', await cdp.eval(`!/offline|Couldn.t reach|Prices load/i.test(document.querySelector('.bank').textContent)`));
  await cdp.shot('3-bank');

  // spend naira on a charm: it comes straight off the HUD number
  const hud0 = await cdp.eval(`LS.Game.s.stats.wallet * 3500 + LS.social.bank`);
  const spent = await cdp.eval(`(async () => {
    const btn = [...document.querySelectorAll('.bank .pack:not(.real)')].find(b => /^1 lucky charm/.test(b.textContent));
    if (!btn || btn.disabled) return { error: 'no spend button', disabled: !!btn };
    btn.click();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const t = document.getElementById('toast').textContent || '';
      if (/Lucky charms|Not enough|offline|today/i.test(t)) return { toast: t };
    }
    return { error: 'no toast' };
  })()`);
  check('naira buys a lucky charm', !!spent.toast && /Lucky charms/.test(spent.toast), JSON.stringify(spent));
  await sleep(500);
  const hud1 = await cdp.eval(`LS.Game.s.stats.wallet * 3500 + LS.social.bank`);
  check('and the charm costs exactly ₦10,000 of the one balance', Math.round(hud0 - hud1) === 10000, `${hud0} → ${hud1}`);
  check('the HUD shows the new balance', await cdp.eval(`document.getElementById('hud-money').textContent === LS.naira(LS.Game.s.stats.wallet * 3500 + LS.social.bank)`));
  const wallet1 = await cdp.eval(`LS.Game.s.stats.wallet`);
  check('the Wallet bar never drops to the edge', wallet1 > 0.5, wallet1.toFixed(1));
  await cdp.shot('4-bank-after-charm');

  // when the price check fails the list is still there, and nothing scary is said about it
  await cdp.eval(`window.__shop = LS.social.shop; LS.social.shop = async () => { throw Object.assign(new Error('boom'), { code: 'error' }); }; LS.showBank()`);
  await sleep(500);
  check('a failed price check still lists what is for sale', await cdp.eval(`document.querySelectorAll('.bank .pack.real').length >= 5`));
  check('and shows no error banner', await cdp.eval(`!/Couldn.t reach|offline|Try again/i.test(document.querySelector('.bank').textContent)`));
  await cdp.eval(`LS.social.shop = window.__shop`);

  // the hamburger menu sells things directly too
  await cdp.eval(`LS.sheet.close(); LS.showMenu()`);
  await sleep(900);
  check('the menu has the shop inline', await cdp.eval(`document.querySelectorAll('.menu .bank .pack.real').length >= 4 && /Lucky charms/.test(document.querySelector('.menu .bank').textContent)`));
  await cdp.shot('4b-menu-shop');

  // ---- a story longer than the card must be readable, not clipped
  console.log('\n-- long cards --');
  await cdp.eval(`LS.sheet.close()`);
  await sleep(200);
  const shaped = await cdp.eval(`(() => {
    const long = Array(14).fill('The landlord is at the door again and Mama has opinions about your life choices and the danfo was late and your account balance is a rumour.').join(' ');
    LS.Game.card.text = long;
    LS.Game.showCard(LS.Game.card);
    return true;
  })()`);
  await sleep(400);
  const box = await cdp.eval(`(() => {
    const c = document.getElementById('card'), p = document.querySelector('.picture'), t = document.querySelector('.card-text');
    const r = t.getBoundingClientRect();
    return { scrollH: c.scrollHeight, clientH: c.clientHeight, picH: Math.round(p.getBoundingClientRect().height),
             overflowY: getComputedStyle(c).overflowY, touchAction: getComputedStyle(c).touchAction,
             flagged: c.classList.contains('scrollable'), x: Math.round(r.left + r.width / 2), y: Math.round(Math.min(r.top + 40, c.getBoundingClientRect().bottom - 20)) };
  })()`);
  check('a long story overflows the card (so it needs to scroll)', box.scrollH > box.clientH + 2, `${box.clientH}px visible of ${box.scrollH}px`);
  check('the whole card is set up to scroll', box.overflowY === 'auto' && box.touchAction === 'pan-y', `${box.overflowY} / ${box.touchAction}`);
  check('the card is marked so it gets a soft edge', box.flagged);
  check('the portrait is not crushed away', box.picH >= 110, box.picH + 'px');
  await cdp.shot('5-long-card');

  // a real touch drag up the card must scroll it
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x, y: box.y - i * 15 }] }); await sleep(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  const scrolled = await cdp.eval(`document.getElementById('card').scrollTop`);
  check('a vertical touch scrolls the card', scrolled > 0, `scrollTop=${Math.round(scrolled)}`);
  await cdp.shot('6-long-card-scrolled');

  // ...and a horizontal drag must still throw the card, not scroll it
  const pic = await cdp.eval(`(() => { const r = document.querySelector('.picture').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pic.x, y: pic.y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pic.x + i * 30, y: pic.y }] });
    await sleep(30);
  }
  const pulled = await cdp.eval(`document.getElementById('stack').style.getPropertyValue('--p')`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('a horizontal drag on the picture still pulls the card', parseFloat(pulled) > 0, `--p=${pulled}`);
  await sleep(300);

  // ---- console hygiene
  console.log('\n-- console --');
  const errs = cdp.events.filter(e =>
    (e.method === 'Runtime.exceptionThrown') ||
    (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'));
  const texts = errs.map(e => e.method === 'Runtime.exceptionThrown'
    ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
    : ((e.params.entry?.text || (e.params.args || []).map(a => a.value).join(' ')) + ' <' + (e.params.entry?.url || '') + '>'));
  // a missing favicon is not a broken game
  const real = texts.filter(t => !/favicon/i.test(t));
  const ignored = texts.filter(t => /favicon/i.test(t));
  if (ignored.length) console.log('  (ignored: ' + ignored.join(' | ').slice(0, 200) + ')');
  check('no page errors', real.length === 0, real.slice(0, 4).join(' || ').slice(0, 500));
} catch (e) {
  console.error('\nHARNESS ERROR:', e.message);
  bad.push('harness: ' + e.message);
} finally {
  try { cdp && cdp.ws.close(); } catch (e) { /* ignore */ }
  chrome.kill();
}

console.log(`\n==== ${ok.length} passed, ${bad.length} failed, ${skipped.length} skipped ====`);
skipped.forEach(s => console.log('  SKIPPED: ' + s));
if (bad.length) { bad.forEach(b => console.log('  FAILED: ' + b)); process.exit(1); }
