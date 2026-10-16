// Review tab: spaced-repetition flashcards, ready-made word decks, and practice games
// (choice, listening, typing, words in their verse, matching, hear and repeat, free flip).

import { api, store, errText, dayStreak, hardCards, LEECH } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, he, heBig, heText, heClass, toast, shuffle, deck, deckFor, choiceSeg, fmtInt, today, relDays, modal, isTouch, trt, debounce } from "./ui.js";
import { tr, trn, times, lang, bible, meaning, cursive } from "./i18n.js";
import { schedule, preview, isDue, dueAt } from "./fsrs.js";
import { translit, wordTranslit, lemmaTranslit, stripCantillation, stripPoints, consonants, unpack, glossClean, escapeHtml, speakableLemma, speakableWord, speakableText, shortParse, KEYBOARD, latinToHebrew,
  parseMorph, verbLabel, affixIn, isAffix, morphRole } from "./hebrew.js";
import { speak, stop as stopAudio } from "./audio.js";
import { READING_PATH } from "./progress.js";
import { lessonTitle } from "./grammar.js";

let root;
let session = null;
let keyHandler = null;
let poolSource = null;
let startToken = 0;       // a practice set that is still loading is dropped if another one was started meanwhile
let nextCleanup = null;   // removes the "click anywhere to continue" listener

// The home page counts what is due when it is drawn; redraw it when the app comes back (e.g. the next morning).
function onVisible() {
  if (document.visibilityState === "visible" && root && !root.hidden && !session && root.querySelector(".review-home")) home();
}
export function mount(el) { root = el; session = null; document.addEventListener("visibilitychange", onVisible); }
// params.practice starts a practice game right away (from the reader's word list or Progress), with params.source as
// the words to use. A session already running is kept.
export function show(params = {}) {
  if (params.practice && !session) {
    if (params.source === "hard" && hardCards().length < 4) {
      home();
      toast(tr("Not enough hard words yet: practise needs at least four.", "Încă nu sunt destule cuvinte grele: exersarea are nevoie de cel puțin patru."));
      return;
    }
    if (params.source) poolSource = params.source;
    home();
    startPractice(params.practice, poolSource);
    return;
  }
  if (params.practice) toast(tr("Finish or end the session that is running first.", "Termină sau oprește întâi sesiunea începută."));
  if (!session) home();
}
export function hide() { stopAudio(); }
export function unmount() { document.removeEventListener("visibilitychange", onVisible); cancelWaitForNext(); setKeys(null); session = null; startToken++; }

function setKeys(fn) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn ? (e) => {
    const view = document.getElementById("view-review");
    if (!view || view.hidden) return;
    // Alt+3 switches tabs and Ctrl+1 is the browser's; holding a key down must not grade card after card
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    // a dialog on top (e.g. "Add this deck?") must not let number keys grade the card behind it
    if (document.querySelector("#modal-root .modal-back")) return;
    if (e.target.closest && e.target.closest("input, textarea, select") && !e.target.classList.contains("typing-box")) return;
    // Space / Enter on a focused button presses that button (Pause, Open in reader...), not the shortcut. Answer buttons
    // and the listen / play-again buttons keep focus after a mouse click, so they still let Space move on.
    if ((e.key === " " || e.key === "Enter") && e.target.closest && e.target.closest("button") && !e.target.closest(".locked, .keep-open, .icon-btn")) return;
    fn(e);
  } : null;
  if (keyHandler) document.addEventListener("keydown", keyHandler);
}

function allCards() { return Object.values(store.data.cards).filter(c => !c.suspended); }
function newSeenToday() { return (store.data.daily[today()] || {}).newSeen || 0; }



function dueQueue() {
  const now = Date.now();
  const cards = allCards();
  const due = cards.filter(c => c.state !== "new" && isDue(c, now)).sort((a, b) => a.due - b.due);
  const newLeft = Math.max(0, store.settings.newPerDay - newSeenToday());
  const fresh = cards.filter(c => c.state === "new").sort((a, b) => a.created - b.created).slice(0, newLeft);
  // spread new cards through the due ones
  const q = [];
  let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    if (i < due.length) q.push(due[i++]);
    if (i < due.length) q.push(due[i++]);
    if (j < fresh.length) q.push(fresh[j++]);
  }
  return q;
}


// Meaning of a card in the interface language, and the matching Bible's words for it.
function cardMeaning(c) { return meaning(c); }
function bibleLine(c) {
  if (lang() === "ro") return c.ro && c.ro !== cardMeaning(c) ? "Cornilescu: " + c.ro : "";
  return c.en ? "KJV: " + c.en : "";
}
function cardParse(c) { return c.parseCode ? shortParse(c.parseCode) : (c.parse || ""); }

// ------------------------------------------------------------------ home

const DECKS = [
  ["top100", ["The 100 most common words", "Cele mai folosite 100 de cuvinte"], ["About half of all the words in the Hebrew Bible.", "Cam jumătate din toate cuvintele din Biblia ebraică."]],
  ["top500", ["The 500 most common words", "Cele mai folosite 500 de cuvinte"], ["Enough to recognise most of a simple story.", "Destul cât să recunoști cea mai mare parte dintr-o povestire simplă."]],
  ["top1000", ["The 1,000 most common words", "Cele mai folosite 1.000 de cuvinte"], ["The core vocabulary of the Old Testament.", "Vocabularul de bază al Vechiului Testament."]],
  ["top2000", ["The 2,000 most common words", "Cele mai folosite 2.000 de cuvinte"], ["Everything that appears about 15 times or more.", "Tot ce apare de aproximativ 15 ori sau mai des."]],
  ["freq10", ["Every word used 10+ times (no names)", "Toate cuvintele folosite de 10+ ori (fără nume)"], ["The classic goal of a full Hebrew course, about 1,900 words.", "Ținta obișnuită a unui curs complet de ebraică, cam 1.900 de cuvinte."]],
  ["names", ["Names of people and places", "Nume de oameni și locuri"], ["Most common names first.", "Întâi numele cele mai des întâlnite."]],
];

function home() {
  session = null;
  startToken++;
  cancelWaitForNext();
  setKeys(null);
  stopAudio();
  clear(root);
  const cards = allCards();
  const q = dueQueue();
  const dueN = q.filter(c => c.state !== "new").length;
  const newN = q.length - dueN;
  const page = h("div", { class: "page review-home" });
  page.append(h("h1", null, tr("Review", "Recapitulare")),
    h("p", { class: "lede" }, tr(
      "Flashcards use spaced repetition: each word comes back right before you would forget it. The practice games below don't change the schedule, so play them as much as you like.",
      "Cartonașele folosesc repetiția spațiată: fiecare cuvânt revine chiar înainte să-l uiți. Jocurile de exersare de mai jos nu schimbă programul, așa că joacă-le cât vrei.")));
  page.append(h("div", { class: "stat-line" },
    stat(dueN, tr("due now", "de repetat acum")), stat(newN, tr("new today", "noi azi")), stat(cards.length, tr("cards in total", "cartonașe în total")),
    stat(store.knownKeys().size, tr("words known", "cuvinte știute")), stat(dayStreak(), tr("day streak", "zile la rând"))));
  // the queue is built again on Start: the page may have been open since before midnight
  const startBtn = h("button", { class: "btn primary", type: "button", disabled: !q.length, onclick: () => { const fresh = dueQueue(); if (fresh.length) startFlash(fresh); else home(); } },
    icon("play"), q.length ? tr(`Start review (${q.length})`, `Începe recapitularea (${q.length})`) : tr("Nothing due right now", "Nimic de repetat acum"));
  page.append(h("div", { class: "row" }, startBtn,
    !cards.length ? h("span", { class: "muted" }, tr("Pick a word deck below to get started, or add words from the reader.", "Alege mai jos un pachet de cuvinte ca să începi, sau adaugă cuvinte din cititor.")) : null));
  page.append(directionsRow());
  if (cards.length && !q.length) {
    const next = cards.filter(c => c.state !== "new").sort((a, b) => a.due - b.due)[0];
    if (next) page.append(h("p", { class: "muted small" }, tr(`Next card is due in ${relDays(dueAt(next))}.`, `Următorul cartonaș vine peste ${relDays(dueAt(next))}.`)));
  }
  const newWaiting = cards.filter(c => c.state === "new").length;
  if (newWaiting > newN && newN >= 0) {
    page.append(h("p", { class: "muted small" }, trn(newWaiting, "new card is waiting", "new cards are waiting", "cartonaș nou așteaptă", "cartonașe noi așteaptă") + tr(
      `. ${store.settings.newPerDay} come in each day (change it in Settings, Review).`,
      `. Intră câte ${store.settings.newPerDay} pe zi (schimbi asta în Setări, Recapitulare).`)));
  }

  // ready-made decks
  page.append(h("h2", null, tr("Word decks", "Pachete de cuvinte")));
  page.append(h("p", { class: "muted" }, tr(
    "Add a whole list of words to your flashcards at once. The most useful words come first, and new cards come in a few each day, so a big deck is fine.",
    "Adaugă dintr-odată o listă întreagă de cuvinte la cartonașe. Cele mai folositoare cuvinte vin primele, iar cartonașele noi intră câte puțin în fiecare zi, așa că un pachet mare nu e o problemă.")));
  const decks = h("div", { class: "modes" });
  for (const [id, title, desc] of DECKS) {
    decks.append(h("button", { class: "mode", type: "button", onclick: () => addDeck(id, tr(title[0], title[1])) }, h("b", null, tr(title[0], title[1])), h("span", null, tr(desc[0], desc[1]))));
  }
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea") }, ctx.books.map(b => h("option", { value: b.idx }, ctx.bookName(b.idx))));
  decks.append(h("div", { class: "mode", style: { cursor: "default" } }, h("b", null, tr("All the words of one book", "Toate cuvintele dintr-o carte")),
    h("div", { class: "row", style: { marginTop: "6px" } }, bookSel,
      h("button", { class: "btn small", type: "button", onclick: () => addDeck("book:" + bookSel.value, ctx.bookName(Number(bookSel.value))) }, icon("plus"), tr("Add", "Adaugă")))));
  page.append(decks);

  // practice
  page.append(h("h2", null, tr("Practice", "Exersare")));
  const pool = h("div", { class: "row", style: { marginBottom: "14px" } });
  const hardN = hardCards().length;
  const sources = [
    ["mine", tr(`My words (${cards.length})`, `Cuvintele mele (${cards.length})`)],
    ["hard", tr(`My hardest words (${hardN})`, `Cuvintele mele grele (${hardN})`)],
    ["top200", tr("Most common 200 words", "Cele mai folosite 200 de cuvinte")],
    ["top500", tr("Most common 500", "Cele mai folosite 500")],
    ["top1000", tr("Most common 1,000", "Cele mai folosite 1.000")],
    ["top2000", tr("Most common 2,000", "Cele mai folosite 2.000")],
    ["names", tr("Names", "Nume")],
    ["chapter", tr("Last chapter I read", "Ultimul capitol citit")],
  ];
  if (!poolSource || (poolSource === "hard" && hardN < 4)) poolSource = cards.length >= 4 ? "mine" : "top200";
  const srcSel = h("select", { "aria-label": tr("Practice words from", "Exersează cuvintele din"), onchange: (e) => { poolSource = e.target.value; } },
    sources.map(([v, l]) => h("option", { value: v, selected: v === poolSource, disabled: (v === "mine" && cards.length < 4) || (v === "hard" && hardN < 4) }, l)));
  pool.append(h("span", { class: "muted" }, tr("Practice words from", "Exersează cuvintele din")), srcSel);
  page.append(pool);
  // what "Pick the meaning" and "Flip through cards" show first; their descriptions follow the choice
  const sideTexts = {};
  const sideRow = h("div", { class: "row", style: { marginBottom: "14px" } },
    h("span", { class: "muted" }, tr("Show first", "Arată întâi")),
    choiceSeg([["he", tr("The Hebrew", "Ebraica")], ["mean", tr("The meaning", "Înțelesul")], ["both", tr("Both, taking turns", "Pe rând")]],
      store.settings.practiceSide, (v) => { store.setting("practiceSide", v); fillSideTexts(); }, tr("Show first", "Arată întâi")),
    h("span", { class: "muted small" }, tr("in Pick the meaning and Flip through cards", "la Alege înțelesul și Răsfoiește cartonașe")));
  page.append(sideRow);
  const modes = [
    ["choice", "", ""],
    ["listen", tr("Listening", "Ascultare"), tr("Hear a word and pick how it is written.", "Auzi un cuvânt și alegi cum se scrie.")],
    ["repeat", tr("Hear and repeat", "Ascultă și repetă"), tr("Hear each word twice, then say it out loud yourself.", "Auzi fiecare cuvânt de două ori, apoi îl spui și tu cu voce tare.")],
    ["typing", tr("Spell it", "Scrie-l"), tr("Hear it and see the meaning, then type it in Hebrew letters.", "Îl auzi și vezi înțelesul, apoi îl scrii cu litere ebraice.")],
    ["cloze", tr("Words in their verse", "Cuvinte în verset"), tr("A verse with one word missing. Choose the word that fits.", "Un verset cu un cuvânt lipsă. Alegi cuvântul potrivit.")],
    ["match", tr("Match pairs", "Perechi"), tr("Connect six Hebrew words with their meanings, against the clock.", "Legi șase cuvinte ebraice de înțelesurile lor, contra cronometru.")],
    ["flashfree", tr("Flip through cards", "Răsfoiește cartonașe"), ""],
    ["parse", tr("Parse the verb", "Analizează verbul"), tr("A verb form from the Bible: pick its stem, tense and person. The verbs come from the words you chose above.",
      "O formă de verb din Biblie: alegi tulpina, timpul și persoana. Verbele vin din cuvintele alese mai sus.")],
    ["affix", tr("Prefixes and endings", "Prefixe și terminații"), tr("A word from the chapter you read last, with one small part marked: choose what that part means.",
      "Un cuvânt din ultimul capitol citit, cu o parte mică marcată: alegi ce înseamnă partea aceea.")],
  ];
  page.append(h("div", { class: "modes" }, modes.map(([id, title, desc]) => {
    const b = h("b", null, title), d = h("span", null, desc);
    if (id === "choice" || id === "flashfree") sideTexts[id] = [b, d];
    return h("button", { class: "mode", type: "button", onclick: () => startPractice(id, poolSource) }, b, d);
  })));
  function fillSideTexts() {
    const side = store.settings.practiceSide;
    const [cb, cd] = sideTexts.choice, [, fd] = sideTexts.flashfree;
    cb.textContent = side === "mean" ? tr("Pick the Hebrew word", "Alege cuvântul ebraic") : tr("Pick the meaning", "Alege înțelesul");
    cd.textContent = side === "he" ? tr("See the Hebrew, choose what it means.", "Vezi ebraica și alegi ce înseamnă.")
      : side === "mean" ? tr("See the meaning, choose the Hebrew word.", "Vezi înțelesul și alegi cuvântul ebraic.")
      : tr("See the Hebrew, choose what it means. Then the other way round.", "Vezi ebraica și alegi ce înseamnă. Apoi invers.");
    fd.textContent = side === "he" ? tr("Go through cards without grading, just to refresh: the Hebrew first, then flip for the meaning.", "Treci prin cartonașe fără notă, doar ca să-ți împrospătezi memoria: întâi ebraica, apoi întorci pentru înțeles.")
      : side === "mean" ? tr("Go through cards without grading, just to refresh: the meaning first, then flip for the Hebrew.", "Treci prin cartonașe fără notă, doar ca să-ți împrospătezi memoria: întâi înțelesul, apoi întorci pentru ebraică.")
      : tr("Go through cards without grading, just to refresh, the Hebrew and the meaning first in turns.", "Treci prin cartonașe fără notă, doar ca să-ți împrospătezi memoria, cu ebraica și înțelesul întâi pe rând.");
  }
  fillSideTexts();
  root.append(page);
}

