// Grammar tab: lessons in English or Romanian, from the first vowel signs to Aramaic, with real examples pulled from the text.
// The lessons themselves live in web/js/lessons/, one file per part. Each lesson has a stable id; progress is saved as "grammar:<id>".

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, toast, shuffle, trt } from "./ui.js";
import { tr, bible } from "./i18n.js";
import { occItem } from "./wordpanel.js";
import { stripCantillation, escapeHtml } from "./hebrew.js";
import { PARTS } from "./lessons/index.js";

let root, current = 0;

// Every lesson in order, with the part it belongs to.
const LESSONS = [];
PARTS.forEach((P, pi) => P.lessons.forEach(L => LESSONS.push(Object.assign({ part: pi }, L))));
const INDEX = new Map(LESSONS.map((L, i) => [L.id, i]));

// Lessons were once saved by their position ("grammar:0" … "grammar:18"). Those keys are moved to the ids once.
const OLD_ORDER = ["word-built", "read-verse", "prefixes", "article", "nouns", "construct", "suffixes", "pronouns", "numbers",
  "stems", "perfect-imperfect", "wayyiqtol", "commands", "infinitives", "charts", "small-words", "accents", "divine-name", "aramaic"];
function migrate() {
  const path = store.data.path || (store.data.path = {});
  let changed = false;
  OLD_ORDER.forEach((id, i) => {
    const old = path["grammar:" + i];
    if (old) { if (!path["grammar:" + id]) path["grammar:" + id] = old; delete path["grammar:" + i]; changed = true; }
  });
  if (changed) store.changed("path");
}

export const lessonKey = (id) => "grammar:" + id;
// Titles mix Hebrew words with Latin text and commas. Each Hebrew run is isolated (RLI … PDI) so that the commas and
// colons around it keep their left-to-right places, in buttons, headings and <option> text alike.
const bidi = (s) => String(s).replace(/[\u0590-\u05FF][\u0590-\u05FF\u05BE\u05C7]*/g, (m) => "\u2067" + m + "\u2069");
export const lessonCount = () => LESSONS.length;
export const doneCount = () => LESSONS.filter(L => (store.data.path || {})[lessonKey(L.id)]).length;
export const firstLessonTitle = () => LESSONS[0].title();
// The title of a lesson by its id ("" if there is none), ready to show next to other text.
export function lessonTitle(id) { const i = INDEX.get(id); return i === undefined ? "" : bidi(LESSONS[i].title()); }
// The first lesson not marked as done: { id, n (its number), title }, or null when all are done.
export function nextLesson() {
  migrate();
  const done = store.data.path || {};
  const i = LESSONS.findIndex(L => !done[lessonKey(L.id)]);
  return i < 0 ? null : { id: LESSONS[i].id, n: i + 1, title: bidi(LESSONS[i].title()) };
}

export function mount(el) { root = el; }
export function show(params = {}) {
  migrate();
  if (typeof params.lesson === "string" && INDEX.has(params.lesson)) current = INDEX.get(params.lesson);
  else if (typeof params.lesson === "number" && LESSONS[params.lesson]) current = params.lesson;
  render();
}

