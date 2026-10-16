# Changes

## 2.4.0: learning the forms, verses on a schedule

### New

- **Take this verse apart** (reader, the layers button on each verse): every word of the verse split into its prefixes, main word and endings, with what each part means, its grammar (stem, tense, person…), its sound and its meaning in this verse. Click a word to study it in full, and come back to the verse from there. A button adds the verse's new words to review.
- **Parse the verb** (Review, practice games): a verb form from the Bible, and you choose its stem, tense and person. The wrong answers each change one thing (the person, the tense or the stem), so you learn to look at each part. Forms that are written the same in two ways (תִּשְׁמֹר is "she will" and "you will", a jussive often looks like an imperfect) are never offered against each other. The answer explains the form and links to its grammar lesson and its verse.
- **Prefixes and endings** (Review, practice games): a word from the chapter you read last with one small part marked, and you choose what it means: and, the, in, to the, his, them, we… The answer shows the whole word part by part (וּ + בְ + בֵית + וֹ = and + in + house + his).
- **Quiz me** (Grammar, under "Find it in the Bible"): verses that use the form the lesson teaches, and you click the word that shows it. Every matching word in the verse counts. With 80% right, the lesson can be marked as done from there.
- **Saved verses on a schedule:** a verse you have learned by heart comes back to repeat, like a flashcard (Again, Hard, Good, Easy). Today shows how many are due; My words, Saved verses has a button to repeat them.
- **Build it** (saved verses): the words of the verse are shuffled, and you put them back in order.
- **Flashcard hints:** the Hint button (or H) before the answer gives a little at a time: the sound, then the verse with the word's translation left out (Hebrew → meaning); the first letter and how many letters follow, then the sound (meaning → Hebrew); the written word (listening).
- **Notes on the card:** the answer side shows your note for the word and lets you write or change it right there. A word forgotten four times is marked "Tricky word", and its note opens with a tip to write a memory hook. My words has a filter for these cards.
- **After a practice game:** the words you missed are listed, with a button to add each to review, and "Practise the ones I missed" starts a round with only those.
- **My hardest words:** a new set of practice words, the cards you forgot most often.
- **Progress:** the reviews coming up in the next two weeks, how many reviews you remembered in the last 30 days, the verses you know by heart, and the words you find hardest, with a button to practise them.
- **Today:** a tile with the next grammar lesson, and the saved verses tile says when verses are due.
- **Word families:** "Root and related words" in the word panel can add the whole family to review at once.
- **Reader:** "Practise these words" under the chapter's word list starts a game with the words of that chapter.
- Settings, Keyboard shortcuts lists H for hints.

### Security

- Android: the start link the app's window opens is now a one-time link that runs out after a minute. Before, it held the key itself and worked for as long as the app ran, so anything that saw the link (a log, a screen reader) could use your progress.
- Android: requests with more than 64 header lines or 32 KB of headers, or with two Host, Origin, Content-Length or Content-Type headers, are refused. Before, another app could send 100 lines of 16 KB each, joined and copied again and again, and use up the app's memory.
- Android: saves are limited to 24 MB (progress is a few MB at most), and a save that runs out of memory gets an answer instead of taking the app down.
- Android: if the server can't accept connections for a moment (no file handles left, say), it waits a little before trying again instead of keeping a CPU core busy.
- Android: the backup Android makes of the app (to your Google account, or adb backup) takes only your saved progress, not the web view's storage or temporary files.
- Android: "save to Downloads" only writes the files the app makes (.json backups, .tsv word lists), with a matching extension, and never a hidden file. The web view can't open content links.
- The run script stops if it can't change to its own folder.

### Fixes

- Grammar, Find it in the Bible: the search wrote one "?" for every grammar code a pattern matched. Two lessons match over a thousand codes, more than SQLite allows on Android 7 to 11, so their examples never loaded on those phones (and on computers with an older SQLite).
- Word panel: a preposition whose vowel holds the article (לַ, בַּ, כַּ) now says "to + the", "in + the" instead of just "to, for".

### Checked

- Static analysis of the Python (bandit), JavaScript (ESLint with security rules) and shell scripts (shellcheck), pattern rules over the Python, JavaScript and Java code (no dynamic code, every place that writes HTML escapes what it writes), and an independent review of the new code and of the Android server.
- Malware sweep: nothing malicious. No hidden or bidi characters, no encoded blobs, no network calls except edge-tts and the build script's GitHub downloads, the fonts are the real Literata, Noto Serif Hebrew and Ktav Yad fonts, the PNG icons have nothing after their end, the database passes SQLite's integrity check, has no triggers or views, and none of its text holds markup.
- Browser tests of every new feature in English and Romanian, print and cursive, desktop and phone width, against both the Python server and the Java server of the Android app.

## 2.3.0: choose which side you see

