// Read tab: the KJV or Cornilescu next to the Hebrew, hover links, word selection, link fixing, audio, saved verses.

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, toast, he, fmtInt, pct, fmtPct, heClass, heText, isPhone, isTouch, trt } from "./ui.js";
import { tr, trn, roDe, lang, bible, bibleName, meaning } from "./i18n.js";
import { unpack, display, morphRole, posClass, translit, wordTranslit, lemmaTranslit, speakableWord, verseSpeakable, glossClean, escapeHtml, latinToHebrew } from "./hebrew.js";
import { speak, stop as stopAudio } from "./audio.js";
import * as panel from "./wordpanel.js";

let root, mainEl, barEl, chapEl, panelEl, readerEl, tipEl;
let chap = null;            // { book, ch, raw, en, glossRo, verses: [state...] }
let selected = null;        // { vi, w }
let phrase = null;          // { vi, from, to }
let editing = null;         // { vi, active: [w,m] | null, dirty }
let playing = false;        // whole chapter
let followRun = 0;          // word-by-word playback; bumped to stop it
let loadSeq = 0;            // only the latest chapter request may render
let storeOff = null;
let phoneMq = null;         // the toolbar is rebuilt when the window crosses the phone width

export function mount(el) {
  root = el;
  readerEl = h("div", { class: "reader panel-closed" });
  mainEl = h("div", { class: "reader-main" });
  barEl = h("div", { class: "reader-bar" });
  chapEl = h("div", { class: "chapter" });
  panelEl = h("aside", { class: "panel", "aria-label": tr("Word study", "Studiul cuvântului") });
  tipEl = h("div", { class: "popover", style: { position: "fixed", pointerEvents: "none", display: "none", minWidth: "0", padding: "7px 10px", fontSize: "13.5px" } });
  mainEl.append(barEl, chapEl);
  readerEl.append(mainEl, panelEl);
  root.append(readerEl, tipEl);
  panel.init(panelEl, {
    onClose: () => { readerEl.classList.add("panel-closed"); clearSelection(); },
    onOpen: () => readerEl.classList.remove("panel-closed"),
    gotoRef: (b, c, v) => load(b, c, v, undefined, true),
    refreshMarks: () => refreshWordMarks(),
  });
  chap = null; selected = null; phrase = null; editing = null; playing = false;
  chapEl.addEventListener("mouseover", onOver);
  chapEl.addEventListener("mouseout", onOut);
  chapEl.addEventListener("click", onClick);
  chapEl.addEventListener("click", () => { tipEl.style.display = "none"; }, true);
  mainEl.addEventListener("scroll", () => { tipEl.style.display = "none"; }, { passive: true });
  document.addEventListener("keydown", onKey);
  phoneMq = window.matchMedia("(max-width: 760px)");
  phoneMq.addEventListener("change", onPhoneChange);
  storeOff = store.on((what, key) => {
    if (!chap) return;
    if (what === "settings") {
      if (key === "autoKnownDays") { refreshWordMarks(); return; }
      if (NO_RERENDER.has(key)) return;
      if (editing) finishEdit(true); // the verse is rebuilt, so unsaved link edits can't continue
      buildBar(); rerender();
    }
    if (what === "known" || what === "cards") { refreshWordMarks(); panel.refreshButtons(); }
    if (what === "saved") refreshSavedMarks();
  });
}

// Settings that don't change the reader's text: sizes are CSS variables, the rest belong to other tabs.
const NO_RERENDER = new Set(["heSize", "roSize", "theme", "themeLight", "themeDark", "themeOverrides", "heFont", "goalMinutes",
  "goalReviews", "voice", "audioEngine", "slowRate", "newPerDay", "reviewDirections", "autoplayWord",
  "practiceSide", "drillSides"]);

function onPhoneChange() {
  if (!chap) return;
  closePopover();
  buildBar();
}

// Android back button: close the open menu, link editing, verse tools or word panel, in that order.
export function back() {
  if (popEl) { closePopover(); return true; }
  if (editing) { finishEdit(true); return true; }
  const open = chapEl && chapEl.querySelector(".verse.tools-open");
  if (open) { open.classList.remove("tools-open"); return true; }
  if (readerEl && !readerEl.classList.contains("panel-closed")) { panel.close(); return true; }
  return false;
}

export function unmount() {
  if (phoneMq) phoneMq.removeEventListener("change", onPhoneChange);
  document.removeEventListener("keydown", onKey);
  if (storeOff) storeOff();
  closePopover();
  stopPlay();
  if (tipEl) tipEl.remove();
}

export function show(params = {}) {
  if (params.b !== undefined) {
    load(params.b, params.c || 1, params.v, params.w);
  } else if (!chap) {
    const p = store.data.pos || { b: 0, c: 1 };
    load(p.b, p.c, p.v);
  }
}

export function hide() {
  if (tipEl) tipEl.style.display = "none";
  closePopover();
  // the Stop button lives in the reader bar, so playback must not go on in another tab
  const wasPlaying = playing;
  stopPlay();
  if (wasPlaying && chap) buildBar();
}

// The Bible shown on the left. Falls back to Cornilescu when the database has no KJV.
function version() {
  return bible() === "kjv" && chap && chap.en ? "kjv" : "ro";
}

// ------------------------------------------------------------------ toolbar

function buildBar() {
  if (!chap) return;
  clear(barEl);
  if (isPhone()) return buildPhoneBar();
  const b = ctx.books[chap.book];
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea"), onchange: (e) => load(Number(e.target.value), 1) },
    ctx.books.map(x => h("option", { value: x.idx, selected: x.idx === chap.book }, ctx.bookName(x.idx))));
  const chSel = h("select", { "aria-label": tr("Chapter", "Capitolul"), onchange: (e) => load(chap.book, Number(e.target.value)) },
    Array.from({ length: b.chapters }, (_, i) => h("option", { value: i + 1, selected: i + 1 === chap.ch }, String(i + 1))));
  const search = h("input", { type: "search", class: "search", placeholder: tr("Search or go to Gen 1:1", "Caută sau mergi la Gen 1:1"), "aria-label": tr("Search", "Caută") });
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(search.value, search); });
  const ver = version();
  const verSeg = h("div", { class: "seg", role: "group", "aria-label": tr("Bible version", "Versiunea Bibliei") },
    ["kjv", "ro"].map(v => h("button", { type: "button", class: ver === v ? "on" : "", disabled: v === "kjv" && !chap.en,
      title: v === "kjv" ? tr("King James Version (English)", "King James Version (engleză)") : tr("Cornilescu (Romanian)", "Cornilescu (română)"),
      onclick: () => { if (store.settings.bible !== v) store.setting("bible", v); } }, bibleName(v))));
  const viewBtn = h("button", { class: "btn", type: "button", onclick: (e) => toggleViewPopover(e.currentTarget) }, icon("sliders"), tr("View", "Afișare"));
  const playBtn = h("button", { class: "btn", type: "button", onclick: () => togglePlay() }, icon(playing ? "stop" : "play"), playing ? tr("Stop", "Oprește") : tr("Listen", "Ascultă"));
  barEl.append(
    iconBtn("left", tr("Previous chapter", "Capitolul anterior"), () => step(-1)),
    h("div", { class: "ref-title" }, `${ctx.bookName(chap.book)} ${chap.ch}`, he(b.he, "")),
    iconBtn("right", tr("Next chapter", "Capitolul următor"), () => step(1)),
    bookSel, chSel, verSeg,
    h("div", { class: "spacer" }),
    search, viewBtn, playBtn,
  );
}

