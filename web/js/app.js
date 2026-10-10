import { store } from "./store.js";
import { api } from "./store.js";
import { ctx } from "./ctx.js";
import { toast, today as todayKey, h, clear, icon, systemDark as sysDark } from "./ui.js";
import { tr } from "./i18n.js";
import { resolveTheme, themeVars } from "./themes.js";
import { isDue } from "./fsrs.js";
import * as todayView from "./today.js";
import * as reader from "./reader.js";
import * as review from "./review.js";
import * as words from "./words.js";
import * as alphabet from "./alphabet.js";
import * as grammar from "./grammar.js";
import * as progress from "./progress.js";
import * as settings from "./settings.js";

const VIEWS = { today: todayView, read: reader, review, words, alphabet, grammar, progress, settings };
const TAB_LABELS = {
  today: ["Today", "Azi"], read: ["Read", "Citește"], review: ["Review", "Recapitulare"], words: ["My words", "Cuvintele mele"],
  alphabet: ["Alphabet", "Alfabet"], grammar: ["Grammar", "Gramatică"], progress: ["Progress", "Progres"], settings: ["Settings", "Setări"],
};
// Phone layout: four main tabs in a bar at the bottom, the rest behind "More".
const BOTTOM_TABS = [["today", "today"], ["read", "book"], ["review", "cards"], ["words", "list"]];
const MORE_TABS = [["alphabet", "letters"], ["grammar", "grammar"], ["progress", "chart"], ["settings", "gear"]];
const SHORT_LABELS = { words: ["My words", "Cuvinte"] };
const mounted = new Set();
let currentTab = null;
let lastParams = {};

export function applyAppearance() {
  const s = store.settings;
  const root = document.documentElement;
  const systemDark = sysDark();
  const theme = resolveTheme(s, systemDark);
  const { dark, vars } = themeVars(theme, (s.themeOverrides || {})[theme.id] || {});
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  // the phone's status bar and the browser's address bar take the page color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && vars["--paper"]) meta.setAttribute("content", vars["--paper"]);
  try { window.MikraAndroid && window.MikraAndroid.setBars(vars["--paper"] || "", vars["--surface"] || "", !!dark); } catch (_) { /* older app */ }
  root.style.setProperty("--ro-size", s.roSize + "px");
  root.style.setProperty("--he-size", s.heSize + "px");
  if (s.heFont) root.style.setProperty("--he-font", `"${s.heFont}", "Noto Serif Hebrew Local", serif`);
  else root.style.removeProperty("--he-font");
}

function applyLanguage() {
  document.documentElement.lang = store.settings.lang === "ro" ? "ro" : "en";
  for (const b of document.querySelectorAll(".tabs button")) {
    const lab = TAB_LABELS[b.dataset.tab];
    if (!lab) continue;
    const count = b.querySelector(".count");
    b.textContent = tr(lab[0], lab[1]);
    if (count) b.append(" ", count);
  }
  const nav = document.querySelector(".tabs");
  if (nav) nav.setAttribute("aria-label", tr("Sections", "Secțiuni"));
  buildBottomNav();
  const sw = document.getElementById("script-switch");
  if (sw) {
    sw.setAttribute("aria-label", tr("Hebrew letters", "Literele ebraice"));
    for (const b of sw.querySelectorAll("button")) {
      b.title = b.dataset.script === "cursive" ? tr("Handwritten (cursive) Hebrew", "Ebraică scrisă de mână") : tr("Print Hebrew", "Ebraică de tipar");
      b.classList.toggle("on", (store.settings.script || "print") === b.dataset.script);
      b.setAttribute("aria-pressed", String((store.settings.script || "print") === b.dataset.script));
    }
  }
}

