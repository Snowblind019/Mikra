// Settings: language, Bible, script, goals, themes and colors, reading, audio (with download of all audio),
// review, shortcuts, data, sources.

import { store, api, DEFAULT_SETTINGS, errText } from "./store.js";
import { ctx } from "./ctx.js";
import { h, clear, icon, he, toast, modal, fmtInt, trt, systemDark } from "./ui.js";
import { tr, roDe, fmtDec, lang } from "./i18n.js";
import { THEMES, CUSTOMIZABLE, themeById, themeVars, resolveTheme, cleanOverrides } from "./themes.js";
import { translit } from "./hebrew.js";
import { testAudio, browserHebrewVoices, speak } from "./audio.js";

let root;
let pollTimer = null;
let pollGen = 0; // bumped when the download box is rebuilt or the tab is left, so a late reply can't restart polling

export function mount(el) { root = el; }
export function show() { render(); }
export function hide() { stopPoll(); }
export function unmount() { stopPoll(); }

function clearPollTimer() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function stopPoll() { pollGen++; clearPollTimer(); }

function set(key, value, rerender = true) {
  store.setting(key, value);
  if (rerender) render();
}


function render() {
  stopPoll();
  const scroll = root.scrollTop;
  clear(root);
  const s = store.settings;
  const page = h("div", { class: "page" });
  page.append(h("h1", null, tr("Settings", "Setări")));

  // ---------------- language, Bible, script
  page.append(h("h2", null, tr("Language and text", "Limba și textul")));
  const lt = h("div", { class: "settings-grid" });
  lt.append(h("section", null,
    h("div", { class: "field" }, h("span", null, tr("Interface language", "Limba aplicației")),
      h("div", { class: "seg" },
        h("button", { type: "button", class: s.lang === "en" ? "on" : "", onclick: () => switchLang("en") }, "English"),
        h("button", { type: "button", class: s.lang === "ro" ? "on" : "", onclick: () => switchLang("ro") }, "Română"))),
    h("p", { class: "small muted" }, tr("Everything changes language, including the meanings of words and how Hebrew is spelled in Latin letters (English: sh, tz, ch).",
      "Totul trece în limba aleasă, inclusiv înțelesurile cuvintelor și felul în care ebraica e scrisă cu litere latine (română: ș, ț, h).")),
    h("div", { class: "field" }, h("span", null, tr("Bible next to the Hebrew", "Biblia de lângă ebraică")),
      seg(s, "bible", [["kjv", tr("KJV (English)", "KJV (engleză)")], ["ro", tr("Cornilescu (Romanian)", "Cornilescu (română)")]])),
    h("p", { class: "small muted" }, tr("Changing the language also switches the Bible to match. You can still pick the other one here or in the reader.",
      "Când schimbi limba se schimbă și Biblia. Poți alege totuși cealaltă aici sau în cititor."))));
  lt.append(h("section", null,
    h("div", { class: "field" }, h("span", null, tr("Hebrew letters for learning", "Literele ebraice pentru învățat")),
      seg(s, "script", [["print", tr("Print", "Tipar")], ["cursive", tr("Cursive (handwriting)", "De mână (cursiv)")]])),
    h("div", { class: "row", style: { gap: "28px", margin: "6px 0 10px" } },
      h("div", { style: { textAlign: "center" } }, h("div", { class: "he", lang: "he", style: { fontSize: "34px" } }, "שָׁלוֹם"), h("div", { class: "small muted" }, tr("print", "tipar"))),
      h("div", { style: { textAlign: "center" } }, h("div", { class: "he cursive", lang: "he", style: { fontSize: "34px" } }, "שלום"), h("div", { class: "small muted" }, tr("cursive", "de mână")))),
    h("p", { class: "small muted" }, tr("Cursive is how Hebrew is written by hand. It changes the letters in flashcards, games, word lists, the alphabet and grammar. Handwriting has no vowel points, so the pointed print form is shown small underneath where it matters. The Bible text in the reader stays in print. You can also switch with the two buttons at the top right.",
      "Cursivul este felul în care se scrie ebraica de mână. Schimbă literele din cartonașe, jocuri, liste de cuvinte, alfabet și gramatică. Scrisul de mână nu are vocale, așa că forma de tipar cu vocale apare mică dedesubt acolo unde contează. Textul Bibliei din cititor rămâne de tipar. Poți schimba și din cele două butoane din dreapta sus."))));
  page.append(lt);

  // ---------------- daily goal
  page.append(h("h2", null, tr("Daily goal", "Ținta zilnică")));
  page.append(h("div", { class: "row", style: { gap: "24px" } },
    h("label", { class: "field" }, h("span", null, tr("Minutes of study a day", "Minute de studiu pe zi")),
      h("input", { type: "number", min: 0, max: 600, value: s.goalMinutes, style: { width: "110px" }, onchange: (e) => set("goalMinutes", Math.max(0, Math.min(600, Number(e.target.value) || 0))) })),
    h("label", { class: "field" }, h("span", null, tr("Flashcard reviews a day", "Repetări de cartonașe pe zi")),
      h("input", { type: "number", min: 0, max: 2000, value: s.goalReviews, style: { width: "110px" }, onchange: (e) => set("goalReviews", Math.max(0, Math.min(2000, Number(e.target.value) || 0))) }))));
  page.append(h("p", { class: "small muted" }, tr("Study time counts while the app is open and you are using it. The Today tab shows how far you are.",
    "Timpul de studiu se numără cât aplicația e deschisă și o folosești. Fila Azi arată cât ai făcut.")));

  // ---------------- themes
  page.append(h("h2", null, tr("Theme", "Temă")));
  const sysDark = systemDark();
  const active = resolveTheme(s, sysDark);
  const auto = s.theme === "auto";
  page.append(h("div", { class: "row", style: { marginBottom: "12px" } },
    h("div", { class: "seg" },
      h("button", { type: "button", class: auto ? "on" : "", onclick: () => set("theme", "auto") }, tr("Follow my system", "La fel ca sistemul")),
      h("button", { type: "button", class: !auto ? "on" : "", onclick: () => set("theme", active.id) }, tr("Always use one theme", "Mereu aceeași temă"))),
    h("span", { class: "muted small" }, auto
      ? tr(`Light: ${themeName(themeById(s.themeLight))}. Dark: ${themeName(themeById(s.themeDark))}. Your system is in ${sysDark ? "dark" : "light"} mode now.`,
        `Luminoasă: ${themeName(themeById(s.themeLight))}. Întunecată: ${themeName(themeById(s.themeDark))}. Sistemul tău e acum pe ${sysDark ? "întunecat" : "luminos"}.`)
      : trt("Click a theme to use it.", "Apasă pe o temă ca s-o folosești."))));
  const gallery = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" } });
  for (const t of THEMES) {
    const isActive = t.id === active.id;
    const chosen = auto ? (t.dark ? s.themeDark === t.id : s.themeLight === t.id) : s.theme === t.id;
    gallery.append(themeCard(t, isActive, chosen, () => {
      if (auto) store.setting(t.dark ? "themeDark" : "themeLight", t.id);
      else store.setting("theme", t.id);
      render();
    }));
  }
  page.append(gallery);
  if (auto) page.append(h("p", { class: "small muted" }, trt("In this mode a light theme is used when your system is light and a dark theme when it is dark. Click a light theme and a dark theme to choose both.",
    "În acest mod se folosește o temă luminoasă când sistemul e luminos și una întunecată când e întunecat. Apasă pe o temă luminoasă și pe una întunecată ca să le alegi pe amândouă.")));

  const ov = cleanOverrides((s.themeOverrides || {})[active.id]);
  const custom = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px 24px", marginTop: "8px" } });
  const CUSTOM_RO = { paper: "Fundal", surface: "Panouri și cartonașe", ink: "Text", accent: "Accent (butoane, linkuri)", hl: "Evidențierea legăturilor", teal: "Culoarea prefixelor", plum: "Culoarea sufixelor", rubric: "Culoarea numelor" };
  for (const [key, label] of CUSTOMIZABLE) {
    const val = ov[key] || active.c[key];
    const name = tr(label, CUSTOM_RO[key] || label);
    const inp = h("input", { type: "color", value: val, "aria-label": name, style: { width: "44px", height: "30px", border: "1px solid var(--rule)", borderRadius: "6px", padding: "0", background: "none" } });
    inp.addEventListener("input", () => {
      const all = { ...(s.themeOverrides || {}) };
      all[active.id] = { ...(all[active.id] || {}), [key]: inp.value };
      store.setting("themeOverrides", all);
    });
    inp.addEventListener("change", () => render());
    custom.append(h("label", { class: "row", style: { gap: "10px" } }, inp, h("span", null, name, ov[key] ? h("span", { class: "faint small" }, tr("  changed", "  schimbat")) : null)));
  }
  page.append(h("h3", null, tr(`Adjust the colors of ${themeName(active)}`, `Ajustează culorile temei ${themeName(active)}`)), custom,
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("button", { class: "btn small", type: "button", disabled: !Object.keys(ov).length, onclick: () => {
        const all = { ...(s.themeOverrides || {}) }; delete all[active.id]; set("themeOverrides", all);
      } }, tr("Reset to the original colors", "Înapoi la culorile inițiale")),
      h("span", { class: "small muted" }, tr("Changes apply to this theme only and are saved automatically.", "Schimbările se aplică doar acestei teme și se salvează singure."))));

  // ---------------- reading
  page.append(h("h2", null, tr("Reading", "Citire")));
  const grid = h("div", { class: "settings-grid" });
  grid.append(h("section", null,
    h("label", { class: "field" }, h("span", null, tr(`Hebrew size: ${s.heSize}px`, `Mărimea ebraicii: ${s.heSize}px`)), h("input", { type: "range", min: 18, max: 48, value: s.heSize, oninput: (e) => store.setting("heSize", Number(e.target.value)), onchange: () => render() })),
    h("label", { class: "field" }, h("span", null, tr(`Bible text size: ${s.roSize}px`, `Mărimea textului Bibliei: ${s.roSize}px`)), h("input", { type: "range", min: 13, max: 24, value: s.roSize, oninput: (e) => store.setting("roSize", Number(e.target.value)), onchange: () => render() })),
    h("label", { class: "field" }, h("span", null, tr("Hebrew font (print)", "Fontul ebraic (tipar)")), fontSelect(s)),
    h("p", { class: "small muted" }, tr("The built-in font shows every vowel and accent mark. If you install SBL Hebrew, Ezra SIL or Taamey Frank CLM on your computer you can switch to them here.",
      "Fontul inclus arată toate vocalele și accentele. Dacă instalezi pe calculator SBL Hebrew, Ezra SIL sau Taamey Frank CLM, le poți alege aici."))));
  grid.append(h("section", null,
    h("div", { class: "field" }, h("span", null, tr("Transliteration spelling", "Scrierea transliterării")),
      seg(s, "translitStyle", [["auto", tr("Same as the interface", "Ca limba aplicației")], ["en", tr("English (sh, tz, ch)", "Engleză (sh, tz, ch)")], ["ro", tr("Romanian (ș, ț, h)", "Română (ș, ț, h)")]])),
    h("div", { class: "field" }, h("span", null, tr("Stressed syllable", "Silaba accentuată")),
      seg(s, "translitStress", [["bold", tr("Bold", "Îngroșată")], ["caps", tr("CAPITALS", "MAJUSCULE")], ["none", tr("Not marked", "Nemarcată")]])),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.translitDots, onchange: (e) => set("translitDots", e.target.checked) }), h("span", null, tr("Dots between syllables", "Puncte între silabe"))),
    h("div", { class: "field" }, h("span", null, tr("Pronunciation preview", "Exemplu de pronunție")),
      h("div", { style: { fontSize: "18px" }, html: ["be./re.Shit", "ba.Ra'", "'E.lo.Him", "'et", "ha./sha.Ma.yim", "ve./'Et", "ha./'A.retz"].map(x => translit(x, s)).join("  ") }),
      he("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ", "", { print: true })),
    h("p", { class: "small muted" }, tr("“Same as the interface” uses Romanian spelling when the app is in Romanian and English spelling otherwise.",
      "„Ca limba aplicației” folosește scrierea românească când aplicația e în română și scrierea englezească altfel."))));
  page.append(grid);

  // ---------------- audio
  page.append(h("h2", null, tr("Audio", "Sunet")));
  if (onAndroid()) { page.append(phoneAudio(s)); } else {
  const tts = ctx.info.tts || {};
  const voices = browserHebrewVoices();
  const audio = h("div", { class: "settings-grid" });
  audio.append(h("section", null,
    h("div", { class: "field" }, h("span", null, tr("Voice engine", "Motorul vocii")),
      seg(s, "audioEngine", [["auto", tr("Automatic", "Automat")], ["server", tr("Neural voice", "Voce neurală")], ["browser", tr("Browser voice", "Vocea browserului")]])),
    h("div", { class: "field" }, h("span", null, tr("Voice", "Vocea")),
      seg(s, "voice", [["he-IL-AvriNeural", tr("Avri (male)", "Avri (bărbat)")], ["he-IL-HilaNeural", tr("Hila (female)", "Hila (femeie)")]])),
    h("div", { class: "field" }, h("span", null, tr("Slow speed", "Viteza lentă")),
      seg(s, "slowRate", [["-25%", tr("A bit slower", "Puțin mai rar")], ["-35%", tr("Slower", "Mai rar")], ["-50%", tr("Much slower", "Mult mai rar")]])),
    h("div", { class: "field" }, h("span", null, tr("Read the Divine Name יהוה as", "Numele divin יהוה se citește")),
      seg(s, "divineName", [["adonai", tr("Adonai (traditional, like “LORD”)", "Adonai (tradițional, ca „Domnul”)")], ["yahweh", "Yahweh"], ["as-written", tr("As written", "Cum e scris")]])),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.autoplayWord, onchange: (e) => set("autoplayWord", e.target.checked) }), h("span", null, trt("Say each word when I click it", "Citește fiecare cuvânt când apăs pe el", "Say each word when I tap it"))),
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("button", { class: "btn", type: "button", onclick: () => testAudio() }, icon("speaker"), tr("Test audio: שָׁלוֹם", "Probă: שָׁלוֹם")),
      h("button", { class: "btn", type: "button", onclick: () => speak("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ") }, icon("play"), tr("Test a verse", "Probă cu un verset")))));
  audio.append(h("section", null,
    h("p", null, h("b", null, tr("Neural voice: ", "Vocea neurală: ")), tts.ok ? tr("ready. ", "pregătită. ") : tr("not installed. ", "neinstalată. "),
      h("span", { class: "muted" }, tts.ok ? tr("Each word is downloaded the first time it is played, then kept on your computer.", "Fiecare cuvânt se descarcă prima dată când e citit, apoi rămâne pe calculator.")
        : tr("The app uses your browser's Hebrew voice if it has one.", "Aplicația folosește vocea ebraică a browserului, dacă are una."))),
    h("p", null, h("b", null, tr("Browser voices for Hebrew: ", "Voci ebraice în browser: ")), voices.length ? voices.map(v => v.name).join(", ") : tr("none found", "niciuna")),
    !tts.ok ? h("div", { class: "tip", style: { borderLeft: "3px solid var(--gold)", padding: "8px 14px", background: "var(--surface)" } },
      h("div", null, tr("For natural Hebrew audio, install edge-tts once, then restart the app:", "Pentru o pronunție naturală, instalează o dată edge-tts, apoi repornește aplicația:")),
      h("div", { style: { margin: "6px 0" } }, h("b", null, "Linux / WSL: "), h("code", { class: "path" }, "pip install --user edge-tts")),
      h("div", null, h("b", null, "Windows: "), h("code", { class: "path" }, "py -m pip install edge-tts")),
      h("div", { class: "small muted", style: { marginTop: "6px" } }, tr("The run scripts try to do this for you on first start. It uses Microsoft's free online voices.", "Fișierele de pornire (run.sh, run.bat) încearcă să facă asta singure prima dată. Folosește vocile online gratuite de la Microsoft."))) : null));
  page.append(audio);
  page.append(downloadBox(tts.ok));
  }

  // ---------------- review
  page.append(h("h2", null, tr("Review", "Recapitulare")));
  const rv = h("div", { class: "settings-grid" });
  rv.append(h("section", null,
    h("label", { class: "field" }, h("span", null, tr("New cards per day", "Cartonașe noi pe zi")), h("input", { type: "number", min: 0, max: 500, value: s.newPerDay, style: { width: "100px" }, onchange: (e) => set("newPerDay", Math.max(0, Math.min(500, Number(e.target.value) || 0))) })),
    h("label", { class: "field" }, h("span", null, tr("A word counts as known after you remember it for this many days", "Un cuvânt se socotește știut după ce îl ții minte atâtea zile")), h("input", { type: "number", min: 3, max: 365, value: s.autoKnownDays, style: { width: "100px" }, onchange: (e) => set("autoKnownDays", Math.min(365, Math.max(3, Math.round(Number(e.target.value)) || 21))) }))));
  const dir = (k, label, hint) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!s.reviewDirections[k], onchange: (e) => { const d = { ...s.reviewDirections, [k]: e.target.checked }; set("reviewDirections", d); } }), h("span", null, label, h("div", { class: "small muted" }, hint)));
  rv.append(h("section", null, h("div", { class: "field" }, h("span", null, tr("Card directions (one is picked at random each time)", "Felul cartonașelor (se alege unul la întâmplare de fiecare dată)"))),
    dir("recognize", tr("Hebrew to meaning", "Din ebraică în înțeles"), tr("See the Hebrew, remember what it means", "Vezi ebraica, îți amintești ce înseamnă")),
    dir("recall", tr("Meaning to Hebrew", "Din înțeles în ebraică"), tr("See the meaning, remember the Hebrew", "Vezi înțelesul, îți amintești cuvântul ebraic")),
    dir("listen", tr("Listening", "Ascultare"), tr("Hear the word, remember what it means", "Auzi cuvântul, îți amintești ce înseamnă"))));
  page.append(rv);

  // ---------------- shortcuts
  page.append(h("h2", { class: "desktop-only" }, tr("Keyboard shortcuts", "Comenzi rapide de la tastatură")));
  const R = tr("Reader", "Cititor"), V = tr("Review", "Recapitulare");
  const keys = [
    [R, "← →", tr("previous and next word", "cuvântul anterior și următor")], [R, tr("Space", "Spațiu"), tr("play the selected word", "citește cuvântul selectat")],
    [R, "A", tr("add the selected word to review", "adaugă cuvântul selectat la recapitulare")], [R, "K", tr("mark the selected word as known", "marchează cuvântul selectat ca știut")],
    [R, "[ ]", tr("previous and next chapter", "capitolul anterior și următor")], [R, tr("Shift + click", "Shift + clic"), tr("select a phrase", "selectează o expresie")],
    [R, "Esc", tr("close the word panel", "închide panoul cuvântului")], [V, tr("Space or click", "Spațiu sau clic"), tr("show the answer, then Good", "arată răspunsul, apoi Bine")],
    [V, "1 2 3 4", tr("Again, Hard, Good, Easy", "Din nou, Greu, Bine, Ușor")], [V, "P", tr("play the word again", "citește cuvântul din nou")],
    [tr("Anywhere", "Oriunde"), tr("Alt + 1 to 8", "Alt + 1 până la 8"), tr("switch tabs", "schimbă fila")]];
  page.append(h("table", { class: "words-table desktop-only", style: { maxWidth: "640px" } }, h("tbody", null, keys.map(([where, k, what]) =>
    h("tr", null, h("td", { class: "small muted" }, where), h("td", null, h("span", { class: "kbd" }, k)), h("td", null, what))))));

  // ---------------- data
  page.append(h("h2", null, tr("Your data", "Datele tale")));
  const sep = ctx.info.userDir && ctx.info.userDir.includes("\\") ? "\\" : "/";
  if (onAndroid()) page.append(h("p", null, tr("Your cards, notes, known words, saved verses and settings are saved inside the app on this phone. A copy is kept each day (the last 14 days), and before a backup is restored or all progress is deleted a copy is also saved in your Downloads folder. ",
    "Cartonașele, notițele, cuvintele știute, versetele salvate și setările sunt salvate în aplicație, pe acest telefon. Câte o copie pe zi se păstrează (ultimele 14 zile), iar înainte de fiecare restaurare sau ștergere a progresului se salvează și o copie în dosarul Descărcări. "),
    h("b", null, tr("Uninstalling the app deletes them, so first make a backup in My words (Back up everything). It goes to your Downloads folder.",
      "Dezinstalarea aplicației le șterge, așa că fă întâi o copie în Cuvintele mele (Fă o copie de siguranță). Ajunge în dosarul Descărcări."))));
  else page.append(h("p", null, tr("Your cards, notes, known words, saved verses and settings are saved in ", "Cartonașele, notițele, cuvintele știute, versetele salvate și setările sunt salvate în "),
    h("code", { class: "path" }, (ctx.info.userDir || "") + sep + "userdata.json"),
    tr(". A copy is kept each day in the backups folder next to it (the last 14 days), plus one before a backup is restored or all progress is deleted.",
      ". Câte o copie pe zi rămâne în dosarul backups de lângă el (ultimele 14 zile), plus o copie înainte de fiecare restaurare sau ștergere a progresului.")));
  page.append(h("div", { class: "row" },
    h("button", { class: "btn", type: "button", onclick: () => ctx.navigate("words") }, tr("Back up or restore in My words", "Copie sau restaurare în Cuvintele mele")),
    h("button", { class: "btn", type: "button", onclick: () => modal(tr("Reset settings?", "Resetezi setările?"), h("p", null, tr("Your cards and notes stay. Only settings go back to the defaults.", "Cartonașele și notițele rămân. Doar setările revin la cele inițiale.")), [
      { label: tr("Cancel", "Renunță") }, { label: tr("Reset settings", "Resetează setările"), primary: true, onClick: () => {
        const keep = { lang: s.lang, bible: s.bible };
        Object.assign(store.data.settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), keep);
        store.changed("restore"); // rebuilds every tab and keeps the Bible (a "lang" change would reset it to match the language)
        toast(tr("Settings reset", "Setările au fost resetate"));
      } }]) }, tr("Reset settings", "Resetează setările")),
    h("button", { class: "btn", type: "button", onclick: () => modal(tr("Delete all progress?", "Ștergi tot progresul?"), h("p", null, onAndroid()
      ? tr("This deletes every card, note, known word, saved verse and link fix. A copy of your current data is saved in your Downloads folder first.",
        "Se șterg toate cartonașele, notițele, cuvintele știute, versetele salvate și corecturile de legături. Înainte, o copie a datelor de acum se salvează în dosarul Descărcări.")
      : tr("This deletes every card, note, known word, saved verse and link fix. A copy of your current data is kept in the backups folder first.",
        "Se șterg toate cartonașele, notițele, cuvintele știute, versetele salvate și corecturile de legături. Înainte, o copie a datelor de acum se păstrează în dosarul backups.")), [
      { label: tr("Cancel", "Renunță") }, { label: tr("Delete everything", "Șterge tot"), primary: true, onClick: async () => {
        if (!(await store.safetyCopy("delete-all"))) { toast(tr("Could not keep a copy of your current data, so nothing was deleted.", "Nu s-a putut păstra o copie a datelor de acum, așa că nu s-a șters nimic."), 5000); return; }
        store.replaceAll({ settings: store.data.settings });
        store.changed("restore");
        toast(tr("All progress deleted", "Tot progresul a fost șters"));
      } }]) }, tr("Delete all progress", "Șterge tot progresul"))));

  // ---------------- credits
  page.append(h("h2", null, tr("Sources", "Surse")));
  page.append(h("ul", { class: "small", style: { lineHeight: "1.7" } },
    h("li", null, tr("Hebrew text, word tags, transliteration and grammar: Translators Amalgamated Hebrew OT (TAHOT), STEPBible.org and Tyndale House, CC BY 4.0, based on the Westminster Leningrad Codex.",
      "Textul ebraic, etichetele cuvintelor, transliterarea și gramatica: Translators Amalgamated Hebrew OT (TAHOT), STEPBible.org și Tyndale House, CC BY 4.0, după Westminster Leningrad Codex.")),
    h("li", null, tr("Dictionary: TBESH (abridged Brown-Driver-Briggs) and TEHMC morphology explanations, STEPBible.org, CC BY 4.0.", "Dicționarul: TBESH (Brown-Driver-Briggs prescurtat) și explicațiile TEHMC, STEPBible.org, CC BY 4.0.")),
    h("li", null, tr("Roots and word families: OpenScriptures Hebrew Lexicon, CC BY 4.0; BDB and Strong's are public domain.", "Rădăcinile și familiile de cuvinte: OpenScriptures Hebrew Lexicon, CC BY 4.0; BDB și Strong sunt domeniu public.")),
    h("li", null, tr("King James Version with Strong's numbers: CrossWire Bible Society and eBible.org (engKJV2006eb), public domain.", "King James Version cu numere Strong: CrossWire Bible Society și eBible.org (engKJV2006eb), domeniu public.")),
    h("li", null, tr("Romanian: Cornilescu, Romanian Corrected Cornilescu Version (public domain), via eBible.org and open-bibles.", "Româna: Cornilescu, Romanian Corrected Cornilescu Version (domeniu public), prin eBible.org și open-bibles.")),
    h("li", null, tr("Romanian meanings: the 1,000 most common words written by hand, the rest from how Cornilescu translates each word.", "Înțelesurile în română: cele mai folosite 1.000 de cuvinte scrise de mână, restul după cum traduce Cornilescu fiecare cuvânt.")),
    h("li", null, tr("Word links: KJV from its Strong's numbers; Cornilescu computed with the eflomal aligner. Your fixes override both.", "Legăturile dintre cuvinte: KJV după numerele Strong; Cornilescu calculat cu programul eflomal. Corecturile tale le înlocuiesc.")),
    h("li", null, tr("Fonts: Noto Serif Hebrew and Literata (SIL Open Font License); Ktav Yad CLM cursive by Maxim Iorsh, Culmus project (GNU GPL 2).", "Fonturi: Noto Serif Hebrew și Literata (SIL Open Font License); scrisul de mână Ktav Yad CLM de Maxim Iorsh, proiectul Culmus (GNU GPL 2).")),
    h("li", null, tr(`Database built ${ctx.info.built || ""}.`, `Baza de date construită la ${ctx.info.built || ""}.`))));
  root.append(page);
  root.scrollTop = scroll;
}

