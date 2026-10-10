// Building blocks shared by every grammar lesson file. A lesson is { id, title: () => string, body: () => [nodes], search?, searchLabel? }.
// English lessons compare Hebrew with English and quote the KJV; Romanian lessons compare with Romanian and quote Cornilescu.

import { store } from "../store.js";
import { ctx } from "../ctx.js";
import { h, icon, iconBtn, he } from "../ui.js";
import { tr, tl, lang } from "../i18n.js";
import { speak } from "../audio.js";
import { speakableText } from "../hebrew.js";

export { tr, tl, lang, h, he, icon };
export { trt } from "../ui.js";

// Example: Hebrew, transliteration (English style, shown in the chosen spelling), meaning,
// how the KJV and Cornilescu render it, and the verse as [book, chapter, verse] (book 0 = Genesis).
export const ex = (heb, trl, mean, kjv, ro, ref) => h("div", { class: "ex" },
  h("span", { class: "t" }, tl(trl), (lang() === "ro" ? ro : kjv) ? h("span", { class: "muted" }, "   " + (lang() === "ro" ? "Cornilescu: " + ro : "KJV: " + kjv)) : null),
  h("span", { class: "he-ex" }, he(heb), " ", iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableText(heb, store.settings)))),
  h("span", { class: "m" }, mean, ref ? h("span", { class: "faint" }, ", " + ctx.refText(...ref)) : null));

// A verse quoted in the interface language's Bible.
export const quote = (ref, kjv, ro) => h("blockquote", { class: "gr-quote" },
  h("div", null, lang() === "ro" ? ro : kjv),
  h("div", { class: "small faint" }, `${ctx.refText(...ref)}, ${lang() === "ro" ? "Cornilescu" : "KJV"}`));

// A whole Hebrew verse or phrase shown big, right to left.
export const verse = (heb) => h("div", { class: "he gr-verse", lang: "he" }, heb);

// A cell that is only Hebrew is shown big and right to left. A cell that mixes Hebrew with words ("וְהָאָרֶץ and the earth")
// stays a normal left-to-right cell with the Hebrew parts marked as Hebrew.
const isHeb = (c) => typeof c === "string" && /[֐-׿]/.test(c) && !/[A-Za-zÀ-ɏ]/.test(c);
const isMixed = (c) => typeof c === "string" && /[֐-׿]/.test(c) && /[A-Za-zÀ-ɏ]/.test(c);
const mixedText = (c) => c.split(/([֐-׿](?:[֐-׿\s]*[֐-׿])?)/).filter(Boolean)
  .map(x => /[֐-׿]/.test(x) ? he(x, "inline") : x);
// Table: cells are strings, { t: "translit" } (shown via tl()), or DOM nodes.
export const table = (head, rows) => h("div", { class: "table-wrap" }, h("table", null,
  h("thead", null, h("tr", null, head.map(x => h("th", null, isHeb(x) ? he(x, "inline") : isMixed(x) ? mixedText(x) : x)))),
  h("tbody", null, rows.map(r => h("tr", null, r.map((c) => isHeb(c) ? h("td", { class: "he-cell" }, he(c))
    : isMixed(c) ? h("td", null, mixedText(c))
    : (c && typeof c === "object" && "t" in c) ? h("td", { class: "tl" }, tl(c.t)) : h("td", null, c)))))));

export const p = (...x) => h("p", null, ...x);
export const h2 = (en, ro) => h("h2", null, tr(en, ro));
export const tip = (...x) => h("div", { class: "tip" }, ...x);
export const ul = (...items) => h("ul", null, items.map(i => h("li", null, ...(Array.isArray(i) ? i : [i]))));
export const ol = (...items) => h("ol", { class: "gr-steps" }, items.map(i => h("li", null, ...(Array.isArray(i) ? i : [i]))));
// A word with its parts colored: prefix (teal), main part, ending (plum).
export const colored = (pre, rootPart, suf) => h("span", { class: "he gr-big", lang: "he" },
  pre ? h("span", { class: "hp-pre" }, pre) : null, rootPart, suf ? h("span", { class: "hp-suf" }, suf) : null);
// A colored word next to its explanation, on one line.
export const built = (pre, rootPart, suf, en, ro) => h("div", { class: "row", style: { gap: "20px", margin: "10px 0" } }, colored(pre, rootPart, suf), h("span", null, tr(en, ro)));
export const H = (s) => he(s, "inline");
export const T = (s) => tl(s);
export const B = (...x) => h("b", null, ...x);
export const I = (...x) => h("i", null, ...x);
// A sentence in both languages, with inline Hebrew marked by «…»: t("the word «אֶרֶץ» means land", "cuvântul «אֶרֶץ» înseamnă pământ")
export const t = (en, ro) => tr(en, ro).split(/«([^»]*)»/).map((s, i) => i % 2 ? H(s) : s);
// A paragraph written with «…» for Hebrew.
export const pt = (en, ro) => h("p", null, ...t(en, ro));
// A list item written with «…» for Hebrew.
export const lt = (en, ro) => t(en, ro);
// A tip written with «…» for Hebrew.
export const tipt = (en, ro) => tip(...t(en, ro));