// Phone toolbar: one row. The book, chapter, search and Bible version sit behind the chapter title.
function buildPhoneBar() {
  const title = h("button", { class: "btn ref-btn", type: "button", "aria-label": tr("Go to", "Mergi la"), onclick: (e) => toggleNavPopover(e.currentTarget) },
    h("span", null, `${ctx.bookName(chap.book)} ${chap.ch}`), icon("chevron"));
  barEl.append(
    iconBtn("left", tr("Previous chapter", "Capitolul anterior"), () => step(-1)),
    title,
    iconBtn("right", tr("Next chapter", "Capitolul următor"), () => step(1)),
    h("div", { class: "spacer" }),
    iconBtn("search", tr("Search", "Caută"), (e) => toggleNavPopover(e.currentTarget, true)),
    iconBtn("sliders", tr("View", "Afișare"), (e) => toggleViewPopover(e.currentTarget)),
    iconBtn(playing ? "stop" : "play", playing ? tr("Stop", "Oprește") : tr("Listen", "Ascultă"), () => togglePlay(), { class: playing ? "on" : "" }),
  );
}

function toggleNavPopover(anchor, focusSearch) {
  if (popEl) { closePopover(); return; }
  const b = ctx.books[chap.book];
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea"), onchange: (e) => load(Number(e.target.value), 1) },
    ctx.books.map(x => h("option", { value: x.idx, selected: x.idx === chap.book }, ctx.bookName(x.idx))));
  const chSel = h("select", { "aria-label": tr("Chapter", "Capitolul"), onchange: (e) => load(chap.book, Number(e.target.value)) },
    Array.from({ length: b.chapters }, (_, i) => h("option", { value: i + 1, selected: i + 1 === chap.ch }, String(i + 1))));
  const search = h("input", { type: "search", class: "search", enterkeyhint: "search", placeholder: tr("Search or go to Gen 1:1", "Caută sau mergi la Gen 1:1"), "aria-label": tr("Search", "Caută") });
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(search.value, search); });
  const ver = version();
  const verSeg = h("div", { class: "seg full" }, ["kjv", "ro"].map(v => h("button", { type: "button", class: ver === v ? "on" : "", disabled: v === "kjv" && !chap.en,
    onclick: () => { closePopover(); if (store.settings.bible !== v) store.setting("bible", v); } },
    v === "kjv" ? tr("KJV (English)", "KJV (engleză)") : tr("Cornilescu (Romanian)", "Cornilescu (română)"))));
  openPopover(anchor, [
    h("h4", null, tr("Go to", "Mergi la")), h("div", { class: "row nav-row" }, bookSel, chSel),
    h("h4", null, tr("Search", "Caută")), h("div", { class: "row nav-row" }, search,
      h("button", { class: "btn", type: "button", onclick: () => doSearch(search.value, search) }, icon("search"))),
    h("h4", null, tr("Bible version", "Versiunea Bibliei")), verSeg,
  ]);
  if (focusSearch) search.focus();
}

function step(d) {
  let nb = chap.book, nc = chap.ch + d;
  if (nc < 1) { nb--; if (nb < 0) return; nc = ctx.books[nb].chapters; }
  else if (nc > ctx.books[nb].chapters) { nb++; if (nb >= ctx.books.length) return; nc = 1; }
  load(nb, nc);
}

let popEl = null;
function closePopover() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener("mousedown", outsidePop, true); } }
function outsidePop(e) {
  const t = e.target;
  if (!popEl || popEl.contains(t)) return;
  if (t && t.closest && t.closest(".reader-bar .btn, .reader-bar .icon-btn")) return;
  closePopover();
}

function openPopover(anchor, content) {
  closePopover();
  const r = anchor.getBoundingClientRect();
  popEl = h("div", { class: "popover" }, content);
  document.body.appendChild(popEl);
  const w = Math.max(320, popEl.offsetWidth);
  popEl.style.top = (r.bottom + 6) + "px";
  popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 12, r.right - w)) + "px";
  popEl.style.maxHeight = (window.innerHeight - r.bottom - 24) + "px";
  popEl.style.overflow = "auto";
  if (isPhone()) {
    // full width under the toolbar (the anchor may already be gone, e.g. the search box of a closed menu)
    const bar = barEl.getBoundingClientRect();
    Object.assign(popEl.style, { left: "8px", right: "8px", minWidth: "0", top: (Math.max(0, bar.bottom) + 6) + "px",
      maxHeight: (window.innerHeight - Math.max(0, bar.bottom) - 20) + "px" });
  }
  setTimeout(() => document.addEventListener("mousedown", outsidePop, true), 0);
}

function toggleViewPopover(anchor) {
  if (popEl) { closePopover(); return; }
  const s = store.settings;
  const chk = (key, label, hint) => h("label", { class: "check" },
    h("input", { type: "checkbox", checked: !!s[key], onchange: (e) => store.setting(key, e.target.checked) }),
    h("span", null, label, hint ? h("div", { class: "small muted" }, hint) : null));
  const seg = (key, opts) => h("div", { class: "seg" }, opts.map(([v, l]) =>
    h("button", { type: "button", class: s[key] === v ? "on" : "", onclick: (e) => { store.setting(key, v); for (const b of e.currentTarget.parentNode.children) b.classList.toggle("on", b === e.currentTarget); } }, l)));
  const sizeRow = (key, label, min, max) => h("label", { class: "field" }, h("span", null, label),
    h("input", { type: "range", min, max, value: s[key], oninput: (e) => store.setting(key, Number(e.target.value)) }));
  openPopover(anchor, [
    h("h4", null, tr("Hebrew", "Ebraica")),
    chk("cantillation", tr("Accent marks (cantillation)", "Accentele (cantilația)"), tr("Turn off to see only vowels", "Oprește-le ca să vezi doar vocalele")),
    chk("vowels", tr("Vowel points", "Vocalele (punctele)"), tr("Turn off to practice reading unpointed text", "Oprește-le ca să exersezi citirea fără vocale")),
    chk("interTranslit", tr("Pronunciation under each word", "Pronunția sub fiecare cuvânt")),
    chk("interGloss", tr("Meaning under each word", "Înțelesul sub fiecare cuvânt")),
    h("div", { class: "small muted", style: { margin: "2px 0 4px 26px" } }, tr("Show this help under:", "Arată ajutorul sub:")),
    h("div", { style: { marginLeft: "26px" } }, seg("helpScope", [["all", tr("All words", "Toate cuvintele")], ["unknown", tr("Words I don't know", "Cuvintele pe care nu le știu")]])),
    chk("colorMorph", tr("Color prefixes and suffixes", "Colorează prefixele și sufixele")),
    chk("colorNames", tr("Color names of people and places", "Colorează numele de oameni și locuri")),
    chk("colorPos", tr("Color verbs", "Colorează verbele")),
    chk("markUnknown", tr("Underline words I don't know yet", "Subliniază cuvintele pe care nu le știu încă")),
    chk("showLxx", tr("Show words added from the Greek Septuagint", "Arată cuvintele adăugate din Septuaginta greacă"), tr("A few places where translators restore words", "Câteva locuri unde traducătorii pun cuvinte la loc")),
    h("h4", null, tr("Bible text", "Textul Bibliei")),
    seg("romanian", [["show", tr("Show", "Arată")], ["blur", trt("Blur until hover", "Estompat până treci cu mouse-ul", "Blur until touched", "Estompat până îl atingi")], ["hide", tr("Hide", "Ascunde")]]),
    h("h4", null, tr("Layout", "Așezare")),
    seg("layout", [["side", tr("Side by side", "Alături")], ["stacked", tr("Hebrew above", "Ebraica deasupra")]]),
    sizeRow("heSize", tr("Hebrew size", "Mărimea ebraicii"), 18, 48),
    sizeRow("roSize", tr("Bible text size", "Mărimea textului"), 13, 24),
  ]);
}