function switchLang(v) {
  if (store.settings.lang === v) return;
  store.setting("lang", v); // app.js switches the Bible to match and rebuilds every tab in the new language
}

function themeName(t) {
  const RO = { stone: "Piatră", voronet: "Albastru de Voroneț", parchment: "Pergament", galilee: "Galileea", olive: "Livada de măslini",
    contrast: "Contrast mare", "lapis-night": "Noapte de lapis", lamplight: "Lumina lămpii", cedar: "Noapte de cedru", midnight: "Miezul nopții" };
  return tr(t.name, RO[t.id] || t.name);
}

function seg(s, key, opts) {
  return h("div", { class: "seg", style: { flexWrap: "wrap" } }, opts.map(([v, l]) => h("button", { type: "button", class: s[key] === v ? "on" : "", onclick: () => set(key, v) }, l)));
}

function fontSelect(s) {
  const fonts = [["", tr("Automatic (SBL Hebrew if installed, else built-in)", "Automat (SBL Hebrew dacă e instalat, altfel cel inclus)")], ["Noto Serif Hebrew Local", tr("Built-in: Noto Serif Hebrew", "Inclus: Noto Serif Hebrew")],
    ["SBL Hebrew", "SBL Hebrew"], ["Ezra SIL", "Ezra SIL"], ["Taamey Frank CLM", "Taamey Frank CLM"], ["Frank Ruehl CLM", "Frank Ruehl CLM"], ["David", "David (Windows)"], ["Times New Roman", "Times New Roman"]];
  return h("select", { onchange: (e) => set("heFont", e.target.value) }, fonts.map(([v, l]) => h("option", { value: v, selected: s.heFont === v }, l)));
}

