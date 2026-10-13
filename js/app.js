import { loadSettings, saveSettings, addAttempt, getAttempts, exportAttempts } from './storage.js';
import { createVoice } from './voice.js';
import { createState, reduce, toAttempt, REVEAL } from './steps.js';
import * as ui from './ui.js';

const PAUSE_AFTER_MS = 15 * 60 * 1000;
const root = document.getElementById('app');
const noticeEl = document.getElementById('notice');
const voice = createVoice();

let settings = loadSettings();
let problems = [];
let view = 'home'; // home | settings | parents | problem | pause
let state = null;
let saveFailed = false;
let session = newSession();

function newSession() {
  return { start: null, anchor: null, base: [], baseline: null, recent: [], pauseShown: false };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- settings ----------
function applySettings() {
  const st = document.documentElement.style;
  st.setProperty('--fs', `${settings.fontSize}px`);
  st.setProperty('--ls', `${settings.letterSpacing}em`);
  st.setProperty('--lh', String(settings.lineHeight));
  document.documentElement.dataset.bg = settings.bg;
}

const voiceActive = () => settings.voiceOn && voice.status() === 'ok';
const speak = (text) => { if (settings.voiceOn) voice.speak(text, settings.rate); };

function updateNotice() {
  const status = voice.status();
  const msg = {
    'no-french': 'Aucune voix française n’a été trouvée sur cet appareil. L’application fonctionne sans le son.',
    unsupported: 'La lecture à voix haute n’est pas disponible sur cet appareil. L’application fonctionne sans le son.',
  }[status];
  noticeEl.textContent = settings.voiceOn && msg ? msg : '';
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
  if (view === 'home') show(ui.renderHome({ onStart: startNext, onSettings: () => go('settings'), onParents: () => go('parents') }), animate);
  else if (view === 'settings') {
    show(ui.renderSettings(settings, {
      onChange: (patch) => { settings = { ...settings, ...patch }; saveSettings(settings); applySettings(); updateNotice(); render(); },
      onHome: () => go('home'),
      onTestVoice: () => speak('Bonjour, je lis les problèmes à voix haute.'),
    }), animate);
  } else if (view === 'parents') {
    getAttempts().then(
      (attempts) => show(ui.renderParents(computeStats(attempts), { onExport: () => exportAttempts(attempts), onHome: () => go('home') }), animate),
      () => show(ui.renderParents(computeStats([]), { onExport: () => {}, onHome: () => go('home') }), animate));
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
  const errors = {};
  let correct = 0;
  const sums = {}, counts = {};
  for (const a of attempts) {
    if (a.correct) correct += 1;
    else errors[a.errorType] = (errors[a.errorType] || 0) + 1;
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
    now, settings: { ...settings, voiceName: voice.activeName() },
    sessionElapsedMs: now - session.start,
    pauseShown: session.pauseShown,
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

async function pickProblem() {
  let counts = {};
  try { for (const a of await getAttempts()) counts[a.problemId] = (counts[a.problemId] || 0) + 1; } catch { counts = {}; }
  const last = state?.problem.id;
  const pool = problems.filter((p) => p.id !== last);
  return (pool.length ? pool : problems).reduce((best, p) => ((counts[p.id] || 0) < (counts[best.id] || 0) ? p : best));
}

async function startNext() {
  if (!problems.length) return;
  const problem = await pickProblem();
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
  render();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
