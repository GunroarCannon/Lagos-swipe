# Lagos Swipe

A paper-and-ink **life sim** for Lagos Life. Decide with a swipe (or a tap on a postcard) to steer a Lagos life from
age 23 to 35, keeping four bars off the ends: **Wallet, Heart, Hustle, Peace**. Work, home, family, friends, money,
health and city life all pull on you; dating is one thread. Job and home ladders, a partner and your friends change
which cards you see, and **people remember what you did** (see `LS.mem` in `cards.js`, and the People sheet in-game).
Extended scenes (a date, a job interview, a family meeting) are chains of cards (`LS.scene`).

* **Portraits**: [portrait-js](https://github.com/GunroarCannon/portrait-js) as a git submodule at `public/portrait-js`
  (extended with a Nigerian & African pack, `js/extensions/naija.js`). Your portrait is seeded from your Lagos Life avatar's colours and you can customise it from the corner button.
* **Multiplayer (async)**: real players turn up in your day; saying hello to each other connects you, and you message with preset lines. Notifications arrive in the Inbox. No free text anywhere, so nothing to moderate.
* **Lagos Life**: runs inside the Games app with the Vatar SDK (player name + avatar, session tokens, leaderboard, a ₦100 "3 lucky charms" product (a charm pulls you back once when a bar hits the edge)). Outside the frame it runs as a guest.

## Run it

```bash
git clone --recurse-submodules <this repo>   # or: git submodule update --init
npm start                                     # http://localhost:3000, in-memory data, no keys needed
npm test                                      # API + engine simulation
```
Try two players locally: `/?id=amaka&name=Amaka` and `/?id=tunde&name=Tunde` in different tabs.

## Deploy (Vercel, doesn't sleep)

1. Push `portrait-js` first (the submodule points at its GitHub remote), then this repo, then import it in Vercel.
2. Add a free **Upstash Redis** from the Vercel Marketplace (sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Set `VATAR_SECRET` (test key while in the sandbox, live key after approval).
4. In the Lagos Life dashboard: game address = your Vercel URL, add product `lucky_charms_5` (₦100).
`vercel.json` already sends the `frame-ancestors` header Vatar requires. Any always-on Node host also works: `npm start`.

## Layout

```
api/[...path].js   single Vercel function → lib/api.js (all routes)
lib/               store.js (Upstash REST or memory), auth.js (Vatar session verify), api.js
server.js          static + API for local/always-on hosting
public/js/         engine.js (rules, no DOM), cards.js (the deck: add cards here), people.js, game.js, sheets.js, customizer.js, social.js
public/portrait-js the submodule
```
Add a card: `LS.card(id, who, mood, text, [leftLabel, {wallet: -5}], [rightLabel, {heart: 8}], { dom, when, cd })` (see `cards.js`).

## Money

The player meets two kinds of money and the game keeps them apart in plain words:

* **Cash** is the ₦ number at the top (tagged CASH). It is the Wallet bar at ₦3,500 a point, plus any cash they bought. It is game money, it can't be cashed out, and it moves with the choices they make.
* **Real money** is their Lagos Life naira, paid through the pay sheet. Every real-money button says *Pay*.

What is for sale has not changed: lucky charms (with cash, or with real money) and cash (with real money). The shop is split by who pays: *Spend your cash* and *Pay with real money*.

Every number a card prints is the number it moves. One Wallet point on a card is exactly **₦4,000** (`E.CARD_NAIRA`), so `wallet: -8` is a ₦32,000 choice, the postcard shows a `−₦32,000` chip, the cash at the top says `−₦32,000` when you choose it, and the card text says "₦32k". The month's pay and bills come in on their own line ("Pay day", "Rent and food"). `test/engine.test.js` fails if a card names a price its choice doesn't charge. When you write a card with a ₦ amount, use `4000 × the wallet number`.

## First-time tour

`public/js/tutorial.js`: a sticky note and a pencilled arrow that point at what to do first (swipe, the four bars, the cash, what a choice costs, the inbox and menu). It runs once per player (`meta.tut`), lets every touch through, and can be restarted from the menu ("Show the tips again").

## Stories

Storylines live in `public/js/stories.js`: a hook card in the deck starts one, and its chapters chain with `push` (later, with
`{ p, if }` so a choice can fan out) or `go` (straight away). `intro: { role, sub, g, years }` brings in a new character
(`who: '@role'`), `story: [id, text, 'done'|'failed']` writes the log shown in People & stories, and `ending: 'japa'` ends the run.
Included: The Startup, The Estate Committee, Adaeze's Wedding, The Japa Question.

You play a woman or a man, and everyone you can date is the other one.
