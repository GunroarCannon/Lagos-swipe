/* The deck. Every card is one decision: swipe left or right (or tap a postcard).
 *
 *   C(id, who, mood, text, [leftLabel, {stat: delta}, extras], [rightLabel, {…}, extras], options)
 *
 *   who      a key of LS.CAST (the portrait), 'PARTNER', or null for the narrator card
 *   mood     an expression id from portrait-js (neutral, happy, angry, sad, scared, flirty …)
 *   text     a string, or s => string (so a card can say different things depending on what people remember)
 *   extras   { r: 'result line', set: {flag: true}, clear: ['flag'], job: +1, home: +1, friends: +1,
 *              push: [{ id, after: months }], status: 'dating',
 *              rel: ±n          how the person on the card feels about you afterwards (0–100, starts at 50)
 *              mem: [tag, text]  they REMEMBER this; later cards test it with LS.mem(s, who, tag)
 *              who: 'mama'       apply rel/mem to someone other than the person on the card
 *              go: 'cardId'      the next step of a scene, shown straight away
 *              ic: 'food'        the postcard picture (else guessed from the label)
 *            }
 *   options  { dom, w (weight), cd (cooldown in months), once, when: s => bool }
 *
 *   Scenes (extended conversations): LS.scene('interview', 'bukola', 'neutral', { a: {text, L, R}, … }) – steps jump
 *   to each other with extras.go. Scene steps only come up when something goes to them.
 *
 * Stats are wallet / heart / hustle / peace on a 0–100 bar; any bar at 0 or 100 ends the run.
 * Add cards by calling C(...) from any file loaded after this one. */
