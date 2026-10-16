// My words: every saved card, every word marked as known, saved verses with a memorizing mode, export and import.

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, toast, modal, fmtInt, relDays, he, heText, heClass, dateKey, trt, shuffle } from "./ui.js";
import { tr, trn, lang, bible, bibleName, meaning, cursive } from "./i18n.js";
import { translit, lemmaTranslit, stripCantillation, stripPoints, consonants, unpack, speakableText, speakableLemma, shortParse } from "./hebrew.js";
import { speak, stop as stopAudio } from "./audio.js";
import { schedule, preview, isDue, dueAt, studyDate } from "./fsrs.js";

let root, listEl, filter = "", tab = "cards", sortKey = "created", sortDir = -1, stateFilter = "all";
let fillGen = 0; // bumped on every refill so a slow, older request can't add a second table
let verseRun = 0; // bumped when the memorizing or verse review screen is left, so a late answer can't draw over the page
const briefCache = new Map();
const verseCache = new Map();

export function mount(el) { root = el; }
export function show(params = {}) {
  if (params.tab) tab = params.tab;
  verseRun++;
  if (params.review) { tab = "verses"; reviewVerses(); return; }
  render();
}
export function hide() { verseRun++; stopAudio(); }

// ------------------------------------------------------------------ saved verses on a schedule
// A saved verse you have learned (memorizing, "I said it right" on the last level, or a verse review) comes back on
// the flashcard schedule, so verses learned by heart stay learned. The schedule is kept with the verse, under srs.

const NEW_SRS = () => ({ state: "new", due: Date.now(), stability: 0, difficulty: 0, reps: 0, lapses: 0, last: 0 });
export function verseIsDue(entry, now = Date.now()) { return !!(entry && entry.srs && isDue(entry.srs, now)); }
export function dueVerseKeys(now = Date.now()) {
  return Object.entries(store.data.saved).filter(([, e]) => verseIsDue(e, now))
    .sort((a, b) => dueAt(a[1].srs) - dueAt(b[1].srs)).map(([k]) => k);
}
// Same study day (from 4 a.m.): pressing "I said it right" many times in one sitting schedules the verse once.
function sameStudyDay(a, b) { return dateKey(studyDate(a)) === dateKey(studyDate(b)); }

function gradeVerse(k, g) {
  const e = store.data.saved[k];
  if (!e) return null;
  e.srs = schedule(e.srs || NEW_SRS(), g);
  const level = e.level || 0;
  if (g >= 3) e.level = Math.min(3, level + 1);
  else if (g === 1) e.level = Math.max(0, level - 1);
  if (g >= 3 && e.level === 3 && !e.mastered) e.mastered = Date.now();
  if (e.level < 3) delete e.mastered; // forgotten: no longer counted as known by heart until it is said right again
  store.changed("saved");
  return e.srs;
}

function render() {
  clear(root);
  const page = h("div", { class: "page" });
  page.append(h("h1", null, tr("My words", "Cuvintele mele")),
    h("p", { class: "lede" }, tr("Everything you have saved for review, every word you marked as known, and the verses you are learning by heart.",
      "Tot ce ai salvat pentru recapitulare, fiecare cuvânt marcat ca știut și versetele pe care le înveți pe de rost.")));
  const search = h("input", { type: "search", placeholder: tr("Filter", "Filtrează"), value: filter, "aria-label": tr("Filter words", "Filtrează cuvintele"), oninput: (e) => { filter = e.target.value.toLowerCase(); fill(); } });
  const tabs = h("div", { class: "seg" },
    h("button", { type: "button", class: tab === "cards" ? "on" : "", onclick: () => { tab = "cards"; render(); } }, tr(`Review cards (${Object.keys(store.data.cards).length})`, `Cartonașe (${Object.keys(store.data.cards).length})`)),
    h("button", { type: "button", class: tab === "known" ? "on" : "", onclick: () => { tab = "known"; render(); } }, tr(`Known words (${store.knownKeys().size})`, `Cuvinte știute (${store.knownKeys().size})`)),
    h("button", { type: "button", class: tab === "verses" ? "on" : "", onclick: () => { tab = "verses"; render(); } }, tr(`Saved verses (${Object.keys(store.data.saved).length})`, `Versete salvate (${Object.keys(store.data.saved).length})`)));
  const states = [["all", tr("All cards", "Toate")], ["new", tr("New", "Noi")], ["learning", tr("Learning", "În învățare")], ["review", tr("In review", "În recapitulare")], ["suspended", tr("Paused", "Pe pauză")],
    ["tricky", tr("Tricky (forgotten 4+ times)", "Dificile (uitate de 4+ ori)")]];
  const stateSel = h("select", { "aria-label": tr("Card state", "Starea cartonașului"), onchange: (e) => { stateFilter = e.target.value; fill(); } },
    states.map(([v, l]) => h("option", { value: v, selected: stateFilter === v }, l)));
  page.append(h("div", { class: "row", style: { marginBottom: "14px" } }, tabs, tab !== "verses" ? search : null, tab === "cards" ? stateSel : null, h("div", { class: "spacer" }),
    h("button", { class: "btn", type: "button", onclick: exportCsv }, tr("Export for Anki (.tsv)", "Exportă pentru Anki (.tsv)")),
    h("button", { class: "btn", type: "button", onclick: exportJson }, tr("Back up everything", "Fă o copie de siguranță")),
    h("button", { class: "btn", type: "button", onclick: importJson }, tr("Restore backup", "Restaurează o copie"))));
  listEl = h("div");
  page.append(listEl);
  root.append(page);
  fill();
}

