// Word study panel: the clicked word, its parts, dictionary entry, every form in the Bible, root family,
// how the KJV and Cornilescu translate it, and where it occurs.

import { api, store } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, he, heBig, toast, fmtInt, debounce, trt } from "./ui.js";
import { tr, trn, roDe, times, lang, bible, bibleName, meaning, cursive } from "./i18n.js";
import { errText } from "./store.js";
import { translit, wordTranslit, lemmaTranslit, morphRole, parseMorph, shortParse, affixIn, isAffix, speakableWord, speakableLemma, speakableText, verseSpeakable, glossClean, stripCantillation, stripPoints, display, escapeHtml } from "./hebrew.js";
import { speak } from "./audio.js";

let el, hooks;
let current = null; // what is open, for keyboard shortcuts
const lemmaCache = new Map();
const morphCache = new Map();

export function init(panelEl, h0) {
  el = panelEl;
  hooks = h0;
  current = null;
  renderEmpty();
}

export function close() {
  current = null;
  renderEmpty();
  hooks.onClose();
}

// What the panel shows: "word", "phrase", "lemma" or null.
export function kind() { return current ? current.type : null; }

function kbd(k) { return h("span", { class: "kbd" }, k); }

function renderEmpty() {
  clear(el);
  el.append(h("div", { class: "panel-empty" }, he("שָׁלוֹם", "", { print: !cursive() }),
    h("p", null, trt("Click any Hebrew word to study it. Hover a word on either side to see its match on the other side.",
      "Apasă pe orice cuvânt ebraic ca să-l studiezi. Treci cu mouse-ul peste un cuvânt din orice parte ca să vezi perechea lui din cealaltă parte.",
      "Tap any Hebrew word to study it. The panel shows which words of the Bible text match it.", "Apasă pe orice cuvânt ebraic ca să-l studiezi. Panoul arată cu ce cuvinte din textul Bibliei se potrivește.")),
    h("p", { class: "small desktop-only" },
      tr("Shift+click a second word to select a phrase. ", "Shift+clic pe un al doilea cuvânt selectează o expresie. "),
      kbd("←"), " ", kbd("→"), tr(" move between words, ", " trec de la un cuvânt la altul, "),
      kbd(tr("Space", "Spațiu")), tr(" plays the word, ", " citește cuvântul, "),
      kbd("A"), tr(" adds it to review, ", " îl adaugă la recapitulare, "),
      kbd("K"), tr(" marks it known, ", " îl marchează ca știut, "),
      kbd("["), " ", kbd("]"), tr(" change chapter.", " schimbă capitolul."))));
}

async function getLemma(key) {
  if (!key) return null;
  if (lemmaCache.has(key)) return lemmaCache.get(key);
  try {
    const d = await api.get("lemma", { k: key });
    lemmaCache.set(key, d);
    return d;
  } catch (e) { return null; }
}

async function getMorphs(codes) {
  const need = codes.filter(c => c && !morphCache.has(c));
  if (need.length) {
    try {
      const res = await api.get("morph", { codes: need.join(",") });
      for (const c of need) morphCache.set(c, res[c] || null);
    } catch (e) { /* offline */ }
  }
  return codes.map(c => morphCache.get(c));
}

function shell() {
  clear(el);
  hooks.onOpen();
  const inner = h("div", { class: "panel-inner" });
  el.append(iconBtn("x", tr("Close", "Închide"), () => close(), { class: "panel-close" }), inner);
  el.scrollTop = 0;
  return inner;
}

// Dictionary text uses a few tags. Everything is escaped first, then only <br>, <i>, <b> and
// Bible references (<ref="Gen.1.1">Gen 1:1</ref>) are turned back into markup.
function sanitize(html) {
  return escapeHtml(html || "")
    .replace(/&lt;ref=&quot;([A-Za-z0-9]{3})\.(\d+)\.(\d+)[^&]*&quot;&gt;(.*?)&lt;\/ref&gt;/g,
      (_, b, c, v, label) => `<a href="#" class="xref" data-b="${b}" data-c="${c}" data-v="${v}">${label}</a>`)
    .replace(/&lt;ref=&quot;[^&]*&quot;&gt;(.*?)&lt;\/ref&gt;/g, "$1")
    .replace(/&lt;(\/?)(br|BR|i|b)\s*\/?&gt;/g, "<$1$2>")
    .replace(/<BR>/g, "<br>");
}

function wireRefs(node) {
  for (const a of node.querySelectorAll("a.xref")) {
    const b = ctx.books.findIndex(x => x.code.toLowerCase() === a.dataset.b.toLowerCase());
    if (b < 0) { a.replaceWith(document.createTextNode(a.textContent)); continue; }
    a.addEventListener("click", (e) => { e.preventDefault(); hooks.gotoRef(b, Number(a.dataset.c), Number(a.dataset.v)); });
  }
  return node;
}

// Splits Hebrew into letters with their marks attached (so a shin dot stays on its shin).
function letters(s) {
  return (s || "").match(/[א-ת][֑-ׇ]*/g) || [];
}

function audioBtns(textFn) {
  return [
    iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(textFn())),
    iconBtn("slow", tr("Listen slowly", "Ascultă rar"), () => speak(textFn(), { slow: true })),
  ];
}

// The big word at the top: prefixes and endings colored; in cursive mode the handwriting goes on top.
function bigWord(w, s) {
  const print = h("div", { class: "wp-word", lang: "he" });
  w.morphs.forEach((m, i) => print.append(h("span", { class: morphRole(w, i) }, s.cantillation ? m : stripCantillation(m))));
  if (!cursive()) return print;
  print.classList.add("under");
  return h("div", null, h("div", { class: "wp-word cursive", lang: "he" }, stripPoints(w.text)), print);
}

