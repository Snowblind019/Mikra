// API access plus the user's saved data (cards, known words, notes, settings, link fixes).
// Data lives in a JSON file next to the app's user folder; the server writes it, with daily backups.

import { today, toast } from "./ui.js";
import { tr } from "./i18n.js";

export const api = {
  async get(path, params) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const r = await fetch("/api/" + path + qs);
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    return r.json();
  },
  async post(path, body) {
    const r = await fetch("/api/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    return r.json();
  },
};

// An error from the server or the network as a short message in the interface language.
export function errText(e) {
  const m = String((e && e.message) || e || "");
  const known = [
    [/failed to fetch|networkerror|load failed|network request failed/i, ["the app server is not running", "serverul aplicației nu rulează"]],
    [/^not found$/i, ["not found", "nu a fost găsit"]],
    [/already running|a download is running/i, ["a download is already running", "o descărcare rulează deja"]],
    [/edge-tts is not installed/i, ["edge-tts is not installed", "edge-tts nu este instalat"]],
    [/bad pattern/i, ["this search can't be run", "căutarea aceasta nu se poate face"]],
    [/^bad request/i, ["the request was not understood", "cererea nu a fost înțeleasă"]],
    [/server error/i, ["the app server had an error (see its terminal)", "serverul aplicației a avut o eroare (vezi terminalul lui)"]],
  ];
  for (const [re, pair] of known) if (re.test(m)) return tr(pair[0], pair[1]);
  return tr(m || "unknown error", "eroare neașteptată" + (m ? ` (${m})` : ""));
}

export const DEFAULT_SETTINGS = {
  lang: "",                  // en | ro: interface language (empty = pick from the browser on first start)
  bible: "",                 // kjv | ro: the Bible shown next to the Hebrew (empty = match the language)
  helpScope: "all",          // all | unknown: transliteration and meaning under every word, or only words I don't know
  script: "print",           // print | cursive: how Hebrew is shown everywhere except the Bible text itself
  goalMinutes: 15,           // daily goal: minutes of study
  goalReviews: 20,           // daily goal: flashcard reviews
  theme: "auto",             // auto (follow the system) or a theme id
  themeLight: "stone",
  themeDark: "lapis-night",
  themeOverrides: {},        // per theme id: { paper, ink, accent, hl, ... }
  roSize: 17,
  heSize: 27,
  layout: "side",            // side | stacked
  cantillation: true,
  vowels: true,
  interTranslit: false,
  interGloss: false,
  colorMorph: true,
  colorPos: false,
  colorNames: true,
  markUnknown: false,
  romanian: "show",          // show | blur | hide
  showLxx: false,
  translitDots: true,
  translitStress: "bold",    // bold | caps | none
  translitStyle: "auto",     // auto (follow the interface language) | en (sh, tz, ch) | ro (ș, ț, h)
  voice: "he-IL-AvriNeural",
  audioEngine: "auto",       // auto | server | browser
  slowRate: "-35%",
  divineName: "adonai",      // adonai | yahweh | as-written
  newPerDay: 15,
  reviewDirections: { recognize: true, recall: true, listen: false },
  autoKnownDays: 21,
  heFont: "",
  autoplayWord: false,
};

const DEFAULT_DATA = () => ({
  v: 1,
  settings: { ...DEFAULT_SETTINGS },
  cards: {},
  log: [],
  known: {},
  notes: {},
  align: {},
  read: {},
  pos: { b: 0, c: 1 },
  daily: {},
  path: {},
  saved: {},                 // saved verses: "b.c.v" -> { t: time saved, level: memorizing level 0-3 }
});

const LOCAL_KEY = "mikra-backup";
const listeners = new Set();
let data = DEFAULT_DATA();
let saveTimer = null;
let lastSaveOk = true;
let rev = 0;              // revision of userdata.json this window last loaded or saved
let saving = null;        // the save request in flight, so saves never overlap
let saveAgain = false;    // a change arrived while saving
let conflict = false;     // another window saved newer data; this one stops saving
let inflightSaved = 0;    // _saved of the save request in flight (see beforeunload and load)
let failedSaves = 0;      // saves that failed in a row: the next try waits longer, and only the first one warns

