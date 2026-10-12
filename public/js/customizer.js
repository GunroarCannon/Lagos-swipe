/* Look + bio editor: heritage, hair, headwear, outfit, colours, face sliders, and the preset bio.
 * Opens as a bottom sheet from the corner button (or full-screen on first launch). */
(function (LS) {
  'use strict';
  const { h, $ } = LS;

  const HAIR_SKIP = new Set(['mohawk', 'spiky', 'spiky-up', 'swept-spikes', 'wild-spikes', 'loopies', 'wolf-tail', 'messy', 'mullet']);
  const HEAD_SKIP = new Set(['crown', 'imperial-crown', 'tiara', 'jewelled-turban', 'phoenix-crown', 'topknot-crown', 'spire-crown', 'fur-crown', 'gold-diadem', 'circlet', 'laurel', 'kokoshnik', 'forehead-protector', 'cowl', 'futou', 'gat', 'maang-tikka', 'jester-cap', 'fringe-band', 'coin-band', 'bead-band', 'jasmine', 'flower-crown', 'chef-toque', 'hard-hat', 'miner-helmet', 'fire-helmet', 'captain-cap', 'sailor-cap', 'mortarboard', 'top-hat', 'cowboy-hat', 'bowler', 'conical-hat', 'fur-hat', 'chullo', 'peaked-cap', 'scrub-cap']);
  const CLOTH_SKIP = new Set(['armour', 'hero-suit', 'motley', 'rags', 'royal-robe', 'fire-coat', 'lab-coat', 'chef-jacket', 'scrubs', 'apron', 'overalls', 'academic-gown', 'sailor-collar', 'gakuran', 'military-tunic', 'ruff', 'hanbok', 'deel', 'huipil', 'poncho', 'sari', 'fur-collar', 'field-jacket', 'bisht', 'sherwani']);
  const SKINS = ['#f1d2b8', '#d4a87f', '#b9875a', '#aa784c', '#916039', '#7f5131', '#69402a', '#573421', '#45291a', '#352015'];
  const HAIRS = ['#151210', '#221b17', '#3a2a1f', '#5c3f2b', '#7a2e1a', '#a8874f', '#9d9a94', '#7a2e7a', '#b3262a', '#3a6ea5', '#1b6b4a', '#d4a017'];
  const CLOTHS = ['#16120f', '#f1e6cc', '#008751', '#b3262a', '#d4a017', '#1c4e9a', '#7a2e7a', '#e8590c', '#2f5f6e', '#8a4a2a', '#e8a0b4', '#6b7f3a'];
  const SLIDERS = [['faceWidth', 'Face width', 0.86, 1.14], ['jaw', 'Jaw', 0.65, 0.98], ['eyeSize', 'Eyes', 0.8, 1.25], ['noseWidth', 'Nose', 0.8, 1.4], ['lipFull', 'Lips', 0.4, 1.25], ['browThick', 'Brows', 0.5, 1.8], ['hairVolume', 'Hair volume', 0.6, 1.5], ['hairLength', 'Hair length', 0.6, 1.5]];
  const LOOK_TABS = [['face', 'Face'], ['hair', 'Hair'], ['head', 'Headwear'], ['outfit', 'Outfit'], ['colour', 'Colours'], ['about', 'About me']];
  const THUMBS = {};

  LS.defaultBio = () => ({ job: 'fintech', area: 'yaba', vibes: ['jollof', 'afrobeats', 'funny'], love: 'time', flag: 'late', looking: 'masc', age: 23 });

  /**
   * opts: { intro: bool } — intro = first launch (can't close without saving).
   * Edits a working copy; Save writes it back, persists, and syncs to the server.
   */
  LS.customize = function (opts = {}) {
    const G = LS.Game, work = { genome: Object.assign({}, G.look.genome), bio: Object.assign({}, LS.defaultBio(), G.look.bio) };
    let tab = 'face';
    const locks = new Set(G.look.locks || []);
    const prev = h('div.cz-preview');
    const body = h('div.cz-body');
    const tabs = h('div.cz-tabs');

    const repaint = () => { prev.textContent = ''; prev.append(LS.portrait.still(work.genome, 170)); const av = LS.platform.player.avatar; if (av) prev.append(h('img.avatar-chip', { src: av, alt: '' })); };
    const set = (k, v, lock = true) => { work.genome[k] = v; if (lock) locks.add(k); repaint(); };

    const chipGrid = (list, current, onPick, thumbKey) => {
      const grid = h('div.thumbs');
      for (const d of list) {
        const cv = LS.portrait.still(Object.assign({}, work.genome, thumbKey ? { [thumbKey]: d.id } : {}, thumbKey === 'hairStyle' ? { headwear: 'none' } : {}), 72);
        grid.append(h('button.tcell', { type: 'button', class: current === d.id ? 'on' : '', title: d.label, onclick: () => { onPick(d.id); drawTab(); } }, cv, h('small', d.label)));
      }
      return grid;
    };
    const swatches = (list, current, onPick) => h('div.swatches', list.map(c => h('button.sw', { type: 'button', 'aria-label': c, class: current && current.toLowerCase() === c.toLowerCase() ? 'on' : '', style: { background: c }, onclick: () => { onPick(c); drawTab(); } })));
    const chipRow = (map, current, onPick, multi) => h('div.chips.pick', Object.entries(map).map(([k, label]) => {
      const on = multi ? current.includes(k) : current === k;
      return h('button.chip', { type: 'button', class: on ? 'on' : '', onclick: () => onPick(k) }, label);
    }));

    function drawTab() {
      body.textContent = '';
      const g = work.genome;
      if (tab === 'face') {
        const lab = id => (PM.get('archetypes', id) || {}).label || id;
        const arch = {}; for (const id of PM.NAIJA_HERITAGES || Object.keys(PM.NAIJA_MIX)) arch[id] = lab(id);
        const more = {}; for (const id of PM.OTHER_AFRICAN || []) more[id] = lab(id);
        body.append(LS.ui.section('I am', h('div.segment', [['fem', 'A woman'], ['masc', 'A man']].map(([k, l]) => h('button', { type: 'button', class: LS.sexOf(g) === k ? 'on' : '', onclick: () => { regen({ gender: k }); drawTab(); } }, l)))));
        body.append(LS.ui.section('Heritage', chipRow(arch, g.archetype, k => regen({ archetype: k }))));
        body.append(LS.ui.section('More of Africa', chipRow(more, g.archetype, k => regen({ archetype: k }))));
        body.append(LS.ui.section('Face', ...SLIDERS.map(([k, label, a, b]) => h('label.slider', h('span', label), h('input', { type: 'range', min: a, max: b, step: 0.01, value: g[k] != null ? g[k] : 1, oninput: e => set(k, +e.target.value) })))));
        body.append(LS.ui.section('Extras',
          chipRow({ none: 'No glasses', 'round-glasses': 'Round', 'square-glasses': 'Square', sunglasses: 'Shades', aviators: 'Aviators', 'cat-eye': 'Cat-eye' }, g.eyewear || 'none', k => { set('eyewear', k); drawTab(); }),
          chipRow({ none: 'Clean', stubble: 'Stubble', mustache: 'Moustache', goatee: 'Goatee', 'short-beard': 'Short beard', 'full-beard': 'Full beard' }, g.facialHair || 'none', k => { set('facialHair', k); drawTab(); })));
      } else if (tab === 'hair') {
        const list = PM.list('hair').filter(d => !HAIR_SKIP.has(d.id));
        body.append(chipGrid(list, g.hairStyle, id => set('hairStyle', id), 'hairStyle'));
      } else if (tab === 'head') {
        const first = ['none', 'gele', 'headwrap', 'fila', 'red-cap', 'zanna-cap', 'kufi', 'durag', 'baseball-cap', 'beanie', 'satin-bonnet', 'hijab', 'headscarf'];
        const list = first.map(id => PM.get('headwear', id)).filter(Boolean).concat(PM.list('headwear').filter(d => !first.includes(d.id) && !HEAD_SKIP.has(d.id)));
        body.append(chipGrid(list, g.headwear || 'none', id => set('headwear', id), 'headwear'));
      } else if (tab === 'outfit') {
        const list = PM.list('clothing').filter(d => !CLOTH_SKIP.has(d.id));
        body.append(chipGrid(list, g.clothing, id => set('clothing', id), 'clothing'));
        const pats = {}; for (const d of PM.list('patterns')) if (['plain', 'ankara', 'aso-oke', 'adinkra', 'kente', 'batik', 'stripes', 'dots', 'mudcloth', 'zigzag', 'checks'].includes(d.id)) pats[d.id] = d.label;
        body.append(LS.ui.section('Fabric', chipRow(pats, g.pattern, k => { set('pattern', k); drawTab(); })));
      } else if (tab === 'colour') {
        body.append(LS.ui.section('Skin', swatches(SKINS, g.skin, c => set('skin', c))));
        body.append(LS.ui.section('Hair', swatches(HAIRS, g.hairColor, c => set('hairColor', c))));
        body.append(LS.ui.section('Outfit', swatches(CLOTHS, g.cloth1, c => set('cloth1', c)), swatches(CLOTHS, g.cloth2, c => set('cloth2', c)), swatches(CLOTHS, g.cloth3, c => set('cloth3', c))));
        if (LS.platform.player.avatar) body.append(h('button.btn', { type: 'button', onclick: matchAvatar }, 'Match my Lagos Life avatar'));
      } else if (tab === 'about') {
        const b = work.bio;
        const sel = (label, map, key) => h('label.field', h('span', label), h('select', { onchange: e => { b[key] = e.target.value; } },
          Object.entries(map).map(([k, v]) => h('option', { value: k, selected: b[key] === k }, typeof v === 'string' ? v : v.label))));
        body.append(sel('What do you do?', LS.PROFILE_JOBS, 'job'), sel('Where in Lagos?', LS.AREAS, 'area'), sel('Love language', LS.LOVE, 'love'), sel('Your red flag', LS.FLAGS, 'flag'));
        body.append(LS.ui.section('Three vibes', chipRow(LS.VIBES, b.vibes, k => {
          b.vibes = b.vibes.includes(k) ? b.vibes.filter(x => x !== k) : b.vibes.concat(k).slice(-3); drawTab();
        }, true)));
      }
    }

    function regen(o) {
      const g = work.genome;
      const next = PM.generate({ seed: g.seed, archetype: o.archetype || g.archetype, gender: o.gender || g.gender, base: g, locked: new Set([...locks].filter(k => k !== 'skin' || !o.archetype)) });
      Object.assign(g, next, LS.LOOK);
      if (o.archetype) locks.delete('skin');
      repaint(); drawTab();
    }
    async function matchAvatar() {
      const c = await LS.sampleAvatar(LS.platform.player.avatar);
      if (c && (c.skin || c.hair)) { if (c.skin) set('skin', c.skin); if (c.hair) set('hairColor', c.hair); drawTab(); G.toast('Matched your avatar’s colours.'); }
      else G.toast('Couldn’t read the avatar colours.');
    }

    for (const [k, l] of LOOK_TABS) tabs.append(h('button', { type: 'button', 'data-t': k, onclick: e => { tab = k; $('.cz-tabs button.on', tabs) && $('.cz-tabs button.on', tabs).classList.remove('on'); e.currentTarget.classList.add('on'); drawTab(); } }, l));
    tabs.firstChild.classList.add('on');

    const actions = h('div.actions',
      h('button.btn', { type: 'button', onclick: () => { work.genome.seed = Math.floor(Math.random() * 1e9); locks.clear(); regen({}); } }, 'Surprise me'),
      h('button.btn.primary', { type: 'button', onclick: save }, opts.intro ? 'Start my life' : 'Save'));
    const intro = opts.intro ? h('p.lead', 'Who are you in Lagos? Pick a look. You can change it any time from the corner.') : null;
    repaint(); drawTab();
    LS.sheet.open(opts.intro ? 'Your look' : 'Customise', h('div.cz', intro, prev, tabs, body, actions), { full: true, noClose: !!opts.intro });

    function save() {
      const bio = work.bio; work.genome.gender = LS.sexOf(work.genome); bio.looking = LS.opposite(work.genome);   // straight: you look for the other one
      G.look = { genome: work.genome, bio, locks: [...locks] };
      LS.setPlayerGender(work.genome.gender); LS.social.buffer = [];
      if (G.s) G.s.g = work.genome.gender;
      G.save(); G.refreshMe();
      LS.social.saveProfile(G.look, G.s ? LS.Engine.life(G.s) : null);
      LS.sheet.close();
      if (opts.onSave) opts.onSave(G.look);
    }
  };
})(window.LS = window.LS || {});