let searchSeq = 0;          // only the latest search may open its results
async function doSearch(q, input) {
  q = q.trim();
  if (!q) return;
  const my = ++searchSeq;
  // typed with Latin keys but meant Hebrew? ("hc'" -> Hebrew) only when it starts with a Hebrew-looking mapping and has no vowels
  let res;
  try { res = await api.get("search", { q, t: version() }); } catch (e) { if (my === searchSeq) toast(tr("Search failed: ", "Căutarea nu a mers: ") + errText(e)); return; }
  if (my !== searchSeq) return;
  if (res.ref && !res.lemmas.length) { closePopover(); load(res.ref.book, res.ref.ch, res.ref.v); return; }
  const items = [];
  if (res.ref) items.push(h("div", { class: "occ", onclick: () => { closePopover(); load(res.ref.book, res.ref.ch, res.ref.v); } },
    h("b", null, tr("Go to ", "Mergi la ") + ctx.refText(res.ref.book, res.ref.ch, res.ref.v))));
  if (res.lemmas.length) {
    items.push(h("h4", null, tr("Words", "Cuvinte")));
    for (const l of res.lemmas.slice(0, 25)) {
      items.push(h("div", { class: "fam-row", onclick: () => { closePopover(); panel.openLemma(l.key); } },
        he(l.hebrew), h("span", { class: "g" }, meaning(l)), h("span", { class: "n" }, fmtInt(l.freq) + "×")));
    }
  }
  if (res.verses.length) {
    items.push(h("h4", null, `${tr("Verses", "Versete")} (${res.verses.length}${res.verses.length >= 60 ? "+" : ""})`));
    for (const v of res.verses) {
      items.push(h("div", { class: "occ", onclick: () => { closePopover(); load(v.book, v.ch, v.v); } },
        h("div", { class: "ref" }, ctx.refText(v.book, v.ch, v.v)), h("div", { html: highlightText(v.text, q) })));
    }
  }
  if (!items.length) {
    items.push(h("div", { class: "muted" }, tr(
      "Nothing found. Try an English or Romanian word, Hebrew letters, a Strong's number like H157, or a reference like Ps 23.",
      "Nu am găsit nimic. Încearcă un cuvânt în română sau engleză, litere ebraice, un număr Strong ca H157 sau o trimitere ca Ps 23.")));
    if (/^[a-z;,.]+$/i.test(q)) {
      const hq = latinToHebrew(q);
      items.push(h("button", { class: "btn small", type: "button", style: { marginTop: "8px" }, onclick: () => { input.value = hq; doSearch(hq, input); } },
        tr("Search the Hebrew letters ", "Caută literele ebraice "), he(hq)));
    }
  }
  openPopover(input, h("div", { style: { maxWidth: "460px" } }, items));
}

function highlightText(text, q) {
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Fold the text one character at a time and remember where each folded character came from, so the mark lands on
  // the right letters even when folding changes the length (accents typed as separate marks, İ, and so on).
  let t = "";
  const from = [];
  for (let k = 0; k < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(k));
    const f = norm(ch);
    for (let j = 0; j < f.length; j++) from.push(k);
    t += f;
    k += ch.length;
  }
  const nq = norm(q);
  const i = nq ? t.indexOf(nq) : -1;
  if (i < 0) return escapeHtml(text);
  const a = from[i];
  const last = from[i + nq.length - 1];
  let b = last + String.fromCodePoint(text.codePointAt(last)).length;
  while (b < text.length && !norm(text[b])) b++; // accents that belong to the last letter
  return escapeHtml(text.slice(0, a)) + "<mark>" + escapeHtml(text.slice(a, b)) + "</mark>" + escapeHtml(text.slice(b));
}

// ------------------------------------------------------------------ loading and rendering

export async function load(b, c, v, w, fromPanel) {
  closePopover();
  stopPlay();
  // positions can come from a restored backup or an old card, so make sure they are real numbers for a real book
  const int = (x) => (x === undefined || x === null || x === "") ? undefined : Number(x);
  b = int(b); c = int(c) || 1; v = int(v); w = int(w);
  if (!Number.isInteger(v) || v < 1) v = undefined;
  if (!Number.isInteger(w) || w < 0) w = undefined;
  if (!Number.isInteger(b) || !ctx.books[b] || !Number.isInteger(c) || c < 1 || c > ctx.books[b].chapters) {
    if (chap) return;
    b = 0; c = 1; v = undefined; w = undefined;
  }
  const seq = ++loadSeq;
  let data;
  try { data = await api.get("chapter", { b, c }); } catch (e) {
    if (seq !== loadSeq) return;
    toast(tr("Could not load that chapter: ", "Nu am putut deschide capitolul: ") + errText(e));
    if (!chap && !(b === 0 && c === 1)) load(0, 1);
    return;
  }
  if (seq !== loadSeq) return;
  // the word panel's arrows follow the selected word, which is gone in the new chapter
  const open = panel.kind();
  if (!fromPanel && (open === "word" || open === "phrase" || open === "verse")) panel.close();
  chap = { book: b, ch: c, raw: data.verses, en: data.en, glossRo: data.glossRo || {}, verses: [] };
  selected = null; phrase = null; editing = null;
  store.data.pos = { b, c, v: v || null };
  store.scheduleSave();
  buildBar();
  rerender();
  if (v) {
    const vi = chap.verses.findIndex(x => x.v === v);
    if (vi >= 0) {
      const el = chap.verses[vi].el;
      el.scrollIntoView({ block: "center" });
      el.classList.add("current");
      setTimeout(() => el.classList.remove("current"), 2200);
      if (w !== undefined && w !== null) selectWord(vi, w);
    } else {
      mainEl.scrollTop = 0;
      toast(tr(`Verse ${v} is not in this chapter`, `Versetul ${v} nu este în acest capitol`));
    }
  } else {
    mainEl.scrollTop = 0;
  }
}

function buildMaps(side) {
  side.tokTo = new Map(); side.morphTo = new Map(); side.wordTo = new Map();
  const L = side.links;
  for (let i = 0; i < L.length; i += 3) {
    const t = L[i], w = L[i + 1], m = L[i + 2];
    if (!side.tokTo.has(t)) side.tokTo.set(t, []);
    side.tokTo.get(t).push([w, m]);
    const k = w + "." + m;
    if (!side.morphTo.has(k)) side.morphTo.set(k, []);
    side.morphTo.get(k).push(t);
    if (!side.wordTo.has(w)) side.wordTo.set(w, new Set());
    side.wordTo.get(w).add(t);
  }
}

