// Grammar tab: short lessons in English or Romanian, with real examples pulled from the text.
// English lessons compare Hebrew with English and quote the KJV; Romanian lessons compare with Romanian and quote Cornilescu.

import { api, store, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, iconBtn, he, toast, trt } from "./ui.js";
import { tr, tl, lang, bible } from "./i18n.js";
import { speak } from "./audio.js";
import { occItem } from "./wordpanel.js";
import { speakableText } from "./hebrew.js";

let root, current = 0;

// Example: Hebrew, transliteration (English style, shown in the interface language), meaning,
// how the KJV and Cornilescu render it, and the verse.
const ex = (heb, trl, mean, kjv, ro, ref) => h("div", { class: "ex" },
  h("span", { class: "t" }, tl(trl), (lang() === "ro" ? ro : kjv) ? h("span", { class: "muted" }, "   " + (lang() === "ro" ? "Cornilescu: " + ro : "KJV: " + kjv)) : null),
  h("span", { class: "he-ex" }, he(heb), " ", iconBtn("speaker", tr("Listen", "Ascultă"), () => speak(speakableText(heb, store.settings)))),
  h("span", { class: "m" }, mean, ref ? h("span", { class: "faint" }, ", " + ctx.refText(...ref)) : null));

// A verse quoted in the interface language's Bible.
const quote = (ref, kjv, ro) => h("blockquote", { class: "gr-quote" },
  h("div", null, lang() === "ro" ? ro : kjv),
  h("div", { class: "small faint" }, `${ctx.refText(...ref)}, ${lang() === "ro" ? "Cornilescu" : "KJV"}`));

// A cell that is only Hebrew is shown big and right to left. A cell that mixes Hebrew with words ("וְהָאָרֶץ and the earth")
// stays a normal left-to-right cell with the Hebrew parts marked as Hebrew.
const isHeb = (c) => typeof c === "string" && /[֐-׿]/.test(c) && !/[A-Za-zÀ-ɏ]/.test(c);
const isMixed = (c) => typeof c === "string" && /[֐-׿]/.test(c) && /[A-Za-zÀ-ɏ]/.test(c);
const mixedText = (c) => c.split(/([\u0590-\u05FF](?:[\u0590-\u05FF\s]*[\u0590-\u05FF])?)/).filter(Boolean)
  .map(x => /[\u0590-\u05FF]/.test(x) ? he(x, "inline") : x);
// Table: cells are strings or { t: "translit" } (shown via tl()).
const table = (head, rows) => h("div", { class: "table-wrap" }, h("table", null,
  h("thead", null, h("tr", null, head.map(x => h("th", null, x)))),
  h("tbody", null, rows.map(r => h("tr", null, r.map((c) => isHeb(c) ? h("td", { class: "he-cell" }, he(c))
    : isMixed(c) ? h("td", null, mixedText(c))
    : (c && typeof c === "object" && "t" in c) ? h("td", { class: "tl" }, tl(c.t)) : h("td", null, c)))))));

const p = (...x) => h("p", null, ...x);
const tip = (...x) => h("div", { class: "tip" }, ...x);
const colored = (pre, rootPart, suf) => h("span", { class: "he gr-big", lang: "he" },
  pre ? h("span", { class: "hp-pre" }, pre) : null, rootPart, suf ? h("span", { class: "hp-suf" }, suf) : null);
const H = (s) => he(s, "inline");
const T = (s) => tl(s);

