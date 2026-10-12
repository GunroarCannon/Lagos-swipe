/* People: the fixed cast, generated profiles, and the player's own look.
 * Everyone is a portrait-js genome (JSON). Faces are never stored as images. */
(function (LS) {
  'use strict';
  const { clamp } = LS;

  /** How every portrait in the game is painted: true skin tones on warm paper. */
  LS.LOOK = { style: 'natural', background: 'parchment', crumple: 0.5, crumpleAll: 0.16, toneMix: 1 };

  /** Life years → portrait-js's 0..1 Age knob (wrinkles from ~0.55, grey from ~0.6). */
  LS.ageKnob = y => clamp((y - 16) / 62, 0.02, 0.98);
  const hash = s => (window.PM && PM.hashString ? PM.hashString(String(s)) : String(s).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0);
  LS.hash = hash;

  /** Build a full genome. o: { seed, archetype, gender, years, role, over: {…genome fields} } */
  LS.makeGenome = function (o) {
    const base = { role: o.role || 'everyday', age: LS.ageKnob(o.years || 25) };
    const locked = new Set(['age', 'role']);
    const g = PM.generate({ seed: o.seed, archetype: o.archetype || 'lagosian', gender: o.gender || 'fem', base, locked });
    // generate() may re-roll these when role dressing runs; apply our look and overrides last
    Object.assign(g, LS.LOOK, o.over || {});
    return g;
  };

  // ------------------------------------------------------------------ the cast (fixed faces you come to know)
  const CAST = {
    mama: { name: 'Mama', who: 'Your mother', arch: 'awori', g: 'fem', years: 57, role: 'market-trader', seed: 1101, over: { headwear: 'gele', clothing: 'buba', pattern: 'ankara' } },
    tobi: { name: 'Tobi', who: 'Best friend', arch: 'lagosian', g: 'masc', years: 25, seed: 1102, over: { hairStyle: 'fade', facialHair: 'stubble', headwear: 'none', clothing: 'hoodie' } },
    adaeze: { name: 'Adaeze', who: 'Close friend', arch: 'igbo', g: 'fem', years: 26, seed: 1103, over: { hairStyle: 'knotless-braids', headwear: 'none', clothing: 'buba' } },
    landlord: { name: 'Alhaji Bello', who: 'Landlord', arch: 'hausa', g: 'masc', years: 58, seed: 1104, over: { headwear: 'kufi', clothing: 'babanriga', facialHair: 'full-beard' } },
    boss: { name: 'Mr. Adeyemi', who: 'Your boss', arch: 'yoruba', g: 'masc', years: 47, role: 'banker', seed: 1105, over: { facialHair: 'none', eyewear: 'square-glasses', headwear: 'none' } },
    kemi: { name: 'Kemi', who: 'Colleague', arch: 'lagosian', g: 'fem', years: 29, seed: 1106, over: { hairStyle: 'frontal-wig', headwear: 'none', clothing: 'suit' } },
    aunty: { name: 'Aunty Bisi', who: 'Neighbourhood matchmaker', arch: 'yoruba', g: 'fem', years: 53, seed: 1107, over: { headwear: 'gele', clothing: 'buba', pattern: 'aso-oke', earrings: 'big-disc' } },
    pastor: { name: 'Pastor Emeka', who: 'Pastor', arch: 'igbo', g: 'masc', years: 49, seed: 1108, over: { clothing: 'suit', headwear: 'none', hairStyle: 'buzz', facialHair: 'goatee' } },
    conductor: { name: 'Danfo Conductor', who: 'Yellow bus', arch: 'lagosian', g: 'masc', years: 31, role: 'okada-rider', seed: 1109, over: { headwear: 'baseball-cap', facialHair: 'mustache' } },
    ex: { name: 'Dayo', who: 'Your ex', arch: 'yoruba', g: 'masc', years: 28, seed: 1110, over: { hairStyle: 'waves', clothing: 'kaftan', headwear: 'none' } },
    chidi: { name: 'Chidi', who: 'Crypto bro', arch: 'igbo', g: 'masc', years: 27, seed: 1111, over: { eyewear: 'sunglasses', hairStyle: 'fade', clothing: 'graphic-tee', headwear: 'none' } },
    zainab: { name: 'Zainab', who: 'Influencer', arch: 'hausa', g: 'fem', years: 24, role: 'influencer', seed: 1112, over: { headwear: 'none', hairStyle: 'frontal-wig', eyewear: 'sunglasses' } },
    doctor: { name: 'Dr. Etim', who: 'Doctor', arch: 'efik', g: 'fem', years: 41, role: 'doctor', seed: 1113, over: { headwear: 'none' } },
    mechanic: { name: 'Baba Tunde', who: 'Mechanic', arch: 'ijebu', g: 'masc', years: 51, role: 'builder', seed: 1114, over: { facialHair: 'short-beard' } },
    neighbour: { name: 'Mama Chika', who: 'Neighbour', arch: 'ikwerre', g: 'fem', years: 50, seed: 1115, over: { headwear: 'headwrap', clothing: 'wrap', pattern: 'ankara' } },
    sister: { name: 'Sis Temi', who: 'Little sister', arch: 'awori', g: 'fem', years: 19, seed: 1116, over: { hairStyle: 'bantu-knots', headwear: 'none', clothing: 'hoodie' } },
    dj: { name: 'DJ Smoke', who: 'Party starter', arch: 'ijaw', g: 'masc', years: 30, role: 'musician', seed: 1117, over: { eyewear: 'sunglasses', hairStyle: 'dreadlocks' } },
    banker: { name: 'Ngozi from the bank', who: 'Bank manager', arch: 'igbo', g: 'fem', years: 38, role: 'banker', seed: 1118, over: { headwear: 'none', hairStyle: 'bob' } },
    officer: { name: 'Officer Musa', who: 'Checkpoint', arch: 'hausa', g: 'masc', years: 39, role: 'police', seed: 1119 },
    corper: { name: 'Corper Femi', who: 'Fellow corper', arch: 'egba', g: 'masc', years: 24, role: 'corper', seed: 1120, over: { headwear: 'baseball-cap' } },
    bukola: { name: 'Mrs. Bukola', who: 'HR manager', arch: 'ijebu', g: 'fem', years: 41, role: 'banker', seed: 1121, over: { headwear: 'none', hairStyle: 'bob', eyewear: 'round-glasses' } },
  };
  LS.CAST = CAST;
  const castCache = {};
  LS.castGenome = id => {
    const c = CAST[id];
    if (!c) return null;
    return castCache[id] || (castCache[id] = LS.makeGenome({ seed: c.seed, archetype: c.arch, gender: c.g, years: c.years, role: c.role, over: c.over }));
  };

  // ------------------------------------------------------------------ generated profile cards
  const TYPES = { sweet: 40, baller: 11, broke: 11, catfish: 8, scammer: 5, clingy: 11, flaky: 12 };
  LS.TYPE_HINT = {
    sweet: 'Genuinely nice.', baller: 'Spends big, expects a lot.', broke: 'Big heart, empty pockets.', catfish: 'The photos are… ambitious.',
    scammer: 'Too good to be true.', clingy: 'Texts at 3am.', flaky: 'Cancels at the last minute.',
  };

  /** A generated "swipe" profile. Deterministic from seed. opts.show: 'fem' | 'masc' | 'all' */
  LS.makeProfile = function (seed, opts = {}) {
    const r = LS.rng('prof:' + seed);
    const arch = r.weighted(PM.NAIJA_MIX || { lagosian: 1 });
    const gender = opts.show === 'fem' || opts.show === 'masc' ? opts.show : r.pick(['fem', 'masc']);
    const years = r.int(21, 39);
    const jobKey = r.pick(Object.keys(LS.PROFILE_JOBS));
    const job = LS.PROFILE_JOBS[jobKey];
    const type = r.weighted(TYPES);
    const gseed = hash('face' + seed) % 1e9;
    const genome = LS.makeGenome({ seed: gseed, archetype: arch, gender, years, role: job.role || 'everyday' });
    if (!job.role && r.chance(0.5)) genome.expression = 'happy';
    const vibes = []; const keys = Object.keys(LS.VIBES);
    while (vibes.length < 3) { const k = r.pick(keys); if (!vibes.includes(k)) vibes.push(k); }
    const p = {
      id: 'n' + seed, kind: 'npc', name: LS.names(arch, gender, r), age: years, genome, job: jobKey, area: r.pick(Object.keys(LS.AREAS)),
      vibes, line: r.pick(LS.BIO_LINES), love: r.pick(Object.keys(LS.LOVE)), flag: r.pick(Object.keys(LS.FLAGS)), km: r.int(1, 28), type,
      pick: r.range(-0.1, 0.12), arch, gender,
    };
    if (type === 'catfish') {
      // the photos were from a few years and a few kilos ago
      p.realGenome = LS.makeGenome({ seed: gseed + 17, archetype: arch, gender, years: years + r.int(8, 16), role: job.role || 'everyday' });
    }
    return p;
  };

  /** A real player's server profile → the same shape the card renderer uses. */
  LS.fromServer = function (s) {
    const b = s.bio || {};
    return {
      id: s.id, kind: 'real', name: s.name, age: b.age || 25, genome: Object.assign({}, s.genome, LS.LOOK), job: b.job, area: b.area, vibes: b.vibes || [],
      love: b.love, flag: b.flag, life: b.life || null, avatar: s.avatar || null, best: s.best || 0, days: s.days || 0, likesYou: !!s.likesYou, gender: s.genome && s.genome.gender,
    };
  };

  LS.jobLabel = k => (LS.PROFILE_JOBS[k] && LS.PROFILE_JOBS[k].label) || '';
  LS.areaLabel = k => LS.AREAS[k] || '';

  // ------------------------------------------------------------------ the player's look
  /** Sample skin and hair colour out of the Lagos Life avatar PNG (best effort; resolves null if unsure). */
  LS.sampleAvatar = function (dataUrl) {
    return new Promise(resolve => {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.onload = () => {
        try {
          const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          const k = Math.min(S / img.width, S / img.height), w = img.width * k, h = img.height * k;
          ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
          const d = ctx.getImageData(0, 0, S, S).data;
          let top = S, bot = 0;
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 140) { top = Math.min(top, y); bot = Math.max(bot, y); }
          if (bot <= top) return resolve(null);
          const skinBins = new Map(), hairBins = new Map();
          let opaque = 0;
          for (let y = top; y <= bot; y++) for (let x = 0; x < S; x++) {
            const i = (y * S + x) * 4; if (d[i + 3] < 140) continue;
            opaque++;
            const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
            let hue = 0; const dl = mx - mn;
            if (dl) hue = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
            hue *= 60;
            const bin = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
            const rel = (y - top) / (bot - top + 1);
            if (hue >= 8 && hue <= 42 && s >= 0.2 && s <= 0.8 && v >= 0.16 && v <= 0.88 && rel < 0.75) add(skinBins, bin, r, g, b);
            else if (v < 0.28 && rel < 0.4) add(hairBins, bin, r, g, b);
          }
          const best = m => { let o = null; for (const e of m.values()) if (!o || e.n > o.n) o = e; return o; };
          const sk = best(skinBins), hr = best(hairBins);
          const hex = e => '#' + [e.r, e.g, e.b].map(c => Math.round(c / e.n).toString(16).padStart(2, '0')).join('');
          resolve({ skin: sk && sk.n > opaque * 0.03 ? hex(sk) : null, hair: hr && hr.n > opaque * 0.03 ? hex(hr) : null });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
      function add(m, bin, r, g, b) { const e = m.get(bin) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; m.set(bin, e); }
    });
  };

  /** The player's starting genome. `colors` comes from sampleAvatar (optional). */
  LS.playerGenome = function (playerId, gender, colors, archetype) {
    const over = {};
    if (colors && colors.skin) over.skin = colors.skin;
    if (colors && colors.hair) over.hairColor = colors.hair;
    return LS.makeGenome({ seed: hash('you:' + playerId) % 1e9, archetype: archetype || 'lagosian', gender: gender || 'fem', years: 23, over });
  };
})(window.LS = window.LS || {});
