import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integerToWords, normalizeForSpeech as n } from './normalize.mjs';

const NB = ' ';

test('integers 0 to 69', () => {
  for (const [v, w] of [[0, 'zéro'], [1, 'un'], [11, 'onze'], [16, 'seize'], [17, 'dix-sept'], [19, 'dix-neuf'], [20, 'vingt'],
    [21, 'vingt et un'], [22, 'vingt-deux'], [31, 'trente et un'], [45, 'quarante-cinq'], [61, 'soixante et un'], [69, 'soixante-neuf']])
    assert.equal(integerToWords(v), w);
});

test('integers 70 to 99', () => {
  for (const [v, w] of [[70, 'soixante-dix'], [71, 'soixante et onze'], [72, 'soixante-douze'], [77, 'soixante-dix-sept'],
    [79, 'soixante-dix-neuf'], [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [85, 'quatre-vingt-cinq'], [90, 'quatre-vingt-dix'],
    [91, 'quatre-vingt-onze'], [97, 'quatre-vingt-dix-sept'], [99, 'quatre-vingt-dix-neuf']])
    assert.equal(integerToWords(v), w);
});

test('hundreds: cent and cents', () => {
  for (const [v, w] of [[100, 'cent'], [101, 'cent un'], [180, 'cent quatre-vingts'], [200, 'deux cents'], [201, 'deux cent un'],
    [280, 'deux cent quatre-vingts'], [500, 'cinq cents'], [999, 'neuf cent quatre-vingt-dix-neuf']])
    assert.equal(integerToWords(v), w);
});

test('thousands and millions', () => {
  for (const [v, w] of [[1000, 'mille'], [1001, 'mille un'], [2000, 'deux mille'], [4000, 'quatre mille'],
    [21000, 'vingt et un mille'], [80000, 'quatre-vingt mille'], [200000, 'deux cent mille'], [1500, 'mille cinq cents'],
    [1000000, 'un million'], [2000000, 'deux millions'], [80000000, 'quatre-vingts millions']])
    assert.equal(integerToWords(v), w);
  assert.equal(n('12 000 $'), 'douze mille dollars');
  assert.equal(n(`2${NB}500 mL`), 'deux mille cinq cents millilitres');
});

test('decimals read with "virgule"', () => {
  assert.equal(n('1,5 litre'), 'un virgule cinq litre');
  assert.equal(n('0,25 litre'), 'zéro virgule vingt-cinq litre');
  assert.equal(n('7,5 litres'), 'sept virgule cinq litres');
  assert.equal(n('3,05 kg'), 'trois virgule zéro cinq kilogrammes');
  assert.equal(n('0,008'), 'zéro virgule zéro zéro huit');
  assert.equal(n('2,3 kg'), 'deux virgule trois kilogrammes');
});

test('dollars: singular for 1, plural otherwise, cents read as a number', () => {
  assert.equal(n('1 $'), 'un dollar');
  assert.equal(n(`1${NB}$`), 'un dollar');
  assert.equal(n(`45${NB}$.`), 'quarante-cinq dollars.');
  assert.equal(n(`80${NB}$`), 'quatre-vingts dollars');
  assert.equal(n('12 $ le kilo'), 'douze dollars le kilo');
  assert.equal(n(`3,50${NB}$`), 'trois dollars cinquante');
  assert.equal(n(`3,75${NB}$`), 'trois dollars soixante-quinze');
  assert.equal(n(`1,25${NB}$`), 'un dollar vingt-cinq');
  assert.equal(n(`0,50${NB}$`), 'cinquante cents');
  assert.equal(n(`10,50${NB}$.`), 'dix dollars cinquante.');
});

test('percent', () => {
  assert.equal(n(`30${NB}%`), 'trente pour cent');
  assert.equal(n('1 %'), 'un pour cent');
  assert.equal(n('2,5 %'), 'deux virgule cinq pour cent');
  assert.equal(n(`Les taxes sont de 15${NB}%.`), 'Les taxes sont de quinze pour cent.');
});

test('units: km, km/h, m, m², cm, kg, g, L, mL, min, h', () => {
  assert.equal(n('18 km/h'), 'dix-huit kilomètres à l’heure');
  assert.equal(n('1 km/h'), 'un kilomètre à l’heure');
  assert.equal(n('3 km'), 'trois kilomètres');
  assert.equal(n('8 m'), 'huit mètres');
  assert.equal(n('1,2 m'), 'un virgule deux mètre');
  assert.equal(n('5 m²'), 'cinq mètres carrés');
  assert.equal(n('480 cm'), 'quatre cent quatre-vingts centimètres');
  assert.equal(n('2,5 kg'), 'deux virgule cinq kilogrammes');
  assert.equal(n('0,5 kg'), 'zéro virgule cinq kilogramme');
  assert.equal(n('250 g'), 'deux cent cinquante grammes');
  assert.equal(n('4 L'), 'quatre litres');
  assert.equal(n('500 mL'), 'cinq cents millilitres');
  assert.equal(n('15 min'), 'quinze minutes');
  assert.equal(n('3 heures'), 'trois heures');
  assert.equal(n('9 h.'), 'neuf heures.');
  assert.equal(n('1 h'), 'une heure');
  assert.equal(n('9 h 30'), 'neuf heures trente');
});

test('units only match whole tokens right after a number', () => {
  assert.equal(n('Il a 3 mètres de fil.'), 'Il a trois mètres de fil.');
  assert.equal(n('Il a 4 grands sacs.'), 'Il a quatre grands sacs.');
  assert.equal(n('Une règle mesure 8 m de long.'), 'Une règle mesure huit mètres de long.');
});

test('feminine "une" before feminine nouns', () => {
  assert.equal(n('21 mesures'), 'vingt et une mesures');
  assert.equal(n('1 tasse'), 'une tasse');
  assert.equal(n('31 personnes'), 'trente et une personnes');
  assert.equal(n('31 bonbons'), 'trente et un bonbons');
  assert.equal(n('81 billes'), 'quatre-vingt-une billes');
});

test('ordinals', () => {
  assert.equal(n('la 1re planche'), 'la première planche');
  assert.equal(n('le 1er jour'), 'le premier jour');
  assert.equal(n('la 2e planche'), 'la deuxième planche');
  assert.equal(n('3e'), 'troisième');
  assert.equal(n('4e'), 'quatrième');
  assert.equal(n('5e'), 'cinquième');
  assert.equal(n('9e'), 'neuvième');
  assert.equal(n('21e'), 'vingt et unième');
});

test('operators in explanations', () => {
  assert.equal(n('12 + 15 = 27'), 'douze plus quinze égale vingt-sept');
  assert.equal(n('45 − 18 = 27'), 'quarante-cinq moins dix-huit égale vingt-sept');
  assert.equal(n('3 × 8 = 24'), 'trois fois huit égale vingt-quatre');
  assert.equal(n('8 ÷ 2 = 4'), 'huit divisé par deux égale quatre');
  assert.equal(n(`Le rabais est 30${NB}% de 80${NB}$, soit 24${NB}$.`), 'Le rabais est trente pour cent de quatre-vingts dollars, soit vingt-quatre dollars.');
});

test('whole sentences', () => {
  assert.equal(n(`Samuel a 45${NB}$.`), 'Samuel a quarante-cinq dollars.');
  assert.equal(n('Chaque bidon contient 2,5 litres.'), 'Chaque bidon contient deux virgule cinq litres.');
  assert.equal(n('Elle roule à 18 km/h.'), 'Elle roule à dix-huit kilomètres à l’heure.');
});

test('every spoken text of the problem set is free of digits and symbols', () => {
  const problems = JSON.parse(fs.readFileSync(new URL('../data/problems.fr.json', import.meta.url), 'utf8'));
  const texts = problems.flatMap((p) => [...p.chunks, p.question, ...p.asked.options, p.explanation]);
  assert.ok(texts.length > 250);
  for (const t of texts) {
    const out = n(t);
    assert.ok(!/\d|[$%+×÷=−²]|undefined|NaN/.test(out), `not fully normalized: "${t}" -> "${out}"`);
  }
});

test('out-of-range numbers throw instead of being read wrongly', () => {
  assert.throws(() => integerToWords(1e12), RangeError);
});