// Search text: Hebrew can be typed with or without vowels, a transliteration with or without its syllable dots,
// in the stored English style (ne.phesh) or as it is shown (ne·feș in Romanian spelling).
function matches(q, heb, texts, trl) {
  const qh = stripPoints(q).replace(/\s+/g, " ").trim();
  const shown = trl ? translit(trl, store.settings, { html: false, heb, dots: false, stress: "none" }) : "";
  const plain = shown.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // nefeș also found as nefes
  const hay = [heb, stripCantillation(heb), consonants(heb), trl, String(trl || "").replace(/[.\/]/g, ""), shown, plain, ...texts]
    .map(x => String(x || "")).join(" ").toLowerCase();
  return hay.includes(q) || (qh && hay.includes(qh.replace(/[־\s]/g, "")));
}

function stateOf(c) {
  if (c.suspended) return "suspended";
  if (c.state === "relearning") return "learning";
  return c.state;
}

const STATE_LABEL = { new: ["new", "nou"], learning: ["learning", "în învățare"], review: ["review", "recapitulare"], suspended: ["paused", "pe pauză"] };
const KIND_LABEL = { lemma: ["word", "cuvânt"], form: ["form", "formă"], phrase: ["phrase", "expresie"] };

function fill() {
  fillGen++;
  clear(listEl);
  if (tab === "known") return fillKnown();
  if (tab === "verses") return fillVerses();
  let cards = Object.values(store.data.cards);
  if (stateFilter === "tricky") cards = cards.filter(c => (c.lapses || 0) >= 4);
  else if (stateFilter !== "all") cards = cards.filter(c => stateOf(c) === stateFilter);
  if (filter) cards = cards.filter(c => matches(filter, c.heb, [c.gloss, c.glossRo, c.ro, c.en], c.translit));
  const val = (c) => sortKey === "heb" ? stripCantillation(c.heb) : sortKey === "gloss" ? meaning(c) : (c[sortKey] || 0);
  cards.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  if (!cards.length) {
    listEl.append(h("div", { class: "empty" }, Object.keys(store.data.cards).length ? tr("No cards match.", "Niciun cartonaș nu se potrivește.")
      : trt("No cards yet. Add a word deck in Review, or click a Hebrew word in the reader and choose Add word.", "Încă nu ai cartonașe. Adaugă un pachet de cuvinte din Recapitulare sau apasă pe un cuvânt ebraic în cititor și alege Adaugă cuvântul.")));
    return;
  }
  const th = (key, label) => h("th", { onclick: () => { if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === "created" ? -1 : 1; } fill(); } },
    label + (sortKey === key ? (sortDir > 0 ? " ↑" : " ↓") : ""));
  const table = h("table", { class: "words-table cards-table" },
    h("thead", null, h("tr", null, th("heb", tr("Hebrew", "Ebraică")), h("th", null, tr("Sound", "Pronunție")), th("gloss", tr("Meaning", "Înțeles")), h("th", null, tr("Type", "Tip")),
      h("th", null, tr("State", "Stare")), th("due", tr("Next", "Revine")), th("stability", tr("Memory", "Memorie")), th("lapses", tr("Misses", "Greșeli")), h("th"))));
  const tb = h("tbody");
  const s = store.settings;
  for (const c of cards.slice(0, 600)) {
    const st = stateOf(c);
    const parse = c.parseCode ? shortParse(c.parseCode) : c.parse;
    tb.append(h("tr", { class: c.suspended ? "suspended" : "" },
      h("td", { class: "he" + heClass(), lang: "he", style: { cursor: "pointer" }, title: tr("Listen", "Ascultă"),
        onclick: () => speak(c.kind === "lemma" ? speakableLemma(c.heb, c.key, s) : speakableText(c.heb, s)) }, heText(stripCantillation(c.heb))),
      h("td", { html: translit(c.kind === "lemma" ? lemmaTranslit(c.translit, c.key, s) : (c.translit || ""), s, { heb: c.heb }) }),
      h("td", null, meaning(c), parse ? h("div", { class: "small muted" }, parse) : null,
        c.key && store.note(c.key) ? h("div", { class: "small muted", style: { whiteSpace: "pre-wrap" } }, store.note(c.key)) : null),
      h("td", { class: "small muted" }, KIND_LABEL[c.kind] ? tr(...KIND_LABEL[c.kind]) : c.kind),
      h("td", null, h("span", { class: "pill " + st }, STATE_LABEL[st] ? tr(...STATE_LABEL[st]) : st)),
      h("td", { class: "small" }, c.state === "new" ? "" : relDays(c.due)),
      h("td", { class: "small muted" }, c.stability ? Math.round(c.stability) + tr(" d", " z") : ""),
      h("td", { class: "small muted" }, c.lapses ? String(c.lapses) : ""),
      h("td", { class: "nowrap" },
        c.ctx ? iconBtn("book", tr("Open in reader", "Deschide în cititor"), () => ctx.navigate("read", { b: c.ctx.b, c: c.ctx.c, v: c.ctx.v, w: c.ctx.w })) : null,
        iconBtn(c.suspended ? "play" : "stop", c.suspended ? tr("Resume", "Reia") : tr("Pause", "Pauză"), () => { c.suspended = !c.suspended; store.changed("cards"); fill(); }),
        iconBtn("undo", tr("Reset progress", "Ia de la capăt"), () => { Object.assign(c, { state: "new", stability: 0, difficulty: 0, reps: 0, lapses: 0, due: Date.now(), last: 0 }); store.changed("cards"); fill(); }),
        iconBtn("trash", tr("Delete card", "Șterge cartonașul"), () => { store.removeCard(c.id); fill(); }))));
  }
  table.append(tb);
  listEl.append(table);
  if (cards.length > 600) listEl.append(h("p", { class: "muted small" }, tr(`Showing 600 of ${fmtInt(cards.length)}. Use the filter to narrow it down.`, `Se arată 600 din ${fmtInt(cards.length)}. Folosește filtrul ca să restrângi lista.`)));
}

