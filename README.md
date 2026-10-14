# Pas à pas

Pas à pas is an installable, offline web app that guides a French-speaking student through math word problems one step at a time. It is meant for students with dyslexia, ADHD or dysorthographia who find the reading load and the number of simultaneous decisions in a word problem hard to manage. The interface and the problems are in French (Québec, secondary levels 1 to 3). There is no account, no server-side code and no build step.

## Status

Working prototype. It has been piloted with one family. It is not clinically validated, and no controlled study of this app exists.

## Features

- **Step-by-step flow.** Each problem is solved in seven steps, one per screen: listen to the statement sentence by sentence, see the question, mark the numbers that are needed, choose what is being asked, choose the operations in order, calculate, check. A short explanation is shown at the end.
- **Three levels.** 36 problems, 12 each for secondaire 1, 2 and 3. Problems cover three structures (combine, change, compare), and include multi-step problems, irrelevant numbers, and questions placed first or last.
- **Recorded voice.** Statements, questions, answer choices and explanations are read by pre-generated recordings (Kokoro, voice ff_siwis) that sound the same on every device and work offline. If a recording is missing, or "Voix enregistrée" is switched off in Réglages, the browser's Web Speech voice is used instead.
- **Tap a word to hear it.** Tapping any word in the statement reads it with the browser's French voice.
- **Tap-based answers.** Choices are tapped. The numeric answer is entered on an on-screen number pad, so no keyboard is needed. A grid-paper area allows finger drawing while calculating.
- **Adjustable display.** Réglages offers text size, letter spacing, line spacing, four background colors, number highlighting, reading speed, and voice selection.
- **Pause offer.** After 15 minutes, or when responses become much slower than at the start, the app offers to continue or stop.
- **End-of-pass card.** When every problem of a level has been attempted, a calm card offers to start again or stop. Later passes use a different order.
- **Offline PWA.** The service worker caches the app, the problems and all recordings. It can be installed to the home screen.
- **Local attempt log.** Each attempt stores the problem, level, chosen data marks, chosen "what is asked" and plan, answer, error type, time per step, replay counts, and active settings, including which voice was used. Repeat attempts are flagged.
- **Parents screen.** Level selector (secondaire 1, 2 or 3), current level, counts of correct answers and of each error type (first attempts and repeats shown separately), average time per step, and a JSON export of the full log.

## Design principles

- One thing on screen at a time.
- No visible timers or countdowns. Time per step is logged for the parent only.
- No sound effects, points, streaks or other gamification. The only audio is the voice.
- Tap instead of type wherever possible.
- Sober style, system font, no decorative motion (animation is disabled when the device asks for reduced motion).
- Text and control colors were computed to meet WCAG AA contrast (4.5:1 for text, 3:1 for control borders) on all four backgrounds.
- Buttons and controls are at least 48 px. The tappable words inside a statement are inline text and are smaller.
- Short audio chunks: one sentence at a time, with a replay button.

## Evidence background

The design is informed by peer-reviewed research on dyslexia, ADHD and word-problem solving. Most of that evidence comes from younger students than the target level of this app (secondary school), and much of it concerns reading rather than math. No controlled study of this app exists. The support levels below are the author's reading of that literature, not a systematic review.

| Design choice | Support | Note |
| --- | --- | --- |
| Read-aloud audio (text-to-speech) | Strong | A meta-analysis found benefits of text-to-speech and related read-aloud tools for reading comprehension in students with reading disabilities (Wood et al., 2018). It does not address math word problems specifically. |
| Teaching by problem type (combine, change, compare) | Strong, younger ages | Schema-based word-problem instruction is well studied, mostly with elementary and middle-school students (see Witzel et al., 2022). |
| Configurable letter and line spacing, background color | Moderate | Extra-large letter spacing helped children with dyslexia read (Zorzi et al., 2012). The app lets families adjust spacing instead of imposing one setting. |
| Short, single-step screens | Moderate | Breaking text and tasks into small pieces is a common recommendation for dyslexia and ADHD. This layout has not been tested directly. |
| Choose "what is asked" before calculating | Plausible | Keeps the question in view and separates understanding from computing. No direct study of this exact step. |
| Check the answer against the question | Moderate | The app asks whether the answer responds to the question. It has no estimation step. |
| Segmented sessions with a pause offer | Indirect | Based on general evidence on attention and fatigue, not on studies of pauses in math practice. |
| Error logging for the parent | Plausible | Lets an adult see patterns, such as an intermediate result given as the answer. No study shows it improves outcomes. |
| No gamification | Weak | Evidence on points and rewards for this population is limited. They are left out to keep attention on the task and avoid pressure. |

References (bibliographic details checked against Crossref records):

- Hardy, A. M., & Clemens, N. H. (2024). Four strategies for supporting students with dyslexia in solving mathematics word problems. *TEACHING Exceptional Children*. https://doi.org/10.1177/00400599241242100
- Witzel, B., Myers, J. A., & Xin, Y. P. (2022). Intensive word problem solving for students with learning disabilities in mathematics. *Intervention in School and Clinic*. https://doi.org/10.1177/10534512211047580
- Wood, S. G., Moxley, J. H., Tighe, E. L., & Wagner, R. K. (2018). Does use of text-to-speech and related read-aloud tools improve reading comprehension for students with reading disabilities? A meta-analysis. *Journal of Learning Disabilities, 51*(1), 73-84. https://doi.org/10.1177/0022219416688170
- Zorzi, M., Barbiero, C., Facoetti, A., Lonciari, I., Carrozzi, M., Montico, M., Bravar, L., George, F., Pech-Georgel, C., & Ziegler, J. C. (2012). Extra-large letter spacing improves reading in dyslexia. *Proceedings of the National Academy of Sciences*. https://doi.org/10.1073/pnas.1205566109