// Link fixes come from the user's file (or a restored backup): keep only triples that point at real words.
function validLinks(fix, auto, tok, words) {
  if (!Array.isArray(fix)) return (auto || []).slice();
  const out = [];
  const nTok = (tok || []).length / 2;
  for (let i = 0; i + 2 < fix.length; i += 3) {
    const t = fix[i], w = fix[i + 1], m = fix[i + 2];
    if (Number.isInteger(t) && Number.isInteger(w) && Number.isInteger(m) && t >= 0 && t < nTok && w >= 0 && w < words.length &&
      m >= 0 && m < words[w][0].split("/").length) out.push(t, w, m);
  }
  return out;
}

function makeSides(vrow, vi) {
  const v = vrow[0];
  const ro = { ver: "ro", text: vrow[2], tok: vrow[3], links: validLinks(store.alignFor(chap.book, chap.ch, v, "ro"), vrow[5], vrow[3], vrow[4]), italic: [] };
  buildMaps(ro);
  let en = null;
  const e = chap.en && chap.en[vi];
  if (e) {
    en = { ver: "kjv", text: e[0], tok: e[1], links: validLinks(store.alignFor(chap.book, chap.ch, v, "kjv"), e[2], e[1], vrow[4]), italic: e[3] || [] };
    buildMaps(en);
  }
  return { ro, en };
}

// Words of one Bible version linked to a Hebrew word (or a range of Hebrew words).
function linkedText(side, from, to = from) {
  if (!side) return "";
  const toks = new Set();
  for (let w = from; w <= to; w++) for (const t of side.wordTo.get(w) || []) toks.add(t);
  const sorted = [...toks].sort((a, b) => a - b);
  return sorted.map(i => side.text.slice(side.tok[i * 2], side.tok[i * 2 + 1])).join(" ");
}

// Meaning shown under a word / in the tooltip: English gloss, or Romanian from Cornilescu's words in this verse.
// Romanian helper words that the aligner sometimes attaches to the wrong Hebrew word (the "a" of "a făcut").
const RO_AUX = new Set(["a", "au", "am", "ai", "ați", "va", "vor", "voi", "vei", "vom", "veți", "să", "se", "s", "un", "o", "niște", "fost", "era", "este", "sunt"]);

function wordMeaning(vs, wi) {
  const w = vs.words[wi];
  if (lang() === "ro") {
    const isVerb = (w.codes[w.main] || "").slice(1, 2) === "V";
    let ctxWords = linkedText(vs.ro, wi);
    if (ctxWords && !isVerb) ctxWords = ctxWords.split(" ").filter(t => !RO_AUX.has(t.toLowerCase())).join(" ");
    if (w.lemma === "H0853") ctxWords = "";
    if (ctxWords) return ctxWords;
    if (chap.glossRo[w.lemma]) return chap.glossRo[w.lemma];
  }
  return glossClean(w.gloss.join(" "));
}

function rerender() {
  const s = store.settings;
  const scroll = mainEl.scrollTop;
  clear(chapEl);
  chapEl.className = "chapter" + (s.layout === "stacked" ? " layout-stacked" : "") +
    (s.interTranslit || s.interGloss ? " interlinear" : "") + (s.colorMorph ? " col-morph" : "") +
    (s.colorPos ? " col-pos" : "") + (s.colorNames ? " col-names" : "") + (s.showLxx ? " show-lxx" : "") +
    (s.helpScope === "unknown" ? " help-unknown" : "");
  const ver = version();
  chapEl.append(h("div", { class: "chapter-head" },
    h("div", null, ver === "kjv" ? tr("King James Version (English)", "King James Version (engleză)") : tr("Cornilescu (Romanian)", "Cornilescu (română)")),
    h("div"), h("div", { class: "h-col" }, tr("Hebrew (Leningrad Codex)", "Ebraica (Codex Leningrad)"))));
  const known = store.knownKeys();
  chap.verses = chap.raw.map((vrow, vi) => {
    const sides = makeSides(vrow, vi);
    const vs = { v: vrow[0], vid: vrow[1], words: vrow[4].map(unpack), vi, ro: sides.ro, en: sides.en };
    vs.side = ver === "kjv" && sides.en ? sides.en : sides.ro;
    vs.el = renderVerse(vs, known);
    chapEl.append(vs.el);
    return vs;
  });
  chapEl.append(renderFoot());
  if (selected) markSelected();
  mainEl.scrollTop = scroll;
}

function isUnknownWord(w, known) {
  return w.lemma && !/^H9/.test(w.lemma) && !w.codes[w.main].includes("Np") && !known.has(w.lemma);
}