// ------------------------------------------------------------------ word in context

export async function openWord(o) {
  const s = store.settings;
  const w = o.vs.words[o.w];
  const me = current = { type: "word", o, w, key: w.lemma };
  const inner = shell();
  const ref = ctx.refText(o.book, o.ch, o.v);
  // opened from "Take this verse apart": a way back to the whole verse
  if (o.back) inner.append(h("button", { class: "btn ghost small", type: "button", onclick: o.back }, icon("left"), tr("Back to the verse", "Înapoi la verset")));
  inner.append(h("div", { class: "row small muted", style: { paddingRight: "36px" } },
    h("span", null, tr(`${ref}, word ${o.w + 1} of ${o.vs.words.length}`, `${ref}, cuvântul ${o.w + 1} din ${o.vs.words.length}`)),
    h("span", { class: "spacer" }),
    iconBtn("right", tr("Previous word", "Cuvântul anterior"), o.onPrevWord),
    iconBtn("left", tr("Next word", "Cuvântul următor"), o.onNextWord)));

  inner.append(bigWord(w, s));
  inner.append(h("div", { class: "row", style: { justifyContent: "flex-end" } },
    h("div", { class: "wp-tr", html: translit(wordTranslit(w, s), s, { heb: w.text }) }), ...audioBtns(() => speakableWord(w, s))));
  const here = lang() === "ro" ? (o.roLinked || o.glossRo || glossClean(w.gloss.join(" "))) : glossClean(w.gloss.join(" "));
  inner.append(h("div", { class: "wp-gloss" }, here));
  if (o.sideLinked && !(lang() === "ro" && o.sideName === "Cornilescu")) {
    inner.append(h("div", { class: "wp-gloss" }, `${o.sideName} ${tr("here", "aici")}: `, h("b", { style: { color: "var(--ink)" } }, o.sideLinked)));
  }

  const lemmaKey = w.lemma;
  const actions = h("div", { class: "wp-actions" });
  inner.append(actions);

  // parts of the word
  const partsSec = h("div", { class: "wp-sec" }, h("h3", null, w.morphs.length > 1 ? tr("How the word is built", "Cum e alcătuit cuvântul") : tr("Grammar", "Gramatică")));
  const morphs = h("div", { class: "morphs" });
  partsSec.append(morphs);
  inner.append(partsSec);
  const infos = await getMorphs(w.codes);
  if (current !== me) return; // panel closed or another word (or the same one again) opened meanwhile
  w.morphs.forEach((m, i) => {
    const role = morphRole(w, i);
    const tag = w.tags[i];
    const p = parseMorph(w.codes[i]);
    const af = isAffix(tag) ? affixIn(tag, w.codes[i]) : null;
    let what;
    if (af) {
      what = [h("b", null, (role === "pre" ? tr("Prefix: ", "Prefix: ") : tr("Ending: ", "Terminație: ")) + af[0]), h("div", { class: "parse" }, af[1])];
    } else {
      const info = infos[i];
      // Romanian: the Cornilescu meaning for the main part; other parts show their grammar instead of an English gloss
      const mean = lang() === "ro" ? (i === w.main ? (o.glossRo || o.roLinked || glossClean(w.gloss[i])) : "") : glossClean(w.gloss[i]);
      what = [h("b", null, mean || capital(p.label)),
        mean ? h("div", { class: "parse" }, capital(p.label)) : null,
        p.conjHelp ? h("div", { class: "parse" }, capital(p.conjHelp)) : null,
        lang() === "en" && info && info.plain && p.posCode === "V" ? h("div", { class: "parse" }, capital(info.plain.toLowerCase())) : null];
    }
    morphs.append(h("div", { class: "morph-row " + role }, he(display(m, { cantillation: false, vowels: true })), h("div", { class: "what" }, what)));
  });
  if (w.extra.x === "Q" || w.extra.var) {
    inner.append(h("div", { class: "wp-sec" }, h("h3", null, tr("Reading note", "Notă de citire")),
      h("div", { class: "variant" }, w.extra.x === "Q" ? tr("This word follows the {Qere}, the way the scribes said to read it aloud. ", "Cuvântul urmează {Qere}, felul în care cărturarii au spus să fie citit cu voce tare. ") : "",
        w.extra.var ? variantLines(w.extra.var) : null)));
  }
  if (w.extra.x === "X") {
    inner.append(h("div", { class: "variant" }, tr("This word is not in the Leningrad Codex. It is restored from the Greek Septuagint, as many translations do.",
      "Cuvântul acesta nu este în Codexul Leningrad. E pus la loc din Septuaginta greacă, cum fac multe traduceri.")));
  }

  const lemma = await getLemma(lemmaKey);
  if (current !== me) return;
  fillActions(actions, { lemma, w, o });
  if (lemma && !isAffix(lemmaKey)) appendLemmaSections(inner, lemma, { form: w });
}

const VARIANT_LABELS = {
  K: ["Written in the text (ketiv)", "Scris în text (ketiv)"], Q: ["Read aloud ({qere})", "Citit cu voce tare ({qere})"],
  L: ["Letters as in the Leningrad Codex", "Literele din Codexul Leningrad"], A: ["Aleppo Codex", "Codexul din Alep"],
  B: ["BHS printed edition", "Ediția tipărită BHS"], C: ["Cairo Codex", "Codexul din Cairo"], D: ["Dead Sea Scrolls", "Manuscrisele de la Marea Moartă"],
  E: ["Scholarly correction", "Corectură a cercetătorilor"], H: ["Second Rabbinic Bible", "A doua Biblie rabinică"],
  S: ["Scribal tradition", "Tradiția cărturarilor"], V: ["Other manuscripts", "Alte manuscrise"], X: ["Greek Septuagint", "Septuaginta greacă"],
};

