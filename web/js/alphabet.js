// Alphabet tab: letters (print and cursive), vowels, other marks, syllable builder, writing practice, keyboard, drills.

import { api, store } from "./store.js";
import { h, clear, icon, iconBtn, he, heText, heClass, toast, shuffle, deckFor, choiceSeg, trt } from "./ui.js";
import { tr, tl, L, lang, cursive } from "./i18n.js";
import { translit, lemmaTranslit, speakableLemma, stripCantillation, stripPoints, KEYBOARD, KEYBOARD_ROWS } from "./hebrew.js";
import { speak } from "./audio.js";
import { ctx } from "./ctx.js";

let root, body, sub = "letters";

// ------------------------------------------------------------------ data
// name: [English, Romanian], with Hebrew words marked {…} so they follow the transliteration spelling;
// tr: hand transliteration (English style, shown through tl(); "q / k|k" gives the Romanian form by hand);
// sound / cmp: { en, ro }; ex: [Hebrew, transliteration, { en, ro } meaning, [book, chapter, verse]]

export const LETTERS = [
  { ch: "א", name: ["Alef", "Alef"], nameHe: "אָלֶף", tr: "ʼ", value: 1,
    sound: { en: "No sound of its own. It carries a vowel, or is a light catch in the throat.", ro: "Nu are sunet al ei. Poartă o vocală sau e o mică oprire în gât." },
    cmp: { en: "Like the small catch in “uh-oh”. Most of the time you just read the vowel under it.", ro: "Ca mica oprire dintre cele două silabe din „a-a” (când spui „nu”). De cele mai multe ori citești doar vocala de sub ea." },
    ex: ["אוֹר", "or", { en: "light", ro: "lumină" }, [0, 1, 3]] },
  { ch: "ב", name: ["Bet / Vet", "Bet / Vet"], nameHe: "בֵּית", tr: "b / v", value: 2,
    sound: { en: "With a dot inside (בּ) it is b. Without the dot (ב) it is v.", ro: "Cu punct înăuntru (בּ) e b. Fără punct (ב) e v." },
    cmp: { en: "b as in “boy”, v as in “very”.", ro: "b ca în „bun”, v ca în „vin”." },
    ex: ["בָּרָא", "ba·ra", { en: "he created", ro: "a făcut (a creat)" }, [0, 1, 1]], ex2: ["טוֹב", "tov", { en: "good", ro: "bun" }, [0, 1, 4]], like: ["כ"] },
  { ch: "ג", name: ["{Gimel}", "{Gimel}"], nameHe: "גִּימֶל", tr: "g", value: 3,
    sound: { en: "Always a hard g.", ro: "Mereu un g tare." },
    cmp: { en: "Like “g” in “go”, never like “g” in “gem”.", ro: "Ca „g” din „gară”, niciodată ca „ge” sau „gi” din română." },
    ex: ["גָּדוֹל", "ga·dol", { en: "great", ro: "mare" }, [0, 12, 2]], like: ["נ"] },
  { ch: "ד", name: ["Dalet", "Dalet"], nameHe: "דָּלֶת", tr: "d", value: 4,
    sound: { en: "d.", ro: "d." }, cmp: { en: "Like English d.", ro: "Ca d din română." },
    ex: ["דָּבָר", "da·var", { en: "word, thing", ro: "cuvânt, lucru" }, [0, 18, 14]], like: ["ר", "ך"] },
  { ch: "ה", name: ["He", "He"], nameHe: "הֵא", tr: "h", value: 5,
    sound: { en: "A soft h. At the end of a word it is silent and only shows a vowel, unless it has a dot (הּ).", ro: "Un h moale. La sfârșitul cuvântului e mut și doar arată o vocală, afară de cazul când are punct (הּ)." },
    cmp: { en: "Like “h” in “hat”.", ro: "Ca „h” din „haină”, moale, nu aspru." },
    ex: ["הָיָה", "ha·yah", { en: "he was", ro: "a fost" }, [0, 3, 1]], like: ["ח", "ת"] },
  { ch: "ו", name: ["Vav", "Vav"], nameHe: "וָו", tr: "v", value: 6,
    sound: { en: "v. It also writes vowels: וֹ is o and וּ is u.", ro: "v. Scrie și vocale: וֹ e o și וּ e u." },
    cmp: { en: "v as in “very”.", ro: "v ca în „vin”." },
    ex: ["וַיֹּאמֶר", "va·yo·mer", { en: "and he said", ro: "și a zis" }, [0, 1, 3]], like: ["ז", "ן"] },
  { ch: "ז", name: ["{Zayin}", "{Zayin}"], nameHe: "זַיִן", tr: "z", value: 7,
    sound: { en: "z.", ro: "z." }, cmp: { en: "Like English z.", ro: "Ca z din română." },
    ex: ["זָכַר", "za·khar", { en: "he remembered", ro: "și-a adus aminte" }, [0, 40, 23]], like: ["ו", "ן"] },
  { ch: "ח", name: ["{Chet}", "{Chet}"], nameHe: "חֵית", tr: "ch", value: 8,
    sound: { en: "A scraped h from the back of the throat.", ro: "Un h aspru, din fundul gâtului." },
    cmp: { en: "Like “ch” in Scottish “loch” or German “Bach”.", ro: "Foarte aproape de h din „duh” sau „hrană”." },
    ex: ["חֹשֶׁךְ", "cho·shekh", { en: "darkness", ro: "întuneric" }, [0, 1, 2]], like: ["ה", "ת"] },
  { ch: "ט", name: ["Tet", "Tet"], nameHe: "טֵית", tr: "t", value: 9,
    sound: { en: "t.", ro: "t." }, cmp: { en: "Like English t.", ro: "Ca t din română." },
    ex: ["טוֹב", "tov", { en: "good", ro: "bun" }, [0, 1, 4]] },
  { ch: "י", name: ["{Yod}", "{Yod}"], nameHe: "יוֹד", tr: "y", value: 10,
    sound: { en: "{y}. It also helps write the vowels i and e.", ro: "{y} (ca în „iarnă”). Ajută și la scrierea vocalelor i și e." },
    cmp: { en: "Like “y” in “yes”.", ro: "Ca „i” de la începutul lui „iarnă”." },
    ex: ["יוֹם", "yom", { en: "day", ro: "zi" }, [0, 1, 5]] },
  { ch: "כ", name: ["Kaf / {Khaf}", "Kaf / {Khaf}"], nameHe: "כַּף", tr: "k / kh", value: 20, final: "ך",
    sound: { en: "With a dot (כּ) it is k. Without the dot (כ) it is the scraped h, the same sound as ח. At the end of a word it is written ך.", ro: "Cu punct (כּ) e k. Fără punct (כ) e h-ul aspru, același sunet ca ח. La sfârșitul cuvântului se scrie ך." },
    cmp: { en: "k as in “king”; without the dot like “ch” in “Bach”.", ro: "k ca în „cal”; fără punct ca h din „duh”." },
    ex: ["כָּל", "kol", { en: "all", ro: "tot" }, [0, 1, 21]], ex2: ["מֶלֶךְ", "me·lekh", { en: "king", ro: "împărat" }, [0, 14, 1]], like: ["ב"] },
  { ch: "ל", name: ["Lamed", "Lamed"], nameHe: "לָמֶד", tr: "l", value: 30,
    sound: { en: "l. The only letter that rises above the line.", ro: "l. Singura literă care se ridică peste linie." },
    cmp: { en: "Like English l.", ro: "Ca l din română." },
    ex: ["לֵב", "lev", { en: "heart", ro: "inimă" }, null] },
  { ch: "מ", name: ["Mem", "Mem"], nameHe: "מֵם", tr: "m", value: 40, final: "ם",
    sound: { en: "m. At the end of a word it is written ם (a closed square).", ro: "m. La sfârșitul cuvântului se scrie ם (un pătrat închis)." },
    cmp: { en: "Like English m.", ro: "Ca m din română." },
    ex: ["מַיִם", "ma·yim", { en: "water", ro: "ape" }, [0, 1, 2]], like: ["ס"] },
  { ch: "נ", name: ["Nun", "Nun"], nameHe: "נוּן", tr: "n", value: 50, final: "ן",
    sound: { en: "n. At the end of a word it is written ן, a long line going below the line.", ro: "n. La sfârșitul cuvântului se scrie ן, o linie lungă care coboară sub rând." },
    cmp: { en: "Like English n.", ro: "Ca n din română." },
    ex: ["נֶפֶשׁ", "ne·fesh", { en: "soul, life", ro: "suflet, viață" }, [0, 2, 7]], ex2: ["בֵּן", "ben", { en: "son", ro: "fiu" }, [0, 4, 25]], like: ["ג"] },
  { ch: "ס", name: ["{Samekh}", "{Samekh}"], nameHe: "סָמֶךְ", tr: "s", value: 60,
    sound: { en: "s.", ro: "s." }, cmp: { en: "Like English s.", ro: "Ca s din română." },
    ex: ["סֵפֶר", "se·fer", { en: "book, scroll", ro: "carte, sul" }, [0, 5, 1]], like: ["ם"] },
  { ch: "ע", name: ["{Ayin}", "{Ayin}"], nameHe: "עַיִן", tr: "ʻ", value: 70,
    sound: { en: "Usually read silent like alef today. Originally a deep sound in the throat.", ro: "Azi se citește de obicei mut, ca alef. La început era un sunet adânc din gât." },
    cmp: { en: "No English equivalent. Read the vowel under it.", ro: "Nu are pereche în română. Citește vocala de sub ea." },
    ex: ["עוֹלָם", "o·lam", { en: "forever, world", ro: "veșnicie, lume" }, [0, 9, 16]], like: ["צ"] },
  { ch: "פ", name: ["Pe / Fe", "Pe / Fe"], nameHe: "פֵּא", tr: "p / f", value: 80, final: "ף",
    sound: { en: "With a dot (פּ) it is p. Without the dot (פ) it is f. At the end of a word it is written ף.", ro: "Cu punct (פּ) e p. Fără punct (פ) e f. La sfârșitul cuvântului se scrie ף." },
    cmp: { en: "p as in “peace”, f as in “fire”.", ro: "p ca în „pace”, f ca în „foc”." },
    ex: ["פָּנִים", "pa·nim", { en: "face", ro: "față" }, [0, 32, 30]], ex2: ["אַף", "af", { en: "also; nose", ro: "și; nas" }, [0, 3, 1]] },
  { ch: "צ", name: ["{Tsadi}", "{Tsadi}"], nameHe: "צָדִי", tr: "tz", value: 90, final: "ץ",
    sound: { en: "{ts}. At the end of a word it is written ץ.", ro: "{ts}. La sfârșitul cuvântului se scrie ץ." },
    cmp: { en: "Like “ts” in “cats”.", ro: "Exact ț din română." },
    ex: ["צֶדֶק", "tze·dek", { en: "righteousness", ro: "dreptate" }, [2, 19, 36]], ex2: ["אֶרֶץ", "e·retz", { en: "earth, land", ro: "pământ, țară" }, [0, 2, 11]], like: ["ע"] },
  { ch: "ק", name: ["{Qof|Kuf}", "{Qof|Kuf}"], nameHe: "קוֹף", tr: "q / k|k", value: 100,
    sound: { en: "k. Originally said deeper in the throat than כּ.", ro: "k. La început se spunea mai adânc în gât decât כּ." },
    cmp: { en: "Like “k” in “king”.", ro: "Ca c din „cal”." },
    ex: ["קוֹל", "kol", { en: "voice", ro: "glas" }, [0, 3, 8]] },
  { ch: "ר", name: ["{Resh}", "{Resh}"], nameHe: "רֵישׁ", tr: "r", value: 200,
    sound: { en: "r. Israelis say it in the throat; a rolled r is also used in many traditions.", ro: "r. Israelienii îl spun din gât; în multe tradiții se folosește și r-ul rulat." },
    cmp: { en: "Any English r works; a rolled r is also fine.", ro: "R-ul tău românesc e foarte bun." },
    ex: ["רוּחַ", "ru·ach", { en: "spirit, wind", ro: "duh, vânt" }, [0, 1, 2]], like: ["ד", "ך"] },
  { ch: "ש", name: ["{Shin} / Sin", "{Shin} / Sin"], nameHe: "שִׁין", tr: "sh / s", value: 300,
    sound: { en: "A dot on the right (שׁ) makes {sh}. A dot on the left (שׂ) makes s.", ro: "Punctul în dreapta (שׁ) face {sh}. Punctul în stânga (שׂ) face s." },
    cmp: { en: "שׁ is “sh” as in “shoe”, שׂ is s.", ro: "שׁ e ș din română, שׂ e s." },
    ex: ["שָׁלוֹם", "sha·lom", { en: "peace", ro: "pace" }, [0, 43, 23]], ex2: ["יִשְׂרָאֵל", "yis·ra·el", { en: "Israel", ro: "Israel" }, [0, 32, 28]] },
  { ch: "ת", name: ["Tav", "Tav"], nameHe: "תָּו", tr: "t", value: 400,
    sound: { en: "t, with or without the dot in modern reading.", ro: "t, cu sau fără punct în citirea de azi." },
    cmp: { en: "Like English t.", ro: "Ca t din română." },
    ex: ["תּוֹרָה", "to·rah", { en: "law, teaching", ro: "lege, învățătură" }, [1, 12, 49]], like: ["ה", "ח"] },
];

