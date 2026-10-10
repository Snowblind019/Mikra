// Hebrew text helpers: pointing, transliteration styles, morphology decoding, affix names.
import { store } from "./store.js";

const isRo = () => store.settings.lang === "ro";

const CANT_RE = /[֑-ֽֿ֯׀׃-׆]/g;
const VOWEL_RE = /[ְ-ׇּׁׂ]/g;
// Vowels, accents and dots. The maqaf (־), paseq (׀) and sof pasuq (׃) are punctuation and stay, so words joined
// by a maqaf don't run together in handwriting.
const ALL_POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

export function stripCantillation(s) { return (s || "").replace(CANT_RE, ""); }
export function stripPoints(s) { return (s || "").replace(ALL_POINTS, ""); }
export function consonants(s) { return stripPoints(s).replace(/[־\s/\\]/g, ""); }

export function display(s, settings) {
  let t = s || "";
  if (!settings.cantillation || !settings.vowels) t = t.replace(CANT_RE, "");
  if (!settings.vowels) t = t.replace(VOWEL_RE, "");
  return t;
}

// ------------------------------------------------------------------ words from the packed format
// packed: [hebrew morphs, translit, gloss, strongs, morph codes, main idx, lemma key, punct, extra]
export function unpack(p) {
  const hebs = p[0].split("/");
  const lang = p[4][0] || "H";
  const codes = p[4].slice(1).split("/").map(c => lang + c);
  const w = {
    morphs: hebs,
    tr: p[1].split("/"),
    gloss: p[2].split("/"),
    tags: p[3].split("/"),
    codes,
    main: p[5],
    lemma: p[6],
    punct: p[7] || "",
    extra: p[8] || {},
  };
  w.text = hebs.join("");
  w.translit = w.tr.join("");
  return w;
}

export function morphRole(w, i) {
  if (i < w.main) return "pre";
  if (i > w.main) return "suf";
  return "root";
}

// ------------------------------------------------------------------ transliteration
// Source format (STEPBible): syllables split by ".", stressed syllable has a capital letter,
// "'" marks aleph/ayin, "ch" = chet, "kh" = khaf, "tz" = tsadi, "sh" = shin.

function romanianize(s) {
  return s
    .replace(/sh/g, "ș")
    .replace(/tz/g, "ț")
    .replace(/ch/g, "h")
    .replace(/kh/g, "h")
    .replace(/g([ei])/g, "gh$1")
    .replace(/yi/g, "i").replace(/y/g, "i");
}

