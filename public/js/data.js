/* Static game vocabulary: names, jobs, places, preset bio pieces, preset chat lines, life ladders.
 * Players never type free text that other players see: bios and chat are built from the ids below,
 * so the server only stores ids and there is nothing to moderate. */
(function (LS) {
  'use strict';

  // ------------------------------------------------------------------ the four bars
  LS.STATS = {
    wallet: { label: 'Wallet', blurb: 'Cash and what you can afford.', low: 'Broke', high: 'Loaded' },
    heart: { label: 'Heart', blurb: 'Love, friends, people who show up.', low: 'Lonely', high: 'Smothered' },
    hustle: { label: 'Hustle', blurb: 'Career, status and the grind.', low: 'Nobody', high: 'Too big' },
    peace: { label: 'Peace', blurb: 'Health, family and your sanity.', low: 'Frazzled', high: 'Pressured' },
  };
  LS.STAT_KEYS = ['wallet', 'heart', 'hustle', 'peace'];

  // ------------------------------------------------------------------ life ladders (the Sims-lite part)
  LS.JOBS = [
    { id: 'jobless', title: 'Between things', income: 0, blurb: 'Sending CVs and eating Mama’s jollof.' },
    { id: 'corper', title: 'Corper (NYSC)', income: 2, blurb: 'Allowee ₦77,000 and a khaki jacket.' },
    { id: 'junior', title: 'Junior associate', income: 3, blurb: 'Entry level, big dreams, small salary.' },
    { id: 'mid', title: 'Team lead', income: 4.5, blurb: 'People ask you for approvals now.' },
    { id: 'senior', title: 'Senior manager', income: 6, blurb: 'Fancy title, longer meetings.' },
    { id: 'boss', title: 'Oga / CEO', income: 8, blurb: 'Your name is on the door.' },
  ];
  LS.HOMES = [
    { id: 'mama', title: 'Mama’s house', rent: 0, living: 1, blurb: 'The box room, and the commentary.' },
    { id: 'shared', title: 'Shared room in Yaba', rent: 1, living: 2, blurb: 'Three people, one fridge, no peace.' },
    { id: 'selfcon', title: 'Self-con in Surulere', rent: 2, living: 2, blurb: 'Yours alone. Generator sold separately.' },
    { id: 'onebed', title: '1-bed in Ikeja GRA', rent: 3.5, living: 2, blurb: 'A real sitting room and a gate man.' },
    { id: 'twobed', title: '2-bed in Lekki', rent: 5, living: 2, blurb: 'Estate, borehole, 24-hour power (mostly).' },
  ];
  LS.STATUS = { single: 'Single', dating: 'Dating', engaged: 'Engaged', married: 'Married' };

  // ------------------------------------------------------------------ names (by heritage)
  const FEM = {
    yoruba: ['Tolu', 'Bisi', 'Kemi', 'Funke', 'Yemi', 'Lola', 'Sade', 'Folake', 'Temi', 'Damilola', 'Ronke', 'Titi', 'Bimpe', 'Wunmi', 'Ife'],
    igbo: ['Ngozi', 'Chioma', 'Nneka', 'Adaeze', 'Amara', 'Nkechi', 'Somto', 'Ifunanya', 'Uche', 'Oluchi', 'Ebele', 'Chidinma'],
    hausa: ['Aisha', 'Fatima', 'Zainab', 'Hadiza', 'Maryam', 'Halima', 'Amina', 'Rakiya', 'Hauwa', 'Khadija'],
    fulani: ['Binta', 'Hauwa', 'Aminatu', 'Jamila', 'Saudatu'],
    edo: ['Osas', 'Itohan', 'Ehi', 'Iyobosa', 'Efe', 'Eseosa', 'Aisosa'],
    'niger-delta': ['Ebiere', 'Tamara', 'Preye', 'Ere', 'Ibiso', 'Oghenekaro', 'Sapele'],
    'efik-ibibio': ['Ima', 'Idara', 'Mfon', 'Nsikak', 'Affiong', 'Ekaette'],
    'middle-belt': ['Doosuur', 'Ene', 'Ojoma', 'Dachung', 'Ngunan', 'Onyeka'],
    kanuri: ['Fanna', 'Kellu', 'Zara', 'Hajja'],
    ghanaian: ['Ama', 'Abena', 'Akosua', 'Efua', 'Adwoa'],
    kenyan: ['Wanjiru', 'Achieng', 'Njeri', 'Wambui'], 'south-african': ['Lerato', 'Naledi', 'Thandi', 'Zodwa'], ethiopian: ['Selam', 'Tigist', 'Meron'],
    senegalese: ['Awa', 'Mame', 'Fatou'], congolese: ['Nadège', 'Grace', 'Merveille'],
  };
  const MASC = {
    yoruba: ['Femi', 'Seun', 'Dayo', 'Tunde', 'Bayo', 'Kunle', 'Wale', 'Segun', 'Ayo', 'Tobi', 'Yinka', 'Gbenga', 'Lekan', 'Bolu'],
    igbo: ['Chidi', 'Emeka', 'Ifeanyi', 'Obinna', 'Uche', 'Kelechi', 'Chinedu', 'Ikenna', 'Nnamdi', 'Chukwudi', 'Tochi'],
    hausa: ['Musa', 'Ibrahim', 'Abdul', 'Yusuf', 'Sani', 'Bashir', 'Aminu', 'Umar', 'Garba', 'Abubakar'],
    fulani: ['Bello', 'Umaru', 'Sanusi', 'Jibril', 'Alhaji Dahiru'],
    edo: ['Osaze', 'Efosa', 'Eghosa', 'Osagie', 'Osaretin'],
    'niger-delta': ['Ovie', 'Oghene', 'Tari', 'Ebi', 'Fiye'],
    'efik-ibibio': ['Ekong', 'Etim', 'Ubong', 'Effiong', 'Inyang'],
    'middle-belt': ['Terkimbi', 'Ojochenemi', 'Audu', 'Dantong', 'Samson'],
    kanuri: ['Modu', 'Kaka', 'Baba', 'Mala'],
    ghanaian: ['Kwame', 'Kofi', 'Yaw', 'Kwesi', 'Nana'],
    kenyan: ['Otieno', 'Mwangi', 'Kamau', 'Kipchoge'], 'south-african': ['Thabo', 'Sipho', 'Bheki', 'Lwazi'], ethiopian: ['Abebe', 'Dawit', 'Henok'],
    senegalese: ['Cheikh', 'Ousmane', 'Modou'], congolese: ['Patrick', 'Jean-Luc', 'Trésor'],
  };
  LS.names = (arch, gender, r) => {
    const t = (gender === 'masc' ? MASC : FEM)[arch] || (gender === 'masc' ? MASC : FEM).yoruba;
    return r ? r.pick(t) : LS.pick(t);
  };

  // ------------------------------------------------------------------ jobs for profile cards (title, income class, outfit role)
  LS.PROFILE_JOBS = {
    fintech: { label: 'Fintech engineer', cls: 3, role: null },
    banker: { label: 'Banker', cls: 3, role: 'banker' },
    nurse: { label: 'Nurse', cls: 2, role: 'medic' },
    lawyer: { label: 'Lawyer', cls: 3, role: null },
    okada: { label: 'Okada rider', cls: 1, role: 'okada-rider' },
    creator: { label: 'Content creator', cls: 2, role: 'influencer' },
    makeup: { label: 'Makeup artist', cls: 2, role: null },
    stylist: { label: 'Hairstylist', cls: 2, role: null },
    boutique: { label: 'Boutique owner', cls: 3, role: 'market-trader' },
    planner: { label: 'Event planner', cls: 2, role: null },
    dj: { label: 'DJ', cls: 2, role: 'musician' },
    photo: { label: 'Photographer', cls: 2, role: 'photographer' },
    mechanic: { label: 'Mechanic', cls: 1, role: 'builder' },
    teacher: { label: 'Teacher', cls: 1, role: null },
    doctor: { label: 'Doctor', cls: 3, role: 'doctor' },
    oilgas: { label: 'Oil & gas engineer', cls: 4, role: null },
    corper: { label: 'Corper', cls: 1, role: 'corper' },
    student: { label: 'UNILAG student', cls: 0, role: null },
    trader: { label: 'Balogun trader', cls: 2, role: 'market-trader' },
    barber: { label: 'Barber', cls: 1, role: null },
    caterer: { label: 'Caterer', cls: 2, role: 'chef' },
    agent: { label: 'Real estate agent', cls: 3, role: null },
    driver: { label: 'Ride-hailing driver', cls: 1, role: null },
    trainer: { label: 'Gym trainer', cls: 2, role: 'coach' },
    musician: { label: 'Afrobeats artist', cls: 2, role: 'rockstar' },
    actor: { label: 'Nollywood actor', cls: 3, role: 'nollywood' },
    civil: { label: 'Civil servant', cls: 2, role: null },
    accountant: { label: 'Accountant', cls: 3, role: null },
    crypto: { label: 'Crypto trader', cls: 3, role: null },
    care: { label: 'Customer care rep', cls: 1, role: null },
  };
  LS.AREAS = {
    lekki: 'Lekki', ikoyi: 'Ikoyi', vi: 'Victoria Island', yaba: 'Yaba', surulere: 'Surulere', ikeja: 'Ikeja', ajah: 'Ajah', maryland: 'Maryland',
    magodo: 'Magodo', gbagada: 'Gbagada', ikorodu: 'Ikorodu', festac: 'Festac', oshodi: 'Oshodi', mushin: 'Mushin', apapa: 'Apapa', ojota: 'Ojota',
    egbeda: 'Egbeda', badagry: 'Badagry', epe: 'Epe', ojuelegba: 'Ojuelegba',
  };
  LS.VIBES = {
    suya: 'Suya lover', jollof: 'Jollof loyalist', gym: 'Gym rat', owambe: 'Owambe regular', church: 'Church girl/boy', mosque: 'Jummah on Fridays',
    afrobeats: 'Afrobeats head', nollywood: 'Nollywood binger', football: 'Arsenal pain', reader: 'Book nerd', gamer: 'FIFA gamer', travel: 'Always planning a trip',
    foodie: 'Foodie', hustler: 'Side-hustler', homebody: 'Homebody', party: 'Detty December all year', funny: 'Meme dealer', artsy: 'Artsy',
    techie: 'Techie', pidgin: 'Pidgin first', quiet: 'Quiet type', ambitious: 'Ambitious', faithful: 'Ride or die', foodie2: 'Mama-put connoisseur',
  };
  LS.LOVE = {
    words: 'Words of affirmation', acts: 'Acts of service', gifts: 'Gifts (especially food)', time: 'Quality time', touch: 'Physical touch', data: 'Sharing data bundles',
    suya: 'Buying you suya', respond: 'Replying before NEPA takes light',
  };
  LS.FLAGS = {
    late: 'Always 40 minutes late', texts: 'Replies after 3 days', cheap: 'Splits the bill to the kobo', loud: 'Loud on voice notes', phone: 'Phone at 2% on every date',
    ex: 'Still friends with every ex', mum: 'Mama calls during dates', football: 'Cannot miss the match', gossip: 'Knows everyone’s business', sleep: 'Falls asleep at 9pm',
  };
  LS.SHOW = { fem: 'Women', masc: 'Men', all: 'Everyone' };

  /** Preset lines for chatting with a matched player. Server stores only the id. */
  LS.CHAT = {
    hi: 'Hey! 👋🏾 Your profile made me smile.',
    wsup: 'How far? You dey alright?',
    suya: 'Suya this weekend? My treat. 🍢',
    food: 'Have you eaten? Don’t lie.',
    meme: 'I have a meme for you but it needs data.',
    owambe: 'There’s an owambe on Saturday. Be my plus-one?',
    coffee: 'Coffee in Yaba sometime?',
    nepa: 'Reply before NEPA takes light o. ⚡',
    laugh: 'Hahaha you’re funny! 😂',
    thanks: 'Thank you! That made my day.',
    busy: 'Work has been mad, but I’m thinking of you.',
    later: 'Let me call you later, okay?',
    wow: 'Wow. Okay. I didn’t expect that. 😳',
    cheers: 'Cheers to Lagos life! 🥂',
    bye: 'It was nice talking. Take care!',
  };
  LS.CHAT_ORDER = ['hi', 'wsup', 'food', 'suya', 'coffee', 'owambe', 'meme', 'laugh', 'thanks', 'busy', 'nepa', 'later', 'cheers', 'wow', 'bye'];

  /** Opening lines for generated profiles. */
  LS.BIO_LINES = [
    'Here for good vibes and honest people.', 'No dry texters, abeg.', 'Jollof rice is not up for debate.', 'Looking for someone who replies before NEPA takes light.',
    'Not here for situationships.', 'Suya is a love language.', 'I’ll beat you at FIFA and still buy you food.', 'Lagos traffic made me patient. Mostly.',
    'Detty December is a lifestyle.', 'Mama must approve, so choose wisely.', 'I laugh loudly and cook better.', 'Tell me your favourite Nollywood movie.',
    'Weekend plans: sleep, church, jollof.', 'Hustling by day, vibing by night.', 'Ready to settle, not ready to rush.', 'Gym at 6am, regret at 6:05am.',
    'If you can’t take a joke, swipe left.', 'Looking for my plus-one to every owambe.', 'Small chops over small talk.', 'Be kind. Be funny. Be on time-ish.',
  ];
})(window.LS = window.LS || {});