function variantLines(text) {
  const out = h("div", { style: { marginTop: "6px" } });
  // "K= me./'e.ver (מֵ/עֵבֶר) "from/ [the] other side of" (H9006/H5676G=HR/Ncbsc) L= מְ/עֵ֥בֶר": each value ends where
  // the next "X=" starts; only its Hebrew letters are shown (the transliteration, gloss and codes are English data)
  const re = /(?:^|[\s;¦])([A-Z]+)=\s*(.*?)\s*(?=\s[A-Z]+=|[;¦]|$)/g;
  let m, any = false;
  while ((m = re.exec(text))) {
    const raw = m[2];
    const paren = raw.match(/\(([\u0590-\u05FF\/\\\s]+)\)/);
    const val = (paren ? paren[1] : (raw.match(/[\u0590-\u05FF][\u0590-\u05FF\/\\\s]*/) || [""])[0]).replace(/[\/\\]/g, "").trim();
    if (!/[֐-׿]/.test(val)) continue;
    const label = m[1].toUpperCase().split("").map(c => VARIANT_LABELS[c]).filter(Boolean).map(x => tr(x[0], x[1])).join(", ") || tr("Variant", "Variantă");
    out.append(h("div", { class: "row", style: { justifyContent: "space-between", gap: "10px" } },
      h("span", { class: "small muted" }, label), he(val, "", { print: true })));
    any = true;
  }
  if (!any && lang() === "en") out.append(h("div", { class: "small muted" }, text));
  return out;
}

function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function topRenderings(list, n = 3) { return (list || []).slice(0, n).map(x => x[0]).join(", "); }

function fillActions(actions, { lemma, w, o }) {
  clear(actions);
  if (!lemma || isAffix(lemma.key)) return;
  const key = lemma.key;
  const lid = "L:" + key;
  const fid = `F:${o.book}.${o.ch}.${o.v}.${o.w}`;
  const addLemma = h("button", { class: "btn" + (store.hasCard(lid) ? " on" : ""), type: "button", title: "A", onclick: () => {
    if (store.hasCard(lid)) { toast(tr("Already in your review list", "Este deja în recapitulare")); return; }
    store.addCard({ id: lid, kind: "lemma", key, heb: lemma.hebrew, translit: lemma.translit, gloss: lemma.gloss, glossRo: lemma.gloss_ro || "",
      ro: o.roLinked || topRenderings(lemma.ro), en: o.enLinked || topRenderings(lemma.en),
      ctx: { b: o.book, c: o.ch, v: o.v, w: o.w, form: w.text } });
    addLemma.classList.add("on"); addLemma.lastChild.textContent = tr("In review", "În recapitulare");
    toast(tr("Added ", "Am adăugat ") + stripCantillation(lemma.hebrew) + tr(" to review", " la recapitulare"));
    hooks.refreshMarks();
  } }, icon("plus"), store.hasCard(lid) ? tr("In review", "În recapitulare") : tr("Add word", "Adaugă cuvântul"));
  const addForm = h("button", { class: "btn" + (store.hasCard(fid) ? " on" : ""), type: "button", title: tr("Learn this exact form, with its prefixes and endings", "Învață exact forma aceasta, cu prefixele și terminațiile ei"), onclick: () => {
    if (store.hasCard(fid)) { toast(tr("This form is already in review", "Forma aceasta este deja în recapitulare")); return; }
    store.addCard({ id: fid, kind: "form", key, heb: stripCantillation(w.text), translit: wordTranslit(w, store.settings), gloss: glossClean(w.gloss.join(" ")),
      glossRo: o.roLinked || lemma.gloss_ro || "", parseCode: w.codes[w.main], ro: o.roLinked || "", en: o.enLinked || "",
      ctx: { b: o.book, c: o.ch, v: o.v, w: o.w, form: w.text } });
    addForm.classList.add("on"); addForm.lastChild.textContent = tr("Form in review", "Forma e în recapitulare");
    toast(tr("Added this form to review", "Am adăugat forma la recapitulare"));
  } }, icon("plus"), store.hasCard(fid) ? tr("Form in review", "Forma e în recapitulare") : tr("Add this form", "Adaugă forma"));
  const known = store.isKnown(key);
  const knownBtn = h("button", { class: "btn" + (known ? " on" : ""), type: "button", title: "K", onclick: () => {
    const now = store.toggleKnown(key);
    knownBtn.classList.toggle("on", now);
    knownBtn.lastChild.textContent = now ? tr("Known", "Știut") : tr("I know it", "Îl știu");
  } }, icon("check"), known ? tr("Known", "Știut") : tr("I know it", "Îl știu"));
  actions.append(addLemma, addForm, knownBtn);
  current.actions = { addLemma, knownBtn, key };
}

export function shortcut(k) {
  if (!current || !current.actions) return;
  if (k === "a") current.actions.addLemma.click();
  if (k === "k") current.actions.knownBtn.click();
}

// Known / in-review buttons follow changes made elsewhere (the chapter word list, Review, My words).
export function refreshButtons() {
  const a = current && current.actions;
  if (!a || !a.key || !a.knownBtn.isConnected) return;
  const known = store.isKnown(a.key);
  a.knownBtn.classList.toggle("on", known);
  a.knownBtn.lastChild.textContent = known ? tr("Known", "Știut") : tr("I know it", "Îl știu");
  const carded = store.hasCard("L:" + a.key);
  a.addLemma.classList.toggle("on", carded);
  a.addLemma.lastChild.textContent = carded ? tr("In review", "În recapitulare") : tr("Add word", "Adaugă cuvântul");
}

