// Thin wrapper around speechSynthesis: French voice selection and one-utterance-at-a-time speech.
const SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function pickVoice(voices) {
  const frCA = voices.filter((v) => /^fr[-_]ca$/i.test(v.lang));
  const frFR = voices.filter((v) => /^fr[-_]fr$/i.test(v.lang));
  const anyFr = voices.filter((v) => /^fr/i.test(v.lang));
  return frCA[0] || frFR[0] || anyFr[0] || null;
}

// status: 'loading' | 'ok' | 'no-french' | 'unsupported'
export function createVoice() {
  let status = SUPPORTED ? 'loading' : 'unsupported';
  let voice = null;
  let current = null; // keeps a reference so the utterance is not garbage collected mid-speech
  const listeners = new Set();

  function setStatus(next) {
    if (next === status) return;
    status = next;
    listeners.forEach((fn) => fn(status));
  }

  function refresh() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return false;
    voice = pickVoice(voices);
    setStatus(voice ? 'ok' : 'no-french');
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

  return {
    speak,
    cancel,
    status: () => status,
    onStatus: (fn) => listeners.add(fn),
  };
}
