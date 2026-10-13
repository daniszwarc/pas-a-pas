// State machine for the per-problem flow. Pure functions: state in, new state out.
export const PHASES = [
  { n: 1, label: 'Écouter' },
  { n: 2, label: 'La question' },
  { n: 3, label: 'Les données' },
  { n: 4, label: "Ce qu'on me demande" },
  { n: 5, label: 'Le plan' },
  { n: 6, label: 'Le calcul' },
  { n: 7, label: 'Vérifier' },
];
export const REVEAL = 8;

export function createState(problem, now) {
  return {
    problem,
    step: 1,
    chunk: 0,
    replays: problem.chunks.map(() => 0),
    wordTaps: 0,
    marks: problem.numbers.map(() => null), // null | 'relevant' | 'irrelevant'
    asked: null,
    plan: [],
    answer: '',
    verified: null, // 'oui' | 'non' | 'jsp'
    verifyNo: [], // answers she kept typing when she said "Non"
    ms: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    phaseStart: now,
  };
}

export function parseAnswer(text) {
  return /^\d+(,\d*)?$/.test(text) ? Number(text.replace(',', '.')) : null;
}

export function canContinue(s) {
  const p = s.problem;
  switch (s.step) {
    case 1: return s.chunk === p.chunks.length - 1;
    case 2: return true;
    case 3: return s.marks.includes('relevant');
    case 4: return s.asked !== null;
    case 5: return s.plan.length === p.steps;
    default: return false;
  }
}

function enter(s, step, now, patch = {}) {
  const ms = { ...s.ms };
  if (s.step >= 1 && s.step <= 7) ms[s.step] += now - s.phaseStart;
  return { ...s, ...patch, ms, step, phaseStart: now };
}

const NEXT_MARK = { null: 'relevant', relevant: 'irrelevant', irrelevant: null };

export function reduce(s, a, now) {
  const p = s.problem;
  switch (a.type) {
    case 'chunk-next':
      return s.chunk < p.chunks.length - 1 ? { ...s, chunk: s.chunk + 1 } : s;
    case 'chunk-replay': {
      const replays = s.replays.slice();
      replays[s.chunk] += 1;
      return { ...s, replays };
    }
    case 'word-tap':
      return { ...s, wordTaps: s.wordTaps + 1 };
    case 'continue':
      return canContinue(s) ? enter(s, s.step + 1, now) : s;
    case 'toggle-mark': {
      const marks = s.marks.slice();
      marks[a.i] = NEXT_MARK[marks[a.i]];
      return { ...s, marks };
    }
    case 'pick-asked':
      return { ...s, asked: a.i };
    case 'pick-plan': {
      if (s.plan.includes(a.i)) return { ...s, plan: s.plan.filter((i) => i !== a.i) };
      if (p.steps === 1) return { ...s, plan: [a.i] };
      return s.plan.length < p.steps ? { ...s, plan: [...s.plan, a.i] } : s;
    }
    case 'key': {
      let v = s.answer;
      if (a.key === 'back') v = v.slice(0, -1);
      else if (a.key === ',') {
        if (v.includes(',')) return s;
        v = v === '' ? '0,' : v + ',';
      } else if (v.length < 8) v = (v === '0' ? '' : v) + a.key;
      return { ...s, answer: v };
    }
    case 'submit-answer':
      return parseAnswer(s.answer) === null ? s : enter(s, 7, now, { verified: null });
    case 'verify':
      if (a.choice === 'oui') return enter(s, REVEAL, now, { verified: 'oui' });
      return {
        ...s,
        verified: a.choice,
        verifyNo: a.choice === 'non' ? [...s.verifyNo, s.answer] : s.verifyNo,
      };
    case 'reveal':
      return enter(s, REVEAL, now);
    case 'back-to-asked':
      return enter(s, 4, now, { answer: '', verified: null });
    default:
      return s;
  }
}

// Error type rules: a wrong "asked" choice, or "Non" kept with the same answer, is lost_the_question;
// otherwise the answer is looked up in wrongAnswerTypes; otherwise "other".
export function evaluate(s) {
  const p = s.problem;
  const value = parseAnswer(s.answer);
  const correct = value !== null && Math.abs(value - p.answer) < 1e-9;
  if (correct) return { correct, errorType: null, value };
  let errorType;
  if (s.asked !== p.asked.correct || s.verifyNo.includes(s.answer)) errorType = 'lost_the_question';
  else {
    const key = Object.keys(p.wrongAnswerTypes).find((k) => Math.abs(Number(k) - value) < 1e-9);
    errorType = key === undefined ? 'other' : p.wrongAnswerTypes[key];
  }
  return { correct, errorType, value };
}

export function toAttempt(s, { now, settings, sessionElapsedMs, pauseShown }) {
  const p = s.problem;
  const { correct, errorType, value } = evaluate(s);
  return {
    timestamp: new Date(now).toISOString(),
    problemId: p.id,
    schema: p.schema,
    keywordConsistency: p.keywordConsistency,
    steps: p.steps,
    questionPosition: p.questionPosition,
    chosenAsked: { index: s.asked, text: p.asked.options[s.asked], correct: s.asked === p.asked.correct },
    markedData: p.numbers.map((n, i) => ({ value: n.value, mark: s.marks[i], relevant: n.relevant })),
    chosenPlan: s.plan.map((i) => ({ index: i, text: p.plan.options[i] })),
    answer: value,
    correct,
    errorType,
    replayCountPerChunk: s.replays,
    wordTapCount: s.wordTaps,
    msPerPhase: s.ms,
    activeSettings: { ...settings },
    sessionElapsedMs,
    pauseShown,
  };
}
