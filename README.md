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
