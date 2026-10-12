/* Reading a player's Lagos Life avatar photo, so their first portrait defaults to a face that looks like
 * them. One small Gemini call per avatar, and the answer is cached on the player's profile keyed by the
 * avatar itself, so a player costs at most one call per photo they ever upload.
 *
 * The model is never trusted with free text: it may only answer "fem"/"masc" and may only pick a colour
 * that the client put in the list we gave it, so a bad answer degrades to null rather than a broken face. */
'use strict';

const KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || '';
const ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 5 * 60 * 1000;

/* Fast and reliable first, cheapest second: a busy model (these tiers return 503 under load) falls through
 * to the next one, so a first portrait never depends on a single model being up. Gemini 3.1 Flash-Lite is
 * half the price but was taking longer than our timeout on an image, so it is the fallback, not the lead.
 * Either way this is one cached call per player — fractions of a kobo. GEMINI_MODEL overrides the list. */
const MODELS = String(process.env.GEMINI_MODEL || 'gemini-3-flash-preview,gemini-3.1-flash-lite')
  .split(',').map(s => s.trim()).filter(Boolean);

/* The game's own swatches, used when the client doesn't send its lists (see customizer.js). */
const SKINS = ['#f1d2b8', '#d4a87f', '#b9875a', '#aa784c', '#916039', '#7f5131', '#69402a', '#573421', '#45291a', '#352015'];
const HAIRS = ['#151210', '#221b17', '#3a2a1f', '#5c3f2b', '#7a2e1a', '#a8874f', '#9d9a94', '#7a2e7a', '#b3262a', '#3a6ea5', '#1b6b4a', '#d4a017'];

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

/** A hex colour can only be one the caller offered, so a hallucination is dropped, not painted. */
function pick(v, allowed) {
  if (typeof v !== 'string') return null;
  const want = v.trim().toLowerCase();
  for (const c of allowed) if (String(c).toLowerCase() === want) return c;
  return null;
}

/** The first {...} block in the model's text, or null. */
function jsonIn(text) {
  if (typeof text !== 'string') return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

/** Gemini's Interactions API narrates in `steps`; the words we want are the model_output ones. */
function textOf(json) {
  const out = [];
  for (const step of (json && json.steps) || []) {
    if (step.type !== 'model_output') continue;
    for (const part of step.content || []) if (part.type === 'text' && typeof part.text === 'string') out.push(part.text);
  }
  return out.join('');
}

function prompt(skins, hairs) {
  return [
    'Look at this profile photo and answer with one JSON object and nothing else.',
    '',
    '{"gender":"fem"|"masc","skin":"<one hex from the SKIN list>","hair":"<one hex from the HAIR list>"}',
    '',
    'gender: how the person in the photo presents — "fem" for a woman, "masc" for a man. If there is no',
    'clear person in the photo, use "fem".',
    'skin: the closest colour in the SKIN list to the person\'s face.',
    'hair: the closest colour in the HAIR list to the person\'s own hair (ignore hats, caps and headties).',
    '',
    'SKIN list: ' + skins.join(' '),
    'HAIR list: ' + hairs.join(' '),
    '',
    'Answer with the JSON object only.',
  ].join('\n');
}

/* A model that is overloaded is left alone for a few minutes, so we don't pay its latency on every call. */
const cooldown = new Map();
const benched = model => (cooldown.get(model) || 0) > Date.now();

/** One request to one model. Returns { text, status }, or throws on a network/abort error. */
async function ask(model, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ model }, body)),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = (j && j.error && (j.error.message || j.error.status)) || '';
      console.warn('[vision]', model, r.status, msg);
    }
    return { status: r.status, text: r.ok ? textOf(j) : '' };
  } finally { clearTimeout(timer); }
}

/**
 * Read one avatar. Resolves { gender, skin, hair } with nulls where we aren't sure, or null if the call
 * failed or the key isn't set. Never throws.
 */
async function analyse(dataUrl, skinList, hairList) {
  if (!KEY) return null;
  const m = DATA_URL.exec(String(dataUrl || ''));
  if (!m) return null;
  const skins = (Array.isArray(skinList) && skinList.length ? skinList : SKINS).slice(0, 24);
  const hairs = (Array.isArray(hairList) && hairList.length ? hairList : HAIRS).slice(0, 24);
  const body = {
    input: [
      { type: 'text', text: prompt(skins, hairs) },
      { type: 'image', data: m[2].replace(/\s+/g, ''), mime_type: m[1].toLowerCase().replace('image/jpg', 'image/jpeg') },
    ],
    generation_config: { thinking_level: 'minimal' },
  };

  for (const model of MODELS) {
    if (benched(model)) continue;
    let out;
    try { out = await ask(model, body); }
    catch (e) {
      console.warn('[vision]', model, e && e.name === 'AbortError' ? 'timed out (' + TIMEOUT_MS + 'ms)' : (e && e.message));
      continue;
    }
    if (out.status === 429 || out.status >= 500) { cooldown.set(model, Date.now() + COOLDOWN_MS); continue; }
    if (out.status !== 200) continue;                       // unavailable: try the next model
    const a = jsonIn(out.text);
    if (!a) continue;
    const gender = a.gender === 'masc' || a.gender === 'fem' ? a.gender : null;
    const skin = pick(a.skin, skins), hair = pick(a.hair, hairs);
    if (!gender && !skin && !hair) continue;
    return { gender, skin, hair, model };
  }
  return null;
}

module.exports = { analyse, enabled: !!KEY, MODELS, SKINS, HAIRS, _cooldown: cooldown };
