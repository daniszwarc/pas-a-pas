// Thin wrapper around speechSynthesis: French voice selection and one-utterance-at-a-time speech.
// createVoice() returns a single shared instance so the settings screen and the app use the same voice.
const SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const URI_KEY = 'pas-a-pas.voiceURI';
const BETTER = /premium|enhanced|améliorée|natural/i;
const DEPRIORITIZED = ['Grandma', 'Grandpa', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
  'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox'].map((n) => n.toLowerCase());

export const voiceLang = (v) => v.lang.replace('_', '-');
const isCA = (v) => /^fr-ca$/i.test(voiceLang(v));
const isFR = (v) => /^fr-fr$/i.test(voiceLang(v));
const deprioritized = (v) => DEPRIORITIZED.some((n) => v.name.toLowerCase().includes(n));

// Never returns an online voice (localService === false).
function defaultVoice(frVoices) {
  const local = frVoices.filter((v) => v.localService);
  return (
    local.find((v) => BETTER.test(v.name) && isCA(v)) ||
    local.find((v) => BETTER.test(v.name)) ||
    local.find((v) => isCA(v) && !deprioritized(v)) ||
    local.find((v) => isFR(v) && !deprioritized(v)) ||
    local.find((v) => !deprioritized(v)) ||
    local[0] ||
    null
  );
}

// fr-CA first, then fr-FR, then others; alphabetical inside each group.
function sortVoices(voices) {
  const group = (v) => (isCA(v) ? 0 : isFR(v) ? 1 : 2);
  return [...voices].sort((a, b) => group(a) - group(b) || a.name.localeCompare(b.name, 'fr'));
}

function savedURI() {
  try { return localStorage.getItem(URI_KEY); } catch { return null; }
}

// Recorded voice: pre-generated mp3 files (see scripts/generate-audio.mjs), recorded at speed 0.9.
// Each file is fetched into a Blob and played from a Blob URL on ONE shared Audio element. The element never gets a
// service-worker URL as its src: that avoids Range/206 handling, which iOS Safari insists on for media elements.
const RECORDED_SPEED = 0.9;
const BLOB_CACHE_MAX = 12;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// status: 'loading' | 'ok' | 'no-french' | 'unsupported'
let instance = null;

export function createVoice() {
  if (instance) return instance;
  let status = SUPPORTED ? 'loading' : 'unsupported';
  let voice = null;
  let frVoices = [];
  let current = null; // keeps a reference so the utterance is not garbage collected mid-speech
  const statusListeners = new Set();
  const voiceListeners = new Set();

  function setStatus(next) {
    if (next === status) return;
    status = next;
    statusListeners.forEach((fn) => fn(status));
  }

  function choose() {
    const saved = savedURI();
    voice = frVoices.find((v) => v.voiceURI === saved) || defaultVoice(frVoices);
    setStatus(voice ? 'ok' : 'no-french');
    voiceListeners.forEach((fn) => fn());
  }

  function refresh() {
    const all = speechSynthesis.getVoices();
    if (!all.length) return false;
    frVoices = sortVoices(all.filter((v) => /^fr/i.test(v.lang)));
    choose();
    return true;
  }

  if (SUPPORTED) {
    speechSynthesis.addEventListener('voiceschanged', refresh);
    if (!refresh()) {
      // Some browsers never fire voiceschanged when no voice exists.
      setTimeout(() => {
        if (status === 'loading') setStatus('no-french');
      }, 2000);
    }
  }

  // ----- recorded audio -----
  let audio = null;
  let playToken = 0; // bumped by every cancel(), so a slow load never plays over a newer request
  const blobs = new Map(); // mp3 URL -> Blob URL, oldest first

  function getAudio() {
    if (!audio && typeof Audio !== 'undefined') audio = new Audio();
    return audio;
  }

  async function blobUrlFor(url) {
    let blobUrl = blobs.get(url);
    if (blobUrl) { blobs.delete(url); blobs.set(url, blobUrl); return blobUrl; }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blobUrl = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }));
    blobs.set(url, blobUrl);
    if (blobs.size > BLOB_CACHE_MAX) {
      const [oldUrl, oldBlob] = blobs.entries().next().value;
      blobs.delete(oldUrl);
      URL.revokeObjectURL(oldBlob);
    }
    return blobUrl;
  }

  // Resolves true when the file played (or was superseded by a newer request), false when the caller should fall back.
  async function play(url, rate = 0.9) {
    const a = getAudio();
    if (!a) return false;
    cancel();
    const token = playToken;
    try {
      const blobUrl = await blobUrlFor(url);
      if (token !== playToken) return true;
      a.src = blobUrl;
      a.defaultPlaybackRate = a.playbackRate = clamp(rate / RECORDED_SPEED, 0.7, 1.3);
      a.preservesPitch = true;
      await a.play();
      return true;
    } catch {
      return token !== playToken;
    }
  }

  // iOS only lets an Audio element play from code after it has played once from a user gesture.
  function unlockAudio() {
    for (const name of UNLOCK_EVENTS) document.removeEventListener(name, unlockAudio, true);
    const a = getAudio();
    if (!a) return;
    a.src = SILENT_WAV;
    a.play().then(() => { if (a.src === SILENT_WAV) a.pause(); }, () => {});
  }
  const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
  if (typeof document !== 'undefined') for (const name of UNLOCK_EVENTS) document.addEventListener(name, unlockAudio, true);

  function cancel() {
    playToken++;
    audio?.pause();
    if (SUPPORTED) speechSynthesis.cancel();
    current = null;
  }

  function speak(text, rate = 0.9) {
    if (status !== 'ok' || !text) return;
    cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    current = u;
    speechSynthesis.speak(u);
  }

  function select(uri) {
    try { localStorage.setItem(URI_KEY, uri); } catch { /* choice just won't persist */ }
    choose();
  }

  instance = {
    speak,
    play,
    cancel,
    select,
    list: () => frVoices,
    selectedURI: () => voice?.voiceURI ?? null,
    activeName: () => voice?.name ?? null,
    status: () => status,
    onStatus: (fn) => statusListeners.add(fn),
    onVoices: (fn) => voiceListeners.add(fn),
    offVoices: (fn) => voiceListeners.delete(fn),
  };
  return instance;
}