// Fills in anything missing so a partial or older file can't break the app.
function normalize(src) {
  src = src && typeof src === "object" && !Array.isArray(src) ? src : {};
  const out = Object.assign(DEFAULT_DATA(), src);
  const st = src.settings && typeof src.settings === "object" ? src.settings : {};
  out.settings = Object.assign({ ...DEFAULT_SETTINGS }, st);
  out.settings.reviewDirections = Object.assign({ ...DEFAULT_SETTINGS.reviewDirections }, st.reviewDirections || {});
  if (!out.settings.themeOverrides || typeof out.settings.themeOverrides !== "object") out.settings.themeOverrides = {};
  if (out.settings.lang !== "en" && out.settings.lang !== "ro") {
    const nav = (typeof navigator !== "undefined" && navigator.language || "").toLowerCase();
    out.settings.lang = nav.startsWith("ro") || nav.startsWith("mo") ? "ro" : "en";
  }
  if (out.settings.bible !== "kjv" && out.settings.bible !== "ro") out.settings.bible = out.settings.lang === "ro" ? "ro" : "kjv";
  for (const k of ["cards", "known", "notes", "align", "read", "daily", "path", "saved"]) {
    if (!out[k] || typeof out[k] !== "object" || Array.isArray(out[k])) out[k] = {};
  }
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  for (const [id, c] of Object.entries(out.cards)) {
    if (!isObj(c)) { delete out.cards[id]; continue; }
    c.id = id;
    for (const f of ["due", "stability", "difficulty", "reps", "lapses", "last", "created"]) if (c[f] !== undefined && !Number.isFinite(c[f])) delete c[f];
    // text fields are used with string methods everywhere (a number here stopped Review and My words)
    for (const f of ["heb", "translit", "gloss", "glossRo", "ro", "en", "key", "parse", "parseCode", "kind"]) if (c[f] != null && typeof c[f] !== "string") delete c[f];
    if (c.ctx != null && !isObj(c.ctx)) delete c.ctx;
    c.suspended = c.suspended === true;
    if (!Number.isFinite(c.created)) c.created = 0;
    if (!["new", "learning", "relearning", "review"].includes(c.state)) c.state = "new";
    if (!Number.isFinite(c.due)) c.due = Date.now();
  }
  // one bad entry in a restored or hand-edited file must not blank a whole tab
  for (const k of ["daily", "saved"]) for (const [id, v] of Object.entries(out[k])) if (!isObj(v)) delete out[k][id];
  for (const day of Object.values(out.daily)) for (const [f, v] of Object.entries(day)) if (!Number.isFinite(v)) delete day[f];
  // settings out of range or of the wrong type (sizes of 5000 px, a missing "known after" number...)
  const s = out.settings;
  const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;
  s.heSize = num(s.heSize, 18, 48, DEFAULT_SETTINGS.heSize);
  s.roSize = num(s.roSize, 13, 24, DEFAULT_SETTINGS.roSize);
  s.autoKnownDays = num(s.autoKnownDays, 3, 365, DEFAULT_SETTINGS.autoKnownDays);
  s.newPerDay = num(s.newPerDay, 0, 500, DEFAULT_SETTINGS.newPerDay);
  s.goalMinutes = num(s.goalMinutes, 0, 600, DEFAULT_SETTINGS.goalMinutes);
  s.goalReviews = num(s.goalReviews, 0, 2000, DEFAULT_SETTINGS.goalReviews);
  for (const k of ["voice", "slowRate", "heFont", "theme", "themeLight", "themeDark"]) if (typeof s[k] !== "string") s[k] = DEFAULT_SETTINGS[k];
  if (!["auto", "en", "ro"].includes(s.translitStyle)) s.translitStyle = "auto";
  for (const [id, v] of Object.entries(out.align)) {
    if (!Array.isArray(v) || v.length % 3 || !v.every(x => Number.isInteger(x) && x >= 0)) delete out.align[id];
  }
  for (const [id, v] of Object.entries(out.notes)) if (typeof v !== "string") delete out.notes[id];
  if (!Array.isArray(out.log)) out.log = [];
  if (!isObj(out.pos) || !Number.isInteger(out.pos.b) || !Number.isInteger(out.pos.c)) out.pos = { b: 0, c: 1 };
  delete out._rev;
  delete out._baseRev;
  delete out._inflightSaved;
  return out;
}