// Which kinds of flashcards the scheduled review asks (the same choice as in Settings, Review). At least one stays on.
function directionsRow() {
  const KINDS = [["recognize", tr("Hebrew → meaning", "Ebraică → înțeles")], ["recall", tr("Meaning → Hebrew", "Înțeles → ebraică")], ["listen", tr("Listening", "Ascultare")]];
  const seg = h("div", { class: "seg", role: "group", "aria-label": tr("Flashcards ask", "Cartonașele întreabă"), style: { flexWrap: "wrap" } });
  const draw = () => {
    clear(seg);
    const d = store.settings.reviewDirections;
    for (const [k, label] of KINDS) {
      seg.append(h("button", { type: "button", class: d[k] ? "on" : "", "aria-pressed": String(!!d[k]), onclick: () => {
        const next = { ...store.settings.reviewDirections, [k]: !store.settings.reviewDirections[k] };
        if (!KINDS.some(([x]) => next[x])) { toast(tr("Keep at least one kind of card.", "Păstrează cel puțin un fel de cartonaș.")); return; }
        store.setting("reviewDirections", next);
        draw();
      } }, label));
    }
  };
  draw();
  return h("div", { class: "row", style: { marginTop: "10px" } }, h("span", { class: "muted" }, tr("Flashcards ask", "Cartonașele întreabă")), seg,
    h("span", { class: "muted small" }, tr("New cards always start Hebrew → meaning.", "Cartonașele noi încep mereu cu ebraică → înțeles.")));
}

// Pick the meaning and Flip through cards: whether this question shows the meaning first (Settings: practiceSide).
function meaningFirst(n) {
  const side = store.settings.practiceSide;
  return side === "mean" || (side === "both" && n % 2 === 1);
}

function stat(n, label) { return h("div", { class: "stat" }, h("b", null, fmtInt(n)), h("span", null, label)); }

function deckCard(it) {
  return { id: "L:" + it.key, kind: "lemma", key: it.key, heb: it.hebrew, translit: it.translit, gloss: it.gloss, glossRo: it.glossRo || "" };
}

async function addDeck(id, title) {
  let res;
  try { res = await api.get("deck", { id }); } catch (e) { toast(errText(e)); return; }
  const items = res.items.filter(it => !store.hasCard("L:" + it.key) && !store.isKnown(it.key));
  if (!items.length) { toast(tr("You already have every word of this deck.", "Ai deja toate cuvintele din acest pachet.")); return; }
  const days = Math.ceil(items.length / Math.max(1, store.settings.newPerDay));
  modal(tr("Add this deck?", "Adaugi pachetul?"), h("div", null,
    h("p", null, `${title}: ` + trn(items.length, "new word", "new words", "cuvânt nou", "cuvinte noi") + tr(" for your flashcards (words you already have or know are skipped).",
      " pentru cartonașe (cele pe care le ai deja sau le știi sunt sărite).")),
    h("p", { class: "muted" }, tr(`At ${trn(store.settings.newPerDay, "new word", "new words", "", "")} a day that is about ${trn(days, "day", "days", "", "")}. You can change the daily number in Settings.`,
      `Cu ${trn(store.settings.newPerDay, "cuvânt nou", "", "cuvânt nou", "cuvinte noi")} pe zi, asta înseamnă cam ${trn(days, "", "", "zi", "zile")}. Numărul pe zi îl schimbi în Setări.`))), [
    { label: tr("Cancel", "Renunță") },
    { label: tr("Add the words", "Adaugă cuvintele"), primary: true, onClick: () => {
      const n = store.addCards(items.map(deckCard));
      toast(tr("Added ", "Am adăugat ") + trn(n, "word", "words", "cuvânt", "cuvinte"));
      if (!session) home(); // a review started while the deck was loading keeps going
    } },
  ]);
}

// ------------------------------------------------------------------ flashcards (scheduled)

function startFlash(queue) {
  session = { mode: "flash", queue: queue.slice(), later: [], done: 0, total: queue.length, correct: 0, start: Date.now(), first: new Map(), reviews: 0 };
  nextFlash();
}

function pickDirection(card) {
  if (card.state === "new" || card.kind === "phrase") return "recognize";
  const d = store.settings.reviewDirections;
  const opts = ["recognize", "recall", "listen"].filter(x => d[x]);
  if (!opts.length) return "recognize";
  // dealt like cards, so the chosen kinds take turns instead of one coming up many times in a row
  return deckFor("directions:" + opts.join(","), opts).next();
}

function nextFlash() {
  const s = session;
  let card;
  for (;;) {
    card = s.queue.shift();
    if (!card && s.later.length) {
      s.later.sort((a, b) => a.due - b.due);
      card = s.later.shift();
    }
    if (!card) return finish();
    // cards deleted or paused in My words since the session started are skipped, not brought back
    const cur = store.card(card.id);
    if (cur && !cur.suspended) { card = cur; break; }
    s.total = Math.max(s.done, s.total - 1);
  }
  s.card = card;
  s.dir = pickDirection(card);
  s.revealed = false;
  s.shownAt = Date.now();
  renderFlash();
}

function studyShell(label) {
  clear(root);
  const s = session;
  const done = s.done;
  const total = s.total || 1;
  const wrap = h("div", { class: "study" });
  wrap.append(h("div", { class: "study-top" },
    h("button", { class: "btn ghost small", type: "button", onclick: () => { stopAudio(); home(); } }, icon("left"), tr("End", "Gata")),
    h("span", null, label),
    h("div", { class: "progress-thin" }, h("i", { style: { width: Math.min(100, (done / total) * 100) + "%" } })),
    h("span", null, `${done} / ${total}`)));
  root.append(wrap);
  return wrap;
}

// A delayed autoplay plays only while Review is still on screen (End, or another tab, within the delay used to play
// it anyway).
function reviewVisible() { return !!root && root.isConnected && !root.closest("[hidden]"); }

function cardAudioText(card) {
  if (card.kind === "lemma") return speakableLemma(card.heb, card.key, store.settings);
  return speakableText(card.heb, store.settings); // forms and phrases: the Divine Name as set in Settings, Audio
}

// Pronunciation of a card or practice word: dictionary words follow the Divine Name setting, and the Hebrew decides
// whether a final ה is heard (Romanian spelling leaves out a silent one).
function itemTranslit(it) {
  const raw = it.kind === "lemma" || !it.kind ? lemmaTranslit(it.translit || "", it.key, store.settings) : (it.translit || "");
  return translit(raw, store.settings, { heb: it.heb });
}