(function (LS) {
  'use strict';
  LS.CARDS = [];
  const opt = o => ({ t: o[0], fx: o[1] || {}, ex: o[2] || {} });
  const C = LS.card = (id, who, mood, text, L, R, o = {}) => { LS.CARDS.push(Object.assign({ id, who, mood, text, L: opt(L), R: opt(R), w: 1, cd: 8 }, o)); };
  const has = (s, f) => !!s.flags[f];
  const E = () => LS.Engine;
  /** What `who` (a CAST key, or 'PARTNER') remembers: LS.mem(s, 'mama', 'ignored') → {m, t} | null */
  const mem = LS.mem = (s, who, tag) => { const k = who === 'PARTNER' ? (s.partner && s.partner.id) : who; return k ? E().mem(s, k, tag) : null; };
  const recent = (s, who, tag, months) => { const m = mem(s, who, tag); return !!m && s.month - m.m <= months; };
  const relOf = (s, who) => { const k = who === 'PARTNER' ? (s.partner && s.partner.id) : who; return k ? E().rel(s, k) : 50; };

  /** A scene: steps = { a: { text, L:[label, fx, extras], R:[…], mood? }, b: … }. Ids become `${id}/${step}`. */
  LS.scene = (id, who, mood, steps, o = {}) => {
    for (const [k, st] of Object.entries(steps)) {
      const fix = side => { const x = side.slice(); x[2] = Object.assign({}, x[2]); if (x[2].go && !x[2].go.includes('/')) x[2].go = `${id}/${x[2].go}`; return x; };
      C(`${id}/${k}`, st.who || who, st.mood || mood, st.text, fix(st.L), fix(st.R), Object.assign({ dom: o.dom || 'scene', w: 0, time: 0.1, scene: true, place: st.place || o.place }, st.o || {}));
    }
  };

  // ===================================================================== START & TUTORIAL
  C('t_welcome', null, 'happy', 'Welcome to Lagos, {name}. This is your life from 23 to 35. Drag the card left or right, or tap a postcard, to decide. Every choice moves your four bars.',
    ['Okay', {}, { r: 'Swipe either way.' }], ['Let’s go', { peace: 2 }], { once: true, dom: 'tutorial', w: 0, when: () => false });
  C('t_balance', null, 'thinking', 'If any bar hits empty or overflows, your story ends. Wallet empty? Broke. Too rich? EFCC. People remember what you do, too.',
    ['Understood', {}], ['E dey!', { hustle: 2 }], { once: true, dom: 'tutorial', w: 0, when: () => false });

  // ===================================================================== FAMILY
  C('mama_call', 'mama', 'angry', '“You no dey call me o! Is it that you have forgotten the woman that carried you?”',
    ['Ignore it', { peace: -9, heart: -2 }, { r: 'Mama will remember this.', rel: -8, mem: ['ignored', 'You ignored her call.'], push: [{ id: 'mama_guilt', after: 3 }] }], ['Pick up', { peace: 5, heart: 4, hustle: -3 }, { r: 'Twenty minutes later, you know everyone’s business.', rel: 5, forget: 'ignored' }], { dom: 'family', w: 1.3 });
  C('mama_food', 'mama', 'happy', '“I made egusi and pounded yam. Come and eat, you’re getting thin.”',
    ['Too busy', { peace: -5, heart: -3, wallet: 2 }], ['Go home', { peace: 9, heart: 5, wallet: 2, hustle: -4 }], { dom: 'family' });
  C('mama_money', 'mama', 'sad', '“Your Uncle Segun needs ₦40,000 for school fees. Just small.”',
    ['I can’t', { peace: -7, heart: -3 }, { rel: -7, mem: ['refused', 'You said no when family needed money.'] }], ['Send it', { wallet: -12, peace: 6, heart: 3 }, { rel: 8, mem: ['helped', 'You sent money home when it mattered.'] }], { dom: 'family', when: s => s.stats.wallet > 25 });
  C('mama_church', 'mama', 'determined', '“Service is at nine. Wear the blue one. And greet Pastor properly.”',
    ['Sleep in', { peace: -6, hustle: -1, heart: -2 }], ['Show up', { peace: 7, heart: 3, hustle: 2 }], { dom: 'family', w: 0.8 });
  C('sis_fees', 'sister', 'sad', '“Bro/sis, my school fees are due. Please.”',
    ['Not now', { heart: -6, peace: -4 }, { rel: -8, who: 'mama', mem: ['refusedSis', 'You told your little sister no.'] }], ['Pay it', { wallet: -14, heart: 7, peace: 5 }, { rel: 8, who: 'mama', mem: ['helped', 'You paid your sister’s fees.'] }], { dom: 'family', cd: 12 });
  C('family_group', 'mama', 'surprised', 'The family WhatsApp group has 214 unread messages. Someone’s cousin is getting married.',
    ['Mute it', { peace: 4, heart: -3 }], ['Read them all', { peace: -5, heart: 4 }], { dom: 'family', w: 0.9 });
  C('village', 'mama', 'happy', '“December. Village. No excuses.”',
    ['Stay in Lagos', { peace: -8, heart: -4, hustle: 4 }], ['Travel home', { wallet: -10, peace: 10, heart: 6, hustle: -5 }], { dom: 'family', cd: 10 });
  C('uncle_loan', 'neighbour', 'flirty', '“Your uncle sent me for small money. Emergency. He’ll pay back Friday.”',
    ['Politely no', { peace: -2, wallet: 1 }], ['Give ₦10k', { wallet: -8, peace: 2, heart: 2 }], { dom: 'family', when: s => s.stats.wallet > 20 });

  // ===================================================================== WORK
  C('boss_overtime', 'boss', 'determined', '“Everyone is staying till 9pm. Including you.”',
    ['Leave at 5', { hustle: -9, peace: 5 }, { r: 'Mr. Adeyemi writes your name down.', rel: -7, mem: ['leftEarly', 'You walked out at 5 while everyone stayed.'], push: [{ id: 'boss_notice', after: 3 }] }], ['Stay late', { hustle: 8, peace: -7, wallet: 3 }, { rel: 5, forget: 'leftEarly' }], { dom: 'work', when: s => s.job >= 1, w: 1.2 });
  C('promo_chance', 'boss', 'smug', '“We’re promoting someone this quarter. Impress me.”',
    ['Stay in your lane', { hustle: -2, peace: 4 }], ['Volunteer for the big project', { hustle: 10, peace: -8 }, { push: [{ id: 'promotion', after: 2 }] }],
    { dom: 'work', when: s => s.job >= 1 && s.job < 5 && s.stats.hustle > 40, cd: 14 });
  C('promotion', 'boss', 'happy', '“Congratulations. You’re getting the new title, and the new workload.”',
    ['Decline politely', { peace: 7, hustle: -4 }], ['Accept', { hustle: 10, wallet: 8, peace: -6 }, { job: 1, r: 'New desk. Same traffic.' }],
    { dom: 'work', w: 0, once: false, when: s => s.job < 5 });
  C('salary_late', 'banker', 'sad', '“Your salary alert is delayed. Please be patient. Finance has challenges.”',
    ['Complain loudly', { hustle: -4, peace: -3, wallet: 4 }], ['Wait', { wallet: -8, peace: -2 }], { dom: 'work', when: s => s.job >= 1 });
  C('side_hustle', 'tobi', 'smug', '“I get one side gig. Small business, big profit. You in?”',
    ['Pass', { peace: 2 }], ['Join', { wallet: 8, hustle: 7, peace: -7 }, { r: 'The “small business” is mostly meetings.' }], { dom: 'work', cd: 10 });
  C('office_gossip', 'kemi', 'flirty', '“Did you hear? Mr. Adeyemi is leaving. Don’t tell anybody.”',
    ['Walk away', { hustle: 2, peace: 3 }], ['Lean in', { hustle: -3, heart: 4, peace: -2 }], { dom: 'work', when: s => s.job >= 1 });
  C('client_fight', 'kemi', 'scared', '“The client is threatening to leave. They say our work is rubbish.”',
    ['Blame someone else', { hustle: -8, peace: 2 }], ['Take responsibility', { hustle: 6, peace: -6 }], { dom: 'work', when: s => s.job >= 2 });
  C('nysc_end', 'corper', 'happy', 'Passing out parade! The NYSC year is over. Mr. Adeyemi offered you a job at the bank.',
    ['Start your own thing', { hustle: 6, wallet: -8, peace: -2 }, { job: -1, set: { startup: true }, r: 'No salary. Big dreams.' }],
    ['Take the offer', { wallet: 6, hustle: 4, peace: -2 }, { job: +1, r: 'Welcome to the bank.' }],
    { dom: 'work', w: 0, once: true, when: () => false });
  C('startup_win', 'chidi', 'laughing', '“Your product just went viral. Investors are in your DMs.”',
    ['Stay independent', { hustle: 8, peace: 4, wallet: 6 }, { set: { startupwin: true } }], ['Take the money', { wallet: 14, hustle: 10, peace: -6 }, { job: 2, set: { startupwin: true } }],
    { dom: 'work', once: true, w: 0.8, when: s => has(s, 'startup') && s.stats.hustle > 55 });
  C('layoffs', 'boss', 'sad', '“Management is restructuring. Some of you may not be here next month.”',
    ['Update your CV', { hustle: 4, peace: -5 }], ['Work harder', { hustle: 6, peace: -9 }], { dom: 'work', when: s => s.job >= 2, cd: 20 });
  C('freelance', 'tobi', 'happy', '“I have a gig for you. ₦60,000 for a weekend of work.”',
    ['Rest instead', { peace: 5 }], ['Take it', { wallet: 10, peace: -6, hustle: 3 }], { dom: 'work', when: s => s.job <= 1 });

  // ===================================================================== HOME
  C('rent_due', 'landlord', 'angry', '“Rent is due. Next year it’s going up by 30%, by the way.”',
    ['Beg for time', { peace: -7, wallet: 2 }, { r: 'He gives you until Friday. Not Friday.', rel: -10, mem: ['late', 'You begged for more time on rent.'], push: [{ id: 'landlord_late', after: 2 }, { id: 'landlord_evict', after: 8 }] }], ['Pay now', { wallet: -12, peace: 3 }, { rel: 4, forget: 'late' }], { dom: 'home', when: s => s.home >= 1, w: 1.3 });
  C('landlord_hike', 'landlord', 'smug', '“Everything is expensive. Your rent is now ₦900,000 per year.”',
    ['Start house hunting', { peace: -5, wallet: 2 }], ['Pay it', { wallet: -14, peace: 2 }], { dom: 'home', when: s => s.home >= 2, cd: 14 });
  C('generator', 'neighbour', 'angry', 'NEPA has taken light for three days. The neighbours want you to share your generator.',
    ['Say no', { peace: -3, heart: -4, wallet: 2 }, { rel: -7, mem: ['refused', 'You wouldn’t share the generator.'] }], ['Share fuel', { wallet: -6, heart: 5, peace: 2 }, { rel: 9, mem: ['shared', 'You shared fuel when the light went.'] }], { dom: 'home' });
  C('water', 'neighbour', 'sad', '“The borehole is dry again. Come and buy water with us from the tanker.”',
    ['Buy your own', { wallet: -4, peace: 2 }], ['Join them', { wallet: -2, heart: 3, peace: -2 }], { dom: 'home' });
  C('new_place', 'aunty', 'happy', '“I get one new place for you. Clean, near the road, not far from work.”',
    ['Stay where you are', { peace: 2, wallet: 2 }], ['Move!', { wallet: -18, peace: 8, hustle: 5 }, { home: 1, r: 'New keys. New neighbours.' }],
    { dom: 'home', once: false, cd: 12, when: s => s.home < 4 && s.job >= s.home + 1 && s.stats.wallet > 45 });
  C('roommate', 'tobi', 'embarrassed', '“My landlord sold the house. Can I crash on your couch for a few weeks?”',
    ['Sorry man', { heart: -6, peace: 2 }], ['Okay, come', { heart: 7, peace: -5, wallet: -3 }, { friends: 1 }], { dom: 'home', when: s => s.home >= 1 });
  C('flood', 'neighbour', 'scared', 'Heavy rain. The flood is up to the doorstep!',
    ['Move your things upstairs', { peace: -5, wallet: -3 }], ['Wait it out', { wallet: -8, peace: -8 }], { dom: 'home', w: 0.7 });
  C('burglar', 'officer', 'determined', '“There was a break-in on your street. Do you want to report it?”',
    ['No, forget it', { peace: -4, wallet: -2 }], ['File a report', { peace: 3, hustle: -2, wallet: -3 }], { dom: 'home', when: s => s.home >= 1, cd: 18 });

  // ===================================================================== MONEY
  C('alert', 'banker', 'happy', '“Credit alert! ₦150,000. A client finally paid.”',
    ['Save it', { wallet: 12, peace: 3 }], ['Treat yourself', { wallet: 5, peace: 8, heart: 3 }], { dom: 'money', w: 0.9 });
  C('ponzi', 'chidi', 'smug', '“Invest ₦50k today, get ₦150k in two weeks. It’s a guaranteed 3×.”',
    ['Pass', { peace: 2 }], ['Invest', { wallet: -14, hustle: 2 }, { push: [{ id: 'ponzi_end', after: 2 }], r: 'Famous last words.' }], { dom: 'money', cd: 18 });
  C('ponzi_end', 'chidi', 'embarrassed', '“Bro… the platform just closed. The app is gone. I’m so sorry.”',
    ['Block him', { peace: -6, heart: -2 }], ['Laugh it off', { peace: 2, heart: 2, wallet: -2 }], { dom: 'money', w: 0, when: () => false });
  C('crypto', 'chidi', 'laughing', '“Buy this coin now! It’s going to the moon!”',
    ['Ignore', { peace: 3 }], ['Buy ₦30k', { wallet: 6, peace: -6 }, { r: 'The coin went somewhere. Not the moon.' }], { dom: 'money', cd: 14 });
  C('ajo', 'aunty', 'happy', '“We’re starting ajo. ₦5,000 every week. You get your turn in month six.”',
    ['Not for me', { peace: 1 }], ['Join the ajo', { wallet: 6, heart: 3, peace: -2 }], { dom: 'money', cd: 12 });
  C('data', null, 'sad', 'Your data bundle finished mid-video call. Again.',
    ['Use the office wifi', { hustle: -3, wallet: 1 }], ['Buy 10GB', { wallet: -4, peace: 3 }], { dom: 'money', w: 0.8 });
  C('tax_man', 'banker', 'determined', '“There is a charge on your account. For the SMS alerts. And the other thing.”',
    ['Argue', { peace: -4, hustle: -2 }], ['Pay', { wallet: -5 }], { dom: 'money', when: s => s.job >= 1, w: 0.7 });
  C('big_wallet', 'officer', 'smug', '“I see you’re doing well. Maybe you can ‘support’ us for the festive season?”',
    ['Refuse', { peace: -4, hustle: -2 }], ['Dash him small', { wallet: -10, peace: 3 }], { dom: 'money', when: s => s.stats.wallet > 65, w: 1.4 });
  C('luxury', 'zainab', 'flirty', '“Darling, a bag like this is an investment.”',
    ['I’m fine', { wallet: 4, hustle: -3 }], ['Buy it', { wallet: -16, hustle: 8, heart: 3 }], { dom: 'money', when: s => s.stats.wallet > 55, w: 1.2 });

  // ===================================================================== FRIENDS & SOCIAL
  C('party', 'dj', 'laughing', '“Detty party tonight! Entry is free if you come with energy.”',
    ['Stay home', { peace: 5, heart: -3 }], ['Pull up', { heart: 8, wallet: -6, peace: -5, hustle: 3 }, { friends: 1 }], { dom: 'social', w: 1.2 });
  C('tobi_borrow', 'tobi', 'embarrassed', '“Bro, can you borrow me ₦20k? I’ll sort you Friday. Swear.”',
    ['Sorry', { heart: -6, peace: 2 }, { rel: -6, mem: ['refused', 'You wouldn’t lend him money.'] }], ['Lend it', { wallet: -8, heart: 6 }, { r: 'Friday came and went.', rel: 4, mem: ['lent', 'You lent him ₦20k.'], push: [{ id: 'tobi_repay', after: 4 }] }], { dom: 'social', when: s => s.stats.wallet > 20, cd: 10 });
  C('wedding_invite', 'adaeze', 'happy', '“I’m getting married! You must come. Aso-ebi is ₦25,000.”',
    ['Send a gift only', { wallet: -3, heart: -3 }], ['Buy the aso-ebi', { wallet: -10, heart: 8, hustle: 3 }, { friends: 1 }], { dom: 'social', cd: 12 });
  C('friend_gossip', 'adaeze', 'thinking', '“Okay, but are you really happy where you are?”',
    ['Of course', { peace: 3, heart: -1 }], ['Honestly, no', { peace: -2, heart: 5, hustle: 2 }], { dom: 'social', w: 0.7 });
  C('owambe', 'aunty', 'laughing', '“Saturday! Owambe at Ikeja. Jollof, small chops, free-flowing drinks!”',
    ['Skip it', { peace: 3, heart: -2 }], ['Dress up and go', { heart: 6, hustle: 5, wallet: -7, peace: -3 }, { friends: 1 }], { dom: 'social', w: 1.1 });
  C('friend_fight', 'tobi', 'angry', '“So you told people about my business? After everything?!”',
    ['Apologise', { heart: 4, peace: -3 }], ['Stand your ground', { heart: -8, peace: 2 }], { dom: 'social', when: s => s.friends >= 3, cd: 20 });
  C('group_trip', 'adaeze', 'happy', '“Let’s go to Calabar for the carnival! Everyone’s coming.”',
    ['Stay and work', { hustle: 4, heart: -3 }], ['Go on the trip', { wallet: -12, heart: 9, peace: 8, hustle: -3 }, { friends: 1 }], { dom: 'social', cd: 14 });
  C('football', 'tobi', 'laughing', '“Arsenal vs Man U tonight! Come to the viewing centre.”',
    ['Stay in', { peace: 3, heart: -2 }], ['Go watch', { heart: 5, wallet: -3, peace: 2 }], { dom: 'social', w: 0.8 });
  C('detty_dec', 'dj', 'smug', 'It’s December. Every club in Lagos is calling your name.',
    ['Stay in', { peace: 5, heart: -4 }], ['Detty December!', { heart: 8, wallet: -14, peace: -6, hustle: 4 }], { dom: 'social', cd: 12 });

  // ===================================================================== HEALTH
  C('malaria', 'doctor', 'determined', '“It’s malaria. You’ve been ignoring the symptoms for days.”',
    ['Self-medicate', { peace: -9, wallet: -2 }, { rel: -4, mem: ['ignored', 'You ignored her advice and self-medicated.'], push: [{ id: 'health_relapse', after: 3 }] }], ['Get treated', { wallet: -6, peace: 5 }, { rel: 6 }], { dom: 'health', w: 0.9 });
  C('gym', 'tobi', 'happy', '“Let’s start gym on Monday. Seriously this time.”',
    ['Next month', { peace: -1 }], ['Sign up', { wallet: -4, peace: 6, hustle: 2 }], { dom: 'health' });
  C('burnout', 'doctor', 'sad', '“You’re exhausted. Your body is asking for rest.”',
    ['Keep pushing', { hustle: 6, peace: -12 }], ['Take a break', { hustle: -6, peace: 11, wallet: -3 }], { dom: 'health', when: s => s.stats.peace < 45, w: 1.8 });
  C('street_food', 'neighbour', 'happy', '“Fresh suya! Last stick for you.”',
    ['Walk past', { peace: 1, wallet: 1 }], ['Buy two sticks', { wallet: -2, peace: 4, heart: 1 }], { dom: 'health', w: 0.7 });
  C('therapy', 'doctor', 'thinking', '“Have you thought about talking to someone? There are good therapists here.”',
    ['Not for me', { peace: -3 }], ['Book a session', { wallet: -6, peace: 10, heart: 2 }], { dom: 'health', when: s => s.stats.peace < 50, cd: 18 });

  // ===================================================================== CITY LIFE
  C('traffic', 'conductor', 'laughing', '“Third Mainland is stuck! Na two hours o. Which road you wan take?”',
    ['Wait it out', { peace: -5, hustle: -3 }], ['Take the okada', { wallet: -3, peace: -4, hustle: 3 }, { r: 'You arrive alive. Barely.' }], { dom: 'city', w: 1.2 });
  C('danfo_fight', 'conductor', 'angry', '“Madam/Sir, change! Your ₦200 note is tearing. Add another ₦50.”',
    ['Argue', { peace: -4, hustle: -2 }], ['Pay and move on', { wallet: -1, peace: 2 }], { dom: 'city' });
  C('checkpoint', 'officer', 'smug', '“Your particulars? You look like somebody that can ‘settle’.”',
    ['Insist on the law', { peace: -6, hustle: 3 }, { r: 'It takes forty minutes. You win. Technically.' }], ['Settle him', { wallet: -4, peace: 2 }], { dom: 'city' });
  C('fuel', 'conductor', 'scared', 'Fuel scarcity. The queue stretches round the corner.',
    ['Queue for hours', { hustle: -6, peace: -4, wallet: 1 }], ['Buy from the black market', { wallet: -8, peace: -1 }], { dom: 'city', cd: 10 });
  C('mechanic', 'mechanic', 'determined', '“Your car engine… we need to change everything. ₦280,000.”',
    ['Get a second opinion', { peace: -3, wallet: -3 }], ['Fix it', { wallet: -14, hustle: 3 }], { dom: 'city', when: s => s.job >= 3, cd: 18 });
  C('lagos_light', null, 'happy', 'NEPA brought light. Everyone is screaming with joy.',
    ['Cook everything', { wallet: -2, peace: 4 }], ['Charge everything', { peace: 5, hustle: 2 }], { dom: 'city', w: 0.5 });
  C('market', 'neighbour', 'laughing', '“Fresh tomatoes! Pepper! Fresh fish! Oya, how much you go pay?”',
    ['Haggle hard', { wallet: 2, peace: -2 }], ['Pay what she asks', { wallet: -4, heart: 3 }], { dom: 'city', w: 0.7 });
  C('influencer_dm', 'zainab', 'flirty', '“Hey, can I feature you in a video? It’s free exposure!”',
    ['No thanks', { peace: 2 }], ['Do it', { hustle: 6, peace: -3, heart: 2 }, { r: 'It got 40 views. Three of them were Mama.' }], { dom: 'city', w: 0.8 });

  // ===================================================================== FAITH & COMMUNITY
  C('pastor', 'pastor', 'happy', '“A word for you today: the Lord says your season is coming. Also, building fund.”',
    ['Nod politely', { peace: 4 }], ['Give ₦5k', { wallet: -5, peace: 7, heart: 3 }], { dom: 'faith', w: 0.8 });
  C('aunty_match', 'aunty', 'flirty', '“I have the perfect person for you. Her family is very respectable.”',
    ['No thanks, Aunty', { peace: -2, heart: -1 }], ['Meet them', { heart: 4, peace: -4 }, { push: [{ id: 'aunty_date', after: 1 }] }], { dom: 'faith', when: s => !s.partner, cd: 14 });
  C('aunty_date', 'aunty', 'embarrassed', 'The “perfect person” has a lot of opinions about your career. Also, your hairline.',
    ['Escape through the window', { peace: 4, heart: -3 }], ['Be polite', { peace: -4, heart: 3, hustle: 2 }], { dom: 'faith', w: 0, when: () => false });

  // ===================================================================== PARTNER (only when you have one)
  const dating = s => !!s.partner;
  C('date_night', 'PARTNER', 'smitten', '{partner} wants a proper date night. “Just us, no phones.”',
    ['Stay in', { heart: 2, wallet: 2, peace: 2 }, { go: 'dn/home' }], ['Go out', { heart: 4, wallet: -3 }, { go: 'dn/out' }], { dom: 'partner', when: dating, w: 1.3, cd: 6 });
  C('p_mama', 'mama', 'thinking', '“So… when am I meeting {partner}? Which family is that again?”',
    ['Not yet', { peace: -4, heart: -2 }], ['Bring them home', { peace: 5, heart: 5, hustle: -2 }], { dom: 'partner', when: s => dating(s) && !has(s, 'metmama'), once: true });
  C('p_argument', 'PARTNER', 'angry', s => (mem(s, 'PARTNER', 'forgot') ? '{partner}: “You forgot our anniversary. And you’re still working. Do you even see me?”' : mem(s, 'PARTNER', 'exreply') ? '{partner}: “You replied to your ex. Don’t make me say it twice.”' : '{partner}: “You never listen. It’s always work, work, work.”'),
    ['Stand your ground', { heart: -9, hustle: 4 }, { rel: -8 }], ['Apologise', { heart: 5, peace: -3 }, { rel: 6, forget: 'forgot' }], { dom: 'partner', when: dating });
  C('p_gift', 'PARTNER', 'happy', '{partner} surprised you with a gift. It’s a small thing, but it’s thoughtful.',
    ['Say thanks', { heart: 5 }], ['Plan something back', { heart: 8, wallet: -5 }], { dom: 'partner', when: dating, w: 0.8 });
  C('p_ex', 'ex', 'flirty', '“Hey you. I know it’s been a while. I just wanted to say hi.”',
    ['Don’t reply', { heart: 2, peace: 2 }, { who: 'PARTNER', rel: 3 }], ['Reply', { heart: -6, peace: -5 }, { who: 'PARTNER', rel: -8, mem: ['exreply', 'They saw you reply to your ex.'] }], { dom: 'partner', cd: 14, w: 0.8 });
  C('proposal', 'PARTNER', 'smitten', 'It’s been a while. You think {partner} is the one. Time to ask?',
    ['Not yet', { heart: -4, peace: 2 }], ['Propose!', { heart: 12, wallet: -14, peace: -2 }, { status: 'engaged', r: 'They said yes!' }],
    { dom: 'partner', once: true, when: s => dating(s) && s.status === 'dating' && s.month - s.partner.since >= 6 && s.stats.heart > 50 });
  C('wedding', 'PARTNER', 'laughing', 'The wedding is coming. Owambe or a quiet affair?',
    ['A small ceremony', { wallet: -6, heart: 10, peace: 5 }, { status: 'married', r: 'Intimate. Beautiful. Mama has opinions.' }],
    ['Full Lagos owambe!', { wallet: -32, hustle: 10, heart: 14, peace: -10 }, { status: 'married', r: 'There were 600 guests. You knew 80.' }],
    { dom: 'partner', once: true, when: s => s.status === 'engaged' && s.month - (s.partner.engagedAt || 0) >= 4 });
  C('p_married', 'PARTNER', 'happy', '{partner}: “Let’s plan the next five years. House, business, maybe a baby?”',
    ['Take it slow', { peace: 3, heart: 2 }], ['Make a plan', { hustle: 4, heart: 6, wallet: -4 }], { dom: 'partner', when: s => s.status === 'married', cd: 10 });
  C('p_breakup', 'PARTNER', 'sad', '{partner}: “I think we want different things.”',
    ['Let them go', { heart: -14, peace: 3 }, { clear: ['partner'], status: 'single' }], ['Fight for it', { heart: -4, peace: -8 }],
    { dom: 'partner', cd: 10, w: 1.5, when: s => dating(s) && s.status !== 'married' && s.stats.heart < 30 });


  // ===================================================================== PEOPLE REMEMBER
  // Follow-ups: the same people, a few months later, and what you did before shapes what they say.
  C('mama_guilt', 'mama', 'sad', '“Last time I called, you didn’t pick. I almost sent your cousin to your house. Is this how I raised you?”',
    ['I was busy, Ma', { peace: -5 }, { rel: -4 }], ['I’m sorry, Mama', { peace: 4, heart: 3 }, { rel: 9, forget: 'ignored' }],
    { dom: 'family', w: 0, when: () => false });
  C('mama_proud', 'mama', 'happy', '“I told Pastor, and the whole church, that my child is looking after the family. God will reward you.”',
    ['Aww, Mama', { peace: 5, heart: 3 }], ['Please don’t tell Aunty Bisi', { peace: -2, heart: 2 }, { push: [{ id: 'aunty_match', after: 1 }] }],
    { dom: 'family', w: 1.1, cd: 18, when: s => recent(s, 'mama', 'helped', 14) });
  C('mama_cold', 'mama', 'angry', '“Your aunty said she saw you at a party last week. But you can’t come home? Okay. It’s fine.”',
    ['Explain yourself', { peace: -4, heart: 2 }, { rel: 3 }], ['Let it go', { peace: -7, heart: -4 }, { rel: -6 }],
    { dom: 'family', w: 1.3, cd: 16, when: s => relOf(s, 'mama') < 38 });
  C('landlord_late', 'landlord', 'angry', '“Friday has come and gone. I gave you time because you begged me. Now it’s double.”',
    ['Pay everything', { wallet: -18, peace: 3 }, { rel: 5, forget: 'late' }], ['Beg again', { peace: -9, wallet: 3 }, { rel: -14, mem: ['lateAgain', 'You begged him twice.'] }],
    { dom: 'home', w: 0, when: () => false });
  C('landlord_evict', 'landlord', 'rage', '“Seven days. I’m done with excuses. Pack your things or I change the lock.”',
    ['Move back to Mama’s', { peace: -9, wallet: 3, hustle: -4 }, { home: -1, r: 'Back to the box room and the commentary.' }], ['Plead for a month', { wallet: -20, peace: -10 }, { rel: 6 }],
    { dom: 'home', w: 2, cd: 20, when: s => s.home >= 1 && relOf(s, 'landlord') < 15 });
  C('tobi_repay', 'tobi', 'laughing', s => (relOf(s, 'tobi') >= 45 ? '“Bro! Look at me. I sorted your ₦20k, plus a little extra for the wait. Thank you for believing in me.”' : '“About that ₦20k… Bro, I’m still looking. Please don’t be angry.”'),
    ['Tell him to keep it', { heart: 8, peace: 2 }, { rel: 8, forget: 'lent' }], ['Collect it', { wallet: 8, heart: 2 }, { rel: 2, forget: 'lent' }],
    { dom: 'social', w: 0, when: () => false });
  C('boss_notice', 'boss', 'determined', '“Your name keeps coming up for leaving early. I’m not saying anything. But I’m noticing.”',
    ['Promise to do better', { hustle: 3, peace: -5 }, { rel: 6, forget: 'leftEarly' }], ['Update your CV', { hustle: -4, peace: 2 }, { job: -1, r: 'Out. Their loss, you tell yourself.' }],
    { dom: 'work', w: 0, when: () => false });
  C('health_relapse', 'doctor', 'determined', '“I told you to rest. Now it’s worse. Three days in hospital, and we’re doing it properly this time.”',
    ['Sigh and agree', { wallet: -12, peace: -8, hustle: -5 }, { forget: 'ignored' }], ['Argue with the doctor', { wallet: -12, peace: -12, hustle: -7 }, { rel: -8 }],
    { dom: 'health', w: 0, when: () => false });
  C('neighbour_help', 'neighbour', 'happy', '“I made too much jollof. You shared your fuel when the light went. Take, take, don’t argue.”',
    ['Thank her', { peace: 6, heart: 5, wallet: 2 }], ['Offer to buy', { wallet: -2, heart: 3, peace: 3 }],
    { dom: 'home', w: 1.4, cd: 14, when: s => recent(s, 'neighbour', 'shared', 16) });
  C('neighbour_grudge', 'neighbour', 'angry', '“Your music is loud. And you couldn’t even share your fuel when the whole street was in the dark.”',
    ['Apologise', { peace: -3, heart: 3 }, { rel: 6, forget: 'refused' }], ['Turn it up', { peace: 2, heart: -6 }, { rel: -8 }],
    { dom: 'home', w: 1.2, cd: 16, when: s => recent(s, 'neighbour', 'refused', 16) });
  C('p_anniv', 'PARTNER', 'smitten', 'It’s been a year since you made it official. {partner} says nothing about it. But you can see them waiting.',
    ['Pretend to forget', { wallet: 2 }, { rel: -12, mem: ['forgot', 'You forgot the anniversary.'] }], ['Surprise them', { wallet: -8, heart: 9 }, { rel: 12, mem: ['anniv', 'You remembered the anniversary.'] }],
    { dom: 'partner', once: true, when: s => !!s.partner && s.month - s.partner.since >= 12 });
  C('p_forgive', 'PARTNER', 'thinking', '{partner}: “I’ve been thinking about the thing you did. I’m not angry. I just need to know it won’t happen again.”',
    ['Promise it', { heart: 6, peace: 2 }, { rel: 8, forget: 'exreply' }], ['Say they’re overreacting', { heart: -8, peace: -3 }, { rel: -10 }],
    { dom: 'partner', cd: 12, w: 1.3, when: s => !!mem(s, 'PARTNER', 'exreply') && s.month - mem(s, 'PARTNER', 'exreply').m > 3 });

  // ===================================================================== SCENES (extended conversations)
  // ---- a job interview: four short cards, the road you take decides the result
  C('interview', 'banker', 'thinking', '“We have a role that fits you. Can you come for an interview tomorrow?”',
    ['Not interested', { peace: 2, hustle: -2 }], ['Go for it', { hustle: 3, wallet: -3 }, { go: 'iv/1', r: 'The suit is borrowed.' }], { dom: 'work', when: s => s.job === 0, cd: 10 });
  LS.scene('iv', 'bukola', 'neutral', {
    1: { text: '“Thanks for coming. First, tell me about yourself. Briefly.”', mood: 'neutral', place: 'work',
      L: ['Keep it modest', { hustle: -1, heart: 2 }, { go: '2m', ic: 'chat' }], R: ['Sell yourself', { hustle: 3, peace: -2 }, { go: '2s', ic: 'work' }] },
    '2m': { text: '“And where do you see yourself in five years?”', mood: 'thinking',
      L: ['“Honestly, I’m not sure.”', { peace: 2 }, { go: 'rej', ic: 'no' }], R: ['“Running this department.”', { hustle: 2 }, { go: 'hire', ic: 'work' }] },
    '2s': { text: '“Big claims. Can you handle a high-pressure team?”', mood: 'smug',
      L: ['“I’ll learn fast.”', { hustle: 1 }, { go: 'hire', ic: 'work' }], R: ['“I never fail.”', { hustle: 4, peace: -3 }, { go: 'hireBoast', ic: 'party' }] },
    rej: { text: 'They smile politely. “We’ll be in touch.” They never are.', mood: 'sad', place: 'work',
      L: ['Keep applying', { hustle: -3, peace: -3 }, { ic: 'work' }], R: ['Treat yourself to suya', { wallet: -2, peace: 4 }, { ic: 'food' }] },
    hire: { text: '“Congratulations. We’d like you to start Monday.” You get the job.', mood: 'happy', place: 'work',
      L: ['Accept, humbly', { hustle: 6, wallet: 4 }, { job: 1, ic: 'work' }], R: ['Negotiate the salary', { hustle: 7, wallet: 8, peace: -2 }, { job: 1, ic: 'cash' }] },
    hireBoast: { text: '“Impressive. You start Monday, leading the new project.” (You have never led a project.)', mood: 'smug', place: 'work',
      L: ['Accept and panic', { hustle: 8, wallet: 6, peace: -9 }, { job: 1, ic: 'work' }], R: ['Confess it’s a stretch', { hustle: 4, peace: 3, wallet: 3 }, { job: 1, ic: 'heart', r: 'They respect the honesty.' }] },
  });

  // ---- a night in with your partner
  LS.scene('dn', 'PARTNER', 'happy', {
    home: { text: '{partner} lights a candle and pretends NEPA didn’t do it. “Cook something with me?”', mood: 'happy', place: 'home',
      L: ['Order food', { wallet: -4, heart: 3 }, { go: 'talk', ic: 'phone' }], R: ['Cook together', { wallet: -2, heart: 6, peace: 3 }, { go: 'talk', ic: 'food' }] },
    out: { text: '{partner} picked the spot. A small place in Surulere. The suya man knows their name.', mood: 'laughing', place: 'mamaput',
      L: ['Share a plate', { wallet: -3, heart: 4 }, { go: 'talk', ic: 'food' }], R: ['Order everything', { wallet: -10, heart: 3 }, { go: 'talk', ic: 'party' }] },
    talk: { text: '{partner} goes quiet. “Do you ever think about where we’re going?”', mood: 'thinking',
      L: ['“Let’s see what happens.”', { heart: -2, peace: 2 }, { go: 'end', ic: 'bed', rel: -3 }], R: ['“I think about it all the time.”', { heart: 6 }, { go: 'end', ic: 'heart', rel: 6, mem: ['future', 'You told them you think about the future together.'] }] },
    end: { text: 'The evening ends with the two of you on the balcony, watching generators glow across the street.', mood: 'smitten',
      L: ['Walk them home', { heart: 5, peace: 2 }, { ic: 'heart' }], R: ['Ask them to stay', { heart: 7, peace: 3 }, { ic: 'bed' }] },
  });

  // ---- a family meeting about Uncle Segun
  C('uncle_hospital', 'sister', 'scared', '“Bro/Sis, Uncle Segun is in hospital. They want a deposit. Mama said I should call you.”',
    ['Say you’ll think about it', { peace: -4 }, { go: 'fm/1', rel: -3 }], ['Go to the hospital', { peace: -2, wallet: -3 }, { go: 'fm/1', r: 'The corridor smells of antiseptic and jollof.' }],
    { dom: 'family', once: true, w: 0.9, cd: 40, when: s => s.month > 10 });
  LS.scene('fm', 'mama', 'sad', {
    1: { text: 'The whole family is in the waiting room. Everyone has an opinion. Mama looks at you. “You’re the one who understands money.”', mood: 'sad', place: 'home',
      L: ['“Let’s share the cost.”', { wallet: -6, peace: 3 }, { go: '2', who: 'mama', rel: 5, ic: 'chat' }], R: ['“I’ll cover the deposit.”', { wallet: -16, heart: 4 }, { go: '3', who: 'mama', rel: 10, mem: ['covered', 'You paid for Uncle Segun’s hospital deposit.'], ic: 'cash' }] },
    2: { text: 'Cousin Bayo: “I’m a student. Aunty, you know I have nothing.” Aunty Bisi: “And I paid last time.” The room goes quiet.', mood: 'embarrassed', who: 'aunty',
      L: ['Mediate', { peace: -5, heart: 3 }, { go: '3', ic: 'chat' }], R: ['Stay out of it', { peace: -2, heart: -3 }, { go: '3', ic: 'no' }] },
    3: { text: 'Uncle Segun is stable. The doctor says another hour and it would have been different. Mama squeezes your hand and says nothing.', mood: 'happy', who: 'doctor',
      L: ['Rest for a day', { peace: 6, hustle: -3 }, { ic: 'bed' }], R: ['Go back to work', { hustle: 4, peace: -2 }, { ic: 'work' }] },
  });

  // ===================================================================== ENDINGS
  LS.ENDINGS = {
    wallet_low: { title: 'Broke', who: 'landlord', mood: 'angry', text: 'Your wallet is empty. The landlord changed the lock and your clothes are on the stairs. You borrow money from every WhatsApp group and move back to Mama’s house.' },
    wallet_high: { title: 'Too rich', who: 'officer', mood: 'smug', text: 'Your account has so many zeros that the EFCC invites you “for a little chat.” You explain it’s from your side hustle. They don’t believe it.' },
    heart_low: { title: 'Lonely', who: 'aunty', mood: 'sad', text: 'You’ve been alone so long that Aunty Bisi has put your picture in her “urgent matters” folder. You still check your phone for texts that never arrive.' },
    heart_high: { title: 'Love drunk', who: 'adaeze', mood: 'surprised', text: 'You gave everyone your whole heart. Now you’re attending four weddings, two christenings and a naming ceremony on the same weekend, and you’ve lost track of your own plans.' },
    hustle_low: { title: 'Invisible', who: 'boss', mood: 'neutral', text: '“Who are you again?” says the new manager. Nobody remembers your name. You keep refreshing LinkedIn. Even the bots don’t reply.' },
    hustle_high: { title: 'Too big', who: 'zainab', mood: 'rage', text: 'You became famous. Then a gossip blog posted your private chats. By Monday everyone had an opinion, and half of them were screenshots.' },
    peace_low: { title: 'Japa', who: 'mama', mood: 'crying', text: 'The traffic, the NEPA, the pressure, the group chats. You’re done. You sold everything, got a visa, and moved to Calgary. Mama cried for a week, then asked what snow tastes like.' },
    peace_high: { title: 'Settled down', who: 'pastor', mood: 'happy', text: 'Everything is calm. You’re a deacon now, in bed by nine, and Mama has picked your spouse. You’re at peace. Mostly.' },
    victory: { title: 'The Big 3-5', who: 'adaeze', mood: 'laughing', text: 'You reached thirty-five in Lagos, with all four bars still standing. That’s a feat. The owambe is huge, the jollof is perfect, and everybody wants to know your secret.' },
  };
})(window.LS = window.LS || {});