async function fillKnown() {
  const gen = fillGen;
  const target = listEl;
  const keys = [...store.knownKeys()];
  if (!keys.length) { target.append(h("div", { class: "empty" }, tr("No known words yet. Mark words with I know it, or let well-learned review cards count automatically.", "Încă nu ai cuvinte știute. Marchează cuvinte cu Îl știu sau lasă cartonașele bine învățate să se numere singure."))); return; }
  // one request for all missing words instead of one request per word
  const missing = keys.filter(k => !briefCache.has(k));
  if (missing.length) {
    target.append(h("div", { class: "muted small" }, tr("Loading…", "Se încarcă…")));
    try {
      const res = await api.post("lemma_brief", { keys: missing });
      for (const k of missing) briefCache.set(k, res[k] || null);
    } catch (e) {
      if (gen === fillGen) { clear(target); target.append(h("div", { class: "empty" }, tr("Could not load the word list: ", "Nu am putut încărca lista: ") + errText(e))); }
      return;
    }
    if (gen !== fillGen) return;
    clear(target);
  }
  const rows = keys.map(k => briefCache.get(k));
  const items = rows.filter(Boolean).filter(l => !filter || matches(filter, l.hebrew, [l.gloss, l.glossRo], l.translit));
  items.sort((a, b) => (b.freq || 0) - (a.freq || 0));
  const s = store.settings;
  const table = h("table", { class: "words-table known-table" }, h("thead", null, h("tr", null, h("th", null, tr("Hebrew", "Ebraică")), h("th", null, tr("Sound", "Pronunție")),
    h("th", null, tr("Meaning", "Înțeles")), h("th", null, tr("In the OT", "În VT")), h("th", null, tr("How", "Cum")), h("th"))));
  const tb = h("tbody");
  for (const l of items) {
    const manual = !!store.data.known[l.key];
    tb.append(h("tr", null,
      h("td", { class: "he" + heClass(), lang: "he" }, heText(l.hebrew)),
      h("td", { html: translit(lemmaTranslit(l.translit, l.key, s), s, { heb: l.hebrew }) }),
      h("td", null, meaning(l)),
      h("td", { class: "small muted" }, fmtInt(l.freq) + "×"),
      h("td", { class: "small muted" }, manual ? tr("marked by you", "marcat de tine") : tr("learned in review", "învățat în recapitulare")),
      h("td", null, manual ? iconBtn("x", tr("Unmark", "Scoate marcajul"), () => { store.toggleKnown(l.key); fill(); }) : null)));
  }
  table.append(tb);
  target.append(table);
}