function cardTranslit(card) {
  return itemTranslit(card);
}

function renderFlash() {
  const s = session;
  const card = s.card;
  const wrap = studyShell(tr("Flashcards", "Cartonașe"));
  const box = h("div", { class: "card clickable", title: trt("Click to show the answer", "Apasă ca să vezi răspunsul") });
  const big = heBig(stripCantillation(card.heb), "big-he" + (card.kind === "phrase" ? " phrase" : ""));
  const audioBtn = iconBtn("speaker", tr("Listen", "Ascultă"), (e) => { e.stopPropagation(); speak(cardAudioText(card)); });
  if (s.dir === "recognize") {
    box.append(h("div", { class: "prompt" }, card.kind === "form" ? tr("What does this form mean?", "Ce înseamnă forma aceasta?")
      : card.kind === "phrase" ? tr("What does this phrase mean?", "Ce înseamnă expresia aceasta?") : tr("What does this word mean?", "Ce înseamnă cuvântul acesta?")), big, audioBtn);
  } else if (s.dir === "recall") {
    box.append(h("div", { class: "prompt" }, tr("Say or write the Hebrew", "Spune sau scrie cuvântul în ebraică")),
      h("div", { style: { fontSize: "24px", margin: "18px 0 4px" } }, cardMeaning(card)),
      bibleLine(card) ? h("div", { class: "muted" }, bibleLine(card)) : null);
  } else {
    box.append(h("div", { class: "prompt" }, tr("Listen. What does it mean?", "Ascultă. Ce înseamnă?")),
      h("button", { class: "btn keep-open", type: "button", style: { margin: "26px 0", fontSize: "17px", padding: "12px 20px" }, onclick: (e) => { e.stopPropagation(); speak(cardAudioText(card)); } }, icon("speaker"), tr("Play again", "Ascultă din nou")));
    setTimeout(() => { if (session === s && s.card === card && reviewVisible()) speak(cardAudioText(card)); }, 150);
  }
  if ((card.lapses || 0) >= LEECH && card.key) {
    box.prepend(h("span", { class: "pill learning leech-pill", title: tr(`Forgotten ${times(card.lapses)}. A note on the answer side helps.`, `Uitat ${times(card.lapses)}. O notiță pe partea cu răspunsul te ajută.`) },
      tr("Tricky word", "Cuvânt dificil")));
  }
  // hints, one step at a time, before the answer (each step gives away a little more)
  const steps = hintSteps(card, s.dir);
  let hintLevel = 0;
  const hintBox = h("div", { class: "hint-box", hidden: true });
  const hintBtn = h("button", { class: "btn ghost small keep-open hint-btn", type: "button", hidden: !steps.length, onclick: (e) => { e.stopPropagation(); giveHint(); } },
    icon("hint"), tr("Hint", "Indiciu"), isTouch() ? null : h("span", { class: "kbd" }, "H"));
  box.append(hintBox, hintBtn);
  function giveHint() {
    if (s.revealed || hintLevel >= steps.length) return;
    hintBox.hidden = false;
    hintBox.append(steps[hintLevel++]());
    s.hints = hintLevel;
    if (hintLevel >= steps.length) hintBtn.hidden = true;
  }
  s.hints = 0;
  const answer = h("div", { class: "answer", hidden: true });
  box.append(answer);
  box.addEventListener("click", (e) => { if (!s.revealed && !e.target.closest("button")) reveal(); });
  wrap.append(box);
  const showBtn = h("button", { class: "btn primary", type: "button", style: { marginTop: "16px", width: "100%", justifyContent: "center", padding: "11px" }, onclick: reveal },
    tr("Show answer ", "Arată răspunsul "), h("span", { class: "kbd", style: { color: "inherit", borderColor: "currentColor" } }, tr("Space", "Spațiu")));
  wrap.append(showBtn);
  const grades = h("div", { class: "grades", hidden: true });
  wrap.append(grades);
  const extra = h("div", { class: "row", style: { marginTop: "14px", justifyContent: "center" } },
    card.ctx ? h("button", { class: "btn ghost small", type: "button", onclick: () => ctx.navigate("read", { b: card.ctx.b, c: card.ctx.c, v: card.ctx.v, w: card.ctx.w }) }, icon("book"), tr("Open in reader", "Deschide în cititor")) : null,
    h("button", { class: "btn ghost small", type: "button", onclick: () => { card.suspended = true; store.changed("cards"); toast(tr("Card paused. Resume it in My words.", "Cartonaș pus pe pauză. Îl reiei din Cuvintele mele.")); session.total--; nextFlash(); } }, tr("Pause this card", "Pune pe pauză")),
    card.key ? h("button", { class: "btn ghost small", type: "button", onclick: () => { if (!store.data.known[card.key]) store.toggleKnown(card.key); card.suspended = true; store.changed("cards"); toast(tr("Marked as known", "Marcat ca știut")); session.total--; nextFlash(); } }, tr("I know it well", "Îl știu bine")) : null);
  wrap.append(extra);

  function reveal() {
    if (s.revealed) return;
    s.revealed = true;
    showBtn.hidden = true;
    hintBtn.hidden = true;
    hintBox.hidden = true; // the answer says it all
    answer.hidden = false;
    box.classList.remove("clickable");
    box.removeAttribute("title");
    if (s.dir !== "recognize") answer.append(heBig(stripCantillation(card.heb), "big-he" + (card.kind === "phrase" ? " phrase" : ""), { style: { fontSize: "52px" } }));
    answer.append(h("div", { class: "row", style: { justifyContent: "center" } }, h("div", { class: "tr", html: cardTranslit(card) }),
      iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(cardAudioText(card))), iconBtn("slow", tr("Listen slowly", "Ascultă rar"), () => speak(cardAudioText(card), { slow: true }))));
    answer.append(h("div", { class: "gloss" }, cardMeaning(card)));
    if (cardParse(card)) answer.append(h("div", { class: "muted small" }, cardParse(card)));
    if (bibleLine(card) && s.dir === "recognize") answer.append(h("div", { class: "muted" }, bibleLine(card)));
    if (card.key) answer.append(noteBox(card));
    if (card.ctx) {
      const slot = h("div", { class: "ctx" }, h("div", { class: "muted small" }, tr("Loading the verse…", "Se încarcă versetul…")));
      answer.append(slot);
      loadContext(card).then(node => { clear(slot); if (node) slot.append(node); });
    }
    if (s.dir === "recognize" && card.kind !== "phrase") speak(cardAudioText(card));
    const pv = preview(card);
    const labels = [["again", tr("Again", "Din nou"), 1], ["hard", tr("Hard", "Greu"), 2], ["good", tr("Good", "Bine"), 3], ["easy", tr("Easy", "Ușor"), 4]];
    grades.hidden = false;
    for (const [cls, label, g] of labels) {
      grades.append(h("button", { class: "grade " + cls, type: "button", onclick: () => rate(g) }, h("b", null, label), h("span", null, pv[g - 1], "  ", h("span", { class: "kbd" }, String(g)))));
    }
  }

  setKeys((e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!s.revealed) reveal(); else rate(3); }
    else if (s.revealed && /^[1-4]$/.test(e.key)) rate(Number(e.key));
    else if (e.key === "p") speak(cardAudioText(card));
    else if (e.key === "h" && !s.revealed) giveHint();
  });
}

// The hint steps for a card in its direction. Hebrew → meaning: its sound, then its verse with the translation of the
// word left out. Meaning → Hebrew: its first letter and how many letters follow, then its sound. Listening: the word.
function hintSteps(card, dir) {
  const sound = () => h("div", { class: "tr", html: cardTranslit(card) });
  if (dir === "recall") {
    // some dictionary words list two spellings ("יְרוּשָׁלִַם, יְרוּשְׁלֵם"): the hint is about the first
    const letters = consonants(stripCantillation(String(card.heb || "").split(/\s*,\s*/)[0])).replace(/[^א-ת]/g, "");
    if (!letters) return [sound];
    const first = () => h("div", { class: "hint-letters" + heClass(), lang: "he", dir: "rtl", title: tr("The first letter, and a line for each letter after it", "Prima literă și câte o linie pentru fiecare literă de după ea") },
      letters[0] + " " + Array.from(letters.slice(1), () => "_").join(" "));
    return [first, sound];
  }
  if (dir === "listen") return [() => heBig(stripCantillation(card.heb), "big-he hint-he")];
  const steps = [sound];
  if (card.ctx) {
    steps.push(() => {
      const slot = h("div", { class: "ctx" }, h("div", { class: "muted small" }, tr("Loading the verse…", "Se încarcă versetul…")));
      loadContext(card, { blank: true }).then(node => { clear(slot); if (node) slot.append(node); else slot.remove(); });
      return slot;
    });
  }
  return steps;
}

// A note on the answer side (shared with the word panel's "My note"). Tricky words open it with a tip; others show a
// small button, so the note doesn't get in the way.
function noteBox(card) {
  const wrap = h("div", { class: "note-inline" });
  const text = store.note(card.key);
  const leech = (card.lapses || 0) >= LEECH;
  const shown = h("div", { class: "small note-text" }, text);
  const ta = h("textarea", { rows: 2, placeholder: tr("A way to remember it: a similar word, a picture, a verse…", "Un mod de a-l ține minte: un cuvânt asemănător, o imagine, un verset…"),
    "aria-label": tr("My note", "Notița mea") }, text);
  const save = () => { store.setNote(card.key, ta.value); shown.textContent = ta.value; };
  ta.addEventListener("input", debounce(save, 400));
  ta.addEventListener("change", save);
  ta.addEventListener("click", (e) => e.stopPropagation());
  const open = () => { btn.remove(); if (shown.isConnected) shown.remove(); wrap.append(ta); ta.focus(); };
  const btn = h("button", { class: "btn ghost small keep-open", type: "button", onclick: (e) => { e.stopPropagation(); open(); } },
    icon(text ? "pen" : "note"), text ? tr("Edit note", "Schimbă notița") : tr("Add a note", "Adaugă o notiță"));
  if (leech && !text) {
    wrap.append(h("div", { class: "small leech-tip" }, tr("This word keeps slipping away. Write a short hook to remember it:", "Cuvântul acesta tot îți scapă. Scrie un mic ajutor ca să-l ții minte:")), ta);
  } else {
    if (text) wrap.append(shown);
    wrap.append(btn);
  }
  return wrap;
}

