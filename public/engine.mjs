// engine.mjs — the three run-modes that decide WHEN an agent acts.
// This lab models trigger semantics (when control logic fires), not agent
// intelligence. Tasks live in scenarios.mjs; each exposes the same surface:
//   run()        — one unit of work, called by the goal loop
//   tick(i)      — what a clock tick does
//   intercept(t) — what a hook does after ambient turn `t`
//   condition    — (state) => true | false | null (null = not observable here)

export const SAFETY_CAP = 8;   // lab fallback when a goal loop has no exit
export const COST_PER_RUN = 2; // abstract budget unit per run / fire

// readOnly wraps state so the evaluator can inspect but never mutate.
// Any write through this view throws — verdict and work stay separated.
export function readOnly(obj) {
  return new Proxy(obj, {
    get(target, key) {
      const value = target[key];
      return value && typeof value === 'object' ? readOnly(value) : value;
    },
    set() { throw new TypeError('evaluator must not mutate state — inspect, don\'t act'); },
    deleteProperty() { throw new TypeError('evaluator must not mutate state — inspect, don\'t act'); },
    defineProperty() { throw new TypeError('evaluator must not mutate state — inspect, don\'t act'); },
    setPrototypeOf() { throw new TypeError('evaluator must not mutate state — inspect, don\'t act'); },
  });
}

// The evaluator. It reads a read-only view of the state and returns a verdict.
// It never executes work — that is the whole point of the separation.
// condition(state) => true | false, or null when the finish line is not
// observable from this loop's context.
export function evaluate(state, condition) {
  if (condition == null) {
    return { done: false, observable: false, reason: 'no-finish-line' };
  }
  const verdict = condition(readOnly(state));
  if (verdict === null) {
    return { done: false, observable: false, reason: 'not-in-context' };
  }
  return { done: Boolean(verdict), observable: true };
}

// CONDITION-DRIVEN: run → evaluate → check condition → continue if needed.
// Exits on `done`, or burns to the cap when the condition never resolves.
export function runGoal(task, { cap = SAFETY_CAP, costPerRun = COST_PER_RUN } = {}) {
  const trace = [];
  let blind = false;
  for (let i = 1; i <= cap; i++) {
    const outcome = task.run();
    const verdict = evaluate(task.state, task.condition);
    trace.push({ iteration: i, outcome, verdict });
    if (!verdict.observable) blind = true;
    if (verdict.done) {
      return {
        trigger: 'goal', status: 'success', runs: i, cost: i * costPerRun, trace,
        note: `Evaluator read "done" after run ${i} — the loop exits on the condition, not on a clock.`,
      };
    }
  }
  return {
    trigger: 'goal', status: 'exhausted', runs: cap, cost: cap * costPerRun, trace,
    reason: blind ? 'unobservable' : 'never-satisfied',
    note: blind
      ? 'The finish line is not in this loop\'s context — the evaluator inspects and finds nothing it can check.'
      : 'The condition never came true — the meter ran to the safety cap.',
  };
}

// CLOCK-DRIVEN: run → wait → run again. The tick never consults the condition.
// waste is accounted after the fact — the clock itself never looks.
export function runCron(task, { ticks = 10, costPerRun = COST_PER_RUN } = {}) {
  const trace = [];
  let wastedRuns = 0;
  for (let i = 1; i <= ticks; i++) {
    const alreadyDone = task.condition ? task.condition(task.state) === true : false;
    const outcome = task.tick(i);
    if (alreadyDone) wastedRuns += 1;
    trace.push({ tick: i, alreadyDone, outcome });
  }
  return { trigger: 'cron', status: null, runs: ticks, wastedRuns, cost: ticks * costPerRun, trace };
}

// EVENT-DRIVEN: the hook fires after every ambient turn — whichever session
// produced it. A `halt` verdict stops the stream; later turns are skipped.
export function runHooks(task, { turns, costPerRun = COST_PER_RUN } = {}) {
  const trace = [];
  let fired = 0;
  let wastedRuns = 0;
  let halted = false;
  for (let i = 0; i < turns.length; i++) {
    if (halted) {
      trace.push({ i: i + 1, turn: turns[i], outcome: { verdict: 'skipped' } });
      continue;
    }
    const outcome = task.intercept(turns[i]);
    fired += 1;
    if (outcome.wasted) wastedRuns += 1;
    if (outcome.verdict === 'halt') halted = true;
    trace.push({ i: i + 1, turn: turns[i], outcome });
  }
  return { trigger: 'hook', status: null, fired, runs: fired, wastedRuns, cost: fired * costPerRun, trace };
}