// ------------------------------------------------------------------ dictionary sections (shared)

function lemmaMeaning(lemma) {
  return lang() === "ro" ? (lemma.gloss_ro || lemma.gloss) : lemma.gloss;
}

function appendLemmaSections(inner, lemma) {
  const s = store.settings;
  // dictionary form
  const sec = h("div", { class: "wp-sec" }, h("h3", null, tr("Dictionary form", "Forma de dicționar")));
  sec.append(h("div", { class: "lemma-head" },
    h("div", { class: "row" }, ...audioBtns(() => speakableLemma(lemma.hebrew, lemma.key, s))),
    he(lemma.hebrew)));
  sec.append(h("div", { style: { textAlign: "right", fontSize: "17px" }, html: translit(lemmaTranslit(lemma.translit, lemma.key, s), s, { heb: lemma.hebrew }) }));
  sec.append(h("div", { style: { fontSize: "16px", marginTop: "6px" } }, h("b", null, lemmaMeaning(lemma))));
  if (lang() === "ro" && !lemma.gloss_ro) sec.append(h("div", { class: "small faint" }, tr("", "(înțeles în engleză: nu apare în Cornilescu)")));
  const pos = lexPos(lemma.morph);
  const freqLine = lemma.freq
    ? tr(`Appears ${times(lemma.freq)} in the Old Testament${lemma.rank ? `, the ${ordinal(lemma.rank)} most common word` : ""}.`,
      `Apare ${times(lemma.freq)} în Vechiul Testament${lemma.rank ? (lemma.rank === 1 ? ", cel mai des întâlnit cuvânt" : `, al ${lemma.rank}-lea cel mai des întâlnit cuvânt`) : ""}.`)
    : tr("Not counted in the main text.", "Nu e numărat în textul principal.");
  sec.append(h("div", { class: "small muted", style: { margin: "4px 0 8px" } }, [pos, freqLine].filter(Boolean).join(". ").replace(/\.\./g, ".")));
  // English dictionaries: shown open in English, folded away (and labeled) in Romanian
  const dict = [];
  if (lemma.senses && lemma.senses.length && lang() === "en") {
    dict.push(h("div", { class: "small", style: { marginBottom: "8px" } }, "Senses: ", lemma.senses.map(x => x.gloss).join("; ")));
  }
  if (lemma.meaning) {
    dict.push(h("div", { class: "small muted", style: { marginBottom: "4px" } }, tr("Brown-Driver-Briggs (abridged)", "Brown-Driver-Briggs (prescurtat, în engleză)")),
      wireRefs(h("div", { class: "meaning", html: sanitize(lemma.meaning) })));
  }
  if (lemma.strong && (lemma.strong.meaning || lemma.strong.usage)) {
    dict.push(h("div", { class: "small", style: { marginTop: "10px" } },
      h("div", { class: "muted" }, `Strong ${lemma.dstrong.replace(/[A-Z]$/, "")}`),
      lemma.strong.source ? h("div", null, lemma.strong.source) : null,
      lemma.strong.meaning ? h("div", null, lemma.strong.meaning) : null,
      lemma.strong.usage ? h("div", { class: "muted" }, "KJV: " + lemma.strong.usage) : null));
  }
  if (dict.length) {
    if (lang() === "ro") sec.append(h("details", { class: "dict-en" }, h("summary", null, tr("", "Dicționarul englez (Brown-Driver-Briggs, Strong)")), ...dict));
    else sec.append(...dict);
  }
  inner.append(sec);

  // how the Bibles translate it: the reader's version first
  const order = bible() === "kjv" ? [["en", "KJV"], ["ro", "Cornilescu"]] : [["ro", "Cornilescu"], ["en", "KJV"]];
  const renderSec = h("div", { class: "wp-sec" });
  const showRenderings = (idx) => {
    clear(renderSec);
    const [field, name] = order[idx];
    const list = lemma[field] || [];
    const other = order[1 - idx];
    renderSec.append(h("div", { class: "row", style: { marginBottom: "8px" } },
      h("h3", { style: { margin: 0 } }, tr(`How the ${name} translates it`, `Cum traduce ${name}`)),
      h("span", { class: "spacer" }),
      (lemma[other[0]] || []).length ? h("button", { class: "btn small ghost", type: "button", onclick: () => showRenderings(1 - idx) }, other[1]) : null));
    if (!list.length) { renderSec.append(h("div", { class: "small muted" }, tr("No links for this word.", "Nu sunt legături pentru acest cuvânt."))); return; }
    const max = list[0][1];
    const bars = h("div", { class: "bars" });
    for (const [word, n, forms] of list) {
      bars.append(h("div", { class: "bar-row" },
        h("div", { class: "label" }, h("i", { style: { width: Math.max(4, (n / max) * 100) + "%" } }),
          h("span", null, word, forms && forms.length ? h("span", { class: "faint small" }, tr("  also ", "  și ") + forms.join(", ")) : null)),
        h("div", { class: "n" }, fmtInt(n))));
    }
    renderSec.append(bars, h("div", { class: "small faint", style: { marginTop: "6px" } },
      field === "en" ? tr("From the Strong's numbers in the KJV text.", "Din numerele Strong din textul KJV.")
        : tr("From the automatic word links, so a few rows may be off.", "Din legăturile automate, așa că unele rânduri pot fi greșite.")));
  };
  if ((lemma.en || []).length || (lemma.ro || []).length) {
    showRenderings((lemma[order[0][0]] || []).length ? 0 : 1);
    inner.append(renderSec);
  }

  // every form in the Bible
  if (lemma.nForms > 1) inner.append(formsSection(lemma));

  // root family
  const fam = lemma.family;
  const famMembers = fam && fam.members ? fam.members.filter(m => m.key) : [];
  if (famMembers.length > 1) {
    const list = h("div", { class: "family" });
    const members = famMembers.slice().sort((a, b) => (b.freq || 0) - (a.freq || 0));
    for (const m of members) {
      const self = m.key === lemma.key;
      const mean = lang() === "ro" ? (m.glossRo || m.gloss || m.def || "") : (m.gloss || m.def || "");
      list.append(h("div", { class: "fam-row" + (self ? " self" : ""), onclick: () => { if (!self && m.key) openLemma(m.key); } },
        he(m.hebrew || m.w),
        h("span", { class: "g" }, mean, m.pos ? h("span", { class: "faint" }, "  " + posName(m.pos)) : null),
        h("span", { class: "n" }, m.freq ? fmtInt(m.freq) + "×" : "")));
    }
    const head = fam.is_root
      ? h("div", { class: "row", style: { justifyContent: "space-between", marginBottom: "6px" } },
          h("span", { class: "small muted" }, tr("Root", "Rădăcina") + (fam.root_def && lang() === "en" ? ": " + fam.root_def : "")),
          h("span", { class: "root-letters" + (cursive() ? " cursive" : ""), lang: "he" }, letters(cursive() ? stripPoints(fam.root || "") : fam.root).join(" ")))
      : h("div", { class: "small muted", style: { marginBottom: "6px" } }, tr("Related words", "Cuvinte înrudite"));
    // learn the family together: the members not in review yet and not known (names and words not in the text left out)
    const newMembers = () => members.filter(m => m.key && !isAffix(m.key) && (m.freq || 0) > 0 && m.hebrew && !store.hasCard("L:" + m.key) && !store.isKnown(m.key));
    const n0 = newMembers().length;
    const addFam = n0 ? h("button", { class: "btn small wrap", type: "button", onclick: () => {
      const n = store.addCards(newMembers().map(m => ({ id: "L:" + m.key, kind: "lemma", key: m.key, heb: m.hebrew, translit: m.translit || "", gloss: m.gloss || "", glossRo: m.glossRo || "" })));
      toast(tr("Added ", "Am adăugat ") + trn(n, "word", "words", "cuvânt", "cuvinte") + tr(" to review", " la recapitulare"));
      addFam.replaceWith(h("span", { class: "pill review" }, tr("Family in review", "Familia e în recapitulare")));
      hooks.refreshMarks();
    } }, icon("plus"), tr(n0 === 1 ? "Add the word not in review yet" : `Add the ${n0} words not in review yet`, n0 === 1 ? "Adaugă cuvântul care nu e încă în recapitulare" : `Adaugă cele ${n0} ${roDe(n0)}cuvinte care nu sunt încă în recapitulare`)) : null;
    inner.append(h("div", { class: "wp-sec" }, h("h3", null, tr("Root and related words", "Rădăcina și cuvintele înrudite")), head, list,
      addFam ? h("div", { class: "row", style: { marginTop: "8px" } }, addFam) : null,
      h("div", { class: "small faint", style: { marginTop: "6px" } }, tr("Most Hebrew words grow from a root of three consonants. Learning one member makes the others easier.",
        "Cele mai multe cuvinte ebraice cresc dintr-o rădăcină de trei consoane. Când înveți unul, celelalte devin mai ușoare."))));
  }

  // occurrences
  if (lemma.freq) {
    const occSec = h("div", { class: "wp-sec" }, h("h3", null, tr("Where it appears", "Unde apare")));
    const list = h("div", { class: "occ-list" });
    const more = h("button", { class: "btn small", type: "button" }, tr("Show more", "Arată mai multe"));
    const bookFilter = h("select", { class: "small", "aria-label": tr("Filter by book", "Filtrează după carte") }, h("option", { value: "" }, tr("All books", "Toate cărțile")));
    occSec.append(h("div", { class: "row", style: { marginBottom: "8px" } }, bookFilter), list, h("div", { style: { marginTop: "8px" } }, more));
    inner.append(occSec);
    let offset = 0, seq = 0;
    const loadMore = async (reset) => {
      const my = ++seq;
      if (reset) { offset = 0; clear(list); }
      let res;
      try { res = await api.get("occ", { k: lemma.key, offset, limit: 12, book: bookFilter.value, t: bible() }); }
      catch (e) { if (my === seq) toast(tr("Could not load the verses: ", "Nu am putut încărca versetele: ") + errText(e)); return; }
      if (my !== seq) return;
      if (offset === 0 && bookFilter.options.length === 1) {
        for (const [b, n] of res.perBook) bookFilter.append(h("option", { value: b }, `${ctx.bookName(b)} (${n})`));
      }
      for (const it of res.items) list.append(occItem(it));
      offset += res.items.length;
      more.hidden = offset >= res.total;
    };
    more.onclick = () => loadMore(false);
    bookFilter.onchange = () => loadMore(true);
    loadMore(true);
  }

  // note
  const ta = h("textarea", { placeholder: tr("Your own notes: a meaning, a verse you like, a way to remember it…", "Notițele tale: un înțeles, un verset care îți place, un mod de a ține minte…") }, store.note(lemma.key));
  ta.addEventListener("input", debounce(() => store.setNote(lemma.key, ta.value), 500));
  inner.append(h("div", { class: "wp-sec note-box" }, h("h3", null, tr("My note", "Notița mea")), ta));
}