## Tech stack

- Vanilla HTML, CSS and JavaScript (ES modules). No framework, no build step, no runtime dependencies.
- Service worker (cache-first) and web app manifest for offline use and installation.
- IndexedDB for attempts, localStorage for settings and level.
- Web Speech API for the fallback voice and for single words.
- Pre-generated mp3 recordings, played from Blob URLs on one shared audio element.
- Node 18+ scripts with no npm packages for audio generation and speech-text tests.
- nginx (Alpine) in Docker for deployment.

## Run locally

```sh
python3 -m http.server 8080        # then open http://localhost:8080
# or
docker build -t pas-a-pas . && docker run --rm -p 8080:80 pas-a-pas
```

Service workers need `localhost` or HTTPS. The service worker is cache-first: after editing any cached file, bump `CACHE` in `sw.js` (and add new files to its `SHELL` list), otherwise clients keep the old copy.

Tests for the speech-text preparation (numbers, currency, percent, units):

```sh
node --test scripts/normalize.test.mjs
```

### Add problems

Append an object to `data/problems.fr.json`, then regenerate the audio. Fields:

- `id`, `level` (`sec1` | `sec2` | `sec3`), `schema` (`combine` | `change` | `compare`), `keywordConsistency` (`consistent` | `inconsistent`), `steps` (1-3), `questionPosition` (`start` | `end`).
- `chunks`: short sentences read one at a time. The question sentence is one of the chunks (first or last, per `questionPosition`) and `question` repeats it exactly. Use a non-breaking space before `?`, `$` and `%`.
- `numbers`: every number in `chunks`, in order of appearance, with `relevant` true or false.
- `asked`: `options` (3-4) and `correct` index.
- `plan`: `options` and `correctSequence` (indexes, length equal to `steps`). For 1 step use the four operations.
- `answer`, `unit`, `intermediate` (`[{value, label}]`), `explanation` (one neutral sentence).
- `wrongAnswerTypes`: answer value mapped to `intermediate_as_answer`, `wrong_operation` or `wrong_numbers`.

Error type logged for a wrong answer: `lost_the_question` if the "asked" choice was wrong, or if the student answered "Non" in the check step and kept the same answer; otherwise the `wrongAnswerTypes` entry; otherwise `other`.

## Regenerate the audio

The recordings (`audio/`, listed in `data/audio-manifest.json`) are made once, on the developer's machine, from the fixed problem text, through a third-party text-to-speech API serving Kokoro. They are stored as static mp3 files. No user data is involved.

Needs Node 18+ and no npm packages.

```sh
echo 'NAN_API_KEY=your-key' > .env          # .env is git-ignored and docker-ignored
node scripts/generate-audio.mjs             # generates only missing or changed files, rewrites the manifest
node scripts/generate-audio.mjs --verify    # offline check, exits 1 if any problem text lacks up to date audio
node scripts/generate-audio.mjs --sample    # p02, p11 and p25 only, into audio-sample/ (git-ignored)
```

The script reads the key from `NAN_API_KEY` in the environment first, then from `.env`, and never prints it. After regenerating, bump `CACHE` in `sw.js`.

## Deploy

The image is nginx on Alpine serving static files. `Dockerfile` copies the app, `data/` and `audio/`. `.dockerignore` keeps `.env`, `scripts/`, `audio-sample/` and `.claude` out of the build.

```sh
docker build -t pas-a-pas .
docker run -d -p 8080:80 pas-a-pas
```

- Serve it over HTTPS (for example behind a reverse proxy). Browsers only register service workers on HTTPS or localhost.
- `nginx.conf` compresses text assets, sends `Cache-Control: no-cache` for `sw.js`, and serves mp3 files as `audio/mpeg` with range support and no compression.
- The recordings add about 15 MB to the image and to the first visit. The service worker downloads them once.

## Privacy

- No account, no login, no analytics, no third-party scripts, fonts or images.
- Attempts are stored in IndexedDB and settings and the chosen level in localStorage, in the browser on the device. They never leave it, except when the parent chooses "Exporter JSON", which downloads a file to the device.
- The app only fetches its own static files (the page, the problems, the manifest and the recordings).
- One caveat: if a browser offers an "online" French system voice and the user selects it, the browser itself may send the spoken text to that voice's provider. The app never selects such a voice by default and shows a warning when one is selected.
- Clearing the browser's site data deletes the log.

## Limitations

- Not clinically validated, piloted with one family, no controlled study.
- 36 problems, French (Québec) only. The statements and the level assignments have not been reviewed by a qualified teacher or support team.
- Tested manually on iPhone Safari and Windows Chrome; no automated cross-device tests.
- Fallback and word-tap voices depend on the voices installed on the device and vary in quality. Some devices have no French voice.
- Automated tests cover only the speech-text preparation. The interface was checked with scripted browser runs, not with a screen reader or a formal accessibility audit.
- Data lives in one browser on one device. There is no sync or backup other than the manual JSON export.
- Estimation is not part of the flow, only a final check.

## Credits and licenses

- Voice: Kokoro (ff_siwis), SIWIS dataset, CC BY 4.0. The audio was generated through an API and is stored as static mp3 files in this repository.
- License: not yet specified.