// ------------------------------------------------------------------ saved verses

function parseKey(k) { const [b, c, v] = k.split(".").map(Number); return { b, c, v }; }

async function getVerse(k) {
  if (verseCache.has(k)) return verseCache.get(k);
  const { b, c, v } = parseKey(k);
  const p = api.get("verse", { b, c, v }).then(res => {
    const words = res.verse[4].map(unpack).filter(w => w.extra.x !== "X");
    return {
      words: words.map(w => stripCantillation(w.text) + (w.punct.includes("־") ? "־" : "")),
      ro: res.verse[2], en: res.en ? res.en[0] : "",
    };
  });
  verseCache.set(k, p);
  p.catch(() => verseCache.delete(k));
  return p;
}

function hebrewLine(v) { return v.words.join(" ").replace(/־ /g, "־"); }
function bibleText(v) { return bible() === "kjv" && v.en ? v.en : v.ro; }

async function fillVerses() {
  const gen = fillGen;
  const target = listEl;
  const keys = Object.entries(store.data.saved).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).map(x => x[0]);
  if (!keys.length) {
    target.append(h("div", { class: "empty" }, trt("No saved verses yet. In the reader, hover a verse and click the star to save it.", "Încă nu ai versete salvate. În cititor, treci cu mouse-ul peste un verset și apasă pe stea ca să-l salvezi.",
      "No saved verses yet. In the reader, tap a verse number, then the star.", "Încă nu ai versete salvate. În cititor, apasă pe numărul unui verset, apoi pe stea.")));
    return;
  }
  const due = dueVerseKeys();
  target.append(h("div", { class: "row verse-due", style: { marginBottom: "12px" } },
    h("button", { class: "btn" + (due.length ? " primary" : ""), type: "button", disabled: !due.length, onclick: () => reviewVerses() }, icon("play"),
      due.length ? tr(`Repeat the verses that are due (${due.length})`, `Repetă versetele de azi (${due.length})`) : tr("No verse to repeat today", "Niciun verset de repetat azi")),
    h("span", { class: "small muted" }, tr("A verse you have learned comes back on a schedule, like the flashcards, so it stays learned.",
      "Un verset învățat revine după un program, ca și cartonașele, ca să nu-l uiți."))));
  const list = h("div", { class: "saved-list" });
  target.append(list);
  // a few at a time, so a long list doesn't flood the server
  const rows = keys.map(k => {
    const row = h("div", { class: "saved-row" }, h("div", { class: "muted small" }, ctx.refText(...Object.values(parseKey(k)))), h("div", { class: "muted small" }, tr("Loading…", "Se încarcă…")));
    list.append(row);
    return [k, row];
  });
  let next = 0;
  const worker = async () => {
    while (next < rows.length && gen === fillGen) {
      const [k, row] = rows[next++];
      try { fillSavedRow(row, k, await getVerse(k)); } catch (e) { clear(row); row.append(h("div", { class: "muted" }, tr("Could not load this verse.", "Nu am putut încărca versetul."))); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

function levelName(n) {
  return [tr("Full text", "Text întreg"), tr("Some words hidden", "Câteva cuvinte ascunse"), tr("First letters only", "Doar primele litere"), tr("All hidden", "Totul ascuns")][n] || "";
}

// When a saved verse comes back: "to repeat today", "again in 5 d", or nothing before it is learned.
function scheduleLabel(e) {
  if (!e || !e.srs) return null;
  if (verseIsDue(e)) return h("span", { class: "pill learning" }, tr("to repeat today", "de repetat azi"));
  return h("span", { class: "pill review", title: tr("When it comes back to repeat", "Când revine la repetat") }, tr("again in ", "din nou peste ") + relDays(dueAt(e.srs)));
}

function fillSavedRow(row, k, v) {
  const { b, c, v: vn } = parseKey(k);
  const e = store.data.saved[k] || {};
  const level = e.level || 0;
  clear(row);
  row.append(
    h("div", { class: "row" }, h("b", null, ctx.refText(b, c, vn)), h("span", { class: "pill" }, e.mastered ? tr("By heart", "Pe de rost") : levelName(level)), scheduleLabel(e), h("span", { class: "spacer" }),
      iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableText(hebrewLine(v), store.settings))),
      h("button", { class: "btn small primary", type: "button", onclick: () => memorize(k) }, icon("pen"), tr("Memorize", "Învață pe de rost")),
      h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b, c, v: vn }) }, icon("book"), tr("Open", "Deschide")),
      iconBtn("trash", tr("Remove", "Scoate"), () => { store.toggleSaved(b, c, vn); render(); })),
    h("div", { class: "he saved-he" + heClass(), lang: "he", dir: "rtl" }, heText(hebrewLine(v))),
    h("div", { class: "muted", lang: bible() === "kjv" ? "en" : "ro" }, bibleText(v)));
}