- Review, practice games: a new “Show first” choice above the games: the Hebrew, the meaning, or both taking turns (as before).
  - With the Hebrew, Pick the meaning shows only the Hebrew word and you choose what it means. With the meaning, it shows only the meaning and you choose the Hebrew word (the game is then called Pick the Hebrew word).
  - Flip through cards follows it too: the Hebrew on the front and the meaning on the back, or the meaning on the front and the Hebrew, its sound and pronunciation on the back.
  - The Hebrew in the answers follows the print / handwriting switch at the top, as before.
- Review, flashcards: under Start review, “Flashcards ask” switches the kinds of cards on and off right there (Hebrew → meaning, meaning → Hebrew, listening). It is the same choice as in Settings, Review. At least one stays on, and new cards always start Hebrew → meaning.
- Alphabet, drills: every drill has a “Show” switch at the top, and every drill now works both ways:
  - Letter names: see the letter and choose its name, or see the name and choose the letter.
  - Letter sounds: see the letter and choose its sound, or see the sound and choose the letter. No two answers share a sound.
  - Look-alikes: see the letter and choose its name, or see the name and choose the letter.
  - Vowel reading: see the syllable and choose how it is read, or see how it is read (“ba”) and choose the syllable.
  - End forms: see the end form and choose the normal letter, or see the letter and choose its end form.
  - Print and cursive: see the handwritten letter and choose the print one, or the other way round.
  - Read real words: see the Hebrew and read it out loud, or see the meaning and say the Hebrew word, then check.
  - “Both, taking turns” alternates. The choice is remembered for each drill; the defaults are the way each drill worked before.
- Settings, Review: the same “show first” choice for the practice games. The card directions note now says they take turns (since 2.2.2 they no longer come at random).

## 2.2.2: Romanian transliteration and fairer random picks

### Transliteration spelling

- Romanian spelling now covers every Hebrew word in the app, not only the pronunciation lines. With the English interface and Romanian spelling, the English text stays English and the Hebrew words in it are spelled the Romanian way:
  - letter names: Ghimel, Zain, Het, Iod, Kaf / Haf, Sameh, Ain, Țadi, Kuf, Reș, Șin;
  - vowel and mark names: Patah, Kamaț, Țere, Hirik, Kubuț, Șuruk, Șva, Dagheș, Mapik, Makaf, Atnah;
  - stem names in the lessons and the word panel: Kal, Nifal, Hifil, Hofal, Hitpael (and the rare and Aramaic ones);
  - the Hebrew words quoted inside the lessons and the alphabet (haș-șamaim, iș-mor, ME-leh, AR-ța), the sounds in the alphabet and the syllable builder, and the Yahweh option in Settings (Iahve).
- The dictionary words (flashcards, My words, word lists, word of the day, the word panel) were only half converted: ph, q and ts stayed (ne·pheș, qa·doș, e·rets). They are now ne·feș, ka·doș, e·reț.
- A silent ה at the end of a word has no h in Romanian spelling (to·ra, pa·ne, ha·ia, Iahve), as Romanian Bibles write Tora, Sara, Iuda. A ה with mappiq (לָהּ, אֹתָהּ) is pronounced and keeps it (lah, ʼo·tah).
- Other small fixes: iy and yy (tsiy·yon, chiz·qiy·yah) become ți·ion, hiz·ki·ia instead of tsii·ion, hiz·qii·iah; w becomes v; th becomes t; g before e and i becomes gh also across a syllable dot.
- The Romanian interface with English spelling now works the other way round too: the Hebrew words in the Romanian lessons switch to sh, tz, ch.
- Flashcards for the Divine Name follow the Adonai / Yahweh setting like everywhere else (they showed ye·ho·vah).
- My words: the search also finds a word by its pronunciation as shown (ne·feș or nefes), not only by the stored English spelling.
- Grammar terms that are the same in every language (qatal, yiqtol, wayyiqtol, weqatal) are left as they are.

### Random picks

