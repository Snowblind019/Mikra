# Mikra

Learn Biblical Hebrew by reading the Hebrew Old Testament next to the King James Version or the Romanian Cornilescu Bible.

*Mikra* (מִקְרָא) means "reading". It is also an old Hebrew name for the Scriptures.

Hover a word on either side and its match lights up on the other side. Click a Hebrew word to see:
- what it means and how it is pronounced
- how it is built (prefixes, root, endings)
- its root and related words
- every form of it in the Bible
- how the KJV and Cornilescu translate it
- every verse it appears in

Learn with flashcards (spaced repetition), ready-made word decks, practice games (including parsing verbs and reading prefixes and endings), a word-by-word breakdown of any verse, the alphabet in print and handwriting, typing practice, a 64-lesson grammar course with quizzes on real verses, and saved verses you learn by heart and repeat on a schedule.

The whole app works in **English or Romanian**. Switch in Settings or from the top bar.

Everything runs on your own computer or phone. Nothing needs an account.

It works on phones too: there is an Android app (see [Android](#android)), and on a small screen the layout changes to one column with the sections in a bar at the bottom.

## Starting it

You need Python 3.8 or newer. Nothing else is required.

### Linux (Fedora, Ubuntu, etc.)

```bash
cd mikra
chmod +x run.sh install-shortcut.sh
./run.sh
```

To add it to your app menu: `./install-shortcut.sh`

### Windows

Double-click `run.bat`. If Python is missing, install it from python.org and tick "Add python.exe to PATH".

To put an icon on the desktop: double-click `Create Desktop Shortcut.bat`.

### WSL

Run `./run.sh` inside WSL. The app opens in Microsoft Edge on the Windows side. If no window appears, open the link the terminal prints (it starts with http://localhost:8723/__start) in any Windows browser.

### The window

If Chrome, Chromium, Brave or Edge is installed, the app opens in its own window without browser tabs. Otherwise it opens in your default browser (Firefox works fine).

Closing the terminal or pressing Ctrl+C stops it. Starting it again while it is already running opens another window on the running copy.

Options:
- `--no-browser`: just start the server
- `--port 8800`: use another port
- `--window browser`: always use a normal browser tab

The app only answers requests from this computer and from its own page. Other websites open in the same browser can't read or change your progress.

Your progress also needs a key, which the browser keeps as a cookie. The launcher opens the window with a one-time start link that gets it the key, and the terminal prints a link with the key itself (`http://localhost:8723/__start?t=...`) for opening Mikra by hand. Other programs and other user accounts on the computer can reach the app's address too, but without the key they only get its public files, never your progress. If a browser shows "Open Mikra from its shortcut", start Mikra with its shortcut or `run.sh` / `run.bat`, or open the link the terminal printed.

## Android

The Android app is the same app in a phone window: same tabs, same data format, same backups. It needs Android 7 or newer and works offline. The one exception is the Hebrew voice: Mikra prefers a voice installed on the phone, but if the only Hebrew voice is an online one, the words it reads aloud go to that voice's service.

### Installing

1. Copy `Mikra.apk` to the phone (or download it on the phone).
2. Open it from the Files app (on Samsung: My Files, Downloads).
3. Android asks to allow installing apps from that source. Allow it, go back and tap Install.
4. If Play Protect warns that it doesn't know the app, choose to install anyway. This happens with any app that doesn't come from the Play Store.

The first start takes a few seconds while the Bible text is unpacked.

### Hebrew audio on the phone

The phone reads the Hebrew with its own text-to-speech, so a Hebrew voice has to be installed once:
1. Open the phone's Settings and search for "Text-to-speech".
2. As the preferred engine choose Speech Services by Google (install it from the Play Store if it is missing). Samsung's own engine usually has no Hebrew.
3. Tap the gear next to it, then Install voice data, and download Hebrew.

Settings, Audio in Mikra shows whether a Hebrew voice was found and has a button that opens these settings. The Microsoft voices of the desktop version are not used on the phone, so the voice sounds different.

### Your progress on the phone

Progress is saved inside the app, with a copy each day. **Uninstalling the app deletes it**, so before you uninstall (or move to a new phone), use My words, Back up everything. (If the phone's own Android backup is turned on, it also keeps a copy of your progress, and only that, but don't count on it.) The file goes to the Downloads folder. Restore backup in My words reads it back, on the phone or on a computer: the file is the same on both.

Updates install over the old version and keep your progress, as long as they are signed with the same key (see below).

### Building the APK

No Android Studio is needed. On Debian or Ubuntu:

```bash
sudo apt install default-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
./android/build-apk.sh
```

The result is `android/build/Mikra.apk`. The first build creates the signing key `android/mikra-release.keystore` with its password in `android/mikra-release.keystore.txt`. Keep both safe and private. Every later version must be signed with the same key, otherwise the phone refuses the update and the app has to be uninstalled first. Neither file is committed.

How it works: the APK holds the `web/` folder and the database. A small Java server inside the app (`android/src`, a line-by-line port of `app/server.py`) answers the page on 127.0.0.1. A secret cookie that only the app's own window gets keeps other apps on the phone away from your data. `android/desktop` has a test harness that runs the same Java server on a computer, so the browser tests can check it against the Python server.

## Language, Bible and script

- **Interface language:** English or Romanian. Everything follows the language: menus, lessons, word meanings, and how Hebrew is spelled in Latin letters (English sh, tz, ch; Romanian ș, ț, h).
- **Transliteration spelling:** Settings, Reading can set the Latin spelling of Hebrew apart from the language. It covers every Hebrew word in the app, also inside English text: the pronunciation lines, letter and vowel names, grammar terms and the words quoted in the lessons. Romanian spelling writes Hebrew the way Romanian Bibles and books do: ș, ț, h, f, k, i, v, gh before e and i, and no h for a silent ה at the end of a word (to·ra, Iahve). So the letters are Kuf, Țadi, Het, Șin, the stems Kal, Nifal, Hifil, Hitpael, and נֶפֶשׁ is ne·feș.
- **Bible next to the Hebrew:** the KJV or Cornilescu. It switches to match the language, and you can still pick the other one with the KJV / Cornilescu buttons in the reader.
  - KJV words are linked to the Hebrew through the Strong's numbers in the KJV text.
  - The words the KJV translators added are in italics, as in a printed KJV.
- **Print or cursive:** the two buttons at the top right switch all the learning parts of the app between print Hebrew and handwritten (cursive) Hebrew. That covers flashcards, games, word lists, the alphabet, grammar and the word panel.
  - Handwriting has no vowel points, so the pointed print form is shown small underneath where you need it.
  - The Bible text in the reader always stays in print.

Romanian meanings: the 1,000 most common words have meanings written by hand. Every other word uses the way Cornilescu translates it. The English dictionaries (Brown-Driver-Briggs and Strong's) stay in English and are folded away in Romanian mode.

## What is in each tab

**Today:**
- your daily goal (minutes of study and flashcard reviews)
- where to continue reading
- reviews due
- a word of the day
- the next grammar lesson, and the saved verses to repeat today
- the easiest chapters for you
- a "Start here" path from the alphabet to reading and memorizing, which ticks itself off as you go

**Read:**
- The Bible on the left, Hebrew on the right, verse by verse.
- Hover to see links; click a Hebrew word for the full word study. Shift+click a second word to select a phrase.
- The View menu:
  - turns accents and vowels on or off
  - adds pronunciation and meaning under each word (all words, or only the words you don't know yet)
  - colors prefixes, endings, names and verbs
  - can blur or hide the translation so you test yourself
- Each verse has buttons to:
  - listen, or listen slowly
  - play it word by word with highlighting, to read along and repeat
  - take it apart: every word split into its prefixes, main word and endings, with what each part means, its grammar, its sound and its meaning in the verse, plus a button that adds the verse's new words to review
  - save it to learn by heart
  - fix the word links
  - copy it
- Under each chapter is its word list, most useful words first, with a button to practise those words right away.
- In the word panel, "Root and related words" can add the whole word family to review at once.

**Review:**
- Flashcards scheduled with FSRS spaced repetition (Again, Hard, Good, Easy). Click the card to see the answer.
- **Hint** (or H) before the answer gives a little help, one step at a time: the sound, then the verse with the word's translation left out (Hebrew → meaning); the first letter and how many letters follow, then the sound (meaning → Hebrew); the written word (listening).
- The answer side has your note for the word, which you can write or change right there. A word forgotten four times or more is marked "Tricky word", and its note opens with a tip to write a memory hook.
- Under Start review you choose what the flashcards ask: Hebrew → meaning, meaning → Hebrew, listening, or any mix (they take turns). New cards always start Hebrew → meaning.
- A study day runs from 4 a.m. to 4 a.m., as in Anki. A session that goes past midnight still counts as that evening, and cards you grade late in the evening come back the next day, not a few minutes later.
- **Word decks** to add many words at once. New cards come in a few each day (Settings, Review). The decks:
  - the 100, 500, 1,000 and 2,000 most common words
  - every word used 10+ times
  - names
  - all the words of one book
- Practice games that don't change the schedule: pick the meaning, listening, hear and repeat, spelling, words in their verse, matching pairs, free flipping, and two that teach reading the forms:
  - **Parse the verb**: a verb form from the Bible, and you choose its stem, tense and person. The wrong answers each change one thing (the person, the tense or the stem), so you learn to look at each part. The answer explains the form and links to its grammar lesson and its verse.
  - **Prefixes and endings**: a word from the chapter you read last with one part marked (וְ, הַ, בְּ, ־וֹ, ־ָם…), and you choose what it means. The answer shows the whole word part by part.
- Practice words can also come from **My hardest words**: the cards you forgot most often.
- At the end of a game, the words you missed are listed, to add to review or to practise again on their own.
- “Show first” picks what Pick the meaning and Flip through cards show: only the Hebrew (you find the meaning), only the meaning (you find the Hebrew), or both taking turns.
- After you answer, the answer stays on screen. Click anywhere (or press Space) to go on.

**My words:**
- every card and known word, with search, pause, reset, delete
- export to Anki, and backup and restore
- **Saved verses** with a memorizing mode that hides more of the verse as you learn it, and **Build it**, where you put the verse together from its shuffled words
- A verse you have learned comes back on the flashcard schedule (Repeat the verses that are due), so it stays learned
- a filter for tricky cards (forgotten four times or more)

**Alphabet:**
- all letters in print and handwriting, with sounds compared to English or Romanian, Bible examples, look-alikes and number values
- vowels, other marks, a syllable builder
- writing practice
- **Keyboard**: the Israeli layout and a typing drill
- drills, including print versus cursive; in each drill, “Show” picks which side the questions show (the letter or its name, the letter or its sound, handwritten or print, the Hebrew word or its meaning, or both taking turns)

**Grammar:** a course of 64 lessons in six parts, from beginner to advanced:
- *Getting started:* how a word is built, reading a verse step by step, the vowel signs, shva and dagesh, the prefixes, the article, the object marker, the small words you see everywhere.
- *Nouns and the words around them:* gender and number, noun patterns, how nouns change with endings, the construct chain, pronoun endings, adjectives, pronouns, demonstratives, prepositions, numbers, questions, negation.
- *The verb:* stems, perfect and imperfect, wayyiqtol, weqatal, commands and wishes, infinitives and participles, object endings, stative verbs, then Niphal, Piel and Pual, Hiphil and Hophal, Hithpael and the rare stems, each in its own lesson, and full charts for every stem.
- *Weak verbs:* gutturals, verbs ending in א, starting with נ or י, hollow verbs, verbs ending in ה, doubled verbs, and a table of the 25 most common verbs with their real forms.
- *Building sentences:* verbless sentences, word order, אֲשֶׁר, the many jobs of כִּי, “to have”, time expressions, the infinitive and the participle in use, conditions, purpose, oaths and emphasis, direct speech, the directional ending.
- *Reading the text:* accents, pausal forms, poetry, the Divine Name and Ketiv/Qere, Aramaic, a first look at Aramaic grammar, and a one-page summary of all prefixes and endings.

Every lesson is written in both languages and quotes real verses, each with its KJV or Cornilescu rendering and a link into the reader. Most lessons end with “Find it in the Bible”, which pulls random verses that use the form just taught, from any book you choose. **Quiz me** turns those verses into a short test: you tap the word in each verse that shows the form. With 80% right, the lesson can be marked as done from there. Lessons you mark as done are remembered.

**Progress:**
- how much of the Old Testament is made of words you know
- how many reviews you remembered in the last 30 days, and the verses you know by heart
- this week's study time
- the flashcard reviews coming up in the next two weeks
- the words you find hardest, with a button to practise them
- the easiest chapters for you, and milestones for the most common words
- review history, a suggested reading path, and coverage for every book and chapter

**Settings:**
- language, Bible, print or cursive, daily goal
- ten color themes
- audio, review options and keyboard shortcuts

## Audio

Pronunciation uses Microsoft's free neural Hebrew voices through the `edge-tts` package. The run scripts install it the first time, at a fixed version (7.2.8, set at the top of the audio part of `run.sh` and `run.bat`), so a new release is never installed before it has been tried. If Microsoft changes its service and audio stops working, raise that version and delete the `.venv` folder. If the setup fails, for example without internet, it is tried again the next day. To install it yourself and restart:
- Linux / WSL: `pip install --user edge-tts==7.2.8` (on Ubuntu and WSL, `sudo apt install python3-venv` lets `run.sh` install it in its own folder instead)
- Windows: `py -m pip install edge-tts==7.2.8`

Each word is downloaded the first time it is played and then kept on your computer. To skip the wait, go to **Settings, Audio, Download audio ahead of time** and download everything at once. It runs in the background. The choices:
- all dictionary words (about 8,000 clips)
- every word form in the Bible
- every verse of one book

Without edge-tts the app falls back to a Hebrew voice in your browser if one exists (Edge on Windows has good ones).

On Android the phone's own voice is used instead (see [Hebrew audio on the phone](#hebrew-audio-on-the-phone)).

The Divine Name is read as Adonai by default, the way the vowels in the text indicate. You can change that in Settings.

## Your data

Cards, notes, known words, saved verses, link fixes and settings are saved in one file:
- Linux and WSL: `~/.local/share/mikra/userdata.json`
- Windows: `%APPDATA%\Mikra\userdata.json`
- Android: inside the app (see [Your progress on the phone](#your-progress-on-the-phone))

A copy is kept each day in the `backups` folder next to it (last 14 days). Before a backup is restored or all progress is deleted, one more copy is saved there as `restore-point-<date>-<time>.json` (the last 10 are kept). My words has backup and restore buttons too. Downloaded audio is in `audio-cache` in the same folder, and `server-key` holds the key of the start link (only you can read it; delete it to make a new one). Progress saved under the old name (Hebrew Reader) is moved over the first time Mikra starts.

If the app is open in two windows, only the one that saved last keeps saving. The other one shows a message and asks you to reload, so it can't overwrite newer progress with older data.

## Rebuilding the data

The database in `data/` is already built. To rebuild it from the original sources:

```bash
pip install eflomal snowballstemmer   # only needed for the Cornilescu word links
python build/build_db.py
```

It downloads the sources into `build/sources/` and takes a few minutes. At the end it runs `build/add_extras.py`, which adds:
- the KJV, from `build/data/kjv-ot.tsv.gz`
- the Romanian meanings, from `build/ro_glosses.py` plus Cornilescu
- the word forms table

You can also run `python build/add_extras.py` alone on a built database. `build/extract_kjv.py` recreates the KJV file from the SWORD module (`sudo apt install diatheke sword-text-kjv`).

## Sources and licenses

- **Hebrew text, word tagging, transliteration and grammar:** Translators Amalgamated Hebrew OT (TAHOT) by STEPBible.org and Tyndale House, CC BY 4.0, based on the Westminster Leningrad Codex. Source: github.com/STEPBible/STEPBible-Data.
- **Dictionary:** TBESH (abridged Brown-Driver-Briggs) and TEHMC (morphology explanations), STEPBible.org, CC BY 4.0.
- **Roots and word families:** OpenScriptures Hebrew Lexicon, CC BY 4.0. Brown-Driver-Briggs and Strong's are public domain.
- **King James Version with Strong's numbers:** CrossWire Bible Society and eBible.org (module engKJV2006eb), public domain.
- **Romanian:** the Romanian Corrected Cornilescu Version, public domain, from eBible.org via github.com/seven1m/open-bibles. It keeps the 1924 Cornilescu wording with modern spelling (â, ș, ț).
- **Fonts:**
  - Noto Serif Hebrew and Literata: SIL Open Font License.
  - Ktav Yad CLM (the cursive): Maxim Iorsh, Culmus project, GNU GPL version 2. See `web/fonts/GPL-2-KtavYadCLM.txt`.

The data was reformatted for this app (split into chapters, words packed, translations linked to the Hebrew). No wording was changed.
