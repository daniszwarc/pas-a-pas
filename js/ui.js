// DOM rendering. Every render function returns an element; all state lives in the caller.
import { PHASES, canContinue, evaluate, parseAnswer } from './steps.js';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}

const NBSP = ' ';
const fmt = (n) => String(n).replace('.', ',');
const withUnit = (n, unit) => `${fmt(n)}${NBSP}${unit}`;

const btn = (label, onclick, o = {}) =>
  h('button', { type: 'button', class: o.cls, onclick, disabled: o.disabled, 'data-key': o.key,
    'aria-label': o.aria, 'aria-pressed': o.pressed === undefined ? null : String(o.pressed) }, label);

const audioBtn = (ctx, text, label = 'Écouter') =>
  ctx.voiceActive ? btn(`🔊 ${label}`, () => ctx.speak(text), { aria: `${label} : ${text}`, key: 'audio' }) : null;

const title = (text) => h('h2', { class: 'screen-title', tabindex: '-1' }, text);

// ---------- text tokens ----------
const NUM_RE = /^([^\d]*)(\d+(?: \d{3})*(?:,\d+)?)([^\d]*)$/;

function spoken(token) {
  const m = token.match(NUM_RE);
  return m ? m[2] : token.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}$]+$/gu, '');
}

// Renders chunks as paragraphs of tappable words. numIndex counts numbers across the whole statement.
function statement(state, ctx, { mode }) {
  let numIndex = 0;
  return state.problem.chunks.map((text, ci) => {
    const words = text.split(' ').flatMap((token, wi) => {
      const sep = wi ? ' ' : null;
      const isNum = NUM_RE.test(token);
      const word = spoken(token);
      if (mode === 'data' && isNum) {
        const i = numIndex++;
        const mark = state.marks[i];
        const level = ctx.settings.dataHelp;
        const cls = ['word', level === 2 && 'num', level === 1 && 'num-b', mark && `mark-${mark}`].filter(Boolean).join(' ');
        const label = { relevant: 'utile', irrelevant: 'inutile' }[mark] || 'non marqué';
        return [sep, h('button', { type: 'button', class: cls, 'data-key': `num-${i}`, 'aria-label': `${word}, ${label}`,
          onclick: () => { ctx.dispatch({ type: 'word-tap' }); ctx.speak(word); ctx.dispatch({ type: 'toggle-mark', i }); } }, token)];
      }
      return [sep, h('button', { type: 'button', class: 'word',
        onclick: () => { ctx.dispatch({ type: 'word-tap' }); ctx.speak(word); } }, token)];
    });
    const active = mode === 'listen' && ci === state.chunk;
    return h('p', { class: `chunk${active ? ' active' : ''}`, 'aria-current': active ? 'true' : null }, words);
  });
}

// ---------- question box ----------
export function renderQuestionBox(state, ctx, large = false) {
  return h('aside', { class: `qbox${large ? ' large' : ''}`, 'aria-label': 'Question' },
    h('p', {}, state.problem.question), audioBtn(ctx, state.problem.question, 'Écouter la question'));
}

// ---------- steps ----------
function phaseLine(step) {
  const ph = PHASES[step - 1];
  return h('p', { class: 'phase' }, `Étape ${ph.n} sur 7 · ${ph.label}`);
}

const nextBtn = (state, ctx, label = 'Continuer') =>
  btn(label, () => ctx.dispatch({ type: 'continue' }), { cls: 'primary big', disabled: !canContinue(state), key: 'next' });

function stepListen(state, ctx) {
  const last = state.chunk === state.problem.chunks.length - 1;
  const current = state.problem.chunks[state.chunk];
  return [
    phaseLine(1), title('Écoute'),
    h('p', { class: 'hint' }, 'Touche un mot pour l’entendre.'),
    statement(state, ctx, { mode: 'listen' }),
    h('div', { class: 'row' },
      ctx.voiceActive ? btn('↻ Répéter', () => { ctx.dispatch({ type: 'chunk-replay' }); ctx.speak(current); }, { key: 'replay' }) : null,
      last ? btn('J’ai compris', () => ctx.dispatch({ type: 'continue' }), { cls: 'primary big', key: 'next' })
           : btn('Suivant →', () => ctx.dispatch({ type: 'chunk-next' }), { cls: 'primary big', key: 'next' })),
  ];
}

