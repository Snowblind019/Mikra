// Today tab: daily goal, where to continue, reviews due, a word of the day, easy chapters, and a guided path for beginners.

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, heBig, toast, fmtInt, today, pct } from "./ui.js";
import { tr, trn, times, roDe, lang, meaning } from "./i18n.js";
import { translit, lemmaTranslit, speakableLemma } from "./hebrew.js";
import { speak } from "./audio.js";
import { isDue, studyDate } from "./fsrs.js";

let root;
let seq = 0;

export function mount(el) { root = el; }
export function show() { render(); }

// Coming back to the app the next day must not leave yesterday's date, goals and counts on screen.
function onVisible() { if (document.visibilityState === "visible" && root && !root.hidden) render(); }
document.addEventListener("visibilitychange", onVisible);

function dueCount() {
  const now = Date.now();
  let due = 0, fresh = 0;
  for (const c of Object.values(store.data.cards)) {
    if (c.suspended) continue;
    if (c.state === "new") fresh++;
    else if (isDue(c, now)) due++;
  }
  const newSeen = (store.data.daily[today()] || {}).newSeen || 0;
  return { due, fresh: Math.min(fresh, Math.max(0, store.settings.newPerDay - newSeen)) };
}

function ring(value, goal, label, unit) {
  const p = goal ? Math.min(1, value / goal) : 0;
  const R = 34, C = 2 * Math.PI * R;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 84 84");
  svg.setAttribute("class", "ring");
  svg.setAttribute("aria-hidden", "true");
  const c1 = document.createElementNS(NS, "circle");
  for (const [k, v] of Object.entries({ cx: 42, cy: 42, r: R, fill: "none", stroke: "var(--paper-2)", "stroke-width": 8 })) c1.setAttribute(k, v);
  const c2 = document.createElementNS(NS, "circle");
  for (const [k, v] of Object.entries({ cx: 42, cy: 42, r: R, fill: "none", stroke: p >= 1 ? "var(--green)" : "var(--gold)", "stroke-width": 8,
    "stroke-linecap": "round", "stroke-dasharray": `${C * p} ${C}`, transform: "rotate(-90 42 42)" })) c2.setAttribute(k, v);
  svg.append(c1, c2);
  return h("div", { class: "goal" }, h("div", { class: "ring-wrap" }, svg, h("b", null, String(value))),
    h("div", null, h("div", { class: "goal-label" }, label), h("div", { class: "small muted" }, goal ? tr(`goal ${goal} ${unit}`, `ținta: ${goal} ${unit}`) : tr("no goal set", "fără țintă"))));
}