function rate(g) {
  const s = session;
  if (!s || !s.card) return;
  const before = s.card;
  if (!store.card(before.id)) { nextFlash(); return; } // deleted in another tab meanwhile
  const wasNew = before.state === "new";
  const after = schedule(before, g);
  store.data.cards[before.id] = after;
  store.data.log.push({ id: before.id, t: Date.now(), g, ms: Date.now() - s.shownAt, dir: s.dir, st: before.state, hint: s.hints || undefined });
  if (g === 1 && (after.lapses || 0) === LEECH && before.key) {
    toast(tr("This word keeps slipping away. Next time, add a short note on its answer side to help you remember it.",
      "Cuvântul acesta tot îți scapă. Data viitoare adaugă o notiță scurtă pe partea cu răspunsul, ca să-l ții minte."), 5000);
  }
  store.bumpDaily("reviews");
  s.reviews++;
  if (wasNew) store.bumpDaily("newSeen");
  // Hard is still a recall (the scheduler treats it as one), so it counts as remembered
  if (g >= 2) { store.bumpDaily("correct"); s.correct++; }
  if (!s.first.has(before.id)) s.first.set(before.id, g >= 2);
  store.changed("review");
  ctx.refreshDue();
  if (after.due - Date.now() < 20 * 60000) s.later.push(after);
  else s.done++;
  nextFlash();
}

function finish() {
  setKeys(null);
  const s = session;
  const wrap = studyShell(tr("Done", "Gata"));
  const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  const day = store.data.daily[today()] || {};
  const firstPct = Math.round(([...s.first.values()].filter(Boolean).length / Math.max(1, s.first.size)) * 100);
  const goal = store.settings.goalReviews || 0;
  wrap.append(h("div", { class: "done-screen" },
    h("div", { class: "big" }, s.done ? tr("Review finished", "Recapitulare terminată") : tr("Nothing left to review", "Nu mai e nimic de repetat")),
    s.done ? h("p", { class: "muted" }, trn(s.done, "card", "cards", "cartonaș", "cartonașe") + tr(" in about ", " în aproximativ ") +
      trn(mins, "minute", "minutes", "minut", "minute") + tr(`. ${firstPct}% remembered on the first try.`, `. ${firstPct}% ținute minte din prima.`)) : null,
    h("p", { class: "muted" }, tr("Today: ", "Azi: ") + trn(day.reviews || 0, "review", "reviews", "repetare", "repetări") +
      (goal ? tr(` of your goal of ${goal}`, ` din ținta de ${goal}`) : "") + ", " +
      trn(Math.round((day.secs || 0) / 60), "minute of study", "minutes of study", "minut de studiu", "minute de studiu") + "."),
    h("div", { class: "row", style: { justifyContent: "center", marginTop: "18px" } },
      h("button", { class: "btn primary", type: "button", onclick: home }, tr("Back to review", "Înapoi la recapitulare")),
      h("button", { class: "btn", type: "button", onclick: () => ctx.navigate("read") }, tr("Keep reading", "Citește mai departe")))));
  session = null;
}

// The verse a card comes from, in the Bible chosen for the reader, with the word marked on both sides.
async function verseParts(c) {
  const res = await api.get("verse", { b: c.b, c: c.c, v: c.v });
  const row = res.verse;
  const ver = bible() === "kjv" && res.en ? "kjv" : "ro";
  const side = ver === "kjv"
    ? { text: res.en[0], tok: res.en[1], links: store.alignFor(c.b, c.c, c.v, "kjv") || res.en[2] || [] }
    : { text: row[2], tok: row[3], links: store.alignFor(c.b, c.c, c.v, "ro") || row[5] || [] };
  return { row, words: row[4].map(unpack), side, ver };
}

// The Bible text of a verse with the words linked to Hebrew words from..to marked, or (blank) left out as a gap,
// so a hint can show the verse without giving the answer away.
function sideHtml(side, from, to, blank = false) {
  const hits = new Set();
  for (let i = 0; i < side.links.length; i += 3) if (side.links[i + 1] >= from && side.links[i + 1] <= to) hits.add(side.links[i]);
  let out = "", pos = 0;
  for (let i = 0; i < side.tok.length; i += 2) {
    out += escapeHtml(side.text.slice(pos, side.tok[i]));
    const w = escapeHtml(side.text.slice(side.tok[i], side.tok[i + 1]));
    out += hits.has(i / 2) ? (blank ? '<span class="gap">…</span>' : "<mark>" + w + "</mark>") : w;
    pos = side.tok[i + 1];
  }
  return out + escapeHtml(side.text.slice(pos));
}

async function loadContext(card, opts = {}) {
  const c = card.ctx;
  if (!c) return null;
  try {
    const { words, side, ver } = await verseParts(c);
    const from = c.w, to = c.to !== undefined ? c.to : c.w;
    const heHtml = words.map((w, i) => {
      if (w.extra.x === "X") return "";
      const t = escapeHtml(stripCantillation(w.text));
      return (i >= from && i <= to ? "<mark>" + t + "</mark>" : t) + (w.punct.includes("־") ? "־" : " ");
    }).join("");
    return h("div", null, h("div", { class: "ref" }, ctx.refText(c.b, c.c, c.v)),
      h("span", { class: "he", lang: "he", dir: "rtl", html: heHtml }), h("div", { lang: ver === "kjv" ? "en" : "ro", html: sideHtml(side, from, to, !!opts.blank) }));
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ practice pools

// When each word was last shown in a practice game, kept in this browser. A new game starts with the words you
// haven't practised for the longest time, so the same few don't come back game after game while others never do.
const SEEN_KEY = "mikra-practice-seen";
let seenMap = null;
let seenTimer = null;
const itemId = (it) => (it.key || "") + "|" + stripCantillation(it.heb || "");
function practiceSeen() {
  if (!seenMap) {
    seenMap = new Map();
    try {
      const o = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (Number.isFinite(v)) seenMap.set(k, v);
    } catch (_) { /* no browser storage: the order is only kept while the app is open */ }
  }
  return seenMap;
}
function markPracticed(it) {
  const m = practiceSeen();
  const id = itemId(it);
  m.delete(id);
  m.set(id, Date.now());
  while (m.size > 3000) m.delete(m.keys().next().value); // oldest first
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(m))); } catch (_) { /* ignore */ } }, 1000);
}
// The n items practised longest ago (never practised first, in random order), shuffled.
function leastRecent(items, n) {
  const m = practiceSeen();
  const when = (it) => m.get(itemId(it)) || 0;
  return shuffle(shuffle(items).sort((a, b) => when(a) - when(b)).slice(0, n));
}

function poolItem(it) {
  const item = { key: it.key, heb: it.hebrew || it.heb, translit: it.translit, gloss: it.gloss, glossRo: it.glossRo || "", ro: it.ro, en: it.en, ctx: it.ctx, kind: it.kind || "lemma" };
  item.mean = meaning(item);
  return item;
}