export function translit(raw, settings, opts = {}) {
  if (!raw) return "";
  raw = String(raw);
  if (/\s/.test(raw.trim())) return raw.trim().split(/\s+/).map(x => translit(x, settings, opts)).join(" ");
  // Romanian spelling (ș, ț, h) or English (sh, tz, ch): as chosen in Settings, or the interface language
  const style = opts.style || translitStyleOf(settings);
  const dots = opts.dots !== undefined ? opts.dots : settings.translitDots;
  const stressMode = opts.stress || settings.translitStress || "bold";
  let s = raw.replace(/\//g, "").replace(/-$/, "");
  const sylls = s.split(".").filter(x => x !== "");
  // The source also capitalizes proper names and secondary stress (Yis.ra.'El, vai.Yo.me.Ru), so only the last
  // capitalized syllable is the main stress.
  let stressIdx = -1;
  sylls.forEach((syl, i) => { if (/[A-Z]/.test(syl)) stressIdx = i; });
  const out = sylls.map((syl, i) => {
    const stressed = i === stressIdx;
    let t = syl.toLowerCase();
    if (style === "ro") t = romanianize(t);
    else if (style === "en") t = t.replace(/'/g, "ʼ");
    if (style === "ro") t = t.replace(/'/g, "ʼ");
    return { t, stressed };
  });
  if (opts.html === false) {
    return out.map(o => stressMode === "caps" && o.stressed ? o.t.toUpperCase() : o.t).join(dots ? "·" : "");
  }
  const sep = dots ? '<span class="faint">·</span>' : "";
  return out.map(o => {
    if (!o.stressed || stressMode === "none") return escapeHtml(o.t);
    if (stressMode === "caps") return escapeHtml(o.t.toUpperCase());
    return "<b>" + escapeHtml(o.t) + "</b>";
  }).join(sep);
}

// The transliteration spelling: Settings, Reading can set it apart from the interface language.
export function translitStyleOf(settings) {
  const v = settings && settings.translitStyle;
  if (v === "en" || v === "ro") return v;
  return settings && settings.lang === "ro" ? "ro" : "en";
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------ morphology

// Labels in both interface languages: [English, Romanian]
const POS = { A: ["adjective", "adjectiv"], C: ["conjunction", "conjuncție"], D: ["adverb", "adverb"], N: ["noun", "substantiv"],
  P: ["pronoun", "pronume"], R: ["preposition", "prepoziție"], S: ["suffix", "sufix"], T: ["particle", "particulă"], V: ["verb", "verb"] };
const H_STEMS = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael", o: "Polel", O: "Polal", r: "Hithpolel", m: "Poel", M: "Poal", k: "Palel", K: "Pulal", Q: "Qal passive", l: "Pilpel", L: "Polpal", f: "Hithpalpel", D: "Nithpael", j: "Pealal", i: "Pilel", u: "Hothpaal", c: "Tiphil", v: "Hishtaphel", w: "Nithpalel", y: "Nithpoel", z: "Hithpoel" };
const A_STEMS = { q: "Peal", Q: "Peil", u: "Hithpeel", p: "Pael", P: "Ithpaal", M: "Hithpaal", a: "Aphel", h: "Haphel", s: "Saphel", e: "Shaphel", H: "Hophal", i: "Ithpeel", t: "Hishtaphel", v: "Ishtaphel", w: "Hithaphel", o: "Polel", z: "Ithpoel", r: "Hithpolel", f: "Hithpalpel", b: "Hephal", c: "Tiphel", m: "Poel", l: "Palpel", L: "Ithpalpel", O: "Ithpolel", G: "Ittaphal" };
const CONJ = {
  p: [["perfect", "qatal: a completed action, usually past"], ["perfect", "qatal: o acțiune încheiată, de obicei la trecut"]],
  q: [["consecutive perfect", "weqatal: 'and he will do', continues a future or a command"], ["perfect consecutiv", "weqatal: „și va face”, continuă un viitor sau o poruncă"]],
  i: [["imperfect", "yiqtol: an unfinished action, usually future or repeated"], ["imperfect", "yiqtol: o acțiune neîncheiată, de obicei viitor sau repetată"]],
  w: [["consecutive imperfect", "wayyiqtol: 'and he did', the main past tense of stories"], ["imperfect consecutiv", "wayyiqtol: „și a făcut”, timpul trecut al povestirilor"]],
  u: [["imperfect with vav", "weyiqtol: 'and (so that) he will do', a wish or purpose"], ["imperfect cu vav", "weyiqtol: „și (ca) să facă”, o dorință sau un scop"]],
  h: [["cohortative", "'let me / let us'"], ["cohortativ", "„să fac / să facem”"]],
  j: [["jussive", "'let him / may he'"], ["jusiv", "„să facă / fie ca el să…”"]],
  v: [["imperative", "a command"], ["imperativ", "o poruncă"]],
  r: [["participle", "active participle: 'doing', 'one who does'"], ["participiu", "participiu activ: „făcând”, „cel ce face”"]],
  s: [["passive participle", "'done', 'having been done'"], ["participiu pasiv", "„făcut”, „care a fost făcut”"]],
  a: [["infinitive absolute", "often doubles a verb for emphasis ('surely')"], ["infinitiv absolut", "dublează adesea verbul pentru întărire („negreșit”)"]],
  c: [["infinitive construct", "'to do', 'when doing'"], ["infinitiv construct", "„a face”, „când face”"]],
};
const PERSON = { 1: ["1st person", "persoana 1"], 2: ["2nd person", "persoana a 2-a"], 3: ["3rd person", "persoana a 3-a"] };
const GENDER = { m: ["masculine", "masculin"], f: ["feminine", "feminin"], b: ["both genders", "ambele genuri"], c: ["common", "comun"] };
const NUMBER = { s: ["singular", "singular"], p: ["plural", "plural"], d: ["dual", "dual"] };
const STATE = { a: ["absolute", "absolut"], c: ["construct", "construct (… lui)"], d: ["definite", "hotărât"] };
const NOUN_T = { c: ["common", "comun"], g: ["gentilic", "nume de neam"], p: ["proper name", "nume propriu"], x: ["", ""] };
const ADJ_T = { a: ["", ""], c: ["cardinal number", "numeral cardinal"], g: ["gentilic", "nume de neam"], o: ["ordinal number", "numeral ordinal"] };
const PRON_T = { d: ["demonstrative", "demonstrativ"], f: ["indefinite", "nehotărât"], i: ["interrogative", "interogativ"], p: ["personal", "personal"], r: ["relative", "relativ"] };
const SUF_T = { d: ["directional he ('towards')", "he de direcție („spre”)"], h: ["paragogic he (emphasis)", "he paragogic (întărire)"], n: ["paragogic nun (emphasis)", "nun paragogic (întărire)"], p: ["pronominal", "pronominal"] };
const PART_T = { a: ["affirmation", "de afirmație"], d: ["definite article", "articol hotărât"], e: ["exhortation", "de îndemn"], i: ["interrogative", "interogativă"], j: ["interjection", "interjecție"], m: ["demonstrative", "demonstrativă"], n: ["negative", "de negație"], o: ["direct object marker", "marcă a complementului direct"], r: ["relative", "relativă"] };

const pick = (pair) => pair ? (isRo() ? pair[1] : pair[0]) : "";

export function parseMorph(code) {
  if (!code) return { pos: "", label: "" };
  const aram = code[0] === "A";
  const lang = aram ? "Aramaic" : "Hebrew";
  const c = code.slice(1);
  const p = c[0];
  const rest = c.slice(1);
  const out = { lang, posCode: p, pos: pick(POS[p]), parts: [] };
  const pgn = (s) => {
    const r = [];
    for (const ch of s) {
      if (PERSON[ch]) r.push(pick(PERSON[ch]));
      else if (GENDER[ch]) r.push(pick(GENDER[ch]));
      else if (NUMBER[ch]) r.push(pick(NUMBER[ch]));
    }
    return r;
  };
  if (p === "V") {
    const stems = aram ? A_STEMS : H_STEMS;
    out.stem = stems[rest[0]] || rest[0];
    const tail = rest.slice(2);
    // In this data "c" followed by a person ("Vqc1cs", וְאֶתְּנָה) is the cohortative; "c" alone is the infinitive construct.
    const conjKey = rest[1] === "c" && /^[123]/.test(tail) ? "h" : rest[1];
    const cj = CONJ[conjKey] ? pick(CONJ[conjKey]) : null;
    out.conj = cj ? cj[0] : rest[1];
    out.conjHelp = cj ? cj[1] : "";
    if (conjKey === "r" || conjKey === "s") {
      out.parts = [pick(GENDER[tail[0]]), pick(NUMBER[tail[1]]), pick(STATE[tail[2]])].filter(Boolean);
    } else if (conjKey === "a" || conjKey === "c") {
      out.parts = []; // infinitives have no person or gender (the letter after them is the state, already in the name)
    } else {
      out.parts = pgn(tail);
    }
    out.label = [out.stem, out.conj, ...out.parts].join(", ");
  } else if (p === "N") {
    const t = rest[0];
    out.type = pick(NOUN_T[t]);
    if (t === "p") {
      const NP = { m: ["person (male)", "persoană (bărbat)"], f: ["person (female)", "persoană (femeie)"], l: ["place", "loc"], t: ["title", "titlu"] };
      out.parts = [pick(NP[rest[1]])].filter(Boolean);
    } else out.parts = [pick(GENDER[rest[1]]), pick(NUMBER[rest[2]]), pick(STATE[rest[3]])].filter(Boolean);
    out.label = [t === "p" ? pick(["proper name", "nume propriu"]) : pick(POS.N), ...out.parts].filter(Boolean).join(", ");
  } else if (p === "A") {
    out.type = pick(ADJ_T[rest[0]]);
    out.parts = [pick(GENDER[rest[1]]), pick(NUMBER[rest[2]]), pick(STATE[rest[3]])].filter(Boolean);
    out.label = [out.type || pick(POS.A), ...out.parts].join(", ");
  } else if (p === "P") {
    out.type = pick(PRON_T[rest[0]]);
    out.parts = pgn(rest.slice(1));
    out.label = [isRo() ? ["pronume", out.type].filter(Boolean).join(" ") : [out.type, "pronoun"].filter(Boolean).join(" "), ...out.parts].join(", ");
  } else if (p === "S") {
    out.type = pick(SUF_T[rest[0]]) || pick(POS.S);
    out.parts = pgn(rest.slice(1));
    out.label = [isRo() ? "sufix " + out.type : out.type + " suffix", ...out.parts].join(", ");
  } else if (p === "T") {
    out.type = pick(PART_T[rest[0]]);
    out.label = isRo() ? ("particulă" + (out.type ? " " + out.type : "")) : ((out.type ? out.type + " " : "") + "particle");
    if (rest[0] === "d") out.label = pick(["definite article ('the')", "articol hotărât (ca -ul, -a)"]);
    if (rest[0] === "o") out.label = pick(["direct object marker (not translated)", "marca complementului direct (ca „pe”)"]);
  } else if (p === "R") {
    out.label = rest[0] === "d" ? pick(["preposition with the article ('in the', 'to the')", "prepoziție cu articol („în -ul”, „la -ul”)"]) : pick(POS.R);
  } else if (p === "C") {
    out.label = pick(POS.C);
  } else if (c[0] === "c") {
    out.label = pick(["conjunction (consecutive vav)", "conjuncție (vav consecutiv)"]);
  } else if (p === "D") {
    out.label = pick(POS.D);
  } else {
    out.label = c;
  }
  if (aram) out.label += pick([" (Aramaic)", " (aramaică)"]);
  return out;
}

export function shortParse(code) {
  const m = parseMorph(code);
  if (m.posCode === "V") {
    const ab = isRo()
      ? { "persoana 1": "1", "persoana a 2-a": "2", "persoana a 3-a": "3", masculin: "m", feminin: "f", singular: "s", plural: "p", dual: "d", comun: "c", "ambele genuri": "c", absolut: "abs", "construct (… lui)": "cstr" }
      : { "1st person": "1", "2nd person": "2", "3rd person": "3", masculine: "m", feminine: "f", singular: "s", plural: "p", dual: "d", common: "c", "both genders": "c", absolute: "abs", construct: "cstr" };
    const abbr = (m.parts || []).map(x => ab[x] ?? x).join("");
    return `${m.stem} ${m.conj}${abbr ? " " + abbr : ""}`;
  }
  return m.label;
}

export function posClass(code) {
  if (!code) return "";
  const c = code.slice(1);
  if (c[0] === "V") return "pos-V";
  if (c.startsWith("Np")) return "pos-Np";
  if (c[0] === "N") return "pos-N";
  return "";
}

// Prefix / suffix lexicon tags (H9001..H9049): [short, explanation] in English and Romanian
const AFFIX_DATA = {
  H9001: [["and (then)", "Vav joined to a verb. Usually turns it into a story-past ('and he did') or future sequence."], ["și (apoi)", "Vav lipit de un verb. De obicei îl face trecutul povestirii („și a făcut”) sau o continuare la viitor."]],
  H9002: [["and, but", "Conjunction vav."], ["și, dar", "Conjuncția vav. În română: și, dar."]],
  H9003: [["in, on, with", "Preposition bet."], ["în, pe, cu", "Prepoziția bet."]],
  H9004: [["like, as", "Preposition kaf."], ["ca, precum", "Prepoziția kaf."]],
  H9005: [["to, for", "Preposition lamed. Also marks 'of' in titles: 'of David'."], ["la, pentru", "Prepoziția lamed. În titluri înseamnă și „al”: „al lui David”."]],
  H9006: [["from", "Preposition mem, short for מִן. Also 'than' in comparisons."], ["din, de la", "Prepoziția mem, scurtă pentru מִן. În comparații înseamnă „decât”."]],
  H9007: [["which, that", "Relative particle shin."], ["care, ce", "Particula relativă șin."]],
  H9008: [["(question)", "He at the start of a yes/no question."], ["(întrebare)", "He la începutul unei întrebări cu da sau nu."]],
  H9009: [["the", "Definite article. English puts it before the word, like Hebrew."], ["-ul, -a (articol)", "Articolul hotărât. Româna îl pune la sfârșit: pământ-ul."]],
  H9010: [["the (Aramaic)", "Aramaic article, written at the end of the word."], ["-ul (aramaică)", "Articolul aramaic, scris la sfârșitul cuvântului, ca în română."]],
  H9011: [["towards", "Directional he: 'to the ...'."], ["spre", "He de direcție: „spre …”."]],
  H9012: [["(emphasis)", "Extra he for emphasis or style."], ["(întărire)", "He în plus, pentru întărire sau stil."]],
  H9013: [["(emphasis)", "Extra nun for emphasis or style."], ["(întărire)", "Nun în plus, pentru întărire sau stil."]],
  H9020: [["my", "Possessive suffix, 1st singular."], ["meu, mea", "Sufix posesiv, persoana 1 singular."]],
  H9021: [["your (m)", "Possessive suffix, 2nd masculine singular."], ["tău (m)", "Sufix posesiv, persoana a 2-a masculin singular."]],
  H9022: [["your (f)", "Possessive suffix, 2nd feminine singular."], ["tău (f)", "Sufix posesiv, persoana a 2-a feminin singular."]],
  H9023: [["his", "Possessive suffix, 3rd masculine singular."], ["lui", "Sufix posesiv, persoana a 3-a masculin singular."]],
  H9024: [["her", "Possessive suffix, 3rd feminine singular."], ["ei", "Sufix posesiv, persoana a 3-a feminin singular."]],
  H9025: [["our", "Possessive suffix, 1st plural."], ["nostru", "Sufix posesiv, persoana 1 plural."]],
  H9026: [["your (m pl)", "Possessive suffix, 2nd masculine plural."], ["vostru (m)", "Sufix posesiv, persoana a 2-a masculin plural."]],
  H9027: [["your (f pl)", "Possessive suffix, 2nd feminine plural."], ["vostru (f)", "Sufix posesiv, persoana a 2-a feminin plural."]],
  H9028: [["their (m)", "Possessive suffix, 3rd masculine plural."], ["lor (m)", "Sufix posesiv, persoana a 3-a masculin plural."]],
  H9029: [["their (f)", "Possessive suffix, 3rd feminine plural."], ["lor (f)", "Sufix posesiv, persoana a 3-a feminin plural."]],
  H9030: [["me", "Object suffix, 1st singular."], ["pe mine, mă", "Sufix de complement, persoana 1 singular."]],
  H9031: [["you (m)", "Object suffix, 2nd masculine singular."], ["pe tine (m)", "Sufix de complement, persoana a 2-a masculin singular."]],
  H9032: [["you (f)", "Object suffix, 2nd feminine singular."], ["pe tine (f)", "Sufix de complement, persoana a 2-a feminin singular."]],
  H9033: [["him", "Object suffix, 3rd masculine singular."], ["pe el, îl", "Sufix de complement, persoana a 3-a masculin singular."]],
  H9034: [["her", "Object suffix, 3rd feminine singular."], ["pe ea, o", "Sufix de complement, persoana a 3-a feminin singular."]],
  H9035: [["us", "Object suffix, 1st plural."], ["pe noi, ne", "Sufix de complement, persoana 1 plural."]],
  H9036: [["you (m pl)", "Object suffix, 2nd masculine plural."], ["pe voi (m)", "Sufix de complement, persoana a 2-a masculin plural."]],
  H9037: [["you (f pl)", "Object suffix, 2nd feminine plural."], ["pe voi (f)", "Sufix de complement, persoana a 2-a feminin plural."]],
  H9038: [["them (m)", "Object suffix, 3rd masculine plural."], ["pe ei, îi", "Sufix de complement, persoana a 3-a masculin plural."]],
  H9039: [["them (f)", "Object suffix, 3rd feminine plural."], ["pe ele, le", "Sufix de complement, persoana a 3-a feminin plural."]],
  H9040: [["I", "Subject suffix, 1st singular (on words like 'behold' or infinitives)."], ["eu", "Sufix de subiect, persoana 1 singular (pe cuvinte ca „iată” sau la infinitive)."]],
  H9041: [["you (m)", "Subject suffix, 2nd masculine singular."], ["tu (m)", "Sufix de subiect, persoana a 2-a masculin singular."]],
  H9042: [["you (f)", "Subject suffix, 2nd feminine singular."], ["tu (f)", "Sufix de subiect, persoana a 2-a feminin singular."]],
  H9043: [["he", "Subject suffix, 3rd masculine singular."], ["el", "Sufix de subiect, persoana a 3-a masculin singular."]],
  H9044: [["she", "Subject suffix, 3rd feminine singular."], ["ea", "Sufix de subiect, persoana a 3-a feminin singular."]],
  H9045: [["we", "Subject suffix, 1st plural."], ["noi", "Sufix de subiect, persoana 1 plural."]],
  H9046: [["you (m pl)", "Subject suffix, 2nd masculine plural."], ["voi (m)", "Sufix de subiect, persoana a 2-a masculin plural."]],
  H9047: [["you (f pl)", "Subject suffix, 2nd feminine plural."], ["voi (f)", "Sufix de subiect, persoana a 2-a feminin plural."]],
  H9048: [["they (m)", "Subject suffix, 3rd masculine plural."], ["ei", "Sufix de subiect, persoana a 3-a masculin plural."]],
  H9049: [["they (f)", "Subject suffix, 3rd feminine plural."], ["ele", "Sufix de subiect, persoana a 3-a feminin plural."]],
};

// [short meaning, explanation] of a prefix or suffix tag in the interface language, or null
export function affix(tag) {
  const k = (tag || "").slice(0, 5);
  return AFFIX_DATA[k] ? pick(AFFIX_DATA[k]) : null;
}

export function isAffix(tag) { return /^H9\d{3}/.test(tag || ""); }

// ------------------------------------------------------------------ audio text
// The Divine Name is traditionally read aloud as Adonai (Cornilescu: "Domnul").
export function speakableWord(w, settings) {
  const parts = w.morphs.map((m, i) => {
    const tag = w.tags[i] || "";
    if (/^H3068/.test(tag)) {
      if (settings.divineName === "adonai") return "אֲדֹנָי";
      if (settings.divineName === "yahweh") return "יַהְוֶה";
    }
    if (/^H3069/.test(tag)) {
      if (settings.divineName === "adonai") return "אֱלֹהִים";
      if (settings.divineName === "yahweh") return "יַהְוֶה";
    }
    return m;
  });
  return stripCantillation(parts.join(""));
}

// Transliteration of a word in the text, following the Divine Name setting.
export function wordTranslit(w, settings) {
  if (settings.divineName === "yahweh") {
    // the source writes "Yah.weh" (capital for the name, stress not marked); match lemmaTranslit's yah.Weh
    return w.tr.map((t, i) => /^H306[89]/.test(w.tags[i] || "") ? t.replace(/y\.?ah\.?weh/i, "yah.Weh") : t).join("");
  }
  if (settings.divineName !== "adonai") return w.translit;
  return w.tr.map((t, i) => {
    const tag = w.tags[i] || "";
    if (/^H3068/.test(tag)) return t.replace(/y\.?ah\.?weh/i, "'a.do.Nai");
    if (/^H3069/.test(tag)) return t.replace(/y\.?ah\.?weh/i, "'e.lo.Him");
    return t;
  }).join("");
}

export function speakableLemma(hebrew, key, settings) {
  if (/^H3068/.test(key || "") && settings.divineName === "adonai") return "אֲדֹנָי";
  if (/^H3069/.test(key || "") && settings.divineName === "adonai") return "אֱלֹהִים";
  if (/^H306[89]/.test(key || "") && settings.divineName === "yahweh") return "יַהְוֶה";
  return stripCantillation(hebrew);
}

// Dictionary transliteration of a word, following the Divine Name setting like wordTranslit().
export function lemmaTranslit(raw, key, settings) {
  if (/^H3068/.test(key || "") && settings.divineName === "adonai") return "'a.do.Nai";
  if (/^H3069/.test(key || "") && settings.divineName === "adonai") return "'e.lo.Him";
  if (/^H306[89]/.test(key || "") && settings.divineName === "yahweh") return "yah.Weh";
  return raw || "";
}

// For free Hebrew text (lesson examples): reads the Divine Name the way Settings, Audio says.
const YHWH_RE = /י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה[\u0591-\u05C7]*/g;
export function speakableText(text, settings) {
  const t = stripCantillation(text || "");
  if (settings.divineName === "adonai") return t.replace(YHWH_RE, (m) => /\u05B1/.test(m) || /\u05B4/.test(m) ? "אֱלֹהִים" : "אֲדֹנָי");
  if (settings.divineName === "yahweh") return t.replace(YHWH_RE, "יַהְוֶה");
  return t;
}

export function verseSpeakable(words, settings) {
  return words.filter(w => !(w.extra && w.extra.x === "X"))
    .map(w => speakableWord(w, settings))
    .join(" ").replace(/\s+/g, " ").trim();
}

// Standard Israeli keyboard (SI-1452): the Latin key you press -> the Hebrew letter it types.
export const KEYBOARD = {
  e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ",
};
export const KEYBOARD_ROWS = [["e", "r", "t", "y", "u", "i", "o", "p"], ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"], ["z", "x", "c", "v", "b", "n", "m", ",", "."]];

// Turns Latin keys into Hebrew letters as if the Hebrew keyboard were on (for people without it installed).
export function latinToHebrew(text) {
  return String(text || "").replace(/[a-z;,.]/gi, (ch) => KEYBOARD[ch.toLowerCase()] || ch);
}

export function glossClean(g) {
  return (g || "").replace(/<([^>]*)>/g, "($1)").replace(/\[|\]/g, "");
}
