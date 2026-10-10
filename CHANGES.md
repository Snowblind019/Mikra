# Changes

## 2.1.1: transliteration spelling, security and bug review

### New

- Settings, Reading, Transliteration spelling: English (sh, tz, ch), Romanian (ș, ț, h), or the same as the interface (the default, as before). It changes the pronunciation everywhere: the reader, the word panel, flashcards, word lists, the alphabet and the grammar lessons.

### Security

- Android: links that are not the app's own pages open in another app only when they are web or mail links (not `intent:`, `content:`, `file:` or `javascript:`).

### Fixes

- Transliteration: only the main stress is marked. Names and secondary stress were bold too (Yisra'el, Elohim, vayyomeru), about 5,600 words. With the Divine Name set to Yahweh the stress is on "weh", as in the dictionary.
- Gen 14:17, 1 Chr 27:12 and Neh 2:13 no longer lose part of a word. Copy verse keeps the sof pasuq, paragraph marks and paseq. No stray ס / פ at the end of verses in "Where it appears".
- Fixing links: "Use automatic links" followed by Cancel no longer deletes your own fixes.
- The "Words in this chapter" table updates in place instead of reloading and jumping.
- Moving to another chapter closes the old word panel. A verse that doesn't exist says so. Old search answers can't replace newer ones.
- Cards on whole-day intervals are due from the start of their day, so studying earlier than last time doesn't push them back a day.
- Review and Today redraw when the app comes back (for example the next morning), and Start builds a fresh queue.
- FSRS intervals stay in order after rounding (Hard ≤ Good < Easy), as in the reference code.
- Spell it accepts either spelling of words with two (Jerusalem, Babylon and 31 others).
- Hard counts as remembered in the stats. Adding a deck no longer ends a running review.
- Failed saves show a warning and are tried again.
- Restore backup and Delete all progress: on Android the copy of your current data also goes to Downloads, and nothing changes if no copy can be made. Only real Mikra backups are accepted.
- Bad values in a restored file (sizes, settings, text fields) are cleaned up when it loads.
- One Escape closes only the top dialog. Back in the Alphabet goes back one step. The letter sounds drill no longer offers כ (kh) as a wrong answer for ח (ch).

## 2.1.0: Android app and phone layout

### Android app

- New: `Mikra.apk` for Android 7 and newer. It is the same app in a phone window and works offline. The Bible text, dictionary, lessons and your progress all stay on the phone.
- Inside it runs a Java version of the server (`android/src`), ported line by line from `app/server.py`. Every API answer was compared with the Python server and matches. The browser tests pass against it too.
- Other apps on the phone can't read or change your progress: the API needs a secret cookie that only the app's own window gets.
- Audio uses the phone's text-to-speech (Google's engine has Hebrew). Settings, Audio shows whether a Hebrew voice was found, explains how to install one, and opens the phone's voice settings. Clips are cached, so a word plays instantly the second time.
- Backups and word lists from My words are saved in the phone's Downloads folder. Restore backup opens the phone's file picker.
- The back button closes what is open (menu, dialog, word panel), then goes back to Today.
- The status bar and navigation bar take the theme's colors. Automatic theme follows the phone's dark mode.
- Changes are saved as soon as the app goes to the background, not only after the usual short pause.
- `android/build-apk.sh` builds the APK with the Android tools packaged by Debian and Ubuntu. No Android Studio or Gradle is needed.

### Phone layout (also in a phone's browser)