async function render() {
  const my = ++seq;
  clear(root);
  const s = store.settings;
  const page = h("div", { class: "page today" });
  const day = store.data.daily[today()] || {};
  const mins = Math.round((day.secs || 0) / 60);
  const reviews = day.reviews || 0;
  const dateStr = new Date().toLocaleDateString(lang() === "ro" ? "ro-RO" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  page.append(h("h1", null, tr("Today", "Azi")), h("p", { class: "lede" }, dateStr.charAt(0).toUpperCase() + dateStr.slice(1)));

  // goals
  page.append(h("div", { class: "goals" },
    ring(mins, s.goalMinutes, tr("Minutes of study", "Minute de studiu"), tr("min", "min")),
    ring(reviews, s.goalReviews, tr("Flashcard reviews", "Repetări de cartonașe"),
      s.goalReviews === 1 ? tr("review", "repetare") : tr("reviews", roDe(s.goalReviews) + "repetări"))));

  // what to do next
  const tiles = h("div", { class: "tiles" });
  const pos = store.data.pos || { b: 0, c: 1 };
  const started = Object.keys(store.data.read).length || (pos.b !== 0 || pos.c !== 1);
  tiles.append(tile(icon("book"), started ? tr("Continue reading", "Continuă lectura") : tr("Start reading", "Începe lectura"),
    ctx.refText(pos.b, pos.c), tr("Open", "Deschide"), () => ctx.navigate("read", { b: pos.b, c: pos.c })));
  const { due, fresh } = dueCount();
  tiles.append(tile(icon("star"), tr("Review", "Recapitulare"),
    due + fresh ? tr(`${due} due, ${fresh} new`, `${due} de repetat, ${fresh} noi`) : (Object.keys(store.data.cards).length ? tr("All done for now", "Gata pentru acum") : tr("No cards yet: add a word deck", "Încă nu ai cartonașe: adaugă un pachet")),
    due + fresh ? tr("Start", "Începe") : tr("Open", "Deschide"), () => ctx.navigate("review")));
  const savedN = Object.keys(store.data.saved).length;
  tiles.append(tile(icon("pen"), tr("Verses by heart", "Versete pe de rost"),
    savedN ? trn(savedN, "saved verse", "saved verses", "verset salvat", "versete salvate") : tr("Save a verse in the reader with the star", "Salvează un verset în cititor cu steaua"),
    tr("Practice", "Exersează"), () => ctx.navigate("words", { tab: "verses" })));
  page.append(tiles);

  // word of the day + easiest chapters (need the server)
  const wotd = h("div", { class: "wotd" });
  const easy = h("div");
  page.append(h("div", { class: "today-grid" },
    h("section", null, h("h2", null, tr("Word of the day", "Cuvântul zilei")), wotd),
    h("section", null, h("h2", null, tr("Easiest chapters for you", "Cele mai ușoare capitole pentru tine")), easy)));

  // guided path
  page.append(guidedPath());
  root.append(page);

  let freq, cov;
  try { [freq, cov] = await Promise.all([api.get("freqlist", { limit: 1500 }), api.post("coverage", { known: [...store.knownKeys()] })]); }
  catch (e) { return; }
  if (my !== seq) return;
  fillWord(wotd, freq.items);
  fillEasy(easy, cov);
}

function tile(ic, title, sub, btn, onClick) {
  return h("div", { class: "tile" }, h("div", { class: "tile-ic" }, ic), h("div", { class: "tile-body" }, h("b", null, title), h("span", { class: "muted small" }, sub)),
    h("button", { class: "btn small", type: "button", onclick: onClick }, btn));
}

// The most useful word you don't know yet, picked the same way for the whole day.
function fillWord(box, items) {
  const known = store.knownKeys();
  const cand = items.filter(x => !/^H9/.test(x.key) && !known.has(x.key) && !store.hasCard("L:" + x.key) && meaning(x));
  if (!cand.length) { box.append(h("p", { class: "muted" }, tr("You know all the common words. Well done!", "Știi toate cuvintele des întâlnite. Bravo!"))); return; }
  const d = studyDate();
  const pick = cand[(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % Math.min(cand.length, 40)];
  const s = store.settings;
  const say = () => speak(speakableLemma(pick.hebrew, pick.key, s));
  box.append(heBig(pick.hebrew, "big-he"),
    h("div", { class: "row", style: { justifyContent: "center" } }, h("span", { class: "tr", html: translit(lemmaTranslit(pick.translit, pick.key, s), s) }), iconBtn("speaker", tr("Listen", "Ascultă"), say)),
    h("div", { class: "gloss" }, meaning(pick)),
    h("div", { class: "small muted", style: { textAlign: "center" } }, tr(`Appears ${times(pick.freq)} in the Old Testament.`, `Apare ${times(pick.freq)} în Vechiul Testament.`)),
    h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } },
      h("button", { class: "btn small primary", type: "button", onclick: (e) => {
        store.addCard({ id: "L:" + pick.key, kind: "lemma", key: pick.key, heb: pick.hebrew, translit: pick.translit, gloss: pick.gloss, glossRo: pick.glossRo || "" });
        e.currentTarget.replaceWith(h("span", { class: "pill review" }, tr("in review", "în recapitulare")));
        toast(tr("Added to review", "Adăugat la recapitulare"));
      } }, icon("plus"), tr("Add to review", "Adaugă la recapitulare")),
      h("button", { class: "btn small", type: "button", onclick: async () => {
        try {
          const occ = await api.get("occ", { k: pick.key, limit: 1 });
          const it = occ.items[0];
          if (it) ctx.navigate("read", { b: it.book, c: it.ch, v: it.v, w: it.w });
        } catch (e) { toast(errText(e)); }
      } }, icon("book"), tr("See it in a verse", "Vezi-l într-un verset"))));

}

function fillEasy(box, cov) {
  const list = [];
  for (const b of cov.books) {
    b.chapters.forEach(([kn, tot], i) => {
      if (tot < 20 || store.data.read[`${b.idx}.${i + 1}`]) return;
      list.push({ b: b.idx, c: i + 1, p: kn / tot });
    });
  }
  list.sort((x, y) => y.p - x.p || x.b - y.b || x.c - y.c);
  if (!list.length) return;
  if (list[0].p === 0) {
    box.append(h("p", { class: "muted" }, tr("As you learn words, this shows the chapters where you already know the most. Start with the suggested path below.",
      "Pe măsură ce înveți cuvinte, aici apar capitolele în care știi deja cele mai multe. Începe cu pașii de mai jos.")));
    return;
  }
  box.append(h("p", { class: "small muted" }, tr("The chapters you haven't read yet where you already know the most words.", "Capitolele necitite încă în care știi deja cele mai multe cuvinte.")));
  const ul = h("div", { class: "path-list" });
  for (const x of list.slice(0, 5)) {
    ul.append(h("div", { class: "path-item" },
      h("span", { class: "small muted" }, Math.round(x.p * 100) + "%"),
      h("span", null, h("b", null, ctx.refText(x.b, x.c))),
      h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b: x.b, c: x.c }) }, tr("Read", "Citește"))));
  }
  box.append(ul);
}

