// Interface language (English or Romanian) and Bible version helpers.
// Every visible string is written as tr("English", "Română"), so both languages sit next to each other.

import { store } from "./store.js";

export function lang() {
  return store.settings.lang === "ro" ? "ro" : "en";
}

// Pick the string for the current interface language.
export function tr(en, ro) {
  return lang() === "ro" ? ro : en;
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
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return obj[lang()] ?? obj.en ?? "";
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

// Transliteration written by hand in English style ("me·lekh", "sha·lom", "tze·dek") shown in the chosen
// transliteration spelling (Settings, Reading; by default the interface language): Romanian uses ș, ț, h, gh, i.
export function tl(s) {
  const st = store.settings.translitStyle;
  const style = st === "en" || st === "ro" ? st : lang();
  if (style !== "ro" || !s) return s || "";
  return romanizeTranslit(s);
}

export function romanizeTranslit(s) {
  return String(s)
    .replace(/Sh/g, "Ș").replace(/sh/g, "ș")
    .replace(/Tz/g, "Ț").replace(/tz/g, "ț").replace(/Ts/g, "Ț").replace(/ts/g, "ț")
    .replace(/Ch/g, "H").replace(/ch/g, "h")
    .replace(/Kh/g, "H").replace(/kh/g, "h")
    .replace(/g([eiéí])/g, "gh$1")
    .replace(/Yi/g, "I").replace(/yi/g, "i").replace(/Y/g, "I").replace(/y/g, "i");
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
