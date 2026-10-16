// Progress tab: coverage of the Old Testament, this week, easiest chapters, milestones, review history, reading path.

import { api, store, errText, dayStreak, hardCards } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, fmtInt, pct, fmtPct, today, heText, heClass, trt, dateKey } from "./ui.js";
import { tr, trn, roDe, L, meaning, lang } from "./i18n.js";
import { studyDate, dueAt } from "./fsrs.js";
import { stripCantillation, speakableLemma, speakableText } from "./hebrew.js";
import { speak } from "./audio.js";

let root;
let openBooks = new Set([0]);
let renderSeq = 0;

export const READING_PATH = [
  [0, 1, { en: "Creation. Very repetitive, a perfect first chapter", ro: "Creația. Foarte repetitiv, un prim capitol perfect" }],
  [0, 2, { en: "The garden", ro: "Grădina" }], [0, 3, { en: "The fall", ro: "Căderea" }],
  [31, 1, { en: "Jonah runs away", ro: "Iona fuge" }], [31, 2, { en: "Jonah's prayer", ro: "Rugăciunea lui Iona" }],
  [31, 3, { en: "Nineveh repents", ro: "Ninive se pocăiește" }], [31, 4, { en: "Jonah and the plant", ro: "Iona și curcubetele" }],
  [7, 1, { en: "Ruth and Naomi", ro: "Rut și Naomi" }], [7, 2, { en: "Ruth in the field", ro: "Rut în ogor" }],
  [7, 3, { en: "At the threshing floor", ro: "La arie" }], [7, 4, { en: "Redemption", ro: "Răscumpărarea" }],
  [0, 12, { en: "The call of Abram", ro: "Chemarea lui Avram" }], [0, 22, { en: "The binding of Isaac", ro: "Jertfirea lui Isaac" }],
  [18, 1, { en: "The two ways", ro: "Cele două căi" }], [18, 23, { en: "The LORD is my shepherd", ro: "Domnul este Păstorul meu" }],
  [18, 121, { en: "My help comes from the LORD", ro: "Ajutorul meu vine de la Domnul" }],
  [1, 20, { en: "The ten commandments", ro: "Cele zece porunci" }], [4, 6, { en: "Hear, O Israel", ro: "Ascultă, Israele" }],
  [8, 3, { en: "Samuel is called", ro: "Chemarea lui Samuel" }], [0, 37, { en: "Joseph and his brothers", ro: "Iosif și frații lui" }],
  [0, 45, { en: "Joseph makes himself known", ro: "Iosif se face cunoscut" }], [22, 53, { en: "The suffering servant", ro: "Robul suferind" }],
];