function renderVerse(vs, known) {
  const s = store.settings;
  const row = h("div", { class: "verse", dataset: { vi: vs.vi } });
  // Bible translation
  const side = vs.side;
  const italic = new Set(side.italic || []);
  const sideEl = h("div", { class: "ro" + (s.romanian === "blur" ? " blur" : s.romanian === "hide" ? " hide" : ""), lang: side.ver === "kjv" ? "en" : "ro" });
  vs.sideEls = [];
  let pos = 0;
  for (let i = 0; i < side.tok.length; i += 2) {
    const a = side.tok[i], b = side.tok[i + 1];
    if (a > pos) sideEl.append(side.text.slice(pos, a));
    const sp = h("span", { class: "rt" + (italic.has(i / 2) ? " added" : ""), dataset: { t: i / 2 } }, side.text.slice(a, b));
    if (italic.has(i / 2)) sp.title = tr("Added by the translators (italic in the KJV)", "Adăugat de traducători (cursiv în KJV)");
    vs.sideEls.push(sp);
    sideEl.append(sp);
    pos = b;
  }
  if (pos < side.text.length) sideEl.append(side.text.slice(pos));
  if (!side.text) sideEl.append(h("span", { class: "faint small" }, tr("(no text for this verse)", "(fără text la acest verset)")));
  // Hebrew (always print: the Bible text keeps its vowels and accents)
  const hc = h("div", { class: "hcol", lang: "he", dir: "rtl" });
  vs.wordEls = []; vs.morphEls = [];
  vs.words.forEach((w, wi) => {
    const cls = ["hw", posClass(w.codes[w.main])];
    if (w.extra.x === "X") cls.push("lxx");
    if (w.extra.ti) cls.push("title");
    const unknown = isUnknownWord(w, known);
    if (s.markUnknown && unknown) cls.push("unknown");
    if (unknown) cls.push("help");
    const wordEl = h("span", { class: cls.join(" "), dataset: { w: wi } });
    const hx = h("span", { class: "hx" });
    const mEls = w.morphs.map((m, mi) => {
      const el = h("span", { class: "hm " + morphRole(w, mi), dataset: { m: mi } }, display(m, s));
      hx.append(el);
      return el;
    });
    wordEl.append(hx);
    if (s.interTranslit) wordEl.append(h("span", { class: "il tr", html: translit(wordTranslit(w, s), s, { heb: w.text }) }));
    if (s.interGloss) wordEl.append(h("span", { class: "il" }, wordMeaning(vs, wi)));
    vs.wordEls.push(wordEl); vs.morphEls.push(mEls);
    hc.append(wordEl);
    const p = w.punct;
    if (p) {
      // a few verses keep the rest of a split word here (Gen 14:17, 1 Chr 27:12, Neh 2:13), so split into tokens
      let space = false;
      for (const ch of p.split(/(־|׃|׀|\s+)/).filter(Boolean)) {
        if (/^\s+$/.test(ch)) { space = true; continue; }
        if (ch === "־") hc.append(h("span", { class: "punct" }, display(ch, s)));
        else if (ch === "׃") hc.append(h("span", { class: "punct" }, ch));
        else if (ch === "׀") hc.append(h("span", { class: "punct" }, s.cantillation ? " " + ch : ""));
        else if (ch === "ס" || ch === "פ") hc.append(h("span", { class: "punct para", title: ch === "פ" ? tr("Open paragraph mark ({petucha})", "Semn de paragraf deschis ({petucha})") : tr("Closed paragraph mark (setuma)", "Semn de paragraf închis (setuma)") }, ch));
        else if (/[\u05D0-\u05EA]/.test(ch)) hc.append(space ? " " : "", h("span", { class: "punct" }, display(ch, s)));
        space = false;
      }
    }
    if (!p.endsWith("־")) hc.append(" ");
  });
  // on a phone there is no hover: tapping the verse number shows the verse's buttons (listen, save, copy...)
  const num = h("div", { class: "vnum" }, h("button", { type: "button", title: tr("Listen to this verse", "Ascultă versetul"), onclick: () => isPhone() ? toggleTools(vs) : playVerse(vs) }, String(vs.v)));
  const saved = store.isSaved(chap.book, chap.ch, vs.v);
  vs.saveBtn = iconBtn("star", saved ? trt("Saved verse (click to remove)", "Verset salvat (apasă ca să-l scoți)") : tr("Save this verse to memorize", "Salvează versetul ca să-l înveți pe de rost"),
    () => { const on = store.toggleSaved(chap.book, chap.ch, vs.v); toast(on ? tr("Verse saved. Practice it in My words, Saved verses.", "Verset salvat. Îl exersezi în Cuvintele mele, Versete salvate.") : tr("Verse removed from saved", "Versetul a fost scos din cele salvate")); },
    { class: saved ? "on" : "" });
  const tools = h("div", { class: "verse-tools" },
    iconBtn("speaker", tr("Listen", "Ascultă"), () => playVerse(vs)),
    iconBtn("slow", tr("Listen slowly", "Ascultă rar"), () => playVerse(vs, true)),
    iconBtn("follow", tr("Word by word, with highlighting", "Cuvânt cu cuvânt, cu evidențiere"), () => followAlong(vs)),
    iconBtn("layers", tr("Take this verse apart, word by word", "Desface versetul, cuvânt cu cuvânt"), () => breakdown(vs)),
    vs.saveBtn,
    iconBtn("link", tr("Fix word links in this verse", "Corectează legăturile din acest verset"), () => startEdit(vs.vi)),
    iconBtn("copy", tr("Copy verse", "Copiază versetul"), () => copyVerse(vs)),
  );
  if (saved) row.classList.add("saved");
  row.append(sideEl, num, hc, tools);
  return row;
}

function toggleTools(vs) {
  for (const el of chapEl.querySelectorAll(".verse.tools-open")) if (el !== vs.el) el.classList.remove("tools-open");
  vs.el.classList.toggle("tools-open");
}

function refreshWordMarks() {
  if (!chap) return;
  const s = store.settings;
  const known = store.knownKeys();
  for (const vs of chap.verses) {
    vs.words.forEach((w, wi) => {
      const unknown = isUnknownWord(w, known);
      vs.wordEls[wi].classList.toggle("unknown", !!(s.markUnknown && unknown));
      vs.wordEls[wi].classList.toggle("help", !!unknown);
    });
  }
  const body = chapEl.querySelector(".chapter-foot .vocab-body");
  if (body && lastVocab && lastVocab.key === `${chap.book}.${chap.ch}`) {
    const keep = mainEl.scrollTop;
    fillVocab(body, lastVocab.res);
    mainEl.scrollTop = keep;
    return;
  }
  const foot = chapEl.querySelector(".chapter-foot");
  if (foot) foot.replaceWith(renderFoot());
}

function refreshSavedMarks() {
  if (!chap) return;
  for (const vs of chap.verses) {
    const on = store.isSaved(chap.book, chap.ch, vs.v);
    vs.el.classList.toggle("saved", on);
    if (vs.saveBtn) vs.saveBtn.classList.toggle("on", on);
  }
}

// ------------------------------------------------------------------ chapter footer

let lastVocab = null;       // { key, res }: the last chapter_vocab answer, so marking a word doesn't reload the table
function renderFoot() {
  const foot = h("div", { class: "chapter-foot" });
  const key = `${chap.book}.${chap.ch}`;
  const read = store.data.read[key];
  const label = () => store.data.read[key] ? tr("Read", "Citit") : tr("Mark chapter as read", "Marchează capitolul ca citit");
  const markBtn = h("button", { class: "btn" + (read ? " on" : ""), type: "button", onclick: () => {
    if (store.data.read[key]) delete store.data.read[key]; else store.data.read[key] = Date.now();
    store.changed("read");
    markBtn.classList.toggle("on", !!store.data.read[key]);
    markBtn.lastChild.textContent = label();
  } }, icon("check"), label());
  foot.append(h("div", { class: "row" }, h("h2", { style: { margin: "0" } }, tr("Words in this chapter", "Cuvintele din acest capitol")), h("div", { class: "spacer" }), markBtn));
  const body = h("div", { class: "vocab-body" }, h("div", { class: "muted small" }, tr("Loading…", "Se încarcă…")));
  foot.append(body);
  foot.append(h("div", { class: "chapter-nav" },
    h("button", { class: "btn", type: "button", onclick: () => step(-1) }, icon("left"), tr("Previous chapter", "Capitolul anterior")),
    h("button", { class: "btn primary", type: "button", onclick: () => step(1) }, tr("Next chapter", "Capitolul următor"), icon("right"))));
  api.get("chapter_vocab", { b: chap.book, c: chap.ch }).then(res => { lastVocab = { key, res }; fillVocab(body, res); }).catch(() => clear(body));
  return foot;
}

