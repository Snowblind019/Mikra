// The grammar course, in six parts. Each part is a file in this folder; each lesson has a stable id used to save progress.
import { tr } from "../i18n.js";
import { BASICS } from "./basics.js";
import { NOUNS } from "./nouns.js";
import { VERBS } from "./verbs.js";
import { WEAK } from "./weak.js";
import { SYNTAX } from "./syntax.js";
import { TEXT } from "./text.js";

export const PARTS = [
  { id: "basics", title: () => tr("Getting started", "Primii pași"), lessons: BASICS },
  { id: "nouns", title: () => tr("Nouns and the words around them", "Substantivele și cuvintele din jurul lor"), lessons: NOUNS },
  { id: "verbs", title: () => tr("The verb", "Verbul"), lessons: VERBS },
  { id: "weak", title: () => tr("Weak verbs", "Verbele slabe"), lessons: WEAK },
  { id: "syntax", title: () => tr("Building sentences", "Construirea propozițiilor"), lessons: SYNTAX },
  { id: "text", title: () => tr("Reading the text", "Citirea textului"), lessons: TEXT },
];