export function mount(el) { root = el; }
export function show() { render(); }

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function render() {
  const seq = ++renderSeq;
  clear(root);
  const page = h("div", { class: "page" });
  page.append(h("h1", null, tr("Progress", "Progres")));
  const known = store.knownKeys();
  const cards = Object.values(store.data.cards);
  const chaptersRead = Object.keys(store.data.read).length;
  const kpis = h("div", { class: "kpis" });
  page.append(kpis);
  root.append(page);

  let cov = null, freq = null;
  try {
    [cov, freq] = await Promise.all([api.post("coverage", { known: [...known] }), api.get("freqlist", { limit: 1000 })]);
  } catch (e) { page.append(h("p", { class: "muted" }, tr("Could not load coverage: ", "Nu am putut încărca acoperirea: ") + errText(e))); }
  if (seq !== renderSeq) return;

  const kpi = (n, label, title) => h("div", { class: "stat", title: title || null }, h("b", null, n), h("span", null, label));
  const ret = retention();
  const saved = Object.values(store.data.saved);
  kpis.append(
    kpi(fmtInt(known.size), tr("words known", "cuvinte știute")),
    kpi(cov ? fmtPct(cov.known, cov.total) + "%" : "–", tr("of all words in the OT are words you know", "din toate cuvintele din VT sunt cuvinte pe care le știi")),
    kpi(fmtInt(cards.length), tr("review cards", "cartonașe")),
    kpi(ret ? fmtPct(ret.right, ret.n) + "%" : "–", tr("of reviews remembered (30 days)", "din repetări ținute minte (30 de zile)"),
      ret ? tr(`${ret.right} of ${ret.n} reviews of cards you had learned before`, `${ret.right} din ${ret.n} ${roDe(ret.n)}repetări ale cartonașelor învățate deja`) : tr("Shown after 10 reviews", "Apare după 10 repetări")),
    kpi(fmtInt(chaptersRead), tr("chapters read", "capitole citite")),
    kpi(fmtInt(saved.filter(x => x && x.mastered).length), tr("verses by heart", "versete pe de rost")),
    kpi(fmtInt(dayStreak()), tr("day streak", "zile la rând")));

  // this week
  page.append(h("h2", null, tr("This week", "Săptămâna aceasta")));
  page.append(weekStrip());

  // what is coming up
  page.append(h("h2", null, tr("Coming up", "Ce urmează")));
  page.append(forecast(cards));

  // the words forgotten most often
  const hard = cards.filter(c => !c.suspended && (c.lapses || 0) >= 2).sort((a, b) => b.lapses - a.lapses || (b.difficulty || 0) - (a.difficulty || 0)).slice(0, 12);
  if (hard.length) {
    page.append(h("h2", null, tr("Words you find hardest", "Cuvintele cele mai grele pentru tine")));
    page.append(h("p", { class: "muted" }, tr("The cards you forgot most often. A note with a memory hook helps (add it on the card's answer side), and so does practising them on their own.",
      "Cartonașele uitate cel mai des. Te ajută o notiță cu un mic truc de memorare (o adaugi pe partea cu răspunsul) și exersarea lor separat.")));
    const list = h("div", { class: "hard-list" });
    for (const c of hard) {
      list.append(h("div", { class: "hard-row" },
        h("button", { class: "he-btn he" + heClass(), type: "button", lang: "he", title: tr("Listen", "Ascultă"), onclick: () => speak(c.kind === "lemma" ? speakableLemma(c.heb, c.key, store.settings) : speakableText(c.heb, store.settings)) }, heText(stripCantillation(c.heb))),
        h("span", null, meaning(c)),
        h("span", { class: "small muted" }, lang() === "ro" ? `uitat de ${c.lapses} ${roDe(c.lapses)}ori` : `forgotten ${c.lapses} times`)));
    }
    page.append(list, hardCards().length >= 4 ? h("div", { class: "row", style: { marginTop: "10px" } },
      h("button", { class: "btn", type: "button", onclick: () => ctx.navigate("review", { practice: "choice", source: "hard" }) }, icon("cards"), tr("Practise my hardest words", "Exersează cuvintele grele"))) : null);
  }

  // easiest chapters
  if (cov) {
    const easy = [];
    for (const b of cov.books) {
      b.chapters.forEach(([kn, tot], i) => {
        if (tot < 20 || store.data.read[`${b.idx}.${i + 1}`]) return;
        easy.push({ b: b.idx, c: i + 1, p: kn / tot });
      });
    }
    easy.sort((x, y) => y.p - x.p || x.b - y.b || x.c - y.c);
    page.append(h("h2", null, tr("Easiest chapters for you", "Cele mai ușoare capitole pentru tine")));
    page.append(h("p", { class: "muted" }, tr("Chapters you haven't marked as read, with the most words you already know. Reading them now is the quickest way to grow.",
      "Capitole pe care nu le-ai marcat ca citite, cu cele mai multe cuvinte pe care le știi deja. Citindu-le acum crești cel mai repede.")));
    const list = h("div", { class: "path-list" });
    for (const x of easy.slice(0, 8)) {
      list.append(h("div", { class: "path-item" },
        h("span", { class: "small muted" }, Math.round(x.p * 100) + "%"),
        h("span", null, h("b", null, ctx.refText(x.b, x.c))),
        h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b: x.b, c: x.c }) }, tr("Open", "Deschide"))));
    }
    page.append(list);
  }

  // milestones by frequency
  if (freq) {
    page.append(h("h2", null, tr("The most common words", "Cele mai folosite cuvinte")));
    page.append(h("p", { class: "muted" }, tr("A small set of words covers most of the text. Each bar shows how many of the most frequent words you know.",
      "Un număr mic de cuvinte acoperă cea mai mare parte din text. Fiecare bară arată câte dintre cele mai folosite cuvinte știi.")));
    const items = freq.items.filter(x => !/^H9/.test(x.key));
    const total = freq.total;
    const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 28px" } });
    for (const n of [50, 100, 250, 500, 1000]) {
      const top = items.slice(0, n);
      const k = top.filter(x => known.has(x.key)).length;
      const share = fmtPct(top.reduce((a, x) => a + x.freq, 0), total);
      grid.append(h("div", null,
        h("div", { class: "row" }, h("b", null, tr(`Top ${n}`, `Primele ${n}`)), h("span", { class: "spacer" }), h("span", null, `${k} / ${n}`)),
        h("div", { class: "meter", style: { margin: "6px 0" } }, h("i", { style: { width: (k / n * 100) + "%" } })),
        h("div", { class: "small muted" }, tr(`These ${fmtInt(n)} words are ${share}% of the Old Testament text.`, `Aceste ${fmtInt(n)} ${roDe(n)}cuvinte sunt ${share}% din textul Vechiului Testament.`))));
    }
    page.append(grid);
    const nextUp = items.filter(x => !known.has(x.key) && !store.hasCard("L:" + x.key)).slice(0, 10);
    if (nextUp.length) {
      page.append(h("div", { class: "row", style: { marginTop: "14px" } },
        h("span", { class: "muted" }, tr("Next most useful words: ", "Următoarele cele mai folositoare cuvinte: ")),
        ...nextUp.map(x => h("span", { class: "pill" + heClass(), lang: "he", style: { fontFamily: "var(--he-font)", fontSize: "17px" }, title: meaning(x) }, heText(x.hebrew))),
        h("button", { class: "btn small", type: "button", onclick: () => {
          store.addCards(nextUp.map(x => ({ id: "L:" + x.key, kind: "lemma", key: x.key, heb: x.hebrew, translit: x.translit, gloss: x.gloss, glossRo: x.glossRo || "" })));
          render();
        } }, icon("plus"), tr("Add these 10", "Adaugă aceste 10 cuvinte"))));
    }
  }

  // reviews chart
  page.append(h("h2", null, tr("Reviews in the last 30 days", "Repetări în ultimele 30 de zile")));
  page.append(h("div", { class: "chart" }, reviewChart()));
  const states = { new: 0, learning: 0, review: 0, mature: 0, paused: 0 };
  for (const c of cards) {
    if (c.suspended) states.paused++;
    else if (c.state === "new") states.new++;
    else if (c.state === "review" && c.kind === "lemma" && c.stability >= store.settings.autoKnownDays) states.mature++; // only these count as known
    else if (c.state === "review") states.review++;
    else states.learning++;
  }
  const d = store.settings.autoKnownDays;
  page.append(h("p", { class: "muted small" }, tr(
    `Cards: ${states.new} new, ${states.learning} learning, ${states.review} in review, ${states.mature} remembered for ${d}+ days (these count as known), ${states.paused} paused.`,
    `Cartonașe: ${states.new} noi, ${states.learning} în învățare, ${states.review} în recapitulare, ${states.mature} ținute minte ${d}+ ${roDe(d)}zile (se numără ca știute), ${states.paused} pe pauză.`)));

  // reading path
  page.append(h("h2", null, tr("Suggested reading path", "Drumul de citire sugerat")));
  page.append(h("p", { class: "muted" }, tr("Stories with simple, repeated words come first. Poetry and prophets later.", "Întâi povestirile cu cuvinte simple și repetate. Poezia și prorocii mai târziu.")));
  const path = h("div", { class: "path-list" });
  for (const [b, c, label] of READING_PATH) {
    const done = !!store.data.read[`${b}.${c}`];
    path.append(h("div", { class: "path-item" + (done ? " done" : "") },
      h("span", null, done ? icon("check") : ""),
      h("span", null, h("b", null, ctx.refText(b, c)), "  ", h("span", { class: "muted" }, L(label))),
      h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate("read", { b, c }) }, tr("Open", "Deschide"))));
  }
  page.append(path);

  // book coverage
  if (cov) {
    page.append(h("h2", null, tr("Coverage by book", "Acoperirea pe cărți")));
    page.append(h("p", { class: "muted" }, trt("How much of each book is made of words you know. Click a book to see its chapters; outlined chapters are ones you marked as read.",
      "Cât din fiecare carte e făcut din cuvinte pe care le știi. Apasă pe o carte ca să-i vezi capitolele; cele conturate sunt cele marcate ca citite.")));
    const list = h("div");
    const chapStrip = (b) => {
      const strip = h("div", { class: "chap-strip", style: { margin: "4px 0 12px 170px" } });
      b.chapters.forEach(([kn, tot], i) => {
        const cp = tot ? kn / tot : 0;
        const read = !!store.data.read[`${b.idx}.${i + 1}`];
        strip.append(h("i", { class: read ? "read" : "", title: tr(`${ctx.bookName(b.idx)} ${i + 1}: ${Math.round(cp * 100)}% known`, `${ctx.bookName(b.idx)} ${i + 1}: ${Math.round(cp * 100)}% știut`),
          style: { background: `color-mix(in srgb, var(--gold) ${Math.round(cp * 100)}%, var(--paper-2))` },
          onclick: () => ctx.navigate("read", { b: b.idx, c: i + 1 }) }));
      });
      return strip;
    };
    for (const b of cov.books) {
      const p = fmtPct(b.known, b.total);
      let strip = openBooks.has(b.idx) ? chapStrip(b) : null;
      // opening a book adds its chapters in place; rebuilding the page would jump back to the top
      const row = h("div", null,
        h("div", { class: "book-cov", style: { cursor: "pointer" }, onclick: () => {
          if (strip) { strip.remove(); strip = null; openBooks.delete(b.idx); }
          else { strip = chapStrip(b); row.append(strip); openBooks.add(b.idx); }
        } },
          h("span", null, ctx.bookName(b.idx)), h("div", { class: "meter" }, h("i", { style: { width: pct(b.known, b.total) + "%" } })), h("span", { class: "small muted" }, p + "%")));
      if (strip) row.append(strip);
      list.append(row);
    }
    page.append(list);
  }
}

