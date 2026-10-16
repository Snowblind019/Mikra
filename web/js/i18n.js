// Interface language (English or Romanian) and Bible version helpers.
// Every visible string is written as tr("English", "Română"), so both languages sit next to each other.

import { store } from "./store.js";

export function lang() {
  return store.settings.lang === "ro" ? "ro" : "en";
}

// Pick the string for the current interface language. Hebrew words written in Latin letters inside it are marked
// {sha·lom} and shown in the chosen transliteration spelling (see marks() below).
export function tr(en, ro) {
  return marks(lang() === "ro" ? ro : en);
}

// Romanian puts "de" between a number and its noun from 20 on, except when the number ends in 01-19:
// 5 cuvinte, 20 de cuvinte, 101 cuvinte, 120 de cuvinte.
export function roDe(n) {
  const a = Math.abs(Math.trunc(Number(n) || 0));
  const last2 = a % 100;
  return a >= 20 && (last2 === 0 || last2 >= 20) ? "de " : "";
}

// Singular / plural in both languages: trn(n, "word", "words", "cuvânt", "cuvinte") -> "3 words", "25 de cuvinte"
export function trn(n, en1, enN, ro1, roN) {
  const one = n === 1;
  if (lang() === "ro") return `${fmtNum(n)} ${one ? ro1 : roDe(n) + roN}`;
  return `${fmtNum(n)} ${one ? en1 : enN}`;
}

// "5 times" / "de 5 ori", "once" / "o dată"
export function times(n) {
  if (lang() === "ro") return n === 1 ? "o dată" : `de ${fmtNum(n)} ${roDe(n)}ori`;
  return n === 1 ? "once" : `${fmtNum(n)} times`;
}

// Bilingual content object: L({ en: "...", ro: "..." })
export function L(obj) {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object" || Array.isArray(obj)) return marks(obj);
  return marks(obj[lang()] ?? obj.en ?? "");
}

// The Bible shown next to the Hebrew: "kjv" or "ro" (Cornilescu).
export function bible() {
  return store.settings.bible === "ro" ? "ro" : "kjv";
}

export function bibleName(v = bible()) {
  return v === "ro" ? "Cornilescu" : "KJV";
}

export function bibleLang(v = bible()) {
  return v === "ro" ? "ro" : "en";
}

// ------------------------------------------------------------------ transliteration spelling
// Hebrew in Latin letters is written in this app in English style: sh, tz or ts, ch (ח), kh (כ), ph or f (פ), q (ק),
// y (י), w, and a final h for a silent ה (to·rah). Settings, Reading picks how it is shown; by default it follows the
// interface language. Romanian spelling writes it the way Romanian Bibles and books write Hebrew words:
// ș, ț, h, f, k, i, v, gh before e and i, and no h for a silent ה at the end of a word (Tora, Sara, Iahve).
// A ה with a dot (mappiq, לָהּ) is pronounced and keeps its h.

export function translitStyle(settings = store.settings) {
  const st = settings && settings.translitStyle;
  if (st === "en" || st === "ro") return st;
  return settings && settings.lang === "ro" ? "ro" : "en";
}

const RO_LETTERS = { sh: "ș", tz: "ț", ts: "ț", ch: "h", kh: "h", ph: "f", th: "t", iy: "i", yi: "i", q: "k", w: "v", y: "i", g: "gh", "'": "ʼ" };
const VOWEL = "aeiouAEIOUéíáóúÉÍÁÓÚ";
const isUpper = (c) => c !== c.toLowerCase();

// Drops the h of a silent ה at the end of each word: "to·rah" -> "to·ra", "pa.neh" -> "pa.ne". Words end at a space, a
// comma, a slash or the end; with joins = true a hyphen also ends a word (maqaf: be.ne-ya.a.qan), otherwise it is a
// syllable break (va-VO-hu). keep(i) says whether word i keeps its h (a ה with mappiq).
function dropSilentH(s, joins, keep) {
  const sep = (c) => c === undefined || /[\s,;:/()–]/.test(c) || (joins && c === "-");
  let word = -1;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!sep(c) && (i === 0 || sep(s[i - 1]))) word++;
    if ((c === "h" || c === "H") && sep(s[i + 1]) && i > 0 && VOWEL.includes(s[i - 1]) && !keep(word)) continue; // silent ה
    out += c;
  }
  return out;
}