const FINAL_INFO = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

export const VOWELS = [
  { sign: "ַ", name: ["{Patach}", "{Patach}"], nameHe: "פַּתַח", sound: "a", cmp: { en: "a as in “father”", ro: "a ca în „apă”" }, kind: "short", ex: ["בַּת", "bat", { en: "daughter", ro: "fiică" }] },
  { sign: "ָ", name: ["{Kamatz}", "{Kamatz}"], nameHe: "קָמַץ", sound: "a", cmp: { en: "a as in “father”; in a few closed syllables it is o ({kamatz katan})", ro: "a; în câteva silabe închise e o ({kamatz katan})" }, kind: "long", ex: ["דָּבָר", "da·var", { en: "word", ro: "cuvânt" }] },
  { sign: "ֲ", name: ["{Chataf patach}", "{Chataf patach}"], nameHe: "חֲטַף פַּתַח", sound: "a", cmp: { en: "a very short a", ro: "un a foarte scurt" }, kind: "reduced", ex: ["אֲנִי", "a·ni", { en: "I", ro: "eu" }] },
  { sign: "ֵ", name: ["{Tsere}", "{Tsere}"], nameHe: "צֵרֵי", sound: "e", cmp: { en: "e as in “they”", ro: "e ca în „mere”" }, kind: "long", ex: ["לֵב", "lev", { en: "heart", ro: "inimă" }] },
  { sign: "ֵי", name: ["{Tsere} with {yod}", "{Tsere} cu {yod}"], nameHe: "צֵרֵי מָלֵא", sound: "e / ei", cmp: { en: "e or “ei” as in “eight”", ro: "e sau ei ca în „lei”" }, kind: "long", ex: ["בֵּית", "beit", { en: "house of", ro: "casa lui" }] },
  { sign: "ֶ", name: ["Segol", "Segol"], nameHe: "סֶגּוֹל", sound: "e", cmp: { en: "e as in “bed”", ro: "e ca în „mere”" }, kind: "short", ex: ["מֶלֶךְ", "me·lekh", { en: "king", ro: "împărat" }] },
  { sign: "ֱ", name: ["{Chataf} segol", "{Chataf} segol"], nameHe: "חֲטַף סֶגּוֹל", sound: "e", cmp: { en: "a very short e", ro: "un e foarte scurt" }, kind: "reduced", ex: ["אֱלֹהִים", "e·lo·him", { en: "God", ro: "Dumnezeu" }] },
  { sign: "ִ", name: ["{Chirik}", "{Chirik}"], nameHe: "חִירִיק", sound: "i", cmp: { en: "i as in “machine”", ro: "i ca în „vin”" }, kind: "short", ex: ["מִן", "min", { en: "from", ro: "din" }] },
  { sign: "ִי", name: ["{Chirik} with {yod}", "{Chirik} cu {yod}"], nameHe: "חִירִיק מָלֵא", sound: "i", cmp: { en: "i as in “machine”", ro: "i ca în „vin”" }, kind: "long", ex: ["שִׁיר", "shir", { en: "song", ro: "cântare" }] },
  { sign: "ֹ", name: ["{Cholam}", "{Cholam}"], nameHe: "חוֹלָם", sound: "o", cmp: { en: "o as in “go”", ro: "o ca în „om”" }, kind: "long", ex: ["לֹא", "lo", { en: "not", ro: "nu" }] },
  { sign: "וֹ", name: ["{Cholam} with vav", "{Cholam} cu vav"], nameHe: "חוֹלָם מָלֵא", sound: "o", cmp: { en: "o as in “go”", ro: "o ca în „om”" }, kind: "long", ex: ["טוֹב", "tov", { en: "good", ro: "bun" }] },
  { sign: "ֳ", name: ["{Chataf kamatz}", "{Chataf kamatz}"], nameHe: "חֲטַף קָמַץ", sound: "o", cmp: { en: "a very short o", ro: "un o foarte scurt" }, kind: "reduced", ex: ["חֳדָשִׁים", "cho·da·shim", { en: "months", ro: "luni" }] },
  { sign: "ֻ", name: ["{Kubutz}", "{Kubutz}"], nameHe: "קֻבּוּץ", sound: "u", cmp: { en: "u as in “rule”", ro: "u ca în „unu”" }, kind: "short", ex: ["שֻׁלְחָן", "shul·chan", { en: "table", ro: "masă" }] },
  { sign: "וּ", name: ["{Shuruk}", "{Shuruk}"], nameHe: "שׁוּרֻק", sound: "u", cmp: { en: "u as in “rule”", ro: "u ca în „unu”" }, kind: "long", ex: ["רוּחַ", "ru·ach", { en: "spirit", ro: "duh" }] },
  { sign: "ְ", name: ["{Shva}", "{Shva}"], nameHe: "שְׁוָא", sound: "e / –", cmp: { en: "a quick “uh”, or nothing at all", ro: "un ă scurt, sau nimic" }, kind: "reduced", ex: ["בְּרֵאשִׁית", "be·re·shit", { en: "in the beginning", ro: "la început" }] },
];

const KIND = { short: ["short", "scurtă"], long: ["long", "lungă"], reduced: ["reduced", "redusă"] };

