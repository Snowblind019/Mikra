// Grammar tab: lessons in English or Romanian, from the first vowel signs to Aramaic, with real examples pulled from the text.
// The lessons themselves live in web/js/lessons/, one file per part. Each lesson has a stable id; progress is saved as "grammar:<id>".

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, toast } from "./ui.js";
import { tr, bible } from "./i18n.js";
import { occItem } from "./wordpanel.js";
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

function liveExamples(L) {
  const box = h("div", { class: "examples-live" });
  const list = h("div");
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea") }, h("option", { value: "" }, tr("Whole Old Testament", "Tot Vechiul Testament")), ctx.books.map(b => h("option", { value: b.idx }, ctx.bookName(b.idx))));
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    clear(list);
    list.append(h("div", { class: "muted small" }, tr("Finding examples…", "Caut exemple…")));
    try {
      const res = await api.get("morphsearch", { re: L.search, limit: 8, book: bookSel.value, t: bible() });
      if (my !== seq) return;
      clear(list);
      if (!res.items.length) list.append(h("div", { class: "muted" }, tr("No examples in this book.", "Nu sunt exemple în această carte.")));
      for (const it of res.items) list.append(occItem(it, (x) => ctx.navigate("read", { b: x.book, c: x.ch, v: x.v, w: x.w })));
    } catch (e) { if (my === seq) { clear(list); list.append(h("div", { class: "muted" }, tr("Could not find examples: ", "Nu am putut găsi exemple: ") + errText(e))); } }
  };
  box.append(h("h2", null, tr("Find it in the Bible", "Găsește în Biblie")),
    h("div", { class: "row", style: { marginBottom: "10px" } }, h("span", { class: "muted" }, tr("Random verses with ", "Versete la întâmplare cu ") + L.searchLabel()), bookSel,
      h("button", { class: "btn", type: "button", onclick: load }, icon("shuffle"), tr("Show examples", "Arată exemple"))), list);
  bookSel.onchange = load;
  return box;
}