function themeCard(t, isActive, chosen, onPick) {
  const { vars } = themeVars(t, (store.settings.themeOverrides || {})[t.id] || {});
  const v = (k) => vars[k];
  const THEME_ABOUT_RO = { stone: "Hârtie rece, cerneală albastru-închis, legături aurii", voronet: "Albastrul mănăstirilor pictate, cu ocru", parchment: "Hârtie caldă de sul, cerneală maro și titluri roșii",
    galilee: "Turcoazul apei de lac, cu o lumină de soare", olive: "Frunze gri-verzi și lemn de măslin", contrast: "Negru pe alb, cel mai ușor de citit",
    "lapis-night": "Noapte albastră adâncă, cu auriu", lamplight: "Lumină caldă de seară, odihnitoare pentru ochi", cedar: "Verde închis de cedru, cu auriu blând", midnight: "Negru adevărat, bun pentru ecrane OLED" };
  const card = h("button", { type: "button", onclick: onPick, "aria-pressed": String(chosen),
    style: { textAlign: "left", cursor: "pointer", border: `2px solid ${chosen ? "var(--lapis)" : "var(--rule)"}`, borderRadius: "12px", padding: "0", overflow: "hidden", background: v("--paper"), color: v("--ink") } },
    h("div", { style: { padding: "12px 14px 10px", background: v("--paper") } },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" } },
        h("span", { style: { fontSize: "14px", color: v("--ink-soft") } }, tr("In the ", "La "), h("span", { style: { background: v("--gold-wash"), boxShadow: `0 2px 0 ${v("--gold")}`, color: v("--ink") } }, tr("beginning", "început"))),
        h("span", { lang: "he", style: { fontFamily: "var(--he-font)", fontSize: "24px", direction: "rtl" } },
          h("span", { style: { color: v("--teal") } }, "בְּ"), h("span", { style: { background: v("--gold-wash"), boxShadow: `0 2px 0 ${v("--gold")}` } }, "רֵאשִׁית"))),
      h("div", { style: { display: "flex", gap: "5px", marginTop: "10px" } },
        ...["--paper-2", "--surface", "--lapis", "--teal", "--plum", "--rubric"].map(k => h("i", { style: { width: "18px", height: "18px", borderRadius: "5px", background: v(k), border: `1px solid ${v("--rule")}` } })))),
    h("div", { style: { padding: "8px 14px", background: v("--surface"), borderTop: `1px solid ${v("--rule")}` } },
      h("div", { style: { fontWeight: "620", fontSize: "14.5px" } }, themeName(t), chosen ? h("span", { style: { color: v("--lapis"), fontWeight: "500" } }, isActive ? tr(", in use", ", folosită") : tr(", chosen", ", aleasă")) : null),
      h("div", { style: { fontSize: "12.5px", color: v("--ink-soft") } }, (t.dark ? tr("Dark. ", "Întunecată. ") : tr("Light. ", "Luminoasă. ")) + tr(t.about, THEME_ABOUT_RO[t.id] || t.about))));
  return card;
}