const MARKS = [
  { he: "בּ", name: ["{Dagesh}", "{Dagesh}"], text: { en: "A dot inside a letter. In ב כ פ it makes the hard sound (b, k, p). In most other letters it doubles the letter: הַשָּׁמַיִם is {hash-shamayim}. The six letters בגדכפת are called begadkefat because they can take the hardening dot.",
    ro: "Un punct într-o literă. În ב כ פ dă sunetul tare (b, k, p). În cele mai multe alte litere dublează litera: הַשָּׁמַיִם se citește {hash-shamayim}. Cele șase litere בגדכפת se numesc begadkefat pentru că pot primi acest punct." }, ex: ["הַשָּׁמַיִם", "ha·sha·ma·yim", { en: "the heavens", ro: "cerurile" }] },
  { he: "הּ", name: ["{Mappiq|Mapik}", "{Mappiq|Mapik}"], text: { en: "A dot inside a final ה. It means the h is really pronounced, usually meaning “her”.", ro: "Un punct într-un ה de la sfârșit. Arată că h chiar se pronunță; de obicei înseamnă „ei” (a ei)." }, ex: ["לָהּ", "lah", { en: "to her", ro: "ei (către ea)" }] },
  { he: "שׁ שׂ", name: ["{Shin} dot and sin dot", "Punctul de la {shin} și sin"], text: { en: "Dot on the right: {sh}. Dot on the left: s.", ro: "Punct în dreapta: {sh}. Punct în stânga: s." }, ex: ["שָׂרָה", "sa·rah", { en: "Sarah", ro: "Sara" }] },
  { he: "וּ וֹ", name: ["Vav as a vowel", "Vav ca vocală"], text: { en: "With a dot in its middle, ו is the vowel u. With a dot on top, it is the vowel o. Letters that show vowels like this (א ה ו י) are called matres lectionis, “mothers of reading”.",
    ro: "Cu un punct la mijloc, ו este vocala u. Cu un punct deasupra, este vocala o. Literele care arată vocale așa (א ה ו י) se numesc matres lectionis, „mamele citirii”." }, ex: ["תּוֹרָה", "to·rah", { en: "teaching", ro: "învățătură" }] },
  { he: "־", name: ["{Maqaf}", "{Maqaf}"], text: { en: "A small hyphen at the top. It joins two words so they are read as one unit with one main stress.", ro: "O liniuță mică sus. Leagă două cuvinte ca să fie citite împreună, cu un singur accent principal." }, ex: ["כָּל־הָאָרֶץ", "kol ha·a·retz", { en: "all the earth", ro: "tot pământul" }] },
  { he: "׃", name: ["Sof {pasuq}", "Sof {pasuq}"], text: { en: "Two dots like a colon. It ends the verse.", ro: "Două puncte, ca semnul „:”. Încheie versetul." }, ex: null },
  { he: "ב֑", name: ["Accent marks ({te'amim|teamim})", "Accentele ({te'amim|teamim})"], text: { en: "The small marks above and below the words show the melody for chanting the text. More useful for you: the accent usually sits on the stressed syllable, so it shows where to put the stress. The biggest pauses are {atnach} ֑ (the middle of the verse) and {silluq}, the last stressed word before ׃. You can hide accents in the reader under View.",
    ro: "Semnele mici de deasupra și de dedesubtul cuvintelor arată melodia cântării. Mai folositor pentru tine: semnul de accent stă de obicei pe silaba accentuată, deci îți arată unde cade accentul. Cele mai mari pauze sunt {atnach} ֑ (mijlocul versetului) și {silluq}, ultimul cuvânt accentuat dinainte de ׃. Le poți ascunde în cititor din Afișare." }, ex: null },
  { he: "בָֽ", name: ["Meteg", "Meteg"], text: { en: "A short vertical line under a letter, next to a vowel. It marks a secondary stress and helps keep the vowel long. You can ignore it while learning.", ro: "O linie mică verticală sub o literă, lângă o vocală. Arată un accent secundar și ține vocala lungă. Poți să n-o bagi în seamă cât înveți." }, ex: null },
  { he: "׀", name: ["{Paseq}", "{Paseq}"], text: { en: "A vertical line between words. A small pause.", ro: "O linie verticală între cuvinte. O pauză mică." }, ex: null },
  { he: "פ ס", name: ["Paragraph marks", "Semne de paragraf"], text: { en: "פ marks an open paragraph and ס a closed one. They divide the text into sections.", ro: "פ arată un paragraf deschis și ס unul închis. Împart textul în secțiuni." }, ex: null },
  { he: "יְהוָה", name: ["The Divine Name", "Numele lui Dumnezeu"], text: { en: "The four letters יהוה are written with the vowels of אֲדֹנָי (Adonai, “Lord”), as a sign to read Adonai aloud. This is why the KJV writes “LORD”. The app reads it as Adonai unless you change it in Settings, Audio.",
    ro: "Cele patru litere יהוה sunt scrise cu vocalele lui אֲדֹנָי (Adonai, „Domnul”), ca semn că se citește Adonai. De aceea Cornilescu scrie „Domnul”. Aplicația îl citește Adonai, afară de cazul când schimbi asta în Setări, Sunet." }, ex: null },
  { he: "קרי", name: ["Ketiv and {Qere}", "Ketiv și {Qere}"], text: { en: "In a few hundred places the scribes wrote a word one way (ketiv, “written”) but noted it should be read another way ({qere}, “read”). This text follows the {qere}, and the word panel shows a reading note when that happens.",
    ro: "În câteva sute de locuri cărturarii au scris un cuvânt într-un fel (ketiv, „scris”) dar au notat că trebuie citit altfel ({qere}, „citit”). Textul acesta urmează {qere}, iar panoul cuvântului arată o notă de citire când se întâmplă asta." }, ex: null },
];

// Simplified stroke paths for practising the printed (block) letters.
// Box 0..100: top of letters y=18, base line y=74, lamed rises to y=2, final letters go to y=96.
const STROKES = {
  "א": [[[24, 18], [76, 74]], [[70, 18], [68, 34], [56, 44]], [[40, 50], [32, 74]]],
  "ב": [[[24, 18], [68, 18], [72, 22], [72, 72]], [[82, 74], [22, 74]]],
  "ג": [[[42, 18], [57, 18], [60, 22], [60, 74]], [[60, 56], [40, 74]]],
  "ד": [[[20, 18], [80, 18]], [[68, 18], [68, 74]]],
  "ה": [[[22, 18], [74, 18], [76, 22], [76, 74]], [[32, 40], [32, 74]]],
  "ו": [[[44, 18], [55, 18], [57, 22], [57, 74]]],
  "ז": [[[36, 18], [70, 18]], [[54, 18], [52, 74]]],
  "ח": [[[24, 18], [74, 18], [76, 22], [76, 74]], [[28, 18], [28, 74]]],
  "ט": [[[30, 26], [26, 48], [28, 66], [38, 74], [62, 74], [72, 66], [74, 46], [72, 24], [62, 18], [54, 24], [54, 34]]],
  "י": [[[44, 18], [55, 18], [57, 22], [54, 42]]],
  "כ": [[[24, 18], [64, 18], [74, 24], [78, 46], [74, 68], [64, 74], [24, 74]]],
  "ך": [[[22, 18], [70, 18], [74, 22], [74, 96]]],
  "ל": [[[30, 2], [30, 32], [70, 32], [74, 38], [70, 56], [56, 74]]],
  "מ": [[[26, 18], [36, 30], [30, 74]], [[36, 26], [46, 18], [70, 18], [76, 26], [76, 74], [42, 74]]],
  "ם": [[[22, 18], [78, 18], [78, 74], [22, 74], [22, 18]]],
  "נ": [[[40, 18], [55, 18], [58, 24], [58, 74], [28, 74]]],
  "ן": [[[44, 18], [55, 18], [57, 22], [57, 96]]],
  "ס": [[[24, 18], [76, 18], [78, 24], [78, 56], [68, 72], [50, 76], [32, 72], [22, 56], [22, 24], [24, 18]]],
  "ע": [[[28, 18], [46, 56]], [[74, 18], [66, 56], [48, 72], [26, 74]]],
  "פ": [[[24, 18], [64, 18], [74, 24], [78, 46], [74, 68], [64, 74], [24, 74]], [[24, 18], [26, 36], [42, 36], [44, 28]]],
  "ף": [[[22, 18], [70, 18], [74, 24], [74, 96]], [[22, 18], [24, 38], [42, 38]]],
  "צ": [[[24, 18], [30, 36], [66, 62], [72, 74], [22, 74]], [[74, 18], [70, 34], [58, 44]]],
  "ץ": [[[26, 18], [40, 40], [44, 96]], [[74, 18], [70, 34], [46, 46]]],
  "ק": [[[22, 18], [72, 18], [76, 26], [74, 52], [62, 58]], [[30, 34], [30, 96]]],
  "ר": [[[22, 18], [64, 18], [74, 24], [76, 32], [76, 74]]],
  "ש": [[[24, 18], [28, 64], [36, 74], [66, 74], [74, 64], [76, 18]], [[52, 20], [44, 60]]],
  "ת": [[[22, 18], [70, 18], [74, 22], [74, 74]], [[32, 18], [32, 64], [28, 74], [20, 74]]],
};

const nameOf = (L0) => tr(L0.name[0], L0.name[1]);

// ------------------------------------------------------------------ view

export function mount(el) { root = el; }
export function show(params = {}) { if (params.sub) sub = params.sub; render(); }
export function hide() { stopKeyDrill(); }
export function unmount() { stopKeyDrill(); }

// Android back button: from a letter's page back to all letters, from a drill back to the list of drills.
export function back() {
  if (!body) return false;
  if (body.querySelector(".letter-detail")) { clear(body); letters(); return true; }
  if (sub === "drills" && !body.querySelector(".modes")) { clear(body); drills(); return true; }
  return false;
}

