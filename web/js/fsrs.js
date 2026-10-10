// Spaced repetition scheduler: FSRS-4.5 with the default parameters.
import { tr, fmtDec } from "./i18n.js";
// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. Target retention 90%.

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461,
  2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81
const RETENTION = 0.9;
const DAY = 86400000;
const MIN = 60000;
const MAX_INTERVAL = 3650;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function nextInterval(stability) {
  const days = (stability / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL);
}

const initStability = (g) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function nextDifficulty(d, g) {
  const nd = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * nd, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}

function forgetStability(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]));
}

// Cards on whole-day intervals are due from the start of their day (as in Anki), so studying earlier in the day than
// last time doesn't push them back a day. Learning steps (minutes) keep their exact time.
export function dueAt(c) {
  if (c.state !== "review" || !Number.isFinite(c.due)) return c.due;
  const d = new Date(c.due);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function isDue(c, now = Date.now()) { return dueAt(c) <= now; }

// Returns the updated scheduling fields for a card after a rating (does not mutate).
export function schedule(card, g, now = Date.now()) {
  const c = { ...card };
  // a clock moved backwards or a hand-edited backup must not turn the schedule into NaN (a card that is never due)
  const elapsed = c.last ? Math.max(0, (now - c.last) / DAY) : 0;
  if (!(c.difficulty >= 1 && c.difficulty <= 10)) c.difficulty = initDifficulty(3);
  if (!(c.stability > 0) || !Number.isFinite(c.stability)) c.stability = 0;
  if (c.state === "new" || !c.stability) {
    c.difficulty = initDifficulty(g);
    c.stability = initStability(g);
    if (g === 1) { c.state = "learning"; c.due = now + 1 * MIN; }
    else if (g === 2) { c.state = "learning"; c.due = now + 6 * MIN; }
    else if (g === 3) { c.state = "review"; c.due = now + nextInterval(c.stability) * DAY; }
    else { c.state = "review"; c.due = now + nextInterval(c.stability) * DAY; }
  } else if (c.state === "learning" || c.state === "relearning") {
    // short-term steps: stability changes gently within the same day
    if (g === 1) { c.due = now + 1 * MIN; c.stability = Math.max(0.1, c.stability * 0.8); }
    else if (g === 2) { c.due = now + 8 * MIN; }
    else {
      c.difficulty = nextDifficulty(c.difficulty, g);
      const goodIvl = nextInterval(c.stability);
      if (g === 4) c.stability = Math.max(c.stability, initStability(4));
      // as in the FSRS reference: Easy always waits at least a day longer than Good
      const ivl = g === 4 ? Math.min(MAX_INTERVAL, Math.max(nextInterval(c.stability), goodIvl + 1)) : goodIvl;
      c.state = "review";
      c.due = now + ivl * DAY;
    }
  } else {
    const r = retrievability(elapsed, c.stability);
    const d = c.difficulty; // FSRS computes the new stability from the difficulty before this review
    c.difficulty = nextDifficulty(d, g);
    if (g === 1) {
      c.stability = forgetStability(d, c.stability, r);
      c.lapses = (c.lapses || 0) + 1;
      c.state = "relearning";
      c.due = now + 5 * MIN;
    } else {
      // as in the FSRS reference, keep Hard <= Good < Easy after rounding to whole days
      const s0 = c.stability;
      const iv = (gg) => nextInterval(recallStability(d, s0, r, gg));
      let hard = iv(2), good = iv(3);
      hard = Math.min(hard, good);
      good = Math.min(MAX_INTERVAL, Math.max(good, hard + 1));
      const easy = Math.min(MAX_INTERVAL, Math.max(iv(4), good + 1));
      c.stability = recallStability(d, s0, r, g);
      c.due = now + (g === 2 ? hard : g === 3 ? good : easy) * DAY;
    }
  }
  c.reps = (c.reps || 0) + 1;
  c.last = now;
  return c;
}

// Human-friendly preview of what each button would do.
export function preview(card, now = Date.now()) {
  return [1, 2, 3, 4].map(g => {
    const c = schedule(card, g, now);
    const ms = c.due - now;
    if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + "m";
    if (ms < DAY) return Math.round(ms / 3600000) + "h";
    const d = Math.round(ms / DAY);
    if (d < 60) return tr(d + "d", d + " z");
    if (d < 365) return tr(Math.round(d / 30) + "mo", Math.round(d / 30) + " luni");
    return tr(fmtDec(d / 365, 1) + "y", fmtDec(d / 365, 1) + " ani");
  });
}