const LESSONS = [
  {
    title: () => tr("How a Hebrew word is built", "Cum e alcătuit un cuvânt ebraic"),
    body: () => [
      p(tr("A Hebrew word is often several English words glued together. Small words like ", "Un cuvânt ebraic corespunde adesea mai multor cuvinte românești lipite împreună. Cuvinte mici ca "),
        h("i", null, tr("and", "și")), ", ", h("i", null, tr("the", "-ul")), ", ", h("i", null, tr("in", "în")),
        tr(" stick to the front. Words like ", " se lipesc în față. Cuvinte ca "), h("i", null, tr("my", "meu")), ", ", h("i", null, tr("his", "lui")), ", ", h("i", null, tr("them", "îi")),
        tr(" stick to the end. In the middle is the main word.", " se lipesc la sfârșit. La mijloc este cuvântul principal.")),
      h("div", { class: "row", style: { gap: "20px", margin: "10px 0" } }, colored("וְהָ", "אָרֶץ", ""), h("span", null, tr("ve + ha + aretz = and + the + earth: “and the earth”", "ve + ha + areț = și + -ul + pământ: „și pământul”"))),
      h("div", { class: "row", style: { gap: "20px", margin: "10px 0" } }, colored("", "בְּנ", "וֹ"), h("span", null, tr("ben + o = son + his: “his son”", "ben + o = fiu + lui: „fiul lui”"))),
      p(trt("The reader colors these parts: prefixes in teal, endings in plum. Hover a prefix to see which English word it matches.",
        "Cititorul colorează aceste părți: prefixele cu turcoaz, terminațiile cu mov. Treci cu mouse-ul peste un prefix ca să vezi cu ce cuvânt românesc se potrivește.",
        "The reader colors these parts: prefixes in teal, endings in plum. Tap a word to see its parts in the word panel.",
        "Cititorul colorează aceste părți: prefixele cu turcoaz, terminațiile cu mov. Apasă pe un cuvânt ca să-i vezi părțile în panoul cuvântului.")),
      h("h2", null, tr("The root", "Rădăcina")),
      p(tr("Most words grow from a root of three consonants. Different vowels and extra letters around the root make related words. Learn the root once and many words open up.",
        "Cele mai multe cuvinte cresc dintr-o rădăcină de trei consoane. Vocale diferite și litere în plus în jurul rădăcinii fac cuvinte înrudite. Înveți rădăcina o dată și se deschid multe cuvinte.")),
      table([tr("Word", "Cuvânt"), tr("Sound", "Pronunție"), tr("Meaning", "Înțeles")], [
        ["מָלַךְ", { t: "ma·lakh" }, tr("he reigned", "a domnit")], ["מֶלֶךְ", { t: "me·lekh" }, tr("king", "împărat")], ["מַלְכָּה", { t: "mal·kah" }, tr("queen", "împărăteasă")],
        ["מַמְלָכָה", { t: "mam·la·khah" }, tr("kingdom", "împărăție")], ["מְלוּכָה", { t: "me·lu·khah" }, tr("kingship", "domnie")]]),
      p(tr("All five share the root ", "Toate cinci au rădăcina "), H("מ־ל־ך"), tr(". In the word panel, the section ", ". În panoul cuvântului, secțiunea "),
        h("b", null, tr("Root and related words", "Rădăcina și cuvintele înrudite")), tr(" shows the whole family for any word.", " arată toată familia oricărui cuvânt.")),
      tip(tr("English puts “the” in front, like Hebrew: the earth, ", "Româna pune articolul la sfârșit (pământ-ul). Ebraica îl pune în față: "), H("הָאָרֶץ"),
        tr(". The difference is that Hebrew writes it as one word.", ". Aceeași idee, pe partea cealaltă.")),
    ],
    search: "^HC/HTd/HN", searchLabel: () => tr("and + the + noun", "și + articol + substantiv"),
  },
  {
    title: () => tr("Reading a verse step by step", "Citirea unui verset pas cu pas"),
    body: () => [
      p(tr("Here is the first verse of the Bible taken apart. Do the same with any verse: find the prefixes, find the main word, then put it back together.",
        "Iată primul verset din Biblie desfăcut în bucăți. Fă la fel cu orice verset: găsește prefixele, găsește cuvântul principal, apoi pune-le la loc.")),
      h("div", { class: "he gr-verse", lang: "he" }, "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃"),
      quote([0, 1, 1], "In the beginning God created the heaven and the earth.", "La început, Dumnezeu a făcut cerurile și pământul."),
      h("ol", { class: "gr-steps" },
        h("li", null, H("בְּרֵאשִׁית"), " ", T("be·re·shit"), ": ", H("בְּ"), tr(" “in” + ", " „în” + "), H("רֵאשִׁית"), tr(" “beginning”. The word “the” is not written, English adds it.", " „început”. Româna spune „la început”.")),
        h("li", null, H("בָּרָא"), " ", T("ba·ra"), tr(": “he created”. The verb comes first, before the one who does it. This is normal in Hebrew stories.", ": „a făcut” (a creat). Verbul vine primul, înaintea celui care face lucrarea. Așa e obișnuit în povestirile ebraice.")),
        h("li", null, H("אֱלֹהִים"), " ", T("e·lo·him"), tr(": “God”. It looks plural (the ending -im) but the verb is singular, so it means the one God.", ": „Dumnezeu”. Pare plural (terminația -im), dar verbul e la singular, deci înseamnă singurul Dumnezeu.")),
        h("li", null, H("אֵת"), " ", T("et"), tr(": marks the direct object. English has no word for it, so the KJV leaves it out.", ": arată complementul direct. Seamănă cu „pe” din română, dar aici Cornilescu nu-l traduce.")),
        h("li", null, H("הַשָּׁמַיִם"), " ", T("ha·sha·ma·yim"), ": ", H("הַ"), tr(" “the” + ", " articolul + "), H("שָׁמַיִם"), tr(" “heavens”. The dot in ש doubles it: hash-shamayim.", " „ceruri”. Punctul din ש o dublează: haș-șamaim.")),
        h("li", null, H("וְאֵת"), " ", T("ve·'et"), ": ", H("וְ"), tr(" “and” + the object marker again.", " „și” + din nou marca complementului.")),
        h("li", null, H("הָאָרֶץ"), " ", T("ha·'a·retz"), ": ", H("הָ"), tr(" “the” + ", " articolul + "), H("אֶרֶץ"),
          tr(" “earth”. The vowel under ה is longer because א can't be doubled.", " „pământ”. Vocala de sub ה e mai lungă pentru că א nu se poate dubla."))),
      tip(tr("In the reader, turn on “Pronunciation under each word” and “Meaning under each word” (View), then try this with Genesis 1:2.",
        "În cititor, pornește „Pronunția sub fiecare cuvânt” și „Înțelesul sub fiecare cuvânt” (Afișare), apoi încearcă la Geneza 1:2.")),
    ],
  },
  {
    title: () => tr("The little prefixes", "Prefixele mici"),
    body: () => [
      p(tr("Seven one-letter words attach to the front of other words. Once you know them, half of the long-looking words become short.",
        "Șapte cuvinte de o literă se lipesc în fața altor cuvinte. Când le știi, jumătate din cuvintele care par lungi devin scurte.")),
      table([tr("Prefix", "Prefix"), tr("Meaning", "Înțeles"), tr("Example", "Exemplu")], [
        ["וְ", tr("and, but", "și, dar"), tr("וְהָאָרֶץ and the earth", "וְהָאָרֶץ și pământul")],
        ["הַ", tr("the", "-ul, -a (articolul)"), tr("הַשָּׁמַיִם the heavens", "הַשָּׁמַיִם cerurile")],
        ["בְּ", tr("in, with, by", "în, cu, prin"), tr("בְּרֵאשִׁית in the beginning", "בְּרֵאשִׁית la început")],
        ["כְּ", tr("like, as", "ca, după"), tr("כִּדְמוּתֵנוּ after our likeness", "כִּדְמוּתֵנוּ după asemănarea noastră")],
        ["לְ", tr("to, for, of", "la, pentru, al"), tr("לְדָוִד of David", "לְדָוִד a lui David")],
        ["מִ", tr("from (short for מִן)", "din, de la (scurt pentru מִן)"), tr("מִן־הָאֲדָמָה from the ground", "מִן־הָאֲדָמָה din pământ")],
        ["שֶׁ", tr("who, which", "care"), tr("rare, mostly in later books", "rar, mai ales în cărțile de mai târziu")],
      ]),
      h("h2", null, tr("When they change their vowel", "Când își schimbă vocala")),
      p(tr("The prefix ו is usually וְ, but before ב מ פ or a letter with shva it becomes וּ (u). In story verbs it is וַ with a dot in the next letter (see the lesson on the story tense).",
        "Prefixul ו este de obicei וְ, dar înainte de ב מ פ sau de o literă cu șva devine וּ (u). La verbele din povestiri este וַ cu un punct în litera următoare (vezi lecția despre timpul povestirii).")),
      p(tr("When בְּ כְּ לְ meet the article הַ, the ה drops out and its vowel moves onto the prefix:", "Când בְּ כְּ לְ întâlnesc articolul הַ, ה cade și vocala lui trece pe prefix:")),
      ex("לָאוֹר", "la·or", tr("to the light (לְ + הָ + אוֹר)", "luminii (לְ + הָ + אוֹר)"), "the light", "lumina", [0, 1, 5]),
      ex("בַּשָּׁמַיִם", "ba·sha·ma·yim", tr("in the heavens (בְּ + הַ + שָּׁמַיִם)", "în ceruri (בְּ + הַ + שָּׁמַיִם)"), "", "", null),
      tip(tr("If you see בַּ, כַּ or לַ with a dot in the next letter, think “in the”, “like the”, “to the”.", "Dacă vezi בַּ, כַּ sau לַ cu un punct în litera următoare, gândește-te la „în -ul”, „ca -ul”, „la -ul”.")),
    ],
    search: "HRd/H[NAV]|^HR/HTd", searchLabel: () => tr("preposition + the", "prepoziție + articol"),
  },
  {
    title: () => tr("The definite article", "Articolul hotărât"),
    body: () => [
      p(tr("Hebrew has a word for “the” (", "Ebraica are un cuvânt pentru articolul hotărât („-ul”, "), H("הַ"), tr(") but no word for “a”. So ", ") dar nu are pentru „un, o”. Așa că "), H("אִישׁ"),
        tr(" is “a man” and ", " înseamnă „un om” și "), H("הָאִישׁ"), tr(" is “the man”.", " înseamnă „omul”.")),
      p(tr("The article is הַ plus a dot (dagesh) that doubles the next letter: הַשָּׁמַיִם is hash-shamayim. The letters א ע ר can't be doubled, so the vowel becomes longer instead: הָאָרֶץ, הָעָם, הָרוּחַ. Before ה and ח it is often הַ or הֶ without a dot.",
        "Articolul este הַ plus un punct (dagheș) care dublează litera următoare: הַשָּׁמַיִם se citește haș-șamaim. Literele א ע ר nu se pot dubla, așa că vocala se lungește: הָאָרֶץ, הָעָם, הָרוּחַ. Înainte de ה și ח e adesea הַ sau הֶ fără punct.")),
      ex("הָאוֹר", "ha·or", tr("the light", "lumina"), "the light", "lumina", [0, 1, 4]),
      ex("הַמָּיִם", "ha·ma·yim", tr("the waters", "apele"), "the waters", "apelor", [0, 1, 2]),
      tip(tr("English and Hebrew both put “the” in front of the word. The KJV usually has “the” wherever Hebrew has הַ.",
        "Româna „lumina” are deja articolul în ea (-a). De aceea Cornilescu are un singur cuvânt unde ebraica are două părți.")),
    ],
    search: "^HTd/HN", searchLabel: () => tr("the + noun", "articol + substantiv"),
  },
  {
    title: () => tr("Nouns: gender and number", "Substantivele: gen și număr"),
    body: () => [
      p(tr("Every noun is masculine or feminine. Many feminine nouns end in ־ָה or ־ֶת. Plurals usually end in ־ִים (masculine) or ־וֹת (feminine), but some nouns break the rule.",
        "Orice substantiv e masculin sau feminin. Multe substantive feminine se termină în ־ָה sau ־ֶת. Pluralul se termină de obicei în ־ִים (masculin) sau ־וֹת (feminin), dar unele substantive nu țin regula.")),
      table([tr("One", "Unul"), tr("Many", "Mai mulți"), tr("Meaning", "Înțeles")], [
        ["דָּבָר", "דְּבָרִים", tr("word, words", "cuvânt, cuvinte")], ["מֶלֶךְ", "מְלָכִים", tr("king, kings", "împărat, împărați")],
        ["בְּרָכָה", "בְּרָכוֹת", tr("blessing, blessings", "binecuvântare, binecuvântări")], ["אָב", "אָבוֹת", tr("father, fathers (masculine with ־וֹת)", "tată, părinți (masculin cu ־וֹת)")]]),
      h("h2", null, tr("Pairs", "Perechi")),
      p(tr("Things that come in pairs use the dual ending ־ַיִם: יָדַיִם hands, עֵינַיִם eyes, רַגְלַיִם feet. The words שָׁמַיִם heavens and מַיִם water only look dual.",
        "Lucrurile care vin în perechi au terminația de dual ־ַיִם: יָדַיִם mâini, עֵינַיִם ochi, רַגְלַיִם picioare. Cuvintele שָׁמַיִם ceruri și מַיִם ape doar arată ca un dual.")),
      h("h2", null, tr("Adjectives", "Adjectivele")),
      p(tr("Adjectives come after the noun and match it in gender, number and “the”:", "Adjectivele vin după substantiv și se potrivesc cu el în gen, număr și articol:")),
      ex("גּוֹי גָּדוֹל", "goy ga·dol", tr("a great nation", "un neam mare"), "a great nation", "un neam mare", [0, 12, 2]),
      tip(tr("English puts the adjective first (a great nation); Hebrew puts it after, like Romanian.", "Româna pune și ea cele mai multe adjective după substantiv (un neam mare), așa că ordinea îți va părea firească.")),
    ],
    search: "HNc.(p|d)a", searchLabel: () => tr("plural and dual nouns", "substantive la plural și dual"),
  },
  {
    title: () => tr("The construct chain: “the word of the LORD”", "Lanțul construct: „cuvântul Domnului”"),
    body: () => [
      p(tr("To say “the X of Y”, Hebrew puts two nouns next to each other. The first noun takes a shorter form (the construct state) and never takes הַ. The second noun decides if the whole phrase is “the” or “a”.",
        "Ca să spună „X-ul lui Y”, ebraica pune două substantive unul lângă altul. Primul ia o formă mai scurtă (starea construct) și nu primește niciodată הַ. Al doilea hotărăște dacă toată expresia e hotărâtă sau nu.")),
      ex("דְּבַר־יְהוָה", "de·var a·do·nai", tr("the word of the LORD", "cuvântul Domnului"), "the word of the LORD", "cuvântul Domnului", [0, 15, 1]),
      ex("בֵּית אֱלֹהִים", "beit e·lo·him", tr("the house of God", "casa lui Dumnezeu"), "the house of God", "casa lui Dumnezeu", [0, 28, 17]),
      ex("בְּנֵי יִשְׂרָאֵל", "be·nei yis·ra·el", tr("the children of Israel", "copiii lui Israel"), "the children of Israel", "copiii lui Israel", null),
      p(tr("Plural nouns in construct often end in ־ֵי: בָּנִים sons, בְּנֵי sons of.", "Substantivele la plural în construct se termină adesea în ־ֵי: בָּנִים fii, בְּנֵי fiii lui.")),
      tip(tr("The grammar line in the word panel says “construct” for these forms. Read it as “… of”: English adds “of” where Hebrew just puts the words together.",
        "Rândul de gramatică din panoul cuvântului scrie „construct” la aceste forme. Citește-l ca „… lui”: româna folosește genitivul (cuvântul Domnului), ebraica doar alătură cuvintele.")),
    ],
    search: "HNc..c(?!/HS)", searchLabel: () => tr("nouns in construct", "substantive în construct"),
  },
  {
    title: () => tr("Endings for “my, your, his”", "Terminațiile pentru „meu, tău, lui”"),
    body: () => [
      p(tr("Possessive and object pronouns are endings. Here they are on the preposition לְ “to” and on the noun אֱלֹהִים “God”, both very common in the Bible.",
        "Pronumele posesive și cele de complement sunt terminații. Iată-le pe prepoziția לְ „la” și pe substantivul אֱלֹהִים „Dumnezeu”, amândouă foarte des în Biblie.")),
      table(["", tr("to …", "la / lui …"), tr("… God", "Dumnezeul …")], [
        [tr("my / me", "meu / mie"), "לִי", "אֱלֹהַי"], [tr("your (m)", "tău (m)"), "לְךָ", "אֱלֹהֶיךָ"], [tr("your (f)", "tău (f)"), "לָךְ", "אֱלֹהַיִךְ"], [tr("his / him", "lui"), "לוֹ", "אֱלֹהָיו"],
        [tr("her", "ei"), "לָהּ", "אֱלֹהֶיהָ"], [tr("our / us", "nostru / nouă"), "לָנוּ", "אֱלֹהֵינוּ"], [tr("your (pl)", "vostru"), "לָכֶם", "אֱלֹהֵיכֶם"], [tr("their / them", "lor"), "לָהֶם", "אֱלֹהֵיהֶם"]]),
      p(tr("The same endings go on verbs as objects: שָׁמְרֵנִי “keep me”.", "Aceleași terminații se pun și pe verbe, ca complement: שָׁמְרֵנִי „păzește-mă”.")),
      ex("יְהוָה אֱלֹהֵינוּ", "a·do·nai e·lo·hei·nu", tr("the LORD our God", "Domnul Dumnezeul nostru"), "The LORD our God", "Domnul Dumnezeul nostru", [4, 6, 4]),
    ],
    search: "/HSp", searchLabel: () => tr("words with a pronoun ending", "cuvinte cu terminație de pronume"),
  },
  {
    title: () => tr("Pronouns", "Pronumele"),
    body: () => [
      table([tr("Hebrew", "Ebraică"), tr("Sound", "Pronunție"), tr("Meaning", "Înțeles")], [
        ["אֲנִי / אָנֹכִי", { t: "a·ni / a·no·khi" }, tr("I", "eu")], ["אַתָּה", { t: "at·tah" }, tr("you (m)", "tu (m)")], ["אַתְּ", { t: "at" }, tr("you (f)", "tu (f)")],
        ["הוּא", { t: "hu" }, tr("he", "el")], ["הִיא", { t: "hi" }, tr("she (often written הִוא in the Torah)", "ea (scris adesea הִוא în Tora)")], ["אֲנַחְנוּ", { t: "a·nach·nu" }, tr("we", "noi")],
        ["אַתֶּם", { t: "at·tem" }, tr("you (m pl)", "voi (m)")], ["הֵם / הֵמָּה", { t: "hem / hem·mah" }, tr("they (m)", "ei")], ["הֵן / הֵנָּה", { t: "hen / hen·nah" }, tr("they (f)", "ele")]]),
      h("h2", null, tr("No word for “is”", "Fără cuvânt pentru „este”")),
      p(tr("In the present, Hebrew usually leaves out “is” and “are”. The KJV adds them, printed in italics:", "La prezent, ebraica omite de obicei „este” și „sunt”. Cornilescu le adaugă:")),
      ex("יְהוָה רֹעִי", "a·do·nai ro·i", tr("the LORD [is] my shepherd", "Domnul [este] Păstorul meu"), "The LORD is my shepherd", "Domnul este Păstorul meu", [18, 23, 1]),
      tip(tr("In the reader, words the KJV translators added are shown in italics, just like in a printed KJV.", "În cititor, cuvintele adăugate de traducătorii KJV apar înclinate, ca într-o Biblie KJV tipărită.")),
    ],
    search: "HPp", searchLabel: () => tr("personal pronouns", "pronume personale"),
  },
  {
    title: () => tr("Numbers", "Numerele"),
    body: () => [
      p(tr("Numbers 3 to 10 do something surprising: with masculine nouns they take the feminine-looking ending ־ָה, and with feminine nouns they don't. One and two behave normally.",
        "Numerele de la 3 la 10 fac ceva neașteptat: cu substantive masculine iau terminația ־ָה, care pare feminină, iar cu substantive feminine nu o iau. Unu și doi se poartă normal.")),
      table([tr("Number", "Număr"), tr("with masculine nouns", "cu substantive masculine"), tr("with feminine nouns", "cu substantive feminine"), tr("Sound", "Pronunție")], [
        ["1", "אֶחָד", "אַחַת", { t: "e·chad / a·chat" }], ["2", "שְׁנַיִם", "שְׁתַּיִם", { t: "she·na·yim / she·ta·yim" }],
        ["3", "שְׁלֹשָׁה", "שָׁלֹשׁ", { t: "she·lo·shah / sha·losh" }], ["4", "אַרְבָּעָה", "אַרְבַּע", { t: "ar·ba·ah / ar·ba" }],
        ["5", "חֲמִשָּׁה", "חָמֵשׁ", { t: "cha·mi·shah / cha·mesh" }], ["6", "שִׁשָּׁה", "שֵׁשׁ", { t: "shi·shah / shesh" }],
        ["7", "שִׁבְעָה", "שֶׁבַע", { t: "shiv·ah / she·va" }], ["8", "שְׁמֹנָה", "שְׁמֹנֶה", { t: "she·mo·nah / she·mo·neh" }],
        ["9", "תִּשְׁעָה", "תֵּשַׁע", { t: "tish·ah / te·sha" }], ["10", "עֲשָׂרָה", "עֶשֶׂר", { t: "a·sa·rah / e·ser" }]]),
      table([tr("Number", "Număr"), tr("Hebrew", "Ebraică"), tr("Sound", "Pronunție")], [
        ["20", "עֶשְׂרִים", { t: "es·rim" }], ["100", "מֵאָה", { t: "me·ah" }], ["1000", "אֶלֶף", { t: "e·lef" }]]),
      h("h2", null, tr("First, second, third", "Întâi, al doilea, al treilea")),
      p(tr("Ordinals end in ־ִי: ", "Numeralele ordinale se termină în ־ִי: "), H("שֵׁנִי"), tr(" second, ", " al doilea, "), H("שְׁלִישִׁי"), tr(" third, ", " al treilea, "),
        H("שִׁשִּׁי"), tr(" sixth, ", " al șaselea, "), H("שְׁבִיעִי"), tr(" seventh. “First” is ", " al șaptelea. „Întâi” este "), H("רִאשׁוֹן"), tr(", from the word for head.", ", din cuvântul pentru cap.")),
      ex("יוֹם אֶחָד", "yom e·chad", tr("one day (Hebrew says “one”, not “first”)", "o zi (ebraica spune „una”, nu „întâi”)"), "the first day", "ziua întâi", [0, 1, 5]),
      ex("יוֹם שֵׁנִי", "yom she·ni", tr("a second day", "ziua a doua"), "the second day", "ziua a doua", [0, 1, 8]),
      tip(tr("Big numbers are said piece by piece: Abram was “ninety years old and nine” (Genesis 17:1), exactly the Hebrew order.",
        "Numerele mari se spun pe bucăți: KJV traduce chiar în ordinea ebraică, „nouăzeci de ani și nouă” (Geneza 17:1); Cornilescu spune „nouăzeci și nouă de ani”.")),
    ],
    search: "HAc", searchLabel: () => tr("numbers", "numerale"),
  },
  {
    title: () => tr("Roots and verb stems", "Rădăcini și tulpini verbale"),
    body: () => [
      p(tr("A verb root can be put into different patterns, called stems (binyanim). Each stem shifts the meaning in a typical way. The word panel names the stem of every verb.",
        "O rădăcină de verb poate fi pusă în tipare diferite, numite tulpini (binianim). Fiecare tulpină schimbă înțelesul într-un fel obișnuit. Panoul cuvântului arată tulpina fiecărui verb.")),
      table([tr("Stem", "Tulpina"), tr("Usual meaning", "Înțelesul obișnuit"), tr("Pattern", "Tipar"), tr("Real example", "Exemplu real")], [
        ["Qal", tr("simple action", "acțiunea simplă"), "קָטַל", tr("מָלַךְ he reigned", "מָלַךְ a domnit")],
        ["Niphal", tr("passive or reflexive of Qal", "pasivul sau reflexivul lui Qal"), "נִקְטַל", tr("נִשְׁבַּר it was broken", "נִשְׁבַּר s-a frânt")],
        ["Piel", tr("intensive, or making something happen", "întărit, sau a face să se întâmple"), "קִטֵּל", tr("דִּבֵּר he spoke", "דִּבֵּר a vorbit")],
        ["Pual", tr("passive of Piel", "pasivul lui Piel"), "קֻטַּל", tr("מְבֹרָךְ blessed", "מְבֹרָךְ binecuvântat")],
        ["Hiphil", tr("causing someone to do it", "a face pe cineva să facă"), "הִקְטִיל", tr("הוֹצִיא he brought out", "הוֹצִיא a scos")],
        ["Hophal", tr("passive of Hiphil", "pasivul lui Hiphil"), "הָקְטַל", tr("הֻגַּד it was told", "הֻגַּד s-a spus")],
        ["Hithpael", tr("doing it to oneself, or again and again", "a face ceva asupra sa, sau iar și iar"), "הִתְקַטֵּל", tr("הִתְהַלֵּךְ he walked about", "הִתְהַלֵּךְ a umblat")]]),
      p(tr("Grammar books use the root ק־ט־ל as a model because it fits every pattern.", "Cărțile de gramatică folosesc rădăcina ק־ט־ל ca model pentru că se potrivește în orice tipar.")),
      tip(tr("Hiphil is easy to spot: it often starts with ה and has an i-vowel (ִי) before the last letter.", "Hiphil se recunoaște ușor: începe adesea cu ה și are vocala i (ִי) înainte de ultima literă.")),
    ],
    search: "HV[NpPhHt]", searchLabel: () => tr("verbs in the derived stems", "verbe în tulpinile derivate"),
  },
  {
    title: () => tr("Perfect and imperfect", "Perfectul și imperfectul"),
    body: () => [
      p(tr("Hebrew verbs have two main forms. The perfect (qatal) uses endings and is usually a finished action. The imperfect (yiqtol) uses prefixes and is usually future, repeated or unfinished. Here is the verb שָׁמַר “to keep, guard”:",
        "Verbele ebraice au două forme principale. Perfectul (qatal) folosește terminații și e de obicei o acțiune încheiată. Imperfectul (yiqtol) folosește prefixe și e de obicei viitor, repetat sau neîncheiat. Iată verbul שָׁמַר „a păzi”:")),
      table([tr("Person", "Persoana"), tr("Perfect", "Perfect"), tr("Imperfect", "Imperfect")], [
        [tr("he", "el"), "שָׁמַר", "יִשְׁמֹר"], [tr("she", "ea"), "שָׁמְרָה", "תִּשְׁמֹר"], [tr("you (m)", "tu (m)"), "שָׁמַרְתָּ", "תִּשְׁמֹר"], [tr("you (f)", "tu (f)"), "שָׁמַרְתְּ", "תִּשְׁמְרִי"],
        [tr("I", "eu"), "שָׁמַרְתִּי", "אֶשְׁמֹר"], [tr("they", "ei"), "שָׁמְרוּ", "יִשְׁמְרוּ"], [tr("you (pl)", "voi"), "שְׁמַרְתֶּם", "תִּשְׁמְרוּ"], [tr("we", "noi"), "שָׁמַרְנוּ", "נִשְׁמֹר"]]),
      tip(tr("Perfect: the person is at the end (־תִּי I, ־תָּ you, ־נוּ we). Imperfect: the person is at the front (אֶ I, תִּ you or she, יִ he, נִ we).",
        "Perfect: persoana e la sfârșit (־תִּי eu, ־תָּ tu, ־נוּ noi). Imperfect: persoana e în față (אֶ eu, תִּ tu sau ea, יִ el, נִ noi).")),
    ],
    search: "HV.p", searchLabel: () => tr("perfect verbs", "verbe la perfect"),
  },
  {
    title: () => tr("Wayyiqtol: the story tense", "Wayyiqtol: timpul povestirii"),
    body: () => [
      p(tr("Bible stories move forward with one form: וַ + a dot in the next letter + the imperfect. It means “and he did”. The KJV keeps the “and” almost every time, which is why so many KJV verses start with “And”.",
        "Povestirile din Biblie înaintează cu o singură formă: וַ + un punct în litera următoare + imperfectul. Înseamnă „și a făcut”. Cornilescu lasă de obicei „și” deoparte și folosește trecutul românesc: „a zis”, „a văzut”.")),
      ex("וַיֹּאמֶר אֱלֹהִים", "va·yo·mer e·lo·him", tr("and God said", "și Dumnezeu a zis"), "And God said", "Dumnezeu a zis", [0, 1, 3]),
      ex("וַיַּרְא", "va·yar", tr("and he saw", "și a văzut"), "And God saw", "a văzut", [0, 1, 4]),
      ex("וַיְהִי", "vay·hi", tr("and it was, and it came to pass", "și a fost, și s-a întâmplat"), "and there was", "și a fost", [0, 1, 3]),
      ex("וַיֵּלֶךְ", "va·ye·lekh", tr("and he went", "și a plecat"), "So Abram departed", "Avram a plecat", [0, 12, 4]),
      p(tr("It is the most common verb form in the Old Testament. Once you know it, Genesis reads much faster.", "Este cea mai des întâlnită formă de verb din Vechiul Testament. Când o știi, Geneza se citește mult mai repede.")),
    ],
    search: "HV.w", searchLabel: () => tr("wayyiqtol verbs", "verbe wayyiqtol"),
  },
  {
    title: () => tr("Commands and wishes", "Porunci și dorințe"),
    body: () => [
      p(tr("The imperative gives a command. The jussive (“let him”) and cohortative (“let us”) express wishes. And וְ + perfect (weqatal) continues a future or a command: “and you shall …”.",
        "Imperativul dă o poruncă. Jusivul („să facă el”) și cohortativul („să facem”) arată o dorință. Iar וְ + perfect (weqatal) continuă un viitor sau o poruncă: „și să…”.")),
      ex("שְׁמַע יִשְׂרָאֵל", "she·ma yis·ra·el", tr("hear, O Israel", "ascultă, Israele"), "Hear, O Israel", "Ascultă, Israele", [4, 6, 4]),
      ex("לֶךְ־לְךָ", "lekh le·kha", tr("go (for yourself)", "du-te (pentru tine)"), "Get thee out", "Ieși", [0, 12, 1]),
      ex("יְהִי אוֹר", "ye·hi or", tr("let there be light", "să fie lumină"), "Let there be light", "Să fie lumină", [0, 1, 3]),
      ex("נַעֲשֶׂה אָדָם", "na·a·seh a·dam", tr("let us make man", "să facem om"), "Let us make man", "Să facem om", [0, 1, 26]),
      ex("וְשָׁמַרְתָּ", "ve·sha·mar·ta", tr("and you shall keep", "și să păzești"), "Thou shalt keep", "Păzește", [4, 4, 40]),
    ],
    search: "HV.v", searchLabel: () => tr("imperatives", "imperative"),
  },
  {
    title: () => tr("Infinitives and participles", "Infinitive și participii"),
    body: () => [
      p(tr("The infinitive construct is “to do”, often with לְ. The most common one in the Bible is לֵאמֹר “saying”, which works like quotation marks.",
        "Infinitivul construct înseamnă „a face”, adesea cu לְ. Cel mai des întâlnit în Biblie este לֵאמֹר „zicând”, care ține locul ghilimelelor.")),
      ex("לֵאמֹר", "le·mor", tr("saying", "zicând"), "saying", "a zis", [0, 1, 22]),
      p(tr("The infinitive absolute in front of a verb makes it strong: “surely”.", "Infinitivul absolut pus înaintea unui verb îl întărește: „negreșit”.")),
      ex("מוֹת תָּמוּת", "mot ta·mut", tr("you shall surely die", "vei muri negreșit"), "thou shalt surely die", "vei muri negreșit", [0, 2, 17]),
      p(tr("The participle means “doing” or “one who does”:", "Participiul înseamnă „făcând” sau „cel ce face”:")),
      ex("אֹהֵב", "o·hev", tr("loving, one who loves, a friend", "care iubește, prieten"), "A friend loveth", "Prietenul … iubește", [19, 17, 17]),
      ex("רֹעֶה", "ro·eh", tr("shepherding, a shepherd", "care paște, păstor"), "", "", null),
    ],
    search: "HV.r", searchLabel: () => tr("participles", "participii"),
  },
  {
    title: () => tr("Verb charts", "Tabele de verbe"),
    body: () => [
      p(tr("A reference page for the regular verb שָׁמַר “to keep, guard” in the Qal stem. Come back to it while reading; you don't need to learn it all at once.",
        "O pagină de consultat pentru verbul regulat שָׁמַר „a păzi” în tulpina Qal. Revino la ea când citești; nu trebuie s-o înveți toată deodată.")),
      h("h2", null, tr("Perfect (qatal)", "Perfect (qatal)")),
      table([tr("Person", "Persoana"), tr("Hebrew", "Ebraică"), tr("Sound", "Pronunție")], [
        [tr("he kept", "el a păzit"), "שָׁמַר", { t: "sha·mar" }], [tr("she kept", "ea a păzit"), "שָׁמְרָה", { t: "sham·rah" }],
        [tr("you (m) kept", "tu (m) ai păzit"), "שָׁמַרְתָּ", { t: "sha·mar·ta" }], [tr("you (f) kept", "tu (f) ai păzit"), "שָׁמַרְתְּ", { t: "sha·mart" }],
        [tr("I kept", "eu am păzit"), "שָׁמַרְתִּי", { t: "sha·mar·ti" }], [tr("they kept", "ei au păzit"), "שָׁמְרוּ", { t: "sham·ru" }],
        [tr("you (m pl) kept", "voi (m) ați păzit"), "שְׁמַרְתֶּם", { t: "she·mar·tem" }], [tr("you (f pl) kept", "voi (f) ați păzit"), "שְׁמַרְתֶּן", { t: "she·mar·ten" }],
        [tr("we kept", "noi am păzit"), "שָׁמַרְנוּ", { t: "sha·mar·nu" }]]),
      h("h2", null, tr("Imperfect (yiqtol)", "Imperfect (yiqtol)")),
      table([tr("Person", "Persoana"), tr("Hebrew", "Ebraică"), tr("Sound", "Pronunție")], [
        [tr("he will keep", "el va păzi"), "יִשְׁמֹר", { t: "yish·mor" }], [tr("she will keep", "ea va păzi"), "תִּשְׁמֹר", { t: "tish·mor" }],
        [tr("you (m) will keep", "tu (m) vei păzi"), "תִּשְׁמֹר", { t: "tish·mor" }], [tr("you (f) will keep", "tu (f) vei păzi"), "תִּשְׁמְרִי", { t: "tish·me·ri" }],
        [tr("I will keep", "eu voi păzi"), "אֶשְׁמֹר", { t: "esh·mor" }], [tr("they (m) will keep", "ei vor păzi"), "יִשְׁמְרוּ", { t: "yish·me·ru" }],
        [tr("they (f) / you (f pl) will keep", "ele vor păzi / voi (f) veți păzi"), "תִּשְׁמֹרְנָה", { t: "tish·mor·nah" }], [tr("you (m pl) will keep", "voi (m) veți păzi"), "תִּשְׁמְרוּ", { t: "tish·me·ru" }],
        [tr("we will keep", "noi vom păzi"), "נִשְׁמֹר", { t: "nish·mor" }]]),
      h("h2", null, tr("Other forms", "Alte forme")),
      table([tr("Form", "Forma"), tr("Hebrew", "Ebraică"), tr("Sound", "Pronunție"), tr("Meaning", "Înțeles")], [
        [tr("imperative (m sg)", "imperativ (m sg)"), "שְׁמֹר", { t: "she·mor" }, tr("keep!", "păzește!")],
        [tr("imperative (f sg)", "imperativ (f sg)"), "שִׁמְרִי", { t: "shim·ri" }, tr("keep! (to a woman)", "păzește! (către o femeie)")],
        [tr("imperative (m pl)", "imperativ (m pl)"), "שִׁמְרוּ", { t: "shim·ru" }, tr("keep! (to many)", "păziți!")],
        [tr("infinitive construct", "infinitiv construct"), "לִשְׁמֹר", { t: "lish·mor" }, tr("to keep", "a păzi")],
        [tr("infinitive absolute", "infinitiv absolut"), "שָׁמוֹר", { t: "sha·mor" }, tr("keeping (for emphasis)", "păzind (pentru întărire)")],
        [tr("participle (m)", "participiu (m)"), "שֹׁמֵר", { t: "sho·mer" }, tr("keeping, a keeper", "care păzește, păzitor")],
        [tr("participle (f)", "participiu (f)"), "שֹׁמֶרֶת", { t: "sho·me·ret" }, tr("keeping (she)", "care păzește (ea)")],
        [tr("participle (m pl)", "participiu (m pl)"), "שֹׁמְרִים", { t: "shom·rim" }, tr("keepers", "păzitori")],
        [tr("passive participle", "participiu pasiv"), "שָׁמוּר", { t: "sha·mur" }, tr("kept", "păzit")]]),
      h("h2", null, tr("How to recognise each stem", "Cum recunoști fiecare tulpină")),
      table([tr("Stem", "Tulpina"), tr("Look for", "Caută"), tr("Example", "Exemplu")], [
        ["Niphal", tr("נִ before the root in the perfect", "נִ înaintea rădăcinii la perfect"), "נִשְׁמַר"],
        ["Piel", tr("a dot (dagesh) in the middle root letter", "un punct (dagheș) în litera din mijloc a rădăcinii"), "דִּבֵּר"],
        ["Pual", tr("u-vowel and a dot in the middle letter", "vocala u și un punct în litera din mijloc"), "קֻטַּל"],
        ["Hiphil", tr("הִ in front and ִי before the last letter", "הִ în față și ִי înaintea ultimei litere"), "הִשְׁמִיד"],
        ["Hophal", tr("הָ or הֻ in front", "הָ sau הֻ în față"), "הָשְׁלַךְ"],
        ["Hithpael", tr("הִתְ in front and a dot in the middle letter", "הִתְ în față și un punct în litera din mijloc"), "הִתְהַלֵּךְ"]]),
      tip(tr("In the word panel, “Every form in the Bible” lists all the forms of a verb grouped by stem. It is this chart, filled with real words.",
        "În panoul cuvântului, „Toate formele din Biblie” arată toate formele unui verb, grupate pe tulpini. E tabelul acesta, umplut cu cuvinte reale.")),
    ],
    search: "HVqp", searchLabel: () => tr("Qal perfect verbs", "verbe Qal la perfect"),
  },
  {
    title: () => tr("Small words you will see everywhere", "Cuvinte mici pe care le vezi peste tot"),
    body: () => [
      p(tr("These few words make up a big part of every chapter. Learn them early.", "Aceste câteva cuvinte fac o mare parte din fiecare capitol. Învață-le devreme.")),
      table([tr("Hebrew", "Ebraică"), tr("Meaning", "Înțeles")], [
        ["אֵת / אֶת־", tr("marks the direct object, not translated", "arată complementul direct, ca „pe”")],
        ["כִּי", tr("for, because, that", "căci, pentru că, că")], ["אֲשֶׁר", tr("who, which, that", "care, ce")], ["לֹא", tr("not", "nu")], ["אַל", tr("do not (with a wish or command)", "să nu")],
        ["הִנֵּה", tr("behold, look", "iată")], ["עַל", tr("on, upon, about", "pe, peste, asupra")], ["אֶל", tr("to, toward", "către, la")], ["עִם", tr("with", "cu")],
        ["כֹּל / כָּל־", tr("all, every", "tot, toți")], ["גַּם", tr("also", "și, de asemenea")], ["אִם", tr("if", "dacă")], ["מָה", tr("what", "ce")], ["מִי", tr("who", "cine")],
        ["יֵשׁ", tr("there is", "este, există")], ["אֵין", tr("there is not", "nu este, nu există")]]),
      tip(tr("“Behold” in the KJV is almost always הִנֵּה. When you see it, look for something new about to happen.",
        "אֵת e un ajutor pentru vorbitorii de română. Cornilescu îl păstrează adesea ca „pe”: Ia pe fiul tău (Geneza 22:2) este קַח־נָא אֶת־בִּנְךָ.")),
    ],
    search: "^HTo$|/HTo$", searchLabel: () => tr("the object marker", "marca complementului direct"),
  },
  {
    title: () => tr("Reading the accent marks", "Citirea accentelor"),
    body: () => [
      p(tr("The marks above and below the words (te'amim) show the chant melody and the structure of the verse. For a learner they do two useful things:",
        "Semnele de deasupra și de dedesubtul cuvintelor (teamim) arată melodia cântării și felul în care e împărțit versetul. Pentru cine învață, fac două lucruri folositoare:")),
      h("ul", null,
        h("li", null, tr("They show the stressed syllable. Most words are stressed on the last syllable, and the accent mark sits on the stressed one when it isn't.",
          "Arată silaba accentuată. Cele mai multe cuvinte au accentul pe ultima silabă, iar semnul stă pe silaba accentuată când nu e așa.")),
        h("li", null, tr("They divide the verse. The atnach ֑ marks the middle; silluq marks the last word before ׃. The KJV often has a colon or semicolon where the atnach is.",
          "Împart versetul. Atnah ֑ arată mijlocul; silluq arată ultimul cuvânt dinainte de ׃. Cornilescu pune adesea „;” sau „:” unde este atnah."))),
      ex("בְּרֵאשִׁית בָּרָא אֱלֹהִ֑ים", "be·re·shit ba·ra e·lo·him", tr("the atnach sits under אֱלֹהִים", "atnah stă sub אֱלֹהִים"), "In the beginning God", "La început, Dumnezeu", [0, 1, 1]),
      p(tr("Turn accents off in the reader under View when you only want the vowels. Turn vowels off too when you want to practice reading like a modern Israeli newspaper.",
        "Oprește accentele în cititor din Afișare când vrei doar vocalele. Oprește și vocalele când vrei să exersezi citirea ca într-un ziar israelian de azi.")),
    ],
  },
  {
    title: () => tr("The Divine Name, Ketiv and Qere", "Numele lui Dumnezeu, Ketiv și Qere"),
    body: () => [
      p(tr("The name יהוה is written with the vowels of אֲדֹנָי, Adonai, “my Lord”, as a reminder to say Adonai instead. The KJV follows this and writes “LORD” in small capitals. When written with the vowels of אֱלֹהִים (יֱהֹוִה) it is read Elohim, and the KJV writes “GOD”.",
        "Numele יהוה e scris cu vocalele lui אֲדֹנָי, Adonai, „Domnul meu”, ca semn că se citește Adonai. Cornilescu urmează asta și scrie „Domnul”. Când e scris cu vocalele lui אֱלֹהִים (יֱהֹוִה) se citește Elohim, iar Cornilescu scrie „Dumnezeu”.")),
      p(tr("In a few hundred places the scribes kept the written letters (ketiv) but noted a different reading in the margin (qere). This text follows the qere, like translators do. The word panel shows a reading note when this happens.",
        "În câteva sute de locuri cărturarii au păstrat literele scrise (ketiv), dar au notat pe margine altă citire (qere). Textul acesta urmează qere, cum fac traducătorii. Panoul cuvântului arată o notă de citire când se întâmplă asta.")),
      p(tr("In Settings, Audio you can choose whether the audio says Adonai or Yahweh.", "În Setări, Sunet poți alege dacă se citește Adonai sau Yahweh.")),
    ],
  },
  {
    title: () => tr("Aramaic in the Old Testament", "Aramaica din Vechiul Testament"),
    body: () => [
      p(tr("A few parts of the Old Testament are written in Aramaic, a sister language of Hebrew with the same alphabet: Daniel 2:4 to 7:28, Ezra 4:8 to 6:18 and 7:12 to 26, Jeremiah 10:11, and two words in Genesis 31:47.",
        "Câteva părți din Vechiul Testament sunt scrise în aramaică, o limbă soră cu ebraica, cu același alfabet: Daniel 2:4 până la 7:28, Ezra 4:8 până la 6:18 și 7:12 până la 26, Ieremia 10:11 și două cuvinte în Geneza 31:47.")),
      quote([26, 2, 4], "Then spake the Chaldeans to the king in Syriack, O king, live for ever: tell thy servants the dream, and we will shew the interpretation.",
        "Haldeii au răspuns împăratului în limba aramaică: „Veșnic să trăiești, împărate! Spune robilor tăi visul, și-ți vom arăta tâlcuirea lui!”"),
      p(tr("Aramaic words are marked as Aramaic in the word panel. Many look familiar, but the grammar differs; for example the article comes at the end (מַלְכָּא “the king”).",
        "Cuvintele aramaice sunt marcate ca aramaice în panoul cuvântului. Multe par cunoscute, dar gramatica diferă; de exemplu articolul vine la sfârșit (מַלְכָּא „împăratul”), ca în română.")),
    ],
    search: "^A", searchLabel: () => tr("Aramaic words", "cuvinte aramaice"),
  },
];