function render() {
  stopKeyDrill();
  clear(root);
  const page = h("div", { class: "page" });
  page.append(h("h1", null, tr("The alphabet", "Alfabetul")),
    h("p", { class: "lede" }, tr("22 letters, all consonants, read from right to left. The vowels are dots and lines around the letters. Five letters have a different shape at the end of a word.",
      "22 de litere, toate consoane, citite de la dreapta la stânga. Vocalele sunt puncte și linii în jurul literelor. Cinci litere au altă formă la sfârșitul cuvântului.")));
  const tabs = [["letters", tr("Letters", "Literele")], ["vowels", tr("Vowels", "Vocalele")], ["marks", tr("Other marks", "Alte semne")], ["builder", tr("Build syllables", "Formează silabe")],
    ["writing", tr("Writing", "Scrisul")], ["keyboard", tr("Keyboard", "Tastatura")], ["drills", tr("Drills", "Exerciții")]];
  const strip = h("div", { class: "subtabs" }, tabs.map(([id, label]) => h("button", { type: "button", class: sub === id ? "on" : "", onclick: () => { sub = id; render(); } }, label)));
  page.append(strip);
  body = h("div");
  page.append(body);
  root.append(page);
  // on a phone the strip scrolls sideways: keep the open section in view
  const on = strip.querySelector(".on");
  if (on && strip.scrollWidth > strip.clientWidth) {
    const sr = strip.getBoundingClientRect(), br = on.getBoundingClientRect();
    strip.scrollLeft += (br.left - sr.left) - (sr.width - br.width) / 2;
  }
  ({ letters, vowels, marks, builder, writing, keyboard, drills })[sub]();
}

function sayBtn(text, title) { return iconBtn("speaker", title || tr("Listen", "Ascultă"), (e) => { e.stopPropagation(); speak(text); }); }

function exampleLine(ex) {
  if (!ex) return null;
  return h("div", { class: "row", style: { gap: "8px" } }, sayBtn(ex[0]), he(ex[0]), h("span", { style: { color: "var(--lapis)" } }, tl(ex[1], ex[0])), h("span", { class: "muted" }, L(ex[2])), ex[3] ? refLink(ex[3]) : null);
}

function refLink(ref) {
  const [b, c, v] = ref;
  return h("a", { href: "#", class: "small", onclick: (e) => { e.preventDefault(); ctx.navigate("read", { b, c, v }); } }, ctx.refText(b, c, v));
}

// A letter in both scripts: the chosen one large, the other small.
function glyphPair(ch, final) {
  const txt = ch + (final ? " " + final : "");
  return h("span", { class: "glyph-pair" },
    h("span", { class: "glyph" + (cursive() ? " cursive" : ""), lang: "he" }, txt),
    h("span", { class: "glyph-alt" + (cursive() ? "" : " cursive"), lang: "he", title: cursive() ? tr("print", "tipar") : tr("cursive", "de mână") }, txt));
}

function letters() {
  const grid = h("div", { class: "letters" });
  for (const L0 of LETTERS) {
    grid.append(h("div", { class: "letter", tabindex: "0", role: "button", onclick: () => letterDetail(L0), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); letterDetail(L0); } } },
      glyphPair(L0.ch, L0.final),
      h("span", { class: "name" }, nameOf(L0)),
      h("span", { class: "snd" }, tl(L0.tr)),
      h("span", { class: "val" }, tr("Value ", "Valoare ") + L0.value)));
  }
  body.append(grid,
    h("p", { class: "muted small", style: { marginTop: "18px" } }, trt("The letters are in alphabet order from right to left. Each card shows the print form and, small, the handwritten (cursive) form. Click a letter for its sound, examples, look-alikes and writing practice. Every letter also stands for a number.",
      "Literele sunt în ordinea alfabetului, de la dreapta la stânga. Fiecare cartonaș arată forma de tipar și, mai mic, forma scrisă de mână. Apasă pe o literă pentru sunet, exemple, litere asemănătoare și exersarea scrisului. Fiecare literă înseamnă și un număr.")));
}

function letterDetail(L0) {
  clear(body);
  const idx = LETTERS.indexOf(L0);
  body.append(h("div", { class: "row", style: { marginBottom: "14px" } },
    h("button", { class: "btn", type: "button", onclick: () => { clear(body); letters(); } }, icon("left"), tr("All letters", "Toate literele")),
    h("div", { class: "spacer" }),
    idx > 0 ? h("button", { class: "btn", type: "button", onclick: () => letterDetail(LETTERS[idx - 1]) }, tr("Previous", "Litera anterioară")) : null,
    idx < LETTERS.length - 1 ? h("button", { class: "btn", type: "button", onclick: () => letterDetail(LETTERS[idx + 1]) }, tr("Next", "Litera următoare")) : null));
  const glyph = h("div", null,
    h("div", { class: "glyph", lang: "he" }, L0.ch),
    h("div", { class: "glyph glyph-cursive cursive", lang: "he", title: tr("handwritten", "scris de mână") }, L0.ch),
    h("div", { class: "small muted", style: { textAlign: "center" } }, tr("print and handwritten", "tipar și de mână")),
    L0.final ? h("div", { class: "muted", style: { textAlign: "center", marginTop: "8px" } }, tr("End of word: ", "La sfârșit de cuvânt: "),
      h("span", { class: "he", style: { fontSize: "40px" } }, L0.final), " ", h("span", { class: "he cursive", style: { fontSize: "40px" } }, L0.final)) : null);
  const like = L0.like ? h("div", null, h("h3", null, tr("Don't mix it up with", "Nu o confunda cu")),
    h("div", { class: "row" }, L0.like.map(c => {
      const t = LETTERS.find(x => x.ch === c || x.final === c);
      return h("button", { class: "btn", type: "button", onclick: () => { if (t) letterDetail(t); } }, he(c), " ", t ? nameOf(t) : "");
    }), h("span", { class: "muted small" }, lookalikeTip(L0.ch)))) : null;
  const info = h("div", null,
    h("h2", { style: { marginTop: 0 } }, nameOf(L0), "  ", he(L0.nameHe), "  ", sayBtn(L0.nameHe, tr("Say the letter name", "Spune numele literei"))),
    h("p", null, h("b", null, tr("Sound: ", "Sunetul: ")), L(L0.sound)),
    h("p", null, h("b", null, tr("Sounds like (English): ", "Pentru un vorbitor de română: ")), L(L0.cmp)),
    h("p", null, h("b", null, tr("Transliteration: ", "Transliterare: ")), tl(L0.tr), "    ", h("b", null, tr("Number value: ", "Valoare numerică: ")), String(L0.value)),
    h("h3", null, tr("Examples from the Bible", "Exemple din Biblie")), exampleLine(L0.ex), exampleLine(L0.ex2),
    like,
    h("div", { class: "row", style: { marginTop: "18px" } },
      h("button", { class: "btn primary", type: "button", onclick: () => { sub = "writing"; wLetter = L0.ch; render(); } }, icon("pen"), tr("Practice writing it", "Exersează scrierea")),
      L0.final ? h("button", { class: "btn", type: "button", onclick: () => { sub = "writing"; wLetter = L0.final; render(); } }, icon("pen"), tr("Practice the end form", "Exersează forma de la sfârșit")) : null));
  body.append(h("div", { class: "letter-detail" }, glyph, info));
}

function lookalikeTip(ch) {
  const tips = {
    "ב": ["ב has a small corner and a base that sticks out at the bottom right; כ is rounded.", "ב are un colț mic și o bază care iese în dreapta jos; כ e rotunjit."],
    "כ": ["כ is rounded; ב has a base line that sticks out.", "כ e rotunjit; ב are o linie de bază care iese."],
    "ג": ["ג has a little foot to the left; נ has a flat base.", "ג are un picioruș spre stânga; נ are baza dreaptă."],
    "נ": ["נ has a flat base; ג has a little foot.", "נ are baza dreaptă; ג are un picioruș."],
    "ד": ["ד has a sharp corner that sticks out; ר is rounded.", "ד are un colț ascuțit care iese; ר e rotunjit."],
    "ר": ["ר is rounded; ד has a sharp corner.", "ר e rotunjit; ד are un colț ascuțit."],
    "ה": ["ה has a gap at the top left; ח is closed; ת has a foot on its left leg.", "ה are o deschidere sus în stânga; ח e închis; ת are un picioruș la piciorul din stânga."],
    "ח": ["ח is closed at the top; ה has a gap.", "ח e închis sus; ה are o deschidere."],
    "ת": ["ת has a little foot on the left leg.", "ת are un picioruș la piciorul din stânga."],
    "ו": ["ו is a plain line; ז has a head on both sides; ן goes below the line.", "ו e o linie simplă; ז are cap în ambele părți; ן coboară sub rând."],
    "ז": ["ז has a head on both sides; ו only has a small head.", "ז are cap în ambele părți; ו are doar un cap mic."],
    "מ": ["מ is open at the bottom left; its end form ם is a closed square; ט is open at the top.", "מ are o deschidere jos în stânga; forma de la sfârșit ם e un pătrat închis; ט e deschis sus."],
    "ם": ["ם (end form) is a closed square; ס is round at the bottom.", "ם (forma de la sfârșit) e un pătrat închis; ס e rotund jos."],
    "ט": ["ט is open at the top and its right arm curls in; מ is open at the bottom left.", "ט e deschis sus și brațul drept se întoarce înăuntru; מ are o deschidere jos în stânga."],
    "ך": ["ך (end form) goes straight down below the line; ד and ר stay on the line.", "ך (forma de la sfârșit) coboară drept sub rând; ד și ר rămân pe rând."],
    "ן": ["ן (end form) is a long line that goes below the line; ו stops on the line; ז has a head on both sides.", "ן (forma de la sfârșit) e o linie lungă care coboară sub rând; ו se oprește pe rând; ז are cap în ambele părți."],
    "ס": ["ס is round; ם is square.", "ס e rotund; ם e pătrat."],
    "ע": ["ע has two arms meeting low; צ has a flat base.", "ע are două brațe care se întâlnesc jos; צ are baza dreaptă."],
    "צ": ["צ has a flat base; ע doesn't.", "צ are baza dreaptă; ע nu are."],
  };
  return tips[ch] ? tr(tips[ch][0], tips[ch][1]) : "";
}