// The verse with words hidden for a level: 0 shows everything, 1 hides every third word, 2 shows only first letters,
// 3 hides all. A hidden word shows itself when clicked.
function memLine(v, level) {
  const line = h("div", { class: "mem-line he" + heClass(), lang: "he", dir: "rtl" });
  v.words.forEach((w, i) => {
    const shown = cursive() ? stripPoints(w) : w;
    let hidden = false, firstOnly = false;
    if (level === 1) hidden = i % 3 === 1;
    if (level === 2) firstOnly = true;
    if (level === 3) hidden = true;
    const el = h("span", { class: "mem-word" + (hidden ? " hidden" : "") + (firstOnly ? " first" : ""), title: trt("Click to show", "Apasă ca să vezi") });
    if (hidden) el.append(h("span", { class: "mem-blank", style: { width: Math.max(1.6, stripPoints(w).length * 0.62) + "em" } }));
    else if (firstOnly) el.append(firstLetter(shown), h("span", { class: "mem-rest" }, "…"));
    else el.append(shown);
    el.addEventListener("click", () => { clear(el); el.className = "mem-word shown"; el.append(shown); });
    line.append(el, " ");
  });
  return line;
}

// Build it: the words of the verse are shuffled below; tap them in order to put the verse together. A word that
// appears twice can be taken from either chip. onDone(mistakes) runs when the verse is complete.
function buildMode(v, onDone) {
  const target = v.words.map(w => cursive() ? stripPoints(w) : w);
  const line = h("div", { class: "mem-line he build-line" + heClass(), lang: "he", dir: "rtl" });
  const slots = target.map((t) => {
    const slot = h("span", { class: "mem-blank build-slot", style: { width: Math.max(1.6, stripPoints(t).length * 0.62) + "em" } });
    line.append(slot, " ");
    return slot;
  });
  const chips = h("div", { class: "build-chips" + heClass(), lang: "he", dir: "rtl" });
  let pos = 0, mistakes = 0;
  if (slots[0]) slots[0].classList.add("now");
  for (const t of shuffle(target)) {
    const chip = h("button", { type: "button", class: "build-chip" }, t);
    chip.addEventListener("click", () => {
      if (pos >= target.length || !chip.isConnected) return;
      if (t === target[pos]) {
        slots[pos].replaceWith(h("span", { class: "mem-word shown" }, t));
        chip.remove();
        pos++;
        if (slots[pos]) slots[pos].classList.add("now");
        if (pos === target.length) onDone(mistakes);
      } else {
        mistakes++;
        chip.classList.add("wrong");
        setTimeout(() => chip.classList.remove("wrong"), 450);
      }
    });
    chips.append(chip);
  }
  return h("div", { class: "build" }, line,
    h("p", { class: "small muted", style: { textAlign: "center", maxWidth: "none" } }, trt("Click the words in the order of the verse. Hebrew starts on the right.", "Apasă cuvintele în ordinea din verset. Ebraica începe din dreapta.")),
    chips);
}

