/* Bottom sheets: your life, the inbox and chats, other players' profiles, the menu, the leaderboard. */
(function (LS) {
  'use strict';
  const { h, $ } = LS;
  const E = LS.Engine;

  // ------------------------------------------------------------------ sheet stack
  const stack = [];
  const Sheet = LS.sheet = {
    open(title, body, o = {}) {
      stack.length = 0; stack.push({ title, body, o });
      $('#scrim').hidden = false; $('#sheet').hidden = false; document.body.classList.add('sheet-open');
      render(); LS.portrait.paused = !!o.pause;
    },
    push(title, body, o = {}) { stack.push({ title, body, o }); render(); },
    pop() { if (stack.length > 1) { stack.pop(); render(); } else Sheet.close(); },
    close() {
      const top = stack[stack.length - 1]; stack.length = 0;
      $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheet').textContent = '';
      document.body.classList.remove('sheet-open'); LS.portrait.paused = false;
      if (top && top.o.onClose) top.o.onClose();
      LS.Game.updateHud();
    },
    get isOpen() { return !$('#sheet').hidden; },
  };
  function render() {
    const top = stack[stack.length - 1], el = $('#sheet');
    el.textContent = '';
    el.className = 'sheet' + (top.o.full ? ' full' : '');
    el.append(
      h('div.sheet-head',
        stack.length > 1 ? h('button.icon-btn.back', { type: 'button', 'aria-label': 'Back', onclick: () => Sheet.pop() }, '‹') : h('span.spacer'),
        h('h2', top.title),
        top.o.noClose ? h('span.spacer') : h('button.icon-btn.close', { type: 'button', 'aria-label': 'Close', onclick: () => Sheet.close() }, '✕')),
      h('div.sheet-body', top.body));
    el.scrollTop = 0;
  }
  document.addEventListener('click', e => { if (e.target.id === 'scrim') { const t = stack[stack.length - 1]; if (!(t && t.o.noClose)) Sheet.close(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && Sheet.isOpen) { const t = stack[stack.length - 1]; if (!(t && t.o.noClose)) Sheet.pop(); } });

  const ago = ms => {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd';
  };
  const section = (title, ...kids) => h('section.block', title ? h('h3', title) : null, ...kids);
  const thumb = (genome, w = 64) => { const f = h('div.thumb'); f.append(LS.portrait.still(Object.assign({}, genome, LS.LOOK), w)); return f; };
  LS.ui = { section, thumb, ago };

  // ------------------------------------------------------------------ your life
  LS.showLife = function () {
    const G = LS.Game, s = G.s, look = G.look, pl = LS.platform.player;
    const hero = h('div.hero',
      h('div.hero-portrait', LS.portrait.still(look.genome, 150), pl.avatar ? h('img.avatar-chip', { src: pl.avatar, alt: 'Your Lagos Life avatar' }) : null),
      h('div.hero-text', h('h3', pl.name), h('p', `Age ${s.age} · ${LS.STATUS[s.status]}`), h('p.muted', LS.platform.mode === 'dev' ? 'Playing as a guest' : 'Lagos Life player'),
        h('p.score', 'Score ', h('b', E.score(s)))));
    const J = LS.JOBS[s.job], H = LS.HOMES[s.home];
    const rows = h('div.rows',
      lifeRow('Work', J.title, J.blurb), lifeRow('Home', H.title, H.blurb),
      s.partner ? h('div.lrow', h('div.k', 'Partner'), h('div.v', h('div.mini', thumb(Object.assign({}, s.partner.genome), 44)), h('div', h('b', s.partner.name), h('small', LS.STATUS[s.status])))) : lifeRow('Partner', 'None yet', 'Keep swiping.'),
      lifeRow('Friends', String(s.friends), s.friends >= 5 ? 'A proper crew.' : 'Go to more owambes.'));
    const bars = h('div.statrows', LS.STAT_KEYS.map(k => h('div.srow2', h('span', LS.STATS[k].label), h('div.track', h('i', { style: { width: Math.round(s.stats[k]) + '%' }, class: 'fill f-' + k })), h('small', LS.STATS[k].blurb))));
    const meta = G.meta;
    const found = Object.keys(meta.endings || {}).length;
    const legacy = h('div.legacy', h('div', 'Runs ', h('b', meta.runs || 0)), h('div', 'Best ', h('b', meta.best || 0)), h('div', 'Endings ', h('b', `${found}/${Object.keys(LS.ENDINGS).length}`)));
    const actions = h('div.actions',
      h('button.btn.primary', { type: 'button', onclick: () => LS.customize({ intro: false }) }, 'Customise your look'),
      h('button.btn', { type: 'button', onclick: () => LS.showBoard() }, 'Leaderboard'));
    Sheet.open('Your life', h('div', hero, rows, section('How you’re doing', bars), legacy, actions));
  };
  const lifeRow = (k, v, sub) => h('div.lrow', h('div.k', k), h('div.v', h('div', h('b', v), h('small', sub || ''))));

  // ------------------------------------------------------------------ inbox
  LS.showInbox = async function () {
    const body = h('div.inbox', h('p.muted', 'Loading…'));
    Sheet.open('Inbox', body, { onClose: () => LS.Game.updateHud() });
    if (!LS.api.online && !LS.social.inbox) { body.textContent = ''; body.append(h('p.muted', 'You’re offline. Matches and messages will show up when you’re back.')); return; }
    const inbox = await LS.social.loadInbox();
    LS.social.markRead(); LS.Game.updateHud();
    paintInbox(body, inbox);
  };

  function paintInbox(body, inbox) {
    body.textContent = '';
    if (!inbox) { body.append(h('p.muted', 'Nothing yet. Swipe on real players when they show up in your deck.')); return; }
    const m = inbox.matches || [];
    body.append(h('p.lead', `${inbox.likedYou || 0} ${inbox.likedYou === 1 ? 'person has' : 'people have'} liked you.`));
    body.append(section(`Matches (${m.length})`,
      m.length ? h('div.list', m.map(x => h('button.item', { type: 'button', onclick: () => showChat(x.profile) },
        thumb(x.profile.genome, 52),
        h('div.item-text', h('b', x.profile.name), h('small', x.last ? (x.last.from === x.profile.id ? '' : 'You: ') + (LS.CHAT[x.last.k] || '…') : 'Say hi!')),
        x.unread ? h('i.dot-new') : null)))
        : h('p.muted', 'No matches yet. When someone you like likes you back, they’ll show up here.')));
    const n = inbox.notifs || [];
    body.append(section('News', n.length ? h('div.list', n.map(x => h('div.item.static', { class: x.unread ? 'unread' : '' }, h('div.item-text', h('b', LS.notifText(x)), h('small', ago(x.at)))))) : h('p.muted', 'Quiet for now.')));
  }

  async function showChat(profile) {
    const msgs = h('div.msgs'), chips = h('div.presets');
    const refresh = async () => {
      const list = await LS.social.chat(profile.id);
      msgs.textContent = '';
      if (!list.length) msgs.append(h('p.muted.center', `You matched with ${profile.name}. Break the ice!`));
      for (const m of list) msgs.append(h('div.msg', { class: m.from === profile.id ? 'them' : 'me' }, LS.CHAT[m.k] || '…', h('small', ago(m.at))));
      msgs.scrollTop = msgs.scrollHeight;
    };
    for (const k of LS.CHAT_ORDER) chips.append(h('button.chip.btn-chip', { type: 'button', onclick: async () => { await LS.social.say(profile.id, k); refresh(); } }, LS.CHAT[k]));
    const view = h('div.chat',
      h('div.chat-head', thumb(profile.genome, 56), h('div', h('b', profile.name), h('small', LS.lifeLine(profile.bio && profile.bio.life || {}))),
        h('button.btn.small', { type: 'button', onclick: () => showProfile(LS.fromServer(profile), { matched: true }) }, 'Profile')),
      msgs, section('Say something', chips));
    Sheet.push(profile.name, view);
    refresh();
  }

  // ------------------------------------------------------------------ another player's profile
  function showProfile(p, o = {}) {
    const bio = [LS.jobLabel(p.job), LS.areaLabel(p.area)].filter(Boolean).join(' · ');
    const view = h('div.profile',
      h('div.hero-portrait.big', LS.portrait.still(p.genome, 220), p.avatar ? h('img.avatar-chip', { src: p.avatar, alt: '' }) : null),
      h('h3', `${p.name}${p.age ? ', ' + p.age : ''}`), h('p.muted', bio),
      p.life ? h('p', LS.lifeLine(p.life)) : null,
      h('div.chips', (p.vibes || []).map(v => h('span.chip', LS.VIBES[v] || v))),
      p.love ? h('p', h('b', 'Love language: '), LS.LOVE[p.love] || '') : null,
      p.flag ? h('p', h('b', 'Red flag: '), LS.FLAGS[p.flag] || '') : null,
      h('div.actions',
        h('button.btn', { type: 'button', onclick: async () => { if (confirm('Block ' + p.name + '?')) { await LS.social.block(p.id); Sheet.close(); } } }, 'Block'),
        h('button.btn', { type: 'button', onclick: async () => { await LS.social.report(p.id, 'other'); LS.Game.toast('Thanks, we’ll take a look.'); } }, 'Report')));
    Sheet.push(p.name, view);
  }
  LS.showProfile = showProfile;

  // ------------------------------------------------------------------ menu
  LS.showMenu = function () {
    const G = LS.Game;
    const sound = h('button.btn', { type: 'button' }, '');
    const setSound = () => { sound.textContent = 'Sound: ' + (LS.sound.enabled ? 'on' : 'off'); };
    sound.onclick = () => { LS.sound.set(!LS.sound.enabled); setSound(); };
    setSound();
    const seg = h('div.segment', Object.entries(LS.SHOW).map(([k, label]) => {
      const b = h('button', { type: 'button', class: G.look.bio && G.look.bio.looking === k ? 'on' : '', onclick: () => {
        G.look.bio = Object.assign({}, G.look.bio, { looking: k }); G.save(); LS.social.buffer = [];
        $$$('button', seg).forEach(x => x.classList.remove('on')); b.classList.add('on');
        LS.social.saveProfile(G.look, E.life(G.s));
      } }, label);
      return b;
    }));
    const online = LS.api.online;
    const body = h('div.menu',
      section('Sound', sound),
      section('Show me', seg),
      section('Super likes', h('p.muted', `You have ${G.superCount()}. Swipe a profile up (or tap ★) to boost your chance.`),
        h('button.btn.primary', { type: 'button', onclick: buy }, 'Get 5 for ₦100')),
      section('Play', h('div.actions', h('button.btn', { type: 'button', onclick: () => LS.showBoard() }, 'Leaderboard'),
        h('button.btn', { type: 'button', onclick: () => { if (confirm('Start a new life? This one ends here.')) { Sheet.close(); G.restart(); } } }, 'New life'))),
      section('About', h('p.muted', 'Lagos Swipe is a life sim in Reigns format. Swipe cards left or right. Keep Wallet, Heart, Hustle and Peace off the ends, and get to 35.'),
        h('p.muted', online ? 'Online: other players can appear in your deck.' : 'Offline: playing with the Lagos crowd only.'),
        h('p.fine', 'Portraits by portrait-js.')));
    Sheet.open('Menu', body);
    async function buy() {
      try { const r = await LS.social.buySuperLikes('super_likes_5'); G.toast(`Super likes: ${r.superLikes}`); G.updateHud(); Sheet.close(); }
      catch (e) { G.toast(e && e.code === 'cancelled' ? 'No worries.' : 'Couldn’t complete the purchase.'); }
    }
  };
  const $$$ = (s, r) => Array.from(r.querySelectorAll(s));

  // ------------------------------------------------------------------ leaderboard
  LS.showBoard = async function () {
    const body = h('div.board', h('p.muted', 'Loading…'));
    Sheet.open('Leaderboard', body);
    const top = await LS.social.leaderboard();
    body.textContent = '';
    if (top && top.length) {
      body.append(h('div.list', top.map(t => h('div.item.static', { class: t.you ? 'me' : '' },
        h('b.rank', '#' + t.rank), thumb(t.genome, 48), h('div.item-text', h('b', t.name), h('small', `${t.days} months`)), h('b.pts', t.best)))));
    } else body.append(h('p.muted', LS.api.online ? 'No scores yet. Finish a life to get on the board.' : 'Scores load when you’re online.'));
    const v = await LS.platform.leaderboard();
    if (v && v.top && v.top.length) {
      body.append(section('Lagos Life board', h('div.list', v.top.slice(0, 20).map(t => h('div.item.static', h('b.rank', '#' + t.rank), h('div.item-text', h('b', t.name)), h('b.pts', t.score))))));
    }
  };
})(window.LS = window.LS || {});
