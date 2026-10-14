# Pas à pas

Installable offline PWA (vanilla HTML/CSS/JS, no build step, no dependencies) that guides a French-speaking
student through math word problems one step at a time. UI and content are in French. All data stays on the
device (IndexedDB for attempts, localStorage for settings); nothing is sent anywhere.

## Run

```sh
python3 -m http.server 8080        # then open http://localhost:8080
# or
docker build -t pas-a-pas . && docker run --rm -p 8080:80 pas-a-pas
```

Service workers need `localhost` or HTTPS. The service worker is cache-first: after editing any cached file,
bump `CACHE` in `sw.js` (and add new files to its `SHELL` list), otherwise clients keep the old copy.

## Add problems

Append an object to `data/problems.fr.json`. Fields:

- `id`, `schema` (`combine` | `change` | `compare`), `keywordConsistency` (`consistent` | `inconsistent`),
  `steps` (1-3), `questionPosition` (`start` | `end`).
- `chunks`: short sentences read one at a time. The question sentence is one of the chunks (first or last,
  per `questionPosition`) and `question` repeats it exactly. Use ` ` before `?` and `$`.
- `numbers`: every number in `chunks`, in order of appearance, with `relevant` true/false.
- `asked`: `options` (3-4) and `correct` index.
- `plan`: `options` and `correctSequence` (indexes, length = `steps`). For 1 step use the four operations.
- `answer`, `unit`, `intermediate` (`[{value, label}]`), `explanation` (one neutral sentence).
- `wrongAnswerTypes`: answer value -> `intermediate_as_answer` | `wrong_operation` | `wrong_numbers`.

Error type logged for a wrong answer: `lost_the_question` if the "asked" choice was wrong or she answered
"Non" in the check step and kept the same answer; otherwise the `wrongAnswerTypes` entry; otherwise `other`.

## Parent screen

Home screen, "Parents" link: attempt counts, counts by error type, average time per phase, and
"Exporter JSON" to download the full log.

## Recorded voice

Statements, questions, "asked" options and explanations are read by pre-generated recordings (`audio/`, listed in
`data/audio-manifest.json`), so the voice is the same on every device and works offline. The recordings are played from
Blob URLs on one shared audio element. If a recording is missing, or "Voix enregistrée" is off in Réglages, the browser
voice is used instead (single words always use it). The recordings are made once, on the developer's machine, from the
fixed problem text. No user data is ever sent anywhere.

Voix : Kokoro (ff_siwis), jeu de données SIWIS, licence CC BY 4.0.

### Regenerate the audio

Needs Node 18+ and no npm packages.

```sh
echo 'NAN_API_KEY=your-key' > .env          # .env is git-ignored and docker-ignored
node scripts/generate-audio.mjs             # generates only missing or changed files, rewrites the manifest
node scripts/generate-audio.mjs --verify    # offline check, exits 1 if any problem text lacks up to date audio
node scripts/generate-audio.mjs --sample    # p02, p11 and p25 only, into audio-sample/ (git-ignored)
node --test scripts/normalize.test.mjs      # tests for the text-to-speech preparation (numbers, $, %, units)
```

After changing a statement, question, option or explanation, run the generator, then bump `CACHE` in `sw.js`.
The Docker image must copy `audio/` as well as `data/` (see the Dockerfile).