// Memorizing: hide more and more of the verse, or build it from its words.
async function memorize(k) {
  const { b, c, v: vn } = parseKey(k);
  let v;
  const run = ++verseRun;
  try { v = await getVerse(k); } catch (e) { toast(errText(e)); return; }
  if (run !== verseRun) return;
  let level = (store.data.saved[k] || {}).level || 0;
  let showBible = false;
  let mode = "hide";
  const draw = () => {
    clear(root);
    const page = h("div", { class: "page memorize" });
    const speakAll = (slow) => speak(speakableText(hebrewLine(v), store.settings), { slow });
    page.append(h("div", { class: "row" },
      h("button", { class: "btn ghost small", type: "button", onclick: () => { verseRun++; stopAudio(); tab = "verses"; render(); } }, icon("left"), tr("Saved verses", "Versete salvate")),
      h("span", { class: "spacer" }), h("b", null, ctx.refText(b, c, vn))));
    page.append(h("div", { class: "row", style: { margin: "14px 0" } },
      h("div", { class: "seg" },
        h("button", { type: "button", class: mode === "hide" ? "on" : "", onclick: () => { mode = "hide"; draw(); } }, tr("Hide words", "Ascunde cuvinte")),
        h("button", { type: "button", class: mode === "build" ? "on" : "", onclick: () => { mode = "build"; draw(); } }, tr("Build it", "Construiește-l"))),
      mode === "hide" ? h("div", { class: "seg" }, [0, 1, 2, 3].map(n =>
        h("button", { type: "button", class: n === level ? "on" : "", onclick: () => { level = n; draw(); } }, levelName(n)))) : null));
    if (mode === "build") {
      const result = h("div", { class: "row", style: { justifyContent: "center", margin: "14px 0" } });
      page.append(buildMode(v, (mistakes) => {
        result.append(h("b", null, mistakes ? trn(mistakes, "mistake", "mistakes", "greșeală", "greșeli") : tr("No mistakes!", "Nicio greșeală!")),
          h("button", { class: "btn", type: "button", onclick: () => draw() }, icon("shuffle"), tr("Once more", "Încă o dată")),
          h("button", { class: "btn", type: "button", onclick: () => speakAll(false) }, icon("speaker"), tr("Listen", "Ascultă")));
        if (!mistakes) toast(tr("Well done. Try hiding the words next.", "Bravo. Încearcă acum să ascunzi cuvintele."));
      }), result);
    } else {
      page.append(memLine(v, level));
    }
    page.append(h("div", { class: "row", style: { justifyContent: "center", margin: "18px 0" } },
      h("button", { class: "btn", type: "button", onclick: () => speakAll(false) }, icon("speaker"), tr("Listen", "Ascultă")),
      h("button", { class: "btn", type: "button", onclick: () => speakAll(true) }, icon("slow"), tr("Listen slowly", "Ascultă rar")),
      h("button", { class: "btn", type: "button", onclick: () => { showBible = !showBible; draw(); } }, showBible ? tr("Hide translation", "Ascunde traducerea") : tr("Show translation", "Arată traducerea"))));
    if (showBible) page.append(h("p", { class: "muted", style: { textAlign: "center", maxWidth: "none" } }, `${bibleName()}: ${bibleText(v)}`));
    if (mode === "hide") {
      page.append(h("div", { class: "row", style: { justifyContent: "center" } },
        h("button", { class: "btn", type: "button", disabled: level === 0, onclick: () => { level--; save(); draw(); } }, tr("Easier", "Mai ușor")),
        h("button", { class: "btn", type: "button", disabled: level === 3, onclick: () => { level++; save(); draw(); } }, tr("Harder", "Mai greu")),
        h("button", { class: "btn primary", type: "button", onclick: () => {
          if (level < 3) { level++; save(); toast(tr("Good. One step harder.", "Bine. Un pas mai greu.")); draw(); }
          else { save(true); toast(tr("You know this verse by heart. It will come back to repeat in a few days.", "Știi versetul pe de rost. Va reveni la repetat peste câteva zile.")); }
        } }, icon("check"), tr("I said it right", "L-am spus corect"))));
      page.append(h("p", { class: "small muted", style: { textAlign: "center", maxWidth: "none", marginTop: "18px" } },
        trt("Say the verse out loud. Click a hidden word to peek at it.", "Spune versetul cu voce tare. Apasă pe un cuvânt ascuns ca să-l vezi.")));
    }
    root.append(page);
  };
  const save = (mastered) => {
    const e = store.data.saved[k];
    if (!e) return;
    e.level = level;
    if (mastered) {
      e.mastered = e.mastered || Date.now();
      // learned: from now on it comes back on a schedule (once per study day, however often it is said)
      if (!e.srs || (verseIsDue(e) && !sameStudyDay(e.srs.last || 0, Date.now()))) e.srs = schedule(e.srs || NEW_SRS(), 3);
    }
    store.changed("saved");
  };
  draw();
}

