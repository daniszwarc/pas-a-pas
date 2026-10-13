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

  function cancel() {
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