// Every view builds its text when it is shown, so a language change rebuilds them all.
function remountAll() {
  for (const tab of mounted) {
    const mod = VIEWS[tab];
    if (mod.hide) { try { mod.hide(); } catch (e) { console.error(e); } }
    if (mod.unmount) { try { mod.unmount(); } catch (e) { console.error(e); } }
    const el = document.getElementById("view-" + tab);
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  mounted.clear();
  const modal = document.getElementById("modal-root");
  if (modal) for (const m of [...modal.children]) if (!m.classList.contains("conflict-note")) (m._close || (() => m.remove()))();
  for (const p of document.querySelectorAll("body > .popover")) p.remove();
  const tab = currentTab || "today";
  currentTab = null;
  // the views keep their own place (lesson, alphabet sub-tab, chapter); old navigation params would reset it
  show(tab, {});
}

function buildBottomNav() {
  const nav = document.getElementById("bottom-nav");
  if (!nav) return;
  clear(nav);
  nav.setAttribute("aria-label", tr("Sections", "Secțiuni"));
  const label = (tab) => { const l = SHORT_LABELS[tab] || TAB_LABELS[tab]; return tr(l[0], l[1]); };
  for (const [tab, ic] of BOTTOM_TABS) {
    nav.append(h("button", { type: "button", class: "bnav", dataset: { tab }, onclick: () => { closeMore(); show(tab); } },
      icon(ic), h("span", null, label(tab)), tab === "review" ? h("i", { class: "bcount", id: "due-count-b" }) : null));
  }
  nav.append(h("button", { type: "button", class: "bnav", dataset: { more: "1" }, onclick: () => toggleMore() }, icon("more"), h("span", null, tr("More", "Mai mult"))));
  markNav();
  refreshDueBadge();
}

function markNav() {
  for (const b of document.querySelectorAll("#bottom-nav .bnav")) {
    const on = b.dataset.more ? MORE_TABS.some(([t]) => t === currentTab) : b.dataset.tab === currentTab;
    b.classList.toggle("on", on);
  }
  const title = document.getElementById("top-title");
  if (title && currentTab && TAB_LABELS[currentTab]) title.textContent = tr(TAB_LABELS[currentTab][0], TAB_LABELS[currentTab][1]);
}

function closeMore() {
  const m = document.querySelector("#modal-root .more-sheet");
  if (m) { m.remove(); return true; }
  return false;
}

// "More": the other sections plus the print / cursive switch (the top bar has no room for it on a phone).
function toggleMore() {
  if (closeMore()) return;
  const root = document.getElementById("modal-root");
  const script = store.settings.script || "print";
  const back = h("div", { class: "modal-back more-sheet", onclick: (e) => { if (e.target === back) back.remove(); } },
    h("div", { class: "sheet", role: "dialog", "aria-label": tr("More", "Mai mult") },
      h("div", { class: "sheet-grid" }, MORE_TABS.map(([tab, ic]) =>
        h("button", { type: "button", class: "sheet-btn" + (tab === currentTab ? " on" : ""), onclick: () => { back.remove(); show(tab); } },
          icon(ic), h("span", null, tr(TAB_LABELS[tab][0], TAB_LABELS[tab][1]))))),
      h("div", { class: "sheet-row" }, h("span", { class: "muted small" }, tr("Hebrew letters for learning", "Literele ebraice pentru învățat")),
        h("div", { class: "seg" },
          h("button", { type: "button", class: script === "print" ? "on" : "", onclick: () => { back.remove(); if (store.settings.script !== "print") store.setting("script", "print"); } }, tr("Print", "Tipar")),
          h("button", { type: "button", class: script === "cursive" ? "on" : "", onclick: () => { back.remove(); if (store.settings.script !== "cursive") store.setting("script", "cursive"); } }, tr("Cursive", "De mână"))))));
  root.append(back);
}

// Android back button (and Escape on the phone layout): close what is open, then go back to Today, then leave.
window.mikraBack = () => {
  if (closeMore()) return true;
  const modals = [...document.querySelectorAll("#modal-root .modal-back:not(.conflict-note)")];
  if (modals.length) { const m = modals[modals.length - 1]; (m._close || (() => m.remove()))(); return true; }
  const mod = VIEWS[currentTab];
  if (mod && mod.back) { try { if (mod.back()) return true; } catch (e) { console.error(e); } }
  if (currentTab && currentTab !== "today") { show("today"); return true; }
  return false;
};

function show(tab, params = {}) {
  if (!VIEWS[tab]) tab = "read";
  const el = document.getElementById("view-" + tab);
  for (const sec of document.querySelectorAll(".view")) sec.hidden = sec !== el;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  const mod = VIEWS[tab];
  if (currentTab && currentTab !== tab && VIEWS[currentTab].hide) VIEWS[currentTab].hide();
  if (!mounted.has(tab)) { mod.mount(el); mounted.add(tab); }
  currentTab = tab;
  lastParams = params;
  markNav();
  if (mod.show) mod.show(params);
}

function refreshDue() {
  const now = Date.now();
  let due = 0;
  for (const c of Object.values(store.data.cards)) if (!c.suspended && c.state !== "new" && isDue(c, now)) due++;
  const newToday = (store.data.daily[todayKey()] || {}).newSeen || 0;
  const newAvail = Object.values(store.data.cards).filter(c => c.state === "new" && !c.suspended).length;
  const n = due + Math.min(newAvail, Math.max(0, store.settings.newPerDay - newToday));
  document.getElementById("due-count").textContent = n ? String(n) : "";
  refreshDueBadge();
}

function refreshDueBadge() {
  const b = document.getElementById("due-count-b");
  const top = document.getElementById("due-count");
  if (b && top) b.textContent = top.textContent;
}

// Study time for the daily goal: counts while the window is visible and you used it in the last minute.
let lastActivity = Date.now();
function trackTime() {
  for (const ev of ["pointerdown", "keydown", "wheel", "pointermove"]) {
    document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true });
  }
  setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastActivity > 60000) return;
    store.bumpDaily("secs", 15);
    store.scheduleSave();
  }, 15000);
}