export function mount(el) { root = el; }
export function show(params = {}) {
  if (params.lesson !== undefined && LESSONS[params.lesson]) current = params.lesson;
  render();
}

function render() {
  clear(root);
  const done = store.data.path || {};
  const wrap = h("div", { class: "grammar" });
  const list = h("nav", { class: "lesson-list", "aria-label": tr("Lessons", "Lecții") });
  LESSONS.forEach((L, i) => list.append(h("button", { type: "button", class: (i === current ? "on" : "") + (done["grammar:" + i] ? " done" : ""), onclick: () => { current = i; render(); root.scrollTop = 0; } },
    h("span", { class: "n" }, done["grammar:" + i] ? "✓" : String(i + 1)), h("span", null, L.title()))));
  const L = LESSONS[current];
  const lesson = h("article", { class: "lesson" }, h("h1", null, L.title()), ...L.body());
  if (L.search) lesson.append(liveExamples(L));
  const isDone = !!done["grammar:" + current];
  lesson.append(h("div", { class: "row", style: { marginTop: "26px" } },
    h("button", { class: "btn" + (isDone ? " on" : ""), type: "button", onclick: () => {
      if (isDone) delete store.data.path["grammar:" + current]; else store.data.path["grammar:" + current] = Date.now();
      store.changed("path");
      if (!isDone) toast(tr("Lesson marked as done", "Lecție marcată ca terminată"));
      render();
    } }, icon("check"), isDone ? tr("Done", "Terminată") : tr("Mark lesson as done", "Marchează lecția ca terminată"))));
  lesson.append(h("div", { class: "row", style: { marginTop: "18px" } },
    current > 0 ? h("button", { class: "btn", type: "button", onclick: () => { current--; render(); root.scrollTop = 0; } }, icon("left"), LESSONS[current - 1].title()) : null,
    h("div", { class: "spacer" }),
    current < LESSONS.length - 1 ? h("button", { class: "btn primary", type: "button", onclick: () => { current++; render(); root.scrollTop = 0; } }, LESSONS[current + 1].title(), icon("right")) : null));
  // phones: a drop-down instead of the long list of lesson buttons (CSS shows one or the other)
  const sel = h("select", { class: "lesson-select", "aria-label": tr("Lessons", "Lecții"), onchange: (e) => { current = Number(e.target.value); render(); root.scrollTop = 0; } },
    LESSONS.map((L, i) => h("option", { value: i, selected: i === current }, `${i + 1}. ${L.title()}${done["grammar:" + i] ? " ✓" : ""}`)));
  wrap.append(sel, list, lesson);
  root.append(wrap);
}

