#!/usr/bin/env node
// Build-time audio generation: Kokoro (ff_siwis) through the nan.builders API. Node 18+, no dependencies.
// Only fixed problem text is sent. No user data is involved. The API key is read from NAN_API_KEY or ./.env and never printed.
//
//   node scripts/generate-audio.mjs             generate whatever is missing or changed into audio/ + data/audio-manifest.json
//   node scripts/generate-audio.mjs --verify    no network; exit 1 if any problem text lacks up to date audio
//   node scripts/generate-audio.mjs --sample    p02, p11 and p25 only, into audio-sample/
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeForSpeech } from './normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://api.nan.builders/v1/audio/speech';
const MODEL = 'kokoro';
const VOICE = 'ff_siwis';
const SPEED = 0.9;
const DELAY_MS = 300;
const RETRIES = 3;
const MIN_BYTES = 1024;
const SAMPLE_IDS = ['p02', 'p11', 'p25'];

// ---------- key handling ----------
function readKey() {
  if (process.env.NAN_API_KEY) return process.env.NAN_API_KEY.trim();
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return null;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?NAN_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

// ---------- what the app speaks ----------
// Everything below is fixed text from data/problems.fr.json, spoken by js/app.js and js/ui.js:
//   chunk        each statement sentence (start, "Suivant", "Répéter")
//   question     the question (step 2 and "Écouter la question"); it repeats a chunk, so it reuses that chunk's file
//   asked        each "Qu'est-ce qu'on cherche ?" option, spoken when tapped
//   explanation  the answer explanation ("Écouter l'explication")
function itemsFor(problem) {
  const items = problem.chunks.map((text, i) => ({ role: `c${i}`, kind: 'chunk', text }));
  const sameAsChunk = problem.chunks.findIndex((c) => c === problem.question);
  if (sameAsChunk < 0) items.push({ role: 'q', kind: 'question', text: problem.question });
  problem.asked.options.forEach((text, i) => items.push({ role: `a${i}`, kind: 'asked', text }));
  items.push({ role: 'e', kind: 'explanation', text: problem.explanation });
  return items.map((it) => {
    const spoken = normalizeForSpeech(it.text);
    return { ...it, id: problem.id, file: `${problem.id}-${it.role}.mp3`, spoken, hash: hashOf(spoken) };
  });
}

// The hash covers model, voice, speed and the normalized text, so changing any of them regenerates the file.
const hashOf = (spoken) => crypto.createHash('sha256').update(`${MODEL}|${VOICE}|${SPEED}|${spoken}`).digest('hex').slice(0, 16);

// Manifest entry for one problem: files are paths relative to the site root.
function manifestEntry(problem, items) {
  const ref = (it) => ({ file: `audio/${it.file}`, hash: it.hash });
  const chunks = items.filter((it) => it.kind === 'chunk');
  const question = items.find((it) => it.kind === 'question') ?? chunks[problem.chunks.findIndex((c) => c === problem.question)];
  return {
    chunks: chunks.map(ref),
    question: ref(question),
    asked: items.filter((it) => it.kind === 'asked').map(ref),
    explanation: ref(items.find((it) => it.kind === 'explanation')),
  };
}

const AUDIO_DIR = path.join(ROOT, 'audio');
const MANIFEST = path.join(ROOT, 'data/audio-manifest.json');
const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { problems: {} });
const upToDate = (it, manifest) => {
  const e = manifest.problems?.[it.id];
  const known = e && [...e.chunks, e.question, ...e.asked, e.explanation].find((r) => r.file === `audio/${it.file}`);
  const f = path.join(AUDIO_DIR, it.file);
  return !!known && known.hash === it.hash && fs.existsSync(f) && fs.statSync(f).size >= MIN_BYTES;
};

// ---------- API ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthesize(spoken, key) {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, voice: VOICE, speed: SPEED, input: spoken, response_format: 'mp3' }),
        signal: AbortSignal.timeout(60000),
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!type.includes('audio/mpeg')) throw new Error(`unexpected content-type "${type}"`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < MIN_BYTES) throw new Error(`response too small (${bytes.length} bytes)`);
      return bytes;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < RETRIES) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(lastError); // messages never include headers or the key
}

// ---------- main ----------
const total = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

async function runSample(problems, key) {
  const outDir = path.join(ROOT, 'audio-sample');
  fs.mkdirSync(outDir, { recursive: true });
  const items = SAMPLE_IDS.map((id) => problems.find((p) => p.id === id)).filter(Boolean).flatMap(itemsFor);
  const transcript = [];
  let done = 0;
  for (const it of items) {
    const out = path.join(outDir, it.file);
    try {
      fs.writeFileSync(out, await synthesize(it.spoken, key));
      done++;
      console.log(`ok   ${path.relative(ROOT, out)}  (${it.kind})`);
    } catch (err) {
      console.error(`FAIL ${it.file}: ${err.message}`);
      process.exitCode = 1;
    }
    transcript.push(`${it.file}\n  affiché : ${it.text}\n  lu      : ${it.spoken}\n`);
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(path.join(outDir, 'transcript.txt'), transcript.join('\n'));
  console.log(`\n${done}/${items.length} files in audio-sample/ (transcript.txt lists the text sent for each file)`);
}

function runVerify(problems) {
  const manifest = readManifest();
  const stale = problems.flatMap(itemsFor).filter((it) => !upToDate(it, manifest));
  for (const it of stale) console.error(`missing or outdated: ${it.file}  "${it.text}"`);
  const all = problems.flatMap(itemsFor).length;
  console.log(`${all - stale.length}/${all} audio files up to date`);
  process.exit(stale.length ? 1 : 0);
}

async function runFull(problems, key) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const old = readManifest();
  const manifest = { voice: VOICE, model: MODEL, speed: SPEED, problems: {} };
  let generated = 0, failed = 0, kept = 0;
  for (const problem of problems) {
    const items = itemsFor(problem);
    for (const it of items) {
      if (upToDate(it, old)) { kept++; continue; }
      try {
        fs.writeFileSync(path.join(AUDIO_DIR, it.file), await synthesize(it.spoken, key));
        generated++;
        console.log(`ok   audio/${it.file}  (${it.kind})`);
      } catch (err) {
        failed++;
        it.failed = true;
        console.error(`FAIL ${it.file}: ${err.message}`);
      }
      await sleep(DELAY_MS);
    }
    if (!items.some((it) => it.failed)) manifest.problems[problem.id] = manifestEntry(problem, items);
  }
  // Files no longer referenced (for example a problem lost a chunk) are removed.
  const wanted = new Set(problems.flatMap(itemsFor).map((it) => it.file));
  for (const f of fs.readdirSync(AUDIO_DIR)) if (f.endsWith('.mp3') && !wanted.has(f)) { fs.unlinkSync(path.join(AUDIO_DIR, f)); console.log(`removed audio/${f}`); }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const size = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.mp3')).reduce((n, f) => n + fs.statSync(path.join(AUDIO_DIR, f)).size, 0);
  console.log(`\ngenerated ${generated}, already up to date ${kept}, failed ${failed}. audio/ total: ${total(size)}`);
  if (failed) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const problems = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/problems.fr.json'), 'utf8'));
  if (args.includes('--verify')) return runVerify(problems);
  const key = readKey();
  if (!key) {
    console.error('NAN_API_KEY not found: set it in the environment or add the line NAN_API_KEY=... to ./.env');
    process.exit(1);
  }
  return args.includes('--sample') ? runSample(problems, key) : runFull(problems, key);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