// Start here: a short path from the alphabet to reading and memorizing. Steps tick themselves off.
function guidedPath() {
  const d = store.data;
  const totalReviews = Object.values(d.daily).reduce((a, x) => a + ((x && x.reviews) || 0), 0);
  const steps = [
    [!!d.path.letters, tr("Learn the 22 letters", "Învață cele 22 de litere"), tr("Alphabet, then the letter drills (20 answers, 80% right).", "Alfabetul, apoi exercițiile cu litere (20 de răspunsuri, 80% corecte)."), () => ctx.navigate("alphabet", { sub: "letters" })],
    [!!d.path.vowels, tr("Learn the vowels", "Învață vocalele"), tr("Alphabet, Vowels, then the vowel reading drill.", "Alfabet, Vocale, apoi exercițiul Citirea vocalelor."), () => ctx.navigate("alphabet", { sub: "vowels" })],
    [!!(d.path["grammar:word-built"] || d.path["grammar:0"]), tr("How a Hebrew word is built", "Cum e alcătuit un cuvânt ebraic"), tr("The first grammar lesson: prefixes, root, endings.", "Prima lecție de gramatică: prefixe, rădăcină, terminații."), () => ctx.navigate("grammar", { lesson: "word-built" })],
    [Object.keys(d.cards).length >= 20, tr("Add your first word deck", "Adaugă primul pachet de cuvinte"), tr("Review, Word decks: start with the 100 most common words.", "Recapitulare, Pachete de cuvinte: începe cu cele mai folosite 100 de cuvinte."), () => ctx.navigate("review")],
    [totalReviews > 0, tr("Do your first review", "Fă prima recapitulare"), tr("A few minutes of flashcards every day is the secret.", "Câteva minute de cartonașe pe zi, acesta e secretul."), () => ctx.navigate("review")],
    [!!d.read["0.1"], tr("Read Genesis 1 with help", "Citește Geneza 1 cu ajutor"), tr("Turn on pronunciation and meaning under the words (View), then mark the chapter as read.", "Pornește pronunția și înțelesul sub cuvinte (Afișare), apoi marchează capitolul ca citit."), () => ctx.navigate("read", { b: 0, c: 1 })],
    [store.knownKeys().size >= 100, tr("Know 100 words", "Ajungi la 100 de cuvinte știute"), tr(`You know ${store.knownKeys().size} now. Cards you remember for a few weeks count as known.`, `Acum știi ${store.knownKeys().size}. Cartonașele ținute minte câteva săptămâni se numără ca știute.`), () => ctx.navigate("progress")],
    [Object.values(d.saved).some(x => x && (x.mastered || x.level >= 3)), tr("Learn a verse by heart", "Învață un verset pe de rost"), tr("Save Genesis 1:1 with the star in the reader, then practice it in My words.", "Salvează Geneza 1:1 cu steaua din cititor, apoi exersează-l în Cuvintele mele."), () => ctx.navigate("read", { b: 0, c: 1, v: 1 })],
  ];
  const done = steps.filter(x => x[0]).length;
  const sec = h("section", { class: "guided" });
  sec.append(h("div", { class: "row" }, h("h2", { style: { margin: 0 } }, tr("Start here", "Începe de aici")), h("span", { class: "spacer" }),
    h("span", { class: "muted small" }, tr(`${done} of ${steps.length} done`, `${done} din ${steps.length} făcute`))));
  sec.append(h("div", { class: "meter", style: { maxWidth: "420px", margin: "8px 0 14px" } }, h("i", { style: { width: pct(done, steps.length) + "%" } })));
  const list = h("ol", { class: "steps" });
  let nextShown = false;
  for (const [ok, title, hint, go] of steps) {
    const isNext = !ok && !nextShown;
    if (isNext) nextShown = true;
    list.append(h("li", { class: (ok ? "done" : "") + (isNext ? " next" : "") },
      h("span", { class: "step-mark" }, ok ? icon("check") : ""),
      h("div", { class: "step-body" }, h("b", null, title), h("div", { class: "small muted" }, hint)),
      ok ? null : h("button", { class: "btn small" + (isNext ? " primary" : ""), type: "button", onclick: go }, tr("Go", "Mergi"))));
  }
  sec.append(list);
  return sec;
}