const stepQuestion = (state, ctx) => [
  phaseLine(2), title('Voici la question'),
  h('div', { class: 'row' }, nextBtn(state, ctx)),
];

const stepData = (state, ctx) => [
  phaseLine(3), title('Les données'),
  h('p', {}, 'Touche les nombres dont tu as besoin.'),
  h('p', { class: 'hint' }, 'Touche une 2e fois un nombre inutile.'),
  statement(state, ctx, { mode: 'data' }),
  h('div', { class: 'row' }, nextBtn(state, ctx)),
];

const stepAsked = (state, ctx) => [
  phaseLine(4), title('Qu’est-ce qu’on cherche ?'),
  h('div', { class: 'stack' }, state.problem.asked.options.map((opt, i) =>
    btn(opt, () => { ctx.dispatch({ type: 'pick-asked', i }); ctx.speak(opt); },
      { cls: 'big', pressed: state.asked === i, key: `asked-${i}` }))),
  h('div', { class: 'row' }, nextBtn(state, ctx)),
];

function stepPlan(state, ctx) {
  const p = state.problem;
  return [
    phaseLine(5), title('Le plan'),
    h('p', {}, p.steps === 1 ? 'Choisis l’opération.' : `Touche les ${p.steps} étapes dans l’ordre.`),
    h('div', { class: 'stack' }, p.plan.options.map((opt, i) => {
      const pos = state.plan.indexOf(i);
      return h('button', { type: 'button', class: 'big tile', 'data-key': `plan-${i}`, 'aria-pressed': String(pos >= 0),
        disabled: pos < 0 && p.steps > 1 && state.plan.length >= p.steps,
        onclick: () => ctx.dispatch({ type: 'pick-plan', i }) },
        p.steps > 1 && pos >= 0 ? h('span', { class: 'badge', 'aria-hidden': 'true' }, String(pos + 1)) : null, opt);
    })),
    h('div', { class: 'row' }, nextBtn(state, ctx)),
  ];
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'back'];

function gridPad() {
  const canvas = h('canvas', { class: 'grid-canvas', role: 'img',
    'aria-label': 'Zone de calcul quadrillée. Dessine avec le doigt.' });
  const g = canvas.getContext('2d');
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    g.lineWidth = 3 * dpr; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d2530';
  };
  requestAnimationFrame(fit);
  let drawing = false;
  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; canvas.setPointerCapture(e.pointerId);
    g.beginPath(); g.moveTo(...pt(e)); g.lineTo(...pt(e)); g.stroke();
  });
  canvas.addEventListener('pointermove', (e) => { if (drawing) { g.lineTo(...pt(e)); g.stroke(); } });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  return h('div', {}, canvas,
    h('div', { class: 'row' }, btn('Effacer le quadrillage', () => g.clearRect(0, 0, canvas.width, canvas.height))));
}

function stepCalc(state, ctx) {
  const p = state.problem;
  const data = p.numbers.map((n, i) => (state.marks[i] === 'relevant' ? fmt(n.value) : null)).filter(Boolean);
  return [
    phaseLine(6), title('Le calcul'),
    h('p', {}, 'Mes données :'),
    h('div', { class: 'chips' }, data.map((d) => h('span', { class: 'chip' }, d))),
    h('p', {}, `Je cherche : ${p.asked.options[state.asked]}`),
    h('p', {}, `Mon plan : ${state.plan.map((i) => p.plan.options[i]).join(' → ')}`),
    gridPad(),
    h('output', { id: 'answer-display', class: 'answer-display', 'aria-live': 'polite' }, answerText(state)),
    h('div', { class: 'keypad' }, KEYS.map((k) =>
      btn(k === 'back' ? '⌫' : k, () => ctx.dispatch({ type: 'key', key: k }),
        { aria: k === 'back' ? 'Effacer le dernier chiffre' : k === ',' ? 'virgule' : k, key: `key-${k}` }))),
    h('div', { class: 'row' },
      btn('Valider ma réponse', () => ctx.dispatch({ type: 'submit-answer' }),
        { cls: 'primary big', disabled: parseAnswer(state.answer) === null, key: 'submit' })),
  ];
}