// Repeating the verses that are due: each one at its level (at least a few words hidden), say it, check it, grade it.
async function reviewVerses() {
  const run = ++verseRun;
  const queue = dueVerseKeys();
  if (!queue.length) { toast(tr("No verse to repeat today.", "Niciun verset de repetat azi.")); render(); return; }
  const total = queue.length;
  let done = 0;
  const next = async () => {
    if (run !== verseRun) return;
    const k = queue.shift();
    if (!k) return finish();
    if (!store.data.saved[k]) return next(); // removed meanwhile
    let v;
    try { v = await getVerse(k); } catch (e) { toast(errText(e)); return next(); }
    if (run !== verseRun) return;
    drawOne(k, v);
  };
  const shell = (k) => {
    clear(root);
    const page = h("div", { class: "page memorize" });
    page.append(h("div", { class: "row" },
      h("button", { class: "btn ghost small", type: "button", onclick: () => { verseRun++; stopAudio(); tab = "verses"; render(); } }, icon("left"), tr("Saved verses", "Versete salvate")),
      h("span", { class: "spacer" }), k ? h("b", null, ctx.refText(...Object.values(parseKey(k)))) : null, h("span", { class: "muted small" }, `${done} / ${total}`)));
    root.append(page);
    return page;
  };
  const drawOne = (k, v) => {
    const e = store.data.saved[k];
    const page = shell(k);
    let mode = "hide";
    const area = h("div");
    const grades = h("div", { class: "grades", hidden: true });
    const revealBtn = h("button", { class: "btn primary", type: "button", onclick: () => reveal() }, tr("Show the verse", "Arată versetul"));
    const modeBtn = h("button", { class: "btn", type: "button", onclick: () => { mode = mode === "hide" ? "build" : "hide"; drawArea(); } });
    const drawArea = () => {
      clear(area);
      modeBtn.textContent = mode === "hide" ? tr("Build it instead", "Construiește-l") : tr("Say it with hidden words", "Spune-l cu cuvinte ascunse");
      if (mode === "build") area.append(buildMode(v, () => reveal()));
      else area.append(memLine(v, Math.max(1, e.level || 0)));
    };
    page.append(h("p", { class: "muted", style: { textAlign: "center", maxWidth: "none" } }, tr("Say the verse out loud, then check it.", "Spune versetul cu voce tare, apoi verifică.")),
      area, h("div", { class: "row", style: { justifyContent: "center", margin: "16px 0" } }, revealBtn, modeBtn), grades);
    drawArea();
    function reveal() {
      if (!grades.hidden) return;
      clear(area);
      area.append(memLine(v, 0), h("p", { class: "muted", style: { textAlign: "center", maxWidth: "none" } }, `${bibleName()}: ${bibleText(v)}`));
      revealBtn.remove(); modeBtn.remove();
      speak(speakableText(hebrewLine(v), store.settings));
      const pv = preview(e.srs || NEW_SRS());
      grades.hidden = false;
      let graded = false; // a double click must not grade twice (the next verse may still be loading)
      for (const [cls, label, g] of [["again", tr("Again", "Din nou"), 1], ["hard", tr("Hard", "Greu"), 2], ["good", tr("Good", "Bine"), 3], ["easy", tr("Easy", "Ușor"), 4]]) {
        grades.append(h("button", { class: "grade " + cls, type: "button", onclick: () => {
          if (graded) return;
          graded = true;
          for (const b of grades.children) b.disabled = true;
          const srs = gradeVerse(k, g);
          if (srs && srs.due - Date.now() < 20 * 60000) queue.push(k); else done++;
          stopAudio();
          next();
        } }, h("b", null, label), h("span", null, pv[g - 1])));
      }
    }
  };
  const finish = () => {
    const page = shell(null);
    page.append(h("div", { class: "done-screen" }, h("div", { class: "big" }, tr("Verses repeated", "Versete repetate")),
      h("p", { class: "muted" }, trn(done, "verse", "verses", "verset", "versete")),
      h("div", { class: "row", style: { justifyContent: "center", marginTop: "18px" } },
        h("button", { class: "btn primary", type: "button", onclick: () => { tab = "verses"; render(); } }, tr("Saved verses", "Versete salvate")))));
  };
  next();
}