// How many reviews of cards you had already learned were remembered in the last 30 days (null before 10 of them).
function retention() {
  const since = Date.now() - 30 * 86400000;
  let n = 0, right = 0;
  for (const x of store.data.log) {
    if (!x || !(x.t >= since) || x.st === "new" || x.st === "learning") continue;
    n++;
    if (x.g >= 2) right++;
  }
  return n >= 10 ? { n, right } : null;
}

// Reviews due on each of the next 14 study days (cards already due count for today), as bars.
function forecast(cards) {
  const days = [];
  const d = studyDate();
  for (let i = 0; i < 14; i++) { days.push({ k: dateKey(d), n: 0, label: i === 0 ? tr("today", "azi") : String(d.getDate()) }); d.setDate(d.getDate() + 1); }
  const index = new Map(days.map((x, i) => [x.k, i]));
  const now = Date.now();
  let later = 0;
  for (const c of cards) {
    if (c.suspended || c.state === "new") continue;
    const t = dueAt(c);
    const i = t <= now ? 0 : index.get(dateKey(studyDate(t)));
    if (i === undefined) later++; else days[i].n++;
  }
  const max = Math.max(5, ...days.map(x => x.n));
  const wrap = h("div", { class: "forecast", role: "img", "aria-label": tr("Reviews due in the next 14 days", "Repetări în următoarele 14 zile") });
  for (const x of days) {
    wrap.append(h("div", { class: "fc-day" + (x.k === today() ? " today" : ""), title: `${x.k}: ` + trn(x.n, "review", "reviews", "repetare", "repetări") },
      h("b", null, x.n ? String(x.n) : ""), h("div", { class: "fc-bar" }, h("i", { style: { height: Math.round((x.n / max) * 100) + "%" } })), h("span", null, x.label)));
  }
  const newWaiting = cards.filter(c => !c.suspended && c.state === "new").length;
  return h("div", null, wrap, h("p", { class: "small muted" }, tr(
    `Flashcard reviews due each day for the next two weeks (${later} later). `,
    `Repetările de cartonașe din fiecare zi a următoarelor două săptămâni (${later} mai târziu). `) +
    trn(newWaiting, "new card is waiting", "new cards are waiting", "cartonaș nou așteaptă", "cartonașe noi așteaptă") +
    tr(`, ${store.settings.newPerDay} a day.`, `, câte ${store.settings.newPerDay} pe zi.`)));
}