// English-style letters to Romanian ones, keeping capitals (Sh -> Ș, KO-desh -> KO-deș, Yah.Weh -> Iah.Ve).
function roLetters(s) {
  return s.replace(/sh|tz|ts|ch|kh|ph|th|iy|yi|q|w|y|g(?=[.·]?[eiéíEIÉÍ])|'/gi, (m, off) => {
    let r = RO_LETTERS[m.toLowerCase()];
    if (!isUpper(m[0])) return r;
    // GI -> GHI, but Gi -> Ghi; SH -> Ș
    const nextUp = m.length > 1 ? isUpper(m[1]) : isUpper(s[off + 1] || "");
    return r.length > 1 && nextUp ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
  });
}

// Whether a Hebrew word ends in a pronounced ה (with mappiq): לָהּ, אֱלוֹהַּ. Marks after the letter can be in any order.
export function mappiqEnd(heb) {
  const m = String(heb || "").replace(/[֑-ֽֿ֯׀׃-׆]/g, "").replace(/[־\s/]+$/, "").match(/ה([ְ-ׇ]*)$/);
  return !!(m && m[1].includes("ּ"));
}

// For each Latin word of a transliteration, whether its ה at the end is pronounced, from the Hebrew it spells.
// The words are matched one to one when both have the same count, otherwise only the last word is checked.
export function keepFinalH(heb, words, joins) {
  const hw = String(heb || "").split(joins ? /[\s־]+/ : /\s+/).filter(Boolean);
  if (hw.length === words) return (i) => mappiqEnd(hw[i]);
  const last = mappiqEnd(hw[hw.length - 1]);
  return (i) => i === words - 1 && last;
}

// A transliteration in Romanian spelling. joins: a hyphen joins two words (data and dotted text) instead of breaking
// syllables; keep(i): word i ends in a pronounced ה.
export function roSpell(s, joins = false, keep = () => false) {
  return roLetters(dropSilentH(String(s), joins, keep));
}

// A transliteration written by hand in English style ("me·lekh", "sha·lom", "tze·dek"), shown in the chosen spelling.
// heb is the Hebrew it spells, so a final ה with mappiq keeps its h. "q / k|k" gives the Romanian form by hand.
export function tl(s, heb) {
  if (!s) return "";
  s = String(s);
  const bar = s.indexOf("|");
  if (translitStyle() !== "ro") return bar >= 0 ? s.slice(0, bar) : s;
  if (bar >= 0) return s.slice(bar + 1);
  const joins = s.includes("·");
  const words = s.split(joins ? /[\s,;:/()–-]+/ : /[\s,;:/()–]+/).filter(Boolean).length;
  return roSpell(s, joins, heb ? keepFinalH(heb, words, joins) : () => false);
}

// Hebrew words inside interface text, marked {…}: "the article {ha}", "{dagesh}", "{mappiq|mapik}" (English|Romanian
// form, when the Romanian one is not simply the same letters respelled). Shown in the chosen transliteration spelling.
const MARK_RE = /\{([A-Za-zÀ-ɏʼʻ'·\- ,/–]+)(?:\|([A-Za-zÀ-ɏʼʻ'·\- ,/–]*))?\}/g;
export function marks(s) {
  if (typeof s !== "string" || s.indexOf("{") < 0) return s;
  const ro = translitStyle() === "ro";
  return s.replace(MARK_RE, (m, en, roForm) => !ro ? en : roForm !== undefined ? roForm : tl(en));
}

// Meaning of a word in the interface language. Items may carry gloss (English), glossRo / gloss_ro
// (Romanian dictionary meaning) and ro (how Cornilescu translates it in context).
export function meaning(item) {
  if (!item) return "";
  if (lang() === "ro") return item.glossRo || item.gloss_ro || item.ro || item.gloss || "";
  return item.gloss || item.glossRo || "";
}

// Hebrew script for learning: "print" (block letters, as printed Bibles) or "cursive" (handwriting).
export function cursive() {
  return store.settings.script === "cursive";
}

// Number formatting in the interface language.
export function fmtNum(n) {
  return (n || 0).toLocaleString(lang() === "ro" ? "ro-RO" : "en-US");
}

// Decimal number with a fixed number of digits, with the decimal comma in Romanian (1,5) and point in English (1.5).
export function fmtDec(n, digits = 1) {
  return (Number(n) || 0).toLocaleString(lang() === "ro" ? "ro-RO" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
