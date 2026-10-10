// Small DOM helpers shared by every view.
import { tr, fmtNum, fmtDec, cursive } from "./i18n.js";
import { stripPoints } from "./hebrew.js";
import { studyDate } from "./fsrs.js";

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Hebrew text in the chosen script. Cursive (handwriting) is written without vowel points, like real handwriting;
// the pointed print form is in the tooltip. opts.print forces print (the Bible text itself).
export function he(text, cls = "", opts = {}) {
  if (cursive() && !opts.print) {
    return h("span", { class: ("he cursive " + cls).trim(), lang: "he", dir: "rtl", title: text }, stripPoints(text));
  }
  return h("span", { class: ("he " + cls).trim(), lang: "he", dir: "rtl" }, text);
}

// Big Hebrew word for study (flashcards, word panel, alphabet). In cursive it also shows the pointed print form
// small underneath, so the vowels are never lost.
export function heBig(text, cls = "big-he", attrs = {}) {
  if (cursive()) {
    return h("div", Object.assign({ class: cls + " cursive-pair", lang: "he", dir: "rtl" }, attrs),
      h("div", { class: "cursive" }, stripPoints(text)),
      h("div", { class: "print-under" }, text));
  }
  return h("div", Object.assign({ class: cls, lang: "he", dir: "rtl" }, attrs), text);
}

// Text for a Hebrew button or label in the chosen script (cursive drops the points).
export function heText(text) {
  return cursive() ? stripPoints(text) : text;
}
export function heClass() {
  return cursive() ? " cursive" : "";
}

const ICONS = {
  speaker: '<path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none"/>',
  slow: '<path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l3 2.5-3 2.5" fill="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M8 12h8M8 16h5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  shuffle: '<path d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  follow: '<path d="M3 9h2.5l4-3.5v13L5.5 15H3z" fill="currentColor" stroke="none"/><path d="M13.5 12h1.5M17.5 12h1.5M21 12h.5"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  cards: '<rect x="3.5" y="6" width="13" height="14" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V17"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.2" cy="6.5" r="1" fill="currentColor"/><circle cx="4.2" cy="12" r="1" fill="currentColor"/><circle cx="4.2" cy="17.5" r="1" fill="currentColor"/>',
  more: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  letters: '<path d="M6 5l12 14M17 5c0 3-1.5 4.5-4 5.5M8.5 12.5L6.5 19"/>',
  grammar: '<path d="M4 5.5h7a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 5.5h-5a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h5z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
};

// Phone-size screen (the layout switches to the mobile one) and touch screen without a mouse.
export function isPhone() { return window.matchMedia("(max-width: 760px)").matches; }
export function isTouch() { return window.matchMedia("(hover: none) and (pointer: coarse)").matches; }

// Whether the phone or computer is set to dark mode. Inside the Android app the page can't see that itself.
export function systemDark() {
  const b = window.MikraAndroid;
  if (b && b.systemDark) { try { return !!b.systemDark(); } catch (_) { /* older app */ } }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Wording for the kind of screen: "Click" with a mouse, "Tap" on a touch screen (the Romanian "Apasă" fits both).
export function trt(en, ro, enTouch, roTouch) {
  if (!isTouch()) return tr(en, ro);
  return tr(enTouch || en.replace(/\bClick\b/g, "Tap").replace(/\bclick\b/g, "tap"), roTouch || ro);
}

export function icon(name) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return span.firstChild;
}

export function iconBtn(name, title, onClick, extra = {}) {
  return h("button", { class: "icon-btn " + (extra.class || ""), title, "aria-label": title, onclick: onClick, type: "button" }, icon(name));
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

export function modal(title, body, actions = []) {
  const root = document.getElementById("modal-root");
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
  // only the top dialog answers Escape, so one press doesn't close every stacked dialog
  const onKey = (e) => { if (e.key === "Escape" && root.lastElementChild === back) close(); };
  const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h2", null, title), body,
      actions.length ? h("div", { class: "row", style: { marginTop: "18px", justifyContent: "flex-end" } },
        actions.map(a => h("button", { class: "btn " + (a.primary ? "primary" : ""), onclick: () => { const r = a.onClick && a.onClick(); if (r !== false) close(); } }, a.label))) : null));
  back._close = close; // the Back button and a full rebuild close it this way, so its key listener goes too
  root.appendChild(back);
  document.addEventListener("keydown", onKey);
  return close;
}

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fmtInt(n) {
  return fmtNum(n);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

// Percentage as text in the interface language: "45.3" in English, "45,3" in Romanian (no % sign).
export function fmtPct(a, b) {
  const v = pct(a, b);
  return Number.isInteger(v) ? fmtNum(v) : fmtDec(v, 1);
}

export function relDays(ts) {
  if (!ts) return "";
  const d = (ts - Date.now()) / 86400000;
  if (d <= 0) return tr("now", "acum");
  if (d < 1 / 24) return Math.max(1, Math.round(d * 1440)) + " min";
  if (d < 1) return Math.round(d * 24) + " h";
  if (d < 45) return Math.round(d) + tr(" d", " z");
  if (d < 365) return Math.round(d / 30) + tr(" mo", " luni");
  return fmtDec(d / 365, 1) + tr(" y", " ani");
}

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Today's key in the daily stats. The study day starts at 4 a.m., like the review schedule (see fsrs.js).
export function today() {
  return dateKey(studyDate());
}