function fillVocab(body, res) {
  clear(body);
  const known = store.knownKeys();
  let knownTok = 0;
  const items = res.items;
  for (const it of items) if (known.has(it.key)) knownTok += it.inChapter;
  const cov = pct(knownTok, res.tokens);
  const unknown = items.filter(it => !known.has(it.key));
  const notCarded = unknown.filter(it => !store.hasCard("L:" + it.key));
  body.append(
    h("p", { class: "muted" },
      trn(items.length, "different word", "different words", "cuvânt diferit", "cuvinte diferite") + ", " +
      trn(res.tokens, "word in total", "words in total", "cuvânt în total", "cuvinte în total") +
      tr(`. You know ${fmtPct(knownTok, res.tokens)}% of the words in this chapter.`, `. Știi ${fmtPct(knownTok, res.tokens)}% din cuvintele acestui capitol.`)),
    h("div", { class: "meter", style: { maxWidth: "420px", marginBottom: "14px" } }, h("i", { style: { width: cov + "%" } })),
  );
  const addTop = h("button", { class: "btn primary", type: "button", disabled: !notCarded.length, onclick: () => {
    const n = store.addCards(notCarded.slice(0, 10).map(cardFromItem));
    toast(tr("Added ", "Am adăugat ") + trn(n, "word", "words", "cuvânt", "cuvinte") + tr(" to review", " la recapitulare"));
    refreshWordMarks();
  } }, icon("plus"), tr("Add the 10 most common new words", "Adaugă cele mai folosite 10 cuvinte noi"));
  const addAll = h("button", { class: "btn", type: "button", disabled: notCarded.length <= 10, onclick: () => {
    const n = store.addCards(notCarded.map(cardFromItem));
    toast(tr("Added ", "Am adăugat ") + trn(n, "word", "words", "cuvânt", "cuvinte") + tr(" to review", " la recapitulare"));
    refreshWordMarks();
  } }, icon("plus"), tr(`Add all ${notCarded.length} new words`, `Adaugă toate cele ${notCarded.length} ${notCarded.length === 1 ? "cuvânt nou" : roDe(notCarded.length) + "cuvinte noi"}`));
  const practice = h("button", { class: "btn", type: "button", title: tr("A quick game with the words of this chapter, before or after you read it", "Un joc scurt cu cuvintele acestui capitol, înainte sau după ce îl citești"),
    onclick: () => ctx.navigate("review", { practice: "choice", source: "chapter" }) }, icon("cards"), tr("Practise these words", "Exersează cuvintele"));
  body.append(h("div", { class: "row", style: { marginBottom: "10px" } }, addTop, addAll, practice,
    h("span", { class: "small muted" }, tr("The most common words in the whole Old Testament come first, so every word you learn pays off often.",
      "Întâi vin cuvintele cele mai folosite din tot Vechiul Testament, ca fiecare cuvânt învățat să te ajute des."))));
  const table = h("table", { class: "vocab-table" },
    h("thead", null, h("tr", null, h("th", null, tr("Word", "Cuvânt")), h("th", null, tr("Sound", "Pronunție")), h("th", null, tr("Meaning", "Înțeles")),
      h("th", { title: tr("Times in the Old Testament", "De câte ori apare în Vechiul Testament") }, tr("OT", "VT")),
      h("th", { title: tr("Times in this chapter", "De câte ori apare în acest capitol") }, tr("Here", "Aici")), h("th"))));
  const tb = h("tbody");
  const list = unknown.concat(items.filter(it => known.has(it.key)));
  for (const it of list.slice(0, 80)) {
    const isKnown = known.has(it.key);
    const hasCard = store.hasCard("L:" + it.key);
    tb.append(h("tr", { style: isKnown ? { opacity: ".55" } : null },
      h("td", { class: "he" + heClass(), lang: "he", style: { cursor: "pointer" }, onclick: () => panel.openLemma(it.key) }, heText(it.hebrew)),
      h("td", { html: translit(lemmaTranslit(it.translit, it.key, store.settings), store.settings, { heb: it.hebrew }) }),
      h("td", null, meaning(it)),
      h("td", { class: "small muted" }, fmtInt(it.freq)),
      h("td", { class: "small muted" }, String(it.inChapter)),
      h("td", { class: "nowrap" },
        hasCard ? h("span", { class: "pill review" }, tr("in review", "în recapitulare")) : h("button", { class: "btn small", type: "button", onclick: (e) => { store.addCard(cardFromItem(it)); e.currentTarget.replaceWith(h("span", { class: "pill review" }, tr("in review", "în recapitulare"))); } }, tr("Add", "Adaugă")),
        " ",
        h("button", { class: "btn small" + (isKnown ? " on" : ""), type: "button", onclick: () => { store.toggleKnown(it.key); } }, isKnown ? tr("Known", "Știut") : tr("I know it", "Îl știu")))));
  }
  table.append(tb);
  body.append(table);
  if (list.length > 80) body.append(h("p", { class: "small muted" }, tr(`Showing 80 of ${list.length}.`, `Se arată 80 din ${list.length}.`)));
}

// A flashcard for a dictionary word from this chapter, with its first verse here as context (or verse vi, if it is there).
function cardFromItem(it, vi) {
  let ctxRef = null, roCtx = "", enCtx = "";
  const order = vi !== undefined && chap.verses[vi] ? [chap.verses[vi], ...chap.verses] : chap.verses;
  for (const vs of order) {
    const wi = vs.words.findIndex(w => w.lemma === it.key);
    if (wi >= 0) {
      ctxRef = { b: chap.book, c: chap.ch, v: vs.v, w: wi, form: vs.words[wi].text };
      roCtx = linkedText(vs.ro, wi); enCtx = linkedText(vs.en, wi);
      break;
    }
  }
  return { id: "L:" + it.key, kind: "lemma", key: it.key, heb: it.hebrew, translit: it.translit, gloss: it.gloss,
    glossRo: it.glossRo || "", ro: roCtx, en: enCtx, ctx: ctxRef };
}

// ------------------------------------------------------------------ hover

let hl = [];
function clearHl() { for (const el of hl) el.classList.remove("lk"); hl = []; }
function mark(el) { if (el) { el.classList.add("lk"); hl.push(el); } }

function verseOf(el) {
  const row = el && el.closest ? el.closest(".verse") : null;
  return row && chap ? chap.verses[Number(row.dataset.vi)] : null;
}

function onOver(e) {
  const t = e.target;
  const rt = t.closest(".rt");
  const hw = t.closest(".hw");
  if (!rt && !hw) return;
  const vs = verseOf(t);
  if (!vs) return;
  if (editing && editing.vi === vs.vi) return;
  clearHl();
  const side = vs.side;
  if (rt) {
    const i = Number(rt.dataset.t);
    mark(rt);
    for (const [w, m] of side.tokTo.get(i) || []) {
      const word = vs.words[w];
      if (word.morphs.length > 1) mark(vs.morphEls[w][m]);
      else mark(vs.wordEls[w]);
      for (const ti of side.morphTo.get(w + "." + m) || []) mark(vs.sideEls[ti]);
    }
  } else {
    const w = Number(hw.dataset.w);
    const hm = t.closest(".hm");
    const word = vs.words[w];
    const ctrlMorph = hm && word.morphs.length > 1 && (e.altKey || hm.classList.contains("pre") || hm.classList.contains("suf"));
    if (ctrlMorph) {
      const m = Number(hm.dataset.m);
      mark(hm);
      for (const ti of side.morphTo.get(w + "." + m) || []) mark(vs.sideEls[ti]);
    } else {
      mark(hw);
      for (const ti of side.wordTo.get(w) || []) mark(vs.sideEls[ti]);
    }
    if (!isTouch()) showTip(hw, vs, w); // a tap opens the word panel, which says the same
  }
}

function onOut(e) {
  const to = e.relatedTarget;
  if (to && (to.closest && (to.closest(".rt") || to.closest(".hw")))) return;
  clearHl();
  tipEl.style.display = "none";
  if (editing && chap) showEditState(chap.verses[editing.vi]);
}

function showTip(anchor, vs, wi) {
  const s = store.settings;
  const w = vs.words[wi];
  if (s.interTranslit && s.interGloss && (s.helpScope !== "unknown" || anchor.classList.contains("help"))) { tipEl.style.display = "none"; return; }
  tipEl.innerHTML = `<div style="font-size:15px">${translit(wordTranslit(w, s), s, { heb: w.text })}</div><div class="muted">${escapeHtml(wordMeaning(vs, wi))}</div>`;
  tipEl.style.display = "block";
  const r = anchor.getBoundingClientRect();
  const tw = tipEl.offsetWidth;
  tipEl.style.left = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2)) + "px";
  tipEl.style.top = Math.max(6, r.top - tipEl.offsetHeight - 6) + "px";
}

