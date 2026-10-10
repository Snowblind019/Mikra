// My words: every saved card, every word marked as known, saved verses with a memorizing mode, export and import.

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, toast, modal, fmtInt, relDays, he, heText, heClass, today, trt } from "./ui.js";
import { tr, trn, lang, bible, bibleName, meaning, cursive } from "./i18n.js";
import { translit, lemmaTranslit, stripCantillation, stripPoints, consonants, unpack, speakableText, speakableLemma, shortParse } from "./hebrew.js";
import { speak } from "./audio.js";

let root, listEl, filter = "", tab = "cards", sortKey = "created", sortDir = -1, stateFilter = "all";
let fillGen = 0; // bumped on every refill so a slow, older request can't add a second table
const briefCache = new Map();
const verseCache = new Map();

export function mount(el) { root = el; }
export function show(params = {}) { if (params.tab) tab = params.tab; render(); }

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
  const states = [["all", tr("All cards", "Toate")], ["new", tr("New", "Noi")], ["learning", tr("Learning", "În învățare")], ["review", tr("In review", "În recapitulare")], ["suspended", tr("Paused", "Pe pauză")]];
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

// Search text: Hebrew can be typed with or without vowels, a transliteration with or without its syllable dots.
function matches(q, heb, texts, trl) {
  const qh = stripPoints(q).replace(/\s+/g, " ").trim();
  const hay = [heb, stripCantillation(heb), consonants(heb), trl, String(trl || "").replace(/[.\/]/g, ""), ...texts]
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
  if (stateFilter !== "all") cards = cards.filter(c => stateOf(c) === stateFilter);
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
      h("td", { html: translit(c.kind === "lemma" ? lemmaTranslit(c.translit, c.key, s) : (c.translit || ""), s) }),
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
      h("td", { html: translit(lemmaTranslit(l.translit, l.key, s), s) }),
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

function fillSavedRow(row, k, v) {
  const { b, c, v: vn } = parseKey(k);
  const level = (store.data.saved[k] || {}).level || 0;
  clear(row);
  row.append(
    h("div", { class: "row" }, h("b", null, ctx.refText(b, c, vn)), h("span", { class: "pill" }, levelName(level)), h("span", { class: "spacer" }),
      iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableText(hebrewLine(v), store.settings))),
      h("button", { class: "btn small primary", type: "button", onclick: () => memorize(k) }, icon("pen"), tr("Memorize", "Învață pe de rost")),
      h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b, c, v: vn }) }, icon("book"), tr("Open", "Deschide")),
      iconBtn("trash", tr("Remove", "Scoate"), () => { store.toggleSaved(b, c, vn); render(); })),
    h("div", { class: "he saved-he" + heClass(), lang: "he", dir: "rtl" }, heText(hebrewLine(v))),
    h("div", { class: "muted", lang: bible() === "kjv" ? "en" : "ro" }, bibleText(v)));
}

// Memorizing: level 0 shows everything, 1 hides every third word, 2 shows only first letters, 3 hides all.
async function memorize(k) {
  const { b, c, v: vn } = parseKey(k);
  let v;
  try { v = await getVerse(k); } catch (e) { toast(errText(e)); return; }
  let level = (store.data.saved[k] || {}).level || 0;
  let showBible = false;
  const draw = () => {
    clear(root);
    const page = h("div", { class: "page memorize" });
    const speakAll = (slow) => speak(speakableText(hebrewLine(v), store.settings), { slow });
    page.append(h("div", { class: "row" },
      h("button", { class: "btn ghost small", type: "button", onclick: () => { tab = "verses"; render(); } }, icon("left"), tr("Saved verses", "Versete salvate")),
      h("span", { class: "spacer" }), h("b", null, ctx.refText(b, c, vn))));
    page.append(h("div", { class: "seg", style: { margin: "14px 0" } }, [0, 1, 2, 3].map(n =>
      h("button", { type: "button", class: n === level ? "on" : "", onclick: () => { level = n; draw(); } }, levelName(n)))));
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
    page.append(line);
    page.append(h("div", { class: "row", style: { justifyContent: "center", margin: "18px 0" } },
      h("button", { class: "btn", type: "button", onclick: () => speakAll(false) }, icon("speaker"), tr("Listen", "Ascultă")),
      h("button", { class: "btn", type: "button", onclick: () => speakAll(true) }, icon("slow"), tr("Listen slowly", "Ascultă rar")),
      h("button", { class: "btn", type: "button", onclick: () => { showBible = !showBible; draw(); } }, showBible ? tr("Hide translation", "Ascunde traducerea") : tr("Show translation", "Arată traducerea"))));
    if (showBible) page.append(h("p", { class: "muted", style: { textAlign: "center", maxWidth: "none" } }, `${bibleName()}: ${bibleText(v)}`));
    page.append(h("div", { class: "row", style: { justifyContent: "center" } },
      h("button", { class: "btn", type: "button", disabled: level === 0, onclick: () => { level--; save(); draw(); } }, tr("Easier", "Mai ușor")),
      h("button", { class: "btn", type: "button", disabled: level === 3, onclick: () => { level++; save(); draw(); } }, tr("Harder", "Mai greu")),
      h("button", { class: "btn primary", type: "button", onclick: () => {
        if (level < 3) { level++; save(); toast(tr("Good. One step harder.", "Bine. Un pas mai greu.")); draw(); }
        else { save(true); toast(tr("You know this verse by heart.", "Știi versetul pe de rost.")); }
      } }, icon("check"), tr("I said it right", "L-am spus corect"))));
    page.append(h("p", { class: "small muted", style: { textAlign: "center", maxWidth: "none", marginTop: "18px" } },
      trt("Say the verse out loud. Click a hidden word to peek at it.", "Spune versetul cu voce tare. Apasă pe un cuvânt ascuns ca să-l vezi.")));
    root.append(page);
  };
  const save = (mastered) => {
    if (!store.data.saved[k]) return;
    store.data.saved[k].level = level;
    if (mastered) store.data.saved[k].mastered = Date.now();
    store.changed("saved");
  };
  draw();
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
    const trn = translit(c.translit || "", store.settings, { html: false });
    // every field quoted (inner quotes doubled), so a note that starts with " or holds a line break can't merge rows
    lines.push([stripCantillation(c.heb), trn, meaning(c), (ro ? c.ro : c.en) || "", c.key ? store.note(c.key) : "", ref]
      .map(x => '"' + String(x).replace(/[\t\r\n]+/g, " ").replace(/"/g, '""') + '"').join("\t"));
  }
  download(ro ? "cuvinte-ebraice.tsv" : "hebrew-words.tsv", lines.join("\n"), "text/tab-separated-values");
}

function exportJson() {
  download(`mikra-backup-${today()}.json`, JSON.stringify(store.data, null, 1), "application/json");
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
