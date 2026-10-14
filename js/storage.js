// IndexedDB wrapper for attempts (promise based) + localStorage settings.
const DB_NAME = 'pas-a-pas';
const STORE = 'attempts';
const SETTINGS_KEY = 'pas-a-pas.settings';

export const DEFAULT_SETTINGS = {
  voiceOn: true,
  recordedVoice: true,
  rate: 0.9,
  fontSize: 20,
  letterSpacing: 0,
  lineHeight: 1.7,
  bg: 'blanc',
  dataHelp: 2,
};

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const addAttempt = (attempt) => run('readwrite', (s) => s.add(attempt));
export const getAttempts = () => run('readonly', (s) => s.getAll());

export function exportAttempts(attempts) {
  const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pas-a-pas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: settings just won't persist */
  }
}