- On screens up to 760 px wide the sections move to a bar at the bottom: Today, Read, Review, My words, and More (Alphabet, Grammar, Progress, Settings, print or cursive).
- Reader: one toolbar row. The chapter title opens book, chapter, search and Bible version. The word panel slides up from the bottom and keeps the chosen word in view. Tap a verse number for the verse tools (listen, save, copy, fix links).
- My words shows each card as a small block instead of a wide table. Grammar lessons are chosen from a drop-down. Alphabet, Progress, Settings and Today are rearranged into one column.
- On touch screens: bigger buttons, no keyboard hints, no hover-only popups, and the help texts say "tap" instead of "click" and "hover".
- Copy verse also works where the browser blocks clipboard access (inside the Android app it uses the phone's clipboard).

## 2.0.1: security, bug and translation review

### Malware scan

Nothing malicious found. Checked every script, the batch files, the Python and JavaScript code, the CSS, the fonts and the database: no hidden code, no encoded blobs, no hidden Unicode characters, no network calls except edge-tts and the build script's GitHub downloads. The fonts are real Literata, Noto Serif Hebrew and Ktav Yad fonts. The database passes SQLite's integrity check, has no triggers or views, and none of its text contains HTML or script.

### Your data

- **Progress could be lost with two windows open.** A window whose save was refused still left its old copy in the browser's storage, marked as newer. Pressing Reload in the "open in another window" message loaded that old copy, and the next save overwrote the newer progress on disk. The browser copy now remembers which revision it came from and is only used when the server never got it.
- **Restore and "Delete all progress" now really keep a copy first** (`backups/restore-point-…json`). Before, only the first save of the day was backed up, so a restore late in the day lost that day's study.
- **Restoring a backup** kept the backup's language but reset its Bible to match the language. It now keeps both. A backup whose cards are a list instead of an object is refused instead of silently restoring nothing.
- **A bad entry in a restored or hand-edited file** (an empty day, a broken saved verse or link fix, an invalid theme color) could blank the Today tab or the reader, or turn a light theme gray. These entries are now cleaned when the file is loaded.

### Security

- Typing a long run of spaces in the reader's search box could keep the server busy for minutes (the reference pattern backtracked). References are now trimmed and capped first.
- A double click on "Download audio ahead of time" could start two downloads sharing one progress counter. Checking and starting is now one step.

### Bugs

- **Previous chapter** (button or `[`) did nothing at 21 of the 38 book starts, for example Exodus 1 or Leviticus 1.
- **Flashcards:**
  - FSRS computed the new memory strength from the already-updated difficulty. It now uses the difficulty from before the review, as FSRS does.
  - A card with missing or broken numbers could end up never due again.
  - Cards deleted or paused in My words during a session came back when graded.
  - Alt+3 (switch to Review) graded the card Good, Ctrl+1 graded it Again, and holding Space ran through cards. Modifier keys and key repeat are ignored now, and Space/Enter on a focused button presses that button.
- **Practice games:**
  - "Pick the meaning" could offer two right answers (אָדָם and אִישׁ both "man").
  - In cursive, options that only differ in their vowels looked identical.
  - "Words in their verse" could give the answer away with a trailing maqaf or ס.
  - Ending a game while an answer was showing left a hidden click catcher that swallowed the next click (and crashed Match pairs).
  - A slow practice start could replace a flashcard session started meanwhile.
- **Reader:**
  - Changing any View option while fixing word links left a half-broken edit mode, and could apply KJV links to Cornilescu.
  - Playback kept going after leaving the Read tab, and restarting a verse lost its highlight.
  - Word-by-word playback stopped at the 14 empty qere words (Judges 16:25 and others).
  - The A and K shortcuts only worked for words picked in the text, not for words opened from lists.
  - The size sliders rebuilt the whole chapter on every step.
- **Word panel:**
  - The "Reading note" for ketiv/qere showed the whole raw note (transliteration, English gloss, codes) instead of just the Hebrew.
  - Infinitives were labeled with a gender ("infinitive construct, common"), and the weyiqtol form showed a bare "u".
  - Stem headings stood empty above "Show all".
  - The Known button didn't follow changes made elsewhere.
  - Raw codes like "Intg", "DemP" or "PerP-CS" showed as the part of speech.
- **Divine Name setting** was ignored in a few places: form and phrase cards, My words, the forms list, the "Read real words" drill, and the dictionary transliteration (ye·ho·vah instead of a·do·nai).
- **Grammar:**
  - Table cells mixing Hebrew and words were shown right to left.
  - Two example searches returned many wrong examples (preposition + the, construct nouns).
  - שָׁמְרֵנִי had the wrong vowels, and the accent example had no accent.
- **Alphabet:**
  - The letter-sounds drill could offer two letters with the same sound (in Romanian ח and ה are both "h").
  - Look-alike tips for end forms belonged to other letters.
  - Space after clicking an on-screen key counted a wrong answer.
  - The keyboard note had Q and W the wrong way round.
- **Other:**
  - Switching script or language sent you back to the first lesson or alphabet tab.
  - The audio download progress could keep polling in the background or update a hidden copy.
  - "Neural voice" mode switched to the browser voice for a minute after one failed clip.
  - "Reset settings" reset the Bible too.
  - Progress jumped to the top when opening a book's chapters.
  - Two different "day streak" numbers.
  - Search in My words now finds Hebrew typed without vowels and transliteration typed without dots.
  - Anki export quotes every field, so notes with quotes or line breaks can't break rows.
  - The backup file is named with the local date.
  - In cursive, words joined by a maqaf ran together.
  - Wide tables and the keyboard no longer stretch the page on narrow windows.

### Translation

- **Romanian meanings:** the hand-written meanings now cover the 1,000 most common words (were 260). The automatic meanings below that often picked a different, shorter word ("treizeci" became "trei", "miel" became "mie", "înțelepciune" became "înțelept", "moarte" became "moare"). The automatic rule no longer does that and gives verbs as "a …" when it can. Fixed "sământă" (sămânță) and "aproape" (aproapele).
- **Romanian grammar of numbers:** "20 de cuvinte", "101 cuvinte", "1 cuvânt", "de 25 de ori", "o dată", "al 1-lea" (now "cel mai des întâlnit cuvânt"). Decimals use a comma in Romanian ("1,7 ani", "45,3%").
- **English plurals:** "1 card", "1 minute", "once".
- **No more English in the Romanian interface:** error messages from the server or the network are translated, "KJV (English)" too.
- **Romanian wording:**
  - "h răzuit" is now "h aspru".
  - "Scripturile de pornire" is now "Fișierele de pornire".
  - "Scurtături de tastatură" is now "Comenzi rapide de la tastatură".
  - "Viteza rară" is now "Viteza lentă".
  - "a doua zi" is now "ziua a doua".
  - "ele / voi veți păzi" is now "ele vor păzi / voi veți păzi".
  - "cele mai comune cuvinte" is now "cele mai folosite cuvinte".
  - "haș-șamayim" is now "haș-șamaim", matching the app's Romanian transliteration.
  - About 30 smaller phrasing fixes.

## 2.0: Mikra

The app is now called **Mikra**. Saved progress from Hebrew Reader is moved over automatically.

### English or Romanian
- The whole interface switches between English and Romanian. That includes lessons, word meanings, grammar labels, messages and transliteration (English sh, tz, ch / Romanian ș, ț, h).
- Romanian word meanings: the 260 most common words written by hand, every other word from how Cornilescu translates it.

### KJV next to the Hebrew
- The King James Old Testament, linked word by word to the Hebrew through its Strong's numbers (about 306,000 links). Small words like "the", "and", "in", "my", "him" are linked to the matching Hebrew prefix or ending.
- KJV / Cornilescu switch in the reader. The Bible follows the language, and you can change it at any time.
- KJV italics (words the translators added) are shown in italics.
- How the KJV translates each word, next to Cornilescu.

### Print or cursive
- A switch at the top right shows all the learning parts in handwritten (cursive) Hebrew, using the Ktav Yad CLM font. Handwriting has no vowel points, so the pointed print form is shown underneath where it matters. The Bible text stays in print.
- Alphabet cards show both scripts, writing practice follows the switch, and a new drill matches print and cursive letters.

### Learning
- **Today tab:**
  - daily goal (minutes and reviews)
  - continue reading
  - reviews due
  - word of the day
  - easiest chapters for you
  - a "Start here" path that ticks itself off
- **Word decks** in Review: the 100, 500, 1,000 and 2,000 most common words, every word used 10+ times, names, or every word of one book. New cards still come in a few each day.
- **Review pace:** after you answer, the answer stays until you click again (or press Space). Click a flashcard to see its answer.
- **New practice mode:** Hear and repeat.
- **Practice sources:** practice from any deck size, not only the top 200.
- **Every form in the Bible:** each word's forms with their grammar and count, grouped by verb stem.
- **Help under words** (pronunciation and meaning) can be limited to the words you don't know yet.
- **Word-by-word playback** of a verse with highlighting, to read along and repeat.
- **Saved verses** with a memorizing mode (full text, some words hidden, first letters only, all hidden).
- **Keyboard tab** with the Israeli layout and a typing drill. Typing boxes accept normal Latin keys and turn them into Hebrew letters.
- **Grammar:** three new lessons (Reading a verse step by step, Numbers, Verb charts) and "mark as done".
- **Progress:** this week's study time and the easiest chapters for you.
- **Dictionary entries:** Bible references are now clickable links.

### Audio
- **Download audio ahead of time** (Settings, Audio):
  - all dictionary words, every word form, or every verse of a book
  - in the background, with progress and cancel
  - the downloaded clips are exactly the ones the app plays

### Data
- The database grew by the KJV, word forms and Romanian meanings but stays under GitHub's 50 MB warning (duplicate text removed, grammar codes stored once).

## 1.0.1: security and bug fix review

## Malware scan

Nothing malicious found. Checked every script, the batch files, the Python and JavaScript code, the CSS, the fonts and the database.

- No hidden code: no eval, no obfuscated or encoded blobs, no hidden Unicode characters, no network calls except the ones the README describes (edge-tts for audio, and the build script downloading the Bible sources from GitHub).
- The five .woff2 fonts open as real Literata and Noto Serif Hebrew fonts.
- The database passes SQLite's integrity check and has only plain tables and indexes (no triggers or views).

## Security fixes

1. **Any website could overwrite your saved progress.** While the app was running, a page open in the same browser could send a save request to `localhost:8723` and replace `userdata.json`. Tested and confirmed on the original code. Now the server only accepts requests from the app's own page (checks the browser's `Sec-Fetch-Site` and `Origin` headers), and saves must be sent as JSON, which other sites can't do without permission the server never grants.
2. **Security headers added** to every response: a Content-Security-Policy that only allows the app's own files, plus headers that stop other sites from framing the app or embedding its API responses.
3. **Static file serving hardened.** The old folder check compared text prefixes, so a sibling folder whose name started with `web` would have passed. It now resolves the real path and refuses anything outside `web/`. Missing files return 404 instead of the main page.
4. **Request limits.** Negative `limit` values returned whole tables (SQLite treats a negative LIMIT as "no limit"). All number parameters are now clamped. Request bodies are capped at 64 MB, bad `Content-Length` values are rejected, and the grammar search pattern is capped in length.
5. **Desktop shortcut scripts.** `Create Desktop Shortcut.bat` put the folder path inside a PowerShell command, so a folder name with an apostrophe (like `C:\Users\O'Brien`) broke it and could change the command. The path is now passed safely. `install-shortcut.sh` now refuses folder paths containing characters the app menu treats specially. The batch file also no longer uses `-ExecutionPolicy Bypass`, which was never needed.
6. The `--host` option now prints a warning when the app is reachable from the network, since there is no password.

