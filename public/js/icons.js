/* Postcard art: tiny ink-and-wash scenes for the two choices at the bottom of the screen.
 * Each picture is a 120×84 SVG drawn with the same ink line as the rest of the game. LS.postcard(opt, card)
 * picks one from the option's `ic`, from keywords in its label, or from the stat it changes most. */
(function (LS) {
  'use strict';
  const I = '#1c1410';
  const g = (inner, extra = '') => `<g fill="none" stroke="${I}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</g>`;
  const fill = (c, inner) => `<g fill="${c}" stroke="${I}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  const SK = `<path d="M0 74h120" stroke="${I}" stroke-width="3" fill="none"/>`;

  const ART = {
    food: { c: ['#f0b24a', '#c8542a'], svg:
      fill('#f6eed9', '<rect x="22" y="40" width="76" height="34"/>') +
      fill('#b3262a', '<path d="M14 40l8-20h76l8 20z"/>') + g('<path d="M34 20l-4 20M50 20l-2 20M66 20v20M82 20l2 20"/>') +
      fill('#d4a017', '<circle cx="42" cy="56" r="10"/><circle cx="68" cy="56" r="10"/>') + g('<path d="M30 74h60M42 46v-6M68 46v-6"/>') + SK },
    rooftop: { c: ['#ffb36b', '#3a5a8a'], svg:
      fill('#f6eed9', '<circle cx="92" cy="22" r="10"/>') +
      fill('#33485a', '<path d="M6 74V44h14v30M20 74V26h16v48M36 74V50h14v24M50 74V34h18v40M68 74V52h12v22M80 74V40h14v34M94 74V56h20v18"/>') +
      g('<path d="M0 70h120M8 70v8M32 70v8M56 70v8M80 70v8M104 70v8"/>') },
    cash: { c: ['#86c775', '#2f7a4a'], svg:
      fill('#f6eed9', '<rect x="14" y="22" width="76" height="42" rx="4"/>') + g('<circle cx="52" cy="43" r="11"/><path d="M22 30h6M78 56h6"/>') +
      `<text x="52" y="50" text-anchor="middle" font-size="18" font-weight="700" fill="${I}" font-family="Permanent Marker, sans-serif">₦</text>` +
      fill('#d4a017', '<circle cx="96" cy="56" r="13"/>') + g('<path d="M96 50v12M91 56h10"/>') },
    phone: { c: ['#79bfec', '#2b6fa8'], svg:
      fill('#f6eed9', '<rect x="38" y="8" width="44" height="68" rx="8"/>') + g('<path d="M52 14h16"/><circle cx="60" cy="68" r="3"/>') +
      fill('#7fd0c0', '<path d="M46 26h26a4 4 0 014 4v8a4 4 0 01-4 4H58l-8 6v-6h-4a4 4 0 01-4-4v-8a4 4 0 014-4z"/>') +
      fill('#f08aa8', '<path d="M50 52h20a4 4 0 014 4v4a4 4 0 01-4 4h-4v5l-6-5H50a4 4 0 01-4-4v-4a4 4 0 014-4z"/>') },
    party: { c: ['#de78c6', '#6a2a8a'], svg:
      g('<path d="M60 4v14"/>') + fill('#f6eed9', '<circle cx="60" cy="40" r="22"/>') + g('<path d="M38 40h44M60 18v44M44 26c10 6 22 6 32 0M44 54c10-6 22-6 32 0"/>') +
      fill('#f7d54a', '<path d="M14 24l4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1zM98 16l3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1z"/>') + SK },
    bed: { c: ['#7480d0', '#2b2f6a'], svg:
      fill('#f6eed9', '<circle cx="94" cy="20" r="11"/>') + fill('#2b2f6a', '<circle cx="99" cy="17" r="9"/>') +
      fill('#f6eed9', '<rect x="14" y="40" width="92" height="20" rx="4"/><rect x="18" y="30" width="26" height="14" rx="6"/>') + fill('#b3262a', '<path d="M46 40h60v20H46z"/>') +
      g('<path d="M14 60v14M106 60v14"/>') },
    church: { c: ['#f4d67c', '#b88a2a'], svg:
      fill('#f6eed9', '<path d="M30 74V40l30-18 30 18v34z"/>') + g('<path d="M60 22V8M54 14h12"/>') + fill('#8a4a2a', '<path d="M52 74V54a8 8 0 0116 0v20"/>') +
      fill('#7fb2c0', '<circle cx="60" cy="38" r="6"/>') + SK },
    work: { c: ['#8fa6bc', '#33485a'], svg:
      fill('#c99a4b', '<rect x="24" y="34" width="72" height="38" rx="5"/>') + g('<path d="M46 34v-8h28v8M24 52h72M56 52v6h8v-6"/>') },
    no: { c: ['#e8806e', '#a1291f'], svg:
      fill('#f6eed9', '<circle cx="60" cy="42" r="30"/>') + g('<path d="M39 21l42 42" stroke-width="7"/>') + g('<circle cx="60" cy="42" r="30"/>') },
    chat: { c: ['#86d6c6', '#2a7f78'], svg:
      fill('#f6eed9', '<path d="M14 18h50a6 6 0 016 6v20a6 6 0 01-6 6H34l-12 10V50h-8a6 6 0 01-6-6V24a6 6 0 016-6z"/>') +
      fill('#f7d54a', '<path d="M56 36h44a6 6 0 016 6v18a6 6 0 01-6 6h-6v10l-12-10H56a6 6 0 01-6-6V42a6 6 0 016-6z"/>') + g('<path d="M60 48h36M60 56h24"/>') },
    heart: { c: ['#f294b0', '#b3264a'], svg:
      fill('#d94a6a', '<path d="M60 70C24 48 20 22 38 18c10-2 18 6 22 12 4-6 12-14 22-12 18 4 14 30-22 52z"/>') +
      fill('#f6eed9', '<path d="M96 24c-6-6-12 2-6 8l6 6 6-6c6-6 0-14-6-8z" transform="scale(.7) translate(40 10)"/>') },
    bus: { c: ['#f7dc5a', '#c8982a'], svg:
      fill('#f2c230', '<rect x="10" y="24" width="100" height="40" rx="8"/>') + g('<path d="M10 44h100"/>') + fill('#f6eed9', '<rect x="18" y="30" width="18" height="12"/><rect x="42" y="30" width="18" height="12"/><rect x="66" y="30" width="18" height="12"/><rect x="90" y="30" width="14" height="12"/>') +
      fill('#16120f', '<circle cx="34" cy="66" r="9"/><circle cx="88" cy="66" r="9"/>') + fill('#f6eed9', '<circle cx="34" cy="66" r="3"/><circle cx="88" cy="66" r="3"/>') },
    home: { c: ['#ebbf86', '#9a5a2a'], svg:
      fill('#f6eed9', '<path d="M24 74V42L60 14l36 28v32z"/>') + fill('#b3262a', '<path d="M16 44L60 8l44 36"/>') + fill('#8a4a2a', '<rect x="50" y="52" width="20" height="22"/>') +
      fill('#7fb2c0', '<rect x="30" y="46" width="14" height="12"/><rect x="76" y="46" width="14" height="12"/>') },
    health: { c: ['#a2dca6', '#2f8a55'], svg:
      fill('#f6eed9', '<rect x="26" y="12" width="68" height="62" rx="10"/>') + fill('#d94a4a', '<path d="M52 24h16v16h16v14H68v16H52V54H36V40h16z"/>') },
    gift: { c: ['#cc92ea', '#7a2aa8'], svg:
      fill('#f2c230', '<rect x="26" y="34" width="68" height="40"/>') + fill('#b3262a', '<rect x="20" y="26" width="80" height="14"/><rect x="54" y="26" width="12" height="48"/>') +
      g('<path d="M60 26c-8-14-22-8-14 0M60 26c8-14 22-8 14 0"/>') },
    charm: { c: ['#8fd69a', '#1b6b4a'], svg:
      fill('#4a9a5a', '<path d="M60 44c-14-24-36-6-18 10 6 5 12 6 18 6 6 0 12-1 18-6 18-16-4-34-18-10z"/><path d="M60 44c-24-10-14-34 0-18 14-16 24 8 0 18z" transform="translate(0 4)"/>') + g('<path d="M60 60v18"/>') },
    skyline: { c: ['#f1dcae', '#c99a4b'], svg:
      fill('#f6eed9', '<path d="M10 74V44h20v30M30 74V30h22v44M52 74V50h16v24M68 74V36h22v38M90 74V56h20v18"/>') + SK },
  };
  LS.ART = ART;

  // word → picture, tried in order against the option's label
  const GUESS = [
    [/mama put|buka|suya|jollof|cook|eat|lunch|food|buy two|dinner|plate|share a/, 'food'],
    [/rooftop|vi\b|view|lounge/, 'rooftop'],
    [/call|pick up|reply|text|message|phone|answer|ignore it|leave it on seen|mute|dm/, 'phone'],
    [/party|owambe|pull up|detty|dress up|club|dance|trip|travel|carnival|celebrat|viewing|watch|everything/, 'party'],
    [/church|service|pastor|pray|tithe|give ₦5k|nod politely/, 'church'],
    [/sleep|rest|break|stay in|stay home|bed|nap|skip it|later|couch|relax/, 'bed'],
    [/pay|send|give|lend|dash|invest|settle|₦|buy|split|cover|fix|rent|save it|charge|spend|treat/, 'cash'],
    [/work|overtime|stay late|volunteer|project|promot|interview|accept|apply|cv|job|hustle|client|boss|startup|gig|gym|sign up/, 'work'],
    [/okada|danfo|bus|traffic|queue|road|move|walk|drive/, 'bus'],
    [/doctor|hospital|treat|clinic|therapy|session|medicine|sick/, 'health'],
    [/home|house|landlord|room|stay where|place|key/, 'home'],
    [/love|date|heart|kiss|wife|husband|partner|official|propose|forgive|sorry|apolog|warm|honest|surprise|flirt|loyal/, 'heart'],
    [/talk|chat|say|tell|explain|argue|greet|laugh|joke|hello|mediate|confess/, 'chat'],
    [/no\b|not |can’t|don’t|refuse|decline|pass|walk away|block|reject|never|nothing|ignore|deny|let go|cool/, 'no'],
  ];
  const STAT_ART = { wallet: 'cash', heart: 'heart', hustle: 'work', peace: 'bed' };

  /** The picture key for a choice. */
  LS.artFor = function (opt, card) {
    if (opt.ic && ART[opt.ic]) return opt.ic;
    const t = String(opt.t || '').toLowerCase();
    for (const [re, k] of GUESS) if (re.test(t)) return k;
    let best = null, mag = 0;
    for (const [k, v] of Object.entries(opt.fx || {})) if (Math.abs(v) > mag) { mag = Math.abs(v); best = k; }
    return best ? STAT_ART[best] : (card && card.kind === 'ending' ? 'bed' : 'skyline');
  };

  /** An <svg> string for a picture key. */
  LS.artSVG = k => {
    const a = ART[k] || ART.skyline;
    return `<svg viewBox="0 0 120 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.c[0]}"/><stop offset="1" stop-color="${a.c[1]}"/></linearGradient></defs>` +
      `<rect width="120" height="84" fill="url(#g-${k})"/>${a.svg}</svg>`;
  };
})(window.LS = window.LS || {});