function answerText(state) {
  return state.answer === '' ? '…' : `${state.answer}${NBSP}${state.problem.unit}`;
}

// Keypad taps update only the display so the grid-paper drawing is not lost.
export function updateAnswer(state) {
  const out = document.getElementById('answer-display');
  if (out) out.textContent = answerText(state);
  const submit = document.querySelector('[data-key="submit"]');
  if (submit) submit.disabled = parseAnswer(state.answer) === null;
}

function stepVerify(state, ctx) {
  const mine = withUnit(parseAnswer(state.answer), state.problem.unit);
  const head = [phaseLine(7), title('Vérifier'), h('p', {}, `Ta réponse : ${mine}`)];
  if (!state.verified) {
    return [...head,
      h('p', {}, 'Est-ce que ta réponse répond à la question ?'),
      h('div', { class: 'stack' },
        btn('Oui', () => ctx.dispatch({ type: 'verify', choice: 'oui' }), { cls: 'big', key: 'oui' }),
        btn('Non', () => ctx.dispatch({ type: 'verify', choice: 'non' }), { cls: 'big', key: 'non' }),
        btn('Je ne sais pas', () => ctx.dispatch({ type: 'verify', choice: 'jsp' }), { cls: 'big', key: 'jsp' }))];
  }
  return [...head,
    h('p', {}, 'Pas de problème. On peut revoir le plan.'),
    h('div', { class: 'stack' },
      btn('Revenir au plan', () => ctx.dispatch({ type: 'back-to-asked' }), { cls: 'primary big', key: 'back' }),
      btn('Voir la réponse', () => ctx.dispatch({ type: 'reveal' }), { cls: 'big', key: 'reveal' }))];
}

function stepReveal(state, ctx, { onNext, onHome, saveFailed }) {
  const p = state.problem;
  const { correct, value } = evaluate(state);
  return [
    title('La réponse'),
    h('p', { class: 'big' }, `La réponse est : ${withUnit(p.answer, p.unit)}`),
    h('p', {}, correct ? 'Ta réponse est la même.' : `Ta réponse était : ${withUnit(value, p.unit)}`),
    h('p', {}, p.explanation),
    saveFailed ? h('p', { class: 'hint' }, 'Cet essai n’a pas pu être enregistré sur cet appareil.') : null,
    h('div', { class: 'row' },
      audioBtn(ctx, p.explanation, 'Écouter l’explication'),
      btn('Autre problème', onNext, { cls: 'primary big', key: 'next' }),
      btn('Accueil', onHome, { key: 'home' })),
  ];
}

// Returns the whole problem screen (question box + current step).
export function renderProblem(state, ctx, extra) {
  const body = {
    1: stepListen, 2: stepQuestion, 3: stepData, 4: stepAsked, 5: stepPlan, 6: stepCalc, 7: stepVerify,
    8: (s, c) => stepReveal(s, c, extra),
  }[state.step](state, ctx);
  const qbox = state.step === 1 ? null : renderQuestionBox(state, ctx, state.step === 2);
  return h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn('‹ Accueil', extra.onHome, { cls: 'link', key: 'home-top' })),
    qbox, body);
}

// ---------- other screens ----------
export function renderHome({ onStart, onSettings, onParents }) {
  return h('section', { class: 'screen' },
    h('h1', { class: 'screen-title', tabindex: '-1' }, 'Pas à pas'),
    h('p', {}, 'On résout un problème, une étape à la fois.'),
    h('div', { class: 'row' }, btn('Commencer', onStart, { cls: 'primary big', key: 'start' })),
    h('div', { class: 'row' },
      btn('Réglages', onSettings, { key: 'settings' }),
      btn('Parents', onParents, { cls: 'link', key: 'parents' })));
}