// ------------------------------------------------------------------ clicks and selection

function onClick(e) {
  const t = e.target;
  const vs = verseOf(t);
  if (!vs) return;
  const hw = t.closest(".hw");
  const rt = t.closest(".rt");
  if (editing && editing.vi === vs.vi) { editClick(vs, t); return; }
  if (hw) {
    const w = Number(hw.dataset.w);
    if (e.shiftKey && selected && selected.vi === vs.vi) { selectPhrase(vs.vi, selected.w, w); return; }
    selectWord(vs.vi, w);
  } else if (rt) {
    const i = Number(rt.dataset.t);
    const links = vs.side.tokTo.get(i) || [];
    if (!links.length) { toast(tr("This word is not linked to a Hebrew word. Use the link button on the verse to connect it.", "Cuvântul acesta nu e legat de un cuvânt ebraic. Folosește butonul de legături al versetului ca să-l legi.")); return; }
    selectWord(vs.vi, links[0][0]);
  }
}

function clearSelection() {
  if (!chap) return;
  for (const el of chapEl.querySelectorAll(".hw.sel, .hw.phrase")) el.classList.remove("sel", "phrase");
  selected = null; phrase = null;
}

function markSelected() {
  for (const el of chapEl.querySelectorAll(".hw.sel, .hw.phrase")) el.classList.remove("sel", "phrase");
  if (!selected) return;
  const vs = chap.verses[selected.vi];
  if (phrase) {
    for (let w = phrase.from; w <= phrase.to; w++) vs.wordEls[w].classList.add("phrase");
  } else {
    vs.wordEls[selected.w] && vs.wordEls[selected.w].classList.add("sel");
  }
}

export function selectWord(vi, w, back) {
  if (!chap) return;
  const vs = chap.verses[vi];
  if (!vs || !vs.words[w]) return;
  selected = { vi, w }; phrase = null;
  markSelected();
  panel.openWord({
    book: chap.book, ch: chap.ch, v: vs.v, vs, w,
    sideName: bibleName(vs.side.ver),
    sideLinked: linkedText(vs.side, w),
    roLinked: linkedText(vs.ro, w),
    enLinked: linkedText(vs.en, w),
    glossRo: chap.glossRo[vs.words[w].lemma] || "",
    onNextWord: () => moveSel(1), onPrevWord: () => moveSel(-1),
    back,
  });
  if (store.settings.autoplayWord) speak(speakableWord(vs.words[w], store.settings));
  if (isPhone()) keepAboveSheet(vs.wordEls[w]);
}

// On a phone the word panel covers the lower part of the screen; scroll the chosen word up so it stays visible.
function keepAboveSheet(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect(), m = mainEl.getBoundingClientRect();
    const sheetTop = panelEl.getBoundingClientRect().top || (m.top + m.height * 0.38);
    if (r.top < m.top + 48 || r.bottom > sheetTop - 8) mainEl.scrollTop += r.top - (m.top + 56);
  });
}

// "Take this verse apart": the word panel shows the whole verse, word by word and part by part.
function breakdown(vs) {
  if (!chap || !vs.el.isConnected) return;
  clearSelection();
  for (const el of chapEl.querySelectorAll(".verse.tools-open")) el.classList.remove("tools-open");
  const myChap = chap;
  panel.openVerse({
    book: chap.book, ch: chap.ch, v: vs.v, vs,
    sideName: bibleName(vs.side.ver), sideText: vs.side.text, sideLang: vs.side.ver === "kjv" ? "en" : "ro",
    meanings: vs.words.map((_, wi) => wordMeaning(vs, wi)),
    isNew: (wi) => isUnknownWord(vs.words[wi], store.knownKeys()) && !store.hasCard("L:" + vs.words[wi].lemma),
    // back to the verse as it is now: a change of View redraws the chapter, and the old verse element is gone
    onWord: (wi) => { if (chap === myChap) selectWord(vs.vi, wi, () => { if (chap === myChap && chap.verses[vs.vi]) breakdown(chap.verses[vs.vi]); }); },
    addNew: async () => {
      const known = store.knownKeys();
      const keys = [...new Set(vs.words.filter(w => w.extra.x !== "X" && isUnknownWord(w, known) && !store.hasCard("L:" + w.lemma)).map(w => w.lemma))];
      if (!keys.length) return 0;
      const brief = await api.post("lemma_brief", { keys });
      if (chap !== myChap) return 0;
      const n = store.addCards(keys.map(k => brief[k]).filter(Boolean).map(it => cardFromItem(it, vs.vi)));
      refreshWordMarks();
      return n;
    },
  });
  vs.el.classList.add("current");
  setTimeout(() => vs.el.classList.remove("current"), 1600);
  if (isPhone()) keepAboveSheet(vs.el);
}

function selectPhrase(vi, a, b) {
  const vs = chap.verses[vi];
  const from = Math.min(a, b), to = Math.max(a, b);
  phrase = { vi, from, to };
  markSelected();
  panel.openPhrase({ book: chap.book, ch: chap.ch, v: vs.v, words: vs.words.slice(from, to + 1), from, to,
    sideName: bibleName(vs.side.ver), sideText: linkedText(vs.side, from, to),
    roText: linkedText(vs.ro, from, to), enText: linkedText(vs.en, from, to),
    wordMeanings: vs.words.slice(from, to + 1).map((_, i) => wordMeaning(vs, from + i)) });
}

function moveSel(d) {
  if (!selected) return;
  let { vi, w } = selected;
  w += d;
  while (vi >= 0 && vi < chap.verses.length) {
    const vs = chap.verses[vi];
    if (w >= 0 && w < vs.words.length) {
      if (vs.words[w].extra.x === "X" && !store.settings.showLxx) { w += d; continue; }
      selectWord(vi, w);
      vs.wordEls[w].scrollIntoView({ block: "nearest" });
      return;
    }
    vi += d > 0 ? 1 : -1;
    if (vi < 0 || vi >= chap.verses.length) return;
    w = d > 0 ? 0 : chap.verses[vi].words.length - 1;
  }
}

function onKey(e) {
  const view = document.getElementById("view-read");
  if (!view || view.hidden || !chap) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape") {
    if (editing) { finishEdit(true); return; }
    panel.close();
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft" && selected) { moveSel(1); e.preventDefault(); }
  else if (e.key === "ArrowRight" && selected) { moveSel(-1); e.preventDefault(); }
  else if (e.key === "[") step(-1);
  else if (e.key === "]") step(1);
  else if (e.key === " " && selected) { e.preventDefault(); const vs = chap.verses[selected.vi]; speak(speakableWord(vs.words[selected.w], store.settings)); }
  else if (e.key === "a" || e.key === "k") panel.shortcut(e.key); // works for any open word, not only one picked in the text
}

// ------------------------------------------------------------------ fixing links