function vowels() {
  const base = "בּ";
  const t = h("table", { class: "vowel-table" },
    h("thead", null, h("tr", null, h("th", null, tr("Sign", "Semnul")), h("th", null, tr("Name", "Nume")), h("th", null, tr("Sound", "Sunet")), h("th", null, tr("Sounds like", "Sună ca")), h("th", null, tr("Type", "Fel")), h("th", null, tr("Example", "Exemplu")))));
  const tb = h("tbody");
  for (const V of VOWELS) {
    const shown = base + V.sign;
    tb.append(h("tr", null,
      h("td", { class: "sign", lang: "he" }, shown),
      h("td", null, h("b", null, tr(V.name[0], V.name[1])), h("div", { class: "he small muted", style: { fontSize: "16px" } }, V.nameHe)),
      h("td", null, V.sound, " ", sayBtn(shown)),
      h("td", { class: "small" }, L(V.cmp)),
      h("td", { class: "small muted" }, tr(...KIND[V.kind])),
      h("td", null, h("div", { class: "row", style: { justifyContent: "flex-end", gap: "6px" } }, h("span", { class: "small muted" }, tl(V.ex[1], V.ex[0]) + ", " + L(V.ex[2])), sayBtn(V.ex[0]), h("span", { class: "ex he", lang: "he", style: { fontSize: "24px" } }, V.ex[0])))));
  }
  t.append(tb);
  body.append(
    p(tr("The vowel is read after the letter it sits under: בָּ is “ba”, בִּי is “bi”. The letter בּ is used here only to carry the vowel; in charts you may also see a dotted circle in its place.",
      "Vocala se citește după litera sub care stă: בָּ este „ba”, בִּי este „bi”. Litera בּ e folosită aici doar ca să poarte vocala; în tabele poți vedea și un cerculeț punctat în locul ei.")),
    h("div", { class: "table-wrap" }, t),
    h("div", { class: "tip", style: { borderLeft: "3px solid var(--gold)", padding: "8px 14px", marginTop: "16px", background: "var(--surface)" } },
      tr("Long, short and reduced are the traditional grammar groups. In today's pronunciation long and short vowels sound almost the same, so focus on the letter sound first. The reduced vowels are said quickly. Handwriting usually leaves the vowels out.",
        "Lungi, scurte și reduse sunt grupele obișnuite din gramatică. În pronunția de azi vocalele lungi și scurte sună aproape la fel, așa că învață întâi sunetul literei. Vocalele reduse se spun repede. Scrisul de mână lasă de obicei vocalele deoparte.")));
}

function p(...x) { return h("p", null, ...x); }

function marks() {
  const list = h("div", { class: "marks-list" });
  for (const M of MARKS) {
    list.append(h("div", { class: "mark-item" }, h("div", { class: "he", lang: "he" }, M.he),
      h("div", null, h("h3", { style: { marginTop: "4px" } }, tr(M.name[0], M.name[1])), h("p", null, L(M.text)), exampleLine(M.ex))));
  }
  body.append(list);
}

// ------------------------------------------------------------------ syllable builder

const CONS_SOUND = { "א": "", "בּ": "b", "ב": "v", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "ch", "ט": "t", "י": "y", "כּ": "k", "כ": "kh", "ל": "l", "מ": "m", "נ": "n", "ס": "s", "ע": "", "פּ": "p", "פ": "f", "צ": "tz", "ק": "k", "ר": "r", "שׁ": "sh", "שׂ": "s", "ת": "t" };
const VOW_SOUND = { "ַ": "a", "ָ": "a", "ֲ": "a", "ֵ": "e", "ֶ": "e", "ֱ": "e", "ִ": "i", "ִי": "i", "ֹ": "o", "וֹ": "o", "ֳ": "o", "ֻ": "u", "וּ": "u", "ְ": "e" };
let bCons = "בּ", bVow = "ָ", bEnd = "";

function builder() {
  const consPick = h("div", { class: "pick" });
  for (const c of Object.keys(CONS_SOUND)) {
    consPick.append(h("button", { type: "button", class: c === bCons ? "on" : "", lang: "he", onclick: () => { bCons = c; clear(body); builder(); } }, c));
  }
  const vowPick = h("div", { class: "pick" });
  for (const v of Object.keys(VOW_SOUND)) {
    vowPick.append(h("button", { type: "button", class: v === bVow ? "on" : "", lang: "he", onclick: () => { bVow = v; clear(body); builder(); } }, "ב" + v));
  }
  const endPick = h("div", { class: "pick" });
  for (const e of ["", "ם", "ן", "ר", "ל", "ת", "ךְ", "שׁ"]) {
    endPick.append(h("button", { type: "button", class: e === bEnd ? "on" : "", lang: "he", onclick: () => { bEnd = e; clear(body); builder(); } }, e || "–"));
  }
  const syl = bCons + bVow + bEnd;
  const endSound = { "": "", "ם": "m", "ן": "n", "ר": "r", "ל": "l", "ת": "t", "ךְ": "kh", "שׁ": "sh" }[bEnd];
  const sound = tl((CONS_SOUND[bCons] || "") + (VOW_SOUND[bVow] || "") + endSound);
  body.append(h("div", { class: "builder" },
    h("div", null,
      h("h3", { style: { marginTop: 0 } }, tr("1. Pick a consonant", "1. Alege o consoană")), consPick,
      h("h3", null, tr("2. Pick a vowel", "2. Alege o vocală")), vowPick,
      h("h3", null, tr("3. Close the syllable (optional)", "3. Închide silaba (dacă vrei)")), endPick),
    h("div", { class: "builder-out" },
      h("span", { class: "he", lang: "he" }, syl),
      cursive() ? h("span", { class: "he cursive", lang: "he", style: { fontSize: "60px" } }, stripPoints(syl)) : null,
      h("div", { style: { fontSize: "26px", color: "var(--lapis)" } }, sound || tr("(vowel only)", "(doar vocala)")),
      h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } },
        h("button", { class: "btn", type: "button", onclick: () => speak(syl) }, icon("speaker"), tr("Listen", "Ascultă")),
        h("button", { class: "btn", type: "button", onclick: () => { bCons = deckFor("builder-cons", Object.keys(CONS_SOUND)).next(); bVow = deckFor("builder-vowel", Object.keys(VOW_SOUND)).next(); bEnd = ""; clear(body); builder(); } }, icon("shuffle"), tr("Random", "La întâmplare"))),
      h("p", { class: "small muted", style: { marginTop: "12px" } }, tr("Single syllables can sound a little odd from the voice engine. Whole words are more natural.", "Silabele singure pot suna puțin ciudat la vocea sintetică. Cuvintele întregi sună mai firesc.")))));
}

// ------------------------------------------------------------------ writing practice

let wLetter = "א";
let wGuide = true;

function writingSelect(ch) { wLetter = ch; clear(body); writing(); }

function writing() {
  const cur = cursive();
  const strip = h("div", { class: "letter-strip" });
  const all = [];
  for (const L0 of LETTERS) { all.push(L0.ch); if (L0.final) all.push(L0.final); }
  for (const c of all) strip.append(h("button", { type: "button", class: (c === wLetter ? "on" : "") + (cur ? " cursive" : ""), lang: "he", onclick: () => writingSelect(c) }, c));
  const wrap = h("div", { class: "canvas-wrap" });
  const guide = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  guide.setAttribute("viewBox", "0 0 100 100");
  const canvas = h("canvas", { width: 680, height: 680, "aria-label": tr("Drawing area", "Zona de desen") });
  wrap.append(guide, canvas);
  drawGuide(guide, wLetter, wGuide, false);
  setupDrawing(canvas);
  const info = LETTERS.find(L0 => L0.ch === wLetter || L0.final === wLetter);
  const isFinal = FINAL_INFO[wLetter];
  body.append(h("div", { class: "writing" },
    wrap,
    h("div", null,
      h("h2", { style: { marginTop: 0 } }, info ? nameOf(info) : "", isFinal ? tr(" (end of word)", " (la sfârșit de cuvânt)") : "", "  ", he(wLetter, "", { print: true }), " ", h("span", { class: "he cursive", lang: "he" }, wLetter)),
      h("p", { class: "muted" }, cur
        ? tr("Trace the handwritten (cursive) letter with your mouse, pen or finger. This is how Hebrew is written by hand today. The numbered stroke guide is only for print letters; switch to print at the top right to see it.",
          "Desenează litera scrisă de mână urmărind modelul, cu mouse-ul, creionul sau degetul. Așa se scrie ebraica de mână azi. Ghidul cu trăsături numerotate e doar pentru literele de tipar; treci pe tipar din dreapta sus ca să-l vezi.")
        : tr("Trace the letter with your mouse, pen or finger. The numbers show a common order for the strokes; it is a guide, not a rule. Printed letters sit under the top line and hang from it.",
          "Desenează litera urmărind modelul, cu mouse-ul, creionul sau degetul. Numerele arată o ordine obișnuită a trăsăturilor; e un ghid, nu o regulă. Literele de tipar stau sub linia de sus și atârnă de ea.")),
      h("div", { class: "row" },
        cur ? null : h("button", { class: "btn primary", type: "button", onclick: () => drawGuide(guide, wLetter, wGuide, true) }, icon("play"), tr("Show the strokes", "Arată trăsăturile")),
        h("button", { class: "btn", type: "button", onclick: () => { const c = canvas.getContext("2d"); c.clearRect(0, 0, canvas.width, canvas.height); } }, tr("Clear", "Șterge")),
        h("button", { class: "btn" + (wGuide ? " on" : ""), type: "button", onclick: () => { wGuide = !wGuide; clear(body); writing(); } }, wGuide ? tr("Hide guide", "Ascunde modelul") : tr("Show guide", "Arată modelul")),
        info ? sayBtn(info.nameHe, tr("Say the letter name", "Spune numele literei")) : null),
      h("h3", null, tr("Pick a letter", "Alege o literă")), strip)));
}

