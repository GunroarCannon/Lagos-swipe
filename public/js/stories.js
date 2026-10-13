/* Storylines: chains of cards where one choice sets off several later events, which set off more.
 * A story starts from a normal deck card (the "hook"). Its chapters are cards with w: 0, reached with
 * `push` (some time later, optionally { p: chance, if: s => bool } so one choice fans out) or `go` (right away).
 * People who join the story are brought in with `intro: { role, sub, g, years }` and appear as who: '@role'.
 * `story: [id, 'what just happened', 'done'|'failed']` writes the story log shown in People & stories.
 * Flags set with `set` and what people remember (`mem`) decide how the story ends. */
(function (LS) {
  'use strict';
  const flag = (s, k) => !!s.flags[k];
  const rel = (s, k) => LS.Engine.rel(s, k);
  const ST = (id, title, blurb) => { LS.STORIES[id] = { title, blurb }; };
  /** A story chapter: only reachable from another card. */
  const CH = (id, who, mood, text, L, R, o = {}) => LS.card(id, who, mood, text, L, R, Object.assign({ w: 0, dom: 'story', cd: 0 }, o));
  const HOOK = (id, who, mood, text, L, R, o = {}) => LS.card(id, who, mood, text, L, R, Object.assign({ dom: 'story', once: true, w: 0.9 }, o));

  // ===================================================================== THE STARTUP
  ST('startup', 'The Startup', 'Tobi has an idea. A developer, an investor and a rider strike later, you find out what kind of founder you are.');
  const su = { story: 'startup' };
  HOOK('su_idea', 'tobi', 'smug', '“{bro}, I have an idea. One app for groceries and cooked food, delivered inside estates. I can build it. I need somebody who can sell. You in?”',
    ['Not for me', { peace: 2 }, { rel: -4, story: ['startup', 'Tobi asked you to build a company with him. You said no.', 'failed'], push: [{ id: 'su_regret', after: 9, p: 0.8 }] }],
    ['I’m in', { hustle: 4, peace: -3 }, { rel: 6, mem: ['founding', 'You said yes when he asked you to build something together.'], set: { su: true }, ic: 'work',
      intro: { role: 'dev', sub: 'Freelance developer', g: 'any', years: [24, 34] }, story: ['startup', 'You and Tobi began building an estate delivery app.'], push: [{ id: 'su_dev', after: 1 }] }],
    Object.assign({ when: s => s.job >= 1 && s.stats.hustle >= 35 && s.month >= 4 }, su));
  CH('su_regret', 'tobi', 'happy', 'Tobi’s app is on TechCabal this morning. “No hard feelings, {bro}. Come to the launch party at least.”',
    ['Go and clap', { heart: 3, peace: -2 }, { rel: 4 }], ['Mute him', { peace: 1, heart: -2 }, { rel: -4 }], su);
  CH('su_dev', '@dev', 'thinking', '“I can ship a first version in six weeks. ₦96k, half upfront. Or I take a slice of the company and a smaller fee. Your call.”',
    ['Pay cash', { wallet: -12, hustle: 2 }, { set: { su_cash: true }, rel: 6, mem: ['paid', 'You paid them properly, and on time.'], ic: 'cash', push: [{ id: 'su_beta', after: 2 }] }],
    ['Offer equity', { wallet: -3, hustle: 3 }, { set: { su_equity: true }, rel: 2, mem: ['equity', 'You paid them in a slice of a company that barely exists.'], ic: 'chat', push: [{ id: 'su_beta', after: 2 }] }], su);
  CH('su_beta', 'tobi', 'happy', '“We’re live in two estates in Lekki. Forty orders on day one. One customer says her jollof came cold and she’s tweeting about it.”',
    ['Fix it yourself', { hustle: 5, peace: -6 }, { set: { su_hands: true }, ic: 'work', intro: { role: 'investor', sub: 'Angel investor', g: 'any', years: [44, 60] }, push: [{ id: 'su_investor', after: 2 }] }],
    ['Hire customer care', { wallet: -5, peace: 2 }, { ic: 'phone', intro: [{ role: 'ops', sub: 'Customer care lead', g: 'fem', years: [24, 32] }, { role: 'investor', sub: 'Angel investor', g: 'any', years: [44, 60] }],
      push: [{ id: 'su_investor', after: 2 }, { id: 'su_strike', after: 4, p: 0.75 }] }], su);
  CH('su_investor', '@investor', 'smug', '“{investor} here. I back founders who suffer a little. Fifteen percent for ₦56,000, and I want a seat at the table.”',
    ['Hold out for better', { hustle: 3, peace: -2 }, { set: { su_hold: true }, rel: -6, mem: ['held', 'You turned down their first offer.'], ic: 'no', push: [{ id: 'su_crunch', after: 3 }] }],
    ['Take the money', { wallet: 14, hustle: 4, peace: -3 }, { set: { su_funded: true }, rel: 6, ic: 'cash', story: ['startup', 'You took ₦56,000 from {investor}.'], push: [{ id: 'su_crunch', after: 3 }, { id: 'su_board', after: 5 }] }], su);
  CH('su_strike', '@ops', 'sad', '“Boss, the riders are on strike over the fuel price. Orders are piling up. What do I tell the customers?”',
    ['Raise their pay', { wallet: -8, peace: 2 }, { set: { su_fairpay: true }, rel: 6, mem: ['fair', 'You raised rider pay when it counted.'], ic: 'cash' }],
    ['Hold the line', { peace: -5, hustle: -3 }, { rel: -8, mem: ['line', 'You held the line on rider pay.'], ic: 'no' }], su);
  CH('su_crunch', 'tobi', 'scared', s => (flag(s, 'su_equity')
    ? '“Runway is two months. And {dev} keeps asking when the equity will be on paper. {bro}, we have to decide something.”'
    : '“Runway is two months. Orders are up but so is everything we pay for. {bro}, we have to decide something.”'),
    ['Cut costs, hard', { wallet: 6, hustle: -3, peace: -4 }, { set: { su_lean: true }, ic: 'no',
      push: [{ id: 'su_dev_quits', if: s => flag(s, 'su_equity'), after: 1.5 }, { id: 'su_exit', after: 3 }] }],
    ['Push for growth', { wallet: -8, hustle: 6, peace: -4 }, { set: { su_growth: true }, ic: 'rooftop',
      push: [{ id: 'su_dev_quits', if: s => flag(s, 'su_equity'), after: 2 }, { id: 'su_exit', after: 3 }] }], su);
  CH('su_dev_quits', '@dev', 'angry', '“I built this for a piece of the company and I’m still waiting for paper. Sign it or I take the code with me.”',
    ['Sign the equity', { hustle: -2, wallet: 2 }, { set: { su_signed: true }, rel: 12, forget: 'equity', story: ['startup', 'You put {dev}’s equity on paper.'], ic: 'heart' }],
    ['Call their bluff', { hustle: -6, peace: -4 }, { set: { su_devleft: true }, rel: -20, mem: ['bluff', 'You called their bluff and lost the developer.'], story: ['startup', '{dev} left, and took the code.'], ic: 'no' }], su);
  CH('su_board', '@investor', 'determined', '“Quarterly review. Growth is flat. I can’t keep feeding a flat line, so tell me what changes.”',
    ['Defend the plan', { hustle: 4, peace: -5 }, { rel: -4, ic: 'work' }], ['Promise numbers', { hustle: -2, peace: -3 }, { set: { su_promised: true }, rel: 4, ic: 'chat' }], su);
  CH('su_exit', 'tobi', 'thinking', s => `A bigger company wants to buy you out for ₦216,000. ${flag(s, 'su_devleft') ? 'There’s no developer left, so the offer is the best you’ll get.' : 'The app works, and you’re both tired.'} Sell, or keep going?`,
    ['Sell', { peace: 4 }, { ic: 'cash', push: [{ id: 'su_sold', after: 0.3 }] }],
    ['Keep going', { hustle: 4, peace: -3 }, { ic: 'work', push: s => [{ id: s.stats.hustle >= 55 && !flag(s, 'su_devleft') ? 'su_win' : 'su_fail', after: 1 }] }], su);
  CH('su_sold', 'tobi', 'happy', '“Done. ₦216,000, split three ways. The app still exists. It’s somebody else’s problem now.”',
    ['Take your share', { wallet: 18, hustle: -4, peace: 5 }, { ic: 'cash', story: ['startup', 'You sold the company.', 'done'], set: { su_done: true } }],
    ['Reinvest it', { wallet: 6, hustle: 8 }, { ic: 'work', job: 1, story: ['startup', 'You sold the company and started again with the money.', 'done'], set: { su_done: true } }], su);
  CH('su_win', 'tobi', 'laughing', s => `“We hit ten thousand orders a week. ${flag(s, 'su_funded') ? '{investor} is already texting about a bigger round.' : 'Three banks want to talk to us.'} {bro}, we’re actually doing this.”`,
    ['Enjoy it', { heart: 6, peace: 4, wallet: 8 }, { ic: 'party', story: ['startup', 'The app took off.', 'done'], set: { su_done: true } }],
    ['Hire a team', { hustle: 10, wallet: 6, peace: -6 }, { job: 1, ic: 'work', story: ['startup', 'The app took off and you grew a team.', 'done'], set: { su_done: true } }], su);
  CH('su_fail', 'tobi', 'sad', 'The servers are off. The riders weren’t paid. A group chat of angry customers has your name in it. Tobi says nothing.',
    ['Own it', { peace: -6, hustle: -4, wallet: -6 }, { rel: 4, ic: 'heart', story: ['startup', 'The company folded. You owned it.', 'failed'] }],
    ['Blame the market', { peace: -2, heart: -4, hustle: -8 }, { rel: -10, ic: 'no', story: ['startup', 'The company folded. You blamed everyone else.', 'failed'] }], su);

  // ===================================================================== THE ESTATE COMMITTEE
  ST('estate', 'The Estate Committee', 'A transformer levy, a chairman, a contractor with an envelope. Small politics, long memories.');
  const es = { story: 'estate' };
  HOOK('es_levy', 'neighbour', 'angry', '“The chairman says ₦20,000 each for the transformer. People say he is eating the money. But no light, no life.”',
    ['Refuse to pay', { wallet: 2, peace: -3 }, { rel: -8, mem: ['nolevy', 'You refused the transformer levy.'], ic: 'no', story: ['estate', 'You refused the transformer levy.'], push: [{ id: 'es_dark', after: 3 }] }],
    ['Pay, ask for a receipt', { wallet: -5, peace: 1 }, { rel: 6, ic: 'cash', story: ['estate', 'You paid the levy and asked for a receipt.'],
      intro: { role: 'chairman', sub: 'Estate chairman', g: 'masc', years: [56, 66], title: 'Chief' }, push: [{ id: 'es_meeting', after: 1.5 }] }],
    Object.assign({ when: s => s.month >= 4 }, es));
  CH('es_dark', 'neighbour', 'angry', 'Third week without light. The whole block is whispering. “Because of people like you, we’re all in darkness.”',
    ['Pay the levy now', { wallet: -6, peace: 2 }, { rel: 6, forget: 'nolevy', ic: 'cash', story: ['estate', 'You paid up, late.', 'done'] }],
    ['Buy an inverter', { wallet: -14, peace: 5 }, { rel: -4, ic: 'home', story: ['estate', 'You bought your own inverter and stayed out of it.', 'done'] }], es);
  CH('es_meeting', '@chairman', 'smug', '“{chairman} here. Estate AGM. Our secretary has travelled. We need somebody literate, somebody honest. Somebody like you.”',
    ['Decline politely', { peace: 2 }, { rel: -4, ic: 'no', story: ['estate', 'You turned down the secretary job.', 'done'] }],
    ['Take the notebook', { hustle: 3, peace: -4 }, { set: { es_sec: true }, rel: 5, ic: 'work', story: ['estate', 'You became estate secretary.'],
      intro: { role: 'contractor', sub: 'Electrical contractor', g: 'masc', years: [34, 48] }, push: [{ id: 'es_envelope', after: 2 }] }], es);
  CH('es_envelope', '@contractor', 'smug', '“Oga secretary, small something for your trouble. The transformer contract must go to my people. Everybody wins.”',
    ['Refuse the envelope', { peace: -3, hustle: 2 }, { rel: -10, mem: ['honest', 'You refused the envelope.'], ic: 'no', story: ['estate', 'You refused the contractor’s envelope.'],
      push: [{ id: 'es_threat', after: 2, p: 0.7 }, { id: 'es_light', after: 3.5 }] }],
    ['Take it', { wallet: 8, peace: -5 }, { set: { es_bribed: true }, rel: 6, mem: ['bribed', 'You took the envelope.'], ic: 'cash', story: ['estate', 'You took the contractor’s envelope.'],
      push: [{ id: 'es_audit', after: 3 }, { id: 'es_light', after: 5 }] }], es);
  CH('es_threat', '@contractor', 'angry', '“Be careful with your honest business. Your gate, your generator, your car. Accidents happen in estates.”',
    ['Tell the chairman', { peace: -3, heart: 2 }, { who: '@chairman', rel: 8, mem: ['ally', 'You told them about the threats.'], ic: 'chat', story: ['estate', 'You told the chairman about the threats.'] }],
    ['Back down quietly', { peace: -7, hustle: -3 }, { set: { es_cowed: true }, ic: 'bed' }], es);
  CH('es_audit', '@chairman', 'angry', 'The residents want the books opened. There’s an envelope-shaped hole in them and it has your name on it.',
    ['Return the money', { wallet: -8, peace: 3 }, { rel: 8, forget: 'bribed', set: { es_confessed: true }, ic: 'cash', story: ['estate', 'You gave back the envelope before they found out.'] }],
    ['Deny everything', { peace: -8, heart: -6 }, { rel: -20, mem: ['caught', 'They know you took money and lied about it.'], set: { es_caught: true }, ic: 'no', story: ['estate', 'They found out about the envelope.'] }], es);
  CH('es_light', 'neighbour', 'happy',
    s => (flag(s, 'es_caught') ? 'The transformer hums at 7:40pm and the street cheers. Then somebody sees you, and the cheering becomes a murmur.' : flag(s, 'es_bribed') ? 'The transformer hums at 7:40pm and the street cheers. You cheer too, with a small knot in your stomach.' : 'The transformer hums at 7:40pm and the whole street cheers. Somebody puts on loud music. It’s the best night all year.'),
    ['Switch everything on', { peace: 5, heart: 3 }, { ic: 'party', story: ['estate', 'The light came on.', 'done'] }],
    ['Sleep through it', { peace: 7 }, { ic: 'bed', story: ['estate', 'The light came on.', 'done'] }], es);

  // ===================================================================== ADAEZE'S WEDDING
  ST('wedding', 'Adaeze’s Wedding', 'Be there for a friend’s big day: a planner, a budget, a broken generator, and a speech.');
  const wd = { story: 'wedding' };
  HOOK('wd_ask', 'adaeze', 'happy', '“I’m getting married in four months. Be my chief {maid}. Please say yes, I can’t do this without you.”',
    ['Just attend', { heart: -4 }, { rel: -10, mem: ['declined', 'You said no when she asked you to stand with her.'], ic: 'no', story: ['wedding', 'Adaeze asked you to stand with her. You said no.', 'failed'] }],
    ['Yes, of course', { heart: 4, peace: -2 }, { rel: 10, mem: ['standing', 'You said yes, and stood with her.'], ic: 'heart', story: ['wedding', 'You are Adaeze’s chief {maid}.'],
      intro: { role: 'planner', sub: 'Wedding planner', g: 'fem', years: [30, 42] }, push: [{ id: 'wd_planner', after: 1 }] }],
    Object.assign({ when: s => s.friends >= 2 && s.month >= 6 }, wd));
  CH('wd_planner', '@planner', 'smug', '“Budget is ₦6 million. Colour of the day is lilac. Your aso-ebi is ₦24,000. And you do not have a vote on any of this.”',
    ['Fight the budget', { hustle: 2, peace: -3 }, { rel: -8, set: { wd_cheap: true }, ic: 'chat', push: [{ id: 'wd_clash', after: 2 }] }],
    ['Go along', { wallet: -6, heart: 2 }, { rel: 5, ic: 'cash', push: [{ id: 'wd_clash', after: 2 }] }], wd);
  CH('wd_clash', '@planner', 'angry', 'Adaeze wants her aunty’s choir. {planner} wants a DJ and a smoke machine. Both of them are looking at you.',
    ['Back Adaeze', { heart: 4, peace: -3 }, { who: 'adaeze', rel: 8, mem: ['choir', 'You took her side on the choir.'], also: { who: '@planner', rel: -8, mem: ['overruled', 'You overruled them for the choir.'] }, ic: 'heart', push: [{ id: 'wd_money', after: 1.5 }] }],
    ['Back the planner', { peace: -2 }, { who: 'adaeze', rel: -8, mem: ['dj', 'You sided with the planner against her.'], also: { who: '@planner', rel: 8 }, ic: 'party', push: [{ id: 'wd_money', after: 1.5 }] }], wd);
  CH('wd_money', 'adaeze', 'sad', '“The caterer wants another ₦800k, and the groom’s family says it’s our problem. I don’t know what to do.”',
    ['Cover part of it', { wallet: -10, heart: 6 }, { rel: 10, mem: ['covered', 'You helped cover the caterer when she was stuck.'], ic: 'cash', story: ['wedding', 'You helped cover the caterer.'], push: [{ id: 'wd_day', after: 2 }] }],
    ['Say you can’t', { heart: -5, peace: -2 }, { rel: -6, mem: ['couldnt', 'You said you couldn’t help with the caterer.'], ic: 'no', push: [{ id: 'wd_day', after: 2 }] }], wd);
  CH('wd_day', 'adaeze', 'scared', '“It’s the morning of the wedding. Please tell me you’re on your way.”',
    ['On my way', { peace: -2 }, { go: 'wdd/a', ic: 'bus' }], ['Almost there!', { peace: -3, heart: 1 }, { go: 'wdd/a', ic: 'run' }], wd);
  LS.scene('wdd', 'adaeze', 'scared', {
    a: { text: '“The makeup artist isn’t here. The aso-ebi is the wrong lilac. My mother is crying and my father is on the phone with the DJ.”', place: 'home',
      L: ['Call {planner}', { hustle: 2 }, { go: 'b', ic: 'phone' }], R: ['Fix it yourself', { peace: -5, hustle: 3 }, { go: 'b', ic: 'work', rel: 4 }] },
    b: { text: 'The generator dies in the middle of the vows. Two hundred guests, no microphone, and a very quiet bride.', who: '@planner', mood: 'angry', place: 'party',
      L: ['Hold a phone speaker up', { heart: 3, peace: -2 }, { go: 'c', ic: 'phone' }], R: ['Lead the hall in song', { heart: 6, peace: -5 }, { go: 'c', ic: 'party' }] },
    c: { text: s => (LS.mem(s, 'adaeze', 'covered') ? '“They’re calling you for a speech. And {name}… I know what you did about the caterer. Don’t make me cry in this makeup.”' : '“They’re calling you for a speech. Whatever you do, don’t tell the Calabar story.”'), mood: 'happy',
      L: ['Keep it short', { heart: 3, peace: 2 }, { go: 'end', ic: 'chat' }], R: ['Tell the Calabar story', { heart: 8, peace: -3 }, { go: 'end', ic: 'party', mem: ['calabar', 'You told the Calabar story, and the whole hall roared.'] }] },
    end: { text: 'The dancing goes on past midnight. Adaeze finds you by the cake, shoes in hand. “Thank you for standing with me. I’ll never forget it.”', mood: 'smitten',
      L: ['Dance until 3am', { heart: 7, peace: -3 }, { friends: 1, ic: 'party', story: ['wedding', 'You danced at Adaeze’s wedding.', 'done'], rel: 6 }],
      R: ['Slip out early', { peace: 5, heart: 2 }, { ic: 'bed', story: ['wedding', 'You left the wedding early.', 'done'] }] },
  }, { story: 'wedding', dom: 'story' });

  // ===================================================================== THE JAPA QUESTION
  ST('japa', 'The Japa Question', 'Everyone you know is leaving. An agent, an embassy, and a mother who cries and cooks at the same time.');
  const jp = { story: 'japa' };
  /** After the documents: the embassy says yes, no, or the agent vanishes first. */
  const jpResult = s => {
    const bad = flag(s, 'jp_paid') && Math.random() < (flag(s, 'jp_checked') ? 0.15 : 0.55);
    const yes = Math.random() < (flag(s, 'jp_ielts') ? 0.85 : 0.35);
    return [{ id: bad ? 'jp_scam' : yes ? 'jp_approved' : 'jp_rejected', after: 2.5 }];
  };
  HOOK('jp_tobi', 'tobi', 'determined', '“I’m done, {bro}. Canada. School offer and a loan. See you at the airport. Or you come too?”',
    ['Wish him well', { heart: -2, peace: 1 }, { rel: 3 }],
    ['Ask how he did it', { hustle: 2 }, { rel: 2, ic: 'chat', intro: { role: 'agent', sub: 'Visa consultant', g: 'any', years: [30, 45] }, story: ['japa', 'Tobi is leaving. You started asking how.'], push: [{ id: 'jp_agent', after: 1 }] }],
    Object.assign({ w: 0.8, when: s => s.month >= 8 && s.stats.peace <= 58 }, jp));
  CH('jp_agent', '@agent', 'smug', '“Processing is ₦108,000. ₦72,000 now, ₦36,000 after approval. Guaranteed. Hundreds have gone through me.”',
    ['Check reviews, then pay', { wallet: -18, hustle: 1 }, { set: { jp_paid: true, jp_checked: true }, ic: 'phone', push: [{ id: 'jp_docs', after: 2 }] }],
    ['Pay now', { wallet: -18 }, { set: { jp_paid: true }, mem: ['paid', 'You paid the deposit without checking.'], ic: 'cash', push: [{ id: 'jp_docs', after: 1.5 }] }], jp);
  CH('jp_docs', null, 'thinking', 'IELTS in Ikeja, proof of funds, transcripts, a police report. The checklist is longer than your rent receipt.',
    ['Study every night', { hustle: 6, peace: -8 }, { set: { jp_ielts: true }, ic: 'work', push: jpResult }],
    ['Wing it', { peace: 2 }, { ic: 'bed', push: jpResult }], jp);
  CH('jp_scam', '@agent', 'smug', '“The number you have dialled is not reachable.” Your ₦72,000 is a screenshot now.',
    ['Report to the police', { hustle: -2, peace: -3 }, { ic: 'church', story: ['japa', 'The agent disappeared with your deposit.', 'failed'] }],
    ['Let it go', { peace: -8 }, { ic: 'no', story: ['japa', 'The agent disappeared with your deposit.', 'failed'] }], jp);
  CH('jp_rejected', null, 'sad', 'The embassy email says “unable to approve at this time.” You read it four times, then forward it to nobody.',
    ['Reapply', { wallet: -8, hustle: 3 }, { set: { jp_ielts: true }, ic: 'work', push: [{ id: 'jp_docs', after: 3 }] }],
    ['Make peace with Lagos', { peace: 6, heart: 2 }, { ic: 'home', story: ['japa', 'You were refused, and made peace with staying.', 'done'] }], jp);
  CH('jp_approved', null, 'happy', '“APPROVED.” Flight in three weeks. Mama has started crying and cooking at the same time.',
    ['Stay in Lagos', { peace: 6, heart: 5, wallet: -4 }, { who: 'mama', rel: 12, mem: ['stayed', 'You were approved to leave, and stayed.'], ic: 'home', story: ['japa', 'You were approved to leave, and stayed.', 'done'] }],
    ['Japa!', { peace: 8 }, { ic: 'bus', ending: 'japa', story: ['japa', 'You left.', 'done'] }], jp);
  LS.ENDINGS.japa = { title: 'Japa’d', stamp: 'JAPA’D', who: 'mama', mood: 'crying', text: 'The plane lifts off over the lagoon and Lagos shrinks to a handful of lights. Mama waves at the terminal long after she can’t see you. She’ll ask how snow tastes. You’ll tell her it tastes like missing home.' };
})(window.LS = window.LS || {});