// Minutes and reviews for each of the last 7 days, against the daily goals.
function weekStrip() {
  const goalMin = store.settings.goalMinutes || 0;
  const goalRev = store.settings.goalReviews || 0;
  const days = [];
  const d = studyDate();
  d.setDate(d.getDate() - 6);
  const names = tr("Sun Mon Tue Wed Thu Fri Sat", "Dum Lun Mar Mie Joi Vin Sâm").split(" ");
  for (let i = 0; i < 7; i++) {
    const k = dayKey(d);
    const day = store.data.daily[k] || {};
    days.push({ k, label: names[d.getDay()], mins: Math.round((day.secs || 0) / 60), reviews: day.reviews || 0 });
    d.setDate(d.getDate() + 1);
  }
  const max = Math.max(goalMin || 1, ...days.map(x => x.mins));
  const wrap = h("div", { class: "week" });
  for (const x of days) {
    const met = goalMin && x.mins >= goalMin;
    wrap.append(h("div", { class: "week-day" + (x.k === today() ? " today" : "") + (met ? " met" : ""), title: `${x.mins} min, ` + trn(x.reviews, "review", "reviews", "repetare", "repetări") },
      h("div", { class: "week-bar" }, h("i", { style: { height: Math.round((x.mins / max) * 100) + "%" } })),
      h("b", null, x.mins + "′"), h("span", null, x.label)));
  }
  const t = days[days.length - 1];
  return h("div", null, wrap, h("p", { class: "small muted" }, tr(
    `Today: ${t.mins} of ${goalMin} minutes, ${t.reviews} of ${goalRev} reviews. Change the goals in Settings.`,
    `Azi: ${t.mins} din ${goalMin} ${goalMin === 1 ? "minut" : roDe(goalMin) + "minute"}, ${t.reviews} din ${goalRev} ${goalRev === 1 ? "repetare" : roDe(goalRev) + "repetări"}. Țintele le schimbi în Setări.`)));
}