// Every form of the word in the text, grouped by verb stem (or noun form), most common first.
function formsSection(lemma) {
  const sec = h("div", { class: "wp-sec" }, h("h3", null, tr("Every form in the Bible", "Toate formele din Biblie")));
  const body = h("div", null, h("div", { class: "small muted" }, tr("Loading…", "Se încarcă…")));
  sec.append(body);
  api.get("forms", { k: lemma.key }).then(res => {
    clear(body);
    const items = res.items;
    body.append(h("div", { class: "small muted", style: { marginBottom: "8px" } }, trn(items.length, "different form", "different forms", "formă", "forme diferite") + tr(
      ". Prefixes and endings are part of each form. Click a form to hear it, the reference to see it in its verse.",
      ". Prefixele și terminațiile fac parte din fiecare formă. Apasă pe o formă ca s-o auzi, pe trimitere ca s-o vezi în verset.")));
    const groups = new Map();
    for (const it of items) {
      const p = parseMorph(it.morph);
      const g = p.posCode === "V" ? p.stem : p.pos || "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    const table = h("div", { class: "forms" });
    let shown = 0;
    const LIMIT = 14;
    const rows = [];
    for (const [g, list] of groups) {
      const head = groups.size > 1 ? h("div", { class: "forms-group" }, g || tr("Other", "Altele")) : null;
      if (head) { head.hidden = shown >= LIMIT; rows.push(head); } // a heading with all its rows folded away would stand empty
      for (const it of list) {
        const row = h("div", { class: "forms-row" },
          h("button", { class: "he-btn", type: "button", title: tr("Listen", "Ascultă"), onclick: () => speak(speakableText(it.form, store.settings)) }, he(it.form)),
          h("span", { class: "parse" }, shortParse(it.morph)),
          h("span", { class: "n" }, fmtInt(it.n) + "×"),
          h("a", { href: "#", class: "small", onclick: (e) => { e.preventDefault(); hooks.gotoRef(it.b, it.c, it.v); } }, ctx.refText(it.b, it.c, it.v)));
        if (shown >= LIMIT) row.hidden = true;
        shown++;
        rows.push(row);
      }
    }
    table.append(...rows);
    body.append(table);
    if (shown > LIMIT) {
      const btn = h("button", { class: "btn small", type: "button", style: { marginTop: "8px" }, onclick: () => {
        for (const r of table.children) r.hidden = false; btn.remove();
      } }, tr(`Show all ${shown}`, `Arată toate cele ${shown}`));
      body.append(btn);
    }
  }).catch(() => clear(body));
  return sec;
}

export function occItem(it, onGo) {
  const textHtml = (() => {
    let html = "", pos = 0;
    const hits = new Set(it.hits || []);
    const text = it.text || "";
    for (let i = 0; i < (it.tok || []).length; i += 2) {
      const a = it.tok[i], b = it.tok[i + 1];
      html += escapeHtml(text.slice(pos, a));
      const word = escapeHtml(text.slice(a, b));
      html += hits.has(i / 2) ? "<mark>" + word + "</mark>" : word;
      pos = b;
    }
    return html + escapeHtml(text.slice(pos));
  })();
  const heHtml = it.words.map((w, i) => {
    // a verse-final "׃ פ" loses its sof pasuq to stripCantillation; drop the paragraph letter left behind
    const t = escapeHtml(stripCantillation(w.replace(/\//g, "")).replace(/\s+[ספ]\s*$/, ""));
    return i === it.w ? "<mark>" + t + "</mark>" : t;
  }).join(" ").replace(/־ /g, "־");
  return h("div", { class: "occ", onclick: () => (onGo ? onGo(it) : hooks.gotoRef(it.book, it.ch, it.v)) },
    h("div", { class: "ref" }, ctx.refText(it.book, it.ch, it.v)),
    h("span", { class: "he", lang: "he", dir: "rtl", html: heHtml }),
    h("div", { lang: it.t === "kjv" ? "en" : "ro", html: textHtml }));
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Part of speech from the dictionary code ("H:N-M", "A:V", "N:N--L", "H:N-M / H:A"...). [English, Romanian, Romanian is feminine]
const LEX_POS = {
  "V": ["verb", "verb"], "N-M": ["masculine noun", "substantiv masculin"], "N-F": ["feminine noun", "substantiv feminin"],
  "N-M/F": ["noun (masculine or feminine)", "substantiv (masculin sau feminin)"], "N": ["noun", "substantiv"],
  "A": ["adjective", "adjectiv"], "A-M": ["adjective (masculine)", "adjectiv (masculin)"], "A-F": ["adjective (feminine)", "adjectiv (feminin)"],
  "Adv": ["adverb", "adverb"], "Prep": ["preposition", "prepoziție", true], "Conj": ["conjunction", "conjuncție", true],
  "Part": ["particle", "particulă", true], "Neg": ["negative particle", "particulă de negație", true], "Cond": ["conditional particle", "particulă condițională", true],
  "Intj": ["interjection", "interjecție", true], "Intg": ["interrogative", "cuvânt interogativ"], "DemP": ["demonstrative pronoun", "pronume demonstrativ"],
  "PerP": ["personal pronoun", "pronume personal"], "RelP": ["relative pronoun", "pronume relativ"], "IndP": ["indefinite pronoun", "pronume nehotărât"],
};
function lexPos(m) {
  if (!m) return "";
  const first = m.split(/\s*[\/+]\s*(?=[HAN]:)/)[0].trim();
  if (first.startsWith("N:")) {
    const t = first.slice(2);
    return /G$/.test(t) && /-P/.test(t) ? tr("Name of a people", "Nume de popor")
      : /-L/.test(t) ? tr("Name of a place", "Nume de loc") : /-F/.test(t) ? tr("Name of a woman", "Nume de femeie")
      : /-M/.test(t) ? tr("Name of a man or group", "Nume de bărbat sau de grup") : tr("Name", "Nume");
  }
  if (first === "Prefix") return tr("Prefix", "Prefix");
  if (/^O[sp]\d/.test(first)) return tr("Pronoun suffix", "Sufix de pronume");
  const aram = first.startsWith("A:");
  const code = first.replace(/^[HA]:/, "");
  const e = LEX_POS[code] || LEX_POS[code.split("-")[0]];
  if (!e) return "";
  return aram ? tr("Aramaic " + e[0], capital(e[1]) + (e[2] ? " aramaică" : " aramaic")) : tr(capital(e[0]), capital(e[1]));
}

function posName(p) {
  const n = { V: ["verb", "verb"], N: ["noun", "substantiv"], A: ["adjective", "adjectiv"], Np: ["name", "nume"], D: ["adverb", "adverb"],
    R: ["preposition", "prepoziție"], C: ["conjunction", "conjuncție"], P: ["pronoun", "pronume"] }[p];
  return n ? tr(n[0], n[1]) : "";
}

// ------------------------------------------------------------------ lemma only

export async function openLemma(key) {
  const inner = shell();
  const me = current = { type: "lemma", key };
  inner.append(h("div", { class: "muted" }, tr("Loading…", "Se încarcă…")));
  const lemma = await getLemma(key);
  if (current !== me) return;
  clear(inner);
  if (!lemma) { inner.append(h("p", null, tr("This word is not in the dictionary data.", "Cuvântul acesta nu e în dicționar."))); return; }
  const s = store.settings;
  inner.append(heBig(lemma.hebrew, "wp-word"));
  inner.append(h("div", { class: "row", style: { justifyContent: "flex-end" } },
    h("div", { class: "wp-tr", html: translit(lemmaTranslit(lemma.translit, lemma.key, s), s, { heb: lemma.hebrew }) }), ...audioBtns(() => speakableLemma(lemma.hebrew, lemma.key, s))));
  inner.append(h("div", { class: "wp-gloss" }, lemmaMeaning(lemma)));
  const actions = h("div", { class: "wp-actions" });
  inner.append(actions);
  current.actions = null;
  if (!isAffix(key)) {
    const lid = "L:" + key;
    const addLemma = h("button", { class: "btn" + (store.hasCard(lid) ? " on" : ""), type: "button", onclick: async () => {
      if (store.hasCard(lid)) return;
      let ctxRef = null;
      try {
        const occ = await api.get("occ", { k: key, limit: 1 });
        if (occ.items[0]) { const it = occ.items[0]; ctxRef = { b: it.book, c: it.ch, v: it.v, w: it.w, form: it.words[it.w] }; }
      } catch (_) { /* fine without context */ }
      store.addCard({ id: lid, kind: "lemma", key, heb: lemma.hebrew, translit: lemma.translit, gloss: lemma.gloss, glossRo: lemma.gloss_ro || "",
        ro: topRenderings(lemma.ro), en: topRenderings(lemma.en), ctx: ctxRef });
      addLemma.classList.add("on"); addLemma.lastChild.textContent = tr("In review", "În recapitulare");
      toast(tr("Added to review", "Adăugat la recapitulare"));
      hooks.refreshMarks();
    } }, icon("plus"), store.hasCard(lid) ? tr("In review", "În recapitulare") : tr("Add word", "Adaugă cuvântul"));
    const known = store.isKnown(key);
    const knownBtn = h("button", { class: "btn" + (known ? " on" : ""), type: "button", onclick: () => {
      const now = store.toggleKnown(key);
      knownBtn.classList.toggle("on", now);
      knownBtn.lastChild.textContent = now ? tr("Known", "Știut") : tr("I know it", "Îl știu");
    } }, icon("check"), known ? tr("Known", "Știut") : tr("I know it", "Îl știu"));
    actions.append(addLemma, knownBtn);
    current.actions = { addLemma, knownBtn, key };
  }
  appendLemmaSections(inner, lemma);
}

// ------------------------------------------------------------------ a whole verse, word by word

// "Take this verse apart": every word with its parts (prefixes, the main word, endings), what each part means and its
// grammar, the meaning in this verse and its sound. o: { book, ch, v, vs, sideName, sideText, sideLang, meanings[],
// isNew(wi), onWord(wi), addNew() -> Promise<number> }
export function openVerse(o) {
  const s = store.settings;
  const inner = shell();
  current = { type: "verse", o };
  const words = o.vs.words;
  const idx = words.map((_, i) => i).filter(i => words[i].extra.x !== "X" || s.showLxx);
  inner.append(h("div", { class: "small muted", style: { paddingRight: "36px" } }, `${ctx.refText(o.book, o.ch, o.v)}, ` + tr("word by word", "cuvânt cu cuvânt")));
  const text = idx.map(i => stripCantillation(words[i].text) + (words[i].punct.includes("־") ? "־" : " ")).join("").trim();
  inner.append(h("div", { class: "vb-verse", lang: "he", dir: "rtl" }, text));
  inner.append(h("div", { class: "row", style: { justifyContent: "flex-end" } }, ...audioBtns(() => verseSpeakable(words, s))));
  if (o.sideText) inner.append(h("div", { class: "vb-side", lang: o.sideLang }, h("span", { class: "muted" }, o.sideName + ": "), o.sideText));
  const newCount = () => new Set(idx.filter(i => o.isNew(i)).map(i => words[i].lemma)).size;
  const n0 = newCount();
  if (n0) {
    const add = h("button", { class: "btn wrap", type: "button", onclick: async () => {
      add.disabled = true;
      let n = 0;
      try { n = await o.addNew(); } catch (e) { toast(errText(e)); add.disabled = false; return; }
      toast(tr("Added ", "Am adăugat ") + trn(n, "word", "words", "cuvânt", "cuvinte") + tr(" to review", " la recapitulare"));
      add.replaceWith(h("span", { class: "pill review" }, tr("New words in review", "Cuvintele noi sunt în recapitulare")));
      for (const el of list.querySelectorAll(".vb-word.vb-new")) el.classList.remove("vb-new");
    } }, icon("plus"), tr(n0 === 1 ? "Add the new word of this verse to review" : `Add the ${n0} new words of this verse to review`,`Adaugă la recapitulare ${n0 === 1 ? "cuvântul nou" : `cele ${n0} ${roDe(n0)}cuvinte noi`} din verset`));
    inner.append(h("div", { class: "wp-actions" }, add));
  }
  inner.append(h("div", { class: "small faint" }, trt("Prefixes are teal, endings plum. Click a word to study it in full.", "Prefixele sunt turcoaz, terminațiile mov. Apasă pe un cuvânt ca să-l studiezi pe larg.")));
  const list = h("ol", { class: "vb-list" });
  for (const wi of idx) {
    const w = words[wi];
    const word = h("button", { class: "vb-he", type: "button", lang: "he", dir: "rtl", title: tr("Study this word", "Studiază cuvântul"), onclick: () => o.onWord(wi) });
    w.morphs.forEach((m, i) => word.append(h("span", { class: morphRole(w, i) }, cursive() ? stripPoints(stripCantillation(m)) : stripCantillation(m))));
    const parts = h("div", { class: "vb-parts" });
    w.morphs.forEach((m, i) => {
      const role = morphRole(w, i);
      const af = isAffix(w.tags[i]) ? affixIn(w.tags[i], w.codes[i]) : null;
      const p = parseMorph(w.codes[i]);
      const what = af ? [h("b", null, af[0]), h("div", { class: "parse" }, af[1])]
        : [h("b", null, capital(p.label)), p.conjHelp ? h("div", { class: "parse" }, capital(p.conjHelp)) : null];
      parts.append(h("div", { class: "morph-row " + role }, he(display(m, { cantillation: false, vowels: true })), h("div", { class: "what" }, what)));
    });
    list.append(h("li", { class: "vb-word" + (o.isNew(wi) ? " vb-new" : "") },
      h("div", { class: "vb-head" }, word, h("span", { class: "vb-tr", html: translit(wordTranslit(w, s), s, { heb: w.text }) }),
        iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableWord(w, s)))),
      h("div", { class: "vb-mean" }, o.meanings[wi] || ""), parts));
  }
  inner.append(list);
}

// ------------------------------------------------------------------ phrase

export function openPhrase(o) {
  const s = store.settings;
  const inner = shell();
  current = { type: "phrase", o };
  const text = o.words.map(w => stripCantillation(w.text) + (w.punct.includes("־") ? "־" : " ")).join("").trim();
  const trHtml = o.words.map(w => translit(wordTranslit(w, s), s, { heb: w.text })).join(" ");
  const trPlain = o.words.map(w => wordTranslit(w, s)).join(" ");
  const gloss = o.words.map(w => glossClean(w.gloss.join(" "))).join(" ");
  const speakText = o.words.map(w => speakableWord(w, s)).join(" ");
  inner.append(h("div", { class: "small muted" }, `${ctx.refText(o.book, o.ch, o.v)}, ` + tr("phrase of ", "expresie de ") + trn(o.words.length, "word", "words", "cuvânt", "cuvinte")));
  inner.append(heBig(text, "wp-word", { style: { fontSize: "36px" } }));
  inner.append(h("div", { class: "row", style: { justifyContent: "flex-end" } }, h("div", { class: "wp-tr", html: trHtml }), ...audioBtns(() => speakText)));
  inner.append(h("div", { class: "wp-gloss" }, lang() === "ro" ? (o.roText || gloss) : gloss));
  if (o.sideText && !(lang() === "ro" && o.sideName === "Cornilescu")) inner.append(h("div", { class: "wp-gloss" }, `${o.sideName}: `, h("b", { style: { color: "var(--ink)" } }, o.sideText)));
  const id = `P:${o.book}.${o.ch}.${o.v}.${o.from}-${o.to}`;
  const add = h("button", { class: "btn" + (store.hasCard(id) ? " on" : ""), type: "button", onclick: () => {
    if (store.hasCard(id)) return;
    store.addCard({ id, kind: "phrase", heb: text, translit: trPlain, gloss, glossRo: o.roText || "", ro: o.roText || "", en: o.enText || "",
      ctx: { b: o.book, c: o.ch, v: o.v, w: o.from, to: o.to } });
    add.classList.add("on"); add.lastChild.textContent = tr("Phrase in review", "Expresia e în recapitulare");
    toast(tr("Phrase added to review", "Expresia a fost adăugată la recapitulare"));
  } }, icon("plus"), store.hasCard(id) ? tr("Phrase in review", "Expresia e în recapitulare") : tr("Add phrase to review", "Adaugă expresia la recapitulare"));
  inner.append(h("div", { class: "wp-actions" }, add));
  const list = h("div", { class: "morphs" });
  o.words.forEach((w, i) => {
    list.append(h("div", { class: "morph-row" }, he(stripCantillation(w.text)),
      h("div", { class: "what" }, h("b", null, (o.wordMeanings && o.wordMeanings[i]) || glossClean(w.gloss.join(" "))), h("div", { class: "parse", html: translit(wordTranslit(w, s), s, { heb: w.text }) }), h("div", { class: "parse" }, shortParse(w.codes[w.main])))));
  });
  inner.append(h("div", { class: "wp-sec" }, h("h3", null, tr("Word by word", "Cuvânt cu cuvânt")), list));
}
