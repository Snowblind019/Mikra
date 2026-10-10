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

Learn with flashcards (spaced repetition), ready-made word decks, practice games, the alphabet in print and handwriting, typing practice, 19 grammar lessons, and saved verses you learn by heart.

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

Run `./run.sh` inside WSL. The app opens in Microsoft Edge on the Windows side. If no window appears, open the address the terminal prints (normally http://localhost:8723) in any Windows browser.

### The window

If Chrome, Chromium, Brave or Edge is installed, the app opens in its own window without browser tabs. Otherwise it opens in your default browser (Firefox works fine).

Closing the terminal or pressing Ctrl+C stops it. Starting it again while it is already running opens another window on the running copy.

Options:
- `--no-browser`: just start the server
- `--port 8800`: use another port
- `--window browser`: always use a normal browser tab

The app only answers requests from this computer and from its own page. Other websites open in the same browser can't read or change your progress.

## Android

The Android app is the same app in a phone window: same tabs, same data format, same backups. It needs Android 7 or newer and works fully offline.

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

Progress is saved inside the app, with a copy each day. **Uninstalling the app deletes it**, so before you uninstall (or move to a new phone), use My words, Back up everything. The file goes to the Downloads folder. Restore backup in My words reads it back, on the phone or on a computer: the file is the same on both.

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
  - save it to learn by heart
  - fix the word links
  - copy it
- Under each chapter is its word list, most useful words first.

**Review:**
- Flashcards scheduled with FSRS spaced repetition (Again, Hard, Good, Easy). Click the card to see the answer.
- **Word decks** to add many words at once. New cards come in a few each day (Settings, Review). The decks:
  - the 100, 500, 1,000 and 2,000 most common words
  - every word used 10+ times
  - names
  - all the words of one book
- Practice games that don't change the schedule: pick the meaning, listening, hear and repeat, spelling, words in their verse, matching pairs, free flipping.
- After you answer, the answer stays on screen. Click anywhere (or press Space) to go on.

**My words:**
- every card and known word, with search, pause, reset, delete
- export to Anki, and backup and restore
- **Saved verses** with a memorizing mode that hides more of the verse as you learn it

**Alphabet:**
- all letters in print and handwriting, with sounds compared to English or Romanian, Bible examples, look-alikes and number values
- vowels, other marks, a syllable builder
- writing practice
- **Keyboard**: the Israeli layout and a typing drill
- drills, including print versus cursive

**Grammar:** 19 short lessons, from reading a verse step by step and the little prefixes to verb stems, numbers, the story tense and verb charts. Each lesson can pull random real examples from any book.

**Progress:**
- how much of the Old Testament is made of words you know
- this week's study time
- the easiest chapters for you, and milestones for the most common words
- review history, a suggested reading path, and coverage for every book and chapter

**Settings:**
- language, Bible, print or cursive, daily goal
- ten color themes
- audio, review options and keyboard shortcuts

## Audio

Pronunciation uses Microsoft's free neural Hebrew voices through the `edge-tts` package. The run scripts try to install it the first time. If that fails, install it yourself and restart:
- Linux / WSL: `pip install --user edge-tts`
- Windows: `py -m pip install edge-tts`

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

A copy is kept each day in the `backups` folder next to it (last 14 days). Before a backup is restored or all progress is deleted, one more copy is saved there as `restore-point-<date>-<time>.json` (the last 10 are kept). My words has backup and restore buttons too. Downloaded audio is in `audio-cache` in the same folder. Progress saved under the old name (Hebrew Reader) is moved over the first time Mikra starts.

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