export function renderPause({ onContinue, onStop }) {
  return h('section', { class: 'screen' },
    title('On fait une pause ?'),
    h('p', {}, 'Tu peux continuer ou t’arrêter ici. C’est toi qui choisis.'),
    h('div', { class: 'row' },
      btn('Continuer', onContinue, { cls: 'primary big', key: 'continue' }),
      btn('Terminer', onStop, { cls: 'big', key: 'stop' })));
}

const BG_LABELS = { blanc: 'Blanc cassé', creme: 'Crème', gris: 'Gris pâle', bleu: 'Bleu pâle' };

function choices(legend, options, current, onPick) {
  return h('fieldset', {}, h('legend', {}, legend),
    h('div', { class: 'row' }, options.map(([value, label]) =>
      btn(label, () => onPick(value), { pressed: current === value, key: `${legend}-${value}` }))));
}

export function renderSettings(settings, { onChange, onHome, onTestVoice }) {
  const rate = Math.round(settings.rate * 10) / 10;
  const step = (d) => onChange({ rate: Math.min(1.2, Math.max(0.7, Math.round((rate + d) * 10) / 10)) });
  return h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn('‹ Accueil', onHome, { cls: 'link', key: 'home-top' })),
    title('Réglages'),
    choices('Voix', [[true, 'Activée'], [false, 'Désactivée']], settings.voiceOn, (v) => onChange({ voiceOn: v })),
    h('fieldset', {}, h('legend', {}, `Vitesse de la voix : ${fmt(rate)}`),
      h('div', { class: 'row' },
        btn('Plus lent', () => step(-0.1), { disabled: rate <= 0.7, key: 'slower' }),
        btn('Plus vite', () => step(0.1), { disabled: rate >= 1.2, key: 'faster' }),
        btn('🔊 Essayer', onTestVoice, { key: 'try' }))),
    choices('Taille du texte', [[18, 'Petit'], [20, 'Normal'], [24, 'Grand'], [28, 'Très grand']], settings.fontSize, (v) => onChange({ fontSize: v })),
    choices('Espace entre les lettres', [[0, 'Normal'], [0.05, 'Large'], [0.1, 'Plus large'], [0.15, 'Très large']], settings.letterSpacing, (v) => onChange({ letterSpacing: v })),
    choices('Espace entre les lignes', [[1.5, 'Serré'], [1.7, 'Normal'], [2, 'Large'], [2.3, 'Très large']], settings.lineHeight, (v) => onChange({ lineHeight: v })),
    choices('Couleur de fond', Object.entries(BG_LABELS), settings.bg, (v) => onChange({ bg: v })),
    choices('Aide pour les données', [[2, 'Nombres en évidence'], [1, 'Nombres en gras'], [0, 'Aucune aide']], settings.dataHelp, (v) => onChange({ dataHelp: v })));
}

const ERROR_LABELS = {
  intermediate_as_answer: 'Résultat d’une étape donné comme réponse',
  wrong_operation: 'Mauvaise opération',
  wrong_numbers: 'Mauvais nombres',
  lost_the_question: 'Question perdue de vue',
  other: 'Autre',
};

export function renderParents(stats, { onExport, onHome }) {
  const row = (a, b) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, String(b)));
  return h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn('‹ Accueil', onHome, { cls: 'link', key: 'home-top' })),
    title('Espace parents'),
    h('p', {}, `Nombre d’essais : ${stats.count}`),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('caption', {}, 'Essais selon le résultat'),
      h('tbody', {}, row('Réponses correctes', stats.correct),
        Object.entries(ERROR_LABELS).map(([k, label]) => row(label, stats.errors[k] || 0))))),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('caption', {}, 'Temps moyen par étape (secondes)'),
      h('tbody', {}, PHASES.map((ph) => row(`${ph.n}. ${ph.label}`,
        stats.avgMs[ph.n] === null ? '—' : fmt(Math.round(stats.avgMs[ph.n] / 100) / 10)))))),
    h('div', { class: 'row' }, btn('Exporter JSON', onExport, { cls: 'primary', key: 'export' })));
}
