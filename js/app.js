import { loadSettings, saveSettings, addAttempt, getAttempts, exportAttempts } from './storage.js';
import { createVoice } from './voice.js';
import { createState, reduce, toAttempt, REVEAL } from './steps.js';
import * as ui from './ui.js';

const PAUSE_AFTER_MS = 15 * 60 * 1000;
const root = document.getElementById('app');
const noticeEl = document.getElementById('notice');
const voice = createVoice();

let settings = loadSettings();
const LEVEL_KEY = 'pas-a-pas.level';
let level = loadLevel();
let problems = [];
let view = 'home'; // home | settings | parents | problem | pause | endpass
let state = null;
let saveFailed = false;
let priorAttempts = 0; // earlier attempts of the problem on screen
let session = newSession();

function newSession() {
  return { start: null, anchor: null, base: [], baseline: null, recent: [], pauseShown: false };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- school level (chosen on the Parents screen, kept apart from the display settings) ----------
function loadLevel() {
  try {
    const saved = localStorage.getItem(LEVEL_KEY);
    return ui.LEVELS.some(([v]) => v === saved) ? saved : 'sec1';
  } catch {
    return 'sec1';
  }
}

function setLevel(next) {
  level = next;
  try { localStorage.setItem(LEVEL_KEY, level); } catch { /* storage blocked: level just won't persist */ }
  render();
}

// ---------- settings ----------
function applySettings() {
  const st = document.documentElement.style;
  st.setProperty('--fs', `${settings.fontSize}px`);
  st.setProperty('--ls', `${settings.letterSpacing}em`);
  st.setProperty('--lh', String(settings.lineHeight));
  document.documentElement.dataset.bg = settings.bg;
}

// displayed text -> recorded mp3 path, built from data/audio-manifest.json (empty when there is no manifest)
let recordedFiles = new Map();
const recordedOn = () => settings.recordedVoice && recordedFiles.size > 0;
const voiceSource = () => (recordedOn() ? 'recorded' : 'system');

const voiceActive = () => settings.voiceOn && (recordedOn() || voice.status() === 'ok');

// Statement chunks, questions, "asked" options and explanations play the recording; anything else (single words)
// uses the system voice, and so does a recording that is missing or fails to load.
function speak(text) {
  if (!settings.voiceOn) return;
  const file = recordedOn() ? recordedFiles.get(text) : null;
  if (file) voice.play(file, settings.rate).then((ok) => { if (!ok) voice.speak(text, settings.rate); });
  else voice.speak(text, settings.rate);
}

function indexRecordings(manifest) {
  const files = new Map();
  for (const p of problems) {
    const e = manifest.problems?.[p.id];
    if (!e) continue;
    p.chunks.forEach((t, i) => e.chunks[i] && files.set(t, e.chunks[i].file));
    files.set(p.question, e.question.file);
    p.asked.options.forEach((t, i) => e.asked[i] && files.set(t, e.asked[i].file));
    files.set(p.explanation, e.explanation.file);
  }
  return files;
}

function updateNotice() {
  const status = voice.status();
  const msg = {
    'no-french': 'Aucune voix française n’a été trouvée sur cet appareil. L’application fonctionne sans le son.',
    unsupported: 'La lecture à voix haute n’est pas disponible sur cet appareil. L’application fonctionne sans le son.',
  }[status];
  noticeEl.textContent = settings.voiceOn && !recordedOn() && msg ? msg : '';
  noticeEl.hidden = !noticeEl.textContent;
}

// ---------- rendering ----------
let lastKey = '';

function show(el, animate = true) {
  const focusKey = document.activeElement?.dataset?.key;
  if (animate) el.classList.add('fade');
  root.replaceChildren(el);
  const target = (!animate && focusKey && root.querySelector(`[data-key="${focusKey}"]`)) || root.querySelector('.screen-title');
  target?.focus({ preventScroll: !animate });
  if (animate) window.scrollTo(0, 0);
}

function render() {
  updateNotice();
  // Only animate and re-focus the title when the screen (or step) changes.
  const key = view === 'problem' ? `problem-${state.step}` : view;
  const animate = key !== lastKey;
  lastKey = key;
  if (view === 'home') show(ui.renderHome({ onStart: () => startNext(), onSettings: () => go('settings'), onParents: () => go('parents') }), animate);
  else if (view === 'settings') {
    show(ui.renderSettings(settings, {
      onChange: (patch) => { settings = { ...settings, ...patch }; saveSettings(settings); applySettings(); updateNotice(); render(); },
      onHome: () => go('home'),
      onTestVoice: () => speak('Bonjour, je lis les problèmes à voix haute.'),
    }), animate);
  } else if (view === 'parents') {
    getAttempts().then(
      (attempts) => show(ui.renderParents(computeStats(attempts), { level, onLevel: setLevel, onExport: () => exportAttempts(attempts), onHome: () => go('home') }), animate),
      () => show(ui.renderParents(computeStats([]), { level, onLevel: setLevel, onExport: () => {}, onHome: () => go('home') }), animate));
  } else if (view === 'endpass') {
    show(ui.renderEndOfPass({ onRestart: () => startNext(true), onStop: () => { session = newSession(); go('home'); } }), animate);
  } else if (view === 'pause') {
    show(ui.renderPause({ onContinue: continueAfterPause, onStop: () => { session = newSession(); go('home'); } }), animate);
  } else {
    show(ui.renderProblem(state, ctx, { onNext: nextProblem, onHome: () => go('home'), saveFailed }), animate);
  }
}

function go(next) {
  voice.cancel();
  view = next;
  render();
}

function computeStats(attempts) {
  // errors[type] and correct are [first-time, repeat]. Old records lack attemptNumber: derive it from their order.
  const errors = {};
  const correct = [0, 0];
  const sums = {}, counts = {}, seen = {};
  for (const a of attempts) {
    seen[a.problemId] = (seen[a.problemId] || 0) + 1;
    const col = (a.attemptNumber ?? seen[a.problemId]) > 1 ? 1 : 0;
    if (a.correct) correct[col] += 1;
    else (errors[a.errorType] ||= [0, 0])[col] += 1;
    for (const [n, ms] of Object.entries(a.msPerPhase)) { sums[n] = (sums[n] || 0) + ms; counts[n] = (counts[n] || 0) + 1; }
  }
  const avgMs = {};
  for (let n = 1; n <= 7; n++) avgMs[n] = counts[n] ? sums[n] / counts[n] : null;
  return { count: attempts.length, correct, errors, avgMs };
}

// ---------- problem flow ----------
const ctx = {
  dispatch,
  speak,
  get settings() { return settings; },
  get voiceActive() { return voiceActive(); },
};

function dispatch(action) {
  const prev = state;
  state = reduce(prev, action, Date.now());
  if (state === prev) return;
  if (state.step !== prev.step) voice.cancel();

  if (action.type === 'key') return ui.updateAnswer(state);
  if (action.type === 'word-tap') return;

  if (state.step === REVEAL && prev.step !== REVEAL) finishAttempt();
  render();

  if (action.type === 'chunk-next') speak(state.problem.chunks[state.chunk]);
  else if (action.type === 'continue' && state.step === 2) speak(state.problem.question);
}

function finishAttempt() {
  const now = Date.now();
  const attempt = toAttempt(state, {
    now, settings: { ...settings, voiceName: voice.activeName(), voiceSource: voiceSource() },
    sessionElapsedMs: now - session.start,
    pauseShown: session.pauseShown,
    attemptNumber: priorAttempts + 1,
  });
  saveFailed = false;
  addAttempt(attempt).catch(() => { saveFailed = true; if (view === 'problem') render(); });
  // Phases 3, 4, 5 and 7 are the "response time" interactions; 1 (listening) and 6 (calculating) are naturally long.
  for (const n of [3, 4, 5, 7]) {
    const ms = state.ms[n];
    if (session.baseline === null) {
      session.base.push(ms);
      if (session.base.length === 5) session.baseline = median(session.base);
    } else session.recent.push(ms);
  }
}

// Deterministic shuffle so a pass keeps the same order across reloads (seeded by level and pass number).
function seededOrder(list, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// A "pass" is one attempt of every problem of the level. Pass 1 follows file order, later passes a seeded shuffle.
// The pass in progress is the lowest attempt count; when all counts are equal and >= 1, a pass has just ended.
async function pickProblem(skipEndCard) {
  const counts = {};
  let lastId = null;
  try {
    const attempts = await getAttempts();
    for (const a of attempts) counts[a.problemId] = (counts[a.problemId] || 0) + 1;
    lastId = attempts.at(-1)?.problemId ?? null;
  } catch { /* no history: behave like a first pass */ }
  const atLevel = problems.filter((p) => p.level === level);
  const all = atLevel.length ? atLevel : problems; // a level with no problems falls back to everything
  const n = (p) => counts[p.id] || 0;
  const pass = Math.min(...all.map(n));
  if (pass >= 1 && !skipEndCard && all.every((p) => n(p) === pass)) return { endOfPass: true };
  const order = pass >= 1 ? seededOrder(all, `${level}:${pass}`) : all;
  const open = order.filter((p) => n(p) === pass);
  const skip = new Set([lastId, state?.problem.id]); // no immediate repeat, also right after a reload
  return { problem: open.find((p) => !skip.has(p.id)) ?? open[0], prior: pass };
}

async function startNext(skipEndCard = false) {
  if (!problems.length) return;
  const pick = await pickProblem(skipEndCard);
  if (pick.endOfPass) return go('endpass');
  const problem = pick.problem;
  priorAttempts = pick.prior;
  const now = Date.now();
  session.start ??= now;
  session.anchor ??= now;
  state = createState(problem, now);
  saveFailed = false;
  view = 'problem';
  render();
  speak(problem.chunks[0]);
}

function shouldPause() {
  if (Date.now() - session.anchor >= PAUSE_AFTER_MS) return true;
  return session.baseline > 0 && session.recent.length >= 5 && median(session.recent.slice(-5)) > 2 * session.baseline;
}

function nextProblem() {
  if (shouldPause()) {
    session.pauseShown = true;
    go('pause');
  } else startNext();
}

function continueAfterPause() {
  session.anchor = Date.now();
  session.recent = [];
  startNext();
}

// ---------- boot ----------
voice.onStatus(updateNotice);
applySettings();

async function boot() {
  try {
    const res = await fetch('data/problems.fr.json');
    problems = await res.json();
  } catch {
    root.textContent = 'Impossible de charger les problèmes.';
    return;
  }
  try {
    const res = await fetch('data/audio-manifest.json');
    if (res.ok) recordedFiles = indexRecordings(await res.json());
  } catch { /* no recordings: the system voice is used */ }
  render();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