// ------------------------------------------------------------------ audio on the phone

function onAndroid() { return ctx.info.platform === "Android"; }

// The phone app speaks with Android's own text-to-speech, which needs a Hebrew voice installed on the phone.
function phoneAudio(s) {
  const wrap = h("div", { class: "settings-grid" });
  wrap.append(h("section", null,
    h("div", { class: "field" }, h("span", null, tr("Slow speed", "Viteza lentă")),
      seg(s, "slowRate", [["-25%", tr("A bit slower", "Puțin mai rar")], ["-35%", tr("Slower", "Mai rar")], ["-50%", tr("Much slower", "Mult mai rar")]])),
    h("div", { class: "field" }, h("span", null, tr("Read the Divine Name יהוה as", "Numele divin יהוה se citește")),
      seg(s, "divineName", [["adonai", tr("Adonai (traditional, like “LORD”)", "Adonai (tradițional, ca „Domnul”)")], ["yahweh", "Yahweh"], ["as-written", tr("As written", "Cum e scris")]])),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.autoplayWord, onchange: (e) => set("autoplayWord", e.target.checked) }), h("span", null, trt("Say each word when I click it", "Citește fiecare cuvânt când apăs pe el", "Say each word when I tap it"))),
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("button", { class: "btn", type: "button", onclick: () => testAudio() }, icon("speaker"), tr("Test audio: שָׁלוֹם", "Probă: שָׁלוֹם")),
      h("button", { class: "btn", type: "button", onclick: () => speak("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ") }, icon("play"), tr("Test a verse", "Probă cu un verset")))));
  const state = h("p", null, tr("Checking the phone's voice…", "Se verifică vocea telefonului…"));
  const help = h("div");
  wrap.append(h("section", null, state, help));
  const bridge = window.MikraAndroid;
  const show = (t) => {
    clear(help);
    const engine = t.engineLabel ? ` (${t.engineLabel})` : "";
    if (t.ok) {
      state.replaceChildren(h("b", null, tr("Phone voice: ", "Vocea telefonului: ")), tr("ready", "pregătită") + engine + ".");
      help.append(h("p", { class: "small muted" }, tr("Hebrew is read by your phone's text-to-speech. It works without internet once the voice is installed.",
        "Ebraica e citită de sinteza vocală a telefonului. Merge fără internet după ce vocea e instalată.")));
    } else if (t.state === "starting") {
      state.replaceChildren(h("b", null, tr("Phone voice: ", "Vocea telefonului: ")), tr("starting…", "pornește…"));
      setTimeout(() => { if (help.isConnected) refresh(); }, 1500);
    } else {
      state.replaceChildren(h("b", null, tr("Phone voice: ", "Vocea telefonului: ")), (t.state === "missing-data" ? tr("the Hebrew voice is not downloaded yet", "vocea ebraică nu e descărcată încă") : tr("no Hebrew voice found", "nu s-a găsit o voce ebraică")) + engine + ".");
      help.append(h("div", { class: "tip", style: { borderLeft: "3px solid var(--gold)", padding: "8px 14px", background: "var(--surface)" } },
        h("div", null, tr("To hear the Hebrew, install a Hebrew voice once:", "Ca să auzi ebraica, instalează o dată o voce ebraică:")),
        h("ol", { style: { margin: "6px 0", paddingLeft: "20px", lineHeight: "1.6" } },
          h("li", null, tr("Open the phone's Settings and search for “Text-to-speech”.", "Deschide Setările telefonului și caută „Text în vorbire” (sau „Text-to-speech”).")),
          h("li", null, tr("As the preferred engine choose “Speech Services by Google” (install it from the Play Store if it is missing).", "Ca motor preferat alege „Serviciile vocale Google” (instalează-l din Magazin Play dacă lipsește).")),
          h("li", null, tr("Tap the gear next to it, then Install voice data, and download Hebrew.", "Apasă pe rotița de lângă el, apoi Instalează date vocale, și descarcă ebraica.")),
          h("li", null, tr("Come back here and tap Check again.", "Revino aici și apasă Verifică din nou."))),
        h("div", { class: "row" },
          bridge && bridge.openTtsSettings ? h("button", { class: "btn", type: "button", onclick: () => bridge.openTtsSettings() }, tr("Open text-to-speech settings", "Deschide setările vocii")) : null,
          h("button", { class: "btn", type: "button", onclick: () => { if (bridge && bridge.restartTts) bridge.restartTts(); state.textContent = tr("Checking the phone's voice…", "Se verifică vocea telefonului…"); setTimeout(refresh, 1800); } }, tr("Check again", "Verifică din nou")))));
    }
  };
  const refresh = () => api.get("audio/status").then(st => { if (help.isConnected) show(st.tts || {}); }).catch(() => {});
  refresh();
  return wrap;
}

