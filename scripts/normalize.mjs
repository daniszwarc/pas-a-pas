// Prepares French text for text-to-speech. Only the spoken copy changes; displayed text is never touched.
// Pure functions, no dependencies. Used by scripts/generate-audio.mjs at build time.

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize'];
const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

// `fin`: nothing numeric follows, so "vingt" and "cent" take their plural "s" (quatre-vingts, deux cents).
function below100(n, fin) {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const t = Math.floor(n / 10), u = n % 10;
  if (t <= 6) return u === 0 ? TENS[t] : u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  if (t === 7) return u === 1 ? 'soixante et onze' : `soixante-${below100(n - 60, fin)}`;
  if (t === 8) return u === 0 ? (fin ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${UNITS[u]}`;
  return `quatre-vingt-${below100(n - 80, fin)}`;
}

function below1000(n, fin) {
  const h = Math.floor(n / 100), r = n % 100;
  if (h === 0) return below100(r, fin);
  const cent = h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 && fin ? 's' : ''}`;
  return r === 0 ? cent : `${cent} ${below100(r, fin)}`;
}

// Whole number (0 to 999 999 999) as French words.
export function integerToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999999) throw new RangeError(`unsupported number: ${n}`);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
  const parts = [];
  if (millions) parts.push(`${below1000(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (thousands) parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
  if (rest) parts.push(below1000(rest, true));
  return parts.join(' ');
}

// Digits after a comma: "5" -> "cinq", "25" -> "vingt-cinq", "05" -> "zéro cinq", "008" -> "zéro zéro huit".
function fractionToWords(digits) {
  if (digits.length > 3) return [...digits].map((d) => UNITS[Number(d)]).join(' ');
  const zeros = digits.match(/^0*/)[0].length;
  const rest = digits.slice(zeros);
  return [...Array(zeros).fill('zéro'), rest ? integerToWords(Number(rest)) : null].filter(Boolean).join(' ');
}

// Ordinal suffix on cardinal words: cinq -> cinquième, neuf -> neuvième, quatre -> quatrième, vingts -> vingtième.
function toOrdinal(words) {
  const i = Math.max(words.lastIndexOf(' '), words.lastIndexOf('-')) + 1;
  let last = words.slice(i);
  if (last === 'un') last = 'unième';
  else if (last === 'cinq') last = 'cinquième';
  else if (last === 'neuf') last = 'neuvième';
  else if (/(e|s)$/.test(last) && last !== 'trois' && last !== 'six' && last !== 'dix') last = `${last.slice(0, -1)}ième`;
  else last = `${last}ième`;
  return words.slice(0, i) + last;
}

// Nouns that make a trailing "un" feminine ("vingt et une mesures"). Covers the words used in the problems.
const FEMININE = new Set(['mesures', 'mesure', 'billes', 'bille', 'tasses', 'tasse', 'crêpes', 'crêpe', 'pages', 'page',
  'planches', 'planche', 'bouteilles', 'bouteille', 'personnes', 'personne', 'notes', 'note', 'recettes', 'recette',
  'rangées', 'rangée', 'filles', 'fille', 'heures', 'heure', 'minutes', 'minute', 'semaines', 'semaine', 'fois',
  'cabanes', 'cabane', 'pièces', 'pièce', 'casquettes', 'casquette', 'règles', 'règle', 'courses', 'course']);

const UNIT_WORDS = {
  'km/h': { one: 'kilomètre à l’heure', many: 'kilomètres à l’heure' },
  km: { one: 'kilomètre', many: 'kilomètres' },
  'm²': { one: 'mètre carré', many: 'mètres carrés' },
  m: { one: 'mètre', many: 'mètres' },
  cm: { one: 'centimètre', many: 'centimètres' },
  kg: { one: 'kilogramme', many: 'kilogrammes' },
  g: { one: 'gramme', many: 'grammes' },
  L: { one: 'litre', many: 'litres' },
  mL: { one: 'millilitre', many: 'millilitres' },
  min: { one: 'minute', many: 'minutes', fem: true },
  h: { one: 'heure', many: 'heures', fem: true },
};

const NUMBER_WITH_UNIT =
  /(\d{1,3}(?: \d{3})+|\d+)(?:,(\d+))?(?: ?(\$|%|km\/h|m²|km|cm|kg|mL|min|m|g|L|h)(?![\p{L}\d²/]))?/gu;

function feminize(words) {
  return /(^| |-)un$/.test(words) ? `${words}e` : words;
}

function numberToWords(intPart, frac) {
  return frac === undefined ? integerToWords(intPart) : `${integerToWords(intPart)} virgule ${fractionToWords(frac)}`;
}

function spokenMoney(intPart, frac) {
  if (frac === undefined) return `${integerToWords(intPart)} ${intPart < 2 ? 'dollar' : 'dollars'}`;
  const cents = Number(frac.padEnd(2, '0').slice(0, 2));
  if (intPart === 0) return `${integerToWords(cents)} ${cents < 2 ? 'cent' : 'cents'}`;
  const dollars = `${integerToWords(intPart)} ${intPart < 2 ? 'dollar' : 'dollars'}`;
  return cents ? `${dollars} ${integerToWords(cents)}` : dollars;
}

export function normalizeForSpeech(text) {
  let s = text.replace(/[  ]/g, ' ');

  // Ordinals: 1er, 1re, 2e, 3e...
  s = s.replace(/\b(\d+)(er|re|ère|ème|e)\b/gu, (_, d, suffix) => {
    const n = Number(d);
    if (n === 1) return suffix === 'er' ? 'premier' : 'première';
    return toOrdinal(integerToWords(n));
  });

  s = s.replace(NUMBER_WITH_UNIT, (match, intText, frac, unit, offset) => {
    const intPart = Number(intText.replace(/ /g, ''));
    if (unit === '$') return spokenMoney(intPart, frac);
    if (unit === '%') return `${numberToWords(intPart, frac)} pour cent`;
    if (unit) {
      const u = UNIT_WORDS[unit];
      const value = Number(`${intPart}.${frac ?? 0}`);
      const words = numberToWords(intPart, frac);
      return `${u.fem && frac === undefined ? feminize(words) : words} ${value < 2 ? u.one : u.many}`;
    }
    const words = numberToWords(intPart, frac);
    const next = s.slice(offset + match.length).match(/^ ([\p{L}]+)/u)?.[1]?.toLowerCase();
    return frac === undefined && next && FEMININE.has(next) ? feminize(words) : words;
  });

  s = s
    .replace(/ \+ /g, ' plus ')
    .replace(/ [−–-] /g, ' moins ')
    .replace(/ × /g, ' fois ')
    .replace(/ ÷ /g, ' divisé par ')
    .replace(/ = /g, ' égale ');

  return s.replace(/\s+/g, ' ').trim();
}