export const store = {
  get data() { return data; },
  get settings() { return data.settings; },

  async load() {
    let server = {};
    try { server = await api.get("userdata"); } catch (e) { server = null; }
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || localStorage.getItem("hebrew-reader-backup") || "null"); } catch (_) { local = null; }
    if (!local || typeof local !== "object" || Array.isArray(local)) local = null;
    let src = server && Object.keys(server).length ? server : (local || {});
    rev = server && Number.isInteger(server._rev) ? server._rev : 0;
    // The browser copy wins only when it is newer AND was made from the revision the server still has, i.e. the
    // server never received it (it was stopped). A copy made from an older revision comes from a window whose save
    // was refused because another window had saved since; loading it would bring back old progress.
    // Also accepted: the server's newest revision is this copy's own save that was still in flight when the window closed.
    const ownInflight = local && local._inflightSaved && local._inflightSaved === server?._saved && local._baseRev === rev - 1;
    if (server && local && Object.keys(local).length && (local._saved || 0) > (server._saved || 0) && (local._baseRev === rev || ownInflight)) src = local;
    data = normalize(src);
    // the browser copy held changes the server never got: send them now
    if (src === local && server && Object.keys(server).length) this.scheduleSave();
  },

  // Replaces everything (restore from a backup file), keeping the app's own bookkeeping.
  replaceAll(src) {
    const fresh = normalize(src);
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, fresh);
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  changed(what = "data", key = null) {
    for (const fn of listeners) { try { fn(what, key); } catch (e) { console.error(e); } }
    this.scheduleSave();
  },

  scheduleSave() {
    if (conflict) return;
    clearTimeout(saveTimer);
    setSaveState(tr("Saving…", "Se salvează…"));
    saveTimer = setTimeout(() => this.saveNow(), 700);
  },

  async saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (conflict) return;
    if (saving) {
      saveAgain = true;
      await saving;
      while (saving) await saving; // the follow-up save, started as soon as the one in flight finished
      return;
    }
    saving = (async () => {
      data._saved = Date.now();
      if (!Array.isArray(data.log)) data.log = [];
      if (data.log.length > 20000) data.log = data.log.slice(-20000);
      const json = JSON.stringify(data);
      const body = withRev(json);
      // the browser copy remembers which revision it was made from (see load)
      try { localStorage.setItem(LOCAL_KEY, body); } catch (_) { /* storage may be full or blocked */ }
      inflightSaved = data._saved;
      try {
        const r = await fetch("/api/userdata", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        if (r.status === 409) { onConflict(); return; }
        if (!r.ok) throw new Error(r.statusText);
        const res = await r.json();
        if (Number.isInteger(res.rev)) rev = res.rev;
        lastSaveOk = true;
        failedSaves = 0;
        setSaveState(tr("Saved", "Salvat"));
      } catch (e) {
        lastSaveOk = false;
        const down = e instanceof TypeError; // fetch itself failed: no server; otherwise the server answered with an error
        setSaveState(down ? tr("Not saved: the app server is not running", "Nesalvat: serverul aplicației nu rulează") : tr("Not saved", "Nesalvat"));
        if (!failedSaves) toast(tr("Your progress could not be saved. Trying again…", "Progresul nu s-a putut salva. Încerc din nou…"), 5000);
        failedSaves++;
        // try again later (5 s, 10 s, ... up to a minute); this also lets the flush on pause retry
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => store.saveNow(), Math.min(60000, 5000 * failedSaves));
      }
    })();
    try { await saving; } finally { saving = null; inflightSaved = 0; }
    if (saveAgain && !conflict) { saveAgain = false; return this.saveNow(); }
  },

  setting(key, value) {
    data.settings[key] = value;
    this.changed("settings", key);
  },

  // ---- known words
  isKnown(key) {
    if (!key) return false;
    if (data.known[key]) return true;
    const c = data.cards["L:" + key];
    return !!(c && c.state === "review" && c.stability >= data.settings.autoKnownDays);
  },
  knownKeys() {
    const set = new Set(Object.keys(data.known));
    for (const c of Object.values(data.cards)) {
      if (c.kind === "lemma" && c.state === "review" && c.stability >= data.settings.autoKnownDays) set.add(c.key);
    }
    return set;
  },
  toggleKnown(key) {
    if (data.known[key]) delete data.known[key];
    else data.known[key] = Date.now();
    this.changed("known");
    return !!data.known[key];
  },

  // ---- cards
  card(id) { return data.cards[id]; },
  hasCard(id) { return !!data.cards[id]; },
  addCard(card) {
    if (data.cards[card.id]) return data.cards[card.id];
    const now = Date.now();
    data.cards[card.id] = Object.assign({
      created: now, due: now, state: "new", stability: 0, difficulty: 0, reps: 0, lapses: 0, last: 0, suspended: false,
    }, card);
    this.bumpDaily("added");
    this.changed("cards");
    return data.cards[card.id];
  },
  // Adds many cards at once (a deck), keeping their order for the "new cards" queue. Returns how many were new.
  addCards(cards) {
    const now = Date.now();
    let n = 0;
    cards.forEach((card, i) => {
      if (data.cards[card.id]) return;
      data.cards[card.id] = Object.assign({
        created: now + i, due: now, state: "new", stability: 0, difficulty: 0, reps: 0, lapses: 0, last: 0, suspended: false,
      }, card);
      n++;
    });
    if (n) { this.bumpDaily("added", n); this.changed("cards"); }
    return n;
  },
  removeCard(id) { delete data.cards[id]; this.changed("cards"); },

  // ---- notes
  note(key) { return data.notes[key] || ""; },
  setNote(key, text) {
    if (text && text.trim()) data.notes[key] = text; else delete data.notes[key];
    this.changed("notes");
  },

  // ---- alignment fixes, kept per Bible version ("kjv:" prefix for the KJV; Cornilescu keys have none)
  alignFor(b, c, v, ver = "ro") { return data.align[(ver === "kjv" ? "kjv:" : "") + `${b}.${c}.${v}`]; },
  setAlign(b, c, v, flat, ver = "ro") {
    const k = (ver === "kjv" ? "kjv:" : "") + `${b}.${c}.${v}`;
    if (flat === null) delete data.align[k];
    else data.align[k] = flat;
    this.changed("align");
  },

  // ---- saved verses
  isSaved(b, c, v) { return !!data.saved[`${b}.${c}.${v}`]; },
  toggleSaved(b, c, v) {
    const k = `${b}.${c}.${v}`;
    if (data.saved[k]) delete data.saved[k]; else data.saved[k] = { t: Date.now(), level: 0 };
    this.changed("saved");
    return !!data.saved[k];
  },

  bumpDaily(field, n = 1) {
    const d = today();
    data.daily[d] = data.daily[d] || {};
    data.daily[d][field] = (data.daily[d][field] || 0) + n;
  },

  get saveOk() { return lastSaveOk; },

  // Saves pending changes, then asks the server to keep a copy of the current file in the backups folder
  // (before a restore or "delete all progress"). Resolves to the copy's file name, or "" if none was made.
  async restorePoint(reason) {
    try { await this.saveNow(); } catch (_) { /* the copy below still runs */ }
    try { return (await api.post("restore_point", { reason })).file || ""; } catch (_) { return ""; }
  },

  // Before replacing or deleting everything: the restore point above, and in the Android app also a file in Downloads,
  // because the app's own backups folder can't be opened on the phone. Returns false if no copy could be made.
  async safetyCopy(reason) {
    const file = await this.restorePoint(reason);
    const bridge = typeof window !== "undefined" && window.MikraAndroid;
    if (!bridge || !bridge.saveFile) return true;
    try {
      const r = String(bridge.saveFile(`mikra-before-${reason}-${today()}.json`, "application/json", JSON.stringify(data, null, 1)) || "");
      if (r.startsWith("error:")) return !!file;
      return true;
    } catch (_) { return !!file; }
  },
};