function reviewChart() {
  const days = [];
  const d = studyDate();
  d.setDate(d.getDate() - 29);
  for (let i = 0; i < 30; i++) {
    const k = dayKey(d);
    const day = store.data.daily[k] || {};
    days.push({ k, n: day.reviews || 0, c: day.correct || 0, label: d.getDate() });
    d.setDate(d.getDate() + 1);
  }
  const max = Math.max(10, ...days.map(x => x.n));
  const W = 900, H = 170, pad = 24, bw = (W - pad * 2) / 30;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H + 24}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", tr("Reviews per day for the last 30 days", "Repetări pe zi în ultimele 30 de zile"));
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); svg.appendChild(e); return e; };
  mk("line", { x1: pad, x2: W - pad, y1: H, y2: H, stroke: "var(--rule)" });
  days.forEach((x, i) => {
    const bh = (x.n / max) * (H - 20);
    const ch = (x.c / max) * (H - 20);
    const r1 = mk("rect", { x: pad + i * bw + 3, y: H - bh, width: bw - 6, height: bh, rx: 2, fill: "var(--paper-2)" });
    const r2 = mk("rect", { x: pad + i * bw + 3, y: H - ch, width: bw - 6, height: ch, rx: 2, fill: x.k === today() ? "var(--lapis)" : "var(--gold)" });
    const t = document.createElementNS(NS, "title");
    t.textContent = tr(`${x.k}: ${x.n} reviews, ${x.c} remembered`, `${x.k}: ${x.n} repetări, ${x.c} ținute minte`);
    r1.appendChild(t); r2.appendChild(t.cloneNode(true));
    if (i % 5 === 4 || i === 29) {
      const tx = mk("text", { x: pad + i * bw + bw / 2, y: H + 17, "text-anchor": "middle", "font-size": "12", fill: "var(--ink-faint)" });
      tx.textContent = String(x.label);
    }
    if (x.n) {
      const tx = mk("text", { x: pad + i * bw + bw / 2, y: H - bh - 5, "text-anchor": "middle", "font-size": "11", fill: "var(--ink-soft)" });
      tx.textContent = String(x.n);
    }
  });
  return svg;
}
