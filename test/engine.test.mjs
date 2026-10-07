import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, runGoal, runCron, runHooks, readOnly, SAFETY_CAP } from '../public/engine.mjs';
import { createTask, AMBIENT_TURNS } from '../public/scenarios.mjs';

test('goal loop converges on a finish-line task and exits', () => {
  const r = runGoal(createTask('migration'));
  assert.equal(r.status, 'success');
  assert.equal(r.runs, 6); // 7*6 = 42 >= 40
  assert.equal(r.cost, 12);
  assert.equal(r.trace.at(-1).verdict.done, true);
});

test('evaluator is a pure inspector — mutation through its view throws', () => {
  const state = { migrated: 20, total: 40 };
  assert.throws(
    () => evaluate(state, s => { s.migrated = 99; return true; }),
    /must not mutate/,
  );
  assert.equal(state.migrated, 20, 'state untouched by evaluation');
});

test('readOnly view allows reads but blocks writes at any depth', () => {
  const view = readOnly({ a: { b: 1 } });
  assert.equal(view.a.b, 1);
  assert.throws(() => { view.a.b = 2; }, /must not mutate/);
  assert.throws(() => { delete view.a; }, /must not mutate/);
});

test('null condition is unobservable — evaluator cannot answer "done"', () => {
  const v = evaluate({ anything: 1 }, null);
  assert.equal(v.done, false);
  assert.equal(v.observable, false);
  assert.equal(v.reason, 'no-finish-line');
});

test('goal loop on a never-done task burns to the safety cap', () => {
  const r = runGoal(createTask('monitor'));
  assert.equal(r.status, 'exhausted');
  assert.equal(r.runs, SAFETY_CAP);
  assert.equal(r.cost, SAFETY_CAP * 2);
});

test('goal loop on a cross-session policy sees nothing to check', () => {
  const r = runGoal(createTask('guard'));
  assert.equal(r.status, 'exhausted');
  assert.equal(r.reason, 'unobservable');
});

test('cron loop ticks on schedule regardless of done-ness', () => {
  const r = runCron(createTask('migration'), { ticks: 10 });
  assert.equal(r.runs, 10);
  assert.equal(r.wastedRuns, 4); // ticks 7-10 after done at tick 6
  assert.ok(r.trace[9].alreadyDone);
});

test('cron loop catches the outage a goal loop could not report', () => {
  const r = runCron(createTask('monitor'), { ticks: 10 });
  const downTicks = r.trace.filter(t => t.outcome.status === 'down');
  assert.deepEqual(downTicks.map(t => t.tick), [5]); // slot 4 -> tick 5
});

test('hook fires once per ambient turn — and halts the stream on breach', () => {
  const r = runHooks(createTask('guard'), { turns: AMBIENT_TURNS });
  assert.equal(r.fired, 5); // turns 1-5 inspected; the 5th breached
  const halt = r.trace.find(t => t.outcome.verdict === 'halt');
  assert.equal(halt.i, 5);
  assert.equal(halt.outcome.spent, 24);
  const skipped = r.trace.filter(t => t.outcome.verdict === 'skipped');
  assert.equal(skipped.length, 3);
});

test('hook on a converging task wastes runs on unrelated turns', () => {
  const r = runHooks(createTask('migration'), { turns: AMBIENT_TURNS });
  assert.equal(r.fired, AMBIENT_TURNS.length);
  assert.equal(r.wastedRuns, 2); // turns 7-8 fired after done
  const sessions = new Set(r.trace.map(t => t.outcome.session));
  assert.ok(sessions.has('A') && sessions.has('B'), 'fires on every session');
});

test('hook on a recurring task misses events in idle gaps', () => {
  const r = runHooks(createTask('monitor'), { turns: AMBIENT_TURNS });
  const checked = new Set(r.trace.map(t => t.outcome.slot));
  assert.equal(checked.has(4), false, 'idle slot 4 never checked — outage missed');
});
