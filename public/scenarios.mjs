// scenarios.mjs — three workloads, each with a different natural trigger.
// Kept in sync with examples/scenarios.json (a test asserts parity).

// The shared ambient world: turns from two sessions, spread over 10 timeline
// slots. Slots 3 and 4 are idle — nothing fires there unless a clock does.
export const AMBIENT_TURNS = [
  { at: 0, session: 'A', cost: 4 },
  { at: 1, session: 'B', cost: 5 },
  { at: 2, session: 'A', cost: 4 },
  { at: 5, session: 'A', cost: 6 },
  { at: 6, session: 'B', cost: 5 },   // cumulative spend 24 — breaches the 20 cap
  { at: 7, session: 'A', cost: 7 },
  { at: 8, session: 'B', cost: 4 },
  { at: 9, session: 'A', cost: 5 },
];

export const SCENARIOS = [
  {
    id: 'migration',
    name: 'Schema migration',
    kind: 'converging',
    correctTrigger: 'goal',
    params: { total: 40, step: 7 },
    blurb: '40 files to rewrite, then it is done. A checkable finish line.',
  },
  {
    id: 'monitor',
    name: 'Uptime monitor',
    kind: 'recurring',
    correctTrigger: 'cron',
    params: { slots: 10, downAt: [4] },
    blurb: 'Never "done" — it needs a wake-up on a schedule, not a verdict.',
  },
  {
    id: 'guard',
    name: 'Budget guard',
    kind: 'cross-cutting',
    correctTrigger: 'hook',
    params: { budget: 20 },
    blurb: 'A spend cap over every session. A policy to intercept, not a task to finish.',
  },
];

export function scenarioById(id) {
  const s = SCENARIOS.find(x => x.id === id);
  if (!s) throw new Error(`unknown scenario: ${id}`);
  return s;
}

export function createTask(id) {
  const { params } = scenarioById(id);
  if (id === 'migration') return migrationTask(params);
  if (id === 'monitor') return monitorTask(params);
  if (id === 'guard') return guardTask(params);
  throw new Error(`no factory for scenario: ${id}`);
}

// --- converging: progress toward a finish line ------------------------------

function migrationTask({ total = 40, step = 7 } = {}) {
  const state = { migrated: 0, total };
  const done = s => s.migrated >= s.total;
  const task = {
    id: 'migration', kind: 'converging', state,
    condition: done,
    run() {
      state.migrated = Math.min(total, state.migrated + step);
      return { migrated: state.migrated, total };
    },
    tick(i) {
      const wasted = done(state); // accounting only — the clock does not check
      task.run();
      return { wasted, migrated: state.migrated, total };
    },
    intercept(turn) {
      const wasted = done(state);
      task.run();
      return { verdict: 'ran', session: turn.session, wasted, migrated: state.migrated, total };
    },
    assess(trigger, r) {
      if (trigger === 'goal') {
        return r.status === 'success'
          ? { status: 'success', note: `Converged in ${r.runs} iterations — the evaluator said "done" and the loop exited.` }
          : { status: r.status, note: r.note };
      }
      if (trigger === 'cron') {
        return r.wastedRuns > 0
          ? { status: 'wasteful', note: `Done after run ${r.runs - r.wastedRuns}, but the clock kept ticking — ${r.wastedRuns} runs burned after the finish line.` }
          : { status: 'ok', note: 'The schedule happened to line up with the finish line.' };
      }
      return {
        status: 'uncontrolled',
        note: `Progress rode ambient turns — ${r.wastedRuns} runs fired after done, on whichever session happened to turn.`,
      };
    },
  };
  return task;
}

// --- recurring: no finish line, needs a wake-up -----------------------------

function monitorTask({ slots = 10, downAt = [4] } = {}) {
  const state = { checks: 0, detected: [] };
  const isDown = slot => downAt.includes(slot);
  const observe = slot => {
    state.checks += 1;
    const down = isDown(slot);
    if (down) state.detected.push(slot);
    return { slot, status: down ? 'down' : 'up' };
  };
  const missed = () => downAt.filter(s => !state.detected.includes(s));
  const task = {
    id: 'monitor', kind: 'recurring', state,
    condition: null, // "are we done yet?" has no answer — that is the point
    run() { return observe((state.checks) % slots); },
    tick(i) { return observe(i - 1); },
    intercept(turn) { return { verdict: 'ran', session: turn.session, ...observe(turn.at) }; },
    assess(trigger, r) {
      if (trigger === 'goal') {
        return {
          status: 'exhausted',
          note: `No condition exists to satisfy — the loop ran every check to the cap (${r.runs} iterations) and still had no answer.`,
        };
      }
      const m = missed();
      if (trigger === 'cron') {
        return m.length === 0
          ? { status: 'ok', note: `${r.runs} scheduled checks — the outage at slot ${downAt.join(', ')} was caught.` }
          : { status: 'blind-spot', note: `Missed the outage at slot ${m.join(', ')}.` };
      }
      return m.length
        ? { status: 'blind-spot', note: `Checks fired only when a turn happened — the outage at slot ${m.join(', ')} fell in an idle gap.` }
        : { status: 'ok', note: 'Every check happened on a turn — luck, not schedule.' };
    },
  };
  return task;
}

// --- cross-cutting: a policy over ambient turns ------------------------------

function guardTask({ budget = 20, turns = AMBIENT_TURNS } = {}) {
  const state = { spent: 0, haltedAt: null };
  const task = {
    id: 'guard', kind: 'cross-cutting', state,
    // In goal mode the evaluator inspects THIS loop's context — the spend
    // lives in other sessions' turns, so the condition is unobservable.
    condition: () => null,
    run() { return { note: 'inspected own transcript — no spend in context' }; },
    tick(i) {
      // The clock samples the ledger at the end of slot i-1. It can see the
      // breach after the fact; it cannot block the turn that caused it.
      const slot = i - 1;
      const spent = turns.filter(t => t.at <= slot).reduce((a, t) => a + t.cost, 0);
      return { slot, spent, breach: spent > budget };
    },
    intercept(turn) {
      state.spent += turn.cost;
      if (state.spent > budget) {
        state.haltedAt = turn.at;
        return { verdict: 'halt', session: turn.session, spent: state.spent };
      }
      return { verdict: 'allow', session: turn.session, spent: state.spent };
    },
    assess(trigger, r) {
      if (trigger === 'goal') {
        return {
          status: 'exhausted',
          note: `The breach never enters the loop's own context — the evaluator inspected ${r.runs} times and found nothing to check.`,
        };
      }
      if (trigger === 'cron') {
        const hit = r.trace.find(t => t.outcome.breach);
        if (!hit) return { status: 'ok', note: 'No breach inside the sampled window.' };
        const finalSpend = r.trace[r.trace.length - 1].outcome.spent;
        return {
          status: 'detected-late',
          note: `First saw the breach at tick ${hit.tick} with spend already at ${hit.outcome.spent} — the turn that caused it had run. Nothing blocks the rest (final spend ${finalSpend}).`,
        };
      }
      const halted = r.trace.find(t => t.outcome.verdict === 'halt');
      if (!halted) return { status: 'ok', note: 'Every turn allowed — spend stayed under budget.' };
      const skipped = r.trace.filter(t => t.outcome.verdict === 'skipped').length;
      return {
        status: 'intercepted',
        note: `Halted after turn ${halted.i} (session ${halted.turn.session}) — spend capped at ${halted.outcome.spent}; ${skipped} later turns never ran.`,
      };
    },
  };
  return task;
}