function render() {
  clear(root);
  const done = store.data.path || {};
  const isDoneAt = (i) => !!done[lessonKey(LESSONS[i].id)];
  const go = (i) => { current = i; render(); root.scrollTop = 0; };
  const wrap = h("div", { class: "grammar" });
  const list = h("nav", { class: "lesson-list", "aria-label": tr("Lessons", "Lecții") });
  const n = doneCount();
  list.append(h("div", { class: "lesson-progress small muted" }, tr(`${n} of ${LESSONS.length} lessons done`, `${n} din ${LESSONS.length} lecții terminate`)));
  PARTS.forEach((P, pi) => {
    list.append(h("div", { class: "lesson-part" }, P.title()));
    LESSONS.forEach((L, i) => {
      if (L.part !== pi) return;
      list.append(h("button", { type: "button", class: (i === current ? "on" : "") + (isDoneAt(i) ? " done" : ""), onclick: () => go(i) },
        h("span", { class: "n" }, isDoneAt(i) ? "✓" : String(i + 1)), h("span", null, bidi(L.title()))));
    });
  });
  const L = LESSONS[current];
  const lesson = h("article", { class: "lesson" },
    h("div", { class: "small muted lesson-where" }, `${PARTS[L.part].title()} · ${tr("Lesson", "Lecția")} ${current + 1} ${tr("of", "din")} ${LESSONS.length}`),
    h("h1", null, bidi(L.title())), ...L.body());
  if (L.search) lesson.append(liveExamples(L));
  const isDone = isDoneAt(current);
  lesson.append(h("div", { class: "row", style: { marginTop: "26px" } },
    h("button", { class: "btn" + (isDone ? " on" : ""), type: "button", onclick: () => {
      if (isDone) delete store.data.path[lessonKey(L.id)]; else store.data.path[lessonKey(L.id)] = Date.now();
      store.changed("path");
      if (!isDone) toast(tr("Lesson marked as done", "Lecție marcată ca terminată"));
      render();
    } }, icon("check"), isDone ? tr("Done", "Terminată") : tr("Mark lesson as done", "Marchează lecția ca terminată"))));
  lesson.append(h("div", { class: "row", style: { marginTop: "18px" } },
    current > 0 ? h("button", { class: "btn", type: "button", onclick: () => go(current - 1) }, icon("left"), bidi(LESSONS[current - 1].title())) : null,
    h("div", { class: "spacer" }),
    current < LESSONS.length - 1 ? h("button", { class: "btn primary", type: "button", onclick: () => go(current + 1) }, bidi(LESSONS[current + 1].title()), icon("right")) : null));
  // phones: a drop-down instead of the long list of lesson buttons (CSS shows one or the other)
  const sel = h("select", { class: "lesson-select", "aria-label": tr("Lessons", "Lecții"), onchange: (e) => go(Number(e.target.value)) },
    PARTS.map((P, pi) => h("optgroup", { label: P.title() },
      LESSONS.map((L, i) => L.part === pi ? h("option", { value: i, selected: i === current }, `${i + 1}. ${bidi(L.title())}${isDoneAt(i) ? " ✓" : ""}`) : null))));
  wrap.append(sel, list, lesson);
  root.append(wrap);
  // keep the chosen lesson visible in the (scrollable) list of lessons
  const on = list.querySelector("button.on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "center" });
}

// Verses already shown under each lesson (per book choice), so "Show examples" brings new ones each time until the
// lesson runs out of verses, and only then starts over.
const shownExamples = new Map();
const exampleKey = (it) => `${it.book}.${it.ch}.${it.v}`;
function freshExamples(id, all, n) {
  // one example per verse
  const byVerse = new Map();
  for (const it of all) if (!byVerse.has(exampleKey(it))) byVerse.set(exampleKey(it), it);
  const items = [...byVerse.values()];
  let seen = shownExamples.get(id);
  if (!seen) shownExamples.set(id, seen = new Set());
  let pick = shuffle(items.filter(it => !seen.has(exampleKey(it)))).slice(0, n);
  if (pick.length < n) {
    // a new round: what was left, then verses from the start again (not the ones just picked)
    seen.clear();
    pick = pick.concat(shuffle(items.filter(it => !pick.includes(it))).slice(0, n - pick.length));
  }
  for (const it of pick) seen.add(exampleKey(it));
  return items.filter(it => pick.includes(it)); // in Bible order
}

function liveExamples(L) {
  const box = h("div", { class: "examples-live" });
  const list = h("div");
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea") }, h("option", { value: "" }, tr("Whole Old Testament", "Tot Vechiul Testament")), ctx.books.map(b => h("option", { value: b.idx }, ctx.bookName(b.idx))));
  let seq = 0;
  let mode = "examples"; // what a change of book reloads: the examples or the quiz
  const fetchItems = () => api.get("morphsearch", { re: L.search, limit: 60, book: bookSel.value, t: bible() });
  const load = async () => {
    mode = "examples";
    const my = ++seq;
    clear(list);
    list.append(h("div", { class: "muted small" }, tr("Finding examples…", "Caut exemple…")));
    try {
      // ask for more than are shown, and show the ones not seen yet
      const res = await fetchItems();
      if (my !== seq) return;
      clear(list);
      if (!res.items.length) list.append(h("div", { class: "muted" }, tr("No examples in this book.", "Nu sunt exemple în această carte.")));
      for (const it of freshExamples(L.id + "|" + bookSel.value, res.items, 8)) list.append(occItem(it, (x) => ctx.navigate("read", { b: x.book, c: x.ch, v: x.v, w: x.w })));
    } catch (e) { if (my === seq) { clear(list); list.append(h("div", { class: "muted" }, tr("Could not find examples: ", "Nu am putut găsi exemple: ") + errText(e))); } }
  };
  const quiz = async () => {
    mode = "quiz";
    const my = ++seq;
    clear(list);
    list.append(h("div", { class: "muted small" }, tr("Finding verses…", "Caut versete…")));
    let res;
    try { res = await fetchItems(); } catch (e) {
      if (my === seq) { clear(list); list.append(h("div", { class: "muted" }, tr("Could not find verses: ", "Nu am putut găsi versete: ") + errText(e))); }
      return;
    }
    if (my !== seq) return;
    const qs = await spotQuestions(L, res.items, () => my === seq);
    if (my !== seq) return;
    clear(list);
    if (qs.length < 3) {
      list.append(h("div", { class: "muted" }, tr("Not enough verses for a quiz in this book. Try the whole Old Testament.", "Nu sunt destule versete pentru un test în această carte. Încearcă tot Vechiul Testament.")));
      return;
    }
    runSpot(L, qs.slice(0, 8), list, () => my === seq && list.isConnected, quiz);
  };
  box.append(h("h2", null, tr("Find it in the Bible", "Găsește în Biblie")),
    h("div", { class: "row", style: { marginBottom: "10px" } }, h("span", { class: "muted" }, tr("Random verses with ", "Versete la întâmplare cu ") + L.searchLabel()), bookSel,
      h("button", { class: "btn", type: "button", onclick: load }, icon("shuffle"), tr("Show examples", "Arată exemple")),
      h("button", { class: "btn", type: "button", title: trt("Click the word that shows what this lesson teaches", "Apasă pe cuvântul care arată ce te învață lecția"), onclick: quiz }, icon("star"), tr("Quiz me", "Testează-mă"))), list);
  bookSel.onchange = () => (mode === "quiz" ? quiz() : load());
  return box;
}

// ------------------------------------------------------------------ quiz: find the form in a verse

// A word of a search result as shown: no accents, no "/" between its parts, no paragraph letter after the verse end.
const spotWord = (w) => stripCantillation(String(w || "").replace(/\//g, "")).replace(/\s+[ספ]\s*$/, "").trim();

// The full grammar code of a word as the server's search sees it: "HC/Td/Ncfsa" -> "HC/HTd/HNcfsa".
function fullCode(p) {
  const raw = String(p[4] || "");
  const lang = raw[0] || "H";
  return raw.slice(1).split("/").map(c => lang + c).join("/");
}

// One question per verse. The search returns one random match per row, so a verse with two matching words may come
// with only one of them; each verse is loaded and every word in it that matches the lesson's form counts as right.
// Verses where most of the words match (all of an Aramaic passage, say) would be no question at all, so they are left out.
async function spotQuestions(L, items, alive) {
  let re;
  try { re = new RegExp(L.search); } catch (_) { return []; }
  const verses = [];
  const seen = new Set();
  for (const it of shuffle(items)) {
    const k = exampleKey(it);
    if (!seen.has(k)) { seen.add(k); verses.push(it); }
  }
  const out = [];
  for (let i = 0; i < verses.length && out.length < 8; i += 6) {
    const batch = verses.slice(i, i + 6);
    const res = await Promise.all(batch.map(it => api.get("verse", { b: it.book, c: it.ch, v: it.v }).catch(() => null)));
    if (!alive()) return [];
    res.forEach((r, j) => {
      if (!r || !r.verse || !Array.isArray(r.verse[4])) return;
      const it = batch[j];
      const packed = r.verse[4];
      const words = packed.map(p => String(p[0] || "") + String(p[7] || ""));
      const hits = new Set();
      let real = 0;
      packed.forEach((p, wi) => {
        if (!spotWord(words[wi])) return;
        real++;
        if ((p[8] || {}).x !== "X" && re.test(fullCode(p))) hits.add(wi);
      });
      if (Number.isInteger(it.w) && spotWord(words[it.w])) hits.add(it.w); // the server's own match always counts
      if (!hits.size || real < 3 || hits.size > Math.floor(real / 2)) return;
      // the words of the Bible version (the one the search used) that translate the answers
      const ver = it.t === "kjv" && r.en ? "kjv" : "ro";
      const links = (ver === "kjv" ? (store.alignFor(it.book, it.ch, it.v, "kjv") || (r.en && r.en[2])) : (store.alignFor(it.book, it.ch, it.v, "ro") || r.verse[5])) || [];
      const sideHits = new Set();
      for (let x = 0; x + 2 < links.length; x += 3) if (hits.has(links[x + 1])) sideHits.add(links[x]);
      out.push({ it, words, hits, sideHits });
    });
  }
  return out;
}

// The verse in the Bible version with the words that translate the answer marked (after the answer is given).
function markedSide(it, hits) {
  const text = it.text || "";
  let html = "", pos = 0;
  for (let i = 0; i < (it.tok || []).length; i += 2) {
    const a = it.tok[i], b = it.tok[i + 1];
    html += escapeHtml(text.slice(pos, a));
    const word = escapeHtml(text.slice(a, b));
    html += hits.has(i / 2) ? "<mark>" + word + "</mark>" : word;
    pos = b;
  }
  return html + escapeHtml(text.slice(pos));
}

function runSpot(L, qs, list, alive, again) {
  let i = 0, right = 0;
  const step = () => {
    if (!alive()) return;
    clear(list);
    if (i >= qs.length) return finish();
    const q = qs[i];
    const it = q.it;
    let answered = false;
    const words = h("div", { class: "spot-words", lang: "he", dir: "rtl" });
    const btns = q.words.map((w, wi) => {
      const t = spotWord(w);
      if (!t) return null;
      const b = h("button", { type: "button", class: "spot-w", onclick: () => pick(wi, b) }, t);
      words.append(b, " ");
      return b;
    });
    const side = h("div", { class: "spot-side muted", lang: it.t === "kjv" ? "en" : "ro" }, it.text || "");
    const after = h("div", { class: "row spot-after" });
    list.append(h("div", { class: "spot-card" },
      h("div", { class: "row small muted" }, h("span", null, ctx.refText(it.book, it.ch, it.v)), h("span", { class: "spacer" }), h("span", null, `${i + 1} / ${qs.length}`)),
      h("div", { class: "spot-prompt" }, trt("Click the word that matches: ", "Apasă pe cuvântul potrivit: "), h("b", null, L.searchLabel())),
      words, side, after));
    function pick(wi, b) {
      if (answered) return;
      answered = true;
      const ok = q.hits.has(wi);
      if (ok) right++;
      b.classList.add(ok ? "right" : "wrong");
      for (const hi of q.hits) if (btns[hi]) btns[hi].classList.add("right");
      for (const x of btns) if (x) x.setAttribute("aria-disabled", "true");
      side.innerHTML = markedSide(it, q.sideHits);
      const first = [...q.hits].sort((a, c) => a - c)[0];
      after.append(
        h("b", { class: ok ? "spot-ok" : "spot-no" }, ok ? tr("Right", "Corect") : tr("Not this one. The marked word is the one.", "Nu acesta. Cuvântul marcat este cel căutat.")),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b: it.book, c: it.ch, v: it.v, w: first }) }, icon("book"), tr("Open in reader", "Deschide în cititor")),
        h("button", { class: "btn small primary", type: "button", onclick: () => { i++; step(); } }, i + 1 < qs.length ? tr("Next", "Următoarea") : tr("See the result", "Vezi rezultatul"), icon("right")));
    }
  };
  const finish = () => {
    const done = !!(store.data.path || {})[lessonKey(L.id)];
    const good = right >= Math.ceil(qs.length * 0.8);
    list.append(h("div", { class: "spot-card spot-result" },
      h("div", { class: "big" }, tr(`${right} of ${qs.length} right`, `${right} din ${qs.length} corecte`)),
      h("p", { class: "muted" }, good ? tr("You can spot this form in the text.", "Recunoști forma aceasta în text.") : tr("Read the lesson again and look at a few examples, then try once more.", "Mai citește o dată lecția și uită-te la câteva exemple, apoi încearcă din nou.")),
      h("div", { class: "row", style: { justifyContent: "center" } },
        h("button", { class: "btn", type: "button", onclick: again }, icon("shuffle"), tr("New quiz", "Alt test")),
        good && !done ? h("button", { class: "btn primary", type: "button", onclick: () => {
          store.data.path[lessonKey(L.id)] = Date.now();
          store.changed("path");
          toast(tr("Lesson marked as done", "Lecție marcată ca terminată"));
          render();
        } }, icon("check"), tr("Mark lesson as done", "Marchează lecția ca terminată")) : null)));
  };
  step();
}