function startEdit(vi) {
  if (editing) finishEdit(true);
  const vs = chap.verses[vi];
  if (!vs.words.length || !vs.side.tok.length) return;
  editing = { vi, active: null, dirty: false, reset: false, original: vs.side.links.slice() };
  vs.el.classList.add("editing");
  clearHl();
  const hint = h("div", { class: "edit-hint" },
    h("div", null, tr(`Click a Hebrew word part, then click the ${bibleName(vs.side.ver)} words that translate it. Click a word again to unlink it.`,
      `Apasă pe o parte a unui cuvânt ebraic, apoi pe cuvintele din ${bibleName(vs.side.ver)} care o traduc. Apasă din nou pe un cuvânt ca să-l dezlegi.`)),
    h("div", { class: "row", style: { marginTop: "6px" } },
      h("button", { class: "btn small primary", type: "button", onclick: () => finishEdit(false) }, tr("Done", "Gata")),
      h("button", { class: "btn small", type: "button", onclick: () => finishEdit(true) }, tr("Cancel", "Renunță")),
      h("button", { class: "btn small", type: "button", onclick: () => resetEdit(vs) }, tr("Use automatic links", "Folosește legăturile automate")),
      h("button", { class: "btn small", type: "button", onclick: () => { vs.side.links = []; buildMaps(vs.side); editing.dirty = true; editing.reset = false; showEditState(vs); } }, tr("Clear all", "Șterge tot"))));
  vs.el.append(hint);
  editing.hint = hint;
}

function editClick(vs, t) {
  const hm = t.closest(".hm");
  const rt = t.closest(".rt");
  if (hm) {
    const w = Number(hm.closest(".hw").dataset.w), m = Number(hm.dataset.m);
    editing.active = [w, m];
    showEditState(vs);
  } else if (rt && editing.active) {
    const ti = Number(rt.dataset.t);
    const [w, m] = editing.active;
    const L = vs.side.links;
    let found = -1;
    for (let i = 0; i < L.length; i += 3) if (L[i] === ti && L[i + 1] === w && L[i + 2] === m) { found = i; break; }
    if (found >= 0) L.splice(found, 3); else L.push(ti, w, m);
    buildMaps(vs.side);
    editing.dirty = true;
    editing.reset = false;
    showEditState(vs);
  } else if (rt) {
    toast(trt("First click the Hebrew word part you want to link.", "Întâi apasă pe partea cuvântului ebraic pe care vrei s-o legi."));
  }
}

function showEditState(vs) {
  clearHl();
  for (const el of vs.el.querySelectorAll(".edit-src")) el.classList.remove("edit-src");
  if (!editing.active) return;
  const [w, m] = editing.active;
  vs.morphEls[w][m].classList.add("edit-src");
  for (const ti of vs.side.morphTo.get(w + "." + m) || []) mark(vs.sideEls[ti]);
}

function resetEdit(vs) {
  const vi = vs.vi;
  const raw = vs.side.ver === "kjv" ? ((chap.en && chap.en[vi] && chap.en[vi][2]) || []) : (chap.raw[vi][5] || []);
  vs.side.links = raw.slice();
  buildMaps(vs.side);
  // saved on Done, so Cancel can still bring back the user's own fixes
  editing.dirty = true;
  editing.reset = true;
  showEditState(vs);
  toast(tr("Automatic links shown. Press Done to keep them.", "Se arată legăturile automate. Apasă Gata ca să le păstrezi."));
}

function finishEdit(cancel) {
  if (!editing) return;
  const vs = chap.verses[editing.vi];
  if (cancel) { vs.side.links = editing.original; buildMaps(vs.side); }
  else if (editing.dirty) { store.setAlign(chap.book, chap.ch, vs.v, editing.reset ? null : vs.side.links.slice(), vs.side.ver); toast(tr("Links saved for this verse", "Legăturile au fost salvate pentru acest verset")); }
  vs.el.classList.remove("editing");
  for (const el of vs.el.querySelectorAll(".edit-src")) el.classList.remove("edit-src");
  if (editing.hint) editing.hint.remove();
  editing = null;
  clearHl();
}

// ------------------------------------------------------------------ audio

async function playVerse(vs, slow) {
  stopPlay();
  const run = followRun; // stopPlay() bumped it; a newer play of this verse must keep its highlight
  vs.el.classList.add("current");
  await speak(verseSpeakable(vs.words, store.settings), { slow });
  if (run === followRun) vs.el.classList.remove("current");
}

// Plays the verse one word at a time and lights up each word, so you can follow (and repeat) along.
async function followAlong(vs) {
  stopPlay();
  const run = ++followRun;
  vs.el.classList.add("current");
  for (let wi = 0; wi < vs.words.length; wi++) {
    const w = vs.words[wi];
    if (w.extra.x === "X" && !store.settings.showLxx) continue;
    if (run !== followRun || !chap || !vs.el.isConnected) break;
    const text = speakableWord(w, store.settings);
    if (!text) continue; // a few qere words have no letters of their own
    const el = vs.wordEls[wi];
    el.classList.add("speaking");
    for (const ti of vs.side.wordTo.get(wi) || []) vs.sideEls[ti].classList.add("speaking");
    const ok = await speak(text);
    el.classList.remove("speaking");
    for (const ti of vs.side.wordTo.get(wi) || []) vs.sideEls[ti].classList.remove("speaking");
    if (!ok || run !== followRun) break;
    await new Promise(r => setTimeout(r, 180));
  }
  if (run === followRun) vs.el.classList.remove("current");
}

function stopPlay() {
  followRun++;
  if (playing) { playing = false; }
  stopAudio();
  if (chap) for (const vs of chap.verses || []) {
    if (!vs.el) continue;
    vs.el.classList.remove("current");
    for (const el of vs.el.querySelectorAll(".speaking")) el.classList.remove("speaking");
  }
}

async function togglePlay() {
  if (playing) { stopPlay(); buildBar(); return; }
  stopPlay();
  playing = true;
  buildBar();
  const startVi = selected ? selected.vi : 0;
  const myChap = chap;
  for (let vi = startVi; vi < chap.verses.length && playing && chap === myChap; vi++) {
    const vs = chap.verses[vi];
    vs.el.classList.add("current");
    vs.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const ok = await speak(verseSpeakable(vs.words, store.settings), { aborted: () => !playing });
    vs.el.classList.remove("current");
    if (!ok) break;
  }
  playing = false;
  if (chap === myChap) buildBar();
}

function copyVerse(vs) {
  // keep the sof pasuq, paragraph marks and paseq (with a space before it, as shown in the reader)
  const heb = vs.words.filter(w => w.extra.x !== "X").map(w => w.text + w.punct.replace(/׀/g, " ׀") + (w.punct.endsWith("־") ? "" : " ")).join("").trim();
  const text = `${ctx.refText(chap.book, chap.ch, vs.v)} (${bibleName(vs.side.ver)})\n${vs.side.text}\n${heb}`;
  const done = () => toast(tr("Verse copied", "Versetul a fost copiat")), failed = () => toast(tr("Copy failed", "Nu s-a putut copia"));
  // inside the Android app the phone's clipboard is reached through the app (the page's own clipboard access may be blocked)
  const bridge = window.MikraAndroid;
  if (bridge && bridge.copyText) { try { if (bridge.copyText(text)) done(); else failed(); } catch (_) { failed(); } return; }
  if (!navigator.clipboard) { failed(); return; }
  navigator.clipboard.writeText(text).then(done, failed);
}

export function currentChapter() { return chap; }