## Bug fixes

- **Two windows overwrote each other.** With the app open twice, the window holding older data silently replaced newer progress on its next save. Saves now carry a revision number; a stale window stops saving and asks you to reload.
- **Starting the app twice** started a second server on the next port, writing to the same file. Now it opens a window on the running copy instead.
- **Restoring a backup** that was missing a section (settings, log) broke the app until reload and stopped all saving. Restored data is now checked and filled in.
- **Closing the word panel while it loaded** threw an error.
- **Changing chapters quickly** could end on the wrong chapter (an older request finishing last).
- **Known words tab** showed duplicate tables when typing in the filter, and fetched every known word with its own request (up to 1500 at once). It now uses one request.
- **Stopping audio** left the chapter player stuck on "Stop", and interrupting the browser voice showed a false "No Hebrew voice available" message.
- **Dictionary entries** showed raw `<ref="Pro.30.1">` tags. They are now clickable links to the verse.
- **Root letters** with ש lost their shin or sin dot (it was split onto a separate space).
- **Grammar lesson audio** read יהוה as written, ignoring the Divine Name setting.
- **Review games:** pressing End while a question was loading could throw errors on the next key press; Listening could crash with fewer than four options; Match pairs counted a word and one of its forms as a match; the "remembered on the first try" percentage counted retries.
- **Saving:** saves could overlap and arrive out of order; the file is now flushed to disk before replacing the old one, so a crash or power cut can't leave it empty.
- **Audio server:** a stalled connection to the voice service could hold a server thread forever (now a 30 second timeout).
- Smaller fixes: IPv6 `Host` headers were refused, `%` and `_` in searches acted as wildcards, a bad saved position left the reader blank, Enter only (not Space) opened a letter in the Alphabet tab, the build script left half-downloaded files behind after a failed download.

## Not changed

- `pip install edge-tts` in the run scripts is left unpinned. Pinning it would make installs repeatable, but edge-tts needs updates whenever Microsoft changes its voice service, so a pinned version could stop working.
- When started from the app menu on Linux there is no terminal, so the server keeps running after you close the window. Starting it again reuses that copy, so they don't pile up.