- The drills, the practice games and the grammar examples picked each question at random on its own, so some letters came up again and again while others hardly came up. In 44 questions of a letter drill about 3 letters never came up and 3 came up four times or more.
- Now they deal from a shuffled deck: every item comes up once before any comes back, and the same one never comes twice in a row. A wrong answer brings that item back a few questions later (one at a time, so a bad run doesn't fill the drill with the same few).
  - Alphabet: letter names, letter sounds, look-alikes (every letter of each group gets its turn), vowel reading (vowels and consonants each go round), end forms, print and cursive (also taking turns which way round), real words, the typing practice and the Random button of the syllable builder.
  - Review practice games: each game deals from its set of words, Again carries on with the words not seen yet instead of starting the same ones over, and the matching rounds don't repeat words.
  - The set itself rotates: a new game starts with the words you haven't practised for the longest time (remembered in this browser), from your weaker cards, the chapter's words or the deck you chose. Before, “My cards” usually took the same 40 and the chapter's words always came in the same order.
  - Flashcard directions (recognize, recall, listen) take turns instead of being drawn at random.
- Grammar, Find it in the Bible: Show examples brings verses you haven't seen in that lesson yet, one per verse, until the lesson runs out and starts over.

## 2.2.1: security and bug review

### Security

- The grammar search only runs the patterns the lessons use. Before, it ran any pattern it was sent, and one like `(.*)*x` froze the whole desktop app for minutes (Python's regex engine holds every request while it matches). The Android app had the same endpoint.
- The desktop app now needs a key for your progress, like the Android app. Other programs and user accounts on the computer can reach the app's address, but without the key they can't read or change your progress. The key is in `server-key` in your data folder, readable only by you, and the browser keeps it as a cookie.
  - The launcher opens the window with a one-time start link (valid for two minutes, one use), because other user accounts can read a browser's command line. The terminal prints a link with the key itself, for opening Mikra by hand.
  - Starting Mikra a second time first checks that the running copy has the same key, without sending the key: something else could be listening on the port. If it isn't Mikra with your data folder, the new copy starts on the next port.
  - Each port has its own cookie name, so two copies with different data folders don't overwrite each other's key.
  - A browser without the key is told to open Mikra from its shortcut.
- Android: another app on the phone could hold all 24 of the server's connections, by sending a byte now and then or by asking for files and never reading the answers, and Mikra showed a blank page. Now when the server is full it closes the oldest connection that never sent the key (whatever it is doing), then the oldest idle one. Request headers have to arrive within 10 seconds in total, idle connections close after 5, and a GET with a body is refused before anything is read. Tested: the whole app works normally while another program keeps both kinds of pressure on the server.
- `build-apk.sh` passes the new signing key's password to keytool through the environment instead of its command line (where `ps` shows it), and creates every file readable only by you.
- Audio setup installs a fixed edge-tts version (7.2.8) and no longer falls back to `pip install --break-system-packages`.

### Fixes

- A study day runs from 4 a.m. to 4 a.m. A card graded at 23:50 with a one-day interval was due again at midnight, ten minutes later, and a session past midnight got a second day of new cards. Daily goals, the streak, the week and 30-day charts and the word of the day use the same day. Backup file names keep the calendar date.
- The due day is counted in calendar days, so the night the clocks change no longer makes a card due at once or a day late.
- Typing drill: a held letter key, or a key pressed right after a word was finished, no longer counts as a wrong answer. Arrow keys and Space still work when held.
- Search: the highlight covers exactly the word found, also when an accent is typed as a separate mark.
- Review: audio that starts a moment after a card appears no longer plays after you press End or switch tabs.
- Restore backup: a memorizing level that isn't 0 to 3 is reset to 0 (it made Easier and Harder count to NaN), and `__proto__` keys are dropped.
- A note with half an emoji in it (cut in the middle of one) made every save fail on the desktop and was saved as "?" on Android. Both now save it.
- A `userdata.json` that can't be read for a moment (too many open files, say) is an error the page retries, not an empty start a save could write over. A damaged one is moved aside once instead of copied on every page load (desktop and Android).
- Closing the window: the last-moment save is only sent when it fits the browser's 64 KB limit for that kind of request; larger progress is kept in the browser's copy and sent on the next start, as before.
- A number too big for the database (`?b=99999999999999999999`) is answered with "bad request" instead of a server error.
- Audio setup: if it fails (no internet, say), it is tried again the next day instead of never. On Ubuntu and WSL the message says to install `python3-venv`.
- Android: the chapter cache could mix up chapters (book 0, chapter 1001 gave Exodus 1). A failed save to Downloads left an empty file. The first search held up every other request while it built its word lists. Server errors are now written to the phone's log.
- README: the Android app works offline, except that an online-only Hebrew voice sends the words it reads to its service.

## 2.2.0: the grammar course

### New

- Grammar: 64 lessons instead of 19, arranged in six parts from beginner to advanced (Getting started, Nouns and the words around them, The verb, Weak verbs, Building sentences, Reading the text). The 19 old lessons are kept and extended; 45 are new. New topics include the vowel signs, shva and dagesh, the object marker, noun patterns and how nouns change with endings, adjectives and comparison, demonstratives, prepositions with endings, 11–19 and the tens, questions, negation, weqatal, object endings on verbs, stative verbs, one lesson each on Niphal, Piel/Pual, Hiphil/Hophal, Hithpael and the rare stems, charts for all seven stems, every class of weak verb, the 25 most common verbs with their real forms, verbless sentences, word order, אֲשֶׁר, כִּי, “to have”, time expressions, the infinitive and participle in use, conditions, purpose, oaths, direct speech, the directional ending, pausal forms, Hebrew poetry, the names of God, and Aramaic grammar. Every example is a real verse (checked against the text) with its KJV or Cornilescu rendering.
- The lesson list is grouped by part with a count of lessons done; on wide screens it scrolls on its own, on phones the drop-down is grouped the same way. Each lesson shows where it sits (“The verb · Lesson 29 of 64”).
- Lessons are saved by name instead of by position, so lessons you had marked as done stay done after this update.

### Fixes

- Three examples in the old lessons quoted a form that is not the one in the verse (דְּבַר־ for דְבַר־, בְּנֵי for וּבְנֵי, גּוֹי for לְגוֹי); they now quote the text as it stands.
- Lesson titles that mix Hebrew words with commas keep the commas in the right place.

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