function firstLetter(w) {
  const m = w.match(/^[א-ת][֑-ׇ]*/);
  return m ? m[0] : w.slice(0, 1);
}

// ------------------------------------------------------------------ export / import

function download(name, text, type) {
  // the Android app's window can't follow blob links: it hands the file to the phone's Downloads folder
  const bridge = window.MikraAndroid;
  if (bridge && bridge.saveFile) {
    const r = String(bridge.saveFile(name, type, text) || "");
    if (r.startsWith("ok:")) toast(tr("Saved in Downloads: ", "Salvat în Descărcări: ") + r.slice(3), 4000);
    else if (r.startsWith("error:")) toast(tr("Could not save the file: ", "Fișierul nu s-a putut salva: ") + r.slice(6), 5000);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportCsv() {
  const ro = lang() === "ro";
  const cols = ro ? ["Ebraică", "Pronunție", "Înțeles", "Cornilescu", "Notiță", "Trimitere"] : ["Hebrew", "Transliteration", "Meaning", "KJV", "Note", "Reference"];
  const lines = ["#separator:tab", "#html:false", "#columns:" + cols.join("\t")];
  for (const c of Object.values(store.data.cards)) {
    const ref = c.ctx ? ctx.refText(c.ctx.b, c.ctx.c, c.ctx.v) : "";
    const trn = translit(c.kind === "lemma" ? lemmaTranslit(c.translit, c.key, store.settings) : (c.translit || ""), store.settings, { html: false, heb: c.heb });
    // every field quoted (inner quotes doubled), so a note that starts with " or holds a line break can't merge rows
    lines.push([stripCantillation(c.heb), trn, meaning(c), (ro ? c.ro : c.en) || "", c.key ? store.note(c.key) : "", ref]
      .map(x => '"' + String(x).replace(/[\t\r\n]+/g, " ").replace(/"/g, '""') + '"').join("\t"));
  }
  download(ro ? "cuvinte-ebraice.tsv" : "hebrew-words.tsv", lines.join("\n"), "text/tab-separated-values");
}

function exportJson() {
  download(`mikra-backup-${dateKey(new Date())}.json`, JSON.stringify(store.data, null, 1), "application/json");
}

function importJson() {
  const inp = h("input", { type: "file", accept: ".json,application/json" });
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    const bad = tr("This file is not a Mikra backup.", "Fișierul acesta nu este o copie Mikra.");
    try {
      let data;
      try { data = JSON.parse(await f.text()); } catch (_) { throw new Error(bad); }
      const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
      // a Mikra backup always has its cards and settings; any other JSON file would wipe everything
      if (!isObj(data) || !isObj(data.cards) || !isObj(data.settings)) throw new Error(bad);
      const n = Object.keys(data.cards).length;
      const where = window.MikraAndroid ? tr("your Downloads folder", "dosarul Descărcări") : tr("the backups folder", "dosarul backups");
      modal(tr("Restore backup?", "Restaurezi copia?"), h("p", null, tr("This replaces your current data with the backup (", "Datele de acum vor fi înlocuite cu copia (") +
        trn(n, "card", "cards", "cartonaș", "cartonașe") + tr(`). A copy of your current data is kept in ${where} first.`, `). Înainte, o copie a datelor de acum se păstrează în ${where}.`)), [
        { label: tr("Cancel", "Renunță") },
        { label: tr("Restore", "Restaurează"), primary: true, onClick: async () => {
          if (!(await store.safetyCopy("restore"))) { toast(tr("Could not keep a copy of your current data, so nothing was changed.", "Nu s-a putut păstra o copie a datelor de acum, așa că nu s-a schimbat nimic."), 5000); return; }
          store.replaceAll(data);
          store.changed("restore"); // app.js rebuilds every tab; the backup keeps its own Bible choice
          toast(tr("Backup restored", "Copia a fost restaurată"));
        } },
      ]);
    } catch (e) { toast(e.message === bad ? bad : errText(e)); }
  };
  inp.click();
}