function drawGuide(svg, ch, showGlyph, animate) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const NS = "http://www.w3.org/2000/svg";
  const cur = cursive();
  const line = (y, dash) => { const l = document.createElementNS(NS, "line"); l.setAttribute("x1", "4"); l.setAttribute("x2", "96"); l.setAttribute("y1", y); l.setAttribute("y2", y); l.setAttribute("stroke", "var(--rule)"); l.setAttribute("stroke-width", "0.6"); if (dash) l.setAttribute("stroke-dasharray", "2 2"); svg.appendChild(l); };
  line(18); line(74); line(46, true);
  if (showGlyph) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", "51"); t.setAttribute("y", cur ? "70" : "74"); t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", cur ? "80" : "90"); t.setAttribute("fill", "var(--ink)"); t.setAttribute("opacity", cur ? "0.14" : "0.09");
    t.style.fontFamily = cur ? '"Ktav Yad", serif' : getComputedStyle(document.documentElement).getPropertyValue("--he-font");
    t.textContent = ch;
    svg.appendChild(t);
  }
  if (cur) return; // stroke order guides are drawn for print letters only
  const strokes = STROKES[ch] || [];
  strokes.forEach((pts, i) => {
    const pl = document.createElementNS(NS, "polyline");
    pl.setAttribute("points", pts.map(q => q.join(",")).join(" "));
    pl.setAttribute("fill", "none"); pl.setAttribute("stroke", "var(--lapis)"); pl.setAttribute("stroke-width", animate ? "3.2" : "1.4");
    pl.setAttribute("stroke-linecap", "round"); pl.setAttribute("stroke-linejoin", "round");
    pl.setAttribute("opacity", animate ? "0.85" : "0.35");
    svg.appendChild(pl);
    const len = pts.reduce((a, q, j) => j ? a + Math.hypot(q[0] - pts[j - 1][0], q[1] - pts[j - 1][1]) : 0, 0);
    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pl.style.strokeDasharray = String(len);
      pl.style.strokeDashoffset = String(len);
      pl.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 700, delay: i * 800, fill: "forwards", easing: "ease-in-out" });
    }
    const n = document.createElementNS(NS, "text");
    n.setAttribute("x", String(pts[0][0] + (pts[0][0] > 50 ? 3 : -5)));
    n.setAttribute("y", String(pts[0][1] - 2));
    n.setAttribute("font-size", "6"); n.setAttribute("fill", "var(--lapis)"); n.setAttribute("font-family", "var(--lat-font)");
    n.textContent = String(i + 1);
    svg.appendChild(n);
    const d = document.createElementNS(NS, "circle");
    d.setAttribute("cx", pts[0][0]); d.setAttribute("cy", pts[0][1]); d.setAttribute("r", "1.6"); d.setAttribute("fill", "var(--lapis)");
    svg.appendChild(d);
  });
}