async function buildPool(source) {
  if (source === "hard") return shuffle(hardCards().slice(0, 40).map(poolItem));
  if (source === "mine") {
    const cards = allCards().filter(c => c.kind !== "phrase");
    // the weaker half of your cards (newer and harder ones), and of those the ones practised longest ago
    const weak = shuffle(cards).sort((a, b) => (a.stability || 0) - (b.stability || 0)).slice(0, Math.min(200, Math.max(40, Math.ceil(cards.length / 2))));
    return leastRecent(weak.map(poolItem), 40);
  }
  if (source === "chapter") {
    const p = store.data.pos || { b: 0, c: 1 };
    const res = await api.get("chapter_vocab", { b: p.b, c: p.c });
    const items = leastRecent(res.items.filter(it => !/-|^\(/.test(it.gloss)).slice(0, 80).map(poolItem), 40);
    const chap = await api.get("chapter", { b: p.b, c: p.c });
    return items.map(it => {
      let c0 = null;
      for (const vrow of chap.verses) {
        const wi = vrow[4].findIndex(w => w[6] === it.key);
        if (wi >= 0) { c0 = { b: p.b, c: p.c, v: vrow[0], w: wi, form: vrow[4][wi][0].replace(/\//g, "") }; break; }
      }
      return Object.assign(it, { ctx: c0 });
    });
  }
  const id = source === "top200" ? "top200" : source;
  const res = await api.get("deck", { id });
  return leastRecent(res.items.filter(it => meaning(it)).map(poolItem), 40);
}

// Hebrew as it is shown on a button: in cursive the points are gone, so דָּבָר and דֶּבֶר look the same.
const shownHeb = (heb) => heText(stripCantillation(heb || ""));

// Wrong answers that can't also be right: not the same word, not a word with the same meaning (אָדָם / אִישׁ "man"),
// and nothing that looks the same as the answer or as another option.
async function distractors(target, n, field) {
  const shown = (x) => field === "heb" ? shownHeb(x.heb) : x[field];
  const ok = (x) => x[field] && x.key !== target.key && shown(x) !== shown(target) && !(x.mean && x.mean === target.mean);
  const pool = (session && session.pool) || [];
  let cands = pool.filter(ok);
  if (cands.length < n) {
    try {
      const extra = await api.get("random_lemmas", { n: 20, maxrank: 1200 });
      cands = cands.concat(extra.map(poolItem).filter(ok));
    } catch (_) { /* offline */ }
  }
  const seen = new Set([shown(target)]);
  const seenMean = new Set([target.mean]);
  const out = [];
  for (const c of shuffle(cands)) {
    if (seen.has(shown(c)) || (c.mean && seenMean.has(c.mean))) continue;
    seen.add(shown(c));
    if (c.mean) seenMean.add(c.mean);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

async function startPractice(mode, source) {
  if (mode === "flashfree") { return startFree(source); }
  const token = ++startToken;
  let pool;
  try {
    pool = mode === "parse" ? await buildVerbPool(source) : mode === "affix" ? await buildAffixPool(source) : await buildPool(source);
  } catch (e) { if (token === startToken) toast(errText(e)); return; }
  if (token !== startToken || session) return; // something else was started (or the tab was rebuilt) while loading
  if (mode === "cloze") pool = pool.filter(x => x.ctx);
  if (pool.length < 4) {
    toast(mode === "cloze" ? tr("Not enough words with a verse yet. Add words from the reader first.", "Încă nu sunt destule cuvinte cu verset. Adaugă întâi cuvinte din cititor.")
      : mode === "parse" ? tr("Not enough verbs in this set. Choose another set of words above, for example the most common 500.", "Nu sunt destule verbe în acest set. Alege alt set de cuvinte mai sus, de exemplu cele mai folosite 500.")
      : tr("Not enough words in this set yet.", "Încă nu sunt destule cuvinte în acest set."));
    return;
  }
  // the words are dealt from the set like cards: all of them come up before any comes back, and a missed one
  // returns a few questions later
  session = { mode, pool, deck: deck(pool, qidOf), i: 0, total: Math.min(mode === "match" ? 3 : 12, mode === "match" ? Math.floor(pool.length / 6) || 1 : pool.length), done: 0, right: 0, start: Date.now(), missed: new Map() };
  if (mode === "match") return matchRound();
  nextPractice();
}

// What identifies a practice question: a word (its key and Hebrew), or a verb form / word part from a verse.
const qidOf = (it) => it.qid || itemId(it);

// A wrong answer: the item is listed at the end of the game, to add to review or practise again.
function noteMiss(it) {
  const s = session;
  if (!s || !it) return;
  if (!s.missed) s.missed = new Map();
  s.missed.set(qidOf(it), it);
}

function nextPractice() {
  const s = session;
  if (!s) return;
  if (s.done >= s.total) return practiceDone();
  const item = s.deck.next();
  s.item = item;
  if (!item.qid) markPracticed(item);
  if (s.mode === "choice") return choiceQ(item, meaningFirst(s.done));
  if (s.mode === "listen") return listenQ(item);
  if (s.mode === "repeat") return repeatQ(item);
  if (s.mode === "typing") return typingQ(item);
  if (s.mode === "cloze") return clozeQ(item);
  if (s.mode === "parse") return parseQ(item);
  if (s.mode === "affix") return affixQ(item);
}

function practiceDone() {
  setKeys(null);
  const s = session;
  const wrap = studyShell(tr("Practice", "Exersare"));
  const secs = Math.round((Date.now() - s.start) / 1000);
  const again = () => {
    const m = s.mode;
    session = { ...s, pool: m === "free" ? shuffle(s.pool) : s.pool, i: 0, done: 0, right: 0, start: Date.now(), missed: new Map() };
    if (m === "match") matchRound(); else if (m === "free") freeCard(); else nextPractice();
  };
  const missed = s.missed ? [...s.missed.values()] : [];
  wrap.append(h("div", { class: "done-screen" },
    h("div", { class: "big" }, s.mode === "repeat" || s.mode === "free" ? trn(s.total, "word", "words", "cuvânt", "cuvinte") : tr(`${s.right} of ${s.total} right`, `${s.right} din ${s.total} corecte`)),
    h("p", { class: "muted" }, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`),
    h("div", { class: "row", style: { justifyContent: "center", marginTop: "18px" } },
      h("button", { class: "btn primary", type: "button", onclick: again }, tr("Again", "Încă o dată")),
      missed.length && s.mode !== "free" && s.mode !== "repeat" ? h("button", { class: "btn", type: "button", onclick: () => replayMissed(s, missed) }, icon("undo"), tr("Practise the ones I missed", "Exersează ce am greșit")) : null,
      h("button", { class: "btn", type: "button", onclick: home }, tr("Back to review", "Înapoi la recapitulare"))),
    missed.length ? missedList(missed) : null));
  session = null;
}

// A new round of the same game with only the missed items (games that need four answers take theirs from other words).
function replayMissed(s, missed) {
  // a round of pairs needs six words: the missed ones, then others from the same set
  const items = s.mode === "match" ? missed.concat(shuffle(s.pool.filter(x => !missed.includes(x))).slice(0, Math.max(0, 6 - missed.length))) : missed;
  session = { mode: s.mode, pool: s.pool, deck: deck(items, qidOf), i: 0, total: s.mode === "match" ? 1 : Math.min(12, missed.length), done: 0, right: 0, start: Date.now(), missed: new Map() };
  if (s.mode === "match") matchRound(); else nextPractice();
}

// The words answered wrong, each with its sound and meaning; dictionary words not yet in review can be added.
function missedList(items) {
  const st = store.settings;
  const list = h("div", { class: "missed-list" });
  const addable = items.filter(it => it.kind === "lemma" && it.key && !store.hasCard("L:" + it.key) && !store.isKnown(it.key));
  for (const it of items) {
    let heb, sound, mean;
    if (it.kind === "verb") { heb = it.form; sound = it.translit ? translit(it.translit, st, { heb: it.form }) : ""; mean = verbLabel(it.code); }
    else if (it.kind === "affix") { heb = stripCantillation(it.w.text); sound = translit(wordTranslit(it.w, st), st, { heb: it.w.text }); mean = (affixIn(it.w.tags[it.part], it.w.codes[it.part]) || [""])[0]; }
    else { heb = stripCantillation(it.heb); sound = itemTranslit(it); mean = it.mean || meaning(it); }
    const row = h("div", { class: "missed-row" }, he(heb), h("span", { class: "tr", html: sound }), h("span", { class: "muted" }, mean));
    if (addable.includes(it)) {
      row.append(h("button", { class: "btn small", type: "button", onclick: (e) => {
        store.addCard({ id: "L:" + it.key, kind: "lemma", key: it.key, heb: it.heb, translit: it.translit, gloss: it.gloss, glossRo: it.glossRo || "", ro: it.ro, en: it.en, ctx: it.ctx || null });
        e.currentTarget.replaceWith(h("span", { class: "pill review" }, tr("in review", "în recapitulare")));
      } }, icon("plus"), tr("Add to review", "Adaugă la recapitulare")));
    }
    list.append(row);
  }
  return h("div", { class: "missed" }, h("h3", null, tr("To look at again", "De revăzut")), list);
}

function cancelWaitForNext() {
  if (nextCleanup) { nextCleanup(); nextCleanup = null; }
}

// After an answer the result stays on screen; the next click anywhere (or Space / Enter) moves on.
function waitForNext(go) {
  cancelWaitForNext();
  const hint = h("div", { class: "next-hint" }, isTouch() ? tr("Tap anywhere to continue", "Atinge oriunde ca să mergi mai departe")
    : tr("Click anywhere or press Space to continue", "Apasă oriunde sau tasta Spațiu ca să mergi mai departe"));
  const card = root.querySelector(".card");
  if (card) card.append(hint);
  const my = session;
  let done = false;
  const cleanup = () => { done = true; root.removeEventListener("click", onClick, true); };
  nextCleanup = cleanup;
  const next = () => {
    if (done) return;
    cleanup();
    nextCleanup = null;
    setKeys(null);
    go();
  };
  const onClick = (e) => {
    // the game was left (End, another tab rebuilt the view): let this click through and stop listening
    if (session !== my || !my) { cleanup(); return; }
    if (e.target.closest(".study-top") || e.target.closest(".icon-btn") || e.target.closest(".keep-open")) return;
    e.preventDefault(); e.stopPropagation();
    next();
  };
  // attach after the click that gave the answer has finished
  setTimeout(() => { if (!done) root.addEventListener("click", onClick, true); }, 0);
  setKeys((e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); } else if (e.key === "p") e.preventDefault(); });
}

function answerFeedback(ok, buttons, rightBtn) {
  const s = session;
  // locked, not disabled: a disabled button would swallow the "click anywhere to continue" click
  for (const b of buttons) { b.classList.add("locked"); b.setAttribute("aria-disabled", "true"); }
  if (rightBtn) rightBtn.classList.add("right");
  if (ok) s.right++;
  else { noteMiss(s.item); if (s.deck && s.item) s.deck.again(s.item); }
  s.done++;
  waitForNext(() => nextPractice());
}

function choiceButton(o, reverse, onPick) {
  return h("button", { class: "choice" + (reverse ? " he" + heClass() : ""), type: "button", lang: reverse ? "he" : null,
    onclick: (e) => onPick(o, e.currentTarget) }, reverse ? heText(stripCantillation(o.heb)) : o.mean);
}

async function choiceQ(item, reverse) {
  const my = session;
  const wrap = studyShell(reverse ? tr("Pick the Hebrew word", "Alege cuvântul ebraic") : tr("Pick the meaning", "Alege înțelesul"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const field = reverse ? "heb" : "mean";
  const others = await distractors(item, 3, field);
  if (session !== my) return; // ended while loading
  const opts = shuffle([item, ...others]);
  if (reverse) box.append(h("div", { class: "prompt" }, tr("Which Hebrew word means", "Care cuvânt ebraic înseamnă")), h("div", { style: { fontSize: "24px", margin: "12px 0" } }, item.mean));
  else box.append(h("div", { class: "prompt" }, tr("What does it mean?", "Ce înseamnă?")), heBig(stripCantillation(item.heb)), iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableLemma(item.heb, item.key, store.settings))));
  const grid = h("div", { class: "choices" });
  const buttons = opts.map(o => choiceButton(o, reverse, pick));
  grid.append(...buttons);
  box.append(grid);
  const rightBtn = buttons[opts.indexOf(item)];
  function pick(o, btn) {
    if (btn.classList.contains("locked")) return;
    const ok = o === item;
    if (!ok) btn.classList.add("wrong");
    box.append(h("div", { class: "muted reveal-line" }, he(stripCantillation(item.heb)), "  ", h("span", { html: itemTranslit(item) }), "  ", item.mean));
    if (!reverse) speak(speakableLemma(item.heb, item.key, store.settings));
    answerFeedback(ok, buttons, rightBtn);
  }
  setKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; if (b) b.click(); } });
}

async function listenQ(item) {
  const my = session;
  const wrap = studyShell(tr("Listening", "Ascultare"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const others = await distractors(item, 3, "heb");
  if (session !== my) return;
  const opts = shuffle([item, ...others]);
  const play = () => speak(speakableLemma(item.heb, item.key, store.settings));
  box.append(h("div", { class: "prompt" }, tr("Which word did you hear?", "Ce cuvânt ai auzit?")),
    h("button", { class: "btn keep-open", type: "button", style: { margin: "18px 0", padding: "12px 20px", fontSize: "17px" }, onclick: play }, icon("speaker"), tr("Play", "Ascultă")),
    h("button", { class: "btn ghost small keep-open", type: "button", onclick: () => speak(speakableLemma(item.heb, item.key, store.settings), { slow: true }) }, icon("slow"), tr("Slower", "Mai rar")));
  const grid = h("div", { class: "choices" });
  const buttons = opts.map(o => choiceButton(o, true, pick));
  grid.append(...buttons);
  box.append(grid);
  const step = my.i;
  setTimeout(() => { if (session === my && my.i === step && reviewVisible()) play(); }, 200);
  const rightBtn = buttons[opts.indexOf(item)];
  function pick(o, btn) {
    if (btn.classList.contains("locked")) return;
    const ok = o === item;
    if (!ok) btn.classList.add("wrong");
    box.append(h("div", { class: "muted reveal-line" }, h("span", { html: itemTranslit(item) }), "  ", item.mean));
    answerFeedback(ok, buttons, rightBtn);
  }
  setKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; if (b) b.click(); } else if (e.key === "p") play(); });
}

// Shadowing: hear it twice, say it yourself. No grading.
async function repeatQ(item) {
  const my = session;
  const wrap = studyShell(tr("Hear and repeat", "Ascultă și repetă"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const text = speakableLemma(item.heb, item.key, store.settings);
  box.append(h("div", { class: "prompt" }, tr("Listen, then say it out loud", "Ascultă, apoi spune-l cu voce tare")),
    heBig(stripCantillation(item.heb)),
    h("div", { class: "tr", html: itemTranslit(item) }),
    h("div", { class: "gloss" }, item.mean),
    h("div", { class: "row", style: { justifyContent: "center", marginTop: "12px" } },
      h("button", { class: "btn keep-open", type: "button", onclick: () => speak(text) }, icon("speaker"), tr("Again", "Din nou")),
      h("button", { class: "btn keep-open", type: "button", onclick: () => speak(text, { slow: true }) }, icon("slow"), tr("Slowly", "Rar"))));
  session.done++;
  const step = session.i;
  const still = () => session === my && session.i === step;
  waitForNext(() => nextPractice());
  if (await speak(text) && still()) {
    await new Promise(r => setTimeout(r, 900));
    if (still()) await speak(text, { slow: true });
  }
}

// On-screen Hebrew keyboard; each key also shows the Latin key that types it.
export function hebrewKeyboard(onKey) {
  const latinOf = {};
  for (const [lat, heb] of Object.entries(KEYBOARD)) latinOf[heb] = lat;
  const rows = ["קראטוןםפ", "שדגכעיחלךף", "זסבהנמצתץ"];
  const kb = h("div", { class: "hkbd" });
  for (const r of rows) kb.append(h("div", { class: "krow" }, [...r].map(ch => h("button", { type: "button", onclick: () => onKey(ch) },
    h("span", { class: "kh" }, ch), h("span", { class: "kl" }, (latinOf[ch] || "").toUpperCase())))));
  kb.append(h("div", { class: "krow" },
    h("button", { type: "button", class: "wide", onclick: () => onKey(" ") }, tr("space", "spațiu")),
    h("button", { type: "button", class: "wide", onclick: () => onKey("\b") }, tr("delete", "șterge"))));
  return kb;
}

const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const normCons = (s) => consonants(s).replace(/[ךםןףץ]/g, c => FINALS[c]);

function typingQ(item) {
  const my = session, step = session && session.i;
  const wrap = studyShell(tr("Spell it", "Scrie-l"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const play = () => speak(speakableLemma(item.heb, item.key, store.settings));
  const input = h("input", { type: "text", class: "typing-box", dir: "rtl", lang: "he", autocomplete: "off", spellcheck: "false", "aria-label": tr("Type the Hebrew word", "Scrie cuvântul în ebraică") });
  // without a Hebrew keyboard layout, Latin keys are turned into Hebrew letters
  input.addEventListener("input", () => {
    const conv = latinToHebrew(input.value);
    if (conv !== input.value) { const end = conv.length; input.value = conv; input.setSelectionRange(end, end); }
  });
  const hint = h("div", { class: "muted", style: { minHeight: "24px" } });
  box.append(h("div", { class: "prompt" }, tr("Type the consonants. Vowel points are not needed.", "Scrie consoanele. Nu e nevoie de vocale.")),
    h("div", { style: { fontSize: "22px", margin: "6px 0" } }, item.mean),
    h("div", { class: "row" }, iconBtn("speaker", tr("Listen", "Ascultă"), play), iconBtn("slow", tr("Listen slowly", "Ascultă rar"), () => speak(speakableLemma(item.heb, item.key, store.settings), { slow: true })),
      h("button", { class: "btn ghost small", type: "button", onclick: () => { hint.innerHTML = itemTranslit(item); } }, tr("Show sound", "Arată pronunția"))),
    hint, input,
    h("div", { class: "small faint" }, tr("No Hebrew keyboard? Just type the Latin keys: the letters on the keys below show which key gives which Hebrew letter.",
      "Nu ai tastatură ebraică? Scrie cu tastele obișnuite: literele mici de pe tastele de mai jos arată ce tastă dă fiecare literă ebraică.")));
  const kb = hebrewKeyboard((ch) => {
    if (ch === "\b") input.value = input.value.slice(0, -1);
    else input.value += ch;
    if (!isTouch()) input.focus(); // on a phone, focusing would open the system keyboard over this one
  });
  const check = h("button", { class: "btn primary", type: "button", style: { marginTop: "12px" }, onclick: submit }, tr("Check", "Verifică"));
  box.append(kb, check);
  setTimeout(() => { if (session === my && my.i === step && reviewVisible()) { play(); if (!isTouch()) input.focus(); } }, 150);
  let answered = false;
  function submit() {
    if (answered) return;
    answered = true;
    // some dictionary forms list two spellings ("יְרוּשָׁלִַם, יְרוּשְׁלֵם"); either one is right
    const alts = String(item.heb || "").split(/\s*,\s*/).filter(Boolean);
    const ok = alts.some(a => normCons(input.value) === normCons(a));
    if (ok) session.right++;
    else { noteMiss(item); if (session.deck) session.deck.again(item); }
    session.done++;
    input.style.borderColor = ok ? "var(--green)" : "var(--red)";
    input.readOnly = true;
    check.remove();
    box.append(h("div", { style: { marginTop: "12px" } },
      heBig(stripCantillation(item.heb), "big-he", { style: { fontSize: "44px" } }),
      h("div", { html: itemTranslit(item) }),
      h("div", { class: ok ? "" : "muted" }, ok ? tr("Correct", "Corect") : tr(`You wrote ${input.value || "nothing"}. Compare the letters above.`, `Ai scris ${input.value || "nimic"}. Compară cu literele de mai sus.`))));
    waitForNext(() => nextPractice());
  }
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !answered) { e.preventDefault(); e.stopPropagation(); submit(); } });
}

async function clozeQ(item) {
  const my = session;
  const wrap = studyShell(tr("Words in their verse", "Cuvinte în verset"));
  const box = h("div", { class: "card", style: { alignItems: "stretch", textAlign: "left" } });
  wrap.append(box);
  const c = item.ctx;
  let parts;
  try { parts = await verseParts(c); } catch (e) { if (session !== my) return; session.done++; return nextPractice(); }
  if (session !== my) return;
  const { words, side, ver } = parts;
  const target = words[c.w];
  if (!target) { session.done++; return nextPractice(); }
  // Forms saved with a card can carry the word's punctuation ("וַ/יְהִי־", "אוֹר׃ ס"); options are cleaned the same way,
  // so a trailing maqaf or ס can't give the answer away.
  // only trailing punctuation goes: a few words have a maqaf or space inside them (בִּנְהַר־פְּרָת)
  // (capped: a form comes from a saved card, and a restored file could hold a huge one that makes the pattern slow)
  const cleanForm = (f) => stripCantillation(String(f || "").slice(0, 200)).replace(/[\/\\]/g, "").replace(/[\s־׀׃]+(?:[פס]\s*)?$/, "");
  const form = stripCantillation(target.text).replace(/[\/\\]/g, "");
  // options: forms of other pool words found in their verses, or their dictionary forms
  const others = (await distractors(item, 3, "heb")).map(o => cleanForm((o.ctx && o.ctx.form) ? o.ctx.form : o.heb));
  if (session !== my) return;
  const seenOpt = new Set([shownHeb(form)]);
  const opts = shuffle([form, ...others.filter(x => { const k = shownHeb(x); if (!x || seenOpt.has(k)) return false; seenOpt.add(k); return true; })].slice(0, 4));
  const blank = '<span class="blank">&nbsp;</span>';
  const heHtml = words.map((w, i) => w.extra.x === "X" ? "" : (i === c.w ? blank : escapeHtml(stripCantillation(w.text))) + (w.punct.includes("־") ? "־" : " ")).join("");
  const heEl = h("div", { class: "he", lang: "he", dir: "rtl", style: { fontSize: "28px", lineHeight: "1.9", textAlign: "right" }, html: heHtml });
  box.append(h("div", { class: "muted small" }, ctx.refText(c.b, c.c, c.v)), heEl, h("div", { lang: ver === "kjv" ? "en" : "ro", style: { margin: "8px 0", fontSize: "16px" }, html: sideHtml(side, c.w, c.w) }));
  const grid = h("div", { class: "choices" });
  const buttons = opts.map(o => h("button", { class: "choice he" + heClass(), type: "button", lang: "he", onclick: (e) => pick(o, e.currentTarget) }, heText(o)));
  grid.append(...buttons);
  box.append(grid);
  const rightBtn = buttons[opts.indexOf(form)];
  function pick(o, btn) {
    if (btn.classList.contains("locked")) return;
    const ok = o === form;
    if (!ok) btn.classList.add("wrong");
    heEl.innerHTML = words.map((w, i) => w.extra.x === "X" ? "" : (i === c.w ? "<mark>" + escapeHtml(stripCantillation(w.text)) + "</mark>" : escapeHtml(stripCantillation(w.text))) + (w.punct.includes("־") ? "־" : " ")).join("");
    const mean = lang() === "ro" ? (item.ro || item.glossRo || glossClean(target.gloss.join(" "))) : glossClean(target.gloss.join(" "));
    box.append(h("div", { class: "muted reveal-line" }, h("span", { html: translit(wordTranslit(target, store.settings), store.settings, { heb: target.text }) }), ": ", mean));
    speak(speakableWord(target, store.settings));
    answerFeedback(ok, buttons, rightBtn);
  }
  setKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; if (b) b.click(); } });
}

function matchRound() {
  const s = session;
  if (s.done >= s.total) return practiceDone();
  const wrap = studyShell(tr("Match pairs", "Perechi"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const items = [];
  const seenG = new Set();
  const seenH = new Set();
  // the next six from the deck, so the rounds of one game don't repeat words while others wait
  const skipped = [];
  for (let tries = 0; items.length < 6 && tries < s.pool.length * 2; tries++) {
    const it = s.deck.next();
    if (items.includes(it) || seenG.has(it.mean) || seenH.has(shownHeb(it.heb))) { skipped.push(it); continue; } // two words that look alike (cursive) can't both be in a round
    seenG.add(it.mean);
    seenH.add(shownHeb(it.heb));
    items.push(it);
    markPracticed(it);
  }
  for (const it of skipped) if (!items.includes(it)) s.deck.again(it, 0);
  const t0 = Date.now();
  let mistakes = 0, left = items.length, sel = null;
  const timer = h("div", { class: "muted" }, "0s");
  const tick = setInterval(() => { if (!document.body.contains(timer)) return clearInterval(tick); timer.textContent = Math.round((Date.now() - t0) / 1000) + "s"; }, 500);
  const grid = h("div", { class: "match-grid" });
  // pair by position in this round, not by word key: a word and one of its forms share the same key
  const heCol = shuffle(items.map((it, i) => [it, i])).map(([it, i]) => h("button", { class: "choice he" + heClass(), type: "button", lang: "he", dataset: { k: String(i) } }, heText(stripCantillation(it.heb))));
  const glCol = shuffle(items.map((it, i) => [it, i])).map(([it, i]) => h("button", { class: "choice", type: "button", dataset: { k: String(i) } }, it.mean));
  for (let i = 0; i < items.length; i++) grid.append(heCol[i], glCol[i]);
  const onPick = (btn) => {
    if (btn.classList.contains("done")) return;
    if (!sel) { sel = btn; btn.classList.add("sel"); return; }
    if (sel === btn) { btn.classList.remove("sel"); sel = null; return; }
    const sameSide = (heCol.includes(sel) && heCol.includes(btn)) || (glCol.includes(sel) && glCol.includes(btn));
    if (sameSide) { sel.classList.remove("sel"); sel = btn; btn.classList.add("sel"); return; }
    if (sel.dataset.k === btn.dataset.k) {
      const heb = heCol.includes(sel) ? sel : btn;
      const it = items[Number(heb.dataset.k)];
      speak(speakableLemma(it.heb, it.key, store.settings));
      sel.classList.add("done"); btn.classList.add("done"); sel.classList.remove("sel");
      left--;
      if (!left) {
        clearInterval(tick);
        s.done++;
        if (!mistakes) s.right++;
        box.append(h("div", { style: { marginTop: "12px" } }, tr(`Done in ${Math.round((Date.now() - t0) / 1000)}s with ${mistakes} mistake${mistakes === 1 ? "" : "s"}.`,
          `Gata în ${Math.round((Date.now() - t0) / 1000)} s, cu ${mistakes} ${mistakes === 1 ? "greșeală" : "greșeli"}.`)));
        waitForNext(() => matchRound());
      }
    } else {
      mistakes++;
      noteMiss(items[Number((heCol.includes(sel) ? sel : btn).dataset.k)]);
      const a = sel, b = btn;
      a.classList.add("wrong"); b.classList.add("wrong");
      setTimeout(() => { a.classList.remove("wrong", "sel"); b.classList.remove("wrong"); }, 450);
    }
    sel = null;
  };
  for (const b of [...heCol, ...glCol]) b.addEventListener("click", () => onPick(b));
  box.append(h("div", { class: "row", style: { width: "100%", justifyContent: "space-between", marginBottom: "10px" } }, h("div", { class: "prompt" }, tr(isTouch() ? "Tap a Hebrew word, then its meaning" : "Click a Hebrew word, then its meaning", "Apasă un cuvânt ebraic, apoi înțelesul lui")), timer), grid);
}

// ------------------------------------------------------------------ free flip

async function startFree(source) {
  const token = ++startToken;
  let pool;
  try { pool = await buildPool(source); } catch (e) { if (token === startToken) toast(errText(e)); return; }
  if (token !== startToken || session) return;
  if (!pool.length) { toast(tr("No words in this set yet.", "Încă nu sunt cuvinte în acest set.")); return; }
  session = { mode: "free", pool, i: 0, total: pool.length, done: 0, right: 0, start: Date.now() };
  freeCard();
}

function freeCard() {
  const s = session;
  if (s.i >= s.pool.length) return practiceDone();
  const item = s.pool[s.i];
  s.done = s.i;
  markPracticed(item);
  const wrap = studyShell(tr("Flip through", "Răsfoiește"));
  const box = h("div", { class: "card clickable", title: trt("Click to flip", "Apasă ca să întorci") });
  const say = () => iconBtn("speaker", tr("Listen", "Ascultă"), (e) => { e.stopPropagation(); speak(speakableLemma(item.heb, item.key, store.settings)); });
  let ans;
  if (meaningFirst(s.i)) {
    // the meaning on the front; the Hebrew, its sound and pronunciation on the back
    ans = h("div", { class: "answer", hidden: true }, heBig(stripCantillation(item.heb)), say(),
      h("div", { class: "tr", html: itemTranslit(item) }), bibleLine(item) ? h("div", { class: "muted" }, bibleLine(item)) : null);
    box.append(h("div", { class: "prompt" }, tr("Which Hebrew word is it?", "Care e cuvântul ebraic?")), h("div", { style: { fontSize: "26px", margin: "14px 0" } }, item.mean), ans);
  } else {
    ans = h("div", { class: "answer", hidden: true },
      h("div", { class: "tr", html: itemTranslit(item) }), h("div", { class: "gloss" }, item.mean),
      bibleLine(item) ? h("div", { class: "muted" }, bibleLine(item)) : null);
    box.append(heBig(stripCantillation(item.heb)), say(), ans);
  }
  // first click shows the answer, the second goes to the next card
  box.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    if (ans.hidden) ans.hidden = false;
    else { s.i++; freeCard(); }
  });
  wrap.append(box, h("div", { class: "row", style: { justifyContent: "center", marginTop: "14px" } },
    h("button", { class: "btn", type: "button", onclick: () => { if (s.i > 0) { s.i--; freeCard(); } } }, icon("left"), tr("Back", "Înapoi")),
    h("button", { class: "btn keep-open", type: "button", onclick: () => { ans.hidden = !ans.hidden; } }, tr("Flip", "Întoarce")),
    h("button", { class: "btn primary", type: "button", onclick: () => { s.i++; freeCard(); } }, tr("Next", "Următorul"), icon("right"))));
  setKeys((e) => {
    if (e.key === " ") { e.preventDefault(); if (ans.hidden) ans.hidden = false; else { s.i++; freeCard(); } }
    else if (e.key === "ArrowRight" || e.key === "Enter") { s.i++; freeCard(); }
    else if (e.key === "ArrowLeft" && s.i > 0) { s.i--; freeCard(); }
  });
}

// ------------------------------------------------------------------ parse the verb

// Hebrew verb codes: "HV" + stem + conjugation + the rest ("HVqw3ms" Qal wayyiqtol 3ms, "HVqrmsa" Qal participle ms,
// "HVqcc" infinitive construct). Distractors change one thing at a time (person, tense or stem), so each answer
// trains looking at one part of the form.
const FINITE = { p: ["3ms", "3fs", "2ms", "2fs", "1cs", "3cp", "2mp", "1cp"], i: ["3ms", "3fs", "2ms", "2fs", "1cs", "3mp", "3fp", "2mp", "1cp"], v: ["2ms", "2fs", "2mp", "2fp"] };
FINITE.q = FINITE.p; FINITE.w = FINITE.i; FINITE.u = FINITE.i; FINITE.j = FINITE.i; FINITE.h = ["1cs", "1cp"];
const PART_TAILS = ["msa", "fsa", "mpa", "fpa"];
const STEMS = ["q", "N", "p", "h", "t"];
// Forms that are written alike, so one can't be a wrong answer for the other: in the imperfect, "she will" and "you
// (m) will" (תִּשְׁמֹר), and the feminine plurals; a singular participle and its construct (שֹׁמֵר).
const SAME_TAIL = { i: { "3fs": "2ms", "2ms": "3fs", "3fp": "2fp", "2fp": "3fp" }, r: { msc: "msa", fsc: "fsa" }, s: { msc: "msa", fsc: "fsa" } };
SAME_TAIL.w = SAME_TAIL.i; SAME_TAIL.u = SAME_TAIL.i; SAME_TAIL.j = SAME_TAIL.i;

function splitVerb(code) {
  const m = /^HV(.)(.)(.*)$/.exec(code || "");
  if (!m) return null;
  const [, stem, conj, tail] = m;
  // "c" with a person is the cohortative; "c" alone the infinitive construct (see parseMorph)
  const kind = conj === "c" && /^[123]/.test(tail) ? "h" : conj;
  return { stem, conj, tail, kind };
}

function verbDistractors(item) {
  const v = splitVerb(item.code);
  if (!v) return [];
  const mk = (stem, conj, tail) => `HV${stem}${conj}${tail}`;
  const pgn = [], tense = [], stem = [];
  const twin = (SAME_TAIL[v.kind] || {})[v.tail];
  if (FINITE[v.kind]) for (const t of FINITE[v.kind]) if (t !== v.tail && t !== twin) pgn.push(mk(v.stem, v.conj, t));
  if (v.kind === "r" || v.kind === "s") for (const t of PART_TAILS) if (t !== v.tail && t !== twin) pgn.push(mk(v.stem, v.conj, t));
  // The same person in another tense (3cp in the perfect is 3mp in the imperfect). Tenses that are often written alike
  // are not offered against each other: jussive and imperfect, imperative and infinitive construct, participle and
  // perfect (hollow verbs: קָם), weqatal and a perfect with "and".
  const toPerf = (t) => t.replace(/^3[mf]p$/, "3cp").replace(/^2fp$/, "2mp");
  const toImpf = (t) => t.replace(/^3cp$/, "3mp");
  const ptcImpf = { msa: "3ms", fsa: "3fs", mpa: "3mp", fpa: "3fp", msc: "3ms", mpc: "3mp", fsc: "3fs", fpc: "3fp" };
  const others = {
    p: [["i", toImpf(v.tail)], ["w", toImpf(v.tail)]],
    q: [["w", toImpf(v.tail)], ["i", toImpf(v.tail)]],
    i: [["w", v.tail], ["p", toPerf(v.tail)]],
    w: [["i", v.tail], ["p", toPerf(v.tail)], ["q", toPerf(v.tail)]],
    u: [["w", v.tail], ["i", v.tail]],
    j: [["w", v.tail], ["p", toPerf(v.tail)]],
    h: [["w", v.tail], ["p", toPerf(v.tail)]],
    v: [["i", v.tail], ["p", v.tail === "2fs" ? "2fs" : "2ms"]],
    r: [["s", v.tail], ["i", ptcImpf[v.tail] || "3ms"]],
    s: [["r", v.tail], ["i", ptcImpf[v.tail] || "3ms"]],
    a: [["c", "c"], ["i", "3ms"]],
    c: [["p", "3ms"], ["i", "3ms"]],
  }[v.kind] || [];
  for (const [c, t] of others) tense.push(mk(v.stem, c, t));
  for (const st of STEMS) if (st !== v.stem) stem.push(mk(st, v.conj, v.tail));
  // other readings of the very same letters found in the text (a homograph) are not wrong answers either
  const bad = new Set([item.code, ...(item.alsoCodes || [])]);
  const seen = new Set([verbLabel(item.code)]);
  const out = [];
  const take = (list) => {
    for (const c of shuffle(list)) {
      const label = verbLabel(c);
      if (bad.has(c) || seen.has(label)) continue;
      seen.add(label); out.push(c);
      return true;
    }
    return false;
  };
  for (const list of shuffle([pgn, tense, stem])) take(list);
  for (const list of [pgn, tense, stem]) while (out.length < 3 && take(list)) { /* fill up */ }
  return out.slice(0, 3);
}

// Grammar lessons that explain a verb form: by its tense, then by its stem.
const CONJ_LESSON = { p: "perfect-imperfect", i: "perfect-imperfect", w: "wayyiqtol", u: "wayyiqtol", q: "weqatal", v: "commands", j: "commands", h: "commands", r: "infinitives", s: "infinitives", a: "infinitives", c: "infinitives" };
const STEM_LESSON = { q: "stems", N: "niphal", p: "piel", P: "piel", h: "hiphil", H: "hiphil", t: "hithpael" };

// Verb forms to parse. From the chapter read last: its verbs as they stand. From any other set: the common forms of
// the verbs in it (a word is taken as a verb when its meaning starts "to …" or "be …"; the forms list decides).
async function buildVerbPool(source) {
  if (source === "chapter") {
    const p = store.data.pos || { b: 0, c: 1 };
    const chap = await api.get("chapter", { b: p.b, c: p.c });
    const found = [];
    for (const vrow of chap.verses) vrow[4].forEach((pk, wi) => {
      const w = unpack(pk);
      const code = w.codes[w.main];
      if (w.extra.x === "X" || !splitVerb(code)) return;
      found.push({ qid: `${p.b}.${p.c}.${vrow[0]}.${wi}`, kind: "verb", form: stripCantillation(w.text).replace(/[\/\\]/g, ""), code, key: w.lemma, translit: w.translit,
        ref: { b: p.b, c: p.c, v: vrow[0], w: wi } });
    });
    const keys = [...new Set(found.map(x => x.key))];
    const brief = keys.length ? await api.post("lemma_brief", { keys }) : {};
    for (const it of found) Object.assign(it, lemmaInfo(brief[it.key]));
    return shuffle(found.filter(it => !isDictForm(it))).slice(0, 40);
  }
  const words = await buildPool(source);
  const verbs = words.filter(w => w.kind === "lemma" && /^(to|be) /i.test(w.gloss || "")).slice(0, 12);
  const lists = await Promise.all(verbs.map(w => api.get("forms", { k: w.key }).then(r => [w, r.items], () => [w, []])));
  const out = [];
  for (const [w, forms] of lists) {
    const vf = forms.filter(f => splitVerb(f.morph));
    // the forms that look the same but are read another way
    const byText = new Map();
    for (const f of vf) { const k = stripCantillation(f.form); byText.set(k, (byText.get(k) || []).concat(f.morph)); }
    const lemmaForm = consonantsAndVowels(w.heb);
    for (const f of shuffle(vf.filter(f => consonantsAndVowels(f.form) !== lemmaForm).slice(0, 10)).slice(0, 3)) {
      const form = stripCantillation(f.form);
      out.push(Object.assign({ qid: `${w.key}|${form}|${f.morph}`, kind: "verb", form, code: f.morph, key: w.key, ref: { b: f.b, c: f.c, v: f.v, w: f.w },
        alsoCodes: byText.get(form).filter(c => c !== f.morph) }, lemmaInfo({ hebrew: w.heb, gloss: w.gloss, glossRo: w.glossRo, translit: w.translit, key: w.key })));
    }
  }
  return shuffle(out);
}

// The form exactly as the dictionary writes the word (בּוֹשׁ): for some verbs that is several forms at once (perfect,
// infinitive), and the "from …" line would give it away, so such forms are not asked.
const consonantsAndVowels = (x) => stripCantillation(x || "").replace(/[\/\\\s\u05BE]/g, "");
const isDictForm = (it) => !!it.lemmaHeb && consonantsAndVowels(it.form) === consonantsAndVowels(it.lemmaHeb);

function lemmaInfo(b) {
  if (!b) return {};
  return { lemmaHeb: b.hebrew, lemmaMean: meaning(b), lemmaTr: b.translit || "" };
}

function lessonLinks(code) {
  const v = splitVerb(code);
  if (!v) return null;
  const ids = [...new Set([CONJ_LESSON[v.kind], v.stem !== "q" ? (STEM_LESSON[v.stem] || "rare-stems") : null].filter(Boolean))];
  const links = ids.map(id => [id, lessonTitle(id)]).filter(x => x[1]);
  if (!links.length) return null;
  return h("div", { class: "row lesson-links" }, h("span", { class: "small muted" }, tr("Lesson:", "Lecția:")),
    links.map(([id, title]) => h("button", { class: "btn ghost small keep-open", type: "button", onclick: () => ctx.navigate("grammar", { lesson: id }) }, title)));
}

function seeInVerse(ref) {
  if (!ref) return null;
  return h("button", { class: "btn ghost small keep-open", type: "button", onclick: () => ctx.navigate("read", { b: ref.b, c: ref.c, v: ref.v, w: ref.w }) },
    icon("book"), ctx.refText(ref.b, ref.c, ref.v));
}

function parseQ(item) {
  const s = store.settings;
  const wrap = studyShell(tr("Parse the verb", "Analizează verbul"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const say = () => speak(speakableText(item.form, s));
  const opts = shuffle([item.code, ...verbDistractors(item)]);
  box.append(h("div", { class: "prompt" }, tr("Which form of the verb is this?", "Ce formă a verbului este aceasta?")),
    heBig(item.form), iconBtn("speaker", tr("Listen", "Ascultă"), say),
    item.lemmaHeb ? h("div", { class: "muted small parse-from" }, tr("from ", "de la "), he(stripCantillation(item.lemmaHeb)), item.lemmaMean ? " " + item.lemmaMean : "") : null);
  const grid = h("div", { class: "choices parse-choices" });
  const buttons = opts.map(code => h("button", { class: "choice", type: "button", onclick: (e) => pick(code, e.currentTarget) }, verbLabel(code)));
  grid.append(...buttons);
  box.append(grid);
  const rightBtn = buttons[opts.indexOf(item.code)];
  function pick(code, btn) {
    if (btn.classList.contains("locked")) return;
    const ok = code === item.code;
    if (!ok) btn.classList.add("wrong");
    const p = parseMorph(item.code);
    box.append(h("div", { class: "parse-explain" },
      item.translit ? h("div", { class: "tr", html: translit(item.translit, s, { heb: item.form }) }) : null,
      h("div", null, h("b", null, verbLabel(item.code))),
      p.conjHelp ? h("div", { class: "muted small" }, p.conjHelp.charAt(0).toUpperCase() + p.conjHelp.slice(1)) : null,
      lessonLinks(item.code),
      h("div", { class: "row", style: { justifyContent: "center" } }, seeInVerse(item.ref))));
    say();
    answerFeedback(ok, buttons, rightBtn);
  }
  setKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; if (b) b.click(); } else if (e.key === "p") say(); });
}

// ------------------------------------------------------------------ prefixes and endings

// Wrong answers come from the same group: prefixes, or endings of the same kind (my / your / his…, me / you / him…).
const AFFIX_GROUPS = [
  ["H9001", "H9002", "H9003", "H9004", "H9005", "H9006", "H9007", "H9008", "H9009"],
  ["H9020", "H9021", "H9022", "H9023", "H9024", "H9025", "H9026", "H9027", "H9028", "H9029"],
  ["H9030", "H9031", "H9032", "H9033", "H9034", "H9035", "H9036", "H9037", "H9038", "H9039"],
  ["H9040", "H9041", "H9042", "H9043", "H9044", "H9045", "H9046", "H9047", "H9048", "H9049"],
  ["H9011", "H9012", "H9013", "H9020", "H9023", "H9024"],
];
const SAME_MEANING = { H9001: "H9002", H9002: "H9001" }; // vav: "and (then)" and "and, but" are both "and"

// Words with a prefix or ending, from the chapter read last and (for any other set of words) a few easy chapters of
// the reading path. At most a few questions per prefix, so the very common וְ doesn't fill the game.
async function buildAffixPool(source) {
  const p = store.data.pos || { b: 0, c: 1 };
  const chapters = [[p.b, p.c]];
  if (source !== "chapter") {
    for (const [b, c] of shuffle(READING_PATH)) {
      if (chapters.length >= 3) break;
      if (!chapters.some(x => x[0] === b && x[1] === c)) chapters.push([b, c]);
    }
  }
  const datas = await Promise.all(chapters.map(([b, c]) => api.get("chapter", { b, c })));
  const byTag = new Map();
  for (const data of datas) {
    for (const vrow of data.verses) vrow[4].forEach((pk, wi) => {
      const w = unpack(pk);
      if (w.extra.x === "X" || w.morphs.length < 2) return;
      w.morphs.forEach((m, i) => {
        const tag = (w.tags[i] || "").slice(0, 5);
        if (i === w.main || !isAffix(tag) || !affixIn(tag, w.codes[i]) || !AFFIX_GROUPS.some(g => g.includes(tag))) return;
        const it = { qid: `${data.book}.${data.ch}.${vrow[0]}.${wi}.${i}`, kind: "affix", w, part: i, tag, ref: { b: data.book, c: data.ch, v: vrow[0], w: wi },
          mainMean: lang() === "ro" ? ((data.glossRo || {})[w.lemma] || glossClean(w.gloss[w.main] || "")) : glossClean(w.gloss[w.main] || "") };
        const k = tag + (String(w.codes[i]).slice(1) === "Rd" ? "d" : "");
        byTag.set(k, (byTag.get(k) || []).concat(it));
      });
    });
  }
  const out = [];
  for (const list of byTag.values()) out.push(...shuffle(list).slice(0, 4));
  return shuffle(out);
}

function affixLabel(tag, code) { return (affixIn(tag, code) || [""])[0]; }

function affixOptions(item) {
  const code = item.w.codes[item.part];
  const right = affixLabel(item.tag, code);
  const group = AFFIX_GROUPS.find(g => g.includes(item.tag)) || [];
  const seen = new Set([right]);
  const out = [];
  for (const t of shuffle(group)) {
    if (t === item.tag || t === SAME_MEANING[item.tag]) continue;
    // with the article inside, the other prepositions are offered the same way ("in + the", "like + the")
    const label = affixLabel(t, ["H9003", "H9004", "H9005", "H9006"].includes(t) ? code : "");
    if (!label || seen.has(label)) continue;
    seen.add(label); out.push(label);
    if (out.length >= 3) break;
  }
  return { right, options: shuffle([right, ...out]) };
}

// The word with its parts as spans, the asked part marked (in handwriting the parts lose their points, like the rest).
function affixWord(w, mark) {
  const el = h("div", { class: "big-he aff-word" + heClass(), lang: "he", dir: "rtl" });
  w.morphs.forEach((m, i) => {
    const t = stripCantillation(m);
    el.append(h("span", { class: i === mark ? "aff-on " + morphRole(w, i) : "" }, cursive() ? stripPoints(t) : t));
  });
  return el;
}

function affixQ(item) {
  const s = store.settings;
  const w = item.w;
  const role = morphRole(w, item.part);
  const wrap = studyShell(tr("Prefixes and endings", "Prefixe și terminații"));
  const box = h("div", { class: "card" });
  wrap.append(box);
  const say = () => speak(speakableWord(w, s));
  const { right, options } = affixOptions(item);
  box.append(h("div", { class: "prompt" }, role === "pre" ? tr("What does the marked prefix mean?", "Ce înseamnă prefixul marcat?") : tr("What does the marked ending mean?", "Ce înseamnă terminația marcată?")),
    affixWord(w, item.part), iconBtn("speaker", tr("Listen", "Ascultă"), say));
  const grid = h("div", { class: "choices" });
  const buttons = options.map(o => h("button", { class: "choice", type: "button", onclick: (e) => pick(o, e.currentTarget) }, o));
  grid.append(...buttons);
  box.append(grid);
  const rightBtn = buttons[options.indexOf(right)];
  function pick(o, btn) {
    if (btn.classList.contains("locked")) return;
    const ok = o === right;
    if (!ok) btn.classList.add("wrong");
    const af = affixIn(w.tags[item.part], w.codes[item.part]);
    // the whole word, part by part: וּ + בְ + בֵית + וֹ = and + in + house + his
    // only the first meaning of each part in this line: "to, for" -> "to", "in, on, with + the" -> "in + the"
    const first = (x) => String(x || "").replace(/^([^,+]+)(?:,[^+]*)?/, "$1").trim();
    const parts = w.morphs.map((m, i) => i === w.main ? item.mainMean : first(affixLabel((w.tags[i] || "").slice(0, 5), w.codes[i])) || glossClean(w.gloss[i] || ""));
    box.append(h("div", { class: "parse-explain" },
      h("div", { class: "tr", html: translit(wordTranslit(w, s), s, { heb: w.text }) }),
      af ? h("div", null, h("b", null, af[0]), h("div", { class: "muted small" }, af[1])) : null,
      h("div", { class: "aff-parts" }, h("span", { class: "he" + heClass(), lang: "he", dir: "rtl" }, w.morphs.map(m => heText(stripCantillation(m))).join(" + ")),
        h("span", { class: "muted" }, " = " + parts.filter(Boolean).join(" + "))),
      h("div", { class: "row", style: { justifyContent: "center" } }, seeInVerse(item.ref))));
    say();
    answerFeedback(ok, buttons, rightBtn);
  }
  setKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; if (b) b.click(); } else if (e.key === "p") say(); });
}