function liveExamples(L) {
  const box = h("div", { class: "examples-live" });
  const list = h("div");
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea") }, h("option", { value: "" }, tr("Whole Old Testament", "Tot Vechiul Testament")), ctx.books.map(b => h("option", { value: b.idx }, ctx.bookName(b.idx))));
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    clear(list);
    list.append(h("div", { class: "muted small" }, tr("Finding examples…", "Caut exemple…")));
    try {
      const res = await api.get("morphsearch", { re: L.search, limit: 8, book: bookSel.value, t: bible() });
      if (my !== seq) return;
      clear(list);
      if (!res.items.length) list.append(h("div", { class: "muted" }, tr("No examples in this book.", "Nu sunt exemple în această carte.")));
      for (const it of res.items) list.append(occItem(it, (x) => ctx.navigate("read", { b: x.book, c: x.ch, v: x.v, w: x.w })));
    } catch (e) { if (my === seq) { clear(list); list.append(h("div", { class: "muted" }, tr("Could not find examples: ", "Nu am putut găsi exemple: ") + errText(e))); } }
  };
  box.append(h("h2", null, tr("Find it in the Bible", "Găsește în Biblie")),
    h("div", { class: "row", style: { marginBottom: "10px" } }, h("span", { class: "muted" }, tr("Random verses with ", "Versete la întâmplare cu ") + L.searchLabel()), bookSel,
      h("button", { class: "btn", type: "button", onclick: load }, icon("shuffle"), tr("Show examples", "Arată exemple"))), list);
  bookSel.onchange = load;
  return box;
}