// ------------------------------------------------------------------ download all audio

function fmtSize(bytes) {
  if (bytes > 1e9) return fmtDec(bytes / 1e9, 1) + " GB";
  if (bytes > 1e6) return Math.round(bytes / 1e6) + " MB";
  return Math.round(bytes / 1e3) + " KB";
}

function downloadBox(ready) {
  const box = h("div", { class: "download-box" });
  box.append(h("h3", null, tr("Download audio ahead of time", "Descarcă sunetul dinainte")));
  box.append(h("p", { class: "small muted" }, tr(
    "Normally each word is downloaded the first time you play it. Here you can download everything at once, so it plays instantly and works offline. It runs in the background; you can keep using the app.",
    "De obicei fiecare cuvânt se descarcă prima dată când îl asculți. Aici poți descărca totul dintr-odată, ca să pornească imediat și să meargă fără internet. Merge în fundal; poți folosi aplicația între timp.")));
  if (!ready) {
    box.append(h("p", { class: "small" }, tr("Install edge-tts first (see above), then restart the app.", "Instalează întâi edge-tts (vezi mai sus), apoi repornește aplicația.")));
    return box;
  }
  const scopeSel = h("select", { "aria-label": tr("What to download", "Ce descarci") });
  const bookSel = h("select", { "aria-label": tr("Book", "Cartea"), hidden: true }, ctx.books.map(b => h("option", { value: b.idx }, ctx.bookName(b.idx))));
  const slow = h("input", { type: "checkbox" });
  const startBtn = h("button", { class: "btn primary", type: "button" }, icon("download"), tr("Download", "Descarcă"));
  const cancelBtn = h("button", { class: "btn", type: "button", hidden: true }, tr("Cancel", "Oprește"));
  const clearBtn = h("button", { class: "btn small ghost", type: "button" }, tr("Delete downloaded audio", "Șterge sunetul descărcat"));
  const bar = h("div", { class: "meter", style: { maxWidth: "460px", margin: "10px 0 4px" }, hidden: true }, h("i", { style: { width: "0%" } }));
  const status = h("div", { class: "small muted" });
  const cacheLine = h("div", { class: "small muted", style: { marginTop: "6px" } });
  box.append(h("div", { class: "row" }, scopeSel, bookSel, h("label", { class: "check", style: { margin: 0 } }, slow, h("span", null, tr("also the slow versions", "și variantele lente"))), startBtn, cancelBtn),
    bar, status, h("div", { class: "row" }, cacheLine, clearBtn));

  api.get("audio/counts").then(c => {
    const opt = (v, label) => h("option", { value: v }, label);
    scopeSel.append(
      opt("words", tr(`All dictionary words (${fmtInt(c.words)} clips, about ${Math.round(c.words * 6 / 1000)} MB)`, `Toate cuvintele din dicționar (${fmtInt(c.words)} ${roDe(c.words)}clipuri, cam ${Math.round(c.words * 6 / 1000)} MB)`)),
      opt("forms", tr(`Every word form in the Bible (${fmtInt(c.forms)} clips, about ${Math.round(c.forms * 7 / 1000)} MB)`, `Toate formele cuvintelor din Biblie (${fmtInt(c.forms)} ${roDe(c.forms)}clipuri, cam ${Math.round(c.forms * 7 / 1000)} MB)`)),
      opt("book", tr("Every verse of one book", "Toate versetele unei cărți")));
    scopeSel.onchange = () => { bookSel.hidden = scopeSel.value !== "book"; };
    bookSel.onchange = () => { const n = c.verses[Number(bookSel.value)] || 0; status.textContent = tr(`${fmtInt(n)} verses`, `${fmtInt(n)} ${roDe(n)}versete`); };
  }).catch(() => {});

  const show = (st) => {
    const running = st.running;
    startBtn.hidden = running; cancelBtn.hidden = !running;
    scopeSel.disabled = running; bookSel.disabled = running;
    bar.hidden = !(running || st.total);
    const n = st.done + st.failed;
    if (st.total) bar.firstChild.style.width = Math.round((n / st.total) * 100) + "%";
    if (running) {
      const el = (Date.now() / 1000 - st.started);
      const rate = n / Math.max(1, el);
      const left = rate > 0 ? Math.round((st.total - n) / rate / 60) : 0;
      status.textContent = tr(`Downloading: ${fmtInt(n)} of ${fmtInt(st.total)}${st.failed ? `, ${fmtInt(st.failed)} failed` : ""}. About ${left === 1 ? "1 minute" : `${left} minutes`} left.`,
        `Se descarcă: ${fmtInt(n)} din ${fmtInt(st.total)}${st.failed ? `, ${fmtInt(st.failed)} nereușite` : ""}. Mai ${left === 1 ? "e cam un minut" : `sunt cam ${left} ${roDe(left)}minute`}.`);
    } else if (st.total) {
      status.textContent = st.cancel ? tr(`Stopped after ${fmtInt(n)} of ${fmtInt(st.total)}.`, `Oprit după ${fmtInt(n)} din ${fmtInt(st.total)}.`)
        : tr(`Finished: ${fmtInt(st.done)} ready${st.failed ? `, ${fmtInt(st.failed)} failed (${st.error})` : ""}.`, `Gata: ${fmtInt(st.done)} pregătite${st.failed ? `, ${fmtInt(st.failed)} nereușite (${st.error})` : ""}.`);
    }
    if (st.cacheFiles !== undefined) cacheLine.textContent = tr(`Audio on this computer: ${fmtInt(st.cacheFiles)} clips, ${fmtSize(st.cacheBytes)}.`, `Sunet pe acest calculator: ${fmtInt(st.cacheFiles)} ${st.cacheFiles === 1 ? "clip" : roDe(st.cacheFiles) + "clipuri"}, ${fmtSize(st.cacheBytes)}.`);
  };
  const gen = pollGen;
  const current = () => gen === pollGen && box.isConnected; // this box is still the one on screen
  const poll = async (withCache) => {
    try {
      const st = await api.get("audio/status", withCache ? { cache: 1 } : {});
      if (!current()) return;
      show(st);
      if (st.running && !pollTimer) pollTimer = setInterval(() => poll(false), 1500);
      if (!st.running && pollTimer) { clearPollTimer(); poll(true); }
    } catch (_) { if (current()) clearPollTimer(); }
  };
  startBtn.onclick = async () => {
    const s = store.settings;
    try {
      const st = await api.post("audio/prefetch", { scope: scopeSel.value, book: Number(bookSel.value), voice: s.voice, slow: slow.checked, slowRate: s.slowRate, divineName: s.divineName });
      if (!current()) return;
      show(st);
      if (!pollTimer) pollTimer = setInterval(() => poll(false), 1500);
    } catch (e) { toast(errText(e)); }
  };
  cancelBtn.onclick = async () => { try { await api.post("audio/cancel", {}); } catch (_) { /* ignore */ } };
  clearBtn.onclick = () => modal(tr("Delete downloaded audio?", "Ștergi sunetul descărcat?"), h("p", null, tr("The clips will be downloaded again when you play them.", "Clipurile se vor descărca din nou când le asculți.")), [
    { label: tr("Cancel", "Renunță") },
    { label: tr("Delete", "Șterge"), primary: true, onClick: async () => { try { await api.post("audio/clear", {}); poll(true); } catch (e) { toast(errText(e)); } } }]);
  poll(true);
  return box;
}