async function init() {
  await store.load();
  applyAppearance();
  applyLanguage();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);
  window.mikraSystemDarkChanged = applyAppearance; // called by the Android app when the phone switches dark mode
  try {
    [ctx.books, ctx.info] = await Promise.all([api.get("books"), api.get("info")]);
  } catch (e) {
    const main = document.getElementById("main");
    main.textContent = "";
    const page = document.createElement("div");
    page.className = "page";
    const h1 = document.createElement("h1");
    h1.textContent = tr("The app server is not running", "Serverul aplicației nu rulează");
    const p = document.createElement("p");
    p.textContent = tr("Start it again with run.sh (Linux, WSL) or run.bat (Windows), then reload this page.",
      "Pornește-l din nou cu run.sh (Linux, WSL) sau run.bat (Windows), apoi reîncarcă pagina.");
    page.append(h1, p);
    main.append(page);
    return;
  }
  ctx.navigate = (tab, params) => show(tab, params);
  ctx.refreshDue = refreshDue;
  store.on((what, key) => {
    if (what === "settings") applyAppearance();
    if (what === "settings" && key === "lang") {
      // the Bible follows the language; the reader can still switch it afterwards
      store.data.settings.bible = store.settings.lang === "ro" ? "ro" : "kjv";
    }
    if (what === "settings" && (key === "lang" || key === "script")) { applyLanguage(); remountAll(); }
    // a restored backup brings its own language, script and Bible: rebuild everything without resetting the Bible
    if (what === "restore") { applyAppearance(); applyLanguage(); remountAll(); refreshDue(); }
    if (what === "cards" || what === "review") refreshDue();
  });
  for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => show(b.dataset.tab));
  for (const b of document.querySelectorAll("#script-switch button")) {
    b.addEventListener("click", () => { if (store.settings.script !== b.dataset.script) store.setting("script", b.dataset.script); });
  }
  refreshDue();
  setInterval(refreshDue, 60000);
  trackTime();
  show("today", {});
  document.addEventListener("keydown", (e) => {
    if (e.altKey && /^[1-8]$/.test(e.key)) {
      const tabs = Object.keys(VIEWS);
      show(tabs[Number(e.key) - 1]);
      e.preventDefault();
    }
  });
}

init();