function setupDrawing(canvas) {
  const c = canvas.getContext("2d");
  let drawing = false, last = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  canvas.addEventListener("pointerdown", (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const pt = pos(e);
    c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#222";
    c.lineWidth = cursive() ? 12 : 16; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(pt[0], pt[1]); c.stroke();
    last = pt;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

// ------------------------------------------------------------------ keyboard

let keyDrill = null; // { onKey }

function stopKeyDrill() {
  if (keyDrill) { document.removeEventListener("keydown", keyDrill.onKey); keyDrill = null; }
}

function keyboard() {
  const latinOf = {};
  for (const [lat, heb] of Object.entries(KEYBOARD)) latinOf[heb] = lat;
  body.append(p(tr("Hebrew computers use the Israeli keyboard layout. If you add it to your computer (Windows: Settings, Language, add Hebrew; Linux: add the “Hebrew” input source), you type Hebrew directly. Without it, Mikra turns your normal keys into Hebrew letters in its own typing boxes, using the same layout. The small letter on each key is the key you press.",
    "Calculatoarele din Israel folosesc tastatura israeliană. Dacă o adaugi pe calculator (Windows: Setări, Limbă, adaugă ebraica; Linux: adaugă sursa de intrare „Hebrew”), scrii direct în ebraică. Fără ea, Mikra transformă tastele tale obișnuite în litere ebraice în căsuțele ei de scris, după același aranjament. Litera mică de pe fiecare tastă e tasta pe care o apeși.")));
  const kb = h("div", { class: "kb-layout" });
  const keyEls = {};
  for (const row of KEYBOARD_ROWS) {
    kb.append(h("div", { class: "kb-row" }, row.map(lat => {
      const heb = KEYBOARD[lat];
      // blur after a click, so a later Space or Enter doesn't press this key again (and count a wrong answer)
      const el = h("button", { type: "button", class: "kb-key", onclick: (e) => { press(heb); e.currentTarget.blur(); } },
        h("span", { class: "kb-he" + heClass(), lang: "he" }, heb), h("span", { class: "kb-lat" }, lat.toUpperCase()));
      keyEls[heb] = el;
      return el;
    })));
  }
  body.append(kb, p(h("span", { class: "small muted" }, tr("The end forms ך ם ן ף ץ have their own keys. Q and W type a slash and an apostrophe on a real Israeli keyboard.",
    "Formele de la sfârșit ך ם ן ף ץ au tastele lor. Q și W dau o bară oblică și un apostrof pe o tastatură israeliană adevărată."))));

  // typing drill
  const box = h("div", { class: "card kb-drill" });
  const target = h("div", { class: "big-he" + heClass(), lang: "he" });
  const stats = h("div", { class: "muted small" });
  const feedback = h("div", { class: "small", style: { minHeight: "20px" } });
  let mode = "letters", word = "", pos = 0, right = 0, total = 0, started = 0, typed = 0;
  let words = null;
  const modeSeg = h("div", { class: "seg" },
    h("button", { type: "button", class: "on", onclick: (e) => setMode("letters", e.currentTarget) }, tr("Letters", "Litere")),
    h("button", { type: "button", onclick: (e) => setMode("words", e.currentTarget) }, tr("Words", "Cuvinte")));
  box.append(h("div", { class: "row", style: { justifyContent: "space-between", width: "100%" } }, h("b", null, tr("Typing practice", "Exercițiu de tastare")), modeSeg),
    h("div", { class: "prompt" }, tr("Press the key for each letter", "Apasă tasta pentru fiecare literă")), target, feedback, stats);
  body.append(box);

  async function setMode(m, btn) {
    mode = m;
    for (const b of modeSeg.children) b.classList.toggle("on", b === btn);
    if (m === "words" && !words) {
      try {
        const res = await api.get("freqlist", { limit: 300 });
        words = res.items.map(x => stripPoints(x.hebrew).replace(/[־\s]/g, "")).filter(w => w.length >= 2 && w.length <= 6);
      } catch (e) { words = ["שלום", "ברא", "אלהים", "ארץ", "מלך", "דבר", "יום", "אור"]; }
    }
    next();
  }
  function next() {
    word = mode === "letters" ? deckFor("keys", Object.values(KEYBOARD)).next() : deckFor("key-words", words).next();
    pos = 0;
    draw();
  }
  function draw() {
    clear(target);
    [...word].forEach((ch, i) => target.append(h("span", { class: i < pos ? "kb-done" : i === pos ? "kb-now" : "" }, ch)));
    for (const el of Object.values(keyEls)) el.classList.remove("hint", "flash");
    const mins = started ? (Date.now() - started) / 60000 : 0;
    stats.textContent = tr(`${right} of ${total} right` + (mins > 0.1 ? `, ${Math.round(typed / mins)} letters a minute` : ""),
      `${right} din ${total} corecte` + (mins > 0.1 ? `, ${Math.round(typed / mins)} litere pe minut` : ""));
  }
  function press(heb) {
    if (pos >= word.length) return; // the word is done; the next one appears in a moment
    if (!started) started = Date.now();
    const want = word[pos];
    total++;
    if (heb === want) {
      right++; typed++; pos++;
      feedback.textContent = "";
      if (keyEls[heb]) keyEls[heb].classList.add("flash");
      if (pos >= word.length) { setTimeout(next, 250); draw(); return; }
      draw();
    } else {
      feedback.textContent = tr(`That was ${heb}. The right key is lit up.`, `Asta a fost ${heb}. Tasta corectă e luminată.`);
      draw();
      if (keyEls[want]) keyEls[want].classList.add("hint");
    }
    if (total >= 20 && right / total >= 0.8 && !store.data.path.keyboard) { store.data.path.keyboard = Date.now(); store.changed("path"); }
  }
  stopKeyDrill();
  keyDrill = { onKey: (e) => {
    const view = document.getElementById("view-alphabet");
    if (!view || view.hidden || sub !== "keyboard" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const ch = /^[א-ת]$/.test(e.key) ? e.key : KEYBOARD[e.key.toLowerCase()];
    if (!ch) return; // arrows, Space, Page Down and the rest keep working, also when held
    e.preventDefault();
    if (e.repeat) return; // a held letter key is one press, not a row of wrong answers
    press(ch);
  } };
  document.addEventListener("keydown", keyDrill.onKey);
  next();
}

// ------------------------------------------------------------------ drills

let drillScore = { right: 0, total: 0, kind: "" };

function drills() {
  const kinds = [
    ["names", tr("Letter names", "Numele literelor"), tr("Match each letter with its name.", "Potrivești fiecare literă cu numele ei.")],
    ["sounds", tr("Letter sounds", "Sunetele literelor"), tr("Match each letter with the sound it makes.", "Potrivești fiecare literă cu sunetul pe care îl face.")],
    ["lookalikes", tr("Look-alikes", "Litere asemănătoare"), tr("Tell apart letters that are easy to confuse.", "Deosebești literele care se încurcă ușor.")],
    ["vowels", tr("Vowel reading", "Citirea vocalelor"), tr("Read a syllable with a vowel, or find the syllable for a sound.", "Citești o silabă cu o vocală sau găsești silaba pentru un sunet.")],
    ["finals", tr("End forms", "Formele de la sfârșit"), tr("Match each end-of-word letter with its normal form.", "Potrivești fiecare literă de la sfârșit cu forma ei obișnuită.")],
    ["scripts", tr("Print and cursive", "Tipar și de mână"), tr("See a handwritten letter, pick the print one, or the other way round.", "Vezi o literă scrisă de mână și alegi pe cea de tipar, sau invers.")],
    ["words", tr("Read real words", "Citește cuvinte adevărate"), tr("Read a common Bible word out loud, or recall it from its meaning, then check yourself.", "Citește cu voce tare un cuvânt des întâlnit în Biblie sau ți-l amintești după înțeles, apoi verifică-te.")],
  ];
  body.append(h("div", { class: "modes" }, kinds.map(([id, t, d]) => h("button", { class: "mode", type: "button", onclick: () => { drillScore = { right: 0, total: 0, kind: id }; runDrill(id); } }, h("b", null, t), h("span", null, d)))));
  body.append(h("p", { class: "small muted", style: { marginTop: "14px" } }, tr("In each drill, “Show” at the top picks what the questions show: the Hebrew, the other side (name, sound, meaning), or both taking turns.",
    "În fiecare exercițiu, „Arată” de sus alege ce arată întrebările: ebraica, cealaltă parte (numele, sunetul, înțelesul) sau amândouă pe rând.")));
  body.append(h("p", { class: "small muted", style: { marginTop: "6px" } }, tr("20 answers with at least 80% right in the letter drills, or in the vowel drill, tick off the first steps on the Today tab.",
    "20 de răspunsuri cu cel puțin 80% corecte la exercițiile cu litere, sau la cel cu vocale, bifează primii pași din fila Azi.")));
}

// What a drill's questions show (Settings: drillSides): "he" the Hebrew side, "mean" the other side, "both" in turns.
const SIDE_LABELS = {
  names: [["The letter", "Litera"], ["The name", "Numele"]],
  sounds: [["The letter", "Litera"], ["The sound", "Sunetul"]],
  lookalikes: [["The letter", "Litera"], ["The name", "Numele"]],
  vowels: [["The syllable", "Silaba"], ["The sound", "Sunetul"]],
  finals: [["The end form", "Forma de la sfârșit"], ["The normal form", "Forma obișnuită"]],
  scripts: [["Handwritten", "Scris de mână"], ["Print", "Tipar"]],
  words: [["The Hebrew", "Ebraica"], ["The meaning", "Înțelesul"]],
};
function sideOf(kind) {
  const v = (store.settings.drillSides || {})[kind] || "he";
  return v === "both" ? (drillScore.total % 2 === 0 ? "he" : "mean") : v;
}

function drillFrame(title, kind) {
  clear(body);
  const box = h("div", { class: "card", style: { maxWidth: "640px", margin: "0 auto" } });
  body.append(h("div", { class: "study-top", style: { maxWidth: "640px", margin: "0 auto 14px" } },
    h("button", { class: "btn ghost small", type: "button", onclick: () => { clear(body); drills(); } }, icon("left"), tr("Drills", "Exerciții")),
    h("span", null, title), h("span", { class: "spacer" }), h("span", null, `${drillScore.right} / ${drillScore.total}`)));
  const labels = SIDE_LABELS[kind];
  if (labels) {
    const cur = (store.settings.drillSides || {})[kind] || "he";
    body.append(h("div", { class: "row drill-side", style: { maxWidth: "640px", margin: "0 auto 12px", justifyContent: "center" } },
      h("span", { class: "muted small" }, tr("Show", "Arată")),
      choiceSeg([["he", tr(...labels[0])], ["mean", tr(...labels[1])], ["both", tr("Both, taking turns", "Pe rând")]], cur, (v) => {
        store.setting("drillSides", { ...store.settings.drillSides, [kind]: v });
        runDrill(kind); // a new question the new way round (the one on screen was not answered)
      }, tr("Show", "Arată"))));
  }
  body.append(box);
  return box;
}

function recordDrill() {
  if (drillScore.total < 20 || drillScore.right / drillScore.total < 0.8) return;
  const key = drillScore.kind === "vowels" ? "vowels" : ["names", "sounds", "lookalikes", "finals", "scripts"].includes(drillScore.kind) ? "letters" : null;
  if (key && !store.data.path[key]) {
    store.data.path[key] = Date.now();
    store.changed("path");
    toast(key === "letters" ? tr("Letters step done on the Today tab.", "Pasul cu literele e bifat în fila Azi.") : tr("Vowels step done on the Today tab.", "Pasul cu vocalele e bifat în fila Azi."));
  }
}

// missed: called after a wrong answer, so the item can come back a few questions later.
function choiceDrill(box, options, correct, label, onNext, isHebrew, display, missed) {
  const grid = h("div", { class: "choices" });
  let answered = false;
  const btns = options.map(o => h("button", { class: "choice" + (isHebrew ? " he" : ""), type: "button", lang: isHebrew ? "he" : null, onclick: () => {
    if (answered) return;
    answered = true;
    drillScore.total++;
    const ok = o === correct;
    if (ok) drillScore.right++;
    for (const b of btns) b.classList.add("locked");
    btns[options.indexOf(correct)].classList.add("right");
    if (!ok) { btns[options.indexOf(o)].classList.add("wrong"); if (missed) missed(); }
    if (label) box.append(h("div", { class: "muted", style: { marginTop: "10px" } }, label));
    box.append(h("button", { class: "btn primary", type: "button", style: { marginTop: "12px" }, onclick: onNext }, tr("Next", "Următorul")));
    recordDrill();
  } }, display ? display(o) : o));
  grid.append(...btns);
  box.append(grid);
}

function runDrill(kind) {
  const next = () => runDrill(kind);
  const side = sideOf(kind);
  const bigHe = (text, extra = "") => h("div", { class: "big-he" + heClass() + extra, lang: "he" }, text);
  const bigText = (text) => h("div", { style: { fontSize: "30px", margin: "14px 0", color: "var(--lapis)" } }, text);
  if (kind === "names") {
    const box = drillFrame(tr("Letter names", "Numele literelor"), kind);
    const bag = deckFor("drill-names", LETTERS, x => x.ch);
    const L0 = bag.next();
    const four = shuffle([L0, ...shuffle(LETTERS.filter(x => x !== L0)).slice(0, 3)]);
    const missed = () => bag.again(L0);
    if (side === "he") {
      box.append(h("div", { class: "prompt" }, tr("What is this letter called?", "Cum se numește litera aceasta?")), bigHe(L0.ch));
      choiceDrill(box, four.map(x => nameOf(x)), nameOf(L0), `${nameOf(L0)}: ${L(L0.sound)}`, next, false, null, missed);
    } else {
      box.append(h("div", { class: "prompt" }, tr("Which letter is", "Care literă este")), bigText(nameOf(L0)));
      choiceDrill(box, four.map(x => x.ch), L0.ch, `${nameOf(L0)}: ${L(L0.sound)}`, next, true, heText, missed);
    }
  } else if (kind === "sounds") {
    const box = drillFrame(tr("Letter sounds", "Sunetele literelor"), kind);
    const pool = LETTERS.filter(x => !["א", "ע"].includes(x.ch));
    const bag = deckFor("drill-sounds", pool, x => x.ch);
    const L0 = bag.next();
    // compare the sounds as shown (in Romanian ח and ה are both "h"; in English "ch" ח and "kh" כ are the same sound):
    // no two options may share a sound, so only one answer can be right
    const sounds = (x) => tl(x.tr).split(/\s*\/\s*/).map(snd => snd === "kh" ? "ch" : snd);
    const taken = new Set(sounds(L0));
    const others = [];
    for (const x of shuffle(pool)) {
      if (others.length >= 3) break;
      if (x === L0 || sounds(x).some(snd => taken.has(snd))) continue;
      others.push(x);
      sounds(x).forEach(snd => taken.add(snd));
    }
    const four = shuffle([L0, ...others]);
    const missed = () => bag.again(L0);
    if (side === "he") {
      box.append(h("div", { class: "prompt" }, tr("What sound does this letter make?", "Ce sunet face litera aceasta?")), bigHe(L0.ch));
      choiceDrill(box, four.map(x => tl(x.tr)), tl(L0.tr), `${nameOf(L0)}. ${L(L0.cmp)}`, next, false, null, missed);
    } else {
      box.append(h("div", { class: "prompt" }, tr("Which letter makes this sound?", "Ce literă face sunetul acesta?")), h("div", { style: { fontSize: "40px", margin: "16px 0", color: "var(--lapis)" } }, tl(L0.tr)));
      choiceDrill(box, four.map(x => x.ch), L0.ch, `${nameOf(L0)}. ${L(L0.cmp)}`, next, true, heText, missed);
    }
  } else if (kind === "lookalikes") {
    const groups = [["ב", "כ"], ["ד", "ר", "ך"], ["ה", "ח", "ת"], ["ו", "ז", "ן"], ["ס", "ם"], ["ג", "נ"], ["ע", "צ"], ["ט", "מ"]];
    // every letter of every group gets its turn as the one asked for
    const bag = deckFor("drill-lookalikes", groups.flatMap(gr => gr.map(t => [gr, t])), x => x[1]);
    const [g, target] = bag.next();
    const nameOfCh = (c) => { const L0 = LETTERS.find(x => x.ch === c); if (L0) return nameOf(L0); const F = LETTERS.find(x => x.final === c); return F ? nameOf(F) + tr(" (end)", " (sfârșit)") : c; };
    const box = drillFrame(tr("Look-alikes", "Litere asemănătoare"), kind);
    const tip = lookalikeTip(target) || lookalikeTip(FINAL_INFO[target] || target);
    const missed = () => bag.again([g, target]);
    if (side === "he") {
      box.append(h("div", { class: "prompt" }, tr("Which letter is this?", "Ce literă este aceasta?")), bigHe(target));
      choiceDrill(box, shuffle(g).map(nameOfCh), nameOfCh(target), tip, next, false, null, missed);
    } else {
      box.append(h("div", { class: "prompt" }, tr("Which one is", "Care este")), h("div", { style: { fontSize: "30px", margin: "12px 0" } }, nameOfCh(target)));
      choiceDrill(box, shuffle(g), target, tip, next, true, null, missed);
    }
  } else if (kind === "vowels") {
    const box = drillFrame(tr("Vowel reading", "Citirea vocalelor"), kind);
    const consKeys = ["בּ", "ד", "ל", "מ", "נ", "שׁ", "ק", "ר", "ת", "ג"];
    const vKeys = Object.keys(VOW_SOUND).filter(v => v !== "ְ");
    const vBag = deckFor("drill-vowels", vKeys);
    const c = deckFor("drill-vowel-cons", consKeys).next();
    const v = vBag.next();
    const right = tl(CONS_SOUND[c] + VOW_SOUND[v]);
    const vow = VOWELS.find(x => x.sign === v);
    const label = vow ? `${tr(vow.name[0], vow.name[1])}: ${vow.sound}` : "";
    const missed = () => vBag.again(v);
    if (side === "he") {
      const opts = shuffle(["a", "e", "i", "o", "u"].map(x => tl(CONS_SOUND[c] + x)));
      box.append(h("div", { class: "prompt" }, tr("How do you read it?", "Cum se citește?")), h("div", { class: "big-he", lang: "he" }, c + v), sayBtn(c + v));
      choiceDrill(box, opts, right, label, next, false, null, missed);
    } else {
      // one syllable for each vowel sound: the asked one with its own sign, the others with any sign of that sound
      const opts = shuffle(["a", "e", "i", "o", "u"].map(snd => snd === VOW_SOUND[v] ? c + v
        : c + shuffle(vKeys.filter(k => VOW_SOUND[k] === snd))[0]));
      box.append(h("div", { class: "prompt" }, tr("Which one is read", "Care se citește")), bigText(right));
      choiceDrill(box, opts, c + v, label, next, true, (o) => h("span", { class: "he", lang: "he", style: { fontSize: "34px" } }, o), missed);
    }
  } else if (kind === "finals") {
    const box = drillFrame(tr("End forms", "Formele de la sfârșit"), kind);
    const bag = deckFor("drill-finals", Object.keys(FINAL_INFO));
    const f = bag.next();
    const base = FINAL_INFO[f];
    const missed = () => bag.again(f);
    if (side === "he") {
      box.append(h("div", { class: "prompt" }, tr("This is the end-of-word form of which letter?", "A cărei litere este forma aceasta de la sfârșit de cuvânt?")), bigHe(f));
      const opts = shuffle([base, ...shuffle(["כ", "מ", "נ", "פ", "צ", "ר", "ו", "ס"].filter(x => x !== base)).slice(0, 3)]);
      choiceDrill(box, opts, base, "", next, true, heText, missed);
    } else {
      box.append(h("div", { class: "prompt" }, tr("How is this letter written at the end of a word?", "Cum se scrie litera aceasta la sfârșitul cuvântului?")), bigHe(base));
      const opts = shuffle([f, ...shuffle(Object.keys(FINAL_INFO).filter(x => x !== f)).slice(0, 3)]);
      choiceDrill(box, opts, f, "", next, true, heText, missed);
    }
  } else if (kind === "scripts") {
    const box = drillFrame(tr("Print and cursive", "Tipar și de mână"), kind);
    const all = LETTERS.map(x => x.ch);
    const bag = deckFor("drill-scripts", all);
    const ch = bag.next();
    const fromCursive = side === "he";
    box.append(h("div", { class: "prompt" }, fromCursive ? tr("Which print letter is this handwritten one?", "Ce literă de tipar este aceasta scrisă de mână?") : tr("Which handwritten letter is this?", "Care este litera aceasta scrisă de mână?")),
      h("div", { class: "big-he" + (fromCursive ? " cursive" : ""), lang: "he" }, ch));
    const opts = shuffle([ch, ...shuffle(all.filter(x => x !== ch)).slice(0, 3)]);
    const grid = h("div", { class: "choices" });
    let answered = false;
    const btns = opts.map(o => h("button", { class: "choice he" + (fromCursive ? "" : " cursive"), type: "button", lang: "he", onclick: () => {
      if (answered) return;
      answered = true;
      drillScore.total++;
      if (o === ch) drillScore.right++; else bag.again(ch);
      btns[opts.indexOf(ch)].classList.add("right");
      if (o !== ch) btns[opts.indexOf(o)].classList.add("wrong");
      const L0 = LETTERS.find(x => x.ch === ch);
      box.append(h("div", { class: "muted", style: { marginTop: "10px" } }, nameOf(L0), "  ", h("span", { class: "he", lang: "he" }, ch), "  ", h("span", { class: "he cursive", lang: "he" }, ch)),
        h("button", { class: "btn primary", type: "button", style: { marginTop: "12px" }, onclick: next }, tr("Next", "Următorul")));
      recordDrill();
    } }, o));
    grid.append(...btns);
    box.append(grid);
  } else if (kind === "words") {
    wordDrill();
  }
}

let wordPool = null;
async function wordDrill() {
  const box = drillFrame(tr("Read real words", "Citește cuvinte adevărate"), "words");
  if (!wordPool) {
    try {
      const res = await api.get("freqlist", { limit: 400 });
      wordPool = res.items.filter(x => !/^H9/.test(x.key) && x.hebrew.length > 1);
    } catch (e) { box.append(h("p", null, tr("Could not load words.", "Nu am putut încărca cuvintele."))); return; }
  }
  const bag = deckFor("drill-words", wordPool.slice(0, 300), x => x.key);
  const w = bag.next();
  const fromHebrew = sideOf("words") === "he";
  const say = () => speak(speakableLemma(w.hebrew, w.key, store.settings));
  const sound = h("div", { class: "tr", style: { fontSize: "24px" }, html: translit(lemmaTranslit(w.translit, w.key, store.settings), store.settings, { heb: w.hebrew }) });
  const mean = lang() === "ro" ? (w.glossRo || w.gloss) : w.gloss;
  // Hebrew first: read it, then see how it sounds and what it means. Meaning first: recall the word, then see it and hear it.
  const reveal = fromHebrew
    ? h("div", { class: "answer", hidden: true }, sound, h("div", { class: "gloss" }, mean))
    : h("div", { class: "answer", hidden: true }, h("div", { class: "big-he", lang: "he" }, stripCantillation(w.hebrew)), sound,
      sayBtn(speakableLemma(w.hebrew, w.key, store.settings)));
  const btns = h("div", { class: "row", style: { justifyContent: "center", marginTop: "14px" }, hidden: true },
    h("button", { class: "btn", type: "button", onclick: () => { drillScore.total++; bag.again(w); wordDrill(); } }, tr("Not yet", "Încă nu")),
    h("button", { class: "btn primary", type: "button", onclick: () => { drillScore.total++; drillScore.right++; wordDrill(); } }, fromHebrew ? tr("I read it right", "Am citit corect") : tr("I knew it", "L-am știut")));
  const check = h("button", { class: "btn", type: "button", onclick: (e) => { reveal.hidden = false; btns.hidden = false; e.currentTarget.hidden = true; say(); } }, tr("Check", "Verifică"));
  if (fromHebrew) box.append(h("div", { class: "prompt" }, tr("Read it out loud, then check", "Citește-l cu voce tare, apoi verifică")), h("div", { class: "big-he", lang: "he" }, stripCantillation(w.hebrew)), check, reveal, btns);
  else box.append(h("div", { class: "prompt" }, tr("Say the Hebrew word for this, then check", "Spune cuvântul ebraic pentru acesta, apoi verifică")), h("div", { style: { fontSize: "26px", margin: "14px 0" } }, mean), check, reveal, btns);
}