// Days in a row with study: a day counts when it has flashcard reviews or at least 5 minutes of study.
// Today counts once it has either; an empty today doesn't break a streak that ran until yesterday.
export function dayStreak() {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 3650; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = data.daily[k];
    if (day && (day.reviews || (day.secs || 0) >= 300)) n++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// The request body is the data plus the revision it was based on, added without copying the data object.
function withRev(json) {
  return json === "{}" ? `{"_baseRev":${rev}}` : `{"_baseRev":${rev},` + json.slice(1);
}

function onConflict() {
  conflict = true;
  lastSaveOk = false;
  clearTimeout(saveTimer);
  setSaveState(tr("Not saved: open in another window", "Nesalvat: deschis în altă fereastră"));
  const root = document.getElementById("modal-root");
  if (!root || root.querySelector(".conflict-note")) return;
  const back = document.createElement("div");
  back.className = "modal-back conflict-note";
  const box = document.createElement("div");
  box.className = "modal";
  box.setAttribute("role", "alertdialog");
  const title = document.createElement("h2");
  title.textContent = tr("Mikra is open in another window", "Mikra este deschisă în altă fereastră");
  const p = document.createElement("p");
  p.textContent = tr("That window saved newer progress. To keep it safe, this window stopped saving. Reload to continue with the latest data.",
    "Cealaltă fereastră a salvat progres mai nou. Ca să nu se piardă, fereastra aceasta nu mai salvează. Reîncarcă pentru datele cele mai noi.");
  const btn = document.createElement("button");
  btn.className = "btn primary";
  btn.type = "button";
  btn.textContent = tr("Reload", "Reîncarcă");
  btn.addEventListener("click", () => location.reload());
  box.append(title, p, btn);
  back.append(box);
  root.append(back);
}

function setSaveState(text) {
  const el = document.getElementById("save-state");
  if (el) el.textContent = text;
}

// Phones send the app to the background without closing the page: save at once instead of waiting.
function flushNow() { if ((saveTimer || saveAgain) && !conflict) store.saveNow(); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
window.mikraFlush = flushNow;

window.addEventListener("beforeunload", () => {
  if ((saveTimer || saveAgain) && !conflict) {
    clearTimeout(saveTimer);
    data._saved = Date.now();
    const body = withRev(JSON.stringify(data));
    // a save still in flight may land after this window is gone; note which one, so load() can tell
    const local = saving && inflightSaved ? `{"_inflightSaved":${inflightSaved},` + body.slice(1) : body;
    try { localStorage.setItem(LOCAL_KEY, local); } catch (_) { /* ignore */ }
    try { navigator.sendBeacon && navigator.sendBeacon("/api/userdata", new Blob([body], { type: "application/json" })); } catch (_) { /* ignore */ }
  }
});
